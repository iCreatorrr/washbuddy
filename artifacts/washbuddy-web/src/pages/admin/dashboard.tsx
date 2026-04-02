import React from "react";
import { useListBookings, useListProviders } from "@workspace/api-client-react";
import { Card, Badge, ErrorState } from "@/components/ui";
import { Activity, Users, Calendar, DollarSign, ChevronRight, ArrowRight } from "lucide-react";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { data: bookingsData, isError: bookingsError, refetch: refetchBookings } = useListBookings({ limit: 100 }, { request: { credentials: 'include' } });
  const { data: providersData, isError: providersError, refetch: refetchProviders } = useListProviders({ request: { credentials: 'include' } });

  const bookings = bookingsData?.bookings || [];
  const providers = providersData?.providers || [];

  const activeBookings = bookings.filter(b => !["COMPLETED", "SETTLED", "CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "PROVIDER_DECLINED", "EXPIRED", "NO_SHOW"].includes(b.status));
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalPriceMinor || 0), 0);

  const stats = [
    { title: "Total Bookings", value: bookingsData?.pagination.total || 0, icon: Calendar, color: "text-blue-500", bgColor: "bg-blue-50" },
    { title: "Active Now", value: activeBookings.length, icon: Activity, color: "text-emerald-500", bgColor: "bg-emerald-50" },
    { title: "Providers", value: providers.length, icon: Users, color: "text-indigo-500", bgColor: "bg-indigo-50" },
    { title: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-amber-500", bgColor: "bg-amber-50" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Platform Overview</h1>
        <p className="text-slate-500 mt-2">Super admin dashboard for WashBuddy operations.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Recent Bookings</h2>
            <Link href="/admin/bookings" className="flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {bookingsError ? (
            <ErrorState message="Could not load bookings." onRetry={() => refetchBookings()} />
          ) : bookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No bookings yet.</p>
          ) : (
            <div className="space-y-1">
              {bookings.slice(0, 5).map(b => (
                <Link key={b.id} href={`/bookings/${b.id}`}>
                  <div className="flex justify-between items-center py-3 px-3 -mx-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{b.serviceNameSnapshot}</p>
                      <p className="text-sm text-slate-500 truncate">{b.customer?.firstName} {b.customer?.lastName} &middot; {b.location?.name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <div className="text-right hidden sm:block">
                        <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
                        <p className="text-xs text-slate-400 mt-1">{formatDate(b.scheduledStartAtUtc, "MMM d")}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Providers</h2>
            <Link href="/admin/providers" className="flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {providersError ? (
            <ErrorState message="Could not load providers." onRetry={() => refetchProviders()} />
          ) : providers.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No providers yet.</p>
          ) : (
            <div className="space-y-1">
              {providers.slice(0, 5).map(p => (
                <Link key={p.id} href="/admin/providers">
                  <div className="flex justify-between items-center py-3 px-3 -mx-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{p.name}</p>
                        <p className="text-sm text-slate-500">{p.contactEmail || "No email"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.payoutReady ? (
                        <Badge variant="success">Payouts Active</Badge>
                      ) : (
                        <Badge variant="warning">Pending Connect</Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
