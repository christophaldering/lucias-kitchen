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

  return { recipes, loading, error, refetch: fetchRecipes, addRecipes };
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
