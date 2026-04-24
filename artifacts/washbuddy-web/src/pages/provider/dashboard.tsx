import React, { useState, useEffect } from "react";
import { useListBookings, useListProviders, useConfirmBooking, useDeclineBooking, useCheckinBooking, useStartService, useCompleteBooking } from "@workspace/api-client-react";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ClipboardList, Clock, CheckCircle2, XCircle, Play, Truck, AlertTriangle, Timer, Info } from "lucide-react";
import { toast, Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const DECLINE_REASONS = [
  { code: "FULLY_BOOKED", label: "Fully Booked" },
  { code: "EQUIPMENT_DOWN", label: "Equipment Down" },
  { code: "VEHICLE_INCOMPATIBLE", label: "Vehicle Incompatible" },
  { code: "WEATHER", label: "Weather" },
  { code: "OTHER", label: "Other" },
];

function SlaCountdown({ deadline }: { deadline: string }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (secondsLeft <= 0) {
    return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">EXPIRED</span>;
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft < 120;

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${isUrgent ? "text-red-700 bg-red-50 animate-pulse" : "text-amber-700 bg-amber-50"}`}>
      <Timer className="h-3 w-3" />
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

export default function ProviderDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"action" | "upcoming" | "progress">("action");
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("FULLY_BOOKED");
  const [declineNotes, setDeclineNotes] = useState("");

  const { data, isLoading, isError, refetch } = useListBookings(
    { limit: 50 },
    { request: { credentials: "include" }, query: { refetchInterval: 30_000 } },
  );

  const confirmMutation = useConfirmBooking({ request: { credentials: "include" } });
  const declineMutation = useDeclineBooking({ request: { credentials: "include" } });
  const checkinMutation = useCheckinBooking({ request: { credentials: "include" } });
  const startMutation = useStartService({ request: { credentials: "include" } });
  const completeMutation = useCompleteBooking({ request: { credentials: "include" } });

  const { data: providerData } = useListProviders({ request: { credentials: "include" } });
  const myProvider = (providerData?.providers || [])[0];
  const isPending = myProvider && (myProvider as any).approvalStatus === "PENDING";

  const bookings = data?.bookings || [];

  const requested = bookings.filter((b: any) => b.status === "REQUESTED");
  const today = new Date().toDateString();
  const upcoming = bookings.filter((b: any) => {
    if (b.status !== "PROVIDER_CONFIRMED" && b.status !== "HELD") return false;
    return new Date(b.scheduledStartAtUtc).toDateString() === today;
  });
  const inProgress = bookings.filter((b: any) => b.status === "CHECKED_IN" || b.status === "IN_SERVICE");

  const invalidateBookings = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
  };

  const handleConfirm = async (bookingId: string) => {
    try {
      await confirmMutation.mutateAsync({ bookingId });
      toast.success("Booking confirmed");
      invalidateBookings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm booking");
    }
  };

  const handleDeclineSubmit = async () => {
    if (!declineTarget) return;
    try {
      await declineMutation.mutateAsync({
        bookingId: declineTarget,
        data: { reasonCode: declineReason === "OTHER" ? (declineNotes || "OTHER") : declineReason },
      });
      toast.success("Booking declined");
      setDeclineTarget(null);
      setDeclineNotes("");
      invalidateBookings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to decline booking");
    }
  };

  const handleCheckin = async (bookingId: string) => {
    try {
      await checkinMutation.mutateAsync({ bookingId });
      toast.success("Vehicle checked in");
      invalidateBookings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to check in");
    }
  };

  const handleStartService = async (bookingId: string) => {
    try {
      await startMutation.mutateAsync({ bookingId });
      toast.success("Service started");
      invalidateBookings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to start service");
    }
  };

  const handleComplete = async (bookingId: string) => {
    try {
      await completeMutation.mutateAsync({ bookingId });
      toast.success("Service completed");
      invalidateBookings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to complete service");
    }
  };

  // ─── Card renderers ──────────────────────────────────────────────

  const RequestedCard = ({ b }: { b: any }) => (
    <Card className="p-5 border-2 border-amber-200 bg-amber-50/30">
      <div className="flex justify-between items-start mb-3">
        <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
        {b.providerResponseDeadlineUtc && (
          <SlaCountdown deadline={b.providerResponseDeadlineUtc} />
        )}
      </div>
      <h3 className="font-bold text-slate-900 text-lg mb-1">{b.serviceNameSnapshot}</h3>
      <div className="space-y-1 text-sm text-slate-600 mb-4">
        <p className="font-medium">{b.customer?.firstName} {b.customer?.lastName}</p>
        <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> {formatDate(b.scheduledStartAtUtc, "EEE, MMM d · h:mm a", b.locationTimezone)}</p>
        {b.vehicle && <p className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-slate-400" /> {b.vehicle.unitNumber} ({b.vehicle.subtypeCode?.replace(/_/g, " ")})</p>}
        <p className="font-bold text-slate-900">{formatCurrency(b.serviceBasePriceMinor, b.currencyCode)}</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
          onClick={() => handleConfirm(b.id)}
          isLoading={confirmMutation.isPending}
        >
          <CheckCircle2 className="h-4 w-4" /> Confirm
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="flex-1 gap-1"
          onClick={() => { setDeclineTarget(b.id); setDeclineReason("FULLY_BOOKED"); setDeclineNotes(""); }}
        >
          <XCircle className="h-4 w-4" /> Decline
        </Button>
      </div>
    </Card>
  );

  const UpcomingCard = ({ b }: { b: any }) => (
    <Card className="p-5 border-2 hover:border-blue-300 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
        <span className="text-xs font-bold text-slate-400">{formatDate(b.scheduledStartAtUtc, "h:mm a", b.locationTimezone)}</span>
      </div>
      <h3 className="font-bold text-slate-900 text-lg mb-1">{b.serviceNameSnapshot}</h3>
      <div className="space-y-1 text-sm text-slate-600 mb-4">
        <p className="font-medium">{b.customer?.firstName} {b.customer?.lastName}</p>
        {b.vehicle && <p className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-slate-400" /> {b.vehicle.unitNumber}</p>}
      </div>
      <Button
        size="sm"
        className="w-full gap-1"
        onClick={() => handleCheckin(b.id)}
        isLoading={checkinMutation.isPending}
      >
        <CheckCircle2 className="h-4 w-4" /> Check In Vehicle
      </Button>
    </Card>
  );

  const InProgressCard = ({ b }: { b: any }) => {
    const isCheckedIn = b.status === "CHECKED_IN";
    return (
      <Card className="p-5 border-2 border-purple-200 bg-purple-50/20">
        <div className="flex justify-between items-start mb-3">
          <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
          {b.serviceStartedAtUtc && (
            <span className="text-xs font-medium text-purple-600">Started {formatDate(b.serviceStartedAtUtc, "h:mm a")}</span>
          )}
        </div>
        <h3 className="font-bold text-slate-900 text-lg mb-1">{b.serviceNameSnapshot}</h3>
        <div className="space-y-1 text-sm text-slate-600 mb-4">
          <p className="font-medium">{b.customer?.firstName} {b.customer?.lastName}</p>
          {b.vehicle && <p className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-slate-400" /> {b.vehicle.unitNumber}</p>}
        </div>
        {isCheckedIn ? (
          <Button
            size="sm"
            className="w-full gap-1 bg-purple-600 hover:bg-purple-700"
            onClick={() => handleStartService(b.id)}
            isLoading={startMutation.isPending}
          >
            <Play className="h-4 w-4" /> Start Service
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full gap-1 bg-green-600 hover:bg-green-700"
            onClick={() => handleComplete(b.id)}
            isLoading={completeMutation.isPending}
          >
            <CheckCircle2 className="h-4 w-4" /> Complete Service
          </Button>
        )}
      </Card>
    );
  };

  // ─── Column component ─────────────────────────────────────────────

  const Column = ({ title, icon: Icon, items, colorClass, renderCard }: {
    title: string;
    icon: React.ElementType;
    items: any[];
    colorClass: string;
    renderCard: (b: any) => React.ReactNode;
  }) => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900">
        <Icon className={`h-5 w-5 ${colorClass}`} />
        {title}
        <Badge variant="default" className="ml-1">{items.length}</Badge>
      </h2>
      {items.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 bg-slate-50/50 border-dashed border-slate-300">
          Nothing here right now.
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((b: any) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {renderCard(b)}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Decline dialog ───────────────────────────────────────────────

  const DeclineDialog = () => {
    if (!declineTarget) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeclineTarget(null)}>
        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Decline Booking</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">Select a reason for declining this booking request.</p>
          <div className="space-y-2 mb-4">
            {DECLINE_REASONS.map((r) => (
              <label
                key={r.code}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  declineReason === r.code ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="declineReason"
                  value={r.code}
                  checked={declineReason === r.code}
                  onChange={() => setDeclineReason(r.code)}
                  className="accent-red-600"
                />
                <span className="font-medium text-slate-700">{r.label}</span>
              </label>
            ))}
          </div>
          {declineReason === "OTHER" && (
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mb-4 focus:border-red-300 focus:outline-none"
              placeholder="Please provide a reason..."
              value={declineNotes}
              onChange={(e) => setDeclineNotes(e.target.value)}
              rows={2}
            />
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeclineTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDeclineSubmit}
              isLoading={declineMutation.isPending}
            >
              Confirm Decline
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <Toaster position="top-right" richColors />
      <DeclineDialog />

      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Provider Dashboard</h1>
        <p className="text-slate-500 mt-2">Manage your incoming bookings and active washes.</p>
      </div>

      {isPending && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <Info className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Your listing is pending review</p>
            <p className="text-sm text-amber-700">A WashBuddy admin will review your submission and you'll be notified when approved. You can still edit your location and services in Settings.</p>
          </div>
        </div>
      )}

      {isError ? (
        <ErrorState message="Could not load bookings." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-64 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile tabs */}
          <div className="lg:hidden flex bg-slate-100 rounded-xl p-1 gap-1">
            {[
              { key: "action" as const, label: "Action Required", count: requested.length },
              { key: "upcoming" as const, label: "Upcoming", count: upcoming.length },
              { key: "progress" as const, label: "In Progress", count: inProgress.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Mobile single column */}
          <div className="lg:hidden">
            {activeTab === "action" && (
              <Column title="Action Required" icon={ClipboardList} items={requested} colorClass="text-amber-500" renderCard={(b) => <RequestedCard b={b} />} />
            )}
            {activeTab === "upcoming" && (
              <Column title="Upcoming Today" icon={Clock} items={upcoming} colorClass="text-blue-500" renderCard={(b) => <UpcomingCard b={b} />} />
            )}
            {activeTab === "progress" && (
              <Column title="In Progress" icon={CheckCircle2} items={inProgress} colorClass="text-purple-500" renderCard={(b) => <InProgressCard b={b} />} />
            )}
          </div>

          {/* Desktop 3-column Kanban */}
          <div className="hidden lg:grid lg:grid-cols-3 gap-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Column title="Action Required" icon={ClipboardList} items={requested} colorClass="text-amber-500" renderCard={(b) => <RequestedCard b={b} />} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Column title="Upcoming Today" icon={Clock} items={upcoming} colorClass="text-blue-500" renderCard={(b) => <UpcomingCard b={b} />} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Column title="In Progress" icon={CheckCircle2} items={inProgress} colorClass="text-purple-500" renderCard={(b) => <InProgressCard b={b} />} />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
