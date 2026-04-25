import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Star, AlertTriangle, Sparkles, ChevronDown, MessageSquare, Camera, StickyNote } from "lucide-react";
import { formatCurrency, formatVehicleClass } from "@/lib/utils";
import { toast } from "sonner";
import { PhotoPrompt } from "./photo-prompt";
import { BODY_TYPE_ICON, BODY_TYPE_STYLE, deriveSizeClassFromLengthInches, normalizeBodyType, type BodyType } from "@/lib/vehicleBodyType";

const API_BASE = import.meta.env.VITE_API_URL || "";

const VEHICLE_CLASS_BADGE: Record<string, { label: string; color: string }> = {
  SMALL:       { label: "S",  color: "bg-slate-200 text-slate-700" },
  MEDIUM:      { label: "M",  color: "bg-blue-200 text-blue-700" },
  LARGE:       { label: "L",  color: "bg-indigo-200 text-indigo-700" },
  EXTRA_LARGE: { label: "XL", color: "bg-purple-200 text-purple-700" },
};

function classBadgeFor(booking: any): { label: string; color: string } {
  const fromVehicle = booking.vehicle?.lengthInches != null ? deriveSizeClassFromLengthInches(booking.vehicle.lengthInches) : null;
  const key = fromVehicle || booking.fleetPlaceholderClass || "MEDIUM";
  return VEHICLE_CLASS_BADGE[key] || VEHICLE_CLASS_BADGE.MEDIUM;
}

/** Resolve the body type for a booking: prefers vehicle.bodyType, falls
 * back to OTHER for bookings without a vehicle (fleet-placeholder rows).
 * Returns the type plus its style + icon so callers can render the accent
 * (small left stripe / chip) without re-deriving. */
function bodyAccentFor(booking: any): { type: BodyType; style: typeof BODY_TYPE_STYLE[BodyType]; Icon: typeof BODY_TYPE_ICON[BodyType] } {
  const type = normalizeBodyType(booking.vehicle?.bodyType ?? null);
  return { type, style: BODY_TYPE_STYLE[type], Icon: BODY_TYPE_ICON[type] };
}

const SOURCE_BADGE: Record<string, { label: string; variant: string; className?: string }> = {
  PLATFORM: { label: "WashBuddy", variant: "default" },
  DIRECT: { label: "Direct", variant: "secondary" },
  WALK_IN: { label: "Walk-in", variant: "outline", className: "text-orange-600 border-orange-300" },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PROVIDER_CONFIRMED: { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" },
  CHECKED_IN: { label: "Checked In", className: "bg-amber-100 text-amber-700 border-amber-200" },
  IN_SERVICE: { label: "In Progress", className: "bg-green-100 text-green-700 border-green-200" },
  COMPLETED_PENDING_WINDOW: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  COMPLETED: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  SETTLED: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

function ElapsedTimer({ startedAt, durationMins }: { startedAt: string; durationMins: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const pct = elapsed / (durationMins * 60);
  const color = pct < 0.75 ? "text-green-600" : pct < 1 ? "text-amber-600" : "text-red-600";

  return <span className={`text-sm font-mono font-bold ${color}`}>{mins}:{String(secs).padStart(2, "0")}</span>;
}

export function BookingCard({ booking, onStatusChange }: { booking: any; onStatusChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState<"BEFORE" | "AFTER" | null>(null);

  const b = booking;
  const vc = classBadgeFor(b);
  const src = SOURCE_BADGE[b.bookingSource] || SOURCE_BADGE.PLATFORM;
  const st = STATUS_BADGE[b.status] || STATUS_BADGE.PROVIDER_CONFIRMED;
  const clientName = b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : b.offPlatformClientName || "Unknown";
  const time = new Date(b.scheduledStartAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: b.locationTimezone });

  const handleTransition = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const endpoint = newStatus === "CHECKED_IN" ? "checkin" : newStatus === "IN_SERVICE" ? "start-service" : "complete";
      const res = await fetch(`${API_BASE}/api/bookings/${b.id}/${endpoint}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      toast.success(newStatus === "CHECKED_IN" ? "Vehicle checked in" : newStatus === "IN_SERVICE" ? "Wash started" : "Wash completed");
      onStatusChange();
    } catch { toast.error("Action failed. Please retry."); }
    finally { setActionLoading(false); }
  };

  return (
    <Card className="border hover:border-primary/30 transition-colors overflow-hidden">
      {/* Collapsed row */}
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-sm font-medium text-slate-600 w-[70px] shrink-0">{time}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${vc.color}`}>
          <span className="text-xs font-bold">{vc.label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{clientName}</p>
          <p className="text-xs text-slate-500 truncate">{b.fleetName || ""}</p>
        </div>
        <span className="text-xs text-slate-500 min-w-[100px] max-w-[200px] truncate hidden sm:block" title={b.serviceNameSnapshot}>{b.serviceNameSnapshot}</span>
        <span className="text-xs w-[80px] truncate hidden md:block" title={b.washBay?.name ? `Bay: ${b.washBay.name}` : "No bay assigned"}>
          {b.washBay?.name
            ? <span className="text-slate-600 font-medium">{b.washBay.name}</span>
            : <span className="text-orange-500">Unassigned</span>}
        </span>
        <Badge className={`text-[10px] shrink-0 ${src.className || ""}`} variant={src.variant as any}>{src.label}</Badge>
        <Badge className={`text-[10px] shrink-0 ${st.className}`}>{st.label}</Badge>
        {b.status === "IN_SERVICE" && b.serviceStartedAtUtc && (
          <ElapsedTimer startedAt={b.serviceStartedAtUtc} durationMins={30} />
        )}
        <div className="flex gap-0.5 w-[48px] shrink-0">
          {b.clientTags?.includes("VIP") && <Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
          {b.clientTags?.includes("SERVICE_RECOVERY") && <AlertTriangle className="h-4 w-4 text-red-400" />}
          {b.clientTags?.includes("NEW_CLIENT") && <Sparkles className="h-4 w-4 text-green-400" />}
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Vehicle: {b.vehicle?.unitNumber || formatVehicleClass(b.fleetPlaceholderClass) || "N/A"}</span>
            <span>Bay: {b.washBay?.name || "Unassigned"}</span>
            <span>Price: {formatCurrency(b.totalPriceMinor, b.currencyCode)}</span>
            {b.discountAmountMinor > 0 && <span className="text-green-600">Discount: -{formatCurrency(b.discountAmountMinor)}</span>}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {b.washNoteCount > 0 && <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" />{b.washNoteCount} notes</span>}
            {b.photoCount > 0 && <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{b.photoCount} photos</span>}
            {b.messageCount > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{b.messageCount} messages</span>}
          </div>

          {showPhotoPrompt && (
            <PhotoPrompt bookingId={b.id} photoType={showPhotoPrompt}
              onComplete={async () => {
                const wasType = showPhotoPrompt;
                setShowPhotoPrompt(null);
                if (wasType === "BEFORE") await handleTransition("IN_SERVICE");
                else onStatusChange(); // AFTER — status already changed
              }} />
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {b.status === "PROVIDER_CONFIRMED" && (
              <Button size="sm" onClick={() => handleTransition("CHECKED_IN")} isLoading={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">Check In</Button>
            )}
            {b.status === "CHECKED_IN" && (
              <Button size="sm" onClick={() => setShowPhotoPrompt("BEFORE")} isLoading={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">Start Wash</Button>
            )}
            {b.status === "IN_SERVICE" && (
              <Button size="sm" onClick={async () => { await handleTransition("COMPLETED_PENDING_WINDOW"); setShowPhotoPrompt("AFTER"); }} isLoading={actionLoading} className="bg-emerald-700 hover:bg-emerald-800 text-white">Complete Wash</Button>
            )}
            {!b.isOffPlatform && (
              <Button size="sm" variant="outline" className="gap-1"><MessageSquare className="h-3.5 w-3.5" />Message Driver</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
