import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cookingLogTable, recipesTable, mealPlansTable, userPantryTable } from "@workspace/db/schema";
import { eq, and, desc, gte, isNotNull, lte, sql } from "drizzle-orm";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.get("/kochidee-context", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const today = new Date();

    const weekStart = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(today.getDate() + daysToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split("T")[0];

    const [pantryItems, recentLog, weekPlan, topCooked, topRated] = await Promise.all([
      db
        .select({
          ingredientName: userPantryTable.ingredientName,
          expiryPriority: userPantryTable.expiryPriority,
          expiryDate: userPantryTable.expiryDate,
          storageLocation: userPantryTable.storageLocation,
          isDefault: userPantryTable.isDefault,
        })
        .from(userPantryTable)
        .where(eq(userPantryTable.userId, userId)),

      db
        .select({
          recipeId: cookingLogTable.recipeId,
          date: cookingLogTable.date,
          recipeTitle: recipesTable.title,
        })
        .from(cookingLogTable)
        .leftJoin(recipesTable, eq(cookingLogTable.recipeId, recipesTable.id))
        .where(
          and(
            eq(cookingLogTable.userId, userId),
            gte(cookingLogTable.date, fourteenDaysAgoStr)
          )
        )
        .orderBy(desc(cookingLogTable.date)),

      db
        .select({
          recipeId: mealPlansTable.recipeId,
          date: mealPlansTable.date,
          recipeTitle: recipesTable.title,
        })
        .from(mealPlansTable)
        .leftJoin(recipesTable, eq(mealPlansTable.recipeId, recipesTable.id))
        .where(
          and(
            eq(mealPlansTable.userId, userId),
            gte(mealPlansTable.date, weekStartStr),
            lte(mealPlansTable.date, weekEndStr)
          )
        )
        .orderBy(mealPlansTable.date),

      // Top frequently cooked: count log entries per recipe for this user
      db
        .select({
          recipeId: cookingLogTable.recipeId,
          title: recipesTable.title,
          category: recipesTable.category,
          cookCount: sql<number>`COUNT(${cookingLogTable.id})`.as("cook_count"),
        })
        .from(cookingLogTable)
        .leftJoin(recipesTable, eq(cookingLogTable.recipeId, recipesTable.id))
        .where(eq(cookingLogTable.userId, userId))
        .groupBy(cookingLogTable.recipeId, recipesTable.title, recipesTable.category)
        .orderBy(desc(sql`COUNT(${cookingLogTable.id})`))
        .limit(5),

      // Top rated: recipes this user has cooked at least once that have a rating
      db
        .select({
          recipeId: cookingLogTable.recipeId,
          title: recipesTable.title,
          category: recipesTable.category,
          rating: recipesTable.rating,
        })
        .from(cookingLogTable)
        .leftJoin(recipesTable, eq(cookingLogTable.recipeId, recipesTable.id))
        .where(
          and(
            eq(cookingLogTable.userId, userId),
            isNotNull(recipesTable.rating)
          )
        )
        .groupBy(cookingLogTable.recipeId, recipesTable.title, recipesTable.category, recipesTable.rating)
        .orderBy(desc(recipesTable.rating))
        .limit(5),
    ]);

    const enrichedPantry = pantryItems.map((item) => {
      let urgency: "today" | "soon" | "good" = "good";
      if (item.expiryDate) {
        const expiry = new Date(item.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const todayMidnight = new Date(today);
        todayMidnight.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expiry.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 2) urgency = "today";
        else if (daysLeft <= 7) urgency = "soon";
      } else if (item.expiryPriority === "today") {
        urgency = "today";
      } else if (item.expiryPriority === "week") {
        urgency = "soon";
      }
      return {
        name: item.ingredientName,
        location: item.storageLocation ?? "pantry",
        isDefault: item.isDefault === 1,
        urgency,
        expiryDate: item.expiryDate ?? null,
      };
    });

    res.json({
      pantry: enrichedPantry,
      recentlyCooked: recentLog.map((e) => ({
        title: e.recipeTitle ?? `Rezept #${e.recipeId}`,
        date: e.date,
      })),
      weekPlan: weekPlan.map((e) => ({
        title: e.recipeTitle ?? `Rezept #${e.recipeId}`,
        date: e.date,
      })),
      frequentRecipes: topCooked.map((r) => ({
        title: r.title ?? `Rezept #${r.recipeId}`,
        category: r.category ?? "",
        cookedCount: Number(r.cookCount),
      })),
      topRatedRecipes: topRated.map((r) => ({
        title: r.title ?? `Rezept #${r.recipeId}`,
        category: r.category ?? "",
        rating: r.rating,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch kochidee context");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
