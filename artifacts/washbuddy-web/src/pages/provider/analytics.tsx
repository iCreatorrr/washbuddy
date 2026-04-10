import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Users, Star,
  Droplets, CalendarRange, Percent, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

const RANGE_OPTIONS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Year to date", days: 0 },
] as const;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [rangeDays, setRangeDays] = useState(30);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"revenue" | "operations">("revenue");

  const [overview, setOverview] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getDateRange = useCallback(() => {
    const end = new Date();
    let start: Date;
    if (rangeDays === 0) {
      start = new Date(end.getFullYear(), 0, 1);
    } else {
      start = new Date(Date.now() - rangeDays * 86400000);
    }
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [rangeDays]);

  useEffect(() => {
    if (!providerId) return;
    const { startDate, endDate } = getDateRange();
    setIsLoading(true);

    const params = new URLSearchParams({ startDate, endDate });

    Promise.all([
      fetch(`${API_BASE}/api/providers/${providerId}/analytics/overview?${params}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE}/api/providers/${providerId}/analytics/revenue?${params}`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([ov, rev]) => {
        setOverview(ov);
        setRevenue(rev);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, getDateRange]);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label || "Custom";
  const currency = overview?.currencyCode || "USD";

  // ─── Metric Card ─────────────────────────────────────────────────────
  const MetricCard = ({
    icon: Icon,
    iconColor,
    label,
    value,
    change,
    suffix,
  }: {
    icon: React.ElementType;
    iconColor: string;
    label: string;
    value: string;
    change?: number | null;
    suffix?: string;
  }) => (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">
        {value}
        {suffix && <span className="text-sm font-medium text-slate-400 ml-1">{suffix}</span>}
      </p>
      {change !== undefined && change !== null && (
        <div className="flex items-center gap-1 mt-2">
          {change >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={`text-xs font-semibold ${change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {change >= 0 ? "+" : ""}{change}%
          </span>
          <span className="text-xs text-slate-400">vs prev period</span>
        </div>
      )}
    </Card>
  );

  // ─── CSS Bar Chart ───────────────────────────────────────────────────
  const BarChart = ({
    data,
    labelKey,
    valueKey,
    color = "bg-blue-500",
    formatValue,
  }: {
    data: any[];
    labelKey: string;
    valueKey: string;
    color?: string;
    formatValue?: (v: number) => string;
  }) => {
    if (!data || data.length === 0) {
      return <p className="text-sm text-slate-400 text-center py-8">No data available</p>;
    }
    const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
    return (
      <div className="space-y-3">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-28 truncate shrink-0">{d[labelKey]}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                style={{ width: `${Math.max((d[valueKey] / max) * 100, 2)}%` }}
              >
                <span className="text-[10px] font-bold text-white whitespace-nowrap">
                  {formatValue ? formatValue(d[valueKey]) : d[valueKey]}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── Trend Chart (CSS) ───────────────────────────────────────────────
  const TrendChart = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0) {
      return <p className="text-sm text-slate-400 text-center py-8">No trend data</p>;
    }
    const max = Math.max(...data.map((d) => d.totalMinor || 0), 1);
    const barWidth = Math.max(100 / data.length - 1, 2);
    return (
      <div className="flex items-end gap-px h-48 px-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
            <div
              className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors min-h-[2px]"
              style={{ height: `${Math.max((d.totalMinor / max) * 100, 1)}%` }}
            />
            <span className="text-[9px] text-slate-400 mt-1 hidden lg:block">
              {d.date?.slice(5)}
            </span>
            <div className="absolute -top-8 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
              {formatCurrency(d.totalMinor, currency)} ({d.count})
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── Skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-2">Track performance and revenue metrics.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
        <Card className="h-64 animate-pulse bg-slate-100 border-none" />
      </div>
    );
  }

  // ─── Empty ───────────────────────────────────────────────────────────
  if (!overview) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-2">Track performance and revenue metrics.</p>
        </div>
        <Card className="p-12 text-center">
          <BarChart3 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No analytics data yet</h3>
          <p className="text-slate-500">Complete some bookings to see your performance metrics.</p>
        </Card>
      </div>
    );
  }

  const washChange = pctChange(overview.totalWashes, overview.totalWashesPrevPeriod);
  const revChange = pctChange(overview.totalRevenueMinor, overview.totalRevenuePrevPeriodMinor);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-2">Track performance and revenue metrics.</p>
        </div>

        {/* Date range picker */}
        <div className="relative">
          <button
            onClick={() => setRangeOpen(!rangeOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
          >
            <CalendarRange className="h-4 w-4 text-slate-400" />
            {rangeLabel}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {rangeOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 w-44">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => { setRangeDays(opt.days); setRangeOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${
                    rangeDays === opt.days ? "font-bold text-blue-600" : "text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          icon={Droplets}
          iconColor="bg-blue-100 text-blue-600"
          label="Total Washes"
          value={String(overview.totalWashes || 0)}
          change={washChange}
        />
        <MetricCard
          icon={DollarSign}
          iconColor="bg-emerald-100 text-emerald-600"
          label="Revenue"
          value={formatCurrency(overview.totalRevenueMinor || 0, currency)}
          change={revChange}
        />
        <MetricCard
          icon={Star}
          iconColor="bg-amber-100 text-amber-600"
          label="Average Rating"
          value={overview.averageRating ? String(overview.averageRating) : "--"}
          suffix={overview.averageRating ? "/ 5" : undefined}
        />
        <MetricCard
          icon={Percent}
          iconColor="bg-purple-100 text-purple-600"
          label="Bay Utilization"
          value={`${overview.bayUtilizationPercent || 0}%`}
        />
        <MetricCard
          icon={Users}
          iconColor="bg-cyan-100 text-cyan-600"
          label="New Clients"
          value={String(overview.newClients || 0)}
        />
        <MetricCard
          icon={TrendingUp}
          iconColor="bg-pink-100 text-pink-600"
          label="Repeat Client Rate"
          value={`${overview.repeatClientPercent || 0}%`}
        />
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 w-fit">
        {(["revenue", "operations"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "revenue" && revenue && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend */}
          <Card className="p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue Trend</h3>
            <TrendChart data={revenue.trend || []} />
          </Card>

          {/* By Service Type */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue by Service</h3>
            <BarChart
              data={revenue.byServiceType || []}
              labelKey="serviceName"
              valueKey="totalMinor"
              color="bg-blue-500"
              formatValue={(v) => formatCurrency(v, currency)}
            />
          </Card>

          {/* By Vehicle Class */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue by Vehicle Class</h3>
            <BarChart
              data={revenue.byVehicleClass || []}
              labelKey="vehicleClass"
              valueKey="totalMinor"
              color="bg-emerald-500"
              formatValue={(v) => formatCurrency(v, currency)}
            />
          </Card>

          {/* By Booking Source */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue by Source</h3>
            <BarChart
              data={revenue.byBookingSource || []}
              labelKey="source"
              valueKey="totalMinor"
              color="bg-purple-500"
              formatValue={(v) => formatCurrency(v, currency)}
            />
          </Card>
        </div>
      )}

      {activeTab === "operations" && revenue && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Washes Trend */}
          <Card className="p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Washes per Day</h3>
            <div className="flex items-end gap-px h-48 px-2">
              {(revenue.trend || []).map((d: any, i: number) => {
                const max = Math.max(...(revenue.trend || []).map((t: any) => t.count || 0), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                    <div
                      className="w-full bg-cyan-500 rounded-t hover:bg-cyan-600 transition-colors min-h-[2px]"
                      style={{ height: `${Math.max((d.count / max) * 100, 1)}%` }}
                    />
                    <span className="text-[9px] text-slate-400 mt-1 hidden lg:block">
                      {d.date?.slice(5)}
                    </span>
                    <div className="absolute -top-8 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {d.count} washes
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Washes by Service */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Washes by Service</h3>
            <BarChart
              data={revenue.byServiceType || []}
              labelKey="serviceName"
              valueKey="count"
              color="bg-cyan-500"
            />
          </Card>

          {/* Washes by Vehicle Class */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Washes by Vehicle Class</h3>
            <BarChart
              data={revenue.byVehicleClass || []}
              labelKey="vehicleClass"
              valueKey="count"
              color="bg-teal-500"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
