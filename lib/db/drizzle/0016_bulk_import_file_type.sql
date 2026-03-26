ALTER TABLE "bulk_import_files" ADD COLUMN IF NOT EXISTS "file_type" text NOT NULL DEFAULT 'pdf';
