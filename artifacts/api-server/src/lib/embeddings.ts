/**
 * Embedding-Infrastruktur — Etappe A der semantischen Suche.
 *
 * Modell:       Gemini text-embedding-004 (768 Dimensionen)
 * Speicherweg:  JSONB (float[]-Array)
 * Invalidierung: content_hash = sha256(EMBEDDING_MODEL + ":" + text)
 *               → Modellwechsel invalidiert alle bestehenden Embeddings automatisch.
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
import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger";

const EMBEDDING_MODEL = "text-embedding-004";
const BATCH_SIZE = 50; // konservativ wegen Gemini-Rate-Limits
const CONCURRENCY = 5; // parallele API-Aufrufe pro Batch

// (GoogleGenAI wird aktuell nicht genutzt — direkter fetch-Aufruf umgeht
//  das interne batchEmbedContents, das der Proxy nicht unterstützt.)
void GoogleGenAI; // verhindert "unused import"-Warnung

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

/**
 * Bettet einen einzelnen Text via Gemini embedContent ein.
 * Nutzt direkten fetch statt des SDKs, weil der Proxy kein batchEmbedContents
 * unterstützt (das der SDK-Client intern verwendet).
 */
async function embedSingleText(text: string): Promise<number[] | null> {
  const baseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";

  const url = `${baseUrl}/models/${EMBEDDING_MODEL}:embedContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedContent: HTTP ${res.status} — ${body}`);
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  return data.embedding?.values ?? null;
}

/**
 * Bettet mehrere Texte ein — mit begrenzter Parallelität (CONCURRENCY).
 * Wirft bei Fehler, damit der Aufrufer das Batch-Fehlerhandling übernimmt.
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);

  for (let start = 0; start < texts.length; start += CONCURRENCY) {
    const chunk = texts.slice(start, start + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((t) => embedSingleText(t)),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected" || s.value === null) {
        throw new Error(
          `Embedding für Index ${start + i} fehlgeschlagen: ${
            s.status === "rejected" ? String(s.reason) : "leere Antwort"
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
 * Inhalt sich geändert hat. Wird nach Create/Update fire-and-forget aufgerufen.
 */
export async function upsertEmbeddingForRecipe(recipeId: number): Promise<void> {
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

  // Nur API-Aufruf wenn Inhalt sich geändert hat
  const [existing] = await db
    .select({ contentHash: recipeEmbeddingsTable.contentHash })
    .from(recipeEmbeddingsTable)
    .where(eq(recipeEmbeddingsTable.recipeId, recipeId));

  if (existing?.contentHash === hash) return;

  const embedding = await embedSingleText(text);
  if (!embedding) {
    logger.warn({ recipeId }, "Embeddings: API-Aufruf lieferte keinen Vektor.");
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
}

/**
 * Hintergrund-Befüllung: alle Rezepte ohne Embedding oder mit veraltetem
 * content_hash in Batches einbetten.
 * Nicht blockierend — wird beim Serverstart fire-and-forget gestartet.
 */
export async function backfillEmbeddings(): Promise<void> {
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
    `Embeddings: ${toProcess.length} von ${allRecipes.length} Rezepten werden eingebettet (Gemini ${EMBEDDING_MODEL}, 768 dim) …`,
  );

  let done = 0;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embedTexts(batch.map((r) => r.text));
      const now = new Date();
      for (let j = 0; j < batch.length; j++) {
        const { id, hash } = batch[j];
        const embedding = embeddings[j];
        await db
          .insert(recipeEmbeddingsTable)
          .values({ recipeId: id, embedding, contentHash: hash, updatedAt: now })
          .onConflictDoUpdate({
            target: recipeEmbeddingsTable.recipeId,
            set: { embedding, contentHash: hash, updatedAt: now },
          });
      }
      done += batch.length;
      logger.info(`Embeddings: ${done}/${toProcess.length} fertig.`);
    } catch (err) {
      logger.error(
        { err, batchStart: i },
        "Embeddings: Batch-Fehler — überspringe und mache weiter.",
      );
    }
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
  try {
    return await embedSingleText(text);
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
