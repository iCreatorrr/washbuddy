import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Plus, Percent, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Discount {
  id: string;
  name: string;
  discountType: string;
  percentOff?: number | null;
  flatAmountOff?: number | null;
  peakStartTime?: string | null;
  peakEndTime?: string | null;
  peakDaysOfWeek?: number[];
  volumeThreshold?: number | null;
  volumePeriodDays?: number | null;
  isActive: boolean;
  isStackable: boolean;
}

export function DiscountsTab({ providerId }: { providerId: string }) {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editDiscount, setEditDiscount] = useState<Discount | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState("OFF_PEAK");
  const [percentOff, setPercentOff] = useState("");
  const [flatAmountOff, setFlatAmountOff] = useState("");
  const [usePercent, setUsePercent] = useState(true);
  const [isStackable, setIsStackable] = useState(true);
  const [peakStartTime, setPeakStartTime] = useState("22:00");
  const [peakEndTime, setPeakEndTime] = useState("06:00");
  const [peakDays, setPeakDays] = useState<number[]>([]);
  const [volumeThreshold, setVolumeThreshold] = useState("");
  const [volumePeriodDays, setVolumePeriodDays] = useState("30");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/discounts`, { credentials: "include" });
      const d = await r.json();
      setDiscounts(d.discounts || []);
    } catch {
      toast.error("Failed to load discounts");
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setIsNew(true);
    setEditDiscount({} as Discount);
    setName("");
    setDiscountType("OFF_PEAK");
    setPercentOff("10");
    setFlatAmountOff("");
    setUsePercent(true);
    setIsStackable(true);
    setPeakStartTime("22:00");
    setPeakEndTime("06:00");
    setPeakDays([0, 6]);
    setVolumeThreshold("10");
    setVolumePeriodDays("30");
  };

  const openEdit = (d: Discount) => {
    setIsNew(false);
    setEditDiscount(d);
    setName(d.name);
    setDiscountType(d.discountType);
    setUsePercent(!!d.percentOff);
    setPercentOff(d.percentOff ? String(d.percentOff) : "");
    setFlatAmountOff(d.flatAmountOff ? (d.flatAmountOff / 100).toFixed(2) : "");
    setIsStackable(d.isStackable);
    setPeakStartTime(d.peakStartTime || "22:00");
    setPeakEndTime(d.peakEndTime || "06:00");
    setPeakDays(d.peakDaysOfWeek || []);
    setVolumeThreshold(d.volumeThreshold ? String(d.volumeThreshold) : "");
    setVolumePeriodDays(d.volumePeriodDays ? String(d.volumePeriodDays) : "30");
  };

  const toggleActive = async (d: Discount) => {
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/discounts/${d.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? { ...x, isActive: !x.isActive } : x)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        discountType,
        isStackable,
        percentOff: usePercent ? parseInt(percentOff) || 0 : null,
        flatAmountOff: !usePercent ? Math.round(parseFloat(flatAmountOff || "0") * 100) : null,
      };
      if (discountType === "OFF_PEAK") {
        body.peakStartTime = peakStartTime;
        body.peakEndTime = peakEndTime;
        body.peakDaysOfWeek = peakDays;
      }
      if (discountType === "VOLUME") {
        body.volumeThreshold = parseInt(volumeThreshold) || 1;
        body.volumePeriodDays = parseInt(volumePeriodDays) || 30;
      }

      const url = isNew
        ? `${API_BASE}/api/providers/${providerId}/discounts`
        : `${API_BASE}/api/providers/${providerId}/discounts/${editDiscount!.id}`;
      await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(isNew ? "Discount created" : "Discount updated");
      setEditDiscount(null);
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getValueDisplay = (d: Discount) => {
    if (d.percentOff) return `${d.percentOff}% off`;
    if (d.flatAmountOff) return `${formatCurrency(d.flatAmountOff)} off`;
    return "N/A";
  };

  const getConditions = (d: Discount) => {
    if (d.discountType === "OFF_PEAK") {
      const days = (d.peakDaysOfWeek || []).map((i) => DAY_LABELS[i]).join(", ");
      return `${d.peakStartTime}-${d.peakEndTime}${days ? ` on ${days}` : ""}`;
    }
    if (d.discountType === "VOLUME") return `${d.volumeThreshold}+ bookings in ${d.volumePeriodDays} days`;
    if (d.discountType === "FIRST_TIME") return "First visit only";
    return "";
  };

  const typeColor: Record<string, "default" | "success" | "warning"> = {
    OFF_PEAK: "warning",
    VOLUME: "success",
    FIRST_TIME: "default",
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {discounts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Percent className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No discount rules</h3>
          <p className="text-slate-500 mb-4">Create discount rules for off-peak, volume, or first-time customers.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Create Discount</Button>
        </div>
      ) : (
        <>
          {discounts.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-900">{d.name}</h4>
                    <Badge variant={typeColor[d.discountType]}>{d.discountType.replace("_", " ")}</Badge>
                    {d.isStackable && <Badge className="text-[10px]">Stackable</Badge>}
                    {!d.isActive && <Badge variant="error" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">
                    {getValueDisplay(d)} &middot; {getConditions(d)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={d.isActive} onCheckedChange={() => toggleActive(d)} />
                  <Button size="sm" variant="outline" onClick={() => openEdit(d)}>Edit</Button>
                </div>
              </div>
            </Card>
          ))}
          <Button variant="outline" className="w-full" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Create Discount
          </Button>
        </>
      )}

      <Dialog open={!!editDiscount} onOpenChange={(o) => !o && setEditDiscount(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Create Discount" : "Edit Discount"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend Off-Peak" /></div>
            <div>
              <Label>Discount Type</Label>
              <Select value={discountType} onValueChange={setDiscountType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFF_PEAK">Off-Peak</SelectItem>
                  <SelectItem value="VOLUME">Volume</SelectItem>
                  <SelectItem value="FIRST_TIME">First-Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Discount Value</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" checked={usePercent} onChange={() => setUsePercent(true)} /> Percent
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" checked={!usePercent} onChange={() => setUsePercent(false)} /> Flat amount
                </label>
              </div>
              {usePercent ? (
                <Input type="number" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} placeholder="10" className="mt-1" />
              ) : (
                <Input type="number" step="0.01" value={flatAmountOff} onChange={(e) => setFlatAmountOff(e.target.value)} placeholder="15.00" className="mt-1" />
              )}
            </div>

            {discountType === "OFF_PEAK" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start Time</Label><Input type="time" value={peakStartTime} onChange={(e) => setPeakStartTime(e.target.value)} /></div>
                  <div><Label>End Time</Label><Input type="time" value={peakEndTime} onChange={(e) => setPeakEndTime(e.target.value)} /></div>
                </div>
                <div>
                  <Label>Days of Week</Label>
                  <div className="flex gap-1.5 mt-1">
                    {DAY_LABELS.map((d, i) => (
                      <button
                        key={i}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          peakDays.includes(i) ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500"
                        }`}
                        onClick={() =>
                          setPeakDays((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {discountType === "VOLUME" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Min. Bookings</Label><Input type="number" value={volumeThreshold} onChange={(e) => setVolumeThreshold(e.target.value)} /></div>
                <div><Label>Period (days)</Label><Input type="number" value={volumePeriodDays} onChange={(e) => setVolumePeriodDays(e.target.value)} /></div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="mb-0">Stackable with other discounts</Label>
              <Switch checked={isStackable} onCheckedChange={setIsStackable} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDiscount(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
