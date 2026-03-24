import { useState, useEffect, useRef, useCallback } from "react";
import { Lightbulb, Camera, X, Plus, Loader2, ChefHat, Clock, CheckCircle2, AlertCircle, UploadCloud } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import RecipeModal from "@/components/RecipeModal";

const API_BASE = "/api";

const MOOD_OPTIONS = [
  { label: "Pasta", value: "Pasta", emoji: "🍝" },
  { label: "Fisch", value: "Fisch", emoji: "🐟" },
  { label: "Vegetarisch", value: "Vegetarisch", emoji: "🌿" },
  { label: "Geflügel", value: "Geflügel", emoji: "🍗" },
  { label: "Fleisch", value: "Fleisch", emoji: "🥩" },
  { label: "Schnell (< 30 Min)", value: "schnell", emoji: "⚡" },
  { label: "Mittel (< 1 Std)", value: "mittel", emoji: "⏱️" },
  { label: "Aufwändig", value: "aufwändig", emoji: "👨‍🍳" },
];

interface SuggestedRecipe extends Recipe {
  matchScore: number;
  ingredientMatches: number;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

function RecipeSuggestionCard({ recipe, onClick }: { recipe: SuggestedRecipe; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";

  const diffColor =
    recipe.difficulty === "simpel"
      ? "bg-green-100 text-green-700"
      : recipe.difficulty === "normal"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

  return (
    <div
      className="bg-white rounded-2xl border border-border overflow-hidden cursor-pointer relative"
      style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingTop: "60%" }}>
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
            style={{ transform: hovered ? "scale(1.04)" : "scale(1)" }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-5xl"
            style={{ background: "linear-gradient(135deg, #f5ede0, #f0e0c8)" }}
          >
            {emoji}
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full text-white shadow"
            style={{ background: "rgba(45,82,64,0.85)", backdropFilter: "blur(4px)" }}
          >
            {emoji} {recipe.category}
          </span>
        </div>
        {recipe.ingredientMatches > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full text-white shadow"
              style={{ background: "rgba(193,105,58,0.88)", backdropFilter: "blur(4px)" }}
            >
              <CheckCircle2 className="w-3 h-3" />
              {recipe.ingredientMatches} Zutat{recipe.ingredientMatches !== 1 ? "en" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="font-serif font-semibold text-foreground leading-snug mb-2 line-clamp-2 text-sm">
          {recipe.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${diffColor}`}>
            <ChefHat className="w-3 h-3" />
            {recipe.difficulty}
          </span>
          {recipe.totalTime && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {recipe.totalTime.replace("ca. ", "")}
            </span>
          )}
        </div>
      </div>

      {hovered && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl transition-all"
          style={{ background: "rgba(45,82,64,0.88)" }}
        >
          <span className="text-white font-semibold text-sm px-5 py-2.5 border-2 border-white rounded-xl hover:bg-white hover:text-[#2d5240] transition-colors">
            Details ansehen →
          </span>
        </div>
      )}
    </div>
  );
}

export default function WasKocheIch() {
  const [allIngredients, setAllIngredients] = useState<string[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(true);

  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [customIngredient, setCustomIngredient] = useState("");

  const [fridgeLoading, setFridgeLoading] = useState(false);
  const [fridgeIngredients, setFridgeIngredients] = useState<string[]>([]);
  const [fridgeError, setFridgeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [likedMoods, setLikedMoods] = useState<Set<string>>(new Set());
  const [dislikedMoods, setDislikedMoods] = useState<Set<string>>(new Set());

  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedRecipe, setSelectedRecipe] = useState<SuggestedRecipe | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/ingredients`)
      .then((r) => r.json())
      .then((data) => setAllIngredients(data.ingredients ?? []))
      .catch(() => setAllIngredients([]))
      .finally(() => setLoadingIngredients(false));
  }, []);

  const toggleIngredient = (name: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const addCustomIngredient = () => {
    const trimmed = customIngredient.trim();
    if (!trimmed) return;
    setSelectedIngredients((prev) => new Set([...prev, trimmed]));
    if (!allIngredients.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setAllIngredients((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "de")));
    }
    setCustomIngredient("");
  };

  const handleFridgeUpload = useCallback(async (file: File) => {
    setFridgeLoading(true);
    setFridgeError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || "image/jpeg";
      const res = await fetch(`${API_BASE}/extract-fridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      if (!res.ok) throw new Error("Analyse fehlgeschlagen");
      const data = await res.json();
      const detected: string[] = data.ingredients ?? [];
      setFridgeIngredients(detected);
      setSelectedIngredients((prev) => {
        const next = new Set(prev);
        detected.forEach((d) => next.add(d));
        return next;
      });
      setAllIngredients((prev) => {
        const combined = new Set([...prev, ...detected]);
        return Array.from(combined).sort((a, b) => a.localeCompare(b, "de"));
      });
    } catch {
      setFridgeError("Das Foto konnte nicht analysiert werden. Bitte versuche es erneut.");
    } finally {
      setFridgeLoading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFridgeUpload(file);
    e.target.value = "";
  };

  const toggleMood = (value: string, type: "liked" | "disliked") => {
    if (type === "liked") {
      setLikedMoods((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else {
          next.add(value);
          setDislikedMoods((d) => {
            const dn = new Set(d);
            dn.delete(value);
            return dn;
          });
        }
        return next;
      });
    } else {
      setDislikedMoods((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else {
          next.add(value);
          setLikedMoods((l) => {
            const ln = new Set(l);
            ln.delete(value);
            return ln;
          });
        }
        return next;
      });
    }
  };

  const hasAnyInput =
    selectedIngredients.size > 0 || likedMoods.size > 0 || dislikedMoods.size > 0;

  const fetchSuggestions = useCallback(async () => {
    if (!hasAnyInput) return;
    setSuggestLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`${API_BASE}/recipes/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: Array.from(selectedIngredients),
          moods: Array.from(likedMoods),
          exclusions: Array.from(dislikedMoods),
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Laden der Vorschläge");
      const data = await res.json();
      setSuggestions(data.recipes ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedIngredients, likedMoods, dislikedMoods, hasAnyInput]);

  useEffect(() => {
    if (!hasAnyInput) {
      setSuggestions([]);
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(fetchSuggestions, 600);
    return () => clearTimeout(timer);
  }, [selectedIngredients, likedMoods, dislikedMoods, hasAnyInput, fetchSuggestions]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-[#4A7C59]" />
        </div>
        <div>
          <h1 className="font-serif font-bold text-xl text-foreground leading-snug">Was koche ich heute?</h1>
          <p className="text-xs text-muted-foreground">Wähle Zutaten, Stimmung – und finde passende Rezepte</p>
        </div>
      </div>

      {/* Section 1: Ingredients */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <h2 className="font-serif font-semibold text-base text-foreground mb-4">🥦 Das habe ich zuhause</h2>

        {loadingIngredients ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Zutaten werden geladen…
          </div>
        ) : (
          <>
            {selectedIngredients.size > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-[#4A7C59] mb-2">Ausgewählt:</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedIngredients).map((ing) => (
                    <button
                      key={ing}
                      onClick={() => toggleIngredient(ing)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[#4A7C59] text-white transition-all"
                    >
                      {ing}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pb-1">
              {allIngredients
                .filter((ing) => !selectedIngredients.has(ing))
                .map((ing) => (
                  <button
                    key={ing}
                    onClick={() => toggleIngredient(ing)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#f5ede0] text-[#7a4a2a] border border-[#e8d5c0] hover:bg-[#4A7C59]/10 hover:border-[#4A7C59]/30 transition-colors"
                  >
                    {ing}
                  </button>
                ))}
            </div>

            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={customIngredient}
                onChange={(e) => setCustomIngredient(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomIngredient()}
                placeholder="Eigene Zutat hinzufügen…"
                className="flex-1 px-3 py-2 rounded-xl border border-border bg-[#fdfaf6] text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
              <button
                onClick={addCustomIngredient}
                disabled={!customIngredient.trim()}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#2d5240] disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </section>

      {/* Section 2: Fridge Photo */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <h2 className="font-serif font-semibold text-base text-foreground mb-3">📷 Kühlschrank fotografieren</h2>
        <p className="text-xs text-muted-foreground mb-4">Mach ein Foto deines Kühlschranks – die KI erkennt automatisch die Zutaten.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute("capture");
                fileInputRef.current.setAttribute("capture", "environment");
                fileInputRef.current.click();
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6b5ca5] text-white rounded-xl text-sm font-medium hover:bg-[#5a4c8e] transition-colors"
          >
            <Camera className="w-4 h-4" />
            Foto aufnehmen
          </button>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute("capture");
                fileInputRef.current.click();
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border text-foreground rounded-xl text-sm font-medium hover:bg-[#f5ede0] transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            Bild hochladen
          </button>
        </div>

        {fridgeLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b5ca5]" />
            Foto wird analysiert…
          </div>
        )}

        {fridgeError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {fridgeError}
          </div>
        )}

        {fridgeIngredients.length > 0 && !fridgeLoading && (
          <div className="mt-4">
            <p className="text-xs font-medium text-[#6b5ca5] mb-2">
              ✨ {fridgeIngredients.length} Zutaten erkannt – klick zum Abwählen:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {fridgeIngredients.map((ing) => (
                <button
                  key={ing}
                  onClick={() => toggleIngredient(ing)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedIngredients.has(ing)
                      ? "bg-[#6b5ca5] text-white border-[#6b5ca5]"
                      : "bg-[#f0edf8] text-[#6b5ca5] border-[#d5cdf0]"
                  }`}
                >
                  {ing}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Mood Filter */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <h2 className="font-serif font-semibold text-base text-foreground mb-4">💭 Meine Stimmung</h2>

        <div className="mb-5">
          <p className="text-xs font-semibold text-[#4A7C59] mb-2">Heute habe ich Lust auf…</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleMood(opt.value, "liked")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  likedMoods.has(opt.value)
                    ? "bg-[#4A7C59] text-white border-[#4A7C59] shadow-sm"
                    : "bg-white text-foreground border-border hover:border-[#4A7C59]/40 hover:bg-[#4A7C59]/5"
                }`}
              >
                <span>{opt.emoji}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-red-500 mb-2">Heute auf keinen Fall…</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleMood(opt.value, "disliked")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  dislikedMoods.has(opt.value)
                    ? "bg-red-500 text-white border-red-500 shadow-sm"
                    : "bg-white text-foreground border-border hover:border-red-300 hover:bg-red-50/50"
                }`}
              >
                <span>{opt.emoji}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Results */}
      {(hasAnyInput || hasSearched) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-serif font-semibold text-base text-foreground">🍽️ Passende Rezepte</h2>
            {suggestLoading && <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />}
          </div>

          {!suggestLoading && hasSearched && suggestions.length === 0 && (
            <div className="text-center py-10 bg-white rounded-2xl border border-border">
              <p className="text-3xl mb-3">🔍</p>
              <p className="font-serif text-base text-foreground mb-1">Kein passendes Rezept gefunden</p>
              <p className="text-sm text-muted-foreground">
                Probiere weniger Ausschlüsse oder wähle andere Zutaten aus.
              </p>
            </div>
          )}

          {!suggestLoading && suggestions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {suggestions.map((recipe) => (
                <RecipeSuggestionCard
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => setSelectedRecipe(recipe)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {selectedRecipe && (
        <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />
      )}
    </div>
  );
}
