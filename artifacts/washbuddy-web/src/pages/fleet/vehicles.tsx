import React, { useState, useEffect } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Truck, Search, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, User, Plus, Pencil, X, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { toast, Toaster } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

const SUBTYPE_OPTIONS = [
  { value: "STANDARD", label: "Standard Bus" },
  { value: "COACH", label: "Coach" },
  { value: "MINIBUS", label: "Mini Bus" },
  { value: "SHUTTLE", label: "Shuttle" },
  { value: "DOUBLE_DECKER", label: "Double Decker" },
  { value: "SCHOOL_BUS", label: "School Bus" },
  { value: "ARTICULATED", label: "Articulated" },
];

function useFleetVehicles(params: Record<string, string>, refreshKey: number) {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API_BASE}/api/fleet/vehicles?${qs}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load vehicles"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [JSON.stringify(params), refreshKey]);

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

function useFleetDrivers() {
  const [drivers, setDrivers] = React.useState<any[]>([]);
  useEffect(() => {
    // The fleet/overview endpoint returns totalDrivers but not the list.
    // Use the fleet members from settings or a dedicated endpoint.
    fetch(`${API_BASE}/api/fleet/settings`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        const members = d.members || [];
        setDrivers(members.filter((m: any) => m.role === "DRIVER" && m.isActive));
      })
      .catch(() => {});
  }, []);
  return drivers;
}

const washStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  due_soon: { label: "Due Soon", color: "bg-amber-100 text-amber-700", icon: Clock },
  on_track: { label: "On Track", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  unknown: { label: "Unknown", color: "bg-slate-100 text-slate-500", icon: Truck },
};

// ─── Vehicle Form Dialog ──────────────────────────────────────────────────

interface VehicleFormData {
  unitNumber: string;
  subtypeCode: string;
  lengthInches: string;
  heightInches: string;
  hasRestroom: boolean;
  licensePlate: string;
  depotId: string;
}

function VehicleFormDialog({
  open, onClose, editVehicle, depots, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  editVehicle: any | null;
  depots: any[];
  onSuccess: () => void;
}) {
  const isEdit = !!editVehicle;
  const [form, setForm] = useState<VehicleFormData>({
    unitNumber: "", subtypeCode: "STANDARD", lengthInches: "", heightInches: "",
    hasRestroom: false, licensePlate: "", depotId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editVehicle) {
      setForm({
        unitNumber: editVehicle.unitNumber || "",
        subtypeCode: editVehicle.subtypeCode || "STANDARD",
        lengthInches: String(editVehicle.lengthInches || ""),
        heightInches: String(editVehicle.heightInches || ""),
        hasRestroom: editVehicle.hasRestroom || false,
        licensePlate: editVehicle.licensePlate || "",
        depotId: editVehicle.depotId || "",
      });
    } else {
      setForm({ unitNumber: "", subtypeCode: "STANDARD", lengthInches: "", heightInches: "", hasRestroom: false, licensePlate: "", depotId: "" });
    }
    setErrors({});
  }, [editVehicle, open]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.unitNumber.trim()) e.unitNumber = "Required";
    const len = parseInt(form.lengthInches);
    if (!form.lengthInches || isNaN(len) || len <= 0) e.lengthInches = "Must be a positive number";
    const hgt = parseInt(form.heightInches);
    if (!form.heightInches || isNaN(hgt) || hgt <= 0) e.heightInches = "Must be a positive number";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        unitNumber: form.unitNumber.trim(),
        categoryCode: "BUS",
        subtypeCode: form.subtypeCode,
        lengthInches: parseInt(form.lengthInches),
        heightInches: parseInt(form.heightInches),
        hasRestroom: form.hasRestroom,
        licensePlate: form.licensePlate.trim() || null,
        depotId: form.depotId || null,
      };
      const url = isEdit ? `${API_BASE}/api/fleet/vehicles/${editVehicle.id}` : `${API_BASE}/api/fleet/vehicles`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save vehicle");
      }
      toast.success(isEdit ? "Vehicle updated" : "Vehicle added");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{isEdit ? "Edit Vehicle" : "Add Vehicle"}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Unit Number *</Label>
            <Input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="e.g., NEB-101" />
            {errors.unitNumber && <p className="text-xs text-red-600 mt-1">{errors.unitNumber}</p>}
          </div>

          <div>
            <Label>Vehicle Type *</Label>
            <select value={form.subtypeCode} onChange={(e) => setForm({ ...form, subtypeCode: e.target.value })}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              {SUBTYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Length (inches) *</Label>
              <Input type="number" value={form.lengthInches} onChange={(e) => setForm({ ...form, lengthInches: e.target.value })} placeholder="e.g., 480" />
              <p className="text-xs text-slate-400 mt-0.5">480 = 40ft bus</p>
              {errors.lengthInches && <p className="text-xs text-red-600 mt-1">{errors.lengthInches}</p>}
            </div>
            <div>
              <Label>Height (inches) *</Label>
              <Input type="number" value={form.heightInches} onChange={(e) => setForm({ ...form, heightInches: e.target.value })} placeholder="e.g., 138" />
              <p className="text-xs text-slate-400 mt-0.5">138 = standard bus</p>
              {errors.heightInches && <p className="text-xs text-red-600 mt-1">{errors.heightInches}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="hasRestroom" checked={form.hasRestroom} onChange={(e) => setForm({ ...form, hasRestroom: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <Label htmlFor="hasRestroom" className="mb-0">Has Restroom</Label>
          </div>

          <div>
            <Label>License Plate</Label>
            <Input value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} placeholder="Optional" />
          </div>

          <div>
            <Label>Depot</Label>
            <select value={form.depotId} onChange={(e) => setForm({ ...form, depotId: e.target.value })}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">No depot assigned</option>
              {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} isLoading={saving}>
            {isEdit ? "Save Changes" : "Add Vehicle"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Driver Assignment Dialog ───────────────────────────────────────────────

function DriverAssignmentDialog({
  open, onClose, vehicle, fleetDrivers, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  vehicle: any;
  fleetDrivers: any[];
  onSuccess: () => void;
}) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && vehicle) {
      setAssignments(vehicle.driverAssignments || []);
    }
  }, [open, vehicle]);

  const assignedDriverIds = new Set(assignments.map((a: any) => a.driverUserId || a.driver?.id));
  const availableDrivers = fleetDrivers.filter((d) => !assignedDriverIds.has(d.userId));

  const handleAssign = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/vehicles/${vehicle.id}/assign-driver`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      const data = await res.json();
      setAssignments((prev) => [...prev, data.assignment]);
      toast.success("Driver assigned");
      onSuccess();
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleRemove = async (assignmentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/vehicles/${vehicle.id}/assign-driver/${assignmentId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove");
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      toast.success("Driver removed");
      onSuccess();
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  if (!open || !vehicle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">Drivers — {vehicle.unitNumber}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="space-y-2 mb-4">
          {assignments.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No drivers assigned.</p>
          ) : assignments.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-medium text-sm text-slate-900">{a.driver?.firstName} {a.driver?.lastName}</span>
                <span className="text-xs text-slate-400">{a.driver?.email}</span>
              </div>
              <button onClick={() => handleRemove(a.id)} disabled={loading}
                className="p-1 hover:bg-red-100 rounded-lg text-red-500 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {availableDrivers.length > 0 && (
          <div>
            <Label className="mb-2">Assign a driver</Label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {availableDrivers.map((d) => (
                <button key={d.userId} onClick={() => handleAssign(d.userId)} disabled={loading}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-blue-50 text-left transition-colors text-sm">
                  <UserPlus className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-slate-700">{d.user?.firstName || d.firstName} {d.user?.lastName || d.lastName}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function FleetVehicles() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("FLEET_ADMIN");
  const urlParams = new URLSearchParams(window.location.search);

  const [search, setSearch] = useState("");
  const [depot, setDepot] = useState("");
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState(urlParams.get("status") || "");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [driverDialogVehicle, setDriverDialogVehicle] = useState<any>(null);

  const depots = useDepots();
  const groups = useVehicleGroups();
  const fleetDrivers = useFleetDrivers();

  const params: Record<string, string> = { page: String(page), limit: "25" };
  if (search) params.search = search;
  if (depot) params.depot = depot;
  if (group) params.group = group;
  if (category) params.category = category;
  if (status) params.status = status;

  const { data, isLoading } = useFleetVehicles(params, refreshKey);
  const vehicles = data?.vehicles || [];
  const pagination = data?.pagination;

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      <VehicleFormDialog
        open={formOpen || !!editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        editVehicle={editTarget}
        depots={depots}
        onSuccess={refresh}
      />

      <DriverAssignmentDialog
        open={!!driverDialogVehicle}
        onClose={() => setDriverDialogVehicle(null)}
        vehicle={driverDialogVehicle}
        fleetDrivers={fleetDrivers}
        onSuccess={refresh}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Fleet Vehicles</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">Vehicle Roster</h1>
            <p className="text-slate-500 mt-1">{pagination?.total || 0} vehicles across {depots.length} depots</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Vehicle
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search unit # or plate..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <select value={depot} onChange={(e) => { setDepot(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Depots</option>
            {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Status</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due Soon</option>
            <option value="on_track">On Track</option>
          </select>
        </div>
      </Card>

      {/* Table */}
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
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Driver(s)</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Last Wash</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Next Due</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-bold text-slate-600">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-12 text-slate-400">No vehicles match your filters.</td></tr>
                ) : vehicles.map((v: any) => {
                  const ws = washStatusConfig[v.washStatus] || washStatusConfig.unknown;
                  const StatusIcon = ws.icon;
                  const driverCount = v.driverAssignments?.length || (v.currentDriver ? 1 : 0);
                  return (
                    <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-slate-400" />
                          <span className="font-bold text-slate-900">{v.unitNumber}</span>
                        </div>
                        {v.licensePlate && <p className="text-xs text-slate-400 ml-6">{v.licensePlate}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{SUBTYPE_OPTIONS.find((o) => o.value === v.subtypeCode)?.label || v.subtypeCode}</td>
                      <td className="px-4 py-3 text-slate-600">{v.depot?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => isAdmin && setDriverDialogVehicle(v)} className={`flex items-center gap-1.5 ${isAdmin ? "hover:text-blue-600 cursor-pointer" : ""}`}>
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {v.currentDriver ? (
                            <span className="text-slate-700">{v.currentDriver.firstName} {v.currentDriver.lastName}{driverCount > 1 ? ` +${driverCount - 1}` : ""}</span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.lastWashAtUtc ? new Date(v.lastWashAtUtc).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{v.nextWashDueAtUtc ? new Date(v.nextWashDueAtUtc).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${ws.color} text-xs flex items-center gap-1 w-fit`}>
                          <StatusIcon className="h-3 w-3" />{ws.label}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditTarget(v)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors" title="Edit vehicle">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDriverDialogVehicle(v)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors" title="Manage drivers">
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
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
        </Card>
      )}
    </div>
  );
}
