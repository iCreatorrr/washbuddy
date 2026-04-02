import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { useGetUnreadNotificationCount, useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell({ popoverDirection = "down" }: { popoverDirection?: "up" | "down" }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: countData } = useGetUnreadNotificationCount({
    request: { credentials: "include" },
    query: { refetchInterval: 30000 },
  });

  const { data: listData, isLoading } = useListNotifications(
    { limit: 10 },
    {
      request: { credentials: "include" },
      query: { enabled: isOpen },
    }
  );

  const markRead = useMarkNotificationRead({ request: { credentials: "include" } });
  const markAllRead = useMarkAllNotificationsRead({ request: { credentials: "include" } });

  const unreadCount = countData?.count || 0;
  const notifications = listData?.notifications || [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string, actionUrl?: string | null) => {
    try {
      await markRead.mutateAsync({ notificationId: id });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch {}
    if (actionUrl) {
      setIsOpen(false);
      navigate(actionUrl);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync({});
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-slate-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-in zoom-in">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={cn(
          "absolute w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden",
          popoverDirection === "up" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n.id, n.actionUrl)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors",
                    !n.readAt && "bg-blue-50/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-1.5 h-2 w-2 rounded-full shrink-0",
                      n.readAt ? "bg-transparent" : "bg-blue-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      {n.subject && (
                        <p className="text-sm font-bold text-slate-900 truncate">{n.subject}</p>
                      )}
                      <p className="text-sm text-slate-600 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {n.actionUrl && (
                      <ExternalLink className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
