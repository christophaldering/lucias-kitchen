import { useState, useEffect } from "react";
import { SlidersHorizontal, X, RotateCcw, Check } from "lucide-react";
import type { Season } from "@/types/recipe";
import { SEASON_LABELS, SEASON_ICONS } from "@/types/recipe";

interface FilterState {
  timeFilter: string;
  seasonFilter: Season | "Alle";
  cookedFilter: "Alle" | "gekocht" | "nicht_ausprobiert";
  showVariants: boolean;
}

interface FilterBottomSheetProps {
  timeFilter: string;
  seasonFilter: Season | "Alle";
  cookedFilter: "Alle" | "gekocht" | "nicht_ausprobiert";
  showVariants: boolean;
  hasVariants: boolean;
  onApply: (filters: FilterState) => void;
}

export function FilterBottomSheet({
  timeFilter,
  seasonFilter,
  cookedFilter,
  showVariants,
  hasVariants,
  onApply,
}: FilterBottomSheetProps) {
  const [open, setOpen] = useState(false);

  const [draft, setDraft] = useState<FilterState>({
    timeFilter,
    seasonFilter,
    cookedFilter,
    showVariants,
  });

  useEffect(() => {
    if (open) {
      setDraft({ timeFilter, seasonFilter, cookedFilter, showVariants });
    }
  }, [open, timeFilter, seasonFilter, cookedFilter, showVariants]);

  const activeCount = [
    timeFilter !== "Alle",
    seasonFilter !== "Alle",
    cookedFilter !== "Alle",
    showVariants,
  ].filter(Boolean).length;

  const draftActiveCount = [
    draft.timeFilter !== "Alle",
    draft.seasonFilter !== "Alle",
    draft.cookedFilter !== "Alle",
    draft.showVariants,
  ].filter(Boolean).length;

  function handleReset() {
    setDraft({
      timeFilter: "Alle",
      seasonFilter: "Alle",
      cookedFilter: "Alle",
      showVariants: false,
    });
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors min-h-[40px] ${
          activeCount > 0
            ? "bg-[#C1693A] text-white border-[#C1693A]"
            : "bg-white text-foreground border-border hover:border-[#4A7C59]/40"
        }`}
        aria-label="Filter öffnen"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>Filter</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-[#C1693A] text-xs font-bold leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-foreground">Filter</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              <FilterSection
                label="Zeit"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "Unter 30 Min", label: "Unter 30 Min" },
                  { value: "Unter 1 Std", label: "Unter 1 Std" },
                ]}
                value={draft.timeFilter}
                onChange={(v) => setDraft((d) => ({ ...d, timeFilter: v }))}
                color="#C1693A"
              />

              <FilterSection
                label="Saison"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "spring", label: `${SEASON_ICONS["spring"]} ${SEASON_LABELS["spring"]}` },
                  { value: "summer", label: `${SEASON_ICONS["summer"]} ${SEASON_LABELS["summer"]}` },
                  { value: "autumn", label: `${SEASON_ICONS["autumn"]} ${SEASON_LABELS["autumn"]}` },
                  { value: "winter", label: `${SEASON_ICONS["winter"]} ${SEASON_LABELS["winter"]}` },
                ]}
                value={draft.seasonFilter}
                onChange={(v) => setDraft((d) => ({ ...d, seasonFilter: v as Season | "Alle" }))}
                color="#4A7C59"
              />

              <FilterSection
                label="Kochstatus"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "gekocht", label: "✅ Schon gekocht" },
                  { value: "nicht_ausprobiert", label: "🆕 Noch nicht probiert" },
                ]}
                value={draft.cookedFilter}
                onChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    cookedFilter: v as "Alle" | "gekocht" | "nicht_ausprobiert",
                  }))
                }
                color="#f97316"
              />

              {hasVariants && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Varianten
                  </p>
                  <button
                    onClick={() => setDraft((d) => ({ ...d, showVariants: !d.showVariants }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      draft.showVariants
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-foreground border-border hover:border-amber-400"
                    }`}
                  >
                    {draft.showVariants && <Check className="w-3.5 h-3.5" />}
                    🔀 Varianten anzeigen
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={handleReset}
                disabled={draftActiveCount === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zurücksetzen
              </button>
              <button
                onClick={handleApply}
                className="flex-1 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-semibold hover:bg-[#3a6347] transition-colors"
              >
                Anwenden
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSection({
  label,
  options,
  value,
  onChange,
  color,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "text-white border-transparent"
                  : "bg-white text-foreground border-border hover:border-gray-300"
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : undefined}
            >
              {active && <Check className="w-3 h-3 flex-shrink-0" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
