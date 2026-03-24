import { useState, useRef } from "react";
import {
  Loader2, Trash2, Edit2, Download, Tag, RefreshCw,
  Upload, Check, AlertTriangle, Settings, Database, Sliders,
  X, Plus, ChevronsUpDown
} from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import type { Recipe } from "@/types/recipe";

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

const SECTION_TABS = [
  { id: "categories", label: "Kategorien", icon: Tag },
  { id: "backup", label: "Backup & Import", icon: Database },
  { id: "settings", label: "App-Einstellungen", icon: Sliders },
] as const;
type SectionTab = typeof SECTION_TABS[number]["id"];

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  const set = (v: T) => { setVal(v); localStorage.setItem(key, JSON.stringify(v)); };
  return [val, set];
}

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}



const LK_CUSTOM_CATEGORIES_KEY = "lk_customCategories";

function loadCustomCategories(): string[] {
  try {
    const stored = localStorage.getItem(LK_CUSTOM_CATEGORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveCustomCategories(cats: string[]) {
  localStorage.setItem(LK_CUSTOM_CATEGORIES_KEY, JSON.stringify(cats));
}

function CategoryManager({ recipes, patchRecipe, patchRecipeSilent, refetch }: {
  recipes: Recipe[];
  patchRecipe: (id: number, patch: Record<string, unknown>) => Promise<void>;
  patchRecipeSilent: (id: number, patch: Record<string, unknown>) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const [newCat, setNewCat] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [mergeSrc, setMergeSrc] = useState("");
  const [mergeDst, setMergeDst] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categoryCounts = recipes.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  const persistCustomCats = (cats: string[]) => {
    setCustomCategories(cats);
    saveCustomCategories(cats);
  };

  const allCategories = Array.from(
    new Set([...Object.keys(categoryCounts), ...customCategories])
  ).sort();

  const doRename = async (from: string, to: string) => {
    if (!to.trim() || to === from) return;
    const affected = recipes.filter((r) => r.category === from);
    setBusy(true);
    try {
      await Promise.all(affected.map((r) => patchRecipeSilent(r.id, { category: to.trim() })));
      await refetch();
      if (customCategories.includes(from)) {
        const next = customCategories.map((c) => c === from ? to.trim() : c);
        persistCustomCats(next);
      }
      toast(`Kategorie "${from}" → "${to.trim()}" umbenannt${affected.length > 0 ? ` (${affected.length} Rezepte aktualisiert)` : ""}`);
      setRenaming(null);
    } catch { toast("Fehler beim Umbenennen", "err"); }
    finally { setBusy(false); }
  };

  const doMerge = async () => {
    if (!mergeSrc || !mergeDst || mergeSrc === mergeDst) return;
    const affected = recipes.filter((r) => r.category === mergeSrc);
    setBusy(true);
    try {
      await Promise.all(affected.map((r) => patchRecipeSilent(r.id, { category: mergeDst })));
      await refetch();
      if (customCategories.includes(mergeSrc)) {
        persistCustomCats(customCategories.filter((c) => c !== mergeSrc));
      }
      toast(`"${mergeSrc}" → "${mergeDst}" zusammengeführt (${affected.length} Rezepte)`);
      setMergeSrc(""); setMergeDst("");
    } catch { toast("Fehler beim Zusammenführen", "err"); }
    finally { setBusy(false); }
  };

  const doAddCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    if (allCategories.includes(name)) { toast("Kategorie existiert bereits", "err"); return; }
    persistCustomCats([...customCategories, name]);
    toast(`Kategorie "${name}" erstellt`);
    setNewCat("");
  };

  const doDeleteCategory = async (cat: string) => {
    const count = categoryCounts[cat] ?? 0;
    if (count > 0) {
      setDeleteCandidate(cat);
      return;
    }
    if (customCategories.includes(cat)) {
      persistCustomCats(customCategories.filter((c) => c !== cat));
    }
    toast(`Kategorie "${cat}" gelöscht`);
    setDeleteCandidate(null);
  };

  return (
    <div className="space-y-6">
      {deleteCandidate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="text-4xl text-center mb-3">⚠️</p>
            <h3 className="font-serif text-lg font-semibold text-center mb-2">Kategorie löschen?</h3>
            <p className="text-sm text-muted-foreground text-center mb-2">
              <strong>„{deleteCandidate}"</strong> enthält <strong>{categoryCounts[deleteCandidate]} Rezept{categoryCounts[deleteCandidate] !== 1 ? "e" : ""}</strong>.
            </p>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Wähle eine Ziel-Kategorie, um alle Rezepte dorthin zu verschieben, bevor du löschst.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Rezepte verschieben nach:</label>
              <select value={mergeDst} onChange={(e) => setMergeDst(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none">
                <option value="">Kategorie wählen…</option>
                {allCategories.filter((c) => c !== deleteCandidate).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteCandidate(null); setMergeDst(""); }}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
                Abbrechen
              </button>
              <button
                onClick={async () => {
                  if (!mergeDst) return;
                  setBusy(true);
                  try {
                    const affected = recipes.filter((r) => r.category === deleteCandidate);
                    await Promise.all(affected.map((r) => patchRecipe(r.id, { category: mergeDst })));
                    if (customCategories.includes(deleteCandidate!)) {
                      persistCustomCats(customCategories.filter((c) => c !== deleteCandidate));
                    }
                    toast(`Alle Rezepte aus „${deleteCandidate}" nach „${mergeDst}" verschoben und Kategorie gelöscht`);
                    setDeleteCandidate(null); setMergeDst("");
                    await refetch();
                  } catch { toast("Fehler", "err"); }
                  finally { setBusy(false); }
                }}
                disabled={busy || !mergeDst}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Verschieben & Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4">➕ Neue Kategorie erstellen</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Erstelle eine neue Kategorie, um Rezepte besser zu organisieren. Danach Rezepte in der Tabelle zuweisen.
        </p>
        <div className="flex gap-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doAddCategory()}
            placeholder="z.B. Suppen, Desserts, Beilagen…"
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30" />
          <button onClick={doAddCategory} disabled={!newCat.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Hinzufügen
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4">🗂️ Vorhandene Kategorien</h3>
        <div className="space-y-2">
          {allCategories.map((cat) => (
            <div key={cat} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-border/50">
              <span className="text-lg">{CATEGORY_EMOJIS[cat] ?? "🍽️"}</span>
              {renaming === cat ? (
                <>
                  <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doRename(cat, renameVal)}
                    className="flex-1 px-2 py-1 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30" />
                  <button onClick={() => doRename(cat, renameVal)} disabled={busy}
                    className="px-3 py-1 bg-[#4A7C59] text-white rounded-lg text-xs font-medium hover:bg-[#3d6849] transition-colors disabled:opacity-50">
                    OK
                  </button>
                  <button onClick={() => setRenaming(null)} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-sm">{cat}</span>
                  <span className="text-xs text-muted-foreground">{categoryCounts[cat] ?? 0} Rezept{(categoryCounts[cat] ?? 0) !== 1 ? "e" : ""}</span>
                  <button onClick={() => { setRenaming(cat); setRenameVal(cat); }}
                    className="p-1.5 rounded-lg hover:bg-[#4A7C59]/10 text-muted-foreground hover:text-[#4A7C59] transition-colors"
                    title="Umbenennen">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => doDeleteCategory(cat)} disabled={busy}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Kategorie löschen">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {allCategories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Keine Kategorien vorhanden.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4">🔀 Kategorien zusammenführen</h3>
        <p className="text-sm text-muted-foreground mb-4">Alle Rezepte einer Quelle werden in die Ziel-Kategorie verschoben.</p>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Quelle</label>
            <select value={mergeSrc} onChange={(e) => setMergeSrc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none">
              <option value="">Kategorie wählen…</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground rotate-90 mb-3 flex-shrink-0" />
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Ziel</label>
            <select value={mergeDst} onChange={(e) => setMergeDst(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none">
              <option value="">Kategorie wählen…</option>
              {allCategories.filter((c) => c !== mergeSrc).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={doMerge} disabled={busy || !mergeSrc || !mergeDst}
            className="px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Zusammenführen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BackupSection({
  recipes,
  addRecipes,
  deleteAllRecipes,
  restoreDemo,
  refetch,
}: {
  recipes: Recipe[];
  addRecipes: (r: Partial<Recipe>[]) => Promise<void>;
  deleteAllRecipes: () => Promise<void>;
  restoreDemo: () => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<Partial<Recipe>[] | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const doExport = () => {
    const data = JSON.stringify(recipes, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lucias-rezepte.json"; a.click();
    URL.revokeObjectURL(url);
    toast("Export erfolgreich");
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        setImportPreview(items);
      } catch { toast("Ungültige JSON-Datei", "err"); }
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!importPreview) return;
    setBusy(true);
    try {
      await addRecipes(importPreview);
      toast(`${importPreview.length} Rezept${importPreview.length !== 1 ? "e" : ""} importiert`);
      setImportPreview(null);
    } catch { toast("Importfehler", "err"); }
    finally { setBusy(false); }
  };

  const doRestoreDemo = async () => {
    setBusy(true);
    try {
      await restoreDemo();
      toast("13 Demo-Rezepte wiederhergestellt");
    } catch { toast("Fehler", "err"); }
    finally { setBusy(false); }
  };

  const doDeleteAll = async () => {
    if (deleteConfirmText !== "LÖSCHEN") return;
    setBusy(true);
    try {
      await deleteAllRecipes();
      toast("Alle Rezepte gelöscht");
      setShowDeleteAll(false);
      setDeleteConfirmText("");
    } catch { toast("Fehler", "err"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {importPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] flex flex-col">
            <h3 className="font-serif text-lg font-semibold mb-2">Import-Vorschau</h3>
            <p className="text-sm text-muted-foreground mb-4">{importPreview.length} Rezept{importPreview.length !== 1 ? "e" : ""} gefunden:</p>
            <ul className="overflow-y-auto flex-1 space-y-1 mb-4">
              {importPreview.map((r, i) => (
                <li key={i} className="text-sm px-3 py-1.5 bg-gray-50 rounded-lg">{r.title ?? "Unbekannt"}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setImportPreview(null)}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
                Abbrechen
              </button>
              <button onClick={doImport} disabled={busy}
                className="flex-1 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Importieren
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAll && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
              <h3 className="font-serif text-lg font-semibold">Alle Rezepte löschen?</h3>
              <p className="text-sm text-muted-foreground mt-1">Diese Aktion kann nicht rückgängig gemacht werden!</p>
            </div>
            <p className="text-sm mb-2 font-medium">Tippe <strong>LÖSCHEN</strong> zur Bestätigung:</p>
            <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="LÖSCHEN" className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteAll(false); setDeleteConfirmText(""); }}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
                Abbrechen
              </button>
              <button onClick={doDeleteAll} disabled={deleteConfirmText !== "LÖSCHEN" || busy}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Alles löschen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-2">💾 Export</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {recipes.length} Rezepte als JSON-Datei herunterladen (vollständige Sicherung inkl. Zutaten und Schritte).
          </p>
          <button onClick={doExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors">
            <Download className="w-4 h-4" /> Alle exportieren (.json)
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-2">📥 Import</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Rezepte aus einer JSON-Datei importieren. Vorschau vor dem Hinzufügen.
          </p>
          <input ref={fileRef} type="file" accept=".json" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors">
            <Upload className="w-4 h-4" /> JSON-Datei auswählen
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-2">🔄 Demo-Rezepte wiederherstellen</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Die 13 Original-Rezepte erneut hinzufügen (bestehende Rezepte bleiben erhalten).
          </p>
          {!showRestoreConfirm ? (
            <button onClick={() => setShowRestoreConfirm(true)} disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60">
              <RefreshCw className="w-4 h-4" />
              Demo-Rezepte hinzufügen
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-amber-700 font-medium">13 Demo-Rezepte wirklich hinzufügen?</p>
              <button onClick={() => { setShowRestoreConfirm(false); doRestoreDemo(); }} disabled={busy}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Ja, hinzufügen"}
              </button>
              <button onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Abbrechen
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-2 text-red-700">⚠️ Alle Rezepte löschen</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Löscht <strong>alle {recipes.length} Rezepte</strong> unwiderruflich aus der Datenbank.
          </p>
          <button onClick={() => setShowDeleteAll(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
            <Trash2 className="w-4 h-4" /> Alle Rezepte löschen
          </button>
        </div>
      </div>
    </div>
  );
}

function AppSettings() {
  const [defaultView, setDefaultView] = useLocalStorage<"kacheln" | "tabelle">("lk_defaultView", "kacheln");
  const [sortOrder, setSortOrder] = useLocalStorage<string>("lk_sortOrder", "alphabetisch");
  const [showNotes, setShowNotes] = useLocalStorage<boolean>("lk_showNotes", true);
  const [showCookCount, setShowCookCount] = useLocalStorage<boolean>("lk_showCookCount", true);

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${value ? "bg-[#4A7C59]" : "bg-gray-300"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${value ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4">🖥️ Anzeigeeinstellungen</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Standardansicht (Rezepte-Tab)</label>
            <div className="flex gap-2">
              {(["kacheln", "tabelle"] as const).map((v) => (
                <button key={v} onClick={() => setDefaultView(v)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${defaultView === v ? "bg-[#4A7C59] text-white" : "bg-white border border-border hover:border-[#4A7C59]/40"}`}>
                  {v === "kacheln" ? "🃏 Kacheln" : "📋 Tabelle"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Sortierreihenfolge</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30">
              <option value="alphabetisch">Alphabetisch (A–Z)</option>
              <option value="kategorie">Nach Kategorie</option>
              <option value="bewertung">Nach Bewertung</option>
              <option value="zuletzt_gekocht">Zuletzt gekocht</option>
              <option value="haeufig_gekocht">Am häufigsten gekocht</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-1">🔀 Kartendarstellung</h3>
        <p className="text-sm text-muted-foreground mb-4">Gilt für die Kachelansicht in „Meine Rezepte".</p>
        <div>
          <Toggle value={showNotes} onChange={setShowNotes} label="Notizvorschau auf Karten anzeigen" />
          <Toggle value={showCookCount} onChange={setShowCookCount} label="Kochzähler auf Karten anzeigen" />
        </div>
      </div>

      <div className="sticky-note rounded-xl p-4 text-sm text-amber-900">
        <strong>📝 Hinweis:</strong> Die Einstellungen werden lokal in diesem Browser gespeichert und sind sofort aktiv.
      </div>
    </div>
  );
}

export default function Admin() {
  const { recipes, loading, error, refetch, patchRecipe, patchRecipeSilent, addRecipes, deleteAllRecipes, restoreDemo } = useRecipes();
  const [section, setSection] = useState<SectionTab>("categories");

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-lg">Wird geladen…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="font-serif text-lg text-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="w-6 h-6 text-[#4A7C59]" />
        <h2 className="font-serif text-2xl font-semibold text-foreground">Admin-Bereich</h2>
        <span className="ml-auto text-sm text-muted-foreground">{recipes.length} Rezepte</span>
      </div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {SECTION_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setSection(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              section === tab.id
                ? "bg-[#4A7C59] text-white shadow-sm"
                : "bg-white border border-border text-foreground hover:border-[#4A7C59]/40"
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {section === "categories" && (
        <CategoryManager recipes={recipes} patchRecipe={patchRecipe} patchRecipeSilent={patchRecipeSilent} refetch={refetch} />
      )}

      {section === "backup" && (
        <BackupSection
          recipes={recipes}
          addRecipes={addRecipes}
          deleteAllRecipes={deleteAllRecipes}
          restoreDemo={restoreDemo}
          refetch={refetch}
        />
      )}

      {section === "settings" && <AppSettings />}
    </div>
  );
}
