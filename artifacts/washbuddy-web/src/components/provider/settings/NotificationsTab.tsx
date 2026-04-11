import React, { useState, useEffect, useRef } from "react";
import { Card, Label } from "@/components/ui";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

const EVENT_LABELS: Record<string, string> = {
  NEW_BOOKING: "New Booking",
  CANCELLATION: "Cancellation",
  REVIEW_RECEIVED: "Review Received",
  SLA_WARNING: "SLA Warning",
  BOOKING_REMINDER: "Booking Reminder",
  WASH_COMPLETE: "Wash Complete",
  BOOKING_RESCHEDULED: "Booking Rescheduled",
  MESSAGE_RECEIVED: "New Message",
  WASH_HEALTH_ALERT: "Wash Health Alert",
  SUBSCRIPTION_RENEWAL: "Subscription Renewal",
};

interface Preference {
  eventType: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
}

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/users/me/notification-preferences`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPrefs(d.preferences || []))
      .catch(() => toast.error("Failed to load preferences"))
      .finally(() => setIsLoading(false));
  }, []);

  const updatePref = (eventType: string, field: keyof Preference, value: boolean) => {
    const updated = prefs.map((p) =>
      p.eventType === eventType ? { ...p, [field]: value } : p
    );
    setPrefs(updated);

    // Debounced auto-save
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/api/users/me/notification-preferences`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: updated }),
        });
      } catch {
        toast.error("Failed to save preferences");
      }
    }, 800);
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse bg-slate-100 rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Bell className="h-4 w-4" />
        <span>Changes save automatically</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Event</th>
                <th className="text-center p-3 font-medium text-slate-600 w-24">In-App</th>
                <th className="text-center p-3 font-medium text-slate-600 w-24">Email</th>
                <th className="text-center p-3 font-medium text-slate-600 w-24">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prefs.map((p) => (
                <tr key={p.eventType} className="hover:bg-slate-50/50">
                  <td className="p-3 text-slate-800 font-medium">{EVENT_LABELS[p.eventType] || p.eventType}</td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={p.inAppEnabled}
                      onCheckedChange={(v) => updatePref(p.eventType, "inAppEnabled", v)}
                    />
                  </td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={p.emailEnabled}
                      onCheckedChange={(v) => updatePref(p.eventType, "emailEnabled", v)}
                    />
                  </td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={p.smsEnabled}
                      onCheckedChange={(v) => updatePref(p.eventType, "smsEnabled", v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
