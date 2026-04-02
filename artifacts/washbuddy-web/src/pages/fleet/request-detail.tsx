import React, { useState, useEffect, useRef } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  ArrowLeft, Truck, MapPin, Clock, User, MessageSquare, Send, XCircle,
  CheckCircle2, AlertTriangle, Calendar, FileText, Loader2,
  ThumbsUp, ThumbsDown, Edit3, Search
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useWashRequestDetail(id: string) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/fleet/wash-requests/${id}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Request not found" : "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  return { data, isLoading, error, reload: load };
}

const statusConfig: Record<string, { label: string; color: string; icon: any; desc: string }> = {
  REQUEST_CREATED: { label: "Created", color: "bg-slate-100 text-slate-600", icon: Clock, desc: "Request has been created and is being processed." },
  PENDING_FLEET_APPROVAL: { label: "Pending Approval", color: "bg-purple-100 text-purple-700", icon: Clock, desc: "Waiting for fleet admin or dispatcher to review." },
  MODIFIED_PENDING_DRIVER_CONFIRMATION: { label: "Modified — Awaiting Driver", color: "bg-amber-100 text-amber-700", icon: AlertTriangle, desc: "Fleet made changes. Driver confirmation needed." },
  AUTO_APPROVED: { label: "Auto-Approved", color: "bg-blue-100 text-blue-700", icon: CheckCircle2, desc: "Automatically approved per fleet policy." },
  APPROVED_BOOKING_PENDING_PROVIDER: { label: "Booked", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, desc: "This wash has been booked." },
  DECLINED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle, desc: "This request was declined." },
  EXPIRED: { label: "Expired", color: "bg-slate-100 text-slate-500", icon: Clock, desc: "Request expired without action." },
  CANCELLED_BY_DRIVER: { label: "Cancelled", color: "bg-slate-100 text-slate-500", icon: XCircle, desc: "Cancelled by driver." },
  CONVERTED_TO_BOOKING: { label: "Booked", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, desc: "Successfully converted to a booking." },
  FAILED_NO_SLOT_AVAILABLE: { label: "Failed — No Slot", color: "bg-red-100 text-red-700", icon: AlertTriangle, desc: "No available slot found at the desired location." },
  FAILED_POLICY_BLOCKED: { label: "Policy Blocked", color: "bg-red-100 text-red-700", icon: XCircle, desc: "Blocked by fleet wash policy." },
};

const cancellableStatuses = [
  "REQUEST_CREATED",
  "PENDING_FLEET_APPROVAL",
  "MODIFIED_PENDING_DRIVER_CONFIRMATION",
  "AUTO_APPROVED",
  "APPROVED_BOOKING_PENDING_PROVIDER",
];

export default function RequestDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, hasRole } = useAuth();
  const isAnalyst = hasRole("READ_ONLY_ANALYST") && !hasRole("FLEET_ADMIN") && !hasRole("DISPATCHER");
  const { data, isLoading, error, reload } = useWashRequestDetail(params.id!);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "modify" | "decline" | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [modifyLocationId, setModifyLocationId] = useState("");
  const [modifyLocationQuery, setModifyLocationQuery] = useState("");
  const [modifyDate, setModifyDate] = useState("");
  const [modifyTime, setModifyTime] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [declineNotes, setDeclineNotes] = useState("");
  const [locationResults, setLocationResults] = useState<any[]>([]);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [driverConfirming, setDriverConfirming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const request = data?.request;
  const messages = request?.thread?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (!messageBody.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageBody.trim() }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setMessageBody("");
      reload();
    } catch {}
    setSendingMessage(false);
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this wash request?")) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to cancel");
      } else {
        reload();
      }
    } catch {}
    setCancelling(false);
  };

  const searchLocations = async (q: string) => {
    setModifyLocationQuery(q);
    if (q.length < 2) { setLocationResults([]); return; }
    setSearchingLocations(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/locations/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setLocationResults(d.locations || []);
      }
    } catch {}
    setSearchingLocations(false);
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const body: any = {};
      if (approvalNotes.trim()) body.approvalNotes = approvalNotes.trim();
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to approve");
      } else {
        setApprovalAction(null);
        setApprovalNotes("");
        reload();
      }
    } catch {}
    setApproving(false);
  };

  const handleModify = async () => {
    if (!modifyLocationId && !modifyDate) {
      alert("Please set a new location or date/time for the modification.");
      return;
    }
    setApproving(true);
    try {
      const body: any = {};
      if (modifyLocationId) body.approvedLocationId = modifyLocationId;
      if (modifyDate) {
        const timeStr = modifyTime || "09:00";
        const localDate = new Date(`${modifyDate}T${timeStr}:00`);
        body.approvedStartAtUtc = localDate.toISOString();
      }
      if (approvalNotes.trim()) body.approvalNotes = approvalNotes.trim();
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/modify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to modify");
      } else {
        setApprovalAction(null);
        resetModifyFields();
        reload();
      }
    } catch {}
    setApproving(false);
  };

  const handleDecline = async () => {
    if (!declineReason) {
      alert("Please select a decline reason.");
      return;
    }
    setApproving(true);
    try {
      const body: any = { declineReasonCode: declineReason };
      if (declineNotes.trim()) body.declineNotes = declineNotes.trim();
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/decline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to decline");
      } else {
        setApprovalAction(null);
        setDeclineReason("");
        setDeclineNotes("");
        reload();
      }
    } catch {}
    setApproving(false);
  };

  const handleDriverConfirm = async (accepted: boolean) => {
    if (!accepted && !confirm("Are you sure you want to reject the modifications? This will cancel the request.")) return;
    setDriverConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/wash-requests/${params.id}/driver-confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to confirm");
      } else {
        reload();
      }
    } catch {}
    setDriverConfirming(false);
  };

  const resetModifyFields = () => {
    setModifyLocationId("");
    setModifyLocationQuery("");
    setModifyDate("");
    setModifyTime("");
    setApprovalNotes("");
    setLocationResults([]);
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
        Loading request...
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-700 font-medium">{error || "Request not found"}</p>
        <button onClick={() => setLocation("/fleet/requests")} className="text-blue-600 hover:underline text-sm mt-2">
          Back to Wash Requests
        </button>
      </div>
    );
  }

  const sc = statusConfig[request.status] || statusConfig.REQUEST_CREATED;
  const StatusIcon = sc.icon;
  const canCancel = !isAnalyst && cancellableStatuses.includes(request.status) &&
    (request.driverUserId === user?.id || user?.roles?.some((r: any) => ["FLEET_ADMIN", "DISPATCHER"].includes(r.role)));

  const isApprover = !isAnalyst && user?.roles?.some((r: any) => ["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER"].includes(r.role));
  const canApprove = isApprover && ["PENDING_FLEET_APPROVAL", "REQUEST_CREATED"].includes(request.status);
  const isDriverAwaitingConfirm = request.status === "MODIFIED_PENDING_DRIVER_CONFIRMATION" && request.driverUserId === user?.id;

  const declineReasons = [
    { value: "BUDGET_EXCEEDED", label: "Budget exceeded" },
    { value: "DUPLICATE_REQUEST", label: "Duplicate request" },
    { value: "NOT_DUE", label: "Vehicle not due for wash" },
    { value: "SCHEDULE_CONFLICT", label: "Schedule conflict" },
    { value: "VEHICLE_OUT_OF_SERVICE", label: "Vehicle out of service" },
    { value: "OTHER", label: "Other" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => setLocation("/fleet/requests")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Wash Requests
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Wash Request</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              {request.vehicle?.unitNumber} — {request.requestType}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${sc.color} text-sm flex items-center gap-1 px-3 py-1`}>
              <StatusIcon className="h-4 w-4" />
              {sc.label}
            </Badge>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Cancel Request
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-2">{sc.desc}</p>
      </motion.div>

      {isDriverAwaitingConfirm && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-6 border-2 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-amber-900">Modifications Require Your Confirmation</h3>
                <p className="text-sm text-amber-700 mt-1">
                  The fleet has proposed changes to your wash request. Please review the approved details below and confirm or reject.
                </p>
              </div>
            </div>

            {request.approvedLocation && (
              <div className="bg-white rounded-lg p-3 mb-3 border border-amber-200">
                <p className="text-xs font-bold text-amber-600 uppercase mb-1">Proposed Location</p>
                <p className="text-sm font-medium text-slate-900">{request.approvedLocation.name}</p>
              </div>
            )}
            {request.approvedStartAtUtc && (
              <div className="bg-white rounded-lg p-3 mb-3 border border-amber-200">
                <p className="text-xs font-bold text-amber-600 uppercase mb-1">Proposed Time</p>
                <p className="text-sm font-medium text-slate-900">{new Date(request.approvedStartAtUtc).toLocaleString()}</p>
              </div>
            )}
            {request.approvalNotes && (
              <div className="bg-white rounded-lg p-3 mb-3 border border-amber-200">
                <p className="text-xs font-bold text-amber-600 uppercase mb-1">Notes from Fleet</p>
                <p className="text-sm text-slate-700">{request.approvalNotes}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => handleDriverConfirm(true)}
                disabled={driverConfirming}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
              >
                {driverConfirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                Accept Changes
              </Button>
              <Button
                onClick={() => handleDriverConfirm(false)}
                disabled={driverConfirming}
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
              >
                {driverConfirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ThumbsDown className="h-4 w-4 mr-2" />}
                Reject & Cancel
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {canApprove && !approvalAction && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="p-6 border-2 border-blue-200 bg-blue-50">
            <h3 className="text-lg font-bold text-blue-900 mb-2">Review This Request</h3>
            <p className="text-sm text-blue-700 mb-4">Choose an action for this wash request.</p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setApprovalAction("approve")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button
                onClick={() => setApprovalAction("modify")}
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Edit3 className="h-4 w-4 mr-2" /> Modify & Counter-propose
              </Button>
              <Button
                onClick={() => setApprovalAction("decline")}
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" /> Decline
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {approvalAction === "approve" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 border-2 border-emerald-200 bg-emerald-50">
            <h3 className="text-lg font-bold text-emerald-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Approve Request
            </h3>
            <p className="text-sm text-emerald-700 mb-4">
              This will approve the request as-is with the driver's requested location and time.
            </p>
            <textarea
              placeholder="Optional approval notes..."
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none mb-4 bg-white"
            />
            <div className="flex gap-3">
              <Button onClick={handleApprove} disabled={approving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirm Approval
              </Button>
              <Button variant="outline" onClick={() => { setApprovalAction(null); setApprovalNotes(""); }}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      {approvalAction === "modify" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 border-2 border-amber-200 bg-amber-50">
            <h3 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
              <Edit3 className="h-5 w-5" /> Modify & Counter-propose
            </h3>
            <p className="text-sm text-amber-700 mb-4">
              Propose changes. The driver will need to confirm before the request proceeds.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Alternative Location</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search for a location..."
                    value={modifyLocationQuery}
                    onChange={(e) => searchLocations(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  />
                  {searchingLocations && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />}
                </div>
                {locationResults.length > 0 && (
                  <div className="mt-1 border border-amber-200 rounded-xl bg-white max-h-40 overflow-y-auto shadow-sm">
                    {locationResults.map((loc: any) => (
                      <button
                        key={loc.id}
                        onClick={() => { setModifyLocationId(loc.id); setModifyLocationQuery(loc.name); setLocationResults([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b border-amber-100 last:border-0"
                      >
                        <span className="font-medium">{loc.name}</span>
                        <span className="text-slate-400 ml-2">{loc.city}, {loc.regionCode}</span>
                      </button>
                    ))}
                  </div>
                )}
                {modifyLocationId && (
                  <p className="text-xs text-emerald-600 mt-1">Location selected</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Alternative Date</label>
                  <input
                    type="date"
                    value={modifyDate}
                    onChange={(e) => setModifyDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Alternative Time</label>
                  <input
                    type="time"
                    value={modifyTime}
                    onChange={(e) => setModifyTime(e.target.value)}
                    className="w-full px-4 py-2.5 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  />
                </div>
              </div>
              <textarea
                placeholder="Notes for the driver about these changes..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleModify} disabled={approving} className="bg-amber-600 hover:bg-amber-700 text-white">
                {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Edit3 className="h-4 w-4 mr-2" />}
                Send Modification
              </Button>
              <Button variant="outline" onClick={() => { setApprovalAction(null); resetModifyFields(); }}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      {approvalAction === "decline" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 border-2 border-red-200 bg-red-50">
            <h3 className="text-lg font-bold text-red-900 mb-3 flex items-center gap-2">
              <XCircle className="h-5 w-5" /> Decline Request
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Reason for Declining *</label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                >
                  <option value="">Select a reason...</option>
                  {declineReasons.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Additional notes (optional)..."
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 border border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleDecline} disabled={approving || !declineReason} className="bg-red-600 hover:bg-red-700 text-white">
                {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Confirm Decline
              </Button>
              <Button variant="outline" onClick={() => { setApprovalAction(null); setDeclineReason(""); setDeclineNotes(""); }}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Request Details</h2>

          <DetailRow icon={Truck} label="Vehicle" value={`${request.vehicle?.unitNumber} (${request.vehicle?.categoryCode})`} />
          <DetailRow icon={User} label="Requested By" value={`${request.driver?.firstName} ${request.driver?.lastName}`} />
          <DetailRow icon={Calendar} label="Created" value={new Date(request.createdAt).toLocaleString()} />

          {request.desiredLocation && (
            <DetailRow icon={MapPin} label="Desired Location" value={request.desiredLocation.name} />
          )}
          {request.desiredStartAtUtc && (
            <DetailRow icon={Clock} label="Desired Time" value={new Date(request.desiredStartAtUtc).toLocaleString()} />
          )}
          {request.timeWindowCode && (
            <DetailRow icon={Clock} label="Time Window" value={request.timeWindowCode} />
          )}
          {request.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{request.notes}</p>
            </div>
          )}

          {request.approvedLocation && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-bold text-emerald-600 uppercase mb-2">Approved Details</p>
              <DetailRow icon={MapPin} label="Approved Location" value={request.approvedLocation.name} />
              {request.approvedStartAtUtc && (
                <DetailRow icon={Clock} label="Approved Time" value={new Date(request.approvedStartAtUtc).toLocaleString()} />
              )}
              {request.approvalNotes && (
                <p className="text-sm text-slate-600 mt-1">{request.approvalNotes}</p>
              )}
            </div>
          )}

          {request.declineReasonCode && (
            <div className="pt-3 border-t border-red-100">
              <p className="text-xs font-bold text-red-600 uppercase mb-1">Decline Reason</p>
              <p className="text-sm text-red-700">{request.declineReasonCode}</p>
              {request.declineNotes && <p className="text-sm text-slate-600 mt-1">{request.declineNotes}</p>}
            </div>
          )}

          {request.expiresAtUtc && (
            <DetailRow icon={Clock} label="Expires" value={new Date(request.expiresAtUtc).toLocaleString()} />
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-500" />
            Activity Log
          </h2>
          {request.revisions?.length === 0 ? (
            <p className="text-slate-400 text-sm">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {request.revisions?.map((rev: any, i: number) => (
                <div key={rev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                    }`}>
                      {rev.revisionNo}
                    </div>
                    {i < request.revisions.length - 1 && (
                      <div className="w-px flex-1 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-slate-900">{rev.changeReasonCode.replace(/_/g, " ")}</p>
                    <p className="text-xs text-slate-400">
                      {rev.changedBy?.firstName} {rev.changedBy?.lastName} · {new Date(rev.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-blue-500" />
          Messages ({messages.length})
        </h2>

        <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
          {messages.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No messages yet. Start a conversation about this request.</p>
          ) : (
            messages.map((msg: any) => {
              const isMe = msg.author?.id === user?.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isMe
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-900"
                  }`}>
                    {!isMe && (
                      <p className="text-xs font-bold mb-0.5 text-slate-500">
                        {msg.author?.firstName} {msg.author?.lastName}
                      </p>
                    )}
                    <p className="text-sm">{msg.body}</p>
                    <p className={`text-xs mt-1 ${isMe ? "text-blue-200" : "text-slate-400"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isAnalyst && (
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <input
              type="text"
              placeholder="Type a message..."
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!messageBody.trim() || sendingMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <span className="text-sm text-slate-500 min-w-[100px]">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
