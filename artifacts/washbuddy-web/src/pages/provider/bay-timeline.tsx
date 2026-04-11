import React, { useState, useEffect, useMemo } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Plus, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { format, addDays, subDays, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

const SERVICE_COLORS: Record<string, string> = {
  "Exterior": "bg-blue-100 border-blue-300 text-blue-800",
  "Interior": "bg-green-100 border-green-300 text-green-800",
  "Full Detail": "bg-purple-100 border-purple-300 text-purple-800",
  "Undercarriage": "bg-amber-100 border-amber-300 text-amber-800",
  "Quick": "bg-slate-100 border-slate-300 text-slate-800",
  "Express": "bg-slate-100 border-slate-300 text-slate-800",
  "Engine": "bg-red-100 border-red-300 text-red-800",
};

function getServiceColor(name: string): string {
  for (const [key, val] of Object.entries(SERVICE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return "bg-gray-100 border-gray-300 text-gray-800";
}

const SOURCE_BORDER: Record<string, string> = { PLATFORM: "border-l-blue-500", DIRECT: "border-l-gray-400", WALK_IN: "border-l-orange-500" };

export default function BayTimeline() {
  const { user } = useAuth();
  const providerId = getProviderId(user);
  const [, navigate] = useLocation();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const tz = data?.locationTimezone || "America/New_York";

  function getBlockPosition(startUtc: string, endUtc: string) {
    const start = new Date(startUtc);
    const end = new Date(endUtc);
    // Convert to local hours in timezone
    const startLocal = new Date(start.toLocaleString("en-US", { timeZone: tz }));
    const endLocal = new Date(end.toLocaleString("en-US", { timeZone: tz }));
    const startMins = startLocal.getHours() * 60 + startLocal.getMinutes();
    const endMins = endLocal.getHours() * 60 + endLocal.getMinutes();
    const viewStart = startHour * 60;
    const left = Math.max(0, ((startMins - viewStart) / totalMinutes) * 100);
    const width = Math.max(2, ((endMins - startMins) / totalMinutes) * 100);
    return { left: `${left}%`, width: `${width}%` };
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 min-w-[160px]"><CalendarIcon className="h-4 w-4" />{format(parseISO(selectedDate), "EEE, MMM d")}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(selectedDate)}
                  onSelect={(day: Date | undefined) => { if (day) setSelectedDate(format(day, "yyyy-MM-dd")); }}
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

      {/* Timeline Grid */}
      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse bg-slate-100 rounded-xl" />)}</div>
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

            {/* Bay rows */}
            {bays.map((bay: any) => (
              <div key={bay.id} className={`flex border-b border-slate-100 ${!bay.isActive && bay.outOfServiceSince ? "bg-slate-50/70" : ""}`}>
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
                <div className="flex-1 relative h-16">
                  {/* Hour gridlines */}
                  {hours.map((h) => (
                    <div key={h} className="absolute top-0 h-full border-l border-slate-100" style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }} />
                  ))}

                  {/* Current time line */}
                  {nowPos != null && selectedDate === format(new Date(), "yyyy-MM-dd") && (
                    <div className="absolute top-0 h-full border-l-2 border-red-500 z-10" style={{ left: `${nowPos}%` }} />
                  )}

                  {/* Booking blocks */}
                  {bay.bookings?.map((b: any) => {
                    const pos = getBlockPosition(b.scheduledStartAtUtc, b.scheduledEndAtUtc);
                    const color = getServiceColor(b.serviceNameSnapshot);
                    const srcBorder = SOURCE_BORDER[b.bookingSource] || SOURCE_BORDER.PLATFORM;
                    return (
                      <div key={b.id} className={`absolute top-[10%] h-[80%] rounded border ${color} border-l-[3px] ${srcBorder} px-1 overflow-hidden cursor-pointer hover:shadow-md hover:z-20 transition-shadow z-[5]`}
                        style={{ left: pos.left, width: pos.width }}
                        title={`${b.serviceNameSnapshot} - ${b.driverFirstName || b.offPlatformClientName || "Unknown"}`}
                        onClick={() => navigate(`/bookings/${b.id}`)}>
                        <p className="text-[10px] font-bold truncate">{b.vehicleUnitNumber || b.fleetPlaceholderClass || ""}</p>
                        <p className="text-[9px] truncate">{b.driverFirstName || b.offPlatformClientName || ""}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
