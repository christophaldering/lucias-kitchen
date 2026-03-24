import { pgTable, text, serial, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { recipesTable } from "./recipes";

export const invitationModeEnum = pgEnum("invitation_mode", ["surprise", "wishlist", "vote", "choice"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["open", "decided", "cancelled"]);
export const rsvpEnum = pgEnum("rsvp_status", ["pending", "coming", "not_coming"]);

export const mealInvitationsTable = pgTable("meal_invitations", {
  id: serial("id").primaryKey(),
  hostUserId: integer("host_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  mode: invitationModeEnum("mode").notNull(),
  status: invitationStatusEnum("status").notNull().default("open"),
  recipeOptions: jsonb("recipe_options").default([]),
  finalRecipeId: integer("final_recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  deadline: text("deadline"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mealInvitationMembersTable = pgTable("meal_invitation_members", {
  id: serial("id").primaryKey(),
  mealInvitationId: integer("meal_invitation_id").notNull().references(() => mealInvitationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rsvp: rsvpEnum("rsvp").notNull().default("pending"),
});

export const mealWishesTable = pgTable("meal_wishes", {
  id: serial("id").primaryKey(),
  mealInvitationId: integer("meal_invitation_id").notNull().references(() => mealInvitationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  wishText: text("wish_text"),
  recipeId: integer("recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  ranking: integer("ranking"),
  constraints: text("constraints"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MealInvitation = typeof mealInvitationsTable.$inferSelect;
export type MealInvitationMember = typeof mealInvitationMembersTable.$inferSelect;
export type MealWish = typeof mealWishesTable.$inferSelect;
