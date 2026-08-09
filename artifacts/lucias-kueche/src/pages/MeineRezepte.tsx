import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Recipe } from "@/types/recipe";
import type { Season } from "@/types/recipe";
import { SEASON_LABELS, SEASON_ICONS, getCurrentSeason } from "@/types/recipe";
import { useRecipes, fetchRecipeById } from "@/hooks/useRecipes";
import { Clock, Search, ChefHat, Upload, Link, Camera, Loader2, LayoutGrid, Table, Settings2, Plus, ArrowUp, ArrowDown, ArrowUpDown, UtensilsCrossed, MessageCircle, Star, BookOpen, Share2, Sparkles, Lightbulb, X, Globe } from "lucide-react";
import KochideeChat, { type SuggestedRecipe } from "@/components/KochideeChat";
import WebSearchResults from "@/components/WebSearchResults";
import type { RecipeFilter, ActiveFilters } from "@/hooks/useRecipes";
import RecipeModal from "@/components/RecipeModal";
import RecipeSuggestModal from "@/components/RecipeSuggestModal";
import CookingMode from "@/components/CookingMode";
import PdfUploadModal from "@/components/PdfUploadModal";
import RecipeManagement from "@/components/RecipeManagement";
import UrlImportModal from "@/components/UrlImportModal";
import ImageImportModal from "@/components/ImageImportModal";
import RecipeEditModal from "@/components/RecipeEditModal";
import type { RecipeUpdatePayload } from "@/hooks/useRecipes";
import { useCommentStats } from "@/components/RecipeComments";
import { useRecipeStats } from "@/hooks/useRecipeStats";
import { authFetch, authHeaders } from "@/lib/authFetch";
import { FilterBottomSheet } from "@/components/FilterBottomSheet";
import type { PhotoTypeFilter } from "@/components/FilterBottomSheet";
import { ImportInProgressBanner } from "@/components/ImportInProgressBanner";

const API_BASE = "/api";

type TableSortKey = "title" | "category" | "difficulty" | "time" | "rating" | "cookedCount" | "createdAt";

const TABLE_SORT_MAP: Record<TableSortKey, string> = {
  title: "alphabetisch",
  category: "kategorie",
  difficulty: "schwierigkeit",
  time: "zeit",
  rating: "bewertung",
  cookedCount: "haeufig_gekocht",
  createdAt: "neueste",
};

async function smartSearchApi(
  query: string,
  filter: RecipeFilter,
  signal?: AbortSignal,
): Promise<{ recipes: Recipe[]; summary: string; exactCount: number; semanticCount: number }> {
  const filterParam = filter !== "all" ? filter : undefined;
  const res = await authFetch(`${API_BASE}/recipes/smart-search`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, filter: filterParam }),
    signal,
  });
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

/** Maximal EIN Auszeichnungs-Badge pro Karte, in Prioritätsreihenfolge. */
function AchievementBadge({ recipe }: { recipe: Recipe }) {
  if (recipe.rating === "sehr lecker") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
        ⭐ Sehr lecker
      </span>
    );
  }
  if ((recipe.cookedCount ?? 0) >= 3) {
    return (
      <span className="text-xs text-muted-foreground">
        {recipe.cookedCount}× gekocht
      </span>
    );
  }
  if (recipe.createdAt) {
    const ageDays = (Date.now() - new Date(recipe.createdAt).getTime()) / 86_400_000;
    if (ageDays < 14) {
      return (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
          Neu
        </span>
      );
    }
  }
  return null;
}

function OwnerBadge({ recipe }: { recipe: Recipe }) {
  if (recipe.isOwner !== false) return null;
  const name = recipe.owner?.displayName ?? "Unbekannt";
  const avatarUrl = recipe.owner?.avatarUrl;
  return (
    <div className="flex items-center gap-1 mt-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-4 h-4 rounded-full object-cover" />
      ) : (
        <div className="w-4 h-4 rounded-full bg-[#4A7C59]/20 flex items-center justify-center text-[8px] font-bold text-[#4A7C59]">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-xs text-muted-foreground">{name}</span>
    </div>
  );
}

function RecipeCardImage({
  recipe,
  hovered,
}: {
  recipe: Recipe;
  hovered: boolean;
}) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  const [loaded, setLoaded] = useState(false);

  const thumbUrl = recipe.mainPhotoThumbnailUrl ?? null;
  const mainUrl = recipe.mainPhotoUrl ?? null;
  const recipeUrl = recipe.imageUrl ?? null;

  const urlChain = Array.from(new Set(
    [thumbUrl, mainUrl, recipeUrl].filter((u): u is string => u != null)
  ));

  const [urlIndex, setUrlIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const currentUrl = urlChain[urlIndex] ?? null;

  const handleError = () => {
    if (urlIndex + 1 < urlChain.length) {
      setUrlIndex(urlIndex + 1);
    } else {
      setFailed(true);
    }
  };

  if (!currentUrl || failed) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-6xl"
        style={{ background: "linear-gradient(135deg, #f5ede0, #f0e0c8)" }}
      >
        {emoji}
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, #f0e8dd 25%, #f8f2ec 50%, #f0e8dd 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      )}
      <img
        src={currentUrl}
        alt={recipe.title}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
        style={{
          transform: hovered ? "scale(1.04)" : "scale(1)",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      />
    </>
  );
}

function RecipeCard({
  recipe,
  onClick,
  onCook,
  onSuggest,
  showNotes,
  showCookCount,
  onToggleFavorite,
  commentCount,
  avgRating,
  matchedInNotes,
}: {
  recipe: Recipe;
  onClick: () => void;
  onCook: () => void;
  onSuggest?: () => void;
  showNotes: boolean;
  showCookCount: boolean;
  onToggleFavorite?: (id: number, isFavorite: boolean) => void;
  commentCount?: number;
  avgRating?: number | null;
  matchedInNotes?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(recipe.id, recipe.isFavorite ?? false);
  };

  return (
    <div
      className="recipe-card bg-white rounded-2xl border border-border overflow-hidden cursor-pointer relative"
      style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* image area */}
      <div className="relative w-full overflow-hidden" style={{ paddingTop: "80%" }}>
        <RecipeCardImage recipe={recipe} hovered={hovered} />

        {/* Category badge overlay */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full text-white shadow"
            style={{ background: "rgba(45,82,64,0.85)", backdropFilter: "blur(4px)" }}
          >
            {emoji} {recipe.category}
          </span>
          {recipe.chefPick && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full text-white shadow"
              style={{ background: "rgba(193,105,58,0.92)", backdropFilter: "blur(4px)" }}
            >
              👩‍🍳 Lucias Tipp
            </span>
          )}
        </div>

        {/* Favorite/Star button overlay for non-owned recipes */}
        {recipe.isOwner === false && onToggleFavorite && (
          <button
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center shadow transition-colors"
            style={{
              background: recipe.isFavorite ? "rgba(193,105,58,0.9)" : "rgba(255,255,255,0.85)",
              backdropFilter: "blur(4px)",
            }}
            onClick={handleFavorite}
            title={recipe.isFavorite ? "Aus Merkliste entfernen" : "Rezept merken"}
          >
            <Star className={`w-4 h-4 ${recipe.isFavorite ? "text-white fill-white" : "text-amber-500"}`} />
          </button>
        )}

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
        <h3 className="font-serif font-semibold text-foreground leading-snug mb-1 line-clamp-2">
          {recipe.title}
        </h3>

        {/* Ruhige Meta-Zeile: Schwierigkeit · Kategorie */}
        <p className="text-xs text-muted-foreground mb-2">
          {recipe.difficulty}{recipe.category ? ` · ${recipe.category}` : ""}
          {recipe.seasons && recipe.seasons.length > 0 && (
            <span className="ml-1" title={(recipe.seasons as Season[]).map((s) => SEASON_LABELS[s]).join(", ")}>
              {(recipe.seasons as Season[]).map((s) => SEASON_ICONS[s]).join("")}
            </span>
          )}
          {recipe.variantName && (
            <span className="ml-1 font-medium text-amber-700">· 🔀 {recipe.variantName}</span>
          )}
        </p>

        {/* Auszeichnungs-Badge — maximal eines */}
        <div className="mb-1 min-h-[1.25rem]">
          <AchievementBadge recipe={recipe} />
        </div>

        {(commentCount !== undefined && commentCount > 0) && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageCircle className="w-3 h-3" />
              {commentCount}
            </span>
            {avgRating !== null && avgRating !== undefined && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {avgRating.toFixed(1)}
              </span>
            )}
          </div>
        )}

        {matchedInNotes && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-1">
            📝 Erwähnt in Notizen
          </span>
        )}

        {showNotes && recipe.notes && (
          <p className="mt-2 text-xs text-muted-foreground font-script text-base line-clamp-2 italic">
            "{recipe.notes}"
          </p>
        )}

        <OwnerBadge recipe={recipe} />
      </div>

      {hovered && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl transition-all"
          style={{ background: "rgba(45,82,64,0.88)" }}>
          <span
            onClick={onClick}
            className="text-white font-semibold text-sm px-5 py-2.5 border-2 border-white rounded-xl hover:bg-white hover:text-[#2d5240] transition-colors cursor-pointer"
          >
            Details ansehen →
          </span>
          {(recipe.hasSteps || (Array.isArray(recipe.steps) && recipe.steps.length > 0)) && (
            <button
              onClick={(e) => { e.stopPropagation(); onCook(); }}
              className="flex items-center gap-1.5 text-white font-semibold text-sm px-4 py-2 bg-[#C1693A] hover:bg-[#a85830] rounded-xl transition-colors"
            >
              <UtensilsCrossed className="w-4 h-4" />
              Kochen starten
            </button>
          )}
          {onSuggest && (
            <button
              onClick={(e) => { e.stopPropagation(); onSuggest(); }}
              className="flex items-center gap-1.5 text-white font-semibold text-sm px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors border border-white/40"
            >
              <Share2 className="w-4 h-4" />
              Vorschlagen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: TableSortKey; sortKey: TableSortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 inline text-[#4A7C59]" />
    : <ArrowDown className="w-3 h-3 ml-1 inline text-[#4A7C59]" />;
}

function RecipeTableRow({
  recipe,
  onClick,
  onCook,
  onSuggest,
  onTriedChange,
  matchedInNotes,
}: {
  recipe: Recipe;
  onClick: () => void;
  onCook: () => void;
  onSuggest?: () => void;
  onTriedChange?: (tried: boolean) => void;
  matchedInNotes?: boolean;
}) {
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
  const createdLabel = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "–";
  return (
    <tr className="border-b border-border/50 hover:bg-[#4A7C59]/5 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="font-medium text-foreground flex items-center gap-2 flex-wrap">
          {recipe.title}
          {recipe.isOwner === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
              {recipe.owner?.displayName ?? "Geteilt"}
            </span>
          )}
          {matchedInNotes && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
              📝 Erwähnt in Notizen
            </span>
          )}
        </div>
        {recipe.source && <div className="text-xs text-muted-foreground">{recipe.source}</div>}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell text-center">
        <div className="flex items-center gap-1 justify-center">
          {(recipe.hasSteps || (Array.isArray(recipe.steps) && recipe.steps.length > 0)) && (
            <button
              onClick={(e) => { e.stopPropagation(); onCook(); }}
              className="p-1.5 rounded-lg bg-[#C1693A]/10 text-[#C1693A] hover:bg-[#C1693A] hover:text-white transition-colors"
              title="Kochen starten"
            >
              <UtensilsCrossed className="w-4 h-4" />
            </button>
          )}
          {onSuggest && (
            <button
              onClick={(e) => { e.stopPropagation(); onSuggest(); }}
              className="p-1.5 rounded-lg bg-[#4A7C59]/10 text-[#4A7C59] hover:bg-[#4A7C59] hover:text-white transition-colors"
              title="Rezept vorschlagen"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
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
      <td className="px-4 py-3 hidden xl:table-cell text-center" onClick={(e) => e.stopPropagation()}>
        {recipe.isOwner !== false && onTriedChange ? (
          <button
            onClick={() => onTriedChange(!recipe.tried)}
            title={recipe.tried ? "Als nicht ausprobiert markieren" : "Als ausprobiert markieren"}
            className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
              recipe.tried
                ? "bg-[#4A7C59] border-[#4A7C59] text-white"
                : "border-gray-300 hover:border-[#4A7C59] bg-white"
            }`}
          >
            {recipe.tried && <span className="text-xs leading-none">✓</span>}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{recipe.tried ? "✓" : "–"}</span>
        )}
      </td>
    </tr>
  );
}

type ViewMode = "galerie" | "tabelle";

interface MeineRezepteProps {
  onNavigate?: (tab: string) => void;
  initialOpenRecipeId?: number | null;
  onRecipeOpened?: () => void;
  initialSortOrder?: string | null;
  onSortOrderApplied?: () => void;
  refreshToken?: number;
}

const FILTER_LABELS: Record<RecipeFilter, string> = {
  all: "Alle",
  mine: "Meine",
  favorites: "Gemerkt",
};

export default function MeineRezepte({ onNavigate: _onNavigate, initialOpenRecipeId, onRecipeOpened, initialSortOrder, onSortOrderApplied, refreshToken }: MeineRezepteProps) {
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>("all");
  const [activeCategory, setActiveCategory] = useState("Alle");
  const [timeFilter, setTimeFilter] = useState("Alle");
  const [seasonFilter, setSeasonFilter] = useState<Season | "Alle">("Alle");
  const [cookedFilter, setCookedFilter] = useState<"Alle" | "gekocht" | "nicht_ausprobiert">("Alle");
  const [showVariants, setShowVariants] = useState(false);
  const [photoType, setPhotoType] = useState<PhotoTypeFilter>("all");
  const [chefPickFilter, setChefPickFilter] = useState(false);
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("title");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc");
  const defaultViewRaw = useLocalStorage<string>("lk_viewMode", "");
  const defaultView = ((): ViewMode => {
    if (defaultViewRaw === "galerie") return "galerie";
    if (defaultViewRaw === "tabelle") return "tabelle";
    if (defaultViewRaw === "verwalten") return "tabelle";
    try {
      const legacy = localStorage.getItem("lk_defaultView");
      const legacyParsed = legacy !== null ? JSON.parse(legacy) : null;
      if (legacyParsed === "kacheln") return "galerie";
      if (legacyParsed === "tabelle") return "tabelle";
    } catch {}
    return "galerie";
  })();
  const savedSortOrder = useLocalStorage<string>("lk_sortOrder", "alphabetisch");
  const [sortOrderOverride, setSortOrderOverride] = useState<string | null>(null);
  const activeSortOrder = sortOrderOverride ?? savedSortOrder;
  const [viewMode, setViewModeState] = useState<ViewMode>(defaultView);
  const serverFilters: ActiveFilters = {
    category: activeCategory !== "Alle" ? activeCategory : undefined,
    time: timeFilter === "Unter 30 Min" ? "unter30" : timeFilter !== "Alle" ? "unter60" : undefined,
    season: seasonFilter !== "Alle" ? String(seasonFilter) : undefined,
    cooked: cookedFilter === "gekocht" ? "gekocht" : cookedFilter === "nicht_ausprobiert" ? "nicht" : undefined,
    photoType: photoType !== "all" ? photoType : undefined,
    variants: showVariants ? "true" : "false",
    chefPick: chefPickFilter ? "true" : undefined,
    sort: viewMode === "galerie" ? activeSortOrder : TABLE_SORT_MAP[tableSortKey],
    dir: viewMode === "galerie" ? undefined : tableSortDir,
  };
  const { recipes, totalRecipes, loading, error, addRecipes, refetch, patchRecipeSilent, patchRecipeLocal, deleteRecipeSilent, deleteRecipe, updateRecipe, toggleFavorite, fetchNextPage, hasNextPage, isFetchingNextPage } = useRecipes(recipeFilter, undefined, serverFilters);
  const fetchNextPageRef = useRef(fetchNextPage);
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  useEffect(() => { fetchNextPageRef.current = fetchNextPage; }, [fetchNextPage]);
  useEffect(() => { hasNextPageRef.current = hasNextPage; }, [hasNextPage]);
  useEffect(() => { isFetchingNextPageRef.current = isFetchingNextPage; }, [isFetchingNextPage]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPageRef.current && !isFetchingNextPageRef.current) {
          fetchNextPageRef.current();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const showNotes = useLocalStorage<boolean>("lk_showNotes", true);
  const showCookCount = useLocalStorage<boolean>("lk_showCookCount", true);

  const [isManaging, setIsManaging] = useState(false);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    if (mode !== "tabelle") setIsManaging(false);
    try { localStorage.setItem("lk_viewMode", JSON.stringify(mode)); } catch {}
  };

  const [field1, setField1] = useState("");
  const [searchResults, setSearchResults] = useState<Recipe[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchSummary, setAiSearchSummary] = useState<string | null>(null);
  // "direct" = unified field (stage 1 or 2), "kochidee" = Kochidee-Dialog
  const activeSourceRef = useRef<"direct" | "kochidee" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  // filled by useEffect so Enter can fire stage 2 immediately
  const fireAiSearchRef = useRef<(() => Promise<void>) | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedFullRecipe, setSelectedFullRecipe] = useState<Recipe | null>(null);
  const selected = selectedFullRecipe ?? (selectedId != null ? (recipes.find((r) => r.id === selectedId) ?? null) : null);
  // pendingOpenIdRef: recipe was saved but not yet in the list — wait for it to appear
  const pendingOpenIdRef = useRef<number | null>(null);
  // currentFetchIdRef: race-condition guard for the async fetchRecipeById call
  const currentFetchIdRef = useRef<number | null>(null);

  // Freeze allRecipes while the modal is open so background auto-loading
  // doesn't cause the modal to re-render and flicker.
  const frozenAllRecipesRef = useRef<Recipe[]>(recipes);
  if (!selected) {
    frozenAllRecipesRef.current = recipes;
  }
  const allRecipesForModal = frozenAllRecipesRef.current;
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);

  const openRecipe = async (id: number) => {
    setSelectedId(id);
    setSelectedFullRecipe(null);
    currentFetchIdRef.current = id; // race-condition guard only — does NOT interfere with pendingOpenIdRef
    try {
      const full = await fetchRecipeById(id);
      if (currentFetchIdRef.current === id) {
        setSelectedFullRecipe(full);
      }
    } catch {
    }
  };

  const openCookingMode = async (recipe: Recipe) => {
    if (recipe.hasSteps && (!Array.isArray(recipe.steps) || recipe.steps.length === 0)) {
      try {
        const full = await fetchRecipeById(recipe.id);
        setCookingRecipe(full);
        return;
      } catch {
      }
    }
    setCookingRecipe(recipe);
  };
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showNewRecipeModal, setShowNewRecipeModal] = useState(false);
  const [variantBaseRecipe, setVariantBaseRecipe] = useState<Recipe | null>(null);
  const [suggestRecipe, setSuggestRecipe] = useState<Recipe | null>(null);

  const [fabOpen, setFabOpen] = useState(false);
  const [kochideeOpen, setKochideeOpen] = useState(false);
  const [isKochideeResult, setIsKochideeResult] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [urlModalInitialUrl, setUrlModalInitialUrl] = useState("");
  const [managedSelected, setManagedSelected] = useState<Set<number>>(new Set());

  // Nach erfolgreichem Löschen: IDs sofort aus searchResults entfernen (kein KI-Re-Trigger)
  const removeFromSearch = useCallback((ids: number[]) => {
    setSearchResults((prev) => (prev ? prev.filter((r) => !ids.includes(r.id)) : null));
  }, []);

  const handleDeleteRecipe = useCallback(async (id: number) => {
    await deleteRecipe(id);
    removeFromSearch([id]);
  }, [deleteRecipe, removeFromSearch]);

  const deleteRecipeSilentFiltered = useCallback(async (id: number) => {
    await deleteRecipeSilent(id);
    removeFromSearch([id]);
  }, [deleteRecipeSilent, removeFromSearch]);

  const recipeIds = useMemo(() => recipes.map((r) => r.id), [recipes]);
  const { data: commentStats = {} } = useCommentStats(recipeIds);
  const { data: recipeStats } = useRecipeStats();

  const openedForIdRef = useRef<number | null>(null);
  const hasRecipes = recipes.length > 0;

  useEffect(() => {
    if (!initialOpenRecipeId) {
      openedForIdRef.current = null;
      return;
    }
    if (openedForIdRef.current === initialOpenRecipeId) return;
    if (!hasRecipes) return;
    openedForIdRef.current = initialOpenRecipeId;
    openRecipe(initialOpenRecipeId);
    onRecipeOpened?.();
  }, [initialOpenRecipeId, hasRecipes]);

  useEffect(() => {
    if (!initialSortOrder) return;
    setRecipeFilter("all");
    setSortOrderOverride(initialSortOrder);
    onSortOrderApplied?.();
  }, [initialSortOrder]);

  useEffect(() => {
    const pendingId = pendingOpenIdRef.current;
    if (pendingId == null) return;
    const recipe = recipes.find((r) => r.id === pendingId);
    if (recipe) {
      pendingOpenIdRef.current = null;
      openRecipe(recipe.id);
    }
  }, [recipes]);

  const refreshTokenRef = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === undefined) return;
    if (refreshTokenRef.current === refreshToken) return;
    refreshTokenRef.current = refreshToken;
    refetch();
  }, [refreshToken, refetch]);

  const toggleSelect = (id: number) => setManagedSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (managedSelected.size === recipes.length) setManagedSelected(new Set());
    else setManagedSelected(new Set(recipes.map((r) => r.id)));
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
    // Cancel all pending timers and in-flight requests on every keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    fireAiSearchRef.current = null;

    const trimmed = field1.trim();
    if (trimmed.length < 2) {
      // Preserve Kochidee-Dialog results; clear everything else
      if (activeSourceRef.current !== "kochidee") {
        setSearchResults(null);
        setAiSearchSummary(null);
        setIsKochideeResult(false);
        activeSourceRef.current = null;
      }
      setSearchLoading(false);
      setAiSearchLoading(false);
      return;
    }

    setSearchLoading(true);

    // Stage 1 — 300 ms: GET /recipes/search (sofortige Treffer)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const filterParam = recipeFilter !== "all" ? `&filter=${recipeFilter}` : "";
        const res = await authFetch(
          `${API_BASE}/recipes/search?q=${encodeURIComponent(trimmed)}${filterParam}`,
          { headers: authHeaders(), signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const found: Recipe[] = Array.isArray(data) ? data : (data.recipes ?? []);
        if (!controller.signal.aborted) {
          setSearchResults(found);
          setAiSearchSummary(null);
          setIsKochideeResult(false);
          activeSourceRef.current = "direct";
        }
      } catch { /* abort is normal */ }
      finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);

    // Stage 2 — 800 ms: POST /recipes/smart-search (KI-Veredelung)
    const doAiSearch = async () => {
      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiSearchLoading(true);
      try {
        const { recipes, summary } = await smartSearchApi(trimmed, recipeFilter, controller.signal);
        if (!controller.signal.aborted) {
          setSearchResults(recipes);
          setAiSearchSummary(summary ?? null);
          setIsKochideeResult(false);
          activeSourceRef.current = "direct";
        }
      } catch { /* abort is normal */ }
      finally {
        if (!controller.signal.aborted) setAiSearchLoading(false);
      }
    };
    // Expose for immediate call on Enter
    fireAiSearchRef.current = doAiSearch;
    aiDebounceRef.current = setTimeout(() => void doAiSearch(), 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
      abortControllerRef.current?.abort();
      aiAbortRef.current?.abort();
    };
  }, [field1, recipeFilter]);

  useEffect(() => {
    setSearchResults(null);
    setField1("");
    setAiSearchSummary(null);
    setIsKochideeResult(false);
    activeSourceRef.current = null;
  }, [recipeFilter]);

  const allCategories = useMemo(() => {
    const cats = [...(recipeStats?.categories.map((c) => c.name) ?? [])].sort();
    return ["Alle", ...cats];
  }, [recipeStats?.categories]);

  const baseList = useMemo(() => {
    if (searchResults !== null) {
      const sorted2 = [...searchResults];
      switch (activeSortOrder) {
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
        case "neueste":
          sorted2.sort((a, b) => {
            const ca = a.createdAt ?? "";
            const cb = b.createdAt ?? "";
            return cb.localeCompare(ca);
          });
          break;
      }
      return sorted2;
    }
    return recipes;
  }, [searchResults, recipes, activeSortOrder]);


  const knownCategories = useMemo(
    () => [...(recipeStats?.categories.map((c) => c.name) ?? [])].sort(),
    [recipeStats?.categories]
  );

  const currentSeason = getCurrentSeason();
  const seasonalRecipes = recipeStats?.seasonal ?? [];

  const isFiltered = field1.trim() !== "" || activeCategory !== "Alle" || timeFilter !== "Alle" || seasonFilter !== "Alle" || cookedFilter !== "Alle" || photoType !== "all" || chefPickFilter;

  return (
    <div>
      {/* Sticky filter bar */}
      <div
        className="sticky top-16 z-30 px-4 pt-2 pb-2 sm:pt-4 sm:pb-3"
        style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="mb-2 sm:mb-3 flex items-center gap-2">
            <div className="flex gap-1 bg-white border border-border rounded-xl p-0.5 sm:p-1 flex-shrink-0">
              <button
                onClick={() => setViewMode("galerie")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-colors min-h-[34px] sm:min-h-[40px] ${viewMode === "galerie" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Galerie
              </button>
              <button
                onClick={() => setViewMode("tabelle")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-colors min-h-[34px] sm:min-h-[40px] ${viewMode === "tabelle" ? "bg-[#3d6849] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Table className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Tabelle
              </button>
            </div>

            {/* Ownership segmented control */}
            <div className="flex gap-0.5 bg-muted border border-border rounded-xl p-0.5 sm:p-1 ml-auto flex-shrink-0">
              {(["all", "mine", "favorites"] as RecipeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setRecipeFilter(f)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all min-h-[30px] sm:min-h-[34px] ${
                    recipeFilter === f
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" && <BookOpen className="w-3.5 h-3.5" />}
                  {f === "mine" && <ChefHat className="w-3.5 h-3.5" />}
                  {f === "favorites" && <Star className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{FILTER_LABELS[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search + category filters */}
          {(
            <div className="space-y-2 sm:space-y-2.5">
              {/* Einziges Suchfeld: Stufe 1 (300 ms GET) + Stufe 2 (800 ms KI) + Kochidee-Button */}
              <div
                className="flex items-center bg-white rounded-xl border border-border overflow-hidden focus-within:ring-2 focus-within:ring-[#4A7C59]/30 transition-all"
                style={{ minHeight: "52px" }}
              >
                <Search className="flex-shrink-0 ml-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Wonach ist dir heute?"
                  value={field1}
                  onChange={(e) => setField1(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && field1.trim().length >= 2) {
                      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
                      void fireAiSearchRef.current?.();
                    }
                  }}
                  className="flex-1 pl-3 pr-2 py-3 bg-transparent text-base focus:outline-none"
                />
                {/* Stufe-1-Spinner grün, Stufe-2-Funkel amber — links des Trennstrichs */}
                {(aiSearchLoading || searchLoading) && (
                  <div className="flex-shrink-0 flex items-center pr-2">
                    {aiSearchLoading ? (
                      <Sparkles className="w-4 h-4 animate-pulse text-amber-500" />
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                    )}
                  </div>
                )}
                {/* Trennstrich + Kochidee-Button */}
                <div className="self-stretch flex items-center border-l border-border">
                  <button
                    onClick={() => setKochideeOpen(true)}
                    title="Kochidee — im Dialog eingrenzen"
                    className="flex items-center justify-center w-12 h-full min-h-[44px] text-[#C1693A] hover:bg-[#C1693A]/10 transition-colors"
                  >
                    <Lightbulb className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Filter button + quick category chips */}
              <div className="flex items-center gap-2">
                <FilterBottomSheet
                  timeFilter={timeFilter}
                  seasonFilter={seasonFilter}
                  cookedFilter={cookedFilter}
                  showVariants={showVariants}
                  hasVariants={recipeStats?.hasVariants ?? false}
                  photoType={photoType}
                  onApply={({ timeFilter: t, seasonFilter: s, cookedFilter: c, showVariants: sv, photoType: pt }) => {
                    setTimeFilter(t);
                    setSeasonFilter(s);
                    setCookedFilter(c);
                    setShowVariants(sv);
                    setPhotoType(pt);
                  }}
                />
                <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-0.5 no-scrollbar flex-1">
                  <button
                    onClick={() => setChefPickFilter((v) => !v)}
                    className={`flex-shrink-0 flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors min-h-[30px] sm:min-h-[36px] ${
                      chefPickFilter
                        ? "bg-amber-500 text-white border border-amber-500"
                        : "bg-white text-foreground border border-border hover:border-amber-400"
                    }`}
                  >
                    👩‍🍳 Lucias Tipps
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex-shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors min-h-[30px] sm:min-h-[36px] ${
                        activeCategory === cat
                          ? "bg-[#3d6849] text-white"
                          : "bg-white text-foreground border border-border hover:border-[#4A7C59]/40"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="max-w-6xl mx-auto px-4 py-4">

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
              <button
                onClick={() => refetch()}
                className="mt-4 px-4 py-2 rounded-md bg-[#4A7C59] text-white font-medium hover:bg-[#3a6347] transition-colors"
              >
                Nochmal versuchen
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <ImportInProgressBanner />

              {/* Recipe count */}
              <div className="mb-5 px-4 py-2 flex items-center gap-2 text-sm text-[#4A7C59]">
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <span>
                  <span className="font-bold">{searchResults !== null ? baseList.length : (totalRecipes ?? recipes.length)}</span>
                  <span className="opacity-70"> {(isFiltered || searchResults !== null) ? "Treffer" : "Rezepte"}</span>
                  {searchResults !== null && savedSortOrder !== "alphabetisch" && (
                    <span className="text-xs text-muted-foreground/70 ml-1">
                      {"(sortiert: " + (savedSortOrder === "kategorie" ? "nach Kategorie" : savedSortOrder === "bewertung" ? "nach Bewertung" : savedSortOrder === "zuletzt_gekocht" ? "zuletzt gekocht" : "am häufigsten gekocht") + ")"}
                    </span>
                  )}
                </span>
                {aiSearchLoading && baseList.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <Sparkles className="w-3 h-3 animate-pulse" />
                    KI verfeinert…
                  </span>
                )}
                {searchResults !== null && baseList.length > 0 && field1.trim() && !aiSearchLoading && (
                  <button
                    onClick={() => { setWebSearchQuery(field1.trim()); setShowWebSearch(true); }}
                    className="ml-auto flex-shrink-0 text-xs text-muted-foreground hover:text-[#4A7C59] transition-colors whitespace-nowrap"
                  >
                    · auch im Web suchen
                  </button>
                )}
              </div>

              {(searchLoading || isFiltered || searchResults !== null) && (
                <div className="mb-4">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A7C59]" />
                      <span className="text-muted-foreground">Suche läuft…</span>
                    </div>
                  ) : aiSearchSummary ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm flex-wrap">
                      <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="font-medium text-amber-800 flex-1 min-w-0">{aiSearchSummary}</span>
                      {baseList.length === 0 && field1.trim() && (
                        <button
                          onClick={() => { setWebSearchQuery(field1.trim()); setShowWebSearch(true); }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#4A7C59]/30 text-[#4A7C59] hover:bg-[#4A7C59]/5 transition-colors flex-shrink-0"
                        >
                          <Globe className="w-3 h-3" />
                          Im Web nach „{field1.trim()}" suchen
                        </button>
                      )}
                      {isKochideeResult && (
                        <>
                          <button
                            onClick={() => {
                              setSearchResults(null);
                              setAiSearchSummary(null);
                              setIsKochideeResult(false);
                              activeSourceRef.current = null;
                              setKochideeOpen(true);
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap flex-shrink-0"
                          >
                            <Lightbulb className="w-3 h-3" />
                            Verfeinern
                          </button>
                          <button
                            onClick={() => {
                              setSearchResults(null);
                              setAiSearchSummary(null);
                              setIsKochideeResult(false);
                              activeSourceRef.current = null;
                            }}
                            className="p-1 rounded-lg text-amber-600 hover:bg-amber-100 transition-colors flex-shrink-0"
                            title="Kochidee-Ergebnis verwerfen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ) : baseList.length === 0 ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-muted-foreground">Keine Treffer</p>
                      {field1.trim() && (
                        <button
                          onClick={() => { setWebSearchQuery(field1.trim()); setShowWebSearch(true); }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#4A7C59]/30 text-[#4A7C59] hover:bg-[#4A7C59]/5 transition-colors"
                        >
                          <Globe className="w-3 h-3" />
                          Im Web nach „{field1.trim()}" suchen
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Seasonal hint banner */}
              {seasonFilter === "Alle" && seasonalRecipes.length > 0 && !field1 && (
                <div
                  className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #f5ede0, #fdf6ec)", borderColor: "#e2c9a8" }}
                  onClick={() => setSeasonFilter(currentSeason)}
                >
                  <div>
                    <p className="text-sm font-semibold text-[#4A7C59]">
                      {SEASON_ICONS[currentSeason]} Rezepte für den {SEASON_LABELS[currentSeason]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {seasonalRecipes.length} {seasonalRecipes.length === 1 ? "Rezept" : "Rezepte"} aus deiner Sammlung passen zur aktuellen Jahreszeit
                    </p>
                  </div>
                  <span className="text-xs text-[#4A7C59] font-medium whitespace-nowrap">Anzeigen →</span>
                </div>
              )}

              {(searchLoading || aiSearchLoading) && baseList.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-border overflow-hidden animate-pulse" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}>
                      <div className="w-full bg-gray-200" style={{ paddingTop: "80%" }} />
                      <div className="p-4 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !searchLoading && !aiSearchLoading && baseList.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-4xl mb-4">🔍</p>
                  <p className="font-serif text-lg">Kein Rezept gefunden.</p>
                  {field1.trim() && (
                    <button
                      onClick={() => { setWebSearchQuery(field1.trim()); setShowWebSearch(true); }}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border border-[#4A7C59]/30 text-[#4A7C59] hover:bg-[#4A7C59]/5 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Im Web nach „{field1.trim()}" suchen
                    </button>
                  )}
                </div>
              ) : viewMode === "galerie" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {baseList.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        onClick={() => openRecipe(recipe.id)}
                        onCook={() => openCookingMode(recipe)}
                        onSuggest={() => setSuggestRecipe(recipe)}
                        showNotes={showNotes}
                        showCookCount={showCookCount}
                        onToggleFavorite={toggleFavorite}
                        commentCount={commentStats[recipe.id]?.count}
                        avgRating={commentStats[recipe.id]?.avgRating}
                        matchedInNotes={recipe.matchedInNotes}
                      />
                    ))}
                  </div>
                  {!searchResults && (
                    <>
                      <div ref={sentinelRef} className="h-4" />
                      {isFetchingNextPage && (
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                          <span>Weitere Rezepte werden geladen…</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : isManaging ? (
                <div className="pb-28">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground font-medium">Verwalten-Modus aktiv</span>
                    <button
                      onClick={() => { setIsManaging(false); setManagedSelected(new Set()); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[#4A7C59]/30 text-[#4A7C59] hover:bg-[#4A7C59]/10 transition-colors"
                    >
                      <Settings2 className="w-4 h-4" />
                      Verwalten beenden
                    </button>
                  </div>
                  <RecipeManagement
                    recipes={recipes}
                    selected={managedSelected}
                    onToggle={toggleSelect}
                    onToggleAll={toggleAll}
                    patchRecipeSilent={patchRecipeSilent}
                    deleteRecipeSilent={deleteRecipeSilentFiltered}
                    updateRecipe={updateRecipe}
                    refetch={refetch}
                    onClearSelect={() => setManagedSelected(new Set())}
                    addRecipes={addRecipes}
                  />
                  <div ref={sentinelRef} className="h-4" />
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                      <span>Weitere Rezepte werden geladen…</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => setIsManaging(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-[#4A7C59] hover:border-[#4A7C59]/40 transition-colors"
                    >
                      <Settings2 className="w-4 h-4" />
                      Verwalten
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-[#4A7C59]/5">
                          {(
                            [
                              { col: "title" as TableSortKey, label: "Titel", cls: "" },
                            ]
                          ).map(({ col, label, cls }) => (
                            <th key={col}
                              onClick={() => handleTableSort(col)}
                              className={`px-4 py-3 text-left font-semibold text-foreground cursor-pointer select-none hover:text-[#4A7C59] transition-colors ${cls}`}>
                              {label}
                              <SortIcon col={col} sortKey={tableSortKey} sortDir={tableSortDir} />
                            </th>
                          ))}
                          <th className="px-4 py-3 hidden sm:table-cell"></th>
                          {(
                            [
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
                          <th className="px-4 py-3 hidden xl:table-cell text-center font-semibold text-foreground select-none">
                            Ausprobiert
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {baseList.map((recipe) => (
                          <RecipeTableRow
                            key={recipe.id}
                            recipe={recipe}
                            onClick={() => openRecipe(recipe.id)}
                            onCook={() => openCookingMode(recipe)}
                            onSuggest={() => setSuggestRecipe(recipe)}
                            onTriedChange={(tried) => { patchRecipeLocal(recipe.id, { tried }); patchRecipeSilent(recipe.id, { tried }).catch(() => patchRecipeLocal(recipe.id, { tried: !tried })); }}
                            matchedInNotes={recipe.matchedInNotes}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!searchResults && (
                    <>
                      <div ref={sentinelRef} className="h-4" />
                      {isFetchingNextPage && (
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                          <span>Weitere Rezepte werden geladen…</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {cookingRecipe && (
            <CookingMode recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} />
          )}

          {suggestRecipe && (
            <RecipeSuggestModal
              recipeId={suggestRecipe.id}
              recipeTitle={suggestRecipe.title}
              onClose={() => setSuggestRecipe(null)}
              onSent={() => setSuggestRecipe(null)}
            />
          )}

          {selected && (
            <RecipeModal
              recipe={selected}
              onClose={() => { setSelectedId(null); setSelectedFullRecipe(null); pendingOpenIdRef.current = null; currentFetchIdRef.current = null; }}
              onAddToWeek={_onNavigate ? () => _onNavigate("wochenplan") : undefined}
              onToggleFavorite={toggleFavorite}
              onDeleteRecipe={handleDeleteRecipe}
              allRecipes={allRecipesForModal}
              onOpenRecipe={(r) => openRecipe(r.id)}
              onRecipeUpdated={(updated) => {
                const u = updated as { id: number; imageUrl?: string | null; isAiGenerated?: boolean; imageSource?: string | null; chefPick?: boolean | null };
                patchRecipeLocal(u.id, { imageUrl: u.imageUrl ?? null, isAiGenerated: u.isAiGenerated ?? false, imageSource: u.imageSource ?? null, chefPick: u.chefPick ?? false });
              }}
              onCreateVariant={(baseRecipe) => {
                setVariantBaseRecipe(baseRecipe);
                setSelectedId(null);
                setSelectedFullRecipe(null);
              }}
            />
          )}

          {variantBaseRecipe && (
            <RecipeEditModal
              recipe={{
                ...variantBaseRecipe,
                id: -1,
                variantName: "",
                parentRecipeId: variantBaseRecipe.id,
              }}
              isNewVariant={true}
              parentRecipeId={variantBaseRecipe.id}
              onClose={() => setVariantBaseRecipe(null)}
              onSave={async (_id, data: RecipeUpdatePayload) => {
                await addRecipes([data as Partial<Recipe>]);
                setVariantBaseRecipe(null);
              }}
              knownCategories={knownCategories}
            />
          )}

          {showUrlModal && (
            <UrlImportModal
              onClose={() => { setShowUrlModal(false); setUrlModalInitialUrl(""); }}
              onAdd={async (newRecipes) => addRecipes(newRecipes)}
              onOpenRecipe={(id) => { setShowUrlModal(false); setUrlModalInitialUrl(""); openRecipe(id); }}
              initialUrl={urlModalInitialUrl || undefined}
            />
          )}

          {showPdfModal && (
            <PdfUploadModal
              onClose={() => setShowPdfModal(false)}
              onAdd={async (newRecipes) => addRecipes(newRecipes)}
              onOpenRecipe={(id) => { setShowPdfModal(false); openRecipe(id); }}
            />
          )}

          {showImageModal && (
            <ImageImportModal
              onClose={(savedIds) => {
                setShowImageModal(false);
                // Kein Auto-Öffnen mehr — Nutzer wählt über "Rezept öffnen" im Modal
                void savedIds;
              }}
              onAdd={async (newRecipes) => addRecipes(newRecipes)}
              onOpenRecipe={(id) => { setShowImageModal(false); openRecipe(id); }}
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

          {/* Speed-Dial FAB */}
          {fabOpen && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setFabOpen(false)}
            />
          )}
          <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-3">
            {fabOpen && (
              <>
                <button
                  onClick={() => { setFabOpen(false); setShowImageModal(true); }}
                  className="flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg whitespace-nowrap"
                  style={{ background: "#6b5ca5" }}
                >
                  <Camera className="w-4 h-4" />
                  Foto importieren
                </button>
                <button
                  onClick={() => { setFabOpen(false); setShowPdfModal(true); }}
                  className="flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg whitespace-nowrap"
                  style={{ background: "#C1693A" }}
                >
                  <Upload className="w-4 h-4" />
                  PDF hochladen
                </button>
                <button
                  onClick={() => { setFabOpen(false); setShowUrlModal(true); }}
                  className="flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg whitespace-nowrap"
                  style={{ background: "#3d6849" }}
                >
                  <Link className="w-4 h-4" />
                  URL importieren
                </button>
                <button
                  onClick={() => { setFabOpen(false); setShowNewRecipeModal(true); }}
                  className="flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg whitespace-nowrap"
                  style={{ background: "#2d5240" }}
                >
                  <Plus className="w-4 h-4" />
                  Manuell erfassen
                </button>
              </>
            )}
            <button
              onClick={() => setFabOpen((o) => !o)}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{
                background: "linear-gradient(135deg, #C1693A 0%, #d4855a 100%)",
                minWidth: "56px",
                minHeight: "56px",
                transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
              }}
              title="Rezept hinzufügen"
              aria-label="Rezept hinzufügen"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>
      </>

      {/* Websuche-Overlay */}
      {showWebSearch && (
        <WebSearchResults
          query={webSearchQuery}
          onClose={() => setShowWebSearch(false)}
          onSelectUrl={(url) => {
            setShowWebSearch(false);
            setUrlModalInitialUrl(url);
            setShowUrlModal(true);
          }}
        />
      )}

      {/* Kochidee-Overlay */}
      {kochideeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setKochideeOpen(false); }}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl flex flex-col"
            style={{ maxHeight: "88vh", boxShadow: "0 -4px 40px rgba(0,0,0,0.18)" }}
          >
            <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#C1693A]/15 flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-[#C1693A]" />
              </div>
              <div>
                <h2 className="font-serif font-semibold text-base leading-tight">Kochidee finden</h2>
                <p className="text-xs text-muted-foreground leading-tight">KI-Assistent ohne Vorratsschrank</p>
              </div>
              <button
                onClick={() => setKochideeOpen(false)}
                className="ml-auto p-1.5 rounded-xl border border-border text-muted-foreground hover:bg-[#f5ede0] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-5">
              <KochideeChat
                mode="overlay"
                onRecipeClick={(id) => {
                  setKochideeOpen(false);
                  openRecipe(id);
                }}
                onClose={() => setKochideeOpen(false)}
                onWebSearch={(q) => {
                  setKochideeOpen(false);
                  setWebSearchQuery(q);
                  setShowWebSearch(true);
                }}
                onResults={(resultRecipes: SuggestedRecipe[], summary: string) => {
                  setSearchResults(resultRecipes as unknown as Recipe[]);
                  setAiSearchSummary(summary);
                  setIsKochideeResult(true);
                  activeSourceRef.current = "kochidee";
                  setSearchLoading(false);
                  setKochideeOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
