ALTER TABLE "meal_invitation_members" ADD COLUMN IF NOT EXISTS "reminders_sent_at" jsonb DEFAULT '[]';
ALTER TABLE "meal_invitation_members" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
