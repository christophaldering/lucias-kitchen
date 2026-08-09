import { pgTable, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";

/**
 * Speichert den Embedding-Vektor für jedes Rezept.
 * Vektor-Typ: JSONB (float[]-Array). pgvector optional; wird beim Start geprüft
 * und geloggt, der Speicherweg ist immer JSONB (~4 MB für 700 Rezepte — unkritisch).
 */
export const recipeEmbeddingsTable = pgTable("recipe_embeddings", {
  recipeId: integer("recipe_id")
    .primaryKey()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  embedding: jsonb("embedding").notNull(), // number[] mit 1536 Dimensionen
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
