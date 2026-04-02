import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  ArrowLeft, RotateCcw, Calendar, Building2, Layers, CheckCircle2, XCircle,
  Clock, Truck, Play, Loader2, Settings, Trash2, Edit3, AlertTriangle, Zap
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useParams } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

const cadenceLabels: Record<string, string> = {
  EVERY_X_DAYS: "Every X Days",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 Weeks",
  MONTHLY: "Monthly",
};

const taskStateConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  BOOKING_ATTEMPTED: { label: "Booking Attempted", color: "bg-blue-100 text-blue-700" },
  BOOKED: { label: "Booked", color: "bg-emerald-100 text-emerald-700" },
  EXCEPTION: { label: "Exception", color: "bg-red-100 text-red-700" },
  SKIPPED: { label: "Skipped", color: "bg-slate-100 text-slate-500" },
};

export default function ProgramDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/fleet/recurring-programs/${params.id}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Program not found" : "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, [params.id]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/recurring-programs/${params.id}/toggle`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) load();
      else {
        const d = await res.json();
        alert(d.message || "Failed to toggle");
      }
    } catch {}
    setToggling(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/recurring-programs/${params.id}/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        setGenResult(d);
        load();
      } else {
        const d = await res.json();
        alert(d.message || "Failed to generate");
      }
    } catch {}
    setGenerating(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this recurring program? Pending tasks will also be removed.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/fleet/recurring-programs/${params.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setLocation("/fleet/programs");
      } else {
        const d = await res.json();
        alert(d.message || "Failed to delete");
      }
    } catch {}
    setDeleting(false);
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
        Loading program...
      </div>
    );
  }

  if (error || !data?.program) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-700 font-medium">{error || "Program not found"}</p>
        <button onClick={() => setLocation("/fleet/programs")} className="text-blue-600 hover:underline text-sm mt-2">
          Back to Programs
        </button>
      </div>
    );
  }

  const program = data.program;
  const tasks = program.generatedTasks || [];
  const cadenceConfig = program.cadenceConfigJson as any;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => setLocation("/fleet/programs")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Programs
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-1">Recurring Program</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">{program.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={program.isActive ? "bg-emerald-100 text-emerald-700 px-3 py-1" : "bg-slate-100 text-slate-500 px-3 py-1"}>
              {program.isActive ? (
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
              ) : (
                <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
              )}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleToggle} disabled={toggling}>
              {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : program.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-slate-500" /> Configuration
          </h2>

          <DetailRow icon={Calendar} label="Cadence" value={cadenceLabels[program.cadenceType] || program.cadenceType} />

          {program.scopeType === "fleet" && (
            <DetailRow icon={Layers} label="Scope" value="All Fleet Vehicles" />
          )}
          {program.scopeType === "depot" && program.scopeDepot && (
            <DetailRow icon={Building2} label="Scope" value={`Depot: ${program.scopeDepot.name}`} />
          )}
          {program.scopeType === "vehicle_group" && program.scopeVehicleGroup && (
            <DetailRow icon={Layers} label="Scope" value={`Group: ${program.scopeVehicleGroup.name}`} />
          )}

          <DetailRow icon={Clock} label="Horizon" value={`${program.horizonDays} days`} />

          {cadenceConfig.dayOfWeek !== undefined && (
            <DetailRow icon={Calendar} label="Day" value={["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][cadenceConfig.dayOfWeek] || `Day ${cadenceConfig.dayOfWeek}`} />
          )}
          {cadenceConfig.dayOfMonth && (
            <DetailRow icon={Calendar} label="Day of Month" value={`${cadenceConfig.dayOfMonth}`} />
          )}
          {cadenceConfig.preferredTimeUtc && (
            <DetailRow icon={Clock} label="Preferred Time" value={`${cadenceConfig.preferredTimeUtc} UTC`} />
          )}

          {program.servicePolicyJson && (program.servicePolicyJson as any).preferredServiceName && (
            <DetailRow icon={Zap} label="Service" value={(program.servicePolicyJson as any).preferredServiceName} />
          )}

          {program.lastGeneratedAt && (
            <DetailRow icon={Clock} label="Last Generated" value={new Date(program.lastGeneratedAt).toLocaleString()} />
          )}

          <DetailRow icon={RotateCcw} label="Total Tasks" value={`${program._count?.generatedTasks || 0}`} />

          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <Button onClick={() => setLocation(`/fleet/programs/${params.id}/edit`)} variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button onClick={handleDelete} disabled={deleting} variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Play className="h-5 w-5 text-indigo-500" /> Task Generation
            </h2>
            <Button onClick={handleGenerate} disabled={generating} className="bg-indigo-600 hover:bg-indigo-700 text-white" size="sm">
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run Now
            </Button>
          </div>

          {genResult && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Generation Complete
                </p>
                <p className="text-sm text-emerald-700 mt-1">
                  Created {genResult.generated} tasks for {genResult.vehicleCount} vehicles over {genResult.horizonDays} days.
                </p>
              </div>
            </motion.div>
          )}

          <p className="text-sm text-slate-500">
            Generates wash tasks for all vehicles in scope based on the cadence schedule. Tasks appear below once generated.
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Truck className="h-5 w-5 text-slate-500" />
          Generated Tasks ({program._count?.generatedTasks || 0})
        </h2>

        {tasks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">No tasks generated yet. Click "Run Now" to create tasks based on the schedule.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 text-slate-500 font-medium">Vehicle</th>
                  <th className="pb-2 text-slate-500 font-medium">Due Date</th>
                  <th className="pb-2 text-slate-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task: any) => {
                  const ts = taskStateConfig[task.generationState] || taskStateConfig.PENDING;
                  return (
                    <tr key={task.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 font-medium text-slate-900">
                        {task.vehicle?.unitNumber}
                        <span className="text-slate-400 ml-1 text-xs">{task.vehicle?.categoryCode}</span>
                      </td>
                      <td className="py-2.5 text-slate-600">
                        {new Date(task.dueAtUtc).toLocaleDateString()}
                        <span className="text-slate-400 ml-1 text-xs">{new Date(task.dueAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="py-2.5">
                        <Badge className={`${ts.color} text-xs`}>{ts.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
