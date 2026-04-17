import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetAvailability, useCreateBookingHold, useCreateBooking, useListVehicles } from "@workspace/api-client-react";
import { Card, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Clock, Truck, ShieldCheck, CheckCircle2, ChevronLeft, ArrowRight, Navigation, Star, Zap, AlertTriangle, Timer } from "lucide-react";
import { LocationReviews } from "@/components/location-reviews";
import { formatCurrency, formatDate } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

async function fetchSingleETA(
  fromLat: number, fromLng: number, toLat: number, toLng: number
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return Math.round(data.routes[0].duration / 60);
  } catch {
    return null;
  }
}

function formatETA(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LocationDetail() {
  const [, params] = useRoute("/location/:id");
  const [, setNav] = useLocation();
  const locationId = params?.id || "";

  const urlParams = new URLSearchParams(window.location.search);
  const fromRoute = urlParams.get("ref") === "route";
  const routeFrom = urlParams.get("from") || "";
  const routeTo = urlParams.get("to") || "";
  const rawUlat = urlParams.get("ulat");
  const rawUlng = urlParams.get("ulng");
  const userLat = rawUlat && !isNaN(parseFloat(rawUlat)) ? parseFloat(rawUlat) : null;
  const userLng = rawUlng && !isNaN(parseFloat(rawUlng)) ? parseFloat(rawUlng) : null;
  const backUrl = fromRoute
    ? `/route-planner?from=${encodeURIComponent(routeFrom)}&to=${encodeURIComponent(routeTo)}`
    : "/search";
  const backLabel = fromRoute ? "Back to route" : "Back to search";

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [etaMins, setEtaMins] = useState<number | null>(null);
  const [bookingResult, setBookingResult] = useState<{ id: string; status: string } | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [holdTimeLeft, setHoldTimeLeft] = useState<number | null>(null);

  const [locData, setLocData] = useState<any>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(true);
  const [isSearchError, setIsSearchError] = useState(false);
  const [fetchErrorDetails, setFetchErrorDetails] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || "";
  const fetchLocation = React.useCallback(async () => {
    if (!locationId) return;
    setIsSearchLoading(true);
    setIsSearchError(false);
    setFetchErrorDetails(null);
    console.log("[LocationDetail] Fetching location:", locationId);

    // Try dedicated detail endpoint first
    try {
      const r = await fetch(`${API_BASE}/api/locations/${locationId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d?.location) {
          console.log("[LocationDetail] Loaded from /api/locations/:id");
          setLocData(d.location);
          setIsSearchLoading(false);
          return;
        }
      } else {
        console.warn(`[LocationDetail] /api/locations/${locationId} returned ${r.status}, falling back to search`);
      }
    } catch (err: any) {
      console.warn("[LocationDetail] Detail endpoint threw, falling back to search:", err?.message);
    }

    // Fallback: search endpoint (works even if dedicated endpoint isn't deployed yet)
    try {
      const r = await fetch(`${API_BASE}/api/locations/search`, { credentials: "include" });
      if (!r.ok) {
        const msg = `HTTP ${r.status} on search fallback`;
        console.error("[LocationDetail] Search fallback failed:", msg);
        setFetchErrorDetails(msg);
        setIsSearchError(true);
        return;
      }
      const d = await r.json();
      const match = (d?.locations || []).find((l: any) => l.id === locationId);
      if (!match) {
        const msg = `Location ${locationId} not found in search results (${(d?.locations || []).length} locations returned)`;
        console.error("[LocationDetail]", msg);
        setFetchErrorDetails("Location not in search results");
        setIsSearchError(true);
        return;
      }
      console.log("[LocationDetail] Loaded from search fallback");
      setLocData(match);
    } catch (err: any) {
      console.error("[LocationDetail] Both endpoints failed:", err);
      setFetchErrorDetails(err?.message || "Network error");
      setIsSearchError(true);
    } finally {
      setIsSearchLoading(false);
    }
  }, [locationId, API_BASE]);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const services = locData?.services || [];

  const { data: availabilityData, isLoading: isLoadingSlots } = useGetAvailability(locationId, { date: selectedDate, serviceId: selectedService || "" }, {
    query: { enabled: !!selectedService && !!selectedDate },
    request: { credentials: 'include' }
  });

  const { data: vehiclesData } = useListVehicles({ request: { credentials: 'include' } });
  const vehicles = vehiclesData?.vehicles || [];

  const holdMutation = useCreateBookingHold({ request: { credentials: 'include' } });
  const bookMutation = useCreateBooking({ request: { credentials: 'include' } });

  const selectedSvc = services.find(s => s.id === selectedService);

  const [detectedLat, setDetectedLat] = useState<number | null>(userLat);
  const [detectedLng, setDetectedLng] = useState<number | null>(userLng);

  useEffect(() => {
    if (detectedLat != null && detectedLng != null) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetectedLat(pos.coords.latitude);
        setDetectedLng(pos.coords.longitude);
      },
      () => {},
      { timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (detectedLat == null || detectedLng == null || !locData?.latitude || !locData?.longitude) return;
    let cancelled = false;
    fetchSingleETA(detectedLat, detectedLng, locData.latitude, locData.longitude).then((mins) => {
      if (!cancelled && mins != null) setEtaMins(mins);
    });
    return () => { cancelled = true; };
  }, [detectedLat, detectedLng, locData?.latitude, locData?.longitude]);

  useEffect(() => {
    if (bookingStep === 3 && vehicles.length === 1) {
      setSelectedVehicle(vehicles[0].id);
    }
  }, [bookingStep, vehicles]);

  // Hold countdown timer
  useEffect(() => {
    if (!holdExpiresAt) { setHoldTimeLeft(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000));
      setHoldTimeLeft(remaining);
      if (remaining <= 0) { setHoldExpiresAt(null); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  // Vehicle compatibility helper
  const isVehicleCompatible = (vehicle: any, service: any): boolean => {
    const rules = (service as any).compatibilityRules;
    if (!rules || rules.length === 0) return true; // No rules = all compatible
    return rules.some((rule: any) => {
      if (rule.categoryCode !== vehicle.categoryCode) return false;
      if (rule.subtypeCode && rule.subtypeCode !== vehicle.subtypeCode) return false;
      if (rule.maxLengthInches && vehicle.lengthInches > rule.maxLengthInches) return false;
      if (rule.maxHeightInches && vehicle.heightInches > rule.maxHeightInches) return false;
      return true;
    });
  };

  const advanceFromSlot = () => {
    if (vehicles.length === 1) {
      setSelectedVehicle(vehicles[0].id);
      setBookingStep(4);
    } else if (vehicles.length === 0) {
      setSelectedVehicle(null);
      setBookingStep(4);
    } else {
      setBookingStep(3);
    }
  };

  if (isSearchError) return <div className="max-w-5xl mx-auto py-8"><ErrorState message={fetchErrorDetails ? `Could not load location details (${fetchErrorDetails})` : "Could not load location details."} onRetry={fetchLocation} /></div>;
  if (isSearchLoading) return <div className="p-12 text-center text-slate-500"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" /></div>;
  if (!locData) return <div className="max-w-5xl mx-auto py-8"><ErrorState message="Location not found. It may have been removed." /></div>;

  const [holdId, setHoldId] = useState<string | null>(null);

  const handleCreateHold = async () => {
    if (!selectedService || !selectedSlot) return;
    setBookingError(null);
    try {
      const holdRes = await holdMutation.mutateAsync({
        data: { locationId, serviceId: selectedService, slotStartUtc: selectedSlot }
      });
      setHoldId(holdRes.hold.id);
      setHoldExpiresAt(new Date(holdRes.hold.expiresAtUtc));
      advanceFromSlot();
    } catch (err: any) {
      setBookingError(err?.message || "This slot is no longer available. Please select another time.");
    }
  };

  const handleConfirmBooking = async () => {
    if (!holdId) return;
    setBookingError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const bookRes = await bookMutation.mutateAsync({
        data: {
          holdId,
          vehicleId: selectedVehicle || undefined,
          idempotencyKey
        }
      });
      setBookingResult({ id: bookRes.booking.id, status: bookRes.booking.status });
      setHoldExpiresAt(null);
    } catch (err: any) {
      if (err?.message?.includes("hold") || err?.status === 410) {
        setBookingError("Your hold has expired. Please select a new time slot.");
        setHoldId(null);
        setHoldExpiresAt(null);
        setBookingStep(2);
      } else {
        setBookingError(err?.message || "Failed to complete booking. Please try again.");
      }
    }
  };

  const totalPrice = selectedSvc ? ((selectedSvc as any).allInPriceMinor ?? selectedSvc.basePriceMinor) : 0;

  const stepComplete = (step: number) => {
    if (step === 1) return !!selectedService;
    if (step === 2) return !!selectedSlot;
    if (step === 3) return true;
    return false;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <button onClick={() => setNav(backUrl)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </button>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-blue-50 text-blue-700 border-blue-200">{locData.provider?.name}</Badge>
            {(locData as any).isOpenNow ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><Clock className="h-3 w-3 mr-1" />Open Now</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500 border-slate-200">Closed</Badge>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 mb-2">{locData.name}</h1>
          <p className="text-lg text-slate-500 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {locData.addressLine1}, {locData.city}, {locData.stateCode} {locData.postalCode}
          </p>
          {etaMins != null && (
            <div className="mt-3 inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-xl border border-purple-200">
              <Navigation className="h-4 w-4" />
              <span className="font-semibold text-sm">You are {formatETA(etaMins)} away</span>
            </div>
          )}
        </div>
        <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 min-w-[250px]">
          <div className="flex items-center gap-3 text-blue-700 font-bold mb-2">
            <ShieldCheck className="h-6 w-6" />
            Premium Facility
          </div>
          <p className="text-sm text-blue-600/80">All washes guaranteed by provider.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">

          {/* Step 1: Select Service */}
          <Card className={`transition-all duration-300 ${bookingStep !== 1 && !stepComplete(1) ? "opacity-50" : ""}`}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${stepComplete(1) && bookingStep > 1 ? 'bg-green-500 text-white' : 'bg-slate-900 text-white'}`}>
                  {stepComplete(1) && bookingStep > 1 ? <CheckCircle2 className="h-5 w-5" /> : "1"}
                </span>
                Select Service
              </h2>
              {bookingStep > 1 && stepComplete(1) && (
                <button onClick={() => { setBookingStep(1); setSelectedSlot(null); }} className="text-sm font-semibold text-primary hover:text-primary/80">Change</button>
              )}
            </div>
            <AnimatePresence>
              {bookingStep === 1 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="p-6 space-y-3">
                    {services.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">No services available at this location.</div>
                    ) : services.map(svc => {
                      const selectedVeh = selectedVehicle ? vehicles.find(v => v.id === selectedVehicle) : (vehicles.length === 1 ? vehicles[0] : null);
                      const compatible = !selectedVeh || isVehicleCompatible(selectedVeh, svc);
                      return (
                        <div
                          key={svc.id}
                          onClick={() => { if (!compatible) return; setSelectedService(svc.id); setBookingStep(2); setSelectedSlot(null); setHoldId(null); setHoldExpiresAt(null); setBookingResult(null); }}
                          className={`p-5 rounded-2xl border-2 transition-all ${
                            !compatible
                              ? 'opacity-60 cursor-not-allowed border-slate-200 bg-slate-50'
                              : selectedService === svc.id
                                ? 'cursor-pointer border-primary bg-blue-50/50 shadow-sm'
                                : 'cursor-pointer border-slate-200 hover:border-primary/40 hover:shadow-md'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-lg text-slate-900">{svc.name}</h3>
                              {(svc as any).requiresConfirmation === false ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs"><Zap className="h-3 w-3 mr-0.5" />Instant Book</Badge>
                              ) : (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Request</Badge>
                              )}
                            </div>
                            <span className="font-display font-bold text-xl text-primary">{formatCurrency((svc as any).allInPriceMinor ?? svc.basePriceMinor)}</span>
                          </div>
                          {(svc as any).description && (
                            <p className="text-sm text-slate-500 mb-2">{(svc as any).description}</p>
                          )}
                          <div className="flex gap-4 text-xs font-semibold text-slate-400">
                            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {svc.durationMins} min</span>
                          </div>
                          {!compatible && selectedVeh && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Your vehicle ({selectedVeh.unitNumber}) exceeds this service's size limit
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {bookingStep > 1 && selectedSvc && (
              <div className="px-6 py-4 bg-slate-50 text-sm text-slate-600 flex items-center justify-between">
                <span><span className="font-semibold text-slate-900">{selectedSvc.name}</span> — {formatCurrency((selectedSvc as any).allInPriceMinor ?? selectedSvc.basePriceMinor)} · {selectedSvc.durationMins} min</span>
              </div>
            )}
          </Card>

          {/* Step 2: Date & Time */}
          <Card className={`transition-all duration-300 ${bookingStep < 2 ? "opacity-50 pointer-events-none" : bookingStep !== 2 && !stepComplete(2) ? "opacity-50" : ""}`}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${stepComplete(2) && bookingStep > 2 ? 'bg-green-500 text-white' : bookingStep >= 2 ? 'bg-slate-900 text-white' : 'bg-slate-300 text-white'}`}>
                  {stepComplete(2) && bookingStep > 2 ? <CheckCircle2 className="h-5 w-5" /> : "2"}
                </span>
                Date & Time
              </h2>
              {bookingStep > 2 && stepComplete(2) && (
                <button onClick={() => setBookingStep(2)} className="text-sm font-semibold text-primary hover:text-primary/80">Change</button>
              )}
            </div>
            <AnimatePresence>
              {bookingStep === 2 && selectedService && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="p-6">
                    <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                      {[0,1,2,3,4,5,6].map(offset => {
                        const d = addDays(new Date(), offset);
                        const dStr = format(d, "yyyy-MM-dd");
                        const isSel = dStr === selectedDate;
                        return (
                          <button
                            key={dStr}
                            onClick={() => { setSelectedDate(dStr); setSelectedSlot(null); }}
                            className={`flex-shrink-0 w-20 h-24 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${isSel ? 'border-primary bg-primary text-white shadow-lg shadow-primary/25' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50'}`}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{format(d, "EEE")}</span>
                            <span className="text-2xl font-display font-bold">{format(d, "d")}</span>
                          </button>
                        );
                      })}
                    </div>

                    <h3 className="font-bold text-slate-900 mb-4">Available Slots</h3>
                    {isLoadingSlots ? (
                      <div className="h-32 flex items-center justify-center">
                        <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full" />
                      </div>
                    ) : !(availabilityData as any)?.slots?.length ? (
                      <div className="p-8 bg-slate-50 rounded-xl text-center border border-dashed border-slate-300">
                        <p className="text-slate-500 font-medium">No slots available on this date.</p>
                        <p className="text-slate-400 text-sm mt-1">Try selecting a different day.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {(availabilityData as any).slots.map((slot: any) => (
                          <button
                            key={slot.startUtc}
                            disabled={!slot.available}
                            onClick={() => setSelectedSlot(slot.startUtc)}
                            className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${
                              !slot.available
                                ? 'opacity-30 bg-slate-50 border-slate-200 cursor-not-allowed line-through'
                                : selectedSlot === slot.startUtc
                                  ? 'bg-primary text-white border-primary ring-2 ring-primary/20 shadow-md'
                                  : 'bg-white border-slate-200 hover:border-primary/50 text-slate-700 hover:shadow-sm'
                            }`}
                          >
                            {slot.startTime}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-8 flex justify-end">
                      <Button
                        disabled={!selectedSlot || holdMutation.isPending}
                        isLoading={holdMutation.isPending}
                        onClick={handleCreateHold}
                        className="gap-2"
                      >
                        Hold Slot & Continue <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {bookingStep > 2 && selectedSlot && (
              <div className="px-6 py-4 bg-slate-50 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{formatDate(selectedSlot, "EEEE, MMM d, yyyy")}</span> at <span className="font-semibold text-slate-900">{formatDate(selectedSlot, "h:mm a")}</span>
              </div>
            )}
          </Card>

          {/* Hold countdown banner */}
          {holdTimeLeft != null && holdTimeLeft > 0 && bookingStep >= 3 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <Timer className="h-4 w-4 text-amber-600" />
              <span className="text-amber-800 font-medium">
                Slot held for <span className="font-bold">{Math.floor(holdTimeLeft / 60)}:{String(holdTimeLeft % 60).padStart(2, "0")}</span> — complete your booking before the hold expires.
              </span>
            </div>
          )}
          {holdTimeLeft === 0 && bookingStep >= 3 && !bookingResult && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-800 font-medium">Your hold has expired. <button onClick={() => { setBookingStep(2); setHoldId(null); setSelectedSlot(null); }} className="underline font-bold">Select a new time slot</button></span>
            </div>
          )}

          {/* Step 3: Vehicle Selection (only if multiple vehicles) */}
          {vehicles.length > 1 && (
            <Card className={`transition-all duration-300 ${bookingStep < 3 ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${bookingStep > 3 ? 'bg-green-500 text-white' : bookingStep >= 3 ? 'bg-slate-900 text-white' : 'bg-slate-300 text-white'}`}>
                    {bookingStep > 3 ? <CheckCircle2 className="h-5 w-5" /> : "3"}
                  </span>
                  Select Vehicle
                </h2>
                {bookingStep > 3 && (
                  <button onClick={() => setBookingStep(3)} className="text-sm font-semibold text-primary hover:text-primary/80">Change</button>
                )}
              </div>
              <AnimatePresence>
                {bookingStep === 3 && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        {vehicles.map(v => {
                          const compat = selectedSvc ? isVehicleCompatible(v, selectedSvc) : true;
                          return (
                            <div
                              key={v.id}
                              onClick={() => { if (compat) setSelectedVehicle(v.id); }}
                              className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${
                                !compat
                                  ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                                  : selectedVehicle === v.id
                                    ? 'cursor-pointer border-primary bg-blue-50 shadow-sm'
                                    : 'cursor-pointer border-slate-200 hover:border-primary/40 hover:shadow-sm'
                              }`}
                            >
                              <div className={`p-3 rounded-xl ${selectedVehicle === v.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <Truck className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-slate-900">{v.unitNumber}</div>
                                <div className="text-xs text-slate-500 capitalize">{(v as any).subtypeCode?.replace(/_/g, ' ').toLowerCase() || v.categoryCode?.replace(/_/g, ' ').toLowerCase()}</div>
                              </div>
                              {!compat && (
                                <span className="text-xs text-amber-600 font-medium">Too large</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between">
                        <button onClick={() => { setSelectedVehicle(null); setBookingStep(4); }} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                          Skip — I'll specify later
                        </button>
                        <Button disabled={!selectedVehicle} onClick={() => setBookingStep(4)} className="gap-2">
                          Continue <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {bookingStep > 3 && selectedVehicle && (
                <div className="px-6 py-4 bg-slate-50 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{vehicles.find(v => v.id === selectedVehicle)?.unitNumber}</span>
                </div>
              )}
            </Card>
          )}

          {/* No vehicles message */}
          {vehicles.length === 0 && bookingStep >= 3 && !bookingResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
              <span className="font-semibold">No vehicles assigned to your account.</span> Contact your fleet manager to assign a vehicle, or proceed without one.
            </div>
          )}

          {/* Step 4 (or 3 if single vehicle): Confirm Booking */}
          {!bookingResult ? (
            <Card className={`transition-all duration-300 ${(vehicles.length > 1 ? bookingStep < 4 : bookingStep < 3) ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="p-6">
                {bookingError && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                    {bookingError}
                  </div>
                )}
                <Button
                  size="lg"
                  className="w-full h-14 text-lg gap-2"
                  onClick={handleConfirmBooking}
                  disabled={!holdId || holdTimeLeft === 0 || bookMutation.isPending}
                  isLoading={bookMutation.isPending}
                >
                  <CheckCircle2 className="h-5 w-5" /> Confirm Booking
                </Button>
                <p className="text-center text-xs text-slate-400 mt-3">
                  {selectedSvc && (selectedSvc as any).requiresConfirmation === false
                    ? "This is an instant booking — it will be confirmed immediately."
                    : "The provider will review and confirm your booking request."}
                </p>
              </div>
            </Card>
          ) : (
            /* Booking Confirmation Screen */
            <Card className="border-2 border-green-200 bg-green-50/30">
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">
                  {bookingResult.status === "PROVIDER_CONFIRMED" ? "Booking Confirmed!" : "Request Submitted!"}
                </h2>
                <p className="text-slate-600 mb-6">
                  {bookingResult.status === "PROVIDER_CONFIRMED"
                    ? "Your wash has been confirmed. Show up at the scheduled time and you're all set."
                    : "Your booking request has been sent to the provider. You'll be notified when they respond."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={() => setNav(`/bookings/${bookingResult.id}`)} className="gap-2">
                    View Booking Details <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setNav("/my-bookings")}>
                    My Bookings
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Col - Booking Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-700 overflow-hidden">
              <div className="p-6 border-b border-slate-700/50">
                <h3 className="font-display font-bold text-xl">Booking Summary</h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Service</p>
                  <p className="font-bold text-lg">{selectedSvc?.name || "—"}</p>
                  {selectedSvc && <p className="text-slate-400 text-sm">{selectedSvc.durationMins} min</p>}
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Date & Time</p>
                  <p className="font-bold text-lg">{selectedSlot ? formatDate(selectedSlot, "MMM d, yyyy") : "—"}</p>
                  {selectedSlot && <p className="text-slate-400 text-sm">{formatDate(selectedSlot, "h:mm a")}</p>}
                </div>
                {selectedVehicle && (
                  <div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Vehicle</p>
                    <p className="font-bold text-lg">{vehicles.find(v => v.id === selectedVehicle)?.unitNumber || "—"}</p>
                  </div>
                )}
                <div className="pt-5 border-t border-slate-700/50 flex justify-between items-end">
                  <span className="text-slate-300 text-sm">Total Price</span>
                  <span className="text-3xl font-display font-bold text-blue-400">
                    {selectedSvc ? formatCurrency(totalPrice) : "$0.00"}
                  </span>
                </div>
              </div>
            </Card>

            {/* Operating Hours Schedule */}
            {locData.operatingWindows && locData.operatingWindows.length > 0 && (
              <Card className="p-5">
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  Operating Hours
                </h3>
                <div className="space-y-1.5 text-sm">
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((dayName, dayIdx) => {
                    const dayWindows = (locData.operatingWindows || [])
                      .filter((w: any) => w.dayOfWeek === dayIdx)
                      .sort((a: any, b: any) => a.openTime.localeCompare(b.openTime));
                    const isToday = new Date().getDay() === dayIdx;
                    return (
                      <div key={dayIdx} className={`flex justify-between py-1 px-2 rounded ${isToday ? "bg-blue-50 font-semibold" : ""}`}>
                        <span className={isToday ? "text-blue-700" : "text-slate-600"}>{dayName.slice(0, 3)}</span>
                        <span className={isToday ? "text-blue-700" : "text-slate-500"}>
                          {dayWindows.length === 0 ? "Closed" : dayWindows.map((w: any) => {
                            const fmt = (t: string) => {
                              const [h, m] = t.split(":").map(Number);
                              const ampm = h >= 12 ? "PM" : "AM";
                              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                              return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
                            };
                            return `${fmt(w.openTime)} – ${fmt(w.closeTime)}`;
                          }).join(", ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-bold text-slate-700">Free cancellation</span> up to 2 hours before your scheduled wash. Your card won't be charged until the wash is completed.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-400" />
          Customer Reviews
        </h2>
        <LocationReviews locationId={locationId} />
      </div>
    </div>
  );
}
