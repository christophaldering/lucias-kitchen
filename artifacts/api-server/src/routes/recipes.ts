import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable, recipePhotosTable, recipeFavoritesTable, usersTable, groupMembersTable, groupsTable, photosTable, recipePhotoLinksTable } from "@workspace/db/schema";
import { eq, inArray, sql, desc, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { seedRecipes } from "../db/seedRecipes";
import { singleImageUploadMiddleware, UPLOADS_DIR } from "../lib/imageUpload";
import { authMiddleware } from "./auth";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import { generateTagsForRecipe } from "../lib/generateRecipeTags";
import { openai } from "@workspace/integrations-openai-ai-server";

const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

const recipeListCache = new Map<string, { etag: string; body: string }>();

function recipeListCacheKey(userId?: number, filter?: string) {
  return `${userId ?? "anon"}:${filter ?? "all"}`;
}

export function invalidateRecipeListCache() {
  recipeListCache.clear();
}

export async function warmupRecipeCache(userId?: number) {
  try {
    const cacheKey = recipeListCacheKey(userId, undefined);
    const recipes = await getRecipesWithIngredients(userId, undefined);
    const body = JSON.stringify(recipes);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 24)}"`;
    recipeListCache.set(cacheKey, { etag, body });
  } catch {
  }
}

const router: IRouter = Router();

router.use((req, _res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.path.startsWith("/recipes")) {
    invalidateRecipeListCache();
  }
  next();
});

const ingredientSchema = z.object({
  amount: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
  unit: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
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
  steps: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((s) => s != null && String(s).trim().length > 0) : []),
    z.array(z.string()).default([])
  ),
  ingredients: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((ing) => ing != null && ing.name != null && String(ing.name).trim().length > 0) : []),
    z.array(ingredientSchema).default([])
  ),
  imageUrl: z.string().optional().nullable(),
  extractedImageUrl: z.string().optional().nullable(),
  imageSource: z.enum(["ai", "web"]).optional().nullable(),
  seasons: z.array(z.enum(VALID_SEASONS)).default([]),
  parentRecipeId: z.coerce.number().int().positive().optional().nullable(),
  variantName: z.string().optional().nullable(),
  sourceDocumentUrl: z.string().optional().nullable(),
});

async function getRecipesWithIngredients(currentUserId?: number, filter?: string) {
  const favExpr = currentUserId != null
    ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
    : sql`false`;

  const isOwnerExpr = currentUserId != null
    ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
    : sql`(r.created_by IS NULL)`;

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.title,
      r.servings,
      r.prep_time       AS "prepTime",
      r.total_time      AS "totalTime",
      r.difficulty,
      r.category,
      r.rating,
      r.kcal_per_portion AS "kcalPerPortion",
      r.source,
      r.last_cooked     AS "lastCooked",
      r.cooked_count    AS "cookedCount",
      r.notes,
      r.personal_notes  AS "personalNotes",
      r.steps,
      r.image_url       AS "imageUrl",
      r.created_at      AS "createdAt",
      r.seasons,
      r.tags,
      r.created_by      AS "createdBy",
      r.parent_recipe_id AS "parentRecipeId",
      r.variant_name    AS "variantName",
      r.source_document_url AS "sourceDocumentUrl",
      r.is_ai_generated     AS "isAiGenerated",
      r.image_source        AS "imageSource",
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
    WHERE r.deleted_at IS NULL
    GROUP BY r.id, u.display_name, u.avatar_url
    ORDER BY r.id
  `);

  type Row = {
    id: number;
    title: string;
    servings: number | null;
    prepTime: string | null;
    totalTime: string | null;
    difficulty: string;
    category: string;
    rating: string | null;
    kcalPerPortion: number | null;
    source: string | null;
    lastCooked: string | null;
    cookedCount: number | null;
    notes: string | null;
    personalNotes: string | null;
    steps: unknown;
    imageUrl: string | null;
    mainPhotoUrl: string | null;
    createdAt: Date | string | null;
    seasons: string[] | null;
    tags: string[] | null;
    createdBy: number | null;
    parentRecipeId: number | null;
    variantName: string | null;
    sourceDocumentUrl: string | null;
    isAiGenerated: boolean;
    imageSource: string | null;
    ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
    isFavorite: boolean;
    isOwner: boolean;
    ownerDisplayName: string | null;
    ownerAvatarUrl: string | null;
  };

  const rawRows = (rows as unknown as { rows: Row[] }).rows ?? (rows as unknown as Row[]);

  let result = rawRows.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    prepTime: r.prepTime,
    totalTime: r.totalTime,
    difficulty: r.difficulty,
    category: r.category,
    rating: r.rating,
    kcalPerPortion: r.kcalPerPortion,
    source: r.source,
    lastCooked: r.lastCooked,
    cookedCount: r.cookedCount,
    notes: r.notes,
    personalNotes: r.personalNotes,
    steps: r.steps,
    imageUrl: r.imageUrl,
    mainPhotoUrl: r.mainPhotoUrl ?? null,
    createdAt: r.createdAt,
    seasons: r.seasons ?? [],
    tags: r.tags ?? [],
    createdBy: r.createdBy,
    parentRecipeId: r.parentRecipeId,
    variantName: r.variantName,
    sourceDocumentUrl: r.sourceDocumentUrl,
    isAiGenerated: r.isAiGenerated ?? false,
    imageSource: r.imageSource ?? null,
    ingredients: r.ingredients,
    isFavorite: r.isFavorite,
    isOwner: r.isOwner,
    owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
      ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
      : null,
  }));

  if (filter === "mine" && currentUserId != null) {
    result = result.filter((r) => r.createdBy === currentUserId || r.createdBy == null);
  } else if (filter === "favorites" && currentUserId != null) {
    result = result.filter((r) => r.isFavorite);
  }

  return result;
}

router.get("/recipes/count", async (req, res) => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));
    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to count recipes");
    res.status(500).json({ error: "internal_error" });
  }
});

const AI_SEARCH_SYSTEM_PROMPT = `Du bist ein Rezept-Suchassistent. Deine Aufgabe ist es, eine natürlichsprachliche Anfrage zu analysieren und daraus strukturierte Filterkriterien zu extrahieren.

Gib IMMER reines JSON zurück (kein Markdown), folgendes Format:
{
  "ingredients": ["Zutat1", "Zutat2"],
  "exclusions": ["ausgeschlosseneZutat1"],
  "diet": "vegetarisch" | "vegan" | "fleisch" | null,
  "maxMinutes": 30 | 60 | null,
  "mood": "schnell" | "festlich" | "leicht" | "herzhaft" | null,
  "cuisine": "italienisch" | "deutsch" | "asiatisch" | null,
  "keywords": ["keyword1", "keyword2"],
  "summary": "Kurze deutsche Zusammenfassung was gesucht wird"
}

Extrahiere alle relevanten Felder aus der Anfrage. keywords sind zusätzliche Begriffe die im Titel oder in Notizen vorkommen könnten. summary ist eine sehr kurze Beschreibung der Suche (max. 8 Wörter) für die Ergebnisanzeige.`;

router.post("/recipes/ai-search", async (req, res) => {
  try {
    const schema = z.object({
      query: z.string().min(1).max(500),
      filter: z.string().optional(),
    });

    const { query, filter } = schema.parse(req.body);
    const currentUserId = req.authUser?.id;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: AI_SEARCH_SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
    });

    let rawJson = aiResponse.choices[0]?.message?.content ?? "{}";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let criteria: {
      ingredients: string[];
      exclusions: string[];
      diet: string | null;
      maxMinutes: number | null;
      mood: string | null;
      cuisine: string | null;
      keywords: string[];
      summary: string;
    };

    try {
      criteria = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse AI search response");
      res.status(502).json({ error: "parse_error", message: "KI-Antwort konnte nicht verarbeitet werden" });
      return;
    }

    const allRecipes = await getRecipesWithIngredients(currentUserId, filter);

    const matchedRecipes = allRecipes.filter((recipe) => {
      const ingNames = (recipe.ingredients as Array<{ name: string }>).map((i) => i.name.toLowerCase());
      const titleLower = recipe.title.toLowerCase();
      const notesLower = (recipe.notes ?? "").toLowerCase();
      const categoryLower = recipe.category.toLowerCase();

      if (criteria.exclusions && criteria.exclusions.length > 0) {
        const hasExcluded = criteria.exclusions.some((excl) => {
          const exclLower = excl.toLowerCase();
          return (
            ingNames.some((n) => n.includes(exclLower)) ||
            titleLower.includes(exclLower) ||
            categoryLower.includes(exclLower)
          );
        });
        if (hasExcluded) return false;
      }

      if (criteria.diet) {
        const dietLower = criteria.diet.toLowerCase();
        if (dietLower === "vegetarisch" || dietLower === "vegan") {
          const meatKeywords = ["fleisch", "schwein", "rind", "lamm", "hähnchen", "huhn", "pute", "wurst", "speck", "schinken", "steak", "hackfleisch", "filet"];
          const hasMeat = meatKeywords.some((kw) =>
            ingNames.some((n) => n.includes(kw)) || titleLower.includes(kw) || categoryLower.includes(kw)
          );
          if (hasMeat) return false;
        } else if (dietLower === "fleisch") {
          const meatCategories = ["fleisch", "geflügel", "fisch"];
          if (!meatCategories.some((mc) => categoryLower.includes(mc))) {
            const meatKeywords = ["hähnchen", "huhn", "schwein", "rind", "lamm", "steak", "hackfleisch", "wurst", "speck", "schinken"];
            const hasMeat = meatKeywords.some((kw) =>
              ingNames.some((n) => n.includes(kw)) || titleLower.includes(kw)
            );
            if (!hasMeat) return false;
          }
        }
      }

      if (criteria.maxMinutes) {
        if (recipe.totalTime) {
          const match = recipe.totalTime.match(/(\d+)/g);
          if (match) {
            const nums = match.map(Number);
            const minutes = nums.length === 1 ? nums[0] : nums[0] * 60 + (nums[1] ?? 0);
            if (minutes > criteria.maxMinutes) return false;
          }
        } else if (recipe.prepTime) {
          const match = recipe.prepTime.match(/(\d+)/g);
          if (match) {
            const nums = match.map(Number);
            const minutes = nums.length === 1 ? nums[0] : nums[0] * 60 + (nums[1] ?? 0);
            if (minutes > criteria.maxMinutes) return false;
          }
        }
      }

      const searchTerms = [
        ...(criteria.ingredients ?? []),
        ...(criteria.keywords ?? []),
      ];

      if (criteria.cuisine) searchTerms.push(criteria.cuisine);
      if (criteria.mood) searchTerms.push(criteria.mood);

      if (searchTerms.length === 0) return true;

      return searchTerms.some((term) => {
        const termLower = term.toLowerCase();
        return (
          titleLower.includes(termLower) ||
          notesLower.includes(termLower) ||
          categoryLower.includes(termLower) ||
          ingNames.some((n) => n.includes(termLower))
        );
      });
    });

    const ingredientCount = (criteria.ingredients ?? []).length;
    const exclusionCount = (criteria.exclusions ?? []).length;
    const parts: string[] = [];
    if (ingredientCount > 0) parts.push(`mit ${criteria.ingredients.slice(0, 2).join(" & ")}`);
    if (exclusionCount > 0) parts.push(`ohne ${criteria.exclusions.slice(0, 2).join(" & ")}`);
    if (criteria.maxMinutes) parts.push(`unter ${criteria.maxMinutes} Min.`);
    if (criteria.diet && criteria.diet !== "fleisch") parts.push(criteria.diet);

    const resultSummary = matchedRecipes.length === 0
      ? "Keine passenden Rezepte gefunden"
      : `${matchedRecipes.length} ${matchedRecipes.length === 1 ? "Rezept" : "Rezepte"}${parts.length > 0 ? " " + parts.join(", ") : ""} gefunden`;

    res.json({
      recipes: matchedRecipes,
      summary: resultSummary,
      criteria,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to process AI recipe search");
    res.status(500).json({ error: "internal_error", message: "KI-Suche fehlgeschlagen" });
  }
});

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
        and(
          isNull(recipesTable.deletedAt),
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
        )
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
            const { ObjectStorageService } = await import("../lib/objectStorage");
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

router.get("/recipes", async (req, res) => {
  try {
    const currentUserId = req.authUser?.id;
    const filter = req.query.filter as string | undefined;
    const cacheKey = recipeListCacheKey(currentUserId, filter);
    const cached = recipeListCache.get(cacheKey);

    if (cached) {
      res.set("ETag", cached.etag);
      res.set("Cache-Control", "private, no-cache");
      if (req.headers["if-none-match"] === cached.etag) {
        res.status(304).end();
        return;
      }
      res.type("json").send(cached.body);
      return;
    }

    const recipes = await getRecipesWithIngredients(currentUserId, filter);
    const body = JSON.stringify(recipes);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 24)}"`;
    recipeListCache.set(cacheKey, { etag, body });
    res.set("ETag", etag);
    res.set("Cache-Control", "private, no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.type("json").send(body);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch recipes" });
  }
});

router.get("/recipes/duplicates", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.authUser!.id;

    const familyGroupRows = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(and(eq(groupMembersTable.userId, currentUserId), eq(groupMembersTable.memberStatus, "joined"), eq(groupsTable.status, "approved")));

    const familyGroupIds = familyGroupRows.map((r) => r.groupId);

    let familyUserIds: number[] = [currentUserId];
    if (familyGroupIds.length > 0) {
      const memberRows = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(and(inArray(groupMembersTable.groupId, familyGroupIds), eq(groupMembersTable.memberStatus, "joined")));
      const memberUserIds = memberRows
        .map((r) => r.userId)
        .filter((id): id is number => id != null);
      familyUserIds = [...new Set([currentUserId, ...memberUserIds])];
    }

    const allRecipes = await db.select().from(recipesTable).where(isNull(recipesTable.deletedAt)).orderBy(recipesTable.id);
    const recipes = allRecipes.filter(
      (r) => r.createdBy == null || familyUserIds.includes(r.createdBy)
    );

    const recipeIds = recipes.map((r) => r.id);
    const ingredients = recipeIds.length > 0
      ? await db.select().from(recipeIngredientsTable)
          .where(inArray(recipeIngredientsTable.recipeId, recipeIds))
          .orderBy(recipeIngredientsTable.id)
      : [];

    const ingByRecipe = new Map<number, string[]>();
    for (const ing of ingredients) {
      const list = ingByRecipe.get(ing.recipeId) ?? [];
      list.push(ing.name.toLowerCase().trim());
      ingByRecipe.set(ing.recipeId, list);
    }

    const groups: { recipes: Array<typeof recipes[0] & { ingredientCount: number; isOwner: boolean }> }[] = [];
    const used = new Set<number>();

    for (let i = 0; i < recipes.length; i++) {
      if (used.has(recipes[i].id)) continue;
      const group: typeof recipes = [recipes[i]];

      for (let j = i + 1; j < recipes.length; j++) {
        if (used.has(recipes[j].id)) continue;
        const a = recipes[i];
        const b = recipes[j];

        const sameTitle = a.title.toLowerCase().trim() === b.title.toLowerCase().trim();

        const sameSource =
          a.source && b.source &&
          a.source.trim().toLowerCase() === b.source.trim().toLowerCase();

        const ingsA = ingByRecipe.get(a.id) ?? [];
        const ingsB = ingByRecipe.get(b.id) ?? [];
        let ingredientSimilar = false;
        if (ingsA.length > 0 && ingsB.length > 0) {
          const setA = new Set(ingsA);
          const setB = new Set(ingsB);
          const intersection = [...setA].filter((x) => setB.has(x)).length;
          const union = new Set([...setA, ...setB]).size;
          const jaccard = union > 0 ? intersection / union : 0;
          ingredientSimilar = jaccard >= 0.8;
        }

        if (sameTitle || sameSource || ingredientSimilar) {
          group.push(b);
          used.add(b.id);
        }
      }

      if (group.length > 1) {
        used.add(recipes[i].id);
        groups.push({
          recipes: group.map((r) => ({
            ...r,
            ingredientCount: (ingByRecipe.get(r.id) ?? []).length,
            isOwner: r.createdBy == null || r.createdBy === currentUserId,
          })),
        });
      }
    }

    res.json({ groups });
  } catch (err) {
    req.log.error({ err }, "Failed to detect duplicates");
    res.status(500).json({ error: "internal_error", message: "Failed to detect duplicates" });
  }
});

async function syncMainPhotoLink(
  recipeId: number,
  imageUrl: string | null | undefined,
  uploadedBy?: number | null,
  source?: "original" | "upload" | "ai" | "cooked" | "web" | null,
) {
  if (!imageUrl) {
    await db
      .delete(recipePhotoLinksTable)
      .where(and(eq(recipePhotoLinksTable.recipeId, recipeId), eq(recipePhotoLinksTable.isMain, true)));
    return;
  }

  let [photo] = await db
    .select()
    .from(photosTable)
    .where(eq(photosTable.imageUrl, imageUrl))
    .limit(1);

  if (!photo) {
    [photo] = await db
      .insert(photosTable)
      .values({ imageUrl, uploadedBy: uploadedBy ?? null, source: source ?? null })
      .returning();
  }

  await db
    .insert(recipePhotoLinksTable)
    .values({ photoId: photo.id, recipeId, sortOrder: -1, isMain: true })
    .onConflictDoUpdate({
      target: [recipePhotoLinksTable.photoId, recipePhotoLinksTable.recipeId],
      set: { isMain: true, sortOrder: -1 },
    });

  await db
    .delete(recipePhotoLinksTable)
    .where(
      and(
        eq(recipePhotoLinksTable.recipeId, recipeId),
        eq(recipePhotoLinksTable.isMain, true),
        sql`${recipePhotoLinksTable.photoId} != ${photo.id}`,
      )
    );
}

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
        const photoSource = recipeData.imageSource === "ai" ? "ai" : recipeData.imageSource === "web" ? "web" : effectiveImageUrl.startsWith("/api/uploads/") ? "upload" : "original";
        await syncMainPhotoLink(recipe.id, effectiveImageUrl, req.authUser!.id, photoSource);
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

    const updatePhotoSource = recipeData.imageSource === "ai" ? "ai" : recipeData.imageSource === "web" ? "web" : recipeData.imageUrl?.startsWith("/api/uploads/") ? "upload" : "original";
    await syncMainPhotoLink(id, recipeData.imageUrl, req.authUser!.id, updatePhotoSource);

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

    const [existing] = await db.select().from(recipesTable).where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)));
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
          const { ObjectStorageService } = await import("../lib/objectStorage");
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
      .innerJoin(recipesTable, and(eq(recipesTable.id, recipeIngredientsTable.recipeId), isNull(recipesTable.deletedAt)))
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

    const [recipe] = await db
      .select({ imageUrl: recipesTable.imageUrl, imageSource: recipesTable.imageSource, isAiGenerated: recipesTable.isAiGenerated })
      .from(recipesTable)
      .where(and(eq(recipesTable.id, id), isNull(recipesTable.deletedAt)))
      .limit(1);

    // Lazy backfill: if the recipe has an AI image but no corresponding photo link entry
    // (e.g. generated before the syncMainPhotoLink call was added), create the entry now.
    // Also covers older recipes where image_source is null but is_ai_generated is true.
    if (recipe?.imageUrl && (recipe.imageSource === "ai" || recipe.isAiGenerated === true)) {
      const [existingLink] = await db
        .select({ id: recipePhotoLinksTable.id })
        .from(recipePhotoLinksTable)
        .innerJoin(photosTable, eq(photosTable.id, recipePhotoLinksTable.photoId))
        .where(and(eq(recipePhotoLinksTable.recipeId, id), eq(photosTable.imageUrl, recipe.imageUrl)))
        .limit(1);

      if (!existingLink) {
        try {
          await syncMainPhotoLink(id, recipe.imageUrl, null, "ai");
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

    const [photo] = await db
      .insert(photosTable)
      .values({ imageUrl, uploadedBy, source: "cooked" })
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

export async function generateAndSaveRecipeImage(recipeId: number, title: string, category: string): Promise<string | null> {
  try {
    const { generateImageBuffer } = await import("@workspace/integrations-openai-ai-server/image");
    const { ObjectStorageService } = await import("../lib/objectStorage");

    const prompt = `Ein appetitliches, professionelles Foodfoto des Gerichts "${title}" (Kategorie: ${category}). Realistisch, hell beleuchtet, auf einem schönen Teller angerichtet, weißer oder heller Hintergrund, keine Menschen, keine Schrift.`;
    const rawImageBuffer = await generateImageBuffer(prompt, "1024x1024");

    const sharp = (await import("sharp")).default;
    const imageBuffer = await sharp(rawImageBuffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const storageService = new ObjectStorageService();
    const storagePath = await storageService.uploadBuffer(imageBuffer, "image/webp", "recipe-images");
    const imageUrl = `/api/storage${storagePath}`;

    await db.update(recipesTable).set({ imageUrl, isAiGenerated: true, imageSource: "ai" }).where(eq(recipesTable.id, recipeId));
    invalidateRecipeListCache();

    await syncMainPhotoLink(recipeId, imageUrl, null, "ai");

    return imageUrl;
  } catch (err) {
    console.error(`Failed to generate image for recipe ${recipeId}:`, err);
    return null;
  }
}

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
    const recipesWithPhotos = await db
      .selectDistinct({ recipeId: recipePhotoLinksTable.recipeId })
      .from(recipePhotoLinksTable);

    const recipeIdsWithPhotos = new Set(recipesWithPhotos.map((r) => r.recipeId));

    const allRecipes = await db
      .select({ id: recipesTable.id, imageUrl: recipesTable.imageUrl, isAiGenerated: recipesTable.isAiGenerated })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const recipesToProcess = allRecipes.filter(
      (r) => recipeIdsWithPhotos.has(r.id) && (!r.imageUrl || r.isAiGenerated === true)
    );

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
          .where(eq(recipePhotoLinksTable.recipeId, recipe.id))
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

router.post("/recipes/:id/extract-image-from-source", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Ungültige Rezept-ID" });
      return;
    }

    const [recipe] = await db
      .select({ id: recipesTable.id, title: recipesTable.title, source: recipesTable.source, createdBy: recipesTable.createdBy, imageUrl: recipesTable.imageUrl })
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

    const { extractAndSaveImageFromUrl } = await import("./extractUrl");
    const imageUrl = await extractAndSaveImageFromUrl(recipe.source);

    if (!imageUrl) {
      res.status(422).json({
        error: "no_image_found",
        message: "Auf der Originalseite konnte kein Bild gefunden werden. Möglicherweise erlaubt die Seite keinen Zugriff.",
      });
      return;
    }

    await db.update(recipesTable).set({ imageUrl, isAiGenerated: false, imageSource: "web" }).where(eq(recipesTable.id, id));
    invalidateRecipeListCache();

    await syncMainPhotoLink(id, imageUrl, req.authUser!.id, "web");

    res.json({ imageUrl, imageSource: "web" });
  } catch (err) {
    req.log.error({ err }, "Failed to extract image from source URL");
    res.status(500).json({ error: "internal_error", message: "Bild-Extraktion fehlgeschlagen" });
  }
});

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

    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storageService = new ObjectStorageService();
    const sharp = (await import("sharp")).default;

    const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent. Prüfe das Bild: Ist ein verwertbares Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten, das als Rezeptbild geeignet wäre)? Falls ja, gib die Koordinaten des besten Bildausschnitts als Prozentwerte zurück. Falls kein geeignetes Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

    const renderPdfToImages = async (pdfBuffer: Buffer): Promise<Buffer[]> => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { createCanvas } = (await import("canvas"));
      const uint8Array = new Uint8Array(pdfBuffer);
      const pdfDoc = await (pdfjsLib as unknown as { getDocument: (opts: object) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: object) => { width: number; height: number }; render: (opts: object) => { promise: Promise<void> } }> }> } }).getDocument({ data: uint8Array, verbosity: 0 }).promise;
      const pages: Buffer[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx as unknown as Parameters<typeof page.render>[0]["canvasContext"], viewport }).promise;
        pages.push(canvas.toBuffer("image/jpeg", { quality: 0.85 }));
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

        const croppedBuffer = await sharp(foundPageBuffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .resize(800, 800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        const storagePath = await storageService.uploadBuffer(croppedBuffer, "image/webp", "recipe-images");
        const extractedImageUrl = `/api/storage${storagePath}`;

        await db
          .update(recipesTable)
          .set({ imageUrl: extractedImageUrl, isAiGenerated: false, imageSource: "original" })
          .where(eq(recipesTable.id, recipe.id));
        await syncMainPhotoLink(recipe.id, extractedImageUrl, null, "original");
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

    const { ObjectStorageService } = await import("../lib/objectStorage");
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

    res.json({
      total: storageRecipes.length,
      totalSizeBytes: sizeKnown ? totalSizeBytes : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get image stats");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Abrufen der Bildstatistiken" });
  }
});

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
    }
  };

  try {
    const sharp = (await import("sharp")).default;
    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storageService = new ObjectStorageService();

    const allRecipes = await db
      .select({ id: recipesTable.id, imageUrl: recipesTable.imageUrl })
      .from(recipesTable)
      .where(isNull(recipesTable.deletedAt));

    const recipesToProcess = allRecipes.filter(
      (r) => r.imageUrl && r.imageUrl.startsWith("/api/storage/")
    );

    const total = recipesToProcess.length;
    let done = 0;
    let errors = 0;

    sendEvent({ done, total, errors });

    for (const recipe of recipesToProcess) {
      try {
        const objectPath = recipe.imageUrl!.replace("/api/storage", "");

        const file = await storageService.getObjectEntityFile(objectPath).catch(async () => {
          const publicPath = objectPath.replace(/^\/objects\//, "");
          return storageService.searchPublicObject(publicPath);
        });

        if (!file) {
          errors++;
          done++;
          sendEvent({ done, total, errors });
          continue;
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
          errors++;
        }

        done++;
        sendEvent({ done, total, errors });
      } catch (err) {
        req.log.error({ err, recipeId: recipe.id }, "Failed to optimize image");
        errors++;
        done++;
        sendEvent({ done, total, errors });
      }
    }

    sendEvent({ done: total, total, errors, finished: true });
  } catch (err) {
    req.log.error({ err }, "Failed to run image optimization");
    sendEvent({ error: "Fehler bei der Bildoptimierung" });
  } finally {
    res.end();
  }
});

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
        await syncMainPhotoLink(recipe.id, photoUrl);
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
        await syncMainPhotoLink(recipe.id, photoUrl);
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
