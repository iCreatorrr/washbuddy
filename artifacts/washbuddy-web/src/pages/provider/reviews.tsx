import React, { useState } from "react";
import { useGetProviderReviews, useReplyToReview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { StarRating } from "@/components/star-rating";
import { MessageSquare, Reply, Clock, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function ProviderReviews() {
  const { data, isLoading, isError, refetch } = useGetProviderReviews(
    {},
    { request: { credentials: "include" } }
  );
  const queryClient = useQueryClient();

  const reviews = data?.reviews || [];
  const needsReply = data?.needsReply || 0;

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const replyMut = useReplyToReview({ request: { credentials: "include" } });

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    try {
      await replyMut.mutateAsync({ reviewId, data: { reply: replyText.trim() } });
      setReplyingTo(null);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/provider"] });
    } catch {
      alert("Failed to send reply.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Customer Reviews</h1>
        <p className="text-slate-500 mt-2">Read and respond to feedback from your customers.</p>
      </div>

      {needsReply > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <Reply className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-800 font-medium">
            You have <span className="font-bold">{needsReply}</span> review{needsReply !== 1 ? "s" : ""} awaiting a response.
          </p>
        </div>
      )}

      {isError ? (
        <ErrorState message="Could not load reviews." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-slate-100 border-none" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="p-12 text-center">
          <Star className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No reviews yet</h3>
          <p className="text-slate-500">Reviews from your customers will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r, idx) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Card className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-900">{r.authorName}</p>
                    <p className="text-sm text-slate-500">
                      {r.locationName} &middot; {r.serviceName}
                    </p>
                  </div>
                  <div className="text-right">
                    <StarRating value={r.rating} readOnly size="sm" />
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {r.comment && (
                  <p className="text-slate-700 mb-3">{r.comment}</p>
                )}

                {r.isEdited && (
                  <Badge className="mb-3 bg-slate-100 text-slate-500 border-slate-200">Edited</Badge>
                )}

                {r.providerReply ? (
                  <div className="bg-slate-50 rounded-xl p-4 mt-3 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Your Reply</p>
                    <p className="text-sm text-slate-700">{r.providerReply}</p>
                    {r.providerReplyAt && (
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(r.providerReplyAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                ) : replyingTo === r.id ? (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write your reply..."
                      rows={3}
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
                      maxLength={1000}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleReply(r.id)} isLoading={replyMut.isPending}>
                        Send Reply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => { setReplyingTo(r.id); setReplyText(""); }}
                  >
                    <Reply className="h-4 w-4 mr-1.5" />
                    Reply
                  </Button>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
