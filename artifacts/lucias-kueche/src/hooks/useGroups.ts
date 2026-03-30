import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  remindersSentAt: string[] | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

function authHeaders(): Record<string, string> {
  return baseAuthHeaders({ "Content-Type": "application/json" });
}

async function fetchGroupsFn(): Promise<Group[]> {
  const res = await authFetch(`${API_BASE}/groups`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useGroups() {
  const queryClient = useQueryClient();

  const query = useQuery<Group[], Error>({
    queryKey: ["groups"],
    queryFn: fetchGroupsFn,
    staleTime: 30_000,
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, imageUrl }: { name: string; imageUrl?: string }) => {
      const res = await authFetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, imageUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Gruppe konnte nicht erstellt werden");
      }
      return res.json() as Promise<Group>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}/join`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Beitritt fehlgeschlagen");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: number; name: string }) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Umbenennung fehlgeschlagen");
      }
      return res.json() as Promise<Group>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const familyInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await authFetch(`${API_BASE}/groups/family-invite`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Einladung fehlgeschlagen");
      }
      return res.json() as Promise<GroupMember & { inviteType?: "user" | "email_only"; groupId: number }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async ({ groupId, emailOrUsername }: { groupId: number; emailOrUsername: string }) => {
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, memberId }: { groupId: number; memberId: number }) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}/members/${memberId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Mitglied konnte nicht entfernt werden");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const remindMemberMutation = useMutation({
    mutationFn: async ({ groupId, memberId }: { groupId: number; memberId: number }) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}/members/${memberId}/remind`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Erinnerung konnte nicht gesendet werden");
      return res.json() as Promise<{ notified: boolean; reason?: string; inviteLink?: string }>;
    },
  });

  const groups = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Gruppen konnten nicht geladen werden." : null;

  async function fetchGroups() {
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
  }

  async function createGroup(name: string, imageUrl?: string): Promise<Group> {
    return createGroupMutation.mutateAsync({ name, imageUrl });
  }

  async function joinGroup(groupId: number): Promise<void> {
    return joinGroupMutation.mutateAsync(groupId);
  }

  async function inviteMember(groupId: number, emailOrUsername: string): Promise<GroupMember & { inviteType?: "user" | "email_only" }> {
    return inviteMemberMutation.mutateAsync({ groupId, emailOrUsername });
  }

  async function getMembers(groupId: number): Promise<GroupMember[]> {
    const res = await authFetch(`${API_BASE}/groups/${groupId}/members`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Mitglieder konnten nicht geladen werden");
    return res.json();
  }

  async function removeMember(groupId: number, memberId: number): Promise<void> {
    return removeMemberMutation.mutateAsync({ groupId, memberId });
  }

  async function remindMember(groupId: number, memberId: number): Promise<{ notified: boolean; reason?: string; inviteLink?: string }> {
    return remindMemberMutation.mutateAsync({ groupId, memberId });
  }

  async function renameGroup(groupId: number, name: string): Promise<Group> {
    return renameGroupMutation.mutateAsync({ groupId, name });
  }

  async function familyInvite(email: string) {
    return familyInviteMutation.mutateAsync(email);
  }

  return { groups, loading, error, fetchGroups, createGroup, joinGroup, inviteMember, getMembers, removeMember, remindMember, familyInvite, renameGroup };
}

export function useAdminGroups() {
  const queryClient = useQueryClient();

  const query = useQuery<AdminGroup[], Error>({
    queryKey: ["groups", "admin"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/groups/admin`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const approveGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}/approve`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Freigabe fehlgeschlagen");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "admin"] }),
  });

  const rejectGroupMutation = useMutation({
    mutationFn: async ({ groupId, reason }: { groupId: number; reason?: string }) => {
      const res = await authFetch(`${API_BASE}/groups/${groupId}/reject`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Ablehnung fehlgeschlagen");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "admin"] }),
  });

  const groups = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Gruppen konnten nicht geladen werden." : null;

  async function fetchGroups() {
    await queryClient.invalidateQueries({ queryKey: ["groups", "admin"] });
  }

  async function approveGroup(groupId: number) {
    return approveGroupMutation.mutateAsync(groupId);
  }

  async function rejectGroup(groupId: number, reason?: string) {
    return rejectGroupMutation.mutateAsync({ groupId, reason });
  }

  return { groups, loading, error, fetchGroups, approveGroup, rejectGroup };
}
