import { Recipe } from "@/data/recipes";
import { X, Clock, ChefHat, Star, CalendarPlus } from "lucide-react";

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onAddToWeek?: (id: number) => void;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < n ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </span>
  );
}

export default function RecipeModal({ recipe, onClose, onAddToWeek }: Props) {
  const diffColor =
    recipe.difficulty === "simpel"
      ? "bg-green-100 text-green-800"
      : recipe.difficulty === "normal"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#4A7C59] text-white px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-green-200 mb-1">
              {recipe.emoji} {recipe.categories.join(" · ")}
            </p>
            <h2 className="font-serif text-xl font-semibold leading-snug">
              {recipe.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Meta */}
          <div className="flex flex-wrap gap-4 items-center">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 text-[#C1693A]" />
              {recipe.time} Min.
            </span>
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${diffColor}`}>
              <ChefHat className="w-3.5 h-3.5" />
              {recipe.difficulty}
            </span>
            <Stars n={recipe.rating} />
          </div>

          {/* Lucia's Note */}
          <div className="sticky-note rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1 uppercase tracking-wide font-sans">
              📝 Lucias Notizen
            </p>
            <p className="text-lg text-amber-900 leading-relaxed">{recipe.note}</p>
          </div>

          {/* Ingredients */}
          <div>
            <h3 className="font-serif font-semibold text-lg text-foreground mb-3 flex items-center gap-2">
              🛒 Zutaten
            </h3>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C1693A] flex-shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </div>

          {/* Steps */}
          <div>
            <h3 className="font-serif font-semibold text-lg text-foreground mb-3">
              👩‍🍳 Zubereitung
            </h3>
            <ol className="space-y-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-foreground">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A7C59] text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {onAddToWeek && (
              <button
                onClick={() => { onAddToWeek(recipe.id); onClose(); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
                Zum Wochenplan hinzufügen
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
