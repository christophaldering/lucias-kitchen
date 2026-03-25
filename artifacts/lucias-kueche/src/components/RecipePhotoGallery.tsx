import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Image, Loader2, Trash2, X } from "lucide-react";
import type { RecipePhoto } from "@/types/recipe";
import { fetchRecipePhotos, uploadRecipePhoto, deleteRecipePhoto } from "@/hooks/useRecipes";

interface Props {
  recipeId: number;
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function RecipePhotoGallery({ recipeId }: Props) {
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<RecipePhoto | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecipePhotos(recipeId);
      setPhotos(data);
    } catch {
      setError("Fotos konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleFileSelected = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Bitte nur Bilddateien auswählen.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const photo = await uploadRecipePhoto(recipeId, file);
      setPhotos((prev) => [photo, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleDelete = async (photoId: number) => {
    try {
      await deleteRecipePhoto(recipeId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setConfirmDeleteId(null);
    } catch {
      setError("Foto konnte nicht gelöscht werden.");
      setConfirmDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif font-semibold text-lg text-foreground">📸 Meine Kochfotos</h3>
        <div className="flex gap-2">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
          />
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl text-xs font-medium hover:bg-secondary transition-colors disabled:opacity-50"
            title="Foto aus Galerie"
          >
            <Image className="w-3.5 h-3.5 text-[#C1693A]" />
            Galerie
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl text-xs font-medium hover:bg-secondary transition-colors disabled:opacity-50"
            title="Foto aufnehmen"
          >
            <Camera className="w-3.5 h-3.5 text-[#C1693A]" />
            Kamera
          </button>
          {uploading && <Loader2 className="w-4 h-4 animate-spin text-[#C1693A] self-center" />}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Noch keine Kochfotos. Mach ein Foto beim nächsten Kochen!
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border bg-white flex flex-col">
              <div className="aspect-square overflow-hidden">
                <img
                  src={photo.imageUrl}
                  alt="Kochfoto"
                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                  onClick={() => setLightboxPhoto(photo)}
                />
              </div>
              <div className="flex items-center justify-between px-2 py-1 bg-white">
                <p className="text-muted-foreground text-[10px] leading-tight">{formatDateTime(photo.createdAt)}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(photo.id); }}
                  className="p-0.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-colors"
                  title="Foto löschen"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold text-foreground mb-2">Foto löschen?</h4>
            <p className="text-sm text-muted-foreground mb-4">Dieses Kochfoto wird dauerhaft gelöscht. Fortfahren?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.imageUrl}
              alt="Kochfoto"
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
            />
            <p className="text-white/70 text-sm">{formatDateTime(lightboxPhoto.createdAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
