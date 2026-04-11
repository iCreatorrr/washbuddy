import React, { useState } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { MapPin, Clock, Plus, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface OperatingWindow {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

interface Location {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateCode?: string;
  regionCode?: string;
  postalCode: string;
  timezone: string;
  isVisible: boolean;
  maxConcurrentBookings: number;
  operatingWindows: OperatingWindow[];
  _count: { services: number; washBays: number };
}

function formatHoursDisplay(windows: OperatingWindow[]): string {
  if (!windows.length) return "No hours set";
  const byDay: Record<number, string[]> = {};
  windows.forEach((w) => {
    if (!byDay[w.dayOfWeek]) byDay[w.dayOfWeek] = [];
    byDay[w.dayOfWeek].push(`${formatTime(w.openTime)}-${formatTime(w.closeTime)}`);
  });
  // Group consecutive days with same hours
  const entries: string[] = [];
  let i = 0;
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  while (i < days.length) {
    const hours = byDay[days[i]].join(", ");
    let j = i + 1;
    while (j < days.length && byDay[days[j]].join(", ") === hours && days[j] === days[j - 1] + 1) j++;
    const range = j - i > 1
      ? `${DAY_NAMES[days[i]]}-${DAY_NAMES[days[j - 1]]}`
      : DAY_NAMES[days[i]];
    entries.push(`${range} ${hours}`);
    i = j;
  }
  return entries.join(", ");
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${m.toString().padStart(2, "0")}${ampm}`;
}

function HoursBuilder({
  windows,
  onChange,
}: {
  windows: OperatingWindow[];
  onChange: (w: OperatingWindow[]) => void;
}) {
  const dayEnabled = Array.from({ length: 7 }, (_, d) => windows.some((w) => w.dayOfWeek === d));
  const dayHours = Array.from({ length: 7 }, (_, d) => {
    const w = windows.find((w) => w.dayOfWeek === d);
    return { open: w?.openTime || "07:00", close: w?.closeTime || "18:00" };
  });

  const toggleDay = (day: number, enabled: boolean) => {
    if (enabled) {
      onChange([...windows, { dayOfWeek: day, openTime: "07:00", closeTime: "18:00" }]);
    } else {
      onChange(windows.filter((w) => w.dayOfWeek !== day));
    }
  };

  const updateTime = (day: number, field: "openTime" | "closeTime", value: string) => {
    onChange(
      windows.map((w) => (w.dayOfWeek === day ? { ...w, [field]: value } : w))
    );
  };

  return (
    <div className="space-y-1">
      {[0, 1, 2, 3, 4, 5, 6].map((day) => (
        <div key={day} className="flex items-center gap-3 py-2">
          <span className="w-12 text-sm font-medium text-slate-700">{DAY_NAMES[day]}</span>
          <Switch checked={dayEnabled[day]} onCheckedChange={(v) => toggleDay(day, v)} />
          {dayEnabled[day] && (
            <>
              <Input type="time" className="w-28 h-8 text-xs" value={dayHours[day].open}
                onChange={(e) => updateTime(day, "openTime", e.target.value)} />
              <span className="text-sm text-slate-400">to</span>
              <Input type="time" className="w-28 h-8 text-xs" value={dayHours[day].close}
                onChange={(e) => updateTime(day, "closeTime", e.target.value)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function LocationsTab({ providerId }: { providerId: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editLoc, setEditLoc] = useState<Location | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editWindows, setEditWindows] = useState<OperatingWindow[]>([]);
  const [editVisible, setEditVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!providerId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLocations(d.locations || []))
      .catch(() => toast.error("Failed to load locations"))
      .finally(() => setIsLoading(false));
  }, [providerId]);

  const openEdit = (loc: Location) => {
    setEditLoc(loc);
    setEditName(loc.name);
    setEditAddress(loc.addressLine1);
    setEditCity(loc.city);
    setEditTimezone(loc.timezone);
    setEditWindows(loc.operatingWindows.map((w) => ({ ...w })));
    setEditVisible(loc.isVisible);
  };

  const handleSave = async () => {
    if (!editLoc) return;
    setSaving(true);
    try {
      // Save location details
      await fetch(`${API_BASE}/api/providers/${providerId}/locations/${editLoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: editName, addressLine1: editAddress, city: editCity, timezone: editTimezone, isVisible: editVisible }),
      });
      // Save operating hours
      await fetch(`${API_BASE}/api/providers/${providerId}/locations/${editLoc.id}/hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ windows: editWindows }),
      });
      toast.success("Location updated");
      // Refresh
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" });
      const d = await r.json();
      setLocations(d.locations || []);
      setEditLoc(null);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-32 animate-pulse bg-slate-100 rounded-xl" />)}</div>;
  }

  if (!locations.length) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
        <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900">No locations found</h3>
        <p className="text-slate-500">Contact platform admin to set up your first location.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {locations.map((loc) => (
        <Card key={loc.id} className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-bold text-slate-900">{loc.name}</h3>
                <Badge variant={loc.isVisible ? "success" : "default"}>
                  {loc.isVisible ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mb-2">
                <MapPin className="h-3.5 w-3.5" /> {loc.addressLine1}, {loc.city}, {loc.stateCode || loc.regionCode}
              </p>
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-1">
                <Clock className="h-3.5 w-3.5" /> {formatHoursDisplay(loc.operatingWindows)}
              </div>
              <div className="flex gap-4 text-xs text-slate-400 mt-2">
                <span>{loc._count.washBays} bay{loc._count.washBays !== 1 ? "s" : ""}</span>
                <span>{loc._count.services} service{loc._count.services !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => openEdit(loc)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          </div>
        </Card>
      ))}

      <Dialog open={!!editLoc} onOpenChange={(o) => !o && setEditLoc(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Location Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={editTimezone} onChange={(e) => setEditTimezone(e.target.value)} placeholder="America/New_York" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="mb-0">Visible to customers</Label>
              <Switch checked={editVisible} onCheckedChange={setEditVisible} />
            </div>
            <div>
              <Label>Operating Hours</Label>
              <HoursBuilder windows={editWindows} onChange={setEditWindows} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLoc(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
