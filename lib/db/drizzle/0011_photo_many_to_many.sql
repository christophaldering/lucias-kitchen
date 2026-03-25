-- Create the standalone photos table
CREATE TABLE IF NOT EXISTS "photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "image_url" text NOT NULL,
  "uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "caption" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create the recipe_photo_links join table
CREATE TABLE IF NOT EXISTS "recipe_photo_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "photo_id" integer NOT NULL REFERENCES "photos"("id") ON DELETE CASCADE,
  "recipe_id" integer NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_main" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_photo_links_photo_recipe_unique" UNIQUE("photo_id", "recipe_id")
);

CREATE INDEX IF NOT EXISTS "recipe_photo_links_recipe_id_idx" ON "recipe_photo_links"("recipe_id");
CREATE INDEX IF NOT EXISTS "recipe_photo_links_photo_id_idx" ON "recipe_photo_links"("photo_id");

-- Migrate existing recipe_photos entries into the new tables
INSERT INTO "photos" ("image_url", "created_at")
SELECT "image_url", "created_at"
FROM "recipe_photos"
ON CONFLICT DO NOTHING;

-- Create links for migrated recipe_photos
INSERT INTO "recipe_photo_links" ("photo_id", "recipe_id", "sort_order", "is_main", "created_at")
SELECT p."id", rp."recipe_id", 0, false, rp."created_at"
FROM "recipe_photos" rp
JOIN "photos" p ON p."image_url" = rp."image_url" AND p."created_at" = rp."created_at"
ON CONFLICT DO NOTHING;

-- Migrate recipes.image_url as "main" photo links (only for recipes that have an imageUrl not already in photos)
INSERT INTO "photos" ("image_url", "created_at")
SELECT DISTINCT r."image_url", COALESCE(r."created_at", now())
FROM "recipes" r
WHERE r."image_url" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "photos" ph WHERE ph."image_url" = r."image_url"
  )
ON CONFLICT DO NOTHING;

-- Create is_main=true links from recipes.image_url
INSERT INTO "recipe_photo_links" ("photo_id", "recipe_id", "sort_order", "is_main", "created_at")
SELECT p."id", r."id", -1, true, COALESCE(r."created_at", now())
FROM "recipes" r
JOIN "photos" p ON p."image_url" = r."image_url"
WHERE r."image_url" IS NOT NULL
ON CONFLICT ("photo_id", "recipe_id") DO UPDATE
  SET "is_main" = true, "sort_order" = -1;
