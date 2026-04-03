import React, { useEffect, useState } from "react";
import { Card, Badge, ErrorState } from "@/components/ui";
import { Activity, Users, Calendar, DollarSign, ChevronRight, ArrowRight, AlertTriangle, CheckCircle2, Clock, Shield, CreditCard, BarChart3 } from "lucide-react";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { formatLocationDisplay } from "@/lib/format-location";
import { Link } from "wouter";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useAdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/dashboard`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading, error };
}

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export default function AdminDashboard() {
  const { data, isLoading, error } = useAdminDashboard();

  if (error) return <div className="max-w-6xl mx-auto"><ErrorState message="Could not load dashboard." /></div>;
  if (isLoading) return (
    <div className="p-12 text-center text-slate-500">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      <p className="mt-4">Loading dashboard...</p>
    </div>
  );

  const stats = [
    { title: "Total Bookings", value: data.totalBookings, icon: Calendar, color: "text-blue-500", bgColor: "bg-blue-50" },
    { title: "Active Today", value: data.activeBookingsToday, icon: Activity, color: "text-emerald-500", bgColor: "bg-emerald-50" },
    { title: "Total Providers", value: data.totalProviders, icon: Users, color: "text-indigo-500", bgColor: "bg-indigo-50" },
    { title: "Platform Revenue", value: formatCurrency(data.totalRevenue), icon: DollarSign, color: "text-amber-500", bgColor: "bg-amber-50" },
  ];

  const { providerStatusCounts: psc, alerts } = data;
  const totalAlerts = alerts.pendingApprovals + alerts.openRequests + alerts.lowResponseProviders;
  const dailyRevenue = data.dailyRevenue || [];
  const maxDailyRevenue = Math.max(...dailyRevenue.map((d: any) => d.revenueMinor), 1);
  const totalRevenueChart = dailyRevenue.reduce((s: number, d: any) => s + d.revenueMinor, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Platform Overview</h1>
        <p className="text-slate-500 mt-2">Super admin dashboard for WashBuddy operations.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <motion.div key={idx} {...fadeUp} transition={{ delay: idx * 0.05 }}>
            <Card className="p-6 flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${stat.bgColor} ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.title}</p>
                <p className="text-2xl font-display font-bold text-slate-900">{stat.value}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Provider Status + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-indigo-500" />
              Provider Status
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/admin/providers?status=APPROVED">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 hover:shadow-md transition-shadow cursor-pointer">
                  <p className="text-2xl font-bold text-emerald-700">{psc.active}</p>
                  <p className="text-xs text-emerald-600 font-medium">Active</p>
                </div>
              </Link>
              <Link href="/admin/providers?status=PENDING">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 hover:shadow-md transition-shadow cursor-pointer">
                  <p className="text-2xl font-bold text-amber-700">{psc.pending}</p>
                  <p className="text-xs text-amber-600 font-medium">Pending Approval</p>
                </div>
              </Link>
              <Link href="/admin/providers?status=SUSPENDED">
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 hover:shadow-md transition-shadow cursor-pointer">
                  <p className="text-2xl font-bold text-red-700">{psc.suspended}</p>
                  <p className="text-xs text-red-600 font-medium">Suspended</p>
                </div>
              </Link>
              <Link href="/admin/providers?stripe=pending">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:shadow-md transition-shadow cursor-pointer">
                  <p className="text-2xl font-bold text-slate-700">{psc.pendingStripe}</p>
                  <p className="text-xs text-slate-600 font-medium">Pending Stripe</p>
                </div>
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.25 }}>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alerts
            </h2>
            {totalAlerts === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">All clear — no items need attention.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.pendingApprovals > 0 && (
                  <Link href="/admin/providers?status=PENDING">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100 hover:shadow-sm cursor-pointer transition-shadow">
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800">Pending provider approvals</span>
                      </div>
                      <Badge className="bg-amber-200 text-amber-800">{alerts.pendingApprovals}</Badge>
                    </div>
                  </Link>
                )}
                {alerts.openRequests > 0 && (
                  <Link href="/admin/bookings?status=REQUESTED">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100 hover:shadow-sm cursor-pointer transition-shadow">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Open booking requests</span>
                      </div>
                      <Badge className="bg-blue-200 text-blue-800">{alerts.openRequests}</Badge>
                    </div>
                  </Link>
                )}
                {alerts.lowResponseProviders > 0 && (
                  <Link href="/admin/providers">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100 hover:shadow-sm cursor-pointer transition-shadow">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">Providers with missed SLAs this month</span>
                      </div>
                      <Badge className="bg-red-200 text-red-800">{alerts.lowResponseProviders}</Badge>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Revenue Chart */}
      <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-500" />
              Platform Revenue — Last 30 Days
            </h2>
            <span className="text-sm font-bold text-slate-500">Total: {formatCurrency(totalRevenueChart)}</span>
          </div>
          <div className="flex items-end gap-[3px] h-40">
            {dailyRevenue.map((d: any, i: number) => {
              const pct = maxDailyRevenue > 0 ? (d.revenueMinor / maxDailyRevenue) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: {formatCurrency(d.revenueMinor)}
                  </div>
                  <div
                    className="w-full bg-emerald-400 hover:bg-emerald-500 rounded-t transition-colors min-h-[2px]"
                    style={{ height: `${Math.max(pct, 1)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>{dailyRevenue[0]?.date?.slice(5)}</span>
            <span>{dailyRevenue[dailyRevenue.length - 1]?.date?.slice(5)}</span>
          </div>
        </Card>
      </motion.div>

      {/* Recent Bookings */}
      <motion.div {...fadeUp} transition={{ delay: 0.35 }}>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Recent Bookings</h2>
            <Link href="/admin/bookings" className="flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase">Service</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Provider</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase">Customer</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-slate-400 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBookings.map((b: any) => (
                    <tr key={b.id} onClick={() => window.location.href = `/bookings/${b.id}`} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{b.service}</td>
                      <td className="py-2.5 px-3 text-slate-500 hidden md:table-cell">{formatLocationDisplay(b.provider, b.location)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{b.customer}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatDate(b.date, "MMM d")}</td>
                      <td className="py-2.5 px-3"><Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge></td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(b.amount, b.currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
