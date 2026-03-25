import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Recipe } from "@/types/recipe";
import { authFetch, authHeaders } from "@/lib/authFetch";

export interface MealPlanEntry {
  id: number;
  date: string;
  recipeId: number;
  userId?: number | null;
  recipe: (Recipe & { ingredients: Recipe["ingredients"] }) | null;
}

const API_BASE = "/api";

export function useMealPlans(from: string, to: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MealPlanEntry[], Error>({
    queryKey: ["meal-plans", from, to],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/meal-plans?from=${from}&to=${to}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const addMealPlanMutation = useMutation({
    mutationFn: async ({ date, recipeId }: { date: string; recipeId: number }) => {
      const res = await authFetch(`${API_BASE}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ date, recipeId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<MealPlanEntry>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const deleteMealPlanMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/meal-plans/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const plans = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Wochenplan konnte nicht geladen werden." : null;

  async function fetchPlans() {
    await queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
  }

  async function addMealPlan(date: string, recipeId: number): Promise<MealPlanEntry> {
    return addMealPlanMutation.mutateAsync({ date, recipeId });
  }

  async function deleteMealPlan(id: number) {
    return deleteMealPlanMutation.mutateAsync(id);
  }

  return { plans, loading, error, refetch: fetchPlans, addMealPlan, deleteMealPlan };
}

export async function addMealPlanEntry(date: string, recipeId: number): Promise<MealPlanEntry> {
  const res = await authFetch(`${API_BASE}/meal-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ date, recipeId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
