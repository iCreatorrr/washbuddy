import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireFleetAccess } from "../middlewares/requireAuth";
import { isPlatformAdmin, isFleetRole, type SessionUser } from "../lib/auth";

const router: IRouter = Router();

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
      res.json({ vehicles });
      return;
    }

    const fleetIds = user.roles
      .filter((r) => r.scope === "fleet" || (r.role === "DRIVER" && r.scopeId))
      .map((r) => r.scopeId!)
      .filter(Boolean);

    const where: Record<string, unknown> = { isActive: true };

    if (fleetIds.length > 0) {
      where.OR = [
        { fleetId: { in: fleetIds } },
        { ownerUserId: user.id },
      ];
    } else {
      where.ownerUserId = user.id;
    }

    const vehicles = await prisma.vehicle.findMany({
      where,
      include: {
        fleet: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { unitNumber: "asc" },
    });

    res.json({ vehicles });
  } catch (err) {
    req.log.error({ err }, "Failed to list vehicles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list vehicles" });
  }
});

router.get("/fleets/:fleetId/vehicles", requireAuth, requireFleetAccess(), async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { fleetId: req.params.fleetId, isActive: true },
      include: {
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
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
    const { fleetId, categoryCode, subtypeCode, lengthInches, heightInches, hasRestroom, unitNumber, licensePlate } = req.body;

    if (!categoryCode || !subtypeCode || !lengthInches || !heightInches || !unitNumber) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "categoryCode, subtypeCode, lengthInches, heightInches, and unitNumber are required",
      });
      return;
    }

    const user = req.user as SessionUser;

    if (fleetId) {
      const hasAccess = isPlatformAdmin(user) || isFleetRole(user, fleetId);
      if (!hasAccess) {
        res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet access required to add fleet vehicles" });
        return;
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        fleetId: fleetId || null,
        ownerUserId: fleetId ? null : user.id,
        categoryCode,
        subtypeCode,
        lengthInches,
        heightInches,
        hasRestroom: hasRestroom ?? false,
        unitNumber,
        licensePlate: licensePlate || null,
      },
      include: {
        fleet: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ vehicle });
  } catch (err) {
    req.log.error({ err }, "Failed to create vehicle");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create vehicle" });
  }
});

router.patch("/vehicles/:vehicleId", requireAuth, async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
    });

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

    const { categoryCode, subtypeCode, lengthInches, heightInches, hasRestroom, unitNumber, licensePlate, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (categoryCode !== undefined) data.categoryCode = categoryCode;
    if (subtypeCode !== undefined) data.subtypeCode = subtypeCode;
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
