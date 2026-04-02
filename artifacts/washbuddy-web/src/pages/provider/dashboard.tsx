import React from "react";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, ErrorState } from "@/components/ui";
import { getStatusColor, getStatusLabel, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ClipboardList, Clock, CheckCircle2 } from "lucide-react";

export default function ProviderDashboard() {
  // Role scoping on backend automatically filters to provider's locations
  const { data, isLoading, isError, refetch } = useListBookings({ limit: 50 }, { request: { credentials: 'include' } });
  
  const bookings = data?.bookings || [];
  
  const requested = bookings.filter(b => b.status === "REQUESTED");
  const upcoming = bookings.filter(b => b.status === "PROVIDER_CONFIRMED" || b.status === "HELD");
  const inProgress = bookings.filter(b => b.status === "CHECKED_IN" || b.status === "IN_SERVICE");

  const Section = ({ title, icon: Icon, items, colorClass }: any) => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900">
        <Icon className={`h-5 w-5 ${colorClass}`} />
        {title}
        <Badge variant="default" className="ml-2">{items.length}</Badge>
      </h2>
      {items.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 bg-slate-50/50 border-dashed border-slate-300">
          Nothing here right now.
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((b: any) => (
            <Link key={b.id} href={`/bookings/${b.id}`}>
              <Card className="p-5 hover:border-primary/40 cursor-pointer border-2 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <Badge className={getStatusColor(b.status)}>{getStatusLabel(b.status)}</Badge>
                  <span className="text-xs font-bold text-slate-400">{formatDate(b.scheduledStartAtUtc, 'h:mm a')}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-1 group-hover:text-primary transition-colors">{b.serviceNameSnapshot}</h3>
                <p className="text-sm font-medium text-slate-500">{b.customer?.firstName} {b.customer?.lastName} • {b.location?.name}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Provider Dashboard</h1>
        <p className="text-slate-500 mt-2">Manage your incoming bookings and active washes.</p>
      </div>

      {isError ? (
        <ErrorState message="Could not load bookings." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {[1,2,3].map(i => <Card key={i} className="h-64 animate-pulse bg-slate-100 border-none" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Section title="Action Required" icon={ClipboardList} items={requested} colorClass="text-amber-500" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Section title="Upcoming Today" icon={Clock} items={upcoming} colorClass="text-blue-500" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Section title="In Progress" icon={CheckCircle2} items={inProgress} colorClass="text-purple-500" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
