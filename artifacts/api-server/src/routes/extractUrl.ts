import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { promises as dns } from "node:dns";
import { isIPv4, isIPv6 } from "node:net";

const router: IRouter = Router();

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

router.post("/extract-url", async (req, res) => {
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
    try {
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
            res.status(400).json({ error: "bad_request", message: "Weiterleitung zu unsicherer URL" });
            return;
          }
          if (await isSsrfHost(nextUrl.hostname)) {
            res.status(400).json({ error: "bad_request", message: "Diese URL ist nicht erlaubt" });
            return;
          }
          currentUrl = nextUrl.toString();
          continue;
        }
        break;
      }

      if (!response.ok) {
        res.status(502).json({
          error: "fetch_error",
          message: `Die Seite konnte nicht geladen werden (HTTP ${response.status})`,
        });
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        res.status(422).json({
          error: "unsupported_content",
          message: "Die URL führt zu keiner HTML-Seite",
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        htmlContent = await response.text();
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
        htmlContent = new TextDecoder().decode(
          chunks.reduce((acc, chunk) => {
            const merged = new Uint8Array(acc.length + chunk.length);
            merged.set(acc);
            merged.set(chunk, acc.length);
            return merged;
          }, new Uint8Array(0))
        );
      }
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (msg.includes("timeout") || msg.includes("TimeoutError")) {
        res.status(504).json({ error: "timeout", message: "Die Seite hat zu lange zum Laden gebraucht" });
      } else {
        res.status(502).json({ error: "fetch_error", message: "Die Webseite konnte nicht erreicht werden" });
      }
      return;
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
        return { ...(r as Record<string, unknown>), source: url.trim() };
      }
      return r;
    });

    res.json({ recipes: recipesWithSource, modelUsed });
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
