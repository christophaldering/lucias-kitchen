import { useState, useEffect, useCallback } from "react";
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
  const [members, setMembers] = useState<GroupMemberForSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/group-members`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMembers(data);
    } catch {
      setError("Mitglieder konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, loading, error, fetchMembers };
}

export function useIncomingSuggestions() {
  const [suggestions, setSuggestions] = useState<IncomingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/incoming`, { headers: authHeaders(), skipUnauthorizedHandler: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuggestions(data);
    } catch {
      setError("Vorschläge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 60_000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  const saveSuggestion = useCallback(async (id: number) => {
    const res = await authFetch(`${API_BASE}/recipe-suggestions/${id}/save`, {
      method: "PUT",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen");
    await fetchSuggestions();
  }, [fetchSuggestions]);

  const ignoreSuggestion = useCallback(async (id: number) => {
    const res = await authFetch(`${API_BASE}/recipe-suggestions/${id}/ignore`, {
      method: "PUT",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Ignorieren fehlgeschlagen");
    await fetchSuggestions();
  }, [fetchSuggestions]);

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
  const [suggestions, setSuggestions] = useState<OutgoingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/recipe-suggestions/outgoing`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuggestions(data);
    } catch {
      setError("Gesendete Vorschläge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

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
