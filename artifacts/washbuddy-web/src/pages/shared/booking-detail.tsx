import React, { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetBooking, useConfirmBooking, useCheckinBooking, useStartService, useCompleteBooking, useCancelBooking } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Card, Badge, Button } from "@/components/ui";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { MapPin, Calendar, Truck, User, CreditCard, ChevronRight, CheckCircle2, Star, ArrowLeft, Shield, AlertTriangle, X, StickyNote, Package, Navigation } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ReviewForm } from "@/components/review-form";
import { toast, Toaster } from "sonner";
import { BODY_TYPE_ICON, BODY_TYPE_LABEL, BODY_TYPE_STYLE, normalizeBodyType, vehicleDisplayName } from "@/lib/vehicleBodyType";
import { groupNotesByAuthorRole, noteSectionLabel, noteMetaLine, type NoteViewerRole } from "@/lib/noteLabels";
import { NoteEditor, NoteKebabMenu } from "@/components/note-actions-menu";
import { AddNoteForm } from "@/components/add-note-form";

const API_BASE = import.meta.env.VITE_API_URL || "";

const ALL_STATUSES = ["REQUESTED","HELD","PROVIDER_CONFIRMED","PROVIDER_DECLINED","EXPIRED","CUSTOMER_CANCELLED","PROVIDER_CANCELLED","LATE","NO_SHOW","CHECKED_IN","IN_SERVICE","COMPLETED_PENDING_WINDOW","COMPLETED","DISPUTED","REFUNDED","SETTLED"];

/** Drivers can attach notes to a booking until it's wrapped up. After
 * COMPLETED / SETTLED / cancelled, the booking is in archive mode and
 * notes don't make sense to add. */
function isActiveBooking(status: string): boolean {
  return ["REQUESTED","HELD","PROVIDER_CONFIRMED","CHECKED_IN","IN_SERVICE","LATE","COMPLETED_PENDING_WINDOW"].includes(status);
}

export default function BookingDetail() {
  const [, params] = useRoute("/bookings/:id");
  const [, setNav] = useLocation();
  const bookingId = params?.id || "";
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useGetBooking(bookingId, { 
    query: { enabled: !!bookingId },
    request: { credentials: 'include' }
  });

  // Mutations
  // `reviewSubmitted` mirrors the per-booking server truth (b.hasReview)
  // and flips when the inline form succeeds. Two failure modes the prior
  // shape had: (a) wouter re-uses BookingDetail when /bookings/:id changes
  // — the same true value leaked across bookings; (b) a fresh tab on a
  // booking the user already reviewed showed the form because we hydrated
  // from `false`. The effect below resyncs from the server on every
  // booking/data change.
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  useEffect(() => {
    setReviewSubmitted(!!(data?.booking as any)?.hasReview);
  }, [bookingId, (data?.booking as any)?.hasReview]);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const confirmMut = useConfirmBooking({ request: { credentials: 'include' } });
  const checkinMut = useCheckinBooking({ request: { credentials: 'include' } });
  const startMut = useStartService({ request: { credentials: 'include' } });
  const completeMut = useCompleteBooking({ request: { credentials: 'include' } });
  const cancelMut = useCancelBooking({ request: { credentials: 'include' } });

  const handleAction = async (action: any) => {
    try {
      if (action === "confirm") await confirmMut.mutateAsync({ bookingId });
      if (action === "checkin") await checkinMut.mutateAsync({ bookingId });
      if (action === "start") await startMut.mutateAsync({ bookingId });
      if (action === "complete") await completeMut.mutateAsync({ bookingId });
      if (action === "cancel") await cancelMut.mutateAsync({ bookingId, data: { reasonCode: "USER_REQUESTED" } });
      
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
    } catch (e) {
      alert("Action failed. Please try again.");
    }
  };

  const isAdmin = hasRole("PLATFORM_SUPER_ADMIN");

  const handleForceCancel = async () => {
    if (!confirm("Force cancel this booking? This is an admin override action.")) return;
    setAdminActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/force-cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      toast.success("Booking force-cancelled");
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
    } catch (err: any) { toast.error(err.message); }
    finally { setAdminActionLoading(false); }
  };

  const handleOverrideStatus = async () => {
    if (!overrideStatus || !overrideReason.trim()) return;
    setAdminActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/override-status`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: overrideStatus, reason: overrideReason }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      toast.success("Status overridden to " + overrideStatus);
      setShowOverrideDialog(false);
      setOverrideStatus("");
      setOverrideReason("");
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
    } catch (err: any) { toast.error(err.message); }
    finally { setAdminActionLoading(false); }
  };

  const b = data?.booking;
  if (isLoading) return <div className="p-12 text-center text-slate-500">Loading details...</div>;
  if (!b) return <div className="p-12 text-center text-red-500">Booking not found.</div>;

  const isCustomer = user?.id === b.customerId;
  const isProvider = hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF");
  // Same-org check: a provider-side viewer is allowed to edit/delete
  // PROVIDER-authored notes only when their provider role's scopeId
  // matches this booking's location.providerId. Belt-and-braces — the
  // server enforces too. PLATFORM_SUPER_ADMIN can mutate anywhere.
  const viewerProviderId: string | null = b.location?.providerId ?? null;
  const isSameOrgProvider = (() => {
    if (hasRole("PLATFORM_SUPER_ADMIN")) return true;
    if (!isProvider || !viewerProviderId) return false;
    const roles = (user as any)?.roles || [];
    return roles.some((r: any) =>
      (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") &&
      r.scopeId === viewerProviderId,
    );
  })();
  const activeStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "CHECKED_IN", "IN_SERVICE", "LATE"];
  const isCompleted = b.status === "COMPLETED" || b.status === "COMPLETED_PENDING_WINDOW" || b.status === "SETTLED";
  // Walk-in bookings created by a provider have customerId pointing at the
  // provider's own user row, so isCustomer alone is true for the provider —
  // we'd then surface "Rate Your Experience" to the staff member who ran
  // the wash, which is wrong. Reviews are a driver-side affordance only,
  // so explicitly exclude provider and platform-admin roles.
  const showReviewForm = isCustomer && !isProvider && !isAdmin && isCompleted && !reviewSubmitted;

  // Role-based fallback when there's no in-app history (deep-link, fresh
  // tab). When there *is* history we just pop it, which gets users back to
  // wherever they came from (Bay Timeline, Daily Board, My Bookings, ...).
  const fallbackPath = hasRole("PLATFORM_SUPER_ADMIN") ? "/admin/bookings"
    : (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) ? "/provider/daily-board"
    : (hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST")) ? "/fleet"
    : "/bookings";
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setNav(fallbackPath);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Toaster position="top-right" richColors />
      <button onClick={goBack} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header — provider view leads with customer name + scheduled
          time; that's what the operator actually needs to see. Customers
          and admins fall back to the older "service-name-as-headline"
          framing because they care about what was booked, not who. */}
      {isProvider ? (
        <ProviderHeader
          booking={b}
          isAdmin={isAdmin}
          onAction={handleAction}
          confirmPending={confirmMut.isPending}
          checkinPending={checkinMut.isPending}
          startPending={startMut.isPending}
          completePending={completeMut.isPending}
          cancelPending={cancelMut.isPending}
          adminActionLoading={adminActionLoading}
          activeStatuses={activeStatuses}
          onForceCancel={handleForceCancel}
          onOverride={() => setShowOverrideDialog(true)}
        />
      ) : (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
            <h1 className="text-4xl font-display font-bold text-slate-900 mt-4 mb-2">{b.serviceNameSnapshot}</h1>
            <p className="text-slate-500 font-mono text-sm">ID: {b.id}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {(isCustomer) && ["REQUESTED", "HELD", "PROVIDER_CONFIRMED"].includes(b.status) && (
              <Button variant="outline" onClick={() => handleAction("cancel")} isLoading={cancelMut.isPending}>
                Cancel Booking
              </Button>
            )}
            {isAdmin && activeStatuses.includes(b.status) && (
              <Button variant="destructive" onClick={handleForceCancel} isLoading={adminActionLoading} className="gap-1">
                <Shield className="h-4 w-4" /> Force Cancel
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setShowOverrideDialog(true)} className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50">
                <AlertTriangle className="h-4 w-4" /> Override Status
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Override Status Dialog */}
      {showOverrideDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowOverrideDialog(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Override Status</h3>
              <button onClick={() => setShowOverrideDialog(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Manually set the booking status. This creates an audit record.</p>
            <div className="space-y-3 mb-4">
              <select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}
                className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Select status...</option>
                {ALL_STATUSES.filter((s) => s !== b.status).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              <textarea className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-amber-300 focus:outline-none"
                placeholder="Reason for override (required)..." rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowOverrideDialog(false)}>Cancel</Button>
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={handleOverrideStatus}
                isLoading={adminActionLoading} disabled={!overrideStatus || !overrideReason.trim()}>Override</Button>
            </div>
          </div>
        </div>
      )}

      {showReviewForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-400/20 via-blue-400/20 to-amber-400/20 rounded-3xl blur-sm" />
            <div className="relative">
              <ReviewForm
                bookingId={b.id}
                serviceName={b.serviceNameSnapshot}
                onSuccess={() => setReviewSubmitted(true)}
              />
            </div>
          </div>
        </motion.div>
      )}

      {reviewSubmitted && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-6 border-2 border-emerald-100 bg-emerald-50/30 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-900">Thank you for your review!</p>
            <p className="text-sm text-slate-500 mt-1">Your feedback helps other customers and hold providers accountable.</p>
          </Card>
        </motion.div>
      )}

      {isProvider ? (
        <ProviderBody
          booking={b}
          canEditProviderNotes={isSameOrgProvider}
          canAddNote={isSameOrgProvider}
          onNoteChanged={() => queryClient.invalidateQueries({ queryKey: [`/api/bookings/${b.id}`] })}
        />
      ) : (
        <CustomerBody
          booking={b}
          canAddNote={isCustomer && isActiveBooking(b.status)}
          onNoteAdded={() => queryClient.invalidateQueries({ queryKey: [`/api/bookings/${b.id}`] })}
        />
      )}

    </div>
  );
}

/** Provider header — leads with the customer's name (the operator
 * already knows everything else). Booking ID and status badge sit
 * subordinate; action buttons cluster on the right; scheduled time is
 * called out below. */
function ProviderHeader({
  booking: b,
  isAdmin,
  onAction,
  confirmPending,
  checkinPending,
  startPending,
  completePending,
  cancelPending,
  adminActionLoading,
  activeStatuses,
  onForceCancel,
  onOverride,
}: {
  booking: any;
  isAdmin: boolean;
  onAction: (a: string) => void;
  confirmPending: boolean;
  checkinPending: boolean;
  startPending: boolean;
  completePending: boolean;
  cancelPending: boolean;
  adminActionLoading: boolean;
  activeStatuses: string[];
  onForceCancel: () => void;
  onOverride: () => void;
}) {
  const customerName = b.isOffPlatform
    ? (b.offPlatformClientName || "Walk-in")
    : `${b.customer?.firstName || ""} ${b.customer?.lastName || ""}`.trim() || "—";
  const contactInfo = b.isOffPlatform
    ? (b.offPlatformClientPhone || b.offPlatformClientEmail || null)
    : (b.customer?.email || null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
            <span className="text-xs font-mono text-slate-400">#{b.id.split("-")[0].toUpperCase()}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 truncate">{customerName}</h1>
          {contactInfo && (
            <p className="text-sm text-slate-500 mt-1">{contactInfo}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {["REQUESTED", "HELD", "PROVIDER_CONFIRMED"].includes(b.status) && (
            <Button variant="outline" onClick={() => onAction("cancel")} isLoading={cancelPending}>
              Cancel Booking
            </Button>
          )}
          {b.status === "REQUESTED" && (
            <Button onClick={() => onAction("confirm")} isLoading={confirmPending} className="bg-blue-600 hover:bg-blue-700">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Job
            </Button>
          )}
          {b.status === "PROVIDER_CONFIRMED" && (
            <Button onClick={() => onAction("checkin")} isLoading={checkinPending} className="bg-indigo-600 hover:bg-indigo-700">
              Mark Checked In
            </Button>
          )}
          {b.status === "CHECKED_IN" && (
            <Button onClick={() => onAction("start")} isLoading={startPending} className="bg-purple-600 hover:bg-purple-700">
              Start Wash
            </Button>
          )}
          {b.status === "IN_SERVICE" && (
            <Button onClick={() => onAction("complete")} isLoading={completePending} className="bg-emerald-600 hover:bg-emerald-700">
              Complete Wash
            </Button>
          )}
          {isAdmin && activeStatuses.includes(b.status) && (
            <Button variant="destructive" onClick={onForceCancel} isLoading={adminActionLoading} className="gap-1">
              <Shield className="h-4 w-4" /> Force Cancel
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={onOverride} className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50">
              <AlertTriangle className="h-4 w-4" /> Override Status
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Calendar className="h-4 w-4 text-slate-400" />
        <span className="font-medium text-slate-900">{formatDate(b.scheduledStartAtUtc, "EEEE, MMM d • h:mm a", b.locationTimezone)}</span>
        <span className="text-slate-400">→ {formatDate(b.scheduledEndAtUtc, "h:mm a", b.locationTimezone)}</span>
      </div>
    </div>
  );
}

/** Provider body — services + add-ons + customer notes lead.
 * Vehicle / bay / total are tucked into a small footer card; status
 * history collapses behind a disclosure. */
function ProviderBody({ booking: b, canEditProviderNotes, canAddNote, onNoteChanged }: { booking: any; canEditProviderNotes: boolean; canAddNote: boolean; onNoteChanged: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const notes: any[] = Array.isArray(b.washNotes) ? b.washNotes : [];
  const addOns: any[] = Array.isArray(b.addOns) ? b.addOns : [];
  const bt = b.vehicle?.bodyType ? normalizeBodyType(b.vehicle.bodyType) : null;
  const style = bt ? BODY_TYPE_STYLE[bt] : null;
  const Icon = bt ? BODY_TYPE_ICON[bt] : Truck;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Service order: what they're getting */}
      <Card className="p-6 md:p-8">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Service order</h2>
        <div className="space-y-3 mb-6">
          {(b.serviceNameSnapshot || "—").split(",").map((name: string, i: number) => (
            <div key={i} className="flex items-baseline justify-between gap-4 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
              <div>
                <p className="font-semibold text-slate-900 text-lg">{name.trim()}</p>
                {b.service?.durationMins && i === 0 && (
                  <p className="text-sm text-slate-500 mt-0.5">{b.service.durationMins} min</p>
                )}
              </div>
              {i === 0 && (
                <p className="font-medium text-slate-900 text-lg shrink-0">
                  {formatCurrency(b.serviceBasePriceMinor || b.totalPriceMinor, b.currencyCode)}
                </p>
              )}
            </div>
          ))}
        </div>

        {addOns.length > 0 && (
          <div className="mt-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Add-ons</h3>
            <ul className="space-y-2">
              {addOns.map((a: any) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-slate-700">{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</span>
                  <span className="font-medium text-slate-900">{formatCurrency(a.totalMinor ?? a.priceMinor * (a.quantity ?? 1))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {notes.length > 0 && (
        <NoteSections viewer="PROVIDER" notes={notes} canEditProviderNotes={canEditProviderNotes} onNoteChanged={onNoteChanged} />
      )}

      {/* Provider add-note. Renders even when there are zero notes
          yet, so the operator has an explicit on-ramp; otherwise a
          provider would be stuck unable to attach context to a
          booking with no prior notes. */}
      {canAddNote && (
        <div className="px-1">
          <AddNoteForm bookingId={b.id} onSubmitted={onNoteChanged} viewerRole="PROVIDER" />
        </div>
      )}

      {/* Footer: vehicle / bay / total — operator already knows their
          facility, so this is reference, not focal. */}
      <Card className="p-5 md:p-6 bg-slate-50 border-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Vehicle</p>
            <div className="flex items-center gap-2 min-w-0">
              {bt && style && (
                <div className={`h-7 w-7 ${style.chipBg} rounded-md flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${style.chipFg}`} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {b.vehicle ? vehicleDisplayName(b.vehicle) : (b.fleetPlaceholderClass || "—")}
                </p>
                {b.vehicle?.lengthInches && (
                  <p className="text-xs text-slate-500">
                    {Math.round(b.vehicle.lengthInches / 12)} ft
                    {bt && BODY_TYPE_LABEL[bt] ? ` · ${BODY_TYPE_LABEL[bt]}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Bay</p>
            <p className="text-sm font-semibold text-slate-900">{b.washBay?.name || "Unassigned"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Source</p>
            <p className="text-sm font-semibold text-slate-900">
              {b.bookingSource === "WALK_IN" ? "Walk-in" : b.bookingSource === "DIRECT" ? "Direct" : "WashBuddy"}
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Total</p>
            <p className="text-lg font-display font-bold text-slate-900">
              {formatCurrency(b.totalPriceMinor, b.currencyCode)}
            </p>
          </div>
        </div>
        {/* "Booked by" line — same rule as Daily Board: only shown for
            off-platform / walk-in / direct bookings, where the customer
            primary doesn't already attribute who entered the booking. */}
        {(b.isOffPlatform || b.bookingSource === "WALK_IN" || b.bookingSource === "DIRECT") && b.assignedOperator && (
          <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">
            Booked by {[b.assignedOperator.firstName, b.assignedOperator.lastName].filter(Boolean).join(" ") || "operator"}
            {" · "}{b.bookingSource === "WALK_IN" ? "Walk-in" : b.bookingSource === "DIRECT" ? "Direct" : "Off-platform"}
          </p>
        )}
      </Card>

      {Array.isArray(b.statusHistory) && b.statusHistory.length > 0 && (
        <details className="group" open={historyOpen} onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronRight className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-90" : ""}`} />
            Status history
          </summary>
          <div className="mt-3 ml-5 pl-5 border-l border-slate-200 space-y-3">
            {b.statusHistory.map((event: any) => (
              <div key={event.id} className="text-sm">
                <p className="font-semibold text-slate-900">{getStatusLabel(event.toStatus)}</p>
                <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                {event.reason && <p className="text-xs text-slate-600 mt-0.5">{event.reason}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Customer body — keeps the prior service-led summary; the customer
 * cares about what they booked and where. */
function CustomerBody({ booking: b, canAddNote, onNoteAdded }: { booking: any; canAddNote: boolean; onNoteAdded: () => void }) {
  const notes: any[] = Array.isArray(b.washNotes) ? b.washNotes : [];
  const addOns: any[] = Array.isArray(b.addOns) ? b.addOns : [];
  const bt = b.vehicle?.bodyType ? normalizeBodyType(b.vehicle.bodyType) : null;
  const style = bt ? BODY_TYPE_STYLE[bt] : null;
  const Icon = bt ? BODY_TYPE_ICON[bt] : Truck;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <Card className="p-6 md:p-8 space-y-6">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Details</h2>

        <div className="flex gap-4 items-start">
          <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><Calendar className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Schedule</p>
            <p className="font-bold text-slate-900">{formatDate(b.scheduledStartAtUtc, "MMM d, yyyy • h:mm a", b.locationTimezone)}</p>
            <p className="text-sm text-slate-500">to {formatDate(b.scheduledEndAtUtc, "h:mm a", b.locationTimezone)}</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><MapPin className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Location</p>
            <p className="font-bold text-slate-900">{b.location?.name}</p>
            <p className="text-sm text-slate-500">{b.location?.provider?.name}</p>
            {(() => {
              // Build the full street address for both display and the
              // Google Maps deep link. Skip the link when we don't have
              // an address — better than a button that opens an empty map.
              const parts = [b.location?.addressLine1, b.location?.city, b.location?.stateCode, b.location?.postalCode]
                .filter((p) => typeof p === "string" && p.trim().length > 0);
              const fullAddress = parts.join(", ");
              if (!fullAddress) return null;
              const dest = encodeURIComponent(fullAddress);
              // Universal Google Maps directions URL: prompts "Open in
              // Maps" on iOS, opens Google Maps app on Android, opens a
              // browser tab on desktop.
              const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
              return (
                <>
                  <p className="text-sm text-slate-500 mt-0.5 break-words">{fullAddress}</p>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-primary hover:underline"
                  >
                    <Navigation className="h-3.5 w-3.5" /> Get Directions →
                  </a>
                </>
              );
            })()}
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className={`p-3 rounded-xl ${style ? style.chipBg : "bg-slate-100"} ${style ? style.chipFg : "text-slate-500"}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle</p>
            <p className="font-bold text-slate-900">{b.vehicle ? vehicleDisplayName(b.vehicle) : "Not specified"}</p>
            <p className="text-sm text-slate-500">
              {bt ? BODY_TYPE_LABEL[bt] : (b.vehicle?.categoryCode || "")}
            </p>
          </div>
        </div>

        {notes.length > 0 && (
          <CustomerNotesBlock notes={notes} />
        )}

        {canAddNote && (
          <div className="flex gap-4 items-start">
            <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><StickyNote className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <AddNoteForm bookingId={b.id} onSubmitted={onNoteAdded} />
            </div>
          </div>
        )}

        {addOns.length > 0 && (
          <div className="flex gap-4 items-start">
            <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><Package className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Add-ons</p>
              <ul className="text-sm space-y-1">
                {addOns.map((a: any) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span className="text-slate-700">{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</span>
                    <span className="font-medium text-slate-900">{formatCurrency(a.totalMinor ?? a.priceMinor * (a.quantity ?? 1))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-8">
        <Card className="p-6 md:p-8 bg-slate-900 text-white border-slate-800">
          <h2 className="text-xl font-bold border-b border-slate-800 pb-4 mb-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-slate-400" /> Payment Summary
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between text-slate-300">
              <span>Base Price</span>
              <span>{formatCurrency(b.serviceBasePriceMinor || b.totalPriceMinor)}</span>
            </div>
            {(b.platformFeeMinor || 0) > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>Platform Fee</span>
                <span>{formatCurrency(b.platformFeeMinor!)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-display font-bold text-blue-400 pt-4 border-t border-slate-800 mt-4">
              <span>Total</span>
              <span>{formatCurrency(b.totalPriceMinor, b.currencyCode)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 md:p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Status History</h2>
          <div className="space-y-3">
            {b.statusHistory?.map((event: any) => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="h-2 w-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{getStatusLabel(event.toStatus)}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                  {event.reason && <p className="text-xs text-slate-600 mt-0.5">{event.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Provider booking detail notes block. Splits notes by authorRole so
 * a multi-author thread reads as labeled groups. Each group's header
 * names the author's role (never the person); a small metadata line
 * underneath shows the name + date. */
function NoteSections({
  viewer, notes, canEditProviderNotes, onNoteChanged,
}: {
  viewer: NoteViewerRole;
  notes: any[];
  canEditProviderNotes: boolean;
  onNoteChanged: () => void;
}) {
  const groups = groupNotesByAuthorRole(notes);
  // Editor state lives in NoteSections so the edit textarea fully
  // replaces the note's text region (full-width); the kebab stays in
  // place beside it. Only one note edits at a time.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  return (
    <>
      {groups.map(({ role, notes: groupNotes }) => {
        const incoming = role !== "PROVIDER";
        const cardClass = incoming
          ? "p-6 md:p-8 border-amber-100 bg-amber-50/40"
          : "p-6 md:p-8 border-slate-100 bg-slate-50/40";
        const iconClass = incoming ? "text-amber-700" : "text-slate-500";
        const labelClass = incoming ? "text-amber-800" : "text-slate-500";
        const editable = role === "PROVIDER" && canEditProviderNotes;
        return (
          <Card key={role} className={cardClass}>
            <div className="flex items-center gap-2 mb-3">
              <StickyNote className={`h-4 w-4 ${iconClass}`} />
              <h2 className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>
                {noteSectionLabel(viewer, role)}
              </h2>
            </div>
            <div className="space-y-3">
              {groupNotes.map((n: any) => {
                const meta = noteMetaLine(n, (d) => formatDate(typeof d === "string" ? d : d.toISOString(), "MMM d, yyyy"));
                const isEditing = editingNoteId === n.id;
                return (
                  <div key={n.id} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <NoteEditor
                          note={n}
                          onSaved={() => { setEditingNoteId(null); onNoteChanged(); }}
                          onCancel={() => setEditingNoteId(null)}
                        />
                      ) : (
                        <>
                          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                          {meta && <p className="text-xs text-slate-500 mt-1">{meta}</p>}
                        </>
                      )}
                    </div>
                    {editable && !isEditing && (
                      <NoteKebabMenu
                        noteId={n.id}
                        onRequestEdit={() => setEditingNoteId(n.id)}
                        onDeleted={onNoteChanged}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </>
  );
}

/** Customer view notes block — same role-based grouping in the
 * compact icon-rail layout that customer body uses. Provider-authored
 * notes are filtered out client-side as defense-in-depth (the API
 * already filters them for non-provider viewers); a stale or
 * misconfigured response can never leak an internal provider note
 * into the driver's view. */
function CustomerNotesBlock({ notes }: { notes: any[] }) {
  const visibleNotes = notes.filter((n) => n?.authorRole !== "PROVIDER");
  if (visibleNotes.length === 0) return null;
  const groups = groupNotesByAuthorRole(visibleNotes);
  return (
    <>
      {groups.map(({ role, notes: groupNotes }) => (
        <div key={role} className="flex gap-4 items-start">
          <div className="bg-amber-50 p-3 rounded-xl text-amber-700"><StickyNote className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">{noteSectionLabel("DRIVER", role)}</p>
            <div className="space-y-2">
              {groupNotes.map((n: any) => {
                const meta = noteMetaLine(n, (d) => formatDate(typeof d === "string" ? d : d.toISOString(), "MMM d, yyyy"));
                return (
                  <div key={n.id}>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.content}</p>
                    {meta && <p className="text-[11px] text-slate-500 mt-0.5">{meta}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// AddNoteForm moved to components/add-note-form.tsx so Daily Board can
// import it without depending on a page module. Re-export for any
// caller that still imports from this file.
export { AddNoteForm } from "@/components/add-note-form";
