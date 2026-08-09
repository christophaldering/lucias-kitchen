/**
 * Admin-Routen:
 * - GET/DELETE /recipes/trash
 * - POST /admin/recipes/generate-tags, GET /admin/recipes/tags-status
 * - POST /recipes/seed
 * - POST /recipes/request-delete, DELETE /recipes
 * - Admin-Bildrouten: extract-recipe-images, recipes-without-images, …
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recipesTable,
  recipeIngredientsTable,
  usersTable,
  photosTable,
  recipePhotoLinksTable,
  deleteConfirmationTokensTable,
} from "@workspace/db/schema";
import { eq, inArray, sql, and, isNull, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "../auth";
import { authLimiter } from "../../lib/rateLimits";
import { seedRecipes } from "../../db/seedRecipes";
import { generateTagsForRecipe } from "../../lib/generateRecipeTags";
import { randomUUID } from "crypto";
import { sendEmail } from "../../lib/email";
import { deleteConfirmationEmail } from "../../lib/emailTemplates";
import { openai } from "@workspace/integrations-openai-ai-server";
import { escalatingTrim } from "../../lib/imageUtils";
import { registerPhotoForRecipe } from "../../utils/registerPhotoForRecipe";
import {
  isAdmin,
  invalidateRecipeListCache,
  getRecipesWithIngredients,
  generateAndSaveRecipeImage,
} from "./shared";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /recipes/trash
// ---------------------------------------------------------------------------

router.get("/recipes/trash", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können den Papierkorb einsehen" });
    return;
  }
  try {
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.title,
        r.deleted_at AS "deletedAt",
        r.created_by AS "createdBy",
        u.display_name AS "ownerDisplayName"
      FROM recipes r
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.deleted_at IS NOT NULL
      ORDER BY r.deleted_at DESC
    `);
    const rawRows = (rows as unknown as { rows: unknown[] }).rows ?? (rows as unknown as unknown[]);
    const now = Date.now();
    const result = (rawRows as Array<{ id: number; title: string; deletedAt: string | Date; createdBy: number | null; ownerDisplayName: string | null }>)
      .map((r) => {
        const deletedAt = new Date(r.deletedAt);
        const daysLeft = Math.max(0, 30 - Math.floor((now - deletedAt.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          id: r.id,
          title: r.title,
          deletedAt: deletedAt.toISOString(),
          daysLeft,
          createdBy: r.createdBy,
          ownerDisplayName: r.ownerDisplayName,
        };
      });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch trash");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch trash" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes/trash
// ---------------------------------------------------------------------------

router.delete("/recipes/trash", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können den Papierkorb leeren" });
    return;
  }
  try {
    const allTrashed = await db
      .select({ id: recipesTable.id, sourceDocumentUrl: recipesTable.sourceDocumentUrl })
      .from(recipesTable)
      .where(sql`${recipesTable.deletedAt} IS NOT NULL`);

    for (const recipe of allTrashed) {
      if (recipe.sourceDocumentUrl) {
        try {
          const [otherRef] = await db
            .select({ id: recipesTable.id })
            .from(recipesTable)
            .where(and(eq(recipesTable.sourceDocumentUrl, recipe.sourceDocumentUrl), isNull(recipesTable.deletedAt)))
            .limit(1);

          if (!otherRef) {
            const { ObjectStorageService } = await import("../../lib/objectStorage");
            const storageService = new ObjectStorageService();
            const storagePath = recipe.sourceDocumentUrl.replace(/^\/api\/storage/, "");
            await storageService.deleteObject(storagePath);
          }
        } catch {
        }
      }
    }

    if (allTrashed.length > 0) {
      const ids = allTrashed.map((r) => r.id);
      await db.delete(recipesTable).where(inArray(recipesTable.id, ids));
    }

    res.json({ success: true, deleted: allTrashed.length });
  } catch (err) {
    req.log.error({ err }, "Failed to empty trash");
    res.status(500).json({ error: "internal_error", message: "Failed to empty trash" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/recipes/generate-tags
// ---------------------------------------------------------------------------

router.post("/admin/recipes/generate-tags", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können Tags generieren" });
    return;
  }

  const { forceAll = false } = req.body as { forceAll?: boolean };

  try {
    const allRecipes = await db
      .select({
        id: recipesTable.id,
        title: recipesTable.title,
        category: recipesTable.category,
        seasons: recipesTable.seasons,
        notes: recipesTable.notes,
        tags: recipesTable.tags,
        steps: recipesTable.steps,
      })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const toProcess = forceAll
      ? allRecipes
      : allRecipes.filter((r) => !r.tags || r.tags.length === 0);

    const total = toProcess.length;

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    let processed = 0;
    let failed = 0;

    for (const recipe of toProcess) {
      try {
        const ingredients = await db
          .select({ name: recipeIngredientsTable.name })
          .from(recipeIngredientsTable)
          .where(eq(recipeIngredientsTable.recipeId, recipe.id));

        const tags = await generateTagsForRecipe({
          title: recipe.title,
          category: recipe.category,
          ingredients,
          seasons: recipe.seasons,
          steps: Array.isArray(recipe.steps) ? (recipe.steps as string[]) : [],
          notes: recipe.notes,
        });

        if (tags.length > 0) {
          await db
            .update(recipesTable)
            .set({ tags })
            .where(eq(recipesTable.id, recipe.id));
        }

        processed++;
      } catch {
        failed++;
        processed++;
      }

      res.write(JSON.stringify({ processed, total, failed, recipeId: recipe.id }) + "\n");
    }

    res.end(JSON.stringify({ done: true, total, processed, failed }));
  } catch (err) {
    req.log.error({ err }, "Failed to generate tags");
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: "Tag-Generierung fehlgeschlagen" });
    } else {
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  }
});

// ---------------------------------------------------------------------------
// GET /admin/recipes/tags-status
// ---------------------------------------------------------------------------

router.get("/admin/recipes/tags-status", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können den Tag-Status einsehen" });
    return;
  }

  try {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const [withTagsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipesTable)
      .where(and(
        isNull(recipesTable.deletedAt),
        sql`${recipesTable.tags} IS NOT NULL AND array_length(${recipesTable.tags}, 1) > 0`
      ));

    const total = Number(totalRow?.count ?? 0);
    const withTags = Number(withTagsRow?.count ?? 0);

    res.json({
      total,
      withTags,
      withoutTags: total - withTags,
      coverage: total > 0 ? Math.round((withTags / total) * 100) : 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch tags status");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch tags status" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/seed
// ---------------------------------------------------------------------------

router.post("/recipes/seed", async (req, res) => {
  try {
    await seedRecipes(true);
    const recipes = await getRecipesWithIngredients();
    res.json({ success: true, count: recipes.length });
  } catch (err) {
    req.log.error({ err }, "Failed to seed recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to seed recipes" });
  }
});

// ---------------------------------------------------------------------------
// issueDeleteAllConfirmation (privater Helfer)
// ---------------------------------------------------------------------------

async function issueDeleteAllConfirmation(userId: number): Promise<{ email: string }> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recipesTable)
    .where(isNull(recipesTable.deletedAt));
  const recipeCount = Number(countRow?.count ?? 0);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.delete(deleteConfirmationTokensTable).where(
    eq(deleteConfirmationTokensTable.userId, userId)
  );

  await db.insert(deleteConfirmationTokensTable).values({
    token,
    userId,
    expiresAt,
  });

  const appBaseUrl = process.env["APP_BASE_URL"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  const confirmLink = `${appBaseUrl}/confirm-delete?token=${token}`;

  const [userRow] = await db
    .select({ email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!userRow) {
    throw Object.assign(new Error("user_not_found"), { code: "user_not_found" });
  }

  await sendEmail(
    userRow.email,
    "Bestätigung: Alle Rezepte löschen – Lucia's Küche",
    deleteConfirmationEmail({
      userName: userRow.displayName,
      userEmail: userRow.email,
      recipeCount,
      confirmLink,
    })
  );

  return { email: userRow.email };
}

// ---------------------------------------------------------------------------
// POST /recipes/request-delete
// ---------------------------------------------------------------------------

router.post("/recipes/request-delete", authMiddleware, authLimiter, async (req, res) => {
  try {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!isAdmin(user.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur Administratoren dürfen alle Rezepte löschen." });
      return;
    }
    const { email } = await issueDeleteAllConfirmation(user.id);
    res.json({ success: true, email });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "user_not_found") {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    req.log.error({ err }, "Failed to request delete confirmation");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Senden der Bestätigungs-E-Mail" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes  (sendet Bestätigungs-E-Mail)
// ---------------------------------------------------------------------------

router.delete("/recipes", authMiddleware, async (req, res) => {
  try {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!isAdmin(user.email)) {
      res.status(403).json({ error: "forbidden", message: "Nur Administratoren dürfen alle Rezepte löschen." });
      return;
    }
    const { email } = await issueDeleteAllConfirmation(user.id);
    res.status(202).json({ success: true, email, message: "Bestätigungs-E-Mail wurde gesendet. Bitte E-Mail bestätigen, um die Löschung abzuschließen." });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "user_not_found") {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    req.log.error({ err }, "Failed to initiate delete all recipes via email");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Senden der Bestätigungs-E-Mail" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/extract-recipe-images  (SSE)
// ---------------------------------------------------------------------------

router.post("/admin/extract-recipe-images", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins erlaubt" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const recipesWithCookedPhotos = await db
      .selectDistinct({ recipeId: recipePhotoLinksTable.recipeId })
      .from(recipePhotoLinksTable)
      .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
      .where(eq(photosTable.source, "cooked"));

    const recipeIdsWithCookedPhotos = new Set(recipesWithCookedPhotos.map((r) => r.recipeId));

    const allRecipes = await db
      .select({ id: recipesTable.id })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const recipesToProcess = allRecipes.filter((r) => recipeIdsWithCookedPhotos.has(r.id));

    const total = recipesToProcess.length;
    let done = 0;
    let errors = 0;

    sendEvent({ done, total, errors });

    for (const recipe of recipesToProcess) {
      try {
        const photos = await db
          .select({
            id: photosTable.id,
            imageUrl: photosTable.imageUrl,
            createdAt: photosTable.createdAt,
          })
          .from(recipePhotoLinksTable)
          .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
          .where(and(eq(recipePhotoLinksTable.recipeId, recipe.id), eq(photosTable.source, "cooked")))
          .orderBy(desc(photosTable.createdAt))
          .limit(1);

        if (photos.length > 0) {
          const firstPhoto = photos[0];
          await db
            .update(recipesTable)
            .set({ imageUrl: firstPhoto.imageUrl, isAiGenerated: false })
            .where(eq(recipesTable.id, recipe.id));
          invalidateRecipeListCache();
        } else {
          errors++;
        }
      } catch (err) {
        console.error(`Failed to extract image for recipe ${recipe.id}:`, err);
        errors++;
      }
      done++;
      sendEvent({ done, total, errors });
    }

    sendEvent({ done: total, total, errors, finished: true });
  } catch (err) {
    req.log.error({ err }, "Failed to run photo extraction backfill");
    sendEvent({ error: "Fehler bei der Fotoextraktion" });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// GET /admin/recipes-without-images
// ---------------------------------------------------------------------------

router.get("/admin/recipes-without-images", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können diese Daten abrufen" });
    return;
  }

  try {
    const photoCounts = await db
      .select({
        recipeId: recipePhotoLinksTable.recipeId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(recipePhotoLinksTable)
      .groupBy(recipePhotoLinksTable.recipeId);

    const photoCountMap = new Map(photoCounts.map((r) => [r.recipeId, r.count]));

    const allRecipes = await db
      .select({ id: recipesTable.id, title: recipesTable.title, category: recipesTable.category, createdAt: recipesTable.createdAt })
      .from(recipesTable)
      .where(and(isNull(recipesTable.deletedAt), isNull(recipesTable.imageUrl)))
      .orderBy(recipesTable.id);

    const result = allRecipes.map((r) => ({ ...r, photoCount: photoCountMap.get(r.id) ?? 0 }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes without images");
    res.status(500).json({ error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/recipes-with-images
// ---------------------------------------------------------------------------

router.get("/admin/recipes-with-images", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können diese Daten abrufen" });
    return;
  }

  try {
    const recipes = await db
      .select({ id: recipesTable.id, title: recipesTable.title, category: recipesTable.category, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(and(isNull(recipesTable.deletedAt), sql`${recipesTable.imageUrl} IS NOT NULL`))
      .orderBy(recipesTable.title);

    res.json(recipes);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes with images");
    res.status(500).json({ error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/recipes-without-scan-photo
// ---------------------------------------------------------------------------

router.get("/admin/recipes-without-scan-photo", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können diese Daten abrufen" });
    return;
  }

  try {
    const candidates = await db
      .select({
        id: recipesTable.id,
        title: recipesTable.title,
        category: recipesTable.category,
        createdAt: recipesTable.createdAt,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(
        and(
          isNull(recipesTable.deletedAt),
          sql`${recipesTable.sourceDocumentUrl} IS NOT NULL`,
          sql`(${recipesTable.imageSource} IS DISTINCT FROM 'original')`
        )
      )
      .orderBy(recipesTable.id);

    res.json(candidates);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes without scan photo");
    res.status(500).json({ error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/extract-scan-photos  (SSE)
// ---------------------------------------------------------------------------

router.post("/admin/extract-scan-photos", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins erlaubt" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const bodySchema = z.object({
      ids: z.array(z.number().int().positive()).optional(),
    });
    const parseResult = bodySchema.safeParse(req.body);
    if (!parseResult.success) {
      sendEvent({ error: "Ungültige Eingabe: ids muss eine Liste positiver ganzer Zahlen sein" });
      res.end();
      return;
    }
    const requestedIds =
      parseResult.data.ids && parseResult.data.ids.length > 0 ? parseResult.data.ids : null;

    const allCandidates = await db
      .select({
        id: recipesTable.id,
        sourceDocumentUrl: recipesTable.sourceDocumentUrl,
      })
      .from(recipesTable)
      .where(
        and(
          isNull(recipesTable.deletedAt),
          sql`${recipesTable.sourceDocumentUrl} IS NOT NULL`,
          sql`(${recipesTable.imageSource} IS DISTINCT FROM 'original')`
        )
      );
    const recipesToProcess = requestedIds
      ? allCandidates.filter((r) => requestedIds.includes(r.id))
      : allCandidates;

    const total = recipesToProcess.length;
    let done = 0;
    let errors = 0;
    let skipped = 0;

    sendEvent({ done, total, errors, skipped });

    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();
    const sharp = (await import("sharp")).default;

    const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent für Rezept-Scans. Prüfe das Bild: Ist ein eingebettetes Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten)? Falls ja, gib die EXAKTEN Koordinaten des eingebetteten Fotos als Prozentwerte zurück. WICHTIG: Erkenne den genauen Bildrand des Fotos und schneide NUR das Foto selbst aus – ohne umliegenden Seitentext, Rezepttext, QR-Codes, Bildunterschriften oder weißen Seitenhintergrund. Die x/y/width/height-Werte sollen eng am tatsächlichen Fotorand enden, kein Leerraum außen. Falls kein Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

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

    for (const recipe of recipesToProcess) {
      try {
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
          skipped++;
          done++;
          sendEvent({ done, total, errors, skipped });
          continue;
        }

        const [rawBuffer] = await file.download();
        const [fileMeta] = await file.getMetadata();
        const contentType = (fileMeta.contentType as string) ?? "";
        const isPdf = contentType === "application/pdf" || sourceDocUrl.toLowerCase().includes(".pdf");

        type ImageEntry = { buffer: Buffer; mimeType: string };
        let imagesToScan: ImageEntry[];

        if (isPdf) {
          const pageBuffers = await renderPdfToImages(rawBuffer);
          if (pageBuffers.length === 0) {
            skipped++;
            done++;
            sendEvent({ done, total, errors, skipped });
            continue;
          }
          imagesToScan = pageBuffers.map((buf) => ({ buffer: buf, mimeType: "image/jpeg" }));
        } else {
          const mimeType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)
            ? contentType
            : "image/jpeg";
          imagesToScan = [{ buffer: rawBuffer, mimeType }];
        }

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
          skipped++;
          done++;
          sendEvent({ done, total, errors, skipped });
          continue;
        }

        const crop = foundCrop;
        const meta = await sharp(foundPageBuffer).metadata();
        const imgWidth = meta.width ?? 1024;
        const imgHeight = meta.height ?? 1024;

        const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
        const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
        const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
        const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

        const extractedBuf2 = await sharp(foundPageBuffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .toBuffer();
        const trimmedBuf2 = await escalatingTrim(extractedBuf2);
        const croppedBuffer = await sharp(trimmedBuf2)
          .resize(800, 800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
        const extractedImageUrl = `/api/storage${storagePath}`;

        await db
          .update(recipesTable)
          .set({ imageUrl: extractedImageUrl, isAiGenerated: false, imageSource: "original" })
          .where(eq(recipesTable.id, recipe.id));
        await registerPhotoForRecipe(extractedImageUrl, recipe.id, {
          source: "pdf_extract",
          setAsMain: true,
          syncRecipeImageUrl: false,
        });
        invalidateRecipeListCache();
      } catch (err) {
        req.log.error({ err, recipeId: recipe.id }, "Failed to extract scan photo");
        errors++;
      }
      done++;
      sendEvent({ done, total, errors, skipped });
    }

    sendEvent({ done: total, total, errors, skipped, finished: true });
  } catch (err) {
    req.log.error({ err }, "Failed to run scan photo extraction");
    sendEvent({ error: "Fehler bei der Scan-Foto-Extraktion" });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /admin/backfill-photo-links
// ---------------------------------------------------------------------------

router.post("/admin/backfill-photo-links", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins erlaubt" });
    return;
  }

  try {
    const recipesWithImage = await db
      .select({
        id: recipesTable.id,
        imageUrl: recipesTable.imageUrl,
        imageSource: recipesTable.imageSource,
        isAiGenerated: recipesTable.isAiGenerated,
      })
      .from(recipesTable)
      .where(and(isNull(recipesTable.deletedAt), sql`${recipesTable.imageUrl} IS NOT NULL`));

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const recipe of recipesWithImage) {
      if (!recipe.imageUrl) continue;
      try {
        const [existingLink] = await db
          .select({ id: recipePhotoLinksTable.id })
          .from(recipePhotoLinksTable)
          .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
          .where(and(eq(recipePhotoLinksTable.recipeId, recipe.id), eq(photosTable.imageUrl, recipe.imageUrl)))
          .limit(1);

        if (existingLink) {
          skipped++;
          continue;
        }

        const source = (recipe.imageSource === "ai" || recipe.isAiGenerated === true)
          ? "ai_generated" as const
          : recipe.imageSource === "web"
          ? "url_import" as const
          : "imported" as const;

        await registerPhotoForRecipe(recipe.imageUrl, recipe.id, {
          source,
          setAsMain: true,
          syncRecipeImageUrl: false,
        });
        processed++;
      } catch {
        errors++;
      }
    }

    res.json({ success: true, processed, skipped, errors, total: recipesWithImage.length });
  } catch (err) {
    req.log.error({ err }, "Failed to backfill photo links");
    res.status(500).json({ error: "internal_error", message: "Backfill fehlgeschlagen" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/image-stats
// ---------------------------------------------------------------------------

router.get("/admin/image-stats", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins erlaubt" });
    return;
  }

  try {
    const allRecipes = await db
      .select({ id: recipesTable.id, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const storageRecipes = allRecipes.filter(
      (r) => r.imageUrl && r.imageUrl.startsWith("/api/storage/")
    );

    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();

    let totalSizeBytes = 0;
    let sizeKnown = true;

    for (const recipe of storageRecipes) {
      try {
        const objectPath = recipe.imageUrl!.replace("/api/storage", "");
        let file = null;
        if (objectPath.startsWith("/objects/")) {
          file = await storageService.getObjectEntityFile(objectPath).catch(() => null);
        }
        if (!file) {
          file = await storageService.searchPublicObject(objectPath.replace(/^\/objects\//, "")).catch(() => null);
        }
        if (file) {
          const [metadata] = await file.getMetadata();
          totalSizeBytes += Number(metadata.size ?? 0);
        } else {
          sizeKnown = false;
        }
      } catch {
        sizeKnown = false;
      }
    }

    const alreadyWebP = storageRecipes.filter((r) => r.imageUrl!.endsWith(".webp")).length;

    res.json({
      total: storageRecipes.length,
      alreadyWebP,
      needsConversion: storageRecipes.length - alreadyWebP,
      totalSizeBytes: sizeKnown ? totalSizeBytes : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get image stats");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Abrufen der Bildstatistiken" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/optimize-existing-images  (SSE)
// ---------------------------------------------------------------------------

router.post("/admin/optimize-existing-images", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins erlaubt" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    }
  };

  try {
    const sharp = (await import("sharp")).default;
    const { ObjectStorageService } = await import("../../lib/objectStorage");
    const storageService = new ObjectStorageService();

    const allRecipes = await db
      .select({ id: recipesTable.id, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const storageRecipes = allRecipes.filter(
      (r) => r.imageUrl && r.imageUrl.startsWith("/api/storage/")
    );

    const alreadyWebP = storageRecipes.filter((r) => r.imageUrl!.endsWith(".webp"));
    const recipesToProcess = storageRecipes.filter((r) => !r.imageUrl!.endsWith(".webp"));

    const total = recipesToProcess.length;
    const skipped = alreadyWebP.length;
    let done = 0;
    let errors = 0;

    sendEvent({ done, total, skipped, errors });

    const BATCH_SIZE = 6;
    for (let i = 0; i < recipesToProcess.length; i += BATCH_SIZE) {
      const batch = recipesToProcess.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (recipe) => {
        try {
          const objectPath = recipe.imageUrl!.replace("/api/storage", "");

          const file = await storageService.getObjectEntityFile(objectPath).catch(async () => {
            const publicPath = objectPath.replace(/^\/objects\//, "");
            return storageService.searchPublicObject(publicPath);
          });

          if (!file) {
            errors++;
            done++;
            sendEvent({ done, total, skipped, errors });
            return;
          }

          const [originalBuffer] = await file.download();

          const webpBuffer = await sharp(originalBuffer)
            .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

          const newStoragePath = await storageService.uploadBuffer(webpBuffer, "image/webp", "recipe-images");
          const newImageUrl = `/api/storage${newStoragePath}`;

          await db.update(recipesTable).set({ imageUrl: newImageUrl }).where(eq(recipesTable.id, recipe.id));
          invalidateRecipeListCache();

          try {
            await file.delete();
          } catch (deleteErr) {
            req.log.warn({ deleteErr, recipeId: recipe.id }, "Failed to delete old image after optimization");
          }

          done++;
          sendEvent({ done, total, skipped, errors });
        } catch (err) {
          req.log.error({ err, recipeId: recipe.id }, "Failed to optimize image");
          errors++;
          done++;
          sendEvent({ done, total, skipped, errors });
        }
      }));
    }

    sendEvent({ done: total, total, skipped, errors, finished: true });
  } catch (err) {
    req.log.error({ err }, "Failed to run image optimization");
    sendEvent({ error: "Fehler bei der Bildoptimierung" });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /admin/generate-recipe-images/selected  (SSE)
// ---------------------------------------------------------------------------

router.post("/admin/generate-recipe-images/selected", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können Bilder generieren" });
    return;
  }

  const bodySchema = z.object({ ids: z.array(z.number().int().positive()).min(1) });
  const parseResult = bodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "invalid_input", message: "ids muss eine nicht-leere Liste von Rezept-IDs sein" });
    return;
  }

  const { ids } = parseResult.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const allRecipes = await db
      .select({ id: recipesTable.id, title: recipesTable.title, category: recipesTable.category, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(and(isNull(recipesTable.deletedAt), inArray(recipesTable.id, ids)));

    const recipesNeedingImage = allRecipes.filter((r) => !r.imageUrl);

    const firstPhotoMap = new Map<number, string>();
    if (recipesNeedingImage.length > 0) {
      const firstPhotos = await db
        .select({
          recipeId: recipePhotoLinksTable.recipeId,
          imageUrl: photosTable.imageUrl,
        })
        .from(recipePhotoLinksTable)
        .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
        .where(inArray(recipePhotoLinksTable.recipeId, recipesNeedingImage.map((r) => r.id)))
        .orderBy(recipePhotoLinksTable.sortOrder, desc(photosTable.createdAt));

      for (const row of firstPhotos) {
        if (!firstPhotoMap.has(row.recipeId)) {
          firstPhotoMap.set(row.recipeId, row.imageUrl);
        }
      }
    }

    const recipesWithGalleryPhotos = recipesNeedingImage.filter((r) => firstPhotoMap.has(r.id));
    const recipesNeedingAI = recipesNeedingImage.filter((r) => !firstPhotoMap.has(r.id));

    const total = recipesNeedingImage.length;
    let done = 0;
    let errors = 0;

    sendEvent({ done, total, errors });

    for (const recipe of recipesWithGalleryPhotos) {
      try {
        const photoUrl = firstPhotoMap.get(recipe.id)!;
        await db.update(recipesTable).set({ imageUrl: photoUrl, isAiGenerated: false }).where(eq(recipesTable.id, recipe.id));
        await registerPhotoForRecipe(photoUrl, recipe.id, { source: "imported", setAsMain: true, syncRecipeImageUrl: false });
        invalidateRecipeListCache();
      } catch {
        errors++;
      }
      done++;
      sendEvent({ done, total, errors });
    }

    if (recipesNeedingAI.length > 0) {
      const { batchProcessWithSSE } = await import("@workspace/integrations-openai-ai-server/batch");

      await batchProcessWithSSE(
        recipesNeedingAI,
        async (recipe) => {
          await generateAndSaveRecipeImage(recipe.id, recipe.title, recipe.category);
        },
        (event) => {
          if (event.type === "progress") {
            done++;
            if (event.error) errors++;
            sendEvent({ done, total, errors });
          } else if (event.type === "complete") {
            sendEvent({ done: total, total, errors, finished: true });
          }
        },
        { retries: 2 }
      );
    } else {
      sendEvent({ done: total, total, errors, finished: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to run selected image generation");
    sendEvent({ error: "Fehler bei der Bildgenerierung" });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /admin/generate-recipe-images  (SSE – alle ohne Bild)
// ---------------------------------------------------------------------------

router.post("/admin/generate-recipe-images", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können Bilder generieren" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const allRecipes = await db
      .select({ id: recipesTable.id, title: recipesTable.title, category: recipesTable.category, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(and(isNull(recipesTable.deletedAt), isNull(recipesTable.imageUrl)));

    const recipesNeedingImage = allRecipes;

    const firstPhotos = recipesNeedingImage.length > 0
      ? await db
          .select({
            recipeId: recipePhotoLinksTable.recipeId,
            imageUrl: photosTable.imageUrl,
          })
          .from(recipePhotoLinksTable)
          .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
          .where(inArray(recipePhotoLinksTable.recipeId, recipesNeedingImage.map((r) => r.id)))
          .orderBy(recipePhotoLinksTable.sortOrder, desc(photosTable.createdAt))
      : [];

    const firstPhotoMap = new Map<number, string>();
    for (const row of firstPhotos) {
      if (!firstPhotoMap.has(row.recipeId)) {
        firstPhotoMap.set(row.recipeId, row.imageUrl);
      }
    }

    const recipesWithGalleryPhotos = recipesNeedingImage.filter((r) => firstPhotoMap.has(r.id));
    const recipesNeedingAI = recipesNeedingImage.filter((r) => !firstPhotoMap.has(r.id));

    const total = recipesNeedingImage.length;
    let done = 0;
    let errors = 0;

    sendEvent({ done, total, errors });

    for (const recipe of recipesWithGalleryPhotos) {
      try {
        const photoUrl = firstPhotoMap.get(recipe.id)!;
        await db.update(recipesTable).set({ imageUrl: photoUrl, isAiGenerated: false }).where(eq(recipesTable.id, recipe.id));
        await registerPhotoForRecipe(photoUrl, recipe.id, { source: "imported", setAsMain: true, syncRecipeImageUrl: false });
        invalidateRecipeListCache();
      } catch {
        errors++;
      }
      done++;
      sendEvent({ done, total, errors });
    }

    if (recipesNeedingAI.length > 0) {
      const { batchProcessWithSSE } = await import("@workspace/integrations-openai-ai-server/batch");

      await batchProcessWithSSE(
        recipesNeedingAI,
        async (recipe) => {
          await generateAndSaveRecipeImage(recipe.id, recipe.title, recipe.category);
        },
        (event) => {
          if (event.type === "progress") {
            done++;
            if (event.error) errors++;
            sendEvent({ done, total, errors });
          } else if (event.type === "complete") {
            sendEvent({ done: total, total, errors, finished: true });
          }
        },
        { retries: 2 }
      );
    } else {
      sendEvent({ done: total, total, errors, finished: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to run image backfill");
    sendEvent({ error: "Fehler bei der Bildgenerierung" });
  } finally {
    res.end();
  }
});

export default router;
