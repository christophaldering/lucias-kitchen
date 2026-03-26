import { openai } from "@workspace/integrations-openai-ai-server";

export interface RecipeTagInput {
  title: string;
  category?: string | null;
  ingredients?: Array<{ name: string }>;
  seasons?: string[] | null;
  steps?: string[];
  notes?: string | null;
}

const MIN_TAGS = 5;
const MAX_TAGS = 10;
const MAX_RETRIES = 2;

const TAG_GENERATION_PROMPT = `Du bist ein Rezept-Klassifikator. Analysiere das folgende Rezept und generiere genau 5–10 prägnante Schlagwörter auf Deutsch.

Die Tags sollen folgende Aspekte abdecken (nicht alle müssen vorhanden sein):
- Ernährungsform: z.B. "vegetarisch", "vegan", "mit Fleisch", "pescetarisch"
- Küche/Herkunft: z.B. "Italienisch", "Asiatisch", "Deutsch", "Mediterran"
- Anlass: z.B. "Für Gäste", "Alltagsküche", "Familienessen", "Party", "Sonntagsessen"
- Hauptzutat-Gruppe: z.B. "Pasta", "Hülsenfrüchte", "Meeresfrüchte", "Gemüse", "Geflügel"
- Zubereitungsart: z.B. "One-Pot", "Backofen", "Schnell", "Meal-Prep", "Pfannengericht"
- Stimmung/Aufwand: z.B. "Einfach", "Aufwändig", "Comfort Food", "Leicht", "Herzhaft"

Antworte NUR mit einem JSON-Array von Strings (mindestens 5, maximal 10), ohne Markdown, ohne Erklärungen.
Beispiel: ["vegetarisch", "Italienisch", "Pasta", "Schnell", "Alltagsküche", "Einfach", "One-Pot"]`;

function normalizeTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (trimmed.length === 0 || trimmed.length > 50) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

async function attemptGenerate(description: string): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 256,
    messages: [
      { role: "system", content: TAG_GENERATION_PROMPT },
      { role: "user", content: description },
    ],
  });

  let rawJson = response.choices[0]?.message?.content ?? "[]";
  rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) return [];
  return normalizeTags(parsed);
}

export async function generateTagsForRecipe(recipe: RecipeTagInput): Promise<string[]> {
  const ingredientList = (recipe.ingredients ?? [])
    .map((i) => i.name)
    .filter(Boolean)
    .slice(0, 30)
    .join(", ");

  const stepsSummary = (recipe.steps ?? [])
    .slice(0, 5)
    .join(" ")
    .slice(0, 500);

  const seasonMap: Record<string, string> = {
    spring: "Frühling",
    summer: "Sommer",
    autumn: "Herbst",
    winter: "Winter",
  };
  const seasonLabels = (recipe.seasons ?? [])
    .map((s) => seasonMap[s] ?? s)
    .join(", ");

  const recipeDescription = [
    `Titel: ${recipe.title}`,
    recipe.category ? `Kategorie: ${recipe.category}` : null,
    ingredientList ? `Zutaten: ${ingredientList}` : null,
    seasonLabels ? `Saison: ${seasonLabels}` : null,
    stepsSummary ? `Zubereitungshinweise: ${stepsSummary}` : null,
    recipe.notes ? `Notizen: ${recipe.notes.slice(0, 200)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tags = await attemptGenerate(recipeDescription);
      if (tags.length >= MIN_TAGS) return tags;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  void lastError;
  return [];
}
