import { useState, useRef, useEffect, useCallback } from "react";
import { X, Camera, ImageIcon, FileText, Check, Loader2, Bot, ChevronUp, Edit2, SkipForward, Zap } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractImageRecipes } from "@/hooks/useRecipes";

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<void>;
}

type Step = "upload" | "queue" | "done" | "error";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

interface QueueItem {
  objectUrl: string;
  base64: string;
  mimeType: string;
  status: "pending" | "loading" | "review" | "saving" | "saved" | "skipped" | "error";
  extracted: Partial<Recipe> | null;
  sourceDocumentUrl: string | null;
  errorMsg: string | null;
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoSave, setAutoSave] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [globalErrorMsg, setGlobalErrorMsg] = useState("");
  const [expandedEdit, setExpandedEdit] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const autoSaveRef = useRef(autoSave);
  const processingRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => URL.revokeObjectURL(item.objectUrl));
    };
  }, []);

  const handleClose = () => {
    queueRef.current.forEach((item) => URL.revokeObjectURL(item.objectUrl));
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

  const processNextItem = useCallback(async (queueSnapshot: QueueItem[], index: number, savedSoFar: number, skippedSoFar: number) => {
    if (index >= queueSnapshot.length) {
      setSavedCount(savedSoFar);
      setSkippedCount(skippedSoFar);
      setStep("done");
      processingRef.current = false;
      return;
    }

    const item = queueSnapshot[index];
    if (item.status !== "pending") {
      await processNextItem(queueSnapshot, index + 1, savedSoFar, skippedSoFar);
      return;
    }

    setCurrentIndex(index);
    setExpandedEdit(false);

    setQueue((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status: "loading" } : it))
    );

    try {
      const { recipes, sourceDocumentUrl } = await extractImageRecipes([
        { base64: item.base64, mimeType: item.mimeType },
      ]);

      const firstRecipe = recipes[0] ? sanitizeRecipe(recipes[0]) : null;

      if (!firstRecipe) {
        setQueue((prev) =>
          prev.map((it, i) =>
            i === index
              ? { ...it, status: "error", errorMsg: "Kein Rezept erkannt. Bitte ein besseres Foto wählen.", extracted: null }
              : it
          )
        );

        if (autoSaveRef.current) {
          const updatedQueue = queueRef.current;
          await processNextItem(updatedQueue, index + 1, savedSoFar, skippedSoFar + 1);
        }
        return;
      }

      setQueue((prev) =>
        prev.map((it, i) =>
          i === index
            ? { ...it, status: "review", extracted: firstRecipe, sourceDocumentUrl }
            : it
        )
      );

      if (autoSaveRef.current) {
        setQueue((prev) =>
          prev.map((it, i) => (i === index ? { ...it, status: "saving" } : it))
        );
        try {
          await onAdd([{ ...firstRecipe, sourceDocumentUrl: sourceDocumentUrl ?? undefined }]);
          setQueue((prev) =>
            prev.map((it, i) => (i === index ? { ...it, status: "saved" } : it))
          );
          const updatedQueue = queueRef.current;
          await processNextItem(updatedQueue, index + 1, savedSoFar + 1, skippedSoFar);
        } catch (err) {
          let msg = "Rezept konnte nicht gespeichert werden.";
          if (err instanceof Error) {
            try {
              const parsed = JSON.parse(err.message);
              if (parsed?.issues && Array.isArray(parsed.issues)) {
                msg = formatZodIssues(parsed.issues);
              } else if (parsed?.message) {
                msg = parsed.message;
              }
            } catch {
              if (err.message && !err.message.startsWith("HTTP")) msg = err.message;
            }
          }
          setQueue((prev) =>
            prev.map((it, i) => (i === index ? { ...it, status: "error", errorMsg: msg } : it))
          );
          const updatedQueue = queueRef.current;
          await processNextItem(updatedQueue, index + 1, savedSoFar, skippedSoFar + 1);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraktion fehlgeschlagen.";
      setQueue((prev) =>
        prev.map((it, i) =>
          i === index ? { ...it, status: "error", errorMsg: msg } : it
        )
      );
      if (autoSaveRef.current) {
        const updatedQueue = queueRef.current;
        await processNextItem(updatedQueue, index + 1, savedSoFar, skippedSoFar + 1);
      }
    }
  }, [onAdd]);

  const handleAutoSaveToggle = useCallback(async () => {
    const newValue = !autoSaveRef.current;
    setAutoSave(newValue);
    autoSaveRef.current = newValue;

    if (!newValue) return;

    const currentItem = queueRef.current[currentIndex];
    if (!currentItem || currentItem.status !== "review" || !currentItem.extracted) return;

    setQueue((prev) =>
      prev.map((it, i) => (i === currentIndex ? { ...it, status: "saving" } : it))
    );

    try {
      await onAdd([{ ...currentItem.extracted, sourceDocumentUrl: currentItem.sourceDocumentUrl ?? undefined }]);
      setQueue((prev) =>
        prev.map((it, i) => (i === currentIndex ? { ...it, status: "saved" } : it))
      );
      const newSaved = savedCount + 1;
      setSavedCount(newSaved);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queueRef.current.length) {
        setStep("done");
        processingRef.current = false;
      } else {
        setCurrentIndex(nextIndex);
        setExpandedEdit(false);
        processingRef.current = true;
        await processNextItem(queueRef.current, nextIndex, newSaved, skippedCount);
      }
    } catch (err) {
      let msg = "Rezept konnte nicht gespeichert werden.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed?.issues && Array.isArray(parsed.issues)) {
            msg = formatZodIssues(parsed.issues);
          } else if (parsed?.message) {
            msg = parsed.message;
          }
        } catch {
          if (err.message && !err.message.startsWith("HTTP")) msg = err.message;
        }
      }
      setQueue((prev) =>
        prev.map((it, i) => (i === currentIndex ? { ...it, status: "error", errorMsg: msg } : it))
      );
    }
  }, [currentIndex, savedCount, skippedCount, onAdd, processNextItem]);

  const startQueue = useCallback(async (items: QueueItem[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setStep("queue");
    setCurrentIndex(0);
    setSavedCount(0);
    setSkippedCount(0);
    await processNextItem(items, 0, 0, 0);
  }, [processNextItem]);

  const handleFiles = async (files: FileList) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const mimeType = file.type || "image/jpeg";
      if (!ALLOWED_MIME.includes(mimeType)) {
        errors.push(`${file.name}: Ungültiges Format`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        errors.push(`${file.name}: Zu groß (max. 20 MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      setGlobalErrorMsg(errors.length > 0 ? errors.join(", ") : "Keine gültigen Bilder ausgewählt.");
      setStep("error");
      return;
    }

    const items: QueueItem[] = await Promise.all(
      validFiles.map(async (file) => {
        const objectUrl = URL.createObjectURL(file);
        const { base64, mimeType } = await readFileAsBase64(file);
        return {
          objectUrl,
          base64,
          mimeType,
          status: "pending" as const,
          extracted: null,
          sourceDocumentUrl: null,
          errorMsg: null,
        };
      })
    );

    queueRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    setQueue(items);
    await startQueue(items);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleSaveAndNext = async () => {
    const item = queue[currentIndex];
    if (!item?.extracted) return;

    setQueue((prev) =>
      prev.map((it, i) => (i === currentIndex ? { ...it, status: "saving" } : it))
    );

    try {
      await onAdd([{ ...item.extracted, sourceDocumentUrl: item.sourceDocumentUrl ?? undefined }]);
      setQueue((prev) =>
        prev.map((it, i) => (i === currentIndex ? { ...it, status: "saved" } : it))
      );
      const newSaved = savedCount + 1;
      setSavedCount(newSaved);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        setSavedCount(newSaved);
        setSkippedCount(skippedCount);
        setStep("done");
        processingRef.current = false;
      } else {
        setCurrentIndex(nextIndex);
        setExpandedEdit(false);
        const updatedQueue = queueRef.current;
        if (updatedQueue[nextIndex].status === "pending") {
          processingRef.current = true;
          await processNextItem(updatedQueue, nextIndex, newSaved, skippedCount);
        }
      }
    } catch (err) {
      let msg = "Rezept konnte nicht gespeichert werden.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed?.issues && Array.isArray(parsed.issues)) {
            msg = formatZodIssues(parsed.issues);
          } else if (parsed?.message) {
            msg = parsed.message;
          }
        } catch {
          if (err.message && !err.message.startsWith("HTTP")) msg = err.message;
        }
      }
      setQueue((prev) =>
        prev.map((it, i) => (i === currentIndex ? { ...it, status: "error", errorMsg: msg } : it))
      );
    }
  };

  const handleSkip = async () => {
    setQueue((prev) =>
      prev.map((it, i) => (i === currentIndex ? { ...it, status: "skipped" } : it))
    );
    const newSkipped = skippedCount + 1;
    setSkippedCount(newSkipped);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      setSkippedCount(newSkipped);
      setStep("done");
      processingRef.current = false;
    } else {
      setCurrentIndex(nextIndex);
      setExpandedEdit(false);
      const updatedQueue = queueRef.current;
      if (updatedQueue[nextIndex].status === "pending") {
        processingRef.current = true;
        await processNextItem(updatedQueue, nextIndex, savedCount, newSkipped);
      }
    }
  };

  const updateCurrentField = (field: string, value: string) => {
    setQueue((prev) =>
      prev.map((it, i) => {
        if (i !== currentIndex || !it.extracted) return it;
        let updatedExtracted: Partial<Recipe>;
        if (field === "servings") {
          const n = parseInt(value, 10);
          updatedExtracted = { ...it.extracted, servings: Number.isFinite(n) && n > 0 ? n : null };
        } else {
          updatedExtracted = { ...it.extracted, [field]: value };
        }
        return { ...it, extracted: updatedExtracted };
      })
    );
  };

  const reset = () => {
    queueRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    setStep("upload");
    setGlobalErrorMsg("");
    setQueue([]);
    setCurrentIndex(0);
    setSavedCount(0);
    setSkippedCount(0);
    setExpandedEdit(false);
    processingRef.current = false;
  };

  const currentItem = queue[currentIndex] ?? null;
  const totalCount = queue.length;
  const completedCount = queue.filter((it) => it.status === "saved" || it.status === "skipped" || it.status === "error").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
              {step === "queue" && totalCount > 1
                ? `Foto ${Math.min(currentIndex + 1, totalCount)} von ${totalCount}`
                : "Rezept aus Foto automatisch erkennen"}
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
                  <p className="font-semibold text-foreground">Bilder hier ablegen</p>
                  <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen (mehrere möglich)</p>
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
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
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />

              <p className="text-xs text-muted-foreground text-center">
                GPT-4o Vision erkennt gedruckte und handgeschriebene Rezepte · JPEG, PNG, WebP bis 20 MB · Mehrere Fotos gleichzeitig wählbar
              </p>
            </div>
          )}

          {/* STEP: Queue processing */}
          {step === "queue" && currentItem && (
            <div className="space-y-4">
              {/* Progress bar (only for multi-photo) */}
              {totalCount > 1 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {currentItem.status === "loading"
                        ? `Foto ${currentIndex + 1} von ${totalCount} wird analysiert…`
                        : currentItem.status === "review"
                        ? `Foto ${currentIndex + 1} von ${totalCount} – Bitte prüfen`
                        : currentItem.status === "saving"
                        ? `Foto ${currentIndex + 1} von ${totalCount} wird gespeichert…`
                        : `Foto ${currentIndex + 1} von ${totalCount}`}
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 bg-[#4A7C59]/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#4A7C59] rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {/* Queue thumbnail strip */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {queue.map((item, i) => (
                      <div key={i} className="relative">
                        <img
                          src={item.objectUrl}
                          alt={`Foto ${i + 1}`}
                          className={`w-10 h-10 object-cover rounded-lg border-2 transition-all ${
                            i === currentIndex
                              ? "border-[#4A7C59] scale-110"
                              : item.status === "saved"
                              ? "border-green-400 opacity-70"
                              : item.status === "skipped" || item.status === "error"
                              ? "border-gray-300 opacity-40"
                              : "border-border opacity-60"
                          }`}
                        />
                        {item.status === "saved" && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        {(item.status === "skipped" || item.status === "error") && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                            <SkipForward className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-save toggle */}
              {totalCount > 1 && currentItem.status !== "saving" && (
                <button
                  onClick={() => handleAutoSaveToggle()}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    autoSave
                      ? "bg-[#4A7C59]/10 border-[#4A7C59]/40 text-[#4A7C59]"
                      : "bg-white border-border text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Alle automatisch speichern
                  </span>
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      autoSave ? "bg-[#4A7C59]" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                        autoSave ? "left-5" : "left-0.5"
                      }`}
                    />
                  </div>
                </button>
              )}

              {/* Current photo preview */}
              <div className="flex justify-center">
                <img
                  src={currentItem.objectUrl}
                  alt="Aktuelles Foto"
                  className="max-h-48 rounded-xl shadow-md object-contain"
                />
              </div>

              {/* Loading state */}
              {currentItem.status === "loading" && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
                  <p className="text-sm text-muted-foreground">KI analysiert das Foto…</p>
                </div>
              )}

              {/* Saving state */}
              {currentItem.status === "saving" && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
                  <p className="text-sm text-muted-foreground">Rezept wird gespeichert…</p>
                </div>
              )}

              {/* Error for current item */}
              {currentItem.status === "error" && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center space-y-3">
                  <p className="text-sm font-semibold text-red-700">Fehler bei diesem Foto</p>
                  <p className="text-xs text-red-600">{currentItem.errorMsg}</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleSkip}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
                    >
                      {currentIndex + 1 < totalCount ? "Weiter zum nächsten Foto" : "Abschließen"}
                    </button>
                  </div>
                </div>
              )}

              {/* Review state */}
              {currentItem.status === "review" && currentItem.extracted && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
                    <Bot className="w-3.5 h-3.5" />
                    GPT-4o Vision · Bitte Daten prüfen und ggf. korrigieren
                  </div>

                  {/* Recipe summary card */}
                  <div className="rounded-xl border border-[#4A7C59]/20 bg-white overflow-hidden">
                    <div
                      className="flex items-start justify-between p-3 cursor-pointer"
                      onClick={() => setExpandedEdit((v) => !v)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground leading-snug">
                          {currentItem.extracted.title ?? "Unbekanntes Rezept"}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {currentItem.extracted.category && (
                            <span className="text-xs text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                              {currentItem.extracted.category}
                            </span>
                          )}
                          {currentItem.extracted.difficulty && (
                            <span className="text-xs text-muted-foreground">{currentItem.extracted.difficulty}</span>
                          )}
                          {currentItem.extracted.servings && (
                            <span className="text-xs text-muted-foreground">{currentItem.extracted.servings} Portionen</span>
                          )}
                          {currentItem.extracted.ingredients && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {currentItem.extracted.ingredients.length} Zutaten
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
                        aria-label="Details bearbeiten"
                      >
                        {expandedEdit ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                      </button>
                    </div>

                    {expandedEdit && (
                      <div className="px-3 pb-3 border-t border-[#4A7C59]/20 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-semibold text-[#4A7C59] uppercase tracking-wide">Daten prüfen & korrigieren</p>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Titel</label>
                          <input
                            type="text"
                            value={currentItem.extracted.title ?? ""}
                            onChange={(e) => updateCurrentField("title", e.target.value)}
                            className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Kategorie</label>
                          <select
                            value={currentItem.extracted.category ?? "Sonstiges"}
                            onChange={(e) => updateCurrentField("category", e.target.value)}
                            className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                          >
                            {VALID_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Schwierigkeitsgrad</label>
                          <select
                            value={currentItem.extracted.difficulty ?? "normal"}
                            onChange={(e) => updateCurrentField("difficulty", e.target.value)}
                            className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                          >
                            <option value="simpel">Simpel</option>
                            <option value="normal">Normal</option>
                            <option value="schwer">Schwer</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Portionen</label>
                            <input
                              type="number"
                              min="1"
                              value={currentItem.extracted.servings ?? ""}
                              onChange={(e) => updateCurrentField("servings", e.target.value)}
                              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Vorbereitung</label>
                            <input
                              type="text"
                              placeholder="z.B. 10 Min"
                              value={currentItem.extracted.prepTime ?? ""}
                              onChange={(e) => updateCurrentField("prepTime", e.target.value)}
                              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Gesamt</label>
                            <input
                              type="text"
                              placeholder="z.B. 30 Min"
                              value={currentItem.extracted.totalTime ?? ""}
                              onChange={(e) => updateCurrentField("totalTime", e.target.value)}
                              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A7C59]"
                            />
                          </div>
                        </div>

                        {currentItem.extracted.ingredients && currentItem.extracted.ingredients.length > 0 && (
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Zutaten ({currentItem.extracted.ingredients.length})
                            </label>
                            <div className="text-xs text-muted-foreground bg-white border border-border rounded-lg px-3 py-2 max-h-28 overflow-y-auto space-y-0.5">
                              {currentItem.extracted.ingredients.slice(0, 10).map((ing, j) => (
                                <div key={j}>
                                  {[(ing as { amount?: string }).amount, (ing as { unit?: string }).unit, (ing as { name?: string }).name].filter(Boolean).join(" ")}
                                </div>
                              ))}
                              {currentItem.extracted.ingredients.length > 10 && (
                                <div className="text-[#4A7C59]">+{currentItem.extracted.ingredients.length - 10} weitere…</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!autoSave && (
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveAndNext}
                        className="flex-1 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        {currentIndex + 1 < totalCount ? "Speichern & Weiter" : "Speichern"}
                      </button>
                      <button
                        onClick={handleSkip}
                        className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors flex items-center gap-1.5"
                      >
                        <SkipForward className="w-4 h-4" />
                        {currentIndex + 1 < totalCount ? "Überspringen" : "Abbrechen"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-[#4A7C59]/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-[#4A7C59]" />
              </div>
              <p className="font-serif text-xl text-foreground">Import abgeschlossen!</p>
              <div className="space-y-1">
                {savedCount > 0 && (
                  <p className="text-sm text-[#4A7C59] font-semibold">
                    {savedCount} Rezept{savedCount !== 1 ? "e" : ""} erfolgreich importiert
                  </p>
                )}
                {skippedCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {skippedCount} Foto{skippedCount !== 1 ? "s" : ""} übersprungen
                  </p>
                )}
                {savedCount === 0 && skippedCount === 0 && (
                  <p className="text-sm text-muted-foreground">Keine Rezepte importiert.</p>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                >
                  Schließen
                </button>
                {savedCount === 0 && (
                  <button
                    onClick={reset}
                    className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
                  >
                    Nochmal versuchen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP: Error (global) */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-4xl">⚠️</p>
              <p className="font-serif text-lg text-foreground">Etwas ist schiefgelaufen</p>
              <p className="text-sm text-muted-foreground max-w-xs">{globalErrorMsg}</p>
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
