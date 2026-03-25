import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, Check, RefreshCw, Copy } from "lucide-react";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

interface DuplicateRecipe {
  id: number;
  title: string;
  category: string;
  source: string | null;
  ingredientCount: number;
  createdAt: string | null;
  isOwner: boolean;
  difficulty: string;
}

interface DuplicateGroup {
  recipes: DuplicateRecipe[];
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

function RecipeCard({ recipe, isKept, onKeep, busy }: {
  recipe: DuplicateRecipe;
  isKept: boolean;
  onKeep: () => void;
  busy: boolean;
}) {
  const dateLabel = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "–";

  return (
    <div className={`flex flex-col rounded-2xl border-2 p-4 transition-all ${
      isKept
        ? "border-[#4A7C59] bg-[#4A7C59]/5 shadow-md"
        : "border-border bg-white"
    }`}>
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl flex-shrink-0">{CATEGORY_EMOJIS[recipe.category] ?? "🍽️"}</span>
        <div className="flex-1 min-w-0">
          <p className="font-serif font-semibold text-sm leading-snug line-clamp-2">{recipe.title}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59] font-medium">
            {recipe.category}
          </span>
        </div>
        {isKept && (
          <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-1 rounded-full">
            <Check className="w-3 h-3" /> Behalten
          </span>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground mb-4 flex-1">
        <div className="flex justify-between">
          <span>Zutaten</span>
          <span className="font-medium text-foreground">{recipe.ingredientCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Schwierigkeit</span>
          <span className={`font-medium ${
            recipe.difficulty === "simpel" ? "text-green-600" :
            recipe.difficulty === "schwer" ? "text-red-600" : "text-amber-600"
          }`}>{recipe.difficulty}</span>
        </div>
        {recipe.source && (
          <div className="flex justify-between gap-2">
            <span className="flex-shrink-0">Quelle</span>
            <span className="font-medium text-foreground text-right truncate max-w-[140px]" title={recipe.source}>
              {recipe.source}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Erstellt am</span>
          <span className="font-medium text-foreground">{dateLabel}</span>
        </div>
        <div className="flex justify-between">
          <span>Eigentümer</span>
          <span className="font-medium text-foreground">{recipe.isOwner ? "Du" : "Anderer"}</span>
        </div>
      </div>

      {!isKept && (
        <button
          onClick={onKeep}
          disabled={busy}
          className="w-full py-2 px-3 rounded-xl bg-[#4A7C59] text-white text-xs font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Dieses behalten & andere löschen
        </button>
      )}
    </div>
  );
}

export default function DuplicatesTab() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<number | null>(null);
  const [keptId, setKeptId] = useState<number | null>(null);
  const [totalDeleted, setTotalDeleted] = useState(0);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/recipes/duplicates`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      setError("Duplikate konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  const handleKeep = async (groupIndex: number, keepId: number) => {
    const group = groups[groupIndex];
    const toDelete = group.recipes.filter((r) => r.id !== keepId);

    setBusyGroup(groupIndex);
    setKeptId(keepId);
    try {
      let deleted = 0;
      let failed = 0;
      for (const recipe of toDelete) {
        try {
          const res = await authFetch(`${API_BASE}/recipes/${recipe.id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
          if (res.ok) {
            deleted++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      setTotalDeleted((prev) => prev + deleted);
      if (failed === 0) {
        setGroups((prev) => prev.filter((_, i) => i !== groupIndex));
        toast(`${deleted} Rezept${deleted !== 1 ? "e" : ""} gelöscht`);
      } else if (deleted > 0) {
        await fetchDuplicates();
        toast(`${deleted} gelöscht, ${failed} konnte${failed !== 1 ? "n" : ""} nicht gelöscht werden`, "err");
      } else {
        toast("Löschen fehlgeschlagen – keine Berechtigung?", "err");
      }
    } catch {
      toast("Fehler beim Löschen", "err");
    } finally {
      setBusyGroup(null);
      setKeptId(null);
    }
  };

  const handleIgnore = (groupIndex: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== groupIndex));
    toast("Gruppe ignoriert");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="text-sm">Analysiere Rezepte auf Duplikate…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchDuplicates}
          className="flex items-center gap-2 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors">
          <RefreshCw className="w-4 h-4" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-serif font-semibold text-lg mb-1 flex items-center gap-2">
              <Copy className="w-5 h-5 text-amber-500" />
              Duplikatanalyse
            </h3>
            <p className="text-sm text-muted-foreground">
              Rezepte werden als Duplikat erkannt wenn sie denselben Titel, dieselbe Quell-URL oder
              mehr als 80% übereinstimmende Zutaten haben.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {totalDeleted > 0 && (
              <span className="text-sm font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-3 py-1.5 rounded-xl">
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                {totalDeleted} gelöscht
              </span>
            )}
            <button onClick={fetchDuplicates}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-border rounded-xl text-sm font-medium hover:border-[#4A7C59]/40 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Neu analysieren
            </button>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h3 className="font-serif font-semibold text-lg mb-2">Keine Duplikate gefunden</h3>
          <p className="text-sm text-muted-foreground">
            Alle Rezepte scheinen einzigartig zu sein.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
              {groups.length} Gruppe{groups.length !== 1 ? "n" : ""} gefunden
            </span>
          </div>

          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="bg-white rounded-2xl border border-border shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">
                    Gruppe {groupIndex + 1}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {group.recipes.length} mögliche Duplikate
                    </span>
                  </h4>
                </div>
                <button
                  onClick={() => handleIgnore(groupIndex)}
                  disabled={busyGroup === groupIndex}
                  className="text-xs px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
                >
                  Kein Duplikat — ignorieren
                </button>
              </div>

              <div className={`grid gap-3 ${
                group.recipes.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
                group.recipes.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}>
                {group.recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    isKept={busyGroup === groupIndex && keptId === recipe.id}
                    onKeep={() => handleKeep(groupIndex, recipe.id)}
                    busy={busyGroup === groupIndex}
                  />
                ))}
              </div>

              {busyGroup === groupIndex && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Löschen…
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
