import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const FRIDGE_EXTRACTION_PROMPT = `Du bist ein Kühlschrank-Analyst. Analysiere das Foto und erkenne alle sichtbaren Lebensmittel und Zutaten.
Gib eine einfache JSON-Liste der erkannten Zutaten zurück. Nur die Namen, keine Mengen.
Gib AUSSCHLIESSLICH reines JSON zurück, ohne Markdown-Formatierung, ohne Backticks, ohne Erklärungen.

JSON-Struktur:
{
  "ingredients": ["Zutat 1", "Zutat 2", "Zutat 3"]
}

Nenne die Zutaten auf Deutsch, kurz und präzise (z.B. "Lachs", "Champignons", "Sahne", "Paprika").`;

router.post("/extract-fridge", async (req, res) => {
  try {
    const { image, mimeType } = req.body as { image?: string; mimeType?: string };

    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "bad_request", message: "Field 'image' (base64 string) is required" });
      return;
    }

    const resolvedMime = (mimeType && ALLOWED_TYPES.includes(mimeType)) ? mimeType : "image/jpeg";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: FRIDGE_EXTRACTION_PROMPT },
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
    res.status(500).json({ error: "internal_error", message: "Kühlschrank-Analyse fehlgeschlagen" });
  }
});

export default router;
