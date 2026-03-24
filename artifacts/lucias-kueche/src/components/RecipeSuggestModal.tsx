import { useState } from "react";
import { X, Send, Loader2, Users } from "lucide-react";
import { useGroupMembersForSuggestion, sendRecipeSuggestion } from "@/hooks/useRecipeSuggestions";

interface Props {
  recipeId: number;
  recipeTitle: string;
  onClose: () => void;
  onSent: () => void;
}

export default function RecipeSuggestModal({ recipeId, recipeTitle, onClose, onSent }: Props) {
  const { members, loading } = useGroupMembersForSuggestion();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueMembers = members.filter(
    (m, idx, arr) => arr.findIndex((x) => x.userId === m.userId) === idx
  );

  const handleSend = async () => {
    if (!selectedUserId) return;
    setSending(true);
    setError(null);
    try {
      await sendRecipeSuggestion(selectedUserId, recipeId, message.trim() || undefined);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FDF6EC] rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="bg-[#4A7C59] text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base font-semibold">Rezept vorschlagen</h3>
            <p className="text-xs text-green-200 mt-0.5 truncate max-w-[200px]">{recipeTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
            </div>
          ) : uniqueMembers.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Keine Familienmitglieder gefunden.</p>
              <p className="text-xs mt-1">Tritt einer Gruppe bei oder lade Mitglieder ein.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  An wen möchtest du es schicken?
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {uniqueMembers.map((m) => (
                    <button
                      key={m.userId}
                      onClick={() => setSelectedUserId(m.userId === selectedUserId ? null : m.userId)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                        selectedUserId === m.userId
                          ? "border-[#4A7C59] bg-[#4A7C59]/10"
                          : "border-border bg-white hover:border-[#4A7C59]/40"
                      }`}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.displayName ?? ""} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#4A7C59]/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-[#4A7C59]">
                          {(m.displayName ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{m.displayName ?? m.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.groupName}</p>
                      </div>
                      {selectedUserId === m.userId && (
                        <div className="w-4 h-4 rounded-full bg-[#4A7C59] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Nachricht (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 100))}
                  placeholder="Das schmeckt uns bestimmt auch! 😊"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm resize-none h-20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
                />
                <p className="text-xs text-muted-foreground text-right mt-0.5">{message.length}/100</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}

              <button
                onClick={handleSend}
                disabled={!selectedUserId || sending}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4A7C59] text-white rounded-xl font-semibold text-sm hover:bg-[#3d6849] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Vorschlag senden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
