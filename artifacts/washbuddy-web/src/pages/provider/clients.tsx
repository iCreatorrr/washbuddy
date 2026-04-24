import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  Users, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Phone, Mail, Building2, Tag, Calendar, DollarSign, Star, MessageSquare, X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { formatCurrency, formatDate } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

const TAG_OPTIONS = [
  "VIP", "NEW_CLIENT", "FLEET", "RECURRING", "HIGH_VALUE", "AT_RISK",
] as const;

const TAG_COLORS: Record<string, string> = {
  VIP: "bg-amber-100 text-amber-800 border-amber-200",
  NEW_CLIENT: "bg-green-100 text-green-800 border-green-200",
  FLEET: "bg-blue-100 text-blue-800 border-blue-200",
  RECURRING: "bg-purple-100 text-purple-800 border-purple-200",
  HIGH_VALUE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  AT_RISK: "bg-red-100 text-red-800 border-red-200",
};

type SortField = "name" | "totalSpendMinor" | "visitCount" | "lastVisitAt";
type SortOrder = "asc" | "desc";

export default function ClientsPage() {
  const { user } = useAuth();
  const providerId = getProviderId(user);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortField>("lastVisitAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchProfiles = useCallback(() => {
    if (!providerId) return;
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      sortBy,
      sortOrder,
    });
    if (searchQuery) params.set("search", searchQuery);
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));

    fetch(`${API_BASE}/api/providers/${providerId}/client-profiles?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, page, searchQuery, selectedTags, sortBy, sortOrder]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const toggleTag = (tag: string) => {
    setPage(1);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ChevronDown className="h-3 w-3 text-slate-300" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-blue-600" />
    );
  };

  const openDetail = (profileId: string) => {
    if (!providerId) return;
    setDetailLoading(true);
    fetch(`${API_BASE}/api/providers/${providerId}/client-profiles/${profileId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setSelectedProfile(d))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => setSelectedProfile(null);

  // ─── Skeleton ────────────────────────────────────────────────────────
  const Skeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  // ─── Detail Panel ────────────────────────────────────────────────────
  const DetailPanel = () => {
    if (!selectedProfile) return null;
    const p = selectedProfile;
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={closeDetail}>
        <div
          className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {detailLoading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{p.name}</h2>
                  {p.fleetName && (
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                      <Building2 className="h-3.5 w-3.5" /> {p.fleetName}
                    </p>
                  )}
                </div>
                <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Contact */}
              <Card className="p-4 space-y-2">
                {p.phone && (
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" /> {p.phone}
                  </p>
                )}
                {p.email && (
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" /> {p.email}
                  </p>
                )}
              </Card>

              {/* Tags */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(p.tags || []).map((tag: string) => (
                    <Badge key={tag} className={TAG_COLORS[tag] || "bg-slate-100 text-slate-600"}>
                      {tag.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {(!p.tags || p.tags.length === 0) && (
                    <span className="text-sm text-slate-400">No tags</span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-xs text-slate-400">Visits</p>
                  <p className="text-lg font-bold text-slate-900">{p.visitCount || 0}</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xs text-slate-400">Total Spend</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(p.totalSpendMinor || 0, "USD")}
                  </p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xs text-slate-400">Avg Rating</p>
                  <p className="text-lg font-bold text-slate-900">
                    {p.avgRating ? Number(p.avgRating).toFixed(1) : "--"}
                  </p>
                </Card>
              </div>

              {/* Notes */}
              {p.notes && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
                  <Card className="p-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{p.notes}</p>
                  </Card>
                </div>
              )}

              {/* Recent Bookings */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Bookings</h3>
                {(p.recentBookings || []).length === 0 ? (
                  <Card className="p-6 text-center text-slate-400 border-dashed">No bookings found</Card>
                ) : (
                  <div className="space-y-2">
                    {(p.recentBookings || []).map((b: any) => (
                      <Card key={b.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{b.serviceNameSnapshot}</p>
                            <p className="text-xs text-slate-500">{formatDate(b.scheduledStartAtUtc, "MMM d, yyyy", b.locationTimezone)}</p>
                            {b.locationName && <p className="text-xs text-slate-400">{b.locationName}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">
                              {formatCurrency(b.serviceBasePriceMinor || 0, "USD")}
                            </p>
                            {b.rating && (
                              <p className="text-xs text-amber-600 flex items-center gap-0.5 justify-end">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {b.rating}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Communication History */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Messages</h3>
                {(p.communicationHistory || []).length === 0 ? (
                  <Card className="p-6 text-center text-slate-400 border-dashed">No messages</Card>
                ) : (
                  <div className="space-y-2">
                    {(p.communicationHistory || []).slice(0, 10).map((m: any) => (
                      <Card key={m.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-slate-500">{m.senderName}</p>
                            <p className="text-sm text-slate-700">{m.body}</p>
                            <p className="text-xs text-slate-400 mt-1">{formatDate(m.createdAt)}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <DetailPanel />

      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Clients</h1>
        <p className="text-slate-500 mt-2">Manage your client relationships, view history, and track engagement.</p>
      </div>

      {/* Search & Filters */}
      <Card className="p-4 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email, or fleet..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10"
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider self-center mr-1">
            <Tag className="h-3.5 w-3.5 inline mr-1" />Tags:
          </span>
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                selectedTags.includes(tag)
                  ? TAG_COLORS[tag] || "bg-blue-100 text-blue-800 border-blue-200"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {tag.replace(/_/g, " ")}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => { setSelectedTags([]); setPage(1); }}
              className="px-3 py-1 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 transition-all"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* Results count */}
      <p className="text-sm text-slate-500">{total} client{total !== 1 ? "s" : ""} found</p>

      {/* Table */}
      {isLoading ? (
        <Skeleton />
      ) : profiles.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No clients found</h3>
          <p className="text-slate-500">
            {searchQuery || selectedTags.length > 0
              ? "Try adjusting your search or filters."
              : "Client profiles will appear here as customers book services."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th
                    className="text-left py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("name")}
                  >
                    <span className="flex items-center gap-1">Name <SortIcon field="name" /></span>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Contact</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Tags</th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("visitCount")}
                  >
                    <span className="flex items-center gap-1 justify-end">Visits <SortIcon field="visitCount" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("totalSpendMinor")}
                  >
                    <span className="flex items-center gap-1 justify-end">Total Spend <SortIcon field="totalSpendMinor" /></span>
                  </th>
                  <th
                    className="text-right py-3 px-4 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => handleSort("lastVisitAt")}
                  >
                    <span className="flex items-center gap-1 justify-end">Last Visit <SortIcon field="lastVisitAt" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p: any) => (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p.id)}
                    className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.fleetName && (
                        <p className="text-xs text-slate-400">{p.fleetName}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
                      {p.email && <p className="text-xs text-slate-500 truncate max-w-[180px]">{p.email}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.tags || []).slice(0, 3).map((tag: string) => (
                          <Badge key={tag} className={`text-[10px] ${TAG_COLORS[tag] || "bg-slate-100 text-slate-600"}`}>
                            {tag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                        {(p.tags || []).length > 3 && (
                          <Badge className="text-[10px] bg-slate-100 text-slate-500">
                            +{p.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">{p.visitCount || 0}</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {formatCurrency(p.totalSpendMinor || 0, "USD")}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 text-xs">
                      {p.lastVisitAt ? formatDate(p.lastVisitAt, "MMM d, yyyy") : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages}
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
