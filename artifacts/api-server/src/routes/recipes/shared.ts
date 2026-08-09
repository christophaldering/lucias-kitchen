/**
 * Gemeinsame Hilfsfunktionen, Konstanten und Schemas für alle recipes-Module.
 * Kein Express-Router hier – nur reine Exports.
 */

import { db } from "@workspace/db";
import { recipesTable, photosTable, recipePhotoLinksTable } from "@workspace/db/schema";
import { eq, inArray, sql, and, isNull, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { createHash } from "crypto";
import { registerPhotoForRecipe } from "../../utils/registerPhotoForRecipe";

// ---------------------------------------------------------------------------
// Admin-Prüfung
// ---------------------------------------------------------------------------

export const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
export function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

// ---------------------------------------------------------------------------
// Rezeptlisten-Cache
// ---------------------------------------------------------------------------

export const RECIPE_CACHE_MAX = 50;
export const recipeListCache = new Map<string, { etag: string; body: string }>();

export function cacheSet(key: string, value: { etag: string; body: string }) {
  if (recipeListCache.size >= RECIPE_CACHE_MAX) {
    const oldest = recipeListCache.keys().next().value;
    if (oldest !== undefined) recipeListCache.delete(oldest);
  }
  recipeListCache.set(key, value);
}

export interface RecipeQueryFilters {
  category?: string;
  time?: string;      // "unter30" | "unter60"
  season?: string;
  cooked?: string;    // "gekocht" | "nicht"
  photoType?: string; // "none" | "ai" | "scan" | "own"
  variants?: string;  // "true" = show all; otherwise parent_recipe_id IS NULL
  chefPick?: string;  // "true" = chef_pick = true only
  sort?: string;      // alphabetisch|kategorie|bewertung|neueste|haeufig_gekocht|schwierigkeit|zeit
  dir?: string;       // "asc" | "desc"
}

export function recipeListCacheKey(userId?: number, filter?: string, page?: number, limit?: number, qf?: RecipeQueryFilters) {
  const extra = qf ? [
    qf.category ?? "",
    qf.time ?? "",
    qf.season ?? "",
    qf.cooked ?? "",
    qf.photoType ?? "",
    qf.variants ?? "",
    qf.chefPick ?? "",
    qf.sort ?? "",
    qf.dir ?? "",
  ].join("|") : "";
  return `${userId ?? "anon"}:${filter ?? "all"}:p${page ?? 1}:l${limit ?? 24}:${extra}`;
}

// ---------------------------------------------------------------------------
// SQL-Helfer für Zeitberechnung und Filter
// ---------------------------------------------------------------------------

/** Returns a SQL expression computing total_time in minutes. NULL when not parseable (no digits). */
export function totalTimeParsedMinutesSql(columnExpr: string): SQL {
  return sql.raw(`(CASE
    WHEN ${columnExpr} IS NULL OR ${columnExpr} !~ '[0-9]' THEN NULL
    ELSE (
      SELECT
        CASE
          WHEN COUNT(*) = 1 THEN MAX(CASE WHEN rn = 1 THEN num ELSE NULL END)
          ELSE MAX(CASE WHEN rn = 1 THEN num ELSE NULL END) * 60
               + COALESCE(MAX(CASE WHEN rn = 2 THEN num ELSE NULL END), 0)
        END
      FROM (
        SELECT m[1]::int AS num, ROW_NUMBER() OVER () AS rn
        FROM regexp_matches(${columnExpr}, '[0-9]+', 'g') AS t(m)
      ) sub
      WHERE rn <= 2
    )
  END)`);
}

/** Builds extra SQL WHERE fragments (each starting with AND) from RecipeQueryFilters. */
export function buildExtraFilters(qf?: RecipeQueryFilters): SQL {
  if (!qf) return sql``;
  const parts: SQL[] = [];

  if (qf.category) {
    parts.push(sql`AND r.category = ${qf.category}`);
  }
  if (qf.time === "unter30") {
    parts.push(sql`AND ${totalTimeParsedMinutesSql("r.total_time")} < 30`);
  } else if (qf.time === "unter60") {
    parts.push(sql`AND ${totalTimeParsedMinutesSql("r.total_time")} < 60`);
  }
  if (qf.season) {
    parts.push(sql`AND r.seasons @> jsonb_build_array(${qf.season})`);
  }
  if (qf.cooked === "gekocht") {
    parts.push(sql`AND COALESCE(r.cooked_count, 0) > 0`);
  } else if (qf.cooked === "nicht") {
    parts.push(sql`AND (r.cooked_count = 0 OR r.cooked_count IS NULL)`);
  }
  if (qf.photoType === "none") {
    parts.push(sql`AND r.image_url IS NULL`);
  } else if (qf.photoType === "ai") {
    parts.push(sql`AND r.is_ai_generated = true`);
  } else if (qf.photoType === "scan") {
    parts.push(sql`AND (r.image_source = 'web' AND r.is_ai_generated IS NOT TRUE AND r.image_url IS NOT NULL)`);
  } else if (qf.photoType === "own") {
    parts.push(sql`AND (r.image_url IS NOT NULL AND r.is_ai_generated IS NOT TRUE AND r.image_source IS DISTINCT FROM 'web')`);
  }
  if (qf.variants !== undefined && qf.variants !== "true") {
    parts.push(sql`AND r.parent_recipe_id IS NULL`);
  }
  if (qf.chefPick === "true") {
    parts.push(sql`AND r.chef_pick = true`);
  }

  if (parts.length === 0) return sql``;
  return parts.reduce<SQL>((acc, part) => sql`${acc} ${part}`, sql``);
}

/** Builds ORDER BY SQL fragment for getRecipesWithIngredients. */
export function buildSortOrder(qf?: RecipeQueryFilters): SQL {
  const sort = qf?.sort;
  const DEFAULTS: Record<string, "asc" | "desc"> = {
    alphabetisch: "asc",
    kategorie: "asc",
    bewertung: "desc",
    neueste: "desc",
    haeufig_gekocht: "desc",
    schwierigkeit: "asc",
    zeit: "asc",
    zuletzt_gekocht: "desc",
  };
  const dir = (qf?.dir === "asc" || qf?.dir === "desc")
    ? qf.dir
    : (sort ? (DEFAULTS[sort] ?? "asc") : "asc");
  const D = dir === "desc" ? "DESC" : "ASC";

  switch (sort) {
    case "alphabetisch":
      return sql.raw(`r.title COLLATE "de-DE-x-icu" ${D}`);
    case "kategorie":
      return sql.raw(`r.category COLLATE "de-DE-x-icu" ${D}, r.title COLLATE "de-DE-x-icu" ASC`);
    case "bewertung":
      return sql.raw(`CASE r.rating WHEN 'sehr lecker' THEN 2 WHEN 'lecker' THEN 1 ELSE 0 END ${D}, r.id ASC`);
    case "neueste":
      return sql.raw(`r.created_at ${D}`);
    case "haeufig_gekocht":
      return sql.raw(`COALESCE(r.cooked_count, 0) ${D}, r.id ASC`);
    case "schwierigkeit":
      return sql.raw(`CASE r.difficulty WHEN 'simpel' THEN 0 WHEN 'normal' THEN 1 WHEN 'schwer' THEN 2 ELSE 1 END ${D}, r.title ASC`);
    case "zeit":
      return sql.raw(`(CASE WHEN r.total_time IS NULL OR r.total_time !~ '[0-9]' THEN NULL ELSE (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(CASE WHEN rn = 1 THEN num ELSE NULL END) ELSE MAX(CASE WHEN rn = 1 THEN num ELSE NULL END) * 60 + COALESCE(MAX(CASE WHEN rn = 2 THEN num ELSE NULL END), 0) END FROM (SELECT m[1]::int AS num, ROW_NUMBER() OVER () AS rn FROM regexp_matches(r.total_time, '[0-9]+', 'g') AS t(m)) sub WHERE rn <= 2) END) ${D} NULLS LAST, r.id ASC`);
    case "zuletzt_gekocht":
      return sql.raw(`r.last_cooked ${D} NULLS LAST, r.id ASC`);
    default:
      return sql.raw("r.id ASC");
  }
}

// ---------------------------------------------------------------------------
// Cache-Verwaltung
// ---------------------------------------------------------------------------

export function invalidateRecipeListCache() {
  recipeListCache.clear();
}

export async function warmupRecipeCache(userId?: number) {
  try {
    const cacheKey = recipeListCacheKey(userId, undefined, 1, 24);
    const result = await getRecipesWithIngredients(userId, undefined, 1, 24);
    const body = JSON.stringify(result);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 24)}"`;
    cacheSet(cacheKey, { etag, body });
  } catch {
  }
}

// ---------------------------------------------------------------------------
// Validierungsschemas
// ---------------------------------------------------------------------------

export const ingredientSchema = z.object({
  amount: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
  unit: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
  name: z.string().min(1),
  note: z.string().optional().nullable(),
});

export const VALID_SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export const recipeBodySchema = z.object({
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

// ---------------------------------------------------------------------------
// Daten-Helfer
// ---------------------------------------------------------------------------

export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return null;
  return url;
}

export async function getFullRecipesByIds(ids: number[]): Promise<Record<number, unknown[]>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: recipesTable.id, steps: recipesTable.steps })
    .from(recipesTable)
    .where(and(inArray(recipesTable.id, ids), isNull(recipesTable.deletedAt)));
  const result: Record<number, unknown[]> = {};
  for (const row of rows) {
    result[row.id] = Array.isArray(row.steps) ? (row.steps as unknown[]) : [];
  }
  return result;
}

export async function getRecipesWithIngredients(currentUserId?: number, filter?: string, page?: number, limit?: number, queryFilters?: RecipeQueryFilters) {
  const pageNum = Math.max(1, page ?? 1);
  const limitNum = limit != null ? Math.max(1, limit) : 24;
  const offset = (pageNum - 1) * limitNum;

  const favExpr = currentUserId != null
    ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
    : sql`false`;

  const isOwnerExpr = currentUserId != null
    ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
    : sql`(r.created_by IS NULL)`;

  const filterExpr =
    filter === "mine" && currentUserId != null
      ? sql`AND (r.created_by IS NULL OR r.created_by = ${currentUserId})`
      : filter === "favorites" && currentUserId != null
      ? sql`AND EXISTS(SELECT 1 FROM recipe_favorites rf2 WHERE rf2.recipe_id = r.id AND rf2.user_id = ${currentUserId})`
      : sql``;

  const extraFilters = buildExtraFilters(queryFilters);

  const countRows = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM recipes r
    WHERE r.deleted_at IS NULL
    ${filterExpr}
    ${extraFilters}
  `);
  const rawCountRows = (countRows as unknown as { rows: Array<{ total: string | number }> }).rows ?? (countRows as unknown as Array<{ total: string | number }>);
  const total = Number(rawCountRows[0]?.total ?? 0);

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
      jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) > 0 AS "hasSteps",
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
      r.tried,
      r.chef_pick           AS "chefPick",
      (
        SELECT p.image_url
        FROM recipe_photo_links rpl
        INNER JOIN photos p ON p.id = rpl.photo_id
        WHERE rpl.recipe_id = r.id AND rpl.is_main = true
        ORDER BY rpl.sort_order, p.created_at DESC
        LIMIT 1
      ) AS "mainPhotoUrl",
      (
        SELECT p.thumbnail_url
        FROM recipe_photo_links rpl
        INNER JOIN photos p ON p.id = rpl.photo_id
        WHERE rpl.recipe_id = r.id AND rpl.is_main = true
        ORDER BY rpl.sort_order, p.created_at DESC
        LIMIT 1
      ) AS "mainPhotoThumbnailUrl",
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
    ${filterExpr}
    ${extraFilters}
    GROUP BY r.id, u.display_name, u.avatar_url
    ORDER BY ${buildSortOrder(queryFilters)}
    LIMIT ${limitNum} OFFSET ${offset}
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
    hasSteps: boolean;
    imageUrl: string | null;
    mainPhotoUrl: string | null;
    mainPhotoThumbnailUrl: string | null;
    createdAt: Date | string | null;
    seasons: string[] | null;
    tags: string[] | null;
    createdBy: number | null;
    parentRecipeId: number | null;
    variantName: string | null;
    sourceDocumentUrl: string | null;
    isAiGenerated: boolean;
    imageSource: string | null;
    tried: boolean;
    chefPick: boolean;
    ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
    isFavorite: boolean;
    isOwner: boolean;
    ownerDisplayName: string | null;
    ownerAvatarUrl: string | null;
  };

  const rawRows = (rows as unknown as { rows: Row[] }).rows ?? (rows as unknown as Row[]);

  const result = rawRows.map((r) => ({
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
    steps: [] as unknown[],
    hasSteps: r.hasSteps ?? false,
    imageUrl: sanitizeImageUrl(r.imageUrl),
    mainPhotoUrl: r.mainPhotoUrl ?? null,
    mainPhotoThumbnailUrl: r.mainPhotoThumbnailUrl ?? null,
    createdAt: r.createdAt,
    seasons: r.seasons ?? [],
    tags: r.tags ?? [],
    createdBy: r.createdBy,
    parentRecipeId: r.parentRecipeId,
    variantName: r.variantName,
    sourceDocumentUrl: r.sourceDocumentUrl,
    isAiGenerated: r.isAiGenerated ?? false,
    imageSource: r.imageSource ?? null,
    tried: r.tried ?? false,
    chefPick: r.chefPick ?? false,
    ingredients: r.ingredients,
    isFavorite: r.isFavorite,
    isOwner: r.isOwner,
    owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
      ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
      : null,
  }));

  return {
    recipes: result,
    total,
    page: pageNum,
    limit: limitNum,
    hasMore: offset + result.length < total,
  };
}

// ---------------------------------------------------------------------------
// Foto-Sync-Helfer
// ---------------------------------------------------------------------------

export async function syncMainPhotoLink(
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
    .update(recipePhotoLinksTable)
    .set({ isMain: false })
    .where(
      and(
        eq(recipePhotoLinksTable.recipeId, recipeId),
        eq(recipePhotoLinksTable.isMain, true),
        sql`${recipePhotoLinksTable.photoId} != ${photo.id}`,
      )
    );
}

// ---------------------------------------------------------------------------
// KI-Bildgenerierung
// ---------------------------------------------------------------------------

export async function generateAndSaveRecipeImage(recipeId: number, title: string, category: string): Promise<string | null> {
  try {
    const { generateImageBuffer } = await import("@workspace/integrations-openai-ai-server/image");
    const { ObjectStorageService } = await import("../../lib/objectStorage");

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

    await registerPhotoForRecipe(imageUrl, recipeId, {
      source: "ai_generated",
      setAsMain: true,
      syncRecipeImageUrl: false,
    });

    return imageUrl;
  } catch (err) {
    console.error(`Failed to generate image for recipe ${recipeId}:`, err);
    return null;
  }
}
