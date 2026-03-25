import { useState, useEffect, useCallback } from "react";
import { authFetch, authHeaders as baseAuthHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

export interface Group {
  id: number;
  name: string;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  creatorId: number;
  createdAt: string;
  updatedAt: string;
  myRole?: "owner" | "member";
  myMemberStatus?: "invited" | "joined";
}

export interface AdminGroup extends Group {
  creatorName: string | null;
  creatorEmail: string | null;
}

export interface GroupMember {
  id: number;
  groupId: number;
  userId: number | null;
  invitedEmail: string | null;
  role: "owner" | "member";
  memberStatus: "invited" | "joined";
  createdAt: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

function authHeaders(): Record<string, string> {
  return baseAuthHeaders({ "Content-Type": "application/json" });
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/groups`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups(data);
    } catch {
      setError("Gruppen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = useCallback(async (name: string, imageUrl?: string) => {
    const res = await authFetch(`${API_BASE}/groups`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name, imageUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Gruppe konnte nicht erstellt werden");
    }
    const group = await res.json();
    await fetchGroups();
    return group as Group;
  }, [fetchGroups]);

  const joinGroup = useCallback(async (groupId: number) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/join`, {
      method: "PUT",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Beitritt fehlgeschlagen");
    await fetchGroups();
  }, [fetchGroups]);

  const inviteMember = useCallback(async (groupId: number, emailOrUsername: string) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/invite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ emailOrUsername }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Einladung fehlgeschlagen");
    }
    return res.json() as Promise<GroupMember & { inviteType?: "user" | "email_only" }>;
  }, []);

  const getMembers = useCallback(async (groupId: number): Promise<GroupMember[]> => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/members`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Mitglieder konnten nicht geladen werden");
    return res.json();
  }, []);

  const removeMember = useCallback(async (groupId: number, memberId: number) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/members/${memberId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Mitglied konnte nicht entfernt werden");
  }, []);

  const renameGroup = useCallback(async (groupId: number, name: string) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Umbenennung fehlgeschlagen");
    }
    const group = await res.json();
    await fetchGroups();
    return group as Group;
  }, [fetchGroups]);

  const familyInvite = useCallback(async (email: string) => {
    const res = await authFetch(`${API_BASE}/groups/family-invite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Einladung fehlgeschlagen");
    }
    const data = await res.json() as GroupMember & { inviteType?: "user" | "email_only"; groupId: number };
    await fetchGroups();
    return data;
  }, [fetchGroups]);

  return { groups, loading, error, fetchGroups, createGroup, joinGroup, inviteMember, getMembers, removeMember, familyInvite, renameGroup };
}

export function useAdminGroups() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/groups/admin`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups(data);
    } catch {
      setError("Gruppen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const approveGroup = useCallback(async (groupId: number) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/approve`, {
      method: "PUT",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Freigabe fehlgeschlagen");
    await fetchGroups();
  }, [fetchGroups]);

  const rejectGroup = useCallback(async (groupId: number, reason?: string) => {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/reject`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error("Ablehnung fehlgeschlagen");
    await fetchGroups();
  }, [fetchGroups]);

  return { groups, loading, error, fetchGroups, approveGroup, rejectGroup };
}
