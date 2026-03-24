import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = "/api";

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  payload: {
    commentId?: number;
    recipeId?: number;
    recipeTitle?: string;
    commenterName?: string;
    commenterId?: number;
  };
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  const { token } = useAuth();

  return useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export function useMarkNotificationRead() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark notification as read");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark all notifications as read");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
