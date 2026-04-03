import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requirePlatformAdmin } from "../middlewares/requireAuth";

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
