import { useState, useRef, useEffect } from "react";
import { X, Camera, ImageIcon, FileText, Check, Loader2, Bot } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractImageRecipes } from "@/hooks/useRecipes";

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<void>;
}

type Step = "upload" | "loading" | "review" | "saving" | "done" | "error";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function ImageImportModal({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [extracted, setExtracted] = useState<Partial<Recipe>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleClose = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  };

  const handleFile = async (file: File) => {
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME.includes(mimeType)) {
      setErrorMsg("Bitte nur JPEG-, PNG-, WebP- oder GIF-Bilder hochladen.");
      setStep("error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg("Das Bild ist zu groß. Bitte wähle ein Bild unter 20 MB.");
      setStep("error");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setStep("loading");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const { recipes } = await extractImageRecipes(base64, mimeType);
        setExtracted(recipes);
        setSelected(new Set(recipes.map((_, i) => i)));
        setStep("review");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Extraktion fehlgeschlagen.");
        setStep("error");
      }
    };
    reader.onerror = () => {
      setErrorMsg("Bild konnte nicht gelesen werden.");
      setStep("error");
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
      await onAdd(toAdd);
      setStep("done");
    } catch {
      setErrorMsg("Rezepte konnten nicht gespeichert werden.");
      setStep("error");
    }
  };

  const reset = () => {
    setStep("upload");
    setErrorMsg("");
    setExtracted([]);
    setSelected(new Set());
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">📷 Foto importieren</h2>
            <p className="text-green-200 text-xs mt-0.5">
              Rezept aus Foto oder Kamera automatisch erkennen
            </p>
          </div>
          <button onClick={handleClose} aria-label="Schließen" className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* STEP: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Drag & drop zone */}
              <div
                className="border-2 border-dashed border-[#4A7C59]/40 rounded-xl p-8 flex flex-col items-center gap-4 cursor-pointer hover:border-[#4A7C59]/70 hover:bg-[#4A7C59]/5 transition-colors"
                onClick={() => galleryRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <ImageIcon className="w-10 h-10 text-[#4A7C59]/60" />
                <div className="text-center">
                  <p className="font-semibold text-foreground">Bild hier ablegen</p>
                  <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen</p>
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              {/* Camera button */}
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#4A7C59]/40 text-[#4A7C59] rounded-xl text-sm font-semibold hover:bg-[#4A7C59]/8 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Foto aufnehmen (Kamera)
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              <p className="text-xs text-muted-foreground text-center">
                GPT-4o Vision erkennt gedruckte und handgeschriebene Rezepte · JPEG, PNG, WebP bis 20 MB
              </p>
            </div>
          )}

          {/* STEP: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-12">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Vorschau"
                  className="w-32 h-32 object-cover rounded-xl shadow-md mb-2"
                />
              )}
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">KI analysiert das Foto…</p>
              <p className="text-sm text-muted-foreground">Das kann einen Moment dauern.</p>
            </div>
          )}

          {/* STEP: Review */}
          {step === "review" && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border mb-4 bg-blue-50 text-blue-700 border-blue-200">
                <Bot className="w-3.5 h-3.5" />
                GPT-4o Vision (Foto-Analyse)
              </div>

              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Analysiertes Foto"
                  className="w-full max-h-40 object-cover rounded-xl shadow-sm mb-4"
                />
              )}

              {extracted.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">🤷</p>
                  <p className="text-foreground font-serif text-lg">Kein Rezept erkannt.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Versuche ein besseres Foto oder ein anderes Bild.
                  </p>
                  <button
                    onClick={reset}
                    className="mt-4 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                  >
                    Anderes Foto wählen
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {extracted.length} Rezept{extracted.length !== 1 ? "e" : ""} erkannt. Wähle aus, welche hinzugefügt werden sollen:
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
                      onClick={handleClose}
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
                onClick={handleClose}
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
                  onClick={reset}
                  className="px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                >
                  Nochmal versuchen
                </button>
                <button
                  onClick={handleClose}
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
