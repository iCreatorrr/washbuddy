import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Notification {
  id: string;
  subject: string | null;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({ popoverDirection = "down" }: { popoverDirection?: "up" | "down" }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Poll unread count every 30s
  const fetchUnreadCount = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/notifications/unread-count`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setUnreadCount(d.count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Load notifications when popover opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    fetch(`${API_BASE}/api/notifications?limit=10`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotificationClick = async (n: Notification) => {
    // Mark as read
    try {
      await fetch(`${API_BASE}/api/notifications/${n.id}/read`, {
        method: "POST",
        credentials: "include",
      });
      // Update local state
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}

    // Navigate and close
    if (n.actionUrl) {
      setIsOpen(false);
      navigate(n.actionUrl);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      setUnreadCount(0);
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
                  onClick={() => handleNotificationClick(n)}
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
