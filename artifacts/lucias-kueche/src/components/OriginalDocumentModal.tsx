import { X } from "lucide-react";

interface Props {
  url: string;
  onClose: () => void;
}

function isPdf(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return lower.endsWith(".pdf");
}

export default function OriginalDocumentModal({ url, onClose }: Props) {
  const pdf = isPdf(url);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative bg-white rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:w-auto sm:h-auto sm:max-w-4xl sm:max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#4A7C59] text-white flex-shrink-0 rounded-none sm:rounded-t-2xl">
          <span className="text-sm font-semibold">
            {pdf ? "📄 Original-Dokument" : "🖼️ Original-Bild"}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto min-h-0 flex items-start justify-center bg-neutral-100 sm:rounded-b-2xl">
          {pdf ? (
            <iframe
              src={url}
              title="Original-Dokument"
              className="w-full h-full min-h-[70vh] border-0"
            />
          ) : (
            <img
              src={url}
              alt="Original"
              className="max-w-full max-h-full object-contain p-4"
            />
          )}
        </div>
      </div>
    </div>
  );
}
