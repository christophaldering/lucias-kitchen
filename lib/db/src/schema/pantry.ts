import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userPantryTable = pgTable("user_pantry", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ingredientName: text("ingredient_name").notNull(),
  expiryPriority: text("expiry_priority").default("good"),
  isDefault: integer("is_default").notNull().default(0),
  storageLocation: text("storage_location").notNull().default("fridge"),
  expiryDate: text("expiry_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPantry = typeof userPantryTable.$inferSelect;
export type InsertUserPantry = typeof userPantryTable.$inferInsert;
