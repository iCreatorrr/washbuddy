import React, { useEffect, useState } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { LayoutGrid, Plus, Pencil, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";
const VEHICLE_CLASSES = ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"] as const;

interface Location {
  id: string;
  name: string;
}

interface Bay {
  id: string;
  name: string;
  maxVehicleLengthIn: number;
  maxVehicleHeightIn: number;
  supportedClasses: string[];
  isActive: boolean;
  displayOrder: number;
  outOfServiceSince: string | null;
  outOfServiceReason: string | null;
}

interface BayForm {
  name: string;
  maxVehicleLengthIn: number;
  maxVehicleHeightIn: number;
  supportedClasses: string[];
  isActive: boolean;
}

const DEFAULT_FORM: BayForm = {
  name: "",
  maxVehicleLengthIn: 540,
  maxVehicleHeightIn: 156,
  supportedClasses: ["SMALL", "MEDIUM", "LARGE"],
  isActive: true,
};

function parseQuery(): { tab?: string; locationId?: string } {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return { tab: params.get("tab") || undefined, locationId: params.get("locationId") || undefined };
}

export function BaysTab({ providerId }: { providerId: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [bays, setBays] = useState<Bay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBayId, setEditingBayId] = useState<string | null>(null);
  const [form, setForm] = useState<BayForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const locs: Location[] = d.locations || [];
        setLocations(locs);
        const q = parseQuery();
        const initial = locs.find((l) => l.id === q.locationId)?.id || locs[0]?.id || "";
        setSelectedLocationId(initial);
      })
      .catch(() => toast.error("Failed to load locations"));
  }, [providerId]);

  useEffect(() => {
    if (!providerId || !selectedLocationId) return;
    setIsLoading(true);
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocationId}/bays`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setBays(d.bays || []))
      .catch(() => toast.error("Failed to load bays"))
      .finally(() => setIsLoading(false));
  }, [providerId, selectedLocationId]);

  const openCreate = () => {
    setEditingBayId(null);
    setForm({ ...DEFAULT_FORM, name: `Bay ${bays.length + 1}` });
    setDialogOpen(true);
  };

  const openEdit = (bay: Bay) => {
    setEditingBayId(bay.id);
    setForm({
      name: bay.name,
      maxVehicleLengthIn: bay.maxVehicleLengthIn,
      maxVehicleHeightIn: bay.maxVehicleHeightIn,
      supportedClasses: bay.supportedClasses,
      isActive: bay.isActive,
    });
    setDialogOpen(true);
  };

  const toggleClass = (cls: string) => {
    setForm((f) => ({
      ...f,
      supportedClasses: f.supportedClasses.includes(cls)
        ? f.supportedClasses.filter((c) => c !== cls)
        : [...f.supportedClasses, cls],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Bay name required"); return; }
    if (form.supportedClasses.length === 0) { toast.error("At least one vehicle class required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        maxVehicleLengthIn: form.maxVehicleLengthIn,
        maxVehicleHeightIn: form.maxVehicleHeightIn,
        supportedClasses: form.supportedClasses,
        isActive: form.isActive,
        displayOrder: editingBayId ? undefined : bays.length,
      };
      const res = editingBayId
        ? await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocationId}/bays/${editingBayId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocationId}/bays`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error("Save failed");
      toast.success(editingBayId ? "Bay updated" : "Bay added");
      const refreshed = await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocationId}/bays`, { credentials: "include" });
      const d = await refreshed.json();
      setBays(d.bays || []);
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save bay");
    } finally {
      setSaving(false);
    }
  };

  if (!locations.length) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
        <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900">No locations yet</h3>
        <p className="text-slate-500">Add a location first, then configure its bays here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Label className="mb-0">Location</Label>
        <select
          value={selectedLocationId}
          onChange={(e) => setSelectedLocationId(e.target.value)}
          className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
        >
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <Button className="ml-auto gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Bay
        </Button>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-xl" />)}</div>
      ) : bays.length === 0 ? (
        <Card className="p-10 text-center">
          <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No bays configured</h3>
          <p className="text-slate-500 mt-1 max-w-md mx-auto">
            Add at least one bay so bookings can be auto-matched to compatible slots.
          </p>
          <Button className="mt-5" onClick={openCreate}>Add a bay</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {bays.map((bay) => (
            <Card key={bay.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {bay.outOfServiceSince && <Wrench className="h-4 w-4 text-amber-500" />}
                  <h4 className="font-bold text-slate-900">{bay.name}</h4>
                  <Badge variant={bay.isActive ? "success" : "default"}>{bay.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Max {Math.round(bay.maxVehicleLengthIn / 12)}ft × {Math.round(bay.maxVehicleHeightIn / 12)}ft
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {bay.supportedClasses.map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{c.replace("_", " ")}</span>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(bay)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBayId ? "Edit Bay" : "Add Bay"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bay Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bay 1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Length (in)</Label>
                <Input type="number" min={0} value={form.maxVehicleLengthIn}
                  onChange={(e) => setForm({ ...form, maxVehicleLengthIn: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Max Height (in)</Label>
                <Input type="number" min={0} value={form.maxVehicleHeightIn}
                  onChange={(e) => setForm({ ...form, maxVehicleHeightIn: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Supported Vehicle Classes</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {VEHICLE_CLASSES.map((c) => {
                  const on = form.supportedClasses.includes(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleClass(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${on ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {c.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="mb-0">Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingBayId ? "Save Changes" : "Add Bay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
