CREATE TABLE IF NOT EXISTS "user_pantry" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ingredient_name" text NOT NULL,
	"expiry_priority" text DEFAULT 'good',
	"is_default" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_pantry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
