import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Image, Loader2, Trash2, X, Link, Star } from "lucide-react";
import type { RecipePhoto, Recipe } from "@/types/recipe";
import { PHOTO_SOURCE_LABELS } from "@/types/recipe";
import { fetchRecipePhotos, uploadRecipePhoto, deleteRecipePhoto, linkPhotoToRecipe, setPhotoAsMain } from "@/hooks/useRecipes";

interface Props {
  recipeId: number;
  allRecipes?: Recipe[];
  currentImageUrl?: string | null;
  onSetAsMain?: (imageUrl: string) => void;
  isOwner?: boolean;
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

const SOURCE_COLORS: Record<string, string> = {
  original: "bg-amber-100 text-amber-700",
  upload: "bg-blue-100 text-blue-700",
  ai: "bg-purple-100 text-purple-700",
  cooked: "bg-green-100 text-green-700",
  web: "bg-sky-100 text-sky-700",
};

export default function RecipePhotoGallery({ recipeId, allRecipes, currentImageUrl, onSetAsMain, isOwner }: Props) {
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<RecipePhoto | null>(null);
  const [linkingPhoto, setLinkingPhoto] = useState<RecipePhoto | null>(null);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState(false);
  const [settingMainPhotoId, setSettingMainPhotoId] = useState<number | null>(null);
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
      if (photo.setAsMain && onSetAsMain) {
        onSetAsMain(photo.imageUrl);
      }
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

  const openLinkDialog = (photo: RecipePhoto) => {
    setLinkingPhoto(photo);
    setSelectedRecipeIds(new Set());
  };

  const handleLinkToRecipes = async () => {
    if (!linkingPhoto || selectedRecipeIds.size === 0) return;
    setLinking(true);
    try {
      for (const rid of selectedRecipeIds) {
        await linkPhotoToRecipe(linkingPhoto.id, rid);
      }
      setLinkingPhoto(null);
      setSelectedRecipeIds(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verknüpfung fehlgeschlagen.");
    } finally {
      setLinking(false);
    }
  };

  const handleSetAsMain = async (photo: RecipePhoto) => {
    setSettingMainPhotoId(photo.id);
    setError(null);
    try {
      const result = await setPhotoAsMain(recipeId, photo.id);
      setPhotos((prev) =>
        prev.map((p) => ({ ...p, isMain: p.id === photo.id }))
      );
      if (onSetAsMain) onSetAsMain(result.imageUrl);
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Setzen des Hauptbilds.");
    } finally {
      setSettingMainPhotoId(null);
    }
  };

  const otherRecipes = allRecipes?.filter((r) => r.id !== recipeId) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif font-semibold text-lg text-foreground">📸 Alle Fotos</h3>
        {isOwner && (
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
        )}
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
          Noch keine Fotos für dieses Rezept.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo) => {
            const isCurrentMain = photo.isMain || currentImageUrl === photo.imageUrl;
            const sourceLabel = photo.source ? PHOTO_SOURCE_LABELS[photo.source] : null;
            const sourceColor = photo.source ? SOURCE_COLORS[photo.source] : "";
            return (
              <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border bg-white flex flex-col">
                {isCurrentMain && (
                  <span className="absolute top-1 left-1 z-10 bg-[#4A7C59] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-white" />
                    Hauptbild
                  </span>
                )}
                {sourceLabel && !isCurrentMain && (
                  <span className={`absolute top-1 left-1 z-10 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${sourceColor}`}>
                    {sourceLabel}
                  </span>
                )}
                {sourceLabel && isCurrentMain && (
                  <span className={`absolute top-1 right-1 z-10 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${sourceColor}`}>
                    {sourceLabel}
                  </span>
                )}
                <div className="aspect-square overflow-hidden">
                  <img
                    src={photo.imageUrl}
                    alt="Foto"
                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                    onClick={() => setLightboxPhoto(photo)}
                  />
                </div>
                <div className="flex items-center justify-between px-2 py-1 bg-white gap-1">
                  <p className="text-muted-foreground text-[10px] leading-tight truncate flex-1">{formatDateTime(photo.createdAt)}</p>
                  <div className="flex gap-1 flex-shrink-0">
                    {isOwner && onSetAsMain && !isCurrentMain && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSetAsMain(photo); }}
                        disabled={settingMainPhotoId === photo.id}
                        className="flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-medium hover:bg-amber-50 text-amber-500 hover:text-amber-700 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                        title="Als Hauptbild setzen"
                      >
                        {settingMainPhotoId === photo.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <Star className="w-2.5 h-2.5" />
                        }
                        Hauptbild
                      </button>
                    )}
                    {isOwner && otherRecipes.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openLinkDialog(photo); }}
                        className="p-0.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded transition-colors"
                        title="Mit weiteren Rezepten verknüpfen"
                      >
                        <Link className="w-3 h-3" />
                      </button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(photo.id); }}
                        className="p-0.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-colors"
                        title="Foto löschen"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold text-foreground mb-2">Foto löschen?</h4>
            <p className="text-sm text-muted-foreground mb-4">Dieses Foto wird dauerhaft gelöscht. Fortfahren?</p>
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

      {linkingPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setLinkingPhoto(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-foreground">Mit Rezepten verknüpfen</h4>
              <button onClick={() => setLinkingPhoto(null)} className="p-1 hover:bg-secondary rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Wähle weitere Rezepte, denen dieses Foto zugeordnet werden soll:
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4">
              {otherRecipes.map((r) => (
                <label key={r.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRecipeIds.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selectedRecipeIds);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setSelectedRecipeIds(next);
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">{r.title}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLinkingPhoto(null)}
                className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleLinkToRecipes}
                disabled={selectedRecipeIds.size === 0 || linking}
                className="px-4 py-2 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#A85830] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {linking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verknüpfen ({selectedRecipeIds.size})
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
              alt="Foto"
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
            />
            <div className="flex items-center gap-2">
              <p className="text-white/70 text-sm">{formatDateTime(lightboxPhoto.createdAt)}</p>
              {lightboxPhoto.source && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[lightboxPhoto.source] ?? "bg-gray-100 text-gray-600"}`}>
                  {PHOTO_SOURCE_LABELS[lightboxPhoto.source]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
