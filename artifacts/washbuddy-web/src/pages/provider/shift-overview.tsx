import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  Calendar, ChevronLeft, ChevronRight, Truck, Users, Gauge, DollarSign,
  BarChart3, Globe, Phone, Footprints,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { formatCurrency } from "@/lib/utils";
import { format, addDays, subDays } from "date-fns";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  SMALL: "Small / Minibus",
  MEDIUM: "Medium / Standard",
  LARGE: "Large / Coach",
  EXTRA_LARGE: "Extra Large",
};

const VEHICLE_CLASS_COLORS: Record<string, string> = {
  SMALL: "bg-blue-500",
  MEDIUM: "bg-emerald-500",
  LARGE: "bg-amber-500",
  EXTRA_LARGE: "bg-purple-500",
};

export default function ShiftOverviewPage() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch locations
  useEffect(() => {
    if (!providerId) return;
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const locs = d.locations || [];
        setLocations(locs);
        if (locs.length > 0 && !selectedLocation) setSelectedLocation(locs[0].id);
      })
      .catch(() => {});
  }, [providerId]);

  // Fetch shift data
  useEffect(() => {
    if (!providerId || !selectedLocation) return;
    setIsLoading(true);
    fetch(
      `${API_BASE}/api/providers/${providerId}/locations/${selectedLocation}/shift-overview?date=${selectedDate}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, [providerId, selectedLocation, selectedDate]);

  const prevDay = () => setSelectedDate(format(subDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd"));
  const nextDay = () => setSelectedDate(format(addDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd"));
  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  const currency = data?.currencyCode || "USD";

  // ─── Capacity Gauge ──────────────────────────────────────────────────
  const CapacityGauge = ({ percent }: { percent: number }) => {
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (percent / 100) * circumference;
    const color = percent >= 80 ? "#ef4444" : percent >= 50 ? "#f59e0b" : "#22c55e";
    return (
      <div className="relative w-32 h-32 mx-auto">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{percent}%</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Capacity</span>
        </div>
      </div>
    );
  };

  // ─── Source Breakdown Bar ────────────────────────────────────────────
  const SourceBar = ({ breakdown }: { breakdown: any }) => {
    if (!breakdown) return null;
    const segments = [
      { key: "platform", label: "Platform", color: "bg-blue-500", icon: Globe },
      { key: "direct", label: "Direct", color: "bg-slate-500", icon: Phone },
      { key: "walkIn", label: "Walk-In", color: "bg-orange-500", icon: Footprints },
    ];
    return (
      <div className="space-y-3">
        <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
          {segments.map((seg) => {
            const pct = breakdown[seg.key]?.percent || 0;
            if (pct === 0) return null;
            return (
              <div
                key={seg.key}
                className={`${seg.color} transition-all duration-500`}
                style={{ width: `${pct}%` }}
                title={`${seg.label}: ${pct}%`}
              />
            );
          })}
        </div>
        <div className="flex gap-4">
          {segments.map((seg) => {
            const info = breakdown[seg.key];
            if (!info) return null;
            return (
              <div key={seg.key} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
                <span className="text-xs text-slate-600">
                  {seg.label}: {info.count} ({info.percent}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Shift Overview</h1>
          <p className="text-slate-500 mt-2">Daily shift dashboard for your location.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
        <Card className="h-48 animate-pulse bg-slate-100 border-none" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Shift Overview</h1>
        <p className="text-slate-500 mt-2">Daily shift dashboard for your location.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Location selector */}
        {locations.length > 1 && (
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400"
          >
            {locations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        )}

        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 rounded-xl">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm font-medium text-slate-700 focus:outline-none bg-transparent"
            />
          </div>
          <Button size="sm" variant="outline" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
            >
              Today
            </Button>
          )}
        </div>
      </div>

      {!data ? (
        <Card className="p-12 text-center">
          <BarChart3 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No shift data</h3>
          <p className="text-slate-500">No bookings found for this date and location.</p>
        </Card>
      ) : (
        <>
          {/* Top row metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 text-center">
              <Truck className="h-6 w-6 text-blue-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{data.totalBookingsToday || 0}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Total Bookings</p>
            </Card>
            <Card className="p-5 text-center">
              <Users className="h-6 w-6 text-purple-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{(data.operatorsOnShift || []).length}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Staff on Shift</p>
            </Card>
            <Card className="p-5">
              <CapacityGauge percent={data.capacityUtilization || 0} />
            </Card>
            <Card className="p-5 text-center">
              <DollarSign className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">
                {formatCurrency(data.revenueForecast || 0, currency)}
              </p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Revenue Forecast</p>
            </Card>
          </div>

          {/* Vehicle class breakdown */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-400" /> Vehicle Classes
            </h3>
            {data.vehicleCountByClass && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(data.vehicleCountByClass).map(([cls, count]) => {
                  const total = Object.values(data.vehicleCountByClass as Record<string, number>).reduce(
                    (sum: number, v: any) => sum + (v as number), 0
                  );
                  const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                  return (
                    <div key={cls} className="p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-600">
                          {VEHICLE_CLASS_LABELS[cls] || cls}
                        </span>
                        <span className="text-lg font-bold text-slate-900">{count as number}</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${VEHICLE_CLASS_COLORS[cls] || "bg-slate-500"} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Staff on shift */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" /> Staff on Shift
            </h3>
            {(data.operatorsOnShift || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No operators assigned today</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(data.operatorsOnShift || []).map((op: any) => (
                  <Badge key={op.id} className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1.5 text-sm">
                    {op.name}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          {/* Booking source breakdown */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" /> Booking Sources
            </h3>
            <SourceBar breakdown={data.bookingSourceBreakdown} />
          </Card>
        </>
      )}
    </div>
  );
}
