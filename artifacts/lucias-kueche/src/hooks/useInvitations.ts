import { useState, useEffect, useCallback } from "react";

const API_BASE = "/api";

function getToken(): string | null {
  try {
    return localStorage.getItem("lk_auth_token");
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export type InvitationMode = "surprise" | "wishlist" | "vote" | "choice";
export type InvitationStatus = "open" | "decided" | "cancelled";
export type RsvpStatus = "pending" | "coming" | "not_coming";

export interface InvitationMember {
  id: number;
  mealInvitationId: number;
  userId: number;
  rsvp: RsvpStatus;
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

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  payload: { message?: string; relatedId?: number | null } | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface AppUser {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export function useInvitations() {
  const [invitations, setInvitations] = useState<MealInvitation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/meal-invitations`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const createInvitation = useCallback(async (payload: {
    date: string;
    mode: InvitationMode;
    memberUserIds: number[];
    recipeOptions?: number[];
    deadline?: string | null;
  }) => {
    const res = await fetch(`${API_BASE}/meal-invitations`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Erstellen der Einladung");
    }
    const created = await res.json();
    setInvitations((prev) => [created, ...prev]);
    return created as MealInvitation;
  }, []);

  const updateInvitation = useCallback(async (id: number, payload: { status?: InvitationStatus; finalRecipeId?: number | null }) => {
    const res = await fetch(`${API_BASE}/meal-invitations/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Aktualisieren");
    }
    const updated = await res.json();
    setInvitations((prev) => prev.map((inv) => (inv.id === id ? { ...updated, isHost: inv.isHost, myMembership: inv.myMembership } : inv)));
    return updated as MealInvitation;
  }, []);

  const cancelInvitation = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/meal-invitations/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Absagen");
    }
    setInvitations((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: "cancelled" } : inv)));
  }, []);

  const submitWish = useCallback(async (invitationId: number, payload: {
    wishText?: string | null;
    recipeId?: number | null;
    ranking?: number | null;
    constraints?: string | null;
  }) => {
    const res = await fetch(`${API_BASE}/meal-invitations/${invitationId}/wishes`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim Speichern des Wunsches");
    }
    await fetchInvitations();
    return await res.json();
  }, [fetchInvitations]);

  const updateRsvp = useCallback(async (invitationId: number, rsvp: RsvpStatus) => {
    const res = await fetch(`${API_BASE}/meal-invitations/${invitationId}/rsvp`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ rsvp }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Fehler beim RSVP");
    }
    await fetchInvitations();
    return await res.json();
  }, [fetchInvitations]);

  return {
    invitations,
    loading,
    refetch: fetchInvitations,
    createInvitation,
    updateInvitation,
    cancelInvitation,
    submitWish,
    updateRsvp,
  };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch(`${API_BASE}/notifications/read-all`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
  }, []);

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  return { notifications, loading, unreadCount, markRead, markAllRead, refetch: fetchNotifications };
}

export function useUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    fetch(`${API_BASE}/users`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setUsers(data))
      .catch(() => {});
  }, []);

  return { users };
}
