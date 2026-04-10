import React, { useState, useEffect } from "react";
import { Button, Input, Label } from "@/components/ui";
import { X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { calculatePlatformFee } from "@/lib/fee-utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Client-side fee calculation for display (mirrors server feeCalculator)
function calcFee(base: number): number {
  return Math.min(Math.round(base * 0.15), 2500);
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

export function QuickAddBooking({ providerId, locationId, onClose, onSuccess, prefillBayId, prefillDate, prefillTime }: QuickAddProps) {
  const [source, setSource] = useState<"DIRECT" | "WALK_IN">("DIRECT");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [vehicleClass, setVehicleClass] = useState("MEDIUM");
  const [serviceId, setServiceId] = useState("");
  const [bayId, setBayId] = useState(prefillBayId || "");
  const [date, setDate] = useState(prefillDate || new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(prefillTime || "09:00");
  const [processPayment, setProcessPayment] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [services, setServices] = useState<any[]>([]);
  const [bays, setBays] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Load services and bays
  useEffect(() => {
    fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/services`, { credentials: "include" })
      .then((r) => r.json()).then((d) => { setServices(d.services || []); if (d.services?.length > 0 && !serviceId) setServiceId(d.services[0].id); })
      .catch(() => {});
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json()).then((d) => {
        // Find this location's bays from the bay-timeline endpoint
        fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/bay-timeline?date=${date}`, { credentials: "include" })
          .then((r) => r.json()).then((bt) => setBays((bt.bays || []).filter((b: any) => b.id !== "unassigned")))
          .catch(() => {});
      })
      .catch(() => {});
  }, [providerId, locationId]);

  // Client name autocomplete
  useEffect(() => {
    if (clientName.length < 2) { setSuggestions([]); return; }
    const timeout = setTimeout(() => {
      fetch(`${API_BASE}/api/providers/${providerId}/client-profiles?search=${encodeURIComponent(clientName)}`, { credentials: "include" })
        .then((r) => r.json()).then((d) => setSuggestions(d.profiles || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [clientName, providerId]);

  const selectedService = services.find((s) => s.id === serviceId);
  const basePrice = selectedService?.basePriceMinor || 0;
  const fee = processPayment ? calcFee(basePrice) : 0;
  const total = basePrice + fee;

  const handleSubmit = async () => {
    if (!clientName.trim() || !serviceId) { toast.error("Client name and service are required"); return; }
    setSaving(true);
    try {
      const duration = selectedService?.durationMins || 30;
      const startUtc = new Date(`${date}T${startTime}:00Z`);
      const endUtc = new Date(startUtc.getTime() + duration * 60000);

      const res = await fetch(`${API_BASE}/api/providers/${providerId}/bookings/${source === "WALK_IN" ? "walk-in" : "off-platform"}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId, serviceId, vehicleClass, bayId: bayId || undefined,
          clientName: clientName.trim(), clientPhone: clientPhone || undefined, clientEmail: clientEmail || undefined,
          scheduledStartAtUtc: startUtc.toISOString(), scheduledEndAtUtc: endUtc.toISOString(),
          notes: notes || undefined, processPayment, bookingSource: source,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      toast.success(`Booking created for ${clientName}`);
      onSuccess();
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-slate-900">Add Booking</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="p-4 space-y-4">
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
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Optional" /></div>
            <div><Label>Email</Label><Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Optional" /></div>
          </div>

          {/* Vehicle + Service */}
          <div><Label>Vehicle Class</Label>
            <select value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
              <option value="SMALL">Small (under 25ft)</option><option value="MEDIUM">Medium (25-35ft)</option>
              <option value="LARGE">Large (35-45ft)</option><option value="EXTRA_LARGE">Extra Large (45ft+)</option>
            </select>
          </div>
          <div><Label>Service</Label>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
              {services.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.basePriceMinor)}</option>)}
            </select>
          </div>

          {/* Date/Time/Bay */}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Start Time</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          </div>
          <div><Label>Bay</Label>
            <select value={bayId} onChange={(e) => setBayId(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
              <option value="">Auto-assign</option>
              {bays.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.supportedClasses?.join(", ")})</option>)}
            </select>
          </div>

          {/* Notes */}
          <div><Label>Notes</Label><textarea className="w-full border border-slate-200 rounded-xl p-3 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." /></div>

          {/* Payment toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <span className="text-sm font-medium text-slate-700">Process payment through WashBuddy</span>
            <input type="checkbox" checked={processPayment} onChange={(e) => setProcessPayment(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-600" />
          </div>

          {/* Price display */}
          <div className="p-3 bg-slate-900 text-white rounded-xl">
            <div className="flex justify-between text-sm"><span>Service</span><span>{formatCurrency(basePrice)}</span></div>
            {processPayment && <div className="flex justify-between text-sm text-slate-300"><span>Platform fee (15%)</span><span>{formatCurrency(fee)}</span></div>}
            <div className="flex justify-between font-bold mt-1 pt-1 border-t border-slate-700"><span>Total</span><span>{formatCurrency(total)}</span></div>
            {!processPayment && <p className="text-xs text-slate-400 mt-1">Payment collected externally</p>}
          </div>

          <Button className="w-full h-12" onClick={handleSubmit} isLoading={saving}>Create Booking</Button>
        </div>
      </div>
    </div>
  );
}
