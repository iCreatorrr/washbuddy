import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Truck, Search, Filter, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, User } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useFleetVehicles(params: Record<string, string>) {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API_BASE}/api/fleet/vehicles?${qs}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load vehicles");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [JSON.stringify(params)]);

  return { data, isLoading, error };
}

function useDepots() {
  const [depots, setDepots] = React.useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/fleet/depots`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setDepots(d.depots || []))
      .catch(() => {});
  }, []);
  return depots;
}

function useVehicleGroups() {
  const [groups, setGroups] = React.useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/fleet/vehicle-groups`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setGroups(d.groups || []))
      .catch(() => {});
  }, []);
  return groups;
}

const categoryLabels: Record<string, string> = {
  motorcoach: "Motorcoach",
  school_bus: "School Bus",
  transit: "Transit",
  minibus: "Minibus",
  cutaway: "Cutaway",
};

const washStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  due_soon: { label: "Due Soon", color: "bg-amber-100 text-amber-700", icon: Clock },
  on_track: { label: "On Track", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  unknown: { label: "Unknown", color: "bg-slate-100 text-slate-500", icon: Truck },
};

export default function FleetVehicles() {
  const urlParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState("");
  const [depot, setDepot] = useState("");
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState(urlParams.get("status") || "");
  const [page, setPage] = useState(1);

  const depots = useDepots();
  const groups = useVehicleGroups();

  const params: Record<string, string> = { page: String(page), limit: "25" };
  if (search) params.search = search;
  if (depot) params.depot = depot;
  if (group) params.group = group;
  if (category) params.category = category;
  if (status) params.status = status;

  const { data, isLoading } = useFleetVehicles(params);
  const vehicles = data?.vehicles || [];
  const pagination = data?.pagination;

  const statusCounts = React.useMemo(() => {
    return { overdue: 0, due_soon: 0, on_track: 0 };
  }, []);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Fleet Vehicles</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">Vehicle Roster</h1>
            <p className="text-slate-500 mt-1">{pagination?.total || 0} vehicles across {depots.length} depots</p>
          </div>
        </div>
      </motion.div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search unit # or plate..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <select
            value={depot}
            onChange={(e) => { setDepot(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Depots</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d._count?.vehicles})</option>
            ))}
          </select>

          <select
            value={group}
            onChange={(e) => { setGroup(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g._count?.members})</option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Types</option>
            <option value="motorcoach">Motorcoach</option>
            <option value="school_bus">School Bus</option>
            <option value="transit">Transit</option>
            <option value="minibus">Minibus</option>
          </select>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Status</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due Soon</option>
            <option value="on_track">On Track</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          Loading vehicles...
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Unit #</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Type</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Depot</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Driver</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Last Wash</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Next Due</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Groups</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">No vehicles match your filters.</td>
                  </tr>
                ) : (
                  vehicles.map((v: any) => {
                    const ws = washStatusConfig[v.washStatus] || washStatusConfig.unknown;
                    const StatusIcon = ws.icon;
                    return (
                      <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-slate-400" />
                            <span className="font-bold text-slate-900">{v.unitNumber}</span>
                          </div>
                          {v.licensePlate && <p className="text-xs text-slate-400 ml-6">{v.licensePlate}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{categoryLabels[v.categoryCode] || v.categoryCode}</td>
                        <td className="px-4 py-3 text-slate-600">{v.depot?.name || "—"}</td>
                        <td className="px-4 py-3">
                          {v.currentDriver ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">{v.currentDriver.firstName} {v.currentDriver.lastName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {v.lastWashAtUtc ? new Date(v.lastWashAtUtc).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {v.nextWashDueAtUtc ? new Date(v.nextWashDueAtUtc).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${ws.color} text-xs flex items-center gap-1 w-fit`}>
                            <StatusIcon className="h-3 w-3" />
                            {ws.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {v.groups?.map((g: any) => (
                              <Badge key={g.id} className="bg-slate-100 text-slate-600 text-xs">{g.name}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
