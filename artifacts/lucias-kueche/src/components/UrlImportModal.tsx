import { useState, useEffect } from "react";
import { X, Link, FileText, Check, Loader2 } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { extractUrlRecipes } from "@/hooks/useRecipes";

interface Props {
  onClose: () => void;
  onAdd: (recipes: Partial<Recipe>[]) => Promise<number[]>;
  /** Wenn gesetzt: URL vorausfüllen und Import sofort starten */
  initialUrl?: string;
}

type Step = "input" | "loading" | "review" | "saving" | "done" | "error";

export default function UrlImportModal({ onClose, onAdd, initialUrl }: Props) {
  const [step, setStep] = useState<Step>(initialUrl ? "loading" : "input");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [extracted, setExtracted] = useState<Partial<Recipe>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState("");

  const handleImportUrl = async (urlToImport: string) => {
    const trimmed = urlToImport.trim();
    if (!trimmed) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      setErrorMsg("Bitte gib eine gültige URL ein (z.B. https://www.chefkoch.de/rezepte/…)");
      setStep("error");
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      setErrorMsg("Nur HTTP- und HTTPS-URLs sind erlaubt.");
      setStep("error");
      return;
    }

    setStep("loading");

    try {
      const { recipes } = await extractUrlRecipes(trimmed);
      setExtracted(recipes);
      setSelected(new Set(recipes.map((_, i) => i)));
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Extraktion fehlgeschlagen.");
      setStep("error");
    }
  };

  const handleImport = () => handleImportUrl(url);

  // Wenn initialUrl gesetzt: Import direkt beim Öffnen starten
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialUrl) handleImportUrl(initialUrl); }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleImport();
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

  const resetToInput = () => {
    setStep("input");
    setErrorMsg("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">🔗 Per URL importieren</h2>
            <p className="text-green-200 text-xs mt-0.5">
              Rezept von Chefkoch, Lecker.de und mehr
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {step === "input" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Rezept-URL eingeben
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="https://www.chefkoch.de/rezepte/…"
                      autoFocus
                      className="w-full pl-10 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/40 bg-white"
                    />
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={!url.trim()}
                    className="px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Importieren
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Funktioniert mit Chefkoch, Lecker.de, Küchengötter und anderen Rezeptseiten. Seiten, die JavaScript zum Laden benötigen, werden nicht unterstützt.
              </p>
            </div>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">KI analysiert die Seite…</p>
              <p className="text-sm text-muted-foreground">Das kann einen Moment dauern.</p>
            </div>
          )}

          {step === "review" && (
            <div>
              {extracted.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">🤷</p>
                  <p className="text-foreground font-serif text-lg">Kein Rezept gefunden.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Die Seite enthält möglicherweise kein Rezept oder benötigt JavaScript zum Laden.
                  </p>
                  <button
                    onClick={resetToInput}
                    className="mt-4 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
                  >
                    Andere URL versuchen
                  </button>
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

          {step === "saving" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 text-[#4A7C59] animate-spin" />
              <p className="font-serif text-lg text-foreground">Rezepte werden gespeichert…</p>
            </div>
          )}

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

          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-4xl">⚠️</p>
              <p className="font-serif text-lg text-foreground">Etwas ist schiefgelaufen</p>
              <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={resetToInput}
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
