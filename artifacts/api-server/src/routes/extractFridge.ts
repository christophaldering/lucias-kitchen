import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const PROMPTS: Record<string, string> = {
  fridge: `Du bist ein Kühlschrank-Analyst. Analysiere das Foto und erkenne alle sichtbaren Lebensmittel und Zutaten.
Gib eine einfache JSON-Liste der erkannten Zutaten zurück. Nur die Namen, keine Mengen.
Gib AUSSCHLIESSLICH reines JSON zurück, ohne Markdown-Formatierung, ohne Backticks, ohne Erklärungen.

JSON-Struktur:
{
  "ingredients": ["Zutat 1", "Zutat 2", "Zutat 3"]
}

Nenne die Zutaten auf Deutsch, kurz und präzise (z.B. "Lachs", "Champignons", "Sahne", "Paprika").`,

  freezer: `Du bist ein Gefrierschrank-Analyst. Analysiere das Foto und erkenne alle sichtbaren eingefrorenen Lebensmittel und Tiefkühlprodukte. Gib eine JSON-Liste der erkannten Zutaten zurück. Nenne sie auf Deutsch, kurz und präzise (z.B. "Erbsen tiefgekühlt", "Hähnchenbrust eingefroren", "Grünkohl"). Gib AUSSCHLIESSLICH reines JSON zurück ohne Markdown. Format: {"ingredients": ["Zutat1", "Zutat2"]}`,

  pantry: `Du bist ein Speisekammer-Analyst. Analysiere das Foto und erkenne alle sichtbaren Vorräte, Konserven, Trockenwaren, Nudeln, Reis, Mehl, Öle und sonstige haltbare Lebensmittel. Gib eine JSON-Liste der erkannten Zutaten zurück. Nenne sie auf Deutsch, kurz und präzise. Gib AUSSCHLIESSLICH reines JSON zurück ohne Markdown. Format: {"ingredients": ["Zutat1", "Zutat2"]}`,
};

router.post("/extract-fridge", aiLimiter, async (req, res) => {
  try {
    const { image, mimeType, location } = req.body as { image?: string; mimeType?: string; location?: string };

    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "bad_request", message: "Field 'image' (base64 string) is required" });
      return;
    }

    const resolvedMime = (mimeType && ALLOWED_TYPES.includes(mimeType)) ? mimeType : "image/jpeg";
    const resolvedLocation = (location && PROMPTS[location]) ? location : "fridge";
    const prompt = PROMPTS[resolvedLocation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${resolvedMime};base64,${image}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Welche Lebensmittel und Zutaten siehst du auf diesem Foto?",
            },
          ],
        },
      ],
    });

    let rawJson = response.choices[0]?.message?.content ?? "";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { ingredients: string[] };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse AI fridge response as JSON");
      res.status(502).json({
        error: "parse_error",
        message: "Das Modell hat keine gültige JSON-Antwort geliefert",
      });
      return;
    }

    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.filter(Boolean) : [];
    res.json({ ingredients });
  } catch (err) {
    req.log.error({ err }, "Failed to extract fridge image");
    res.status(500).json({ error: "internal_error", message: "Analyse fehlgeschlagen" });
  }
});

export default router;
