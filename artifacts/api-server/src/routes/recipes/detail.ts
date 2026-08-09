/**
 * Einzelrezept-Routen: GET/POST/PUT/PATCH/DELETE /recipes/:id,
 * Wiederherstellen, permanentes Löschen, Favoriten.
 *
 * ACHTUNG: Dieser Router muss NACH list.ts und admin.ts registriert werden,
 * damit /recipes/stats, /recipes/trash usw. nicht von /:id abgefangen werden.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable, recipeFavoritesTable } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "../auth";
import { generateTagsForRecipe } from "../../lib/generateRecipeTags";
import { upsertEmbeddingForRecipe } from "../../lib/embeddings";
import { registerPhotoForRecipe } from "../../utils/registerPhotoForRecipe";
import {
  isAdmin,
  recipeBodySchema,
  invalidateRecipeListCache,
  syncMainPhotoLink,
} from "./shared";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /recipes/:id
// ---------------------------------------------------------------------------

router.get("/recipes/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const currentUserId = req.authUser!.id;
    const favExpr = sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`;
    const isOwnerExpr = sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`;

    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.title,
        r.servings,
        r.prep_time        AS "prepTime",
        r.total_time       AS "totalTime",
        r.difficulty,
        r.category,
        r.rating,
        r.kcal_per_portion AS "kcalPerPortion",
        r.source,
        r.last_cooked      AS "lastCooked",
        r.cooked_count     AS "cookedCount",
        r.notes,
        r.personal_notes   AS "personalNotes",
        r.steps,
        r.image_url        AS "imageUrl",
        r.created_at       AS "createdAt",
        r.seasons,
        r.tags,
        r.created_by       AS "createdBy",
        r.parent_recipe_id AS "parentRecipeId",
        r.variant_name     AS "variantName",
        r.source_document_url AS "sourceDocumentUrl",
        r.is_ai_generated  AS "isAiGenerated",
        r.image_source     AS "imageSource",
        r.tried,
        r.chef_pick        AS "chefPick",
        (
          SELECT p.image_url
          FROM recipe_photo_links rpl
          INNER JOIN photos p ON p.id = rpl.photo_id
          WHERE rpl.recipe_id = r.id AND rpl.is_main = true
          ORDER BY rpl.sort_order, p.created_at DESC
          LIMIT 1
        ) AS "mainPhotoUrl",
        COALESCE(
          json_agg(
            json_build_object(
              'id',       ri.id,
              'recipeId', ri.recipe_id,
              'amount',   ri.amount,
              'unit',     ri.unit,
              'name',     ri.name,
              'note',     ri.note
            ) ORDER BY ri.id
          ) FILTER (WHERE ri.id IS NOT NULL),
          '[]'
        ) AS ingredients,
        ${favExpr}      AS "isFavorite",
        ${isOwnerExpr}  AS "isOwner",
        u.display_name  AS "ownerDisplayName",
        u.avatar_url    AS "ownerAvatarUrl"
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = ${id} AND r.deleted_at IS NULL
      GROUP BY r.id, u.display_name, u.avatar_url
    `);

    type FullRow = {
      id: number; title: string; servings: number | null; prepTime: string | null;
      totalTime: string | null; difficulty: string; category: string; rating: string | null;
      kcalPerPortion: number | null; source: string | null; lastCooked: string | null;
      cookedCount: number | null; notes: string | null; personalNotes: string | null;
      steps: unknown; imageUrl: string | null; mainPhotoUrl: string | null;
      createdAt: Date | string | null; seasons: string[] | null; tags: string[] | null;
      createdBy: number | null; parentRecipeId: number | null; variantName: string | null;
      sourceDocumentUrl: string | null; isAiGenerated: boolean; imageSource: string | null; tried: boolean; chefPick: boolean;
      ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
      isFavorite: boolean; isOwner: boolean; ownerDisplayName: string | null; ownerAvatarUrl: string | null;
    };

    const rawRows = (rows as unknown as { rows: FullRow[] }).rows ?? (rows as unknown as FullRow[]);
    if (rawRows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const r = rawRows[0];
    res.json({
      id: r.id, title: r.title, servings: r.servings, prepTime: r.prepTime,
      totalTime: r.totalTime, difficulty: r.difficulty, category: r.category,
      rating: r.rating, kcalPerPortion: r.kcalPerPortion, source: r.source,
      lastCooked: r.lastCooked, cookedCount: r.cookedCount, notes: r.notes,
      personalNotes: r.isOwner ? r.personalNotes : null, steps: r.steps,
      imageUrl: r.imageUrl, mainPhotoUrl: r.mainPhotoUrl ?? null,
      createdAt: r.createdAt, seasons: r.seasons ?? [], tags: r.tags ?? [],
      createdBy: r.createdBy, parentRecipeId: r.parentRecipeId, variantName: r.variantName,
      sourceDocumentUrl: r.sourceDocumentUrl, isAiGenerated: r.isAiGenerated ?? false,
      imageSource: r.imageSource ?? null, tried: r.tried ?? false, chefPick: r.chefPick ?? false,
      ingredients: r.ingredients,
      isFavorite: r.isFavorite, isOwner: r.isOwner,
      hasSteps: Array.isArray(r.steps) ? (r.steps as unknown[]).length > 0 : false,
      owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
        ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipe");
    res.status(500).json({ error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes
// ---------------------------------------------------------------------------

router.post("/recipes", authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    const parsed = z.array(recipeBodySchema).parse(items);

    const created = [];
    for (const data of parsed) {
      const { ingredients, ...recipeData } = data;
      const effectiveImageUrl = recipeData.imageUrl ?? recipeData.extractedImageUrl ?? null;
      const [recipe] = await db.insert(recipesTable).values({
        title: recipeData.title,
        servings: recipeData.servings ?? null,
        prepTime: recipeData.prepTime ?? null,
        totalTime: recipeData.totalTime ?? null,
        difficulty: recipeData.difficulty,
        category: recipeData.category,
        rating: recipeData.rating ?? null,
        kcalPerPortion: recipeData.kcalPerPortion ?? null,
        source: recipeData.source ?? null,
        lastCooked: recipeData.lastCooked ?? null,
        cookedCount: recipeData.cookedCount ?? 0,
        notes: recipeData.notes ?? null,
        personalNotes: recipeData.personalNotes ?? null,
        steps: recipeData.steps,
        imageUrl: effectiveImageUrl,
        imageSource: recipeData.imageSource ?? null,
        seasons: recipeData.seasons ?? [],
        createdBy: req.authUser!.id,
        parentRecipeId: recipeData.parentRecipeId ?? null,
        variantName: recipeData.variantName ?? null,
        sourceDocumentUrl: recipeData.sourceDocumentUrl ?? null,
      }).returning();

      if (ingredients.length > 0) {
        await db.insert(recipeIngredientsTable).values(
          ingredients.map((ing) => ({
            recipeId: recipe.id,
            amount: ing.amount || "",
            unit: ing.unit || "",
            name: ing.name,
            note: ing.note ?? null,
          }))
        );
      }

      if (effectiveImageUrl) {
        const photoSource = recipeData.imageSource === "ai" ? "ai_generated" as const : recipeData.imageSource === "web" ? "url_import" as const : effectiveImageUrl.startsWith("/api/uploads/") ? "upload" as const : "imported" as const;
        await registerPhotoForRecipe(effectiveImageUrl, recipe.id, {
          source: photoSource,
          uploadedBy: req.authUser!.id,
          setAsMain: true,
          syncRecipeImageUrl: false,
        });
      }

      const recipeIngredients = await db
        .select()
        .from(recipeIngredientsTable)
        .where(eq(recipeIngredientsTable.recipeId, recipe.id));

      generateTagsForRecipe({
        title: recipe.title,
        category: recipe.category,
        ingredients: recipeIngredients,
        seasons: recipe.seasons,
        steps: recipeData.steps,
        notes: recipe.notes,
      }).then((tags) => {
        if (tags.length > 0) {
          db.update(recipesTable)
            .set({ tags })
            .where(eq(recipesTable.id, recipe.id))
            .catch(() => {});
        }
      }).catch(() => {});

      created.push({
        ...recipe,
        ingredients: recipeIngredients,
        isOwner: true,
        isFavorite: false,
        owner: null,
      });

      setImmediate(() => {
        generateTagsForRecipe({
          title: recipe.title,
          category: recipe.category,
          ingredients: recipeIngredients,
          seasons: recipe.seasons,
          steps: recipeData.steps,
          notes: recipe.notes,
        }).then((tags) => {
          if (tags.length > 0) {
            db.update(recipesTable)
              .set({ tags })
              .where(eq(recipesTable.id, recipe.id))
              .catch(() => {});
          }
        }).catch(() => {});
      });

      // Non-blocking: auto-extract recipe photo from PDF if recipe has no image
      if (recipeData.sourceDocumentUrl && !effectiveImageUrl) {
        const recipeId = recipe.id;
        const srcDocUrl = recipeData.sourceDocumentUrl;
        setImmediate(async () => {
          try {
            const { extractRecipePhoto } = await import("../../utils/extractRecipePhoto");
            const { ObjectStorageService } = await import("../../lib/objectStorage");
            const photoBuffer = await extractRecipePhoto(srcDocUrl);
            if (photoBuffer) {
              const storageSvc = new ObjectStorageService();
              const imgPath = await storageSvc.uploadBuffer(photoBuffer, "image/webp", "recipe-images");
              const imageUrl = `/api/storage${imgPath}`;
              await db.update(recipesTable)
                .set({ imageUrl, isAiGenerated: false, imageSource: "original" })
                .where(eq(recipesTable.id, recipeId));
              await syncMainPhotoLink(recipeId, imageUrl, null, "original");
              invalidateRecipeListCache();
            }
          } catch (photoErr) {
            console.error(`Auto photo extraction failed for recipe ${recipeId}:`, photoErr);
          }
        });
      }
    }

    // Embedding asynchron erzeugen (fire-and-forget, Nutzer wartet nicht)
    setImmediate(() => {
      upsertEmbeddingForRecipe(recipe.id).catch(() => {});
    });

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to create recipe" });
  }
});

// ---------------------------------------------------------------------------
// PUT /recipes/:id
// ---------------------------------------------------------------------------

router.put("/recipes/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [existing] = await db.select().from(recipesTable).where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    if (existing.createdBy != null && existing.createdBy !== req.authUser!.id) {
      res.status(403).json({ error: "forbidden", message: "Du kannst nur deine eigenen Rezepte bearbeiten" });
      return;
    }

    const data = recipeBodySchema.parse(req.body);
    const { ingredients, ...recipeData } = data;

    const [updated] = await db
      .update(recipesTable)
      .set({
        title: recipeData.title,
        servings: recipeData.servings ?? null,
        prepTime: recipeData.prepTime ?? null,
        totalTime: recipeData.totalTime ?? null,
        difficulty: recipeData.difficulty,
        category: recipeData.category,
        rating: recipeData.rating ?? null,
        kcalPerPortion: recipeData.kcalPerPortion ?? null,
        source: recipeData.source ?? null,
        lastCooked: recipeData.lastCooked ?? null,
        cookedCount: recipeData.cookedCount ?? 0,
        notes: recipeData.notes ?? null,
        personalNotes: recipeData.personalNotes ?? null,
        steps: recipeData.steps,
        imageUrl: recipeData.imageUrl ?? null,
        seasons: recipeData.seasons ?? [],
        parentRecipeId: recipeData.parentRecipeId ?? null,
        variantName: recipeData.variantName ?? null,
      })
      .where(eq(recipesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    if (recipeData.imageUrl) {
      const updatePhotoSource = recipeData.imageSource === "ai" ? "ai_generated" as const : recipeData.imageSource === "web" ? "url_import" as const : recipeData.imageUrl.startsWith("/api/uploads/") ? "upload" as const : "imported" as const;
      await registerPhotoForRecipe(recipeData.imageUrl, id, {
        source: updatePhotoSource,
        uploadedBy: req.authUser!.id,
        setAsMain: true,
        syncRecipeImageUrl: false,
      });
    } else {
      await syncMainPhotoLink(id, recipeData.imageUrl, req.authUser!.id, undefined);
    }

    await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, id));
    if (ingredients.length > 0) {
      await db.insert(recipeIngredientsTable).values(
        ingredients.map((ing) => ({
          recipeId: id,
          amount: ing.amount || "",
          unit: ing.unit || "",
          name: ing.name,
          note: ing.note ?? null,
        }))
      );
    }

    const updatedIngredients = await db
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, id));

    res.json({ ...updated, ingredients: updatedIngredients, isOwner: true, isFavorite: false, owner: null });

    // Embedding asynchron aktualisieren (fire-and-forget)
    setImmediate(() => {
      upsertEmbeddingForRecipe(id).catch(() => {});
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to update recipe" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /recipes/:id
// ---------------------------------------------------------------------------

router.patch("/recipes/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [existing] = await db.select().from(recipesTable).where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const userIsAdmin = isAdmin(req.authUser!.email);
    const isOnlyChefPickUpdate = req.body.chefPick !== undefined &&
      Object.keys(req.body).filter((k) => k !== "chefPick").length === 0;

    if (existing.createdBy != null && existing.createdBy !== req.authUser!.id && !(userIsAdmin && isOnlyChefPickUpdate)) {
      res.status(403).json({ error: "forbidden", message: "Du kannst nur deine eigenen Rezepte bearbeiten" });
      return;
    }

    const patchSchema = z.object({
      category: z.string().min(1).optional(),
      difficulty: z.enum(["simpel", "normal", "schwer"]).optional(),
      rating: z.string().nullable().optional(),
      lastCooked: z.string().nullable().optional(),
      cookedCount: z.number().int().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
      personalNotes: z.string().nullable().optional(),
      tried: z.boolean().optional(),
      chefPick: z.boolean().optional(),
    });

    if (req.body.chefPick !== undefined && !userIsAdmin) {
      res.status(403).json({ error: "forbidden", message: "Nur Admins können Lucias Tipp setzen" });
      return;
    }

    const data = patchSchema.parse(req.body);

    const [updated] = await db
      .update(recipesTable)
      .set(data)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const ingredients = await db
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, id));

    res.json({ ...updated, ingredients, isOwner: true, isFavorite: false, owner: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to patch recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to patch recipe" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes/:id  (Soft-Delete)
// ---------------------------------------------------------------------------

router.delete("/recipes/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [existing] = await db.select().from(recipesTable).where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    if (existing.createdBy != null && existing.createdBy !== req.authUser!.id) {
      res.status(403).json({ error: "forbidden", message: "Du kannst nur deine eigenen Rezepte löschen" });
      return;
    }

    await db
      .update(recipesTable)
      .set({ deletedAt: new Date() })
      .where(eq(recipesTable.id, id));

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to delete recipe" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/restore
// ---------------------------------------------------------------------------

router.post("/recipes/:id/restore", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können Rezepte wiederherstellen" });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [existing] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
    if (!existing || existing.deletedAt == null) {
      res.status(404).json({ error: "not_found", message: "Recipe not found in trash" });
      return;
    }

    await db
      .update(recipesTable)
      .set({ deletedAt: null })
      .where(eq(recipesTable.id, id));

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to restore recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to restore recipe" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes/:id/permanent
// ---------------------------------------------------------------------------

router.delete("/recipes/:id/permanent", authMiddleware, async (req, res) => {
  if (!isAdmin(req.authUser!.email)) {
    res.status(403).json({ error: "forbidden", message: "Nur Admins können Rezepte endgültig löschen" });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [existing] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const sourceDocumentUrl = existing.sourceDocumentUrl;

    const [deleted] = await db
      .delete(recipesTable)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    if (sourceDocumentUrl) {
      try {
        const [activeRef] = await db
          .select({ id: recipesTable.id })
          .from(recipesTable)
          .where(and(eq(recipesTable.sourceDocumentUrl, sourceDocumentUrl), isNull(recipesTable.deletedAt)))
          .limit(1);

        if (!activeRef) {
          const { ObjectStorageService } = await import("../../lib/objectStorage");
          const storageService = new ObjectStorageService();
          const storagePath = sourceDocumentUrl.replace(/^\/api\/storage/, "");
          await storageService.deleteObject(storagePath);
        }
      } catch {
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to permanently delete recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to permanently delete recipe" });
  }
});

// ---------------------------------------------------------------------------
// POST /recipes/:id/favorite
// ---------------------------------------------------------------------------

router.post("/recipes/:id/favorite", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (isNaN(recipeId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const userId = req.authUser!.id;

    const [recipe] = await db.select().from(recipesTable).where(and(eq(recipesTable.id, recipeId), isNull(recipesTable.deletedAt)));
    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    await db.insert(recipeFavoritesTable)
      .values({ userId, recipeId })
      .onConflictDoNothing();

    res.json({ success: true, recipeId, isFavorite: true });
  } catch (err) {
    req.log.error({ err }, "Failed to add favorite");
    res.status(500).json({ error: "internal_error", message: "Failed to add favorite" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /recipes/:id/favorite
// ---------------------------------------------------------------------------

router.delete("/recipes/:id/favorite", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (isNaN(recipeId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const userId = req.authUser!.id;

    await db.delete(recipeFavoritesTable)
      .where(and(eq(recipeFavoritesTable.userId, userId), eq(recipeFavoritesTable.recipeId, recipeId)));

    res.json({ success: true, recipeId, isFavorite: false });
  } catch (err) {
    req.log.error({ err }, "Failed to remove favorite");
    res.status(500).json({ error: "internal_error", message: "Failed to remove favorite" });
  }
});

export default router;
