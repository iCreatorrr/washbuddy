import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface SubPackage {
  id: string;
  name: string;
  description?: string | null;
  locationId: string;
  includedServiceIds: string[];
  cadence: string;
  cadenceIntervalDays?: number | null;
  pricePerWashMinor: number;
  minWashes: number;
  isActive: boolean;
  _count?: { subscriptions: number };
}

interface Location {
  id: string;
  name: string;
}

interface ServiceInfo {
  id: string;
  name: string;
}

export function SubscriptionsTab({ providerId }: { providerId: string }) {
  const [packages, setPackages] = useState<SubPackage[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allServices, setAllServices] = useState<Record<string, ServiceInfo[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [editPkg, setEditPkg] = useState<SubPackage | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [cadence, setCadence] = useState("WEEKLY");
  const [pricePerWash, setPricePerWash] = useState("");
  const [minWashes, setMinWashes] = useState("3");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE}/api/providers/${providerId}/subscription-packages`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([locData, pkgData]) => {
      const locs = locData.locations || [];
      setLocations(locs);
      setPackages(pkgData.packages || []);
      if (locs.length > 0) setLocationId(locs[0].id);
      // Load services for each location
      locs.forEach((loc: Location) => {
        fetch(`${API_BASE}/api/providers/${providerId}/locations/${loc.id}/services`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => setAllServices((prev) => ({ ...prev, [loc.id]: d.services || [] })));
      });
    }).catch(() => toast.error("Failed to load data"))
      .finally(() => setIsLoading(false));
  }, [providerId]);

  const reload = async () => {
    const r = await fetch(`${API_BASE}/api/providers/${providerId}/subscription-packages`, { credentials: "include" });
    const d = await r.json();
    setPackages(d.packages || []);
  };

  const openCreate = () => {
    setIsNew(true);
    setEditPkg({} as SubPackage);
    setName("");
    setDescription("");
    setLocationId(locations[0]?.id || "");
    setSelectedServiceIds([]);
    setCadence("WEEKLY");
    setPricePerWash("");
    setMinWashes("3");
  };

  const openEdit = (pkg: SubPackage) => {
    setIsNew(false);
    setEditPkg(pkg);
    setName(pkg.name);
    setDescription(pkg.description || "");
    setLocationId(pkg.locationId);
    setSelectedServiceIds(pkg.includedServiceIds || []);
    setCadence(pkg.cadence);
    setPricePerWash((pkg.pricePerWashMinor / 100).toFixed(2));
    setMinWashes(String(pkg.minWashes));
  };

  const toggleActive = async (pkg: SubPackage) => {
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/subscription-packages/${pkg.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pkg.isActive }),
      });
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, isActive: !p.isActive } : p)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!locationId) { toast.error("Select a location"); return; }
    setSaving(true);
    try {
      const body = {
        name,
        description: description || null,
        locationId,
        includedServiceIds: selectedServiceIds,
        cadence,
        pricePerWashMinor: Math.round(parseFloat(pricePerWash || "0") * 100),
        minWashes: parseInt(minWashes) || 3,
        currencyCode: "USD",
        isActive: true,
      };
      const url = isNew
        ? `${API_BASE}/api/providers/${providerId}/subscription-packages`
        : `${API_BASE}/api/providers/${providerId}/subscription-packages/${editPkg!.id}`;
      await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(isNew ? "Package created" : "Package updated");
      setEditPkg(null);
      reload();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getLocationName = (locId: string) => locations.find((l) => l.id === locId)?.name || "Unknown";
  const getServiceNames = (ids: string[]) => {
    const all = Object.values(allServices).flat();
    return ids.map((id) => all.find((s) => s.id === id)?.name || "Unknown").join(", ");
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {packages.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <RotateCcw className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No subscription packages</h3>
          <p className="text-slate-500 mb-4">Create packages for fleet customers with recurring wash needs.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Create Package</Button>
        </div>
      ) : (
        <>
          {packages.map((pkg) => (
            <Card key={pkg.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-900">{pkg.name}</h4>
                    <Badge variant={pkg.isActive ? "success" : "default"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge className="text-[10px]">{pkg.cadence}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">
                    {getLocationName(pkg.locationId)} &middot; {formatCurrency(pkg.pricePerWashMinor)}/wash &middot; Min {pkg.minWashes} washes
                  </p>
                  {pkg.includedServiceIds.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Services: {getServiceNames(pkg.includedServiceIds)}</p>
                  )}
                  {pkg._count && <p className="text-xs text-slate-400 mt-0.5">{pkg._count.subscriptions} active subscriber{pkg._count.subscriptions !== 1 ? "s" : ""}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={pkg.isActive} onCheckedChange={() => toggleActive(pkg)} />
                  <Button size="sm" variant="outline" onClick={() => openEdit(pkg)}>Edit</Button>
                </div>
              </div>
            </Card>
          ))}
          <Button variant="outline" className="w-full" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Create Package
          </Button>
        </>
      )}

      <Dialog open={!!editPkg} onOpenChange={(o) => !o && setEditPkg(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Create Package" : "Edit Package"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Package Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly Standard" /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {allServices[locationId]?.length > 0 && (
              <div>
                <Label>Included Services</Label>
                <div className="space-y-1.5 mt-1 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2">
                  {allServices[locationId].map((svc) => (
                    <label key={svc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedServiceIds.includes(svc.id)}
                        onChange={(e) =>
                          setSelectedServiceIds((prev) =>
                            e.target.checked ? [...prev, svc.id] : prev.filter((id) => id !== svc.id)
                          )
                        }
                      />
                      {svc.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BIWEEKLY">Biweekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Price per Wash ($)</Label><Input type="number" step="0.01" value={pricePerWash} onChange={(e) => setPricePerWash(e.target.value)} /></div>
              <div><Label>Min. Washes</Label><Input type="number" value={minWashes} onChange={(e) => setMinWashes(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
