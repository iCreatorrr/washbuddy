import React, { useState } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Link } from "wouter";
import { Truck, AlertTriangle, Clock, ClipboardList, RotateCcw, Building2, Users, Calendar, ChevronRight, ArrowRight, CheckCircle2, Loader2, Droplets, DollarSign, Search, Settings } from "lucide-react";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { formatLocationDisplay } from "@/lib/format-location";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useFleetOverview() {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/api/fleet/overview`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [refreshKey]);

  return { data, isLoading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function FleetOverview() {
  const { data, isLoading, error, refresh } = useFleetOverview();
  const { user, hasRole } = useAuth();
  const isOperator = hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER");
  const [approvingId, setApprovingId] = useState<string | null>(null);

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
      if (res.ok) refresh();
    } catch {}
    setApprovingId(null);
  };

  if (error) {
    return (
      <div className="p-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-700 font-medium">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-64 animate-pulse bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-2xl" />)}
        </div>
        <div className="h-64 animate-pulse bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const fleet = data?.fleet;

  return (
    <div className="space-y-8">
      <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Fleet Workspace</p>
            <h1 className="text-4xl font-display font-bold text-slate-900">{fleet?.name || "Fleet"}</h1>
            <p className="text-slate-500 mt-1">Welcome back, {user?.firstName}. Here's your fleet at a glance.</p>
          </div>
          <Badge className={fleet?.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
            {fleet?.status || "ACTIVE"}
          </Badge>
        </div>
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.05 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Truck} label="Total Vehicles" value={kpis.totalVehicles} color="blue" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={kpis.overdueVehicles} color="red" />
        <KpiCard icon={Clock} label="Due Soon" value={kpis.dueSoonVehicles} color="amber" />
        <KpiCard icon={ClipboardList} label="Pending Requests" value={kpis.pendingRequests} color="purple" />
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Droplets} label="Washes This Month" value={kpis.washesThisMonth} color="indigo" />
        <SpendCard label="Spend This Month" value={kpis.spendThisMonth} currencyCode={fleet?.currencyCode || "USD"} />
        <KpiCard icon={Users} label="Drivers" value={kpis.totalDrivers} color="cyan" />
        <KpiCard icon={Calendar} label="Active Bookings" value={kpis.activeBookings} color="emerald" />
      </motion.div>

      {/* Quick Action Buttons */}
      {isOperator && (
        <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.12 }} className="flex flex-wrap gap-3">
          <Link href="/search">
            <Button className="gap-2"><Search className="h-4 w-4" /> Book a Wash</Button>
          </Link>
          <Link href="/fleet/vehicles">
            <Button variant="outline" className="gap-2"><Truck className="h-4 w-4" /> View All Vehicles</Button>
          </Link>
          <Link href="/fleet/settings">
            <Button variant="outline" className="gap-2"><Settings className="h-4 w-4" /> Fleet Settings</Button>
          </Link>
        </motion.div>
      )}

      {/* Recent Wash Activity */}
      <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.13 }}>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Recent Wash Activity
            </h2>
          </div>
          {!data?.recentBookings?.length ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm mb-3">No wash activity yet.</p>
              <Link href="/search">
                <Button size="sm" variant="outline" className="gap-1"><Search className="h-3.5 w-3.5" /> Book a Wash</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Vehicle</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Provider / Location</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBookings.map((b: any) => (
                    <tr key={b.id} onClick={() => window.location.href = `/bookings/${b.id}`} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{b.vehicle?.unitNumber || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-600">{b.serviceNameSnapshot}</td>
                      <td className="py-2.5 px-3 text-slate-500 hidden md:table-cell">{formatLocationDisplay(b.location?.provider?.name, b.location?.name)}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatDate(b.scheduledStartAtUtc, "MMM d")}</td>
                      <td className="py-2.5 px-3"><Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge></td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(b.totalPriceMinor, b.currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.15 }}>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Overdue Vehicles
              </h2>
              <Link href="/fleet/vehicles?status=overdue" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data?.overdueVehicles?.length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">All vehicles are on track!</p>
            ) : (
              <div className="space-y-3">
                {data?.overdueVehicles?.map((v: any) => (
                  <Link key={v.id} href={`/fleet/requests/new?vehicleId=${v.id}`} className="block">
                    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-red-50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                          <Truck className="h-4 w-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900 group-hover:text-red-700">{v.unitNumber}</p>
                          <p className="text-xs text-slate-400">{v.depot?.name || "No depot"} · {v.categoryCode}</p>
                        </div>
                      </div>
                      <Badge className="bg-red-100 text-red-700 text-xs">
                        {v.nextWashDueAtUtc ? `${Math.ceil((Date.now() - new Date(v.nextWashDueAtUtc).getTime()) / (1000 * 60 * 60 * 24))}d overdue` : "Unknown"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-purple-500" />
                Pending Wash Requests
              </h2>
              <Link href="/fleet/requests" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data?.pendingRequests?.length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {data?.pendingRequests?.map((r: any) => (
                  <Link key={r.id} href={`/fleet/requests/${r.id}`} className="block">
                    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <ClipboardList className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900 group-hover:text-purple-700">{r.vehicle?.unitNumber} — {r.requestType}</p>
                          <p className="text-xs text-slate-400">
                            {r.driver?.firstName} {r.driver?.lastName} · {r.desiredLocation?.name || "Flexible"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOperator && (
                          <Button
                            size="sm"
                            onClick={(e) => handleQuickApprove(e, r.id)}
                            disabled={approvingId === r.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          >
                            {approvingId === r.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            Approve
                          </Button>
                        )}
                        <Badge className="bg-purple-100 text-purple-700 text-xs">Pending</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function SpendCard({ label, value, currencyCode }: { label: string; value: number; currencyCode: string }) {
  return (
    <Card className="p-4 border bg-emerald-50 text-emerald-600 border-emerald-100 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-display font-bold">{formatCurrency(value || 0, currencyCode)}</p>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    red: "bg-red-50 text-red-600 border-red-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    slate: "bg-slate-50 text-slate-600 border-slate-100",
    cyan: "bg-cyan-50 text-cyan-600 border-cyan-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };
  const iconColorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    red: "bg-red-100 text-red-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    indigo: "bg-indigo-100 text-indigo-600",
    slate: "bg-slate-100 text-slate-600",
    cyan: "bg-cyan-100 text-cyan-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };

  return (
    <Card className={`p-4 border ${colorMap[color]} hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconColorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-display font-bold">{value ?? 0}</p>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
        </div>
      </div>
    </Card>
  );
}
