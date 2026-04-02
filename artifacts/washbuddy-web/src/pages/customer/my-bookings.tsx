import React from "react";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { Calendar, MapPin, Truck } from "lucide-react";
import { motion } from "framer-motion";

export default function MyBookings() {
  const { data, isLoading, isError, refetch } = useListBookings({}, { request: { credentials: 'include' } });
  
  const bookings = data?.bookings || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">My Bookings</h1>
        <p className="text-slate-500 mt-2">Manage your upcoming and past washes.</p>
      </div>

      {isError ? (
        <ErrorState message="Could not load your bookings." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Card key={i} className="h-32 animate-pulse bg-slate-100 border-none" />)}
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No bookings yet</h3>
          <p className="text-slate-500 mb-6">You haven't scheduled any washes.</p>
          <Link href="/search" className="text-primary font-bold hover:underline">Find a Location</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((booking, idx) => (
            <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Link href={`/bookings/${booking.id}`}>
                <Card className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between group cursor-pointer hover:border-primary/40 border-2">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(booking.status)}>{getStatusLabel(booking.status)}</Badge>
                      <span className="text-sm font-bold text-slate-400">ID: {booking.id.split('-')[0].toUpperCase()}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">{booking.serviceNameSnapshot}</h3>
                    <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {formatDate(booking.scheduledStartAtUtc)}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {booking.location?.name}</span>
                      {booking.vehicle && <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Unit {booking.vehicle.unitNumber}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-display font-bold text-slate-900">{formatCurrency(booking.totalPriceMinor, booking.currencyCode)}</div>
                    <div className="text-primary font-bold text-sm mt-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      View Details →
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
