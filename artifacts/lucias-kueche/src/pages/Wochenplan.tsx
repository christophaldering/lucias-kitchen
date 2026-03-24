import { useState } from "react";
import { DAYS } from "@/types/recipe";
import { useRecipes } from "@/hooks/useRecipes";
import { X, ShoppingCart, Copy, Check, Loader2 } from "lucide-react";

type IngCategory = "Gemüse" | "Fleisch & Fisch" | "Milchprodukte" | "Vorrat" | "Sonstiges";

const INGREDIENT_CATEGORIES: Record<string, IngCategory> = {
  Spinat: "Gemüse", Tomaten: "Gemüse", Karotte: "Gemüse", Paprika: "Gemüse",
  Zwiebel: "Gemüse", Knoblauch: "Gemüse", Lauch: "Gemüse", Sellerie: "Gemüse",
  Champignons: "Gemüse", Zuckerschoten: "Gemüse", Äpfel: "Gemüse", Orange: "Gemüse",
  "Rote Bete": "Gemüse", Zucchini: "Gemüse", Brokkoli: "Gemüse", Blumenkohl: "Gemüse",
  Hackfleisch: "Fleisch & Fisch", Hähnchen: "Fleisch & Fisch", Kabeljau: "Fleisch & Fisch",
  Lachs: "Fleisch & Fisch", Thunfisch: "Fleisch & Fisch", Speck: "Fleisch & Fisch",
  Gyrosfleisch: "Fleisch & Fisch", Putenschnitzel: "Fleisch & Fisch",
  Fischfilet: "Fleisch & Fisch", Scampi: "Fleisch & Fisch", Garnelen: "Fleisch & Fisch",
  Hähnchenfilet: "Fleisch & Fisch", Putenbrust: "Fleisch & Fisch",
  Sahne: "Milchprodukte", Schmand: "Milchprodukte", Schmelzkäse: "Milchprodukte",
  Käse: "Milchprodukte", Joghurt: "Milchprodukte", Butter: "Milchprodukte",
  Schafskäse: "Milchprodukte", Mozzarella: "Milchprodukte", Parmesan: "Milchprodukte",
  Kokosmilch: "Vorrat", Linsen: "Vorrat", Kichererbsen: "Vorrat", Nudeln: "Vorrat",
  Spaghetti: "Vorrat", Reis: "Vorrat", Kapern: "Vorrat", Walnusskerne: "Vorrat",
  Semmelbrösel: "Vorrat", Tomatenmark: "Vorrat", Passata: "Vorrat",
};

function categorizeIngredient(name: string): IngCategory {
  for (const [key, cat] of Object.entries(INGREDIENT_CATEGORIES)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return cat;
  }
  return "Sonstiges";
}

const catOrder: IngCategory[] = ["Gemüse", "Fleisch & Fisch", "Milchprodukte", "Vorrat", "Sonstiges"];
const catEmoji: Record<IngCategory, string> = {
  "Gemüse": "🥦",
  "Fleisch & Fisch": "🥩",
  "Milchprodukte": "🧀",
  "Vorrat": "🫙",
  "Sonstiges": "🛒",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

export default function Wochenplan() {
  const { recipes, loading, error } = useRecipes();
  const [plan, setPlan] = useState<(number | null)[]>(Array(7).fill(null));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const plannedEntries = plan
    .map((id, dayIdx) => {
      if (!id) return null;
      const recipe = recipes.find((r) => r.id === id);
      return recipe ? { recipe, dayIdx } : null;
    })
    .filter(Boolean) as { recipe: (typeof recipes)[0]; dayIdx: number }[];

  type ShoppingItem = { text: string; amount: string; unit: string; category: IngCategory };

  const allItems: ShoppingItem[] = plannedEntries.flatMap((pr) =>
    pr.recipe.ingredients.map((ing) => ({
      text: `${[ing.amount, ing.unit, ing.name].filter(Boolean).join(" ")}`,
      amount: ing.amount,
      unit: ing.unit,
      category: categorizeIngredient(ing.name),
    }))
  );

  const grouped = allItems.reduce<Record<IngCategory, string[]>>(
    (acc, { text, category }) => {
      if (!acc[category]) acc[category] = [];
      if (!acc[category].includes(text)) acc[category].push(text);
      return acc;
    },
    {} as Record<IngCategory, string[]>
  );

  const handleSetRecipe = (dayIdx: number, recipeId: number | null) => {
    const next = [...plan];
    next[dayIdx] = recipeId;
    setPlan(next);
  };

  const toggleCheck = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopy = () => {
    const lines = catOrder
      .filter((cat) => grouped[cat]?.length)
      .flatMap((cat) => [
        `\n${catEmoji[cat]} ${cat}:`,
        ...(grouped[cat] ?? []).map((ing) => `  • ${ing}`),
      ]);
    navigator.clipboard.writeText(lines.join("\n").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-lg">Rezepte werden geladen…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="font-serif text-lg text-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h2 className="font-serif text-2xl font-semibold text-foreground mb-6">
        📅 Mein Wochenplan
      </h2>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2 mb-10">
        {DAYS.map((day, idx) => {
          const recipeId = plan[idx];
          const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : null;
          const emoji = recipe ? (CATEGORY_EMOJIS[recipe.category] ?? "🍽️") : null;

          return (
            <div key={day} className="flex flex-col gap-1">
              <p className="text-center text-xs font-bold text-[#4A7C59] uppercase tracking-wider pb-1">
                {day}
              </p>
              <div
                className={`min-h-28 rounded-xl border-2 border-dashed p-2 flex flex-col transition-colors ${
                  recipe
                    ? "bg-white border-[#4A7C59]/30"
                    : "bg-white/50 border-border/50 hover:border-[#4A7C59]/30"
                }`}
              >
                {recipe ? (
                  <div className="flex flex-col h-full gap-1">
                    <span className="text-xl text-center">{emoji}</span>
                    <p className="text-xs font-medium text-foreground leading-tight line-clamp-3 text-center flex-1">
                      {recipe.title}
                    </p>
                    <button
                      onClick={() => handleSetRecipe(idx, null)}
                      className="self-center mt-auto p-0.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-full flex flex-col gap-1">
                    <select
                      key={`day-${idx}-${recipeId}`}
                      defaultValue=""
                      onChange={(e) =>
                        handleSetRecipe(idx, e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full text-xs border-0 bg-transparent text-muted-foreground focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>+ Rezept</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shopping list */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#C1693A]" />
            Einkaufsliste
          </h3>
          {allItems.length > 0 && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#3d6849] transition-colors"
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Kopiert!</>
              ) : (
                <><Copy className="w-4 h-4" /> Liste kopieren</>
              )}
            </button>
          )}
        </div>

        {allItems.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Noch keine Rezepte im Wochenplan. Füge oben Rezepte ein!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {catOrder
              .filter((cat) => grouped[cat]?.length)
              .map((cat) => (
                <div key={cat}>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <span>{catEmoji[cat]}</span>
                    {cat}
                  </h4>
                  <ul className="space-y-1.5">
                    {(grouped[cat] ?? []).map((ing) => {
                      const key = `${cat}::${ing}`;
                      return (
                        <li
                          key={key}
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => toggleCheck(key)}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              checked.has(key)
                                ? "bg-[#4A7C59] border-[#4A7C59]"
                                : "border-border group-hover:border-[#4A7C59]/50"
                            }`}
                          >
                            {checked.has(key) && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span
                            className={`text-sm transition-colors ${
                              checked.has(key) ? "line-through text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {ing}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
