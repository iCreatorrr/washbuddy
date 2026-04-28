import React, { useMemo, useState } from "react";
import {
  useGetLocationReviews,
  useGetReviewAggregate,
  useVoteOnReview,
  useClearReviewVote,
  getGetLocationReviewsQueryKey,
  type LocationReviewItem,
  type LocationReviewsResponse,
  type VoteOnReviewBodyVote,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Card, Badge } from "./ui";
import { StarRating, RatingDistribution } from "./star-rating";
import { Star, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/auth";

type SortOption = "RECENT" | "HELPFUL" | "HIGHEST" | "LOWEST";

const SORT_LABELS: Record<SortOption, string> = {
  RECENT: "Most recent",
  HELPFUL: "Most helpful",
  HIGHEST: "Highest rated",
  LOWEST: "Lowest rated",
};

// Show sort only once the user can't easily scan the whole list. Below
// the threshold the dropdown is just chrome — at 5+ reviews it earns
// its keep.
const SORT_DROPDOWN_MIN_REVIEWS = 5;

interface LocationReviewsProps {
  locationId: string;
}

export function LocationReviews({ locationId }: LocationReviewsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setNav] = useLocation();
  // Session-scoped sort state — resets when the modal closes since the
  // component unmounts with the Sheet. Default is "RECENT" to match
  // the server's natural ordering, which avoids any client-side
  // resort flash on first paint.
  const [sortBy, setSortBy] = useState<SortOption>("RECENT");

  const { data: aggData } = useGetReviewAggregate(locationId, {
    query: { enabled: !!locationId },
    request: { credentials: "include" },
  });

  const { data: reviewsData, isLoading } = useGetLocationReviews(locationId, {}, {
    query: { enabled: !!locationId },
    request: { credentials: "include" },
  });

  const voteMut = useVoteOnReview({ request: { credentials: "include" } });
  const clearMut = useClearReviewVote({ request: { credentials: "include" } });

  const reviewsQueryKey = useMemo(
    () => getGetLocationReviewsQueryKey(locationId, {}),
    [locationId],
  );

  // Optimistic update: rewrite the cached LocationReviewsResponse for
  // the target review, recompute counts and currentUserVote per the
  // toggle/swap rules. Returns the original snapshot so onError can
  // restore it. The server is the source of truth — onSuccess writes
  // the canonical counts back from the response.
  const applyOptimisticVote = (reviewId: string, nextVote: "HELPFUL" | "UNHELPFUL" | null) => {
    const previous = queryClient.getQueryData<LocationReviewsResponse>(reviewsQueryKey);
    if (!previous) return previous;
    queryClient.setQueryData<LocationReviewsResponse>(reviewsQueryKey, {
      ...previous,
      reviews: previous.reviews.map((r: LocationReviewItem) => {
        if (r.id !== reviewId) return r;
        const prev = (r.currentUserVote ?? null) as "HELPFUL" | "UNHELPFUL" | null;
        let helpful = r.helpfulCount ?? 0;
        let unhelpful = r.unhelpfulCount ?? 0;
        // Reverse the prior vote's contribution.
        if (prev === "HELPFUL") helpful -= 1;
        else if (prev === "UNHELPFUL") unhelpful -= 1;
        // Apply the new vote.
        if (nextVote === "HELPFUL") helpful += 1;
        else if (nextVote === "UNHELPFUL") unhelpful += 1;
        return {
          ...r,
          helpfulCount: helpful,
          unhelpfulCount: unhelpful,
          currentUserVote: nextVote ?? undefined,
        };
      }),
    });
    return previous;
  };

  const writeServerCountsToCache = (
    reviewId: string,
    counts: { helpfulCount: number; unhelpfulCount: number; currentUserVote?: "HELPFUL" | "UNHELPFUL" | null },
  ) => {
    queryClient.setQueryData<LocationReviewsResponse>(reviewsQueryKey, (prev: LocationReviewsResponse | undefined) => {
      if (!prev) return prev;
      return {
        ...prev,
        reviews: prev.reviews.map((r: LocationReviewItem) =>
          r.id === reviewId
            ? {
                ...r,
                helpfulCount: counts.helpfulCount,
                unhelpfulCount: counts.unhelpfulCount,
                currentUserVote: counts.currentUserVote ?? undefined,
              }
            : r,
        ),
      };
    });
  };

  const handleVote = async (review: LocationReviewItem, target: "HELPFUL" | "UNHELPFUL") => {
    if (!user) {
      // Anonymous viewers can see counts but can't act. Route to login
      // so the click leads somewhere useful instead of being a no-op.
      setNav("/login");
      return;
    }
    if (voteMut.isPending || clearMut.isPending) return;

    const current = (review.currentUserVote ?? null) as "HELPFUL" | "UNHELPFUL" | null;
    // Tap a filled thumb again → toggle off (DELETE). Otherwise POST
    // the new vote — the server handles same-vote-toggle internally
    // too, but we model the toggle on the client so the UI updates
    // instantly without a server round-trip race.
    const willClear = current === target;
    const optimisticNext = willClear ? null : target;
    const snapshot = applyOptimisticVote(review.id, optimisticNext);

    try {
      if (willClear) {
        const res = await clearMut.mutateAsync({ reviewId: review.id });
        writeServerCountsToCache(review.id, res);
      } else {
        const res = await voteMut.mutateAsync({
          reviewId: review.id,
          data: { vote: target as VoteOnReviewBodyVote },
        });
        writeServerCountsToCache(review.id, res);
      }
    } catch {
      // Roll back on failure and surface the error so users know the
      // vote didn't land. A blunt invalidate would also work but
      // restoring the snapshot avoids a flash to stale state.
      if (snapshot) queryClient.setQueryData(reviewsQueryKey, snapshot);
      toast.error("Couldn't save your vote. Try again?");
    }
  };

  const aggregate = aggData;
  const reviews = reviewsData?.reviews || [];
  const total = reviewsData?.total || 0;

  // Client-side resort. The list is paginated to ≤20 items per page,
  // and only the visible page is reordered — same data flow as the
  // existing component (no extra fetch). Stable secondary sort on
  // createdAt keeps the order deterministic when the primary key
  // ties (e.g. two reviews both at 0 helpful votes).
  const sortedReviews = useMemo(() => {
    if (sortBy === "RECENT") return reviews;
    const copy = [...reviews];
    const byCreatedDesc = (a: LocationReviewItem, b: LocationReviewItem) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === "HELPFUL") {
      copy.sort((a, b) => (b.helpfulCount ?? 0) - (a.helpfulCount ?? 0) || byCreatedDesc(a, b));
    } else if (sortBy === "HIGHEST") {
      copy.sort((a, b) => b.rating - a.rating || byCreatedDesc(a, b));
    } else if (sortBy === "LOWEST") {
      copy.sort((a, b) => a.rating - b.rating || byCreatedDesc(a, b));
    }
    return copy;
  }, [reviews, sortBy]);

  const showSort = total >= SORT_DROPDOWN_MIN_REVIEWS;

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
          {showSort && (
            <div
              className="flex items-center justify-between gap-3 px-1"
              // Stop bubbling so the change/click on the dropdown
              // never reaches a parent backdrop listener that might
              // close the Sheet. Sheet itself respects pointer events
              // inside content, but defending against future
              // wrappers is cheap.
              onClick={(e) => e.stopPropagation()}
            >
              <label htmlFor="reviews-sort" className="text-xs font-medium text-slate-500">
                Sort by
              </label>
              <select
                id="reviews-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                onClick={(e) => e.stopPropagation()}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="reviews-sort-select"
              >
                {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                  <option key={opt} value={opt}>
                    {SORT_LABELS[opt]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {sortedReviews.map((r: LocationReviewItem) => (
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

              <ReviewVoteButtons
                review={r}
                isLoggedIn={!!user}
                isPending={voteMut.isPending || clearMut.isPending}
                onVote={handleVote}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReviewVoteButtonsProps {
  review: LocationReviewItem;
  isLoggedIn: boolean;
  isPending: boolean;
  onVote: (review: LocationReviewItem, target: "HELPFUL" | "UNHELPFUL") => void;
}

// Tap targets are 44×44 (h-11 w-11) per WCAG / Apple HIG. Spacing
// between thumbs is gap-2 (8px). Filled state uses primary blue for
// HELPFUL and destructive red for UNHELPFUL, with the lucide icon set
// to fill="currentColor" so the thumb shape itself fills.
function ReviewVoteButtons({ review, isLoggedIn, isPending, onVote }: ReviewVoteButtonsProps) {
  const myVote = (review.currentUserVote ?? null) as "HELPFUL" | "UNHELPFUL" | null;
  const helpful = review.helpfulCount ?? 0;
  const unhelpful = review.unhelpfulCount ?? 0;
  const disabledForGuest = !isLoggedIn;

  const baseBtn =
    "inline-flex items-center gap-1.5 min-h-11 min-w-11 px-2.5 rounded-lg text-xs font-medium transition-colors select-none disabled:cursor-not-allowed";

  const upActive = myVote === "HELPFUL";
  const downActive = myVote === "UNHELPFUL";

  return (
    <div className="flex items-center gap-2 -ml-2.5" data-testid="review-vote-buttons">
      <button
        type="button"
        onClick={() => onVote(review, "HELPFUL")}
        disabled={isPending}
        aria-pressed={upActive}
        aria-label={upActive ? "Remove helpful vote" : "Mark as helpful"}
        title={disabledForGuest ? "Log in to vote" : undefined}
        className={`${baseBtn} ${
          upActive
            ? "text-primary bg-primary/10 hover:bg-primary/15"
            : "text-slate-500 hover:text-primary hover:bg-slate-50"
        }`}
        data-testid={`vote-helpful-${review.id}`}
      >
        <ThumbsUp className="h-4 w-4" fill={upActive ? "currentColor" : "none"} />
        <span>Helpful{helpful > 0 ? ` (${helpful})` : ""}</span>
      </button>
      <button
        type="button"
        onClick={() => onVote(review, "UNHELPFUL")}
        disabled={isPending}
        aria-pressed={downActive}
        aria-label={downActive ? "Remove not-helpful vote" : "Mark as not helpful"}
        title={disabledForGuest ? "Log in to vote" : undefined}
        className={`${baseBtn} ${
          downActive
            ? "text-destructive bg-destructive/10 hover:bg-destructive/15"
            : "text-slate-500 hover:text-destructive hover:bg-slate-50"
        }`}
        data-testid={`vote-unhelpful-${review.id}`}
      >
        <ThumbsDown className="h-4 w-4" fill={downActive ? "currentColor" : "none"} />
        <span>{unhelpful > 0 ? unhelpful : ""}</span>
      </button>
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
