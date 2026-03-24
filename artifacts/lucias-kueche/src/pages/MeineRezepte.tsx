import { useState, useMemo } from "react";
import { Recipe, formatIngredient } from "@/types/recipe";
import { useRecipes } from "@/hooks/useRecipes";
import { Clock, Search, ChefHat, Upload, Loader2, LayoutGrid, Table, Settings2 } from "lucide-react";
import RecipeModal from "@/components/RecipeModal";
import PdfUploadModal from "@/components/PdfUploadModal";
import RecipeManagement from "@/components/RecipeManagement";

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

function useLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function parseTotalMinutes(totalTime: string | null): number {
  if (!totalTime) return Infinity;
  const match = totalTime.match(/(\d+)/g);
  if (!match) return Infinity;
  const nums = match.map(Number);
  if (nums.length === 1) return nums[0];
  return nums[0] * 60 + (nums[1] ?? 0);
}

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

function RecipeCard({
  recipe,
  onClick,
  showNotes,
  showCookCount,
}: {
  recipe: Recipe;
  onClick: () => void;
  showNotes: boolean;
  showCookCount: boolean;
}) {
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

        {showCookCount && recipe.cookedCount != null && recipe.cookedCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">🍳 {recipe.cookedCount}× gekocht</p>
        )}

        {showNotes && recipe.notes && (
          <p className="mt-2 text-xs text-muted-foreground font-script text-base line-clamp-2 italic">
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

function RecipeTableRow({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  return (
    <tr className="border-b border-border/50 hover:bg-[#4A7C59]/5 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{recipe.title}</div>
        {recipe.source && <div className="text-xs text-muted-foreground">{recipe.source}</div>}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59]">
          {emoji} {recipe.category}
        </span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          recipe.difficulty === "simpel" ? "bg-green-100 text-green-700" :
          recipe.difficulty === "normal" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
        }`}>{recipe.difficulty}</span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
        {recipe.totalTime?.replace("ca. ", "") ?? "–"}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {recipe.rating === "sehr lecker" ? "⭐ sehr lecker" : recipe.rating === "lecker" ? "👍 lecker" : "–"}
      </td>
      <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
        {recipe.cookedCount ? `🍳 ${recipe.cookedCount}×` : "–"}
      </td>
    </tr>
  );
}

type PageMode = "galerie" | "verwalten";

export default function MeineRezepte() {
  const { recipes, loading, error, addRecipes, refetch, patchRecipeSilent, deleteRecipeSilent, updateRecipe } = useRecipes();

  const defaultView = useLocalStorage<"kacheln" | "tabelle">("lk_defaultView", "kacheln");
  const savedSortOrder = useLocalStorage<string>("lk_sortOrder", "alphabetisch");
  const showNotes = useLocalStorage<boolean>("lk_showNotes", true);
  const showCookCount = useLocalStorage<boolean>("lk_showCookCount", true);

  const [pageMode, setPageMode] = useState<PageMode>("galerie");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alle");
  const [timeFilter, setTimeFilter] = useState("Alle");
  const [viewMode, setViewMode] = useState<"kacheln" | "tabelle">(defaultView);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const [managedSelected, setManagedSelected] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => setManagedSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (managedSelected.size === recipes.length) setManagedSelected(new Set());
    else setManagedSelected(new Set(recipes.map((r) => r.id)));
  };

  const allCategories = useMemo(() => {
    const cats = Array.from(new Set(recipes.map((r) => r.category))).sort();
    return ["Alle", ...cats];
  }, [recipes]);

  const sorted = useMemo(() => {
    const base = [...recipes];
    switch (savedSortOrder) {
      case "alphabetisch":
        return base.sort((a, b) => a.title.localeCompare(b.title, "de"));
      case "kategorie":
        return base.sort((a, b) => a.category.localeCompare(b.category, "de") || a.title.localeCompare(b.title, "de"));
      case "bewertung":
        return base.sort((a, b) => {
          const score = (r: Recipe) => r.rating === "sehr lecker" ? 2 : r.rating === "lecker" ? 1 : 0;
          return score(b) - score(a);
        });
      case "zuletzt_gekocht":
        return base.sort((a, b) => {
          if (!a.lastCooked && !b.lastCooked) return 0;
          if (!a.lastCooked) return 1;
          if (!b.lastCooked) return -1;
          return b.lastCooked.localeCompare(a.lastCooked);
        });
      case "haeufig_gekocht":
        return base.sort((a, b) => (b.cookedCount ?? 0) - (a.cookedCount ?? 0));
      default:
        return base;
    }
  }, [recipes, savedSortOrder]);

  const filtered = useMemo(() => sorted.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.notes ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "Alle" || r.category === activeCategory;
    const mins = parseTotalMinutes(r.totalTime);
    const matchesTime =
      timeFilter === "Alle" ? true :
      timeFilter === "Unter 30 Min" ? mins < 30 : mins < 60;
    return matchesSearch && matchesCat && matchesTime;
  }), [sorted, search, activeCategory, timeFilter]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
          <button
            onClick={() => setPageMode("galerie")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${pageMode === "galerie" ? "bg-[#4A7C59] text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
            Galerie
          </button>
          <button
            onClick={() => setPageMode("verwalten")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${pageMode === "verwalten" ? "bg-[#4A7C59] text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings2 className="w-4 h-4" />
            Verwalten
          </button>
        </div>
      </div>

      {pageMode === "verwalten" ? (
        <>
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
            <div className="pb-28">
              <RecipeManagement
                recipes={recipes}
                selected={managedSelected}
                onToggle={toggleSelect}
                onToggleAll={toggleAll}
                patchRecipeSilent={patchRecipeSilent}
                deleteRecipeSilent={deleteRecipeSilent}
                updateRecipe={updateRecipe}
                refetch={refetch}
                onClearSelect={() => setManagedSelected(new Set())}
              />
            </div>
          )}
        </>
      ) : (
        <>
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

              <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
                <button
                  onClick={() => setViewMode("kacheln")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "kacheln" ? "bg-[#4A7C59] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  title="Kachelansicht">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("tabelle")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "tabelle" ? "bg-[#4A7C59] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  title="Tabellenansicht">
                  <Table className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowPdfModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors whitespace-nowrap shadow-sm"
              >
                <Upload className="w-4 h-4" />
                PDF hochladen
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => (
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
                {savedSortOrder !== "alphabetisch" && (
                  <span className="ml-2 text-xs text-muted-foreground/70">
                    (sortiert: {savedSortOrder === "kategorie" ? "nach Kategorie" : savedSortOrder === "bewertung" ? "nach Bewertung" : savedSortOrder === "zuletzt_gekocht" ? "zuletzt gekocht" : "am häufigsten gekocht"})
                  </span>
                )}
              </p>

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-4xl mb-4">🔍</p>
                  <p className="font-serif text-lg">Kein Rezept gefunden.</p>
                </div>
              ) : viewMode === "kacheln" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filtered.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      onClick={() => setSelected(recipe)}
                      showNotes={showNotes}
                      showCookCount={showCookCount}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-[#4A7C59]/5">
                        <th className="px-4 py-3 text-left font-semibold text-foreground">Titel</th>
                        <th className="px-4 py-3 text-left font-semibold text-foreground hidden sm:table-cell">Kategorie</th>
                        <th className="px-4 py-3 text-left font-semibold text-foreground hidden md:table-cell">Schwierigkeit</th>
                        <th className="px-4 py-3 text-left font-semibold text-foreground hidden md:table-cell">Zeit</th>
                        <th className="px-4 py-3 text-left font-semibold text-foreground hidden lg:table-cell">Bewertung</th>
                        <th className="px-4 py-3 text-left font-semibold text-foreground hidden xl:table-cell">Gekocht</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((recipe) => (
                        <RecipeTableRow key={recipe.id} recipe={recipe} onClick={() => setSelected(recipe)} />
                      ))}
                    </tbody>
                  </table>
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
        </>
      )}
    </div>
  );
}
