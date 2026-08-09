import { db } from "@workspace/db";
import {
  recipesTable,
  recipeIngredientsTable,
  cookingLogTable,
  usersTable,
} from "@workspace/db/schema";
import { recipeCommentsTable } from "@workspace/db/schema";
import { isNull, inArray, eq } from "drizzle-orm";

export interface RecipeExport {
  exportedAt: string;
  recipeCount: number;
  recipes: object[];
}

export async function buildRecipeExport(): Promise<RecipeExport> {
  const recipes = await db
    .select()
    .from(recipesTable)
    .where(isNull(recipesTable.deletedAt));

  if (recipes.length === 0) {
    return { exportedAt: new Date().toISOString(), recipeCount: 0, recipes: [] };
  }

  const recipeIds = recipes.map((r) => r.id);

  const [ingredients, cookingLog, comments] = await Promise.all([
    db
      .select()
      .from(recipeIngredientsTable)
      .where(inArray(recipeIngredientsTable.recipeId, recipeIds)),

    db
      .select()
      .from(cookingLogTable)
      .where(inArray(cookingLogTable.recipeId, recipeIds)),

    db
      .select({
        id: recipeCommentsTable.id,
        recipeId: recipeCommentsTable.recipeId,
        content: recipeCommentsTable.content,
        rating: recipeCommentsTable.rating,
        createdAt: recipeCommentsTable.createdAt,
        updatedAt: recipeCommentsTable.updatedAt,
        displayName: usersTable.displayName,
      })
      .from(recipeCommentsTable)
      .leftJoin(usersTable, eq(recipeCommentsTable.userId, usersTable.id))
      .where(inArray(recipeCommentsTable.recipeId, recipeIds)),
  ]);

  // Index by recipeId for fast lookup
  const ingredientsMap = new Map<number, typeof ingredients>();
  for (const ing of ingredients) {
    const list = ingredientsMap.get(ing.recipeId) ?? [];
    list.push(ing);
    ingredientsMap.set(ing.recipeId, list);
  }

  const cookingLogMap = new Map<number, typeof cookingLog>();
  for (const entry of cookingLog) {
    const list = cookingLogMap.get(entry.recipeId) ?? [];
    list.push(entry);
    cookingLogMap.set(entry.recipeId, list);
  }

  const commentsMap = new Map<number, typeof comments>();
  for (const c of comments) {
    const list = commentsMap.get(c.recipeId) ?? [];
    list.push(c);
    commentsMap.set(c.recipeId, list);
  }

  const exportRecipes = recipes.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    difficulty: r.difficulty,
    servings: r.servings,
    prepTime: r.prepTime,
    totalTime: r.totalTime,
    kcalPerPortion: r.kcalPerPortion,
    source: r.source,
    rating: r.rating,
    notes: r.notes,
    personalNotes: r.personalNotes,
    steps: r.steps,
    imageUrl: r.imageUrl,
    seasons: r.seasons,
    tags: r.tags,
    lastCooked: r.lastCooked,
    cookedCount: r.cookedCount,
    tried: r.tried,
    chefPick: r.chefPick,
    isAiGenerated: r.isAiGenerated,
    imageSource: r.imageSource,
    parentRecipeId: r.parentRecipeId,
    variantName: r.variantName,
    sourceDocumentUrl: r.sourceDocumentUrl,
    createdAt: r.createdAt,
    ingredients: ingredientsMap.get(r.id) ?? [],
    cookingLog: (cookingLogMap.get(r.id) ?? []).map((e) => ({
      id: e.id,
      date: e.date,
      comment: e.comment,
      photoUrl: e.photoUrl,
      createdAt: e.createdAt,
    })),
    comments: (commentsMap.get(r.id) ?? []).map((c) => ({
      id: c.id,
      content: c.content,
      rating: c.rating,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      displayName: c.displayName,
    })),
  }));

  return {
    exportedAt: new Date().toISOString(),
    recipeCount: exportRecipes.length,
    recipes: exportRecipes,
  };
}
