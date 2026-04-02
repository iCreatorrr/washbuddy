import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { ClipboardList, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronLeft, ChevronRight, MessageSquare, Plus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useWashRequests(params: Record<string, string>) {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API_BASE}/api/fleet/wash-requests?${qs}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [JSON.stringify(params), refreshKey]);

  return { data, isLoading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  REQUEST_CREATED: { label: "Created", color: "bg-slate-100 text-slate-600", icon: ClipboardList },
  PENDING_FLEET_APPROVAL: { label: "Pending Approval", color: "bg-purple-100 text-purple-700", icon: Clock },
  MODIFIED_PENDING_DRIVER_CONFIRMATION: { label: "Awaiting Driver", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  AUTO_APPROVED: { label: "Auto-Approved", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  APPROVED_BOOKING_PENDING_PROVIDER: { label: "Booked", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  DECLINED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  EXPIRED: { label: "Expired", color: "bg-slate-100 text-slate-500", icon: Clock },
  CANCELLED_BY_DRIVER: { label: "Cancelled", color: "bg-slate-100 text-slate-500", icon: XCircle },
  CONVERTED_TO_BOOKING: { label: "Booked", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  FAILED_NO_SLOT_AVAILABLE: { label: "No Slot", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  FAILED_POLICY_BLOCKED: { label: "Policy Blocked", color: "bg-red-100 text-red-700", icon: XCircle },
};

const statusFilters = [
  { value: "", label: "All Requests" },
  { value: "PENDING_FLEET_APPROVAL", label: "Pending Approval" },
  { value: "MODIFIED_PENDING_DRIVER_CONFIRMATION", label: "Awaiting Driver" },
  { value: "APPROVED_BOOKING_PENDING_PROVIDER", label: "Booked" },
  { value: "DECLINED", label: "Declined" },
];

export default function FleetWashRequests() {
  const { hasRole } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const isOperator = hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER");
  const isDriver = hasRole("DRIVER") && !isOperator;

  const params: Record<string, string> = { page: String(page), limit: "20" };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, refresh } = useWashRequests(params);
  const requests = data?.requests || [];
  const pagination = data?.pagination;

  const handleQuickApprove = async (e: React.MouseEvent, requestId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setApprovingId(requestId);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${requestId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "" }),
      });
      if (res.ok) {
        refresh();
      }
    } catch {}
    setApprovingId(null);
  };

  const isPendingApproval = (status: string) =>
    ["PENDING_FLEET_APPROVAL", "REQUEST_CREATED"].includes(status);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Fleet Operations</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">Wash Requests</h1>
            <p className="text-slate-500 mt-1">
              {isOperator ? "Manage and approve driver wash requests." : "View and track your wash requests."}
            </p>
          </div>
          {isDriver && (
            <Link href="/fleet/requests/new">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> New Request
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === f.value
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          Loading requests...
        </div>
      ) : requests.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No wash requests match your filter.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((r: any) => {
            const sc = statusConfig[r.status] || statusConfig.REQUEST_CREATED;
            const StatusIcon = sc.icon;
            const lastMessage = r.thread?.messages?.[0];
            const showApproveBtn = isOperator && isPendingApproval(r.status);

            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Link href={`/fleet/requests/${r.id}`} className="block">
                <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        r.requestType === "STRUCTURED" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                      }`}>
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-slate-900">{r.vehicle?.unitNumber}</p>
                          <Badge className={`text-xs ${r.requestType === "STRUCTURED" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                            {r.requestType}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          Requested by <span className="font-medium text-slate-700">{r.driver?.firstName} {r.driver?.lastName}</span>
                          {r.desiredLocation && <> · <span className="text-slate-600">{r.desiredLocation.name}</span></>}
                        </p>
                        {r.desiredStartAtUtc && (
                          <p className="text-xs text-slate-400 mt-1">
                            Desired: {new Date(r.desiredStartAtUtc).toLocaleString()}
                          </p>
                        )}
                        {r.notes && (
                          <p className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2 italic">
                            "{r.notes}"
                          </p>
                        )}
                        {lastMessage && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                            <MessageSquare className="h-3 w-3" />
                            <span>Latest message: "{lastMessage.body?.substring(0, 60)}..."</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`${sc.color} text-xs flex items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {sc.label}
                      </Badge>
                      <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      {r.declineReasonCode && (
                        <p className="text-xs text-red-500">Reason: {r.declineReasonCode}</p>
                      )}
                      {showApproveBtn && (
                        <Button
                          size="sm"
                          onClick={(e) => handleQuickApprove(e, r.id)}
                          disabled={approvingId === r.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs mt-1"
                        >
                          {approvingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
                </Link>
              </motion.div>
            );
          })}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={pagination.page >= pagination.totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
