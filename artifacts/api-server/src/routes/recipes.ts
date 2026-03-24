import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable, recipePhotosTable, recipeFavoritesTable, usersTable } from "@workspace/db/schema";
import { eq, inArray, sql, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { seedRecipes } from "../db/seedRecipes";
import { singleImageUploadMiddleware, UPLOADS_DIR } from "../lib/imageUpload";
import { authMiddleware } from "./auth";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const ingredientSchema = z.object({
  amount: z.string().default(""),
  unit: z.string().default(""),
  name: z.string().min(1),
  note: z.string().optional().nullable(),
});

const VALID_SEASONS = ["spring", "summer", "autumn", "winter"] as const;

const recipeBodySchema = z.object({
  title: z.string().min(1),
  servings: z.coerce.number().int().positive().optional().nullable(),
  prepTime: z.string().optional().nullable(),
  totalTime: z.string().optional().nullable(),
  difficulty: z.enum(["simpel", "normal", "schwer"]).default("normal"),
  category: z.string().min(1),
  rating: z.string().optional().nullable(),
  kcalPerPortion: z.coerce.number().int().positive().optional().nullable(),
  source: z.string().optional().nullable(),
  lastCooked: z.string().optional().nullable(),
  cookedCount: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
  personalNotes: z.string().optional().nullable(),
  steps: z.array(z.string()).default([]),
  ingredients: z.array(ingredientSchema).default([]),
  imageUrl: z.string().optional().nullable(),
  seasons: z.array(z.enum(VALID_SEASONS)).default([]),
  parentRecipeId: z.coerce.number().int().positive().optional().nullable(),
  variantName: z.string().optional().nullable(),
});

async function getRecipesWithIngredients(currentUserId?: number, filter?: string) {
  let recipes = await db.select().from(recipesTable).orderBy(recipesTable.id);
  const ingredients = await db.select().from(recipeIngredientsTable).orderBy(recipeIngredientsTable.id);

  let favorites: Set<number> = new Set();
  if (currentUserId) {
    const favRows = await db.select({ recipeId: recipeFavoritesTable.recipeId })
      .from(recipeFavoritesTable)
      .where(eq(recipeFavoritesTable.userId, currentUserId));
    favorites = new Set(favRows.map((f) => f.recipeId));
  }

  const ownerIds = [...new Set(recipes.map((r) => r.createdBy).filter((id): id is number => id != null))];
  const owners: Map<number, { displayName: string; avatarUrl: string | null }> = new Map();
  if (ownerIds.length > 0) {
    const ownerRows = await db.select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(inArray(usersTable.id, ownerIds));
    for (const o of ownerRows) {
      owners.set(o.id, { displayName: o.displayName, avatarUrl: o.avatarUrl });
    }
  }

  let result = recipes.map((r) => {
    const isOwner = r.createdBy == null || (currentUserId != null && r.createdBy === currentUserId);
    const owner = r.createdBy != null ? owners.get(r.createdBy) ?? null : null;
    return {
      ...r,
      ingredients: ingredients.filter((i) => i.recipeId === r.id),
      isOwner,
      isFavorite: favorites.has(r.id),
      owner,
    };
  });

  if (filter === "mine" && currentUserId != null) {
    result = result.filter((r) => r.createdBy === currentUserId || r.createdBy == null);
  } else if (filter === "favorites" && currentUserId != null) {
    result = result.filter((r) => favorites.has(r.id));
  }

  return result;
}

router.get("/recipes/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const currentUserId = req.authUser?.id;
    const filter = req.query.filter as string | undefined;

    if (!q) {
      const recipes = await getRecipesWithIngredients(currentUserId, filter);
      return res.json(recipes);
    }

    const pattern = `%${q}%`;

    const matchingRecipeIds = await db
      .selectDistinct({ id: recipesTable.id })
      .from(recipesTable)
      .leftJoin(recipeIngredientsTable, eq(recipeIngredientsTable.recipeId, recipesTable.id))
      .where(
        sql`
          ${recipesTable.title} ILIKE ${pattern}
          OR COALESCE(${recipesTable.notes}, '') ILIKE ${pattern}
          OR COALESCE(${recipesTable.category}, '') ILIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM ${recipeIngredientsTable} ri2
            WHERE ri2.recipe_id = ${recipesTable.id}
            AND ri2.name ILIKE ${pattern}
          )
          OR EXISTS (
            SELECT 1 FROM unnest(ARRAY(SELECT jsonb_array_elements_text(${recipesTable.steps}))) AS step
            WHERE step ILIKE ${pattern}
          )
        `
      );

    if (matchingRecipeIds.length === 0) {
      return res.json([]);
    }

    const ids = matchingRecipeIds.map((r) => r.id);
    const recipes = await db.select().from(recipesTable).where(inArray(recipesTable.id, ids)).orderBy(recipesTable.id);
    const ingredients = await db.select().from(recipeIngredientsTable).where(inArray(recipeIngredientsTable.recipeId, ids)).orderBy(recipeIngredientsTable.id);

    let favorites: Set<number> = new Set();
    if (currentUserId) {
      const favRows = await db.select({ recipeId: recipeFavoritesTable.recipeId })
        .from(recipeFavoritesTable)
        .where(eq(recipeFavoritesTable.userId, currentUserId));
      favorites = new Set(favRows.map((f) => f.recipeId));
    }

    const ownerIds = [...new Set(recipes.map((r) => r.createdBy).filter((id): id is number => id != null))];
    const owners: Map<number, { displayName: string; avatarUrl: string | null }> = new Map();
    if (ownerIds.length > 0) {
      const ownerRows = await db.select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, ownerIds));
      for (const o of ownerRows) {
        owners.set(o.id, { displayName: o.displayName, avatarUrl: o.avatarUrl });
      }
    }

    let result = recipes.map((r) => {
      const isOwner = r.createdBy == null || (currentUserId != null && r.createdBy === currentUserId);
      const owner = r.createdBy != null ? owners.get(r.createdBy) ?? null : null;
      return {
        ...r,
        ingredients: ingredients.filter((i) => i.recipeId === r.id),
        isOwner,
        isFavorite: favorites.has(r.id),
        owner,
      };
    });

    if (filter === "mine" && currentUserId != null) {
      result = result.filter((r) => r.createdBy === currentUserId || r.createdBy == null);
    } else if (filter === "favorites" && currentUserId != null) {
      result = result.filter((r) => favorites.has(r.id));
    }

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to search recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to search recipes" });
  }
});

router.get("/recipes", async (req, res) => {
  try {
    const currentUserId = req.authUser?.id;
    const filter = req.query.filter as string | undefined;
    const recipes = await getRecipesWithIngredients(currentUserId, filter);
    res.json(recipes);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch recipes" });
  }
});

router.post("/recipes", authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    const parsed = z.array(recipeBodySchema).parse(items);

    const created = [];
    for (const data of parsed) {
      const { ingredients, ...recipeData } = data;
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
        imageUrl: recipeData.imageUrl ?? null,
        seasons: recipeData.seasons ?? [],
        createdBy: req.authUser!.id,
        parentRecipeId: recipeData.parentRecipeId ?? null,
        variantName: recipeData.variantName ?? null,
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

      const recipeIngredients = await db
        .select()
        .from(recipeIngredientsTable)
        .where(eq(recipeIngredientsTable.recipeId, recipe.id));

      created.push({
        ...recipe,
        ingredients: recipeIngredients,
        isOwner: true,
        isFavorite: false,
        owner: null,
      });
    }

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

router.put("/recipes/:id", authMiddleware, async (req, res) => {
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
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to update recipe" });
  }
});

router.patch("/recipes/:id", authMiddleware, async (req, res) => {
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

    if (existing.createdBy != null && existing.createdBy !== req.authUser!.id) {
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
    });

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

router.delete("/recipes/:id", authMiddleware, async (req, res) => {
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

    if (existing.createdBy != null && existing.createdBy !== req.authUser!.id) {
      res.status(403).json({ error: "forbidden", message: "Du kannst nur deine eigenen Rezepte löschen" });
      return;
    }

    const [deleted] = await db
      .delete(recipesTable)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to delete recipe" });
  }
});

router.post("/recipes/:id/favorite", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (isNaN(recipeId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const userId = req.authUser!.id;

    const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, recipeId));
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

router.delete("/recipes", async (req, res) => {
  try {
    await db.delete(recipeIngredientsTable);
    await db.delete(recipesTable);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete all recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to delete all recipes" });
  }
});

router.get("/ingredients", async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ name: recipeIngredientsTable.name, nameLower: sql<string>`lower(${recipeIngredientsTable.name})` })
      .from(recipeIngredientsTable)
      .orderBy(sql`lower(${recipeIngredientsTable.name})`);
    const seenLower = new Set<string>();
    const ingredients = rows
      .map((r) => r.name.trim())
      .filter((name) => {
        if (name.length === 0 || /^[,;.]+$/.test(name)) return false;
        const lower = name.toLowerCase();
        if (seenLower.has(lower)) return false;
        seenLower.add(lower);
        return true;
      });
    res.json({ ingredients });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch ingredients");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch ingredients" });
  }
});

function parseTotalMinutes(totalTime: string | null): number {
  if (!totalTime) return Infinity;
  const match = totalTime.match(/(\d+)/g);
  if (!match) return Infinity;
  const nums = match.map(Number);
  if (nums.length === 1) return nums[0];
  return nums[0] * 60 + (nums[1] ?? 0);
}

const suggestBodySchema = z.object({
  ingredients: z.array(z.string()).default([]),
  moods: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
});

router.post("/recipes/suggest", async (req, res) => {
  try {
    const { ingredients, moods, exclusions } = suggestBodySchema.parse(req.body);
    const allRecipes = await getRecipesWithIngredients(req.authUser?.id);

    const QUICK_MAX_MINUTES = 30;
    const MEDIUM_MAX_MINUTES = 60;

    const MOOD_CATEGORIES: Record<string, string> = {
      pasta: "Pasta",
      fisch: "Fisch",
      vegetarisch: "Vegetarisch",
      geflügel: "Geflügel",
      fleisch: "Fleisch",
    };

    const normalizeIngredient = (name: string) => name.toLowerCase().trim();
    const userIngredients = ingredients.map(normalizeIngredient);
    const userMoods = moods.map((m) => m.toLowerCase().trim());
    const userExclusions = exclusions.map((e) => e.toLowerCase().trim());

    const scoredRecipes = allRecipes
      .map((recipe) => {
        const recipeIngredients = recipe.ingredients.map((i) => normalizeIngredient(i.name));
        const category = recipe.category.toLowerCase();
        const totalMins = parseTotalMinutes(recipe.totalTime ?? null);

        let score = 0;
        let ingredientMatches = 0;

        for (const userIng of userIngredients) {
          for (const recipeIng of recipeIngredients) {
            if (recipeIng.includes(userIng) || userIng.includes(recipeIng)) {
              ingredientMatches++;
              break;
            }
          }
        }
        score += ingredientMatches * 10;

        let moodMatch = false;
        for (const mood of userMoods) {
          if (mood === "schnell" && totalMins <= QUICK_MAX_MINUTES) {
            score += 5;
            moodMatch = true;
          } else if (mood === "mittel" && totalMins <= MEDIUM_MAX_MINUTES) {
            score += 3;
            moodMatch = true;
          } else if (mood === "aufwändig" && totalMins > MEDIUM_MAX_MINUTES) {
            score += 3;
            moodMatch = true;
          } else if (MOOD_CATEGORIES[mood] && MOOD_CATEGORIES[mood].toLowerCase() === category) {
            score += 5;
            moodMatch = true;
          }
        }

        for (const exclusion of userExclusions) {
          if (MOOD_CATEGORIES[exclusion] && MOOD_CATEGORIES[exclusion].toLowerCase() === category) {
            return null;
          }
          if (exclusion === "schnell" && totalMins <= QUICK_MAX_MINUTES) return null;
          if (exclusion === "mittel" && totalMins > QUICK_MAX_MINUTES && totalMins <= MEDIUM_MAX_MINUTES) return null;
          if (exclusion === "aufwändig" && totalMins > MEDIUM_MAX_MINUTES) return null;
        }

        const hasOnlyExclusions = ingredients.length === 0 && moods.length === 0 && exclusions.length > 0;
        if (hasOnlyExclusions) {
          return { recipe, score: 1, ingredientMatches: 0 };
        }

        if (ingredients.length === 0 && moods.length === 0) return null;
        if (score === 0) {
          if (moods.length > 0 && moodMatch) {
          } else if (ingredients.length > 0) {
            return null;
          }
        }

        return { recipe, score, ingredientMatches };
      })
      .filter(Boolean) as { recipe: (typeof allRecipes)[number]; score: number; ingredientMatches: number }[];

    scoredRecipes.sort((a, b) => b.score - a.score);

    const results = scoredRecipes.slice(0, 20).map(({ recipe, score, ingredientMatches }) => ({
      ...recipe,
      matchScore: score,
      ingredientMatches,
    }));

    res.json({ recipes: results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to suggest recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to suggest recipes" });
  }
});

router.get("/recipes/:id/photos", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }
    const photos = await db
      .select()
      .from(recipePhotosTable)
      .where(eq(recipePhotosTable.recipeId, id))
      .orderBy(desc(recipePhotosTable.createdAt));
    res.json(photos);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipe photos");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch recipe photos" });
  }
});

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
    const [photo] = await db
      .insert(recipePhotosTable)
      .values({ recipeId: id, imageUrl })
      .returning();
    res.status(201).json(photo);
  } catch (err) {
    req.log.error({ err }, "Failed to upload recipe photo");
    res.status(500).json({ error: "internal_error", message: "Failed to upload recipe photo" });
  }
});

router.delete("/recipes/:id/photos/:photoId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (isNaN(id) || isNaN(photoId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(recipePhotosTable)
      .where(and(eq(recipePhotosTable.id, photoId), eq(recipePhotosTable.recipeId, id)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Photo not found" });
      return;
    }
    const filename = deleted.imageUrl.split("/").pop();
    if (filename) {
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.unlink(filepath, () => {});
    }
    res.json({ success: true, id: photoId });
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe photo");
    res.status(500).json({ error: "internal_error", message: "Failed to delete recipe photo" });
  }
});

export default router;
