import { pgTable, text, serial, integer, jsonb, date, unique, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

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
  steps: jsonb("steps").notNull().default([]),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  seasons: text("seasons").array().default([]),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  parentRecipeId: integer("parent_recipe_id"),
  variantName: text("variant_name"),
});

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  amount: text("amount").notNull().default(""),
  unit: text("unit").notNull().default(""),
  name: text("name").notNull(),
  note: text("note"),
});

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
