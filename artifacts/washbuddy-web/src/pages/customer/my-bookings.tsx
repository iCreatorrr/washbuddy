import React, { useState, useMemo } from "react";
import { useListBookings, useCancelBooking } from "@workspace/api-client-react";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { Calendar, MapPin, Truck, Search, Star, XCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type TabKey = "upcoming" | "progress" | "completed" | "cancelled";

const UPCOMING_STATUSES = ["REQUESTED", "PROVIDER_CONFIRMED", "HELD"];
const PROGRESS_STATUSES = ["CHECKED_IN", "IN_SERVICE"];
const COMPLETED_STATUSES = ["COMPLETED_PENDING_WINDOW", "COMPLETED", "SETTLED"];
const CANCELLED_STATUSES = ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "PROVIDER_DECLINED", "EXPIRED"];
const CANCELLABLE_STATUSES = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED"];

export default function MyBookings() {
  const [, setNav] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string; date: string } | null>(null);

  const { data, isLoading, isError, refetch } = useListBookings(
    { limit: 100 },
    { request: { credentials: "include" } },
  );
  const cancelMutation = useCancelBooking({ request: { credentials: "include" } });

  const bookings = data?.bookings || [];

  const grouped = useMemo(() => ({
    upcoming: bookings.filter((b: any) => UPCOMING_STATUSES.includes(b.status)),
    progress: bookings.filter((b: any) => PROGRESS_STATUSES.includes(b.status)),
    completed: bookings.filter((b: any) => COMPLETED_STATUSES.includes(b.status)),
    cancelled: bookings.filter((b: any) => CANCELLED_STATUSES.includes(b.status)),
  }), [bookings]);

  const currentBookings = grouped[activeTab];

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

      {/* Tab navigation */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
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
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {currentBookings.map((booking: any, idx: number) => (
            <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
              <Card className="flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-center justify-between group cursor-pointer hover:border-primary/40 border-2 overflow-hidden">
                {/* Main content — clickable to detail */}
                <div
                  className="flex-1 p-6 space-y-3 w-full"
                  onClick={() => setNav(`/bookings/${booking.id}`)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className={getStatusColor(booking.status)}>{getStatusLabel(booking.status)}</Badge>
                    <span className="text-sm font-bold text-slate-400">ID: {booking.id.split("-")[0].toUpperCase()}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">
                    {booking.serviceNameSnapshot}
                  </h3>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatDate(booking.scheduledStartAtUtc, "EEE, MMM d · h:mm a")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {booking.location?.provider?.name} — {booking.location?.name}
                    </span>
                    {booking.vehicle && (
                      <span className="flex items-center gap-1.5">
                        <Truck className="h-4 w-4 text-slate-400" />
                        Unit {booking.vehicle.unitNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price + actions */}
                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 px-6 pb-6 md:p-6 md:pl-0 shrink-0 w-full md:w-auto">
                  <div className="text-2xl font-display font-bold text-slate-900">
                    {formatCurrency(booking.totalPriceMinor, booking.currencyCode)}
                  </div>

                  {/* Cancel button for upcoming bookings */}
                  {activeTab === "upcoming" && CANCELLABLE_STATUSES.includes(booking.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancelTarget({
                          id: booking.id,
                          name: booking.serviceNameSnapshot,
                          date: formatDate(booking.scheduledStartAtUtc, "MMM d, yyyy") || "",
                        });
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}

                  {/* Leave review for completed bookings */}
                  {activeTab === "completed" && COMPLETED_STATUSES.includes(booking.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300 gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNav(`/bookings/${booking.id}`);
                      }}
                    >
                      <Star className="h-3.5 w-3.5" /> Leave Review
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
