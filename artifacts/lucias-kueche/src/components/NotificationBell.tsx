import { useState, useRef, useEffect } from "react";
import { Bell, Check, MessageCircle, FileText, UtensilsCrossed, CheckCircle, XCircle } from "lucide-react";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type AppNotification,
} from "@/hooks/useNotifications";

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "Gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tag(en)`;
}

function getNotificationText(notification: AppNotification): string {
  const { type, payload } = notification;
  if (type === "comment" && payload.commenterName && payload.recipeTitle) {
    return `${payload.commenterName} hat dein Rezept „${payload.recipeTitle}" kommentiert`;
  }
  if (payload.message) {
    return payload.message;
  }
  return "Neue Benachrichtigung";
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "comment":
      return <MessageCircle className="w-4 h-4 text-[#4A7C59]" />;
    case "bulk_import_done":
      return <FileText className="w-4 h-4 text-[#4A7C59]" />;
    case "invitation":
      return <UtensilsCrossed className="w-4 h-4 text-[#4A7C59]" />;
    case "decision":
      return <CheckCircle className="w-4 h-4 text-[#4A7C59]" />;
    case "cancellation":
      return <XCircle className="w-4 h-4 text-[#4A7C59]" />;
    default:
      return <Bell className="w-4 h-4 text-[#4A7C59]" />;
  }
}

function NotificationItem({
  notification,
  onRead,
  onOpenRecipe,
  onNavigate,
  onClose,
}: {
  notification: AppNotification;
  onRead: (id: number) => void;
  onOpenRecipe: (recipeId: number) => void;
  onNavigate: (tab: string) => void;
  onClose: () => void;
}) {
  const isUnread = !notification.readAt;
  const { type, payload } = notification;

  const text = getNotificationText(notification);
  const icon = getNotificationIcon(type);

  function handleClick() {
    if (isUnread) onRead(notification.id);
    onClose();
    if (type === "comment" && payload.recipeId) {
      onOpenRecipe(payload.recipeId);
    } else if (type === "bulk_import_done") {
      onNavigate("rezepte");
    } else if (type === "invitation" || type === "decision" || type === "cancellation") {
      onNavigate("meine-kueche");
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#4A7C59]/5 transition-colors ${
        isUnread ? "bg-[#4A7C59]/10" : ""
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-8 h-8 rounded-full bg-[#4A7C59]/15 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-foreground" : "font-normal text-muted-foreground"}`}>
          {text}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(notification.createdAt)}</p>
      </div>
      {isUnread && <div className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[#C1693A]" />}
    </button>
  );
}

interface NotificationBellProps {
  onOpenRecipe?: (recipeId: number) => void;
  onNavigate?: (tab: string) => void;
}

export function NotificationBell({ onOpenRecipe, onNavigate }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleOpenRecipe(recipeId: number) {
    setOpen(false);
    onOpenRecipe?.(recipeId);
  }

  function handleNavigate(tab: string) {
    setOpen(false);
    onNavigate?.(tab);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        title="Benachrichtigungen"
      >
        <Bell className="w-5 h-5 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#C1693A] text-white text-[10px] font-bold px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-border overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#4A7C59]" />
              <p className="font-semibold text-sm text-foreground">Benachrichtigungen</p>
              {unreadCount > 0 && (
                <span className="text-xs bg-[#C1693A] text-white px-1.5 py-0.5 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-[#4A7C59] hover:underline"
              >
                <Check className="w-3 h-3" />
                Alle gelesen
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">Keine Benachrichtigungen</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={(id) => markRead.mutate(id)}
                  onOpenRecipe={handleOpenRecipe}
                  onNavigate={handleNavigate}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
