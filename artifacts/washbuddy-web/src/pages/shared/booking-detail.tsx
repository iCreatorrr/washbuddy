import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetBooking, useConfirmBooking, useCheckinBooking, useStartService, useCompleteBooking, useCancelBooking } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Card, Badge, Button } from "@/components/ui";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { MapPin, Calendar, Truck, User, CreditCard, ChevronRight, CheckCircle2, Star, ArrowLeft, Shield, AlertTriangle, X } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ReviewForm } from "@/components/review-form";
import { toast, Toaster } from "sonner";
import { BODY_TYPE_ICON, BODY_TYPE_LABEL, BODY_TYPE_STYLE, normalizeBodyType, vehicleDisplayName } from "@/lib/vehicleBodyType";

const API_BASE = import.meta.env.VITE_API_URL || "";

const ALL_STATUSES = ["REQUESTED","HELD","PROVIDER_CONFIRMED","PROVIDER_DECLINED","EXPIRED","CUSTOMER_CANCELLED","PROVIDER_CANCELLED","LATE","NO_SHOW","CHECKED_IN","IN_SERVICE","COMPLETED_PENDING_WINDOW","COMPLETED","DISPUTED","REFUNDED","SETTLED"];

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
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
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
  const activeStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "CHECKED_IN", "IN_SERVICE", "LATE"];
  const isCompleted = b.status === "COMPLETED" || b.status === "COMPLETED_PENDING_WINDOW" || b.status === "SETTLED";
  const showReviewForm = isCustomer && isCompleted && !reviewSubmitted;

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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
          <h1 className="text-4xl font-display font-bold text-slate-900 mt-4 mb-2">{b.serviceNameSnapshot}</h1>
          <p className="text-slate-500 font-mono text-sm">ID: {b.id}</p>
        </div>
        
        {/* Contextual Actions */}
        <div className="flex flex-wrap gap-3">
          {(isCustomer || isProvider) && ["REQUESTED", "HELD", "PROVIDER_CONFIRMED"].includes(b.status) && (
            <Button variant="outline" onClick={() => handleAction("cancel")} isLoading={cancelMut.isPending}>
              Cancel Booking
            </Button>
          )}
          
          {isProvider && b.status === "REQUESTED" && (
            <Button onClick={() => handleAction("confirm")} isLoading={confirmMut.isPending} className="bg-blue-600 hover:bg-blue-700">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Job
            </Button>
          )}
          {isProvider && b.status === "PROVIDER_CONFIRMED" && (
            <Button onClick={() => handleAction("checkin")} isLoading={checkinMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              Mark Checked In
            </Button>
          )}
          {isProvider && b.status === "CHECKED_IN" && (
            <Button onClick={() => handleAction("start")} isLoading={startMut.isPending} className="bg-purple-600 hover:bg-purple-700">
              Start Wash
            </Button>
          )}
          {isProvider && b.status === "IN_SERVICE" && (
            <Button onClick={() => handleAction("complete")} isLoading={completeMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              Complete Wash
            </Button>
          )}

          {/* Admin Actions */}
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
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Location</p>
              <p className="font-bold text-slate-900">{b.location?.name}</p>
              <p className="text-sm text-slate-500">{b.location?.provider?.name}</p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            {(() => {
              const bt = b.vehicle?.bodyType ? normalizeBodyType(b.vehicle.bodyType) : null;
              const style = bt ? BODY_TYPE_STYLE[bt] : null;
              const Icon = bt ? BODY_TYPE_ICON[bt] : Truck;
              return (
                <div className={`p-3 rounded-xl ${style ? style.chipBg : "bg-slate-100"} ${style ? style.chipFg : "text-slate-500"}`}>
                  <Icon className="h-5 w-5" />
                </div>
              );
            })()}
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle</p>
              <p className="font-bold text-slate-900">{b.vehicle ? vehicleDisplayName(b.vehicle) : "Not specified"}</p>
              <p className="text-sm text-slate-500">
                {b.vehicle?.bodyType ? BODY_TYPE_LABEL[normalizeBodyType(b.vehicle.bodyType)] : (b.vehicle?.categoryCode || "")}
              </p>
            </div>
          </div>

          {isProvider && (
            <div className="flex gap-4 items-start">
              <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><User className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Customer</p>
                {b.isOffPlatform ? (
                  <>
                    <p className="font-bold text-slate-900">{b.offPlatformClientName || "Walk-in"}</p>
                    <p className="text-sm text-slate-500">
                      {b.offPlatformClientPhone || b.offPlatformClientEmail || "No contact info on file"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-slate-900">{b.customer?.firstName} {b.customer?.lastName}</p>
                    <p className="text-sm text-slate-500">{b.customer?.email}</p>
                  </>
                )}
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
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {b.statusHistory?.map((event, idx) => (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-slate-900">{getStatusLabel(event.toStatus)}</div>
                    </div>
                    <div className="text-xs text-slate-500 mb-2">{formatDate(event.createdAt)}</div>
                    <div className="text-sm text-slate-600">{event.reason || "Status updated"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
