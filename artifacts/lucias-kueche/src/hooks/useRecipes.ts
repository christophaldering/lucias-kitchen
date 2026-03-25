import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Recipe, IngredientInput, Season, RecipePhoto } from "@/types/recipe";
import { authFetch, authHeaders } from "@/lib/authFetch";
import { useAuth } from "@/contexts/AuthContext";

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
  const queryClient = useQueryClient();

  const url = filter === "all" ? `${API_BASE}/recipes` : `${API_BASE}/recipes?filter=${filter}`;

  const query = useQuery<Recipe[], Error>({
    queryKey: ["recipes", filter],
    queryFn: async () => {
      const attempt = async (): Promise<Response> => {
        const res = await authFetch(url, { headers: authHeaders() });
        if (res.status === 401) {
          const err = new Error("HTTP 401");
          (err as Error & { isUnauthorized: boolean }).isUnauthorized = true;
          throw err;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      };
      let res: Response;
      try {
        res = await attempt();
      } catch (e) {
        if (e instanceof Error && (e as Error & { isUnauthorized?: boolean }).isUnauthorized) throw e;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await attempt();
      }
      return res.json();
    },
    enabled: authReady,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof Error && (error as Error & { isUnauthorized?: boolean }).isUnauthorized) return false;
      return failureCount < 2;
    },
  });

  const addRecipesMutation = useMutation({
    mutationFn: async (newRecipes: Partial<Recipe>[]) => {
      const res = await authFetch(`${API_BASE}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(newRecipes),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(errBody));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const updateRecipeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: RecipeUpdatePayload }) => {
      const res = await authFetch(`${API_BASE}/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const patchRecipeMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const res = await authFetch(`${API_BASE}/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/recipes/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const deleteAllRecipesMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const restoreDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes/seed`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ recipeId, isFavorite }: { recipeId: number; isFavorite: boolean }) => {
      const method = isFavorite ? "DELETE" : "POST";
      const res = await authFetch(`${API_BASE}/recipes/${recipeId}/favorite`, {
        method,
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const recipes = query.data ?? [];
  const loading = query.isLoading;
  const isUnauthorizedError = query.isError && query.error instanceof Error && (query.error as Error & { isUnauthorized?: boolean }).isUnauthorized;
  const error = query.isError && !isUnauthorizedError ? "Rezepte konnten nicht geladen werden." : null;

  async function fetchRecipes() {
    await queryClient.invalidateQueries({ queryKey: ["recipes"] });
  }

  async function addRecipes(newRecipes: Partial<Recipe>[]) {
    return addRecipesMutation.mutateAsync(newRecipes);
  }

  async function updateRecipe(id: number, data: RecipeUpdatePayload) {
    return updateRecipeMutation.mutateAsync({ id, data });
  }

  async function patchRecipeSilent(id: number, patch: Record<string, unknown>) {
    const res = await authFetch(`${API_BASE}/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function patchRecipe(id: number, patch: Record<string, unknown>) {
    return patchRecipeMutation.mutateAsync({ id, patch });
  }

  async function deleteRecipeSilent(id: number) {
    const res = await authFetch(`${API_BASE}/recipes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function deleteRecipe(id: number) {
    return deleteRecipeMutation.mutateAsync(id);
  }

  async function deleteAllRecipes() {
    return deleteAllRecipesMutation.mutateAsync();
  }

  async function restoreDemo() {
    return restoreDemoMutation.mutateAsync();
  }

  async function toggleFavorite(recipeId: number, isFavorite: boolean) {
    return toggleFavoriteMutation.mutateAsync({ recipeId, isFavorite });
  }

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
): Promise<{ recipes: Partial<Recipe>[]; modelUsed: "openai" | "claude"; sourceDocumentUrl: string | null }> {
  const res = await authFetch(`${API_BASE}/extract-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ pdf: base64Pdf }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return { recipes: data.recipes ?? [], modelUsed: data.modelUsed, sourceDocumentUrl: data.sourceDocumentUrl ?? null };
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
): Promise<{ recipes: Partial<Recipe>[]; modelUsed: "openai"; sourceDocumentUrl: string | null }> {
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
  const data = await res.json();
  return { recipes: data.recipes ?? [], modelUsed: data.modelUsed, sourceDocumentUrl: data.sourceDocumentUrl ?? null };
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
