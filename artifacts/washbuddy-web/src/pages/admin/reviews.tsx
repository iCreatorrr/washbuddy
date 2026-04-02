import React, { useState } from "react";
import { useGetAdminReviews, useHideReview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { StarRating } from "@/components/star-rating";
import { Shield, EyeOff, Flag, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function AdminReviews() {
  const [showFlagged, setShowFlagged] = useState(false);
  const { data, isLoading, isError, refetch } = useGetAdminReviews(
    showFlagged ? { flagged: "true" } : {},
    { request: { credentials: "include" } }
  );
  const queryClient = useQueryClient();

  const reviews = data?.reviews || [];

  const [hidingId, setHidingId] = useState<string | null>(null);
  const [hideReason, setHideReason] = useState("");

  const hideMut = useHideReview({ request: { credentials: "include" } });

  const handleHide = async (reviewId: string) => {
    if (!hideReason.trim()) return;
    try {
      await hideMut.mutateAsync({ reviewId, data: { reason: hideReason.trim() } });
      setHidingId(null);
      setHideReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/admin"] });
    } catch {
      alert("Failed to hide review.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Review Moderation</h1>
          <p className="text-slate-500 mt-2">Monitor and moderate user reviews across the platform.</p>
        </div>
        <Button
          variant={showFlagged ? "primary" : "outline"}
          size="sm"
          onClick={() => setShowFlagged(!showFlagged)}
        >
          <Flag className="h-4 w-4 mr-1.5" />
          {showFlagged ? "Showing Flagged" : "Show Flagged"}
        </Button>
      </div>

      {isError ? (
        <ErrorState message="Could not load reviews." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No reviews to moderate</h3>
          <p className="text-slate-500">
            {showFlagged ? "No flagged reviews found." : "No reviews have been submitted yet."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r, idx) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <Card className={`p-6 ${r.isHidden ? "opacity-60 border-red-200 bg-red-50/30" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900">{r.authorName}</p>
                      {r.isHidden && <Badge variant="error">Hidden</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">{r.locationName || "Unknown location"}</p>
                  </div>
                  <div className="text-right">
                    <StarRating value={r.rating} readOnly size="sm" />
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {r.comment && <p className="text-slate-700 mb-3">{r.comment}</p>}

                {r.providerReply && (
                  <div className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Provider Reply</p>
                    <p className="text-sm text-slate-700">{r.providerReply}</p>
                  </div>
                )}

                {r.isHidden && r.hiddenReason && (
                  <div className="bg-red-50 rounded-xl p-3 mb-3 border border-red-100">
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Hidden Reason</p>
                    <p className="text-sm text-red-700">{r.hiddenReason}</p>
                  </div>
                )}

                {!r.isHidden && (
                  hidingId === r.id ? (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={hideReason}
                        onChange={(e) => setHideReason(e.target.value)}
                        placeholder="Reason for hiding this review..."
                        rows={2}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-red-400 focus:ring-4 focus:ring-red-400/10 resize-none"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => handleHide(r.id)} isLoading={hideMut.isPending}>
                          <EyeOff className="h-4 w-4 mr-1.5" />
                          Confirm Hide
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setHidingId(null); setHideReason(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => { setHidingId(r.id); setHideReason(""); }}
                    >
                      <EyeOff className="h-4 w-4 mr-1.5" />
                      Hide Review
                    </Button>
                  )
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
