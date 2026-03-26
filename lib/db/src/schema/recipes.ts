import { pgTable, text, serial, integer, jsonb, date, unique, timestamp, pgEnum, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  servings: integer("servings"),
  prepTime: text("prep_time"),
  totalTime: text("total_time"),
  difficulty: text("difficulty").notNull().default("normal"),
  category: text("category").notNull(),
  rating: text("rating"),
  kcalPerPortion: integer("kcal_per_portion"),
  source: text("source"),
  lastCooked: text("last_cooked"),
  cookedCount: integer("cooked_count").default(0),
  notes: text("notes"),
  personalNotes: text("personal_notes"),
  steps: jsonb("steps").notNull().default([]),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  seasons: text("seasons").array().default([]),
  tags: text("tags").array().default([]),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  parentRecipeId: integer("parent_recipe_id"),
  variantName: text("variant_name"),
  sourceDocumentUrl: text("source_document_url"),
  deletedAt: timestamp("deleted_at"),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  imageSource: text("image_source"),
});

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  amount: text("amount").notNull().default(""),
  unit: text("unit").notNull().default(""),
  name: text("name").notNull(),
  note: text("note"),
}, (t) => [
  index("recipe_ingredients_recipe_id_idx").on(t.recipeId),
]);

export const mealPlansTable = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
}, (t) => [
  unique("meal_plans_date_user_unique").on(t.date, t.userId),
]);

export const recipeFavoritesTable = pgTable("recipe_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  unique("recipe_favorites_user_recipe_unique").on(t.userId, t.recipeId),
]);

export const recipePhotosTable = pgTable("recipe_photos", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RecipePhoto = typeof recipePhotosTable.$inferSelect;
export type InsertRecipePhoto = typeof recipePhotosTable.$inferInsert;

export const photosTable = pgTable("photos", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recipePhotoLinksTable = pgTable("recipe_photo_links", {
  id: serial("id").primaryKey(),
  photoId: integer("photo_id").notNull().references(() => photosTable.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isMain: boolean("is_main").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  unique("recipe_photo_links_photo_recipe_unique").on(t.photoId, t.recipeId),
  index("recipe_photo_links_recipe_id_idx").on(t.recipeId),
  index("recipe_photo_links_photo_id_idx").on(t.photoId),
]);

export type Photo = typeof photosTable.$inferSelect;
export type InsertPhoto = typeof photosTable.$inferInsert;
export type RecipePhotoLink = typeof recipePhotoLinksTable.$inferSelect;
export type InsertRecipePhotoLink = typeof recipePhotoLinksTable.$inferInsert;

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;

export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredientsTable).omit({ id: true });
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type RecipeIngredient = typeof recipeIngredientsTable.$inferSelect;

export type MealPlan = typeof mealPlansTable.$inferSelect;
export type RecipeFavorite = typeof recipeFavoritesTable.$inferSelect;

export const cookingLogTable = pgTable("cooking_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  comment: text("comment"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CookingLog = typeof cookingLogTable.$inferSelect;

export const recipeSuggestionStatusEnum = pgEnum("recipe_suggestion_status", ["pending", "saved", "ignored"]);

export const recipeSuggestionsTable = pgTable("recipe_suggestions", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  message: text("message"),
  status: recipeSuggestionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RecipeSuggestion = typeof recipeSuggestionsTable.$inferSelect;

export const bulkImportSessionStatusEnum = pgEnum("bulk_import_session_status", ["pending", "processing", "done", "failed"]);
export const bulkImportItemStatusEnum = pgEnum("bulk_import_item_status", ["pending", "done", "uncertain", "handwriting", "failed"]);

export const bulkImportSessionsTable = pgTable("bulk_import_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: bulkImportSessionStatusEnum("status").notNull().default("pending"),
  totalFiles: integer("total_files").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  currentFile: text("current_file"),
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bulkImportFilesTable = pgTable("bulk_import_files", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => bulkImportSessionsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  pageImageUrls: jsonb("page_image_urls").notNull().default([]),
  status: bulkImportSessionStatusEnum("status").notNull().default("pending"),
  pdfStoragePath: text("pdf_storage_path"),
  errorText: text("error_text"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bulkImportItemsTable = pgTable("bulk_import_items", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => bulkImportSessionsTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id").notNull().references(() => bulkImportFilesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  status: bulkImportItemStatusEnum("status").notNull().default("pending"),
  recipeData: jsonb("recipe_data"),
  pageNumbers: jsonb("page_numbers").notNull().default([]),
  pageImageUrls: jsonb("page_image_urls").notNull().default([]),
  photoPageUrls: jsonb("photo_page_urls").notNull().default([]),
  hasHandwriting: boolean("has_handwriting").notNull().default(false),
  errorText: text("error_text"),
  rejected: boolean("rejected").notNull().default(false),
  savedRecipeId: integer("saved_recipe_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BulkImportSession = typeof bulkImportSessionsTable.$inferSelect;
export type BulkImportFile = typeof bulkImportFilesTable.$inferSelect;
export type BulkImportItem = typeof bulkImportItemsTable.$inferSelect;
