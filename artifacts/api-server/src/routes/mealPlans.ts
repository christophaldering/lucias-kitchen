import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mealPlansTable, recipesTable, recipeIngredientsTable } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/meal-plans", async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    let plans;
    if (from && to) {
      plans = await db
        .select()
        .from(mealPlansTable)
        .where(and(gte(mealPlansTable.date, from), lte(mealPlansTable.date, to)))
        .orderBy(mealPlansTable.date);
    } else {
      plans = await db.select().from(mealPlansTable).orderBy(mealPlansTable.date);
    }

    const allRecipes = await db.select().from(recipesTable);
    const allIngredients = await db.select().from(recipeIngredientsTable);

    const result = plans.map((plan) => {
      const recipe = allRecipes.find((r) => r.id === plan.recipeId);
      if (!recipe) return { ...plan, recipe: null };
      const ingredients = allIngredients.filter((i) => i.recipeId === recipe.id);
      return { ...plan, recipe: { ...recipe, ingredients } };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch meal plans");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch meal plans" });
  }
});

router.post("/meal-plans", async (req, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      recipeId: z.number().int().positive(),
    });

    const { date, recipeId } = schema.parse(req.body);

    const [plan] = await db
      .insert(mealPlansTable)
      .values({ date, recipeId })
      .onConflictDoUpdate({
        target: mealPlansTable.date,
        set: { recipeId },
      })
      .returning();

    const recipe = await db.select().from(recipesTable).where(eq(recipesTable.id, plan.recipeId));
    const ingredients = await db.select().from(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, plan.recipeId));

    res.status(201).json({ ...plan, recipe: recipe[0] ? { ...recipe[0], ingredients } : null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create meal plan");
    res.status(500).json({ error: "internal_error", message: "Failed to create meal plan" });
  }
});

router.delete("/meal-plans/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid meal plan id" });
      return;
    }

    const [deleted] = await db
      .delete(mealPlansTable)
      .where(eq(mealPlansTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Meal plan not found" });
      return;
    }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal plan");
    res.status(500).json({ error: "internal_error", message: "Failed to delete meal plan" });
  }
});

export default router;
