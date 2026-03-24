import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { X, Clock, ChefHat, CalendarPlus, Users, Flame, BookOpen, Check, Printer, UtensilsCrossed, Minus, Plus, Star, ChevronDown } from "lucide-react";
import { SEASON_ICONS, SEASON_LABELS } from "@/types/recipe";
import type { Season } from "@/types/recipe";
import { addMealPlanEntry } from "@/hooks/useMealPlans";
import RecipePrintView from "@/components/RecipePrintView";
import CookingMode from "@/components/CookingMode";
import RecipePhotoGallery from "@/components/RecipePhotoGallery";
import CookingLogModal from "@/components/CookingLogModal";
import { useCookingLog } from "@/hooks/useCookingLog";
import { RecipeComments } from "@/components/RecipeComments";

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onAddToWeek?: (id: number) => void;
  onToggleFavorite?: (id: number, isFavorite: boolean) => void;
  onRecipeUpdated?: (updatedRecipe: unknown) => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

const VULGAR_FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 6, "⅙"],
  [1 / 5, "⅕"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [2 / 5, "⅖"],
  [1 / 2, "½"],
  [3 / 5, "⅗"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [4 / 5, "⅘"],
  [5 / 6, "⅚"],
  [7 / 8, "⅞"],
];

function formatAmount(value: number): string {
  if (value <= 0) return "";

  const whole = Math.floor(value);
  const frac = value - whole;

  if (frac < 0.05) {
    return whole === 0 ? "" : String(whole);
  }

  for (const [fracVal, fracStr] of VULGAR_FRACTIONS) {
    if (Math.abs(frac - fracVal) < 0.05) {
      return whole === 0 ? fracStr : `${whole} ${fracStr}`;
    }
  }

  if (value < 10) {
    const rounded = Math.round(value * 4) / 4;
    if (rounded !== Math.round(rounded)) {
      return rounded.toFixed(1).replace(".", ",");
    }
    return String(Math.round(rounded));
  }

  return String(Math.round(value));
}

function parseAmount(amount: string): number | null {
  if (!amount || !amount.trim()) return null;

  const trimmed = amount.trim().replace(",", ".");

  const vulgarMap: Record<string, number> = {
    "⅛": 1 / 8, "⅙": 1 / 6, "⅕": 1 / 5, "¼": 1 / 4,
    "⅓": 1 / 3, "⅜": 3 / 8, "⅖": 2 / 5, "½": 1 / 2,
    "⅗": 3 / 5, "⅝": 5 / 8, "⅔": 2 / 3, "¾": 3 / 4,
    "⅘": 4 / 5, "⅚": 5 / 6, "⅞": 7 / 8,
  };

  for (const [char, val] of Object.entries(vulgarMap)) {
    const wholeMatch = trimmed.match(new RegExp(`^(\\d+)\\s*${char}$`));
    if (wholeMatch) return parseInt(wholeMatch[1], 10) + val;
    if (trimmed === char) return val;
  }

  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den !== 0) return num / den;
  }

  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den !== 0) return whole + num / den;
  }

  const num = parseFloat(trimmed);
  if (!isNaN(num)) return num;

  return null;
}

function scaleAmount(amount: string, scaleFactor: number): string {
  if (!amount || !amount.trim()) return amount;

  const parsed = parseAmount(amount);
  if (parsed === null) return amount;

  const scaled = parsed * scaleFactor;
  return formatAmount(scaled);
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  return (
    <span className="text-sm font-medium">
      {rating === "sehr lecker" ? "⭐⭐ sehr lecker" : "⭐ lecker"}
    </span>
  );
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function showToast(message: string, type: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
    type === "success" ? "bg-[#4A7C59]" : "bg-red-600"
  }`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

export default function RecipeModal({ recipe, onClose, onAddToWeek, onToggleFavorite, onRecipeUpdated }: Props) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  const today = toIsoDate(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [cookingMode, setCookingMode] = useState(false);
  const [currentServings, setCurrentServings] = useState(recipe.servings ?? 4);
  const [favLoading, setFavLoading] = useState(false);
  const [showCookingLogModal, setShowCookingLogModal] = useState(false);
  const [showAllLogEntries, setShowAllLogEntries] = useState(false);
  const [localCookedCount, setLocalCookedCount] = useState(recipe.cookedCount ?? 0);

  const { entries: logEntries, refetch: refetchLog } = useCookingLog(recipe.id, showAllLogEntries ? undefined : 3);

  const originalServings = recipe.servings ?? null;
  const scaleFactor =
    originalServings && originalServings > 0
      ? currentServings / originalServings
      : 1;

  const isOwner = recipe.isOwner !== false;
  const isFavorite = recipe.isFavorite ?? false;

  const diffColor =
    recipe.difficulty === "simpel"
      ? "bg-green-100 text-green-800"
      : recipe.difficulty === "normal"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";

  const handleAddToCalendar = async () => {
    setSaving(true);
    try {
      await addMealPlanEntry(selectedDate, recipe.id);
      const [year, month, day] = selectedDate.split("-");
      showToast(`${recipe.title} am ${day}.${month}.${year} eingeplant!`);
      setShowDatePicker(false);
    } catch {
      showToast("Fehler beim Speichern", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    setFavLoading(true);
    try {
      await onToggleFavorite(recipe.id, isFavorite);
    } catch {
      showToast("Fehler beim Merken", "error");
    } finally {
      setFavLoading(false);
    }
  };

  const handleCookingLogSaved = (updatedRecipe: unknown) => {
    setLocalCookedCount((prev) => prev + 1);
    refetchLog();
    if (onRecipeUpdated) onRecipeUpdated(updatedRecipe);
  };

  if (cookingMode) {
    return <CookingMode recipe={recipe} onClose={() => setCookingMode(false)} />;
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-green-200 mb-1">
              {emoji} {recipe.category}
            </p>
            <h2 className="font-serif text-xl font-semibold leading-snug">
              {recipe.title}
            </h2>
            {!isOwner && recipe.owner && (
              <div className="flex items-center gap-1.5 mt-1">
                {recipe.owner.avatarUrl ? (
                  <img src={recipe.owner.avatarUrl} alt={recipe.owner.displayName} className="w-5 h-5 rounded-full object-cover border border-white/30" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {recipe.owner.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-green-200">von {recipe.owner.displayName}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => window.print()}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Rezept drucken"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {recipe.imageUrl && (
          <div className="w-full overflow-hidden max-h-56">
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="w-full h-56 object-cover"
            />
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Meta badges */}
          <div className="flex flex-wrap gap-3 items-center">
            {recipe.prepTime && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-[#C1693A]" />
                Vorbereitung: {recipe.prepTime.replace("ca. ", "")}
              </span>
            )}
            {recipe.totalTime && recipe.totalTime !== recipe.prepTime && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-[#C1693A]" />
                Gesamt: {recipe.totalTime.replace("ca. ", "")}
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${diffColor}`}>
              <ChefHat className="w-3.5 h-3.5" />
              {recipe.difficulty}
            </span>
            {recipe.kcalPerPortion && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Flame className="w-4 h-4 text-[#C1693A]" />
                {recipe.kcalPerPortion} kcal/Portion
              </span>
            )}
          </div>

          {/* Secondary meta */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {recipe.rating && <RatingBadge rating={recipe.rating} />}
            {recipe.source && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                {recipe.source}
              </span>
            )}
            {recipe.lastCooked && (
              <span>Zuletzt gekocht: {recipe.lastCooked}</span>
            )}
            {localCookedCount > 0 && (
              <span>🍳 {localCookedCount}× gekocht</span>
            )}
            {recipe.seasons && recipe.seasons.length > 0 && (
              <span className="flex items-center gap-1">
                {(recipe.seasons as Season[]).map((s) => (
                  <span key={s} title={SEASON_LABELS[s]}>{SEASON_ICONS[s]}</span>
                ))}
                {(recipe.seasons as Season[]).map((s) => SEASON_LABELS[s]).join(", ")}
              </span>
            )}
          </div>

          {/* Lucia's Note */}
          {recipe.notes && (
            <div className="sticky-note rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1 uppercase tracking-wide font-sans">
                📝 Lucias Notizen
              </p>
              <p className="text-base text-amber-900 leading-relaxed font-script">
                {recipe.notes}
              </p>
            </div>
          )}

          {/* Ingredients */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="font-serif font-semibold text-lg text-foreground flex items-center gap-2">
                🛒 Zutaten
              </h3>
              {originalServings && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#C1693A] flex-shrink-0" />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentServings((s) => Math.max(1, s - 1))}
                      disabled={currentServings <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-[#C1693A]/40 text-[#C1693A] hover:bg-[#C1693A]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Portionen verringern"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-[4rem] text-center text-sm font-semibold text-foreground">
                      {currentServings}
                      {currentServings !== originalServings && (
                        <span className="block text-xs font-normal text-muted-foreground leading-none">
                          (Orig.: {originalServings})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setCurrentServings((s) => s + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-[#C1693A]/40 text-[#C1693A] hover:bg-[#C1693A]/10 transition-colors"
                      aria-label="Portionen erhöhen"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-sm text-muted-foreground">Portionen</span>
                </div>
              )}
            </div>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => {
                const scaledAmount = ing.amount
                  ? scaleAmount(ing.amount, scaleFactor)
                  : "";
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C1693A] flex-shrink-0" />
                    <span>
                      {[scaledAmount, ing.unit].filter(Boolean).join(" ")}
                      {(scaledAmount || ing.unit) && " "}
                      <span className="font-medium">{ing.name}</span>
                      {ing.note && (
                        <span className="text-muted-foreground"> ({ing.note})</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Steps */}
          <div>
            <h3 className="font-serif font-semibold text-lg text-foreground mb-3">
              👩‍🍳 Zubereitung
            </h3>
            <ol className="space-y-3">
              {(recipe.steps as string[]).map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-foreground">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A7C59] text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Cooking Photos */}
          <div>
            <RecipePhotoGallery recipeId={recipe.id} />
          </div>

          {/* Cooking log entries for this recipe */}
          {logEntries.length > 0 && (
            <div>
              <h3 className="font-serif font-semibold text-lg text-foreground mb-3">
                📓 Meine Kocheinträge
              </h3>
              <div className="space-y-3">
                {logEntries.map((entry) => (
                  <div key={entry.id} className="bg-white rounded-xl border border-border p-3 flex gap-3">
                    {entry.photoUrl && (
                      <img
                        src={entry.photoUrl}
                        alt="Foto"
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#4A7C59]">{formatDate(entry.date)}</p>
                      {entry.comment && (
                        <p className="text-sm text-foreground mt-0.5 leading-snug">{entry.comment}</p>
                      )}
                      {!entry.comment && (
                        <p className="text-sm text-muted-foreground mt-0.5 italic">Kein Kommentar</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!showAllLogEntries && logEntries.length >= 3 && (
                <button
                  onClick={() => setShowAllLogEntries(true)}
                  className="flex items-center gap-1.5 text-sm text-[#4A7C59] font-medium mt-3 hover:underline"
                >
                  <ChevronDown className="w-4 h-4" />
                  Alle anzeigen
                </button>
              )}
            </div>
          )}

          {/* Comments */}
          <RecipeComments recipeId={recipe.id} />

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2">
            {/* Calendar date picker */}
            {showDatePicker ? (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-[#4A7C59]/5 rounded-xl border border-[#4A7C59]/20">
                <label htmlFor="calendar-date-picker" className="text-sm font-medium text-foreground">Datum wählen:</label>
                <input
                  id="calendar-date-picker"
                  type="date"
                  value={selectedDate}
                  min={today}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-sm border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 bg-white"
                />
                <button
                  onClick={handleAddToCalendar}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4A7C59] text-white rounded-lg text-sm font-medium hover:bg-[#3d6849] transition-colors disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Speichern…" : "Speichern"}
                </button>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            ) : null}

            <div className="flex gap-3 flex-wrap">
              {recipe.steps && (recipe.steps as string[]).length > 0 && (
                <button
                  onClick={() => setCookingMode(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a85830] transition-colors"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Kochen starten
                </button>
              )}

              <button
                onClick={() => setShowCookingLogModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
              >
                <UtensilsCrossed className="w-4 h-4" />
                Heute gekocht
              </button>

              {!showDatePicker && (
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-secondary/80 transition-colors"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Zum Kalender
                </button>
              )}

              {!isOwner && onToggleFavorite && (
                <button
                  onClick={handleToggleFavorite}
                  disabled={favLoading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                    isFavorite
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "border border-border text-foreground hover:bg-secondary"
                  }`}
                >
                  <Star className={`w-4 h-4 ${isFavorite ? "fill-white" : ""}`} />
                  {isFavorite ? "Gemerkt ✓" : "⭐ Merken"}
                </button>
              )}

              {onAddToWeek && (
                <button
                  onClick={() => { onAddToWeek(recipe.id); onClose(); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-secondary/80 transition-colors"
                >
                  Zur Woche
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <RecipePrintView recipe={recipe} />

    {showCookingLogModal && (
      <CookingLogModal
        recipe={recipe}
        onClose={() => setShowCookingLogModal(false)}
        onSaved={handleCookingLogSaved}
      />
    )}
    </>
  );
}
