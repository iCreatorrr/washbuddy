import React, { useEffect, useState } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Settings, Building2, Users, Shield, User, Save, Search, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { toast, Toaster } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useFleetSettings() {
  const [data, setData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  useEffect(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/api/fleet/settings`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [refreshKey]);

  return { data, isLoading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

function useProviderList() {
  const [providers, setProviders] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/locations/search`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        // Extract unique providers from locations
        const seen = new Map();
        for (const loc of d.locations || []) {
          if (loc.provider && !seen.has(loc.provider.id)) {
            seen.set(loc.provider.id, loc.provider);
          }
        }
        setProviders(Array.from(seen.values()));
      })
      .catch(() => {});
  }, []);
  return providers;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  FLEET_ADMIN: { label: "Fleet Admin", color: "bg-red-100 text-red-700" },
  DISPATCHER: { label: "Dispatcher", color: "bg-blue-100 text-blue-700" },
  DRIVER: { label: "Driver", color: "bg-emerald-100 text-emerald-700" },
  MAINTENANCE_MANAGER: { label: "Maintenance", color: "bg-amber-100 text-amber-700" },
  READ_ONLY_ANALYST: { label: "Analyst", color: "bg-purple-100 text-purple-700" },
};

export default function FleetSettings() {
  const { data, isLoading, refresh } = useFleetSettings();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("FLEET_ADMIN");
  const fleet = data?.fleet;
  const allProviders = useProviderList();

  // Policy state
  const [approvedEnabled, setApprovedEnabled] = useState(false);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [spendEnabled, setSpendEnabled] = useState(false);
  const [spendAmount, setSpendAmount] = useState("");
  const [freqEnabled, setFreqEnabled] = useState(false);
  const [freqMax, setFreqMax] = useState("1");
  const [freqDays, setFreqDays] = useState("7");
  const [providerSearch, setProviderSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize policy state from fleet data
  useEffect(() => {
    if (!fleet) return;
    const p = (fleet.requestPolicyJson as any) || {};
    setApprovedEnabled(p.approvedProviderList?.enabled || false);
    setApprovedIds(p.approvedProviderList?.providerIds || []);
    setSpendEnabled(p.spendingLimit?.enabled || false);
    setSpendAmount(p.spendingLimit?.maxAmountMinor ? String(p.spendingLimit.maxAmountMinor / 100) : "");
    setFreqEnabled(p.washFrequency?.enabled || false);
    setFreqMax(String(p.washFrequency?.maxWashes || 1));
    setFreqDays(String(p.washFrequency?.periodDays || 7));
  }, [fleet]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const policy = {
        approvedProviderList: {
          enabled: approvedEnabled,
          providerIds: approvedEnabled ? approvedIds : [],
        },
        spendingLimit: {
          enabled: spendEnabled,
          maxAmountMinor: spendEnabled ? Math.round(parseFloat(spendAmount || "0") * 100) : 0,
        },
        washFrequency: {
          enabled: freqEnabled,
          maxWashes: freqEnabled ? parseInt(freqMax) || 1 : 1,
          periodDays: freqEnabled ? parseInt(freqDays) || 7 : 7,
        },
      };
      const res = await fetch(`${API_BASE}/api/fleet/settings`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestPolicyJson: policy }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed to save"); }
      toast.success("Fleet policies saved");
      refresh();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleProvider = (id: string) => {
    setApprovedIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const filteredProviders = allProviders.filter((p) =>
    !providerSearch || p.name.toLowerCase().includes(providerSearch.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 animate-pulse bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {[1,2].map(i => <div key={i} className="h-48 animate-pulse bg-slate-100 rounded-2xl" />)}
        </div>
        <div className="h-64 animate-pulse bg-slate-100 rounded-2xl" />
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
      <Toaster position="top-right" richColors />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Configuration</p>
          <h1 className="text-3xl font-display font-bold text-slate-900">Fleet Settings</h1>
          <p className="text-slate-500 mt-1">Manage your fleet configuration, team, and policies.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* General Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-slate-500" />
              General Info
            </h2>
            <div className="space-y-4">
              <InfoRow label="Fleet Name" value={fleet.name} />
              <InfoRow label="Status">
                <Badge className={fleet.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{fleet.status}</Badge>
              </InfoRow>
              <InfoRow label="Billing Mode" value={fleet.billingMode || "FLEET_PAYS"} />
              <InfoRow label="Currency" value={fleet.currencyCode || "USD"} />
              <InfoRow label="Timezone" value={fleet.defaultTimezone || "America/New_York"} />
            </div>
          </Card>
        </motion.div>

        {/* Depots */}
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
                        {d.city && <p className="text-xs text-slate-400">{d.city}, {d.regionCode}</p>}
                      </div>
                    </div>
                    <Badge className="bg-slate-200 text-slate-600 text-xs">{d.timezone || "—"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Policies */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-slate-500" />
                Fleet Policies
              </h2>
              {isAdmin && (
                <Button onClick={handleSave} isLoading={saving} className="gap-2" size="sm">
                  <Save className="h-4 w-4" /> Save Policies
                </Button>
              )}
            </div>

            <div className="space-y-6">
              {/* Approved Provider List */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Approved Provider List</h3>
                    <p className="text-sm text-slate-500">Restrict drivers to booking only at approved providers.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={approvedEnabled} onChange={(e) => setApprovedEnabled(e.target.checked)} disabled={!isAdmin} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-50" />
                  </label>
                </div>
                {approvedEnabled && (
                  <div className="mt-3">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text" placeholder="Search providers..." value={providerSearch}
                        onChange={(e) => setProviderSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-xl bg-white p-2">
                      {filteredProviders.map((p) => {
                        const selected = approvedIds.includes(p.id);
                        return (
                          <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selected ? "bg-blue-50" : "hover:bg-slate-50"} ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}>
                            <input type="checkbox" checked={selected} onChange={() => isAdmin && toggleProvider(p.id)} disabled={!isAdmin}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{approvedIds.length} provider{approvedIds.length !== 1 ? "s" : ""} approved</p>
                  </div>
                )}
              </div>

              {/* Spending Limit */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Per-Wash Spending Limit</h3>
                    <p className="text-sm text-slate-500">Set a maximum amount drivers can spend per wash.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={spendEnabled} onChange={(e) => setSpendEnabled(e.target.checked)} disabled={!isAdmin} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-50" />
                  </label>
                </div>
                {spendEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-500">$</span>
                    <Input
                      type="number" step="0.01" min="0" placeholder="200.00"
                      value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)}
                      disabled={!isAdmin} className="max-w-[200px]"
                    />
                    <span className="text-sm text-slate-500">per wash ({fleet.currencyCode || "USD"})</span>
                  </div>
                )}
              </div>

              {/* Wash Frequency Limit */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Wash Frequency Limit</h3>
                    <p className="text-sm text-slate-500">Limit how often each vehicle can be washed.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={freqEnabled} onChange={(e) => setFreqEnabled(e.target.checked)} disabled={!isAdmin} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-50" />
                  </label>
                </div>
                {freqEnabled && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-600">Maximum</span>
                    <Input type="number" min="1" value={freqMax} onChange={(e) => setFreqMax(e.target.value)} disabled={!isAdmin} className="w-20" />
                    <span className="text-sm text-slate-600">wash(es) per vehicle every</span>
                    <Input type="number" min="1" value={freqDays} onChange={(e) => setFreqDays(e.target.value)} disabled={!isAdmin} className="w-20" />
                    <span className="text-sm text-slate-600">days</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Team Members */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
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
                        <td className="py-3 px-3"><Badge className={`text-xs ${rl.color}`}>{rl.label}</Badge></td>
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
