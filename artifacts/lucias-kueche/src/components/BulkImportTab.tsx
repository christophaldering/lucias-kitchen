import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Loader2, Check, X, AlertTriangle, PenLine, ChevronDown, ChevronUp,
  Eye, RefreshCw, Trash2, Save, FileText, Clock
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
  updatedAt: string;
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
  };
  items: BulkImportItem[];
}

interface BulkImportResults {
  session: BulkImportStatus;
  groups: BulkImportFileGroup[];
}

const STATUS_CONFIG = {
  done: { label: "Fertig", color: "bg-green-100 text-green-800", icon: Check },
  uncertain: { label: "Unsicher", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  handwriting: { label: "Handschrift", color: "bg-violet-100 text-violet-800", icon: PenLine },
  failed: { label: "Fehlgeschlagen", color: "bg-red-100 text-red-800", icon: X },
  pending: { label: "Wartend", color: "bg-gray-100 text-gray-600", icon: Clock },
};

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

function ReviewDashboard({
  sessionId,
  onClear,
}: {
  sessionId: number;
  onClear: () => void;
}) {
  const [data, setData] = useState<BulkImportResults | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ savedCount: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    pollingRef.current = setInterval(fetchResults, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchResults]);

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

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/bulk-import/${sessionId}/save`, {
        method: "POST",
        headers: authHeaders(),
      });
      const json = await res.json();
      setSaveResult({ savedCount: json.savedCount ?? 0 });
      await fetchResults();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`${API_BASE}/bulk-import/${sessionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    onClear();
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

  const handwritingAndUncertain = allItems.filter(
    (i) => (i.status === "handwriting" || i.status === "uncertain") && !i.rejected
  );
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

      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">{saveResult.savedCount} Rezepte gespeichert!</p>
            <p className="text-sm text-green-700">Die Scan-Seiten wurden als Rezeptfotos hinterlegt und sind im Rezept sichtbar.</p>
          </div>
        </div>
      )}

      {!isProcessing && unsavedApproved.length > 0 && (
        <div className="flex justify-end">
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

      {priorityGroups.map(({ file, items }) => (
        <div key={file.id} className="border border-border rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-border px-4 py-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm text-foreground flex-1">{file.fileName}</span>
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

      {!isProcessing && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Session bereinigen
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkImportTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem("lk_bulk_import_session");
      return stored ? Number(stored) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("pdfs", file);
      }

      const res = await fetch(`${API_BASE}/bulk-import/start`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
      }

      const { sessionId: newSessionId } = await res.json() as { sessionId: number };
      localStorage.setItem("lk_bulk_import_session", String(newSessionId));
      setSessionId(newSessionId);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem("lk_bulk_import_session");
    setSessionId(null);
    setFiles([]);
    setError(null);
  };

  if (sessionId !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Import-Session #{sessionId}</h3>
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Neue Session starten
          </button>
        </div>
        <ReviewDashboard sessionId={sessionId} onClear={handleClear} />
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

          <button
            onClick={handleStart}
            disabled={uploading}
            className="w-full py-3 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird hochgeladen…
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
    </div>
  );
}
