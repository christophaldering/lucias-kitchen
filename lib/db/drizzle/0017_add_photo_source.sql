DO $$ BEGIN
  CREATE TYPE "public"."photo_source" AS ENUM('original', 'upload', 'ai', 'cooked', 'web');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "source" "photo_source";
