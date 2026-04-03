import React, { useState, useEffect } from "react";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { Calendar, Search, ChevronRight, Filter, ChevronLeft, Truck, Building2 } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Requested", value: "REQUESTED" },
  { label: "Confirmed", value: "PROVIDER_CONFIRMED" },
  { label: "Checked In", value: "CHECKED_IN" },
  { label: "In Service", value: "IN_SERVICE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Settled", value: "SETTLED" },
  { label: "Cancelled", value: "CUSTOMER_CANCELLED" },
  { label: "Expired", value: "EXPIRED" },
];

function useAdminBookings(params: Record<string, string>) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API_BASE}/api/admin/bookings?${qs}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [JSON.stringify(params)]);

  return { data, isLoading, error };
}

function useProviderList() {
  const [providers, setProviders] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/providers`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setProviders((d.providers || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);
  return providers;
}

export default function AdminBookings() {
  const urlParams = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [providerId, setProviderId] = useState("");
  const [page, setPage] = useState(1);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);

  const providers = useProviderList();

  const params: Record<string, string> = { page: String(page), limit: "30" };
  if (statusFilter) params.status = statusFilter;
  if (searchTerm) params.search = searchTerm;
  if (providerId) params.providerId = providerId;
  if (startDate) params.startDate = new Date(startDate).toISOString();
  if (endDate) params.endDate = new Date(endDate + "T23:59:59Z").toISOString();

  const { data, isLoading, error } = useAdminBookings(params);
  const bookings = data?.bookings || [];
  const pagination = data?.pagination;

  const clearDateRange = () => {
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">All Bookings</h1>
        <p className="text-slate-500 mt-2">View and manage every booking on the platform.</p>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input placeholder="Search service, customer, location, or ID..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} />
          </div>
          <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setPage(1); }}
            className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Providers</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">From</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
            <label className="text-xs font-bold text-slate-500">To</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
            {(startDate || endDate) && (
              <button onClick={clearDateRange} className="text-xs text-primary font-bold hover:underline">Clear</button>
            )}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} onClick={() => { setStatusFilter(f.value); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === f.value ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      {error ? (
        <ErrorState message="Could not load bookings." />
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map((i) => <div key={i} className="h-16 animate-pulse bg-slate-100 rounded-xl" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No bookings found</h3>
          <p className="text-slate-500 text-sm">Try adjusting your filters.</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-bold text-slate-600">ID</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Service</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600 hidden lg:table-cell">Provider / Location</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Customer</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600 hidden xl:table-cell">Fleet</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600 hidden xl:table-cell">Vehicle</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Date</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-bold text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any, idx: number) => (
                  <tr key={b.id} onClick={() => window.location.href = `/bookings/${b.id}`}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{b.service}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{b.provider} — {b.location}</td>
                    <td className="px-4 py-3 text-slate-700">{b.customer}</td>
                    <td className="px-4 py-3 text-slate-500 hidden xl:table-cell">{b.fleet || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 hidden xl:table-cell">{b.vehicle || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(b.date, "MMM d, h:mm a")}</td>
                    <td className="px-4 py-3"><Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge></td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(b.amount, b.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={pagination.page >= pagination.totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
