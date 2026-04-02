import React, { useState } from "react";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { Calendar, Search, ChevronRight, Filter } from "lucide-react";
import { motion } from "framer-motion";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Requested", value: "REQUESTED" },
  { label: "Confirmed", value: "PROVIDER_CONFIRMED" },
  { label: "Checked In", value: "CHECKED_IN" },
  { label: "In Service", value: "IN_SERVICE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Settled", value: "SETTLED" },
  { label: "Cancelled", value: "CUSTOMER_CANCELLED" },
];

export default function AdminBookings() {
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, isError, refetch } = useListBookings(
    { limit: 100, ...(statusFilter ? { status: statusFilter } : {}) },
    { request: { credentials: 'include' } }
  );

  const bookings = data?.bookings || [];
  const filtered = searchTerm
    ? bookings.filter(b =>
        b.serviceNameSnapshot?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.customer?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.location?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : bookings;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">All Bookings</h1>
        <p className="text-slate-500 mt-2">View and manage every booking on the platform.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            placeholder="Search by service, customer, location, or ID..."
            className="w-full h-11 pl-11 pr-4 rounded-xl border-2 border-slate-200 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === f.value
                  ? "bg-primary text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorState message="Could not load bookings." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 animate-pulse bg-slate-100 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No bookings found</h3>
          <p className="text-slate-500 text-sm">Try adjusting your filters or search.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3">Service / Location</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-2">Scheduled</div>
            <div className="col-span-1">Amount</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">ID</div>
          </div>
          {filtered.map((b, idx) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
              <Link href={`/bookings/${b.id}`}>
                <Card className="px-5 py-4 hover:border-primary/40 cursor-pointer border-2 transition-all group">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center">
                    <div className="col-span-3 min-w-0">
                      <p className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{b.serviceNameSnapshot}</p>
                      <p className="text-xs text-slate-500 truncate">{b.location?.name}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{b.customer?.firstName} {b.customer?.lastName}</p>
                      <p className="text-xs text-slate-400 truncate">{b.customer?.email}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-slate-700 whitespace-nowrap">{formatDate(b.scheduledStartAtUtc, "MMM d, yyyy")}</p>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{formatDate(b.scheduledStartAtUtc, "h:mm a")}</p>
                    </div>
                    <div className="col-span-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 whitespace-nowrap">{formatCurrency(b.totalPriceMinor, b.currencyCode)}</p>
                    </div>
                    <div className="col-span-2">
                      <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
                    </div>
                    <div className="col-span-2 flex items-center justify-between min-w-0">
                      <span className="text-xs font-mono text-slate-400 truncate">{b.id.split('-')[0]}</span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
          <p className="text-center text-sm text-slate-400 pt-4">
            Showing {filtered.length} of {data?.pagination.total || 0} bookings
          </p>
        </div>
      )}
    </div>
  );
}
