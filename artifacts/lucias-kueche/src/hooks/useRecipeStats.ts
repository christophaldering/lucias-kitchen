import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";

export interface RecipeStats {
  total: number;
  categories: { name: string; value: number }[];
  difficulties: { name: string; value: number }[];
  timeBuckets: { name: string; Rezepte: number }[];
  top3: { id: number; title: string; rating: string | null; cookedCount: number | null; category: string }[];
  veryDeliciousCount: number;
  avgIngredients: number;
  hasVariants: boolean;
  seasonal: { id: number; title: string; category: string; imageUrl: string | null }[];
}

const API_BASE = `${import.meta.env.BASE_URL}api`;

export function useRecipeStats() {
  return useQuery<RecipeStats>({
    queryKey: ["recipe-stats"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes/stats`);
      if (!res.ok) throw new Error("Statistiken konnten nicht geladen werden");
      return res.json() as Promise<RecipeStats>;
    },
    staleTime: 60_000,
  });
}
