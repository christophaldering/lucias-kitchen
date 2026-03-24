import { useState, useMemo } from "react";
import { Loader2, Trash2, Edit2, Download, Printer, Tag, X, Plus, ArrowUp, ArrowDown, ArrowUpDown, Copy } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import type { RecipeUpdatePayload } from "@/hooks/useRecipes";
import RecipeEditModal from "@/components/RecipeEditModal";
import { formatIngredient } from "@/types/recipe";

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function BulkCategoryInput({
  recipes,
  busy,
  onSet,
}: {
  recipes: Recipe[];
  busy: boolean;
  onSet: (cat: string) => void;
}) {
  const [val, setVal] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const existingCats = Array.from(new Set(recipes.map((r) => r.category))).sort();

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === "__custom__") { setShowCustom(true); setVal(""); return; }
    if (v) { onSet(v); setVal(""); }
  };

  if (showCustom) {
    return (
      <div className="flex gap-1 items-center">
        <input value={customVal} onChange={(e) => setCustomVal(e.target.value)}
          placeholder="Neue Kategorie…"
          className="bg-white/10 border border-white/20 text-white placeholder-white/50 text-xs px-2 py-1.5 rounded-lg focus:outline-none w-28" />
        <button onClick={() => { if (customVal.trim()) { onSet(customVal.trim()); setShowCustom(false); setCustomVal(""); } }}
          disabled={busy || !customVal.trim()}
          className="text-xs px-2 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors">
          OK
        </button>
        <button onClick={() => setShowCustom(false)} className="p-1 hover:bg-white/20 rounded transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <select value={val} onChange={handleSelect}
      disabled={busy}
      className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer disabled:opacity-50">
      <option value="">Kategorie ändern…</option>
      {existingCats.map((c) => <option key={c} value={c} className="text-black">{c}</option>)}
      <option value="__custom__" className="text-black italic">+ Eigene Kategorie…</option>
    </select>
  );
}

function BulkActionsBar({
  count,
  recipes,
  selected,
  onClearSelect,
  patchRecipeSilent,
  deleteRecipeSilent,
  refetch,
}: {
  count: number;
  recipes: Recipe[];
  selected: Set<number>;
  onClearSelect: () => void;
  patchRecipeSilent: (id: number, patch: Record<string, unknown>) => Promise<void>;
  deleteRecipeSilent: (id: number) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [diffVal, setDiffVal] = useState("");

  if (count === 0) return null;

  const selectedRecipes = recipes.filter((r) => selected.has(r.id));
  const ownedSelectedRecipes = selectedRecipes.filter((r) => r.isOwner !== false);
  const ownedSelectedIds = new Set(ownedSelectedRecipes.map((r) => r.id));

  const doBulkPatch = async (patch: Record<string, unknown>) => {
    if (ownedSelectedIds.size === 0) { toast("Keine eigenen Rezepte ausgewählt", "err"); return; }
    setBusy(true);
    try {
      await Promise.all([...ownedSelectedIds].map((id) => patchRecipeSilent(id, patch)));
      await refetch();
      toast(`${ownedSelectedIds.size} Rezept${ownedSelectedIds.size !== 1 ? "e" : ""} aktualisiert`);
      onClearSelect();
    } catch { toast("Fehler beim Aktualisieren", "err"); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (ownedSelectedIds.size === 0) { toast("Keine eigenen Rezepte ausgewählt", "err"); setShowDeleteConfirm(false); return; }
    setBusy(true);
    try {
      await Promise.all([...ownedSelectedIds].map((id) => deleteRecipeSilent(id)));
      await refetch();
      toast(`${ownedSelectedIds.size} Rezept${ownedSelectedIds.size !== 1 ? "e" : ""} gelöscht`);
      onClearSelect();
      setShowDeleteConfirm(false);
    } catch { toast("Fehler beim Löschen", "err"); }
    finally { setBusy(false); }
  };

  const doMarkCooked = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setBusy(true);
    try {
      await Promise.all(ownedSelectedRecipes.map((r) =>
        patchRecipeSilent(r.id, { lastCooked: today, cookedCount: (r.cookedCount ?? 0) + 1 })
      ));
      await refetch();
      toast(`${ownedSelectedRecipes.length} Rezept${ownedSelectedRecipes.length !== 1 ? "e" : ""} als heute gekocht markiert`);
      onClearSelect();
    } catch { toast("Fehler", "err"); }
    finally { setBusy(false); }
  };

  const doPrint = () => {
    const html = selectedRecipes.map((r) => `
      <div style="page-break-inside:avoid;margin-bottom:40px;font-family:Georgia,serif">
        <h2 style="font-size:18px;margin:0 0 4px">${r.title}</h2>
        <p style="font-size:12px;color:#666;margin:0 0 12px">${r.category} • ${r.difficulty}${r.totalTime ? " • " + r.totalTime : ""}${r.servings ? " • " + r.servings + " Portionen" : ""}</p>
        <h3 style="font-size:14px;margin:0 0 6px">Zutaten</h3>
        <ul style="margin:0 0 12px;padding-left:18px;font-size:13px">${r.ingredients.map((i) => `<li>${formatIngredient(i)}</li>`).join("")}</ul>
        <h3 style="font-size:14px;margin:0 0 6px">Zubereitung</h3>
        <ol style="margin:0;padding-left:18px;font-size:13px">${r.steps.map((s) => `<li style="margin-bottom:4px">${s}</li>`).join("")}</ol>
        ${r.notes ? `<p style="font-size:12px;color:#7a5c00;background:#fffbe8;padding:8px;margin-top:12px;border-radius:6px">📝 ${r.notes}</p>` : ""}
      </div>`).join("<hr style='margin:20px 0'>");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Rezepte</title><style>
      body{font-family:Georgia,serif;margin:40px;color:#222}
      h2{font-size:20px;margin:0 0 4px}h3{font-size:15px;margin:0 0 6px}
      ul,ol{margin:0 0 12px;padding-left:20px;font-size:13px}
      li{margin-bottom:2px}p{font-size:12px;margin:0 0 8px}
      hr{border:none;border-top:1px solid #ddd;margin:24px 0}
      @media print{
        body{margin:20px}
        .no-print{display:none}
        div{page-break-inside:avoid}
      }
    </style></head><body>${html}</body></html>`);
    win.document.close();
    win.print();
  };

  const doDownload = () => {
    const text = selectedRecipes.map((r) => [
      `=== ${r.title} ===`,
      `Kategorie: ${r.category} | Schwierigkeitsgrad: ${r.difficulty}`,
      r.totalTime ? `Zeit: ${r.totalTime}` : "",
      r.servings ? `Portionen: ${r.servings}` : "",
      r.source ? `Quelle: ${r.source}` : "",
      "",
      "ZUTATEN:",
      ...r.ingredients.map((i) => `  - ${formatIngredient(i)}`),
      "",
      "ZUBEREITUNG:",
      ...r.steps.map((s, i) => `  ${i + 1}. ${s}`),
      r.notes ? `\nNOTIZEN:\n  ${r.notes}` : "",
    ].filter((l) => l !== undefined).join("\n")).join("\n\n" + "─".repeat(50) + "\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rezepte.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="text-4xl text-center mb-3">🗑️</p>
            <h3 className="font-serif text-lg font-semibold text-center mb-2">Rezepte löschen?</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {count} Rezept{count !== 1 ? "e" : ""} werden unwiderruflich gelöscht.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
                Abbrechen
              </button>
              <button onClick={doDelete} disabled={busy}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#2d5240] text-white shadow-2xl border-t-2 border-[#4A7C59]/50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              <span className="font-semibold text-sm">{count} ausgewählt</span>
              <button onClick={onClearSelect} className="p-0.5 hover:bg-white/20 rounded-md transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <BulkCategoryInput
              recipes={recipes}
              busy={busy}
              onSet={(cat) => doBulkPatch({ category: cat })}
            />

            <select value={diffVal} onChange={(e) => { if (e.target.value) { doBulkPatch({ difficulty: e.target.value }); setDiffVal(""); } }}
              disabled={busy}
              className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer disabled:opacity-50">
              <option value="">Schwierigkeit ändern…</option>
              {["simpel","normal","schwer"].map((d) => <option key={d} value={d} className="text-black">{d}</option>)}
            </select>

            <button onClick={doMarkCooked} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50 whitespace-nowrap">
              🍳 Heute gekocht
            </button>

            <button onClick={doPrint} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50">
              <Printer className="w-3.5 h-3.5" /> Drucken
            </button>

            <button onClick={doDownload} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Download
            </button>

            <button onClick={() => setShowDeleteConfirm(true)} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 transition-colors disabled:opacity-50 ml-auto">
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type MgmtSortKey = "title" | "category" | "difficulty" | "time" | "rating" | "cookedCount" | "lastCooked" | "createdAt";

function MgmtSortIcon({ col, sortKey, sortDir }: { col: MgmtSortKey; sortKey: MgmtSortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 inline text-[#4A7C59]" />
    : <ArrowDown className="w-3 h-3 ml-1 inline text-[#4A7C59]" />;
}

const MGMT_DIFF_ORDER: Record<string, number> = { simpel: 0, normal: 1, schwer: 2 };
const parseTotalMins = (t: string | null) => {
  if (!t) return Infinity;
  const m = t.match(/(\d+)/g);
  if (!m) return Infinity;
  const nums = m.map(Number);
  return nums.length === 1 ? nums[0] : nums[0] * 60 + (nums[1] ?? 0);
};

function RecipeTable({
  recipes,
  selected,
  onToggle,
  onToggleAll,
  onEdit,
  onCreateVariant,
}: {
  recipes: Recipe[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onEdit: (r: Recipe) => void;
  onCreateVariant?: (r: Recipe) => void;
}) {
  const [sortKey, setSortKey] = useState<MgmtSortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allSelected = recipes.length > 0 && selected.size === recipes.length;

  const handleSort = (col: MgmtSortKey) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const base = [...recipes];
    const dir = sortDir === "asc" ? 1 : -1;
    base.sort((a, b) => {
      switch (sortKey) {
        case "title": return dir * a.title.localeCompare(b.title, "de");
        case "category": return dir * a.category.localeCompare(b.category, "de");
        case "difficulty": return dir * ((MGMT_DIFF_ORDER[a.difficulty] ?? 1) - (MGMT_DIFF_ORDER[b.difficulty] ?? 1));
        case "time": return dir * (parseTotalMins(a.totalTime) - parseTotalMins(b.totalTime));
        case "rating": {
          const score = (r: Recipe) => r.rating === "sehr lecker" ? 2 : r.rating === "lecker" ? 1 : 0;
          return dir * (score(a) - score(b));
        }
        case "cookedCount": return dir * ((a.cookedCount ?? 0) - (b.cookedCount ?? 0));
        case "lastCooked": {
          const da = a.lastCooked ? new Date(a.lastCooked).getTime() : 0;
          const db2 = b.lastCooked ? new Date(b.lastCooked).getTime() : 0;
          return dir * (da - db2);
        }
        case "createdAt": {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dir * (da - db2);
        }
        default: return 0;
      }
    });
    return base;
  }, [recipes, sortKey, sortDir]);

  const COLS: { key: MgmtSortKey; label: string; cls: string }[] = [
    { key: "title", label: "Titel", cls: "" },
    { key: "category", label: "Kategorie", cls: "hidden md:table-cell" },
    { key: "difficulty", label: "Schwierigkeit", cls: "hidden lg:table-cell" },
    { key: "time", label: "Zeit", cls: "hidden lg:table-cell" },
    { key: "rating", label: "Bewertung", cls: "hidden xl:table-cell" },
    { key: "cookedCount", label: "Anz. gekocht", cls: "hidden xl:table-cell" },
    { key: "lastCooked", label: "Zuletzt gekocht", cls: "hidden xl:table-cell" },
    { key: "createdAt", label: "Hochgeladen am", cls: "hidden xl:table-cell" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-[#4A7C59]/5">
            <th className="px-4 py-3 text-left w-10">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll}
                className="w-4 h-4 rounded accent-[#4A7C59] cursor-pointer" />
            </th>
            {COLS.map((col) => (
              <th key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-3 text-left font-semibold text-foreground cursor-pointer select-none hover:text-[#4A7C59] transition-colors ${col.cls}`}>
                {col.label}
                <MgmtSortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
              </th>
            ))}
            <th className="px-4 py-3 text-center font-semibold text-foreground w-24">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const isSel = selected.has(r.id);
            const isOwner = r.isOwner !== false;
            const createdLabel = r.createdAt
              ? new Date(r.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
              : "–";
            return (
              <tr key={r.id}
                onClick={() => isOwner && onEdit(r)}
                className={`border-b border-border/50 transition-colors ${isOwner ? "cursor-pointer hover:bg-[#4A7C59]/10" : "cursor-default"} ${isSel ? "bg-[#4A7C59]/5" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isSel} onChange={() => onToggle(r.id)}
                    className="w-4 h-4 rounded accent-[#4A7C59] cursor-pointer" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground line-clamp-1">{r.title}</span>
                    {!isOwner && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium flex-shrink-0">
                        {r.owner?.displayName ?? "Geteilt"}
                      </span>
                    )}
                    {r.variantName && (
                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        🔀 {r.variantName}
                      </span>
                    )}
                  </div>
                  <span className="block text-xs text-muted-foreground md:hidden">{CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.category}</span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59]">
                    {CATEGORY_EMOJIS[r.category] ?? "🍽️"} {r.category}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    r.difficulty === "simpel" ? "bg-green-100 text-green-700" :
                    r.difficulty === "normal" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  }`}>{r.difficulty}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                  {r.totalTime?.replace("ca. ", "") ?? "–"}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                  {r.rating === "sehr lecker" ? "⭐ sehr lecker" : r.rating === "lecker" ? "👍 lecker" : "–"}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                  {r.cookedCount ? `${r.cookedCount}×` : "–"}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                  {r.lastCooked ? new Date(r.lastCooked).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                  {createdLabel}
                </td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    {isOwner ? (
                      <button onClick={() => onEdit(r)}
                        className="p-1.5 rounded-lg hover:bg-[#C1693A]/10 text-muted-foreground hover:text-[#C1693A] transition-colors"
                        title="Bearbeiten">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    ) : null}
                    {onCreateVariant && (
                      <button onClick={() => onCreateVariant(r)}
                        className="p-1.5 rounded-lg hover:bg-amber-100 text-muted-foreground hover:text-amber-700 transition-colors"
                        title="Variante erstellen">
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    {!isOwner && !onCreateVariant && (
                      <span className="text-xs text-muted-foreground/50">–</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {recipes.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-3xl mb-2">📭</p>
          <p>Keine Rezepte vorhanden.</p>
        </div>
      )}
    </div>
  );
}

export interface RecipeManagementProps {
  recipes: Recipe[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  patchRecipeSilent: (id: number, patch: Record<string, unknown>) => Promise<void>;
  deleteRecipeSilent: (id: number) => Promise<void>;
  updateRecipe: (id: number, data: RecipeUpdatePayload) => Promise<void>;
  refetch: () => Promise<void>;
  onClearSelect: () => void;
  addRecipes?: (newRecipes: Partial<Recipe>[]) => Promise<void>;
}

export default function RecipeManagement({
  recipes,
  selected,
  onToggle,
  onToggleAll,
  patchRecipeSilent,
  deleteRecipeSilent,
  updateRecipe,
  refetch,
  onClearSelect,
  addRecipes,
}: RecipeManagementProps) {
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [variantBaseRecipe, setVariantBaseRecipe] = useState<Recipe | null>(null);

  const handleSaveEdit = async (id: number, data: RecipeUpdatePayload) => {
    await updateRecipe(id, data);
  };

  const knownCategories = Array.from(new Set(recipes.map((r) => r.category))).sort();

  return (
    <div>
      <RecipeTable
        recipes={recipes}
        selected={selected}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onEdit={setEditRecipe}
        onCreateVariant={setVariantBaseRecipe}
      />
      <BulkActionsBar
        count={selected.size}
        recipes={recipes}
        selected={selected}
        onClearSelect={onClearSelect}
        patchRecipeSilent={patchRecipeSilent}
        deleteRecipeSilent={deleteRecipeSilent}
        refetch={refetch}
      />
      {editRecipe && (
        <RecipeEditModal
          recipe={editRecipe}
          onClose={() => setEditRecipe(null)}
          onSave={handleSaveEdit}
          knownCategories={knownCategories}
        />
      )}
      {variantBaseRecipe && addRecipes && (
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
            await refetch();
            setVariantBaseRecipe(null);
          }}
          knownCategories={knownCategories}
        />
      )}
    </div>
  );
}
