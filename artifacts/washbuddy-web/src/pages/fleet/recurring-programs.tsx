import React, { useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { RotateCcw, Calendar, Building2, Layers, CheckCircle2, XCircle, Clock, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useRecurringPrograms() {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/fleet/recurring-programs`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading, error };
}

const cadenceLabels: Record<string, string> = {
  EVERY_X_DAYS: "Every X Days",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 Weeks",
  MONTHLY: "Monthly",
};

export default function FleetRecurringPrograms() {
  const { data, isLoading } = useRecurringPrograms();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const programs = data?.programs || [];
  const isAdmin = user?.roles?.some((r: any) => ["FLEET_ADMIN", "MAINTENANCE_MANAGER"].includes(r.role));

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Fleet Automation</p>
            <h1 className="text-3xl font-display font-bold text-slate-900">Recurring Programs</h1>
            <p className="text-slate-500 mt-1">Automated wash schedules for your fleet.</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setLocation("/fleet/programs/new")} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> New Program
            </Button>
          )}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          Loading programs...
        </div>
      ) : programs.length === 0 ? (
        <Card className="p-12 text-center">
          <RotateCcw className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No recurring programs configured yet.</p>
          <p className="text-sm text-slate-400 mt-1">Programs automate wash scheduling for groups of vehicles.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {programs.map((p: any) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation(`/fleet/programs/${p.id}`)}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${p.isActive ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{p.name}</h3>
                      <p className="text-sm text-slate-500">{cadenceLabels[p.cadenceType] || p.cadenceType}</p>
                    </div>
                  </div>
                  <Badge className={p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                    {p.isActive ? (
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Inactive</span>
                    )}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-600">
                      {cadenceLabels[p.cadenceType] || p.cadenceType}
                      {p.cadenceType === "EVERY_X_DAYS" && (p.cadenceConfigJson as any)?.intervalDays
                        ? ` (${(p.cadenceConfigJson as any).intervalDays} days)`
                        : ""}
                    </span>
                  </div>

                  {p.scopeType && (
                    <div className="flex items-center gap-2 text-sm">
                      {p.scopeType === "depot" ? (
                        <>
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600">Depot: {p.scopeDepot?.name || "Unknown"}</span>
                        </>
                      ) : p.scopeType === "vehicle_group" ? (
                        <>
                          <Layers className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600">Group: {p.scopeVehicleGroup?.name || "Unknown"}</span>
                        </>
                      ) : (
                        <>
                          <Layers className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600">All Vehicles</span>
                        </>
                      )}
                    </div>
                  )}

                  {(p.cadenceConfigJson as any)?.dayOfWeek !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][(p.cadenceConfigJson as any).dayOfWeek]}
                        {(p.cadenceConfigJson as any).preferredTimeUtc && ` · ${(p.cadenceConfigJson as any).preferredTimeUtc} UTC`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400">
                      {p._count?.generatedTasks || 0} tasks generated
                    </span>
                    {p.lastGeneratedAt && (
                      <span className="text-xs text-slate-400">
                        Last run: {new Date(p.lastGeneratedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
