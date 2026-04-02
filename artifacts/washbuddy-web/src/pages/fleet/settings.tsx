import React, { useEffect } from "react";
import { Card, Badge } from "@/components/ui";
import { Settings, Building2, Users, Shield, FileText, User, Mail } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useFleetSettings() {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/fleet/settings`, { credentials: "include" })
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

const roleLabels: Record<string, { label: string; color: string }> = {
  FLEET_ADMIN: { label: "Fleet Admin", color: "bg-red-100 text-red-700" },
  DISPATCHER: { label: "Dispatcher", color: "bg-blue-100 text-blue-700" },
  DRIVER: { label: "Driver", color: "bg-emerald-100 text-emerald-700" },
  MAINTENANCE_MANAGER: { label: "Maintenance", color: "bg-amber-100 text-amber-700" },
  READ_ONLY_ANALYST: { label: "Analyst", color: "bg-purple-100 text-purple-700" },
};

export default function FleetSettings() {
  const { data, isLoading } = useFleetSettings();
  const fleet = data?.fleet;

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
        Loading settings...
      </div>
    );
  }

  if (!fleet) {
    return (
      <Card className="p-12 text-center">
        <Settings className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Unable to load fleet settings.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Configuration</p>
          <h1 className="text-3xl font-display font-bold text-slate-900">Fleet Settings</h1>
          <p className="text-slate-500 mt-1">Manage your fleet configuration, team, and policies.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-slate-500" />
              General Info
            </h2>
            <div className="space-y-4">
              <InfoRow label="Fleet Name" value={fleet.name} />
              <InfoRow label="Status">
                <Badge className={fleet.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                  {fleet.status}
                </Badge>
              </InfoRow>
              <InfoRow label="Billing Mode" value={fleet.billingMode || "INVOICE"} />
              <InfoRow label="Timezone" value={fleet.defaultTimezone || "America/New_York"} />
              <InfoRow label="Max Driver Distance" value={fleet.maxDriverRequestDistanceMi ? `${fleet.maxDriverRequestDistanceMi} mi` : "Unlimited"} />
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-slate-500" />
              Depots ({fleet.depots?.length || 0})
            </h2>
            {fleet.depots?.length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">No depots configured.</p>
            ) : (
              <div className="space-y-3">
                {fleet.depots?.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="font-medium text-sm text-slate-900">{d.name}</p>
                        {d.city && <p className="text-xs text-slate-400">{d.city}, {d.state}</p>}
                      </div>
                    </div>
                    <Badge className="bg-slate-200 text-slate-600 text-xs">{d.timezone || "—"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-slate-500" />
              Team Members ({fleet.memberships?.length || 0})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-bold text-slate-600">Name</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-600">Email</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-600">Role</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fleet.memberships?.map((m: any) => {
                    const rl = roleLabels[m.role] || { label: m.role, color: "bg-slate-100 text-slate-600" };
                    return (
                      <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                              {m.user?.firstName?.[0]}{m.user?.lastName?.[0]}
                            </div>
                            <span className="font-medium text-slate-900">{m.user?.firstName} {m.user?.lastName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{m.user?.email}</td>
                        <td className="py-3 px-3">
                          <Badge className={`text-xs ${rl.color}`}>{rl.label}</Badge>
                        </td>
                        <td className="py-3 px-3">
                          <Badge className={m.isActive ? "bg-emerald-100 text-emerald-700 text-xs" : "bg-slate-100 text-slate-500 text-xs"}>
                            {m.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {fleet.policyOverrides?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-slate-500" />
                Policy Overrides ({fleet.policyOverrides.length})
              </h2>
              <div className="space-y-3">
                {fleet.policyOverrides.map((po: any) => (
                  <div key={po.id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <p className="font-medium text-sm text-slate-900">{po.policyKey}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Scope: {po.scopeType} {po.scopeDepotId ? `(Depot)` : po.scopeVehicleGroupId ? "(Group)" : "(Fleet-wide)"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-slate-700">{po.policyValue}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {po.effectiveFrom ? `From ${new Date(po.effectiveFrom).toLocaleDateString()}` : "Always"}
                        {po.effectiveUntil ? ` to ${new Date(po.effectiveUntil).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      {children || <span className="text-sm font-medium text-slate-900">{value || "—"}</span>}
    </div>
  );
}
