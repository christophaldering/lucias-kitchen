import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipeCommentsTable, recipesTable, notificationsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.get("/recipes/:id/comments", async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (isNaN(recipeId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const comments = await db
      .select({
        id: recipeCommentsTable.id,
        recipeId: recipeCommentsTable.recipeId,
        userId: recipeCommentsTable.userId,
        content: recipeCommentsTable.content,
        rating: recipeCommentsTable.rating,
        createdAt: recipeCommentsTable.createdAt,
        updatedAt: recipeCommentsTable.updatedAt,
      })
      .from(recipeCommentsTable)
      .where(eq(recipeCommentsTable.recipeId, recipeId))
      .orderBy(desc(recipeCommentsTable.createdAt));

    res.json(comments);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch comments");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch comments" });
  }
});

const commentCreateSchema = z.object({
  content: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

router.post("/recipes/:id/comments", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (isNaN(recipeId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const data = commentCreateSchema.parse(req.body);
    const userId = req.authUser!.id;

    const [recipe] = await db.select({ id: recipesTable.id, title: recipesTable.title }).from(recipesTable).where(eq(recipesTable.id, recipeId));
    if (!recipe) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const [comment] = await db
      .insert(recipeCommentsTable)
      .values({
        recipeId,
        userId,
        content: data.content,
        rating: data.rating ?? null,
      })
      .returning();

    const recipeOwnerId = await getRecipeOwnerId(recipeId);
    if (recipeOwnerId !== null && recipeOwnerId !== userId) {
      await db.insert(notificationsTable).values({
        userId: recipeOwnerId,
        type: "comment",
        payload: {
          commentId: comment.id,
          recipeId,
          recipeTitle: recipe.title,
          commenterName: req.authUser!.displayName,
          commenterId: userId,
        },
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create comment");
    res.status(500).json({ error: "internal_error", message: "Failed to create comment" });
  }
});

const commentUpdateSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

router.patch("/recipes/:id/comments/:cid", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    const commentId = Number(req.params.cid);
    if (isNaN(recipeId) || isNaN(commentId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const userId = req.authUser!.id;

    const [existing] = await db
      .select()
      .from(recipeCommentsTable)
      .where(and(eq(recipeCommentsTable.id, commentId), eq(recipeCommentsTable.recipeId, recipeId)));

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Comment not found" });
      return;
    }

    if (existing.userId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Can only edit own comments" });
      return;
    }

    const data = commentUpdateSchema.parse(req.body);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.content !== undefined) updateData.content = data.content;
    if (data.rating !== undefined) updateData.rating = data.rating;

    const [updated] = await db
      .update(recipeCommentsTable)
      .set(updateData)
      .where(eq(recipeCommentsTable.id, commentId))
      .returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update comment");
    res.status(500).json({ error: "internal_error", message: "Failed to update comment" });
  }
});

router.delete("/recipes/:id/comments/:cid", authMiddleware, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    const commentId = Number(req.params.cid);
    if (isNaN(recipeId) || isNaN(commentId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const userId = req.authUser!.id;

    const [existing] = await db
      .select()
      .from(recipeCommentsTable)
      .where(and(eq(recipeCommentsTable.id, commentId), eq(recipeCommentsTable.recipeId, recipeId)));

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Comment not found" });
      return;
    }

    if (existing.userId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Can only delete own comments" });
      return;
    }

    await db.delete(recipeCommentsTable).where(eq(recipeCommentsTable.id, commentId));

    res.json({ success: true, id: commentId });
  } catch (err) {
    req.log.error({ err }, "Failed to delete comment");
    res.status(500).json({ error: "internal_error", message: "Failed to delete comment" });
  }
});

async function getRecipeOwnerId(recipeId: number): Promise<number | null> {
  return null;
}

export default router;
