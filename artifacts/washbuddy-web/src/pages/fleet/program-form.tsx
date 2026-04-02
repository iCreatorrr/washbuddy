import React, { useState, useEffect } from "react";
import { Card, Button } from "@/components/ui";
import {
  ArrowLeft, Loader2, CheckCircle2, RotateCcw
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useParams } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ProgramForm() {
  const params = useParams<{ id: string }>();
  const isEdit = !!params.id;
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState("fleet");
  const [scopeDepotId, setScopeDepotId] = useState("");
  const [scopeVehicleGroupId, setScopeVehicleGroupId] = useState("");
  const [cadenceType, setCadenceType] = useState("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [intervalDays, setIntervalDays] = useState("7");
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [serviceName, setServiceName] = useState("");
  const [horizonDays, setHorizonDays] = useState("30");

  const [depots, setDepots] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/fleet/depots`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API_BASE}/api/fleet/vehicle-groups`, { credentials: "include" }).then(r => r.json()),
    ]).then(([d, g]) => {
      setDepots(d.depots || []);
      setGroups(g.groups || []);
    }).catch(() => {});

    if (isEdit) {
      fetch(`${API_BASE}/api/fleet/recurring-programs/${params.id}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => {
          const p = d.program;
          if (p) {
            setName(p.name);
            setScopeType(p.scopeType);
            setScopeDepotId(p.scopeDepotId || "");
            setScopeVehicleGroupId(p.scopeVehicleGroupId || "");
            setCadenceType(p.cadenceType);
            const config = p.cadenceConfigJson || {};
            setDayOfWeek(String(config.dayOfWeek ?? 1));
            setDayOfMonth(String(config.dayOfMonth ?? 1));
            setIntervalDays(String(config.intervalDays ?? 7));
            setPreferredTime(config.preferredTimeUtc || "09:00");
            setServiceName((p.servicePolicyJson || {}).preferredServiceName || "");
            setHorizonDays(String(p.horizonDays || 30));
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cadenceType) return;

    setSubmitting(true);
    try {
      const cadenceConfigJson: any = { preferredTimeUtc: preferredTime };
      if (cadenceType === "WEEKLY" || cadenceType === "BIWEEKLY") {
        cadenceConfigJson.dayOfWeek = parseInt(dayOfWeek);
      } else if (cadenceType === "MONTHLY") {
        cadenceConfigJson.dayOfMonth = parseInt(dayOfMonth);
      } else if (cadenceType === "EVERY_X_DAYS") {
        cadenceConfigJson.intervalDays = parseInt(intervalDays);
      }

      const body: any = {
        name: name.trim(),
        scopeType,
        cadenceType,
        cadenceConfigJson,
        servicePolicyJson: serviceName ? { preferredServiceName: serviceName } : {},
        providerPolicyJson: { mode: "PREFERRED_THEN_FALLBACK" },
        horizonDays: parseInt(horizonDays) || 30,
      };

      if (scopeType === "depot" && scopeDepotId) body.scopeDepotId = scopeDepotId;
      if (scopeType === "vehicle_group" && scopeVehicleGroupId) body.scopeVehicleGroupId = scopeVehicleGroupId;

      const url = isEdit
        ? `${API_BASE}/api/fleet/recurring-programs/${params.id}`
        : `${API_BASE}/api/fleet/recurring-programs`;

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to save");
      } else {
        const d = await res.json();
        setSuccess(true);
        setTimeout(() => {
          setLocation(`/fleet/programs/${d.program.id}`);
        }, 800);
      }
    } catch {}
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
        Loading...
      </div>
    );
  }

  if (success) {
    return (
      <div className="py-12 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
        </motion.div>
        <p className="text-xl font-bold text-slate-900">{isEdit ? "Program Updated!" : "Program Created!"}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => setLocation(isEdit ? `/fleet/programs/${params.id}` : "/fleet/programs")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {isEdit ? "Back to Program" : "Back to Programs"}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
              {isEdit ? "Edit Program" : "New Recurring Program"}
            </h1>
            <p className="text-sm text-slate-500">Configure automated wash scheduling.</p>
          </div>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Basic Info</h2>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Program Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Fleet Wash"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Preferred Service</label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g., Exterior Wash, Full Detail"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Scope</h2>
          <p className="text-sm text-slate-500">Which vehicles does this program cover?</p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "fleet", label: "All Vehicles" },
              { value: "depot", label: "By Depot" },
              { value: "vehicle_group", label: "By Group" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScopeType(opt.value)}
                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  scopeType === opt.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {scopeType === "depot" && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Select Depot</label>
              <select
                value={scopeDepotId}
                onChange={(e) => setScopeDepotId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Choose a depot...</option>
                {depots.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {scopeType === "vehicle_group" && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Select Vehicle Group</label>
              <select
                value={scopeVehicleGroupId}
                onChange={(e) => setScopeVehicleGroupId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Choose a group...</option>
                {groups.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Schedule</h2>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Frequency *</label>
            <select
              value={cadenceType}
              onChange={(e) => setCadenceType(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Every 2 Weeks</option>
              <option value="MONTHLY">Monthly</option>
              <option value="EVERY_X_DAYS">Every X Days</option>
            </select>
          </div>

          {(cadenceType === "WEEKLY" || cadenceType === "BIWEEKLY") && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Day of Week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {cadenceType === "MONTHLY" && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Day of Month</label>
              <input
                type="number"
                min="1"
                max="28"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          )}

          {cadenceType === "EVERY_X_DAYS" && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Interval (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Preferred Time (UTC)</label>
              <input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Planning Horizon (days)</label>
              <input
                type="number"
                min="7"
                max="365"
                value={horizonDays}
                onChange={(e) => setHorizonDays(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
        </Card>

        <Button type="submit" disabled={!name.trim() || submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          {isEdit ? "Update Program" : "Create Program"}
        </Button>
      </form>
    </div>
  );
}
