import { useState, useRef } from "react";
import { X, Upload, FileText, Check, Loader2, Bot, Brain } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractPdfRecipes } from "@/hooks/useRecipes";

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<number[]>;
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

export default function PdfUploadModal({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [extracted, setExtracted] = useState<Partial<Recipe>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modelUsed, setModelUsed] = useState<"openai" | "claude" | null>(null);
  const [sourceDocumentUrl, setSourceDocumentUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
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
        setSelected(new Set(recipes.map((_, i) => i)));
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

  const handleConfirm = async () => {
    const toAdd = extracted.filter((_, i) => selected.has(i));
    if (toAdd.length === 0) return;
    setStep("saving");
    try {
      const recipesWithSource = toAdd.map((r) => ({
        ...r,
        sourceDocumentUrl: sourceDocumentUrl ?? undefined,
      }));
      await onAdd(recipesWithSource);
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
                  <p className="text-sm text-muted-foreground mb-4">
                    {extracted.length} Rezept{extracted.length !== 1 ? "e" : ""} gefunden. Wähle aus, welche hinzugefügt werden sollen:
                  </p>
                  <ul className="space-y-2 mb-6">
                    {extracted.map((r, i) => (
                      <li
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selected.has(i)
                            ? "bg-[#4A7C59]/8 border-[#4A7C59]/30"
                            : "bg-white border-border"
                        }`}
                        onClick={() => toggleSelect(i)}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            selected.has(i)
                              ? "bg-[#4A7C59] border-[#4A7C59]"
                              : "border-border"
                          }`}
                        >
                          {selected.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground leading-snug">
                            {r.title ?? "Unbekanntes Rezept"}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {r.category && (
                              <span className="text-xs text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                                {r.category}
                              </span>
                            )}
                            {r.difficulty && (
                              <span className="text-xs text-muted-foreground">{r.difficulty}</span>
                            )}
                            {r.ingredients && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {r.ingredients.length} Zutaten
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirm}
                      disabled={selected.size === 0}
                      className="flex-1 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {selected.size} Rezept{selected.size !== 1 ? "e" : ""} hinzufügen
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
              <p className="font-serif text-xl text-foreground">Fertig!</p>
              <p className="text-sm text-muted-foreground">
                Die Rezepte wurden deiner Sammlung hinzugefügt.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
              >
                Schließen
              </button>
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
