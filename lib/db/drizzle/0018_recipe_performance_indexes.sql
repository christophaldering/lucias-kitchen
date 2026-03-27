CREATE INDEX IF NOT EXISTS "recipes_deleted_at_idx" ON "recipes" USING btree ("deleted_at");
CREATE INDEX IF NOT EXISTS "recipes_created_by_idx" ON "recipes" USING btree ("created_by");
CREATE INDEX IF NOT EXISTS "recipes_category_idx" ON "recipes" USING btree ("category");
