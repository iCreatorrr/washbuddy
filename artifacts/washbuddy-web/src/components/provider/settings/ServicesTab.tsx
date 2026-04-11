import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Plus, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

const VEHICLE_CLASSES = [
  { value: "SMALL", label: "Small (under 25ft)" },
  { value: "MEDIUM", label: "Medium (25-35ft)" },
  { value: "LARGE", label: "Large (35-45ft)" },
  { value: "EXTRA_LARGE", label: "Extra Large (45ft+)" },
];

const MULTIPLIERS_PRICE: Record<string, number> = { SMALL: 0.7, MEDIUM: 1, LARGE: 1.3, EXTRA_LARGE: 1.6 };
const MULTIPLIERS_DUR: Record<string, number> = { SMALL: 0.7, MEDIUM: 1, LARGE: 1.2, EXTRA_LARGE: 1.4 };

interface PricingRow {
  price: string;
  duration: string;
  available: boolean;
}

interface ServiceData {
  id: string;
  name: string;
  description?: string | null;
  durationMins: number;
  basePriceMinor: number;
  requiresConfirmation: boolean;
  isVisible: boolean;
  pricing?: { vehicleClass: string; priceMinor: number; durationMins: number; isAvailable: boolean }[];
}

interface Location {
  id: string;
  name: string;
}

export function ServicesTab({ providerId }: { providerId: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocId, setSelectedLocId] = useState("");
  const [services, setServices] = useState<ServiceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editService, setEditService] = useState<ServiceData | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [pricing, setPricing] = useState<Record<string, PricingRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const locs = d.locations || [];
        setLocations(locs);
        if (locs.length > 0 && !selectedLocId) setSelectedLocId(locs[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId]);

  const loadServices = useCallback(async () => {
    if (!selectedLocId) return;
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/services`, { credentials: "include" });
      const d = await r.json();
      setServices(d.services || []);
    } catch {
      toast.error("Failed to load services");
    } finally {
      setIsLoading(false);
    }
  }, [providerId, selectedLocId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const openEditDialog = (svc: ServiceData | null) => {
    const isNewSvc = !svc;
    setIsNew(isNewSvc);
    setEditService(svc || ({} as ServiceData));
    setName(svc?.name || "");
    setDescription(svc?.description || "");
    setRequiresConfirmation(svc?.requiresConfirmation ?? true);
    setIsVisible(svc?.isVisible ?? true);

    const p: Record<string, PricingRow> = {};
    VEHICLE_CLASSES.forEach((cls) => {
      const existing = svc?.pricing?.find((pr) => pr.vehicleClass === cls.value);
      p[cls.value] = {
        price: existing ? (existing.priceMinor / 100).toFixed(2) : "",
        duration: existing ? String(existing.durationMins) : "",
        available: existing ? existing.isAvailable : true,
      };
    });
    setPricing(p);
  };

  const handlePriceChange = (cls: string, value: string) => {
    const newPricing = { ...pricing, [cls]: { ...pricing[cls], price: value } };
    // Auto-calculate for new services when MEDIUM is entered
    if (isNew && cls === "MEDIUM" && value) {
      const mediumPrice = parseFloat(value);
      if (!isNaN(mediumPrice)) {
        VEHICLE_CLASSES.forEach((vc) => {
          if (vc.value !== "MEDIUM" && !pricing[vc.value].price) {
            newPricing[vc.value] = {
              ...newPricing[vc.value],
              price: Math.round(mediumPrice * MULTIPLIERS_PRICE[vc.value]).toFixed(2),
            };
          }
        });
      }
    }
    setPricing(newPricing);
  };

  const handleDurationChange = (cls: string, value: string) => {
    const newPricing = { ...pricing, [cls]: { ...pricing[cls], duration: value } };
    if (isNew && cls === "MEDIUM" && value) {
      const medDur = parseInt(value);
      if (!isNaN(medDur)) {
        VEHICLE_CLASSES.forEach((vc) => {
          if (vc.value !== "MEDIUM" && !pricing[vc.value].duration) {
            newPricing[vc.value] = {
              ...newPricing[vc.value],
              duration: String(Math.round(medDur * MULTIPLIERS_DUR[vc.value])),
            };
          }
        });
      }
    }
    setPricing(newPricing);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Service name is required"); return; }
    setSaving(true);
    try {
      const pricingArray = VEHICLE_CLASSES
        .filter((cls) => pricing[cls.value].price && pricing[cls.value].duration)
        .map((cls) => ({
          vehicleClass: cls.value,
          priceMinor: Math.round(parseFloat(pricing[cls.value].price) * 100),
          durationMins: parseInt(pricing[cls.value].duration),
          isAvailable: pricing[cls.value].available,
        }));

      // Use MEDIUM row for basePriceMinor/durationMins fallback
      const medRow = pricingArray.find((p) => p.vehicleClass === "MEDIUM") || pricingArray[0];
      const basePriceMinor = medRow?.priceMinor || 0;
      const durationMins = medRow?.durationMins || 30;

      if (isNew) {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name, description, durationMins, basePriceMinor,
            currencyCode: "USD", platformFeeMinor: 0,
            requiresConfirmation, isVisible,
          }),
        }).then(async (r) => {
          const d = await r.json();
          if (d.service?.id && pricingArray.length) {
            await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/services/${d.service.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ pricing: pricingArray }),
            });
          }
        });
      } else {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/services/${editService!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, description, basePriceMinor, durationMins, requiresConfirmation, isVisible, pricing: pricingArray }),
        });
      }
      toast.success(isNew ? "Service created" : "Service updated");
      setEditService(null);
      loadServices();
    } catch {
      toast.error("Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  const getLowestHighest = (svc: ServiceData) => {
    const prices = (svc.pricing || []).filter((p) => p.isAvailable).map((p) => p.priceMinor);
    const durations = (svc.pricing || []).filter((p) => p.isAvailable).map((p) => p.durationMins);
    if (!prices.length) return { lowestPrice: svc.basePriceMinor, highestPrice: svc.basePriceMinor, minDur: svc.durationMins, maxDur: svc.durationMins };
    return {
      lowestPrice: Math.min(...prices),
      highestPrice: Math.max(...prices),
      minDur: Math.min(...durations),
      maxDur: Math.max(...durations),
    };
  };

  return (
    <div className="space-y-4">
      {locations.length > 1 && (
        <div>
          <Label>Location</Label>
          <select
            className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
            value={selectedLocId}
            onChange={(e) => setSelectedLocId(e.target.value)}
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-xl" />)}</div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <h3 className="text-lg font-bold text-slate-900 mb-1">No services configured</h3>
          <p className="text-slate-500 mb-4">Add your first wash service to get started.</p>
          <Button onClick={() => openEditDialog(null)}><Plus className="h-4 w-4 mr-2" /> Add Service</Button>
        </div>
      ) : (
        <>
          {services.map((svc) => {
            const { lowestPrice, highestPrice, minDur, maxDur } = getLowestHighest(svc);
            return (
              <Card key={svc.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">{svc.name}</h4>
                    {svc.description && <p className="text-sm text-slate-500">{svc.description}</p>}
                    <div className="flex gap-4 mt-2 text-sm text-slate-500">
                      <span>
                        {lowestPrice === highestPrice
                          ? formatCurrency(lowestPrice)
                          : `${formatCurrency(lowestPrice)} - ${formatCurrency(highestPrice)}`}
                      </span>
                      <span>{minDur === maxDur ? `${minDur} min` : `${minDur}-${maxDur} min`}</span>
                      <Badge variant={svc.requiresConfirmation ? "default" : "success"} className="text-[10px]">
                        {svc.requiresConfirmation ? "Request" : "Instant"}
                      </Badge>
                      {!svc.isVisible && <Badge variant="warning" className="text-[10px]">Hidden</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(svc)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                </div>
              </Card>
            );
          })}
          <Button variant="outline" className="w-full" onClick={() => openEditDialog(null)}>
            <Plus className="h-4 w-4 mr-2" /> Add Service
          </Button>
        </>
      )}

      <Dialog open={!!editService} onOpenChange={(o) => !o && setEditService(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Service" : "Edit Service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Exterior Wash" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description of the service" />
            </div>

            {/* Pricing Matrix */}
            <div>
              <Label>Pricing by Vehicle Class</Label>
              <div className="border border-slate-200 rounded-xl overflow-hidden mt-1">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2.5 font-medium text-slate-600">Class</th>
                      <th className="text-left p-2.5 font-medium text-slate-600">Price ($)</th>
                      <th className="text-left p-2.5 font-medium text-slate-600">Duration</th>
                      <th className="text-center p-2.5 font-medium text-slate-600">Avail.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {VEHICLE_CLASSES.map((cls) => (
                      <tr key={cls.value}>
                        <td className="p-2.5 text-sm text-slate-700">{cls.label}</td>
                        <td className="p-2.5">
                          <Input
                            type="number" step="0.01" className="w-24 h-8 text-sm"
                            value={pricing[cls.value]?.price ?? ""}
                            onChange={(e) => handlePriceChange(cls.value, e.target.value)}
                          />
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" className="w-16 h-8 text-sm"
                              value={pricing[cls.value]?.duration ?? ""}
                              onChange={(e) => handleDurationChange(cls.value, e.target.value)}
                            />
                            <span className="text-xs text-slate-400">min</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={pricing[cls.value]?.available !== false}
                            onChange={(e) =>
                              setPricing({ ...pricing, [cls.value]: { ...pricing[cls.value], available: e.target.checked } })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isNew && (
                <p className="text-xs text-slate-400 mt-1">
                  Tip: Enter the Medium price first — other sizes will auto-calculate.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label className="mb-0">Booking Mode</Label>
              <div className="flex items-center gap-2 text-sm">
                <span className={!requiresConfirmation ? "font-medium text-slate-900" : "text-slate-400"}>Instant</span>
                <Switch checked={requiresConfirmation} onCheckedChange={setRequiresConfirmation} />
                <span className={requiresConfirmation ? "font-medium text-slate-900" : "text-slate-400"}>Request</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="mb-0">Visible to customers</Label>
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditService(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Service"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
