import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  Shield, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Search, Calendar, Filter, Clock, User, FileText, X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { formatDate } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

const ACTION_COLORS: Record<string, string> = {
  BOOKING_CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  BOOKING_DECLINED: "bg-red-100 text-red-800 border-red-200",
  BOOKING_CANCELLED: "bg-red-100 text-red-800 border-red-200",
  BOOKING_COMPLETED: "bg-blue-100 text-blue-800 border-blue-200",
  SERVICE_STARTED: "bg-purple-100 text-purple-800 border-purple-200",
  VEHICLE_CHECKED_IN: "bg-indigo-100 text-indigo-800 border-indigo-200",
  CLIENT_PROFILE_UPDATED: "bg-amber-100 text-amber-800 border-amber-200",
  SETTINGS_UPDATED: "bg-slate-100 text-slate-800 border-slate-200",
  PAYMENT_RECEIVED: "bg-green-100 text-green-800 border-green-200",
};

const ACTION_TYPES = [
  "BOOKING_CONFIRMED",
  "BOOKING_DECLINED",
  "BOOKING_CANCELLED",
  "BOOKING_COMPLETED",
  "SERVICE_STARTED",
  "VEHICLE_CHECKED_IN",
  "CLIENT_PROFILE_UPDATED",
  "SETTINGS_UPDATED",
  "PAYMENT_RECEIVED",
];

export default function AuditLogPage() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionType, setActionType] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(() => {
    if (!providerId) return;
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (actionType) params.set("actionType", actionType);

    fetch(`${API_BASE}/api/providers/${providerId}/audit-log?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, page, startDate, endDate, actionType]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setActionType("");
    setPage(1);
  };

  const hasActiveFilters = startDate || endDate || actionType;

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // ─── Metadata Viewer ─────────────────────────────────────────────────
  const MetadataView = ({ metadata }: { metadata: any }) => {
    if (!metadata || Object.keys(metadata).length === 0) {
      return <p className="text-xs text-slate-400">No additional details</p>;
    }
    return (
      <div className="space-y-2">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="flex gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[80px] shrink-0">
              {key}
            </span>
            <span className="text-xs text-slate-700 font-mono break-all">
              {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ─── Skeleton ────────────────────────────────────────────────────────
  const Skeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Audit Log</h1>
        <p className="text-slate-500 mt-2">Track all actions and changes across your operations.</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Active</Badge>
            )}
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Action Type</label>
              <select
                value={actionType}
                onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All Actions</option>
                {ACTION_TYPES.map((at) => (
                  <option key={at} value={at}>{formatAction(at)}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* Results count */}
      <p className="text-sm text-slate-500">{total} event{total !== 1 ? "s" : ""} found</p>

      {/* Events */}
      {isLoading ? (
        <Skeleton />
      ) : events.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No audit events found</h3>
          <p className="text-slate-500">
            {hasActiveFilters
              ? "Try adjusting your filters."
              : "Audit events will appear here as actions are taken."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {events.map((event) => {
              const isExpanded = expandedIds.has(event.id);
              return (
                <div key={event.id}>
                  <button
                    onClick={() => toggleExpand(event.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50/60 transition-colors flex items-center gap-3"
                  >
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <Badge className={`text-[10px] shrink-0 ${ACTION_COLORS[event.action] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                        {formatAction(event.action)}
                      </Badge>
                      <span className="text-sm text-slate-700 truncate">
                        {event.entityType} <span className="text-slate-400 font-mono text-xs">{event.entityId?.slice(0, 8)}...</span>
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {event.actorName}
                      </span>
                      <span className="flex items-center gap-1 hidden sm:flex">
                        <Clock className="h-3 w-3" /> {formatDate(event.createdAt, "MMM d, h:mm a")}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Actor</span>
                            <p className="text-slate-700 mt-0.5">{event.actorName}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Timestamp</span>
                            <p className="text-slate-700 mt-0.5">{formatDate(event.createdAt)}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Entity</span>
                            <p className="text-slate-700 mt-0.5">{event.entityType}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Entity ID</span>
                            <p className="text-slate-700 mt-0.5 font-mono text-[11px]">{event.entityId}</p>
                          </div>
                          {event.ipAddress && (
                            <div>
                              <span className="font-semibold text-slate-500 uppercase tracking-wider">IP Address</span>
                              <p className="text-slate-700 mt-0.5 font-mono text-[11px]">{event.ipAddress}</p>
                            </div>
                          )}
                        </div>

                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Details</span>
                            <div className="bg-white rounded-lg p-3 border border-slate-200">
                              <MetadataView metadata={event.metadata} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages} ({total} events)
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* Page number buttons */}
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={page === pageNum ? "default" : "outline"}
                      onClick={() => setPage(pageNum)}
                      className="w-8"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
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
