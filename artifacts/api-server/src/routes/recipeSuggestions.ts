import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recipeSuggestionsTable,
  recipesTable,
  recipeFavoritesTable,
  usersTable,
  groupMembersTable,
  groupsTable,
} from "@workspace/db/schema";
import { eq, and, or, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.post("/recipe-suggestions", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      recipientId: z.number().int().positive(),
      recipeId: z.number().int().positive(),
      message: z.string().max(100).optional(),
    });

    const data = schema.parse(req.body);
    const senderId = req.authUser!.id;

    if (data.recipientId === senderId) {
      res.status(400).json({ error: "cannot_suggest_to_self" });
      return;
    }

    const myMemberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.userId, senderId),
          eq(groupMembersTable.memberStatus, "joined")
        )
      );

    const myGroupIds = myMemberships.map((m) => m.groupId);

    if (myGroupIds.length === 0) {
      res.status(403).json({ error: "no_shared_group", message: "Kein gemeinsames Familienmitglied gefunden" });
      return;
    }

    const sharedMemberships = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
      .where(
        and(
          eq(groupMembersTable.userId, data.recipientId),
          eq(groupMembersTable.memberStatus, "joined"),
          eq(groupsTable.status, "approved"),
          myGroupIds.length === 1
            ? eq(groupMembersTable.groupId, myGroupIds[0]!)
            : or(...myGroupIds.map((id) => eq(groupMembersTable.groupId, id)))
        )
      );

    if (sharedMemberships.length === 0) {
      res.status(403).json({ error: "not_in_shared_group", message: "Empfänger ist nicht in deiner Gruppe" });
      return;
    }

    const [suggestion] = await db
      .insert(recipeSuggestionsTable)
      .values({
        senderId,
        recipientId: data.recipientId,
        recipeId: data.recipeId,
        message: data.message ?? null,
        status: "pending",
      })
      .returning();

    res.status(201).json(suggestion);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create recipe suggestion");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/recipe-suggestions/incoming", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const senderAlias = usersTable;

    const suggestions = await db
      .select({
        id: recipeSuggestionsTable.id,
        senderId: recipeSuggestionsTable.senderId,
        recipeId: recipeSuggestionsTable.recipeId,
        message: recipeSuggestionsTable.message,
        status: recipeSuggestionsTable.status,
        createdAt: recipeSuggestionsTable.createdAt,
        senderName: usersTable.displayName,
        senderAvatarUrl: usersTable.avatarUrl,
        recipeTitle: recipesTable.title,
        recipeImageUrl: recipesTable.imageUrl,
        recipeCategory: recipesTable.category,
      })
      .from(recipeSuggestionsTable)
      .innerJoin(usersTable, eq(recipeSuggestionsTable.senderId, usersTable.id))
      .innerJoin(recipesTable, eq(recipeSuggestionsTable.recipeId, recipesTable.id))
      .where(eq(recipeSuggestionsTable.recipientId, userId))
      .orderBy(recipeSuggestionsTable.createdAt);

    res.json(suggestions);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch incoming recipe suggestions");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/recipe-suggestions/:id/save", authMiddleware, async (req, res) => {
  try {
    const suggestionId = Number(req.params["id"]);
    const userId = req.authUser!.id;

    if (isNaN(suggestionId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const suggestion = await db
      .select()
      .from(recipeSuggestionsTable)
      .where(and(eq(recipeSuggestionsTable.id, suggestionId), eq(recipeSuggestionsTable.recipientId, userId)))
      .then((r) => r[0]);

    if (!suggestion) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const existing = await db
      .select()
      .from(recipeFavoritesTable)
      .where(and(eq(recipeFavoritesTable.userId, userId), eq(recipeFavoritesTable.recipeId, suggestion.recipeId)))
      .then((r) => r[0]);

    if (!existing) {
      await db.insert(recipeFavoritesTable).values({
        userId,
        recipeId: suggestion.recipeId,
      });
    }

    const [updated] = await db
      .update(recipeSuggestionsTable)
      .set({ status: "saved" })
      .where(eq(recipeSuggestionsTable.id, suggestionId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to save recipe suggestion");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/recipe-suggestions/:id/ignore", authMiddleware, async (req, res) => {
  try {
    const suggestionId = Number(req.params["id"]);
    const userId = req.authUser!.id;

    if (isNaN(suggestionId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const suggestion = await db
      .select()
      .from(recipeSuggestionsTable)
      .where(and(eq(recipeSuggestionsTable.id, suggestionId), eq(recipeSuggestionsTable.recipientId, userId)))
      .then((r) => r[0]);

    if (!suggestion) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [updated] = await db
      .update(recipeSuggestionsTable)
      .set({ status: "ignored" })
      .where(eq(recipeSuggestionsTable.id, suggestionId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to ignore recipe suggestion");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/recipe-suggestions/outgoing", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const suggestions = await db
      .select({
        id: recipeSuggestionsTable.id,
        recipientId: recipeSuggestionsTable.recipientId,
        recipeId: recipeSuggestionsTable.recipeId,
        message: recipeSuggestionsTable.message,
        status: recipeSuggestionsTable.status,
        createdAt: recipeSuggestionsTable.createdAt,
        recipientName: usersTable.displayName,
        recipientAvatarUrl: usersTable.avatarUrl,
        recipeTitle: recipesTable.title,
        recipeImageUrl: recipesTable.imageUrl,
        recipeCategory: recipesTable.category,
      })
      .from(recipeSuggestionsTable)
      .innerJoin(usersTable, eq(recipeSuggestionsTable.recipientId, usersTable.id))
      .innerJoin(recipesTable, eq(recipeSuggestionsTable.recipeId, recipesTable.id))
      .where(eq(recipeSuggestionsTable.senderId, userId))
      .orderBy(recipeSuggestionsTable.createdAt);

    res.json(suggestions);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch outgoing recipe suggestions");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/recipe-suggestions/group-members", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const myMemberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.userId, userId),
          eq(groupMembersTable.memberStatus, "joined")
        )
      );

    const myGroupIds = myMemberships.map((m) => m.groupId);

    if (myGroupIds.length === 0) {
      res.json([]);
      return;
    }

    const members = await db
      .selectDistinct({
        userId: groupMembersTable.userId,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        email: usersTable.email,
        groupId: groupMembersTable.groupId,
        groupName: groupsTable.name,
      })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
      .where(
        and(
          ne(groupMembersTable.userId, userId),
          eq(groupMembersTable.memberStatus, "joined"),
          eq(groupsTable.status, "approved"),
          myGroupIds.length === 1
            ? eq(groupMembersTable.groupId, myGroupIds[0]!)
            : or(...myGroupIds.map((id) => eq(groupMembersTable.groupId, id)))
        )
      );

    res.json(members);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch group members for suggestion");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
