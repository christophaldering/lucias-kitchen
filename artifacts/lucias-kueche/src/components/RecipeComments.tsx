import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Star, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

export interface RecipeComment {
  id: number;
  recipeId: number;
  userId: number;
  content: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: {
  value: number | null;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const starSize = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hovered !== null ? star <= hovered : star <= (value ?? 0);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(null)}
            className={`${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"} transition-transform`}
          >
            <Star
              className={`${starSize} transition-colors ${
                filled ? "fill-amber-400 text-amber-400" : "text-gray-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CommentItem({
  comment,
  currentUserId,
  onEdit,
  onDelete,
}: {
  comment: RecipeComment;
  currentUserId: number | null;
  onEdit: (comment: RecipeComment, newContent: string, newRating: number | null) => void;
  onDelete: (id: number) => void;
}) {
  const isOwn = currentUserId === comment.userId;
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editRating, setEditRating] = useState<number | null>(comment.rating);

  function handleSave() {
    if (!editContent.trim()) return;
    onEdit(comment, editContent.trim(), editRating);
    setEditing(false);
  }

  function handleCancel() {
    setEditContent(comment.content);
    setEditRating(comment.rating);
    setEditing(false);
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#4A7C59]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-[#4A7C59]">
              {isOwn ? "Du" : "N"}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isOwn ? "Du" : "Nutzer"}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</p>
          </div>
        </div>
        {isOwn && !editing && (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg hover:bg-[#4A7C59]/10 text-muted-foreground hover:text-[#4A7C59] transition-colors"
              title="Bearbeiten"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(comment.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
              title="Löschen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {comment.rating !== null && !editing && (
        <div className="mb-2">
          <StarRating value={comment.rating} readonly size="sm" />
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Bewertung</p>
            <StarRating value={editRating} onChange={setEditRating} size="md" />
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6849] transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Speichern
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
      )}
    </div>
  );
}

export function RecipeComments({ recipeId }: { recipeId: number }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();

  const [newContent, setNewContent] = useState("");
  const [newRating, setNewRating] = useState<number | null>(null);

  const { data: comments = [], isLoading } = useQuery<RecipeComment[]>({
    queryKey: ["comments", recipeId],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/recipes/${recipeId}/comments`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ content, rating }: { content: string; rating: number | null }) => {
      const res = await authFetch(`${API_BASE}/recipes/${recipeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, rating }),
      });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["recipe-comment-stats"] });
      setNewContent("");
      setNewRating(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, content, rating }: { id: number; content: string; rating: number | null }) => {
      const res = await authFetch(`${API_BASE}/recipes/${recipeId}/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, rating }),
      });
      if (!res.ok) throw new Error("Failed to update comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["recipe-comment-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/recipes/${recipeId}/comments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["recipe-comment-stats"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    createMutation.mutate({ content: newContent.trim(), rating: newRating });
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-[#4A7C59]" />
        <h3 className="font-serif font-semibold text-lg text-foreground">
          Kommentare
          {comments.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({comments.length})</span>
          )}
        </h3>
      </div>

      {user && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-[#4A7C59]/5 rounded-xl border border-[#4A7C59]/20">
          <p className="text-sm font-semibold text-foreground mb-3">Kommentar hinterlassen</p>
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">Bewertung (optional)</p>
            <StarRating value={newRating} onChange={setNewRating} />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Dein Kommentar..."
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 bg-white"
            rows={3}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">{newContent.length}/2000</p>
            <button
              type="submit"
              disabled={!newContent.trim() || createMutation.isPending}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6849] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Absenden
            </button>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-600">Kommentar konnte nicht gespeichert werden.</p>
          )}
        </form>
      )}

      {!user && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Melde dich an, um einen Kommentar zu hinterlassen.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59]" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Noch keine Kommentare. Sei der Erste!
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id ?? null}
              onEdit={(c, content, rating) => editMutation.mutate({ id: c.id, content, rating })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function useCommentStats(recipeIds: number[]) {
  return useQuery<Record<number, { count: number; avgRating: number | null }>>({
    queryKey: ["recipe-comment-stats", recipeIds],
    queryFn: async () => {
      if (recipeIds.length === 0) return {};
      const results: Record<number, { count: number; avgRating: number | null }> = {};
      await Promise.all(
        recipeIds.map(async (id) => {
          const res = await authFetch(`${API_BASE}/recipes/${id}/comments`, { headers: authHeaders() });
          if (!res.ok) return;
          const comments: RecipeComment[] = await res.json();
          const rated = comments.filter((c) => c.rating !== null);
          results[id] = {
            count: comments.length,
            avgRating:
              rated.length > 0
                ? rated.reduce((sum, c) => sum + (c.rating ?? 0), 0) / rated.length
                : null,
          };
        })
      );
      return results;
    },
    staleTime: 60_000,
  });
}
