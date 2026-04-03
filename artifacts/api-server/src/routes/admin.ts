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

export default router;
