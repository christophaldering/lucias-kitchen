import { useState } from "react";
import { X, ThumbsUp, ThumbsDown, Utensils } from "lucide-react";
import type { MealInvitation, RsvpStatus } from "@/hooks/useInvitations";
import type { Recipe } from "@/types/recipe";

interface Props {
  invitation: MealInvitation;
  recipes: Recipe[];
  currentUserId: number;
  onClose: () => void;
  onSubmitWish: (payload: {
    wishText?: string | null;
    recipeId?: number | null;
    ranking?: number | null;
    constraints?: string | null;
  }) => Promise<void>;
  onRsvp: (rsvp: RsvpStatus) => Promise<void>;
}

export default function RespondInvitationDialog({
  invitation,
  recipes,
  currentUserId,
  onClose,
  onSubmitWish,
  onRsvp,
}: Props) {
  const myMembership = invitation.members.find((m) => m.userId === currentUserId);
  const myWish = myMembership?.wish;

  const [wishText, setWishText] = useState(myWish?.wishText ?? "");
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(myWish?.recipeId ?? null);
  const [constraints, setConstraints] = useState(myWish?.constraints ?? "");
  const [saving, setSaving] = useState(false);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [error, setError] = useState("");

  const recipeOptions = (invitation.recipeOptions ?? []).map((rid: number) =>
    recipes.find((r) => r.id === rid)
  ).filter(Boolean) as Recipe[];

  const modeLabel: Record<string, string> = {
    surprise: "Überraschung",
    wishlist: "Wunschzettel",
    vote: "Abstimmung",
    choice: "Auswahl mit Einschränkungen",
  };

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const payload: {
        wishText?: string | null;
        recipeId?: number | null;
        constraints?: string | null;
      } = {};

      if (invitation.mode === "wishlist") {
        payload.wishText = wishText.trim() || null;
      } else if (invitation.mode === "vote" || invitation.mode === "choice") {
        payload.recipeId = selectedRecipeId;
      }

      if (constraints.trim()) {
        payload.constraints = constraints.trim();
      }

      await onSubmitWish(payload);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function handleRsvp(rsvp: RsvpStatus) {
    setRsvpSaving(true);
    try {
      await onRsvp(rsvp);
    } finally {
      setRsvpSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#4A7C59]/5 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Einladung beantworten</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {invitation.host?.displayName} · {invitation.date} · {modeLabel[invitation.mode]}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {/* RSVP */}
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 mb-2">Kannst du kommen?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRsvp("coming")}
                disabled={rsvpSaving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  myMembership?.rsvp === "coming"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-700 hover:border-green-300"
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                Ich komme
              </button>
              <button
                onClick={() => handleRsvp("not_coming")}
                disabled={rsvpSaving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  myMembership?.rsvp === "not_coming"
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-gray-200 text-gray-700 hover:border-red-300"
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                Ich komme nicht
              </button>
            </div>
          </div>

          {/* Mode-specific response - only show if coming or pending */}
          {invitation.mode === "surprise" && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-700">
                🎉 Es wird eine Überraschung! Du erfährst das Rezept erst am Kochtag.
              </p>
            </div>
          )}

          {invitation.mode === "wishlist" && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Dein Wunsch</p>
              <textarea
                value={wishText}
                onChange={(e) => setWishText(e.target.value)}
                placeholder="z. B. Pasta, Thai-Küche, etwas Vegetarisches…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#4A7C59] resize-none"
              />
            </div>
          )}

          {(invitation.mode === "vote" || invitation.mode === "choice") && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                {invitation.mode === "vote" ? "Abstimmen" : "Rezept wählen"}
              </p>
              {recipeOptions.length === 0 ? (
                <p className="text-sm text-gray-500">Noch keine Rezepte zur Auswahl.</p>
              ) : (
                <div className="space-y-2">
                  {recipeOptions.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRecipeId(r.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedRecipeId === r.id
                          ? "border-[#4A7C59] bg-[#4A7C59]/5"
                          : "border-gray-200 hover:border-[#4A7C59]/40"
                      }`}
                    >
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt={r.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
                          <Utensils className="w-4 h-4 text-[#4A7C59]" />
                        </div>
                      )}
                      <span className="font-medium text-sm text-gray-900 flex-1">{r.title}</span>
                      {selectedRecipeId === r.id && (
                        <span className="text-[#4A7C59] font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Constraints - shown for all except surprise */}
          {invitation.mode !== "surprise" && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Unverträglichkeiten / Präferenzen <span className="text-gray-400 font-normal">(optional)</span>
              </p>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="z. B. kein Gluten, keine Nüsse, vegetarisch…"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#4A7C59] resize-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>

        {/* Footer */}
        {invitation.mode !== "surprise" && (
          <div className="px-5 pb-5 flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#3d6849] disabled:opacity-50 transition-colors"
            >
              {saving ? "Wird gespeichert…" : myWish ? "Antwort aktualisieren" : "Antwort senden"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
