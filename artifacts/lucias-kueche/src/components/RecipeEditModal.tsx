import { useState, useMemo, useRef } from "react";
import { X, Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2, Camera, Image, XCircle, Printer } from "lucide-react";
import type { Recipe, IngredientInput, Season } from "@/types/recipe";
import { SEASON_LABELS, SEASON_ICONS } from "@/types/recipe";
import type { RecipeUpdatePayload } from "@/hooks/useRecipes";
import { uploadRecipeImage } from "@/hooks/useRecipes";
import RecipePrintView from "@/components/RecipePrintView";

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onSave: (id: number, data: RecipeUpdatePayload) => Promise<void>;
  knownCategories?: string[];
  isNewVariant?: boolean;
  parentRecipeId?: number;
}

const DEFAULT_CATEGORIES = ["Fisch", "Geflügel", "Fleisch", "Vegetarisch", "Pasta"];
const DIFFICULTIES = ["simpel", "normal", "schwer"] as const;
const RATINGS = ["", "lecker", "sehr lecker"] as const;
const LK_CUSTOM_CATEGORIES_KEY = "lk_customCategories";
const ALL_SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

type IngRow = { amount: string; unit: string; name: string; note: string };

export default function RecipeEditModal({ recipe, onClose, onSave, knownCategories, isNewVariant, parentRecipeId }: Props) {
  const allCategories = useMemo(() => {
    const custom: string[] = (() => {
      try { return JSON.parse(localStorage.getItem(LK_CUSTOM_CATEGORIES_KEY) ?? "[]"); }
      catch { return []; }
    })();
    const base = knownCategories ?? DEFAULT_CATEGORIES;
    return Array.from(new Set([...base, ...custom])).sort();
  }, [knownCategories]);

  const [variantName, setVariantName] = useState(recipe.variantName ?? "");
  const [title, setTitle] = useState(recipe.title);
  const [category, setCategory] = useState(recipe.category);
  const [customCategory, setCustomCategory] = useState(
    allCategories.includes(recipe.category) ? "" : recipe.category
  );
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>(recipe.difficulty);
  const [prepTime, setPrepTime] = useState(recipe.prepTime ?? "");
  const [totalTime, setTotalTime] = useState(recipe.totalTime ?? "");
  const [servings, setServings] = useState(recipe.servings?.toString() ?? "");
  const [kcal, setKcal] = useState(recipe.kcalPerPortion?.toString() ?? "");
  const [source, setSource] = useState(recipe.source ?? "");
  const [rating, setRating] = useState(recipe.rating ?? "");
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [ingredients, setIngredients] = useState<IngRow[]>(
    recipe.ingredients.map((i) => ({
      amount: i.amount,
      unit: i.unit,
      name: i.name,
      note: i.note ?? "",
    }))
  );
  const [steps, setSteps] = useState<string[]>([...recipe.steps]);
  const [seasons, setSeasons] = useState<Season[]>((recipe.seasons ?? []) as Season[]);
  const [imageUrl, setImageUrl] = useState<string | null>(recipe.imageUrl ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(recipe.imageUrl ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveCategory = allCategories.includes(category) ? category : customCategory;

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Bitte nur Bilddateien auswählen.");
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return localPreview;
    });
    setUploadingImage(true);
    setError("");
    try {
      const url = await uploadRecipeImage(file);
      setImageUrl(url);
    } catch {
      setError("Foto-Upload fehlgeschlagen. Bitte erneut versuchen.");
      URL.revokeObjectURL(localPreview);
      setImagePreview(imageUrl);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setImageUrl(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const addIngredient = () =>
    setIngredients((prev) => [...prev, { amount: "", unit: "", name: "", note: "" }]);
  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof IngRow, val: string) =>
    setIngredients((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const toggleSeason = (s: Season) =>
    setSeasons((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const addStep = () => setSteps((prev) => [...prev, ""]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, val: string) =>
    setSteps((prev) => prev.map((s, idx) => idx === i ? val : s));
  const moveStep = (i: number, dir: -1 | 1) => {
    const next = [...steps];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError("Bitte einen Titel eingeben."); return; }
    if (!effectiveCategory.trim()) { setError("Bitte eine Kategorie angeben."); return; }
    if (isNewVariant && !variantName.trim()) { setError('Bitte einen Variantennamen eingeben (z.B. "vegetarisch").'); return; }
    const validIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.trim());
    setSaving(true);
    setError("");
    try {
      const payload: RecipeUpdatePayload = {
        title: title.trim(),
        category: effectiveCategory.trim(),
        difficulty,
        prepTime: prepTime.trim() || null,
        totalTime: totalTime.trim() || null,
        servings: servings ? parseInt(servings, 10) : null,
        kcalPerPortion: kcal ? parseInt(kcal, 10) : null,
        source: source.trim() || null,
        rating: rating || null,
        notes: notes.trim() || null,
        steps: validSteps,
        ingredients: validIngredients.map((i) => ({
          amount: i.amount,
          unit: i.unit,
          name: i.name,
          note: i.note || null,
        })),
        imageUrl: imageUrl ?? null,
        seasons,
        parentRecipeId: parentRecipeId ?? recipe.parentRecipeId ?? null,
        variantName: variantName.trim() || null,
      };
      await onSave(recipe.id, payload);
      onClose();
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="sticky top-0 z-10 bg-[#C1693A] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <h2 className="font-serif text-lg font-semibold">
            {isNewVariant ? "🔀 Variante erstellen" : "✏️ Rezept bearbeiten"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {isNewVariant && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              Dieses Rezept wird als Variante gespeichert. Gib einen Variantennamen ein, z.B. „vegetarisch" oder „glutenfrei".
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(isNewVariant || variantName) && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                  Variantenname {isNewVariant ? "*" : ""}
                </label>
                <input
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="z.B. vegetarisch, glutenfrei, Schnellversion…"
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Titel *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Kategorie *</label>
              <select value={allCategories.includes(category) ? category : "__custom__"}
                onChange={(e) => { setCategory(e.target.value); if (e.target.value !== "__custom__") setCustomCategory(""); }}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30">
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">Eigene…</option>
              </select>
              {!allCategories.includes(category) && (
                <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Kategorie eingeben"
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Schwierigkeitsgrad</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof DIFFICULTIES[number])}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30">
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Vorbereitungszeit</label>
              <input value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="z.B. ca. 20 Minuten"
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Gesamtzeit</label>
              <input value={totalTime} onChange={(e) => setTotalTime(e.target.value)} placeholder="z.B. ca. 1 Stunde"
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Portionen</label>
              <input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">kcal / Portion</label>
              <input type="number" min="1" value={kcal} onChange={(e) => setKcal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Quelle</label>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="z.B. Chefkoch"
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Bewertung</label>
              <select value={rating} onChange={(e) => setRating(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30">
                <option value="">– keine –</option>
                <option value="lecker">👍 lecker</option>
                <option value="sehr lecker">⭐ sehr lecker</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Lucias Notizen</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C1693A]/30 resize-none" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">🌿 Saison</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SEASONS.map((s) => {
                  const active = seasons.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSeason(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                          : "bg-white text-foreground border-border hover:border-[#4A7C59]/50"
                      }`}
                    >
                      {SEASON_ICONS[s]} {SEASON_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Alle auswählen = ganzjährig</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">📷 Rezeptfoto</label>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
            />
            {imagePreview ? (
              <div className="relative w-full rounded-xl overflow-hidden border border-border bg-white">
                <img src={imagePreview} alt="Rezeptfoto Vorschau" className="w-full h-40 object-cover" />
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md hover:bg-red-50 text-red-500 transition-colors"
                  title="Foto entfernen"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <Image className="w-4 h-4 text-[#C1693A]" />
                  Aus Galerie wählen
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-[#C1693A]" />
                  Foto aufnehmen
                </button>
                {uploadingImage && <Loader2 className="w-5 h-5 animate-spin text-[#C1693A] self-center" />}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif font-semibold text-foreground">🛒 Zutaten</h3>
              <button onClick={addIngredient}
                className="flex items-center gap-1 text-xs text-[#4A7C59] hover:underline">
                <Plus className="w-3.5 h-3.5" /> Zutat hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={ing.amount} onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                    placeholder="Menge" className="w-16 px-2 py-1.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C1693A]/30" />
                  <input value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                    placeholder="Einheit" className="w-16 px-2 py-1.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C1693A]/30" />
                  <input value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)}
                    placeholder="Zutat *" className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C1693A]/30" />
                  <input value={ing.note} onChange={(e) => updateIngredient(i, "note", e.target.value)}
                    placeholder="Hinweis" className="w-24 px-2 py-1.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C1693A]/30" />
                  <button onClick={() => removeIngredient(i)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif font-semibold text-foreground">👩‍🍳 Zubereitung</h3>
              <button onClick={addStep}
                className="flex items-center gap-1 text-xs text-[#4A7C59] hover:underline">
                <Plus className="w-3.5 h-3.5" /> Schritt hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="mt-2 flex-shrink-0 w-5 h-5 rounded-full bg-[#4A7C59] text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <textarea value={step} onChange={(e) => updateStep(i, e.target.value)} rows={2}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C1693A]/30 resize-none" />
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button onClick={() => removeStep(i)} className="mt-1.5 p-1 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-border px-6 py-4 flex gap-3 justify-end bg-white/70 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors">
            Abbrechen
          </button>
          <button onClick={() => window.print()} disabled={saving || uploadingImage}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-60">
            <Printer className="w-4 h-4" />
            Drucken
          </button>
          <button onClick={handleSave} disabled={saving || uploadingImage}
            className="flex items-center gap-2 px-5 py-2 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
    <RecipePrintView recipe={{
      ...recipe,
      title: title.trim() || recipe.title,
      category: effectiveCategory.trim() || recipe.category,
      difficulty,
      prepTime: prepTime.trim() || null,
      totalTime: totalTime.trim() || null,
      servings: servings ? parseInt(servings, 10) : null,
      kcalPerPortion: kcal ? parseInt(kcal, 10) : null,
      source: source.trim() || null,
      rating: rating || null,
      notes: notes.trim() || null,
      steps: steps.filter((s) => s.trim()),
      ingredients: ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({ id: idx, recipeId: recipe.id, amount: i.amount, unit: i.unit, name: i.name, note: i.note || null })),
      imageUrl: imageUrl ?? null,
    }} />
    </>
  );
}
