import { useState, useMemo, useEffect, useRef } from "react";
import { Recipe, formatIngredient } from "@/types/recipe";
import { useRecipes } from "@/hooks/useRecipes";
import { Clock, Search, ChefHat, Upload, Link, Camera, Loader2, LayoutGrid, Table, Settings2, Plus, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import RecipeModal from "@/components/RecipeModal";
import PdfUploadModal from "@/components/PdfUploadModal";
import RecipeManagement from "@/components/RecipeManagement";
import UrlImportModal from "@/components/UrlImportModal";
import ImageImportModal from "@/components/ImageImportModal";
import RecipeEditModal from "@/components/RecipeEditModal";
import type { RecipeUpdatePayload } from "@/hooks/useRecipes";

const API_BASE = "/api";

async function searchRecipesApi(q: string): Promise<Recipe[]> {
  const res = await fetch(`${API_BASE}/recipes/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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
      ? "text-amber-700 bg-amber-50/90 border-amber-200"
      : "text-green-700 bg-green-50/90 border-green-200";
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
      className="recipe-card bg-white rounded-2xl border border-border overflow-hidden cursor-pointer relative"
      style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* 4:3 image area */}
      <div className="relative w-full overflow-hidden" style={{ paddingTop: "75%" }}>
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
            style={{ transform: hovered ? "scale(1.04)" : "scale(1)" }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-6xl"
            style={{ background: "linear-gradient(135deg, #f5ede0, #f0e0c8)" }}
          >
            {emoji}
          </div>
        )}

        {/* Category badge overlay */}
        <div className="absolute top-2.5 left-2.5">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full text-white shadow"
            style={{ background: "rgba(45,82,64,0.85)", backdropFilter: "blur(4px)" }}
          >
            {emoji} {recipe.category}
          </span>
        </div>

        {/* Time chip overlay */}
        {recipe.prepTime && (
          <div className="absolute bottom-2.5 right-2.5">
            <span
              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white shadow"
              style={{ background: "rgba(193,105,58,0.88)", backdropFilter: "blur(4px)" }}
            >
              <Clock className="w-3 h-3" />
              {recipe.prepTime.replace("ca. ", "")}
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-serif font-semibold text-foreground leading-snug mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${diffColor}`}>
            <ChefHat className="w-3 h-3" />
            {recipe.difficulty}
          </span>
          <RatingBadge rating={recipe.rating} />
        </div>

        {showCookCount && recipe.cookedCount != null && recipe.cookedCount > 0 && (
          <p className="text-xs text-muted-foreground">🍳 {recipe.cookedCount}× gekocht</p>
        )}

        {showNotes && recipe.notes && (
          <p className="mt-2 text-xs text-muted-foreground font-script text-base line-clamp-2 italic">
            "{recipe.notes}"
          </p>
        )}
      </div>

      {hovered && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl transition-all"
          style={{ background: "rgba(45,82,64,0.88)" }}>
          <span className="text-white font-semibold text-sm px-5 py-2.5 border-2 border-white rounded-xl hover:bg-white hover:text-[#2d5240] transition-colors">
            Details ansehen →
          </span>
        </div>
      )}
    </div>
  );
}

type TableSortKey = "title" | "category" | "difficulty" | "time" | "rating" | "cookedCount" | "createdAt";

function SortIcon({ col, sortKey, sortDir }: { col: TableSortKey; sortKey: TableSortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 inline text-[#4A7C59]" />
    : <ArrowDown className="w-3 h-3 ml-1 inline text-[#4A7C59]" />;
}

function RecipeTableRow({
  recipe,
  onClick,
  checked,
  onCheck,
}: {
  recipe: Recipe;
  onClick: () => void;
  checked: boolean;
  onCheck: (e: React.MouseEvent) => void;
}) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  const createdLabel = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "–";
  return (
    <tr className={`border-b border-border/50 hover:bg-[#4A7C59]/5 transition-colors cursor-pointer ${checked ? "bg-[#4A7C59]/5" : ""}`} onClick={onClick}>
      <td className="px-3 py-3 w-10" onClick={onCheck}>
        <input type="checkbox" checked={checked} onChange={() => {}} className="w-4 h-4 rounded accent-[#4A7C59] cursor-pointer" />
      </td>
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
      <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
        {createdLabel}
      </td>
    </tr>
  );
}

type PageMode = "galerie" | "verwalten";

interface MeineRezepteProps {
  onNavigate?: (tab: string) => void;
}

export default function MeineRezepte({ onNavigate: _onNavigate }: MeineRezepteProps) {
  const { recipes, loading, error, addRecipes, refetch, patchRecipeSilent, deleteRecipeSilent, updateRecipe } = useRecipes();

  const defaultView = useLocalStorage<"kacheln" | "tabelle">("lk_defaultView", "kacheln");
  const savedSortOrder = useLocalStorage<string>("lk_sortOrder", "alphabetisch");
  const showNotes = useLocalStorage<boolean>("lk_showNotes", true);
  const showCookCount = useLocalStorage<boolean>("lk_showCookCount", true);

  const [pageMode, setPageMode] = useState<PageMode>("galerie");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Recipe[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategory, setActiveCategory] = useState("Alle");
  const [timeFilter, setTimeFilter] = useState("Alle");
  const [viewMode, setViewMode] = useState<"kacheln" | "tabelle">(defaultView);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showNewRecipeModal, setShowNewRecipeModal] = useState(false);

  const [managedSelected, setManagedSelected] = useState<Set<number>>(new Set());
  const [tableSelected, setTableSelected] = useState<Set<number>>(new Set());
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("title");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc");

  const toggleSelect = (id: number) => setManagedSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (managedSelected.size === recipes.length) setManagedSelected(new Set());
    else setManagedSelected(new Set(recipes.map((r) => r.id)));
  };

  const toggleTableSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTableSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTableAll = () => {
    setTableSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))
    );
  };

  const handleTableSort = (col: TableSortKey) => {
    if (tableSortKey === col) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(col);
      setTableSortDir("asc");
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = search.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchRecipesApi(trimmed);
        setSearchResults(results);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

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

  const baseList = useMemo(() => {
    if (searchResults !== null) {
      const sorted2 = [...searchResults];
      switch (savedSortOrder) {
        case "alphabetisch":
          sorted2.sort((a, b) => a.title.localeCompare(b.title, "de"));
          break;
        case "kategorie":
          sorted2.sort((a, b) => a.category.localeCompare(b.category, "de") || a.title.localeCompare(b.title, "de"));
          break;
        case "bewertung":
          sorted2.sort((a, b) => {
            const score = (r: Recipe) => r.rating === "sehr lecker" ? 2 : r.rating === "lecker" ? 1 : 0;
            return score(b) - score(a);
          });
          break;
        case "zuletzt_gekocht":
          sorted2.sort((a, b) => {
            if (!a.lastCooked && !b.lastCooked) return 0;
            if (!a.lastCooked) return 1;
            if (!b.lastCooked) return -1;
            return b.lastCooked.localeCompare(a.lastCooked);
          });
          break;
        case "haeufig_gekocht":
          sorted2.sort((a, b) => (b.cookedCount ?? 0) - (a.cookedCount ?? 0));
          break;
      }
      return sorted2;
    }
    return sorted;
  }, [searchResults, sorted, savedSortOrder]);

  const filtered = useMemo(() => baseList.filter((r) => {
    const matchesCat = activeCategory === "Alle" || r.category === activeCategory;
    const mins = parseTotalMinutes(r.totalTime);
    const matchesTime =
      timeFilter === "Alle" ? true :
      timeFilter === "Unter 30 Min" ? mins < 30 : mins < 60;
    return matchesCat && matchesTime;
  }), [baseList, activeCategory, timeFilter]);

  const knownCategories = useMemo(() => Array.from(new Set(recipes.map((r) => r.category))).sort(), [recipes]);

  const DIFF_ORDER: Record<string, number> = { simpel: 0, normal: 1, schwer: 2 };
  const RATING_SCORE = (r: Recipe) => r.rating === "sehr lecker" ? 2 : r.rating === "lecker" ? 1 : 0;

  const tableSorted = useMemo(() => {
    const base = [...filtered];
    const dir = tableSortDir === "asc" ? 1 : -1;
    base.sort((a, b) => {
      switch (tableSortKey) {
        case "title": return dir * a.title.localeCompare(b.title, "de");
        case "category": return dir * a.category.localeCompare(b.category, "de");
        case "difficulty": return dir * ((DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1));
        case "time": return dir * (parseTotalMinutes(a.totalTime) - parseTotalMinutes(b.totalTime));
        case "rating": return dir * (RATING_SCORE(a) - RATING_SCORE(b));
        case "cookedCount": return dir * ((a.cookedCount ?? 0) - (b.cookedCount ?? 0));
        case "createdAt": {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dir * (da - db2);
        }
        default: return 0;
      }
    });
    return base;
  }, [filtered, tableSortKey, tableSortDir]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
          <button
            onClick={() => setPageMode("galerie")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${pageMode === "galerie" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
            Galerie
          </button>
          <button
            onClick={() => setPageMode("verwalten")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${pageMode === "verwalten" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
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
          <div className="mb-6 space-y-3">
            {/* Search + view toggle row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rezept suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 min-h-[48px]"
                />
              </div>

              <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
                <button
                  onClick={() => setViewMode("kacheln")}
                  className={`p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] ${viewMode === "kacheln" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  title="Kachelansicht">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("tabelle")}
                  className={`p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] ${viewMode === "tabelle" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  title="Tabellenansicht">
                  <Table className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowUrlModal(true)}
                className="flex items-center gap-2 px-4 py-3 bg-[#3d6849] text-white rounded-xl text-sm font-semibold hover:bg-[#2d5240] transition-colors whitespace-nowrap shadow-sm min-h-[48px]"
              >
                <Link className="w-4 h-4" />
                <span className="hidden sm:inline">URL importieren</span>
                <span className="sm:hidden">URL</span>
              </button>
              <button
                onClick={() => setShowPdfModal(true)}
                className="flex items-center gap-2 px-4 py-3 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors whitespace-nowrap shadow-sm min-h-[48px]"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">PDF hochladen</span>
                <span className="sm:hidden">PDF</span>
              </button>
              <button
                onClick={() => setShowImageModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#6b5ca5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a4c8e] transition-colors whitespace-nowrap shadow-sm"
              >
                <Camera className="w-4 h-4" />
                Foto importieren
              </button>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition-colors min-h-[36px] ${
                    activeCategory === cat
                      ? "bg-[#3d6849] text-white"
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
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 min-h-[36px] ${
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
              <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                {searchLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A7C59]" />
                    <span>Suche läuft…</span>
                  </>
                ) : (
                  <>
                    {filtered.length} von {recipes.length} Rezepten
                    {savedSortOrder !== "alphabetisch" && (
                      <span className="ml-2 text-xs text-muted-foreground/70">
                        (sortiert: {savedSortOrder === "kategorie" ? "nach Kategorie" : savedSortOrder === "bewertung" ? "nach Bewertung" : savedSortOrder === "zuletzt_gekocht" ? "zuletzt gekocht" : "am häufigsten gekocht"})
                      </span>
                    )}
                  </>
                )}
              </p>

              {!searchLoading && filtered.length === 0 ? (
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
                        <th className="px-3 py-3 w-10">
                          <input type="checkbox"
                            checked={tableSelected.size === tableSorted.length && tableSorted.length > 0}
                            onChange={toggleTableAll}
                            className="w-4 h-4 rounded accent-[#4A7C59] cursor-pointer" />
                        </th>
                        {(
                          [
                            { col: "title" as TableSortKey, label: "Titel", cls: "" },
                            { col: "category" as TableSortKey, label: "Kategorie", cls: "hidden sm:table-cell" },
                            { col: "difficulty" as TableSortKey, label: "Schwierigkeit", cls: "hidden md:table-cell" },
                            { col: "time" as TableSortKey, label: "Zeit", cls: "hidden md:table-cell" },
                            { col: "rating" as TableSortKey, label: "Bewertung", cls: "hidden lg:table-cell" },
                            { col: "cookedCount" as TableSortKey, label: "Gekocht", cls: "hidden xl:table-cell" },
                            { col: "createdAt" as TableSortKey, label: "Hochgeladen am", cls: "hidden xl:table-cell" },
                          ]
                        ).map(({ col, label, cls }) => (
                          <th key={col}
                            onClick={() => handleTableSort(col)}
                            className={`px-4 py-3 text-left font-semibold text-foreground cursor-pointer select-none hover:text-[#4A7C59] transition-colors ${cls}`}>
                            {label}
                            <SortIcon col={col} sortKey={tableSortKey} sortDir={tableSortDir} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableSorted.map((recipe) => (
                        <RecipeTableRow
                          key={recipe.id}
                          recipe={recipe}
                          onClick={() => setSelected(recipe)}
                          checked={tableSelected.has(recipe.id)}
                          onCheck={(e) => toggleTableSelect(recipe.id, e)}
                        />
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

          {showUrlModal && (
            <UrlImportModal
              onClose={() => setShowUrlModal(false)}
              onAdd={async (newRecipes) => {
                await addRecipes(newRecipes);
              }}
            />
          )}

          {showPdfModal && (
            <PdfUploadModal
              onClose={() => setShowPdfModal(false)}
              onAdd={async (newRecipes) => {
                await addRecipes(newRecipes);
              }}
            />
          )}

          {showImageModal && (
            <ImageImportModal
              onClose={() => setShowImageModal(false)}
              onAdd={async (newRecipes) => {
                await addRecipes(newRecipes);
              }}
            />
          )}

          {showNewRecipeModal && (
            <RecipeEditModal
              recipe={{
                id: -1,
                title: "",
                category: knownCategories[0] ?? "Pasta",
                difficulty: "normal",
                servings: null,
                prepTime: null,
                totalTime: null,
                rating: null,
                kcalPerPortion: null,
                source: null,
                lastCooked: null,
                cookedCount: null,
                notes: null,
                steps: [],
                ingredients: [],
                imageUrl: null,
              }}
              onClose={() => setShowNewRecipeModal(false)}
              onSave={async (_id, data: RecipeUpdatePayload) => {
                await addRecipes([data as Partial<Recipe>]);
                setShowNewRecipeModal(false);
              }}
              knownCategories={knownCategories}
            />
          )}

          {/* Floating Action Button */}
          <button
            onClick={() => setShowNewRecipeModal(true)}
            className="fab fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white"
            style={{
              background: "linear-gradient(135deg, #C1693A 0%, #d4855a 100%)",
              minWidth: "56px",
              minHeight: "56px",
            }}
            title="Neues Rezept erstellen"
            aria-label="Neues Rezept erstellen"
          >
            <Plus className="w-7 h-7" />
          </button>
        </>
      )}
    </div>
  );
}
