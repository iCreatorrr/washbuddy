import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Wrench, LayoutGrid, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { format, addDays, subDays, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTimelineBlockColors } from "@/lib/service-colors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BODY_TYPE_ICON, BODY_TYPE_STYLE, normalizeBodyType } from "@/lib/vehicleBodyType";
import { resolveBookingDisplayName } from "@/lib/bookingDisplay";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

export default function BayTimeline() {
  const { user } = useAuth();
  const providerId = getProviderId(user);
  const [, navigate] = useLocation();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const startHour = 6;
  const endHour = 22;

  useEffect(() => {
    if (!providerId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const locs = d.locations || [];
        setLocations(locs);
        if (locs.length > 0 && !selectedLocation) setSelectedLocation(locs[0].id);
      })
      .catch(() => {});
  }, [providerId]);

  useEffect(() => {
    if (!providerId || !selectedLocation) return;
    setIsLoading(true);
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocation}/bay-timeline?date=${selectedDate}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, selectedLocation, selectedDate]);

  const totalMinutes = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  // Current time indicator position
  const [nowPos, setNowPos] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const startMins = startHour * 60;
      if (nowMins >= startMins && nowMins <= endHour * 60) {
        setNowPos(((nowMins - startMins) / totalMinutes) * 100);
      } else {
        setNowPos(null);
      }
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  const bays = data?.bays || [];
  const bayCount = data?.bayCount ?? bays.length;
  const unassignedBookings: any[] = data?.unassignedBookings || [];
  const tz = data?.locationTimezone || "America/New_York";

  // Optimistic overrides for drag-and-drop: keyed by bookingId → bayId. We
  // render these as if the drop succeeded; on server error we roll back.
  const [optimisticBay, setOptimisticBay] = useState<Record<string, string>>({});
  const [dragOverBayId, setDragOverBayId] = useState<string | null>(null);

  const handleDrop = async (targetBayId: string, bookingId: string, originalBayId: string | null) => {
    setDragOverBayId(null);
    if (targetBayId === originalBayId) return;
    // Optimistic UI
    setOptimisticBay((prev) => ({ ...prev, [bookingId]: targetBayId }));
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/assign-bay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bayId: targetBayId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "Move failed");
      }
      toast.success("Booking moved");
      // Refresh authoritative data
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocation}/bay-timeline?date=${selectedDate}`, { credentials: "include" });
      setData(await r.json());
    } catch (err: any) {
      toast.error(err?.message || "Couldn't move booking");
    } finally {
      setOptimisticBay((prev) => {
        const { [bookingId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  function getBlockPosition(startUtc: string, endUtc: string) {
    const start = new Date(startUtc);
    const end = new Date(endUtc);
    const startLocal = new Date(start.toLocaleString("en-US", { timeZone: tz }));
    const endLocal = new Date(end.toLocaleString("en-US", { timeZone: tz }));
    const startMins = startLocal.getHours() * 60 + startLocal.getMinutes();
    const endMins = endLocal.getHours() * 60 + endLocal.getMinutes();
    const viewStart = startHour * 60;
    const left = Math.max(0, ((startMins - viewStart) / totalMinutes) * 100);
    const width = Math.max(3, ((endMins - startMins) / totalMinutes) * 100);
    return { left, width, startMins };
  }

  // Compute overlap indices within a bay's bookings
  function computeOverlapSlots(bookings: any[]): Map<string, { slotIndex: number; slotCount: number }> {
    const slots = new Map<string, { slotIndex: number; slotCount: number }>();
    if (!bookings?.length) return slots;

    const blocks = bookings.map((b: any) => {
      const pos = getBlockPosition(b.scheduledStartAtUtc, b.scheduledEndAtUtc);
      return { id: b.id, start: pos.startMins, end: pos.startMins + (pos.width / 100) * totalMinutes };
    });

    // For each booking, find how many overlap and assign a slot index
    for (let i = 0; i < blocks.length; i++) {
      const overlapping = blocks.filter((other, j) =>
        j !== i && other.start < blocks[i].end && other.end > blocks[i].start
      );
      const group = [blocks[i], ...overlapping].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      const slotIndex = group.findIndex((g) => g.id === blocks[i].id);
      const slotCount = group.length;
      slots.set(blocks[i].id, { slotIndex, slotCount });
    }
    return slots;
  }

  if (!providerId) return <div className="p-8 text-center text-slate-500">No provider access.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Bay Timeline</h1>
          <p className="text-slate-500 mt-1">Visual schedule across all wash bays.</p>
        </div>
      </div>

      {/* Date + Location */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}><ChevronLeft className="h-4 w-4" /></Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 min-w-[160px]"><CalendarIcon className="h-4 w-4" />{format(parseISO(selectedDate), "EEE, MMM d")}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(selectedDate)}
                  onSelect={(day: Date | undefined) => { if (day) { setSelectedDate(format(day, "yyyy-MM-dd")); setCalendarOpen(false); } }}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}
            className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </Card>

      {/* Orphan-booking warning */}
      {!isLoading && unassignedBookings.length > 0 && (
        <div
          role="button"
          onClick={() => navigate(`/bookings/${unassignedBookings[0].id}`)}
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-amber-900">
              {unassignedBookings.length === 1
                ? "1 booking has no bay assigned — click to resolve"
                : `${unassignedBookings.length} bookings have no bay assigned — click to open the first`}
            </p>
            <p className="text-sm text-amber-800 mt-0.5">
              This shouldn't happen under normal operation. Reassign from the booking's detail page.
            </p>
          </div>
        </div>
      )}

      {/* Timeline Grid */}
      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-xl" />)}</div>
      ) : bayCount === 0 ? (
        <Card className="p-10 text-center">
          <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No bays configured for this location</h3>
          <p className="text-slate-500 mt-1 max-w-md mx-auto">
            Bookings cannot be created without at least one wash bay. Configure
            bays so auto-matching can route each booking to a compatible slot.
          </p>
          <Button
            className="mt-5"
            onClick={() => navigate(`/provider/settings?tab=bays&locationId=${selectedLocation}`)}
          >
            Add a bay
          </Button>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Time header */}
            <div className="flex border-b border-slate-200">
              <div className="w-[120px] shrink-0 p-2 text-xs font-bold text-slate-500">Bay</div>
              <div className="flex-1 relative h-8">
                {hours.map((h) => (
                  <div key={h} className="absolute top-0 h-full border-l border-slate-200" style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }}>
                    <span className="text-[10px] text-slate-400 ml-1">{h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bay rows (with optimistic drag overrides applied) */}
            {(() => {
              // Rebuild per-bay booking lists accounting for optimistic moves.
              const byBay: Record<string, any[]> = {};
              for (const bay of bays) byBay[bay.id] = [];
              for (const bay of bays) {
                for (const b of bay.bookings || []) {
                  const targetBay = optimisticBay[b.id] || bay.id;
                  if (byBay[targetBay]) byBay[targetBay].push(b);
                  else byBay[bay.id].push(b);
                }
              }
              return bays.map((bay: any) => {
                const bookingsForBay = byBay[bay.id] || [];
                const overlapSlots = computeOverlapSlots(bookingsForBay);
                const ROW_HEIGHT = 72;
                const isDropTarget = dragOverBayId === bay.id;
                return (
                  <div
                    key={bay.id}
                    className={cn(
                      "flex border-b border-slate-100 transition-colors",
                      !bay.isActive && bay.outOfServiceSince && "bg-slate-50/70",
                      isDropTarget && "bg-blue-50 ring-2 ring-blue-300",
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOverBayId(bay.id); }}
                    onDragLeave={() => setDragOverBayId((cur) => (cur === bay.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const payload = e.dataTransfer.getData("application/json");
                      if (!payload) return;
                      try {
                        const { bookingId, originalBayId } = JSON.parse(payload);
                        handleDrop(bay.id, bookingId, originalBayId);
                      } catch {}
                    }}
                  >
                  <div className="w-[120px] shrink-0 p-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1">
                      {bay.outOfServiceSince && <Wrench className="h-3 w-3 text-amber-500" />}
                      <span className="text-sm font-medium text-slate-900">{bay.name}</span>
                    </div>
                    <div className="flex gap-0.5 mt-0.5">
                      {bay.supportedClasses?.map((c: string) => (
                        <span key={c} className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-600">{c[0]}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 relative" style={{ height: `${ROW_HEIGHT}px` }}>
                    {/* Hour gridlines */}
                    {hours.map((h) => (
                      <div key={h} className="absolute top-0 h-full border-l border-slate-100" style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }} />
                    ))}

                    {/* Current time line */}
                    {nowPos != null && selectedDate === format(new Date(), "yyyy-MM-dd") && (
                      <div className="absolute top-0 h-full border-l-2 border-red-500 z-10" style={{ left: `${nowPos}%` }} />
                    )}

                    {/* Booking blocks — primary label is now the
                        driver/customer name (the operator scans for
                        "who is this"); service name moves to the
                        secondary line + tooltip. */}
                    {bookingsForBay.map((b: any) => {
                      const pos = getBlockPosition(b.scheduledStartAtUtc, b.scheduledEndAtUtc);
                      const colorClasses = getTimelineBlockColors(b.serviceNameSnapshot);
                      const slot = overlapSlots.get(b.id) || { slotIndex: 0, slotCount: 1 };
                      const blockHeight = (ROW_HEIGHT - 8) / slot.slotCount;
                      const blockTop = 4 + slot.slotIndex * blockHeight;
                      const displayName = resolveBookingDisplayName(b);
                      const originalBayId = bay.id;
                      const bt = b.vehicle?.bodyType ? normalizeBodyType(b.vehicle.bodyType) : null;
                      const bodyTypeStyle = bt ? BODY_TYPE_STYLE[bt] : null;
                      const BodyIcon = bt ? BODY_TYPE_ICON[bt] : null;

                      return (
                        <div
                          key={b.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("application/json", JSON.stringify({ bookingId: b.id, originalBayId }));
                          }}
                          className={cn(
                            "absolute rounded-md border overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg hover:z-20 transition-shadow z-[5] flex flex-col justify-center px-2",
                            colorClasses
                          )}
                          style={{
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            top: `${blockTop}px`,
                            height: `${blockHeight - 2}px`,
                          }}
                          title={`${displayName} — ${b.serviceNameSnapshot}\n${b.vehicleUnitNumber || b.fleetPlaceholderClass || ""}`}
                          onClick={() => navigate(`/bookings/${b.id}`)}
                        >
                          {bodyTypeStyle && <div className={`absolute left-0 top-0 bottom-0 w-1 ${bodyTypeStyle.stripe}`} aria-hidden />}
                          <div className={cn("flex items-center gap-1 leading-tight", bodyTypeStyle ? "pl-1.5" : "")}>
                            {BodyIcon && bodyTypeStyle && <BodyIcon className={cn("h-3 w-3 shrink-0", bodyTypeStyle.text)} aria-hidden />}
                            <p className="text-xs font-bold truncate">{displayName}</p>
                          </div>
                          {blockHeight > 28 && (
                            <p className={cn("text-[10px] truncate leading-tight opacity-70", bodyTypeStyle ? "pl-1.5" : "")}>
                              {b.vehicleUnitNumber || b.fleetPlaceholderClass || ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </Card>
      )}
    </div>
  );
}
