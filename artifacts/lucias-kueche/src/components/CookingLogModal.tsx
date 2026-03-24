import { useState, useRef } from "react";
import { X, Check, Camera } from "lucide-react";
import { createCookingLogEntry, uploadCookingLogPhoto } from "@/hooks/useCookingLog";
import type { Recipe } from "@/types/recipe";

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onSaved: (updatedRecipe: unknown) => void;
}

function showToast(message: string, type: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
    type === "success" ? "bg-[#4A7C59]" : "bg-red-600"
  }`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function CookingLogModal({ recipe, onClose, onSaved }: Props) {
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(today);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (photo) {
        photoUrl = await uploadCookingLogPhoto(photo);
      }
      const result = await createCookingLogEntry({
        recipeId: recipe.id,
        date,
        comment: comment.trim() || null,
        photoUrl,
      });
      showToast(`${recipe.title} ins Tagebuch eingetragen! 🍳`);
      onSaved(result.recipe);
      onClose();
    } catch {
      showToast("Fehler beim Speichern", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <p className="text-xs text-green-200 font-medium mb-0.5">📓 Koch-Tagebuch</p>
            <h3 className="font-serif text-lg font-semibold leading-snug">{recipe.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              📅 Datum
            </label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 bg-white"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              💬 Kommentar <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Wie war's? Was würdest du nächstes Mal anders machen?"
              rows={3}
              className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              📷 Foto <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={photoPreview} alt="Vorschau" className="w-full h-40 object-cover" />
                <button
                  onClick={() => { setPhoto(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-[#4A7C59]/40 hover:bg-[#4A7C59]/5 transition-colors"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm">Foto auswählen</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {saving ? "Speichern…" : "Eintrag speichern"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
