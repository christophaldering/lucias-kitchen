import { useState } from "react";
import { SlidersHorizontal, X, RotateCcw, Check } from "lucide-react";
import type { Season } from "@/types/recipe";
import { SEASON_LABELS, SEASON_ICONS } from "@/types/recipe";

export type PhotoTypeFilter = "all" | "none" | "ai" | "scan" | "manual";

interface FilterState {
  timeFilter: string;
  seasonFilter: Season | "Alle";
  cookedFilter: "Alle" | "gekocht" | "nicht_ausprobiert";
  showVariants: boolean;
  photoType: PhotoTypeFilter;
}

interface FilterBottomSheetProps {
  timeFilter: string;
  seasonFilter: Season | "Alle";
  cookedFilter: "Alle" | "gekocht" | "nicht_ausprobiert";
  showVariants: boolean;
  hasVariants: boolean;
  photoType: PhotoTypeFilter;
  onApply: (filters: FilterState) => void;
}

export function FilterBottomSheet({
  timeFilter,
  seasonFilter,
  cookedFilter,
  showVariants,
  hasVariants,
  photoType,
  onApply,
}: FilterBottomSheetProps) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    timeFilter !== "Alle",
    seasonFilter !== "Alle",
    cookedFilter !== "Alle",
    showVariants,
    photoType !== "all",
  ].filter(Boolean).length;

  function handleReset() {
    onApply({
      timeFilter: "Alle",
      seasonFilter: "Alle",
      cookedFilter: "Alle",
      showVariants: false,
      photoType: "all",
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors min-h-[40px] ${
          activeCount > 0
            ? "bg-[#4A7C59] text-white border-[#4A7C59]"
            : "bg-white text-foreground border-border hover:border-[#4A7C59]/40"
        }`}
        aria-label="Filter öffnen"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>Filter</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-[#4A7C59] text-xs font-bold leading-none">
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

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-0">
              <FilterSection
                label="Zeit"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "Unter 30 Min", label: "Unter 30 Min" },
                  { value: "Unter 1 Std", label: "Unter 1 Std" },
                ]}
                value={timeFilter}
                onChange={(v) =>
                  onApply({ timeFilter: v, seasonFilter, cookedFilter, showVariants, photoType })
                }
              />

              <div className="border-b border-border" />

              <FilterSection
                label="Saison"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "spring", label: `${SEASON_ICONS["spring"]} ${SEASON_LABELS["spring"]}` },
                  { value: "summer", label: `${SEASON_ICONS["summer"]} ${SEASON_LABELS["summer"]}` },
                  { value: "autumn", label: `${SEASON_ICONS["autumn"]} ${SEASON_LABELS["autumn"]}` },
                  { value: "winter", label: `${SEASON_ICONS["winter"]} ${SEASON_LABELS["winter"]}` },
                ]}
                value={seasonFilter}
                onChange={(v) =>
                  onApply({ timeFilter, seasonFilter: v as Season | "Alle", cookedFilter, showVariants, photoType })
                }
              />

              <div className="border-b border-border" />

              <FilterSection
                label="Kochstatus"
                options={[
                  { value: "Alle", label: "Alle" },
                  { value: "gekocht", label: "✅ Schon gekocht" },
                  { value: "nicht_ausprobiert", label: "🆕 Noch nicht probiert" },
                ]}
                value={cookedFilter}
                onChange={(v) =>
                  onApply({
                    timeFilter,
                    seasonFilter,
                    cookedFilter: v as "Alle" | "gekocht" | "nicht_ausprobiert",
                    showVariants,
                    photoType,
                  })
                }
              />

              <div className="border-b border-border" />

              <FilterSection
                label="Foto"
                allValue="all"
                options={[
                  { value: "all", label: "Alle" },
                  { value: "none", label: "🚫 Kein Foto" },
                  { value: "ai", label: "✨ KI-generiert" },
                  { value: "scan", label: "📄 Aus Scan extrahiert" },
                  { value: "manual", label: "📤 Manuell hochgeladen" },
                ]}
                value={photoType}
                onChange={(v) =>
                  onApply({
                    timeFilter,
                    seasonFilter,
                    cookedFilter,
                    showVariants,
                    photoType: v as PhotoTypeFilter,
                  })
                }
              />

              {hasVariants && (
                <>
                  <div className="border-b border-border" />
                  <div className="py-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Varianten
                    </p>
                    <button
                      onClick={() =>
                        onApply({ timeFilter, seasonFilter, cookedFilter, showVariants: !showVariants, photoType })
                      }
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                        showVariants
                          ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                          : "bg-muted text-foreground border-border hover:border-[#4A7C59]/40"
                      }`}
                    >
                      {showVariants && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      🔀 Varianten anzeigen
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={handleReset}
                disabled={activeCount === 0}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zurücksetzen
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
  allValue = "Alle",
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  allValue?: string;
}) {
  return (
    <div className="py-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {label}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt) => {
          const active = value === opt.value;
          const isAll = opt.value === allValue;
          return (
            <button
              key={opt.value}
              onClick={() => {
                if (active && !isAll) {
                  onChange(allValue);
                } else {
                  onChange(opt.value);
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                  : isAll
                  ? "bg-muted text-foreground border-border hover:border-[#4A7C59]/40"
                  : "bg-white text-foreground border-border hover:border-[#4A7C59]/40"
              }`}
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
