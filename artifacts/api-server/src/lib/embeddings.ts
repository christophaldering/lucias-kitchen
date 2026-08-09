/**
 * Embedding-Infrastruktur — semantische Suche.
 *
 * Modell:       Gemini gemini-embedding-001 (3072 Dimensionen)
 * API:          Echter Google-Endpunkt (GEMINI_API_KEY), nicht der Replit-Proxy
 *               (der Proxy unterstützt keine Embedding-Endpunkte)
 * Speicherweg:  JSONB (float[]-Array, keine Größenbeschränkung)
 * Invalidierung: content_hash = sha256(EMBEDDING_MODEL + ":" + text)
 *               → Modellwechsel markiert alle Einträge automatisch als veraltet.
 *
 * Eingebetteter Text: Titel, Kategorie, Tags, Zutatennamen, notes.
 * AUSDRÜCKLICH NICHT: personalNotes oder andere nutzerbezogene Daten.
 */

import { createHash } from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  recipesTable,
  recipeIngredientsTable,
  recipeEmbeddingsTable,
} from "@workspace/db/schema";
import { eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

const EMBEDDING_MODEL = "gemini-embedding-001"; // 3072 dim, stabil; text-embedding-004 nicht verfügbar
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Wie viele Texte parallel per embedContent eingebettet werden.
 * Google AI Studio Free Tier: ~100 RPM → CONCURRENCY ≤ 5 ist sicher.
 */
const BATCH_SIZE    = 100; // Rezepte pro "Chunk" (sequenzielle Verarbeitung)
const CONCURRENCY   =   5; // parallele embedContent-Aufrufe innerhalb eines Chunks
/** Max. Wiederholungsversuche bei 429 / RESOURCE_EXHAUSTED */
const MAX_RETRIES   = 5;

// ---------------------------------------------------------------------------
// Interne Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Hash über Modellname + Text — damit ein Modellwechsel alle gespeicherten
 * Embeddings automatisch als veraltet markiert.
 */
function hashText(text: string): string {
  return createHash("sha256")
    .update(EMBEDDING_MODEL + ":" + text, "utf8")
    .digest("hex");
}

function buildEmbeddingText(
  recipe: {
    title: string;
    category: string;
    tags: string[] | null;
    notes: string | null;
  },
  ingredientNames: string[],
): string {
  const parts: string[] = [
    recipe.title,
    recipe.category,
    ...(recipe.tags ?? []),
    ...ingredientNames,
  ];
  if (recipe.notes) parts.push(recipe.notes);
  return parts.filter(Boolean).join(". ");
}

/** Exponentielles Backoff mit Jitter (in ms). */
function backoffMs(attempt: number): number {
  return Math.pow(2, attempt) * 1000 + Math.random() * 500;
}

/** Gibt true zurück, wenn der Fehler ein Rate-Limit ist (429 / RESOURCE_EXHAUSTED). */
function isRateLimit(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
}

/**
 * Führt fn mit bis zu MAX_RETRIES Wiederholungen bei Rate-Limit-Fehlern aus.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRateLimit(err)) throw err;
      const ms = backoffMs(attempt);
      logger.warn(
        { attempt: attempt + 1, waitMs: Math.round(ms) },
        "Embeddings: Rate Limit (429) — warte und versuche erneut.",
      );
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Bettet einen einzelnen Text ein.
 * Nutzt POST /v1beta/models/{model}:embedContent direkt via fetch.
 */
async function embedSingleText(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) return null;

  const url = `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`embedContent HTTP ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  return data.embedding?.values ?? null;
}

/**
 * Bettet mehrere Texte ein, jeweils CONCURRENCY Aufrufe parallel.
 * Alle müssen erfolgreich sein — andernfalls wirft die Funktion.
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  for (let start = 0; start < texts.length; start += CONCURRENCY) {
    const chunk = texts.slice(start, start + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((t) => withRetry(() => embedSingleText(t))),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected" || s.value === null) {
        throw new Error(
          `Embedding Index ${start + i}: ${
            s.status === "rejected" ? String(s.reason) : "null-Antwort"
          }`,
        );
      }
      results[start + i] = s.value;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/**
 * Prüft beim Serverstart, ob pgvector verfügbar ist, und loggt das Ergebnis.
 * Der Speicherweg bleibt immer JSONB — diese Funktion ist rein informativ.
 */
export async function checkPgvectorSupport(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    logger.info(
      "Embeddings: pgvector-Extension verfügbar und aktiviert (Speicherweg trotzdem JSONB für Schemakompatibilität).",
    );
  } catch {
    logger.info(
      "Embeddings: pgvector nicht verfügbar — Vektoren werden als JSONB gespeichert.",
    );
  } finally {
    client.release();
  }
}

/**
 * Berechnet das Embedding für ein Rezept neu und speichert es, falls der
 * Inhalt sich geändert hat (hash check). Wird nach Create/Update aufgerufen.
 */
export async function upsertEmbeddingForRecipe(recipeId: number): Promise<void> {
  if (!process.env.GEMINI_API_KEY) return; // kein Key → überspringen

  const [recipe] = await db
    .select({
      id: recipesTable.id,
      title: recipesTable.title,
      category: recipesTable.category,
      tags: recipesTable.tags,
      notes: recipesTable.notes,
    })
    .from(recipesTable)
    .where(eq(recipesTable.id, recipeId));

  if (!recipe) return;

  const ingredients = await db
    .select({ name: recipeIngredientsTable.name })
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipeId));

  const text = buildEmbeddingText(recipe, ingredients.map((i) => i.name));
  const hash = hashText(text);

  const [existing] = await db
    .select({ contentHash: recipeEmbeddingsTable.contentHash })
    .from(recipeEmbeddingsTable)
    .where(eq(recipeEmbeddingsTable.recipeId, recipeId));

  if (existing?.contentHash === hash) return;

  try {
    const embedding = await withRetry(() => embedSingleText(text));
    if (!embedding || embedding.length === 0) {
      logger.warn({ recipeId }, "Embeddings: API lieferte keinen Vektor.");
      return;
    }
    const now = new Date();
    await db
      .insert(recipeEmbeddingsTable)
      .values({ recipeId, embedding, contentHash: hash, updatedAt: now })
      .onConflictDoUpdate({
        target: recipeEmbeddingsTable.recipeId,
        set: { embedding, contentHash: hash, updatedAt: now },
      });
    logger.debug({ recipeId }, "Embeddings: Vektor aktualisiert.");
  } catch (err) {
    logger.warn({ err, recipeId }, "Embeddings: upsert fehlgeschlagen — überspringe.");
  }
}

/**
 * Hintergrund-Befüllung: alle Rezepte ohne Embedding oder mit veraltetem
 * content_hash in Batches von je 50 Texten einbetten.
 * Bei 429-Fehlern: bis zu 5 Versuche mit exponentiellem Backoff.
 * Nicht blockierend — wird beim Serverstart fire-and-forget gestartet.
 */
export async function backfillEmbeddings(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    logger.info("Embeddings: GEMINI_API_KEY nicht gesetzt — Befüllung übersprungen.");
    return;
  }

  const allRecipes = await db
    .select({
      id: recipesTable.id,
      title: recipesTable.title,
      category: recipesTable.category,
      tags: recipesTable.tags,
      notes: recipesTable.notes,
    })
    .from(recipesTable)
    .where(isNull(recipesTable.deletedAt));

  if (allRecipes.length === 0) {
    logger.info("Embeddings: keine Rezepte vorhanden.");
    return;
  }

  const existingRows = await db
    .select({
      recipeId: recipeEmbeddingsTable.recipeId,
      contentHash: recipeEmbeddingsTable.contentHash,
    })
    .from(recipeEmbeddingsTable);

  const existingMap = new Map(existingRows.map((r) => [r.recipeId, r.contentHash]));

  const allIngredients = await db
    .select({
      recipeId: recipeIngredientsTable.recipeId,
      name: recipeIngredientsTable.name,
    })
    .from(recipeIngredientsTable);

  const ingByRecipe = new Map<number, string[]>();
  for (const ing of allIngredients) {
    if (!ingByRecipe.has(ing.recipeId)) ingByRecipe.set(ing.recipeId, []);
    ingByRecipe.get(ing.recipeId)!.push(ing.name);
  }

  const toProcess: Array<{ id: number; text: string; hash: string }> = [];
  for (const recipe of allRecipes) {
    const text = buildEmbeddingText(recipe, ingByRecipe.get(recipe.id) ?? []);
    const hash = hashText(text);
    if (existingMap.get(recipe.id) !== hash) {
      toProcess.push({ id: recipe.id, text, hash });
    }
  }

  if (toProcess.length === 0) {
    logger.info("Embeddings: alle Vektoren aktuell, nichts zu tun.");
    return;
  }

  logger.info(
    `Embeddings: ${toProcess.length} von ${allRecipes.length} Rezepten werden eingebettet ` +
    `(Gemini ${EMBEDDING_MODEL}, 3072 dim, ${CONCURRENCY} parallel) …`,
  );

  let done = 0;

  // BATCH_SIZE Rezepte pro Chunk, innerhalb jedes Chunks CONCURRENCY parallele Aufrufe
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const chunk = toProcess.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embedTexts(chunk.map((r) => r.text));
      const now = new Date();
      for (let j = 0; j < chunk.length; j++) {
        const { id, hash } = chunk[j];
        const embedding = embeddings[j];
        if (!embedding || embedding.length === 0) continue;
        try {
          await db
            .insert(recipeEmbeddingsTable)
            .values({ recipeId: id, embedding, contentHash: hash, updatedAt: now })
            .onConflictDoUpdate({
              target: recipeEmbeddingsTable.recipeId,
              set: { embedding, contentHash: hash, updatedAt: now },
            });
          done++;
        } catch (dbErr) {
          logger.warn({ dbErr, recipeId: id }, "Embeddings: DB-Insert fehlgeschlagen.");
        }
      }
    } catch (err) {
      logger.error(
        { err, chunkStart: i },
        "Embeddings: Chunk-Fehler (auch nach Retries) — überspringe.",
      );
    }
    logger.info(`Embeddings: ${done}/${toProcess.length} fertig.`);
  }

  logger.info(
    `Embeddings: Befüllung abgeschlossen (${done}/${toProcess.length} verarbeitet).`,
  );
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen für die semantische Suche (smart-search)
// ---------------------------------------------------------------------------

/**
 * Bettet einen Suchbegriff ein (gleicher Modellaufruf wie beim Backfill).
 * Gibt null zurück, wenn die API nicht verfügbar ist (graceful degradation).
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return await withRetry(() => embedSingleText(text));
  } catch {
    return null;
  }
}

/** Cosine-Ähnlichkeit zwischen zwei Vektoren gleicher Länge. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Lädt alle gespeicherten Embedding-Vektoren aus der DB.
 * Gibt eine Map von recipe_id → float[] zurück.
 */
export async function getRecipeEmbeddings(): Promise<Map<number, number[]>> {
  const rows = await db
    .select({
      recipeId: recipeEmbeddingsTable.recipeId,
      embedding: recipeEmbeddingsTable.embedding,
    })
    .from(recipeEmbeddingsTable);

  const map = new Map<number, number[]>();
  for (const row of rows) {
    if (Array.isArray(row.embedding)) {
      map.set(row.recipeId, row.embedding as number[]);
    }
  }
  return map;
}
