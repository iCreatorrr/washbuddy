import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  Users, Star, Clock, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  X, Droplets, Percent, DollarSign,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

type SortField = "operatorName" | "totalWashes" | "avgDurationMins" | "onTimePercent" | "avgRating" | "complaintsCount";
type SortOrder = "asc" | "desc";

export default function OperatorPerformancePage() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [operators, setOperators] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("totalWashes");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedOperator, setSelectedOperator] = useState<any>(null);

  useEffect(() => {
    if (!providerId) return;
    setIsLoading(true);
    fetch(`${API_BASE}/api/providers/${providerId}/analytics/operators`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setOperators(d.operators || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const sorted = [...operators].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    if (typeof aVal === "string") return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ChevronDown className="h-3 w-3 text-slate-300" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-blue-600" />
    );
  };

  // Performance color coding
  const getPerformanceColor = (rating: number | null) => {
    if (rating === null || rating === 0) return "text-slate-400";
    if (rating >= 4.5) return "text-emerald-600";
    if (rating >= 3.5) return "text-amber-600";
    return "text-red-600";
  };

  const getOnTimeColor = (pct: number) => {
    if (pct >= 90) return "text-emerald-600";
    if (pct >= 75) return "text-amber-600";
    return "text-red-600";
  };

  // ─── Detail Panel ────────────────────────────────────────────────────
  const DetailPanel = () => {
    if (!selectedOperator) return null;
    const op = selectedOperator;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedOperator(null)}>
        <div
          className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{op.operatorName}</h2>
              <p className="text-sm text-slate-500">Operator Details</p>
            </div>
            <button onClick={() => setSelectedOperator(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="p-4 text-center">
              <Droplets className="h-5 w-5 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-slate-900">{op.totalWashes}</p>
              <p className="text-xs text-slate-400">Total Washes</p>
            </Card>
            <Card className="p-4 text-center">
              <Clock className="h-5 w-5 text-purple-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-slate-900">{op.avgDurationMins || "--"}</p>
              <p className="text-xs text-slate-400">Avg Duration (min)</p>
            </Card>
            <Card className="p-4 text-center">
              <Star className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className={`text-2xl font-bold ${getPerformanceColor(op.avgRating)}`}>
                {op.avgRating ? Number(op.avgRating).toFixed(1) : "--"}
              </p>
              <p className="text-xs text-slate-400">Avg Rating</p>
            </Card>
            <Card className="p-4 text-center">
              <Percent className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
              <p className={`text-2xl font-bold ${getOnTimeColor(op.onTimePercent)}`}>
                {op.onTimePercent || 0}%
              </p>
              <p className="text-xs text-slate-400">On-Time Rate</p>
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Complaints</span>
              <span className={`text-sm font-bold ${op.complaintsCount > 0 ? "text-red-600" : "text-slate-400"}`}>
                {op.complaintsCount}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Upsell Rate</span>
              <span className="text-sm font-bold text-slate-700">{op.upsellRate || 0}%</span>
            </div>
          </div>

          <Button variant="outline" className="w-full mt-6" onClick={() => setSelectedOperator(null)}>
            Close
          </Button>
        </div>
      </div>
    );
  };

  // ─── Skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Operator Performance</h1>
          <p className="text-slate-500 mt-2">Track and compare your team's performance metrics.</p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <DetailPanel />

      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Operator Performance</h1>
        <p className="text-slate-500 mt-2">Track and compare your team's performance metrics.</p>
      </div>

      {/* Summary cards */}
      {operators.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Team Size</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{operators.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Washes</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {operators.reduce((sum, op) => sum + (op.totalWashes || 0), 0)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Avg Rating</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {(() => {
                const rated = operators.filter((o) => o.avgRating);
                if (rated.length === 0) return "--";
                return (rated.reduce((sum, o) => sum + Number(o.avgRating), 0) / rated.length).toFixed(1);
              })()}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Complaints</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {operators.reduce((sum, op) => sum + (op.complaintsCount || 0), 0)}
            </p>
          </Card>
        </div>
      )}

      {operators.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No operators found</h3>
          <p className="text-slate-500">Add team members to start tracking operator performance.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th
                    className="text-left py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("operatorName")}
                  >
                    <span className="flex items-center gap-1">Operator <SortIcon field="operatorName" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("totalWashes")}
                  >
                    <span className="flex items-center gap-1 justify-end">Washes <SortIcon field="totalWashes" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("avgDurationMins")}
                  >
                    <span className="flex items-center gap-1 justify-end">Avg Duration <SortIcon field="avgDurationMins" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("onTimePercent")}
                  >
                    <span className="flex items-center gap-1 justify-end">On-Time <SortIcon field="onTimePercent" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("avgRating")}
                  >
                    <span className="flex items-center gap-1 justify-end">Rating <SortIcon field="avgRating" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("complaintsCount")}
                  >
                    <span className="flex items-center gap-1 justify-end">Complaints <SortIcon field="complaintsCount" /></span>
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-600">Upsell %</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((op) => (
                  <tr
                    key={op.operatorId}
                    onClick={() => setSelectedOperator(op)}
                    className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{op.operatorName}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">{op.totalWashes}</td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {op.avgDurationMins ? `${op.avgDurationMins} min` : "--"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${getOnTimeColor(op.onTimePercent)}`}>
                        {op.onTimePercent ? `${op.onTimePercent}%` : "--"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="flex items-center gap-1 justify-end">
                        {op.avgRating ? (
                          <>
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span className={`font-medium ${getPerformanceColor(op.avgRating)}`}>
                              {Number(op.avgRating).toFixed(1)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {op.complaintsCount > 0 ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200">{op.complaintsCount}</Badge>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {op.upsellRate ? `${op.upsellRate}%` : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
