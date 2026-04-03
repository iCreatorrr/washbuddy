import React, { useState, useEffect } from "react";
import { useListLocations, useListServices } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, ErrorState } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { Building2, MapPin, ChevronDown, ChevronRight, Clock, DollarSign, Eye, EyeOff, Search, Star, CheckCircle2, XCircle, Shield, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useAdminProviders(params: Record<string, string>) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API_BASE}/api/admin/providers?${qs}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [JSON.stringify(params), refreshKey]);

  return { data, isLoading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

const statusBadge: Record<string, { label: string; color: string }> = {
  APPROVED: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Pending Approval", color: "bg-amber-100 text-amber-700" },
  SUSPENDED: { label: "Suspended", color: "bg-red-100 text-red-700" },
  REJECTED: { label: "Rejected", color: "bg-slate-100 text-slate-600" },
};

const stripeBadge: Record<string, { label: string; color: string }> = {
  PAYOUTS_ACTIVE: { label: "Payouts Active", color: "bg-emerald-100 text-emerald-700" },
  PENDING_CONNECT: { label: "Pending Connect", color: "bg-amber-100 text-amber-700" },
  NOT_STARTED: { label: "Not Started", color: "bg-slate-100 text-slate-500" },
};

// ─── Location Detail (reused from original) ────────────────────────────────

function ProviderLocations({ providerId }: { providerId: string }) {
  const { data, isLoading } = useListLocations(providerId, { query: { enabled: !!providerId }, request: { credentials: "include" } });
  if (isLoading) return <div className="h-16 animate-pulse bg-slate-100 rounded-xl" />;
  if (!data?.locations?.length) return <p className="text-sm text-slate-400 italic py-4">No locations configured.</p>;
  return (
    <div className="space-y-4">
      {data.locations.map((loc: any) => <LocationCard key={loc.id} providerId={providerId} location={loc} />)}
    </div>
  );
}

function LocationCard({ providerId, location: loc }: { providerId: string; location: any }) {
  const [showServices, setShowServices] = useState(false);
  const { data: servicesData, isLoading } = useListServices(providerId, loc.id, { query: { enabled: showServices }, request: { credentials: "include" } });
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-slate-400" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm">{loc.name}</h4>
              {loc.isVisible ? <span className="flex items-center gap-1 text-xs text-emerald-600"><Eye className="h-3 w-3" />Visible</span>
                : <span className="flex items-center gap-1 text-xs text-slate-400"><EyeOff className="h-3 w-3" />Hidden</span>}
            </div>
            <p className="text-xs text-slate-500">{loc.addressLine1}, {loc.city}</p>
          </div>
        </div>
        <button onClick={() => setShowServices(!showServices)} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
          Services {showServices ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>
      <AnimatePresence>
        {showServices && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 border-t border-slate-200 pt-3">
              {isLoading ? <div className="h-12 animate-pulse bg-slate-100 rounded-lg" /> :
                !servicesData?.services?.length ? <p className="text-sm text-slate-400 italic">No services.</p> :
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {servicesData.services.map((svc: any) => (
                    <div key={svc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100">
                      <div>
                        <p className="font-bold text-sm text-slate-900">{svc.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{svc.durationMins} min</span>
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(svc.basePriceMinor)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Reject Dialog ──────────────────────────────────────────────────────────

function RejectDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-xl"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
          <h3 className="text-lg font-bold text-slate-900">Reject Provider</h3>
        </div>
        <p className="text-sm text-slate-600 mb-3">Provide a reason for rejecting this provider.</p>
        <textarea className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mb-4 focus:border-red-300 focus:outline-none" rows={3} placeholder="Reason for rejection..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={() => onConfirm(reason)} isLoading={loading} disabled={!reason.trim()}>Reject</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminProviders() {
  const urlParams = new URLSearchParams(window.location.search);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter) params.status = statusFilter;
  if (searchTerm) params.search = searchTerm;

  const { data, isLoading, error, refresh } = useAdminProviders(params);
  const providers = data?.providers || [];

  const handleAction = async (providerId: string, action: string, body?: any) => {
    setActionLoading(providerId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${providerId}/${action}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      const labels: Record<string, string> = { approve: "Provider approved", reject: "Provider rejected", suspend: "Provider suspended", reactivate: "Provider reactivated" };
      toast.success(labels[action] || "Action completed");
      refresh();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  const statusFilters = [
    { value: "", label: "All" },
    { value: "APPROVED", label: "Active" },
    { value: "PENDING", label: "Pending" },
    { value: "SUSPENDED", label: "Suspended" },
    { value: "REJECTED", label: "Rejected" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Toaster position="top-right" richColors />
      <RejectDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} loading={actionLoading === rejectTarget}
        onConfirm={(reason) => { if (rejectTarget) { handleAction(rejectTarget, "reject", { reason }); setRejectTarget(null); } }} />

      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Providers</h1>
        <p className="text-slate-500 mt-2">Manage wash facility providers — approve, suspend, and monitor performance.</p>
      </div>

      {/* Search + Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search providers..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {statusFilters.map((f) => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === f.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error ? (
        <ErrorState message="Could not load providers." />
      ) : isLoading ? (
        <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-2xl" />)}</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No providers match your filters</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Table header */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span className="col-span-3">Provider</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-1 text-center">Locs</span>
            <span className="col-span-1 text-center">Bookings</span>
            <span className="col-span-1 text-center">Rating</span>
            <span className="col-span-1 text-center">SLA %</span>
            <span className="col-span-3 text-right">Actions</span>
          </div>

          {providers.map((p: any, idx: number) => {
            const isExpanded = expandedProvider === p.id;
            const sb = statusBadge[p.approvalStatus] || statusBadge.PENDING;
            const stb = stripeBadge[p.stripeStatus] || stripeBadge.NOT_STARTED;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                <Card className="overflow-hidden">
                  <div className="p-4 lg:p-5">
                    <div className="lg:grid lg:grid-cols-12 lg:gap-3 lg:items-center">
                      {/* Name + email */}
                      <div className="col-span-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpandedProvider(isExpanded ? null : p.id)}>
                        <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 truncate">{p.name}</h3>
                          <p className="text-xs text-slate-500 truncate">{p.contactEmail || "No email"}</p>
                        </div>
                        <div className={`transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </div>
                      </div>

                      {/* Status badges */}
                      <div className="col-span-2 flex gap-1.5 mt-2 lg:mt-0 flex-wrap">
                        <Badge className={`${sb.color} text-xs`}>{sb.label}</Badge>
                        <Badge className={`${stb.color} text-xs`}>{stb.label}</Badge>
                      </div>

                      {/* Metrics */}
                      <div className="col-span-1 text-center text-sm font-medium text-slate-700 hidden lg:block">{p.locationCount}</div>
                      <div className="col-span-1 text-center text-sm font-medium text-slate-700 hidden lg:block">{p.totalBookings}</div>
                      <div className="col-span-1 text-center text-sm font-medium text-slate-700 hidden lg:block">
                        {p.averageRating ? <span className="flex items-center justify-center gap-0.5"><Star className="h-3 w-3 text-amber-400" />{p.averageRating}</span> : "—"}
                      </div>
                      <div className="col-span-1 text-center text-sm font-medium hidden lg:block">
                        {p.responseRate != null ? <span className={p.responseRate >= 80 ? "text-emerald-600" : p.responseRate >= 50 ? "text-amber-600" : "text-red-600"}>{p.responseRate}%</span> : "—"}
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 flex items-center justify-end gap-2 mt-3 lg:mt-0">
                        {p.approvalStatus === "PENDING" && (
                          <>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              onClick={(e) => { e.stopPropagation(); handleAction(p.id, "approve"); }}
                              isLoading={actionLoading === p.id} disabled={actionLoading === p.id}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" className="gap-1"
                              onClick={(e) => { e.stopPropagation(); setRejectTarget(p.id); }}>
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                        {p.approvalStatus === "APPROVED" && (
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                            onClick={(e) => { e.stopPropagation(); if (confirm("Suspend this provider? Their locations will be hidden from search.")) handleAction(p.id, "suspend"); }}>
                            <Shield className="h-3.5 w-3.5" /> Suspend
                          </Button>
                        )}
                        {p.approvalStatus === "SUSPENDED" && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            onClick={(e) => { e.stopPropagation(); handleAction(p.id, "reactivate"); }}
                            isLoading={actionLoading === p.id}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Locations & Services</h4>
                          <ProviderLocations providerId={p.id} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
