import React, { useState } from "react";
import { useGetLocationReviews, useGetReviewAggregate, useVoteOnReview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge } from "./ui";
import { StarRating, RatingDistribution } from "./star-rating";
import { Star, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/auth";

interface LocationReviewsProps {
  locationId: string;
}

export function LocationReviews({ locationId }: LocationReviewsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: aggData } = useGetReviewAggregate(locationId, {
    query: { enabled: !!locationId },
    request: { credentials: "include" },
  });

  const { data: reviewsData, isLoading } = useGetLocationReviews(locationId, {}, {
    query: { enabled: !!locationId },
    request: { credentials: "include" },
  });

  const voteMut = useVoteOnReview({ request: { credentials: "include" } });

  const handleVote = async (reviewId: string, isHelpful: boolean) => {
    try {
      await voteMut.mutateAsync({ reviewId, data: { isHelpful } });
      queryClient.invalidateQueries({ queryKey: [`/api/locations/${locationId}/reviews`] });
    } catch {}
  };

  const aggregate = aggData;
  const reviews = reviewsData?.reviews || [];
  const total = reviewsData?.total || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i} className="h-24 animate-pulse bg-slate-100 border-none" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {aggregate && (aggregate.totalReviews > 0) && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="text-center sm:border-r sm:border-slate-100 sm:pr-6">
              <p className="text-5xl font-display font-bold text-slate-900">
                {aggregate.averageRating?.toFixed(1) || "—"}
              </p>
              <StarRating value={aggregate.averageRating || 0} readOnly size="sm" />
              <p className="text-sm text-slate-500 mt-1">{aggregate.totalReviews} review{aggregate.totalReviews !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1">
              <RatingDistribution distribution={aggregate.distribution} total={aggregate.totalReviews} />
            </div>
          </div>
        </Card>
      )}

      {reviews.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="font-bold text-slate-900">No reviews yet</p>
          <p className="text-sm text-slate-500 mt-1">Be the first to review this location!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-900">{r.authorName}</p>
                  <StarRating value={r.rating} readOnly size="sm" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                  {r.isEdited && <Badge className="mt-1 bg-slate-100 text-slate-500 border-slate-200 text-[10px]">Edited</Badge>}
                </div>
              </div>

              {r.comment && <p className="text-slate-700 text-sm mb-3">{r.comment}</p>}

              {r.providerReply && (
                <div className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Provider Reply</p>
                  <p className="text-sm text-slate-700">{r.providerReply}</p>
                </div>
              )}

              {user && (
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <button
                    onClick={() => handleVote(r.id, true)}
                    className="flex items-center gap-1 hover:text-emerald-600 transition-colors"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Helpful ({r.helpfulCount || 0})
                  </button>
                  <button
                    onClick={() => handleVote(r.id, false)}
                    className="flex items-center gap-1 hover:text-red-500 transition-colors"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    ({r.unhelpfulCount || 0})
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationRatingSummary({ locationId }: { locationId: string }) {
  const { data } = useGetReviewAggregate(locationId, {
    query: { enabled: !!locationId },
    request: { credentials: "include" },
  });

  if (!data || data.totalReviews === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="text-sm font-bold text-slate-700">
        {data.averageRating?.toFixed(1)}
      </span>
      <span className="text-xs text-slate-400">({data.totalReviews})</span>
    </div>
  );
}
