import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";
import { isFleetRole, getFleetId } from "../lib/auth";
import { calculatePlatformFee } from "../lib/feeCalculator";
import {
  deriveVehicleClassFromLength,
  findAvailableBayTx,
  resolveServiceDuration,
} from "../lib/bayMatching";

const router: IRouter = Router();

// Browse available subscription packages
router.get("/fleets/:fleetId/available-subscriptions", requireAuth, async (req, res) => {
  try {
    const packages = await prisma.subscriptionPackage.findMany({
      where: { isActive: true, provider: { isActive: true, approvalStatus: "APPROVED" } },
      include: {
        provider: { select: { name: true } },
        location: { select: { name: true, city: true, regionCode: true } },
      },
    });
    res.json({ packages });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load packages" });
  }
});

// Subscribe vehicles to a package
router.post("/fleets/:fleetId/subscriptions", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { fleetId } = req.params;
    const { packageId, vehicleIds, startDate } = req.body;

    if (!packageId || !vehicleIds?.length || !startDate) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "packageId, vehicleIds, and startDate required" });
      return;
    }

    const pkg = await prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
      include: { location: { select: { timezone: true } } },
    });
    if (!pkg) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const subscriptions = [];
    const unassignable: { vehicleId: string; reason: string }[] = [];

    for (const vehicleId of vehicleIds) {
      const sub = await prisma.fleetSubscription.create({
        data: {
          packageId, fleetId, vehicleId, purchasedByUserId: user.id,
          status: "ACTIVE", startDate: new Date(startDate),
          nextWashDate: new Date(startDate),
        },
      });

      const fee = calculatePlatformFee(pkg.pricePerWashMinor, { isSubscription: true });
      const serviceId = pkg.includedServiceIds[0];
      if (!serviceId) {
        unassignable.push({ vehicleId, reason: "NO_SERVICE_IN_PACKAGE" });
        subscriptions.push(sub);
        continue;
      }

      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { lengthInches: true, unitNumber: true },
      });
      const vClass = deriveVehicleClassFromLength(vehicle?.lengthInches ?? null);
      if (!vClass) {
        unassignable.push({ vehicleId, reason: "VEHICLE_CLASS_UNRESOLVED" });
        subscriptions.push(sub);
        continue;
      }

      const duration = (await resolveServiceDuration(prisma, serviceId, vClass)) ?? 60;
      const startUtc = new Date(startDate + "T10:00:00Z");
      const endUtc = new Date(startUtc.getTime() + duration * 60 * 1000);

      try {
        await prisma.$transaction(async (tx: any) => {
          const bay = await findAvailableBayTx(tx, {
            locationId: pkg.locationId,
            vehicleClass: vClass,
            startUtc,
            durationMins: duration,
          });
          if (!bay) throw new Error("NO_BAY_AVAILABLE");

          await tx.booking.create({
            data: {
              locationId: pkg.locationId, serviceId, customerId: user.id, vehicleId,
              status: "PROVIDER_CONFIRMED",
              idempotencyKey: `sub-${sub.id}-${Date.now()}`,
              serviceNameSnapshot: pkg.name, serviceBasePriceMinor: pkg.pricePerWashMinor,
              platformFeeMinor: fee, totalPriceMinor: pkg.pricePerWashMinor + fee,
              currencyCode: pkg.currencyCode, locationTimezone: pkg.location.timezone,
              scheduledStartAtUtc: startUtc,
              scheduledEndAtUtc: endUtc,
              bookingSource: "PLATFORM",
              washBayId: bay.id,
            },
          });
        }, { isolationLevel: "Serializable" });
      } catch (txErr: any) {
        unassignable.push({
          vehicleId,
          reason: txErr?.message === "NO_BAY_AVAILABLE" ? "NO_BAY_AVAILABLE" : "BOOKING_CREATE_FAILED",
        });
      }

      subscriptions.push(sub);
    }

    res.status(201).json({ subscriptions, unassignable });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create subscriptions");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to subscribe" });
  }
});

// List fleet subscriptions
router.get("/fleets/:fleetId/subscriptions", requireAuth, async (req, res) => {
  try {
    const subs = await prisma.fleetSubscription.findMany({
      where: { fleetId: req.params.fleetId },
      include: {
        package: { include: { provider: { select: { name: true } }, location: { select: { name: true } } } },
        vehicle: { select: { unitNumber: true, subtypeCode: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ subscriptions: subs });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load subscriptions" });
  }
});

// Cancel subscription
router.patch("/fleets/:fleetId/subscriptions/:subscriptionId/cancel", requireAuth, async (req, res) => {
  try {
    const updated = await prisma.fleetSubscription.update({
      where: { id: req.params.subscriptionId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    res.json({ subscription: updated });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to cancel" });
  }
});

export default router;
