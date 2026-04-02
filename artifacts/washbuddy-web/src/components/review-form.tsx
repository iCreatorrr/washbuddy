import React, { useState } from "react";
import { useCreateReview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StarRating } from "./star-rating";
import { Button, Card } from "./ui";
import { MessageSquare } from "lucide-react";

interface ReviewFormProps {
  bookingId: string;
  serviceName: string;
  onSuccess?: () => void;
}

export function ReviewForm({ bookingId, serviceName, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createReview = useCreateReview({ request: { credentials: "include" } });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    setError(null);
    try {
      await createReview.mutateAsync({
        data: { bookingId, rating, comment: comment.trim() || undefined },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/pending"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      onSuccess?.();
    } catch (err: any) {
      if (err?.message?.includes("already reviewed") || err?.status === 409) {
        onSuccess?.();
        return;
      }
      setError(err?.message || "Failed to submit review. Please try again.");
    }
  };

  return (
    <Card className="p-6 border-2 border-blue-100 bg-blue-50/30">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900">Rate Your Experience</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">How was your <span className="font-semibold">{serviceName}</span>?</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <StarRating value={rating} onChange={setRating} size="lg" />
          {rating > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              {rating === 1 && "Poor"}
              {rating === 2 && "Fair"}
              {rating === 3 && "Good"}
              {rating === 4 && "Very Good"}
              {rating === 5 && "Excellent"}
            </p>
          )}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us about your experience (optional)"
          rows={3}
          className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
          maxLength={1000}
        />

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <Button type="submit" isLoading={createReview.isPending} disabled={rating === 0}>
          Submit Review
        </Button>
      </form>
    </Card>
  );
}
