/**
 * Provider analytics, shift overview, operator performance, and audit log endpoints.
 */
import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";

const router: IRouter = Router();

// ─── Analytics Overview ─────────────────────────────────────────────────────

router.get("/providers/:providerId/analytics/overview", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate as string) : new Date();
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const prevStart = new Date(start.getTime() - periodDays * 86400000);

    const locations = await prisma.location.findMany({ where: { providerId: req.params.providerId }, select: { id: true } });
    const locIds = locationId ? [locationId as string] : locations.map((l) => l.id);

    const completedStatuses = ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"];
    const baseWhere = { locationId: { in: locIds }, status: { in: completedStatuses as any } };

    const [totalWashes, totalWashesPrev, revenueAgg, revenuePrevAgg, reviewAgg, newClients] = await Promise.all([
      prisma.booking.count({ where: { ...baseWhere, scheduledStartAtUtc: { gte: start, lte: end } } }),
      prisma.booking.count({ where: { ...baseWhere, scheduledStartAtUtc: { gte: prevStart, lt: start } } }),
      prisma.booking.aggregate({ _sum: { serviceBasePriceMinor: true }, where: { ...baseWhere, scheduledStartAtUtc: { gte: start, lte: end } } }),
      prisma.booking.aggregate({ _sum: { serviceBasePriceMinor: true }, where: { ...baseWhere, scheduledStartAtUtc: { gte: prevStart, lt: start } } }),
      prisma.review.aggregate({ _avg: { rating: true }, where: { locationId: { in: locIds }, isHidden: false } }),
      prisma.clientProfile.count({ where: { providerId: req.params.providerId, createdAt: { gte: start, lte: end } } }),
    ]);

    const activeBays = await prisma.washBay.count({ where: { locationId: { in: locIds }, isActive: true } });
    const totalBayHours = activeBays * periodDays * 12; // assume 12 operating hours/day
    const bookedMinutes = await prisma.booking.aggregate({
      _sum: { totalPriceMinor: true }, // placeholder — use count * avg duration
      _count: true,
      where: { ...baseWhere, washBayId: { not: null }, scheduledStartAtUtc: { gte: start, lte: end } },
    });
    const bayUtil = totalBayHours > 0 ? Math.round(((bookedMinutes._count || 0) * 0.5 / totalBayHours) * 100) : 0;

    const fleet = await prisma.fleet.findFirst({ select: { currencyCode: true } });

    res.json({
      averageRating: reviewAgg._avg.rating ? parseFloat(Number(reviewAgg._avg.rating).toFixed(1)) : null,
      networkAverageRating: null, // TODO: compute across all providers
      totalWashes, totalWashesPrevPeriod: totalWashesPrev,
      totalRevenueMinor: revenueAgg._sum.serviceBasePriceMinor || 0,
      totalRevenuePrevPeriodMinor: revenuePrevAgg._sum.serviceBasePriceMinor || 0,
      bayUtilizationPercent: bayUtil,
      newClients,
      repeatClientPercent: 0, // TODO: compute
      currencyCode: fleet?.currencyCode || "USD",
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to load analytics overview");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load analytics" });
  }
});

// ─── Revenue Analytics ──────────────────────────────────────────────────────

router.get("/providers/:providerId/analytics/revenue", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const locations = await prisma.location.findMany({ where: { providerId: req.params.providerId }, select: { id: true } });
    const locIds = locationId ? [locationId as string] : locations.map((l) => l.id);
    const completedStatuses = ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"];

    const bookings = await prisma.booking.findMany({
      where: { locationId: { in: locIds }, status: { in: completedStatuses as any }, scheduledStartAtUtc: { gte: start, lte: end } },
      select: { serviceNameSnapshot: true, serviceBasePriceMinor: true, bookingSource: true, fleetPlaceholderClass: true, scheduledStartAtUtc: true, vehicle: { select: { subtypeCode: true } } },
    });

    // By service type
    const byService = new Map<string, { total: number; count: number }>();
    const bySource = new Map<string, { total: number; count: number }>();
    const byClass = new Map<string, { total: number; count: number }>();
    const byDate = new Map<string, { total: number; count: number }>();

    for (const b of bookings) {
      const svc = b.serviceNameSnapshot;
      const src = b.bookingSource;
      const vc = b.vehicle?.subtypeCode || b.fleetPlaceholderClass || "UNKNOWN";
      const dt = b.scheduledStartAtUtc.toISOString().split("T")[0];

      byService.set(svc, { total: (byService.get(svc)?.total || 0) + b.serviceBasePriceMinor, count: (byService.get(svc)?.count || 0) + 1 });
      bySource.set(src, { total: (bySource.get(src)?.total || 0) + b.serviceBasePriceMinor, count: (bySource.get(src)?.count || 0) + 1 });
      byClass.set(vc, { total: (byClass.get(vc)?.total || 0) + b.serviceBasePriceMinor, count: (byClass.get(vc)?.count || 0) + 1 });
      byDate.set(dt, { total: (byDate.get(dt)?.total || 0) + b.serviceBasePriceMinor, count: (byDate.get(dt)?.count || 0) + 1 });
    }

    res.json({
      byServiceType: Array.from(byService.entries()).map(([serviceName, v]) => ({ serviceName, totalMinor: v.total, count: v.count })).sort((a, b) => b.totalMinor - a.totalMinor),
      byVehicleClass: Array.from(byClass.entries()).map(([vehicleClass, v]) => ({ vehicleClass, totalMinor: v.total, count: v.count })),
      byBookingSource: Array.from(bySource.entries()).map(([source, v]) => ({ source, totalMinor: v.total, count: v.count })),
      revenuePerBayHour: 0, // TODO
      trend: Array.from(byDate.entries()).map(([date, v]) => ({ date, totalMinor: v.total, count: v.count })).sort((a, b) => a.date.localeCompare(b.date)),
      currencyCode: "USD",
    });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load revenue analytics" });
  }
});

// ─── Operator Performance ───────────────────────────────────────────────────

router.get("/providers/:providerId/analytics/operators", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const members = await prisma.providerMembership.findMany({
      where: { providerId: req.params.providerId, isActive: true, role: { in: ["PROVIDER_ADMIN", "PROVIDER_STAFF"] } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    const locations = await prisma.location.findMany({ where: { providerId: req.params.providerId }, select: { id: true } });
    const locIds = locations.map((l) => l.id);

    const operators = await Promise.all(members.map(async (m) => {
      const washes = await prisma.booking.count({
        where: { assignedOperatorId: m.userId, locationId: { in: locIds }, status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] as any } },
      });
      return {
        operatorId: m.userId, operatorName: `${m.user.firstName} ${m.user.lastName}`,
        totalWashes: washes, avgDurationMins: 0, onTimePercent: 0, avgRating: null, complaintsCount: 0, upsellRate: 0,
      };
    }));

    res.json({ operators });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load operator data" });
  }
});

// ─── Shift Overview ─────────────────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/shift-overview", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { locationId } = req.params;
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const dayStart = new Date(`${dateStr}T00:00:00Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59Z`);

    const bookings = await prisma.booking.findMany({
      where: { locationId, scheduledStartAtUtc: { gte: dayStart, lte: dayEnd }, status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "EXPIRED", "PROVIDER_DECLINED"] as any } },
      select: { serviceBasePriceMinor: true, bookingSource: true, assignedOperatorId: true, vehicle: { select: { subtypeCode: true } }, fleetPlaceholderClass: true },
    });

    const classes = { SMALL: 0, MEDIUM: 0, LARGE: 0, EXTRA_LARGE: 0 };
    const sources = { platform: 0, direct: 0, walkIn: 0 };
    let revenue = 0;
    const operatorIds = new Set<string>();

    for (const b of bookings) {
      revenue += b.serviceBasePriceMinor;
      const vc = b.vehicle?.subtypeCode || b.fleetPlaceholderClass || "MEDIUM";
      if (vc === "MINIBUS" || vc === "SHUTTLE") classes.SMALL++;
      else if (vc === "STANDARD" || vc === "SCHOOL_BUS") classes.MEDIUM++;
      else if (vc === "COACH") classes.LARGE++;
      else classes.EXTRA_LARGE++;
      if (b.bookingSource === "PLATFORM") sources.platform++;
      else if (b.bookingSource === "DIRECT") sources.direct++;
      else sources.walkIn++;
      if (b.assignedOperatorId) operatorIds.add(b.assignedOperatorId);
    }

    const operators = operatorIds.size > 0 ? await prisma.user.findMany({
      where: { id: { in: Array.from(operatorIds) } }, select: { id: true, firstName: true, lastName: true },
    }) : [];

    const totalBays = await prisma.washBay.count({ where: { locationId, isActive: true } });
    const utilization = totalBays > 0 ? Math.round((bookings.length / (totalBays * 12)) * 100) : 0; // rough estimate

    const total = bookings.length;
    res.json({
      vehicleCountByClass: classes,
      operatorsOnShift: operators.map((o) => ({ id: o.id, name: `${o.firstName} ${o.lastName}` })),
      capacityUtilization: Math.min(utilization, 100),
      revenueForecast: revenue,
      currencyCode: "USD",
      bookingSourceBreakdown: {
        platform: { count: sources.platform, percent: total > 0 ? Math.round((sources.platform / total) * 100) : 0 },
        direct: { count: sources.direct, percent: total > 0 ? Math.round((sources.direct / total) * 100) : 0 },
        walkIn: { count: sources.walkIn, percent: total > 0 ? Math.round((sources.walkIn / total) * 100) : 0 },
      },
      totalBookingsToday: total,
    });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load shift overview" });
  }
});

// ─── Audit Log ──────────────────────────────────────────────────────────────

router.get("/providers/:providerId/audit-log", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { startDate, endDate, actorId, actionType, entityType, page = "1", limit: limitParam = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string)));
    const skip = (pageNum - 1) * limit;

    // Get this provider's location IDs for scoping
    const locations = await prisma.location.findMany({ where: { providerId: req.params.providerId }, select: { id: true } });
    const locIds = locations.map((l) => l.id);

    // Get booking IDs at this provider's locations
    const bookingIds = await prisma.booking.findMany({
      where: { locationId: { in: locIds } }, select: { id: true }, take: 1000,
    });
    const bIds = bookingIds.map((b) => b.id);

    const where: any = { entityId: { in: bIds } };
    if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate as string) };
    if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate as string) };
    if (actorId) where.actorId = actorId;
    if (actionType) where.action = actionType;
    if (entityType) where.entityType = entityType;

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where, include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" }, skip, take: limit,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    res.json({
      events: events.map((e) => ({
        id: e.id, actorName: e.actor ? `${e.actor.firstName} ${e.actor.lastName}` : "System",
        action: e.action, entityType: e.entityType, entityId: e.entityId,
        metadata: e.metadata, ipAddress: e.ipAddress, createdAt: e.createdAt,
      })),
      total, page: pageNum, totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load audit log" });
  }
});

export default router;
