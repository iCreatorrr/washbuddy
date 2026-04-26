import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Filter, LayoutList, Clock, CheckCircle2, Truck, AlertTriangle, X } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { BookingCard } from "@/components/provider/booking-card";
import { QuickAddBooking } from "@/components/provider/quick-add-booking";
import { format, addDays, subDays, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

export default function DailyBoard() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [locationBayCount, setLocationBayCount] = useState<number | null>(null);
  const [noBayBannerDismissed, setNoBayBannerDismissed] = useState(false);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Filters (client-side)
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  // Load locations
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

  // Load daily board data
  useEffect(() => {
    if (!providerId || !selectedLocation) return;
    setIsLoading(true);
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocation}/daily-board?date=${selectedDate}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, selectedLocation, selectedDate, refreshKey]);

  // Probe bay count for the selected location — drives the no-bays banner.
  useEffect(() => {
    if (!providerId || !selectedLocation) { setLocationBayCount(null); return; }
    setNoBayBannerDismissed(false);
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocation}/bays`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLocationBayCount((d.bays || []).length))
      .catch(() => setLocationBayCount(null));
  }, [providerId, selectedLocation, refreshKey]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Apply client-side filters
  const filterBookings = (bookings: any[]) => {
    let result = bookings;
    if (filterSource !== "all") result = result.filter((b) => b.bookingSource === filterSource);
    return result;
  };

  const upcoming = filterBookings(data?.upcoming || []);
  const inProgress = filterBookings(data?.inProgress || []);
  const completed = filterBookings(data?.completed || []);

  const allFiltered = filterStatus === "upcoming" ? upcoming
    : filterStatus === "inProgress" ? inProgress
    : filterStatus === "completed" ? completed
    : [...upcoming, ...inProgress, ...completed];

  const [upExpanded, setUpExpanded] = useState(true);
  const [ipExpanded, setIpExpanded] = useState(true);
  const [compExpanded, setCompExpanded] = useState(false);

  // Per-row expansion lives on the page, not on each BookingCard.
  // BookingCard's local `expanded` state was reset every 30 seconds by
  // the auto-refresh and on every note edit/delete (the kebab calls
  // refresh, which mutates `data` and the row's child state evaporated
  // along with the in-flight render). Holding a Set of ids here means
  // the expansion survives any refetch — only an actual reload clears it.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderSection = (
    title: string, Icon: any, items: any[], color: string, expanded: boolean, onToggle: () => void,
  ) => (
    <Section
      title={title}
      Icon={Icon}
      items={items}
      color={color}
      expanded={expanded}
      onToggle={onToggle}
      refresh={refresh}
      expandedIds={expandedIds}
      toggleExpanded={toggleExpanded}
    />
  );

  if (!providerId) return <div className="p-8 text-center text-slate-500">No provider access.</div>;

  return (
    <div className="space-y-6">
      {isQuickAddOpen && (
        <QuickAddBooking
          providerId={providerId}
          locationId={selectedLocation}
          locationName={locations.find((l: any) => l.id === selectedLocation)?.name}
          locationTimezone={locations.find((l: any) => l.id === selectedLocation)?.timezone || "America/New_York"}
          operatingWindows={locations.find((l: any) => l.id === selectedLocation)?.operatingWindows || []}
          onClose={() => setIsQuickAddOpen(false)}
          onSuccess={refresh}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Daily Wash Board</h1>
          <p className="text-slate-500 mt-1">Manage today's washes and track progress.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsQuickAddOpen(true)} disabled={locationBayCount === 0}>
          <Plus className="h-4 w-4" /> Add Booking
        </Button>
      </div>

      {/* No-bays banner */}
      {locationBayCount === 0 && !noBayBannerDismissed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-amber-900">This location has no bays configured</p>
            <p className="text-sm text-amber-800 mt-0.5">Bookings are disabled until at least one bay is set up.</p>
          </div>
          <a
            href={`/provider/settings?tab=bays&locationId=${selectedLocation}`}
            className="text-sm font-bold text-primary hover:underline whitespace-nowrap"
          >
            Add a bay →
          </a>
          <button onClick={() => setNoBayBannerDismissed(true)} className="p-1 hover:bg-amber-100 rounded">
            <X className="h-4 w-4 text-amber-700" />
          </button>
        </div>
      )}

      {/* Date + Location bar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 min-w-[160px]">
                  <CalendarIcon className="h-4 w-4" />
                  {format(parseISO(selectedDate), "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(selectedDate)}
                  onSelect={(day: Date | undefined) => { if (day) { setSelectedDate(format(day, "yyyy-MM-dd")); setCalendarOpen(false); } }}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}
            className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <div className="flex gap-1 ml-auto">
            {[{ value: "all", label: "All" }, { value: "PLATFORM", label: "WashBuddy" }, { value: "DIRECT", label: "Direct" }, { value: "WALK_IN", label: "Walk-in" }].map((f) => (
              <button key={f.value} onClick={() => setFilterSource(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterSource === f.value ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Board */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 animate-pulse bg-slate-100 rounded-xl" />)}
        </div>
      ) : (data?.upcoming?.length || 0) + (data?.inProgress?.length || 0) + (data?.completed?.length || 0) === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <CalendarIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No bookings scheduled for {format(new Date(selectedDate + "T12:00:00"), "MMMM d")}</h3>
          <p className="text-slate-500 mt-1">Add bookings using the + button or manage your availability in Settings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {renderSection("Upcoming", Clock, upcoming, "text-blue-500", upExpanded, () => setUpExpanded(!upExpanded))}
          {renderSection("In Progress", Truck, inProgress, "text-green-500", ipExpanded, () => setIpExpanded(!ipExpanded))}
          {renderSection("Completed", CheckCircle2, completed, "text-emerald-600", compExpanded, () => setCompExpanded(!compExpanded))}
        </div>
      )}
    </div>
  );
}

/** Section is defined at module scope (NOT inline in DailyBoard) so
 * React doesn't tear down + re-mount the entire booking-row tree on
 * every parent render. Inline declarations create a fresh component
 * type each render — that's what was nuking note-edit state and
 * causing the row-collapse-on-action bug. */
function Section({
  title, Icon, items, color, expanded, onToggle, refresh, expandedIds, toggleExpanded,
}: {
  title: string;
  Icon: any;
  items: any[];
  color: string;
  expanded: boolean;
  onToggle: () => void;
  refresh: () => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between py-3 px-1 group">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <span className="font-bold text-slate-900">{title}</span>
          <Badge variant="default" className="ml-1">{items.length}</Badge>
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-2 pb-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No bookings</p>
          ) : (
            items.map((b: any) => (
              <BookingCard
                key={b.id}
                booking={b}
                onStatusChange={refresh}
                rowExpanded={expandedIds.has(b.id)}
                onToggleExpanded={() => toggleExpanded(b.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
