import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT } from "../lib/recipeExtractionPrompt";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

router.post("/extract-pdf", aiLimiter, async (req, res) => {
  try {
    const { pdf } = req.body as { pdf?: string };

    if (!pdf || typeof pdf !== "string") {
      res.status(400).json({ error: "bad_request", message: "Field 'pdf' (base64 string) is required" });
      return;
    }

    const pdfBuffer = Buffer.from(pdf, "base64");

    // Store the PDF in object storage so it can be referenced as source document
    let sourceDocumentUrl: string | null = null;
    try {
      const storagePath = await storageService.uploadBuffer(pdfBuffer, "application/pdf", "source-documents");
      sourceDocumentUrl = `/api/storage${storagePath}`;
    } catch {
      // Non-fatal — extraction still proceeds
    }

    // Dynamic import to avoid ESM/CJS issues with pdf-parse
    const pdfParse = (await import("pdf-parse")).default;
    let extractedText = "";
    try {
      const parsed = await pdfParse(pdfBuffer);
      extractedText = parsed.text?.trim() ?? "";
    } catch {
      extractedText = "";
    }

    const TEXT_THRESHOLD = 200;
    const useOpenAI = extractedText.length >= TEXT_THRESHOLD;

    let rawJson: string;
    let modelUsed: "openai" | "claude";

    if (useOpenAI) {
      modelUsed = "openai";
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 8192,
        messages: [
          { role: "system", content: RECIPE_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: `Hier ist der extrahierte Text aus einem Rezept-PDF:\n\n${extractedText}` },
        ],
      });
      rawJson = response.choices[0]?.message?.content ?? "";
    } else {
      modelUsed = "claude";
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: RECIPE_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdf,
                },
              },
              {
                type: "text",
                text: "Bitte extrahiere alle Rezepte aus diesem PDF-Dokument.",
              },
            ],
          },
        ],
      });
      rawJson = response.content[0]?.type === "text" ? response.content[0].text : "";
    }

    // Strip any markdown code blocks if model misbehaves
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

    res.json({ recipes: parsed.recipes ?? [], modelUsed, sourceDocumentUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to extract PDF");
    res.status(500).json({ error: "internal_error", message: "PDF-Extraktion fehlgeschlagen" });
  }
});

export default router;
