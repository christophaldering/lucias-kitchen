/**
 * Foto-Routen für Rezepte:
 * GET/POST/DELETE /recipes/:id/photos, PATCH set-main, POST use-photo,
 * POST generate-image, POST extract-image-from-source, POST extract-photo,
 * POST extract-all-photos-from-source, POST /photos/:photoId/link
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipesTable, photosTable, recipePhotoLinksTable } from "@workspace/db/schema";
import { eq, sql, and, isNull, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "../auth";
import { singleImageUploadMiddleware, UPLOADS_DIR } from "../../lib/imageUpload";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { escalatingTrim, generateThumbnail } from "../../lib/imageUtils";
import { registerPhotoForRecipe } from "../../utils/registerPhotoForRecipe";
import {
  isAdmin,
  invalidateRecipeListCache,
  syncMainPhotoLink,
  generateAndSaveRecipeImage,
} from "./shared";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /recipes/:id/photos
// ---------------------------------------------------------------------------

router.get("/recipes/:id/photos", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [recipe] = await db
      .select({ imageUrl: recipesTable.imageUrl, imageSource: recipesTable.imageSource, isAiGenerated: recipesTable.isAiGenerated })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    // Lazy backfill: if the recipe has an imageUrl but no corresponding photo link entry,
    // create the entry now. This covers all sources (AI, web, original, etc.).
    if (recipe?.imageUrl) {
      const [existingLink] = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
        .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(photosTable.imageUrl, recipe.imageUrl)))
        .limit(1);

      if (!existingLink) {
        try {
          const backfillSource = (recipe.imageSource === "ai" || recipe.isAiGenerated === true)
            ? "ai"
            : recipe.imageSource === "web"
            ? "web"
            : "original";
          await syncMainPhotoLink(id, recipe.imageUrl, null, backfillSource);
        } catch {
        }
      }
    }

    const rows = await db
      .select({
        id: photosTable.id,
        imageUrl: photosTable.imageUrl,
        caption: photosTable.caption,
        uploadedBy: photosTable.uploadedBy,
        source: photosTable.source,
        createdAt: photosTable.createdAt,
        linkId: recipePhotoLinksTable.id,
        recipeId: recipePhotoLinksTable.recipeId,
        sortOrder: recipePhotoLinksTable.sortOrder,
        isMain: recipePhotoLinksTable.isMain,
      })
      .from(recipePhotoLinksTable)
      .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
      .where(eq(recipePhotoLinksTable.recipeId, id))
      .orderBy(recipePhotoLinksTable.sortOrder, desc(photosTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipe photos");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch recipe photos" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/photos  (Upload)
// ---------------------------------------------------------------------------

router.post("/recipes/:id/photos", singleImageUploadMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "no_file", message: "Keine Datei hochgeladen." });
      return;
    }
    const imageUrl = `/api/uploads/${req.file.filename}`;
    const uploadedBy = req.authUser?.id ?? null;

    const thumbFilename = await generateThumbnail(req.file.path, UPLOADS_DIR);
    const thumbnailUrl = thumbFilename ? `/api/uploads/${thumbFilename}` : null;

    const [photo] = await db
      .insert(photosTable)
      .values({ imageUrl, thumbnailUrl, uploadedBy, source: "cooked" })
      .returning();

    const [link] = await db
      .insert(recipePhotoLinksTable)
      .values({ photoId: photo.id, recipeId: id, sortOrder: 0, isMain: false })
      .returning();

    const [existingRecipe] = await db
      .select({ imageUrl: recipesTable.imageUrl, createdBy: recipesTable.createdBy })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    let setAsMain = false;
    if (existingRecipe && !existingRecipe.imageUrl) {
      const currentUserId = req.authUser?.id;
      const isOwner = existingRecipe.createdBy == null || (currentUserId != null && existingRecipe.createdBy === currentUserId);
      const isAdminUser = currentUserId != null && req.authUser?.email != null && isAdmin(req.authUser.email);
      if (isOwner || isAdminUser) {
        await db
          .update(recipesTable)
          .set({ imageUrl, isAiGenerated: false })
          .where(eq(recipesTable.id, id));
        invalidateRecipeListCache();
        setAsMain = true;
      }
    }

    res.status(201).json({
      id: photo.id,
      imageUrl: photo.imageUrl,
      thumbnailUrl: photo.thumbnailUrl,
      caption: photo.caption,
      uploadedBy: photo.uploadedBy,
      source: photo.source,
      createdAt: photo.createdAt,
      linkId: link.id,
      recipeId: link.recipeId,
      sortOrder: link.sortOrder,
      isMain: link.isMain,
      setAsMain,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to upload recipe photo");
    res.status(500).json({ error: "internal_error", message: "Failed to upload recipe photo" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/rotate-image
// ---------------------------------------------------------------------------

router.post("/recipes/:id/rotate-image", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const { direction } = req.body as { direction?: string };
    if (direction !== "cw" && direction !== "ccw") {
      res.status(400).json({ error: "bad_request", message: "direction must be 'cw' or 'ccw'" });
      return;
    }

    const [recipe] = await db
      .select({ id: recipesTable.id, imageUrl: recipesTable.imageUrl, createdBy: recipesTable.createdBy })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const currentUserId = req.authUser!.id;
    const isAdminUser = req.authUser?.email != null && isAdmin(req.authUser.email);
    const isOwner = recipe.createdBy == null || recipe.createdBy === currentUserId;
    if (!isOwner && !isAdminUser) {
      res.status(403).json({ error: "forbidden", message: "Keine Berechtigung" });
      return;
    }

    if (!recipe.imageUrl) {
      res.status(400).json({ error: "no_image", message: "Rezept hat kein Bild" });
      return;
    }

    const rotateDeg = direction === "cw" ? 90 : 270;
    const sharp = (await import("sharp")).default;
    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();

    let newImageUrl: string;
    let oldLocalFilepath: string | null = null;
    let oldObjectPath: string | null = null;
    let shouldDeleteOldObject = false;

    if (recipe.imageUrl.startsWith("/api/uploads/")) {
      const filename = recipe.imageUrl.split("/").pop()!;
      const filepath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(filepath)) {
        res.status(404).json({ error: "not_found", message: "Bilddatei nicht gefunden" });
        return;
      }
      const inputBuffer = fs.readFileSync(filepath);
      const rotatedBuffer = await sharp(inputBuffer).rotate(rotateDeg).webp({ quality: 82 }).toBuffer();
      const newFilename = `${randomUUID()}.webp`;
      const newFilepath = path.join(UPLOADS_DIR, newFilename);
      fs.writeFileSync(newFilepath, rotatedBuffer);
      newImageUrl = `/api/uploads/${newFilename}`;
      oldLocalFilepath = filepath;
    } else if (recipe.imageUrl.startsWith("/api/storage/objects/")) {
      const objectPath = recipe.imageUrl.replace("/api/storage", "");
      const objectFile = await storageService.getObjectEntityFile(objectPath);
      const [contents] = await objectFile.download();
      const rotatedBuffer = await sharp(contents as Buffer).rotate(rotateDeg).webp({ quality: 82 }).toBuffer();
      const subPath = objectPath.startsWith("/objects/recipe-images")
        ? "recipe-images"
        : objectPath.startsWith("/objects/source-documents")
        ? "source-documents"
        : "recipe-images";
      const storagePath = await storageService.uploadBuffer(rotatedBuffer, "image/webp", subPath);
      newImageUrl = `/api/storage${storagePath}`;
      oldObjectPath = objectPath;

      // Only delete old object if no other recipe (besides this one) still references it
      const otherReferences = await db
        .select({ id: recipesTable.id })
        .from(recipesTable)
        .where(and(eq(recipesTable.imageUrl, recipe.imageUrl), sql`${recipesTable.id} != ${id}`, isNull(recipesTable.deletedAt)))
        .limit(1);
      shouldDeleteOldObject = otherReferences.length === 0;
    } else {
      res.status(400).json({ error: "unsupported_image", message: "Bildformat wird nicht unterstützt" });
      return;
    }

    await db
      .update(recipesTable)
      .set({ imageUrl: newImageUrl })
      .where(eq(recipesTable.id, id));

    // Update the photo record that is the main photo for this recipe only
    const [mainPhotoLink] = await db
      .select({ photoId: recipePhotoLinksTable.photoId })
      .from(recipePhotoLinksTable)
      .innerJoin(photosTable, and(eq(photosTable.id, recipePhotoLinksTable.photoId), eq(photosTable.imageUrl, recipe.imageUrl)))
      .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.isMain, true)))
      .limit(1);

    if (mainPhotoLink) {
      // Check if this photo is not linked to any other recipe before updating its URL
      const otherPhotoLinks = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .where(and(eq(recipePhotoLinksTable.photoId, mainPhotoLink.photoId), sql`${recipePhotoLinksTable.recipeId} != ${id}`))
        .limit(1);

      if (otherPhotoLinks.length === 0) {
        await db
          .update(photosTable)
          .set({ imageUrl: newImageUrl })
          .where(eq(photosTable.id, mainPhotoLink.photoId));
      }
    }

    invalidateRecipeListCache();

    // Clean up old file/object only after DB updates succeed
    if (oldLocalFilepath) {
      fs.unlink(oldLocalFilepath, () => {});
    }
    if (oldObjectPath && shouldDeleteOldObject) {
      await storageService.deleteObject(oldObjectPath).catch(() => {});
    }

    res.json({ imageUrl: newImageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to rotate recipe image");
    res.status(500).json({ error: "internal_error", message: "Bild konnte nicht gedreht werden" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes/:id/photos/:photoId
// ---------------------------------------------------------------------------

router.delete("/recipes/:id/photos/:photoId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (isNaN(id) || isNaN(photoId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const [deletedLink] = await db
      .delete(recipePhotoLinksTable)
      .where(and(eq(recipePhotoLinksTable.photoId, photoId), eq(recipePhotoLinksTable.recipeId, id)))
      .returning();

    if (!deletedLink) {
      res.status(404).json({ error: "not_found", message: "Photo not found" });
      return;
    }

    const remainingLinks = await db
      .select({ id: recipePhotoLinksTable.id })
      .from(recipePhotoLinksTable)
      .where(eq(recipePhotoLinksTable.photoId, photoId))
      .limit(1);

    if (remainingLinks.length === 0) {
      const [deletedPhoto] = await db
        .delete(photosTable)
        .where(eq(photosTable.id, photoId))
        .returning();

      if (deletedPhoto) {
        const filename = deletedPhoto.imageUrl.split("/").pop();
        if (filename) {
          const filepath = path.join(UPLOADS_DIR, filename);
          fs.unlink(filepath, () => {});
        }
      }
    }

    res.json({ success: true, id: photoId });
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe photo");
    res.status(500).json({ error: "internal_error", message: "Failed to delete recipe photo" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /recipes/:id/photos/:photoId/set-main
// ---------------------------------------------------------------------------

router.patch("/recipes/:id/photos/:photoId/set-main", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (isNaN(id) || isNaN(photoId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const [recipe] = await db
      .select({ id: recipesTable.id, createdBy: recipesTable.createdBy, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur der Eigentümer kann das Hauptbild setzen" });
      return;
    }

    const [link] = await db
      .select({ photoId: recipePhotoLinksTable.photoId })
      .from(recipePhotoLinksTable)
      .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, photoId)))
      .limit(1);

    if (!link) {
      res.status(404).json({ error: "not_found", message: "Foto nicht in dieser Rezept-Galerie gefunden" });
      return;
    }

    const [photo] = await db
      .select({ id: photosTable.id, imageUrl: photosTable.imageUrl })
      .from(photosTable)
      .where(eq(photosTable.id, photoId))
      .limit(1);

    if (!photo) {
      res.status(404).json({ error: "not_found", message: "Foto nicht gefunden" });
      return;
    }

    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: false })
      .where(eq(recipePhotoLinksTable.recipeId, id));

    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: true })
      .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, photoId)));

    await db
      .update(recipesTable)
      .set({ imageUrl: photo.imageUrl, isAiGenerated: false })
      .where(eq(recipesTable.id, id));

    invalidateRecipeListCache();

    res.json({ imageUrl: photo.imageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to set main photo");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Setzen des Hauptbilds" });
  }
});

// ---------------------------------------------------------------------------
// POST /photos/:photoId/link
// ---------------------------------------------------------------------------

router.post("/photos/:photoId/link", authMiddleware, async (req, res) => {
  try {
    const photoId = Number(req.params.photoId);
    if (isNaN(photoId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid photo id" });
      return;
    }

    const linkBodySchema = z.object({
      recipeId: z.number().int().positive(),
      sortOrder: z.number().int().default(0),
      isMain: z.boolean().default(false),
    });

    const data = linkBodySchema.parse(req.body);

    const [photo] = await db.select().from(photosTable).where(eq(photosTable.id, photoId)).limit(1);
    if (!photo) {
      res.status(404).json({ error: "not_found", message: "Photo not found" });
      return;
    }

    const [recipe] = await db
      .select({ id: recipesTable.id })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, data.recipeId), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const [link] = await db
      .insert(recipePhotoLinksTable)
      .values({ photoId, recipeId: data.recipeId, sortOrder: data.sortOrder, isMain: data.isMain })
      .onConflictDoUpdate({
        target: [recipePhotoLinksTable.photoId, recipePhotoLinksTable.recipeId],
        set: { sortOrder: data.sortOrder, isMain: data.isMain },
      })
      .returning();

    if (data.isMain) {
      await db
        .update(recipesTable)
        .set({ imageUrl: photo.imageUrl, isAiGenerated: false })
        .where(eq(recipesTable.id, data.recipeId));
      invalidateRecipeListCache();
    }

    res.status(201).json({
      id: photo.id,
      imageUrl: photo.imageUrl,
      caption: photo.caption,
      uploadedBy: photo.uploadedBy,
      source: photo.source,
      createdAt: photo.createdAt,
      linkId: link.id,
      recipeId: link.recipeId,
      sortOrder: link.sortOrder,
      isMain: link.isMain,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to link photo to recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to link photo to recipe" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/use-photo
// ---------------------------------------------------------------------------

router.post("/recipes/:id/use-photo", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const bodySchema = z.object({ photoId: z.number().int().positive() });
    const parseResult = bodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "invalid_input", message: "photoId ist erforderlich" });
      return;
    }

    const { photoId } = parseResult.data;

    const [recipe] = await db
      .select({ id: recipesTable.id, createdBy: recipesTable.createdBy, imageUrl: recipesTable.imageUrl, imageSource: recipesTable.imageSource })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur der Eigentümer kann das Hauptbild setzen" });
      return;
    }

    const [link] = await db
      .select({ photoId: recipePhotoLinksTable.photoId })
      .from(recipePhotoLinksTable)
      .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, photoId)))
      .limit(1);

    if (!link) {
      res.status(404).json({ error: "not_found", message: "Foto nicht in dieser Rezept-Galerie gefunden" });
      return;
    }

    const [photo] = await db
      .select({ id: photosTable.id, imageUrl: photosTable.imageUrl, source: photosTable.source })
      .from(photosTable)
      .where(eq(photosTable.id, photoId))
      .limit(1);

    if (!photo) {
      res.status(404).json({ error: "not_found", message: "Foto nicht gefunden" });
      return;
    }

    if (recipe.imageUrl && recipe.imageUrl !== photo.imageUrl) {
      const existingLink = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
        .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(photosTable.imageUrl, recipe.imageUrl)))
        .limit(1);
      if (existingLink.length === 0) {
        const prevSource = recipe.imageSource === "ai" ? "ai" as const : recipe.imageSource === "web" ? "web" as const : "original" as const;
        const [savedPhoto] = await db
          .insert(photosTable)
          .values({ imageUrl: recipe.imageUrl, uploadedBy: null, source: prevSource })
          .returning();
        await db
          .insert(recipePhotoLinksTable)
          .values({ photoId: savedPhoto.id, recipeId: id, sortOrder: 0, isMain: false })
          .onConflictDoNothing();
      }
    }

    const newImageSource = photo.source === "ai" ? "ai" : photo.source === "web" ? "web" : null;
    await db
      .update(recipesTable)
      .set({ imageUrl: photo.imageUrl, isAiGenerated: photo.source === "ai", imageSource: newImageSource })
      .where(eq(recipesTable.id, id));

    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: false })
      .where(eq(recipePhotoLinksTable.recipeId, id));
    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: true })
      .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, photoId)));

    invalidateRecipeListCache();

    res.json({ imageUrl: photo.imageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to set recipe main photo");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Setzen des Hauptbilds" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/generate-image
// ---------------------------------------------------------------------------

router.post("/recipes/:id/generate-image", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [recipe] = await db
      .select({ id: recipesTable.id, title: recipesTable.title, category: recipesTable.category, createdBy: recipesTable.createdBy, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur der Eigentümer kann ein Bild für dieses Rezept generieren" });
      return;
    }

    const imageUrl = await generateAndSaveRecipeImage(recipe.id, recipe.title, recipe.category);
    if (!imageUrl) {
      res.status(500).json({ error: "generation_failed", message: "Bildgenerierung fehlgeschlagen" });
      return;
    }

    res.json({ imageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to generate recipe image");
    res.status(500).json({ error: "internal_error", message: "Failed to generate recipe image" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/extract-image-from-source
// ---------------------------------------------------------------------------

router.post("/recipes/:id/extract-image-from-source", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Ungültige Rezept-ID" });
      return;
    }

    const saveCurrentAsPhoto = req.body?.saveCurrentAsPhoto === true;
    const fromScanDocument = req.body?.fromScanDocument === true;

    const [recipe] = await db
      .select({
        id: recipesTable.id,
        title: recipesTable.title,
        source: recipesTable.source,
        createdBy: recipesTable.createdBy,
        imageUrl: recipesTable.imageUrl,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur der Eigentümer kann ein Bild für dieses Rezept setzen" });
      return;
    }

    if (!fromScanDocument) {
      if (!recipe.source) {
        res.status(422).json({ error: "no_source_url", message: "Dieses Rezept hat keine Quell-URL" });
        return;
      }

      try {
        const parsedSource = new URL(recipe.source);
        if (!["http:", "https:"].includes(parsedSource.protocol)) throw new Error("not http");
      } catch {
        res.status(422).json({ error: "no_source_url", message: "Die Quell-URL ist keine gültige Webadresse" });
        return;
      }
    } else {
      if (!recipe.sourceDocumentUrl) {
        res.status(422).json({ error: "no_source_document", message: "Dieses Rezept hat kein Scan-Dokument" });
        return;
      }
    }

    if (saveCurrentAsPhoto && recipe.imageUrl) {
      const existingImageUrl = recipe.imageUrl;
      let [existingPhoto] = await db
        .select({ id: photosTable.id })
        .from(photosTable)
        .where(eq(photosTable.imageUrl, existingImageUrl))
        .limit(1);

      if (!existingPhoto) {
        [existingPhoto] = await db
          .insert(photosTable)
          .values({ imageUrl: existingImageUrl, uploadedBy: req.authUser!.id, source: "cooked" })
          .returning();
      }

      const [existingLink] = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, existingPhoto.id)))
        .limit(1);

      if (!existingLink) {
        await db
          .insert(recipePhotoLinksTable)
          .values({ photoId: existingPhoto.id, recipeId: id, sortOrder: 0, isMain: false });
      }
    }

    if (fromScanDocument) {
      const { ObjectStorageService } = await import("../../lib/objectStorage");
      const storageService = new ObjectStorageService();
      const sharp = (await import("sharp")).default;

      const sourceDocUrl = recipe.sourceDocumentUrl!;
      const objectPath = sourceDocUrl.startsWith("/api/storage")
        ? sourceDocUrl.replace("/api/storage", "")
        : sourceDocUrl;

      let file = null;
      if (objectPath.startsWith("/objects/")) {
        file = await storageService.getObjectEntityFile(objectPath).catch(() => null);
      }
      if (!file) {
        file = await storageService.searchPublicObject(objectPath.replace(/^\/objects\//, "")).catch(() => null);
      }

      if (!file) {
        res.status(422).json({ error: "no_file", message: "Das Scan-Dokument konnte nicht gefunden werden" });
        return;
      }

      const [rawBuffer] = await file.download();
      const [fileMeta] = await file.getMetadata();
      const contentType = (fileMeta.contentType as string) ?? "";
      const isPdf = contentType === "application/pdf" || sourceDocUrl.toLowerCase().includes(".pdf");

      const renderPdfToImages = async (pdfBuffer: Buffer): Promise<Buffer[]> => {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const { createCanvas } = (await import("@napi-rs/canvas"));
        const uint8Array = new Uint8Array(pdfBuffer);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfDoc = await (pdfjsLib as unknown as any).getDocument({ data: uint8Array, verbosity: 0 }).promise as { numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: object) => { promise: Promise<void> } }> };
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
        if (pageBuffers.length === 0) {
          res.status(422).json({ error: "no_image_found", message: "Im PDF konnten keine Seiten gerendert werden" });
          return;
        }
        imagesToScan = pageBuffers.map((buf) => ({ buffer: buf, mimeType: "image/jpeg" }));
      } else {
        const mimeType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)
          ? contentType
          : "image/jpeg";
        imagesToScan = [{ buffer: rawBuffer, mimeType }];
      }

      const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent für Rezept-Scans. Prüfe das Bild: Ist ein eingebettetes Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten)? Falls ja, gib die EXAKTEN Koordinaten des eingebetteten Fotos als Prozentwerte zurück. WICHTIG: Erkenne den genauen Bildrand des Fotos und schneide NUR das Foto selbst aus – ohne umliegenden Seitentext, Rezepttext, QR-Codes, Bildunterschriften oder weißen Seitenhintergrund. Die x/y/width/height-Werte sollen eng am tatsächlichen Fotorand enden, kein Leerraum außen. Falls kein Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

      const isCropCoords = (c: unknown): c is { x: number; y: number; width: number; height: number } =>
        c !== null &&
        typeof c === "object" &&
        Number.isFinite((c as { x: unknown }).x) &&
        Number.isFinite((c as { y: unknown }).y) &&
        Number.isFinite((c as { width: unknown }).width) &&
        Number.isFinite((c as { height: unknown }).height) &&
        (c as { x: number }).x >= 0 && (c as { y: number }).y >= 0 &&
        (c as { width: number }).width > 0 && (c as { height: number }).height > 0 &&
        (c as { x: number; width: number }).x + (c as { x: number; width: number }).width <= 100 &&
        (c as { y: number; height: number }).y + (c as { y: number; height: number }).height <= 100;

      let foundCrop: { x: number; y: number; width: number; height: number } | null = null;
      let foundPageBuffer: Buffer | null = null;

      for (const entry of imagesToScan) {
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
                { type: "text" as const, text: "Erkenne und lokalisiere das Lebensmittelfoto in diesem Scan." },
              ],
            },
          ],
        });

        let rawJson = aiResponse.choices[0]?.message?.content ?? "";
        rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        try {
          const parsed = JSON.parse(rawJson) as { foodImageCrop?: unknown };
          if (isCropCoords(parsed.foodImageCrop)) {
            foundCrop = parsed.foodImageCrop;
            foundPageBuffer = entry.buffer;
            break;
          }
        } catch {
          // continue to next page
        }
      }

      if (!foundCrop || !foundPageBuffer) {
        res.status(422).json({ error: "no_image_found", message: "Im Scan-Dokument konnte kein Lebensmittelfoto gefunden werden" });
        return;
      }

      const crop = foundCrop;
      const meta = await sharp(foundPageBuffer).metadata();
      const imgWidth = meta.width ?? 1024;
      const imgHeight = meta.height ?? 1024;

      const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
      const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
      const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
      const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

      const extractedBuf0 = await sharp(foundPageBuffer)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .toBuffer();
      const trimmedBuf0 = await escalatingTrim(extractedBuf0);
      const croppedBuffer = await sharp(trimmedBuf0)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
      const extractedImageUrl = `/api/storage${storagePath}`;

      await db.update(recipesTable).set({ imageUrl: extractedImageUrl, isAiGenerated: false, imageSource: "original" }).where(eq(recipesTable.id, id));
      invalidateRecipeListCache();
      await registerPhotoForRecipe(extractedImageUrl, id, {
        source: "pdf_extract",
        uploadedBy: req.authUser!.id,
        setAsMain: true,
        syncRecipeImageUrl: false,
      });

      res.json({ imageUrl: extractedImageUrl, imageSource: "original" });
      return;
    }

    const { extractAndSaveImageFromUrl } = await import("../extractUrl");
    const imageUrl = await extractAndSaveImageFromUrl(recipe.source!);

    if (!imageUrl) {
      res.status(422).json({
        error: "no_image_found",
        message: "Auf der Originalseite konnte kein Bild gefunden werden. Möglicherweise erlaubt die Seite keinen Zugriff.",
      });
      return;
    }

    await db.update(recipesTable).set({ imageUrl, isAiGenerated: false, imageSource: "web" }).where(eq(recipesTable.id, id));
    invalidateRecipeListCache();
    await registerPhotoForRecipe(imageUrl, id, {
      source: "url_import",
      uploadedBy: req.authUser!.id,
      setAsMain: true,
      syncRecipeImageUrl: false,
    });

    res.json({ imageUrl, imageSource: "web" });
  } catch (err) {
    req.log.error({ err }, "Failed to extract image from source URL");
    res.status(500).json({ error: "internal_error", message: "Bild-Extraktion fehlgeschlagen" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/extract-photo
// ---------------------------------------------------------------------------

router.post("/recipes/:id/extract-photo", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Ungültige Rezept-ID" });
      return;
    }

    const [recipe] = await db
      .select({
        id: recipesTable.id,
        createdBy: recipesTable.createdBy,
        imageUrl: recipesTable.imageUrl,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Keine Berechtigung" });
      return;
    }

    if (recipe.imageUrl) {
      res.status(409).json({ error: "image_exists", message: "Dieses Rezept hat bereits ein Hauptbild. Bitte lösche es zuerst, um ein neues zu extrahieren." });
      return;
    }

    if (!recipe.sourceDocumentUrl) {
      res.status(400).json({ error: "no_source_document", message: "Dieses Rezept hat kein PDF-Quelldokument" });
      return;
    }

    const { extractRecipePhoto } = await import("../../utils/extractRecipePhoto");
    const photoBuffer = await extractRecipePhoto(recipe.sourceDocumentUrl);

    if (!photoBuffer) {
      res.status(422).json({ error: "no_photo_found", message: "Im PDF konnte kein Lebensmittelfoto gefunden werden" });
      return;
    }

    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();
    const storagePath = await storageService.uploadBuffer(photoBuffer, "image/webp", "recipe-images");
    const imageUrl = `/api/storage${storagePath}`;

    await db.update(recipesTable)
      .set({ imageUrl, isAiGenerated: false, imageSource: "original" })
      .where(eq(recipesTable.id, id));
    await syncMainPhotoLink(id, imageUrl, req.authUser!.id, "original");
    invalidateRecipeListCache();

    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to extract photo from PDF");
    res.status(500).json({ error: "internal_error", message: "Foto-Extraktion fehlgeschlagen" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/extract-all-photos-from-source
// ---------------------------------------------------------------------------

router.post("/recipes/:id/extract-all-photos-from-source", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Ungültige Rezept-ID" });
      return;
    }

    const [recipe] = await db
      .select({
        id: recipesTable.id,
        createdBy: recipesTable.createdBy,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Rezept nicht gefunden" });
      return;
    }

    const isOwner = recipe.createdBy == null || recipe.createdBy === req.authUser!.id;
    if (!isOwner && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden", message: "Keine Berechtigung" });
      return;
    }

    if (!recipe.sourceDocumentUrl) {
      res.status(422).json({ error: "no_source_document", message: "Kein Quelldokument vorhanden" });
      return;
    }

    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();
    const sharp = (await import("sharp")).default;

    const sourceDocUrl = recipe.sourceDocumentUrl;
    const objectPath = sourceDocUrl.startsWith("/api/storage")
      ? sourceDocUrl.replace("/api/storage", "")
      : sourceDocUrl;

    let file = null;
    if (objectPath.startsWith("/objects/")) {
      file = await storageService.getObjectEntityFile(objectPath).catch(() => null);
    }
    if (!file) {
      file = await storageService.searchPublicObject(objectPath.replace(/^\/objects\//, "")).catch(() => null);
    }

    if (!file) {
      res.status(422).json({ error: "no_file", message: "Das Quelldokument konnte nicht gefunden werden" });
      return;
    }

    const [rawBuffer] = await file.download();
    const [fileMeta] = await file.getMetadata();
    const contentType = (fileMeta.contentType as string) ?? "";
    const isPdf = contentType === "application/pdf" || sourceDocUrl.toLowerCase().includes(".pdf");

    const renderPdfToImages = async (pdfBuffer: Buffer): Promise<Buffer[]> => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { createCanvas } = await import("@napi-rs/canvas");
      const uint8Array = new Uint8Array(pdfBuffer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfDoc = await (pdfjsLib as unknown as any).getDocument({ data: uint8Array, verbosity: 0 }).promise as { numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: object) => { promise: Promise<void> } }> };
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
      if (pageBuffers.length === 0) {
        res.status(422).json({ error: "no_pages", message: "Im PDF konnten keine Seiten gerendert werden" });
        return;
      }
      imagesToScan = pageBuffers.map((buf) => ({ buffer: buf, mimeType: "image/jpeg" }));
    } else {
      const mimeType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)
        ? contentType
        : "image/jpeg";
      imagesToScan = [{ buffer: rawBuffer, mimeType }];
    }

    const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent für Rezept-Scans. Prüfe das Bild: Ist ein eingebettetes Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten)? Falls ja, gib die EXAKTEN Koordinaten des eingebetteten Fotos als Prozentwerte zurück. WICHTIG: Erkenne den genauen Bildrand des Fotos und schneide NUR das Foto selbst aus – ohne umliegenden Seitentext, Rezepttext, QR-Codes, Bildunterschriften oder weißen Seitenhintergrund. Die x/y/width/height-Werte sollen eng am tatsächlichen Fotorand enden, kein Leerraum außen. Falls kein Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

    const isCropCoords = (c: unknown): c is { x: number; y: number; width: number; height: number } =>
      c !== null &&
      typeof c === "object" &&
      Number.isFinite((c as { x: unknown }).x) &&
      Number.isFinite((c as { y: unknown }).y) &&
      Number.isFinite((c as { width: unknown }).width) &&
      Number.isFinite((c as { height: unknown }).height) &&
      (c as { x: number }).x >= 0 && (c as { y: number }).y >= 0 &&
      (c as { width: number }).width > 0 && (c as { height: number }).height > 0 &&
      (c as { x: number; width: number }).x + (c as { x: number; width: number }).width <= 100 &&
      (c as { y: number; height: number }).y + (c as { y: number; height: number }).height <= 100;

    const addedPhotos: Array<{ imageUrl: string }> = [];
    let alreadyExisted = 0;

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

        const parsed = JSON.parse(rawJson) as { foodImageCrop?: unknown };
        if (!isCropCoords(parsed.foodImageCrop)) continue;

        const crop = parsed.foodImageCrop;
        const meta = await sharp(entry.buffer).metadata();
        const imgWidth = meta.width ?? 1024;
        const imgHeight = meta.height ?? 1024;

        const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
        const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
        const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
        const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

        const extractedBuf1 = await sharp(entry.buffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .toBuffer();
        const trimmedBuf1 = await escalatingTrim(extractedBuf1);
        const croppedBuffer = await sharp(trimmedBuf1)
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
            .values({ imageUrl: photoUrl, uploadedBy: req.authUser!.id, source: "original" })
            .returning();
        }

        const [existingLink] = await db
          .select({ id: recipePhotoLinksTable.id })
          .from(recipePhotoLinksTable)
          .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(recipePhotoLinksTable.photoId, photo.id)))
          .limit(1);

        if (existingLink) {
          alreadyExisted++;
        } else {
          const existingCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(recipePhotoLinksTable)
            .where(eq(recipePhotoLinksTable.recipeId, id));
          const sortOrder = (existingCount[0]?.count ?? 0) + addedPhotos.length;

          await db
            .insert(recipePhotoLinksTable)
            .values({ photoId: photo.id, recipeId: id, sortOrder, isMain: false });

          addedPhotos.push({ imageUrl: photoUrl });
        }
      } catch {
        // skip pages where AI or processing fails
      }
    }

    res.json({ photosAdded: addedPhotos.length, alreadyExisted, photos: addedPhotos });
  } catch (err) {
    req.log.error({ err }, "Failed to extract all photos from source document");
    res.status(500).json({ error: "internal_error", message: "Foto-Extraktion fehlgeschlagen" });
  }
});

export default router;
