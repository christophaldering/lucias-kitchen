import { useState } from "react";
import { X, Wand2, Loader2, RefreshCw, Check, AlertCircle, ChevronDown } from "lucide-react";

const DAY_NAMES_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES_LONG[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

type MealType = "lunch" | "dinner";

export interface SuggestionEntry {
  date: string;
  recipeId: number;
  recipeTitle: string;
  recipeCategory: string;
  occupied: boolean;
}

interface Recipe {
  id: number;
  title: string;
  category: string;
}

interface AiWeekSuggestModalProps {
  open: boolean;
  onClose: () => void;
  weekStart: Date;
  allRecipes: Recipe[];
  onConfirm: (suggestions: SuggestionEntry[]) => Promise<void>;
}

type ModalStep = "settings" | "preview";

export default function AiWeekSuggestModal({
  open,
  onClose,
  weekStart,
  allRecipes,
  onConfirm,
}: AiWeekSuggestModalProps) {
  const [step, setStep] = useState<ModalStep>("settings");
  const [days, setDays] = useState(7);
  const [mealTypes, setMealTypes] = useState<MealType[]>(["dinner"]);
  const [wishText, setWishText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([]);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const toggleMealType = (type: MealType) => {
    setMealTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meal-plans/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: toIsoDate(weekStart),
          days,
          mealTypes,
          wishText: wishText.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Fehler ${res.status}`);
      }

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setSwapSlot(null);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const handleSwapRecipe = (date: string, recipeId: number) => {
    const recipe = allRecipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    setSuggestions((prev) =>
      prev.map((s) =>
        s.date === date
          ? { ...s, recipeId, recipeTitle: recipe.title, recipeCategory: recipe.category }
          : s
      )
    );
    setSwapSlot(null);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const toSave = suggestions.filter((s) => !s.occupied);
      await onConfirm(toSave);
      handleClose();
    } catch {
      setError("Fehler beim Speichern des Plans");
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setStep("settings");
    setDays(7);
    setMealTypes(["dinner"]);
    setWishText("");
    setError(null);
    setSuggestions([]);
    setSwapSlot(null);
    onClose();
  };

  if (!open) return null;

  const freeSuggestions = suggestions.filter((s) => !s.occupied);
  const occupiedSuggestions = suggestions.filter((s) => s.occupied);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-[#4A7C59]/5 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4A7C59]/10 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">KI-Wochenvorschlag</h2>
              <p className="text-xs text-muted-foreground">
                {step === "settings" ? "Einstellungen" : "Vorschau & Bestätigung"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === "settings" ? (
            <div className="px-6 py-5 space-y-5">
              {/* Days */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Für wie viele Tage?
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 5, 7, 10, 14].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                        days === d
                          ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                          : "bg-white text-muted-foreground border-border hover:border-[#4A7C59]/40"
                      }`}
                    >
                      {d} Tage
                    </button>
                  ))}
                </div>
              </div>

              {/* Meal types */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Welche Mahlzeiten?
                </label>
                <div className="flex gap-2">
                  {(["lunch", "dinner"] as MealType[]).map((type) => {
                    const labels: Record<MealType, string> = { lunch: "Mittagessen", dinner: "Abendessen" };
                    const emojis: Record<MealType, string> = { lunch: "☀️", dinner: "🌙" };
                    return (
                      <button
                        key={type}
                        onClick={() => toggleMealType(type)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                          mealTypes.includes(type)
                            ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                            : "bg-white text-muted-foreground border-border hover:border-[#4A7C59]/40"
                        }`}
                      >
                        <span>{emojis[type]}</span>
                        {labels[type]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Wishes */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Sonderwünsche <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={wishText}
                  onChange={(e) => setWishText(e.target.value)}
                  placeholder='z. B. "nichts mit Fisch diese Woche", "lieber leichte Gerichte", "mehr Vegetarisches"...'
                  rows={3}
                  maxLength={500}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{wishText.length}/500</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-5 space-y-3">
              {occupiedSuggestions.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {occupiedSuggestions.length} bereits belegte{" "}
                    {occupiedSuggestions.length === 1 ? "Tag wird" : "Tage werden"} nicht überschrieben.
                  </span>
                </div>
              )}

              {suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Keine Vorschläge verfügbar.
                </p>
              )}

              {suggestions.map((s) => {
                const emoji = CATEGORY_EMOJIS[s.recipeCategory] ?? "🍽️";
                return (
                  <div
                    key={s.date}
                    className={`rounded-xl border p-4 transition-colors ${
                      s.occupied
                        ? "bg-secondary/50 border-border opacity-60"
                        : "bg-white border-border hover:border-[#4A7C59]/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          {formatDate(s.date)}
                          {s.occupied && (
                            <span className="ml-2 text-amber-600 normal-case font-normal">
                              (bereits belegt)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{emoji}</span>
                          <p className="font-serif font-semibold text-foreground text-sm leading-snug">
                            {s.recipeTitle}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-7">{s.recipeCategory}</p>
                      </div>

                      {!s.occupied && (
                        <div className="flex-shrink-0">
                          {swapSlot === s.date ? (
                            <div className="relative">
                              <select
                                autoFocus
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) handleSwapRecipe(s.date, Number(e.target.value));
                                }}
                                onBlur={() => setSwapSlot(null)}
                                className="border border-[#4A7C59]/40 bg-white text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 pr-7 max-w-[180px]"
                              >
                                <option value="" disabled>Anderes Rezept…</option>
                                {allRecipes.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSwapSlot(s.date)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:border-[#4A7C59]/40 hover:text-[#4A7C59] transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Tauschen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-white flex-shrink-0">
          {step === "settings" ? (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || allRecipes.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    KI erstellt Plan…
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Plan vorschlagen
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("settings"); setError(null); }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                Zurück
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#4A7C59]/40 text-[#4A7C59] text-sm hover:bg-[#4A7C59]/5 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Neu generieren
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || freeSuggestions.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Wird gespeichert…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {freeSuggestions.length} Tage übernehmen
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
