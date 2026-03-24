ALTER TABLE "users" ADD COLUMN "active_bulk_import_session_id" integer;--> statement-breakpoint
ALTER TABLE "bulk_import_files" ADD COLUMN "pdf_storage_path" text;--> statement-breakpoint
ALTER TABLE "bulk_import_files" ADD COLUMN "error_text" text;--> statement-breakpoint
ALTER TABLE "bulk_import_files" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "bulk_import_files" ADD COLUMN "finished_at" timestamp;
