import { Loader2 } from "lucide-react";
import { useImportStatusContext } from "@/contexts/ImportStatusContext";

export function ImportInProgressBanner() {
  const { session, isActive, percent } = useImportStatusContext();

  if (!isActive || !session) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-amber-800">
          Import läuft — Ergebnisse noch unvollständig
        </p>
        <span className="ml-auto text-xs font-semibold text-amber-700 flex-shrink-0">
          {percent}%
        </span>
      </div>
      <div className="w-full bg-amber-200 rounded-full h-1.5 mb-2">
        <div
          className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-amber-700">
        {session.processedFiles} von {session.totalFiles} Dateien verarbeitet · Die Rezeptliste wird laufend aktualisiert.
      </p>
    </div>
  );
}
