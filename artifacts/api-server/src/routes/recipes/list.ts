/**
 * Listen-Routen: GET /recipes, /recipes/count, /recipes/search,
 * /recipes/ai-search, /recipes/duplicates, /recipes/confirm-delete,
 * /recipes/stats, /ingredients, /recipes/suggest
 *
 * Routenreihenfolge-Regel: Diese Routen mit festen Pfaden müssen IMMER VOR
 * /:id registriert werden, damit /recipes/stats o. ä. nicht als ID gematcht wird.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recipesTable,
  recipeIngredientsTable,
  deleteConfirmationTokensTable,
  groupMembersTable,
  groupsTable,
} from "@workspace/db/schema";
import { eq, inArray, sql, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { AI_MODEL_MAIN } from "../../lib/aiModels";
import { callAiResponses } from "../../lib/aiResponses";
import { aiLimiter, searchLimiter } from "../../lib/rateLimits";
import { authMiddleware } from "../auth";
import { embedQuery, cosineSimilarity, getRecipeEmbeddings } from "../../lib/embeddings";
import { createHash } from "crypto";
import {
  isAdmin,
  recipeListCache,
  recipeListCacheKey,
  cacheSet,
  invalidateRecipeListCache,
  sanitizeImageUrl,
  getRecipesWithIngredients,
  getFullRecipesByIds,
  totalTimeParsedMinutesSql,
} from "./shared";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /recipes/count
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /recipes/ai-search
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// KI-Suche: Diät-Stichworte (WÖRTLICH aus dem alten JS-Filter)
// ---------------------------------------------------------------------------

/** Liste 1 — vegetarisch / vegan: Fleisch-, Geflügel- und Fischbegriffe */
const MEAT_KEYWORDS_VEG = [
  "fleisch", "schwein", "rind", "lamm", "hähnchen", "huhn", "pute",
  "wurst", "speck", "schinken", "steak", "hackfleisch", "filet",
];

/** Liste 2 — fleisch-Diät: ohne "pute" und "filet" */
const MEAT_KEYWORDS_FLEISCH = [
  "hähnchen", "huhn", "schwein", "rind", "lamm",
  "steak", "hackfleisch", "wurst", "speck", "schinken",
];

/** Escapet ILIKE-Sonderzeichen (% und _) in einem Suchbegriff. */
function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type AiCriteria = {
  ingredients: string[];
  exclusions: string[];
  diet: string | null;
  maxMinutes: number | null;
  mood: string | null;
  cuisine: string | null;
  keywords: string[];
  summary: string;
};

/**
 * Baut WHERE-Bedingungen für den SQL-basierten KI-Suchfilter.
 * Semantik EXAKT identisch zum bisherigen JS-Filter.
 */
function buildAiSearchSqlConditions(
  criteria: AiCriteria,
  currentUserId: number | undefined,
  filter: string | undefined,
): ReturnType<typeof sql>[] {
  const conds: ReturnType<typeof sql>[] = [sql`r.deleted_at IS NULL`];

  // filter: mine / favorites
  if (filter === "mine" && currentUserId != null) {
    conds.push(sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`);
  } else if (filter === "favorites" && currentUserId != null) {
    conds.push(
      sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`,
    );
  }

  // a) exclusions: Zutatenname, Titel, Kategorie (KEINE Notizen)
  if (criteria.exclusions.length > 0) {
    const pats = criteria.exclusions.map((e) => `%${escapeLike(e.toLowerCase())}%`);
    const tit = sql.join(pats.map((p) => sql`r.title ILIKE ${p}`), sql` OR `);
    const cat = sql.join(pats.map((p) => sql`r.category ILIKE ${p}`), sql` OR `);
    const ing = sql.join(pats.map((p) => sql`ri2.name ILIKE ${p}`), sql` OR `);
    conds.push(sql`NOT (
      (${tit})
      OR (${cat})
      OR EXISTS (SELECT 1 FROM recipe_ingredients ri2 WHERE ri2.recipe_id = r.id AND (${ing}))
    )`);
  }

  // b/c) diet
  if (criteria.diet) {
    const dl = criteria.diet.toLowerCase();
    if (dl === "vegetarisch" || dl === "vegan") {
      // Rezept fällt raus, wenn Fleisch-Stichwort in Zutaten, Titel oder Kategorie
      const pats = MEAT_KEYWORDS_VEG.map((kw) => `%${escapeLike(kw)}%`);
      const tit = sql.join(pats.map((p) => sql`r.title ILIKE ${p}`), sql` OR `);
      const cat = sql.join(pats.map((p) => sql`r.category ILIKE ${p}`), sql` OR `);
      const ing = sql.join(pats.map((p) => sql`ri2.name ILIKE ${p}`), sql` OR `);
      conds.push(sql`NOT (
        (${tit})
        OR (${cat})
        OR EXISTS (SELECT 1 FROM recipe_ingredients ri2 WHERE ri2.recipe_id = r.id AND (${ing}))
      )`);
    } else if (dl === "fleisch") {
      // Rezept besteht, wenn Kategorie Fleisch/Geflügel/Fisch enthält
      // ODER Stichwort (Liste 2) in Zutatenname oder Titel vorkommt
      const pats = MEAT_KEYWORDS_FLEISCH.map((kw) => `%${escapeLike(kw)}%`);
      const tit = sql.join(pats.map((p) => sql`r.title ILIKE ${p}`), sql` OR `);
      const ing = sql.join(pats.map((p) => sql`ri2.name ILIKE ${p}`), sql` OR `);
      conds.push(sql`(
        r.category ILIKE '%fleisch%'
        OR r.category ILIKE '%geflügel%'
        OR r.category ILIKE '%fisch%'
        OR (${tit})
        OR EXISTS (SELECT 1 FROM recipe_ingredients ri2 WHERE ri2.recipe_id = r.id AND (${ing}))
      )`);
    }
  }

  // d) maxMinutes: total_time parsen; bei fehlendem Wert prep_time; fehlen Ziffern → besteht
  if (criteria.maxMinutes != null) {
    const mx = criteria.maxMinutes;
    // Hilfsfunktion: erstes und zweites Ziffernblock einer Spalte als Minuten
    // count=1 → direkt Minuten; count≥2 → h*60+min; leer → 0 (tritt nicht auf, da ~ '[0-9]')
    conds.push(sql`CASE
      WHEN r.total_time IS NOT NULL AND r.total_time ~ '[0-9]' THEN
        (SELECT CASE
                  WHEN count(*) = 1 THEN max(m[1]::int)
                  WHEN count(*) >= 2
                    THEN (array_agg(m[1]::int ORDER BY ord))[1] * 60
                       + (array_agg(m[1]::int ORDER BY ord))[2]
                  ELSE 0
                END
         FROM (SELECT m, row_number() OVER () AS ord
               FROM regexp_matches(r.total_time, '([0-9]+)', 'g') AS t(m)
               LIMIT 2) sub) <= ${mx}
      WHEN r.prep_time IS NOT NULL AND r.prep_time ~ '[0-9]' THEN
        (SELECT CASE
                  WHEN count(*) = 1 THEN max(m[1]::int)
                  WHEN count(*) >= 2
                    THEN (array_agg(m[1]::int ORDER BY ord))[1] * 60
                       + (array_agg(m[1]::int ORDER BY ord))[2]
                  ELSE 0
                END
         FROM (SELECT m, row_number() OVER () AS ord
               FROM regexp_matches(r.prep_time, '([0-9]+)', 'g') AS t(m)
               LIMIT 2) sub) <= ${mx}
      ELSE true
    END`);
  }

  // e) searchTerms = ingredients + keywords + cuisine + mood → ILIKE in Titel, Notizen, Kategorie, Zutaten
  const searchTerms: string[] = [
    ...(criteria.ingredients ?? []),
    ...(criteria.keywords ?? []),
  ];
  if (criteria.cuisine) searchTerms.push(criteria.cuisine);
  if (criteria.mood) searchTerms.push(criteria.mood);

  if (searchTerms.length > 0) {
    const termConds = searchTerms.map((term) => {
      const p = `%${escapeLike(term.toLowerCase())}%`;
      return sql`(
        r.title ILIKE ${p}
        OR COALESCE(r.notes, '') ILIKE ${p}
        OR r.category ILIKE ${p}
        OR EXISTS (SELECT 1 FROM recipe_ingredients ri2 WHERE ri2.recipe_id = r.id AND ri2.name ILIKE ${p})
      )`;
    });
    conds.push(sql.join(termConds, sql` OR `));
  }

  return conds;
}

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

// ---------------------------------------------------------------------------
// POST /recipes/smart-search
// ---------------------------------------------------------------------------
// Bedingungswörter, die eine GPT-Kriterienextraktion auslösen
const SMART_CONDITION_WORDS = new Set([
  "ohne", "kein", "keine", "keinen",
  "unter", "ueber", "über",
  "maximal", "max", "hoechstens", "höchstens", "weniger",
  "vegetarisch", "vegan",
]);

const STOPWORDS_SMART = new Set(["mit", "und", "der", "die", "das", "im", "in", "am"]);

const SIMILARITY_THRESHOLD = 0.30;

// Internes In-Memory-Rate-Limit für die teure GPT-Extraktion: max 30 pro 10 Min pro IP
const EXTRACTION_WINDOW_MS = 10 * 60 * 1000;
const extractionCounts = new Map<string, { count: number; resetAt: number }>();
function canExtract(ip: string): boolean {
  const now = Date.now();
  const entry = extractionCounts.get(ip);
  if (!entry || entry.resetAt < now) {
    extractionCounts.set(ip, { count: 1, resetAt: now + EXTRACTION_WINDOW_MS });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

router.post("/recipes/smart-search", authMiddleware, searchLimiter, async (req, res) => {
  try {
    const bodySchema = z.object({
      query: z.string().min(1).max(500).optional(),
      profile: z.object({
        ingredients: z.array(z.string()).default([]),
        moods: z.array(z.string()).default([]),
        exclusions: z.array(z.string()).default([]),
      }).optional(),
      filter: z.string().optional(),
    }).refine(
      (d) => !!d.query !== !!d.profile,
      { message: "Genau eines von query oder profile muss angegeben werden" }
    );
    const { query, profile, filter } = bodySchema.parse(req.body);
    const currentUserId = req.authUser?.id;

    // ── PROFIL-PFAD: kein GPT-Aufruf ────────────────────────────────────────
    if (profile) {
      const profileCriteria: AiCriteria = {
        ingredients: profile.ingredients,
        exclusions: profile.exclusions,
        diet: null, maxMinutes: null, mood: null, cuisine: null,
        keywords: profile.moods,
        summary: "",
      };
      const profileConds = buildAiSearchSqlConditions(profileCriteria, currentUserId, filter);

      // Exakte Treffer über alle profileConds (exclusions als NOT + ingredients/moods als OR)
      const pExactRes = await db.execute(sql`
        SELECT DISTINCT r.id FROM recipes r
        WHERE ${sql.join(profileConds, sql` AND `)}
        ORDER BY r.id
      `);
      const rawPExact = (pExactRes as unknown as { rows: Array<{ id: number }> }).rows
        ?? (pExactRes as unknown as Array<{ id: number }>);
      const pExactIds = rawPExact.map((r) => Number(r.id));

      // Semantische Suche (greift nur wenn Embeddings befüllt sind)
      let pSemanticCandidates: Array<{ id: number; score: number }> = [];
      const pSemanticQuery = [...profile.ingredients, ...profile.moods].join(" ").trim();
      if (pSemanticQuery) {
        const pQueryVector = await embedQuery(pSemanticQuery);
        if (pQueryVector !== null) {
          // Kandidaten-Pool = alle Rezepte die exclusions überleben
          const pBaseConds = buildAiSearchSqlConditions(
            { ingredients: [], exclusions: profile.exclusions, diet: null, maxMinutes: null, mood: null, cuisine: null, keywords: [], summary: "" },
            currentUserId, filter,
          );
          const pValidRes = await db.execute(sql`
            SELECT DISTINCT r.id FROM recipes r WHERE ${sql.join(pBaseConds, sql` AND `)}
          `);
          const rawPValid = (pValidRes as unknown as { rows: Array<{ id: number }> }).rows
            ?? (pValidRes as unknown as Array<{ id: number }>);
          const pValidIdSet = new Set(rawPValid.map((r) => Number(r.id)));
          const pStoredEmbeddings = await getRecipeEmbeddings();
          for (const [recipeId, vector] of pStoredEmbeddings) {
            if (!pValidIdSet.has(recipeId)) continue;
            const score = cosineSimilarity(pQueryVector, vector);
            if (score >= SIMILARITY_THRESHOLD) pSemanticCandidates.push({ id: recipeId, score });
          }
          pSemanticCandidates.sort((a, b) => b.score - a.score);
        }
      }

      const pExactIdSet = new Set(pExactIds);
      const pMergedIds: number[] = [...pExactIds];
      for (const { id } of pSemanticCandidates) {
        if (!pExactIdSet.has(id)) pMergedIds.push(id);
      }
      const pLimitedIds = pMergedIds.slice(0, 60);
      const pExactCount = pExactIds.length;
      const pSemanticCount = pSemanticCandidates.filter((c) => !pExactIdSet.has(c.id)).length;

      if (pLimitedIds.length === 0) {
        return res.json({ recipes: [], summary: "Keine passenden Rezepte gefunden", exactCount: 0, semanticCount: 0 });
      }

      // Hydration (identisch zum Query-Pfad)
      const pFavExpr = currentUserId != null
        ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
        : sql`false`;
      const pIsOwnerExpr = currentUserId != null
        ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
        : sql`(r.created_by IS NULL)`;

      const pHydRows = await db.execute(sql`
        SELECT
          r.id, r.title, r.servings,
          r.prep_time AS "prepTime", r.total_time AS "totalTime",
          r.difficulty, r.category, r.rating,
          r.kcal_per_portion AS "kcalPerPortion", r.source,
          r.last_cooked AS "lastCooked", r.cooked_count AS "cookedCount",
          r.notes,
          jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) > 0 AS "hasSteps",
          r.image_url AS "imageUrl",
          r.created_at AS "createdAt", r.seasons, r.tags,
          r.created_by AS "createdBy",
          r.parent_recipe_id AS "parentRecipeId", r.variant_name AS "variantName",
          r.source_document_url AS "sourceDocumentUrl",
          r.is_ai_generated AS "isAiGenerated", r.image_source AS "imageSource",
          r.tried, r.chef_pick AS "chefPick",
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
                'id', ri.id, 'recipeId', ri.recipe_id,
                'amount', ri.amount, 'unit', ri.unit,
                'name', ri.name, 'note', ri.note
              ) ORDER BY ri.id
            ) FILTER (WHERE ri.id IS NOT NULL),
            '[]'
          ) AS ingredients,
          ${pFavExpr} AS "isFavorite",
          ${pIsOwnerExpr} AS "isOwner",
          u.display_name AS "ownerDisplayName",
          u.avatar_url AS "ownerAvatarUrl"
        FROM recipes r
        LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        LEFT JOIN users u ON u.id = r.created_by
        WHERE r.id = ANY(${sql`ARRAY[${sql.join(pLimitedIds.map((id) => sql`${id}`), sql`, `)}]::int[]`})
        GROUP BY r.id, u.display_name, u.avatar_url
        ORDER BY r.id
      `);

      type SmartRowP = {
        id: number; title: string; servings: number | null; prepTime: string | null;
        totalTime: string | null; difficulty: string; category: string; rating: string | null;
        kcalPerPortion: number | null; source: string | null; lastCooked: string | null;
        cookedCount: number | null; notes: string | null; hasSteps: boolean;
        imageUrl: string | null; mainPhotoUrl: string | null; createdAt: Date | string | null;
        seasons: string[] | null; tags: string[] | null; createdBy: number | null;
        parentRecipeId: number | null; variantName: string | null; sourceDocumentUrl: string | null;
        isAiGenerated: boolean; imageSource: string | null; tried: boolean; chefPick: boolean;
        ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
        isFavorite: boolean; isOwner: boolean; ownerDisplayName: string | null; ownerAvatarUrl: string | null;
      };
      const rawPHyd = (pHydRows as unknown as { rows: SmartRowP[] }).rows
        ?? (pHydRows as unknown as SmartRowP[]);
      const pHydratedMap = new Map(rawPHyd.map((r) => [r.id, r]));
      const pRecipes = pLimitedIds.flatMap((id) => {
        const r = pHydratedMap.get(id);
        if (!r) return [];
        return [{
          id: r.id, title: r.title, servings: r.servings, prepTime: r.prepTime,
          totalTime: r.totalTime, difficulty: r.difficulty, category: r.category,
          rating: r.rating, kcalPerPortion: r.kcalPerPortion, source: r.source,
          lastCooked: r.lastCooked, cookedCount: r.cookedCount, notes: r.notes,
          steps: [] as unknown[], hasSteps: r.hasSteps ?? false,
          imageUrl: sanitizeImageUrl(r.imageUrl), mainPhotoUrl: r.mainPhotoUrl ?? null,
          createdAt: r.createdAt, seasons: r.seasons ?? [], tags: r.tags ?? [],
          createdBy: r.createdBy, parentRecipeId: r.parentRecipeId, variantName: r.variantName,
          sourceDocumentUrl: r.sourceDocumentUrl, isAiGenerated: r.isAiGenerated ?? false,
          imageSource: r.imageSource ?? null, tried: r.tried ?? false, chefPick: r.chefPick ?? false,
          ingredients: r.ingredients, isFavorite: r.isFavorite, isOwner: r.isOwner,
          matchedInNotes: false,
          owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
            ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl } : null,
        }];
      });
      return res.json({
        recipes: pRecipes,
        summary: `${pRecipes.length} ${pRecipes.length === 1 ? "Treffer" : "Treffer"}`,
        exactCount: pExactCount,
        semanticCount: pSemanticCount,
      });
    }

    // ── QUERY-PFAD: bisheriger Code (query garantiert gesetzt durch refine) ──
    const queryStr = query!;

    // -------------------------------------------------------------------------
    // SCHRITT 1: Bedingungserkennung (lokal, kein GPT-Aufruf)
    // -------------------------------------------------------------------------
    const queryWords = queryStr.trim().toLowerCase().split(/\s+/);
    const hasConditions = queryWords.some((w) => SMART_CONDITION_WORDS.has(w));

    // -------------------------------------------------------------------------
    // SCHRITT 2: Kriterienextraktion (nur bei erkannten Bedingungen + Rate-Limit)
    // -------------------------------------------------------------------------
    let criteria: AiCriteria | null = null;
    let summary: string | null = null;

    if (hasConditions && canExtract(req.ip ?? "unknown")) {
      try {
        let rawJson = await callAiResponses({
          model: AI_MODEL_MAIN,
          instructions: AI_SEARCH_SYSTEM_PROMPT,
          input: queryStr,
          // No maxOutputTokens override — use the 2000-token default so gpt-5
          // has enough budget for its hidden reasoning tokens + JSON output.
        });
        rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        criteria = JSON.parse(rawJson);
        criteria!.ingredients ??= [];
        criteria!.exclusions  ??= [];
        criteria!.keywords    ??= [];
        summary = criteria!.summary ?? null;
      } catch (err) {
        req.log.warn({ err }, "smart-search: Kriterienextraktion fehlgeschlagen — weiter ohne Bedingungen.");
        criteria = null;
      }
    }

    // Gemeinsame SQL-Basisbedingungen (deleted_at + filter + harte Kriterien)
    // buildAiSearchSqlConditions mit leeren ingredients/keywords/cuisine/mood,
    // damit nur exclusions, diet, maxMinutes als WHERE-Einschränkung wirken.
    const baseConds: ReturnType<typeof sql>[] = criteria
      ? buildAiSearchSqlConditions(
          { ...criteria, ingredients: [], keywords: [], cuisine: null, mood: null },
          currentUserId,
          filter,
        )
      : (() => {
          const conds: ReturnType<typeof sql>[] = [sql`r.deleted_at IS NULL`];
          if (filter === "mine" && currentUserId != null)
            conds.push(sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`);
          else if (filter === "favorites" && currentUserId != null)
            conds.push(sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`);
          return conds;
        })();

    // -------------------------------------------------------------------------
    // SCHRITT 3: Exakte Treffer (Mehrwort-AND-Suche über alle Felder)
    // -------------------------------------------------------------------------
    const searchWords = queryStr
      .trim()
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2 && !STOPWORDS_SMART.has(w));

    let exactIds: number[] = [];
    if (searchWords.length > 0) {
      const wordConds = searchWords.map((word) => {
        const p = `%${escapeLike(word)}%`;
        return sql`(
          r.title ILIKE ${p}
          OR COALESCE(r.notes, '') ILIKE ${p}
          OR COALESCE(r.category, '') ILIKE ${p}
          OR EXISTS (SELECT 1 FROM recipe_ingredients ri2
                     WHERE ri2.recipe_id = r.id AND ri2.name ILIKE ${p})
          OR EXISTS (SELECT 1 FROM unnest(ARRAY(
                       SELECT jsonb_array_elements_text(r.steps))) AS step
                     WHERE step ILIKE ${p})
        )`;
      });
      const exactRes = await db.execute(sql`
        SELECT DISTINCT r.id
        FROM recipes r
        WHERE ${sql.join([...baseConds, ...wordConds], sql` AND `)}
        ORDER BY r.id
      `);
      const rawExact = (exactRes as unknown as { rows: Array<{ id: number }> }).rows
        ?? (exactRes as unknown as Array<{ id: number }>);
      exactIds = rawExact.map((r) => Number(r.id));
    }

    // -------------------------------------------------------------------------
    // SCHRITT 4: Semantische Treffer (Embedding + Cosine-Ähnlichkeit)
    // -------------------------------------------------------------------------
    let semanticCandidates: Array<{ id: number; score: number }> = [];
    const queryVector = await embedQuery(queryStr);
    if (queryVector !== null) {
      // Gültige Kandidaten-IDs laut baseConds aus der DB holen
      const validRes = await db.execute(sql`
        SELECT DISTINCT r.id FROM recipes r
        WHERE ${sql.join(baseConds, sql` AND `)}
      `);
      const rawValid = (validRes as unknown as { rows: Array<{ id: number }> }).rows
        ?? (validRes as unknown as Array<{ id: number }>);
      const validIdSet = new Set(rawValid.map((r) => Number(r.id)));

      const storedEmbeddings = await getRecipeEmbeddings();
      for (const [recipeId, vector] of storedEmbeddings) {
        if (!validIdSet.has(recipeId)) continue;
        const score = cosineSimilarity(queryVector, vector);
        if (score >= SIMILARITY_THRESHOLD) semanticCandidates.push({ id: recipeId, score });
      }
      semanticCandidates.sort((a, b) => b.score - a.score);
    }

    // -------------------------------------------------------------------------
    // SCHRITT 5: Zusammenführen, Deduplizieren, max. 60
    // -------------------------------------------------------------------------
    const exactIdSet = new Set(exactIds);
    const mergedIds: number[] = [...exactIds];
    for (const { id } of semanticCandidates) {
      if (!exactIdSet.has(id)) mergedIds.push(id);
    }
    const limitedIds = mergedIds.slice(0, 60);

    const exactCount    = exactIds.length;
    const semanticCount = semanticCandidates.filter((c) => !exactIdSet.has(c.id)).length;

    if (limitedIds.length === 0) {
      return res.json({
        recipes: [],
        summary: summary ?? "Keine Treffer",
        exactCount: 0,
        semanticCount: 0,
      });
    }

    // -------------------------------------------------------------------------
    // Hydration: vollständige Rezeptdaten (gleiche Shape wie ai-search)
    // -------------------------------------------------------------------------
    const favExpr = currentUserId != null
      ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
      : sql`false`;
    const isOwnerExpr = currentUserId != null
      ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
      : sql`(r.created_by IS NULL)`;

    const hydRows = await db.execute(sql`
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
        jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) > 0 AS "hasSteps",
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
        ${favExpr}     AS "isFavorite",
        ${isOwnerExpr} AS "isOwner",
        u.display_name  AS "ownerDisplayName",
        u.avatar_url    AS "ownerAvatarUrl"
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = ANY(${sql`ARRAY[${sql.join(limitedIds.map((id) => sql`${id}`), sql`, `)}]::int[]`})
      GROUP BY r.id, u.display_name, u.avatar_url
      ORDER BY r.id
    `);

    type SmartRow = {
      id: number; title: string; servings: number | null; prepTime: string | null;
      totalTime: string | null; difficulty: string; category: string; rating: string | null;
      kcalPerPortion: number | null; source: string | null; lastCooked: string | null;
      cookedCount: number | null; notes: string | null; hasSteps: boolean;
      imageUrl: string | null; mainPhotoUrl: string | null; createdAt: Date | string | null;
      seasons: string[] | null; tags: string[] | null; createdBy: number | null;
      parentRecipeId: number | null; variantName: string | null; sourceDocumentUrl: string | null;
      isAiGenerated: boolean; imageSource: string | null; tried: boolean; chefPick: boolean;
      ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
      isFavorite: boolean; isOwner: boolean; ownerDisplayName: string | null; ownerAvatarUrl: string | null;
    };

    const rawHyd = (hydRows as unknown as { rows: SmartRow[] }).rows
      ?? (hydRows as unknown as SmartRow[]);
    const hydratedMap = new Map(rawHyd.map((r) => [r.id, r]));

    // Reihenfolge aus limitedIds beibehalten (exakt zuerst, dann semantisch nach Score)
    const recipes = limitedIds.flatMap((id) => {
      const r = hydratedMap.get(id);
      if (!r) return [];
      return [{
        id: r.id, title: r.title, servings: r.servings, prepTime: r.prepTime,
        totalTime: r.totalTime, difficulty: r.difficulty, category: r.category,
        rating: r.rating, kcalPerPortion: r.kcalPerPortion, source: r.source,
        lastCooked: r.lastCooked, cookedCount: r.cookedCount, notes: r.notes,
        steps: [] as unknown[], hasSteps: r.hasSteps ?? false,
        imageUrl: sanitizeImageUrl(r.imageUrl), mainPhotoUrl: r.mainPhotoUrl ?? null,
        createdAt: r.createdAt, seasons: r.seasons ?? [], tags: r.tags ?? [],
        createdBy: r.createdBy, parentRecipeId: r.parentRecipeId, variantName: r.variantName,
        sourceDocumentUrl: r.sourceDocumentUrl, isAiGenerated: r.isAiGenerated ?? false,
        imageSource: r.imageSource ?? null, tried: r.tried ?? false, chefPick: r.chefPick ?? false,
        ingredients: r.ingredients,
        isFavorite: r.isFavorite, isOwner: r.isOwner,
        matchedInNotes: false,
        owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
          ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
          : null,
      }];
    });

    const finalSummary = summary ?? `${recipes.length} ${recipes.length === 1 ? "Treffer" : "Treffer"}`;

    res.json({ recipes, summary: finalSummary, exactCount, semanticCount });
  } catch (err) {
    req.log.error({ err }, "smart-search fehlgeschlagen");
    res.status(500).json({ error: "internal_error", message: "Suche fehlgeschlagen" });
  }
});

// ---------------------------------------------------------------------------
router.post("/recipes/ai-search", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const schema = z.object({
      query: z.string().min(1).max(500),
      filter: z.string().optional(),
    });

    const { query, filter } = schema.parse(req.body);
    const currentUserId = req.authUser?.id;

    // OpenAI-Aufruf — unverändert
    let rawJson = await callAiResponses({
      model: AI_MODEL_MAIN,
      instructions: AI_SEARCH_SYSTEM_PROMPT,
      input: query,
      // No maxOutputTokens override — use the 2000-token default.
    });
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let criteria: AiCriteria;
    try {
      criteria = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse AI search response");
      res.status(502).json({ error: "parse_error", message: "KI-Antwort konnte nicht verarbeitet werden" });
      return;
    }
    // Defensive defaults für fehlende Arrays
    criteria.ingredients ??= [];
    criteria.exclusions  ??= [];
    criteria.keywords    ??= [];

    // -----------------------------------------------------------------------
    // SCHRITT 1: SQL-Filter — Treffer-IDs ermitteln
    // -----------------------------------------------------------------------
    const sqlConds = buildAiSearchSqlConditions(criteria, currentUserId, filter);
    const whereClause = sql.join(sqlConds, sql` AND `);

    const idResult = await db.execute(sql`
      SELECT DISTINCT r.id
      FROM recipes r
      WHERE ${whereClause}
      ORDER BY r.id
    `);
    const rawIdRows = (idResult as unknown as { rows: Array<{ id: number }> }).rows
      ?? (idResult as unknown as Array<{ id: number }>);
    const sqlMatchedIds = rawIdRows.map((r) => Number(r.id));

    // -----------------------------------------------------------------------
    // Hydration: vollständige Rezeptdaten für die Treffer-IDs
    // (gleiche SELECT-Shape wie GET /recipes/search)
    // -----------------------------------------------------------------------
    type AiSearchRow = {
      id: number; title: string; servings: number | null; prepTime: string | null;
      totalTime: string | null; difficulty: string; category: string; rating: string | null;
      kcalPerPortion: number | null; source: string | null; lastCooked: string | null;
      cookedCount: number | null; notes: string | null; hasSteps: boolean;
      imageUrl: string | null; mainPhotoUrl: string | null; createdAt: Date | string | null;
      seasons: string[] | null; tags: string[] | null; createdBy: number | null;
      parentRecipeId: number | null; variantName: string | null; sourceDocumentUrl: string | null;
      isAiGenerated: boolean; imageSource: string | null; tried: boolean; chefPick: boolean;
      ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
      isFavorite: boolean; isOwner: boolean; ownerDisplayName: string | null; ownerAvatarUrl: string | null;
    };

    const searchTerms: string[] = [
      ...(criteria.ingredients ?? []),
      ...(criteria.keywords ?? []),
    ];
    if (criteria.cuisine) searchTerms.push(criteria.cuisine);
    if (criteria.mood) searchTerms.push(criteria.mood);

    let sqlMatchedRecipes: Array<AiSearchRow & { matchedInNotes: boolean }> = [];

    if (sqlMatchedIds.length > 0) {
      const favExpr = currentUserId != null
        ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
        : sql`false`;
      const isOwnerExpr = currentUserId != null
        ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
        : sql`(r.created_by IS NULL)`;

      const hydRows = await db.execute(sql`
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
          jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) > 0 AS "hasSteps",
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
          ${favExpr}     AS "isFavorite",
          ${isOwnerExpr} AS "isOwner",
          u.display_name  AS "ownerDisplayName",
          u.avatar_url    AS "ownerAvatarUrl"
        FROM recipes r
        LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        LEFT JOIN users u ON u.id = r.created_by
        WHERE r.id = ANY(${sql`ARRAY[${sql.join(sqlMatchedIds.map((id) => sql`${id}`), sql`, `)}]::int[]`})
        GROUP BY r.id, u.display_name, u.avatar_url
        ORDER BY r.id
      `);
      const rawHyd = (hydRows as unknown as { rows: AiSearchRow[] }).rows
        ?? (hydRows as unknown as AiSearchRow[]);

      // g) matchedInNotes: Term kommt in Notizen vor, aber NICHT in Titel/Kategorie/Zutaten/Tags
      sqlMatchedRecipes = rawHyd.map((r) => {
        const ingNames = (r.ingredients as Array<{ name: string }>).map((i) => i.name.toLowerCase());
        const titleLower    = r.title.toLowerCase();
        const notesLower    = (r.notes ?? "").toLowerCase();
        const categoryLower = r.category.toLowerCase();
        const tagsLower     = (r.tags ?? []).map((t: string) => t.toLowerCase());

        const matchedInNotes = searchTerms.length > 0 && searchTerms.some((term) => {
          const tl = term.toLowerCase();
          if (!notesLower.includes(tl)) return false;
          return !titleLower.includes(tl)
            && !categoryLower.includes(tl)
            && !ingNames.some((n) => n.includes(tl))
            && !tagsLower.some((t) => t.includes(tl));
        });

        return {
          ...r,
          imageUrl:      sanitizeImageUrl(r.imageUrl),
          mainPhotoUrl:  r.mainPhotoUrl ?? null,
          seasons:       r.seasons ?? [],
          tags:          r.tags ?? [],
          isAiGenerated: r.isAiGenerated ?? false,
          imageSource:   r.imageSource ?? null,
          tried:         r.tried ?? false,
          chefPick:      r.chefPick ?? false,
          owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
            ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
            : null,
          matchedInNotes,
        };
      });
    }

    // -----------------------------------------------------------------------
    // SCHRITT 2: Parallelbetrieb — JS-Filter zur Verifikation
    // Antwort kommt aus dem SQL-Weg; bei Abweichung req.log.warn.
    // -----------------------------------------------------------------------
    const allRecipesResult = await getRecipesWithIngredients(currentUserId, filter, 1, 1000);
    const allRecipes = allRecipesResult.recipes;

    const jsMatchedIds = allRecipes
      .filter((recipe) => {
        const ingNames      = (recipe.ingredients as Array<{ name: string }>).map((i) => i.name.toLowerCase());
        const titleLower    = recipe.title.toLowerCase();
        const notesLower    = (recipe.notes ?? "").toLowerCase();
        const categoryLower = recipe.category.toLowerCase();

        // a) exclusions
        if (criteria.exclusions.length > 0) {
          const hit = criteria.exclusions.some((excl) => {
            const el = excl.toLowerCase();
            return ingNames.some((n) => n.includes(el)) || titleLower.includes(el) || categoryLower.includes(el);
          });
          if (hit) return false;
        }

        // b/c) diet
        if (criteria.diet) {
          const dl = criteria.diet.toLowerCase();
          if (dl === "vegetarisch" || dl === "vegan") {
            const hasMeat = MEAT_KEYWORDS_VEG.some((kw) =>
              ingNames.some((n) => n.includes(kw)) || titleLower.includes(kw) || categoryLower.includes(kw)
            );
            if (hasMeat) return false;
          } else if (dl === "fleisch") {
            const meatCategories = ["fleisch", "geflügel", "fisch"];
            if (!meatCategories.some((mc) => categoryLower.includes(mc))) {
              const hasMeat = MEAT_KEYWORDS_FLEISCH.some((kw) =>
                ingNames.some((n) => n.includes(kw)) || titleLower.includes(kw)
              );
              if (!hasMeat) return false;
            }
          }
        }

        // d) maxMinutes
        if (criteria.maxMinutes) {
          if (recipe.totalTime) {
            const m = recipe.totalTime.match(/(\d+)/g);
            if (m) {
              const nums = m.map(Number);
              const mins = nums.length === 1 ? nums[0] : nums[0] * 60 + (nums[1] ?? 0);
              if (mins > criteria.maxMinutes) return false;
            }
          } else if (recipe.prepTime) {
            const m = recipe.prepTime.match(/(\d+)/g);
            if (m) {
              const nums = m.map(Number);
              const mins = nums.length === 1 ? nums[0] : nums[0] * 60 + (nums[1] ?? 0);
              if (mins > criteria.maxMinutes) return false;
            }
          }
        }

        // e) searchTerms
        if (searchTerms.length === 0) return true;
        return searchTerms.some((term) => {
          const tl = term.toLowerCase();
          return titleLower.includes(tl) || notesLower.includes(tl) || categoryLower.includes(tl) || ingNames.some((n) => n.includes(tl));
        });
      })
      .map((r) => r.id);

    // Vergleich
    const sqlIdSet  = new Set(sqlMatchedIds);
    const jsIdSet   = new Set(jsMatchedIds);
    const onlyInSql = sqlMatchedIds.filter((id) => !jsIdSet.has(id));
    const onlyInJs  = jsMatchedIds.filter((id) => !sqlIdSet.has(id));
    if (onlyInSql.length > 0 || onlyInJs.length > 0) {
      req.log.warn({ onlyInSql, onlyInJs, criteria }, "ai-search SQL/JS filter mismatch");
    }

    // -----------------------------------------------------------------------
    // Antwort — aus dem SQL-Weg
    // -----------------------------------------------------------------------
    const ingredientCount = (criteria.ingredients ?? []).length;
    const exclusionCount  = (criteria.exclusions ?? []).length;
    const parts: string[] = [];
    if (ingredientCount > 0) parts.push(`mit ${criteria.ingredients.slice(0, 2).join(" & ")}`);
    if (exclusionCount  > 0) parts.push(`ohne ${criteria.exclusions.slice(0, 2).join(" & ")}`);
    if (criteria.maxMinutes) parts.push(`unter ${criteria.maxMinutes} Min.`);
    if (criteria.diet && criteria.diet !== "fleisch") parts.push(criteria.diet);

    const resultSummary = sqlMatchedRecipes.length === 0
      ? "Keine passenden Rezepte gefunden"
      : `${sqlMatchedRecipes.length} ${sqlMatchedRecipes.length === 1 ? "Rezept" : "Rezepte"}${parts.length > 0 ? " " + parts.join(", ") : ""} gefunden`;

    res.json({
      recipes: sqlMatchedRecipes,
      summary: resultSummary,
      criteria,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to process AI recipe search");
    res.status(500).json({ error: "internal_error", message: "KI-Suche fehlgeschlagen" });
  }
});

// ---------------------------------------------------------------------------
// GET /recipes/search
// ---------------------------------------------------------------------------

router.get("/recipes/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const currentUserId = req.authUser?.id;
    const filter = req.query.filter as string | undefined;

    if (!q) {
      // Der Client (MeineRezepte.tsx:734-740) sendet bei leerem Suchfeld nie eine Anfrage.
      // Leeres Array statt 1000 Rezepte laden.
      return res.json([]);
    }

    // Mehrwort-Suche: q in Einzelwörter zerlegen, Kurzwörter und Füllwörter verwerfen.
    const STOPWORDS_SEARCH = new Set(["mit", "und", "der", "die", "das", "im", "in", "am"]);
    const words = q
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2 && !STOPWORDS_SEARCH.has(w));

    if (words.length === 0) {
      return res.json([]);
    }

    const filterExpr = filter === "mine" && currentUserId != null
      ? sql`(${recipesTable.createdBy} IS NULL OR ${recipesTable.createdBy} = ${currentUserId})`
      : filter === "favorites" && currentUserId != null
        ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = ${recipesTable.id} AND rf.user_id = ${currentUserId})`
        : undefined;

    // Für jedes Wort: muss in mindestens einem Feld vorkommen (OR über Felder).
    // Alle Wörter müssen passen (AND über Wörter).
    const wordConditions = words.map((word) => {
      const p = `%${escapeLike(word)}%`;
      return sql`(
        ${recipesTable.title} ILIKE ${p}
        OR COALESCE(${recipesTable.notes}, '') ILIKE ${p}
        OR COALESCE(${recipesTable.category}, '') ILIKE ${p}
        OR EXISTS (
          SELECT 1 FROM ${recipeIngredientsTable} ri2
          WHERE ri2.recipe_id = ${recipesTable.id}
          AND ri2.name ILIKE ${p}
        )
        OR EXISTS (
          SELECT 1 FROM unnest(ARRAY(SELECT jsonb_array_elements_text(${recipesTable.steps}))) AS step
          WHERE step ILIKE ${p}
        )
      )`;
    });

    const matchingRecipeIds = await db
      .selectDistinct({ id: recipesTable.id })
      .from(recipesTable)
      .leftJoin(recipeIngredientsTable, eq(recipeIngredientsTable.recipeId, recipesTable.id))
      .where(and(isNull(recipesTable.deletedAt), filterExpr, ...wordConditions));

    if (matchingRecipeIds.length === 0) {
      return res.json([]);
    }

    const ids = matchingRecipeIds.map((r) => r.id);
    const favExpr2 = currentUserId != null
      ? sql`EXISTS(SELECT 1 FROM recipe_favorites rf WHERE rf.recipe_id = r.id AND rf.user_id = ${currentUserId})`
      : sql`false`;
    const isOwnerExpr2 = currentUserId != null
      ? sql`(r.created_by IS NULL OR r.created_by = ${currentUserId})`
      : sql`(r.created_by IS NULL)`;

    const searchRows = await db.execute(sql`
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
        jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) > 0 AS "hasSteps",
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
        ${favExpr2}     AS "isFavorite",
        ${isOwnerExpr2} AS "isOwner",
        u.display_name  AS "ownerDisplayName",
        u.avatar_url    AS "ownerAvatarUrl"
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = ANY(${sql`ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]::int[]`})
      GROUP BY r.id, u.display_name, u.avatar_url
      ORDER BY r.id
    `);

    type SearchRow = {
      id: number; title: string; servings: number | null; prepTime: string | null;
      totalTime: string | null; difficulty: string; category: string; rating: string | null;
      kcalPerPortion: number | null; source: string | null; lastCooked: string | null;
      cookedCount: number | null; notes: string | null; hasSteps: boolean;
      imageUrl: string | null; mainPhotoUrl: string | null; createdAt: Date | string | null;
      seasons: string[] | null; tags: string[] | null; createdBy: number | null;
      parentRecipeId: number | null; variantName: string | null; sourceDocumentUrl: string | null;
      isAiGenerated: boolean; imageSource: string | null; tried: boolean; chefPick: boolean;
      ingredients: Array<{ id: number; recipeId: number; amount: string; unit: string; name: string; note: string | null }>;
      isFavorite: boolean; isOwner: boolean; ownerDisplayName: string | null; ownerAvatarUrl: string | null;
    };

    const rawSearchRows = (searchRows as unknown as { rows: SearchRow[] }).rows ?? (searchRows as unknown as SearchRow[]);

    const result = rawSearchRows.map((r) => {
      const titleLower = r.title.toLowerCase();
      const notesLower = (r.notes ?? "").toLowerCase();
      const categoryLower = r.category.toLowerCase();
      const ingNames = (r.ingredients as Array<{ name: string }>).map((i) => i.name.toLowerCase());
      const tagsLower = (r.tags ?? []).map((t: string) => t.toLowerCase());
      // matchedInNotes: mindestens ein Suchwort ist ausschließlich in den Notizen zu finden
      const matchedInNotes = words.some((word) => {
        const inTitle = titleLower.includes(word);
        const inCategory = categoryLower.includes(word);
        const inIng = ingNames.some((n) => n.includes(word));
        const inTags = tagsLower.some((t) => t.includes(word));
        return !inTitle && !inCategory && !inIng && !inTags && notesLower.includes(word);
      });
      return {
        id: r.id, title: r.title, servings: r.servings, prepTime: r.prepTime,
        totalTime: r.totalTime, difficulty: r.difficulty, category: r.category,
        rating: r.rating, kcalPerPortion: r.kcalPerPortion, source: r.source,
        lastCooked: r.lastCooked, cookedCount: r.cookedCount, notes: r.notes,
        steps: [] as unknown[], hasSteps: r.hasSteps ?? false,
        imageUrl: sanitizeImageUrl(r.imageUrl), mainPhotoUrl: r.mainPhotoUrl ?? null,
        createdAt: r.createdAt, seasons: r.seasons ?? [], tags: r.tags ?? [],
        createdBy: r.createdBy, parentRecipeId: r.parentRecipeId, variantName: r.variantName,
        sourceDocumentUrl: r.sourceDocumentUrl, isAiGenerated: r.isAiGenerated ?? false,
        imageSource: r.imageSource ?? null, tried: r.tried ?? false, chefPick: r.chefPick ?? false,
        ingredients: r.ingredients,
        isFavorite: r.isFavorite, isOwner: r.isOwner,
        owner: (r.ownerDisplayName != null || r.ownerAvatarUrl != null)
          ? { displayName: r.ownerDisplayName!, avatarUrl: r.ownerAvatarUrl }
          : null,
        matchedInNotes,
      };
    });

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to search recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to search recipes" });
  }
});

// ---------------------------------------------------------------------------
// GET /recipes  (Hauptliste mit ETag-Cache)
// ---------------------------------------------------------------------------

router.get("/recipes", async (req, res) => {
  try {
    const currentUserId = req.authUser?.id;
    const filter = req.query.filter as string | undefined;
    const page = req.query.page != null ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
    const limit = req.query.limit != null ? Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 24)) : 24;

    const queryFilters = {
      category: req.query.category as string | undefined,
      time: req.query.time as string | undefined,
      season: req.query.season as string | undefined,
      cooked: req.query.cooked as string | undefined,
      photoType: req.query.photoType as string | undefined,
      variants: req.query.variants as string | undefined,
      chefPick: req.query.chefPick as string | undefined,
      sort: req.query.sort as string | undefined,
      dir: req.query.dir as string | undefined,
    };

    const cacheKey = recipeListCacheKey(currentUserId, filter, page, limit, queryFilters);
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

    const result = await getRecipesWithIngredients(currentUserId, filter, page, limit, queryFilters);
    const body = JSON.stringify(result);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 24)}"`;
    cacheSet(cacheKey, { etag, body });
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

// ---------------------------------------------------------------------------
// GET /recipes/duplicates
// ---------------------------------------------------------------------------

router.get("/recipes/duplicates", async (req, res) => {
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

// ---------------------------------------------------------------------------
// GET /recipes/confirm-delete
// ---------------------------------------------------------------------------

router.get("/recipes/confirm-delete", async (req, res) => {
  try {
    const token = String(req.query["token"] ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    const [tokenRow] = await db
      .select()
      .from(deleteConfirmationTokensTable)
      .where(eq(deleteConfirmationTokensTable.token, token));

    if (!tokenRow) {
      res.status(404).json({ error: "invalid_token", message: "Token ungültig oder nicht gefunden." });
      return;
    }

    if (tokenRow.usedAt) {
      res.status(410).json({ error: "token_used", message: "Dieser Link wurde bereits verwendet." });
      return;
    }

    if (new Date() > tokenRow.expiresAt) {
      res.status(410).json({ error: "token_expired", message: "Dieser Link ist abgelaufen (15 Minuten Gültigkeitsdauer)." });
      return;
    }

    await db.transaction(async (tx) => {
      const updated = await tx.update(deleteConfirmationTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(deleteConfirmationTokensTable.id, tokenRow.id),
            isNull(deleteConfirmationTokensTable.usedAt)
          )
        )
        .returning({ id: deleteConfirmationTokensTable.id });

      if (updated.length === 0) {
        throw Object.assign(new Error("token_used"), { code: "token_used" });
      }

      await tx.delete(recipeIngredientsTable);
      await tx.delete(recipesTable);
    });

    invalidateRecipeListCache();

    res.json({ success: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "token_used") {
      res.status(410).json({ error: "token_used", message: "Dieser Link wurde bereits verwendet." });
      return;
    }
    req.log.error({ err }, "Failed to confirm delete all recipes");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Löschen der Rezepte." });
  }
});

// ---------------------------------------------------------------------------
// GET /recipes/stats
// ---------------------------------------------------------------------------

router.get("/recipes/stats", async (req, res) => {
  try {
    // Total + veryDeliciousCount in one pass
    const aggResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE rating = 'sehr lecker')::int AS very_delicious_count
      FROM recipes
      WHERE deleted_at IS NULL
    `);
    const aggRows = (aggResult as unknown as { rows: Array<Record<string, unknown>> }).rows
      ?? (aggResult as unknown as Array<Record<string, unknown>>);
    const agg = aggRows[0] ?? {};

    // Categories sorted desc
    const catResult = await db.execute(sql`
      SELECT category AS name, COUNT(*)::int AS value
      FROM recipes
      WHERE deleted_at IS NULL
      GROUP BY category
      ORDER BY value DESC
    `);
    const catRows = (catResult as unknown as { rows: Array<{ name: string; value: number }> }).rows
      ?? (catResult as unknown as Array<{ name: string; value: number }>);

    // Difficulties
    const diffResult = await db.execute(sql`
      SELECT difficulty AS name, COUNT(*)::int AS value
      FROM recipes
      WHERE deleted_at IS NULL
      GROUP BY difficulty
    `);
    const diffRows = (diffResult as unknown as { rows: Array<{ name: string; value: number }> }).rows
      ?? (diffResult as unknown as Array<{ name: string; value: number }>);

    // Time buckets — uses totalTimeParsedMinutesSql helper (same logic as /recipes time filter)
    // NULL = no parseable time → "ohne Angabe" bucket
    const timeResult = await db.execute(sql`
      WITH time_parsed AS (
        SELECT ${totalTimeParsedMinutesSql("total_time")} AS minutes
        FROM recipes
        WHERE deleted_at IS NULL
      )
      SELECT
        CASE
          WHEN minutes IS NULL THEN 'ohne Angabe'
          WHEN minutes > 60 THEN '>60 Min'
          WHEN minutes <= 30 THEN '≤30 Min'
          WHEN minutes <= 45 THEN '31–45 Min'
          ELSE '46–60 Min'
        END AS bucket,
        COUNT(*)::int AS "Rezepte"
      FROM time_parsed
      GROUP BY bucket
    `);
    const timeRows = (timeResult as unknown as { rows: Array<{ bucket: string; Rezepte: number }> }).rows
      ?? (timeResult as unknown as Array<{ bucket: string; Rezepte: number }>);

    // Top 3: rating score desc, then cooked_count desc
    const top3Result = await db.execute(sql`
      SELECT
        id, title, rating,
        cooked_count AS "cookedCount",
        category
      FROM recipes
      WHERE deleted_at IS NULL
      ORDER BY
        CASE rating WHEN 'sehr lecker' THEN 2 WHEN 'lecker' THEN 1 ELSE 0 END DESC,
        COALESCE(cooked_count, 0) DESC
      LIMIT 3
    `);
    const top3Rows = (top3Result as unknown as { rows: Array<{ id: number; title: string; rating: string | null; cookedCount: number | null; category: string }> }).rows
      ?? (top3Result as unknown as Array<{ id: number; title: string; rating: string | null; cookedCount: number | null; category: string }>);

    // avgIngredients: rounded average over ALL non-deleted recipes
    // (recipes with 0 ingredients count as 0, not excluded from denominator)
    const avgResult = await db.execute(sql`
      SELECT COALESCE(ROUND(AVG(cnt))::int, 0) AS avg_ingredients
      FROM (
        SELECT r.id, COUNT(ri.recipe_id)::int AS cnt
        FROM recipes r
        LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        WHERE r.deleted_at IS NULL
        GROUP BY r.id
      ) sub
    `);
    const avgRows = (avgResult as unknown as { rows: Array<{ avg_ingredients: number }> }).rows
      ?? (avgResult as unknown as Array<{ avg_ingredients: number }>);

    const BUCKET_NAMES = ["≤30 Min", "31–45 Min", "46–60 Min", ">60 Min", "ohne Angabe"];
    const bucketMap: Record<string, number> = {};
    for (const row of timeRows) {
      bucketMap[row.bucket] = Number(row.Rezepte ?? 0);
    }

    // hasVariants
    const hasVariantsResult = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM recipes WHERE deleted_at IS NULL AND parent_recipe_id IS NOT NULL
      ) AS has_variants
    `);
    const hasVariantsRows = (hasVariantsResult as unknown as { rows: Array<{ has_variants: boolean }> }).rows
      ?? (hasVariantsResult as unknown as Array<{ has_variants: boolean }>);
    const hasVariants = Boolean(hasVariantsRows[0]?.has_variants);

    // seasonal (current season, max 12)
    const month = new Date().getMonth() + 1;
    const currentSeason = month >= 3 && month <= 5 ? "spring"
      : month >= 6 && month <= 8 ? "summer"
      : month >= 9 && month <= 11 ? "autumn"
      : "winter";
    const seasonalResult = await db.execute(sql`
      SELECT id, title, category, image_url AS "imageUrl"
      FROM recipes
      WHERE deleted_at IS NULL AND seasons @> jsonb_build_array(${currentSeason})
      ORDER BY id
      LIMIT 12
    `);
    const seasonalRows = (seasonalResult as unknown as { rows: Array<{ id: number; title: string; category: string; imageUrl: string | null }> }).rows
      ?? (seasonalResult as unknown as Array<{ id: number; title: string; category: string; imageUrl: string | null }>);

    res.json({
      total: Number(agg.total ?? 0),
      categories: catRows.map((r) => ({ name: r.name, value: Number(r.value) })),
      difficulties: diffRows.map((r) => ({ name: r.name, value: Number(r.value) })),
      timeBuckets: BUCKET_NAMES.map((name) => ({ name, Rezepte: bucketMap[name] ?? 0 })),
      top3: top3Rows.map((r) => ({
        id: r.id,
        title: r.title,
        rating: r.rating ?? null,
        cookedCount: r.cookedCount != null ? Number(r.cookedCount) : null,
        category: r.category,
      })),
      veryDeliciousCount: Number(agg.very_delicious_count ?? 0),
      avgIngredients: Number(avgRows[0]?.avg_ingredients ?? 0),
      hasVariants,
      seasonal: seasonalRows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        category: r.category,
        imageUrl: r.imageUrl ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get recipe stats");
    res.status(500).json({ error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// GET /ingredients
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /recipes/suggest
// ---------------------------------------------------------------------------

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

router.post("/recipes/suggest", authMiddleware, aiLimiter, async (req, res) => {
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

    const topScored = scoredRecipes.slice(0, 20);
    const topIds = topScored.map(({ recipe }) => recipe.id);
    const fullStepsMap = await getFullRecipesByIds(topIds);

    const results = topScored.map(({ recipe, score, ingredientMatches }) => ({
      ...recipe,
      steps: fullStepsMap[recipe.id] ?? [],
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

export default router;
