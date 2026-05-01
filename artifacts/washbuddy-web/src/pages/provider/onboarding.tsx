import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { Card, Button, Input, Label, Badge } from "@/components/ui";
import { MapPin, Clock, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft, Building2, Zap, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_MAP = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sun=0

const SUBTYPES = [
  { code: "STANDARD", label: "Standard Bus" },
  { code: "COACH", label: "Coach" },
  { code: "MINIBUS", label: "Mini Bus" },
  { code: "SHUTTLE", label: "Shuttle" },
  { code: "DOUBLE_DECKER", label: "Double Decker" },
  { code: "SCHOOL_BUS", label: "School Bus" },
  { code: "ARTICULATED", label: "Articulated" },
];

const SERVICE_SUGGESTIONS = ["Exterior Bus Wash", "Full Detail", "Interior Clean", "Undercarriage Wash", "Quick Rinse", "Engine Bay Clean"];

interface HourWindow { open: string; close: string }
interface DaySchedule { isOpen: boolean; windows: HourWindow[] }
import { CATEGORY_DISPLAY_NAMES, SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/service-taxonomy";

interface ServiceData {
  name: string; description: string; durationMins: string; price: string;
  category: ServiceCategory;
  requiresConfirmation: boolean; maxLength: string; maxHeight: string; supportedTypes: string[];
}

function getProviderId(user: any): string | null {
  const role = user?.roles?.find((r: any) => r.role === "PROVIDER_ADMIN" && r.scopeId);
  return role?.scopeId || null;
}

export default function ProviderOnboarding() {
  const { user } = useAuth();
  const [, setNav] = useLocation();
  const providerId = getProviderId(user);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Location
  const [locName, setLocName] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("US");
  const [timezone, setTimezone] = useState("America/New_York");
  const [capacity, setCapacity] = useState("1");
  const [savedLocationId, setSavedLocationId] = useState<string | null>(null);

  // Operating hours
  const defaultSchedule: DaySchedule[] = DAYS.map((_, i) =>
    i < 5
      ? { isOpen: true, windows: [{ open: "07:00", close: "18:00" }] }
      : { isOpen: false, windows: [{ open: "09:00", close: "17:00" }] }
  );
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);

  // Step 2 — Services
  const [services, setServices] = useState<ServiceData[]>([]);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<number | null>(null);
  const [svcForm, setSvcForm] = useState<ServiceData>({
    name: "", description: "", durationMins: "30", price: "",
    category: "EXTERIOR_WASH",
    requiresConfirmation: true, maxLength: "540", maxHeight: "162", supportedTypes: ["STANDARD", "COACH", "MINIBUS", "SHUTTLE"],
  });

  // Check if provider already has locations — skip onboarding
  useEffect(() => {
    if (!providerId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.locations?.length > 0) setNav("/provider");
      })
      .catch(() => {});
  }, [providerId]);

  useEffect(() => {
    setTimezone(country === "CA" ? "America/Toronto" : "America/New_York");
  }, [country]);

  if (!providerId) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <p className="text-slate-500">Unable to load onboarding. Please ensure you registered as a provider.</p>
        <Button className="mt-4" onClick={() => setNav("/")}>Go Home</Button>
      </div>
    );
  }

  const currencyCode = country === "CA" ? "CAD" : "USD";

  // ─── Step 1: Save Location ──────────────────────────────────────

  const handleSaveLocation = async () => {
    if (!locName.trim() || !addr1.trim() || !city.trim() || !region.trim() || !postal.trim()) {
      toast.error("Please fill in all required location fields");
      return;
    }
    setSaving(true);
    try {
      // Create location
      const locRes = await fetch(`${API_BASE}/api/providers/${providerId}/locations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: locName.trim(), timezone,
          addressLine1: addr1.trim(), addressLine2: addr2.trim() || null,
          city: city.trim(), regionCode: region.trim(), postalCode: postal.trim(),
          countryCode: country, latitude: 0, longitude: 0,
        }),
      });
      if (!locRes.ok) { const d = await locRes.json().catch(() => ({})); throw new Error(d.message || "Failed to create location"); }
      const locData = await locRes.json();
      const locationId = locData.location.id;
      setSavedLocationId(locationId);

      // Save operating hours
      const windows: { dayOfWeek: number; openTime: string; closeTime: string }[] = [];
      schedule.forEach((day, idx) => {
        if (day.isOpen) {
          day.windows.forEach((w) => {
            windows.push({ dayOfWeek: DAY_MAP[idx], openTime: w.open, closeTime: w.close });
          });
        }
      });

      if (windows.length > 0) {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}/hours`, {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ windows }),
        });
      }

      // Update capacity on location
      if (parseInt(capacity) > 1) {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${locationId}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingBufferMins: 5 }),
        });
      }

      toast.success("Location saved!");
      setStep(2);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  // ─── Step 2: Save Service ────────────────────────────────────────

  const handleAddService = async () => {
    if (!svcForm.name.trim() || !svcForm.price || !svcForm.durationMins) {
      toast.error("Service name, price, and duration are required");
      return;
    }
    setSaving(true);
    try {
      const priceMinor = Math.round(parseFloat(svcForm.price) * 100);
      const compatRules = svcForm.supportedTypes.map((t) => ({
        categoryCode: "BUS", subtypeCode: t,
        maxLengthInches: parseInt(svcForm.maxLength) || 540,
        maxHeightInches: parseInt(svcForm.maxHeight) || 162,
      }));

      const res = await fetch(`${API_BASE}/api/providers/${providerId}/locations/${savedLocationId}/services`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: svcForm.name.trim(),
          description: svcForm.description.trim() || null,
          category: svcForm.category,
          durationMins: parseInt(svcForm.durationMins),
          basePriceMinor: priceMinor,
          currencyCode,
          platformFeeMinor: 0,
          capacityPerSlot: parseInt(capacity) || 1,
          leadTimeMins: 60,
          requiresConfirmation: svcForm.requiresConfirmation,
          isVisible: false,
          compatibilityRules: compatRules,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }

      if (editingService !== null) {
        const updated = [...services];
        updated[editingService] = { ...svcForm };
        setServices(updated);
        setEditingService(null);
      } else {
        setServices([...services, { ...svcForm }]);
      }
      setSvcForm({ name: "", description: "", durationMins: "30", price: "", category: "EXTERIOR_WASH", requiresConfirmation: true, maxLength: "540", maxHeight: "162", supportedTypes: ["STANDARD", "COACH", "MINIBUS", "SHUTTLE"] });
      setShowServiceForm(false);
      toast.success("Service saved!");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  // ─── Step 3: Submit for Review ──────────────────────────────────

  const handleSubmitForReview = async () => {
    setSaving(true);
    try {
      // Notify admin about new provider
      const providerRole = user?.roles?.find((r: any) => r.role === "PROVIDER_ADMIN");
      await fetch(`${API_BASE}/api/providers/notify-onboarding-complete`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName: providerRole?.scopeName || locName }),
      }).catch(() => {}); // Non-critical

      setStep(4);
      toast.success("Listing submitted for review!");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleDayOpen = (idx: number) => {
    const s = [...schedule];
    s[idx] = { ...s[idx], isOpen: !s[idx].isOpen };
    setSchedule(s);
  };

  const updateWindow = (dayIdx: number, winIdx: number, field: "open" | "close", value: string) => {
    const s = [...schedule];
    s[dayIdx].windows[winIdx] = { ...s[dayIdx].windows[winIdx], [field]: value };
    setSchedule(s);
  };

  const addWindow = (dayIdx: number) => {
    const s = [...schedule];
    s[dayIdx].windows.push({ open: "13:00", close: "18:00" });
    setSchedule(s);
  };

  const removeWindow = (dayIdx: number, winIdx: number) => {
    const s = [...schedule];
    s[dayIdx].windows.splice(winIdx, 1);
    setSchedule(s);
  };

  const toggleSubtype = (code: string) => {
    setSvcForm((f) => ({
      ...f,
      supportedTypes: f.supportedTypes.includes(code)
        ? f.supportedTypes.filter((t) => t !== code)
        : [...f.supportedTypes, code],
    }));
  };

  // ─── RENDER ──────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <Toaster position="top-right" richColors />

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <React.Fragment key={s}>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? "bg-primary text-white" : "bg-slate-200 text-slate-500"}`}>
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 4 && <div className={`flex-1 h-1 rounded ${step > s ? "bg-primary" : "bg-slate-200"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Location */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Add Your First Location</h1>
          <p className="text-slate-500 mb-6">Tell us about your wash facility so customers can find you.</p>

          <Card className="p-6 space-y-5">
            <div><Label>Facility Name *</Label><Input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="e.g., Main Street Bus Wash" /></div>
            <div><Label>Address Line 1 *</Label><Input value={addr1} onChange={(e) => setAddr1(e.target.value)} placeholder="Street address" /></div>
            <div><Label>Address Line 2</Label><Input value={addr2} onChange={(e) => setAddr2(e.target.value)} placeholder="Suite, unit, etc." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>City *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div><Label>State/Province *</Label><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g., NY or ON" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>ZIP/Postal Code *</Label><Input value={postal} onChange={(e) => setPostal(e.target.value)} /></div>
              <div>
                <Label>Country *</Label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Timezone</Label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Toronto">Eastern (Toronto)</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
              <div><Label>Wash Bay Capacity</Label><Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} /><p className="text-xs text-slate-400 mt-1">Vehicles washed simultaneously</p></div>
            </div>
          </Card>

          {/* Operating Hours */}
          <Card className="p-6 mt-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Clock className="h-5 w-5 text-slate-500" /> Operating Hours</h3>
            <div className="space-y-3">
              {DAYS.map((day, idx) => (
                <div key={day} className="flex items-start gap-3">
                  <div className="w-20 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={schedule[idx].isOpen} onChange={() => toggleDayOpen(idx)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                      <span className={`text-sm font-medium ${schedule[idx].isOpen ? "text-slate-900" : "text-slate-400"}`}>{day.slice(0, 3)}</span>
                    </label>
                  </div>
                  {schedule[idx].isOpen ? (
                    <div className="flex-1 space-y-2">
                      {schedule[idx].windows.map((w, wIdx) => (
                        <div key={wIdx} className="flex items-center gap-2">
                          <input type="time" value={w.open} onChange={(e) => updateWindow(idx, wIdx, "open", e.target.value)} className="h-9 px-2 border border-slate-200 rounded-lg text-sm" />
                          <span className="text-slate-400">to</span>
                          <input type="time" value={w.close} onChange={(e) => updateWindow(idx, wIdx, "close", e.target.value)} className="h-9 px-2 border border-slate-200 rounded-lg text-sm" />
                          {wIdx > 0 && <button onClick={() => removeWindow(idx, wIdx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                      ))}
                      {schedule[idx].windows.length < 2 && (
                        <button onClick={() => addWindow(idx)} className="text-xs text-primary font-medium hover:underline">+ Add break window</button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 pt-2">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSaveLocation} isLoading={saving} className="gap-2">
              Save & Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 2: Services */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Add Your Services</h1>
          <p className="text-slate-500 mb-6">What wash services do you offer at <span className="font-semibold">{locName}</span>?</p>

          {services.length > 0 && (
            <div className="space-y-3 mb-6">
              {services.map((s, idx) => (
                <Card key={idx} className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">{s.name}</h4>
                    <p className="text-sm text-slate-500">{s.durationMins} min · ${s.price} {currencyCode} · {s.requiresConfirmation ? "Request" : "Instant Book"}</p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs">Saved</Badge>
                </Card>
              ))}
            </div>
          )}

          {showServiceForm ? (
            <Card className="p-6 space-y-4 border-2 border-primary/20">
              <div><Label>Service Name *</Label><Input value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="e.g., Exterior Bus Wash" />
                <div className="flex gap-1 mt-1 flex-wrap">{SERVICE_SUGGESTIONS.filter((s) => !services.some((sv) => sv.name === s)).map((s) => (
                  <button key={s} onClick={() => setSvcForm({ ...svcForm, name: s })} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded hover:bg-blue-50 hover:text-blue-600">{s}</button>
                ))}</div>
              </div>
              <div><Label>Description</Label><textarea className="w-full border border-slate-200 rounded-xl p-3 text-sm" rows={2} value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} placeholder="Brief description..." /></div>
              <div>
                <Label>Category *</Label>
                <select
                  className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
                  value={svcForm.category}
                  onChange={(e) => setSvcForm({ ...svcForm, category: e.target.value as ServiceCategory })}
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_DISPLAY_NAMES[c]}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-0.5">How drivers will discover this service in search.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Duration (minutes) *</Label><Input type="number" min="5" value={svcForm.durationMins} onChange={(e) => setSvcForm({ ...svcForm, durationMins: e.target.value })} /></div>
                <div><Label>Price ({currencyCode}) *</Label><Input type="number" step="0.01" min="0" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} placeholder="e.g., 125.00" /></div>
              </div>
              <div>
                <Label>Booking Mode</Label>
                <div className="flex gap-3 mt-1">
                  <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer ${svcForm.requiresConfirmation ? "border-slate-200" : "border-primary bg-blue-50"}`}>
                    <input type="radio" name="bookingMode" checked={!svcForm.requiresConfirmation} onChange={() => setSvcForm({ ...svcForm, requiresConfirmation: false })} className="sr-only" />
                    <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-500" /><span className="font-medium text-sm">Instant Book</span></div>
                    <p className="text-xs text-slate-500 mt-1">Customers book immediately</p>
                  </label>
                  <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer ${svcForm.requiresConfirmation ? "border-primary bg-blue-50" : "border-slate-200"}`}>
                    <input type="radio" name="bookingMode" checked={svcForm.requiresConfirmation} onChange={() => setSvcForm({ ...svcForm, requiresConfirmation: true })} className="sr-only" />
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /><span className="font-medium text-sm">Request & Confirm</span></div>
                    <p className="text-xs text-slate-500 mt-1">You review each request</p>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Max Length (inches)</Label><Input type="number" value={svcForm.maxLength} onChange={(e) => setSvcForm({ ...svcForm, maxLength: e.target.value })} /><p className="text-xs text-slate-400 mt-0.5">Standard bus = 480in</p></div>
                <div><Label>Max Height (inches)</Label><Input type="number" value={svcForm.maxHeight} onChange={(e) => setSvcForm({ ...svcForm, maxHeight: e.target.value })} /><p className="text-xs text-slate-400 mt-0.5">Standard bus = 138in</p></div>
              </div>
              <div>
                <Label>Supported Vehicle Types</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SUBTYPES.map((t) => (
                    <label key={t.code} className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${svcForm.supportedTypes.includes(t.code) ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500"}`}>
                      <input type="checkbox" checked={svcForm.supportedTypes.includes(t.code)} onChange={() => toggleSubtype(t.code)} className="sr-only" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowServiceForm(false)}>Cancel</Button>
                <Button onClick={handleAddService} isLoading={saving}>Save Service</Button>
              </div>
            </Card>
          ) : (
            <Button variant="outline" onClick={() => setShowServiceForm(true)} className="gap-2 w-full h-14 border-dashed">
              <Plus className="h-5 w-5" /> Add a Service
            </Button>
          )}

          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={() => setStep(3)} disabled={services.length === 0} className="gap-2">
              Review & Submit <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Review Your Listing</h1>
          <p className="text-slate-500 mb-6">Confirm everything looks right before submitting for review.</p>

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapPin className="h-5 w-5 text-blue-500" /> Location</h3>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-bold text-slate-900">{locName}</p>
              <p className="text-sm text-slate-500">{addr1}{addr2 ? `, ${addr2}` : ""}</p>
              <p className="text-sm text-slate-500">{city}, {region} {postal}, {country}</p>
              <p className="text-xs text-slate-400 mt-1">Capacity: {capacity} bay(s) · {timezone}</p>
            </div>

            <h3 className="font-bold text-slate-900 flex items-center gap-2 pt-2"><Building2 className="h-5 w-5 text-emerald-500" /> Services ({services.length})</h3>
            <div className="space-y-2">
              {services.map((s, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-900">{s.name}</p>
                    <p className="text-sm text-slate-500">{s.durationMins} min · ${s.price} {currencyCode}</p>
                  </div>
                  <Badge className={s.requiresConfirmation ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                    {s.requiresConfirmation ? "Request" : "Instant Book"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={handleSubmitForReview} isLoading={saving} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> Submit for Review
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">Listing Submitted for Review!</h1>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              A WashBuddy admin will review your listing within 24 hours. You'll receive a notification when your listing is approved and visible to customers.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => setNav("/provider")} className="gap-2">
                <Building2 className="h-4 w-4" /> Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => setNav("/provider/settings")} className="gap-2">
                <CreditCard className="h-4 w-4" /> Set Up Payments
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
