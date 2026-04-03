import { useState, useMemo } from "react";
import { useRecipes } from "@/hooks/useRecipes";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useNutritionSummary } from "@/hooks/useNutritionSummary";
import RecipeModal from "@/components/RecipeModal";
import AiWeekSuggestModal, { type SuggestionEntry } from "@/components/AiWeekSuggestModal";
import CreateInvitationDialog from "@/components/CreateInvitationDialog";
import RespondInvitationDialog from "@/components/RespondInvitationDialog";
import type { Recipe } from "@/types/recipe";
import { X, ShoppingCart, Copy, Check, Loader2, ChevronLeft, ChevronRight, CalendarDays, Plus, Flame, Wand2, Mail, Printer } from "lucide-react";
import { useInvitations } from "@/hooks/useInvitations";
import { useAuth } from "@/contexts/AuthContext";
import type { MealInvitation } from "@/hooks/useInvitations";
import ShoppingListPrintView, { type PrintOptions } from "@/components/ShoppingListPrintView";

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

interface WochenplanProps {
  onNavigate?: (tab: string) => void;
}

export default function Wochenplan({ onNavigate }: WochenplanProps = {}) {
  const { user } = useAuth();
  const { recipes, loading: recipesLoading, isBackgroundRefreshing } = useRecipes("all", { loadAll: true });
  const { invitations, createInvitation, submitWish, updateRsvp, refetch: refetchInvitations } = useInvitations();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(toIsoDate(today));
  const [addingDay, setAddingDay] = useState<string | null>(null);

  const changeWeekOffset = (newOffset: number) => {
    const newMonday = addDays(getMonday(today), newOffset * 7);
    const newWeekDays = Array.from({ length: 7 }, (_, i) => addDays(newMonday, i));
    const todayIso = toIsoDate(today);
    const todayInNewWeek = newWeekDays.find((d) => toIsoDate(d) === todayIso);
    if (todayInNewWeek) {
      setSelectedDate(todayIso);
    } else {
      setSelectedDate(toIsoDate(newMonday));
    }
    setWeekOffset(newOffset);
    setAddingDay(null);
  };
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    showDateRange: true,
    showChecked: false,
    showRecipeSources: true,
  });
  const [isPrinting, setIsPrinting] = useState(false);

  const [showAiModal, setShowAiModal] = useState(false);
  const [inviteDate, setInviteDate] = useState<string | null>(null);
  const [respondingInvitation, setRespondingInvitation] = useState<MealInvitation | null>(null);

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

  const { plans, loading: plansLoading, addMealPlan, deleteMealPlan, refetch: refetchWeekPlans } = useMealPlans(
    toIsoDate(weekStart),
    toIsoDate(weekEnd)
  );

  const { summary: nutritionSummary, loading: nutritionLoading, refetch: refetchNutrition } = useNutritionSummary(
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

  const recipeSources = useMemo(() => {
    const result: Partial<Record<IngCategory, string[]>> = {};
    for (const p of shoppingPlans) {
      if (!p.recipe) continue;
      for (const ing of p.recipe.ingredients ?? []) {
        const cat = categorizeIngredient(ing.name);
        if (!result[cat]) result[cat] = [];
        if (!result[cat]!.includes(p.recipe.title)) {
          result[cat]!.push(p.recipe.title);
        }
      }
    }
    return result;
  }, [shoppingPlans]);

  const dateRangeLabel = useMemo(() => {
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}.${m}.${y}`;
    };
    if (shoppingRange === "this_week") {
      return `Diese Woche (${fmt(shoppingFrom)} – ${fmt(shoppingTo)})`;
    }
    if (shoppingRange === "next_7") {
      return `Nächste 7 Tage (${fmt(shoppingFrom)} – ${fmt(shoppingTo)})`;
    }
    return `${fmt(shoppingFrom)} – ${fmt(shoppingTo)}`;
  }, [shoppingRange, shoppingFrom, shoppingTo]);

  const handlePrint = () => {
    setShowPrintDialog(false);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    }, 120);
  };

  const handleSetRecipe = async (dateStr: string, recipeId: number) => {
    try {
      await addMealPlan(dateStr, recipeId);
      setAddingDay(null);
      refetchNutrition();
    } catch {
      showToast("Fehler beim Speichern", "error");
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deleteMealPlan(id);
      refetchNutrition();
    } catch {
      showToast("Fehler beim Löschen", "error");
    }
  };

  const handleAiConfirm = async (suggestions: SuggestionEntry[]) => {
    await Promise.all(
      suggestions.map((s) =>
        fetch("/api/meal-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: s.date, recipeId: s.recipeId }),
        })
      )
    );
    await refetchWeekPlans();
    showToast(`${suggestions.length} Rezepte in den Wochenplan eingetragen!`);
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

  const selectedDay = useMemo(() => {
    const found = weekDays.find((d) => toIsoDate(d) === selectedDate);
    return found ?? weekDays[0];
  }, [weekDays, selectedDate]);

  const selectedPlanEntry = planByDate[selectedDate] ?? null;
  const selectedRecipe = selectedPlanEntry?.recipe ?? null;
  const selectedEmoji = selectedRecipe ? (CATEGORY_EMOJIS[selectedRecipe.category] ?? "🍽️") : null;

  const isTodaySelected = selectedDate === toIsoDate(today);

  const invitationForDate = useMemo(() => {
    return invitations.find(
      (inv) => inv.date === selectedDate && inv.status !== "cancelled"
    ) ?? null;
  }, [invitations, selectedDate]);

  const invitationBadgeForDate = useMemo(() => {
    const result: Record<string, MealInvitation> = {};
    for (const inv of invitations) {
      if (inv.status !== "cancelled") {
        result[inv.date] = inv;
      }
    }
    return result;
  }, [invitations]);

  if (recipesLoading && recipes.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-lg">Rezepte werden geladen…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      {isBackgroundRefreshing && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[#4A7C59]/8 border border-[#4A7C59]/20 text-sm text-[#4A7C59]">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span>Rezepte werden aktualisiert…</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          📅 Mein Wochenplan
        </h2>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {formatMonthYear(weekStart)}
          </div>
          <button
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3d6849] transition-colors shadow-sm"
          >
            <Wand2 className="w-4 h-4" />
            <span className="hidden sm:inline">Woche vorschlagen</span>
            <span className="sm:hidden">KI</span>
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => changeWeekOffset(weekOffset - 1)}
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
            onClick={() => changeWeekOffset(0)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#4A7C59]/40 text-[#4A7C59] text-xs font-medium hover:bg-[#4A7C59]/5 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Heute
          </button>
        )}

        <button
          onClick={() => changeWeekOffset(weekOffset + 1)}
          className="p-2 rounded-xl border border-border bg-white hover:bg-[#4A7C59]/5 hover:border-[#4A7C59]/30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day strip + detail card */}
      {plansLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
          <span className="text-sm">Wochenplan wird geladen…</span>
        </div>
      ) : (
        <div className="mb-10">
          {/* Horizontal day strip */}
          <div className="flex gap-1.5 mb-4 bg-white rounded-2xl border border-border p-2 shadow-sm overflow-x-auto">
            {weekDays.map((day) => {
              const dateStr = toIsoDate(day);
              const isToday = dateStr === toIsoDate(today);
              const isSelected = dateStr === selectedDate;
              const hasRecipe = !!planByDate[dateStr];
              const hasInvitation = !!invitationBadgeForDate[dateStr];

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`flex flex-col items-center flex-1 min-w-[40px] py-2 px-1 rounded-xl transition-all relative ${
                    isSelected
                      ? "bg-[#C1693A] text-white shadow-md"
                      : isToday
                      ? "bg-[#C1693A]/10 text-[#C1693A]"
                      : "text-muted-foreground hover:bg-[#4A7C59]/5 hover:text-foreground"
                  }`}
                >
                  {hasInvitation && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                  <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSelected ? "text-white/80" : ""}`}>
                    {DAY_NAMES_SHORT[day.getDay()]}
                  </span>
                  <span className={`text-sm font-semibold leading-tight ${isSelected ? "text-white" : ""}`}>
                    {day.getDate()}
                  </span>
                  <span className={`text-[10px] leading-none mt-0.5 ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>
                    {day.getMonth() + 1}.
                  </span>
                  {/* Dot indicators */}
                  <div className="flex gap-0.5 mt-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        hasRecipe
                          ? isSelected
                            ? "bg-white/80"
                            : "bg-[#4A7C59]"
                          : "bg-transparent"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Day detail card */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Card header */}
            <div className={`px-5 py-4 ${isTodaySelected ? "bg-[#C1693A]/5 border-b border-[#C1693A]/15" : "bg-[#4A7C59]/5 border-b border-[#4A7C59]/15"}`}>
              <p className={`font-serif text-lg font-semibold ${isTodaySelected ? "text-[#C1693A]" : "text-[#4A7C59]"}`}>
                {DAY_NAMES_LONG[selectedDay.getDay()]}
                {isTodaySelected && <span className="ml-2 text-sm font-sans font-normal text-[#C1693A]/70">– heute</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedDay.getDate()}. {selectedDay.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
              </p>
            </div>

            {/* Card body */}
            <div className="px-5 py-5">
              {selectedRecipe ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Recipe display */}
                  <button
                    onClick={() => setModalRecipe(selectedRecipe as Recipe)}
                    className="flex items-center gap-4 flex-1 text-left group rounded-xl p-3 -m-3 hover:bg-[#4A7C59]/5 transition-colors"
                  >
                    <span className="text-4xl flex-shrink-0">{selectedEmoji}</span>
                    <div className="min-w-0">
                      <p className="font-serif font-semibold text-foreground text-lg leading-snug group-hover:text-[#4A7C59] transition-colors">
                        {selectedRecipe.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {selectedRecipe.category}
                        {selectedRecipe.totalTime && ` · ${selectedRecipe.totalTime.replace("ca. ", "")}`}
                      </p>
                      <p className="text-xs text-[#4A7C59] mt-1 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Rezept ansehen →
                      </p>
                    </div>
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Change recipe */}
                    <div className="relative">
                      {addingDay === selectedDate ? (
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleSetRecipe(selectedDate, Number(e.target.value));
                          }}
                          onBlur={() => setAddingDay(null)}
                          className="border border-[#4A7C59]/40 bg-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 pr-8"
                        >
                          <option value="" disabled>Rezept wählen…</option>
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setAddingDay(selectedDate)}
                          className="px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-[#4A7C59]/40 hover:text-[#4A7C59] transition-colors"
                        >
                          Ändern
                        </button>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => selectedPlanEntry && handleRemove(selectedPlanEntry.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Entfernen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-muted-foreground text-sm">Kein Rezept für diesen Tag eingeplant.</p>
                  </div>
                  <div className="flex-shrink-0">
                    {addingDay === selectedDate ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleSetRecipe(selectedDate, Number(e.target.value));
                        }}
                        onBlur={() => setAddingDay(null)}
                        className="border border-[#4A7C59]/40 bg-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
                      >
                        <option value="" disabled>Rezept wählen…</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.title}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setAddingDay(selectedDate)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Rezept hinzufügen
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Invitation section */}
              {invitationForDate ? (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${
                    invitationForDate.isHost
                      ? "bg-[#4A7C59]/5 border border-[#4A7C59]/20"
                      : "bg-blue-50 border border-blue-200"
                  }`}>
                    <Mail className={`w-4 h-4 flex-shrink-0 ${invitationForDate.isHost ? "text-[#4A7C59]" : "text-blue-600"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${invitationForDate.isHost ? "text-[#4A7C59]" : "text-blue-700"}`}>
                        {invitationForDate.isHost
                          ? `Kocheinladung · ${invitationForDate.members.length} Gäste`
                          : `Einladung von ${invitationForDate.host?.displayName}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {invitationForDate.status === "decided" && invitationForDate.finalRecipe
                          ? `Rezept: ${invitationForDate.finalRecipe.title}`
                          : invitationForDate.status === "decided"
                          ? "Entschieden"
                          : "Offen"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (invitationForDate.isHost) {
                          onNavigate?.("einladungen");
                        } else {
                          setRespondingInvitation(invitationForDate);
                        }
                      }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        invitationForDate.isHost
                          ? "bg-[#4A7C59] text-white hover:bg-[#3d6849]"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {invitationForDate.isHost ? "Verwalten" : "Antworten"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setInviteDate(selectedDate)}
                    className="flex items-center gap-2 text-xs text-[#4A7C59] hover:underline"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    + Kocheinladung erstellen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nutrition summary for the week */}
      {!plansLoading && (
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 mb-6">
          <h3 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-[#C1693A]" />
            Nährwert-Übersicht
            <span className="text-xs font-sans font-normal text-muted-foreground ml-1">({weekLabel})</span>
          </h3>
          {nutritionLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Wird berechnet…</span>
            </div>
          ) : !nutritionSummary || nutritionSummary.totalDays === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Rezepte geplant – Nährwerte können nicht berechnet werden.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#C1693A]/5 rounded-xl p-3 text-center border border-[#C1693A]/10">
                  <p className="text-2xl font-bold text-[#C1693A] font-serif">
                    {nutritionSummary.totalKcal.toLocaleString("de-DE")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Gesamt-Kcal</p>
                </div>
                <div className="bg-[#4A7C59]/5 rounded-xl p-3 text-center border border-[#4A7C59]/10">
                  <p className="text-2xl font-bold text-[#4A7C59] font-serif">
                    {nutritionSummary.avgKcalPerDay != null
                      ? nutritionSummary.avgKcalPerDay.toLocaleString("de-DE")
                      : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ø Kcal / erfasster Tag</p>
                </div>
                <div className="bg-secondary rounded-xl p-3 text-center border border-border col-span-2 sm:col-span-1">
                  <p className="text-2xl font-bold text-foreground font-serif">
                    {nutritionSummary.daysWithKcal}/{nutritionSummary.totalDays}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tage erfasst</p>
                </div>
              </div>
              {nutritionSummary.daysWithoutKcal > 0 && (
                <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ {nutritionSummary.daysWithoutKcal}{" "}
                  {nutritionSummary.daysWithoutKcal === 1 ? "Rezept hat" : "Rezepte haben"} keine Kcal-Angabe und{" "}
                  {nutritionSummary.daysWithoutKcal === 1 ? "ist" : "sind"} nicht in der Summe enthalten.
                </p>
              )}
            </div>
          )}
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
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => setShowPrintDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C1693A] text-white text-sm font-medium hover:bg-[#a8572f] transition-colors"
                title="Einkaufsliste drucken"
              >
                <Printer className="w-4 h-4" />
                Drucken
              </button>
            </div>
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

      {/* Recipe Modal */}
      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          onClose={() => setModalRecipe(null)}
        />
      )}

      {/* AI Week Suggest Modal */}
      <AiWeekSuggestModal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        weekStart={weekStart}
        allRecipes={recipes}
        onConfirm={handleAiConfirm}
      />

      {/* Create Invitation Dialog */}
      {inviteDate && (
        <CreateInvitationDialog
          date={inviteDate}
          recipes={recipes}
          onClose={() => setInviteDate(null)}
          onCreate={async (payload) => {
            await createInvitation(payload);
            showToast("Einladung gesendet!");
            refetchInvitations();
          }}
        />
      )}

      {/* Respond to Invitation Dialog */}
      {respondingInvitation && user && (
        <RespondInvitationDialog
          invitation={respondingInvitation}
          recipes={recipes}
          currentUserId={user.id}
          onClose={() => setRespondingInvitation(null)}
          onSubmitWish={async (payload) => {
            await submitWish(respondingInvitation.id, payload);
            showToast("Antwort gespeichert");
          }}
          onRsvp={async (rsvp) => {
            await updateRsvp(respondingInvitation.id, rsvp);
            const label = rsvp === "coming" ? "Zusage" : rsvp === "not_coming" ? "Absage" : "Status";
            showToast(`${label} gespeichert`);
          }}
        />
      )}

      {/* Print Options Dialog */}
      {showPrintDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPrintDialog(false); }}
        >
          <div className="bg-white dark:bg-[#1c1c1c] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#C1693A]" />
                Druckoptionen
              </h2>
              <button
                onClick={() => setShowPrintDialog(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {([
                { key: "showDateRange", label: "Zeitraum anzeigen" },
                { key: "showChecked", label: "Abgehakte Artikel einblenden" },
                { key: "showRecipeSources", label: "Quell-Rezepte als Fußnote anzeigen" },
              ] as { key: keyof PrintOptions; label: string }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      printOptions[key] ? "bg-[#4A7C59]" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    onClick={() =>
                      setPrintOptions((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        printOptions[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </div>
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowPrintDialog(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 px-4 py-2 rounded-xl bg-[#C1693A] text-white text-sm font-medium hover:bg-[#a8572f] transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Drucken
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shopping List Print View */}
      {isPrinting && (
        <ShoppingListPrintView
          grouped={grouped}
          catOrder={catOrder}
          checked={checked}
          options={printOptions}
          dateRangeLabel={dateRangeLabel}
          recipeSources={recipeSources}
        />
      )}
    </div>
  );
}
