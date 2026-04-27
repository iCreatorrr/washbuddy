import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requirePlatformAdmin } from "../middlewares/requireAuth";
import { isPlatformAdmin, isProviderRole, type SessionUser } from "../lib/auth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.post("/reviews", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating || rating < 1 || rating > 5) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "bookingId and rating (1-5) are required" });
      return;
    }

    if (comment && comment.length > 500) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Comment must be 500 characters or less" });
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        location: { include: { provider: { include: { memberships: { where: { isActive: true }, select: { userId: true } } } } } },
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    if (booking.status !== "COMPLETED" && booking.status !== "COMPLETED_PENDING_WINDOW" && booking.status !== "SETTLED") {
      res.status(400).json({ errorCode: "INVALID_STATUS", message: "Reviews can only be submitted for completed bookings" });
      return;
    }

    if (booking.customerId !== user.id) {
      const isProvider = isProviderRole(user, booking.location.providerId);
      if (!isProvider) {
        res.status(403).json({ errorCode: "FORBIDDEN", message: "You must be a party to this booking to leave a review" });
        return;
      }
    }

    const isCustomerReview = booking.customerId === user.id;
    let subjectId: string;
    if (isCustomerReview) {
      const providerOwner = booking.location.provider.memberships[0];
      subjectId = providerOwner?.userId || booking.customerId;
    } else {
      subjectId = booking.customerId;
    }

    const existing = await prisma.review.findUnique({
      where: { bookingId_authorId: { bookingId, authorId: user.id } },
    });

    if (existing) {
      res.status(409).json({ errorCode: "DUPLICATE", message: "You have already reviewed this booking" });
      return;
    }

    const review = await prisma.review.create({
      data: {
        bookingId,
        authorId: user.id,
        subjectId,
        locationId: isCustomerReview ? booking.locationId : null,
        rating,
        comment: comment || null,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (isCustomerReview) {
      for (const member of booking.location.provider.memberships) {
        await createNotification(member.userId, {
          subject: "New Review Received",
          body: `${user.firstName} ${user.lastName} left a ${rating}-star review for ${booking.location.name}`,
          actionUrl: `/provider/reviews`,
          metadata: { reviewId: review.id, bookingId, locationId: booking.locationId, rating },
        });
      }
    } else {
      await createNotification(booking.customerId, {
        subject: "You Received a Review",
        body: `Your provider reviewed your booking at ${booking.location.name}`,
        actionUrl: `/bookings/${bookingId}`,
        metadata: { reviewId: review.id, bookingId, rating },
      });
    }

    res.status(201).json(review);
  } catch (err: any) {
    req.log.error({ err }, "Failed to create review");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create review" });
  }
});

router.get("/locations/:locationId/reviews", async (req, res) => {
  try {
    const { locationId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const where: any = { locationId, isHidden: false };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const [reviews, total, aggregate] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          votes: { select: { isHelpful: true } },
        },
      }),
      prisma.review.count({ where: { locationId, isHidden: false } }),
      prisma.review.aggregate({
        where: { locationId, isHidden: false },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const hasMore = reviews.length > limit;
    const items = hasMore ? reviews.slice(0, limit) : reviews;

    const distribution = await prisma.review.groupBy({
      by: ["rating"],
      where: { locationId, isHidden: false },
      _count: true,
    });

    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distribution) {
      ratingDist[d.rating] = d._count;
    }

    const withReply = await prisma.review.count({
      where: { locationId, isHidden: false, providerReply: { not: null } },
    });

    const formattedReviews = items.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      authorId: r.authorId,
      authorName: `${r.author.firstName} ${r.author.lastName}`,
      rating: r.rating,
      comment: r.comment,
      isEdited: r.isEdited,
      providerReply: r.providerReply,
      providerReplyAt: r.providerReplyAt,
      helpfulCount: r.votes.filter((v) => v.isHelpful).length,
      unhelpfulCount: r.votes.filter((v) => !v.isHelpful).length,
      createdAt: r.createdAt,
    }));

    res.json({
      reviews: formattedReviews,
      total,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      aggregate: {
        averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : null,
        totalReviews: aggregate._count,
        distribution: ratingDist,
        responseRate: total > 0 ? Math.round((withReply / total) * 100) : 0,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list reviews");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list reviews" });
  }
});

router.get("/reviews/aggregate/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;

    const [aggregate, distribution, withReply, total] = await Promise.all([
      prisma.review.aggregate({
        where: { locationId, isHidden: false },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { locationId, isHidden: false },
        _count: true,
      }),
      prisma.review.count({
        where: { locationId, isHidden: false, providerReply: { not: null } },
      }),
      prisma.review.count({ where: { locationId, isHidden: false } }),
    ]);

    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distribution) {
      ratingDist[d.rating] = d._count;
    }

    res.json({
      averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : null,
      totalReviews: aggregate._count,
      distribution: ratingDist,
      responseRate: total > 0 ? Math.round((withReply / total) * 100) : 0,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get review aggregate");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get aggregate" });
  }
});

router.post("/reviews/:reviewId/reply", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { reviewId } = req.params;
    const { reply } = req.body;

    if (!reply || reply.length > 500) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Reply is required and must be 500 characters or less" });
      return;
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        location: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!review) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Review not found" });
      return;
    }

    if (!review.locationId || !review.location) {
      res.status(400).json({ errorCode: "INVALID_REVIEW", message: "Cannot reply to this type of review" });
      return;
    }

    if (!isProviderRole(user, review.location.providerId) && !isPlatformAdmin(user)) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only the location provider can reply to reviews" });
      return;
    }

    if (review.providerReply) {
      res.status(409).json({ errorCode: "DUPLICATE", message: "A reply already exists for this review" });
      return;
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: { providerReply: reply, providerReplyAt: new Date() },
    });

    await createNotification(review.authorId, {
      subject: "Provider Replied to Your Review",
      body: `The provider at ${review.location.name} replied to your review`,
      // ?reviews=open is what the location-detail page reads on mount
      // to auto-open the reviews sheet. The prior `?tab=reviews` value
      // had no consumer — clicking the notification just landed on a
      // form page with no indication of the new reply.
      actionUrl: `/location/${review.locationId}?reviews=open`,
      metadata: { reviewId, locationId: review.locationId },
    });

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to reply to review");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to reply to review" });
  }
});

router.patch("/reviews/:reviewId", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Review not found" });
      return;
    }

    if (review.authorId !== user.id) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "You can only edit your own reviews" });
      return;
    }

    const hoursSinceCreation = (Date.now() - review.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 72) {
      res.status(400).json({ errorCode: "EDIT_WINDOW_CLOSED", message: "Reviews can only be edited within 72 hours of submission" });
      return;
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Rating must be between 1 and 5" });
      return;
    }

    if (comment && comment.length > 500) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Comment must be 500 characters or less" });
      return;
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(rating !== undefined ? { rating } : {}),
        ...(comment !== undefined ? { comment } : {}),
        isEdited: true,
        editedAt: new Date(),
      },
    });

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to edit review");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to edit review" });
  }
});

router.post("/reviews/:reviewId/vote", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { reviewId } = req.params;
    const { isHelpful } = req.body;

    if (typeof isHelpful !== "boolean") {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "isHelpful (boolean) is required" });
      return;
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Review not found" });
      return;
    }

    if (review.authorId === user.id) {
      res.status(400).json({ errorCode: "SELF_VOTE", message: "You cannot vote on your own review" });
      return;
    }

    const vote = await prisma.reviewVote.upsert({
      where: { reviewId_userId: { reviewId, userId: user.id } },
      create: { reviewId, userId: user.id, isHelpful },
      update: { isHelpful },
    });

    res.json({ id: vote.id, isHelpful: vote.isHelpful });
  } catch (err: any) {
    req.log.error({ err }, "Failed to vote on review");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to vote on review" });
  }
});

router.post("/reviews/:reviewId/hide", requirePlatformAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Reason is required for hiding a review" });
      return;
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Review not found" });
      return;
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: { isHidden: true, hiddenReason: reason },
    });

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to hide review");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to hide review" });
  }
});

router.get("/reviews/pending", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;

    const completedBookings = await prisma.booking.findMany({
      where: {
        customerId: user.id,
        status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] },
        reviews: { none: { authorId: user.id } },
      },
      include: {
        location: { select: { id: true, name: true } },
        service: { select: { name: true } },
      },
      orderBy: { serviceCompletedAtUtc: "desc" },
      take: 10,
    });

    res.json({ bookings: completedBookings });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get pending reviews");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get pending reviews" });
  }
});

router.get("/reviews/provider", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const locationId = req.query.locationId as string | undefined;

    if (!isProviderRole(user) && !isPlatformAdmin(user)) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Provider access required" });
      return;
    }

    const providerIds = user.roles
      .filter((r) => r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF")
      .map((r) => r.scopeId)
      .filter(Boolean) as string[];

    const where: any = {
      location: { providerId: { in: providerIds } },
      isHidden: false,
    };
    if (locationId) where.locationId = locationId;

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true } },
        booking: { select: { id: true, serviceNameSnapshot: true, scheduledStartAtUtc: true } },
        votes: { select: { isHelpful: true } },
      },
    });

    const needsReply = reviews.filter((r) => !r.providerReply).length;

    const formatted = reviews.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      authorName: `${r.author.firstName} ${r.author.lastName}`,
      locationId: r.locationId,
      locationName: r.location?.name,
      serviceName: r.booking.serviceNameSnapshot,
      scheduledAt: r.booking.scheduledStartAtUtc,
      rating: r.rating,
      comment: r.comment,
      isEdited: r.isEdited,
      providerReply: r.providerReply,
      providerReplyAt: r.providerReplyAt,
      helpfulCount: r.votes.filter((v) => v.isHelpful).length,
      createdAt: r.createdAt,
    }));

    res.json({ reviews: formatted, needsReply, total: reviews.length });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get provider reviews");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get provider reviews" });
  }
});

router.get("/reviews/admin", requirePlatformAdmin, async (req, res) => {
  try {
    const flagged = req.query.flagged === "true";
    const where: any = {};
    if (flagged) {
      where.OR = [{ rating: { lte: 2 } }, { isHidden: true }];
    }

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true } },
        booking: { select: { id: true, serviceNameSnapshot: true } },
      },
    });

    const formatted = reviews.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      authorName: `${r.author.firstName} ${r.author.lastName}`,
      locationId: r.locationId,
      locationName: r.location?.name,
      rating: r.rating,
      comment: r.comment,
      isHidden: r.isHidden,
      hiddenReason: r.hiddenReason,
      providerReply: r.providerReply,
      createdAt: r.createdAt,
    }));

    res.json({ reviews: formatted });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get admin reviews");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get admin reviews" });
  }
});

export default router;
