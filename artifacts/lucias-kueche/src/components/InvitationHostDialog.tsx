import { useState } from "react";
import { X, Utensils, CheckCircle, ThumbsUp, ThumbsDown, Clock, Bell } from "lucide-react";
import type { MealInvitation } from "@/hooks/useInvitations";
import type { Recipe } from "@/types/recipe";

interface Props {
  invitation: MealInvitation;
  recipes: Recipe[];
  onClose: () => void;
  onDecide: (finalRecipeId: number) => Promise<void>;
  onCancel: () => Promise<void>;
  onRemind: () => Promise<{ success: boolean; reminded: number }>;
}

export default function InvitationHostDialog({ invitation, recipes, onClose, onDecide, onCancel, onRemind }: Props) {
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(invitation.finalRecipeId);
  const [deciding, setDeciding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");

  const modeLabel: Record<string, string> = {
    surprise: "Überraschung",
    wishlist: "Wunschzettel",
    vote: "Abstimmung",
    choice: "Auswahl mit Einschränkungen",
  };

  const rsvpCounts = {
    coming: invitation.members.filter((m) => m.rsvp === "coming").length,
    not_coming: invitation.members.filter((m) => m.rsvp === "not_coming").length,
    pending: invitation.members.filter((m) => m.rsvp === "pending").length,
  };

  const answeredCount = invitation.members.filter((m) => m.wish !== null).length;

  const voteCounts: Record<number, number> = {};
  for (const member of invitation.members) {
    if (member.wish?.recipeId) {
      voteCounts[member.wish.recipeId] = (voteCounts[member.wish.recipeId] ?? 0) + 1;
    }
  }

  const recipeOptions = (invitation.recipeOptions ?? []).map((rid: number) =>
    recipes.find((r) => r.id === rid)
  ).filter(Boolean) as Recipe[];

  async function handleDecide() {
    if (!selectedRecipeId) return;
    setDeciding(true);
    setError("");
    try {
      await onDecide(selectedRecipeId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setDeciding(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel();
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  async function handleRemind() {
    setReminding(true);
    setError("");
    try {
      const result = await onRemind();
      setToast(`Erinnerung an ${result.reminded} Gast${result.reminded !== 1 ? "e" : ""} gesendet.`);
      setTimeout(() => setToast(null), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Erinnern");
    } finally {
      setReminding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-[#4A7C59] text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Bell className="w-4 h-4 flex-shrink-0" />
          {toast}
        </div>
      )}
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#4A7C59]/5 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Einladung verwalten</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {invitation.date} · {modeLabel[invitation.mode]}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {/* Status chips */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              <ThumbsUp className="w-3 h-3" />
              {rsvpCounts.coming} kommen
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-medium">
              <ThumbsDown className="w-3 h-3" />
              {rsvpCounts.not_coming} kommen nicht
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
              <Clock className="w-3 h-3" />
              {rsvpCounts.pending} ausstehend
            </span>
          </div>

          {/* Members and their responses */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Antworten <span className="text-gray-400">({answeredCount}/{invitation.members.length})</span>
            </p>
            <div className="space-y-2">
              {invitation.members.map((member) => (
                <div key={member.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                    {member.user?.avatarUrl ? (
                      <img src={member.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#C1693A] flex items-center justify-center">
                        <span className="text-white text-xs font-bold">
                          {member.user?.displayName.slice(0, 2).toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{member.user?.displayName ?? "Unbekannt"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        member.rsvp === "coming" ? "bg-green-100 text-green-700" :
                        member.rsvp === "not_coming" ? "bg-red-100 text-red-600" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {member.rsvp === "coming" ? "Kommt" : member.rsvp === "not_coming" ? "Kommt nicht" : "Ausstehend"}
                      </span>
                    </div>
                    {member.wish ? (
                      <div className="mt-1">
                        {member.wish.wishText && (
                          <p className="text-xs text-gray-600">💬 {member.wish.wishText}</p>
                        )}
                        {member.wish.recipeId && (
                          <p className="text-xs text-gray-600">
                            🍽️ {recipes.find((r) => r.id === member.wish?.recipeId)?.title ?? `Rezept #${member.wish.recipeId}`}
                          </p>
                        )}
                        {member.wish.constraints && (
                          <p className="text-xs text-orange-600">⚠️ {member.wish.constraints}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">Noch keine Antwort</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vote results for vote mode */}
          {invitation.mode === "vote" && recipeOptions.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Abstimmungsergebnis</p>
              <div className="space-y-2">
                {recipeOptions
                  .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
                  .map((r) => {
                    const count = voteCounts[r.id] ?? 0;
                    const total = invitation.members.length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={r.id} className="p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{r.title}</span>
                          <span className="text-xs text-gray-500">{count} Stimme{count !== 1 ? "n" : ""}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#4A7C59] rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Decide / pick recipe */}
          {invitation.status === "open" && (
            <div>
              {!showRecipePicker ? (
                <button
                  onClick={() => setShowRecipePicker(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#4A7C59] text-[#4A7C59] text-sm font-medium hover:bg-[#4A7C59]/5 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Rezept festlegen
                </button>
              ) : (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Welches Rezept kochst du?</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                    {recipes.slice(0, 50).map((r) => (
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
                          <img src={r.imageUrl} alt={r.title} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
                            <Utensils className="w-3 h-3 text-[#4A7C59]" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900">{r.title}</span>
                        {selectedRecipeId === r.id && (
                          <span className="ml-auto text-[#4A7C59] font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
                  <button
                    onClick={handleDecide}
                    disabled={!selectedRecipeId || deciding}
                    className="w-full py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#3d6849] disabled:opacity-50 transition-colors"
                  >
                    {deciding ? "Wird gespeichert…" : "Rezept bestätigen & alle benachrichtigen"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Show decided recipe */}
          {invitation.status === "decided" && invitation.finalRecipe && (
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Entschieden</p>
                <p className="text-sm text-green-700">{invitation.finalRecipe.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {invitation.status === "open" && (
          <div className="px-5 pb-5 flex-shrink-0 space-y-2">
            {rsvpCounts.pending > 0 && (
              <>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  onClick={handleRemind}
                  disabled={reminding}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-sm hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  <Bell className="w-4 h-4" />
                  {reminding ? "Wird gesendet…" : `Alle ${rsvpCounts.pending} offenen Gäste erinnern`}
                </button>
              </>
            )}
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm hover:bg-red-50 transition-colors"
            >
              {cancelling ? "Wird abgesagt…" : "Einladung absagen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
