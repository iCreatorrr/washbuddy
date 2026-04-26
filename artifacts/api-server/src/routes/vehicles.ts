import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireFleetAccess } from "../middlewares/requireAuth";
import { isPlatformAdmin, isFleetRole, type SessionUser } from "../lib/auth";

const router: IRouter = Router();

const ACTIVE_BOOKING_STATUSES = [
  "REQUESTED",
  "PROVIDER_CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
] as const;

const VALID_BODY_TYPES = ["COACH", "SCHOOL_BUS", "SHUTTLE", "TRANSIT_BUS", "OTHER"] as const;
type BodyType = (typeof VALID_BODY_TYPES)[number];
function normalizeBodyType(raw: unknown): BodyType {
  if (typeof raw !== "string") return "OTHER";
  const upper = raw.toUpperCase();
  return (VALID_BODY_TYPES as readonly string[]).includes(upper) ? (upper as BodyType) : "OTHER";
}

/** Map driver-side bodyType → ServiceCompatibility subtypeCode so a Coach
 * the driver added picks up the COACH rule (maxLen 540) instead of falling
 * back to the STANDARD rule (maxLen 480) and being told it doesn't fit. */
function defaultSubtypeFromBodyType(bodyType: BodyType): string {
  switch (bodyType) {
    case "COACH": return "COACH";
    case "SHUTTLE": return "SHUTTLE";
    case "SCHOOL_BUS": return "SCHOOL_BUS";
    case "TRANSIT_BUS": return "STANDARD";
    case "OTHER": return "STANDARD";
  }
}

/** Compute the set of vehicle IDs a user is eligible to set as their
 * default: personally-owned (ownerUserId === user.id) ∪ vehicles they
 * have a currently-active FleetDriverAssignment for. */
async function getEligibleVehicleIds(userId: string, now: Date = new Date()): Promise<Set<string>> {
  const personal = await prisma.vehicle.findMany({
    where: { ownerUserId: userId, isActive: true },
    select: { id: true },
  });

  const assignments = await prisma.fleetDriverAssignment.findMany({
    where: {
      driverUserId: userId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    select: { vehicleId: true },
  });

  const ids = new Set<string>(personal.map((v) => v.id));
  for (const a of assignments) ids.add(a.vehicleId);
  return ids;
}

router.get("/vehicles", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);

    if (isAdmin) {
      const vehicles = await prisma.vehicle.findMany({
        where: { isActive: true },
        include: {
          fleet: { select: { id: true, name: true } },
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { unitNumber: "asc" },
      });
      res.json({ vehicles, defaultVehicleId: null });
      return;
    }

    // The driver-facing list scopes to vehicles the user can actually
    // operate on: personally-owned + currently-assigned fleet vehicles
    // (active FleetDriverAssignment). This is the SAME set
    // `getEligibleVehicleIds` returns, so the "show in My Vehicles" and
    // "settable as default" sets stay in lockstep — no more cases where a
    // driver sees a fleet vehicle but the API rejects it as not eligible.
    // Fleet-wide views (all 200 buses, regardless of who's driving today)
    // live under /api/fleets/:fleetId/vehicles, not here.
    const [eligible, dbUser] = await Promise.all([
      getEligibleVehicleIds(user.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { defaultVehicleId: true } }),
    ]);

    const eligibleIds = Array.from(eligible);
    const rawVehicles = eligibleIds.length === 0 ? [] : await prisma.vehicle.findMany({
      where: { id: { in: eligibleIds }, isActive: true },
      include: {
        fleet: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { unitNumber: "asc" },
    });

    // Lazy invalidation: if the user's defaultVehicleId points at a vehicle
    // that's no longer in their eligible set (assignment ended, soft-deleted,
    // etc.), surface the active vehicle as null without clearing the column.
    const storedDefault = dbUser?.defaultVehicleId ?? null;
    const effectiveDefault = storedDefault && eligible.has(storedDefault) ? storedDefault : null;

    const vehicles = rawVehicles.map((v) => ({
      ...v,
      isDefault: effectiveDefault === v.id,
      isEligibleForDefault: eligible.has(v.id),
      isOwnedByUser: v.ownerUserId === user.id,
    }));

    res.json({ vehicles, defaultVehicleId: effectiveDefault });
  } catch (err) {
    req.log.error({ err }, "Failed to list vehicles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list vehicles" });
  }
});

router.get("/fleets/:fleetId/vehicles", requireAuth, requireFleetAccess(), async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { fleetId: req.params.fleetId, isActive: true },
      include: { owner: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { unitNumber: "asc" },
    });
    res.json({ vehicles });
  } catch (err) {
    req.log.error({ err }, "Failed to list fleet vehicles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list fleet vehicles" });
  }
});

router.post("/vehicles", requireAuth, async (req, res) => {
  try {
    const { fleetId, categoryCode, subtypeCode, bodyType, nickname, lengthInches, heightInches, hasRestroom, unitNumber, licensePlate } = req.body;

    if (!unitNumber || typeof lengthInches !== "number") {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "unitNumber and lengthInches are required",
      });
      return;
    }

    // The driver-side flow only collects unitNumber + bodyType + length +
    // optional nickname. Default the legacy required PRD fields so the model
    // still has them, since downstream code (admin views, fleet flow) reads
    // them. categoryCode defaults to BUS, subtypeCode to STANDARD, height to
    // a reasonable bus value. Fleet admins can refine these later.
    const user = req.user as SessionUser;

    if (fleetId) {
      const hasAccess = isPlatformAdmin(user) || isFleetRole(user, fleetId);
      if (!hasAccess) {
        res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet access required to add fleet vehicles" });
        return;
      }
    }

    const trimmedNickname = typeof nickname === "string" ? nickname.trim().slice(0, 40) : null;

    const normalizedBodyType = normalizeBodyType(bodyType);
    const vehicle = await prisma.vehicle.create({
      data: {
        fleetId: fleetId || null,
        ownerUserId: fleetId ? null : user.id,
        categoryCode: categoryCode || "BUS",
        subtypeCode: subtypeCode || defaultSubtypeFromBodyType(normalizedBodyType),
        bodyType: normalizedBodyType,
        nickname: trimmedNickname || null,
        lengthInches,
        heightInches: typeof heightInches === "number" ? heightInches : 132,
        hasRestroom: hasRestroom ?? false,
        unitNumber,
        licensePlate: licensePlate || null,
      },
      include: {
        fleet: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // Auto-set as default if (a) the new vehicle is owned by the creator and
    // (b) the creator currently has no default. First-vehicle UX: the driver
    // doesn't have to manually flip the toggle on their first add.
    let autoDefault = false;
    if (vehicle.ownerUserId === user.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { defaultVehicleId: true } });
      const eligible = await getEligibleVehicleIds(user.id);
      const stored = dbUser?.defaultVehicleId ?? null;
      const effective = stored && eligible.has(stored) ? stored : null;
      if (!effective) {
        await prisma.user.update({ where: { id: user.id }, data: { defaultVehicleId: vehicle.id } });
        autoDefault = true;
      }
    }

    res.status(201).json({ vehicle, autoSetAsDefault: autoDefault });
  } catch (err) {
    req.log.error({ err }, "Failed to create vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create vehicle" });
  }
});

router.patch("/vehicles/:vehicleId", requireAuth, async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.vehicleId } });
    if (!vehicle) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const ownsVehicle = vehicle.ownerUserId === user.id;
    const hasFleetAccess = vehicle.fleetId ? isFleetRole(user, vehicle.fleetId) : false;

    if (!isAdmin && !ownsVehicle && !hasFleetAccess) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    const { categoryCode, subtypeCode, bodyType, nickname, lengthInches, heightInches, hasRestroom, unitNumber, licensePlate, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (categoryCode !== undefined) data.categoryCode = categoryCode;
    if (subtypeCode !== undefined) data.subtypeCode = subtypeCode;
    if (bodyType !== undefined) data.bodyType = normalizeBodyType(bodyType);
    if (nickname !== undefined) {
      const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 40) : null;
      data.nickname = trimmed || null;
    }
    if (lengthInches !== undefined) data.lengthInches = lengthInches;
    if (heightInches !== undefined) data.heightInches = heightInches;
    if (hasRestroom !== undefined) data.hasRestroom = hasRestroom;
    if (unitNumber !== undefined) data.unitNumber = unitNumber;
    if (licensePlate !== undefined) data.licensePlate = licensePlate;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.vehicle.update({
      where: { id: req.params.vehicleId },
      data,
      include: {
        fleet: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.json({ vehicle: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update vehicle" });
  }
});

// Future bookings count for the delete-flow dialog. Drives the messaging
// branch ("0 / 1 / N+ bookings"). The :id is a vehicle ID; we count
// bookings against this vehicle in active statuses with a future start.
router.get("/vehicles/:vehicleId/future-bookings", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.vehicleId } });
    if (!vehicle) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found" });
      return;
    }
    // Only the owner (or admin) can introspect this. Fleet admins use the
    // fleet vehicle screens, not this driver-facing endpoint.
    const isAdmin = isPlatformAdmin(user);
    const ownsVehicle = vehicle.ownerUserId === user.id;
    if (!isAdmin && !ownsVehicle) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    const now = new Date();
    const futureBookings = await prisma.booking.findMany({
      where: {
        vehicleId: vehicle.id,
        scheduledStartAtUtc: { gte: now },
        status: { in: ACTIVE_BOOKING_STATUSES as any },
      },
      select: { id: true, scheduledStartAtUtc: true },
      orderBy: { scheduledStartAtUtc: "asc" },
    });
    res.json({
      count: futureBookings.length,
      firstBookingId: futureBookings[0]?.id ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load future bookings count");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed" });
  }
});

router.delete("/vehicles/:vehicleId", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.vehicleId } });
    if (!vehicle) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Vehicle not found" });
      return;
    }

    // Only the owner can delete a personal vehicle (or admin). Fleet
    // vehicles are managed by fleet admins through their own flow.
    const isAdmin = isPlatformAdmin(user);
    const ownsVehicle = vehicle.ownerUserId === user.id;
    if (!isAdmin && !ownsVehicle) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    const now = new Date();
    const futureCount = await prisma.booking.count({
      where: {
        vehicleId: vehicle.id,
        scheduledStartAtUtc: { gte: now },
        status: { in: ACTIVE_BOOKING_STATUSES as any },
      },
    });
    if (futureCount > 0) {
      res.status(409).json({
        errorCode: "VEHICLE_HAS_FUTURE_BOOKINGS",
        message: `This vehicle has ${futureCount} upcoming booking${futureCount === 1 ? "" : "s"}. Cancel ${futureCount === 1 ? "it" : "them"} before deleting.`,
        futureBookingCount: futureCount,
      });
      return;
    }

    // Cannot delete the user's active default if they have other personal
    // vehicles. Force them to set another as default first. If this is
    // their only personal vehicle, allow deletion (pointer auto-clears via
    // ON DELETE SET NULL).
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { defaultVehicleId: true } });
    if (dbUser?.defaultVehicleId === vehicle.id) {
      const otherPersonal = await prisma.vehicle.count({
        where: { ownerUserId: user.id, isActive: true, id: { not: vehicle.id } },
      });
      if (otherPersonal > 0) {
        res.status(409).json({
          errorCode: "DEFAULT_VEHICLE_DELETE_BLOCKED",
          message: "Set another vehicle as active before deleting this one.",
        });
        return;
      }
    }

    // Soft-delete via the existing isActive flag (consistent with how the
    // model already filters list responses on isActive=true). Hard-delete
    // would orphan booking history references.
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { isActive: false } });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to delete vehicle" });
  }
});

// Set / clear the user's active default vehicle. Body: { vehicleId | null }.
// Validates eligibility (personally-owned OR currently-active fleet
// assignment). Returns the new defaultVehicleId so the client can update
// optimistic UI without re-fetching.
router.patch("/users/me/default-vehicle", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { vehicleId } = req.body as { vehicleId?: string | null };

    if (vehicleId === null) {
      await prisma.user.update({ where: { id: user.id }, data: { defaultVehicleId: null } });
      res.json({ defaultVehicleId: null });
      return;
    }

    if (typeof vehicleId !== "string" || vehicleId.length === 0) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "vehicleId is required (or null to clear)" });
      return;
    }

    const eligible = await getEligibleVehicleIds(user.id);
    if (!eligible.has(vehicleId)) {
      res.status(403).json({
        errorCode: "VEHICLE_NOT_ELIGIBLE",
        message: "This vehicle isn't eligible for your account.",
      });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { defaultVehicleId: vehicleId } });
    res.json({ defaultVehicleId: vehicleId });
  } catch (err) {
    req.log.error({ err }, "Failed to set default vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to set default vehicle" });
  }
});

// Wash health computation
function computeWashHealth(lastWashAt: Date | null, now: Date): "GREEN" | "YELLOW" | "RED" | "GRAY" {
  if (!lastWashAt) return "GRAY";
  const daysSince = Math.floor((now.getTime() - lastWashAt.getTime()) / 86400000);
  const month = now.getMonth();
  const isWinter = month >= 10 || month <= 2;
  const threshold = isWinter ? 7 : 14;
  if (daysSince >= threshold) return "RED";
  if (daysSince >= threshold - 2) return "YELLOW";
  return "GREEN";
}

router.get("/fleets/:fleetId/vehicles/wash-health-summary", requireAuth, async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { fleetId: req.params.fleetId, isActive: true },
      select: { lastWashAtUtc: true },
    });
    const now = new Date();
    const summary = { green: 0, yellow: 0, red: 0, gray: 0 };
    for (const v of vehicles) {
      const health = computeWashHealth(v.lastWashAtUtc, now);
      summary[health.toLowerCase() as keyof typeof summary]++;
    }
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed" });
  }
});

export default router;
