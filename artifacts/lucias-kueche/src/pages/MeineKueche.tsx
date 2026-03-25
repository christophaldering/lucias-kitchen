import { useState, type ReactNode } from "react";
import {
  Users, ChefHat, Share2, Plus, Clock, CheckCircle, XCircle, ChevronRight,
  CalendarDays, Bell, BookmarkPlus, X, Loader2, Send, Inbox, ExternalLink, UserPlus
} from "lucide-react";
import { useInvitations, useNotifications } from "@/hooks/useInvitations";
import { useRecipes } from "@/hooks/useRecipes";
import { useGroups, type Group } from "@/hooks/useGroups";
import { useIncomingSuggestions, useOutgoingSuggestions } from "@/hooks/useRecipeSuggestions";
import { useAuth } from "@/contexts/AuthContext";
import GroupCreateModal from "@/components/GroupCreateModal";
import GroupMembersModal from "@/components/GroupMembersModal";
import RespondInvitationDialog from "@/components/RespondInvitationDialog";
import InvitationHostDialog from "@/components/InvitationHostDialog";
import FamilyInviteDialog from "@/components/FamilyInviteDialog";
import type { MealInvitation } from "@/hooks/useInvitations";

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: "Offen", color: "bg-blue-100 text-blue-700" },
  decided: { label: "Entschieden", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Abgesagt", color: "bg-gray-100 text-gray-500" },
};

const MODE_LABEL: Record<string, string> = {
  surprise: "Überraschung",
  wishlist: "Wunschzettel",
  vote: "Abstimmung",
  choice: "Auswahl",
};

type SectionTab = "gruppen" | "empfehlungen" | "einladungen";

interface Props {
  onOpenRecipe?: (recipeId: number) => void;
}

export default function MeineKueche({ onOpenRecipe }: Props) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionTab>("gruppen");

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      <h1 className="font-serif text-2xl font-semibold text-[#4A7C59] mb-5">Meine Küche</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <SectionButton
          active={activeSection === "gruppen"}
          onClick={() => setActiveSection("gruppen")}
          icon={<Users className="w-4 h-4" />}
          label="Gruppen"
        />
        <SectionButton
          active={activeSection === "empfehlungen"}
          onClick={() => setActiveSection("empfehlungen")}
          icon={<Share2 className="w-4 h-4" />}
          label="Empfehlungen"
        />
        <SectionButton
          active={activeSection === "einladungen"}
          onClick={() => setActiveSection("einladungen")}
          icon={<ChefHat className="w-4 h-4" />}
          label="Kocheinladungen"
        />
      </div>

      {activeSection === "gruppen" && <GruppenSection />}
      {activeSection === "empfehlungen" && <EmpfehlungenSection onOpenRecipe={onOpenRecipe} />}
      {activeSection === "einladungen" && <KocheinladungenSection user={user} />}
    </div>
  );
}

function SectionButton({
  active, onClick, icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
        active ? "bg-[#4A7C59] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function GruppenSection() {
  const { groups, loading: groupsLoading, fetchGroups, joinGroup } = useGroups();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showFamilyInvite, setShowFamilyInvite] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const activeGroups = groups.filter((g) => g.status === "approved" && g.myMemberStatus === "joined");
  const pendingGroups = groups.filter((g) => g.status === "pending");
  const invitedGroups = groups.filter((g) => g.status === "approved" && g.myMemberStatus === "invited");
  const rejectedGroups = groups.filter((g) => g.status === "rejected");

  const handleJoin = async (group: Group) => {
    try {
      await joinGroup(group.id);
      toast("Gruppe beigetreten ✓");
    } catch {
      toast("Beitritt fehlgeschlagen", "err");
    }
  };

  return (
    <>
      {showCreateGroup && (
        <GroupCreateModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={fetchGroups}
        />
      )}
      {showFamilyInvite && (
        <FamilyInviteDialog
          onClose={() => { setShowFamilyInvite(false); fetchGroups(); }}
        />
      )}
      {selectedGroup && (
        <GroupMembersModal
          group={selectedGroup}
          isOwner={selectedGroup.myRole === "owner"}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      <div className="space-y-5">
        <button
          onClick={() => setShowFamilyInvite(true)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-[#4A7C59]/40 bg-[#4A7C59]/5 hover:bg-[#4A7C59]/10 hover:border-[#4A7C59]/60 transition-all text-left group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#C1693A]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C1693A]/20 transition-colors">
            <UserPlus className="w-6 h-6 text-[#C1693A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">Familienmitglied einladen</p>
            <p className="text-xs text-muted-foreground mt-0.5">E-Mail eingeben – sofort in die Familie aufnehmen</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#4A7C59] flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <div className="flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-[#4A7C59]" /> Gruppen & Mitglieder
          </h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
          >
            <Plus className="w-4 h-4" /> Neue Gruppe
          </button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
          </div>
        ) : (
          <div className="space-y-4">
            {invitedGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Einladungen</p>
                <div className="space-y-2">
                  {invitedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-blue-600">Du wurdest eingeladen</p>
                      </div>
                      <button
                        onClick={() => handleJoin(g)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Beitreten
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-[#4A7C59]" /> Aktive Gruppen
                </p>
                <div className="space-y-2">
                  {activeGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-border/50 hover:border-[#4A7C59]/30 hover:bg-[#4A7C59]/5 transition-colors text-left"
                    >
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-[#4A7C59]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.myRole === "owner" ? "Eigentümer · Mitglieder verwalten" : "Mitglied"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pendingGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" /> Wartet auf Freigabe
                </p>
                <div className="space-y-2">
                  {pendingGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-amber-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-amber-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Wartet auf Admin-Freigabe
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejectedGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-red-400" /> Abgelehnt
                </p>
                <div className="space-y-2">
                  {rejectedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-red-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-red-600">
                          Abgelehnt{g.rejectionReason ? `: ${g.rejectionReason}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groups.length === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-gray-50 rounded-2xl">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Du bist noch in keiner Gruppe.</p>
                <p className="text-xs mt-1">Erstelle eine Familie oder Community!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function EmpfehlungenSection({ onOpenRecipe }: { onOpenRecipe?: (recipeId: number) => void }) {
  const { suggestions: incoming, loading: loadingIncoming, saveSuggestion, ignoreSuggestion } = useIncomingSuggestions();
  const { suggestions: outgoing, loading: loadingOutgoing } = useOutgoingSuggestions();
  const [subTab, setSubTab] = useState<"eingehend" | "gesendet">("eingehend");

  const pendingIncoming = incoming.filter((s) => s.status === "pending");
  const handledIncoming = incoming.filter((s) => s.status !== "pending");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("eingehend")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            subTab === "eingehend" ? "bg-[#4A7C59] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Inbox className="w-4 h-4" />
          Erhalten
          {pendingIncoming.length > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {pendingIncoming.length > 9 ? "9+" : pendingIncoming.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("gesendet")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            subTab === "gesendet" ? "bg-[#4A7C59] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Send className="w-4 h-4" />
          Gesendet
        </button>
      </div>

      {subTab === "eingehend" && (
        <div>
          {loadingIncoming ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
            </div>
          ) : incoming.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl">
              <Share2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Noch keine Rezeptempfehlungen erhalten</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingIncoming.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Neu</p>
                  <div className="space-y-3">
                    {pendingIncoming.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        type="incoming"
                        recipeId={s.recipeId}
                        recipeTitle={s.recipeTitle}
                        recipeImageUrl={s.recipeImageUrl}
                        recipeCategory={s.recipeCategory}
                        personName={s.senderName}
                        personAvatarUrl={s.senderAvatarUrl}
                        personLabel="schlägt vor"
                        message={s.message}
                        createdAt={s.createdAt}
                        status={s.status}
                        onOpenRecipe={onOpenRecipe}
                        onSave={async () => {
                          try {
                            await saveSuggestion(s.id);
                            toast("Rezept gespeichert ✓");
                          } catch {
                            toast("Fehler beim Speichern", "err");
                          }
                        }}
                        onIgnore={async () => {
                          try {
                            await ignoreSuggestion(s.id);
                          } catch {
                            toast("Fehler", "err");
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {handledIncoming.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Frühere</p>
                  <div className="space-y-3">
                    {handledIncoming.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        type="incoming"
                        recipeId={s.recipeId}
                        recipeTitle={s.recipeTitle}
                        recipeImageUrl={s.recipeImageUrl}
                        recipeCategory={s.recipeCategory}
                        personName={s.senderName}
                        personAvatarUrl={s.senderAvatarUrl}
                        personLabel="schlägt vor"
                        message={s.message}
                        createdAt={s.createdAt}
                        status={s.status}
                        onOpenRecipe={onOpenRecipe}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === "gesendet" && (
        <div>
          {loadingOutgoing ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
            </div>
          ) : outgoing.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl">
              <Send className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Du hast noch keine Rezepte empfohlen</p>
              <p className="text-xs text-gray-400 mt-1">Öffne ein Rezept und klicke auf „Vorschlagen"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {outgoing.map((s) => (
                <SuggestionCard
                  key={s.id}
                  type="outgoing"
                  recipeId={s.recipeId}
                  recipeTitle={s.recipeTitle}
                  recipeImageUrl={s.recipeImageUrl}
                  recipeCategory={s.recipeCategory}
                  personName={s.recipientName}
                  personAvatarUrl={s.recipientAvatarUrl}
                  personLabel="an"
                  message={s.message}
                  createdAt={s.createdAt}
                  status={s.status}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  type,
  recipeId,
  recipeTitle,
  recipeImageUrl,
  recipeCategory,
  personName,
  personAvatarUrl,
  personLabel,
  message,
  createdAt,
  status,
  onOpenRecipe,
  onSave,
  onIgnore,
}: {
  type: "incoming" | "outgoing";
  recipeId: number;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipeCategory: string;
  personName: string | null;
  personAvatarUrl: string | null;
  personLabel: string;
  message: string | null;
  createdAt: string;
  status: "pending" | "saved" | "ignored";
  onOpenRecipe?: (recipeId: number) => void;
  onSave?: () => Promise<void>;
  onIgnore?: () => Promise<void>;
}) {
  const statusLabel: Record<string, { label: string; color: string }> = {
    pending: { label: "Ausstehend", color: "bg-blue-100 text-blue-700" },
    saved: { label: "Gespeichert", color: "bg-green-100 text-green-700" },
    ignored: { label: "Ignoriert", color: "bg-gray-100 text-gray-500" },
  };

  const statusInfo = statusLabel[status] ?? statusLabel.pending;

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white border border-border shadow-sm">
      {recipeImageUrl ? (
        <img
          src={recipeImageUrl}
          alt={recipeTitle}
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0 text-2xl">
          🍽️
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {personAvatarUrl ? (
            <img src={personAvatarUrl} alt={personName ?? ""} className="w-4 h-4 rounded-full object-cover" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-[#4A7C59]/30 flex items-center justify-center text-[9px] font-bold text-[#4A7C59]">
              {(personName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {personLabel} {personName ?? "Jemand"}
          </span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <p className="font-semibold text-sm truncate">{recipeTitle}</p>
        <p className="text-xs text-muted-foreground">{recipeCategory}</p>
        {message && (
          <p className="text-xs italic text-[#C1693A] mt-1 line-clamp-2">„{message}"</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(createdAt).toLocaleDateString("de-DE", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        {type === "incoming" && (
          <div className="flex flex-wrap gap-2 mt-2">
            {onOpenRecipe && (
              <button
                onClick={() => onOpenRecipe(recipeId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C1693A] text-white text-xs rounded-lg font-medium hover:bg-[#a8572e] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Rezept öffnen
              </button>
            )}
            {status === "pending" && onSave && onIgnore && (
              <>
                <button
                  onClick={onSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4A7C59] text-white text-xs rounded-lg font-medium hover:bg-[#3d6849] transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Speichern
                </button>
                <button
                  onClick={onIgnore}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground text-xs rounded-lg font-medium hover:bg-secondary transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Ignorieren
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KocheinladungenSection({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  const { invitations, loading, submitWish, updateRsvp, updateInvitation, cancelInvitation, remindGuests, refetch } = useInvitations();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { recipes } = useRecipes();

  const [subTab, setSubTab] = useState<"invitations" | "notifications">("invitations");
  const [respondingTo, setRespondingTo] = useState<MealInvitation | null>(null);
  const [managingInvitation, setManagingInvitation] = useState<MealInvitation | null>(null);
  const [showFamilyInvite, setShowFamilyInvite] = useState(false);
  const { fetchGroups } = useGroups();

  const asHost = invitations.filter((inv) => inv.isHost);
  const asGuest = invitations.filter((inv) => !inv.isHost);

  const pendingResponseCount = asGuest.filter(
    (inv) => inv.status === "open" && inv.myMembership?.wish === null
  ).length;

  return (
    <div>
      {showFamilyInvite && (
        <FamilyInviteDialog
          onClose={() => { setShowFamilyInvite(false); fetchGroups(); }}
        />
      )}

      <button
        onClick={() => setShowFamilyInvite(true)}
        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-[#4A7C59]/40 bg-[#4A7C59]/5 hover:bg-[#4A7C59]/10 hover:border-[#4A7C59]/60 transition-all text-left group mb-5"
      >
        <div className="w-12 h-12 rounded-xl bg-[#C1693A]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C1693A]/20 transition-colors">
          <UserPlus className="w-6 h-6 text-[#C1693A]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">Familienmitglied einladen</p>
          <p className="text-xs text-muted-foreground mt-0.5">E-Mail eingeben – sofort in die Familie aufnehmen</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[#4A7C59] flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setSubTab("invitations")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            subTab === "invitations"
              ? "bg-[#4A7C59] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            Einladungen
            {pendingResponseCount > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingResponseCount}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setSubTab("notifications")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            subTab === "notifications"
              ? "bg-[#4A7C59] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <Bell className="w-4 h-4" />
            Benachrichtigungen
            {unreadCount > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </span>
        </button>
      </div>

      {subTab === "invitations" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[#4A7C59] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ChefHat className="w-4 h-4 text-[#4A7C59]" />
                  <h2 className="font-semibold text-gray-900 text-sm">Als Koch</h2>
                  <span className="ml-auto text-xs text-gray-400">{asHost.length} Einladungen</span>
                </div>

                {asHost.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-2xl">
                    <ChefHat className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Du hast noch keine Einladungen erstellt</p>
                    <p className="text-xs text-gray-400 mt-1">Erstelle eine im Wochenplan</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {asHost.map((inv) => (
                      <InvitationCard
                        key={inv.id}
                        invitation={inv}
                        isHost
                        onClick={() => setManagingInvitation(inv)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-[#C1693A]" />
                  <h2 className="font-semibold text-gray-900 text-sm">Als Gast</h2>
                  <span className="ml-auto text-xs text-gray-400">{asGuest.length} Einladungen</span>
                </div>

                {asGuest.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-2xl">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Du wurdest noch nicht eingeladen</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {asGuest.map((inv) => (
                      <InvitationCard
                        key={inv.id}
                        invitation={inv}
                        isHost={false}
                        currentUserId={user?.id}
                        onClick={() => setRespondingTo(inv)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {subTab === "notifications" && (
        <div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="mb-3 text-xs text-[#4A7C59] hover:underline"
            >
              Alle als gelesen markieren
            </button>
          )}
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Keine Benachrichtigungen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    n.readAt === null
                      ? "bg-[#4A7C59]/5 border-[#4A7C59]/20"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {n.readAt === null && (
                      <span className="w-2 h-2 rounded-full bg-[#4A7C59] mt-1.5 flex-shrink-0" />
                    )}
                    <div className={n.readAt !== null ? "ml-5" : ""}>
                      <p className={`text-sm ${n.readAt === null ? "font-medium text-gray-900" : "text-gray-600"}`}>
                        {n.payload?.message ?? ""}
                      </p>
                      {n.createdAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(n.createdAt).toLocaleDateString("de-DE", {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {respondingTo && user && (
        <RespondInvitationDialog
          invitation={respondingTo}
          recipes={recipes}
          currentUserId={user.id}
          onClose={() => setRespondingTo(null)}
          onSubmitWish={async (payload) => {
            await submitWish(respondingTo.id, payload);
            toast("Antwort gespeichert");
          }}
          onRsvp={async (rsvp) => {
            await updateRsvp(respondingTo.id, rsvp);
            const label = rsvp === "coming" ? "Zusage" : rsvp === "not_coming" ? "Absage" : "Status";
            toast(`${label} gespeichert`);
          }}
        />
      )}

      {managingInvitation && (
        <InvitationHostDialog
          invitation={managingInvitation}
          recipes={recipes}
          onClose={() => setManagingInvitation(null)}
          onDecide={async (finalRecipeId) => {
            await updateInvitation(managingInvitation.id, { status: "decided", finalRecipeId });
            toast("Rezept bestätigt! Alle wurden benachrichtigt.");
            refetch();
          }}
          onCancel={async () => {
            await cancelInvitation(managingInvitation.id);
            toast("Einladung abgesagt");
          }}
          onRemind={async () => {
            return await remindGuests(managingInvitation.id);
          }}
        />
      )}
    </div>
  );
}

function InvitationCard({
  invitation,
  isHost,
  currentUserId,
  onClick,
}: {
  invitation: MealInvitation;
  isHost: boolean;
  currentUserId?: number;
  onClick: () => void;
}) {
  const myMembership = !isHost && currentUserId
    ? invitation.members.find((m) => m.userId === currentUserId)
    : null;

  const hasAnswered = myMembership?.wish !== null;
  const needsAnswer = !isHost && invitation.status === "open" && !hasAnswered;

  const statusInfo = STATUS_LABEL[invitation.status] ?? STATUS_LABEL.open;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white rounded-2xl border border-gray-200 hover:border-[#4A7C59]/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <CalendarDays className="w-5 h-5 text-[#4A7C59]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{invitation.date}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {needsAnswer && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Antwort ausstehend
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-0.5">
            {isHost ? `Du lädst ein · ` : `${invitation.host?.displayName ?? "Unbekannt"} lädt ein · `}
            {MODE_LABEL[invitation.mode]}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              {invitation.members.length} Gäste
            </span>

            {invitation.status === "open" && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                {invitation.members.filter((m) => m.wish !== null).length}/{invitation.members.length} geantwortet
              </span>
            )}

            {invitation.status === "decided" && invitation.finalRecipe && (
              <span className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle className="w-3 h-3" />
                {invitation.finalRecipe.title}
              </span>
            )}

            {invitation.status === "cancelled" && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <XCircle className="w-3 h-3" />
                Abgesagt
              </span>
            )}
          </div>

          {!isHost && myMembership && (
            <div className="mt-1">
              <span className={`text-xs ${
                myMembership.rsvp === "coming" ? "text-green-600" :
                myMembership.rsvp === "not_coming" ? "text-red-500" :
                "text-gray-400"
              }`}>
                {myMembership.rsvp === "coming" ? "✓ Ich komme" :
                 myMembership.rsvp === "not_coming" ? "✗ Ich komme nicht" :
                 "RSVP ausstehend"}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
