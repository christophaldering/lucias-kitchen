import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch, authHeaders as baseAuthHeaders, getToken } from "@/lib/authFetch";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  return baseAuthHeaders({ "Content-Type": "application/json" });
}

export interface GroupMemberForSuggestion {
  userId: number;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  groupId: number;
  groupName: string;
}

export interface IncomingSuggestion {
  id: number;
  senderId: number;
  recipeId: number;
  message: string | null;
  status: "pending" | "saved" | "ignored";
  createdAt: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipeCategory: string;
}

export function useGroupMembersForSuggestion() {
  const query = useQuery<GroupMemberForSuggestion[], Error>({
    queryKey: ["recipe-suggestions", "group-members"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/group-members`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const members = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Mitglieder konnten nicht geladen werden." : null;

  async function fetchMembers() {
    await query.refetch();
  }

  return { members, loading, error, fetchMembers };
}

export function useIncomingSuggestions() {
  const queryClient = useQueryClient();

  const query = useQuery<IncomingSuggestion[], Error>({
    queryKey: ["recipe-suggestions", "incoming"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/incoming`, { headers: authHeaders(), skipUnauthorizedHandler: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const saveSuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/${id}/save`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipe-suggestions", "incoming"] }),
  });

  const ignoreSuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/${id}/ignore`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Ignorieren fehlgeschlagen");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipe-suggestions", "incoming"] }),
  });

  const suggestions = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Vorschläge konnten nicht geladen werden." : null;

  async function fetchSuggestions() {
    await queryClient.invalidateQueries({ queryKey: ["recipe-suggestions", "incoming"] });
  }

  async function saveSuggestion(id: number) {
    return saveSuggestionMutation.mutateAsync(id);
  }

  async function ignoreSuggestion(id: number) {
    return ignoreSuggestionMutation.mutateAsync(id);
  }

  return { suggestions, loading, error, fetchSuggestions, saveSuggestion, ignoreSuggestion };
}

export interface OutgoingSuggestion {
  id: number;
  recipientId: number;
  recipeId: number;
  message: string | null;
  status: "pending" | "saved" | "ignored";
  createdAt: string;
  recipientName: string | null;
  recipientAvatarUrl: string | null;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipeCategory: string;
}

export function useOutgoingSuggestions() {
  const query = useQuery<OutgoingSuggestion[], Error>({
    queryKey: ["recipe-suggestions", "outgoing"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/outgoing`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const suggestions = query.data ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Gesendete Vorschläge konnten nicht geladen werden." : null;

  async function fetchSuggestions() {
    await query.refetch();
  }

  return { suggestions, loading, error, fetchSuggestions };
}

export async function sendRecipeSuggestion(recipientId: number, recipeId: number, message?: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await authFetch(`${API_BASE}/recipe-suggestions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ recipientId, recipeId, message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Vorschlag konnte nicht gesendet werden");
  }
}
