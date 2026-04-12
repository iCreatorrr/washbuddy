import React, { useState, useEffect } from "react";
import { Button, Input, Label, Badge } from "@/components/ui";
import { X, Check, Droplets, Armchair, Sparkles, CircleDot, Zap, Cog, Package, Plus, Minus, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/service-colors";
import * as Icons from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function formatSlotTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as any)[name] || Icons.Package;
  return <Icon className={className} />;
}

function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const n = name.toLowerCase();
  if (n.includes("exterior") || n.includes("wash")) return <Droplets className={className} />;
  if (n.includes("interior")) return <Armchair className={className} />;
  if (n.includes("detail")) return <Sparkles className={className} />;
  if (n.includes("undercarriage")) return <CircleDot className={className} />;
  if (n.includes("express") || n.includes("quick") || n.includes("rinse")) return <Zap className={className} />;
  if (n.includes("engine")) return <Cog className={className} />;
  return <Droplets className={className} />;
}

interface QuickAddProps {
  providerId: string;
  locationId: string;
  onClose: () => void;
  onSuccess: () => void;
  prefillBayId?: string;
  prefillDate?: string;
  prefillTime?: string;
}

interface SelectedAddOn {
  addOnId: string | null;
  name: string;
  priceMinor: number;
  quantity: number;
  isCustomOneOff: boolean;
}

export function QuickAddBooking({ providerId, locationId, onClose, onSuccess, prefillBayId, prefillDate, prefillTime }: QuickAddProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<"DIRECT" | "WALK_IN">("DIRECT");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [vehicleClass, setVehicleClass] = useState("MEDIUM");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [bayId, setBayId] = useState(prefillBayId || "");
  const [date, setDate] = useState(prefillDate || new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(prefillTime || "09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<SelectedAddOn[]>([]);

  const [services, setServices] = useState<any[]>([]);
  const [bays, setBays] = useState<any[]>([]);
  const [addOns, setAddOns] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [availableSlots, setAvailableSlots] = useState<{ time: string; available: boolean; availableBays: number }[]>([]);
  const [bayCount, setBayCount] = useState(0);

  // Load services (with pricing), bays, and add-ons
  useEffect(() => {
    if (!providerId || !locationId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/services`, { credentials: "include" })
      .then((r) => r.json()).then((d) => setServices(d.services || []))
      .catch(() => {});
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/bays`, { credentials: "include" })
      .then((r) => r.json()).then((d) => setBays(d.bays || []))
      .catch(() => {});
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/add-ons`, { credentials: "include" })
      .then((r) => r.json()).then((d) => setAddOns((d.addOns || []).filter((a: any) => a.isActive)))
      .catch(() => {});
  }, [providerId, locationId]);

  // Client autocomplete
  useEffect(() => {
    if (clientName.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/providers/${providerId}/client-profiles?search=${encodeURIComponent(clientName)}`, { credentials: "include" })
        .then((r) => r.json()).then((d) => setSuggestions(d.profiles || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [clientName]);

  // Fetch bay availability when date, vehicle class, or duration changes
  useEffect(() => {
    if (!providerId || !locationId || !date) return;
    const params = new URLSearchParams({ date, vehicleClass, durationMins: String(totalDuration || 30) });
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/bay-availability?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const slots = d.slots || [];
        setAvailableSlots(slots);
        setBayCount(d.bayCount || 0);
        // If current time selection is unavailable, auto-select the first available slot
        const currentSlot = slots.find((s: any) => s.time === startTime);
        if (currentSlot && !currentSlot.available) {
          const firstAvail = slots.find((s: any) => s.available);
          if (firstAvail) setStartTime(firstAvail.time);
        }
      })
      .catch(() => {});
  }, [providerId, locationId, date, vehicleClass, totalDuration]);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const getServicePrice = (svc: any) => {
    const p = svc.pricing?.find((pr: any) => pr.vehicleClass === vehicleClass);
    return p?.priceMinor ?? svc.basePriceMinor;
  };

  const getServiceDuration = (svc: any) => {
    const p = svc.pricing?.find((pr: any) => pr.vehicleClass === vehicleClass);
    return p?.durationMins ?? svc.durationMins;
  };

  const isServiceAvailable = (svc: any) => {
    const p = svc.pricing?.find((pr: any) => pr.vehicleClass === vehicleClass);
    return p?.isAvailable !== false;
  };

  const servicesTotal = selectedServiceIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    return sum + (svc ? getServicePrice(svc) : 0);
  }, 0);

  const totalDuration = selectedServiceIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    return sum + (svc ? getServiceDuration(svc) : 0);
  }, 0);

  const addOnsTotal = selectedAddOns.reduce((sum, a) => sum + a.priceMinor * a.quantity, 0);
  const grandTotal = servicesTotal + addOnsTotal;

  const addAddOn = (addOnId: string, isCountable: boolean) => {
    const ao = addOns.find((a) => a.id === addOnId);
    if (!ao) return;
    setSelectedAddOns((prev) => [...prev, { addOnId, name: ao.name, priceMinor: ao.priceMinor, quantity: 1, isCustomOneOff: false }]);
  };

  const removeAddOn = (addOnId: string) => {
    setSelectedAddOns((prev) => prev.filter((a) => a.addOnId !== addOnId));
  };

  const incrementAddOn = (addOnId: string) => {
    setSelectedAddOns((prev) => prev.map((a) => a.addOnId === addOnId ? { ...a, quantity: a.quantity + 1 } : a));
  };

  const decrementAddOn = (addOnId: string) => {
    setSelectedAddOns((prev) => {
      const item = prev.find((a) => a.addOnId === addOnId);
      if (item && item.quantity <= 1) return prev.filter((a) => a.addOnId !== addOnId);
      return prev.map((a) => a.addOnId === addOnId ? { ...a, quantity: a.quantity - 1 } : a);
    });
  };

  const handleSubmit = async () => {
    if (!clientName.trim() || selectedServiceIds.length === 0) { toast.error("Client name and at least one service required"); return; }
    setSaving(true);
    try {
      const startUtc = new Date(`${date}T${startTime}:00Z`);
      const endUtc = new Date(startUtc.getTime() + totalDuration * 60000);

      const body: any = {
        locationId, serviceId: selectedServiceIds[0], serviceIds: selectedServiceIds,
        vehicleClass, bayId: bayId || undefined,
        clientName: clientName.trim(), clientPhone: clientPhone || undefined, clientEmail: clientEmail || undefined,
        scheduledStartAtUtc: startUtc.toISOString(), scheduledEndAtUtc: endUtc.toISOString(),
        notes: notes || undefined, processPayment: false, bookingSource: source,
      };

      if (selectedAddOns.length > 0) {
        body.addOns = selectedAddOns.map((a) => ({
          addOnId: a.addOnId, name: a.isCustomOneOff ? a.name : undefined,
          priceMinor: a.isCustomOneOff ? a.priceMinor : undefined, quantity: a.quantity,
        }));
      }

      const res = await fetch(`${API_BASE}/api/providers/${providerId}/bookings/${source === "WALK_IN" ? "walk-in" : "off-platform"}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error("Session expired — please refresh the page and log in again");
        throw new Error(d.message || "Failed to create booking");
      }
      toast.success(`Booking created for ${clientName}`);
      onSuccess();
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  // Group add-ons by category
  const addOnsByCategory = addOns.reduce((acc: Record<string, any[]>, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    RESTROOM_SUPPLIES: "🚿 Restroom Supplies", DRIVER_AMENITIES: "☕ Driver Amenities",
    VEHICLE_SUPPLIES: "🔧 Vehicle Supplies", SPECIALTY_TREATMENTS: "✨ Specialty Treatments", CUSTOM: "📦 Custom Items",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          {step === 2 && <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-primary font-medium"><ArrowLeft className="h-4 w-4" /> Back</button>}
          <h2 className="text-lg font-bold text-slate-900">{step === 1 ? "Select Wash" : "Add-Ons & Supplies"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 1 ? (
            <>
              {/* Source toggle */}
              <div className="flex gap-2">
                {(["DIRECT", "WALK_IN"] as const).map((s) => (
                  <button key={s} onClick={() => setSource(s)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${source === s ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>
                    {s === "DIRECT" ? "Phone Call" : "Walk-In"}
                  </button>
                ))}
              </div>

              {/* Client info */}
              <div className="relative">
                <Label>Client Name *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Start typing..." />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {suggestions.map((p: any) => (
                      <button key={p.id} onClick={() => { setClientName(p.name); setClientPhone(p.phone || ""); setClientEmail(p.email || ""); setSuggestions([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                        <span className="font-medium">{p.name}</span> {p.phone && <span className="text-slate-400">{p.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Vehicle class */}
              <div><Label>Vehicle Class</Label>
                <select value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
                  <option value="SMALL">Small (under 25ft)</option><option value="MEDIUM">Medium (25-35ft)</option>
                  <option value="LARGE">Large (35-45ft)</option><option value="EXTRA_LARGE">Extra Large (45ft+)</option>
                </select>
              </div>

              {/* Service icon tiles */}
              <div className="space-y-2">
                <Label>Services</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {services.map((svc) => {
                    const isSelected = selectedServiceIds.includes(svc.id);
                    const available = isServiceAvailable(svc);
                    const price = getServicePrice(svc);
                    const dur = getServiceDuration(svc);
                    const colors = getServiceColors(svc.name);
                    return (
                      <button key={svc.id} type="button" disabled={!available} onClick={() => toggleService(svc.id)}
                        className={cn("relative flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-all min-h-[100px]",
                          isSelected
                            ? `${colors.tileBgSelected} ${colors.tileBorderSelected} ${colors.tileTextSelected}`
                            : available
                              ? `bg-white ${colors.tileBorder} hover:shadow-sm text-gray-700`
                              : "bg-muted/30 border-gray-100 text-gray-400 cursor-not-allowed")}>
                        {isSelected && <div className="absolute top-2 right-2"><Check className={cn("h-4 w-4", colors.tileIconSelected)} /></div>}
                        <ServiceIcon name={svc.name} className={cn("h-8 w-8", isSelected ? colors.tileIconSelected : colors.tileIcon)} />
                        <span className="text-sm font-medium text-center leading-tight">{svc.name}</span>
                        <span className="text-xs">{formatCurrency(price)} · {dur}min</span>
                        {!available && <span className="text-xs text-muted-foreground">N/A for this class</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedServiceIds.length > 0 && (
                  <p className="text-sm text-slate-500">{selectedServiceIds.length} service{selectedServiceIds.length > 1 ? "s" : ""} — Subtotal: {formatCurrency(servicesTotal)} · {totalDuration}min</p>
                )}
              </div>

              {/* Date/Time/Bay */}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div>
                <div>
                  <Label>Start Time</Label>
                  <select value={startTime} onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-12 px-3 border-2 border-slate-200 rounded-xl text-sm bg-white">
                    {availableSlots.length > 0 ? (
                      availableSlots.map((slot) => (
                        <option key={slot.time} value={slot.time} disabled={!slot.available}>
                          {formatSlotTime(slot.time)}{!slot.available ? " — Fully booked" : ` (${slot.availableBays} bay${slot.availableBays !== 1 ? "s" : ""} free)`}
                        </option>
                      ))
                    ) : (
                      <option value={startTime}>{formatSlotTime(startTime)}</option>
                    )}
                  </select>
                </div>
              </div>
              {availableSlots.length > 0 && bayCount > 0 && (
                <p className="text-xs text-slate-400">{bayCount} bay{bayCount !== 1 ? "s" : ""} support {vehicleClass.replace("_", " ")} vehicles at this location</p>
              )}
              <div><Label>Bay</Label>
                <select value={bayId} onChange={(e) => setBayId(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
                  <option value="">Auto-assign</option>
                  {bays.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.supportedClasses?.join(", ")})</option>)}
                </select>
              </div>
              <div><Label>Notes</Label><textarea className="w-full border border-slate-200 rounded-xl p-3 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions..." /></div>
            </>
          ) : (
            /* Step 2: Add-ons */
            <>
              {Object.entries(addOnsByCategory).map(([cat, items]) => (
                <div key={cat}>
                  <h3 className="text-sm font-bold text-slate-700 mb-2">{categoryLabels[cat] || cat}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {(items as any[]).map((ao) => {
                      const selected = selectedAddOns.find((s) => s.addOnId === ao.id);
                      const isCountable = ao.quantityMode === "COUNTABLE";
                      return (
                        <div key={ao.id} className={cn("flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all min-h-[90px]",
                          selected ? "bg-blue-50 border-blue-500" : "bg-white border-gray-200")}>
                          <DynamicIcon name={ao.iconName} className={cn("h-6 w-6", selected ? "text-blue-600" : "text-gray-400")} />
                          <span className="text-xs font-medium text-center leading-tight">{ao.name}</span>
                          <span className="text-xs text-slate-400">{formatCurrency(ao.priceMinor)}</span>
                          {isCountable && selected ? (
                            <div className="flex items-center gap-2 mt-1">
                              <button onClick={() => decrementAddOn(ao.id)} className="h-6 w-6 rounded border flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                              <span className="text-sm font-bold w-4 text-center">{selected.quantity}</span>
                              <button onClick={() => incrementAddOn(ao.id)} className="h-6 w-6 rounded border flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                            </div>
                          ) : !selected ? (
                            <button onClick={() => addAddOn(ao.id, isCountable)} className="text-xs text-primary font-medium mt-1">Add</button>
                          ) : (
                            <button onClick={() => removeAddOn(ao.id)} className="text-xs text-blue-600 font-medium mt-1">✓ Added</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {addOns.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No add-ons configured for this location.</p>}
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="p-4 border-t bg-slate-900 text-white shrink-0">
          <div className="text-sm space-y-1 mb-3">
            <div className="flex justify-between"><span>Services ({selectedServiceIds.length})</span><span>{formatCurrency(servicesTotal)}</span></div>
            {addOnsTotal > 0 && <div className="flex justify-between text-slate-300"><span>Add-Ons ({selectedAddOns.length})</span><span>{formatCurrency(addOnsTotal)}</span></div>}
            <div className="flex justify-between font-bold text-lg pt-1 border-t border-slate-700"><span>Total</span><span>{formatCurrency(grandTotal)}</span></div>
          </div>

          {step === 1 ? (
            <div className="space-y-2">
              {(!clientName.trim() || selectedServiceIds.length === 0) && (
                <p className="text-xs text-amber-400 text-center">
                  {!clientName.trim() && selectedServiceIds.length === 0 ? "Enter client name and select a service to continue"
                    : !clientName.trim() ? "Enter client name to continue"
                    : "Select at least one service to continue"}
                </p>
              )}
              <Button className="w-full h-11" onClick={() => setStep(2)} disabled={!clientName.trim() || selectedServiceIds.length === 0}>
                Next: Add-Ons <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <button onClick={handleSubmit} disabled={!clientName.trim() || selectedServiceIds.length === 0 || saving}
                className="w-full text-xs text-slate-400 hover:text-white transition-colors py-1 disabled:opacity-40">
                Skip add-ons and create booking
              </button>
            </div>
          ) : (
            <Button className="w-full h-11" onClick={handleSubmit} isLoading={saving}>Create Booking</Button>
          )}
        </div>
      </div>
    </div>
  );
}
