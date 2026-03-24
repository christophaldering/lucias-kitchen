import { useState } from "react";
import { X, Loader2, Users } from "lucide-react";
import { useGroups } from "@/hooks/useGroups";

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function GroupCreateModal({ onClose, onCreated }: Props) {
  const { createGroup } = useGroups();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createGroup(name.trim(), imageUrl.trim() || undefined);
      toast("Gruppe eingereicht – wartet auf Admin-Freigabe");
      onCreated();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Fehler beim Erstellen", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#4A7C59]" />
            <h2 className="font-serif text-lg font-semibold">Neue Gruppe erstellen</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Neue Gruppen müssen zuerst von Lucia freigegeben werden, bevor sie aktiv sind.
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Gruppenname <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Familie Müller, Kochclub 2026…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Bild-URL <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
            />
            {imageUrl && (
              <div className="mt-2 w-16 h-16 rounded-xl overflow-hidden border border-border">
                <img src={imageUrl} alt="Vorschau" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
              Abbrechen
            </button>
            <button type="submit" disabled={busy || !name.trim()}
              className="flex-1 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Einreichen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
