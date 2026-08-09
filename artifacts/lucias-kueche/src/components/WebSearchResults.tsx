/**
 * WebSearchResults — Overlay-Komponente für die Rezept-Websuche.
 *
 * Wenn query nicht leer: startet die Suche sofort beim Mount.
 * Wenn query leer: zeigt zuerst ein Eingabefeld; Suche startet erst nach Enter.
 * onSelectUrl öffnet den URL-Import im Elternelement.
 */
import { useEffect, useRef, useState } from "react";
import { X, Globe, Loader2, ExternalLink, Download, Search } from "lucide-react";
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
  onSelectUrl: (url: string) => void;
}

export default function WebSearchResults({ query, onClose, onSelectUrl }: Props) {
  // activeQuery: leer = Eingabe-Modus, non-leer = Suche läuft/fertig
  const [activeQuery, setActiveQuery] = useState(query);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wenn activeQuery gesetzt (nicht leer): Suche ausführen
  useEffect(() => {
    if (!activeQuery) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);

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

        {/* Body */}
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
                Sieh dir das Original an oder übernimm es direkt in deine Sammlung.
              </p>
              {results.map((r, i) => (
                <div
                  key={i}
                  className="w-full text-left bg-white rounded-2xl border border-border p-4"
                  style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}
                >
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
                  {/* Aktions-Buttons */}
                  <div className="flex gap-2 mt-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-[#f5ede0] hover:border-[#4A7C59]/30 transition-colors min-h-[44px]"
                    >
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                      Original ansehen
                    </a>
                    <button
                      onClick={() => onSelectUrl(r.url)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#4A7C59] text-white text-xs font-semibold hover:bg-[#3a6347] active:bg-[#2f5139] transition-colors min-h-[44px]"
                    >
                      <Download className="w-3.5 h-3.5 flex-shrink-0" />
                      Übernehmen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
