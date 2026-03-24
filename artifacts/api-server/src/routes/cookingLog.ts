import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cookingLogTable, recipesTable, recipeIngredientsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/cooking-log", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const recipeId = req.query.recipeId ? Number(req.query.recipeId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    let query = db
      .select({
        id: cookingLogTable.id,
        userId: cookingLogTable.userId,
        recipeId: cookingLogTable.recipeId,
        date: cookingLogTable.date,
        comment: cookingLogTable.comment,
        photoUrl: cookingLogTable.photoUrl,
        createdAt: cookingLogTable.createdAt,
        recipeTitle: recipesTable.title,
        recipeCategory: recipesTable.category,
        recipeImageUrl: recipesTable.imageUrl,
      })
      .from(cookingLogTable)
      .leftJoin(recipesTable, eq(cookingLogTable.recipeId, recipesTable.id))
      .orderBy(desc(cookingLogTable.date), desc(cookingLogTable.createdAt))
      .$dynamic();

    const conditions = [eq(cookingLogTable.userId, userId)];
    if (recipeId !== undefined && !isNaN(recipeId)) {
      conditions.push(eq(cookingLogTable.recipeId, recipeId));
    }
    query = query.where(and(...conditions));

    if (limit !== undefined && !isNaN(limit)) {
      query = query.limit(limit);
    }

    const entries = await query;
    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch cooking log");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch cooking log" });
  }
});

const cookingLogBodySchema = z.object({
  recipeId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  comment: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
});

router.post("/cooking-log", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const data = cookingLogBodySchema.parse(req.body);

    const [entry] = await db
      .insert(cookingLogTable)
      .values({
        userId,
        recipeId: data.recipeId,
        date: data.date,
        comment: data.comment ?? null,
        photoUrl: data.photoUrl ?? null,
      })
      .returning();

    await db
      .update(recipesTable)
      .set({
        cookedCount: sql`COALESCE(${recipesTable.cookedCount}, 0) + 1`,
        lastCooked: data.date,
      })
      .where(eq(recipesTable.id, data.recipeId));

    const recipe = await db.select().from(recipesTable).where(eq(recipesTable.id, data.recipeId));
    const ingredients = await db.select().from(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, data.recipeId));

    res.status(201).json({
      entry,
      recipe: recipe[0] ? { ...recipe[0], ingredients } : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create cooking log entry");
    res.status(500).json({ error: "internal_error", message: "Failed to create cooking log entry" });
  }
});

router.delete("/cooking-log/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid cooking log id" });
      return;
    }

    const [deleted] = await db
      .delete(cookingLogTable)
      .where(and(eq(cookingLogTable.id, id), eq(cookingLogTable.userId, userId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Cooking log entry not found" });
      return;
    }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete cooking log entry");
    res.status(500).json({ error: "internal_error", message: "Failed to delete cooking log entry" });
  }
});

export default router;
