import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Users, Utensils, Star, Shuffle } from "lucide-react";
import type { InvitationMode } from "@/hooks/useInvitations";
import { useUsers } from "@/hooks/useInvitations";
import { useAuth } from "@/contexts/AuthContext";
import type { Recipe } from "@/types/recipe";

interface Props {
  date: string;
  recipes: Recipe[];
  onClose: () => void;
  onCreate: (payload: {
    date: string;
    mode: InvitationMode;
    memberUserIds: number[];
    recipeOptions?: number[];
    deadline?: string | null;
  }) => Promise<void>;
}

const MODE_OPTIONS: { id: InvitationMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "surprise",
    label: "Überraschung",
    description: "Du wählst das Rezept selbst. Die Eingeladenen erfahren es erst am Tag.",
    icon: <Shuffle className="w-6 h-6" />,
  },
  {
    id: "wishlist",
    label: "Wunschzettel",
    description: "Eingeladene können frei einen Wunsch eingeben (Gericht, Küche, etc.).",
    icon: <Star className="w-6 h-6" />,
  },
  {
    id: "vote",
    label: "Abstimmung",
    description: "Du schlägst 2–5 Rezepte vor, Eingeladene stimmen ab.",
    icon: <Utensils className="w-6 h-6" />,
  },
  {
    id: "choice",
    label: "Auswahl mit Einschränkungen",
    description: "Eingeladene wählen aus einer Liste und können Präferenzen angeben.",
    icon: <Users className="w-6 h-6" />,
  },
];

export default function CreateInvitationDialog({ date, recipes, onClose, onCreate }: Props) {
  const { user } = useAuth();
  const { users } = useUsers();
  const otherUsers = users.filter((u) => u.id !== user?.id);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<InvitationMode | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<number[]>([]);
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleMember(uid: number) {
    setSelectedMembers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  function toggleRecipe(rid: number) {
    setSelectedRecipes((prev) => {
      if (prev.includes(rid)) return prev.filter((id) => id !== rid);
      if (prev.length >= 5) return prev;
      return [...prev, rid];
    });
  }

  async function handleSave() {
    if (!mode || selectedMembers.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await onCreate({
        date,
        mode,
        memberUserIds: selectedMembers,
        recipeOptions: selectedRecipes,
        deadline: deadline || null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setSaving(false);
    }
  }

  const maxSteps = mode === "vote" || mode === "choice" ? 4 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#4A7C59]/5">
          <div>
            <h2 className="font-semibold text-gray-900">Kocheinladung erstellen</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {date} · Schritt {step} von {maxSteps}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-[#4A7C59] transition-all"
            style={{ width: `${(step / maxSteps) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {/* Step 1: Mode selection */}
          {step === 1 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Wie soll entschieden werden, was gekocht wird?</p>
              <div className="space-y-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setMode(opt.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      mode === opt.id
                        ? "border-[#4A7C59] bg-[#4A7C59]/5"
                        : "border-gray-200 hover:border-[#4A7C59]/40"
                    }`}
                  >
                    <span className={`mt-0.5 ${mode === opt.id ? "text-[#4A7C59]" : "text-gray-400"}`}>
                      {opt.icon}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Select members */}
          {step === 2 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Wen möchtest du einladen?</p>
              {otherUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  Keine anderen Nutzer gefunden. Registriere weitere Familienmitglieder.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {otherUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedMembers.includes(u.id)
                          ? "border-[#4A7C59] bg-[#4A7C59]/5"
                          : "border-gray-200 hover:border-[#4A7C59]/40"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#C1693A] flex items-center justify-center">
                            <span className="text-white text-xs font-bold">
                              {u.displayName.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-sm text-gray-900">{u.displayName}</span>
                      {selectedMembers.includes(u.id) && (
                        <span className="ml-auto text-[#4A7C59] text-xs font-semibold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Recipe options (for vote/choice modes) */}
          {step === 3 && (mode === "vote" || mode === "choice") && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Rezepte zur Auswahl stellen <span className="text-gray-400">(max. 5)</span>
              </p>
              <p className="text-xs text-gray-500 mb-3">Wähle Rezepte aus deinem Pool</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recipes.slice(0, 50).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggleRecipe(r.id)}
                    disabled={!selectedRecipes.includes(r.id) && selectedRecipes.length >= 5}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selectedRecipes.includes(r.id)
                        ? "border-[#4A7C59] bg-[#4A7C59]/5"
                        : selectedRecipes.length >= 5
                        ? "border-gray-100 opacity-50"
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
                    {selectedRecipes.includes(r.id) && (
                      <span className="text-[#4A7C59] text-xs font-semibold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 (no recipes) or Step 4: Deadline */}
          {((step === 3 && mode !== "vote" && mode !== "choice") ||
            (step === 4 && (mode === "vote" || mode === "choice"))) && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Optionale Frist für Antworten</p>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                max={date}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#4A7C59]"
              />
              <p className="text-xs text-gray-400 mt-2">
                Lasse das Feld leer, wenn es keine Frist gibt.
              </p>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Zurück
            </button>
          )}
          <button
            onClick={() => {
              if (step < maxSteps) {
                setStep((s) => s + 1);
              } else {
                handleSave();
              }
            }}
            disabled={
              (step === 1 && !mode) ||
              (step === 2 && selectedMembers.length === 0) ||
              saving
            }
            className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#3d6849] disabled:opacity-50 transition-colors"
          >
            {saving ? "Wird gesendet…" : step === maxSteps ? "Einladung senden" : (
              <>
                Weiter
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
