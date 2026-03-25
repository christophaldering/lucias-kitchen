import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, X, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

interface ActiveSession {
  id: number;
  status: "pending" | "processing" | "done" | "failed";
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  updatedAt: string;
}

interface StatusResponse extends ActiveSession {
  errorCount: number;
  files: Array<{
    id: number;
    fileName: string;
    status: string;
  }>;
}

interface BulkImportProgressBarProps {
  onNavigateToImport: () => void;
  onImportDone?: () => void;
}

export function BulkImportProgressBar({ onNavigateToImport, onImportDone }: BulkImportProgressBarProps) {
  const [session, setSession] = useState<StatusResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [completionState, setCompletionState] = useState<"none" | "success" | "failed">("none");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionIdRef = useRef<number | null>(null);
  const completionStateRef = useRef<"none" | "success" | "failed">("none");

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async (sessionId: number) => {
    try {
      const res = await authFetch(`${API_BASE}/bulk-import/${sessionId}/status`, {
        headers: authHeaders(),
        skipUnauthorizedHandler: true,
      });
      if (!res.ok) {
        stopPolling();
        return;
      }
      const data = await res.json() as StatusResponse;
      setSession(data);

      if (data.status === "done") {
        stopPolling();
        completionStateRef.current = "success";
        setCompletionState("success");
        onImportDone?.();
        completionTimerRef.current = setTimeout(() => {
          completionStateRef.current = "none";
          setSession(null);
          setCompletionState("none");
          setDismissed(false);
          lastSessionIdRef.current = null;
        }, 10000);
      } else if (data.status === "failed") {
        stopPolling();
        completionStateRef.current = "failed";
        setCompletionState("failed");
        completionTimerRef.current = setTimeout(() => {
          completionStateRef.current = "none";
          setSession(null);
          setCompletionState("none");
          setDismissed(false);
          lastSessionIdRef.current = null;
        }, 10000);
      }
    } catch {
    }
  }, [stopPolling]);

  const checkForActiveSession = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/bulk-import/active`, {
        headers: authHeaders(),
        skipUnauthorizedHandler: true,
      });
      if (!res.ok) return;
      const data = await res.json() as ActiveSession | null;

      if (!data) {
        stopPolling();
        if (lastSessionIdRef.current !== null && completionStateRef.current === "none") {
          setSession(null);
          lastSessionIdRef.current = null;
        }
        return;
      }

      if (lastSessionIdRef.current !== data.id) {
        lastSessionIdRef.current = data.id;
        setDismissed(false);
        setCompletionState("none");
        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current);
        }
        stopPolling();
        await fetchStatus(data.id);
        pollingRef.current = setInterval(() => fetchStatus(data.id), 3000);
      }
    } catch {
    }
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    checkForActiveSession();
    const checkInterval = setInterval(checkForActiveSession, 5000);
    return () => {
      clearInterval(checkInterval);
      stopPolling();
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    };
  }, [checkForActiveSession, stopPolling]);

  const handleDismiss = () => {
    setDismissed(true);
    stopPolling();
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
  };

  if (dismissed || !session) return null;

  const pct = session.totalFiles > 0
    ? Math.round((session.processedFiles / session.totalFiles) * 100)
    : 0;

  const isRunning = session.status === "pending" || session.status === "processing";

  if (completionState === "success") {
    return (
      <div
        className="fixed bottom-16 left-0 right-0 z-50 flex justify-center px-4 pb-2 pointer-events-none"
        style={{ bottom: "calc(56px + 8px)" }}
      >
        <div className="pointer-events-auto w-full max-w-md bg-green-600 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-green-500">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Import abgeschlossen!</p>
            <p className="text-xs text-green-100">
              {session.processedFiles} von {session.totalFiles} Dateien verarbeitet
              {(session.errorCount ?? 0) > 0 && ` · ${session.errorCount} Fehler`}
            </p>
          </div>
          <button
            onClick={onNavigateToImport}
            className="flex items-center gap-1 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
          >
            Ergebnisse <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={handleDismiss} className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (completionState === "failed") {
    return (
      <div
        className="fixed bottom-16 left-0 right-0 z-50 flex justify-center px-4 pb-2 pointer-events-none"
        style={{ bottom: "calc(56px + 8px)" }}
      >
        <div className="pointer-events-auto w-full max-w-md bg-red-600 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-red-500">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Import fehlgeschlagen</p>
            <p className="text-xs text-red-100">Die Verarbeitung wurde unterbrochen</p>
          </div>
          <button
            onClick={onNavigateToImport}
            className="flex items-center gap-1 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
          >
            Details <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={handleDismiss} className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!isRunning) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center px-4 pb-2 pointer-events-none"
      style={{ bottom: "calc(56px + 8px)" }}
    >
      <div className="pointer-events-auto w-full max-w-md bg-[#1e3d2a] text-white rounded-2xl shadow-2xl px-4 py-3 border border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#e8a87a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {session.currentFile ?? "Import läuft…"}
            </p>
            <p className="text-xs text-green-300">
              {session.processedFiles} / {session.totalFiles} Dateien
              {(session.errorCount ?? 0) > 0 && (
                <span className="text-red-400 ml-1">· {session.errorCount} Fehler</span>
              )}
            </p>
          </div>
          <button
            onClick={onNavigateToImport}
            className="text-xs text-green-300 hover:text-white flex items-center gap-1 flex-shrink-0 transition-colors"
          >
            Details <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={handleDismiss} className="p-1 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-green-300" />
          </button>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div
            className="bg-[#e8a87a] h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-green-400 mt-1 text-right">{pct}%</p>
      </div>
    </div>
  );
}
