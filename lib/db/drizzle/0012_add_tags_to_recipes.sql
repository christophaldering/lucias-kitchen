ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}';
