import { useState, useRef } from "react";
import { X, Upload, Check, Loader2, Bot, Brain, ChevronDown, ChevronUp } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractPdfRecipes } from "@/hooks/useRecipes";

const VALID_CATEGORIES = ["Fisch", "Fleisch", "Pasta", "Vegetarisch", "Geflügel", "Sonstiges"];

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<number[]>;
  onOpenRecipe?: (id: number) => void;
}

type Step = "upload" | "loading" | "review" | "saving" | "done" | "error";

const MODEL_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  openai: {
    label: "ChatGPT (digitales PDF erkannt)",
    icon: <Bot className="w-3.5 h-3.5" />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  claude: {
    label: "Claude (Scan / Handschrift erkannt)",
    icon: <Brain className="w-3.5 h-3.5" />,
    color: "bg-violet-50 text-violet-700 border-violet-200",
  },
};

export default function PdfUploadModal({ onClose, onAdd, onOpenRecipe }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [extracted, setExtracted] = useState<Partial<Recipe>[]>([]);
  // Vorauswahl: LEER — bewusstes Anhaken statt bewusstes Abwählen
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [modelUsed, setModelUsed] = useState<"openai" | "claude" | null>(null);
  const [sourceDocumentUrl, setSourceDocumentUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [savedRecipeIds, setSavedRecipeIds] = useState<number[]>([]);
  const [savedTitles, setSavedTitles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Bitte nur PDF-Dateien hochladen.");
      setStep("error");
      return;
    }
    setStep("loading");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const { recipes, modelUsed: model, sourceDocumentUrl: srcUrl } = await extractPdfRecipes(base64);
        setExtracted(recipes);
        setModelUsed(model);
        setSourceDocumentUrl(srcUrl);
        // Keine Vorauswahl — Nutzer hakt bewusst an
        setSelected(new Set());
        // Bei einem Rezept: direkt aufgeklappt; bei mehreren: alle zugeklappt
        setExpandedItems(recipes.length === 1 ? new Set([0]) : new Set());
        setStep("review");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Extraktion fehlgeschlagen.");
        setStep("error");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleExpand = (i: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const updateExtracted = (i: number, field: string, value: string) => {
    setExtracted((prev) =>
      prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r)
    );
  };

  const handleConfirm = async () => {
    const toAdd = extracted
      .map((r, i) => ({ recipe: r, index: i }))
      .filter(({ index }) => selected.has(index))
      .map(({ recipe }) => ({
        ...recipe,
        sourceDocumentUrl: sourceDocumentUrl ?? undefined,
      }));
    if (toAdd.length === 0) return;
    const titles = toAdd.map((r) => r.title ?? "Unbekanntes Rezept");
    setStep("saving");
    try {
      const ids = await onAdd(toAdd);
      setSavedRecipeIds(ids);
      setSavedTitles(titles);
      setStep("done");
    } catch {
      setErrorMsg("Rezepte konnten nicht gespeichert werden.");
      setStep("error");
    }
  };

  const modelInfo = modelUsed ? MODEL_LABELS[modelUsed] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">📄 PDF hochladen</h2>
            <p className="text-green-200 text-xs mt-0.5">
              Rezepte aus einem PDF automatisch extrahieren
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* STEP: Upload */}
          {step === "upload" && (
            <div>
              <div
                className="border-2 border-dashed border-[#4A7C59]/40 rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-[#4A7C59]/70 hover:bg-[#4A7C59]/5 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload className="w-10 h-10 text-[#4A7C59]/60" />
                <div className="text-center">
                  <p className="font-semibold text-foreground">PDF hier ablegen</p>
                  <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-4">
                Digitale PDFs → ChatGPT · Gescannte / handschriftliche PDFs → Claude
              </p>
            </div>
          )}

          {/* STEP: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">KI analysiert das PDF…</p>
              <p className="text-sm text-muted-foreground">Das kann einen Moment dauern.</p>
            </div>
          )}

          {/* STEP: Review */}
          {step === "review" && (
            <div>
              {modelInfo && (
                <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border mb-4 ${modelInfo.color}`}>
                  {modelInfo.icon}
                  {modelInfo.label}
                </div>
              )}

              {extracted.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">🤷</p>
                  <p className="text-foreground font-serif text-lg">Keine Rezepte gefunden.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Versuche ein anderes PDF oder überprüfe den Inhalt.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    {extracted.length === 1
                      ? "Rezept prüfen und dann übernehmen:"
                      : `${extracted.length} Rezepte gefunden — Haken setzen um auszuwählen:`}
                  </p>

                  <ul className="space-y-3 mb-6">
                    {extracted.map((r, i) => {
                      const isSelected = selected.has(i);
                      const isExpanded = expandedItems.has(i);
                      const ingredients = r.ingredients ?? [];
                      const steps = r.steps ?? [];

                      return (
                        <li
                          key={i}
                          className={`rounded-xl border overflow-hidden transition-colors ${
                            isSelected
                              ? "border-[#4A7C59]/40 bg-[#4A7C59]/5"
                              : "border-border bg-white"
                          }`}
                        >
                          {/* Card header */}
                          <div className="flex items-start gap-3 p-3">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => toggleSelect(i)}
                              aria-label={isSelected ? "Abwählen" : "Auswählen"}
                              className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-[#4A7C59] border-[#4A7C59]"
                                  : "border-border bg-white hover:border-[#4A7C59]/60"
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </button>

                            {/* Titel (editierbar) */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={r.title ?? ""}
                                onChange={(e) => updateExtracted(i, "title", e.target.value)}
                                placeholder="Titel"
                                className="w-full text-sm font-semibold text-foreground bg-transparent border-0 border-b border-transparent focus:border-[#4A7C59]/40 focus:outline-none pb-0.5 transition-colors"
                              />
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {r.difficulty && (
                                  <span className="text-xs text-muted-foreground">{r.difficulty}</span>
                                )}
                                {(r.prepTime || r.totalTime) && (
                                  <span className="text-xs text-muted-foreground">
                                    {r.totalTime ?? r.prepTime}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Expand toggle */}
                            <button
                              type="button"
                              onClick={() => toggleExpand(i)}
                              className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={isExpanded ? "Einklappen" : "Vorschau anzeigen"}
                            >
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4" />
                                : <ChevronDown className="w-4 h-4" />
                              }
                            </button>
                          </div>

                          {/* Expanded body */}
                          {isExpanded && (
                            <div className="border-t border-border/60 px-3 pb-3 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>

                              {/* Bild */}
                              {(r.imageUrl || (r as { extractedImageUrl?: string | null }).extractedImageUrl) && (
                                <img
                                  src={(r.imageUrl ?? (r as { extractedImageUrl?: string | null }).extractedImageUrl)!}
                                  alt={r.title ?? "Rezeptbild"}
                                  className="w-full h-40 object-cover rounded-lg"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}

                              {/* Kategorie (editierbar) */}
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-muted-foreground w-20 flex-shrink-0">Kategorie</label>
                                <select
                                  value={VALID_CATEGORIES.includes(r.category ?? "") ? (r.category ?? "Sonstiges") : "Sonstiges"}
                                  onChange={(e) => updateExtracted(i, "category", e.target.value)}
                                  className="text-xs border border-border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                                >
                                  {VALID_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Zutaten */}
                              {ingredients.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                    Zutaten ({ingredients.length})
                                  </p>
                                  <div className="bg-white border border-border rounded-lg px-3 py-2 max-h-36 overflow-y-auto space-y-0.5">
                                    {ingredients.map((ing, j) => {
                                      const amount = (ing as { amount?: string }).amount;
                                      const unit = (ing as { unit?: string }).unit;
                                      const name = (ing as { name?: string }).name;
                                      return (
                                        <div key={j} className="text-xs text-foreground">
                                          {[amount, unit, name].filter(Boolean).join(" ")}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Zubereitungsschritte */}
                              {steps.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                    Zubereitung ({steps.length} Schritte)
                                  </p>
                                  <div className="bg-white border border-border rounded-lg px-3 py-2 max-h-48 overflow-y-auto space-y-2">
                                    {steps.map((step, j) => (
                                      <div key={j} className="text-xs text-foreground flex gap-2">
                                        <span className="text-[#4A7C59] font-semibold flex-shrink-0">{j + 1}.</span>
                                        <span>{step}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirm}
                      disabled={selected.size === 0}
                      className="flex-1 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      In meine Sammlung übernehmen
                      {selected.size > 0 && ` (${selected.size})`}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
                    >
                      Abbrechen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP: Saving */}
          {step === "saving" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">Rezepte werden gespeichert…</p>
            </div>
          )}

          {/* STEP: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-[#4A7C59]/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-[#4A7C59]" />
              </div>
              {savedTitles.length === 1 ? (
                <>
                  <p className="font-serif text-xl text-foreground">Gespeichert!</p>
                  <p className="text-sm text-foreground font-semibold px-4">
                    „{savedTitles[0]}"
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Das Rezept wurde deiner Sammlung hinzugefügt.
                  </p>
                  <div className="flex gap-3 mt-2">
                    {savedRecipeIds.length > 0 && onOpenRecipe && (
                      <button
                        onClick={() => { onClose(); onOpenRecipe(savedRecipeIds[0]); }}
                        className="px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                      >
                        Rezept öffnen
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
                    >
                      Fertig
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-serif text-xl text-foreground">Fertig!</p>
                  <p className="text-sm text-muted-foreground">
                    {savedTitles.length} Rezepte wurden deiner Sammlung hinzugefügt.
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-6 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                  >
                    Fertig
                  </button>
                </>
              )}
            </div>
          )}

          {/* STEP: Error */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-4xl">⚠️</p>
              <p className="font-serif text-lg text-foreground">Etwas ist schiefgelaufen</p>
              <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep("upload"); setErrorMsg(""); }}
                  className="px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                >
                  Nochmal versuchen
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
