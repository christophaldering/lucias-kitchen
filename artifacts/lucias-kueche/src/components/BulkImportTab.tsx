import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Loader2, Check, X, AlertTriangle, PenLine, ChevronDown, ChevronUp,
  Eye, RefreshCw, Save, FileText, Clock, RotateCcw, History, Plus
} from "lucide-react";

const API_BASE = "/api";

function getToken(): string | null {
  try { return localStorage.getItem("lk_auth_token"); } catch { return null; }
}
function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface BulkImportStatus {
  id: number;
  status: "pending" | "processing" | "done" | "failed";
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  errorCount?: number;
  updatedAt: string;
  files?: FileStatusRow[];
}

interface FileStatusRow {
  id: number;
  fileName: string;
  status: "pending" | "processing" | "done" | "failed";
  errorText?: string | null;
  canRetry?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
}

interface BulkImportItem {
  id: number;
  status: "pending" | "done" | "uncertain" | "handwriting" | "failed";
  hasHandwriting: boolean;
  rejected: boolean;
  savedRecipeId: number | null;
  errorText: string | null;
  pageNumbers: number[];
  pageImageUrls: string[];
  recipeData: {
    title: string;
    servings?: number;
    prepTime?: string;
    totalTime?: string;
    difficulty?: string;
    category?: string;
    ingredients?: Array<{ amount: string; unit: string; name: string; note?: string }>;
    steps?: string[];
    notes?: string;
    personalNotes?: string;
    source?: string;
  } | null;
  fileName: string;
}

interface BulkImportFileGroup {
  file: {
    id: number;
    fileName: string;
    status: string;
    pageImageUrls: string[];
    startedAt?: string | null;
    finishedAt?: string | null;
  };
  items: BulkImportItem[];
}

interface BulkImportResults {
  session: BulkImportStatus;
  groups: BulkImportFileGroup[];
}

interface ImportHistoryEntry {
  id: number;
  createdAt: string;
  archivedAt: string | null;
  totalFiles: number;
  fileNames: string[];
  totalItems: number;
  savedItems: number;
  rejectedItems: number;
}

const STATUS_CONFIG = {
  done: { label: "Fertig", color: "bg-green-100 text-green-800", icon: Check },
  uncertain: { label: "Unsicher", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  handwriting: { label: "Handschrift", color: "bg-violet-100 text-violet-800", icon: PenLine },
  failed: { label: "Fehlgeschlagen", color: "bg-red-100 text-red-800", icon: X },
  pending: { label: "Wartend", color: "bg-gray-100 text-gray-600", icon: Clock },
};

const FILE_STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  pending: { label: "Wartend", color: "bg-gray-100", textColor: "text-gray-600" },
  processing: { label: "Wird verarbeitet", color: "bg-blue-100", textColor: "text-blue-700" },
  done: { label: "Fertig", color: "bg-green-100", textColor: "text-green-700" },
  failed: { label: "Fehler", color: "bg-red-100", textColor: "text-red-700" },
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function LightboxModal({ urls, initial, onClose }: { urls: string[]; initial: number; onClose: () => void }) {
  const [current, setCurrent] = useState(initial);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white hover:text-gray-300">
          <X className="w-7 h-7" />
        </button>
        <img src={urls[current]} alt={`Seite ${current + 1}`} className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl" />
        {urls.length > 1 && (
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            {urls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Seite ${i + 1}`}
                onClick={() => setCurrent(i)}
                className={`w-16 h-20 object-cover rounded cursor-pointer border-2 transition-colors ${i === current ? "border-white" : "border-transparent opacity-60 hover:opacity-90"}`}
              />
            ))}
          </div>
        )}
        <p className="text-white/70 text-sm mt-2">Seite {current + 1} von {urls.length}</p>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onReject,
  onRestore,
}: {
  item: BulkImportItem;
  onReject: (id: number) => void;
  onRestore: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const rd = item.recipeData;

  const pageLabel = item.pageNumbers.length > 0
    ? item.pageNumbers.length === 1
      ? `Seite ${item.pageNumbers[0]}`
      : `Seiten ${Math.min(...item.pageNumbers)}–${Math.max(...item.pageNumbers)}`
    : null;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${item.rejected ? "opacity-50 bg-gray-50 border-gray-200" : "bg-white border-border"}`}>
      {lightbox !== null && item.pageImageUrls.length > 0 && (
        <LightboxModal
          urls={item.pageImageUrls}
          initial={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="flex items-start gap-3 p-3">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 mt-0.5 ${cfg.color}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground leading-snug">
            {rd?.title ?? "Unbekanntes Rezept"}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {rd?.category && (
              <span className="text-xs text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">{rd.category}</span>
            )}
            {pageLabel && (
              <span className="text-xs text-muted-foreground">{pageLabel}</span>
            )}
            {item.hasHandwriting && (
              <span className="text-xs flex items-center gap-1 text-violet-700">
                <PenLine className="w-3 h-3" /> Handschrift
              </span>
            )}
            {item.savedRecipeId && (
              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> Gespeichert
              </span>
            )}
          </div>
          {item.status === "failed" && item.errorText && (
            <p className="text-xs text-red-600 mt-1">{item.errorText}</p>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          {item.pageImageUrls.length > 0 && (
            <button
              onClick={() => setLightbox(0)}
              title="Vorschau anzeigen"
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {rd && (
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Einklappen" : "Details"} 
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          {!item.rejected && !item.savedRecipeId ? (
            <button
              onClick={() => onReject(item.id)}
              title="Ablehnen"
              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-muted-foreground hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          ) : item.rejected ? (
            <button
              onClick={() => onRestore(item.id)}
              title="Wiederherstellen"
              className="p-1.5 hover:bg-green-50 rounded-lg transition-colors text-muted-foreground hover:text-green-600"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {item.pageImageUrls.length > 0 && (
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
          {item.pageImageUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Seite ${item.pageNumbers[i] ?? i + 1}`}
              onClick={() => setLightbox(i)}
              className="w-12 h-16 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            />
          ))}
        </div>
      )}

      {expanded && rd && (
        <div className="px-3 pb-3 border-t border-border pt-2 space-y-2 text-xs text-muted-foreground">
          {rd.ingredients && rd.ingredients.length > 0 && (
            <div>
              <p className="font-semibold text-foreground mb-1">{rd.ingredients.length} Zutaten</p>
              <ul className="list-disc list-inside space-y-0.5">
                {rd.ingredients.slice(0, 5).map((ing, i) => (
                  <li key={i}>{ing.amount} {ing.unit} {ing.name}</li>
                ))}
                {rd.ingredients.length > 5 && <li>+{rd.ingredients.length - 5} weitere</li>}
              </ul>
            </div>
          )}
          {rd.personalNotes && (
            <div>
              <p className="font-semibold text-violet-700 flex items-center gap-1 mb-0.5"><PenLine className="w-3 h-3" /> Handschriftliche Notizen</p>
              <p className="text-violet-600 italic">{rd.personalNotes}</p>
            </div>
          )}
          {rd.notes && (
            <div>
              <p className="font-semibold text-foreground mb-0.5">Notizen</p>
              <p>{rd.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileStatusTable({
  sessionId,
  statusData,
  onRetry,
}: {
  sessionId: number;
  statusData: BulkImportStatus;
  onRetry: (fileId: number) => void;
}) {
  const files = statusData.files ?? [];
  const isRunning = statusData.status === "pending" || statusData.status === "processing";

  if (files.length === 0) return null;

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Datei-Status</span>
        {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A7C59] ml-auto" />}
      </div>
      <div className="divide-y divide-border">
        {files.map((file) => {
          const cfg = FILE_STATUS_CONFIG[file.status] ?? FILE_STATUS_CONFIG.pending;
          const duration = formatDuration(file.startedAt, file.finishedAt);
          const isProcessingThis = file.status === "processing";

          return (
            <div key={file.id} className="px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.textColor} flex items-center gap-1`}>
                  {isProcessingThis && <Loader2 className="w-3 h-3 animate-spin" />}
                  {file.status === "done" && <Check className="w-3 h-3" />}
                  {file.status === "failed" && <X className="w-3 h-3" />}
                  {file.status === "pending" && <Clock className="w-3 h-3" />}
                  {cfg.label}
                </div>
                <span className="flex-1 text-sm text-foreground truncate min-w-0">{file.fileName}</span>
                {duration && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">{duration}</span>
                )}
                {file.status === "failed" && file.canRetry && (
                  <button
                    onClick={() => onRetry(file.id)}
                    title="Erneut versuchen"
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 flex-shrink-0 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
              {file.status === "failed" && file.errorText && (
                <p className="text-xs text-red-600 mt-1 ml-1">{file.errorText}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewDashboard({
  sessionId,
  onArchiveAndReset,
}: {
  sessionId: number;
  onArchiveAndReset: () => Promise<void>;
}) {
  const [data, setData] = useState<BulkImportResults | null>(null);
  const [statusData, setStatusData] = useState<BulkImportStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{ savedCount: number; newTotal?: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bulk-import/${sessionId}/status`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json() as BulkImportStatus;
      setStatusData(json);
    } catch {
    }
  }, [sessionId]);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bulk-import/${sessionId}/results`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json() as BulkImportResults;
      setData(json);

      const isProcessing = json.session.status === "pending" || json.session.status === "processing";
      if (!isProcessing && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch {
    }
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
    fetchStatus();
    pollingRef.current = setInterval(() => {
      fetchResults();
      fetchStatus();
    }, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchResults, fetchStatus]);

  const handleReject = async (itemId: number) => {
    await fetch(`${API_BASE}/bulk-import/${sessionId}/reject/${itemId}`, {
      method: "POST",
      headers: authHeaders(),
    });
    await fetchResults();
  };

  const handleRestore = async (itemId: number) => {
    await fetch(`${API_BASE}/bulk-import/${sessionId}/restore/${itemId}`, {
      method: "POST",
      headers: authHeaders(),
    });
    await fetchResults();
  };

  const handleRetry = async (fileId: number) => {
    await fetch(`${API_BASE}/bulk-import/${sessionId}/retry/${fileId}`, {
      method: "POST",
      headers: authHeaders(),
    });
    await fetchResults();
    await fetchStatus();
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/bulk-import/${sessionId}/save`, {
        method: "POST",
        headers: authHeaders(),
      });
      const json = await res.json();
      const savedCount = json.savedCount ?? 0;
      let newTotal: number | undefined;
      try {
        const countRes = await fetch(`${API_BASE}/recipes/count`, { headers: authHeaders() });
        if (countRes.ok) {
          const countJson = await countRes.json();
          newTotal = countJson.count ?? countJson.total ?? undefined;
        }
      } catch { }
      setSaveResult({ savedCount, newTotal });
      await fetchResults();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveAndUpload = async () => {
    setArchiving(true);
    setArchiveError(null);
    try {
      const res = await fetch(`${API_BASE}/bulk-import/${sessionId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = (errJson as { message?: string }).message ?? `Fehler ${res.status}`;
        setArchiveError(msg);
        return;
      }
      await onArchiveAndReset();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Archivierung fehlgeschlagen");
    } finally {
      setArchiving(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
      </div>
    );
  }

  const { session, groups } = data;
  const isProcessing = session.status === "pending" || session.status === "processing";
  const allItems = groups.flatMap((g) => g.items);
  const approvedItems = allItems.filter((i) => !i.rejected && i.status !== "failed" && i.recipeData != null);
  const unsavedApproved = approvedItems.filter((i) => i.savedRecipeId == null);
  const totalSaved = allItems.filter((i) => i.savedRecipeId != null).length;

  const priorityGroups = groups.map((g) => ({
    ...g,
    items: [
      ...g.items.filter((i) => i.status === "handwriting" || i.status === "uncertain"),
      ...g.items.filter((i) => i.status !== "handwriting" && i.status !== "uncertain"),
    ],
  }));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-foreground">
              {isProcessing ? "Verarbeitung läuft…" : "Import abgeschlossen"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {session.processedFiles} / {session.totalFiles} Dateien verarbeitet
              {session.currentFile && ` · ${session.currentFile}`}
            </p>
          </div>
          {isProcessing && <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />}
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-[#4A7C59] h-2 rounded-full transition-all duration-500"
            style={{ width: `${session.totalFiles > 0 ? (session.processedFiles / session.totalFiles) * 100 : 0}%` }}
          />
        </div>

        {!isProcessing && (
          <div className="flex gap-3 mt-4 flex-wrap">
            <p className="text-sm text-muted-foreground flex-1">
              {allItems.length} Rezepte gefunden · {approvedItems.length} genehmigt · {allItems.filter((i) => i.rejected).length} abgelehnt
            </p>
            {totalSaved > 0 && (
              <p className="text-sm text-green-700 font-medium">{totalSaved} gespeichert</p>
            )}
          </div>
        )}
      </div>

      {statusData && (
        <FileStatusTable
          sessionId={sessionId}
          statusData={statusData}
          onRetry={handleRetry}
        />
      )}

      {archiveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {archiveError}
        </div>
      )}

      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-800">
              {saveResult.savedCount} neue Rezepte importiert
              {saveResult.newTotal !== undefined && (
                <span className="font-normal"> – jetzt <span className="font-bold">{saveResult.newTotal}</span> Rezepte in deiner Küche</span>
              )}
            </p>
            <p className="text-sm text-green-700">Die Scan-Seiten wurden als Rezeptfotos hinterlegt und sind im Rezept sichtbar.</p>
          </div>
          <button
            onClick={handleArchiveAndUpload}
            disabled={archiving}
            className="flex items-center gap-2 px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex-shrink-0 ml-2"
          >
            {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {archiving ? "Archiviere…" : "Neue Rezepte hochladen"}
          </button>
        </div>
      )}

      {!isProcessing && unsavedApproved.length > 0 && (
        <div className="flex justify-end gap-3">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Speichern…" : `Alle ${unsavedApproved.length} genehmigten speichern`}
          </button>
        </div>
      )}

      {!isProcessing && saveResult === null && unsavedApproved.length === 0 && totalSaved > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleArchiveAndUpload}
            disabled={archiving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50"
          >
            {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {archiving ? "Archiviere…" : "Neue Rezepte hochladen"}
          </button>
        </div>
      )}

      {priorityGroups.map(({ file, items }) => (
        <div key={file.id} className="border border-border rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-border px-4 py-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm text-foreground flex-1">{file.fileName}</span>
            {file.startedAt && file.finishedAt && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(file.startedAt, file.finishedAt)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{items.length} Rezept{items.length !== 1 ? "e" : ""}</span>
          </div>
          <div className="p-3 space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Keine Rezepte gefunden</p>
            ) : (
              items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onReject={handleReject}
                  onRestore={handleRestore}
                />
              ))
            )}
          </div>
        </div>
      ))}

    </div>
  );
}

function ImportHistory() {
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/bulk-import/history`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json() as ImportHistoryEntry[];
        setHistory(data);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading || history.length === 0) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground flex-1">Import-Verlauf</span>
        <span className="text-xs text-muted-foreground">{history.length} Import{history.length !== 1 ? "e" : ""}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="divide-y divide-border">
          {history.map((entry) => (
            <div key={entry.id} className="px-4 py-3 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {entry.archivedAt ? formatDate(entry.archivedAt) : formatDate(entry.createdAt)}
                  </p>
                  <p className="text-sm text-foreground font-medium truncate">
                    {entry.fileNames.length === 1
                      ? entry.fileNames[0]
                      : `${entry.fileNames[0]}${entry.fileNames.length > 1 ? ` +${entry.fileNames.length - 1} weitere` : ""}`}
                  </p>
                </div>
                <div className="flex gap-3 flex-shrink-0 text-xs">
                  <span className="text-green-700 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> {entry.savedItems} gespeichert
                  </span>
                  {entry.rejectedItems > 0 && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> {entry.rejectedItems} abgelehnt
                    </span>
                  )}
                </div>
              </div>
              {entry.fileNames.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.fileNames.slice(0, 4).map((name, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-muted-foreground px-2 py-0.5 rounded-full truncate max-w-[150px]">
                      {name}
                    </span>
                  ))}
                  {entry.fileNames.length > 4 && (
                    <span className="text-xs text-muted-foreground px-2 py-0.5">+{entry.fileNames.length - 4} weitere</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BulkImportTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem("lk_bulk_import_session");
      return stored ? Number(stored) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionId === null) {
      const fetchActive = async () => {
        try {
          const res = await fetch(`${API_BASE}/bulk-import/active`, {
            headers: authHeaders(),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.id) {
            localStorage.setItem("lk_bulk_import_session", String(data.id));
            setSessionId(data.id);
          }
        } catch {
        }
      };
      fetchActive();
    }
  }, [sessionId]);

  const handleFiles = (newFiles: FileList | File[]) => {
    const pdfs = Array.from(newFiles).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setError("Bitte nur PDF-Dateien auswählen.");
      return;
    }
    setError(null);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !existing.has(f.name))];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleStart = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: files.length });

    try {
      // Upload first file to create the session
      const firstForm = new FormData();
      firstForm.append("pdfs", files[0]);

      setUploadProgress({ current: 1, total: files.length });
      const firstRes = await fetch(`${API_BASE}/bulk-import/start`, {
        method: "POST",
        headers: authHeaders(),
        body: firstForm,
      });

      if (!firstRes.ok) {
        const err = await firstRes.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `HTTP ${firstRes.status}`);
      }

      const { sessionId: newSessionId } = await firstRes.json() as { sessionId: number };
      localStorage.setItem("lk_bulk_import_session", String(newSessionId));

      // Upload remaining files one at a time to avoid proxy size limits
      for (let i = 1; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const form = new FormData();
        form.append("pdf", files[i]);

        const res = await fetch(`${API_BASE}/bulk-import/${newSessionId}/add-file`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`Datei "${files[i].name}": ${(err as { message?: string }).message ?? `HTTP ${res.status}`}`);
        }
      }

      setSessionId(newSessionId);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleArchiveAndReset = async () => {
    localStorage.removeItem("lk_bulk_import_session");
    setSessionId(null);
    setFiles([]);
    setError(null);
    setHistoryKey((k) => k + 1);
  };

  if (sessionId !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Import-Session #{sessionId}</h3>
        </div>
        <ReviewDashboard sessionId={sessionId} onArchiveAndReset={handleArchiveAndReset} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Massen-Import</h3>
        <p className="text-sm text-muted-foreground">
          Mehrere PDF-Kochbuch-Scans auf einmal hochladen. Die KI extrahiert alle Rezepte und erkennt handschriftliche Anmerkungen.
        </p>
      </div>

      <div
        ref={dropRef}
        className="border-2 border-dashed border-[#4A7C59]/40 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-[#4A7C59]/70 hover:bg-[#4A7C59]/5 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload className="w-10 h-10 text-[#4A7C59]/60" />
        <div className="text-center">
          <p className="font-semibold text-foreground">PDFs hier ablegen</p>
          <p className="text-sm text-muted-foreground mt-0.5">Mehrfachauswahl möglich · nur PDF-Dateien</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {files.length} Datei{files.length !== 1 ? "en" : ""} · {formatSize(totalSize)}
            </p>
            <button onClick={() => setFiles([])} className="text-xs text-muted-foreground hover:text-red-500 transition-colors">
              Alle entfernen
            </button>
          </div>

          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatSize(file.size)}</span>
                <button onClick={() => removeFile(file.name)} className="p-0.5 hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          {uploadProgress && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Datei {uploadProgress.current} von {uploadProgress.total} wird hochgeladen…</span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)} %</span>
              </div>
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4A7C59] rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={uploading}
            className="w-full py-3 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadProgress
                  ? `Datei ${uploadProgress.current} / ${uploadProgress.total} hochladen…`
                  : "Wird hochgeladen…"}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {files.length} PDF{files.length !== 1 ? "s" : ""} importieren
              </>
            )}
          </button>
        </div>
      )}

      <div className="bg-[#4A7C59]/5 border border-[#4A7C59]/20 rounded-xl p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-2">Hinweise</p>
        <p>· Bis zu 76 PDFs können auf einmal hochgeladen werden</p>
        <p>· Pro PDF können mehrere Rezepte erkannt werden</p>
        <p>· Handschriftliche Anmerkungen werden automatisch erkannt</p>
        <p>· Der Import läuft im Hintergrund – du kannst die Seite neu laden</p>
        <p>· Scan-Seiten werden als Rezeptfotos gespeichert</p>
      </div>

      <ImportHistory key={historyKey} />
    </div>
  );
}
