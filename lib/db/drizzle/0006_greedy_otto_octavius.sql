CREATE TYPE "public"."bulk_import_item_status" AS ENUM('pending', 'done', 'uncertain', 'handwriting', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bulk_import_session_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recipe_suggestion_status" AS ENUM('pending', 'saved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."group_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."group_member_status" AS ENUM('invited', 'joined');--> statement-breakpoint
CREATE TYPE "public"."group_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invitation_mode" AS ENUM('surprise', 'wishlist', 'vote', 'choice');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('open', 'decided', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'coming', 'not_coming');--> statement-breakpoint
CREATE TABLE "bulk_import_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"page_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "bulk_import_session_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_import_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"status" "bulk_import_item_status" DEFAULT 'pending' NOT NULL,
	"recipe_data" jsonb,
	"page_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_handwriting" boolean DEFAULT false NOT NULL,
	"error_text" text,
	"rejected" boolean DEFAULT false NOT NULL,
	"saved_recipe_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_import_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "bulk_import_session_status" DEFAULT 'pending' NOT NULL,
	"total_files" integer DEFAULT 0 NOT NULL,
	"processed_files" integer DEFAULT 0 NOT NULL,
	"current_file" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cooking_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"date" date NOT NULL,
	"comment" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"message" text,
	"status" "recipe_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer,
	"invited_email" text,
	"invited_by_user_id" integer,
	"role" "group_member_role" DEFAULT 'member' NOT NULL,
	"member_status" "group_member_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"status" "group_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"creator_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"rating" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_invitation_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_invitation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rsvp" "rsvp_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"host_user_id" integer NOT NULL,
	"date" text NOT NULL,
	"mode" "invitation_mode" NOT NULL,
	"status" "invitation_status" DEFAULT 'open' NOT NULL,
	"recipe_options" jsonb DEFAULT '[]'::jsonb,
	"final_recipe_id" integer,
	"deadline" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meal_wishes" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_invitation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"wish_text" text,
	"recipe_id" integer,
	"ranking" integer,
	"constraints" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "personal_notes" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "seasons" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "bulk_import_files" ADD CONSTRAINT "bulk_import_files_session_id_bulk_import_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."bulk_import_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_items" ADD CONSTRAINT "bulk_import_items_session_id_bulk_import_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."bulk_import_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_items" ADD CONSTRAINT "bulk_import_items_file_id_bulk_import_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."bulk_import_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_log" ADD CONSTRAINT "cooking_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_log" ADD CONSTRAINT "cooking_log_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestions" ADD CONSTRAINT "recipe_suggestions_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestions" ADD CONSTRAINT "recipe_suggestions_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestions" ADD CONSTRAINT "recipe_suggestions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_comments" ADD CONSTRAINT "recipe_comments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_comments" ADD CONSTRAINT "recipe_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_invitation_members" ADD CONSTRAINT "meal_invitation_members_meal_invitation_id_meal_invitations_id_fk" FOREIGN KEY ("meal_invitation_id") REFERENCES "public"."meal_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_invitation_members" ADD CONSTRAINT "meal_invitation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_invitations" ADD CONSTRAINT "meal_invitations_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_invitations" ADD CONSTRAINT "meal_invitations_final_recipe_id_recipes_id_fk" FOREIGN KEY ("final_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_wishes" ADD CONSTRAINT "meal_wishes_meal_invitation_id_meal_invitations_id_fk" FOREIGN KEY ("meal_invitation_id") REFERENCES "public"."meal_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_wishes" ADD CONSTRAINT "meal_wishes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_wishes" ADD CONSTRAINT "meal_wishes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;