import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { authMiddleware } from "./auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AI_MODEL_MAIN } from "../lib/aiModels";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT } from "../lib/recipeExtractionPrompt";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

type ImageEntry = { base64: string; mimeType: string };

type CropData = { x: number; y: number; width: number; height: number };

function isCropValid(crop: unknown): crop is CropData {
  if (crop === null || typeof crop !== "object") return false;
  const c = crop as Record<string, unknown>;
  return (
    Number.isFinite(c.x) && Number.isFinite(c.y) &&
    Number.isFinite(c.width) && Number.isFinite(c.height) &&
    (c.x as number) >= 0 && (c.y as number) >= 0 &&
    (c.width as number) > 0 && (c.height as number) > 0 &&
    (c.x as number) + (c.width as number) <= 100 &&
    (c.y as number) + (c.height as number) <= 100
  );
}

async function cropAndStore(
  imageBuffer: Buffer,
  crop: CropData,
  storageService: ObjectStorageService
): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(imageBuffer).rotate().metadata();
    const imgWidth = meta.width ?? 1024;
    const imgHeight = meta.height ?? 1024;

    const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
    const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
    const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
    const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

    const croppedBuffer = await sharp(imageBuffer)
      .rotate()
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
    return `/api/storage${storagePath}`;
  } catch {
    return null;
  }
}

router.post("/extract-image", authMiddleware, aiLimiter, async (req, res) => {
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
        ? `Bitte extrahiere alle Rezepte aus diesen ${visionEntries.length} Bildern. Jedes Bild kann ein oder mehrere Rezepte enthalten.`
        : "Bitte extrahiere alle Rezepte aus diesem Bild.",
    };

    const response = await openai.chat.completions.create({
      model: AI_MODEL_MAIN,
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

    let parsed: { recipes: Array<Record<string, unknown>> };
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

    const rawRecipes: Array<Record<string, unknown>> = Array.isArray(parsed.recipes) ? parsed.recipes : [];

    // Pre-decode all image buffers once to avoid repeated Buffer.from calls
    const imageBuffers = imageEntries.map((img) => Buffer.from(img.base64, "base64"));

    const recipes = await Promise.all(
      rawRecipes.map(async (recipe) => {
        const crop = recipe.foodImageCrop;
        // Remove foodImageCrop and sourceImageIndex from the recipe object before returning
        const { foodImageCrop: _crop, sourceImageIndex: _idx, ...recipeWithoutMeta } = recipe;

        if (isCropValid(crop)) {
          // Use the source image specified by the AI (fall back to first image)
          const imgIdx = typeof recipe.sourceImageIndex === "number" &&
            Number.isInteger(recipe.sourceImageIndex) &&
            recipe.sourceImageIndex >= 0 &&
            recipe.sourceImageIndex < imageBuffers.length
            ? recipe.sourceImageIndex
            : 0;
          const imageUrl = await cropAndStore(imageBuffers[imgIdx], crop, storageService);
          if (imageUrl) {
            req.log.info({ imageUrl, sourceImageIndex: imgIdx }, "Cropped food image for recipe");
            return { ...recipeWithoutMeta, imageUrl };
          }
        }

        return recipeWithoutMeta;
      })
    );

    res.json({ recipes, modelUsed: "openai", sourceDocumentUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to extract image");
    res.status(500).json({ error: "internal_error", message: "Foto-Extraktion fehlgeschlagen" });
  }
});

export default router;
