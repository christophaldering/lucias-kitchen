import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { seedRecipes } from "../db/seedRecipes";

const router: IRouter = Router();

const ingredientSchema = z.object({
  amount: z.string().default(""),
  unit: z.string().default(""),
  name: z.string().min(1),
  note: z.string().optional(),
});

const recipeBodySchema = z.object({
  title: z.string().min(1),
  servings: z.number().int().positive().optional().nullable(),
  prepTime: z.string().optional().nullable(),
  totalTime: z.string().optional().nullable(),
  difficulty: z.enum(["simpel", "normal", "schwer"]).default("normal"),
  category: z.string().min(1),
  rating: z.string().optional().nullable(),
  kcalPerPortion: z.number().int().positive().optional().nullable(),
  source: z.string().optional().nullable(),
  lastCooked: z.string().optional().nullable(),
  cookedCount: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
  steps: z.array(z.string()).default([]),
  ingredients: z.array(ingredientSchema).default([]),
});

async function getRecipesWithIngredients() {
  const recipes = await db.select().from(recipesTable).orderBy(recipesTable.id);
  const ingredients = await db.select().from(recipeIngredientsTable).orderBy(recipeIngredientsTable.id);
  return recipes.map((r) => ({
    ...r,
    ingredients: ingredients.filter((i) => i.recipeId === r.id),
  }));
}

router.get("/recipes", async (req, res) => {
  try {
    const recipes = await getRecipesWithIngredients();
    res.json(recipes);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch recipes" });
  }
});

router.post("/recipes", async (req, res) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    const parsed = z.array(recipeBodySchema).parse(items);

    const created = [];
    for (const data of parsed) {
      const { ingredients, ...recipeData } = data;
      const [recipe] = await db.insert(recipesTable).values({
        title: recipeData.title,
        servings: recipeData.servings ?? null,
        prepTime: recipeData.prepTime ?? null,
        totalTime: recipeData.totalTime ?? null,
        difficulty: recipeData.difficulty,
        category: recipeData.category,
        rating: recipeData.rating ?? null,
        kcalPerPortion: recipeData.kcalPerPortion ?? null,
        source: recipeData.source ?? null,
        lastCooked: recipeData.lastCooked ?? null,
        cookedCount: recipeData.cookedCount ?? 0,
        notes: recipeData.notes ?? null,
        steps: recipeData.steps,
      }).returning();

      if (ingredients.length > 0) {
        await db.insert(recipeIngredientsTable).values(
          ingredients.map((ing) => ({
            recipeId: recipe.id,
            amount: ing.amount || "",
            unit: ing.unit || "",
            name: ing.name,
            note: ing.note ?? null,
          }))
        );
      }

      const recipeIngredients = await db
        .select()
        .from(recipeIngredientsTable)
        .where(eq(recipeIngredientsTable.recipeId, recipe.id));

      created.push({ ...recipe, ingredients: recipeIngredients });
    }

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to create recipe" });
  }
});

router.put("/recipes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const data = recipeBodySchema.parse(req.body);
    const { ingredients, ...recipeData } = data;

    const [updated] = await db
      .update(recipesTable)
      .set({
        title: recipeData.title,
        servings: recipeData.servings ?? null,
        prepTime: recipeData.prepTime ?? null,
        totalTime: recipeData.totalTime ?? null,
        difficulty: recipeData.difficulty,
        category: recipeData.category,
        rating: recipeData.rating ?? null,
        kcalPerPortion: recipeData.kcalPerPortion ?? null,
        source: recipeData.source ?? null,
        lastCooked: recipeData.lastCooked ?? null,
        cookedCount: recipeData.cookedCount ?? 0,
        notes: recipeData.notes ?? null,
        steps: recipeData.steps,
      })
      .where(eq(recipesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, id));
    if (ingredients.length > 0) {
      await db.insert(recipeIngredientsTable).values(
        ingredients.map((ing) => ({
          recipeId: id,
          amount: ing.amount || "",
          unit: ing.unit || "",
          name: ing.name,
          note: ing.note ?? null,
        }))
      );
    }

    const updatedIngredients = await db
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, id));

    res.json({ ...updated, ingredients: updatedIngredients });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to update recipe" });
  }
});

router.patch("/recipes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const patchSchema = z.object({
      category: z.string().min(1).optional(),
      difficulty: z.enum(["simpel", "normal", "schwer"]).optional(),
      rating: z.string().nullable().optional(),
      lastCooked: z.string().nullable().optional(),
      cookedCount: z.number().int().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
    });

    const data = patchSchema.parse(req.body);

    const [updated] = await db
      .update(recipesTable)
      .set(data)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    const ingredients = await db
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, id));

    res.json({ ...updated, ingredients });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to patch recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to patch recipe" });
  }
});

router.delete("/recipes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid recipe id" });
      return;
    }

    const [deleted] = await db
      .delete(recipesTable)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Recipe not found" });
      return;
    }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe");
    res.status(500).json({ error: "internal_error", message: "Failed to delete recipe" });
  }
});

router.post("/recipes/seed", async (req, res) => {
  try {
    await seedRecipes(true);
    const recipes = await getRecipesWithIngredients();
    res.json({ success: true, count: recipes.length });
  } catch (err) {
    req.log.error({ err }, "Failed to seed recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to seed recipes" });
  }
});

router.delete("/recipes", async (req, res) => {
  try {
    await db.delete(recipeIngredientsTable);
    await db.delete(recipesTable);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete all recipes");
    res.status(500).json({ error: "internal_error", message: "Failed to delete all recipes" });
  }
});

export default router;
