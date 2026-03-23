import { useState } from "react";
import { recipes, ALL_CATEGORIES, Recipe } from "@/data/recipes";
import { Clock, Star, Search, ChefHat } from "lucide-react";
import RecipeModal from "@/components/RecipeModal";

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < n ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </span>
  );
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

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
      {/* Emoji header */}
      <div className="h-24 flex items-center justify-center text-5xl bg-gradient-to-br from-[#f5ede0] to-[#f0e8d8]">
        {recipe.emoji}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-1 mb-2">
          {recipe.categories.map((cat) => (
            <span
              key={cat}
              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59]"
            >
              {cat}
            </span>
          ))}
        </div>
        <h3 className="font-serif font-semibold text-foreground leading-snug mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-[#C1693A]" />
            {recipe.time} Min.
          </span>
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${diffColor}`}>
            <ChefHat className="w-3 h-3" />
            {recipe.difficulty}
          </span>
        </div>

        <Stars n={recipe.rating} />

        <p className="mt-3 text-xs text-muted-foreground font-script text-base line-clamp-2 italic">
          "{recipe.note}"
        </p>
      </div>

      {/* Hover overlay */}
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
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alle");
  const [timeFilter, setTimeFilter] = useState("Alle");
  const [selected, setSelected] = useState<Recipe | null>(null);

  const filtered = recipes.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.note.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      activeCategory === "Alle" || r.categories.includes(activeCategory);
    const matchesTime =
      timeFilter === "Alle"
        ? true
        : timeFilter === "Unter 30 Min"
        ? r.time < 30
        : r.time < 60;
    return matchesSearch && matchesCat && matchesTime;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Filters */}
      <div className="mb-8 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rezept suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
          />
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

      {/* Results count */}
      <p className="text-sm text-muted-foreground mb-6">
        {filtered.length} von {recipes.length} Rezepten
      </p>

      {/* Grid */}
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

      {selected && (
        <RecipeModal
          recipe={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
