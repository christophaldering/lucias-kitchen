import { useState, useEffect, useCallback, useRef } from "react";
import type { Recipe, IngredientInput, Season, RecipePhoto } from "@/types/recipe";
import { authFetch, authHeaders } from "@/lib/authFetch";
import { useAuth } from "@/contexts/AuthContext";

class UnauthorizedError extends Error {
  constructor() {
    super("HTTP 401");
    this.name = "UnauthorizedError";
  }
}

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
  personalNotes?: string | null;
  steps: string[];
  ingredients: IngredientInput[];
  imageUrl?: string | null;
  seasons?: Season[];
  parentRecipeId?: number | null;
  variantName?: string | null;
}

const API_BASE = "/api";

export type RecipeFilter = "all" | "mine" | "favorites";

export function useRecipes(filter: RecipeFilter = "all") {
  const { authReady } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchRecipes = useCallback(async (f?: RecipeFilter) => {
    setLoading(true);
    setError(null);
    const activeFilter = f ?? filterRef.current;
    const url = activeFilter === "all" ? `${API_BASE}/recipes` : `${API_BASE}/recipes?filter=${activeFilter}`;
    const attempt = async (): Promise<Response> => {
      const res = await authFetch(url, { headers: authHeaders() });
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    };
    try {
      let res: Response;
      try {
        res = await attempt();
      } catch (e) {
        if (e instanceof UnauthorizedError) throw e;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await attempt();
      }
      const data = await res.json();
      setRecipes(data);
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[useRecipes] fetchRecipes failed:", errMsg, e);
        setError("Rezepte konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    fetchRecipes(filter);
  }, [authReady, filter, fetchRecipes]);

  const addRecipes = useCallback(async (newRecipes: Partial<Recipe>[]) => {
    const res = await authFetch(`${API_BASE}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(newRecipes),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(JSON.stringify(errBody));
    }
    await fetchRecipes();
  }, [fetchRecipes]);

  const updateRecipe = useCallback(async (id: number, data: RecipeUpdatePayload) => {
    const res = await authFetch(`${API_BASE}/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const patchRecipeSilent = useCallback(async (id: number, patch: Record<string, unknown>) => {
    const res = await authFetch(`${API_BASE}/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, []);

  const patchRecipe = useCallback(async (id: number, patch: Record<string, unknown>) => {
    await patchRecipeSilent(id, patch);
    await fetchRecipes();
  }, [fetchRecipes, patchRecipeSilent]);

  const deleteRecipeSilent = useCallback(async (id: number) => {
    const res = await authFetch(`${API_BASE}/recipes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, []);

  const deleteRecipe = useCallback(async (id: number) => {
    await deleteRecipeSilent(id);
    await fetchRecipes();
  }, [fetchRecipes, deleteRecipeSilent]);

  const deleteAllRecipes = useCallback(async () => {
    const res = await authFetch(`${API_BASE}/recipes`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const restoreDemo = useCallback(async () => {
    const res = await authFetch(`${API_BASE}/recipes/seed`, { method: "POST", headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchRecipes();
  }, [fetchRecipes]);

  const toggleFavorite = useCallback(async (recipeId: number, isFavorite: boolean) => {
    const method = isFavorite ? "DELETE" : "POST";
    const res = await authFetch(`${API_BASE}/recipes/${recipeId}/favorite`, {
      method,
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setRecipes((prev) => {
      const updated = prev.map((r) => r.id === recipeId ? { ...r, isFavorite: !isFavorite } : r);
      if (filter === "favorites" && isFavorite) {
        return updated.filter((r) => r.id !== recipeId);
      }
      return updated;
    });
  }, [filter]);

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
    toggleFavorite,
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
  const res = await authFetch(`${API_BASE}/extract-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
  const res = await authFetch(`${API_BASE}/extract-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function extractImageRecipes(
  images: Array<{ base64: string; mimeType: string }> | string,
  mimeType: string = "image/jpeg"
): Promise<{ recipes: Partial<Recipe>[]; modelUsed: "openai" }> {
  const body = Array.isArray(images)
    ? { images }
    : { image: images, mimeType };

  const res = await authFetch(`${API_BASE}/extract-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchRecipePhotos(recipeId: number): Promise<RecipePhoto[]> {
  const res = await authFetch(`${API_BASE}/recipes/${recipeId}/photos`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function uploadRecipePhoto(recipeId: number, file: File): Promise<RecipePhoto> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await authFetch(`${API_BASE}/recipes/${recipeId}/photos`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Upload fehlgeschlagen: HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteRecipePhoto(recipeId: number, photoId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/recipes/${recipeId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
