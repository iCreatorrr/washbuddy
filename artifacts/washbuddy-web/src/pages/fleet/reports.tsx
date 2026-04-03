import React, { useState } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { BarChart3, AlertTriangle, CheckCircle2, Clock, TrendingUp, Layers, Activity, Droplets, Truck, DollarSign, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { cn, formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { formatLocationDisplay } from "@/lib/format-location";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Tab = "wash-activity" | "vehicle-compliance" | "spending" | "compliance" | "requests" | "programs";

function useFetch<T>(url: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`${API_BASE}${url}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [url]);

  return { data, isLoading, error };
}

function useFetchParams<T>(baseUrl: string, params: Record<string, string>) {
  const [data, setData] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${baseUrl}?${qs}` : baseUrl;

  React.useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`${API_BASE}${fullUrl}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [fullUrl]);

  return { data, isLoading, error };
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function ComplianceBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">{value} / {max}</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ComplianceTab() {
  const { data, isLoading, error } = useFetch<any>("/api/fleet/reports/compliance");

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { summary, byDepot } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div {...fadeUp} transition={{ delay: 0 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-slate-900">{summary.complianceRate}%</div>
            <div className="text-sm text-slate-500 mt-1">Compliance Rate</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <Card className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{summary.onTrack}</div>
              <div className="text-sm text-slate-500">On Track</div>
            </div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          <Card className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{summary.dueSoon}</div>
              <div className="text-sm text-slate-500">Due Soon</div>
            </div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.15 }}>
          <Card className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{summary.overdue}</div>
              <div className="text-sm text-slate-500">Overdue</div>
            </div>
          </Card>
        </motion.div>
      </div>

      <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Compliance by Depot</h3>
          {byDepot.length === 0 ? (
            <p className="text-slate-500 text-sm">No depot data available</p>
          ) : (
            <div className="space-y-5">
              {byDepot.map((depot: any) => (
                <div key={depot.depotId}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800">{depot.depotName}</span>
                    <span className={cn(
                      "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold",
                      depot.complianceRate >= 80 ? "bg-emerald-100 text-emerald-700" :
                      depot.complianceRate >= 50 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {depot.complianceRate}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <ComplianceBar label="On Track" value={depot.onTrack} max={depot.total} color="bg-emerald-500" />
                    <ComplianceBar label="Due Soon" value={depot.dueSoon} max={depot.total} color="bg-amber-500" />
                    <ComplianceBar label="Overdue" value={depot.overdue} max={depot.total} color="bg-red-500" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function RequestsTab() {
  const { data, isLoading, error } = useFetch<any>("/api/fleet/reports/requests");

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { total, statusBreakdown, approvalMetrics } = data;

  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING_FLEET_APPROVAL: { label: "Pending Approval", color: "bg-amber-500" },
    AUTO_APPROVED: { label: "Auto-Approved", color: "bg-blue-500" },
    APPROVED_BOOKING_PENDING_PROVIDER: { label: "Approved", color: "bg-emerald-500" },
    MODIFIED_PENDING_DRIVER_CONFIRMATION: { label: "Modified", color: "bg-purple-500" },
    DECLINED: { label: "Declined", color: "bg-red-500" },
    CANCELLED_BY_DRIVER: { label: "Cancelled", color: "bg-slate-400" },
    CANCELLED_BY_FLEET: { label: "Fleet Cancelled", color: "bg-slate-500" },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div {...fadeUp} transition={{ delay: 0 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-slate-900">{total}</div>
            <div className="text-sm text-slate-500 mt-1">Total Requests</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-emerald-600">{approvalMetrics.approvalRate}%</div>
            <div className="text-sm text-slate-500 mt-1">Approval Rate</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-blue-600">{approvalMetrics.avgDecisionTimeHours}h</div>
            <div className="text-sm text-slate-500 mt-1">Avg Decision Time</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.15 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-purple-600">{approvalMetrics.autoApproved}</div>
            <div className="text-sm text-slate-500 mt-1">Auto-Approved</div>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Status Distribution</h3>
            <div className="space-y-3">
              {Object.entries(statusBreakdown).map(([status, count]) => {
                const info = statusLabels[status] || { label: status.replace(/_/g, " "), color: "bg-slate-400" };
                return (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-3 w-3 rounded-full", info.color)} />
                      <span className="text-sm text-slate-700">{info.label}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{count as number}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.25 }}>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Decision Breakdown</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Approved</span>
                <span className="font-semibold text-emerald-600">{approvalMetrics.approved}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Modified</span>
                <span className="font-semibold text-purple-600">{approvalMetrics.modified}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Declined</span>
                <span className="font-semibold text-red-600">{approvalMetrics.declined}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-600">Auto-Approved</span>
                <span className="font-semibold text-blue-600">{approvalMetrics.autoApproved}</span>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function ProgramsTab() {
  const { data, isLoading, error } = useFetch<any>("/api/fleet/reports/programs");

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { summary, programs } = data;

  const cadenceLabels: Record<string, string> = {
    WEEKLY: "Weekly",
    BIWEEKLY: "Bi-Weekly",
    MONTHLY: "Monthly",
    EVERY_X_DAYS: "Custom",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div {...fadeUp} transition={{ delay: 0 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-slate-900">{summary.totalPrograms}</div>
            <div className="text-sm text-slate-500 mt-1">Total Programs</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-emerald-600">{summary.activePrograms}</div>
            <div className="text-sm text-slate-500 mt-1">Active</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-slate-400">{summary.inactivePrograms}</div>
            <div className="text-sm text-slate-500 mt-1">Inactive</div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.15 }}>
          <Card className="p-5 text-center">
            <div className="text-3xl font-bold text-blue-600">{summary.totalTasksGenerated}</div>
            <div className="text-sm text-slate-500 mt-1">Tasks Generated</div>
          </Card>
        </motion.div>
      </div>

      <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Program Performance</h3>
          {programs.length === 0 ? (
            <p className="text-slate-500 text-sm">No programs found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 text-slate-600 font-medium">Program</th>
                    <th className="text-left py-3 px-2 text-slate-600 font-medium">Cadence</th>
                    <th className="text-center py-3 px-2 text-slate-600 font-medium">Status</th>
                    <th className="text-center py-3 px-2 text-slate-600 font-medium">Total Tasks</th>
                    <th className="text-center py-3 px-2 text-slate-600 font-medium">Pending</th>
                    <th className="text-center py-3 px-2 text-slate-600 font-medium">Completed</th>
                    <th className="text-center py-3 px-2 text-slate-600 font-medium">Skipped</th>
                    <th className="text-left py-3 px-2 text-slate-600 font-medium">Last Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p: any) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-2 font-medium text-slate-900">{p.name}</td>
                      <td className="py-3 px-2 text-slate-600">{cadenceLabels[p.cadenceType] || p.cadenceType}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={cn(
                          "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold",
                          p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-medium">{p.totalTasks}</td>
                      <td className="py-3 px-2 text-center text-amber-600">{p.tasksByState.PENDING || 0}</td>
                      <td className="py-3 px-2 text-center text-emerald-600">{p.tasksByState.COMPLETED || 0}</td>
                      <td className="py-3 px-2 text-center text-slate-400">{p.tasksByState.SKIPPED || 0}</td>
                      <td className="py-3 px-2 text-slate-600">
                        {p.lastGeneratedAt ? new Date(p.lastGeneratedAt).toLocaleDateString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

// ─── NEW REPORT TABS (Task 2.5) ─────────────────────────────────────────────

function WashActivityTab() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(monthStart.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("");

  const params: Record<string, string> = {};
  if (startDate) params.startDate = new Date(startDate).toISOString();
  if (endDate) params.endDate = new Date(endDate + "T23:59:59Z").toISOString();
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, error } = useFetchParams<any>("/api/fleet/reports/wash-activity", params);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  const bookings = data?.bookings || [];

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Status</option>
            <option value="PROVIDER_CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="SETTLED">Settled</option>
            <option value="CUSTOMER_CANCELLED">Cancelled</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-bold text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">Vehicle</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600 hidden md:table-cell">Driver</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600 hidden lg:table-cell">Provider / Location</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">Service</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-bold text-slate-600">Cost</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No wash activity in this date range.</td></tr>
              ) : bookings.map((b: any) => (
                <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{formatDate(b.date, "MMM d, yyyy")}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{b.vehicle?.unitNumber || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{b.driver?.firstName} {b.driver?.lastName}</td>
                  <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{formatLocationDisplay(b.provider, b.location)}</td>
                  <td className="px-4 py-3 text-slate-600">{b.service}</td>
                  <td className="px-4 py-3"><Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge></td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(b.cost, b.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            {bookings.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={6} className="px-4 py-3 font-bold text-slate-700">
                    Total: {data.totalCount} wash{data.totalCount !== 1 ? "es" : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lg text-slate-900">
                    {formatCurrency(data.totalSpendMinor)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

function VehicleComplianceTab() {
  const { data, isLoading, error } = useFetch<any>("/api/fleet/reports/vehicle-compliance");

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  const vehicles = data?.vehicles || [];
  const statusConfig: Record<string, { label: string; color: string }> = {
    OVERDUE: { label: "Overdue", color: "bg-red-100 text-red-700" },
    DUE_SOON: { label: "Due Soon", color: "bg-amber-100 text-amber-700" },
    CURRENT: { label: "Current", color: "bg-emerald-100 text-emerald-700" },
    UNKNOWN: { label: "Unknown", color: "bg-slate-100 text-slate-500" },
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-bold text-slate-600">Unit #</th>
              <th className="text-left px-4 py-3 font-bold text-slate-600">Type</th>
              <th className="text-left px-4 py-3 font-bold text-slate-600 hidden md:table-cell">Depot</th>
              <th className="text-left px-4 py-3 font-bold text-slate-600">Last Wash</th>
              <th className="text-left px-4 py-3 font-bold text-slate-600">Next Due</th>
              <th className="text-left px-4 py-3 font-bold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">No vehicles found.</td></tr>
            ) : vehicles.map((v: any) => {
              const sc = statusConfig[v.complianceStatus] || statusConfig.UNKNOWN;
              const isOverdue = v.complianceStatus === "OVERDUE";
              return (
                <tr key={v.id} className={cn("border-b border-slate-100 hover:bg-slate-50", isOverdue && "bg-red-50/50 border-l-4 border-l-red-400")}>
                  <td className="px-4 py-3 font-bold text-slate-900">{v.unitNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{v.subtypeCode?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{v.depot?.name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{v.lastWashAtUtc ? new Date(v.lastWashAtUtc).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 text-slate-600">{v.nextWashDueAtUtc ? new Date(v.nextWashDueAtUtc).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3"><Badge className={`${sc.color} text-xs`}>{sc.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SpendingTab() {
  const { data, isLoading, error } = useFetchParams<any>("/api/fleet/reports/spending-summary", {});

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  const byProvider = data?.byProvider || [];
  const byVehicle = data?.byVehicle || [];
  const byMonth = data?.byMonth || [];
  const maxProviderSpend = byProvider[0]?.totalSpendMinor || 1;
  const maxVehicleSpend = byVehicle[0]?.totalSpendMinor || 1;
  const maxMonthSpend = Math.max(...byMonth.map((m: any) => m.totalSpendMinor), 1);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By Provider */}
        <motion.div {...fadeUp} transition={{ delay: 0 }}>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Spend by Provider</h3>
            {byProvider.length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">No spending data</p>
            ) : (
              <div className="space-y-3">
                {byProvider.slice(0, 10).map((p: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 font-medium truncate mr-2">{p.providerName}</span>
                      <span className="font-bold text-slate-900 shrink-0">{formatCurrency(p.totalSpendMinor)} <span className="text-slate-400 font-normal">({p.bookingCount})</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(p.totalSpendMinor / maxProviderSpend) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* By Vehicle */}
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Spend by Vehicle</h3>
            {byVehicle.length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">No spending data</p>
            ) : (
              <div className="space-y-3">
                {byVehicle.slice(0, 10).map((v: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 font-medium">{v.unitNumber} <span className="text-slate-400">({v.subtypeCode?.replace(/_/g, " ")})</span></span>
                      <span className="font-bold text-slate-900 shrink-0">{formatCurrency(v.totalSpendMinor)} <span className="text-slate-400 font-normal">({v.bookingCount})</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${(v.totalSpendMinor / maxVehicleSpend) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Monthly Trend */}
      <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Monthly Spending Trend</h3>
          {byMonth.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No spending data</p>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {byMonth.map((m: any, i: number) => {
                const pct = maxMonthSpend > 0 ? (m.totalSpendMinor / maxMonthSpend) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-slate-900">{formatCurrency(m.totalSpendMinor)}</span>
                    <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden relative" style={{ height: "140px" }}>
                      <div className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-lg transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{m.month.split("-")[1]}/{m.month.split("-")[0].slice(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="p-12 text-center text-slate-500">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
      <p className="mt-3">Loading report data...</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
      <p className="text-slate-700 font-medium">{message}</p>
    </div>
  );
}

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "wash-activity", label: "Wash Activity", icon: Droplets },
  { key: "vehicle-compliance", label: "Vehicle Compliance", icon: Truck },
  { key: "spending", label: "Spending", icon: DollarSign },
  { key: "compliance", label: "Depot Compliance", icon: CheckCircle2 },
  { key: "requests", label: "Requests", icon: Activity },
  { key: "programs", label: "Programs", icon: Layers },
];

export default function FleetReports() {
  const [activeTab, setActiveTab] = React.useState<Tab>("wash-activity");

  return (
    <div className="space-y-6">
      <motion.div {...fadeUp}>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fleet Reports</h1>
            <p className="text-sm text-slate-500">Analytics and insights for your fleet operations</p>
          </div>
        </div>
      </motion.div>

      <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {activeTab === "wash-activity" && <WashActivityTab />}
      {activeTab === "vehicle-compliance" && <VehicleComplianceTab />}
      {activeTab === "spending" && <SpendingTab />}
      {activeTab === "compliance" && <ComplianceTab />}
      {activeTab === "requests" && <RequestsTab />}
      {activeTab === "programs" && <ProgramsTab />}
    </div>
  );
}
