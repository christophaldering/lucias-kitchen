import { pgTable, text, serial, integer, jsonb } from "drizzle-orm/pg-core";
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
  steps: jsonb("steps").notNull().default([]),
});

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  amount: text("amount").notNull().default(""),
  unit: text("unit").notNull().default(""),
  name: text("name").notNull(),
  note: text("note"),
});

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;

export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredientsTable).omit({ id: true });
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type RecipeIngredient = typeof recipeIngredientsTable.$inferSelect;
