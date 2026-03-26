ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "is_ai_generated" boolean NOT NULL DEFAULT false;

UPDATE "recipes"
SET "is_ai_generated" = true
WHERE "image_url" LIKE '/api/storage/recipe-images/%';
