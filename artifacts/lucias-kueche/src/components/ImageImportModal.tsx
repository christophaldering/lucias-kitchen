import { useState, useRef, useEffect, useCallback } from "react";
import { X, Camera, ImageIcon, FileText, Check, Loader2, Bot, Plus, Trash2, ChevronUp, Edit2 } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractImageRecipes } from "@/hooks/useRecipes";

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<void>;
}

type Step = "upload" | "loading" | "review" | "saving" | "done" | "error";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

interface PhotoEntry {
  objectUrl: string;
  base64: string;
  mimeType: string;
}

const VALID_CATEGORIES = ["Fisch", "Fleisch", "Pasta", "Vegetarisch", "Geflügel", "Sonstiges"];
const VALID_DIFFICULTIES = ["simpel", "normal", "schwer"] as const;

function sanitizeRecipe(r: Partial<Recipe>): Partial<Recipe> {
  const servingsRaw = r.servings;
  let servings: number | null = null;
  if (servingsRaw != null) {
    const n = typeof servingsRaw === "string" ? parseInt(servingsRaw as unknown as string, 10) : Number(servingsRaw);
    servings = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const kcalRaw = r.kcalPerPortion;
  let kcalPerPortion: number | null = null;
  if (kcalRaw != null) {
    const n = typeof kcalRaw === "string" ? parseInt(kcalRaw as unknown as string, 10) : Number(kcalRaw);
    kcalPerPortion = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const prepTime = r.prepTime != null ? String(r.prepTime) : null;
  const totalTime = r.totalTime != null ? String(r.totalTime) : null;

  const rawCategory = r.category ?? "";
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "Sonstiges";

  const rawDifficulty = r.difficulty ?? "normal";
  const difficulty: "simpel" | "normal" | "schwer" = (VALID_DIFFICULTIES as readonly string[]).includes(rawDifficulty)
    ? (rawDifficulty as "simpel" | "normal" | "schwer")
    : "normal";

  const ingredients = (r.ingredients ?? []).filter((ing) => {
    const name = (ing as { name?: string }).name?.trim() ?? "";
    return name.length > 0;
  });

  return {
    ...r,
    servings,
    kcalPerPortion,
    prepTime,
    totalTime,
    category,
    difficulty,
    ingredients,
  };
}

function formatZodIssues(issues: Array<{ path: (string | number)[]; message: string }>): string {
  const fieldLabels: Record<string, string> = {
    title: "Titel",
    category: "Kategorie",
    difficulty: "Schwierigkeitsgrad",
    servings: "Portionen",
    prepTime: "Vorbereitungszeit",
    totalTime: "Gesamtzeit",
    kcalPerPortion: "Kalorien",
    ingredients: "Zutaten",
    steps: "Zubereitungsschritte",
  };

  const messages = issues.map((issue) => {
    const field = issue.path[0] != null ? String(issue.path[0]) : "";
    const label = fieldLabels[field] ?? field;
    if (!label) return issue.message;
    return `${label}: ${issue.message}`;
  });

  if (messages.length === 0) return "Ungültige Daten.";
  return messages.join(" · ");
}

export default function ImageImportModal({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [extracted, setExtracted] = useState<Partial<Recipe>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sourceDocumentUrl, setSourceDocumentUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const addGalleryRef = useRef<HTMLInputElement>(null);
  const addCameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoEntry[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    };
  }, []);

  const handleClose = () => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    onClose();
  };

  const readFileAsBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: file.type || "image/jpeg" });
      };
      reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });

  const runAnalysis = useCallback(async (imageList: PhotoEntry[]) => {
    setStep("loading");
    try {
      const images = imageList.map((p) => ({ base64: p.base64, mimeType: p.mimeType }));
      const { recipes, sourceDocumentUrl: srcUrl } = await extractImageRecipes(images);
      const sanitized = recipes.map(sanitizeRecipe);
      setExtracted(sanitized);
      setSourceDocumentUrl(srcUrl);
      setSelected(new Set(sanitized.map((_, i) => i)));
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Extraktion fehlgeschlagen.");
      setStep("error");
    }
  }, []);

  const handleFile = async (file: File, isAdditional = false) => {
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME.includes(mimeType)) {
      setErrorMsg("Bitte nur JPEG-, PNG-, WebP-, GIF- oder HEIC-Bilder hochladen.");
      setStep("error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg("Das Bild ist zu groß. Bitte wähle ein Bild unter 20 MB.");
      setStep("error");
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const { base64 } = await readFileAsBase64(file);
      const newPhoto: PhotoEntry = { objectUrl, base64, mimeType };

      if (isAdditional) {
        setPhotos((prev) => {
          const updated = [...prev, newPhoto];
          runAnalysis(updated);
          return updated;
        });
      } else {
        photosRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
        const firstList = [newPhoto];
        setPhotos(firstList);
        runAnalysis(firstList);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Bild konnte nicht gelesen werden.");
      setStep("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, false);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].objectUrl);
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0) {
        runAnalysis(updated);
      } else {
        setStep("upload");
        setExtracted([]);
        setSelected(new Set());
      }
      return updated;
    });
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
    setExpandedIndex((prev) => (prev === i ? null : i));
  };

  const updateRecipeField = (index: number, field: string, value: string) => {
    setExtracted((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (field === "servings") {
          const n = parseInt(value, 10);
          return { ...r, servings: Number.isFinite(n) && n > 0 ? n : null };
        }
        return { ...r, [field]: value };
      })
    );
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
    } catch (err) {
      let msg = "Rezepte konnten nicht gespeichert werden.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed?.issues && Array.isArray(parsed.issues)) {
            msg = formatZodIssues(parsed.issues);
          } else if (parsed?.message) {
            msg = parsed.message;
          }
        } catch {
          if (err.message && !err.message.startsWith("HTTP")) {
            msg = err.message;
          }
        }
      }
      setErrorMsg(msg);
      setStep("error");
    }
  };

  const reset = () => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    setStep("upload");
    setErrorMsg("");
    setExtracted([]);
    setSelected(new Set());
    setPhotos([]);
    setExpandedIndex(null);
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
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], false)}
                />
              </div>

              <button
                onClick={() => cameraRef.current?.click()}
                className="md:hidden w-full flex items-center justify-center gap-2 py-2.5 border border-[#4A7C59]/40 text-[#4A7C59] rounded-xl text-sm font-semibold hover:bg-[#4A7C59]/8 transition-colors"
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
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], false)}
              />

              <p className="text-xs text-muted-foreground text-center">
                GPT-4o Vision erkennt gedruckte und handgeschriebene Rezepte · JPEG, PNG, WebP bis 20 MB
              </p>
            </div>
          )}

          {/* STEP: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-12">
              {photos.length > 0 && (
                <div className="flex gap-2 justify-center flex-wrap mb-2">
                  {photos.map((photo, index) => (
                    <img
                      key={index}
                      src={photo.objectUrl}
                      alt={`Vorschau ${index + 1}`}
                      className="w-20 h-20 object-cover rounded-xl shadow-md"
                    />
                  ))}
                </div>
              )}
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">
                KI analysiert {photos.length > 1 ? `${photos.length} Fotos` : "das Foto"}…
              </p>
              <p className="text-sm text-muted-foreground">Das kann einen Moment dauern.</p>
            </div>
          )}

          {/* STEP: Review */}
          {step === "review" && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border mb-4 bg-blue-50 text-blue-700 border-blue-200">
                <Bot className="w-3.5 h-3.5" />
                GPT-4o Vision (Foto-Analyse) · Bitte Daten prüfen und ggf. korrigieren
              </div>

              {/* Photo thumbnails with delete + add more */}
              {photos.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2 items-start">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo.objectUrl}
                          alt={`Foto ${index + 1}`}
                          className="w-20 h-20 object-cover rounded-xl border border-border shadow-sm"
                        />
                        <button
                          onClick={() => removePhoto(index)}
                          aria-label={`Foto ${index + 1} entfernen`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white rounded px-1">
                          {index + 1}
                        </span>
                      </div>
                    ))}

                    {/* Add more buttons */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => addGalleryRef.current?.click()}
                        className="w-20 h-9 border border-dashed border-[#4A7C59]/50 text-[#4A7C59] rounded-xl flex items-center justify-center gap-1 text-xs font-medium hover:bg-[#4A7C59]/5 transition-colors"
                        title="Weiteres Foto aus Galerie"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Foto
                      </button>
                      <button
                        onClick={() => addCameraRef.current?.click()}
                        className="md:hidden w-20 h-9 border border-dashed border-[#4A7C59]/50 text-[#4A7C59] rounded-xl flex items-center justify-center gap-1 text-xs font-medium hover:bg-[#4A7C59]/5 transition-colors"
                        title="Weiteres Foto mit Kamera"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Kamera
                      </button>
                    </div>
                  </div>
                  <input
                    ref={addGalleryRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFile(e.target.files[0], true);
                        e.target.value = "";
                      }
                    }}
                  />
                  <input
                    ref={addCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFile(e.target.files[0], true);
                        e.target.value = "";
                      }
                    }}
                  />
                  {photos.length > 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {photos.length} Fotos · Ergebnis wird bei Änderungen neu analysiert
                    </p>
                  )}
                </div>
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
                    {extracted.length} Rezept{extracted.length !== 1 ? "e" : ""} erkannt. Auswahl treffen und bei Bedarf bearbeiten:
                  </p>
                  <ul className="space-y-2 mb-6">
                    {extracted.map((r, i) => (
                      <li
                        key={i}
                        className={`rounded-xl border transition-colors ${
                          selected.has(i)
                            ? "bg-[#4A7C59]/8 border-[#4A7C59]/30"
                            : "bg-white border-border"
                        }`}
                      >
                        {/* Recipe header row */}
                        <div
                          className="flex items-start gap-3 p-3 cursor-pointer"
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
                          <div className="min-w-0 flex-1">
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
                              {r.servings && (
                                <span className="text-xs text-muted-foreground">{r.servings} Portionen</span>
                              )}
                              {r.ingredients && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {r.ingredients.length} Zutaten
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(i); }}
                            className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
                            aria-label="Details bearbeiten"
                          >
                            {expandedIndex === i ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Expandable edit panel */}
                        {expandedIndex === i && (
                          <div className="px-3 pb-3 border-t border-[#4A7C59]/20 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs font-semibold text-[#4A7C59] uppercase tracking-wide">Daten prüfen & korrigieren</p>

                            {/* Title */}
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Titel</label>
                              <input
                                type="text"
                                value={r.title ?? ""}
                                onChange={(e) => updateRecipeField(i, "title", e.target.value)}
                                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                              />
                            </div>

                            {/* Category */}
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Kategorie</label>
                              <select
                                value={r.category ?? "Sonstiges"}
                                onChange={(e) => updateRecipeField(i, "category", e.target.value)}
                                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                              >
                                {VALID_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>

                            {/* Difficulty */}
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Schwierigkeitsgrad</label>
                              <select
                                value={r.difficulty ?? "normal"}
                                onChange={(e) => updateRecipeField(i, "difficulty", e.target.value)}
                                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                              >
                                <option value="simpel">Simpel</option>
                                <option value="normal">Normal</option>
                                <option value="schwer">Schwer</option>
                              </select>
                            </div>

                            {/* Servings + prep/total time in a row */}
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Portionen</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={r.servings ?? ""}
                                  onChange={(e) => updateRecipeField(i, "servings", e.target.value)}
                                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Vorbereitung</label>
                                <input
                                  type="text"
                                  placeholder="z.B. 10 Min"
                                  value={r.prepTime ?? ""}
                                  onChange={(e) => updateRecipeField(i, "prepTime", e.target.value)}
                                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Gesamt</label>
                                <input
                                  type="text"
                                  placeholder="z.B. 30 Min"
                                  value={r.totalTime ?? ""}
                                  onChange={(e) => updateRecipeField(i, "totalTime", e.target.value)}
                                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                                />
                              </div>
                            </div>

                            {/* Ingredients preview */}
                            {r.ingredients && r.ingredients.length > 0 && (
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">
                                  Zutaten ({r.ingredients.length})
                                </label>
                                <div className="text-xs text-muted-foreground bg-white border border-border rounded-lg px-3 py-2 max-h-28 overflow-y-auto space-y-0.5">
                                  {r.ingredients.slice(0, 10).map((ing, j) => (
                                    <div key={j}>
                                      {[(ing as { amount?: string }).amount, (ing as { unit?: string }).unit, (ing as { name?: string }).name].filter(Boolean).join(" ")}
                                    </div>
                                  ))}
                                  {r.ingredients.length > 10 && (
                                    <div className="text-[#4A7C59]">+{r.ingredients.length - 10} weitere…</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
                  onClick={() => {
                    if (extracted.length > 0) {
                      setStep("review");
                      setErrorMsg("");
                    } else {
                      reset();
                    }
                  }}
                  className="px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                >
                  {extracted.length > 0 ? "Zurück zur Vorschau" : "Nochmal versuchen"}
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
