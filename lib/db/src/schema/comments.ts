import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";
import { usersTable } from "./users";

export const recipeCommentsTable = pgTable("recipe_comments", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  rating: integer("rating"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RecipeComment = typeof recipeCommentsTable.$inferSelect;
export type InsertRecipeComment = typeof recipeCommentsTable.$inferInsert;
