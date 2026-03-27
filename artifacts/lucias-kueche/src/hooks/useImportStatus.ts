import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

export interface ImportSession {
  id: number;
  status: "pending" | "processing" | "done" | "failed";
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  updatedAt: string;
  errorCount: number;
}

export interface UseImportStatusOptions {
  onImportDone?: () => void;
}

export interface UseImportStatusResult {
  session: ImportSession | null;
  isActive: boolean;
  percent: number;
}

export function useImportStatus(options?: UseImportStatusOptions): UseImportStatusResult {
  const { onImportDone } = options ?? {};
  const [session, setSession] = useState<ImportSession | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSessionIdRef = useRef<number | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onImportDoneRef = useRef(onImportDone);
  useEffect(() => { onImportDoneRef.current = onImportDone; }, [onImportDone]);

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
      const data = await res.json() as ImportSession;
      setSession(data);

      if (data.status === "done") {
        stopPolling();
        completionStateRef.current = "success";
        onImportDoneRef.current?.();
        doneTimerRef.current = setTimeout(() => {
          completionStateRef.current = "none";
          setSession(null);
          lastSessionIdRef.current = null;
        }, 10000);
      } else if (data.status === "failed") {
        stopPolling();
        completionStateRef.current = "failed";
        doneTimerRef.current = setTimeout(() => {
          completionStateRef.current = "none";
          setSession(null);
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
      const data = await res.json() as { id: number; status: string; totalFiles: number; processedFiles: number; currentFile: string | null; updatedAt: string } | null;

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
        completionStateRef.current = "none";
        if (doneTimerRef.current) {
          clearTimeout(doneTimerRef.current);
          doneTimerRef.current = null;
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
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [checkForActiveSession, stopPolling]);

  const isActive = session !== null && (session.status === "pending" || session.status === "processing");
  const percent = session && session.totalFiles > 0
    ? Math.round((session.processedFiles / session.totalFiles) * 100)
    : 0;

  return { session, isActive, percent };
}
