import { useState, useMemo } from "react";
import { useRecipes } from "@/hooks/useRecipes";
import { useMealPlans } from "@/hooks/useMealPlans";
import { X, ShoppingCart, Copy, Check, Loader2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

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

const DAY_NAMES_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DAY_NAMES_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDate(d: Date): string {
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

type ShoppingRange = "this_week" | "next_7" | "custom";

function showToast(message: string, type: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
    type === "success" ? "bg-[#4A7C59]" : "bg-red-600"
  }`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export default function Wochenplan() {
  const { recipes, loading: recipesLoading } = useRecipes();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const [shoppingRange, setShoppingRange] = useState<ShoppingRange>("this_week");
  const [customFrom, setCustomFrom] = useState(toIsoDate(today));
  const [customTo, setCustomTo] = useState(toIsoDate(addDays(today, 6)));

  const weekStart = useMemo(() => {
    const monday = getMonday(today);
    return addDays(monday, weekOffset * 7);
  }, [today, weekOffset]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const { plans, loading: plansLoading, addMealPlan, deleteMealPlan } = useMealPlans(
    toIsoDate(weekStart),
    toIsoDate(weekEnd)
  );

  const shoppingFrom = useMemo(() => {
    if (shoppingRange === "this_week") return toIsoDate(getMonday(today));
    if (shoppingRange === "next_7") return toIsoDate(today);
    return customFrom;
  }, [shoppingRange, today, customFrom]);

  const shoppingTo = useMemo(() => {
    if (shoppingRange === "this_week") return toIsoDate(addDays(getMonday(today), 6));
    if (shoppingRange === "next_7") return toIsoDate(addDays(today, 6));
    return customTo;
  }, [shoppingRange, today, customTo]);

  const { plans: shoppingPlans, loading: shoppingLoading } = useMealPlans(shoppingFrom, shoppingTo);

  const planByDate = useMemo(() => {
    const map: Record<string, typeof plans[0]> = {};
    for (const p of plans) {
      map[p.date] = p;
    }
    return map;
  }, [plans]);

  type ShoppingItem = { text: string; category: IngCategory };

  const allShoppingItems: ShoppingItem[] = useMemo(() =>
    shoppingPlans.flatMap((p) =>
      (p.recipe?.ingredients ?? []).map((ing) => ({
        text: `${[ing.amount, ing.unit, ing.name].filter(Boolean).join(" ")}`,
        category: categorizeIngredient(ing.name),
      }))
    ),
    [shoppingPlans]
  );

  const grouped = useMemo(() =>
    allShoppingItems.reduce<Record<IngCategory, string[]>>(
      (acc, { text, category }) => {
        if (!acc[category]) acc[category] = [];
        if (!acc[category].includes(text)) acc[category].push(text);
        return acc;
      },
      {} as Record<IngCategory, string[]>
    ),
    [allShoppingItems]
  );

  const handleSetRecipe = async (dateStr: string, recipeId: number) => {
    try {
      await addMealPlan(dateStr, recipeId);
      setAddingDay(null);
    } catch {
      showToast("Fehler beim Speichern", "error");
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deleteMealPlan(id);
    } catch {
      showToast("Fehler beim Löschen", "error");
    }
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

  const isCurrentWeek = weekOffset === 0;
  const weekLabel = isCurrentWeek
    ? "Diese Woche"
    : weekOffset === 1
    ? "Nächste Woche"
    : weekOffset === -1
    ? "Letzte Woche"
    : `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;

  const loading = recipesLoading || plansLoading;

  if (recipesLoading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-lg">Rezepte werden geladen…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          📅 Mein Wochenplan
        </h2>
        <div className="text-sm text-muted-foreground hidden sm:block">
          {formatMonthYear(weekStart)}
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-2 rounded-xl border border-border bg-white hover:bg-[#4A7C59]/5 hover:border-[#4A7C59]/30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-foreground">{weekLabel}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({formatDate(weekStart)} – {formatDate(weekEnd)})
          </span>
        </div>

        {!isCurrentWeek && (
          <button
            onClick={() => setWeekOffset(0)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#4A7C59]/40 text-[#4A7C59] text-xs font-medium hover:bg-[#4A7C59]/5 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Heute
          </button>
        )}

        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-2 rounded-xl border border-border bg-white hover:bg-[#4A7C59]/5 hover:border-[#4A7C59]/30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Week grid */}
      {plansLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
          <span className="text-sm">Wochenplan wird geladen…</span>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2 mb-10">
          {weekDays.map((day) => {
            const dateStr = toIsoDate(day);
            const isToday = toIsoDate(day) === toIsoDate(today);
            const planEntry = planByDate[dateStr];
            const recipe = planEntry?.recipe ?? null;
            const emoji = recipe ? (CATEGORY_EMOJIS[recipe.category] ?? "🍽️") : null;
            const isAddingThis = addingDay === dateStr;

            return (
              <div key={dateStr} className="flex flex-col gap-1">
                <p className={`text-center text-xs font-bold uppercase tracking-wider pb-1 ${isToday ? "text-[#C1693A]" : "text-[#4A7C59]"}`}>
                  {DAY_NAMES_SHORT[day.getDay()]}
                </p>
                <p className={`text-center text-xs pb-1 ${isToday ? "text-[#C1693A] font-semibold" : "text-muted-foreground"}`}>
                  {day.getDate()}.{day.getMonth() + 1}.
                  {isToday && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#C1693A] align-middle" />}
                </p>
                <div
                  className={`min-h-28 rounded-xl border-2 border-dashed p-2 flex flex-col transition-colors ${
                    recipe
                      ? "bg-white border-[#4A7C59]/30"
                      : isToday
                      ? "bg-[#C1693A]/5 border-[#C1693A]/30"
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
                        onClick={() => planEntry && handleRemove(planEntry.id)}
                        className="self-center mt-auto p-0.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : isAddingThis ? (
                    <div className="h-full flex flex-col gap-1">
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleSetRecipe(dateStr, Number(e.target.value));
                        }}
                        onBlur={() => setAddingDay(null)}
                        className="w-full text-xs border-0 bg-transparent text-muted-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>Rezept wählen…</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingDay(dateStr)}
                      className="w-full h-full flex items-center justify-center text-xs text-muted-foreground hover:text-[#4A7C59] transition-colors"
                    >
                      + Rezept
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Shopping list section */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#C1693A]" />
            Einkaufsliste
          </h3>
          {allShoppingItems.length > 0 && (
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

        {/* Range filter */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs font-semibold text-muted-foreground">Zeitraum:</span>
          {(["this_week", "next_7", "custom"] as ShoppingRange[]).map((range) => {
            const labels: Record<ShoppingRange, string> = {
              this_week: "Diese Woche",
              next_7: "Nächste 7 Tage",
              custom: "Eigener Zeitraum",
            };
            return (
              <button
                key={range}
                onClick={() => setShoppingRange(range)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  shoppingRange === range
                    ? "bg-[#C1693A] text-white"
                    : "bg-secondary text-muted-foreground border border-border hover:border-[#C1693A]/40"
                }`}
              >
                {labels[range]}
              </button>
            );
          })}

          {shoppingRange === "custom" && (
            <div className="flex items-center gap-2 mt-1 w-full sm:w-auto">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
              <span className="text-xs text-muted-foreground">bis</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
            </div>
          )}
        </div>

        {shoppingLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Wird geladen…</span>
          </div>
        ) : allShoppingItems.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Keine Rezepte im gewählten Zeitraum. Füge oben Rezepte ein!
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
