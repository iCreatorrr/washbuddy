import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { useAuth } from "@/contexts/auth";
import { Star, Clock, CheckCircle2, Trophy } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getProviderId(user: any): string | null {
  return user?.roles?.find((r: any) => (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") && r.scopeId)?.scopeId || null;
}

export default function MyStats() {
  const { user } = useAuth();
  const providerId = getProviderId(user);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!providerId || !user) return;
    fetch(`${API_BASE}/api/providers/${providerId}/analytics/operators`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const me = (d.operators || []).find((o: any) => o.operatorId === user.id);
        setStats(me || { totalWashes: 0, avgDurationMins: 0, onTimePercent: 0, avgRating: null });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [providerId, user]);

  if (isLoading) return <div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-display font-bold text-slate-900">My Performance</h1>
        <p className="text-slate-500">Your stats for this period</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center p-5">
          <Trophy className="h-8 w-8 text-blue-500 mx-auto mb-2" />
          <div className="text-3xl font-bold text-blue-600">{stats?.totalWashes || 0}</div>
          <div className="text-sm text-slate-500">Washes Completed</div>
        </Card>
        <Card className="text-center p-5">
          <Star className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <div className="text-3xl font-bold text-amber-500">{stats?.avgRating ? stats.avgRating.toFixed(1) : "N/A"}</div>
          <div className="text-sm text-slate-500">Avg Rating</div>
        </Card>
        <Card className="text-center p-5">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <div className="text-3xl font-bold text-green-600">{stats?.onTimePercent || 0}%</div>
          <div className="text-sm text-slate-500">On Time</div>
        </Card>
        <Card className="text-center p-5">
          <Clock className="h-8 w-8 text-slate-500 mx-auto mb-2" />
          <div className="text-3xl font-bold">{stats?.avgDurationMins || 0}m</div>
          <div className="text-sm text-slate-500">Avg Duration</div>
        </Card>
      </div>

      {(stats?.avgRating ?? 0) >= 4.5 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-800">
          Outstanding! Your average rating is above 4.5 stars!
        </div>
      )}
      {(stats?.onTimePercent ?? 0) >= 90 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center text-blue-800">
          Great timing! You're on schedule {stats.onTimePercent}% of the time.
        </div>
      )}
      {(stats?.totalWashes ?? 0) >= 10 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center text-purple-800">
          You've completed {stats.totalWashes} washes! Keep up the great work.
        </div>
      )}
    </div>
  );
}
