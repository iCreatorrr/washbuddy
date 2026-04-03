import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requirePlatformAdmin } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/admin/dashboard", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      totalBookings,
      activeBookingsToday,
      totalActiveProviders,
      pendingProviders,
      suspendedProviders,
      pendingStripeProviders,
      totalRevenueAgg,
      pendingApprovals,
      openRequests,
      lowResponseProviders,
      recentBookings,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({
        where: { status: { in: ["CHECKED_IN", "IN_SERVICE"] } },
      }),
      prisma.provider.count({ where: { isActive: true, approvalStatus: "APPROVED" } }),
      prisma.provider.count({ where: { approvalStatus: "PENDING" } }),
      prisma.provider.count({ where: { approvalStatus: "SUSPENDED" } }),
      prisma.provider.count({ where: { isActive: true, payoutReady: false } }),
      prisma.booking.aggregate({
        _sum: { platformFeeMinor: true },
        where: { status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] } },
      }),
      prisma.provider.count({ where: { approvalStatus: "PENDING" } }),
      prisma.booking.count({ where: { status: "REQUESTED" } }),
      prisma.providerResponseMetric.findMany({
        where: { periodStart: { gte: monthStart }, missedSla: { gt: 0 } },
        distinct: ["providerId"],
        select: { providerId: true },
      }),
      prisma.booking.findMany({
        include: {
          location: { select: { id: true, name: true, provider: { select: { id: true, name: true } } } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          vehicle: { select: { id: true, unitNumber: true } },
        },
        orderBy: { scheduledStartAtUtc: "desc" },
        take: 20,
      }),
    ]);

    // Daily revenue for last 30 days
    const revenueBookings = await prisma.booking.findMany({
      where: {
        status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] },
        scheduledStartAtUtc: { gte: thirtyDaysAgo },
      },
      select: { scheduledStartAtUtc: true, platformFeeMinor: true },
    });

    const dailyMap = new Map<string, number>();
    // Pre-fill all 30 days with 0
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      dailyMap.set(key, 0);
    }
    for (const b of revenueBookings) {
      const key = b.scheduledStartAtUtc.toISOString().split("T")[0];
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) || 0) + b.platformFeeMinor);
      }
    }
    const dailyRevenue = Array.from(dailyMap.entries())
      .map(([date, revenueMinor]) => ({ date, revenueMinor }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalBookings,
      activeBookingsToday,
      totalProviders: totalActiveProviders + pendingProviders + suspendedProviders,
      totalRevenue: totalRevenueAgg._sum.platformFeeMinor || 0,
      providerStatusCounts: {
        active: totalActiveProviders,
        pending: pendingProviders,
        suspended: suspendedProviders,
        pendingStripe: pendingStripeProviders,
      },
      alerts: {
        pendingApprovals,
        openRequests,
        lowResponseProviders: lowResponseProviders.length,
      },
      dailyRevenue,
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        service: b.serviceNameSnapshot,
        provider: b.location?.provider?.name,
        location: b.location?.name,
        customer: b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "—",
        vehicle: b.vehicle?.unitNumber || null,
        date: b.scheduledStartAtUtc,
        status: b.status,
        amount: b.totalPriceMinor,
        platformFee: b.platformFeeMinor,
        currencyCode: b.currencyCode,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to load admin dashboard");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load dashboard" });
  }
});

// ─── PROVIDER ONBOARDING NOTIFICATION ────────────────────────────────────────

router.post("/providers/notify-onboarding-complete", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { providerName } = req.body;

    // Find all platform admins to notify
    const adminRoles = await prisma.userPlatformRole.findMany({
      where: { role: "PLATFORM_SUPER_ADMIN", isActive: true },
      select: { userId: true },
    });

    for (const role of adminRoles) {
      await createNotification(role.userId, {
        subject: "New provider registration",
        body: `${providerName || "A new provider"} has submitted their listing for review.`,
        actionUrl: "/admin/providers?status=PENDING",
        metadata: { type: "NEW_PROVIDER_ONBOARDING" },
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to send onboarding notification");
    res.json({ success: false }); // Non-critical — don't fail
  }
});

// ─── ADMIN BOOKING MANAGEMENT ───────────────────────────────────────────────

router.get("/admin/bookings", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, providerId, startDate, endDate, search, page = "1", limit: limitParam = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string)));
    const skip = (pageNum - 1) * limit;

    const where: any = {};
    if (status) where.status = status as string;
    if (providerId) where.location = { providerId: providerId as string };
    if (startDate || endDate) {
      where.scheduledStartAtUtc = {};
      if (startDate) where.scheduledStartAtUtc.gte = new Date(startDate as string);
      if (endDate) where.scheduledStartAtUtc.lte = new Date(endDate as string);
    }
    if (search) {
      const s = search as string;
      where.OR = [
        { serviceNameSnapshot: { contains: s, mode: "insensitive" } },
        { id: { contains: s, mode: "insensitive" } },
        { customer: { firstName: { contains: s, mode: "insensitive" } } },
        { customer: { lastName: { contains: s, mode: "insensitive" } } },
        { location: { name: { contains: s, mode: "insensitive" } } },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, providerId: true, provider: { select: { id: true, name: true } } } },
          customer: {
            select: {
              id: true, firstName: true, lastName: true, email: true,
              fleetMemberships: { where: { isActive: true }, include: { fleet: { select: { name: true } } }, take: 1 },
            },
          },
          vehicle: { select: { id: true, unitNumber: true, subtypeCode: true } },
        },
        orderBy: { scheduledStartAtUtc: "desc" },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        service: b.serviceNameSnapshot,
        provider: b.location?.provider?.name || "—",
        location: b.location?.name || "—",
        customer: b.customer ? `${b.customer.firstName} ${b.customer.lastName}` : "—",
        customerEmail: b.customer?.email || "—",
        fleet: b.customer?.fleetMemberships?.[0]?.fleet?.name || null,
        vehicle: b.vehicle?.unitNumber || null,
        date: b.scheduledStartAtUtc,
        status: b.status,
        amount: b.totalPriceMinor,
        currencyCode: b.currencyCode,
      })),
      pagination: { page: pageNum, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list admin bookings");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load bookings" });
  }
});

router.post("/admin/bookings/:bookingId/force-cancel", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const activeStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "CHECKED_IN", "IN_SERVICE", "LATE"];

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.bookingId, status: { in: activeStatuses as any } },
    });
    if (!booking) {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Booking is not in a cancellable state" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: booking.id }, data: { status: "CUSTOMER_CANCELLED", cancellationReasonCode: "ADMIN_FORCE_CANCEL" } });
      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus: booking.status, toStatus: "CUSTOMER_CANCELLED", changedBy: user.id, reason: "Admin force-cancelled" },
      });
      await tx.bookingHold.updateMany({ where: { bookingId: booking.id, isReleased: false }, data: { isReleased: true } });
    });

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to force-cancel booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to force-cancel" });
  }
});

router.post("/admin/bookings/:bookingId/override-status", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const { status, reason } = req.body;
    if (!status || !reason) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "status and reason are required" });
      return;
    }

    const validStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "PROVIDER_DECLINED", "EXPIRED", "CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "LATE", "NO_SHOW", "CHECKED_IN", "IN_SERVICE", "COMPLETED_PENDING_WINDOW", "COMPLETED", "DISPUTED", "REFUNDED", "SETTLED"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Invalid booking status" });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" }); return; }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: booking.id }, data: { status: status as any } });
      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus: booking.status, toStatus: status, changedBy: user.id, reason: `Admin override: ${reason}` },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to override booking status");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to override status" });
  }
});

// ─── ADMIN PROVIDER MANAGEMENT ──────────────────────────────────────────────

router.get("/admin/providers", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, stripe, search } = req.query;

    const where: any = {};
    if (status === "APPROVED") { where.approvalStatus = "APPROVED"; where.isActive = true; }
    else if (status === "PENDING") where.approvalStatus = "PENDING";
    else if (status === "SUSPENDED") where.approvalStatus = "SUSPENDED";
    else if (status === "REJECTED") where.approvalStatus = "REJECTED";

    if (stripe === "active") where.payoutReady = true;
    else if (stripe === "pending") { where.payoutReady = false; where.isActive = true; }

    if (search) {
      where.name = { contains: search as string, mode: "insensitive" };
    }

    const providers = await prisma.provider.findMany({
      where,
      include: {
        memberships: {
          where: { role: "PROVIDER_ADMIN", isActive: true },
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
          take: 1,
        },
        locations: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    });

    // Aggregate metrics per provider
    const enriched = await Promise.all(providers.map(async (p) => {
      const locationIds = p.locations.map((l) => l.id);

      const [bookingCount, reviewAgg, slaMetrics] = await Promise.all([
        locationIds.length > 0
          ? prisma.booking.count({ where: { locationId: { in: locationIds } } })
          : Promise.resolve(0),
        locationIds.length > 0
          ? prisma.review.aggregate({
              _avg: { rating: true },
              _count: true,
              where: { locationId: { in: locationIds }, isHidden: false },
            })
          : Promise.resolve({ _avg: { rating: null }, _count: 0 }),
        prisma.providerResponseMetric.aggregate({
          _sum: { totalRequests: true, respondedInSla: true },
          where: { providerId: p.id },
        }),
      ]);

      const totalReqs = slaMetrics._sum.totalRequests || 0;
      const respondedInSla = slaMetrics._sum.respondedInSla || 0;
      const responseRate = totalReqs > 0 ? Math.round((respondedInSla / totalReqs) * 100) : null;

      const adminUser = p.memberships[0]?.user;
      const stripeStatus = p.payoutReady ? "PAYOUTS_ACTIVE"
        : p.approvalStatus === "APPROVED" ? "PENDING_CONNECT"
        : "NOT_STARTED";

      return {
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        approvalStatus: p.approvalStatus,
        payoutReady: p.payoutReady,
        stripeStatus,
        contactEmail: adminUser?.email || null,
        contactName: adminUser ? `${adminUser.firstName} ${adminUser.lastName}` : null,
        locationCount: p.locations.length,
        totalBookings: bookingCount,
        averageRating: reviewAgg._avg.rating ? parseFloat(reviewAgg._avg.rating.toFixed(1)) : null,
        reviewCount: reviewAgg._count,
        responseRate,
        createdAt: p.createdAt,
      };
    }));

    res.json({ providers: enriched });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list admin providers");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load providers" });
  }
});

router.post("/admin/providers/:providerId/approve", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const provider = await prisma.provider.update({
      where: { id: req.params.providerId },
      data: {
        approvalStatus: "APPROVED",
        isActive: true,
        approvedAt: new Date(),
        approvedBy: user.id,
      },
    });
    // Make all locations visible
    await prisma.location.updateMany({
      where: { providerId: provider.id },
      data: { isVisible: true },
    });
    res.json({ provider });
  } catch (err: any) {
    req.log.error({ err }, "Failed to approve provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to approve provider" });
  }
});

router.post("/admin/providers/:providerId/reject", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Rejection reason is required" }); return; }

    const provider = await prisma.provider.update({
      where: { id: req.params.providerId },
      data: {
        approvalStatus: "REJECTED",
        isActive: false,
        rejectionReason: reason,
      },
    });
    await prisma.location.updateMany({
      where: { providerId: provider.id },
      data: { isVisible: false },
    });
    res.json({ provider });
  } catch (err: any) {
    req.log.error({ err }, "Failed to reject provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to reject provider" });
  }
});

router.post("/admin/providers/:providerId/suspend", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const provider = await prisma.provider.update({
      where: { id: req.params.providerId },
      data: { approvalStatus: "SUSPENDED", isActive: false },
    });
    await prisma.location.updateMany({
      where: { providerId: provider.id },
      data: { isVisible: false },
    });
    res.json({ provider });
  } catch (err: any) {
    req.log.error({ err }, "Failed to suspend provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to suspend provider" });
  }
});

router.post("/admin/providers/:providerId/reactivate", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const provider = await prisma.provider.update({
      where: { id: req.params.providerId },
      data: { approvalStatus: "APPROVED", isActive: true },
    });
    await prisma.location.updateMany({
      where: { providerId: provider.id },
      data: { isVisible: true },
    });
    res.json({ provider });
  } catch (err: any) {
    req.log.error({ err }, "Failed to reactivate provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to reactivate provider" });
  }
});

export default router;
