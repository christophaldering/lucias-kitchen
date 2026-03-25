import { useState, useEffect, useCallback } from "react";
import { authFetch, authHeaders } from "@/lib/authFetch";

export interface CookingLogEntry {
  id: number;
  userId: number;
  recipeId: number;
  date: string;
  comment: string | null;
  photoUrl: string | null;
  createdAt: string | null;
  recipeTitle: string | null;
  recipeCategory: string | null;
  recipeImageUrl: string | null;
}

const API_BASE = "/api";


export function useCookingLog(recipeId?: number, limit?: number) {
  const [entries, setEntries] = useState<CookingLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (recipeId !== undefined) params.set("recipeId", String(recipeId));
      if (limit !== undefined) params.set("limit", String(limit));
      const res = await authFetch(`${API_BASE}/cooking-log?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data);
    } catch {
      setError("Tagebuch konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [recipeId, limit]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, error, refetch: fetchEntries };
}

export async function createCookingLogEntry(payload: {
  recipeId: number;
  date: string;
  comment?: string | null;
  photoUrl?: string | null;
}): Promise<{ entry: CookingLogEntry; recipe: unknown }> {
  const res = await authFetch(`${API_BASE}/cooking-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteCookingLogEntry(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/cooking-log/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function uploadCookingLogPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API_BASE}/upload-image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Upload fehlgeschlagen: HTTP ${res.status}`);
  }
  const { imageUrl } = await res.json();
  return imageUrl;
}
