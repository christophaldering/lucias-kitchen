import { useState } from "react";
import { CalendarDays, Users, ChefHat, Clock, CheckCircle, XCircle, Bell } from "lucide-react";
import { useInvitations, useNotifications } from "@/hooks/useInvitations";
import { useRecipes } from "@/hooks/useRecipes";
import { useAuth } from "@/contexts/AuthContext";
import RespondInvitationDialog from "@/components/RespondInvitationDialog";
import InvitationHostDialog from "@/components/InvitationHostDialog";
import type { MealInvitation } from "@/hooks/useInvitations";

function showToast(message: string, type: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
    type === "success" ? "bg-[#4A7C59]" : "bg-red-600"
  }`;
  el.textContent = message;
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

export default function Einladungen() {
  const { user } = useAuth();
  const { invitations, loading, submitWish, updateRsvp, updateInvitation, cancelInvitation, refetch } = useInvitations();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { recipes } = useRecipes();

  const [activeTab, setActiveTab] = useState<"invitations" | "notifications">("invitations");
  const [respondingTo, setRespondingTo] = useState<MealInvitation | null>(null);
  const [managingInvitation, setManagingInvitation] = useState<MealInvitation | null>(null);

  const asHost = invitations.filter((inv) => inv.isHost);
  const asGuest = invitations.filter((inv) => !inv.isHost);

  const pendingResponseCount = asGuest.filter(
    (inv) => inv.status === "open" && inv.myMembership?.wish === null
  ).length;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("invitations")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "invitations"
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
          onClick={() => setActiveTab("notifications")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "notifications"
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

      {activeTab === "invitations" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[#4A7C59] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* As host */}
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

              {/* As guest */}
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

      {activeTab === "notifications" && (
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

      {/* Respond dialog */}
      {respondingTo && user && (
        <RespondInvitationDialog
          invitation={respondingTo}
          recipes={recipes}
          currentUserId={user.id}
          onClose={() => setRespondingTo(null)}
          onSubmitWish={async (payload) => {
            await submitWish(respondingTo.id, payload);
            showToast("Antwort gespeichert");
          }}
          onRsvp={async (rsvp) => {
            await updateRsvp(respondingTo.id, rsvp);
            const label = rsvp === "coming" ? "Zusage" : rsvp === "not_coming" ? "Absage" : "Status";
            showToast(`${label} gespeichert`);
          }}
        />
      )}

      {/* Host management dialog */}
      {managingInvitation && (
        <InvitationHostDialog
          invitation={managingInvitation}
          recipes={recipes}
          onClose={() => setManagingInvitation(null)}
          onDecide={async (finalRecipeId) => {
            await updateInvitation(managingInvitation.id, { status: "decided", finalRecipeId });
            showToast("Rezept bestätigt! Alle wurden benachrichtigt.");
            refetch();
          }}
          onCancel={async () => {
            await cancelInvitation(managingInvitation.id);
            showToast("Einladung abgesagt");
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

          {/* Guest RSVP */}
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
