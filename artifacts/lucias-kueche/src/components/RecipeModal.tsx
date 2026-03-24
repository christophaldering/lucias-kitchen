import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { X, Clock, ChefHat, CalendarPlus, Users, Flame, BookOpen, Check, Printer } from "lucide-react";
import { addMealPlanEntry } from "@/hooks/useMealPlans";
import RecipePrintView from "@/components/RecipePrintView";

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onAddToWeek?: (id: number) => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

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

export default function RecipeModal({ recipe, onClose, onAddToWeek }: Props) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  const today = toIsoDate(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [saving, setSaving] = useState(false);

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
            {recipe.servings && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4 text-[#C1693A]" />
                {recipe.servings} Portionen
              </span>
            )}
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
            {recipe.cookedCount != null && recipe.cookedCount > 0 && (
              <span>🍳 {recipe.cookedCount}× gekocht</span>
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
            <h3 className="font-serif font-semibold text-lg text-foreground mb-3 flex items-center gap-2">
              🛒 Zutaten
              {recipe.servings && (
                <span className="text-sm font-sans font-normal text-muted-foreground">
                  (für {recipe.servings} Personen)
                </span>
              )}
            </h3>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C1693A] flex-shrink-0" />
                  <span>
                    {[ing.amount, ing.unit].filter(Boolean).join(" ")}
                    {(ing.amount || ing.unit) && " "}
                    <span className="font-medium">{ing.name}</span>
                    {ing.note && (
                      <span className="text-muted-foreground"> ({ing.note})</span>
                    )}
                  </span>
                </li>
              ))}
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

            <div className="flex gap-3">
              {!showDatePicker && (
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Zum Kalender hinzufügen
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
    </>
  );
}
