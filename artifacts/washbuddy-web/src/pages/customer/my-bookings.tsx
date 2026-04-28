import React, { useState, useMemo, useEffect } from "react";
import { useListBookings, useCancelBooking } from "@workspace/api-client-react";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { formatLocationDisplay } from "@/lib/format-location";
import { customerFacingCancellationLabel } from "@/lib/cancellationReasons";
import { Link, useLocation } from "wouter";
import { Calendar, MapPin, Truck, Search, Star, XCircle, AlertTriangle, X } from "lucide-react";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveVehicle, type ActiveVehicleRow } from "@/contexts/activeVehicle";
import { BODY_TYPE_ICON, BODY_TYPE_STYLE, normalizeBodyType, vehicleDisplayName } from "@/lib/vehicleBodyType";

type TabKey = "upcoming" | "progress" | "completed" | "cancelled";

const UPCOMING_STATUSES = ["REQUESTED", "PROVIDER_CONFIRMED", "HELD"];
const PROGRESS_STATUSES = ["CHECKED_IN", "IN_SERVICE"];
const COMPLETED_STATUSES = ["COMPLETED_PENDING_WINDOW", "COMPLETED", "SETTLED"];
const CANCELLED_STATUSES = ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "PROVIDER_DECLINED", "EXPIRED"];
const CANCELLABLE_STATUSES = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED"];

// Parse a TabKey from a raw URL value, falling back to "upcoming".
// Centralised so both the initial state and the back-nav effect read
// the same logic.
function parseTabFromQuery(search: string): TabKey {
  const t = new URLSearchParams(search).get("tab");
  if (t === "progress" || t === "completed" || t === "cancelled") return t;
  return "upcoming";
}

export default function MyBookings() {
  const [wouterPath, setNav] = useLocation();
  const queryClient = useQueryClient();
  // Active tab is URL-driven (?tab=cancelled etc) so it survives a
  // round-trip to /bookings/:id and back. Local useState alone lost
  // context on every back-nav. The initial value reads from
  // window.location.search at mount; subsequent tab clicks update the
  // URL via setNav(..., {replace:true}) so we don't pollute history
  // with one entry per tab toggle.
  const [activeTab, setActiveTab] = useState<TabKey>(() => parseTabFromQuery(window.location.search));
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string; date: string } | null>(null);

  // ?vehicleId=… deep-link from the My Vehicles delete-flow filters this
  // page to a single vehicle. Read at render time so wouter navigations
  // refresh the filter without a manual reload.
  const urlParams = new URLSearchParams(window.location.search);
  const filterVehicleId = urlParams.get("vehicleId") || null;

  // Resync activeTab when the URL changes (browser back/forward navigates
  // between /bookings?tab=cancelled and /bookings — wouter only signals
  // the path here, but tab changes are query-only, so we listen to
  // popstate explicitly).
  useEffect(() => {
    const onPop = () => setActiveTab(parseTabFromQuery(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleTabChange = (next: TabKey) => {
    setActiveTab(next);
    // Build the URL with tab + preserved vehicleId filter (if present)
    // so swapping tabs while filtered by vehicle doesn't drop the
    // filter context. replace:true to keep history clean.
    const params = new URLSearchParams();
    if (next !== "upcoming") params.set("tab", next);
    if (filterVehicleId) params.set("vehicleId", filterVehicleId);
    const qs = params.toString();
    setNav(qs ? `/bookings?${qs}` : "/bookings", { replace: true });
  };

  const { allVehicles } = useActiveVehicle();

  const { data, isLoading, isError, refetch } = useListBookings(
    { limit: 100 },
    { request: { credentials: "include" } },
  );
  const cancelMutation = useCancelBooking({ request: { credentials: "include" } });

  const bookings = data?.bookings || [];
  const filteredBookings = filterVehicleId
    ? bookings.filter((b: any) => b.vehicle?.id === filterVehicleId || b.vehicleId === filterVehicleId)
    : bookings;

  const grouped = useMemo(() => ({
    upcoming: filteredBookings.filter((b: any) => UPCOMING_STATUSES.includes(b.status)),
    progress: filteredBookings.filter((b: any) => PROGRESS_STATUSES.includes(b.status)),
    completed: filteredBookings.filter((b: any) => COMPLETED_STATUSES.includes(b.status)),
    cancelled: filteredBookings.filter((b: any) => CANCELLED_STATUSES.includes(b.status)),
  }), [filteredBookings]);

  const currentBookings = grouped[activeTab];

  // Distinct vehicles represented in the current tab's bookings. Drives
  // segmentation when the user has 2+ vehicles. Bookings without a
  // vehicle (legacy / fleet-placeholder) get grouped under a sentinel.
  const segmentByVehicle = useMemo(() => {
    if (filterVehicleId) return null; // already filtered to one
    const ownEligibleCount = allVehicles.filter((v) => v.isEligibleForDefault).length;
    if (ownEligibleCount < 2) return null;
    const buckets = new Map<string, { vehicle: ActiveVehicleRow | null; bookings: any[] }>();
    for (const b of currentBookings) {
      const id = b.vehicle?.id || b.vehicleId || "__no_vehicle__";
      if (!buckets.has(id)) {
        const vehicle = allVehicles.find((v) => v.id === id) || null;
        buckets.set(id, { vehicle, bookings: [] });
      }
      buckets.get(id)!.bookings.push(b);
    }
    return Array.from(buckets.values());
  }, [currentBookings, allVehicles, filterVehicleId]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelMutation.mutateAsync({
        bookingId: cancelTarget.id,
        data: { reasonCode: "CUSTOMER_REQUESTED" },
      });
      toast.success("Booking cancelled");
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel booking");
    }
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: grouped.upcoming.length },
    { key: "progress", label: "In Progress", count: grouped.progress.length },
    { key: "completed", label: "Completed", count: grouped.completed.length },
    { key: "cancelled", label: "Cancelled", count: grouped.cancelled.length },
  ];

  const emptyMessages: Record<TabKey, { text: string; cta?: { label: string; href: string } }> = {
    upcoming: { text: "No upcoming bookings", cta: { label: "Find a Wash", href: "/search" } },
    progress: { text: "No washes in progress" },
    completed: { text: "No completed washes yet" },
    cancelled: { text: "No cancelled bookings" },
  };

  return (
    <div className="space-y-8">
      <Toaster position="top-right" richColors />

      {/* Cancel confirmation dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCancelTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Cancel Booking</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to cancel your booking for <span className="font-semibold">{cancelTarget.name}</span> on <span className="font-semibold">{cancelTarget.date}</span>?
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelTarget(null)}>
                Keep Booking
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancel}
                isLoading={cancelMutation.isPending}
              >
                Cancel Booking
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">My Bookings</h1>
        <p className="text-slate-500 mt-2">Track and manage your wash bookings.</p>
      </div>

      {filterVehicleId && (() => {
        const v = allVehicles.find((x) => x.id === filterVehicleId);
        return (
          <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl">
            <span className="text-sm text-slate-700">
              Showing bookings for <span className="font-semibold">{v ? vehicleDisplayName(v) : "selected vehicle"}</span>
            </span>
            <button
              type="button"
              onClick={() => setNav("/bookings")}
              className="ml-auto text-sm font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <X className="h-4 w-4" /> Clear filter
            </button>
          </div>
        );
      })()}

      {/* Tab navigation. Compact at mobile (px-3 + content-width tabs)
          so all 4 fit at 320-414px without forcing a horizontal page
          scroll. The strip itself scrolls internally if a future
          translation expands the labels. The prior `flex-1 min-w-[100px]`
          forced 4 × 100 = 400px minimum, which exceeded 343px content
          area at 375px and pushed the page sideways. */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`shrink-0 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-500"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState message="Could not load your bookings." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
      ) : currentBookings.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">{emptyMessages[activeTab].text}</h3>
          {emptyMessages[activeTab].cta && (
            <Link href={emptyMessages[activeTab].cta!.href}>
              <Button variant="outline" className="mt-4 gap-2">
                <Search className="h-4 w-4" /> {emptyMessages[activeTab].cta!.label}
              </Button>
            </Link>
          )}
        </div>
      ) : segmentByVehicle ? (
        <div className="space-y-8">
          {segmentByVehicle.map((group, gIdx) => (
            <div key={gIdx} className="space-y-4">
              <VehicleSectionHeader vehicle={group.vehicle} count={group.bookings.length} />
              <div className="grid grid-cols-1 gap-4">
                {group.bookings.map((booking: any, idx: number) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    idx={idx}
                    activeTab={activeTab}
                    onOpen={() => setNav(`/bookings/${booking.id}`)}
                    onCancel={(b) => setCancelTarget({
                      id: b.id,
                      name: b.serviceNameSnapshot,
                      date: formatDate(b.scheduledStartAtUtc, "MMM d, yyyy", b.locationTimezone) || "",
                    })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {currentBookings.map((booking: any, idx: number) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              idx={idx}
              activeTab={activeTab}
              onOpen={() => setNav(`/bookings/${booking.id}`)}
              onCancel={(b) => setCancelTarget({
                id: b.id,
                name: b.serviceNameSnapshot,
                date: formatDate(b.scheduledStartAtUtc, "MMM d, yyyy", b.locationTimezone) || "",
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleSectionHeader({ vehicle, count }: { vehicle: ActiveVehicleRow | null; count: number }) {
  if (!vehicle) {
    return (
      <div className="flex items-center gap-3 px-1">
        <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center"><Truck className="h-4 w-4 text-slate-400" /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">No assigned vehicle</h3>
          <p className="text-xs text-slate-500">{count} booking{count === 1 ? "" : "s"}</p>
        </div>
      </div>
    );
  }
  const bt = normalizeBodyType(vehicle.bodyType);
  const style = BODY_TYPE_STYLE[bt];
  const Icon = BODY_TYPE_ICON[bt];
  return (
    <div className="flex items-center gap-3 px-1">
      <div className={`h-8 w-8 ${style.chipBg} rounded-lg flex items-center justify-center`}>
        <Icon className={`h-4 w-4 ${style.chipFg}`} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{vehicleDisplayName(vehicle)}</h3>
        <p className="text-xs text-slate-500">{count} booking{count === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}

function BookingRow({
  booking,
  idx,
  activeTab,
  onOpen,
  onCancel,
}: {
  booking: any;
  idx: number;
  activeTab: TabKey;
  onOpen: () => void;
  onCancel: (b: any) => void;
}) {
  const bt = booking.vehicle?.bodyType ? normalizeBodyType(booking.vehicle.bodyType) : null;
  const stripe = bt ? BODY_TYPE_STYLE[bt].stripe : null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
      <Card className="relative flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-center justify-between group cursor-pointer hover:border-primary/40 border-2 overflow-hidden">
        {stripe && <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} aria-hidden />}
        <div className="flex-1 p-6 pl-7 space-y-3 w-full" onClick={onOpen}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={getStatusColor(booking.status)}>{getStatusLabel(booking.status)}</Badge>
            <span className="text-sm font-bold text-slate-400">ID: {booking.id.split("-")[0].toUpperCase()}</span>
          </div>
          {/* Cancelled-card meta: actor (Customer/Provider) + reason
              category. Only renders when the booking is cancelled. The
              reason line is suppressed for CUSTOMER_CANCELLED bookings
              and for unknown/legacy reason codes — both produce no
              customer-facing string from customerFacingCancellationLabel. */}
          {(booking.status === "CUSTOMER_CANCELLED" || booking.status === "PROVIDER_CANCELLED") && (
            <div className="space-y-0.5">
              <p className="text-xs text-slate-500">
                Cancelled by <span className="font-semibold text-slate-700">{booking.status === "PROVIDER_CANCELLED" ? "Provider" : "Customer"}</span>
              </p>
              {booking.status === "PROVIDER_CANCELLED" && (() => {
                const label = customerFacingCancellationLabel((booking as any).cancellationReasonCode);
                if (!label) return null;
                return <p className="text-xs text-slate-500">Reason: <span className="font-medium text-slate-700">{label}</span></p>;
              })()}
              {/* Provider's optional message — single truncated line on
                  the card; the user taps through to booking-detail to
                  read the full message wrapped. Hidden when the note
                  is absent or the visibility flag was explicitly set
                  to false (default true per 2g-1.5). */}
              {booking.status === "PROVIDER_CANCELLED"
                && (booking as any).cancellationNoteVisibleToCustomer !== false
                && typeof (booking as any).cancellationNote === "string"
                && (booking as any).cancellationNote.trim().length > 0 && (
                <p className="text-xs text-slate-500 truncate italic">
                  “{(booking as any).cancellationNote}”
                </p>
              )}
            </div>
          )}
          <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">
            {booking.serviceNameSnapshot}
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-slate-400" />
              {formatDate(booking.scheduledStartAtUtc, "EEE, MMM d · h:mm a", booking.locationTimezone)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" />
              {formatLocationDisplay(booking.location?.provider?.name, booking.location?.name)}
            </span>
            {booking.vehicle && (
              <span className="flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-slate-400" />
                {booking.vehicle.nickname?.trim() || `Unit ${booking.vehicle.unitNumber}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-row md:flex-col items-center md:items-end gap-3 px-6 pb-6 md:p-6 md:pl-0 shrink-0 w-full md:w-auto">
          <div className="text-2xl font-display font-bold text-slate-900">
            {formatCurrency(booking.totalPriceMinor, booking.currencyCode)}
          </div>
          {activeTab === "upcoming" && CANCELLABLE_STATUSES.includes(booking.status) && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1"
              onClick={(e) => { e.stopPropagation(); onCancel(booking); }}
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {activeTab === "completed" && COMPLETED_STATUSES.includes(booking.status) && (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300 gap-1"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
            >
              <Star className="h-3.5 w-3.5" /> Leave Review
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
