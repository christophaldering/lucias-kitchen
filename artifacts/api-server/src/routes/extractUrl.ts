import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { authMiddleware } from "./auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { promises as dns } from "node:dns";
import { isIPv4, isIPv6 } from "node:net";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

const SYSTEM_PROMPT = `Du bist ein Rezept-Extraktor. Analysiere das Dokument und extrahiere alle enthaltenen Rezepte inklusive handschriftlicher Notizen und Anmerkungen. Gib das Ergebnis NUR als reines JSON zurück ohne Markdown, ohne Backticks, ohne Erklärungen.

JSON-Struktur:
{
  "recipes": [
    {
      "title": "string",
      "servings": number,
      "prepTime": "string",
      "totalTime": "string",
      "difficulty": "simpel|normal|schwer",
      "category": "Fisch|Fleisch|Pasta|Vegetarisch|Geflügel",
      "ingredients": [
        {"amount": "string", "unit": "string", "name": "string", "note": "string optional"}
      ],
      "steps": ["string"],
      "notes": "string - handschriftliche Anmerkungen falls vorhanden",
      "source": "string - Rezeptautor falls angegeben"
    }
  ]
}`;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  return false;
}

async function isSsrfHost(hostname: string): Promise<boolean> {
  let addresses: string[] = [];
  try {
    const v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
    const v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    addresses = [...v4, ...v6];
  } catch {
    addresses = [];
  }

  if (addresses.length === 0) {
    if (isIPv4(hostname)) addresses = [hostname];
    else if (isIPv6(hostname)) addresses = [hostname];
  }

  return addresses.some((ip) => {
    if (isIPv4(ip)) return isPrivateIpv4(ip);
    if (isIPv6(ip)) return isPrivateIpv6(ip);
    return false;
  });
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | { error: string; status: number }> {
  let currentUrl = url.trim();
  let redirectCount = 0;
  let response: Response;

  while (true) {
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de,en;q=0.9",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount >= MAX_REDIRECTS) break;
      redirectCount++;
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        break;
      }
      if (!["http:", "https:"].includes(nextUrl.protocol)) {
        return { error: "redirect_unsafe", status: 400 };
      }
      if (await isSsrfHost(nextUrl.hostname)) {
        return { error: "ssrf", status: 400 };
      }
      currentUrl = nextUrl.toString();
      continue;
    }
    break;
  }

  if (!response.ok) {
    return { error: `fetch_failed_${response.status}`, status: 502 };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return { error: "not_html", status: 422 };
  }

  const reader = response.body?.getReader();
  let html: string;
  if (!reader) {
    html = await response.text();
  } else {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }
    html = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );
  }

  return { html, finalUrl: currentUrl };
}

function extractImageUrl(html: string, baseUrl: string): string | null {
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImageMatch?.[1]) {
    try {
      return new URL(ogImageMatch[1], baseUrl).toString();
    } catch {
    }
  }

  const twitterImageMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (twitterImageMatch?.[1]) {
    try {
      return new URL(twitterImageMatch[1], baseUrl).toString();
    } catch {
    }
  }

  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*(?:width=["'](\d+)["'])?[^>]*>/gi)];
  for (const match of imgMatches) {
    const src = match[1];
    const width = match[2] ? parseInt(match[2], 10) : null;
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    if (src.includes("logo") || src.includes("icon") || src.includes("avatar") || src.includes("sprite")) continue;
    if (width !== null && width < 200) continue;
    try {
      return new URL(src, baseUrl).toString();
    } catch {
    }
  }

  return null;
}

async function downloadAndSaveImage(imageUrl: string): Promise<string | null> {
  try {
    const parsedImgUrl = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsedImgUrl.protocol)) return null;
    if (await isSsrfHost(parsedImgUrl.hostname)) return null;

    let imgCurrentUrl = imageUrl;
    let imgRedirectCount = 0;
    let imgResponse: Response;
    while (true) {
      imgResponse = await fetch(imgCurrentUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      if (imgResponse.status >= 300 && imgResponse.status < 400) {
        const loc = imgResponse.headers.get("location");
        if (!loc || imgRedirectCount >= MAX_REDIRECTS) break;
        imgRedirectCount++;
        let nextImgUrl: URL;
        try {
          nextImgUrl = new URL(loc, imgCurrentUrl);
        } catch {
          break;
        }
        if (!["http:", "https:"].includes(nextImgUrl.protocol)) return null;
        if (await isSsrfHost(nextImgUrl.hostname)) return null;
        imgCurrentUrl = nextImgUrl.toString();
        continue;
      }
      break;
    }

    if (!imgResponse.ok) return null;

    const contentType = imgResponse.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    const contentLength = imgResponse.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) return null;

    const imgReader = imgResponse.body?.getReader();
    let imgBuffer: Buffer;
    if (!imgReader) {
      imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await imgReader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_IMAGE_BYTES) {
          imgReader.cancel();
          return null;
        }
        chunks.push(value);
      }
      imgBuffer = Buffer.concat(chunks);
    }
    if (imgBuffer.length === 0) return null;

    const sharp = (await import("sharp")).default;
    const webpBuffer = await sharp(imgBuffer)
      .rotate()
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const storagePath = await storageService.uploadBuffer(webpBuffer, "image/webp", "recipe-images");
    return `/api/storage${storagePath}`;
  } catch {
    return null;
  }
}

export async function extractAndSaveImageFromUrl(sourceUrl: string): Promise<string | null> {
  try {
    const parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    if (await isSsrfHost(parsedUrl.hostname)) return null;

    const result = await fetchHtml(sourceUrl);
    if ("error" in result) return null;

    const { html, finalUrl } = result;
    const imageUrl = extractImageUrl(html, finalUrl);
    if (!imageUrl) return null;

    return downloadAndSaveImage(imageUrl);
  } catch {
    return null;
  }
}

router.post("/extract-url", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const { url } = req.body as { url?: string };

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "bad_request", message: "Feld 'url' ist erforderlich" });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      res.status(400).json({ error: "bad_request", message: "Ungültige URL" });
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: "bad_request", message: "Nur HTTP- und HTTPS-URLs sind erlaubt" });
      return;
    }

    if (await isSsrfHost(parsedUrl.hostname)) {
      res.status(400).json({ error: "bad_request", message: "Diese URL ist nicht erlaubt" });
      return;
    }

    let htmlContent: string;
    let finalUrl = url.trim();
    try {
      const result = await fetchHtml(url.trim());
      if ("error" in result) {
        if (result.error === "redirect_unsafe" || result.error === "ssrf") {
          res.status(400).json({ error: "bad_request", message: "Diese URL ist nicht erlaubt" });
        } else if (result.error === "not_html") {
          res.status(422).json({ error: "unsupported_content", message: "Die URL führt zu keiner HTML-Seite" });
        } else {
          // Leite den echten HTTP-Status (der Zielseite) aus dem error-String ab
          const httpMatch = result.error.match(/fetch_failed_(\d+)/);
          const httpStatus = httpMatch ? parseInt(httpMatch[1], 10) : 0;
          const statusHint =
            httpStatus === 404 ? " (404 — Seite nicht gefunden)" :
            httpStatus === 403 ? " (403 — Zugriff verweigert)" :
            httpStatus === 401 ? " (401 — Anmeldung erforderlich)" :
            httpStatus === 410 ? " (410 — Seite dauerhaft entfernt)" :
            httpStatus === 429 ? " (429 — Zu viele Anfragen)" :
            httpStatus >= 500  ? ` (${httpStatus} — Server-Fehler)` :
            httpStatus > 0     ? ` (${httpStatus})` : "";
          const statusCode = result.status;
          res.status(statusCode).json({
            error: "fetch_error",
            message: `Seite nicht erreichbar${statusHint}`,
          });
        }
        return;
      }
      htmlContent = result.html;
      finalUrl = result.finalUrl;
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (msg.includes("timeout") || msg.includes("TimeoutError")) {
        res.status(504).json({ error: "timeout", message: "Die Seite hat zu lange zum Laden gebraucht" });
      } else {
        res.status(502).json({ error: "fetch_error", message: "Die Webseite konnte nicht erreicht werden" });
      }
      return;
    }

    const imageUrl = extractImageUrl(htmlContent, finalUrl);

    let extractedImageUrl: string | null = null;
    if (imageUrl) {
      extractedImageUrl = await downloadAndSaveImage(imageUrl).catch(() => null);
    }

    const cleanText = stripHtml(htmlContent);

    if (cleanText.length < 100) {
      res.status(422).json({
        error: "no_content",
        message: "Die Seite enthält keinen lesbaren Text. Möglicherweise wird JavaScript zum Laden der Inhalte benötigt.",
      });
      return;
    }

    const truncatedText = cleanText.slice(0, 30000);
    const modelUsed: "openai" = "openai";

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Hier ist der extrahierte Text von einer Rezept-Webseite (URL: ${url.trim()}):\n\n${truncatedText}`,
        },
      ],
    });

    let rawJson = aiResponse.choices[0]?.message?.content ?? "";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { recipes: unknown[] };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse AI response as JSON");
      res.status(502).json({
        error: "parse_error",
        message: "Das Modell hat keine gültige JSON-Antwort geliefert",
        modelUsed,
      });
      return;
    }

    const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];

    const recipesWithSource = recipes.map((r: unknown) => {
      if (typeof r === "object" && r !== null) {
        return {
          ...(r as Record<string, unknown>),
          source: url.trim(),
          ...(extractedImageUrl ? { imageUrl: extractedImageUrl, imageSource: "web" } : {}),
        };
      }
      return r;
    });

    res.json({ recipes: recipesWithSource, modelUsed, extractedImageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to extract URL");
    res.status(500).json({ error: "internal_error", message: "URL-Extraktion fehlgeschlagen" });
  }
});

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default router;
