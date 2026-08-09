import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { aiLimiter } from "../lib/rateLimits";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

const OPENAI_BASE = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "").replace(/\/$/, "");
const OPENAI_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

router.post("/recipes/web-search", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const schema = z.object({ query: z.string().min(2).max(200) });
    const { query } = schema.parse(req.body);

    // "Rezept" anhängen, falls nicht vorhanden
    const searchQuery = /rezept/i.test(query) ? query : `${query} Rezept`;

    const prompt =
      `Suche nach deutschsprachigen Kochrezepten: "${searchQuery}"\n\n` +
      `Gib AUSSCHLIESSLICH gültiges JSON zurück (kein Markdown, keine Erklärungen):\n` +
      `{ "results": [ { "title": "...", "url": "https://...", "source": "domain.de", "description": "Max. 2 Sätze." } ] }\n\n` +
      `Regeln:\n` +
      `- 3 bis 5 Einträge\n` +
      `- Nur URLs verwenden, die tatsächlich in den Suchergebnissen vorkamen\n` +
      `- Keine erfundenen oder zusammengesetzten URLs\n` +
      `- source = Domain ohne www (z.B. chefkoch.de)\n` +
      `- description maximal 2 Sätze auf Deutsch`;

    if (!OPENAI_BASE || !OPENAI_KEY) {
      req.log.warn("web-search: OPENAI_BASE oder OPENAI_KEY fehlt");
      res.json({ results: [] });
      return;
    }

    const apiRes = await fetch(`${OPENAI_BASE}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      req.log.warn({ status: apiRes.status, errText }, "web-search: OpenAI-Antwort nicht OK");
      res.json({ results: [] });
      return;
    }

    const data = await apiRes.json() as Record<string, unknown>;

    // Text aus output-Array extrahieren
    let rawText = "";
    const output = Array.isArray(data.output) ? data.output : [];
    for (const item of output) {
      if (
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "message"
      ) {
        const content = (item as Record<string, unknown>).content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === "object") {
              const type = (c as Record<string, unknown>).type;
              if (type === "output_text" || type === "text") {
                rawText += String((c as Record<string, unknown>).text ?? "");
              }
            }
          }
        }
      }
    }

    // Markdown-Fences bereinigen (wie in ai-search)
    rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    // JSON-Block extrahieren, falls Model Erklärtext davor/danach schreibt
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) rawText = jsonMatch[0];

    interface RawResult {
      title?: unknown;
      url?: unknown;
      source?: unknown;
      description?: unknown;
    }

    let results: Array<{ title: string; url: string; source: string; description: string }> = [];
    try {
      const parsed = JSON.parse(rawText) as { results?: RawResult[] };
      const raw: RawResult[] = parsed.results ?? [];

      const seen = new Set<string>();
      for (const r of raw) {
        const urlStr = String(r.url ?? "");
        let parsed: URL;
        try { parsed = new URL(urlStr); } catch { continue; }
        if (parsed.protocol !== "https:") continue;
        if (seen.has(urlStr)) continue;
        seen.add(urlStr);

        const domain = parsed.hostname.replace(/^www\./, "");
        results.push({
          title:       String(r.title ?? "").trim(),
          url:         urlStr,
          source:      String(r.source ?? domain).trim(),
          description: String(r.description ?? "").trim(),
        });
        if (results.length >= 5) break;
      }
    } catch {
      results = [];
    }

    res.json({ results });
  } catch (err) {
    req.log.error({ err }, "web-search fehlgeschlagen");
    // Bei jedem Fehler: 200 + leer statt 500
    res.json({ results: [] });
  }
});

export default router;
