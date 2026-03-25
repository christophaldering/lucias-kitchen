ALTER TABLE "group_members" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "invite_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invite_token_unique" UNIQUE("invite_token");
