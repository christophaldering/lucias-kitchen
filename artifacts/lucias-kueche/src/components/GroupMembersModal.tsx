import { useState, useEffect, useRef } from "react";
import { X, Loader2, UserPlus, Trash2, Users, Pencil, Check } from "lucide-react";
import { useGroups, type Group, type GroupMember } from "@/hooks/useGroups";

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
  group: Group;
  onClose: () => void;
  isOwner: boolean;
}

export default function GroupMembersModal({ group, onClose, isOwner }: Props) {
  const { getMembers, inviteMember, removeMember, renameGroup } = useGroups();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteInput, setInviteInput] = useState("");
  const [inviting, setBusy] = useState(false);

  const isAlreadyMember = inviteInput.trim().length > 0 && members.some((m) => {
    const needle = inviteInput.trim().toLowerCase();
    return (
      (m.email?.toLowerCase() === needle) ||
      (m.invitedEmail?.toLowerCase() === needle) ||
      (m.displayName?.toLowerCase() === needle)
    );
  });

  const [editingName, setEditingName] = useState(false);
  const [displayedName, setDisplayedName] = useState(group.name);
  const [nameInput, setNameInput] = useState(group.name);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const data = await getMembers(group.id);
      setMembers(data);
    } catch {
      toast("Mitglieder konnten nicht geladen werden", "err");
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [group.id]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    setBusy(true);
    try {
      const result = await inviteMember(group.id, inviteInput.trim());
      if (result.inviteType === "email_only") {
        toast("Einladung gespeichert – sie erscheint sobald sich die Person registriert.");
      } else {
        toast(`Einladung an „${inviteInput.trim()}" gesendet`);
      }
      setInviteInput("");
      await loadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Einladung fehlgeschlagen", "err");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: GroupMember) => {
    try {
      await removeMember(group.id, member.id);
      toast("Mitglied entfernt");
      await loadMembers();
    } catch {
      toast("Fehler beim Entfernen", "err");
    }
  };

  const handleStartRename = () => {
    setNameInput(displayedName);
    setEditingName(true);
  };

  const handleCancelRename = () => {
    setEditingName(false);
    setNameInput(displayedName);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayedName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await renameGroup(group.id, trimmed);
      setDisplayedName(trimmed);
      toast("Gruppenname aktualisiert ✓");
      setEditingName(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Umbenennung fehlgeschlagen", "err");
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  };

  const initials = (name: string | null) =>
    (name ?? "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Users className="w-5 h-5 text-[#4A7C59] flex-shrink-0" />
            {editingName ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  className="flex-1 min-w-0 px-2 py-1 text-base font-semibold font-serif border border-[#4A7C59]/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
                  maxLength={100}
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !nameInput.trim()}
                  className="p-1.5 rounded-lg bg-[#4A7C59] text-white hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Speichern"
                >
                  {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleCancelRename}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                  title="Abbrechen"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-serif text-lg font-semibold truncate">{displayedName}</h2>
                {isOwner && (
                  <button
                    onClick={handleStartRename}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                    title="Gruppenname ändern"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </>
            )}
          </div>
          {!editingName && (
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 ml-2">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isOwner && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#4A7C59]" /> Mitglied einladen
              </h3>
              <form onSubmit={handleInvite} className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <input
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="E-Mail oder Nutzername…"
                    className={`flex-1 px-3 py-2 rounded-xl border bg-white text-sm focus:outline-none focus:ring-2 transition-colors ${
                      isAlreadyMember
                        ? "border-red-400 focus:ring-red-300"
                        : "border-border focus:ring-[#4A7C59]/30"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={inviting || !inviteInput.trim() || isAlreadyMember}
                    className="px-4 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Einladen"}
                  </button>
                </div>
                {isAlreadyMember && (
                  <p className="text-xs text-red-600 font-medium px-1">
                    Diese Person ist bereits Mitglied oder eingeladen.
                  </p>
                )}
              </form>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-3">Mitglieder ({members.length})</h3>
            {loadingMembers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Noch keine Mitglieder.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-border/50">
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#4A7C59] flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{initials(m.displayName)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.displayName ?? m.invitedEmail ?? "Unbekannt"}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email ?? m.invitedEmail ?? ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.role === "owner" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#4A7C59]/10 text-[#4A7C59] font-medium">Eigentümer</span>
                      ) : m.memberStatus === "invited" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Eingeladen</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Mitglied</span>
                      )}
                      {isOwner && m.role !== "owner" && (
                        <button
                          onClick={() => handleRemove(m)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                          title="Mitglied entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border">
          <button onClick={onClose}
            className="w-full py-2.5 border border-border rounded-xl text-sm hover:bg-secondary transition-colors">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
