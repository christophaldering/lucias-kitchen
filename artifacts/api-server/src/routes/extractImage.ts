import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT } from "../lib/recipeExtractionPrompt";

const router: IRouter = Router();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

router.post("/extract-image", async (req, res) => {
  try {
    const { image, mimeType } = req.body as { image?: string; mimeType?: string };

    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "bad_request", message: "Field 'image' (base64 string) is required" });
      return;
    }

    const resolvedMime = (mimeType && ALLOWED_TYPES.includes(mimeType)) ? mimeType : "image/jpeg";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: RECIPE_EXTRACTION_SYSTEM_PROMPT },
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
              text: "Bitte extrahiere alle Rezepte aus diesem Bild.",
            },
          ],
        },
      ],
    });

    let rawJson = response.choices[0]?.message?.content ?? "";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { recipes: unknown[] };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse AI response as JSON");
      res.status(502).json({
        error: "parse_error",
        message: "Das Modell hat keine gültige JSON-Antwort geliefert",
        modelUsed: "openai",
      });
      return;
    }

    res.json({ recipes: parsed.recipes ?? [], modelUsed: "openai" });
  } catch (err) {
    req.log.error({ err }, "Failed to extract image");
    res.status(500).json({ error: "internal_error", message: "Foto-Extraktion fehlgeschlagen" });
  }
});

export default router;
