import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe, IngredientInput, Season, RecipePhoto } from "@/types/recipe";
import { authFetch, authHeaders } from "@/lib/authFetch";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCachedRecipes,
  setCachedRecipes,
  deleteCachedRecipe,
  clearRecipeCache,
} from "@/lib/recipeDb";

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

const PAGE_LIMIT = 24;

export interface RecipePage {
  recipes: Recipe[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function fetchRecipeById(id: number): Promise<import("@/types/recipe").Recipe> {
  const res = await authFetch(`${API_BASE}/recipes/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type RecipeFilter = "all" | "mine" | "favorites";

export interface ActiveFilters {
  category?: string;
  time?: string;      // "unter30" | "unter60"
  season?: string;
  cooked?: string;    // "gekocht" | "nicht"
  photoType?: string; // "none" | "ai" | "scan" | "own"
  variants?: string;  // "true" = show all (including variants)
  chefPick?: string;  // "true" = chef picks only
  sort?: string;      // alphabetisch|kategorie|bewertung|neueste|haeufig_gekocht|schwierigkeit|zeit
  dir?: string;       // "asc" | "desc"
}

export function useRecipes(filter: RecipeFilter = "all", options?: { loadAll?: boolean }, activeFilters?: ActiveFilters) {
  const { authReady } = useAuth();
  const queryClient = useQueryClient();
  const loadAll = options?.loadAll ?? false;

  // When any filter is active, skip local cache (it holds unfiltered data)
  const hasActiveFilters = !!(
    activeFilters?.category ||
    activeFilters?.time ||
    activeFilters?.season ||
    activeFilters?.cooked ||
    activeFilters?.photoType ||
    activeFilters?.variants ||
    activeFilters?.chefPick
  );

  const [cacheState, setCacheState] = useState<{ filter: RecipeFilter; recipes: Recipe[]; loaded: boolean }>({
    filter,
    recipes: [],
    loaded: false,
  });
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const cacheLoadedRef = useRef(false);

  useEffect(() => {
    if (hasActiveFilters) return; // skip cache when filters are active
    let cancelled = false;
    setCacheState({ filter, recipes: [], loaded: false });
    cacheLoadedRef.current = false;
    setIsBackgroundRefreshing(false);
    getCachedRecipes(filter).then((recipes) => {
      if (!cancelled) {
        setCacheState({ filter, recipes, loaded: true });
        cacheLoadedRef.current = true;
      }
    });
    return () => { cancelled = true; };
  }, [filter, hasActiveFilters]);

  const cachedRecipes = cacheState.filter === filter ? cacheState.recipes : [];
  const cacheLoaded = cacheState.filter === filter && cacheState.loaded;

  const filterParamStr = useMemo(() => {
    const p = new URLSearchParams();
    if (filter !== "all") p.set("filter", filter);
    if (activeFilters?.category) p.set("category", activeFilters.category);
    if (activeFilters?.time) p.set("time", activeFilters.time);
    if (activeFilters?.season) p.set("season", activeFilters.season);
    if (activeFilters?.cooked) p.set("cooked", activeFilters.cooked);
    if (activeFilters?.photoType) p.set("photoType", activeFilters.photoType);
    if (activeFilters?.variants) p.set("variants", activeFilters.variants);
    if (activeFilters?.chefPick) p.set("chefPick", activeFilters.chefPick);
    if (activeFilters?.sort) p.set("sort", activeFilters.sort);
    if (activeFilters?.dir) p.set("dir", activeFilters.dir);
    return p.toString();
  }, [filter, activeFilters?.category, activeFilters?.time, activeFilters?.season, activeFilters?.cooked, activeFilters?.photoType, activeFilters?.variants, activeFilters?.chefPick, activeFilters?.sort, activeFilters?.dir]);

  const baseUrl = filterParamStr ? `${API_BASE}/recipes?${filterParamStr}` : `${API_BASE}/recipes`;

  const infiniteQuery = useInfiniteQuery<RecipePage, Error>({
    queryKey: ["recipes", filter, activeFilters ?? {}],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 1;
      const sep = baseUrl.includes("?") ? "&" : "?";
      const url = `${baseUrl}${sep}page=${page}&limit=${PAGE_LIMIT}`;

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
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: authReady,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof Error && (error as Error & { isUnauthorized?: boolean }).isUnauthorized) return false;
      return failureCount < 2;
    },
  });

  const serverRecipes = useMemo(
    () => infiniteQuery.data?.pages.flatMap((p) => p.recipes) ?? [],
    [infiniteQuery.data]
  );
  const hasServerData = infiniteQuery.data !== undefined && !infiniteQuery.isLoading;

  useEffect(() => {
    if (hasActiveFilters) return; // never overwrite the full cache with filtered results
    if (infiniteQuery.isError) {
      setIsBackgroundRefreshing(false);
      return;
    }
    if (!infiniteQuery.isLoading && !infiniteQuery.isFetchingNextPage && infiniteQuery.data) {
      const allPagesFetched = !infiniteQuery.hasNextPage;
      if (allPagesFetched) {
        setIsBackgroundRefreshing(false);
        setCachedRecipes(filter, serverRecipes).catch(() => {});
      }
    }
  }, [hasActiveFilters, filter, infiniteQuery.isError, infiniteQuery.isLoading, infiniteQuery.isFetchingNextPage, infiniteQuery.data, infiniteQuery.hasNextPage, serverRecipes.length]);

  useEffect(() => {
    if (cacheLoaded && cacheLoadedRef.current && cachedRecipes.length > 0 && !hasServerData) {
      setIsBackgroundRefreshing(true);
    }
  }, [cacheLoaded, cachedRecipes.length, hasServerData]);

  const addRecipesMutation = useMutation({
    mutationFn: async (newRecipes: Partial<Recipe>[]): Promise<Recipe[]> => {
      const res = await authFetch(`${API_BASE}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(newRecipes),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(errBody));
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [data];
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
    onSuccess: (_data, id) => {
      deleteCachedRecipe(id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const deleteAllRecipesMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      clearRecipeCache().catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const requestDeleteAllMutation = useMutation({
    mutationFn: async (): Promise<{ email: string }> => {
      const res = await authFetch(`${API_BASE}/recipes/request-delete`, { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const restoreDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes/seed`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      clearRecipeCache().catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
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

  const recipes = hasServerData ? serverRecipes : cachedRecipes;
  const totalRecipes = infiniteQuery.data?.pages[0]?.total ?? null;

  const loading = !cacheLoaded
    ? infiniteQuery.isLoading
    : cachedRecipes.length === 0 && infiniteQuery.isLoading;

  const isUnauthorizedError = infiniteQuery.isError && infiniteQuery.error instanceof Error && (infiniteQuery.error as Error & { isUnauthorized?: boolean }).isUnauthorized;
  const error = infiniteQuery.isError && !isUnauthorizedError ? "Rezepte konnten nicht geladen werden." : null;

  useEffect(() => {
    if (loadAll && infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage();
    }
  }, [loadAll, infiniteQuery.hasNextPage, infiniteQuery.isFetchingNextPage, infiniteQuery.fetchNextPage]);

  async function fetchRecipes() {
    await queryClient.invalidateQueries({ queryKey: ["recipes"] });
  }

  async function addRecipes(newRecipes: Partial<Recipe>[]): Promise<number[]> {
    const created = await addRecipesMutation.mutateAsync(newRecipes);
    return created.map((r) => r.id);
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

  function patchRecipeLocal(id: number, patch: Record<string, unknown>) {
    queryClient.setQueriesData<import("@tanstack/react-query").InfiniteData<RecipePage>>(
      { queryKey: ["recipes"] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            recipes: page.recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          })),
        };
      },
    );
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
    deleteCachedRecipe(id).catch(() => {});
  }

  async function deleteRecipe(id: number) {
    return deleteRecipeMutation.mutateAsync(id);
  }

  async function deleteAllRecipes() {
    return deleteAllRecipesMutation.mutateAsync();
  }

  async function requestDeleteAll(): Promise<{ email: string }> {
    return requestDeleteAllMutation.mutateAsync();
  }

  async function restoreDemo() {
    return restoreDemoMutation.mutateAsync();
  }

  async function toggleFavorite(recipeId: number, isFavorite: boolean) {
    return toggleFavoriteMutation.mutateAsync({ recipeId, isFavorite });
  }

  return {
    recipes,
    totalRecipes,
    loading,
    error,
    isBackgroundRefreshing,
    refetch: fetchRecipes,
    addRecipes,
    updateRecipe,
    patchRecipe,
    patchRecipeSilent,
    patchRecipeLocal,
    deleteRecipe,
    deleteRecipeSilent,
    deleteAllRecipes,
    requestDeleteAll,
    restoreDemo,
    toggleFavorite,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
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

  let res: Response;
  try {
    res = await authFetch(`${API_BASE}/extract-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Bild zu groß oder Verbindung unterbrochen — bitte versuche es mit einem kleineren Foto.");
  }

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

export async function linkPhotoToRecipe(photoId: number, recipeId: number): Promise<RecipePhoto> {
  const res = await authFetch(`${API_BASE}/photos/${photoId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ recipeId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function usePhotoAsMain(recipeId: number, photoId: number): Promise<{ imageUrl: string }> {
  const res = await authFetch(`${API_BASE}/recipes/${recipeId}/use-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ photoId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function setPhotoAsMain(recipeId: number, photoId: number): Promise<{ imageUrl: string }> {
  const res = await authFetch(`${API_BASE}/recipes/${recipeId}/photos/${photoId}/set-main`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
