import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mealPlansTable, recipesTable, recipeIngredientsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.get("/meal-plans", authMiddleware, async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const userId = req.authUser!.id;

    let plans;
    if (from && to) {
      plans = await db
        .select()
        .from(mealPlansTable)
        .where(and(
          eq(mealPlansTable.userId, userId),
          gte(mealPlansTable.date, from),
          lte(mealPlansTable.date, to)
        ))
        .orderBy(mealPlansTable.date);
    } else {
      plans = await db
        .select()
        .from(mealPlansTable)
        .where(eq(mealPlansTable.userId, userId))
        .orderBy(mealPlansTable.date);
    }

    const allRecipes = await db.select().from(recipesTable).where(isNull(recipesTable.deletedAt));
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

router.post("/meal-plans", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      recipeId: z.number().int().positive(),
    });

    const { date, recipeId } = schema.parse(req.body);
    const userId = req.authUser!.id;

    const [plan] = await db
      .insert(mealPlansTable)
      .values({ date, recipeId, userId })
      .onConflictDoUpdate({
        target: [mealPlansTable.date, mealPlansTable.userId],
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

router.get("/meal-plans/nutrition-summary", authMiddleware, async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const userId = req.authUser!.id;

    if (!from || !to) {
      res.status(400).json({ error: "bad_request", message: "from and to are required" });
      return;
    }

    const plans = await db
      .select()
      .from(mealPlansTable)
      .where(and(
        eq(mealPlansTable.userId, userId),
        gte(mealPlansTable.date, from),
        lte(mealPlansTable.date, to)
      ))
      .orderBy(mealPlansTable.date);

    const allRecipes = await db.select().from(recipesTable).where(isNull(recipesTable.deletedAt));

    let totalKcal = 0;
    let withKcal = 0;
    let withoutKcal = 0;

    const byDate: Record<string, number | null> = {};

    for (const plan of plans) {
      const recipe = allRecipes.find((r) => r.id === plan.recipeId);
      if (recipe && recipe.kcalPerPortion != null) {
        totalKcal += recipe.kcalPerPortion;
        withKcal++;
        byDate[plan.date] = recipe.kcalPerPortion;
      } else {
        withoutKcal++;
        byDate[plan.date] = null;
      }
    }

    const daysWithKcal = withKcal;
    const avgKcalPerDay = daysWithKcal > 0 ? Math.round(totalKcal / daysWithKcal) : null;

    res.json({
      from,
      to,
      totalKcal,
      avgKcalPerDay,
      daysWithKcal,
      daysWithoutKcal: withoutKcal,
      totalDays: plans.length,
      byDate,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch nutrition summary");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch nutrition summary" });
  }
});

router.get("/meal-plans/kcal-history", authMiddleware, async (req, res) => {
  try {
    const weeksBack = Number(req.query.weeks ?? 4);
    const userId = req.authUser!.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getMonday = (d: Date): Date => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + diff);
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const addDays = (d: Date, n: number): Date => {
      const result = new Date(d);
      result.setDate(result.getDate() + n);
      return result;
    };

    const toIsoDate = (d: Date): string => d.toISOString().split("T")[0];

    const currentMonday = getMonday(today);
    const weeks: Array<{ label: string; from: string; to: string }> = [];

    for (let i = weeksBack - 1; i >= 0; i--) {
      const weekStart = addDays(currentMonday, -i * 7);
      const weekEnd = addDays(weekStart, 6);
      weeks.push({
        label: `KW ${weekStart.getDate()}.${weekStart.getMonth() + 1}.`,
        from: toIsoDate(weekStart),
        to: toIsoDate(weekEnd),
      });
    }

    const allRecipes = await db.select().from(recipesTable).where(isNull(recipesTable.deletedAt));

    const result = await Promise.all(
      weeks.map(async (week) => {
        const plans = await db
          .select()
          .from(mealPlansTable)
          .where(and(
            eq(mealPlansTable.userId, userId),
            gte(mealPlansTable.date, week.from),
            lte(mealPlansTable.date, week.to)
          ));

        let totalKcal = 0;
        for (const plan of plans) {
          const recipe = allRecipes.find((r) => r.id === plan.recipeId);
          if (recipe?.kcalPerPortion != null) {
            totalKcal += recipe.kcalPerPortion;
          }
        }

        return {
          label: week.label,
          from: week.from,
          to: week.to,
          totalKcal,
          plannedDays: plans.length,
        };
      })
    );

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch kcal history");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch kcal history" });
  }
});

router.delete("/meal-plans/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid meal plan id" });
      return;
    }

    const userId = req.authUser!.id;

    const [deleted] = await db
      .delete(mealPlansTable)
      .where(and(eq(mealPlansTable.id, id), eq(mealPlansTable.userId, userId)))
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
