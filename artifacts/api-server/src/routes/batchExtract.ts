import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { db } from "@workspace/db";
import {
  recipesTable,
  photosTable,
  recipePhotoLinksTable,
} from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, notInArray, sql } from "drizzle-orm";
import { authMiddleware } from "./auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { invalidateRecipeListCache } from "./recipes";
import { escalatingTrim } from "../lib/imageUtils";

const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

type JobStatus = "idle" | "running" | "completed" | "cancelled" | "error";

interface RecipeResult {
  recipeId: number;
  title: string;
  photosAdded: number;
  mainImageSet: boolean;
  error?: string;
}

interface BatchJob {
  status: JobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentTitle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  cancelRequested: boolean;
  results: RecipeResult[];
  errorMessage?: string;
  options: {
    onlyWithoutPhotos: boolean;
    setMainImageIfMissing: boolean;
    maxRecipes: number | null;
  };
}

const job: BatchJob = {
  status: "idle",
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  currentTitle: null,
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  results: [],
  options: {
    onlyWithoutPhotos: true,
    setMainImageIfMissing: true,
    maxRecipes: null,
  },
};

const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent für Rezept-Scans. Prüfe das Bild: Ist ein eingebettetes Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten)? Falls ja, gib die EXAKTEN Koordinaten des eingebetteten Fotos als Prozentwerte zurück. WICHTIG: Erkenne den genauen Bildrand des Fotos und schneide NUR das Foto selbst aus – ohne umliegenden Seitentext, Rezepttext, QR-Codes, Bildunterschriften oder weißen Seitenhintergrund. Die x/y/width/height-Werte sollen eng am tatsächlichen Fotorand enden, kein Leerraum außen. Falls kein Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

const isCropCoords = (c: unknown): c is { x: number; y: number; width: number; height: number } =>
  c !== null &&
  typeof c === "object" &&
  Number.isFinite((c as { x: unknown }).x) &&
  Number.isFinite((c as { y: unknown }).y) &&
  Number.isFinite((c as { width: unknown }).width) &&
  Number.isFinite((c as { height: unknown }).height) &&
  (c as { x: number }).x >= 0 &&
  (c as { y: number }).y >= 0 &&
  (c as { width: number }).width > 0 &&
  (c as { height: number }).height > 0 &&
  (c as { x: number; width: number }).x + (c as { x: number; width: number }).width <= 100 &&
  (c as { y: number; height: number }).y + (c as { y: number; height: number }).height <= 100;

async function processRecipe(
  recipeId: number,
  recipeTitle: string,
  sourceDocumentUrl: string,
  currentImageUrl: string | null,
  userId: number,
  setMainImageIfMissing: boolean,
): Promise<{ photosAdded: number; mainImageSet: boolean }> {
  const { ObjectStorageService } = await import("../lib/objectStorage");
  const storageService = new ObjectStorageService();
  const sharp = (await import("sharp")).default;

  const objectPath = sourceDocumentUrl.startsWith("/api/storage")
    ? sourceDocumentUrl.replace("/api/storage", "")
    : sourceDocumentUrl;

  let file = null;
  if (objectPath.startsWith("/objects/")) {
    file = await storageService.getObjectEntityFile(objectPath).catch(() => null);
  }
  if (!file) {
    file = await storageService.searchPublicObject(objectPath.replace(/^\/objects\//, "")).catch(() => null);
  }
  if (!file) throw new Error("Quelldokument nicht gefunden");

  const [rawBuffer] = await file.download();
  const [fileMeta] = await file.getMetadata();
  const contentType = (fileMeta.contentType as string) ?? "";
  const isPdf = contentType === "application/pdf" || sourceDocumentUrl.toLowerCase().includes(".pdf");

  const renderPdfToImages = async (pdfBuffer: Buffer): Promise<Buffer[]> => {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const uint8Array = new Uint8Array(pdfBuffer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfDoc = await (pdfjsLib as unknown as any).getDocument({ data: uint8Array, verbosity: 0 }).promise as {
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: object) => { promise: Promise<void> };
      }>;
    };
    const pages: Buffer[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx as unknown as Parameters<typeof page.render>[0]["canvasContext"], viewport }).promise;
      pages.push(canvas.toBuffer("image/jpeg", 85));
    }
    return pages;
  };

  type ImageEntry = { buffer: Buffer; mimeType: string };
  let imagesToScan: ImageEntry[];

  if (isPdf) {
    const pageBuffers = await renderPdfToImages(rawBuffer);
    if (pageBuffers.length === 0) throw new Error("PDF hat keine Seiten");
    imagesToScan = pageBuffers.map((buf) => ({ buffer: buf, mimeType: "image/jpeg" }));
  } else {
    const mimeType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)
      ? contentType
      : "image/jpeg";
    imagesToScan = [{ buffer: rawBuffer, mimeType }];
  }

  const addedPhotos: Array<{ imageUrl: string; photoId: number }> = [];

  for (const entry of imagesToScan) {
    try {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 256,
        messages: [
          { role: "system", content: FOOD_CROP_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url" as const,
                image_url: {
                  url: `data:${entry.mimeType};base64,${entry.buffer.toString("base64")}`,
                  detail: "high" as const,
                },
              },
              { type: "text" as const, text: "Erkenne und lokalisiere das Lebensmittelfoto in dieser Seite." },
            ],
          },
        ],
      });

      let rawJson = aiResponse.choices[0]?.message?.content ?? "";
      rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsed: { foodImageCrop?: unknown };
      try {
        parsed = JSON.parse(rawJson) as { foodImageCrop?: unknown };
      } catch {
        continue;
      }

      if (!isCropCoords(parsed.foodImageCrop)) continue;

      const crop = parsed.foodImageCrop;
      const meta = await sharp(entry.buffer).metadata();
      const imgWidth = meta.width ?? 1024;
      const imgHeight = meta.height ?? 1024;

      const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
      const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
      const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
      const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

      const extractedBuf = await sharp(entry.buffer)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .toBuffer();
      const trimmedBuf = await escalatingTrim(extractedBuf);
      const croppedBuffer = await sharp(trimmedBuf)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
      const photoUrl = `/api/storage${storagePath}`;

      let [photo] = await db
        .select({ id: photosTable.id })
        .from(photosTable)
        .where(eq(photosTable.imageUrl, photoUrl))
        .limit(1);

      if (!photo) {
        [photo] = await db
          .insert(photosTable)
          .values({ imageUrl: photoUrl, uploadedBy: userId, source: "original" })
          .returning();
      }

      const [existingLink] = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .where(and(eq(recipePhotoLinksTable.recipeId, recipeId), eq(recipePhotoLinksTable.photoId, photo.id)))
        .limit(1);

      if (!existingLink) {
        const existingCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(recipePhotoLinksTable)
          .where(eq(recipePhotoLinksTable.recipeId, recipeId));
        const sortOrder = (existingCount[0]?.count ?? 0) + addedPhotos.length;

        await db
          .insert(recipePhotoLinksTable)
          .values({ photoId: photo.id, recipeId, sortOrder, isMain: false });

        addedPhotos.push({ imageUrl: photoUrl, photoId: photo.id });
      }
    } catch {
      // skip pages where AI or processing fails
    }
  }

  let mainImageSet = false;

  if (setMainImageIfMissing && !currentImageUrl && addedPhotos.length > 0) {
    const firstPhoto = addedPhotos[0];
    await db
      .update(recipesTable)
      .set({ imageUrl: firstPhoto.imageUrl, isAiGenerated: false, imageSource: "original" })
      .where(eq(recipesTable.id, recipeId));

    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: true })
      .where(
        and(
          eq(recipePhotoLinksTable.recipeId, recipeId),
          eq(recipePhotoLinksTable.photoId, firstPhoto.photoId),
        ),
      );

    invalidateRecipeListCache();
    mainImageSet = true;
  }

  return { photosAdded: addedPhotos.length, mainImageSet };
}

async function runBatchJob(userId: number) {
  try {
    const recipesWithPhotoIds = await db
      .selectDistinct({ recipeId: recipePhotoLinksTable.recipeId })
      .from(recipePhotoLinksTable);
    const recipeIdsWithPhotos = recipesWithPhotoIds.map((r) => r.recipeId);

    let query = db
      .select({
        id: recipesTable.id,
        title: recipesTable.title,
        imageUrl: recipesTable.imageUrl,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(
        and(
          isNull(recipesTable.deletedAt),
          isNotNull(recipesTable.sourceDocumentUrl),
          ...(job.options.onlyWithoutPhotos && recipeIdsWithPhotos.length > 0
            ? [notInArray(recipesTable.id, recipeIdsWithPhotos)]
            : []),
        ),
      )
      .orderBy(recipesTable.id)
      .$dynamic();

    if (job.options.maxRecipes) {
      query = query.limit(job.options.maxRecipes) as typeof query;
    }

    const recipes = await query;
    job.total = recipes.length;

    for (const recipe of recipes) {
      if (job.cancelRequested) {
        job.status = "cancelled";
        job.finishedAt = new Date().toISOString();
        return;
      }

      job.currentTitle = recipe.title;

      try {
        const { photosAdded, mainImageSet } = await processRecipe(
          recipe.id,
          recipe.title,
          recipe.sourceDocumentUrl!,
          recipe.imageUrl ?? null,
          userId,
          job.options.setMainImageIfMissing,
        );

        job.results.push({ recipeId: recipe.id, title: recipe.title, photosAdded, mainImageSet });

        if (photosAdded > 0) {
          job.succeeded++;
        } else {
          job.skipped++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
        job.results.push({ recipeId: recipe.id, title: recipe.title, photosAdded: 0, mainImageSet: false, error: errorMsg });
        job.failed++;
      }

      job.processed++;
    }

    job.status = "completed";
    job.currentTitle = null;
    job.finishedAt = new Date().toISOString();
  } catch (err) {
    job.status = "error";
    job.errorMessage = err instanceof Error ? err.message : "Unbekannter Fehler";
    job.finishedAt = new Date().toISOString();
  }
}

const router: IRouter = Router();

router.get("/admin/batch-extract/status", authMiddleware, (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json({
    status: job.status,
    total: job.total,
    processed: job.processed,
    succeeded: job.succeeded,
    failed: job.failed,
    skipped: job.skipped,
    currentTitle: job.currentTitle,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    options: job.options,
    recentResults: job.results.slice(-20),
    errorMessage: job.errorMessage,
  });
});

router.post("/admin/batch-extract/start", authMiddleware, aiLimiter, (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  if (job.status === "running") {
    res.status(409).json({ error: "already_running", message: "Ein Batch-Job läuft bereits" });
    return;
  }

  const { onlyWithoutPhotos = true, setMainImageIfMissing = true, maxRecipes = null } = req.body ?? {};

  Object.assign(job, {
    status: "running",
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    currentTitle: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
    results: [],
    errorMessage: undefined,
    options: {
      onlyWithoutPhotos: Boolean(onlyWithoutPhotos),
      setMainImageIfMissing: Boolean(setMainImageIfMissing),
      maxRecipes: maxRecipes ? Number(maxRecipes) : null,
    },
  });

  const userId = req.authUser!.id;

  runBatchJob(userId).catch((err) => {
    job.status = "error";
    job.errorMessage = err instanceof Error ? err.message : "Unbekannter Fehler";
    job.finishedAt = new Date().toISOString();
  });

  res.json({ message: "Batch-Job gestartet", status: "running" });
});

router.post("/admin/batch-extract/cancel", authMiddleware, (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  if (job.status !== "running") {
    res.status(409).json({ error: "not_running", message: "Kein Job läuft gerade" });
    return;
  }

  job.cancelRequested = true;
  res.json({ message: "Abbruch angefordert" });
});

export default router;
