import { useState, useEffect, useCallback } from "react";
import type { Recipe, IngredientInput, Season, RecipePhoto } from "@/types/recipe";

export interface RecipeUpdatePayload {
  title: string;
  category: string;
  difficulty: "simpel" | "normal" | "schwer";
  servings?: number | null;
  prepTime?: string | null;
  totalTime?: string | null;
  kcalPerPortion?: number | null;
  source?: string | null;
  rating?: string | null;
  lastCooked?: string | null;
  cookedCount?: number | null;
  notes?: string | null;
  steps: string[];
  ingredients: IngredientInput[];
  imageUrl?: string | null;
  seasons?: Season[];
}

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

  const updateRecipe = useCallback(async (id: number, data: RecipeUpdatePayload) => {
    const res = await fetch(`${API_BASE}/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const patchRecipeSilent = useCallback(async (id: number, patch: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, []);

  const patchRecipe = useCallback(async (id: number, patch: Record<string, unknown>) => {
    await patchRecipeSilent(id, patch);
    await fetchRecipes();
  }, [fetchRecipes, patchRecipeSilent]);

  const deleteRecipeSilent = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/recipes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, []);

  const deleteRecipe = useCallback(async (id: number) => {
    await deleteRecipeSilent(id);
    await fetchRecipes();
  }, [fetchRecipes, deleteRecipeSilent]);

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
    patchRecipeSilent,
    deleteRecipe,
    deleteRecipeSilent,
    deleteAllRecipes,
    restoreDemo,
  };
}

export async function uploadRecipeImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_BASE}/upload-image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Upload fehlgeschlagen: HTTP ${res.status}`);
  }

  const { imageUrl } = await res.json();
  return imageUrl;
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

export async function extractUrlRecipes(
  url: string
): Promise<{ recipes: Partial<Recipe>[] }> {
  const res = await fetch(`${API_BASE}/extract-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function extractImageRecipes(
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<{ recipes: Partial<Recipe>[]; modelUsed: "openai" }> {
  const res = await fetch(`${API_BASE}/extract-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchRecipePhotos(recipeId: number): Promise<RecipePhoto[]> {
  const res = await fetch(`${API_BASE}/recipes/${recipeId}/photos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function uploadRecipePhoto(recipeId: number, file: File): Promise<RecipePhoto> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API_BASE}/recipes/${recipeId}/photos`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Upload fehlgeschlagen: HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteRecipePhoto(recipeId: number, photoId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/recipes/${recipeId}/photos/${photoId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
