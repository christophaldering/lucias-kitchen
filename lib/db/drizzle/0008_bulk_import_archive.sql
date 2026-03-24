ALTER TABLE "bulk_import_sessions" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "bulk_import_sessions" ADD COLUMN "archived" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "bulk_import_sessions" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "bulk_import_sessions" ADD CONSTRAINT "bulk_import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
