import { useState } from "react";
import { ALL_CATEGORIES, Recipe, formatIngredient } from "@/types/recipe";
import { useRecipes } from "@/hooks/useRecipes";
import { Clock, Search, ChefHat, Upload, Loader2 } from "lucide-react";
import RecipeModal from "@/components/RecipeModal";
import PdfUploadModal from "@/components/PdfUploadModal";

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const color =
    rating === "sehr lecker"
      ? "text-amber-600 bg-amber-50 border-amber-200"
      : "text-green-700 bg-green-50 border-green-200";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {rating === "sehr lecker" ? "⭐ sehr lecker" : "👍 lecker"}
    </span>
  );
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
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
      className="recipe-card bg-white rounded-2xl border border-border overflow-hidden cursor-pointer shadow-sm relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="h-24 flex items-center justify-center text-5xl bg-gradient-to-br from-[#f5ede0] to-[#f0e8d8]">
        {emoji}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59]">
            {recipe.category}
          </span>
        </div>

        <h3 className="font-serif font-semibold text-foreground leading-snug mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {recipe.prepTime && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 text-[#C1693A]" />
              {recipe.prepTime.replace("ca. ", "")}
            </span>
          )}
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${diffColor}`}>
            <ChefHat className="w-3 h-3" />
            {recipe.difficulty}
          </span>
        </div>

        <RatingBadge rating={recipe.rating} />

        {recipe.notes && (
          <p className="mt-3 text-xs text-muted-foreground font-script text-base line-clamp-2 italic">
            "{recipe.notes}"
          </p>
        )}
      </div>

      {hovered && (
        <div className="absolute inset-0 bg-[#4A7C59]/90 flex items-center justify-center rounded-2xl transition-all">
          <span className="text-white font-semibold text-sm px-5 py-2.5 border-2 border-white rounded-xl hover:bg-white hover:text-[#4A7C59] transition-colors">
            Details ansehen →
          </span>
        </div>
      )}
    </div>
  );
}

export default function MeineRezepte() {
  const { recipes, loading, error, addRecipes } = useRecipes();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alle");
  const [timeFilter, setTimeFilter] = useState("Alle");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  function parseTotalMinutes(totalTime: string | null): number {
    if (!totalTime) return Infinity;
    const match = totalTime.match(/(\d+)/g);
    if (!match) return Infinity;
    const nums = match.map(Number);
    if (nums.length === 1) return nums[0];
    return nums[0] * 60 + (nums[1] ?? 0);
  }

  const filtered = recipes.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.notes ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "Alle" || r.category === activeCategory;
    const mins = parseTotalMinutes(r.totalTime);
    const matchesTime =
      timeFilter === "Alle"
        ? true
        : timeFilter === "Unter 30 Min"
        ? mins < 30
        : mins < 60;
    return matchesSearch && matchesCat && matchesTime;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header row with search + PDF upload */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rezept suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
            />
          </div>

          <button
            onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors whitespace-nowrap shadow-sm"
          >
            <Upload className="w-4 h-4" />
            PDF hochladen
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-[#4A7C59] text-white"
                  : "bg-white text-foreground border border-border hover:border-[#4A7C59]/40"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Time filter */}
        <div className="flex gap-2">
          {["Alle", "Unter 30 Min", "Unter 1 Std"].map((t) => (
            <button
              key={t}
              onClick={() => setTimeFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                timeFilter === t
                  ? "bg-[#C1693A] text-white"
                  : "bg-white text-muted-foreground border border-border hover:border-[#C1693A]/40"
              }`}
            >
              <Clock className="w-3 h-3" />
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Error state */}
      {loading && (
        <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
          <p className="font-serif text-lg">Rezepte werden geladen…</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-serif text-lg text-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {filtered.length} von {recipes.length} Rezepten
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-4">🔍</p>
              <p className="font-serif text-lg">Kein Rezept gefunden.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => setSelected(recipe)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <RecipeModal recipe={selected} onClose={() => setSelected(null)} />
      )}

      {showPdfModal && (
        <PdfUploadModal
          onClose={() => setShowPdfModal(false)}
          onAdd={async (newRecipes) => {
            await addRecipes(newRecipes);
          }}
        />
      )}
    </div>
  );
}
