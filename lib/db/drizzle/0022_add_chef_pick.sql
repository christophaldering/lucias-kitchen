ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "chef_pick" boolean DEFAULT false NOT NULL;
