import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Loader2, Trash2, Edit2, Download, Tag, RefreshCw,
  Upload, Check, AlertTriangle, Settings, Database, Sliders,
  X, Plus, ChevronsUpDown, Users, CheckCircle, XCircle, Clock, FolderOpen, Copy, RotateCcw, Images
} from "lucide-react";
import { AdminNeedBox, AdminActionCard } from "@/components/AdminUI";
import { useRecipes } from "@/hooks/useRecipes";
import { useAdminGroups, type AdminGroup } from "@/hooks/useGroups";
import type { Recipe } from "@/types/recipe";
import { SEASON_LABELS } from "@/types/recipe";
import BulkImportTab from "@/components/BulkImportTab";
import DuplicatesTab from "@/components/DuplicatesTab";
import { authHeaders } from "@/lib/authFetch";

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

const SECTION_TABS = [
  { id: "categories", label: "Kategorien", icon: Tag },
  { id: "groups", label: "Gruppen", icon: Users },
  { id: "duplicates", label: "Duplikate", icon: Copy },
  { id: "backup", label: "Backup & Import", icon: Database },
  { id: "bulk-import", label: "Massen-Import", icon: FolderOpen },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "recipe-images", label: "Rezeptbilder", icon: Upload },
  { id: "image-optimization", label: "Bildoptimierung", icon: RefreshCw },
  { id: "trash", label: "Papierkorb", icon: Trash2 },
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
      <AdminNeedBox>
        Ich möchte meine Rezepte in Themengruppen einteilen oder bestehende Gruppen umbenennen.
      </AdminNeedBox>

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

      <AdminActionCard
        title="➕ Neue Kategorie erstellen"
        description="Das Programm legt eine neue Themengruppe an. Du kannst ihr danach Rezepte zuweisen."
      >
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
      </AdminActionCard>

      <AdminActionCard
        title="🗂️ Kategorien umbenennen oder löschen"
        description="Das Programm zeigt alle vorhandenen Themengruppen. Du kannst sie umbenennen – alle Rezepte darin werden automatisch angepasst. Beim Löschen einer Gruppe mit Rezepten fragt das Programm, wohin die Rezepte verschoben werden sollen."
      >
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
      </AdminActionCard>

      <AdminActionCard
        title="🔀 Kategorien zusammenführen"
        description="Das Programm verschiebt alle Rezepte aus der Quell-Kategorie in die Ziel-Kategorie. Die Quell-Kategorie wird danach automatisch entfernt."
      >
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
      </AdminActionCard>
    </div>
  );
}

function BackupSection({
  recipes,
  totalCount,
  addRecipes,
  deleteAllRecipes,
  restoreDemo,
  refetch,
}: {
  recipes: Recipe[];
  totalCount?: number | null;
  addRecipes: (r: Partial<Recipe>[]) => Promise<void>;
  deleteAllRecipes: () => Promise<void>;
  restoreDemo: () => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const displayCount = totalCount ?? recipes.length;
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

  const doExportExcel = () => {
    const recipesSheet = recipes.map((r) => ({
      Name: r.title,
      Beschreibung: r.notes ?? "",
      Kategorie: r.category ?? "",
      Portionen: r.servings ?? "",
      Vorbereitungszeit: r.prepTime ?? "",
      Gesamtzeit: r.totalTime ?? "",
      Tags: Array.isArray(r.seasons) ? r.seasons.map((s) => SEASON_LABELS[s] ?? s).join(", ") : "",
    }));

    const ingredientsSheet: { Rezept: string; Zutat: string; Menge: string; Einheit: string }[] = [];
    for (const r of recipes) {
      if (Array.isArray(r.ingredients)) {
        for (const ing of r.ingredients) {
          ingredientsSheet.push({
            Rezept: r.title,
            Zutat: ing.name ?? "",
            Menge: ing.amount ?? "",
            Einheit: ing.unit ?? "",
          });
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recipesSheet), "Rezepte");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingredientsSheet), "Zutaten");
    XLSX.writeFile(wb, "lucias-rezepte.xlsx");
    toast("Excel-Export erfolgreich");
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
      <AdminNeedBox>
        Ich möchte meine Rezepte sichern oder Daten aus einer früheren Sicherung wiederherstellen.
      </AdminNeedBox>

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
        <AdminActionCard
          title="💾 Rezepte exportieren"
          description={`Das Programm erstellt eine Datei mit allen ${displayCount} Rezepten (inkl. Zutaten und Zubereitungsschritte) zum Herunterladen. Diese Datei kannst du als Sicherung aufbewahren oder auf einem anderen Gerät wieder einlesen.`}
        >
          <div className="flex flex-wrap gap-2">
            <button onClick={doExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors">
              <Download className="w-4 h-4" /> Alle exportieren (.json)
            </button>
            <button onClick={doExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors">
              <Download className="w-4 h-4" /> Alle exportieren (.xlsx)
            </button>
          </div>
        </AdminActionCard>

        <AdminActionCard
          title="📥 Rezepte importieren"
          description="Das Programm liest eine zuvor exportierte JSON-Datei ein und zeigt dir zuerst eine Vorschau der gefundenen Rezepte. Erst nach deiner Bestätigung werden sie gespeichert."
        >
          <input ref={fileRef} type="file" accept=".json" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors">
            <Upload className="w-4 h-4" /> JSON-Datei auswählen
          </button>
        </AdminActionCard>

        <AdminActionCard
          title="🔄 Demo-Rezepte wiederherstellen"
          description="Das Programm fügt die 13 Original-Beispielrezepte erneut hinzu. Deine eigenen Rezepte bleiben dabei unverändert erhalten."
        >
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
        </AdminActionCard>

        <AdminActionCard
          title="⚠️ Alle Rezepte löschen"
          description={`Das Programm löscht alle ${displayCount} Rezepte unwiderruflich aus der Datenbank. Diese Aktion kann nicht rückgängig gemacht werden – sichere deine Daten vorher mit dem Export.`}
          variant="danger"
        >
          <button onClick={() => setShowDeleteAll(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
            <Trash2 className="w-4 h-4" /> Alle Rezepte löschen
          </button>
        </AdminActionCard>
      </div>
    </div>
  );
}

function GroupsAdmin() {
  const { groups, loading, error, approveGroup, rejectGroup } = useAdminGroups();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = groups.filter((g) => g.status === "pending");
  const approved = groups.filter((g) => g.status === "approved");
  const rejected = groups.filter((g) => g.status === "rejected");

  const handleApprove = async (id: number) => {
    setBusy(true);
    try {
      await approveGroup(id);
      toast("Gruppe freigegeben ✓");
    } catch {
      toast("Fehler bei der Freigabe", "err");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (id: number) => {
    setBusy(true);
    try {
      await rejectGroup(id, rejectReason.trim() || undefined);
      toast("Gruppe abgelehnt");
      setRejectingId(null);
      setRejectReason("");
    } catch {
      toast("Fehler beim Ablehnen", "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 text-center py-8">{error}</p>;
  }

  const GroupCard = ({ group, showActions }: { group: AdminGroup; showActions: boolean }) => (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 border border-border/50">
      {group.imageUrl ? (
        <img src={group.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
          <Users className="w-6 h-6 text-[#4A7C59]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{group.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          Erstellt von {group.creatorName ?? "Unbekannt"} ({group.creatorEmail ?? ""})
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(group.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
        {group.rejectionReason && (
          <p className="text-xs text-red-600 mt-1">Ablehnungsgrund: {group.rejectionReason}</p>
        )}
      </div>
      {showActions && (
        <div className="flex flex-col gap-2 flex-shrink-0">
          {rejectingId === group.id ? (
            <div className="space-y-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ablehnungsgrund (optional)"
                className="w-48 px-2 py-1.5 text-xs rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => handleReject(group.id)}
                  disabled={busy}
                  className="flex-1 px-2 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                  Ablehnen
                </button>
                <button
                  onClick={() => { setRejectingId(null); setRejectReason(""); }}
                  className="px-2 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => handleApprove(group.id)}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#4A7C59] text-white text-xs rounded-lg font-medium hover:bg-[#3d6849] transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-3 h-3" /> Freigeben
              </button>
              <button
                onClick={() => { setRejectingId(group.id); setRejectReason(""); }}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" /> Ablehnen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminNeedBox>
        Ich möchte Familienmitglieder oder Freunde einladen, gemeinsam Rezepte zu verwalten.
      </AdminNeedBox>

      <AdminActionCard
        title="➕ Gruppe anlegen"
        description={'Das Programm legt eine neue Gruppe an, sobald ein Nutzer sie im Bereich "Meine Küche" beantragt. Neue Gruppenanfragen erscheinen weiter unten unter "Ausstehende Anfragen" und warten auf deine Freigabe.'}
      />

      <AdminActionCard
        title="📨 Mitglieder einladen"
        description={'Das Programm ermöglicht es dem Gruppenersteller, weitere Personen über ihren Nutzernamen oder ihre E-Mail-Adresse einzuladen. Die Einladung kann direkt in der Gruppenansicht unter "Meine Küche" verschickt werden.'}
      />

      <AdminActionCard
        title="🚪 Mitglieder entfernen"
        description={'Das Programm gibt dem Gruppenadministrator die Möglichkeit, einzelne Mitglieder aus der Gruppe zu entfernen. Diese Funktion ist in der Gruppenansicht unter "Meine Küche" verfügbar.'}
      />

      <AdminActionCard
        title="✏️ Gruppe umbenennen"
        description={'Das Programm erlaubt dem Gruppenadministrator, den Namen der Gruppe jederzeit zu ändern. Die Umbenennung ist in den Gruppeneinstellungen unter "Meine Küche" möglich.'}
      />

      <AdminActionCard
        title="⏳ Ausstehende Anfragen"
        description="Das Programm zeigt alle Gruppenanfragen, die noch nicht bearbeitet wurden. Du kannst jede einzeln freigeben oder ablehnen – erst nach der Freigabe können die Mitglieder gemeinsam Rezepte sehen."
      >
        {pending.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-100 px-3 py-1 rounded-xl inline-block mb-3 font-semibold">{pending.length} ausstehend</p>
        )}
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Keine ausstehenden Anfragen.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((g) => <GroupCard key={g.id} group={g} showActions={true} />)}
          </div>
        )}
      </AdminActionCard>

      <AdminActionCard
        title="✅ Freigegebene Gruppen"
        description="Das Programm listet alle aktiven Gruppen auf. Mitglieder dieser Gruppen können gemeinsam Rezepte sehen und bearbeiten."
      >
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Noch keine freigegebenen Gruppen.</p>
        ) : (
          <div className="space-y-3">
            {approved.map((g) => <GroupCard key={g.id} group={g} showActions={false} />)}
          </div>
        )}
      </AdminActionCard>

      <AdminActionCard
        title="❌ Abgelehnte Gruppen"
        description="Das Programm listet alle abgelehnten Gruppenanfragen auf. Diese Gruppen sind nicht aktiv."
        variant="danger"
      >
        {rejected.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Keine abgelehnten Gruppen.</p>
        ) : (
          <div className="space-y-3">
            {rejected.map((g) => <GroupCard key={g.id} group={g} showActions={false} />)}
          </div>
        )}
      </AdminActionCard>
    </div>
  );
}

type TrashedRecipe = {
  id: number;
  title: string;
  deletedAt: string;
  daysLeft: number;
  createdBy: number | null;
  ownerDisplayName: string | null;
};

function TrashTab() {
  const [items, setItems] = useState<TrashedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "empty" | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes/trash", { headers: authHeaders() });
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setItems(data);
    } catch {
      setError("Papierkorb konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const restore = async (id: number) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/recipes/${id}/restore`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error();
      toast("Rezept wiederhergestellt");
      await fetchTrash();
    } catch {
      toast("Fehler beim Wiederherstellen", "err");
    } finally {
      setBusy(null);
    }
  };

  const permanentDelete = async (id: number) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/recipes/${id}/permanent`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error();
      toast("Rezept endgültig gelöscht");
      await fetchTrash();
    } catch {
      toast("Fehler beim Löschen", "err");
    } finally {
      setBusy(null);
    }
  };

  const emptyTrash = async () => {
    setBusy("empty");
    try {
      const res = await fetch("/api/recipes/trash", { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error();
      toast("Papierkorb geleert");
      setConfirmEmpty(false);
      await fetchTrash();
    } catch {
      toast("Fehler beim Leeren des Papierkorbs", "err");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-border shadow-sm p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="font-serif text-base font-semibold mb-1">{error}</p>
        <button onClick={fetchTrash} className="mt-4 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors flex items-center gap-2 mx-auto">
          <RefreshCw className="w-4 h-4" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminNeedBox>
        Ich habe Rezepte gelöscht und möchte sie wiederherstellen oder endgültig entfernen.
      </AdminNeedBox>

      {confirmEmpty && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-2" />
              <h3 className="font-serif text-lg font-semibold">Papierkorb leeren?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Alle {items.length} Rezept{items.length !== 1 ? "e" : ""} werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmEmpty(false)}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
                Abbrechen
              </button>
              <button onClick={emptyTrash} disabled={busy === "empty"}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === "empty" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Alles löschen
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminActionCard
        title="🗑️ Gelöschte Rezepte"
        description="Wenn du ein Rezept löschst, landet es hier – und bleibt noch 30 Tage erhalten. In dieser Zeit kannst du es mit einem Klick zurückbringen. Danach wird es automatisch endgültig gelöscht."
      >
        <div className="flex gap-2 mb-4">
          <button onClick={fetchTrash}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
          {items.length > 0 && (
            <button onClick={() => setConfirmEmpty(true)} disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Papierkorb leeren
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Trash2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Der Papierkorb ist leer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Rezept</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Ersteller</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Gelöscht am</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Verbleibend</th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 font-medium">{item.title}</td>
                    <td className="py-3 px-3 text-muted-foreground hidden sm:table-cell">
                      {item.ownerDisplayName ?? "Unbekannt"}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground hidden md:table-cell">
                      {new Date(item.deletedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.daysLeft <= 5 ? "bg-red-100 text-red-700" :
                        item.daysLeft <= 10 ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        <Clock className="w-3 h-3" />
                        {item.daysLeft} Tag{item.daysLeft !== 1 ? "e" : ""}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => restore(item.id)}
                          disabled={busy !== null}
                          title="Wiederherstellen"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4A7C59] text-white rounded-lg text-xs font-medium hover:bg-[#3d6849] transition-colors disabled:opacity-50">
                          {busy === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Wiederherstellen
                        </button>
                        <button
                          onClick={() => permanentDelete(item.id)}
                          disabled={busy !== null}
                          title="Endgültig löschen"
                          className="flex items-center gap-1.5 px-2 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                          {busy === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminActionCard>
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
      <AdminNeedBox>
        Ich möchte grundlegende Einstellungen der App anpassen, damit sie zu meiner Arbeitsweise passt.
      </AdminNeedBox>

      <AdminActionCard
        title="🖥️ Ansicht beim Starten"
        description="Das Programm merkt sich, wie Rezepte standardmäßig angezeigt werden sollen – als Kacheln mit Vorschaubild oder als übersichtliche Tabelle. Außerdem kannst du die Reihenfolge festlegen, in der Rezepte erscheinen."
      >
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
      </AdminActionCard>

      <AdminActionCard
        title="🃏 Was auf den Rezeptkarten steht"
        description="Das Programm zeigt auf jeder Rezeptkarte kleine Zusatzinfos an. Hier kannst du bestimmen, welche davon sichtbar sind."
      >
        <div>
          <Toggle value={showNotes} onChange={setShowNotes} label="Notizvorschau auf Karten anzeigen" />
          <Toggle value={showCookCount} onChange={setShowCookCount} label="Kochzähler auf Karten anzeigen" />
        </div>
      </AdminActionCard>

      <div className="sticky-note rounded-xl p-4 text-sm text-amber-900">
        <strong>📝 Hinweis:</strong> Die Einstellungen werden lokal in diesem Browser gespeichert und sind sofort aktiv.
      </div>
    </div>
  );
}

function useRecipeCount() {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/recipes/count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCount(data.count);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}

function RecipeCountBadge() {
  const { count, loading } = useRecipeCount();
  if (loading) return <span className="ml-auto text-sm text-muted-foreground">Lade…</span>;
  return <span className="ml-auto text-sm text-muted-foreground">{count ?? "?"} Rezepte</span>;
}

function CategoryManagerWithData() {
  const { recipes, loading, error, refetch, patchRecipe, patchRecipeSilent } = useRecipes();

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-border shadow-sm p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="font-serif text-base font-semibold mb-1">Kategorien konnten nicht geladen werden</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button onClick={() => refetch()} className="px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors flex items-center gap-2 mx-auto">
          <RefreshCw className="w-4 h-4" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <CategoryManager recipes={recipes} patchRecipe={patchRecipe} patchRecipeSilent={patchRecipeSilent} refetch={refetch} />
  );
}

function BackupSectionWithData() {
  const { recipes, loading, error, refetch, addRecipes, deleteAllRecipes, restoreDemo } = useRecipes();
  const { count: totalCount, refetch: refetchCount } = useRecipeCount();

  const handleRefetch = useCallback(async () => {
    await refetch();
    await refetchCount();
  }, [refetch, refetchCount]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-border shadow-sm p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="font-serif text-base font-semibold mb-1">Backup-Daten konnten nicht geladen werden</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button onClick={() => handleRefetch()} className="px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors flex items-center gap-2 mx-auto">
          <RefreshCw className="w-4 h-4" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <BackupSection
      recipes={recipes}
      totalCount={totalCount}
      addRecipes={addRecipes}
      deleteAllRecipes={deleteAllRecipes}
      restoreDemo={restoreDemo}
      refetch={handleRefetch}
    />
  );
}

function TagsAdmin() {
  const [status, setStatus] = useState<{ total: number; withTags: number; withoutTags: number; coverage: number } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number; failed: number } | null>(null);
  const [forceAll, setForceAll] = useState(false);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/admin/recipes/tags-status", { headers: authHeaders() });
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const startBackfill = async () => {
    setRunning(true);
    setProgress(null);
    try {
      const res = await fetch("/api/admin/recipes/generate-tags", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ forceAll }),
      });
      if (!res.ok || !res.body) throw new Error("Anfrage fehlgeschlagen");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.processed != null) setProgress({ processed: parsed.processed, total: parsed.total, failed: parsed.failed });
          } catch {}
        }
      }
      toast("Tags erfolgreich generiert!");
      await fetchStatus();
    } catch {
      toast("Fehler beim Generieren der Tags", "err");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminNeedBox>
        Ich möchte, dass meine Rezepte automatisch mit Stichwörtern versehen werden (z.B. Jahreszeit, Diät), damit ich sie leichter finden kann.
      </AdminNeedBox>

      <AdminActionCard
        title="📊 Aktueller Stand der Tags"
        description="Das Programm zeigt dir, wie viele deiner Rezepte bereits Stichwörter haben und wie viele noch keine besitzen."
      >
        <div className="flex justify-end mb-2">
          <button onClick={fetchStatus} disabled={loadingStatus} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <RefreshCw className={["w-4 h-4 text-muted-foreground", loadingStatus ? "animate-spin" : ""].join(" ")} />
          </button>
        </div>
        {status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-secondary rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-[#4A7C59] rounded-full transition-all"
                  style={{ width: `${status.coverage}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-[#4A7C59]">{status.coverage}%</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-secondary rounded-xl p-3">
                <div className="text-xl font-semibold text-foreground">{status.total}</div>
                <div className="text-xs text-muted-foreground">Gesamt</div>
              </div>
              <div className="bg-[#4A7C59]/10 rounded-xl p-3">
                <div className="text-xl font-semibold text-[#4A7C59]">{status.withTags}</div>
                <div className="text-xs text-muted-foreground">Mit Tags</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="text-xl font-semibold text-amber-700">{status.withoutTags}</div>
                <div className="text-xs text-muted-foreground">Ohne Tags</div>
              </div>
            </div>
          </div>
        ) : loadingStatus ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <p className="text-sm text-muted-foreground">Status konnte nicht geladen werden.</p>
        )}
      </AdminActionCard>

      <AdminActionCard
        title="🏷️ Tags automatisch vergeben"
        description={'Das Programm liest jeden Rezepttitel und die Zutaten und vergibt passende Stichwörter – z.B. "Sommer", "vegetarisch" oder "schnell". Standardmäßig werden nur Rezepte ohne Tags verarbeitet. Mit der Option darunter kannst du alle Rezepte neu beschriften.'}
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forceAll}
              onChange={(e) => setForceAll(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Alle Rezepte neu beschriften (auch wenn bereits Tags vorhanden sind)</span>
          </label>
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.processed} / {progress.total} verarbeitet</span>
                {progress.failed > 0 && <span className="text-amber-600">{progress.failed} fehlgeschlagen</span>}
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="h-full bg-[#4A7C59] rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={startBackfill}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
            {running ? "Generiert…" : "Tags generieren"}
          </button>
        </div>
      </AdminActionCard>
    </div>
  );
}

type RecipeWithoutImage = { id: number; title: string; category: string; createdAt: string | null; photoCount: number };

function RecipeImagesTab() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number; errors: number } | null>(null);

  const [recipes, setRecipes] = useState<RecipeWithoutImage[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const loadRecipes = useCallback(() => {
    setLoadingRecipes(true);
    setLoadError(false);
    fetch("/api/admin/recipes-without-images", { headers: { ...authHeaders() } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: RecipeWithoutImage[]) => { setRecipes(data); setLoadingRecipes(false); })
      .catch(() => { setLoadingRecipes(false); setLoadError(true); });
  }, []);

  useEffect(() => { loadRecipes(); }, [loadRecipes]);

  const categories = Array.from(new Set(recipes.map((r) => r.category))).sort();
  const filteredRecipes = categoryFilter === "all" ? recipes : recipes.filter((r) => r.category === categoryFilter);

  const allFilteredSelected = filteredRecipes.length > 0 && filteredRecipes.every((r) => selectedIds.has(r.id));

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredRecipes.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const deselectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredRecipes.forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const runSSE = async (url: string, init: RequestInit) => {
    setStatus("running");
    setProgress({ done: 0, total: 0, errors: 0 });

    let succeeded = false;
    try {
      const res = await fetch(url, init);
      if (!res.ok) { setStatus("error"); return; }

      const reader = res.body?.getReader();
      if (!reader) { setStatus("error"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { setStatus("error"); return; }
              setProgress({ done: data.done ?? 0, total: data.total ?? 0, errors: data.errors ?? 0 });
              if (data.finished) { succeeded = true; setStatus("done"); return; }
            } catch {}
          }
        }
      }
      setStatus("done");
    } catch {
      setStatus("error");
    } finally {
      if (succeeded) {
        setSelectedIds(new Set());
        loadRecipes();
      }
    }
  };

  const startBackfill = () => runSSE("/api/admin/generate-recipe-images", {
    method: "POST",
    headers: { ...authHeaders() },
  });

  const startSelected = () => runSSE("/api/admin/generate-recipe-images/selected", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ids: Array.from(selectedIds) }),
  });

  const startPhotoExtraction = () => runSSE("/api/admin/extract-recipe-images", {
    method: "POST",
    headers: { ...authHeaders() },
  });

  return (
    <div className="space-y-6">
      <AdminNeedBox>
        Manche Rezepte haben noch kein Foto – ich möchte das beheben.
      </AdminNeedBox>

    <AdminActionCard
      title="🤖 KI-Bild generieren lassen"
      description="Das Programm erstellt automatisch ein passendes Foto für jedes Rezept ohne Bild – auf Basis des Rezeptnamens. Du kannst einzelne Rezepte auswählen oder alle auf einmal verarbeiten lassen. Neue Rezepte erhalten automatisch ein Bild; diese Funktion ist für ältere Rezepte gedacht."
    >

      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-foreground">
            <span>{progress.done} von {progress.total} fertig</span>
            {progress.errors > 0 && (
              <span className="text-red-600 font-medium">{progress.errors} Fehler</span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-[#f5ede0] rounded-full h-2">
              <div
                className="bg-[#4A7C59] h-2 rounded-full transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          )}
          {status === "done" && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-[#4A7C59] font-medium">
                <Check className="w-4 h-4" /> Fertig! Alle Rezepte wurden verarbeitet.
              </div>
              <button
                onClick={() => setStatus("idle")}
                className="text-xs px-3 py-1 rounded-lg border border-[#4A7C59] text-[#4A7C59] hover:bg-[#4A7C59]/10 transition-colors"
              >
                Neue Auswahl
              </button>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
              <AlertTriangle className="w-4 h-4" /> Fehler bei der Bildgenerierung.
            </div>
          )}
        </div>
      )}

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-secondary/50 px-4 py-3 flex flex-wrap items-center gap-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            {loadingRecipes ? "Lade Rezepte…" : `${recipes.length} Rezepte ohne Bild`}
          </span>

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
            >
              <option value="all">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <div className="flex gap-2 ml-auto">
            <button
              onClick={selectAll}
              disabled={status === "running" || allFilteredSelected}
              className="text-xs px-3 py-1 rounded-lg border border-[#4A7C59] text-[#4A7C59] hover:bg-[#4A7C59]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Alle auswählen
            </button>
            <button
              onClick={deselectAll}
              disabled={status === "running" || selectedIds.size === 0}
              className="text-xs px-3 py-1 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Auswahl aufheben
            </button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {loadingRecipes ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Wird geladen…
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" /> Rezepte konnten nicht geladen werden.
              <button onClick={loadRecipes} className="underline hover:no-underline ml-1">Erneut versuchen</button>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Keine Rezepte ohne Bild gefunden.
            </div>
          ) : (
            filteredRecipes.map((recipe) => (
              <label key={recipe.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(recipe.id)}
                  readOnly
                  onClick={(e) => { e.stopPropagation(); if (status !== "running") toggleOne(recipe.id); }}
                  disabled={status === "running"}
                  className="w-4 h-4 accent-[#4A7C59] cursor-pointer"
                />
                <span className="flex-1 text-sm text-foreground truncate">{recipe.title}</span>
                {recipe.photoCount > 0 && (
                  <span className="text-xs text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full shrink-0">
                    {recipe.photoCount} {recipe.photoCount === 1 ? "Foto" : "Fotos"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full shrink-0">{recipe.category}</span>
                {recipe.createdAt && (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {new Date(recipe.createdAt).toLocaleDateString("de-DE")}
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={startSelected}
          disabled={status === "running" || selectedIds.size === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "running" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Bilder werden generiert…
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {selectedIds.size > 0 ? `${selectedIds.size} ausgewählte generieren` : "Ausgewählte generieren"}
            </>
          )}
        </button>

        <button
          onClick={startBackfill}
          disabled={status === "running"}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-border text-foreground rounded-xl text-sm font-semibold hover:border-[#4A7C59]/40 hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          Alle generieren
        </button>
      </div>
    </AdminActionCard>

    <AdminActionCard
      title="📷 Vorhandene Kochfotos als Hauptbild nutzen"
      description="Das Programm durchsucht alle Rezepte nach bereits hochgeladenen Kochfotos und setzt das erste gefundene Foto als Hauptbild – auch wenn bereits ein automatisch erstelltes Bild vorhanden ist. Nützlich, wenn beim Scannen eigene Fotos erkannt wurden."
    >
      <button
        onClick={startPhotoExtraction}
        disabled={status === "running"}
        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#4A7C59]/40 text-[#4A7C59] rounded-xl text-sm font-semibold hover:bg-[#4A7C59]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Images className="w-4 h-4" />
        Vorhandene Fotos nutzen
      </button>
    </AdminActionCard>
    </div>
  );
}

function ImageOptimizationTab() {
  const [stats, setStats] = useState<{ total: number; totalSizeBytes: number | null } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number; errors: number } | null>(null);

  const loadStats = useCallback(() => {
    setLoadingStats(true);
    setStatsError(false);
    fetch("/api/admin/image-stats", { headers: { ...authHeaders() } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setStats(data); setLoadingStats(false); })
      .catch(() => { setLoadingStats(false); setStatsError(true); });
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const startOptimization = async () => {
    setStatus("running");
    setProgress({ done: 0, total: stats?.total ?? 0, errors: 0 });

    try {
      const res = await fetch("/api/admin/optimize-existing-images", {
        method: "POST",
        headers: { ...authHeaders() },
      });
      if (!res.ok) { setStatus("error"); return; }

      const reader = res.body?.getReader();
      if (!reader) { setStatus("error"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { setStatus("error"); return; }
              setProgress({ done: data.done ?? 0, total: data.total ?? 0, errors: data.errors ?? 0 });
              if (data.finished) { setStatus("done"); loadStats(); return; }
            } catch {}
          }
        }
      }
      setStatus("done");
      loadStats();
    } catch {
      setStatus("error");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <AdminNeedBox>
        Meine Rezeptbilder verbrauchen viel Speicherplatz – ich möchte das reduzieren.
      </AdminNeedBox>

    <AdminActionCard
      title="🗜️ Bilder verkleinern"
      description="Das Programm wandelt alle automatisch erzeugten Rezeptbilder in ein kompaktes Format um (PNG → WebP). Die Bilder bleiben dabei genauso scharf, belegen aber deutlich weniger Speicherplatz. Manuell hochgeladene Fotos werden dabei nicht verändert."
    >

      <div className="bg-secondary/40 rounded-xl p-4 space-y-2">
        <div className="text-sm font-medium text-foreground mb-3">Aktuelle Statistiken</div>
        {loadingStats ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Wird geladen…
          </div>
        ) : statsError ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="w-4 h-4" /> Statistiken konnten nicht geladen werden.
            <button onClick={loadStats} className="underline hover:no-underline ml-1">Erneut versuchen</button>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground mb-1">Bilder im Object Storage</div>
              <div className="text-2xl font-semibold text-foreground">{stats.total}</div>
            </div>
            <div className="bg-white rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground mb-1">Geschätzte Gesamtgröße</div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.totalSizeBytes != null ? formatBytes(stats.totalSizeBytes) : "–"}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-foreground">
            <span>{progress.done} von {progress.total} verarbeitet</span>
            {progress.errors > 0 && (
              <span className="text-red-600 font-medium">{progress.errors} Fehler</span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-[#f5ede0] rounded-full h-2">
              <div
                className="bg-[#4A7C59] h-2 rounded-full transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          )}
          {status === "done" && (
            <div className="flex items-center gap-2 text-sm text-[#4A7C59] font-medium">
              <Check className="w-4 h-4" /> Fertig! Alle Bilder wurden optimiert.
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
              <AlertTriangle className="w-4 h-4" /> Fehler bei der Bildoptimierung.
            </div>
          )}
        </div>
      )}

      <button
        onClick={startOptimization}
        disabled={status === "running" || (stats?.total ?? 0) === 0}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "running" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Optimierung läuft…
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            {stats?.total ? `${stats.total} Bilder optimieren` : "Optimierung starten"}
          </>
        )}
      </button>
    </AdminActionCard>
    </div>
  );
}

export default function Admin({ initialTab, navToken, onTabInitialized }: { initialTab?: string; navToken?: number; onTabInitialized?: () => void }) {
  const validTabs = SECTION_TABS.map((t) => t.id);
  const resolvedTab: SectionTab = (validTabs.includes(initialTab as SectionTab) ? initialTab : "categories") as SectionTab;
  const [section, setSection] = useState<SectionTab>(resolvedTab);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [pendingTab, setPendingTab] = useState<SectionTab | null>(null);

  const handleTabClick = (tabId: SectionTab) => {
    if (tabId === section) return;
    if (isBulkUploading && section === "bulk-import") {
      setPendingTab(tabId);
      return;
    }
    setSection(tabId);
  };

  const confirmNavigation = () => {
    if (pendingTab) {
      setSection(pendingTab);
      setPendingTab(null);
    }
  };

  const cancelNavigation = () => {
    setPendingTab(null);
  };

  useEffect(() => {
    if (navToken && initialTab && validTabs.includes(initialTab as SectionTab)) {
      if (isBulkUploading && section === "bulk-import") {
        setPendingTab(initialTab as SectionTab);
      } else {
        setSection(initialTab as SectionTab);
        onTabInitialized?.();
      }
    }
  }, [navToken]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      {pendingTab && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <Upload className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <h3 className="font-serif text-lg font-semibold">Upload läuft</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Wirklich verlassen? Der aktuelle Upload-Fortschritt geht verloren.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={cancelNavigation}
                className="flex-1 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition-colors font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmNavigation}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Trotzdem verlassen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center gap-3">
        <Settings className="w-6 h-6 text-[#4A7C59]" />
        <h2 className="font-serif text-2xl font-semibold text-foreground">Admin-Bereich</h2>
        <RecipeCountBadge />
      </div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {SECTION_TABS.map((tab) => (
          <button key={tab.id} onClick={() => handleTabClick(tab.id)}
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

      {section === "categories" && <CategoryManagerWithData />}

      {section === "groups" && <GroupsAdmin />}

      {section === "duplicates" && <DuplicatesTab />}

      {section === "backup" && <BackupSectionWithData />}

      {section === "bulk-import" && <BulkImportTab onUploadingChange={setIsBulkUploading} />}

      {section === "tags" && <TagsAdmin />}

      {section === "recipe-images" && <RecipeImagesTab />}

      {section === "image-optimization" && <ImageOptimizationTab />}

      {section === "trash" && <TrashTab />}

      {section === "settings" && <AppSettings />}
    </div>
  );
}
