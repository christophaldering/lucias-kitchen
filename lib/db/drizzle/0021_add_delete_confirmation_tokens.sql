CREATE TABLE IF NOT EXISTS "delete_confirmation_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
