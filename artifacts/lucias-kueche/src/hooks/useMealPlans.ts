import { useState, useEffect, useCallback } from "react";
import type { Recipe } from "@/types/recipe";

export interface MealPlanEntry {
  id: number;
  date: string;
  recipeId: number;
  recipe: (Recipe & { ingredients: Recipe["ingredients"] }) | null;
}

const API_BASE = "/api";

export function useMealPlans(from: string, to: string) {
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/meal-plans?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlans(data);
    } catch {
      setError("Wochenplan konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const addMealPlan = useCallback(async (date: string, recipeId: number): Promise<MealPlanEntry> => {
    const res = await fetch(`${API_BASE}/meal-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, recipeId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entry = await res.json();
    await fetchPlans();
    return entry;
  }, [fetchPlans]);

  const deleteMealPlan = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/meal-plans/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { plans, loading, error, refetch: fetchPlans, addMealPlan, deleteMealPlan };
}

export async function addMealPlanEntry(date: string, recipeId: number): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE}/meal-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, recipeId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
