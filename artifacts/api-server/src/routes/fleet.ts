import { Router } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";
import { isFleetRole, isFleetMember, getFleetId, isPlatformAdmin } from "../lib/auth";
import { createNotification, createBulkNotifications } from "../lib/notifications";
import { notifyWashRequestSubmitted } from "../lib/bookingNotifier";

async function getFleetApproverUserIds(fleetId: string, excludeUserId?: string): Promise<string[]> {
  const members = await prisma.fleetMembership.findMany({
    where: {
      fleetId,
      isActive: true,
      role: { in: ["FLEET_ADMIN", "DISPATCHER"] },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

async function getFleetAdminUserIds(fleetId: string): Promise<string[]> {
  const members = await prisma.fleetMembership.findMany({
    where: { fleetId, isActive: true, role: "FLEET_ADMIN" },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

const router = Router();

function getUserFleetId(user: SessionUser): string | null {
  const fleetRole = user.roles.find(
    (r) => r.scope === "fleet" && r.scopeId
  );
  return fleetRole?.scopeId || null;
}

function requireFleetMember(req: any, res: any, next: any) {
  const user = req.user as SessionUser;
  if (isPlatformAdmin(user)) {
    (req as any).fleetId = req.query.fleetId || null;
    return next();
  }
  const fleetId = getUserFleetId(user);
  if (!fleetId) {
    res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet access required" });
    return;
  }
  (req as any).fleetId = fleetId;
  next();
}

function getUserFleetRole(user: SessionUser): string | null {
  const fleetRole = user.roles.find(
    (r) => r.scope === "fleet" && r.scopeId
  );
  return fleetRole?.role || null;
}

function requireFleetAdmin(req: any, res: any, next: any) {
  const user = req.user as SessionUser;
  if (isPlatformAdmin(user)) return next();
  const role = getUserFleetRole(user);
  if (!role || !["FLEET_ADMIN", "MAINTENANCE_MANAGER"].includes(role)) {
    res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet admin access required" });
    return;
  }
  next();
}

function requireFleetNonDriver(req: any, res: any, next: any) {
  const user = req.user as SessionUser;
  if (isPlatformAdmin(user)) return next();
  const role = getUserFleetRole(user);
  if (!role || role === "DRIVER") {
    res.status(403).json({ errorCode: "FORBIDDEN", message: "Insufficient fleet role" });
    return;
  }
  next();
}

router.get("/fleet/overview", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const now = new Date();

    // First day of current month at 00:00 UTC
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      totalVehicles,
      overdueVehicles,
      dueSoonVehicles,
      pendingRequests,
      activePrograms,
      totalDepots,
      totalDrivers,
      recentBookings,
      washesThisMonth,
      spendThisMonthAgg,
    ] = await Promise.all([
      prisma.vehicle.count({ where: { fleetId, isActive: true } }),
      prisma.vehicle.count({ where: { fleetId, isActive: true, nextWashDueAtUtc: { lt: now } } }),
      prisma.vehicle.count({ where: { fleetId, isActive: true, nextWashDueAtUtc: { gte: now, lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) } } }),
      prisma.washRequest.count({ where: { fleetId, status: "PENDING_FLEET_APPROVAL" } }),
      prisma.fleetRecurringProgram.count({ where: { fleetId, isActive: true } }),
      prisma.fleetDepot.count({ where: { fleetId, isActive: true } }),
      prisma.fleetMembership.count({ where: { fleetId, role: "DRIVER", isActive: true } }),
      prisma.booking.count({
        where: {
          vehicle: { fleetId },
          status: { in: ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "CHECKED_IN", "IN_SERVICE"] },
        },
      }),
      prisma.booking.count({
        where: {
          vehicle: { fleetId },
          scheduledStartAtUtc: { gte: monthStart },
          status: { notIn: ["CUSTOMER_CANCELLED", "EXPIRED"] },
        },
      }),
      prisma.booking.aggregate({
        _sum: { totalPriceMinor: true },
        where: {
          vehicle: { fleetId },
          scheduledStartAtUtc: { gte: monthStart },
          status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED", "IN_SERVICE", "PROVIDER_CONFIRMED", "CHECKED_IN"] },
        },
      }),
    ]);

    const overdueList = await prisma.vehicle.findMany({
      where: { fleetId, isActive: true, nextWashDueAtUtc: { lt: now } },
      select: {
        id: true, unitNumber: true, categoryCode: true, nextWashDueAtUtc: true, lastWashAtUtc: true,
        depot: { select: { id: true, name: true } },
      },
      orderBy: { nextWashDueAtUtc: "asc" },
      take: 10,
    });

    const pendingRequestsList = await prisma.washRequest.findMany({
      where: { fleetId, status: "PENDING_FLEET_APPROVAL" },
      include: {
        vehicle: { select: { id: true, unitNumber: true, categoryCode: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        desiredLocation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentBookingsList = await prisma.booking.findMany({
      where: { vehicle: { fleetId } },
      select: {
        id: true, serviceNameSnapshot: true, scheduledStartAtUtc: true,
        status: true, totalPriceMinor: true, currencyCode: true,
        vehicle: { select: { id: true, unitNumber: true } },
        service: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, provider: { select: { id: true, name: true } } } },
      },
      orderBy: { scheduledStartAtUtc: "desc" },
      take: 10,
    });

    const fleet = await prisma.fleet.findUnique({
      where: { id: fleetId },
      select: { id: true, name: true, status: true, billingMode: true, defaultTimezone: true, currencyCode: true },
    });

    res.json({
      fleet,
      kpis: {
        totalVehicles,
        overdueVehicles,
        dueSoonVehicles,
        pendingRequests,
        activePrograms,
        totalDepots,
        totalDrivers,
        activeBookings: recentBookings,
        washesThisMonth,
        spendThisMonth: spendThisMonthAgg._sum.totalPriceMinor || 0,
      },
      overdueVehicles: overdueList,
      pendingRequests: pendingRequestsList,
      recentBookings: recentBookingsList,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get fleet overview");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get fleet overview" });
  }
});

router.get("/fleet/vehicles", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { depot, group, category, status, search, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    const where: any = { fleetId, isActive: true };
    if (depot) where.depotId = depot as string;
    if (category) where.categoryCode = category as string;
    if (search) {
      where.OR = [
        { unitNumber: { contains: search as string, mode: "insensitive" } },
        { licensePlate: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (status === "overdue") {
      where.nextWashDueAtUtc = { lt: now };
    } else if (status === "due_soon") {
      where.nextWashDueAtUtc = { gte: now, lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) };
    } else if (status === "on_track") {
      where.nextWashDueAtUtc = { gt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) };
    }

    if (group) {
      where.vehicleGroupMemberships = { some: { vehicleGroupId: group as string } };
    }

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          depot: { select: { id: true, name: true } },
          driverAssignments: {
            where: { endsAt: null },
            include: { driver: { select: { id: true, firstName: true, lastName: true } } },
            take: 1,
          },
          vehicleGroupMemberships: {
            include: { vehicleGroup: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ nextWashDueAtUtc: "asc" }],
        skip,
        take: limitNum,
      }),
      prisma.vehicle.count({ where }),
    ]);

    const enriched = vehicles.map((v) => ({
      ...v,
      currentDriver: v.driverAssignments[0]?.driver || null,
      groups: v.vehicleGroupMemberships.map((m) => m.vehicleGroup),
      washStatus: !v.nextWashDueAtUtc ? "unknown"
        : v.nextWashDueAtUtc < now ? "overdue"
        : v.nextWashDueAtUtc <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) ? "due_soon"
        : "on_track",
    }));

    res.json({
      vehicles: enriched,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get fleet vehicles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get fleet vehicles" });
  }
});

// ─── FLEET VEHICLE CRUD ─────────────────────────────────────────────────────

const VALID_SUBTYPES = ["STANDARD", "COACH", "MINIBUS", "SHUTTLE", "DOUBLE_DECKER", "SCHOOL_BUS", "ARTICULATED"];

router.post("/fleet/vehicles", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { unitNumber, categoryCode, subtypeCode, lengthInches, heightInches, hasRestroom, licensePlate, depotId } = req.body;

    if (!unitNumber || !subtypeCode || !lengthInches || !heightInches) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "unitNumber, subtypeCode, lengthInches, and heightInches are required" });
      return;
    }
    if (!VALID_SUBTYPES.includes(subtypeCode)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: `subtypeCode must be one of: ${VALID_SUBTYPES.join(", ")}` });
      return;
    }
    if (typeof lengthInches !== "number" || lengthInches <= 0 || typeof heightInches !== "number" || heightInches <= 0) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "lengthInches and heightInches must be positive numbers" });
      return;
    }
    if (depotId) {
      const depot = await prisma.fleetDepot.findFirst({ where: { id: depotId, fleetId } });
      if (!depot) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Depot not found in this fleet" }); return; }
    }

    const duplicate = await prisma.vehicle.findFirst({ where: { fleetId, unitNumber } });
    if (duplicate) {
      res.status(409).json({ errorCode: "DUPLICATE_UNIT_NUMBER", message: `Unit number "${unitNumber}" already exists in this fleet` });
      return;
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        fleetId,
        categoryCode: categoryCode || "BUS",
        subtypeCode,
        lengthInches,
        heightInches,
        hasRestroom: hasRestroom ?? false,
        unitNumber,
        licensePlate: licensePlate || null,
        depotId: depotId || null,
        isActive: true,
      },
    });

    res.status(201).json({ vehicle });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create fleet vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create vehicle" });
  }
});

router.patch("/fleet/vehicles/:vehicleId", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.vehicleId, fleetId } });
    if (!vehicle) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found in this fleet" }); return; }

    const { unitNumber, categoryCode, subtypeCode, lengthInches, heightInches, hasRestroom, licensePlate, depotId, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (unitNumber !== undefined) {
      const duplicate = await prisma.vehicle.findFirst({ where: { fleetId, unitNumber, id: { not: vehicle.id } } });
      if (duplicate) { res.status(409).json({ errorCode: "DUPLICATE_UNIT_NUMBER", message: `Unit number "${unitNumber}" already exists in this fleet` }); return; }
      data.unitNumber = unitNumber;
    }
    if (subtypeCode !== undefined) {
      if (!VALID_SUBTYPES.includes(subtypeCode)) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: `Invalid subtypeCode` }); return; }
      data.subtypeCode = subtypeCode;
    }
    if (categoryCode !== undefined) data.categoryCode = categoryCode;
    if (lengthInches !== undefined) {
      if (typeof lengthInches !== "number" || lengthInches <= 0) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "lengthInches must be positive" }); return; }
      data.lengthInches = lengthInches;
    }
    if (heightInches !== undefined) {
      if (typeof heightInches !== "number" || heightInches <= 0) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "heightInches must be positive" }); return; }
      data.heightInches = heightInches;
    }
    if (hasRestroom !== undefined) data.hasRestroom = hasRestroom;
    if (licensePlate !== undefined) data.licensePlate = licensePlate || null;
    if (depotId !== undefined) {
      if (depotId) {
        const depot = await prisma.fleetDepot.findFirst({ where: { id: depotId, fleetId } });
        if (!depot) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Depot not found in this fleet" }); return; }
      }
      data.depotId = depotId || null;
    }
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.vehicle.update({ where: { id: vehicle.id }, data });
    res.json({ vehicle: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update fleet vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update vehicle" });
  }
});

router.post("/fleet/vehicles/:vehicleId/assign-driver", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.vehicleId, fleetId } });
    if (!vehicle) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found in this fleet" }); return; }

    const { userId } = req.body;
    if (!userId) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "userId is required" }); return; }

    const driverMembership = await prisma.fleetMembership.findFirst({ where: { fleetId, userId, role: "DRIVER", isActive: true } });
    if (!driverMembership) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "User is not an active driver in this fleet" }); return; }

    const existing = await prisma.fleetDriverAssignment.findFirst({
      where: { fleetId, vehicleId: vehicle.id, driverUserId: userId, endsAt: null },
    });
    if (existing) { res.status(409).json({ errorCode: "ALREADY_ASSIGNED", message: "Driver is already assigned to this vehicle" }); return; }

    const assignment = await prisma.fleetDriverAssignment.create({
      data: { fleetId, vehicleId: vehicle.id, driverUserId: userId, startsAt: new Date() },
      include: { driver: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    res.status(201).json({ assignment });
  } catch (err: any) {
    req.log.error({ err }, "Failed to assign driver");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to assign driver" });
  }
});

router.delete("/fleet/vehicles/:vehicleId/assign-driver/:assignmentId", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    const assignment = await prisma.fleetDriverAssignment.findFirst({
      where: { id: req.params.assignmentId, vehicleId: req.params.vehicleId, fleetId },
    });
    if (!assignment) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Assignment not found" }); return; }

    await prisma.fleetDriverAssignment.delete({ where: { id: assignment.id } });
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to remove driver assignment");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to remove assignment" });
  }
});

// ─── FLEET WASH REQUESTS ────────────────────────────────────────────────────

router.get("/fleet/wash-requests", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const role = getUserFleetRole(user);
    const where: any = { fleetId };
    if (role === "DRIVER") {
      where.driverUserId = user.id;
    }
    if (status) {
      where.status = status as string;
    }

    const [requests, total] = await Promise.all([
      prisma.washRequest.findMany({
        where,
        include: {
          vehicle: { select: { id: true, unitNumber: true, categoryCode: true } },
          driver: { select: { id: true, firstName: true, lastName: true, email: true } },
          desiredLocation: { select: { id: true, name: true } },
          approvedLocation: { select: { id: true, name: true } },
          thread: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.washRequest.count({ where }),
    ]);

    res.json({
      requests,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get wash requests");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get wash requests" });
  }
});

router.get("/fleet/recurring-programs", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const programs = await prisma.fleetRecurringProgram.findMany({
      where: { fleetId },
      include: {
        scopeDepot: { select: { id: true, name: true } },
        scopeVehicleGroup: { select: { id: true, name: true } },
        _count: { select: { generatedTasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ programs });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get recurring programs");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get recurring programs" });
  }
});

router.get("/fleet/depots", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const depots = await prisma.fleetDepot.findMany({
      where: { fleetId, isActive: true },
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({ depots });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get depots");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get depots" });
  }
});

router.get("/fleet/vehicle-groups", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const groups = await prisma.fleetVehicleGroup.findMany({
      where: { fleetId, isActive: true },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({ groups });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get vehicle groups");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get vehicle groups" });
  }
});

router.get("/fleet/settings", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const fleet = await prisma.fleet.findUnique({
      where: { id: fleetId },
      include: {
        depots: { where: { isActive: true }, orderBy: { name: "asc" } },
        memberships: {
          where: { isActive: true },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { role: "asc" },
        },
        policyOverrides: true,
      },
    });

    res.json({ fleet });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get fleet settings");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get fleet settings" });
  }
});

router.patch("/fleet/settings", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { requestPolicyJson } = req.body;
    if (requestPolicyJson === undefined) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "requestPolicyJson is required" });
      return;
    }

    const policy = requestPolicyJson as any;

    // Validate approved provider list
    if (policy.approvedProviderList?.enabled && Array.isArray(policy.approvedProviderList.providerIds)) {
      const ids = policy.approvedProviderList.providerIds;
      if (ids.length > 0) {
        const count = await prisma.provider.count({ where: { id: { in: ids }, isActive: true } });
        if (count !== ids.length) {
          res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "One or more provider IDs are invalid" });
          return;
        }
      }
    }

    // Validate spending limit
    if (policy.spendingLimit?.enabled) {
      if (typeof policy.spendingLimit.maxAmountMinor !== "number" || policy.spendingLimit.maxAmountMinor <= 0) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "maxAmountMinor must be a positive number" });
        return;
      }
    }

    // Validate wash frequency
    if (policy.washFrequency?.enabled) {
      if (typeof policy.washFrequency.maxWashes !== "number" || policy.washFrequency.maxWashes <= 0) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "maxWashes must be a positive number" });
        return;
      }
      if (typeof policy.washFrequency.periodDays !== "number" || policy.washFrequency.periodDays <= 0) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "periodDays must be a positive number" });
        return;
      }
    }

    const fleet = await prisma.fleet.update({
      where: { id: fleetId },
      data: { requestPolicyJson: policy },
    });

    res.json({ fleet });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update fleet settings");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update fleet settings" });
  }
});

router.get("/fleet/wash-requests/:id", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const role = getUserFleetRole(user);
    const where: any = { id: req.params.id, fleetId };
    if (role === "DRIVER") {
      where.driverUserId = user.id;
    }

    const request = await prisma.washRequest.findFirst({
      where,
      include: {
        vehicle: { select: { id: true, unitNumber: true, categoryCode: true, licensePlate: true } },
        driver: { select: { id: true, firstName: true, lastName: true, email: true } },
        desiredProvider: { select: { id: true, name: true } },
        desiredLocation: { select: { id: true, name: true } },
        approvedProvider: { select: { id: true, name: true } },
        approvedLocation: { select: { id: true, name: true } },
        linkedBooking: { select: { id: true, status: true } },
        revisions: {
          include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { revisionNo: "asc" },
        },
        thread: {
          include: {
            messages: {
              include: { author: { select: { id: true, firstName: true, lastName: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    res.json({ request });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get wash request detail");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get wash request" });
  }
});

router.get("/fleet/driver/vehicles", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const assignments = await prisma.fleetDriverAssignment.findMany({
      where: { driverUserId: user.id, fleetId, endsAt: null },
      include: {
        vehicle: {
          select: {
            id: true, unitNumber: true, categoryCode: true, licensePlate: true,
            lastWashAtUtc: true, nextWashDueAtUtc: true, isActive: true,
            depot: { select: { id: true, name: true } },
          },
        },
      },
    });

    const vehicles = assignments
      .map((a) => a.vehicle)
      .filter((v) => v.isActive);

    res.json({ vehicles });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get driver vehicles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get driver vehicles" });
  }
});

router.post("/fleet/wash-requests", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const {
      vehicleId,
      requestType,
      desiredLocationId,
      desiredStartAtUtc,
      timeWindowCode,
      notes,
      idempotencyKey,
    } = req.body;

    if (!vehicleId || !requestType) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "vehicleId and requestType are required" });
      return;
    }

    if (!["STRUCTURED", "FLEXIBLE"].includes(requestType)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "requestType must be STRUCTURED or FLEXIBLE" });
      return;
    }

    const finalKey = idempotencyKey || `${user.id}-${vehicleId}-${Date.now()}`;

    const existing = await prisma.washRequest.findUnique({
      where: { idempotencyKey: finalKey },
    });
    if (existing) {
      res.status(200).json({ request: existing, duplicate: true });
      return;
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, fleetId, isActive: true },
    });
    if (!vehicle) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found in your fleet" });
      return;
    }

    const role = getUserFleetRole(user);
    const isDriverRole = role === "DRIVER";

    if (desiredLocationId) {
      const location = await prisma.location.findUnique({ where: { id: desiredLocationId } });
      if (!location) {
        res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
        return;
      }
    }

    const fleet = await prisma.fleet.findUnique({
      where: { id: fleetId },
      select: { requestPolicyJson: true },
    });

    const policy = (fleet?.requestPolicyJson as any) || {};
    const autoApprove = policy.driverSelfServeEnabled === true && isDriverRole;
    const isOperatorBooking = !isDriverRole;

    let status: string;
    if (isOperatorBooking) {
      status = "APPROVED_BOOKING_PENDING_PROVIDER";
    } else if (autoApprove) {
      status = "AUTO_APPROVED";
    } else {
      status = "PENDING_FLEET_APPROVAL";
    }

    let assignedDriverId = user.id;
    if (isOperatorBooking) {
      const driverAssignment = await prisma.fleetDriverAssignment.findFirst({
        where: { vehicleId, endsAt: null },
        select: { driverUserId: true },
      });
      if (driverAssignment) {
        assignedDriverId = driverAssignment.driverUserId;
      }
    }

    const washRequest = await prisma.washRequest.create({
      data: {
        fleetId,
        vehicleId,
        driverUserId: assignedDriverId,
        requestType,
        status,
        desiredLocationId: desiredLocationId || null,
        desiredStartAtUtc: desiredStartAtUtc ? new Date(desiredStartAtUtc) : null,
        timeWindowCode: timeWindowCode || null,
        notes: notes || null,
        idempotencyKey: finalKey,
        expiresAtUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        thread: {
          create: {},
        },
      },
      include: {
        vehicle: { select: { id: true, unitNumber: true, categoryCode: true } },
        thread: true,
      },
    });

    await prisma.washRequestRevision.create({
      data: {
        washRequestId: washRequest.id,
        revisionNo: 1,
        changedByUserId: user.id,
        beforeSnapshotJson: {},
        afterSnapshotJson: {
          status: washRequest.status,
          requestType,
          vehicleId,
          desiredLocationId,
          desiredStartAtUtc,
          notes,
        },
        changeReasonCode: "INITIAL_CREATION",
      },
    });

    const unitNum = washRequest.vehicle?.unitNumber || "Unknown";
    if (washRequest.status === "PENDING_FLEET_APPROVAL") {
      const approverIds = await getFleetApproverUserIds(fleetId, user.id);
      if (approverIds.length > 0) {
        createBulkNotifications(approverIds, {
          subject: "New Wash Request",
          body: `${user.firstName} ${user.lastName} submitted a wash request for vehicle ${unitNum}`,
          actionUrl: `/fleet/requests/${washRequest.id}`,
          metadata: { type: "fleet_request_created", requestId: washRequest.id },
        }).catch(() => {});
      }
    }

    if (isOperatorBooking) {
      const assignment = await prisma.fleetDriverAssignment.findFirst({
        where: { vehicleId, endsAt: null },
        select: { driverUserId: true },
      });
      if (assignment && assignment.driverUserId !== user.id) {
        createNotification(assignment.driverUserId, {
          subject: "Wash Booked for Your Vehicle",
          body: `A wash has been booked for vehicle ${unitNum} by your fleet operator.`,
          actionUrl: `/fleet/requests/${washRequest.id}`,
          metadata: { type: "fleet_wash_booked", requestId: washRequest.id },
        }).catch(() => {});
      }
    }

    res.status(201).json({ request: washRequest });
    notifyWashRequestSubmitted(washRequest.id, fleetId).catch(() => {});
  } catch (err: any) {
    req.log.error({ err }, "Failed to create wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create wash request" });
  }
});

router.post("/fleet/wash-requests/:id/cancel", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const request = await prisma.washRequest.findFirst({
      where: { id: req.params.id, fleetId },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    const cancellableStatuses = [
      "REQUEST_CREATED",
      "PENDING_FLEET_APPROVAL",
      "MODIFIED_PENDING_DRIVER_CONFIRMATION",
      "AUTO_APPROVED",
      "APPROVED_BOOKING_PENDING_PROVIDER",
    ];

    if (!cancellableStatuses.includes(request.status)) {
      res.status(400).json({
        errorCode: "INVALID_STATE",
        message: `Cannot cancel request in ${request.status} status`,
      });
      return;
    }

    const role = getUserFleetRole(user);
    if (role === "DRIVER" && request.driverUserId !== user.id) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "You can only cancel your own requests" });
      return;
    }
    if (role === "READ_ONLY_ANALYST") {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Analysts cannot cancel requests" });
      return;
    }

    const prevStatus = request.status;

    const updated = await prisma.washRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED_BY_DRIVER" },
    });

    const revisionCount = await prisma.washRequestRevision.count({
      where: { washRequestId: request.id },
    });

    await prisma.washRequestRevision.create({
      data: {
        washRequestId: request.id,
        revisionNo: revisionCount + 1,
        changedByUserId: user.id,
        beforeSnapshotJson: { status: prevStatus },
        afterSnapshotJson: { status: "CANCELLED_BY_DRIVER" },
        changeReasonCode: "CANCELLED",
      },
    });

    res.json({ request: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to cancel wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to cancel wash request" });
  }
});

router.get("/fleet/wash-requests/:id/messages", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const role = getUserFleetRole(user);
    const msgWhere: any = { id: req.params.id, fleetId };
    if (role === "DRIVER") msgWhere.driverUserId = user.id;

    const request = await prisma.washRequest.findFirst({
      where: msgWhere,
      select: { id: true, thread: { select: { id: true } } },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    if (!request.thread) {
      res.json({ messages: [] });
      return;
    }

    const messages = await prisma.washRequestMessage.findMany({
      where: { threadId: request.thread.id },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({ messages });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get messages");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get messages" });
  }
});

router.post("/fleet/wash-requests/:id/messages", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const role = getUserFleetRole(user);
    if (role === "READ_ONLY_ANALYST") {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Analysts cannot send messages" });
      return;
    }

    const { body } = req.body;
    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Message body is required" });
      return;
    }

    const postMsgWhere: any = { id: req.params.id, fleetId };
    if (role === "DRIVER") postMsgWhere.driverUserId = user.id;

    const request = await prisma.washRequest.findFirst({
      where: postMsgWhere,
      include: { thread: true },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    let threadId = request.thread?.id;
    if (!threadId) {
      const thread = await prisma.washRequestThread.create({
        data: { washRequestId: request.id },
      });
      threadId = thread.id;
    }

    const message = await prisma.washRequestMessage.create({
      data: {
        threadId,
        authorUserId: user.id,
        body: body.trim(),
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.status(201).json({ message });
  } catch (err: any) {
    req.log.error({ err }, "Failed to send message");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to send message" });
  }
});

router.get("/fleet/locations/search", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const { q } = req.query;
    const where: any = { isVisible: true };
    if (q && typeof q === "string" && q.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: "insensitive" } },
        { city: { contains: q.trim(), mode: "insensitive" } },
      ];
    }

    const locations = await prisma.location.findMany({
      where,
      select: {
        id: true, name: true, addressLine1: true, city: true, regionCode: true,
        provider: { select: { id: true, name: true } },
      },
      take: 20,
      orderBy: { name: "asc" },
    });

    res.json({ locations });
  } catch (err: any) {
    req.log.error({ err }, "Failed to search locations");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to search locations" });
  }
});

router.get("/fleet/recurring-programs/:id", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const program = await prisma.fleetRecurringProgram.findFirst({
      where: { id: req.params.id, fleetId },
      include: {
        scopeDepot: { select: { id: true, name: true } },
        scopeVehicleGroup: { select: { id: true, name: true } },
        generatedTasks: {
          include: {
            vehicle: { select: { id: true, unitNumber: true, categoryCode: true } },
          },
          orderBy: { dueAtUtc: "desc" },
          take: 50,
        },
        _count: { select: { generatedTasks: true } },
      },
    });

    if (!program) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Program not found" });
      return;
    }

    res.json({ program });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get program detail");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get program detail" });
  }
});

router.post("/fleet/recurring-programs", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { name, scopeType, scopeDepotId, scopeVehicleGroupId, cadenceType, cadenceConfigJson, servicePolicyJson, providerPolicyJson, horizonDays } = req.body;

    if (!name || !scopeType || !cadenceType) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "name, scopeType, and cadenceType are required" });
      return;
    }

    if (scopeType === "depot") {
      if (!scopeDepotId) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "scopeDepotId is required for depot scope" });
        return;
      }
      const depot = await prisma.fleetDepot.findFirst({ where: { id: scopeDepotId, fleetId } });
      if (!depot) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Depot not found in this fleet" }); return; }
    }
    if (scopeType === "vehicle_group") {
      if (!scopeVehicleGroupId) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "scopeVehicleGroupId is required for vehicle_group scope" });
        return;
      }
      const group = await prisma.fleetVehicleGroup.findFirst({ where: { id: scopeVehicleGroupId, fleetId } });
      if (!group) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle group not found in this fleet" }); return; }
    }

    const program = await prisma.fleetRecurringProgram.create({
      data: {
        fleetId,
        name,
        scopeType,
        scopeDepotId: scopeType === "depot" ? scopeDepotId : null,
        scopeVehicleGroupId: scopeType === "vehicle_group" ? scopeVehicleGroupId : null,
        cadenceType,
        cadenceConfigJson: cadenceConfigJson || {},
        servicePolicyJson: servicePolicyJson || {},
        providerPolicyJson: providerPolicyJson || {},
        horizonDays: horizonDays || 30,
        isActive: false,
      },
      include: {
        scopeDepot: { select: { id: true, name: true } },
        scopeVehicleGroup: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ program });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create recurring program");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create recurring program" });
  }
});

router.put("/fleet/recurring-programs/:id", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const existing = await prisma.fleetRecurringProgram.findFirst({ where: { id: req.params.id, fleetId } });
    if (!existing) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Program not found" }); return; }

    const { name, scopeType, scopeDepotId, scopeVehicleGroupId, cadenceType, cadenceConfigJson, servicePolicyJson, providerPolicyJson, horizonDays } = req.body;

    const effectiveScopeType = scopeType || existing.scopeType;
    if (effectiveScopeType === "depot" && scopeDepotId) {
      const depot = await prisma.fleetDepot.findFirst({ where: { id: scopeDepotId, fleetId } });
      if (!depot) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Depot not found in this fleet" }); return; }
    }
    if (effectiveScopeType === "vehicle_group" && scopeVehicleGroupId) {
      const group = await prisma.fleetVehicleGroup.findFirst({ where: { id: scopeVehicleGroupId, fleetId } });
      if (!group) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle group not found in this fleet" }); return; }
    }

    const program = await prisma.fleetRecurringProgram.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(scopeType && { scopeType }),
        ...(scopeType === "depot" && { scopeDepotId, scopeVehicleGroupId: null }),
        ...(scopeType === "vehicle_group" && { scopeVehicleGroupId, scopeDepotId: null }),
        ...(scopeType === "fleet" && { scopeDepotId: null, scopeVehicleGroupId: null }),
        ...(cadenceType && { cadenceType }),
        ...(cadenceConfigJson && { cadenceConfigJson }),
        ...(servicePolicyJson && { servicePolicyJson }),
        ...(providerPolicyJson && { providerPolicyJson }),
        ...(horizonDays && { horizonDays }),
      },
      include: {
        scopeDepot: { select: { id: true, name: true } },
        scopeVehicleGroup: { select: { id: true, name: true } },
      },
    });

    res.json({ program });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update recurring program");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update recurring program" });
  }
});

router.post("/fleet/recurring-programs/:id/toggle", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const existing = await prisma.fleetRecurringProgram.findFirst({ where: { id: req.params.id, fleetId } });
    if (!existing) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Program not found" }); return; }

    const program = await prisma.fleetRecurringProgram.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });

    res.json({ program, activated: program.isActive });
  } catch (err: any) {
    req.log.error({ err }, "Failed to toggle program");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to toggle program" });
  }
});

router.delete("/fleet/recurring-programs/:id", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const existing = await prisma.fleetRecurringProgram.findFirst({ where: { id: req.params.id, fleetId } });
    if (!existing) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Program not found" }); return; }

    const nonPendingCount = await prisma.fleetGeneratedTask.count({
      where: { recurringProgramId: req.params.id, generationState: { notIn: ["PENDING", "SKIPPED"] } },
    });
    if (nonPendingCount > 0) {
      res.status(409).json({
        errorCode: "HAS_ACTIVE_TASKS",
        message: `Cannot delete: ${nonPendingCount} task(s) are in progress. Mark them as skipped first.`,
      });
      return;
    }

    await prisma.fleetGeneratedTask.deleteMany({ where: { recurringProgramId: req.params.id } });
    await prisma.fleetRecurringProgram.delete({ where: { id: req.params.id } });

    res.json({ deleted: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to delete program");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to delete program" });
  }
});

router.post("/fleet/recurring-programs/:id/generate", requireAuth, requireFleetMember, requireFleetAdmin, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const program = await prisma.fleetRecurringProgram.findFirst({
      where: { id: req.params.id, fleetId },
      include: {
        scopeDepot: true,
        scopeVehicleGroup: { include: { members: { select: { vehicleId: true } } } },
      },
    });

    if (!program) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Program not found" }); return; }

    let vehicleWhere: any = { fleetId, isActive: true };
    if (program.scopeType === "depot" && program.scopeDepotId) {
      vehicleWhere.depotId = program.scopeDepotId;
    } else if (program.scopeType === "vehicle_group" && program.scopeVehicleGroup) {
      const memberVehicleIds = program.scopeVehicleGroup.members.map((m) => m.vehicleId);
      vehicleWhere.id = { in: memberVehicleIds };
    }

    const vehicles = await prisma.vehicle.findMany({ where: vehicleWhere, select: { id: true, unitNumber: true } });

    const cadenceConfig = program.cadenceConfigJson as any;
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + program.horizonDays * 24 * 60 * 60 * 1000);

    const existingTasks = await prisma.fleetGeneratedTask.findMany({
      where: { recurringProgramId: program.id },
      select: { vehicleId: true, dueAtUtc: true },
    });
    const existingSet = new Set(
      existingTasks.map((t) => `${t.vehicleId}_${t.dueAtUtc.toISOString().slice(0, 10)}`)
    );

    const tasksToCreate: Array<{ recurringProgramId: string; vehicleId: string; dueAtUtc: Date }> = [];

    for (const vehicle of vehicles) {
      const dueDates = generateDueDates(now, horizonEnd, program.cadenceType, cadenceConfig);
      for (const dueDate of dueDates) {
        const key = `${vehicle.id}_${dueDate.toISOString().slice(0, 10)}`;
        if (!existingSet.has(key)) {
          tasksToCreate.push({
            recurringProgramId: program.id,
            vehicleId: vehicle.id,
            dueAtUtc: new Date(dueDate),
          });
        }
      }
    }

    if (tasksToCreate.length > 0) {
      await prisma.fleetGeneratedTask.createMany({ data: tasksToCreate });
    }

    await prisma.fleetRecurringProgram.update({
      where: { id: program.id },
      data: { lastGeneratedAt: now },
    });

    if (tasksToCreate.length > 0) {
      const adminIds = await getFleetAdminUserIds(fleetId);
      if (adminIds.length > 0) {
        createBulkNotifications(adminIds, {
          subject: "Tasks Generated",
          body: `${tasksToCreate.length} wash tasks generated for program "${program.name}" across ${vehicles.length} vehicles`,
          actionUrl: `/fleet/programs/${program.id}`,
          metadata: { type: "fleet_tasks_generated", programId: program.id, count: tasksToCreate.length },
        }).catch(() => {});
      }
    }

    res.json({
      generated: tasksToCreate.length,
      vehicleCount: vehicles.length,
      horizonDays: program.horizonDays,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to generate tasks");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to generate tasks" });
  }
});

function generateDueDates(from: Date, until: Date, cadenceType: string, config: any): Date[] {
  const dates: Date[] = [];
  const applyTime = (d: Date) => {
    if (config.preferredTimeUtc) {
      const [h, m] = config.preferredTimeUtc.split(":").map(Number);
      d.setUTCHours(h || 0, m || 0, 0, 0);
    }
    return d;
  };

  if (cadenceType === "WEEKLY" || cadenceType === "BIWEEKLY") {
    const targetDay = config.dayOfWeek ?? 1;
    const step = cadenceType === "BIWEEKLY" ? 14 : 7;
    const d = new Date(from);
    d.setUTCHours(0, 0, 0, 0);
    const current = d.getUTCDay();
    const diff = (targetDay - current + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + diff);
    applyTime(d);
    while (d <= until) {
      dates.push(new Date(d));
      d.setUTCDate(d.getUTCDate() + step);
    }
  } else if (cadenceType === "MONTHLY") {
    const targetDom = config.dayOfMonth ?? 1;
    const d = new Date(from);
    d.setUTCHours(0, 0, 0, 0);
    if (d.getUTCDate() >= targetDom) {
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    while (d <= until) {
      const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const actualDay = Math.min(targetDom, daysInMonth);
      const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), actualDay));
      applyTime(due);
      if (due > from && due <= until) {
        dates.push(due);
      }
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else if (cadenceType === "EVERY_X_DAYS") {
    const interval = config.intervalDays || 7;
    const d = new Date(from);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + interval);
    applyTime(d);
    while (d <= until) {
      dates.push(new Date(d));
      d.setUTCDate(d.getUTCDate() + interval);
    }
  }

  return dates;
}

function requireFleetApprover(req: any, res: any, next: any) {
  const user = req.user as SessionUser;
  if (isPlatformAdmin(user)) return next();
  const role = getUserFleetRole(user);
  if (!role || !["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER"].includes(role)) {
    res.status(403).json({ errorCode: "FORBIDDEN", message: "Only fleet operators can perform this action" });
    return;
  }
  next();
}

router.post("/fleet/wash-requests/:id/approve", requireAuth, requireFleetMember, requireFleetApprover, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { approvedLocationId, approvedStartAtUtc, approvalNotes } = req.body;

    const request = await prisma.washRequest.findFirst({
      where: { id: req.params.id, fleetId },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    const approvableStatuses = ["PENDING_FLEET_APPROVAL", "REQUEST_CREATED"];
    if (!approvableStatuses.includes(request.status)) {
      res.status(400).json({
        errorCode: "INVALID_STATE",
        message: `Cannot approve request in ${request.status} status`,
      });
      return;
    }

    if (approvedLocationId) {
      const location = await prisma.location.findUnique({ where: { id: approvedLocationId } });
      if (!location) {
        res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
        return;
      }
    }

    const prevStatus = request.status;
    const finalLocationId = approvedLocationId || request.desiredLocationId;
    const finalStartAt = approvedStartAtUtc ? new Date(approvedStartAtUtc) : request.desiredStartAtUtc;

    const updated = await prisma.washRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED_BOOKING_PENDING_PROVIDER",
        approvedLocationId: finalLocationId,
        approvedStartAtUtc: finalStartAt,
        approvalNotes: approvalNotes || null,
      },
      include: {
        vehicle: { select: { id: true, unitNumber: true } },
        approvedLocation: { select: { id: true, name: true } },
      },
    });

    const revisionCount = await prisma.washRequestRevision.count({ where: { washRequestId: request.id } });
    await prisma.washRequestRevision.create({
      data: {
        washRequestId: request.id,
        revisionNo: revisionCount + 1,
        changedByUserId: user.id,
        beforeSnapshotJson: { status: prevStatus },
        afterSnapshotJson: {
          status: "APPROVED_BOOKING_PENDING_PROVIDER",
          approvedLocationId: finalLocationId,
          approvedStartAtUtc: finalStartAt?.toISOString(),
          approvalNotes,
        },
        changeReasonCode: "APPROVED",
      },
    });

    if (request.driverUserId) {
      createNotification(request.driverUserId, {
        subject: "Request Approved",
        body: `Your wash request for vehicle ${request.vehicle?.unitNumber || ""} has been approved by ${user.firstName} ${user.lastName}`,
        actionUrl: `/fleet/requests/${request.id}`,
        metadata: { type: "fleet_request_approved", requestId: request.id },
      }).catch(() => {});
    }

    res.json({ request: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to approve wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to approve wash request" });
  }
});

router.post("/fleet/wash-requests/:id/modify", requireAuth, requireFleetMember, requireFleetApprover, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { approvedLocationId, approvedStartAtUtc, approvalNotes } = req.body;

    if (!approvedLocationId && !approvedStartAtUtc) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "At least one modification (location or time) is required",
      });
      return;
    }

    const request = await prisma.washRequest.findFirst({
      where: { id: req.params.id, fleetId },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    const modifiableStatuses = ["PENDING_FLEET_APPROVAL", "REQUEST_CREATED"];
    if (!modifiableStatuses.includes(request.status)) {
      res.status(400).json({
        errorCode: "INVALID_STATE",
        message: `Cannot modify request in ${request.status} status`,
      });
      return;
    }

    if (approvedLocationId) {
      const location = await prisma.location.findUnique({ where: { id: approvedLocationId } });
      if (!location) {
        res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
        return;
      }
    }

    const prevStatus = request.status;

    const finalLocationId = approvedLocationId || request.desiredLocationId;
    const finalStartAt = approvedStartAtUtc ? new Date(approvedStartAtUtc) : request.desiredStartAtUtc;

    const updated = await prisma.washRequest.update({
      where: { id: request.id },
      data: {
        status: "MODIFIED_PENDING_DRIVER_CONFIRMATION",
        approvedLocationId: finalLocationId,
        approvedStartAtUtc: finalStartAt,
        approvalNotes: approvalNotes || null,
      },
      include: {
        vehicle: { select: { id: true, unitNumber: true } },
        approvedLocation: { select: { id: true, name: true } },
      },
    });

    const revisionCount = await prisma.washRequestRevision.count({ where: { washRequestId: request.id } });
    await prisma.washRequestRevision.create({
      data: {
        washRequestId: request.id,
        revisionNo: revisionCount + 1,
        changedByUserId: user.id,
        beforeSnapshotJson: {
          status: prevStatus,
          desiredLocationId: request.desiredLocationId,
          desiredStartAtUtc: request.desiredStartAtUtc?.toISOString(),
        },
        afterSnapshotJson: {
          status: "MODIFIED_PENDING_DRIVER_CONFIRMATION",
          approvedLocationId,
          approvedStartAtUtc,
          approvalNotes,
        },
        changeReasonCode: "MODIFIED_BY_FLEET",
      },
    });

    if (request.driverUserId) {
      createNotification(request.driverUserId, {
        subject: "Request Modified",
        body: `Your wash request has been modified by ${user.firstName} ${user.lastName} and needs your confirmation`,
        actionUrl: `/fleet/requests/${request.id}`,
        metadata: { type: "fleet_request_modified", requestId: request.id },
      }).catch(() => {});
    }

    res.json({ request: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to modify wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to modify wash request" });
  }
});

router.post("/fleet/wash-requests/:id/decline", requireAuth, requireFleetMember, requireFleetApprover, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { declineReasonCode, declineNotes } = req.body;

    if (!declineReasonCode) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Decline reason is required" });
      return;
    }

    const request = await prisma.washRequest.findFirst({
      where: { id: req.params.id, fleetId },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    const declinableStatuses = ["PENDING_FLEET_APPROVAL", "REQUEST_CREATED", "MODIFIED_PENDING_DRIVER_CONFIRMATION"];
    if (!declinableStatuses.includes(request.status)) {
      res.status(400).json({
        errorCode: "INVALID_STATE",
        message: `Cannot decline request in ${request.status} status`,
      });
      return;
    }

    const prevStatus = request.status;

    const updated = await prisma.washRequest.update({
      where: { id: request.id },
      data: {
        status: "DECLINED",
        declineReasonCode,
        declineNotes: declineNotes || null,
      },
    });

    const revisionCount = await prisma.washRequestRevision.count({ where: { washRequestId: request.id } });
    await prisma.washRequestRevision.create({
      data: {
        washRequestId: request.id,
        revisionNo: revisionCount + 1,
        changedByUserId: user.id,
        beforeSnapshotJson: { status: prevStatus },
        afterSnapshotJson: { status: "DECLINED", declineReasonCode, declineNotes },
        changeReasonCode: "DECLINED",
      },
    });

    if (request.driverUserId) {
      createNotification(request.driverUserId, {
        subject: "Request Declined",
        body: `Your wash request has been declined by ${user.firstName} ${user.lastName}. Reason: ${declineReasonCode.replace(/_/g, " ").toLowerCase()}`,
        actionUrl: `/fleet/requests/${request.id}`,
        metadata: { type: "fleet_request_declined", requestId: request.id },
      }).catch(() => {});
    }

    res.json({ request: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to decline wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to decline wash request" });
  }
});

router.post("/fleet/wash-requests/:id/driver-confirm", requireAuth, requireFleetMember, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const { accepted } = req.body;
    if (typeof accepted !== "boolean") {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "accepted (boolean) is required" });
      return;
    }

    const request = await prisma.washRequest.findFirst({
      where: { id: req.params.id, fleetId, driverUserId: user.id },
    });

    if (!request) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Wash request not found" });
      return;
    }

    if (request.status !== "MODIFIED_PENDING_DRIVER_CONFIRMATION") {
      res.status(400).json({
        errorCode: "INVALID_STATE",
        message: "Request is not awaiting driver confirmation",
      });
      return;
    }

    const prevStatus = request.status;
    const newStatus = accepted ? "APPROVED_BOOKING_PENDING_PROVIDER" : "CANCELLED_BY_DRIVER";

    const updated = await prisma.washRequest.update({
      where: { id: request.id },
      data: { status: newStatus },
    });

    const revisionCount = await prisma.washRequestRevision.count({ where: { washRequestId: request.id } });
    await prisma.washRequestRevision.create({
      data: {
        washRequestId: request.id,
        revisionNo: revisionCount + 1,
        changedByUserId: user.id,
        beforeSnapshotJson: { status: prevStatus },
        afterSnapshotJson: { status: newStatus },
        changeReasonCode: accepted ? "DRIVER_ACCEPTED_MODIFICATION" : "DRIVER_REJECTED_MODIFICATION",
      },
    });

    const approverIds = await getFleetApproverUserIds(fleetId, user.id);
    if (approverIds.length > 0) {
      createBulkNotifications(approverIds, {
        subject: accepted ? "Modification Accepted" : "Modification Rejected",
        body: accepted
          ? `${user.firstName} ${user.lastName} accepted the modified wash request`
          : `${user.firstName} ${user.lastName} rejected the modification and the request has been cancelled`,
        actionUrl: `/fleet/requests/${request.id}`,
        metadata: { type: "fleet_driver_confirmed", requestId: request.id, accepted },
      }).catch(() => {});
    }

    res.json({ request: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to confirm wash request");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to confirm modification" });
  }
});

router.get("/fleet/reports/compliance", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const vehicles = await prisma.vehicle.findMany({
      where: { fleetId, isActive: true },
      select: {
        id: true,
        unitNumber: true,
        nextWashDueAtUtc: true,
        lastWashAtUtc: true,
        depot: { select: { id: true, name: true } },
      },
    });

    const now = new Date();
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    let onTrack = 0, dueSoon = 0, overdue = 0, noSchedule = 0;

    const depotMap: Record<string, { name: string; onTrack: number; dueSoon: number; overdue: number; total: number }> = {};

    for (const v of vehicles) {
      const depotName = v.depot?.name || "Unassigned";
      const depotId = v.depot?.id || "none";
      if (!depotMap[depotId]) depotMap[depotId] = { name: depotName, onTrack: 0, dueSoon: 0, overdue: 0, total: 0 };
      depotMap[depotId].total++;

      if (!v.nextWashDueAtUtc) {
        noSchedule++;
        depotMap[depotId].onTrack++;
      } else if (v.nextWashDueAtUtc < now) {
        overdue++;
        depotMap[depotId].overdue++;
      } else if (v.nextWashDueAtUtc <= threeDaysOut) {
        dueSoon++;
        depotMap[depotId].dueSoon++;
      } else {
        onTrack++;
        depotMap[depotId].onTrack++;
      }
    }

    const total = vehicles.length;

    res.json({
      summary: {
        total,
        onTrack,
        dueSoon,
        overdue,
        noSchedule,
        complianceRate: total > 0 ? Math.round(((onTrack + noSchedule) / total) * 100) : 100,
      },
      byDepot: Object.entries(depotMap).map(([id, d]) => ({
        depotId: id,
        depotName: d.name,
        total: d.total,
        onTrack: d.onTrack,
        dueSoon: d.dueSoon,
        overdue: d.overdue,
        complianceRate: d.total > 0 ? Math.round((d.onTrack / d.total) * 100) : 100,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get compliance report");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get compliance report" });
  }
});

router.get("/fleet/reports/requests", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const requests = await prisma.washRequest.findMany({
      where: { fleetId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        revisions: {
          where: { changeReasonCode: { in: ["APPROVED", "DECLINED", "MODIFIED_BY_FLEET"] } },
          select: { createdAt: true, changeReasonCode: true },
          orderBy: { revisionNo: "asc" },
          take: 1,
        },
      },
    });

    const statusCounts: Record<string, number> = {};
    let totalDecisionTimeMs = 0;
    let decisionsCount = 0;
    let approvedCount = 0;
    let declinedCount = 0;
    let modifiedCount = 0;
    let autoApprovedCount = 0;

    for (const r of requests) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

      if (r.status === "AUTO_APPROVED") autoApprovedCount++;

      if (r.revisions.length > 0) {
        const rev = r.revisions[0];
        const decisionTimeMs = rev.createdAt.getTime() - r.createdAt.getTime();
        totalDecisionTimeMs += decisionTimeMs;
        decisionsCount++;

        if (rev.changeReasonCode === "APPROVED") approvedCount++;
        else if (rev.changeReasonCode === "DECLINED") declinedCount++;
        else if (rev.changeReasonCode === "MODIFIED_BY_FLEET") modifiedCount++;
      }
    }

    const totalReviewed = approvedCount + declinedCount + modifiedCount;

    res.json({
      total: requests.length,
      statusBreakdown: statusCounts,
      approvalMetrics: {
        approved: approvedCount,
        declined: declinedCount,
        modified: modifiedCount,
        autoApproved: autoApprovedCount,
        approvalRate: totalReviewed > 0 ? Math.round((approvedCount / totalReviewed) * 100) : 0,
        avgDecisionTimeHours: decisionsCount > 0 ? Math.round((totalDecisionTimeMs / decisionsCount) / (1000 * 60 * 60) * 10) / 10 : 0,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get request report");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get request report" });
  }
});

router.get("/fleet/reports/programs", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const fleetId = (req as any).fleetId || getUserFleetId(user);
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const programs = await prisma.fleetRecurringProgram.findMany({
      where: { fleetId },
      select: {
        id: true,
        name: true,
        isActive: true,
        cadenceType: true,
        scopeType: true,
        lastGeneratedAt: true,
        generatedTasks: {
          select: { generationState: true },
        },
      },
    });

    const programStats = programs.map((p) => {
      const taskStates: Record<string, number> = {};
      for (const t of p.generatedTasks) {
        taskStates[t.generationState] = (taskStates[t.generationState] || 0) + 1;
      }
      return {
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        cadenceType: p.cadenceType,
        scopeType: p.scopeType,
        lastGeneratedAt: p.lastGeneratedAt,
        totalTasks: p.generatedTasks.length,
        tasksByState: taskStates,
      };
    });

    const totalTasks = programStats.reduce((sum, p) => sum + p.totalTasks, 0);
    const activePrograms = programStats.filter((p) => p.isActive).length;

    res.json({
      summary: {
        totalPrograms: programs.length,
        activePrograms,
        inactivePrograms: programs.length - activePrograms,
        totalTasksGenerated: totalTasks,
      },
      programs: programStats,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get programs report");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get programs report" });
  }
});

// ─── NEW REPORT ENDPOINTS (Task 2.5) ────────────────────────────────────────

router.get("/fleet/reports/wash-activity", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : monthStart;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : now;

    const where: any = {
      vehicle: { fleetId },
      scheduledStartAtUtc: { gte: startDate, lte: endDate },
    };
    if (req.query.vehicleId) where.vehicleId = req.query.vehicleId;
    if (req.query.status) where.status = req.query.status;

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        vehicle: { select: { id: true, unitNumber: true, subtypeCode: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true, provider: { select: { id: true, name: true } } } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStartAtUtc: "desc" },
      take: 200,
    });

    const totalSpend = await prisma.booking.aggregate({
      _sum: { totalPriceMinor: true },
      _count: true,
      where,
    });

    res.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        date: b.scheduledStartAtUtc,
        vehicle: b.vehicle,
        driver: b.customer,
        provider: b.location?.provider?.name,
        location: b.location?.name,
        service: b.serviceNameSnapshot,
        status: b.status,
        cost: b.totalPriceMinor,
        currencyCode: b.currencyCode,
      })),
      totalCount: totalSpend._count,
      totalSpendMinor: totalSpend._sum.totalPriceMinor || 0,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get wash activity report");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load report" });
  }
});

router.get("/fleet/reports/vehicle-compliance", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const vehicles = await prisma.vehicle.findMany({
      where: { fleetId, isActive: true },
      select: {
        id: true, unitNumber: true, subtypeCode: true, categoryCode: true,
        lastWashAtUtc: true, nextWashDueAtUtc: true,
        depot: { select: { name: true } },
      },
      orderBy: { unitNumber: "asc" },
    });

    const enriched = vehicles.map((v) => {
      let status = "CURRENT";
      if (!v.nextWashDueAtUtc) status = "UNKNOWN";
      else if (v.nextWashDueAtUtc < now) status = "OVERDUE";
      else if (v.nextWashDueAtUtc <= dueSoonThreshold) status = "DUE_SOON";
      return { ...v, complianceStatus: status };
    });

    // Sort: OVERDUE first, then DUE_SOON, then CURRENT/UNKNOWN
    const order: Record<string, number> = { OVERDUE: 0, DUE_SOON: 1, CURRENT: 2, UNKNOWN: 3 };
    enriched.sort((a, b) => (order[a.complianceStatus] ?? 9) - (order[b.complianceStatus] ?? 9));

    res.json({ vehicles: enriched });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get vehicle compliance report");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load report" });
  }
});

router.get("/fleet/reports/spending-summary", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const now = new Date();
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : sixMonthsAgo;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : now;

    const completedStatuses = ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED", "IN_SERVICE", "CHECKED_IN", "PROVIDER_CONFIRMED"];

    const bookings = await prisma.booking.findMany({
      where: {
        vehicle: { fleetId },
        scheduledStartAtUtc: { gte: startDate, lte: endDate },
        status: { in: completedStatuses as any },
      },
      select: {
        totalPriceMinor: true,
        scheduledStartAtUtc: true,
        vehicle: { select: { unitNumber: true, subtypeCode: true } },
        location: { select: { name: true, provider: { select: { name: true } } } },
      },
    });

    // By Provider
    const providerMap = new Map<string, { providerName: string; locationName: string; totalSpendMinor: number; bookingCount: number }>();
    for (const b of bookings) {
      const key = `${b.location?.provider?.name}||${b.location?.name}`;
      const existing = providerMap.get(key) || { providerName: b.location?.provider?.name || "", locationName: b.location?.name || "", totalSpendMinor: 0, bookingCount: 0 };
      existing.totalSpendMinor += b.totalPriceMinor;
      existing.bookingCount += 1;
      providerMap.set(key, existing);
    }
    const byProvider = Array.from(providerMap.values()).sort((a, b) => b.totalSpendMinor - a.totalSpendMinor);

    // By Vehicle
    const vehicleMap = new Map<string, { unitNumber: string; subtypeCode: string; totalSpendMinor: number; bookingCount: number }>();
    for (const b of bookings) {
      const key = b.vehicle?.unitNumber || "Unknown";
      const existing = vehicleMap.get(key) || { unitNumber: key, subtypeCode: b.vehicle?.subtypeCode || "", totalSpendMinor: 0, bookingCount: 0 };
      existing.totalSpendMinor += b.totalPriceMinor;
      existing.bookingCount += 1;
      vehicleMap.set(key, existing);
    }
    const byVehicle = Array.from(vehicleMap.values()).sort((a, b) => b.totalSpendMinor - a.totalSpendMinor);

    // By Month
    const monthMap = new Map<string, { month: string; totalSpendMinor: number; bookingCount: number }>();
    for (const b of bookings) {
      const d = b.scheduledStartAtUtc;
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const existing = monthMap.get(month) || { month, totalSpendMinor: 0, bookingCount: 0 };
      existing.totalSpendMinor += b.totalPriceMinor;
      existing.bookingCount += 1;
      monthMap.set(month, existing);
    }
    const byMonth = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    res.json({ byProvider, byVehicle, byMonth });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get spending summary");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load report" });
  }
});

// ─── Enhanced Fleet Analytics (Phase 7) ────────────────────────────────────

router.get("/fleet/reports/provider-comparison", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const completedStatuses = ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"];

    const bookings = await prisma.booking.findMany({
      where: { vehicle: { fleetId }, status: { in: completedStatuses as any } },
      select: {
        totalPriceMinor: true,
        status: true,
        location: { select: { name: true, providerId: true, provider: { select: { name: true } } } },
      },
    });

    // Group by provider
    const providerMap = new Map<string, { providerName: string; totalBookings: number; totalSpendMinor: number }>();
    for (const b of bookings) {
      const provId = b.location?.providerId || "unknown";
      const existing = providerMap.get(provId) || { providerName: b.location?.provider?.name || "Unknown", totalBookings: 0, totalSpendMinor: 0 };
      existing.totalBookings += 1;
      existing.totalSpendMinor += b.totalPriceMinor;
      providerMap.set(provId, existing);
    }

    // Get average ratings per provider from reviews
    const providerIds = Array.from(providerMap.keys());
    const reviews = await prisma.review.findMany({
      where: { booking: { vehicle: { fleetId } }, location: { providerId: { in: providerIds } } },
      select: { rating: true, location: { select: { providerId: true } } },
    });

    const ratingMap = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      const provId = r.location?.providerId || "";
      const existing = ratingMap.get(provId) || { sum: 0, count: 0 };
      existing.sum += r.rating;
      existing.count += 1;
      ratingMap.set(provId, existing);
    }

    const providers = Array.from(providerMap.entries()).map(([provId, data]) => {
      const ratings = ratingMap.get(provId);
      return {
        providerName: data.providerName,
        totalBookings: data.totalBookings,
        avgCostMinor: data.totalBookings > 0 ? Math.round(data.totalSpendMinor / data.totalBookings) : 0,
        avgRating: ratings && ratings.count > 0 ? Number((ratings.sum / ratings.count).toFixed(1)) : null,
      };
    }).sort((a, b) => b.totalBookings - a.totalBookings);

    res.json({ providers });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get provider comparison");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load report" });
  }
});

router.get("/fleet/reports/subscription-savings", requireAuth, requireFleetMember, requireFleetNonDriver, async (req, res) => {
  try {
    const fleetId = (req as any).fleetId;
    if (!fleetId) { res.status(403).json({ errorCode: "FORBIDDEN", message: "No fleet" }); return; }

    const subscriptions = await prisma.fleetSubscription.findMany({
      where: { fleetId, status: "ACTIVE" },
      select: { id: true, package: { select: { pricePerWashMinor: true } } },
    });

    if (subscriptions.length === 0) {
      res.json({ hasSubscriptions: false, totalSavedMinor: 0, subBookingCount: 0 });
      return;
    }

    // Count completed bookings linked to subscribed services
    // Subscription cap is $20 vs standard $25 — savings = $5 per booking
    const SUBSCRIPTION_CAP = 2000;
    const STANDARD_CAP = 2500;
    const savingsPerBooking = STANDARD_CAP - SUBSCRIPTION_CAP;

    const subIds = subscriptions.map((s) => s.id);
    const bookingCount = await prisma.booking.count({
      where: {
        vehicle: { fleetId },
        status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] as any },
        subscriptionId: { in: subIds },
      },
    });

    res.json({
      hasSubscriptions: true,
      totalSavedMinor: bookingCount * savingsPerBooking,
      subBookingCount: bookingCount,
      activeSubscriptions: subscriptions.length,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get subscription savings");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load report" });
  }
});

export default router;
