export type PhotoSource = "original" | "upload" | "ai" | "cooked" | "web";

export const PHOTO_SOURCE_LABELS: Record<PhotoSource, string> = {
  original: "Original",
  upload: "Hochgeladen",
  ai: "KI-generiert",
  cooked: "Kochfoto",
  web: "Web-Import",
};

export interface RecipePhoto {
  id: number;
  imageUrl: string;
  thumbnailUrl?: string | null;
  caption: string | null;
  uploadedBy: number | null;
  source: PhotoSource | null;
  createdAt: string;
  linkId: number;
  recipeId: number;
  sortOrder: number;
  isMain: boolean;
  setAsMain?: boolean;
}

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

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Frühling",
  summer: "Sommer",
  autumn: "Herbst",
  winter: "Winter",
};

export const SEASON_ICONS: Record<Season, string> = {
  spring: "🌸",
  summer: "🌞",
  autumn: "🍂",
  winter: "❄️",
};

export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export interface RecipeOwner {
  displayName: string;
  avatarUrl: string | null;
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
  personalNotes?: string | null;
  steps: string[];
  hasSteps?: boolean;
  ingredients: RecipeIngredient[];
  imageUrl?: string | null;
  mainPhotoUrl?: string | null;
  mainPhotoThumbnailUrl?: string | null;
  createdAt?: string | null;
  seasons?: Season[] | null;
  tags?: string[] | null;
  createdBy?: number | null;
  isOwner?: boolean;
  isFavorite?: boolean;
  owner?: RecipeOwner | null;
  parentRecipeId?: number | null;
  variantName?: string | null;
  sourceDocumentUrl?: string | null;
  isAiGenerated?: boolean;
  imageSource?: "ai" | "web" | null;
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
