/**
 * WebSearchResults — Overlay-Komponente für die Rezept-Websuche.
 *
 * Startet den Fetch beim Mount (nur durch expliziten Button-Klick ausgelöst).
 * Zeigt Ladezustand, Ergebniskarten oder Leermeldung.
 * onSelectUrl öffnet den URL-Import im Elternelement.
 */
import { useEffect, useState } from "react";
import { X, Globe, Loader2, ExternalLink } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResults([]);

    authFetch(`${API_BASE}/recipes/web-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ query }),
    })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        if (!cancelled) setResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query]);

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
              „{query}"
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
          {loading ? (
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
                Tippe auf ein Ergebnis, um es als Rezept zu importieren.
              </p>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onSelectUrl(r.url)}
                  className="w-full text-left bg-white rounded-2xl border border-border p-4 hover:shadow-md hover:border-[#4A7C59]/30 transition-all active:scale-[0.98]"
                  style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif font-semibold text-sm text-foreground leading-snug flex-1">
                      {r.title}
                    </h3>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {r.description}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                    <Globe className="w-2.5 h-2.5" />
                    {r.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
