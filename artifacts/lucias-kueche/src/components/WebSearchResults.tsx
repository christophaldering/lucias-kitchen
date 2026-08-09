/**
 * WebSearchResults — Overlay-Komponente für die Rezept-Websuche.
 *
 * Wenn query nicht leer: startet die Suche sofort beim Mount.
 * Wenn query leer: zeigt zuerst ein Eingabefeld; Suche startet erst nach Enter.
 * onSelectUrls übergibt alle gewählten URLs gesammelt ans Elternelement.
 */
import { useEffect, useRef, useState } from "react";
import { X, Globe, Loader2, ExternalLink, Search, Check } from "lucide-react";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

interface SearchResult {
  title: string;
  url: string;
  source: string;
  description: string;
}

interface Props {
  query: string;
  onClose: () => void;
  /** Wird mit allen ausgewählten URLs aufgerufen (mind. 1). */
  onSelectUrls: (urls: string[]) => void;
}

export default function WebSearchResults({ query, onClose, onSelectUrls }: Props) {
  // activeQuery: leer = Eingabe-Modus, non-leer = Suche läuft/fertig
  const [activeQuery, setActiveQuery] = useState(query);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Wenn activeQuery gesetzt (nicht leer): Suche ausführen
  useEffect(() => {
    if (!activeQuery) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);
    setSelected(new Set());

    authFetch(`${API_BASE}/recipes/web-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ query: activeQuery }),
    })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => { if (!cancelled) setResults(data.results ?? []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [activeQuery]);

  // Fokus auf Eingabefeld im Leer-Start-Modus
  useEffect(() => {
    if (!activeQuery) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [activeQuery]);

  const handleInputSubmit = () => {
    const q = inputValue.trim();
    if (q) setActiveQuery(q);
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleConfirm = () => {
    const urls = Array.from(selected).sort().map((i) => results[i].url);
    if (urls.length > 0) onSelectUrls(urls);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{ maxHeight: "88vh", boxShadow: "0 -4px 40px rgba(0,0,0,0.18)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-[#4A7C59]/15 flex items-center justify-center">
            <Globe className="w-4 h-4 text-[#4A7C59]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-semibold text-base leading-tight">Websuche</h2>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {activeQuery ? `„${activeQuery}"` : "Wonach soll ich im Web suchen?"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border text-muted-foreground hover:bg-[#f5ede0] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Leer-Start-Modus: Eingabefeld */}
          {!activeQuery ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Gib ein, wonach du im Web suchen möchtest, und drück Enter.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="z.B. Hirschragout mit Rotwein…"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInputSubmit(); }}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 min-h-[44px]"
                  />
                </div>
                <button
                  onClick={handleInputSubmit}
                  disabled={!inputValue.trim()}
                  className="flex-shrink-0 px-4 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3a6347] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  <Globe className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-[#4A7C59]" />
              <p className="font-serif text-sm">Ich schaue im Web…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Globe className="w-8 h-8 text-muted-foreground/40" />
              <p className="font-serif font-semibold text-foreground">Auch im Web nichts gefunden</p>
              <p className="text-xs text-muted-foreground">Versuch es mit einem anderen Suchbegriff.</p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-[#f5ede0] transition-colors"
              >
                Schliessen
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground mb-1">
                Karte antippen zum Auswählen — dann gemeinsam übernehmen.
              </p>
              {results.map((r, i) => {
                const isSelected = selected.has(i);
                return (
                  <div
                    key={i}
                    onClick={() => toggleSelect(i)}
                    className={`relative w-full text-left rounded-2xl border p-4 cursor-pointer transition-all ${
                      isSelected
                        ? "border-[#4A7C59] bg-[#4A7C59]/5 ring-2 ring-[#4A7C59]/20"
                        : "border-border bg-white hover:border-[#4A7C59]/40"
                    }`}
                    style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}
                  >
                    {/* Auswahl-Indikator oben links */}
                    <div
                      className={`absolute top-3 left-3 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? "bg-[#4A7C59] border-[#4A7C59]"
                          : "border-border bg-white"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>

                    {/* Inhalt — links-Padding für den Kreis */}
                    <div className="pl-7">
                      <h3 className="font-serif font-semibold text-sm text-foreground leading-snug">
                        {r.title}
                      </h3>
                      {r.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {r.description}
                        </p>
                      )}
                      <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                        <Globe className="w-2.5 h-2.5" />
                        {r.source}
                      </span>

                      {/* Nur noch: Original ansehen */}
                      <div className="mt-3">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-[#f5ede0] hover:border-[#4A7C59]/30 transition-colors min-h-[44px]"
                        >
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                          Original ansehen
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Footer — nur sichtbar wenn >= 1 ausgewählt */}
        {selected.size > 0 && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-border bg-white rounded-b-3xl flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground font-medium">
              {selected.size} ausgewählt
            </span>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3a6347] active:bg-[#2f5139] transition-colors min-h-[44px]"
            >
              Übernehmen ({selected.size})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
