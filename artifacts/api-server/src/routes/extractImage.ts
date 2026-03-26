import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT } from "../lib/recipeExtractionPrompt";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

type ImageEntry = { base64: string; mimeType: string };

router.post("/extract-image", async (req, res) => {
  try {
    const body = req.body as {
      image?: string;
      mimeType?: string;
      images?: Array<{ base64: string; mimeType?: string }>;
    };

    let imageEntries: ImageEntry[];

    if (Array.isArray(body.images) && body.images.length > 0) {
      imageEntries = body.images.map((img) => ({
        base64: img.base64,
        mimeType: (img.mimeType && ALLOWED_TYPES.includes(img.mimeType)) ? img.mimeType : "image/jpeg",
      }));
    } else if (body.image && typeof body.image === "string") {
      const resolvedMime = (body.mimeType && ALLOWED_TYPES.includes(body.mimeType)) ? body.mimeType : "image/jpeg";
      imageEntries = [{ base64: body.image, mimeType: resolvedMime }];
    } else {
      res.status(400).json({ error: "bad_request", message: "Field 'image' or 'images' is required" });
      return;
    }

    // Save the first image as WebP to object storage as source document
    let sourceDocumentUrl: string | null = null;
    try {
      const firstImage = imageEntries[0];
      const sharp = (await import("sharp")).default;
      const inputBuffer = Buffer.from(firstImage.base64, "base64");
      const webpBuffer = await sharp(inputBuffer).rotate().webp({ quality: 82 }).toBuffer();
      const storagePath = await storageService.uploadBuffer(webpBuffer, "image/webp", "source-documents");
      sourceDocumentUrl = `/api/storage${storagePath}`;
    } catch {
      // Non-fatal
    }

    const visionAllowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const heicTypes = ["image/heic", "image/heif"];
    const visionEntries: ImageEntry[] = [];
    for (const img of imageEntries) {
      if (heicTypes.includes(img.mimeType)) {
        try {
          const sharp = (await import("sharp")).default;
          const inputBuf = Buffer.from(img.base64, "base64");
          const jpegBuf = await sharp(inputBuf).rotate().jpeg({ quality: 90 }).toBuffer();
          visionEntries.push({ base64: jpegBuf.toString("base64"), mimeType: "image/jpeg" });
        } catch (convErr) {
          req.log.warn({ err: convErr }, "HEIC conversion failed, skipping image");
        }
      } else {
        visionEntries.push({
          ...img,
          mimeType: visionAllowed.includes(img.mimeType) ? img.mimeType : "image/jpeg",
        });
      }
    }

    if (visionEntries.length === 0) {
      res.status(400).json({ error: "bad_request", message: "Keine der Bilddateien konnte verarbeitet werden. Bitte verwende JPEG, PNG oder WebP." });
      return;
    }

    const imageContent = visionEntries.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }));

    const textContent = {
      type: "text" as const,
      text: visionEntries.length > 1
        ? `Bitte extrahiere alle Rezepte aus diesen ${visionEntries.length} Bildern, die zusammen ein einzelnes Rezept zeigen.`
        : "Bitte extrahiere alle Rezepte aus diesem Bild.",
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: RECIPE_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [...imageContent, textContent],
        },
      ],
    });

    let rawJson = response.choices[0]?.message?.content ?? "";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { recipes: unknown[]; foodImageCrop?: { x: number; y: number; width: number; height: number } | null };
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

    let extractedImageUrl: string | null = null;

    const cropData = parsed.foodImageCrop;
    const isCropValid = cropData !== null &&
      typeof cropData === "object" &&
      Number.isFinite(cropData.x) && Number.isFinite(cropData.y) &&
      Number.isFinite(cropData.width) && Number.isFinite(cropData.height) &&
      cropData.x >= 0 && cropData.y >= 0 &&
      cropData.width > 0 && cropData.height > 0 &&
      cropData.x + cropData.width <= 100 && cropData.y + cropData.height <= 100;

    if (isCropValid) {
      try {
        const crop = cropData!;
        const firstImage = imageEntries[0];
        const inputBuffer = Buffer.from(firstImage.base64, "base64");
        const sharp = (await import("sharp")).default;
        const meta = await sharp(inputBuffer).rotate().metadata();
        const imgWidth = meta.width ?? 1024;
        const imgHeight = meta.height ?? 1024;

        const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
        const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
        const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
        const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

        const croppedBuffer = await sharp(inputBuffer)
          .rotate()
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .resize(800, 800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
        extractedImageUrl = `/api/storage${storagePath}`;
      } catch (cropErr) {
        req.log.warn({ err: cropErr }, "Failed to crop food image from scan, skipping");
      }
    }

    res.json({ recipes: parsed.recipes ?? [], modelUsed: "openai", sourceDocumentUrl, extractedImageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to extract image");
    res.status(500).json({ error: "internal_error", message: "Foto-Extraktion fehlgeschlagen" });
  }
});

export default router;
