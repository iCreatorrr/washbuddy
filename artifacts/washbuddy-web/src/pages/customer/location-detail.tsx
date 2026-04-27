import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCreateBookingHold, useCreateBooking } from "@workspace/api-client-react";
import { Card, Button, Badge, ErrorState } from "@/components/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MapPin, CheckCircle2, ChevronLeft, ArrowRight, Star, AlertTriangle, StickyNote, Send, Check, Calendar } from "lucide-react";
import { LocationReviews } from "@/components/location-reviews";
import { formatCurrency, formatDate } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { motion } from "framer-motion";
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
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

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

  // Multi-service: ordered list, the order the driver picked. Empty
  // when nothing's selected. Slot grid + sticky footer + booking
  // creation all read this.
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [etaMins, setEtaMins] = useState<number | null>(null);
  const [driverNote, setDriverNote] = useState<string>("");
  const [driverNoteOpen, setDriverNoteOpen] = useState<boolean>(false);
  // Auto-open reviews sheet when the URL carries ?reviews=open. The
  // notification system uses this for "Provider replied to your
  // review" — the deep link lands the driver on the location page
  // with the reviews sheet already showing the reply.
  const [reviewsOpen, setReviewsOpen] = useState<boolean>(() => urlParams.get("reviews") === "open");

  // Persist the receipt across remounts (back-then-forward navigation,
  // tab refocus). Keyed by locationId so booking at one location doesn't
  // pre-fill the receipt at another. Cleared after the user clicks "View
  // My Bookings" or after 30 minutes (whichever comes first).
  //
  // Rehydration is GATED on the URL carrying ?booked=<bookingId> AND that
  // id matching the cached receipt. Without the gate, *any* visit to
  // /location/:id after a prior booking at that location renders the
  // receipt instead of the form — the regression user-reported as
  // "tapping a listing card opens a receipt". The 2g-1 back-button fix
  // already replaces the post-booking URL with /location/:id?booked=X,
  // so this gate just enforces what was always intended.
  const receiptStorageKey = locationId ? `wb.receipt.${locationId}` : null;
  // Vehicle is part of the cached receipt now (snapshot at booking time)
  // so the receipt reads from the booked vehicle, not the user's current
  // active vehicle context. Changing the active vehicle after booking no
  // longer mutates a past receipt.
  const [bookingResult, setBookingResult] = useState<{ id: string; status: string; slotUtc?: string; serviceIds?: string[]; vehicle?: any } | null>(() => {
    if (!receiptStorageKey) return null;
    const bookedFromUrl = urlParams.get("booked");
    if (!bookedFromUrl) return null;
    try {
      const raw = sessionStorage.getItem(receiptStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.savedAt) return null;
      if (parsed.id !== bookedFromUrl) return null;
      if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
        sessionStorage.removeItem(receiptStorageKey);
        return null;
      }
      return { id: parsed.id, status: parsed.status, slotUtc: parsed.slotUtc, serviceIds: parsed.serviceIds, vehicle: parsed.vehicle };
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

  const fetchLocation = React.useCallback(async () => {
    if (!locationId) return;
    setIsSearchLoading(true);
    setIsSearchError(false);
    setFetchErrorDetails(null);

    try {
      const r = await fetch(`${API_BASE}/api/locations/${locationId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d?.location) {
          setLocData(d.location);
          setIsSearchLoading(false);
          return;
        }
      }
    } catch { /* fall through to search fallback */ }

    try {
      const r = await fetch(`${API_BASE}/api/locations/search`, { credentials: "include" });
      if (!r.ok) {
        setFetchErrorDetails(`HTTP ${r.status} on search fallback`);
        setIsSearchError(true);
        return;
      }
      const d = await r.json();
      const match = (d?.locations || []).find((l: any) => l.id === locationId);
      if (!match) {
        setFetchErrorDetails("Location not in search results");
        setIsSearchError(true);
        return;
      }
      setLocData(match);
    } catch (err: any) {
      setFetchErrorDetails(err?.message || "Network error");
      setIsSearchError(true);
    } finally {
      setIsSearchLoading(false);
    }
  }, [locationId]);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const services: any[] = locData?.services || [];

  const { activeVehicle, hasAnyVehicle, loading: vehicleLoading } = useActiveVehicle();
  const activeVehicleClass = activeVehicle ? deriveSizeClassFromLengthInches(activeVehicle.lengthInches) : null;

  // Aggregates derived from the multi-select. Pure functions of the
  // selection so React re-derives on every render — no stale state.
  const selectedServices = useMemo(
    () => selectedServiceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean),
    [selectedServiceIds, services],
  );
  const totalDurationMins = selectedServices.reduce((sum, s: any) => sum + (s.durationMins || 0), 0);
  const totalPriceMinor = selectedServices.reduce((sum, s: any) => sum + ((s.allInPriceMinor ?? s.basePriceMinor) || 0), 0);

  // Slot availability — raw useQuery so vehicleClass + the ordered
  // serviceIds bake into the URL. Every change to either the active
  // vehicle or the service selection triggers a fresh, observable
  // network request. The smart-slot guarantee lives server-side: each
  // returned slot has a contiguous block of (sum of durations) on a
  // single compatible bay.
  const availabilityUrl = useMemo(() => {
    if (selectedServiceIds.length === 0 || !selectedDate) return null;
    const params = new URLSearchParams();
    params.set("date", selectedDate);
    params.set("serviceIds", selectedServiceIds.join(","));
    if (activeVehicleClass) params.set("vehicleClass", activeVehicleClass);
    return `${API_BASE}/api/locations/${locationId}/availability?${params.toString()}`;
  }, [locationId, selectedDate, selectedServiceIds, activeVehicleClass]);

  const { data: availabilityData, isLoading: isLoadingSlots } = useQuery({
    queryKey: ["/availability", locationId, selectedDate, selectedServiceIds.join(","), activeVehicleClass ?? "ANY"],
    queryFn: async () => {
      if (!availabilityUrl) return null;
      const r = await fetch(availabilityUrl, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled: !!availabilityUrl && !!activeVehicle,
    staleTime: 30_000,
  });

  // Defensive gate: if the user already has an upcoming-unfulfilled
  // booking at this location within 7 days, we surface it above the
  // form so a back-button-edge-case or notification deep-link doesn't
  // accidentally double-book. Doesn't block — driver can still book a
  // new slot. Per-status filter is client-side because GET /bookings
  // only accepts a single status param.
  const { data: locationBookingsData } = useQuery({
    queryKey: ["/api/bookings", "location-upcoming", locationId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/bookings?locationId=${locationId}&limit=20`, { credentials: "include" });
      if (!r.ok) return { bookings: [] };
      return r.json();
    },
    enabled: !!locationId,
    staleTime: 30_000,
  });
  const upcomingBookingAtThisLocation = useMemo(() => {
    const list = (locationBookingsData as any)?.bookings || [];
    const now = Date.now();
    const sevenDaysOut = now + 7 * 24 * 60 * 60 * 1000;
    const upcoming = list
      .filter((b: any) =>
        ["REQUESTED", "PROVIDER_CONFIRMED", "CHECKED_IN"].includes(b.status)
        && b.scheduledStartAtUtc
        && new Date(b.scheduledStartAtUtc).getTime() >= now
        && new Date(b.scheduledStartAtUtc).getTime() <= sevenDaysOut)
      // Most-recently-scheduled wins so the surfaced booking is the
      // next one the driver will encounter, not the soonest-created.
      .sort((a: any, b: any) => new Date(b.scheduledStartAtUtc).getTime() - new Date(a.scheduledStartAtUtc).getTime());
    return upcoming[0] || null;
  }, [locationBookingsData]);

  const holdMutation = useCreateBookingHold({ request: { credentials: 'include' } });
  const bookMutation = useCreateBooking({ request: { credentials: 'include' } });

  const [detectedLat, setDetectedLat] = useState<number | null>(userLat);
  const [detectedLng, setDetectedLng] = useState<number | null>(userLng);

  useEffect(() => {
    if (detectedLat != null && detectedLng != null) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setDetectedLat(pos.coords.latitude); setDetectedLng(pos.coords.longitude); },
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

  // Pure length-based service compatibility (no subtype check —
  // body type is visual only).
  const isVehicleCompatible = (vehicle: any, service: any): boolean => {
    return vehicleFitsService(vehicle?.lengthInches, service?.maxVehicleClass);
  };

  // Toggling a service picks/unpicks it. Picking a new service
  // invalidates the picked slot — the slot grid recomputes around
  // a different total duration, and the previously-picked time may
  // no longer fit a contiguous block.
  const toggleService = (serviceId: string) => {
    setBookingError(null);
    setSelectedSlot(null);
    setHoldExpiresAt(null);
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const [holdId, setHoldId] = useState<string | null>(null);

  if (isSearchError) return <div className="max-w-5xl mx-auto py-8 px-4"><ErrorState message={fetchErrorDetails ? `Could not load location details (${fetchErrorDetails})` : "Could not load location details."} onRetry={fetchLocation} /></div>;
  if (isSearchLoading) return <div className="p-12 text-center text-slate-500"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" /></div>;
  if (!locData) return <div className="max-w-5xl mx-auto py-8 px-4"><ErrorState message="Location not found. It may have been removed." /></div>;

  const proceedWithHold = async () => {
    if (selectedServiceIds.length === 0 || !selectedSlot) return;
    setBookingError(null);
    try {
      const holdRes = await holdMutation.mutateAsync({
        // The generated client's typed payload only knows `serviceId`,
        // so cast to bypass — we're sending serviceIds (ordered array)
        // which the server consumes when present and falls back to
        // serviceId if not.
        data: { locationId, serviceId: selectedServiceIds[0], serviceIds: selectedServiceIds, slotStartUtc: selectedSlot } as any,
      });
      setHoldId(holdRes.hold.id);
      setHoldExpiresAt(new Date(holdRes.hold.expiresAtUtc));
      // Auto-confirm right after the hold lands — no manual third step
      // anymore. Errors here flow to bookingError exactly like before.
      await confirmBooking(holdRes.hold.id);
    } catch (err: any) {
      setBookingError(err?.message || "This slot is no longer available. Please select another time.");
    }
  };

  const handleConfirmTap = async () => {
    if (selectedServiceIds.length === 0 || !selectedSlot) return;
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

  const confirmBooking = async (holdIdToUse: string) => {
    if (!holdIdToUse || !activeVehicle) return;
    setBookingError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const bookRes = await bookMutation.mutateAsync({
        data: { holdId: holdIdToUse, vehicleId: activeVehicle.id, idempotencyKey } as any,
      });
      // Snapshot the vehicle ON THE BOOKING into the receipt — once
      // captured, the receipt is immune to subsequent active-vehicle
      // changes. This prevents the data-integrity bug where a driver
      // who books with vehicle A, then swaps active to vehicle B, then
      // refreshes the receipt, sees vehicle B on the receipt for a
      // booking that was actually for A.
      const vehicleSnapshot = activeVehicle ? {
        id: activeVehicle.id,
        nickname: (activeVehicle as any).nickname,
        unitNumber: (activeVehicle as any).unitNumber,
        bodyType: activeVehicle.bodyType,
        lengthInches: activeVehicle.lengthInches,
      } : null;
      const receipt = {
        id: bookRes.booking.id,
        status: bookRes.booking.status,
        slotUtc: selectedSlot ?? undefined,
        serviceIds: [...selectedServiceIds],
        vehicle: vehicleSnapshot,
      };

      // If the driver typed a note inline, attach it to the new
      // booking via the existing append-only notes endpoint. The
      // server freezes authorRole=DRIVER so it shows up on the
      // provider side as "Notes from driver". Best-effort — the
      // booking is already created by this point, so we toast on
      // failure rather than rolling back.
      const trimmedNote = driverNote.trim();
      if (trimmedNote) {
        try {
          const noteRes = await fetch(`${API_BASE}/api/bookings/${bookRes.booking.id}/notes`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: trimmedNote }),
          });
          if (!noteRes.ok) throw new Error(`HTTP ${noteRes.status}`);
        } catch {
          toast.warning("Booking confirmed, but your note couldn't be attached. You can add it from the booking detail page.");
        }
      }

      setBookingResult(receipt);
      setHoldExpiresAt(null);
      setHoldId(null);
      setSelectedServiceIds([]);
      setSelectedSlot(null);
      setDriverNote("");
      setDriverNoteOpen(false);
      if (receiptStorageKey) {
        try { sessionStorage.setItem(receiptStorageKey, JSON.stringify({ ...receipt, savedAt: Date.now() })); }
        catch { /* quota / disabled storage — receipt still works in-session */ }
      }
      // Replace the booking-form URL in history with a receipt-marker
      // URL. With this in place, pressing Back from receipt goes to
      // wherever was BEFORE the form (e.g. /search), not to a fresh
      // form for the same location. The marker also lets us detect
      // "user landed here via receipt path" on remount, in tandem
      // with the sessionStorage rehydration above.
      setNav(`/location/${locationId}?booked=${bookRes.booking.id}`, { replace: true });
    } catch (err: any) {
      if (err?.message?.includes("hold") || err?.status === 410) {
        setBookingError("Your hold has expired. Please select a new time slot.");
        setHoldId(null);
        setHoldExpiresAt(null);
      } else {
        setBookingError(err?.message || "Failed to complete booking. Please try again.");
      }
    }
  };

  // Hoisted incompatibility flag — drives both the upfront warning
  // AND the gate that hides the booking flow steps.
  const locationIncompatibleClass = activeVehicleClass;
  const locationBays: any[] = Array.isArray((locData as any)?.washBays) ? (locData as any).washBays : [];
  const locationIncompatible = !!activeVehicle && !!locationIncompatibleClass
    && !locationBays.some((b: any) => Array.isArray(b.supportedClasses) && b.supportedClasses.includes(locationIncompatibleClass));
  const incompatibleVehicleLine = activeVehicle
    ? `${vehicleDisplayName(activeVehicle)}${inchesToFeet(activeVehicle.lengthInches) ? `, ${inchesToFeet(activeVehicle.lengthInches)}ft` : ""}${locationIncompatibleClass && SIZE_CLASS_LABEL[locationIncompatibleClass] ? ` ${SIZE_CLASS_LABEL[locationIncompatibleClass]}` : ""}`
    : "";

  // Receipt mode — single centered card, no header / footer / sidebar.
  if (bookingResult) {
    const resolvedServices = bookingResult.serviceIds && bookingResult.serviceIds.length > 0
      ? bookingResult.serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean)
      : selectedServices;
    const receiptTotalPrice = resolvedServices.reduce(
      (sum: number, s: any) => sum + ((s.allInPriceMinor ?? s.basePriceMinor) || 0),
      0,
    );
    const receiptTotalDuration = resolvedServices.reduce((sum: number, s: any) => sum + (s.durationMins || 0), 0);
    // Vehicle source: ALWAYS the snapshot persisted at booking creation
    // (or its sessionStorage rehydration). Never `activeVehicle` from
    // context — the receipt is a record of what was booked, not of the
    // driver's current selection.
    const receiptVehicle = bookingResult.vehicle ?? null;
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <BookingReceipt
          bookingResult={bookingResult}
          locData={locData}
          servicesList={resolvedServices}
          totalDuration={receiptTotalDuration}
          slotUtc={selectedSlot || bookingResult.slotUtc || null}
          vehicle={receiptVehicle}
          totalPrice={receiptTotalPrice}
          onDone={() => {
            if (receiptStorageKey) sessionStorage.removeItem(receiptStorageKey);
            // replace:true so Back from /bookings doesn't bounce the user
            // back to the receipt URL — they came from /search → form →
            // receipt → bookings, and Back should land on /search.
            setNav("/bookings", { replace: true });
          }}
        />
      </div>
    );
  }

  // ────────── Header bits used by the slim header ──────────
  const reviewCount: number = (locData as any).reviewCount ?? 0;
  const averageRating: number | null = (locData as any).averageRating ?? null;
  const isOpenNow: boolean = !!(locData as any).isOpenNow;
  const addressLine = [locData.addressLine1, locData.city, locData.stateCode].filter(Boolean).join(", ");

  const slots: any[] = Array.isArray((availabilityData as any)?.slots) ? (availabilityData as any).slots : [];
  const availableSlots = slots.filter((s: any) => s.available);
  const closedDayMessage = (availabilityData as any)?.message;

  const confirmDisabled =
    selectedServiceIds.length === 0
    || !selectedSlot
    || holdMutation.isPending
    || bookMutation.isPending
    || locationIncompatible;

  return (
    // No horizontal padding here — the AppLayout already adds p-4 md:p-8.
    // Doubling padding here was the regression that pushed the time grid
    // and sticky footer off the edge at 375px. pb-32 reserves room for
    // the fixed footer; max-w-3xl caps line length on tablet+.
    <div className="max-w-3xl mx-auto pb-32 lg:pb-12 space-y-6">
      <button onClick={() => setNav(backUrl)} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium pt-2">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </button>

      {/* Slim header — title with stars+review count beside it,
          single metadata line below. No Premium Facility card, no
          provider banner chip. Stars link to the reviews section. */}
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 leading-tight">{locData.name}</h1>
        </div>
        {(averageRating != null || reviewCount > 0) && (
          <button
            type="button"
            onClick={() => setReviewsOpen(true)}
            className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
            aria-label="Read reviews"
          >
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="font-semibold">{averageRating != null ? averageRating.toFixed(1) : "—"}</span>
            <span className="text-slate-500">({reviewCount} review{reviewCount === 1 ? "" : "s"})</span>
          </button>
        )}
        <p className="text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{addressLine}</span>
          </span>
          <span className="text-slate-300">·</span>
          {isOpenNow ? (
            <span className="text-emerald-600 font-medium">Open now</span>
          ) : (
            <span className="text-slate-400 font-medium">Closed</span>
          )}
          {etaMins != null && (
            <>
              <span className="text-slate-300">·</span>
              <span>{formatETA(etaMins)} away</span>
            </>
          )}
        </p>
      </header>

      <ActiveVehicleContextCard />

      {/* Defensive gate: there's already an upcoming booking at this
          location within 7 days. Surface it but don't block — driver
          may intentionally book another slot for a different vehicle
          or a different day. Hidden once the receipt is showing. */}
      {upcomingBookingAtThisLocation && !bookingResult && (
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 leading-tight">
                You have an upcoming wash here on{" "}
                {formatDate(upcomingBookingAtThisLocation.scheduledStartAtUtc, "MMM d", (locData as any)?.timezone)}
                {" at "}
                {formatDate(upcomingBookingAtThisLocation.scheduledStartAtUtc, "h:mm a", (locData as any)?.timezone)}
              </p>
              <button
                type="button"
                onClick={() => setNav(`/bookings/${upcomingBookingAtThisLocation.id}`)}
                className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
              >
                View booking <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Defense-in-depth: location can't host the active vehicle —
          stop the booking flow upfront with a clear explanation. */}
      {locationIncompatible && activeVehicle ? (
        <Card className="p-6 bg-amber-50 border-2 border-amber-200">
          <div className="flex flex-col items-center text-center max-w-lg mx-auto">
            <div className="h-12 w-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="text-base font-bold text-amber-900">This location can't host your active vehicle</h3>
            <p className="text-sm text-amber-800/90 mt-2">
              <span className="font-semibold">{incompatibleVehicleLine}</span> doesn't fit any bay at <span className="font-semibold">{locData?.name || "this location"}</span>.
            </p>
            <p className="text-sm text-amber-800/80 mt-2">
              Change your active vehicle in the pill above, or
              <button onClick={() => setNav("/search")} className="ml-1 font-semibold underline hover:no-underline">pick a different location</button>.
            </p>
          </div>
        </Card>
      ) : !vehicleLoading && !hasAnyVehicle ? (
        <Card className="p-6 text-center bg-amber-50 border-amber-200">
          <div className="h-12 w-12 mx-auto bg-amber-100 rounded-2xl flex items-center justify-center mb-3">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-base font-bold text-amber-900">Add a vehicle to book a wash</h3>
          <p className="text-sm text-amber-800/80 mt-1">Bay compatibility is determined by your vehicle's class.</p>
          <Button className="mt-4" onClick={() => setNav("/vehicles")}>Manage Vehicles</Button>
        </Card>
      ) : (
        <>
          {/* ────────── Service selection (multi-select) ────────── */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Select Services</h2>
            {services.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">No services available at this location.</Card>
            ) : (
              <div className="space-y-2">
                {services.map((svc: any) => {
                  const compatible = !activeVehicle || isVehicleCompatible(activeVehicle, svc);
                  const isSelected = selectedServiceIds.includes(svc.id);
                  const price = (svc.allInPriceMinor ?? svc.basePriceMinor);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      disabled={!compatible}
                      onClick={() => toggleService(svc.id)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                        !compatible
                          ? "opacity-60 cursor-not-allowed border-slate-200 bg-slate-50"
                          : isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-slate-200 bg-white hover:border-primary/40 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-slate-900 leading-tight">{svc.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{svc.durationMins} min</p>
                          {svc.description && (
                            <p className="text-sm text-slate-600 mt-2 leading-snug line-clamp-2">{svc.description}</p>
                          )}
                          {!compatible && activeVehicle && svc.maxVehicleClass && SIZE_CLASS_LABEL[svc.maxVehicleClass as keyof typeof SIZE_CLASS_LABEL] && (
                            <p className="text-xs text-amber-700 mt-2">Supports up to {SIZE_CLASS_LABEL[svc.maxVehicleClass as keyof typeof SIZE_CLASS_LABEL]} vehicles.</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="font-display font-bold text-lg text-slate-900">{formatCurrency(price)}</span>
                          {isSelected && (
                            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-4 w-4 text-white" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ────────── Day picker (horizontally scrollable) ────────── */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Pick a date</h2>
            {/* Bleed the strip to the layout's outer padding edges (–p-4
                at mobile, –p-8 at md+) so the first/last day don't visually
                hug the content gutter. The matching px-* puts the inner
                buttons back on the gutter. */}
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8 pb-2">
              {Array.from({ length: 14 }).map((_, offset) => {
                const d = addDays(new Date(), offset);
                const dStr = format(d, "yyyy-MM-dd");
                const isSel = dStr === selectedDate;
                return (
                  <button
                    key={dStr}
                    onClick={() => { setSelectedDate(dStr); setSelectedSlot(null); }}
                    className={`shrink-0 w-[52px] sm:w-[72px] py-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                      isSel
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-primary/40"
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{format(d, "EEE")}</span>
                    <span className="text-xl font-display font-bold leading-tight">{format(d, "d")}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ────────── Time grid ────────── */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-slate-900">Pick a time</h2>
              {totalDurationMins > 0 && (
                <p className="text-xs text-slate-500">{totalDurationMins} min total</p>
              )}
            </div>
            {selectedServiceIds.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">Select at least one service to see available times.</Card>
            ) : isLoadingSlots ? (
              <Card className="p-8 flex items-center justify-center">
                <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full" />
              </Card>
            ) : closedDayMessage ? (
              <Card className="p-6 text-center text-sm text-slate-500">{closedDayMessage}</Card>
            ) : availableSlots.length === 0 ? (
              <Card className="p-6 text-center bg-slate-50 border-dashed">
                <p className="text-sm text-slate-700 font-medium">
                  No slots available for {totalDurationMins} min on {format(new Date(selectedDate + "T12:00:00"), "MMM d")}.
                </p>
                <p className="text-xs text-slate-500 mt-1">Try fewer services or a different date.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                {availableSlots.map((slot: any) => (
                  <button
                    key={slot.startUtc}
                    onClick={() => setSelectedSlot(slot.startUtc)}
                    className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${
                      selectedSlot === slot.startUtc
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white border-slate-200 hover:border-primary/40 text-slate-700"
                    }`}
                  >
                    {slot.startTime}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ────────── Inline driver note ────────── */}
          {selectedServiceIds.length > 0 && (
            <section className="space-y-2">
              {!driverNoteOpen ? (
                <button
                  type="button"
                  onClick={() => setDriverNoteOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <StickyNote className="h-4 w-4" /> + Add a note for the provider
                </button>
              ) : (
                <Card className="p-4 border-amber-100 bg-amber-50/30">
                  <p className="text-xs text-amber-800 mb-2">Visible to the provider on this booking. Notes can't be edited once added.</p>
                  <textarea
                    value={driverNote}
                    onChange={(e) => setDriverNote(e.target.value.slice(0, 2000))}
                    autoFocus
                    rows={3}
                    placeholder="Anything the provider should know? E.g., extra dirty, specific bay preference."
                    className="w-full border border-amber-200 rounded-lg p-2 text-sm bg-white focus:border-amber-400 focus:outline-none resize-none"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[11px] text-slate-500">{driverNote.length}/2000</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setDriverNoteOpen(false); setDriverNote(""); }}
                    >
                      {driverNote.trim() ? "Clear" : "Cancel"}
                    </Button>
                  </div>
                </Card>
              )}
            </section>
          )}

          {bookingError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 font-medium">
              {bookingError}
            </div>
          )}

          {holdTimeLeft != null && holdTimeLeft > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Slot held for <span className="font-bold">{Math.floor(holdTimeLeft / 60)}:{String(holdTimeLeft % 60).padStart(2, "0")}</span>
            </div>
          )}
        </>
      )}

      {/* Reviews moved behind the star tap (Sheet at end of tree). The
          booking page is focus-only now — no scroll past the time grid. */}

      {/* ────────── Sticky footer ────────── */}
      {!locationIncompatible && hasAnyVehicle && (
        // Mobile: pinned to viewport edges (left:0, right:0) — full width.
        // lg+: float as a centered pill — needs `right-auto + w-full` to
        // CANCEL the inset-x-0 right:0, otherwise the box collapses to a
        // left-quarter strip.
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.15)] lg:left-1/2 lg:right-auto lg:w-full lg:max-w-3xl lg:-translate-x-1/2 lg:rounded-t-2xl"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        >
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 leading-tight">
                {selectedServiceIds.length} service{selectedServiceIds.length === 1 ? "" : "s"}
                {totalDurationMins > 0 ? <> · {totalDurationMins} min</> : null}
              </p>
              <p className="font-display font-bold text-lg text-slate-900 leading-tight">
                {formatCurrency(totalPriceMinor)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">
                Free cancellation up to 2 hours before your scheduled wash.
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
              onClick={handleConfirmTap}
              disabled={confirmDisabled}
              isLoading={holdMutation.isPending || bookMutation.isPending}
            >
              <CheckCircle2 className="h-5 w-5" />
              <span className="hidden sm:inline">Confirm Booking</span>
              <span className="sm:hidden">Confirm</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="px-4 sm:px-6 pb-2 text-[10px] text-slate-400 sm:hidden">
            Free cancellation up to 2 hours before your scheduled wash.
          </p>
        </div>
      )}

      {/* ────────── Reviews sheet ────────── */}
      {/* Bottom-sheet on every viewport — feels native on mobile and
          sits as a clean side-panel on desktop. Capped height so the
          inner list scrolls and the page underneath stays anchored. */}
      <Sheet
        open={reviewsOpen}
        onOpenChange={(o) => {
          setReviewsOpen(o);
          // When the sheet closes after being deep-linked open via
          // ?reviews=open, scrub the query param so a refresh doesn't
          // re-open. We replace history rather than push so Back still
          // exits the page entirely.
          if (!o && new URLSearchParams(window.location.search).get("reviews") === "open") {
            setNav(`/location/${locationId}`, { replace: true });
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="h-[85vh] sm:h-[80vh] sm:max-w-2xl sm:left-1/2 sm:-translate-x-1/2 sm:rounded-t-2xl flex flex-col p-0"
        >
          <SheetHeader className="px-6 pt-6 pb-3 border-b border-slate-100 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
              Customer Reviews
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            <LocationReviews locationId={locationId} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ────────── Short-notice modal ────────── */}
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
                  — that's in <span className="font-semibold text-slate-900">{shortNoticePending.minutes} minute{shortNoticePending.minutes === 1 ? "" : "s"}</span>. Make sure you can arrive on time. The bay will be reserved for you.
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
 * the success page IS the receipt now. */
function BookingReceipt({
  bookingResult,
  locData,
  servicesList,
  totalDuration,
  slotUtc,
  vehicle,
  totalPrice,
  onDone,
}: {
  bookingResult: { id: string; status: string };
  locData: any;
  servicesList: any[];
  totalDuration: number;
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

  const dateLine = slotUtc ? formatDate(slotUtc, "EEEE, MMM d, yyyy", tz) : "—";
  const timeLine = slotUtc ? renderTimeWithZone(slotUtc, tz) : "—";

  const vehicleClass = vehicle ? deriveSizeClassFromLengthInches(vehicle.lengthInches) : null;

  return (
    <Card className="bg-white border border-slate-200 shadow-sm">
      <div className="px-6 sm:px-8 py-10 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-[90px] h-[90px] rounded-full bg-emerald-50 flex items-center justify-center mb-5"
        >
          <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={2.2} />
        </motion.div>

        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
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
          <ReceiptRow label={servicesList.length > 1 ? "Services" : "Service"} value={
            servicesList.length === 0 ? <span className="text-slate-900 font-medium">—</span> : (
              <div className="space-y-1">
                {servicesList.map((s) => (
                  <div key={s.id} className="text-slate-900 font-medium">{s.name}</div>
                ))}
                {totalDuration > 0 && (
                  <div className="text-slate-500 text-xs">{totalDuration} min total</div>
                )}
              </div>
            )
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
    return formatted.replace(/\s+([A-Z]{2,5})$/, " ($1)");
  } catch {
    return formatDate(slotUtc, "h:mm a", timezone);
  }
}

/** Top-of-flow context card showing the driver's active vehicle.
 * Read-only — drivers swap the active vehicle via the global pill on
 * Find a Wash / Route Planner, not mid-booking. */
function ActiveVehicleContextCard() {
  const { activeVehicle, hasAnyVehicle, loading } = useActiveVehicle();
  if (loading || !hasAnyVehicle || !activeVehicle) return null;
  const bt = normalizeBodyType(activeVehicle.bodyType);
  const style = BODY_TYPE_STYLE[bt];
  const Icon = BODY_TYPE_ICON[bt];
  const cls = deriveSizeClassFromLengthInches(activeVehicle.lengthInches);
  const lengthFeet = inchesToFeet(activeVehicle.lengthInches);
  return (
    <Card className="relative p-0 overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.stripe}`} aria-hidden />
      <div className="px-4 pl-5 py-3 flex items-center gap-3">
        <div className={`h-10 w-10 ${style.chipBg} rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${style.chipFg}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Booking for</p>
          <p className="font-bold text-slate-900 truncate">
            {vehicleDisplayName(activeVehicle)}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {BODY_TYPE_LABEL[bt]}{cls ? ` · ${SIZE_CLASS_LABEL[cls]}` : ""}{lengthFeet ? ` · ${lengthFeet} ft` : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
