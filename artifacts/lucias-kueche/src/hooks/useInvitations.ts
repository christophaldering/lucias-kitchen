import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch, authHeaders as baseAuthHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

function authHeaders(): HeadersInit {
  return baseAuthHeaders({ "Content-Type": "application/json" });
}

export type InvitationMode = "surprise" | "wishlist" | "vote" | "choice";
export type InvitationStatus = "open" | "decided" | "cancelled";
export type RsvpStatus = "pending" | "coming" | "not_coming";

export interface InvitationMember {
  id: number;
  mealInvitationId: number;
  userId: number;
  rsvp: RsvpStatus;
  remindersSentAt: string[] | null;
  createdAt: string | null;
  user: { id: number; displayName: string; avatarUrl: string | null } | null;
  wish: MealWish | null;
}

export interface MealWish {
  id: number;
  mealInvitationId: number;
  userId: number;
  wishText: string | null;
  recipeId: number | null;
  ranking: number | null;
  constraints: string | null;
  createdAt: string | null;
}

export interface MealInvitation {
  id: number;
  hostUserId: number;
  date: string;
  mode: InvitationMode;
  status: InvitationStatus;
  recipeOptions: number[];
  finalRecipeId: number | null;
  deadline: string | null;
  createdAt: string | null;
  host: { id: number; displayName: string; avatarUrl: string | null } | null;
  members: InvitationMember[];
  finalRecipe: { id: number; title: string; imageUrl: string | null } | null;
  isHost: boolean;
  myMembership: InvitationMember | null;
}

export interface AppUser {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

async function fetchInvitationsFn(): Promise<MealInvitation[]> {
  const res = await authFetch(`${API_BASE}/meal-invitations`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useInvitations() {
  const queryClient = useQueryClient();

  const query = useQuery<MealInvitation[], Error>({
    queryKey: ["invitations"],
    queryFn: fetchInvitationsFn,
    staleTime: 30_000,
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      mode: InvitationMode;
      memberUserIds: number[];
      recipeOptions?: number[];
      deadline?: string | null;
    }) => {
      const res = await authFetch(`${API_BASE}/meal-invitations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Fehler beim Erstellen der Einladung");
      }
      return res.json() as Promise<MealInvitation>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const updateInvitationMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { status?: InvitationStatus; finalRecipeId?: number | null } }) => {
      const res = await authFetch(`${API_BASE}/meal-invitations/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Fehler beim Aktualisieren");
      }
      return res.json() as Promise<MealInvitation>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/meal-invitations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Fehler beim Absagen");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const submitWishMutation = useMutation({
    mutationFn: async ({ invitationId, payload }: {
      invitationId: number;
      payload: {
        wishText?: string | null;
        recipeId?: number | null;
        ranking?: number | null;
        constraints?: string | null;
      };
    }) => {
      const res = await authFetch(`${API_BASE}/meal-invitations/${invitationId}/wishes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Fehler beim Speichern des Wunsches");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const updateRsvpMutation = useMutation({
    mutationFn: async ({ invitationId, rsvp }: { invitationId: number; rsvp: RsvpStatus }) => {
      const res = await authFetch(`${API_BASE}/meal-invitations/${invitationId}/rsvp`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ rsvp }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Fehler beim RSVP");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const invitations = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Einladungen konnten nicht geladen werden." : null;

  async function fetchInvitations() {
    await queryClient.invalidateQueries({ queryKey: ["invitations"] });
  }

  async function createInvitation(payload: {
    date: string;
    mode: InvitationMode;
    memberUserIds: number[];
    recipeOptions?: number[];
    deadline?: string | null;
  }): Promise<MealInvitation> {
    return createInvitationMutation.mutateAsync(payload);
  }

  async function updateInvitation(id: number, payload: { status?: InvitationStatus; finalRecipeId?: number | null }): Promise<MealInvitation> {
    return updateInvitationMutation.mutateAsync({ id, payload });
  }

  async function cancelInvitation(id: number): Promise<void> {
    return cancelInvitationMutation.mutateAsync(id);
  }

  async function submitWish(invitationId: number, payload: {
    wishText?: string | null;
    recipeId?: number | null;
    ranking?: number | null;
    constraints?: string | null;
  }) {
    return submitWishMutation.mutateAsync({ invitationId, payload });
  }

  async function updateRsvp(invitationId: number, rsvp: RsvpStatus) {
    return updateRsvpMutation.mutateAsync({ invitationId, rsvp });
  }

  async function remindGuests(invitationId: number): Promise<{ success: boolean; reminded: number }> {
    const res = await authFetch(`${API_BASE}/meal-invitations/${invitationId}/remind`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Senden der Erinnerung");
    }
    return res.json();
  }

  async function remindGuest(invitationId: number, guestId: number): Promise<{ success: boolean; reminded: number }> {
    const res = await authFetch(`${API_BASE}/meal-invitations/${invitationId}/guests/${guestId}/remind`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Senden der Erinnerung");
    }
    return res.json();
  }

  return {
    invitations,
    loading,
    error,
    refetch: fetchInvitations,
    createInvitation,
    updateInvitation,
    cancelInvitation,
    submitWish,
    updateRsvp,
    remindGuests,
    remindGuest,
  };
}

export function useUsers() {
  const query = useQuery<AppUser[], Error>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/users`, { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  return { users: query.data ?? [] };
}
