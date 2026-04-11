import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Filter, LayoutList, Clock, CheckCircle2, Truck } from "lucide-react";
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

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

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

  const Section = ({ title, icon: Icon, items, color, expanded, onToggle }: any) => (
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
            items.map((b: any) => <BookingCard key={b.id} booking={b} onStatusChange={refresh} />)
          )}
        </div>
      )}
    </div>
  );

  if (!providerId) return <div className="p-8 text-center text-slate-500">No provider access.</div>;

  return (
    <div className="space-y-6">
      {isQuickAddOpen && (
        <QuickAddBooking
          providerId={providerId}
          locationId={selectedLocation}
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
        <Button className="gap-2" onClick={() => setIsQuickAddOpen(true)}><Plus className="h-4 w-4" /> Add Booking</Button>
      </div>

      {/* Date + Location bar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
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
                  onSelect={(day: Date | undefined) => { if (day) setSelectedDate(format(day, "yyyy-MM-dd")); }}
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
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No bookings scheduled for {format(new Date(selectedDate + "T12:00:00"), "MMMM d")}</h3>
          <p className="text-slate-500 mt-1">Add bookings using the + button or manage your availability in Settings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Section title="Upcoming" icon={Clock} items={upcoming} color="text-blue-500" expanded={upExpanded} onToggle={() => setUpExpanded(!upExpanded)} />
          <Section title="In Progress" icon={Truck} items={inProgress} color="text-green-500" expanded={ipExpanded} onToggle={() => setIpExpanded(!ipExpanded)} />
          <Section title="Completed" icon={CheckCircle2} items={completed} color="text-emerald-600" expanded={compExpanded} onToggle={() => setCompExpanded(!compExpanded)} />
        </div>
      )}
    </div>
  );
}
