import React, { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useGetBooking, useConfirmBooking, useCheckinBooking, useStartService, useCompleteBooking, useCancelBooking } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Card, Badge, Button } from "@/components/ui";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { MapPin, Calendar, Truck, User, CreditCard, ChevronRight, CheckCircle2, Star, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ReviewForm } from "@/components/review-form";

export default function BookingDetail() {
  const [, params] = useRoute("/bookings/:id");
  const bookingId = params?.id || "";
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useGetBooking(bookingId, { 
    query: { enabled: !!bookingId },
    request: { credentials: 'include' }
  });

  // Mutations
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

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

  const b = data?.booking;
  if (isLoading) return <div className="p-12 text-center text-slate-500">Loading details...</div>;
  if (!b) return <div className="p-12 text-center text-red-500">Booking not found.</div>;

  const isCustomer = user?.id === b.customerId;
  const isProvider = hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF");
  const isCompleted = b.status === "COMPLETED" || b.status === "COMPLETED_PENDING_WINDOW" || b.status === "SETTLED";
  const showReviewForm = isCustomer && isCompleted && !reviewSubmitted;

  const getBack = () => {
    if (hasRole("PLATFORM_SUPER_ADMIN")) return { path: "/admin/bookings", label: "Back to All Bookings" };
    if (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) return { path: "/provider", label: "Back to Dashboard" };
    if (hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST")) return { path: "/fleet", label: "Back to Fleet" };
    return { path: "/bookings", label: "Back to My Bookings" };
  };

  const back = getBack();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link href={back.path} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {back.label}
      </Link>

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
        </div>
      </div>

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
              <p className="font-bold text-slate-900">{formatDate(b.scheduledStartAtUtc)}</p>
              <p className="text-sm text-slate-500">to {formatDate(b.scheduledEndAtUtc, "h:mm a")}</p>
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
            <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><Truck className="h-5 w-5" /></div>
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle</p>
              <p className="font-bold text-slate-900">{b.vehicle?.unitNumber || "Not specified"}</p>
              <p className="text-sm text-slate-500">{b.vehicle?.categoryCode}</p>
            </div>
          </div>

          {isProvider && (
            <div className="flex gap-4 items-start">
              <div className="bg-slate-100 p-3 rounded-xl text-slate-500"><User className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Customer</p>
                <p className="font-bold text-slate-900">{b.customer?.firstName} {b.customer?.lastName}</p>
                <p className="text-sm text-slate-500">{b.customer?.email}</p>
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
