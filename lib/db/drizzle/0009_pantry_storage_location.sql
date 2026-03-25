ALTER TABLE "user_pantry" ADD COLUMN IF NOT EXISTS "storage_location" text NOT NULL DEFAULT 'fridge';
ALTER TABLE "user_pantry" ADD COLUMN IF NOT EXISTS "expiry_date" text;
UPDATE "user_pantry" SET "storage_location" = 'pantry' WHERE "is_default" = 1;
