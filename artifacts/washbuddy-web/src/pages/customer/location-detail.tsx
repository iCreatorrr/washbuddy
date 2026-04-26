import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetAvailability, useCreateBookingHold, useCreateBooking } from "@workspace/api-client-react";
import { Card, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Clock, ShieldCheck, CheckCircle2, ChevronLeft, ArrowRight, Navigation, Star, Zap, AlertTriangle, Timer } from "lucide-react";
import { LocationReviews } from "@/components/location-reviews";
import { formatCurrency, formatDate } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveVehicle } from "@/contexts/activeVehicle";
import {
  BODY_TYPE_ICON,
  BODY_TYPE_LABEL,
  BODY_TYPE_STYLE,
  deriveSizeClassFromLengthInches,
  inchesToFeet,
  normalizeBodyType,
  SIZE_CLASS_LABEL,
  vehicleDisplayName,
  vehicleFitsService,
} from "@/lib/vehicleBodyType";

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
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [etaMins, setEtaMins] = useState<number | null>(null);
  // Persist the receipt across remounts (back-then-forward navigation,
  // tab refocus). Keyed by locationId so booking at one location doesn't
  // pre-fill the receipt at another. Cleared after the user clicks "View
  // My Bookings" or after 30 minutes (whichever comes first).
  const receiptStorageKey = locationId ? `wb.receipt.${locationId}` : null;
  const [bookingResult, setBookingResult] = useState<{ id: string; status: string; slotUtc?: string; serviceId?: string } | null>(() => {
    if (!receiptStorageKey) return null;
    try {
      const raw = sessionStorage.getItem(receiptStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.savedAt) return null;
      if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
        sessionStorage.removeItem(receiptStorageKey);
        return null;
      }
      return { id: parsed.id, status: parsed.status, slotUtc: parsed.slotUtc, serviceId: parsed.serviceId };
    } catch {
      return null;
    }
  });
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [holdTimeLeft, setHoldTimeLeft] = useState<number | null>(null);
  const [shortNoticePending, setShortNoticePending] = useState<{ slotUtc: string; minutes: number } | null>(null);

  const SHORT_NOTICE_THRESHOLD_MINUTES = 30;

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

  const { activeVehicle, hasAnyVehicle, loading: vehicleLoading } = useActiveVehicle();
  const activeVehicleClass = activeVehicle ? deriveSizeClassFromLengthInches(activeVehicle.lengthInches) : null;

  // Swapping the active vehicle mid-booking can change bay compatibility
  // and slot pricing, so reset the in-flight selection back to step 1
  // whenever the underlying vehicle changes. Skip the very first render
  // (initial pickup of activeVehicle on mount) by tracking the last
  // observed id.
  // (Mid-flow vehicle-swap reset effect removed — the pill that
  // changed the active vehicle from this page is gone, so the
  // active-vehicle id can no longer change without leaving the page.)

  // Availability is class-aware: passing the active vehicle's size class
  // filters slots to those a compatible bay can host. Without an active
  // vehicle the booking column is gated, so we don't even fire the query.
  const { data: availabilityData, isLoading: isLoadingSlots } = useGetAvailability(
    locationId,
    {
      date: selectedDate,
      serviceId: selectedService || "",
      ...(activeVehicleClass ? { vehicleClass: activeVehicleClass } : {}),
    } as any,
    {
      query: { enabled: !!selectedService && !!selectedDate && !!activeVehicle },
      request: { credentials: 'include' }
    }
  );

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

  // Pure length-based service compatibility. Body type / subtype is
  // visual only now: a service has a single maxVehicleClass cap, and a
  // vehicle's length-derived class must fit under it. The legacy
  // ServiceCompatibility table still exists in the schema but is no
  // longer consulted by the driver flow.
  const isVehicleCompatible = (vehicle: any, service: any): boolean => {
    return vehicleFitsService(vehicle?.lengthInches, service?.maxVehicleClass);
  };

  // After hold succeeds, drivers go straight to confirm — vehicle is the
  // pre-selected active one. The old "Step 3: Vehicle Selection" branch is
  // gone entirely; fleet-admin booking still has its own picker page.
  const advanceFromSlot = () => {
    setBookingStep(3);
  };

  const [holdId, setHoldId] = useState<string | null>(null);

  if (isSearchError) return <div className="max-w-5xl mx-auto py-8"><ErrorState message={fetchErrorDetails ? `Could not load location details (${fetchErrorDetails})` : "Could not load location details."} onRetry={fetchLocation} /></div>;
  if (isSearchLoading) return <div className="p-12 text-center text-slate-500"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" /></div>;
  if (!locData) return <div className="max-w-5xl mx-auto py-8"><ErrorState message="Location not found. It may have been removed." /></div>;

  const proceedWithHold = async () => {
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

  const handleCreateHold = async () => {
    if (!selectedService || !selectedSlot) return;
    const minutesUntilSlot = Math.round((new Date(selectedSlot).getTime() - Date.now()) / 60000);
    if (minutesUntilSlot >= 0 && minutesUntilSlot < SHORT_NOTICE_THRESHOLD_MINUTES) {
      setShortNoticePending({ slotUtc: selectedSlot, minutes: minutesUntilSlot });
      return;
    }
    await proceedWithHold();
  };

  const confirmShortNotice = async () => {
    setShortNoticePending(null);
    await proceedWithHold();
  };

  const cancelShortNotice = () => {
    setShortNoticePending(null);
    setSelectedSlot(null);
  };

  const handleConfirmBooking = async () => {
    if (!holdId || !activeVehicle) return;
    setBookingError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const bookRes = await bookMutation.mutateAsync({
        data: {
          holdId,
          vehicleId: activeVehicle.id,
          idempotencyKey
        }
      });
      const receipt = {
        id: bookRes.booking.id,
        status: bookRes.booking.status,
        slotUtc: selectedSlot ?? undefined,
        serviceId: selectedService ?? undefined,
      };
      setBookingResult(receipt);
      // Clear local hold state — the server has already consumed it
      // server-side as part of bookings/from-hold. Drop selected service
      // and slot too, so a back-button bringing us back to this page
      // doesn't restore the bookable form: the receipt is the only
      // thing the user can do here now. Persist to sessionStorage so a
      // back-then-forward navigation re-renders the receipt instead of
      // the bookable form (the hold is already consumed server-side).
      setHoldExpiresAt(null);
      setHoldId(null);
      setSelectedService(null);
      setSelectedSlot(null);
      if (receiptStorageKey) {
        try {
          sessionStorage.setItem(receiptStorageKey, JSON.stringify({ ...receipt, savedAt: Date.now() }));
        } catch { /* quota / disabled storage — receipt still works in-session */ }
      }
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
    return false;
  };

  // Hoisted so the upfront incompatibility warning AND the gate that
  // hides the booking steps share the same boolean. Strict semantics:
  // a location with no bay data, an empty bays array, or no bay
  // supporting the active vehicle's class is incompatible. The earlier
  // version required `bays.length > 0` as a precondition, which meant
  // "no bays at all" silently fell through as compatible — the same
  // permissive-fallback footgun we just closed in search.tsx and
  // route-planner.tsx.
  const locationIncompatibleClass = activeVehicle ? deriveSizeClassFromLengthInches(activeVehicle.lengthInches) : null;
  const locationBays: any[] = Array.isArray((locData as any)?.washBays) ? (locData as any).washBays : [];
  const locationIncompatible = !!activeVehicle && !!locationIncompatibleClass
    && !locationBays.some((b: any) => Array.isArray(b.supportedClasses) && b.supportedClasses.includes(locationIncompatibleClass));
  const incompatibleVehicleLine = activeVehicle
    ? `${vehicleDisplayName(activeVehicle)}${inchesToFeet(activeVehicle.lengthInches) ? `, ${inchesToFeet(activeVehicle.lengthInches)}ft` : ""}${locationIncompatibleClass && SIZE_CLASS_LABEL[locationIncompatibleClass] ? ` ${SIZE_CLASS_LABEL[locationIncompatibleClass]}` : ""}`
    : "";

  // When the booking has succeeded, the entire page collapses to a
  // single centered receipt card — no header, no sidebar, no reviews.
  // The receipt IS the page. Earlier we tried inlining the receipt as
  // a step-3 card; that left the rest of the page (booking summary,
  // operating hours, etc.) competing for the eye and made the success
  // moment feel ambiguous.
  if (bookingResult) {
    const resolvedSvc = selectedSvc || services.find((s: any) => s.id === bookingResult.serviceId) || null;
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <BookingReceipt
          bookingResult={bookingResult}
          locData={locData}
          service={resolvedSvc}
          slotUtc={selectedSlot || bookingResult.slotUtc || null}
          vehicle={activeVehicle}
          totalPrice={totalPrice || ((resolvedSvc as any)?.allInPriceMinor ?? (resolvedSvc as any)?.basePriceMinor) || 0}
          onDone={() => {
            if (receiptStorageKey) sessionStorage.removeItem(receiptStorageKey);
            setNav("/bookings");
          }}
        />
      </div>
    );
  }

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

          {/* Active vehicle context — drives availability + pricing + bay
              compatibility for the rest of the flow. The booking column is
              gated on this; without an active vehicle we render an empty
              state below instead of Steps 1-3. */}
          <ActiveVehicleContextCard />

          {/* Defense-in-depth incompatibility guard. When the active
              vehicle's class can't fit any bay at this location, render
              an upfront prominent warning IN PLACE OF the booking
              steps below — the buried "no slots" message in step 2
              was confusing and made the failure look like a date issue. */}
          {locationIncompatible && activeVehicle ? (
            <Card className="p-6 md:p-8 bg-amber-50 border-2 border-amber-200">
              <div className="flex flex-col items-center text-center max-w-lg mx-auto">
                <div className="h-14 w-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-3">
                  <AlertTriangle className="h-7 w-7 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-amber-900">This location can't host your active vehicle</h3>
                <p className="text-sm text-amber-800/90 mt-2">
                  Your active vehicle (<span className="font-semibold">{incompatibleVehicleLine}</span>) doesn't fit any bay at <span className="font-semibold">{locData?.name || "this location"}</span>.
                </p>
                <p className="text-sm text-amber-800/80 mt-2">
                  Change your active vehicle in the pill above to book here, or
                  <button onClick={() => setNav("/search")} className="ml-1 font-semibold underline hover:no-underline">pick a different location</button>.
                </p>
              </div>
            </Card>
          ) : (
          !vehicleLoading && !hasAnyVehicle ? (
            <Card className="p-8 text-center bg-amber-50 border-amber-200">
              <div className="h-14 w-14 mx-auto bg-amber-100 rounded-2xl flex items-center justify-center mb-3">
                <AlertTriangle className="h-7 w-7 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-amber-900">Add a vehicle to book a wash</h3>
              <p className="text-sm text-amber-800/80 mt-1 max-w-md mx-auto">Bay compatibility and pricing are determined by your vehicle's size class. Add one to continue.</p>
              <Button className="mt-4" onClick={() => setNav("/vehicles")}>Manage Vehicles</Button>
            </Card>
          ) : (<>

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
                      const compatible = !activeVehicle || isVehicleCompatible(activeVehicle, svc);
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
                          {!compatible && activeVehicle && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {(() => {
                                const cls = deriveSizeClassFromLengthInches(activeVehicle.lengthInches);
                                const cap = (svc as any).maxVehicleClass;
                                const capLabel = cap && SIZE_CLASS_LABEL[cap as keyof typeof SIZE_CLASS_LABEL];
                                const myLabel = cls && SIZE_CLASS_LABEL[cls];
                                return capLabel
                                  ? `This service supports up to ${capLabel} vehicles${myLabel ? `; your ${myLabel} bus exceeds it` : ""}.`
                                  : `Your vehicle exceeds this service's size limit.`;
                              })()}
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
                        <p className="text-slate-500 font-medium">{(availabilityData as any)?.message || "No slots on this date."}</p>
                        <p className="text-slate-400 text-sm mt-1">Try a different day or location.</p>
                      </div>
                    ) : !((availabilityData as any).slots as any[]).some((s: any) => s.available) ? (
                      // Structural vehicle/location incompatibility is
                      // now caught upfront — by the time we reach this
                      // branch the location *can* host the active
                      // vehicle, just not on this date. So the right
                      // framing is "fully booked today" or "closed".
                      <div className="p-8 bg-slate-50 rounded-xl text-center border border-dashed border-slate-300">
                        <p className="text-slate-700 font-medium">No availability on this date.</p>
                        <p className="text-slate-500 text-sm mt-1">All compatible bays are booked or the location is closed. Try a different day.</p>
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

          {/* Step 3: Confirm Booking — vehicle is the active one, set above.
              When bookingResult is set, the page-level early-return upstream
              swaps in a centered receipt instead of this card. */}
          <Card className={`transition-all duration-300 ${bookingStep < 3 ? "opacity-50 pointer-events-none" : ""}`}>
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
          </>)
        )}
        </div>

        {/* Right Col - Booking Summary. Hidden when the location can't
            host the active vehicle — the upfront warning replaces the
            entire booking flow including the summary sidebar. */}
        {!locationIncompatible && (
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
                {activeVehicle && (
                  <div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Vehicle</p>
                    <p className="font-bold text-lg">{vehicleDisplayName(activeVehicle)}</p>
                    {activeVehicleClass && <p className="text-slate-400 text-sm">{SIZE_CLASS_LABEL[activeVehicleClass]}</p>}
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
        )}
      </div>

      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-400" />
          Customer Reviews
        </h2>
        <LocationReviews locationId={locationId} />
      </div>

      {/* shortNoticePending modal — declared inline below */}
      {shortNoticePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cancelShortNotice}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-xl"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm short-notice booking</h3>
                <p className="text-sm text-slate-600 mt-1">
                  You're booking a wash starting at{" "}
                  <span className="font-semibold text-slate-900">
                    {formatDate(shortNoticePending.slotUtc, "h:mm a", (locData as any)?.timezone)}
                  </span>{" "}
                  — that's in <span className="font-semibold text-slate-900">{shortNoticePending.minutes} minute{shortNoticePending.minutes === 1 ? "" : "s"}</span>. Please make sure you can arrive on time. The bay will be reserved for you.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={cancelShortNotice}>Pick Another Time</Button>
              <Button className="flex-1" onClick={confirmShortNotice} isLoading={holdMutation.isPending}>Confirm Booking</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline receipt-style success state. Replaces the older two-button
 * "Booking Confirmed!" / "View Booking Details" intermediate screen —
 * the success page IS the receipt now. Photo placeholder slot will be
 * wired to real provider photos in a later prompt. */
function BookingReceipt({
  bookingResult,
  locData,
  service,
  slotUtc,
  vehicle,
  totalPrice,
  onDone,
}: {
  bookingResult: { id: string; status: string };
  locData: any;
  service: any;
  slotUtc: string | null;
  vehicle: ReturnType<typeof useActiveVehicle>["activeVehicle"];
  totalPrice: number;
  onDone: () => void;
}) {
  const tz: string | undefined = locData?.timezone || undefined;
  const isInstant = bookingResult.status === "PROVIDER_CONFIRMED";
  const bt = vehicle ? normalizeBodyType(vehicle.bodyType) : null;
  const VehicleIcon = bt ? BODY_TYPE_ICON[bt] : null;
  const vehicleStyle = bt ? BODY_TYPE_STYLE[bt] : null;

  // Render the slot in the location's local timezone with the (EST/EDT)
  // suffix so drivers can't mistake it for their own clock when they're
  // travelling. Falls back gracefully if Intl can't resolve the zone.
  const dateLine = slotUtc ? formatDate(slotUtc, "EEEE, MMM d, yyyy", tz) : "—";
  const timeLine = slotUtc ? renderTimeWithZone(slotUtc, tz) : "—";

  const vehicleClass = vehicle ? deriveSizeClassFromLengthInches(vehicle.lengthInches) : null;

  return (
    <Card className="bg-white border border-slate-200 shadow-sm">
      <div className="px-8 py-10 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, times: [0, 0.6, 1], ease: "easeOut" }}
          className="w-[90px] h-[90px] rounded-full bg-emerald-50 flex items-center justify-center mb-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.05, 1] }}
            transition={{ delay: 0.05, duration: 0.2, times: [0, 0.6, 1] }}
          >
            <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={2.2} />
          </motion.div>
        </motion.div>

        <h1 className="text-3xl font-display font-bold text-slate-900">
          {isInstant ? "Booking Confirmed" : "Request Submitted"}
        </h1>

        <div className="mt-4">
          <p className="font-semibold text-slate-900">{locData?.name || "—"}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {[locData?.addressLine1, locData?.city, locData?.stateCode].filter(Boolean).join(", ")}
          </p>
        </div>

        <div className="w-full max-w-sm mt-7 space-y-3 text-sm">
          <ReceiptRow label="Date & time" value={
            <>
              <span className="block text-slate-900 font-medium">{dateLine}</span>
              <span className="block text-slate-500 text-xs mt-0.5">{timeLine}</span>
            </>
          } />
          <ReceiptRow label="Service" value={
            <>
              <span className="block text-slate-900 font-medium">{service?.name || "—"}</span>
              {service?.durationMins != null && (
                <span className="block text-slate-500 text-xs mt-0.5">{service.durationMins} min</span>
              )}
            </>
          } />
          <ReceiptRow label="Vehicle" value={
            vehicle ? (
              <div className="flex items-center gap-2 justify-end">
                {VehicleIcon && vehicleStyle && (
                  <div className={`h-6 w-6 ${vehicleStyle.chipBg} rounded-md flex items-center justify-center shrink-0`}>
                    <VehicleIcon className={`h-3.5 w-3.5 ${vehicleStyle.chipFg}`} />
                  </div>
                )}
                <div className="text-right">
                  <span className="block text-slate-900 font-medium">{vehicleDisplayName(vehicle)}</span>
                  {vehicleClass && (
                    <span className="block text-slate-500 text-xs mt-0.5">{SIZE_CLASS_LABEL[vehicleClass]}</span>
                  )}
                </div>
              </div>
            ) : <span className="text-slate-900 font-medium">—</span>
          } />
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="text-slate-500">Total</span>
            <span className="font-display font-bold text-xl text-slate-900">{formatCurrency(totalPrice)}</span>
          </div>
        </div>

        <p className="font-mono text-[11px] text-slate-400 mt-6 tracking-wider">
          #{bookingResult.id.split("-")[0].toUpperCase()}
        </p>

        <button
          onClick={onDone}
          className="mt-6 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          View My Bookings →
        </button>
      </div>
    </Card>
  );
}

function ReceiptRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 shrink-0 pt-0.5">{label}</span>
      <div className="text-right min-w-0">{value}</div>
    </div>
  );
}

/** "10:30 AM (EDT)" — always show the location's wall-clock time with
 * its current zone abbreviation so a driver in another tz isn't tricked
 * into reading the time as their local. */
function renderTimeWithZone(slotUtc: string, timezone?: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
      timeZoneName: "short",
    }).format(new Date(slotUtc));
    // "10:30 AM EDT" → "10:30 AM (EDT)"
    return formatted.replace(/\s+([A-Z]{2,5})$/, " ($1)");
  } catch {
    return formatDate(slotUtc, "h:mm a", timezone);
  }
}

/** Top-of-flow context card showing the driver's active vehicle. The
 * "Change" link reuses the same popover the global pill uses, so the
 * affordance is consistent everywhere a swap can happen. */
function ActiveVehicleContextCard() {
  const { activeVehicle, hasAnyVehicle, loading } = useActiveVehicle();
  if (loading || !hasAnyVehicle || !activeVehicle) return null;
  const bt = normalizeBodyType(activeVehicle.bodyType);
  const style = BODY_TYPE_STYLE[bt];
  const Icon = BODY_TYPE_ICON[bt];
  const cls = deriveSizeClassFromLengthInches(activeVehicle.lengthInches);
  const lengthFeet = inchesToFeet(activeVehicle.lengthInches);
  // Read-only context. The clickable pill that previously sat at the
  // right edge of this card is gone — drivers swap vehicles via the
  // global pill on Find a Wash / Route Planner, not mid-booking.
  return (
    <Card className="relative p-0 overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.stripe}`} aria-hidden />
      <div className="px-5 pl-6 py-3 flex items-center gap-3">
        <div className={`h-10 w-10 ${style.chipBg} rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${style.chipFg}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Booking for</p>
          <p className="font-bold text-slate-900 truncate">
            {vehicleDisplayName(activeVehicle)} <span className="text-slate-400 font-normal">·</span> <span className="font-medium text-slate-600">{BODY_TYPE_LABEL[bt]}{cls ? ` · ${SIZE_CLASS_LABEL[cls]}` : ""}{lengthFeet ? ` · ${lengthFeet} ft` : ""}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
