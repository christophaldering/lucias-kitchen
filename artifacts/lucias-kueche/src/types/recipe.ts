export interface RecipeIngredient {
  id: number;
  recipeId: number;
  amount: string;
  unit: string;
  name: string;
  note: string | null;
}

export interface IngredientInput {
  amount: string;
  unit: string;
  name: string;
  note: string | null;
}

export interface Recipe {
  id: number;
  title: string;
  servings: number | null;
  prepTime: string | null;
  totalTime: string | null;
  difficulty: "simpel" | "normal" | "schwer";
  category: string;
  rating: string | null;
  kcalPerPortion: number | null;
  source: string | null;
  lastCooked: string | null;
  cookedCount: number | null;
  notes: string | null;
  steps: string[];
  ingredients: RecipeIngredient[];
  imageUrl?: string | null;
}

export const ALL_CATEGORIES = [
  "Alle",
  "Fisch",
  "Geflügel",
  "Fleisch",
  "Vegetarisch",
  "Pasta",
];

export const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function formatIngredient(ing: RecipeIngredient): string {
  const parts = [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ");
  return ing.note ? `${parts} (${ing.note})` : parts;
}
