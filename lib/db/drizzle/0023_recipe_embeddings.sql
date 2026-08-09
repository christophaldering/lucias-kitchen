CREATE TABLE IF NOT EXISTS "recipe_embeddings" (
  "recipe_id" integer PRIMARY KEY REFERENCES "recipes"("id") ON DELETE CASCADE,
  "embedding" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
