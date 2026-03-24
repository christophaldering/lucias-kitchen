import { useState, useEffect, useCallback } from "react";
import type { Recipe } from "@/types/recipe";

const API_BASE = "/api";

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/recipes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecipes(data);
    } catch (err) {
      setError("Rezepte konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const addRecipes = useCallback(async (newRecipes: Partial<Recipe>[]) => {
    const res = await fetch(`${API_BASE}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRecipes),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const updateRecipe = useCallback(async (id: number, data: Partial<Recipe>) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) throw new Error("Recipe not found");
    const body = {
      title: existing.title,
      servings: existing.servings,
      prepTime: existing.prepTime,
      totalTime: existing.totalTime,
      difficulty: existing.difficulty,
      category: existing.category,
      rating: existing.rating,
      kcalPerPortion: existing.kcalPerPortion,
      source: existing.source,
      lastCooked: existing.lastCooked,
      cookedCount: existing.cookedCount,
      notes: existing.notes,
      steps: existing.steps,
      ingredients: existing.ingredients.map((ing) => ({
        amount: ing.amount,
        unit: ing.unit,
        name: ing.name,
        note: ing.note,
      })),
      ...data,
    };
    const res = await fetch(`${API_BASE}/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [recipes, fetchRecipes]);

  const patchRecipe = useCallback(async (id: number, patch: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const deleteRecipe = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/recipes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const deleteAllRecipes = useCallback(async () => {
    const res = await fetch(`${API_BASE}/recipes`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const restoreDemo = useCallback(async () => {
    const res = await fetch(`${API_BASE}/recipes/seed`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  return {
    recipes,
    loading,
    error,
    refetch: fetchRecipes,
    addRecipes,
    updateRecipe,
    patchRecipe,
    deleteRecipe,
    deleteAllRecipes,
    restoreDemo,
  };
}

export async function extractPdfRecipes(
  base64Pdf: string
): Promise<{ recipes: Partial<Recipe>[]; modelUsed: "openai" | "claude" }> {
  const res = await fetch(`${API_BASE}/extract-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf: base64Pdf }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
