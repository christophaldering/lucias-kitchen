ALTER TABLE "bulk_import_items" ADD COLUMN IF NOT EXISTS "photo_page_urls" jsonb NOT NULL DEFAULT '[]'::jsonb;
