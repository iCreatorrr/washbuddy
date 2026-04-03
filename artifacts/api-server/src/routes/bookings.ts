import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess, requirePlatformAdmin } from "../middlewares/requireAuth";
import { isPlatformAdmin, isProviderRole, isFleetRole, type SessionUser } from "../lib/auth";
import { canTransition, isCancellable, isActiveBooking } from "../lib/bookingStateMachine";
import { calculatePlatformFee, calculateAllInPrice } from "../lib/feeCalculator";
import { incrementRespondedInSla } from "../lib/slaEnforcer";
import { isDriver, getFleetId } from "../lib/auth";
import crypto from "crypto";

const router: IRouter = Router();

const HOLD_TTL_MS = 10 * 60 * 1000;

router.post("/bookings/hold", requireAuth, async (req, res) => {
  try {
    const { locationId, serviceId, slotStartUtc, vehicleId } = req.body;

    if (!locationId || !serviceId || !slotStartUtc) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "locationId, serviceId, and slotStartUtc are required",
      });
      return;
    }

    const user = req.user as SessionUser;

    const service = await prisma.service.findFirst({
      where: { id: serviceId, locationId, isVisible: true },
      include: { location: { select: { providerId: true } } },
    });

    if (!service) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found at this location" });
      return;
    }

    // ─── Fleet Policy Enforcement (DRIVER role only) ───────────────
    if (isDriver(user)) {
      const fleetId = getFleetId(user);
      if (fleetId) {
        const fleet = await prisma.fleet.findUnique({
          where: { id: fleetId },
          select: { requestPolicyJson: true, currencyCode: true },
        });
        const policy = (fleet?.requestPolicyJson as any) || {};

        // Approved Provider List
        if (policy.approvedProviderList?.enabled) {
          const approvedIds: string[] = policy.approvedProviderList.providerIds || [];
          if (approvedIds.length > 0 && !approvedIds.includes(service.location.providerId)) {
            res.status(403).json({
              errorCode: "POLICY_VIOLATION",
              code: "PROVIDER_NOT_APPROVED",
              message: "Your fleet only allows bookings at approved providers. Contact your fleet manager.",
            });
            return;
          }
        }

        // Spending Limit
        if (policy.spendingLimit?.enabled) {
          const maxAmount = policy.spendingLimit.maxAmountMinor;
          const allInPrice = calculateAllInPrice(service.basePriceMinor);
          if (allInPrice > maxAmount) {
            const maxFmt = (maxAmount / 100).toFixed(2);
            const priceFmt = (allInPrice / 100).toFixed(2);
            res.status(403).json({
              errorCode: "POLICY_VIOLATION",
              code: "SPENDING_LIMIT_EXCEEDED",
              message: `This service costs $${priceFmt} which exceeds your fleet's per-wash limit of $${maxFmt}. Contact your fleet manager.`,
            });
            return;
          }
        }

        // Wash Frequency Limit
        if (policy.washFrequency?.enabled && vehicleId) {
          const maxWashes = policy.washFrequency.maxWashes;
          const periodDays = policy.washFrequency.periodDays;
          const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

          const recentWashCount = await prisma.booking.count({
            where: {
              vehicleId,
              scheduledStartAtUtc: { gte: periodStart },
              status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "PROVIDER_DECLINED", "EXPIRED"] },
            },
          });

          if (recentWashCount >= maxWashes) {
            const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { unitNumber: true } });
            const nextAllowed = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
            res.status(403).json({
              errorCode: "POLICY_VIOLATION",
              code: "FREQUENCY_LIMIT_EXCEEDED",
              message: `Vehicle ${vehicle?.unitNumber || vehicleId} has already been washed ${recentWashCount} time(s) in the last ${periodDays} days. Next wash allowed after ${nextAllowed.toLocaleDateString()}.`,
            });
            return;
          }
        }
      }
    }

    const slotStart = new Date(slotStartUtc);
    const slotEnd = new Date(slotStart.getTime() + service.durationMins * 60 * 1000);
    const now = new Date();

    const leadTimeDeadline = new Date(slotStart.getTime() - service.leadTimeMins * 60 * 1000);
    if (now > leadTimeDeadline) {
      res.status(409).json({ errorCode: "PAST_LEAD_TIME", message: "Slot is past the lead time cutoff" });
      return;
    }

    const requestId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + HOLD_TTL_MS);

    const hold = await prisma.$transaction(async (tx) => {
      const existingBookings = await tx.booking.count({
        where: {
          locationId,
          serviceId,
          scheduledStartAtUtc: slotStart,
          status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "EXPIRED", "NO_SHOW", "REFUNDED"] },
        },
      });

      const activeHolds = await tx.bookingHold.count({
        where: {
          locationId,
          serviceId,
          slotStartAtUtc: slotStart,
          bookingId: null,
          isReleased: false,
          expiresAtUtc: { gt: now },
        },
      });

      if (existingBookings + activeHolds >= service.capacityPerSlot) {
        throw new Error("SLOT_FULL");
      }

      return tx.bookingHold.create({
        data: {
          locationId,
          serviceId,
          slotStartAtUtc: slotStart,
          slotEndAtUtc: slotEnd,
          expiresAtUtc: expiresAt,
          requestId,
          userId: user.id,
        },
      });
    }, { isolationLevel: "Serializable" });

    res.status(201).json({
      hold: {
        id: hold.id,
        requestId: hold.requestId,
        slotStartUtc: hold.slotStartAtUtc,
        slotEndUtc: hold.slotEndAtUtc,
        expiresAtUtc: hold.expiresAtUtc,
      },
    });
  } catch (err: any) {
    if (err?.message === "SLOT_FULL") {
      res.status(409).json({ errorCode: "SLOT_FULL", message: "No capacity remaining for this slot" });
      return;
    }
    req.log.error({ err }, "Failed to create booking hold");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create booking hold" });
  }
});

router.post("/bookings", requireAuth, async (req, res) => {
  try {
    const { holdId, vehicleId, fleetPlaceholderClass, idempotencyKey } = req.body;

    if (!holdId || !idempotencyKey) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "holdId and idempotencyKey are required",
      });
      return;
    }

    const existingBooking = await prisma.booking.findUnique({
      where: { idempotencyKey },
    });

    if (existingBooking) {
      res.status(200).json({ booking: existingBooking, idempotent: true });
      return;
    }

    const user = req.user as SessionUser;
    const now = new Date();

    const booking = await prisma.$transaction(async (tx) => {
      const hold = await tx.bookingHold.findFirst({
        where: {
          id: holdId,
          userId: user.id,
          bookingId: null,
          isReleased: false,
          expiresAtUtc: { gt: now },
        },
      });

      if (!hold) {
        throw new Error("HOLD_NOT_AVAILABLE");
      }

      const service = await tx.service.findUnique({
        where: { id: hold.serviceId },
        include: { location: true },
      });

      if (!service) {
        throw new Error("SERVICE_NOT_FOUND");
      }

      const calculatedFee = calculatePlatformFee(service.basePriceMinor);
      const totalPrice = service.basePriceMinor + calculatedFee;

      // PRD 3.3: 5 min SLA for bookings within 24h, 10 min for 24h+ out
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const responseSla = hold.slotStartAtUtc.getTime() - now.getTime() < TWENTY_FOUR_HOURS_MS
        ? service.location.responseSlaUnder1hMins
        : service.location.responseSlaFutureMins;

      const responseDeadline = new Date(now.getTime() + responseSla * 60 * 1000);

      const b = await tx.booking.create({
        data: {
          locationId: hold.locationId,
          serviceId: hold.serviceId,
          customerId: user.id,
          vehicleId: vehicleId || null,
          fleetPlaceholderClass: fleetPlaceholderClass || null,
          status: service.requiresConfirmation ? "REQUESTED" : "PROVIDER_CONFIRMED",
          idempotencyKey,
          serviceNameSnapshot: service.name,
          serviceBasePriceMinor: service.basePriceMinor,
          platformFeeMinor: calculatedFee,
          totalPriceMinor: totalPrice,
          currencyCode: service.currencyCode,
          locationTimezone: service.location.timezone,
          scheduledStartAtUtc: hold.slotStartAtUtc,
          scheduledEndAtUtc: hold.slotEndAtUtc,
          providerResponseDeadlineUtc: service.requiresConfirmation ? responseDeadline : null,
          bookingHoldExpiresUtc: hold.expiresAtUtc,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: null,
          toStatus: service.requiresConfirmation ? "REQUESTED" : "PROVIDER_CONFIRMED",
          changedBy: user.id,
          reason: "Booking created",
        },
      });

      await tx.bookingHold.update({
        where: { id: holdId },
        data: { bookingId: b.id },
      });

      return b;
    }, { isolationLevel: "Serializable" });

    res.status(201).json({ booking });
  } catch (err: any) {
    if (err?.message === "HOLD_NOT_AVAILABLE") {
      res.status(410).json({ errorCode: "HOLD_EXPIRED", message: "Hold is no longer available. Please create a new hold." });
      return;
    }
    if (err?.message === "SERVICE_NOT_FOUND") {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service no longer exists" });
      return;
    }
    req.log.error({ err }, "Failed to create booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create booking" });
  }
});

router.get("/bookings", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const { status, locationId, page, limit: limitParam } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string) || 20));
    const skip = (pageNum - 1) * limit;

    const where: Record<string, unknown> = {};

    if (!isAdmin) {
      const providerIds = user.roles
        .filter((r) => r.scope === "provider" && r.scopeId)
        .map((r) => r.scopeId!);

      if (providerIds.length > 0) {
        where.OR = [
          { customerId: user.id },
          { location: { providerId: { in: providerIds } } },
        ];
      } else {
        where.customerId = user.id;
      }
    }

    if (status) where.status = status;
    if (locationId) where.locationId = locationId;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, timezone: true, provider: { select: { id: true, name: true } } } },
          service: { select: { id: true, name: true } },
          customer: { select: { id: true, email: true, firstName: true, lastName: true } },
          vehicle: { select: { id: true, unitNumber: true, categoryCode: true, subtypeCode: true } },
        },
        orderBy: { scheduledStartAtUtc: "desc" },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      bookings,
      pagination: {
        page: pageNum,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list bookings");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list bookings" });
  }
});

router.get("/bookings/:bookingId", requireAuth, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: {
        location: { select: { id: true, name: true, timezone: true, providerId: true, provider: { select: { id: true, name: true } } } },
        service: { select: { id: true, name: true, durationMins: true } },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        vehicle: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isCustomer = booking.customerId === user.id;
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isCustomer && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    res.json({ booking });
  } catch (err) {
    req.log.error({ err }, "Failed to get booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get booking" });
  }
});

async function transitionBooking(
  bookingId: string,
  expectedStatus: string[],
  newStatus: string,
  userId: string,
  reason: string,
  extraData?: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, status: { in: expectedStatus as any } },
    });

    if (!booking) {
      throw new Error("INVALID_TRANSITION");
    }

    const b = await tx.booking.update({
      where: { id: bookingId },
      data: { status: newStatus as any, ...extraData },
    });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId,
        fromStatus: booking.status,
        toStatus: newStatus as any,
        changedBy: userId,
        reason,
      },
    });

    return b;
  });
}

router.post("/bookings/:bookingId/confirm", requireAuth, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only providers can confirm bookings" });
      return;
    }

    const updated = await transitionBooking(
      booking.id,
      ["REQUESTED", "HELD"],
      "PROVIDER_CONFIRMED",
      user.id,
      "Provider confirmed",
      { providerResponseDeadlineUtc: null },
    );

    // Track SLA metric — provider responded
    try {
      const responseTimeSecs = Math.round((Date.now() - booking.createdAt.getTime()) / 1000);
      await incrementRespondedInSla(booking.location.providerId, booking.locationId, responseTimeSecs);
    } catch (metricErr) {
      req.log.warn({ err: metricErr }, "Failed to update SLA metrics on confirm");
    }

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot confirm booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to confirm booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to confirm booking" });
  }
});

router.post("/bookings/:bookingId/decline", requireAuth, async (req, res) => {
  try {
    const { reasonCode } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only providers can decline bookings" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({
        where: { id: booking.id, status: { in: ["REQUESTED", "HELD"] } },
      });

      if (!b) throw new Error("INVALID_TRANSITION");

      const result = await tx.booking.update({
        where: { id: booking.id },
        data: { status: "PROVIDER_DECLINED", declineReasonCode: reasonCode || null },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: b.status,
          toStatus: "PROVIDER_DECLINED",
          changedBy: user.id,
          reason: reasonCode || "Provider declined",
        },
      });

      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, isReleased: false },
        data: { isReleased: true },
      });

      return result;
    });

    // Track SLA metric — provider responded (declined counts as a response)
    try {
      const responseTimeSecs = Math.round((Date.now() - booking.createdAt.getTime()) / 1000);
      await incrementRespondedInSla(booking.location.providerId, booking.locationId, responseTimeSecs);
    } catch (metricErr) {
      req.log.warn({ err: metricErr }, "Failed to update SLA metrics on decline");
    }

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot decline booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to decline booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to decline booking" });
  }
});

router.post("/bookings/:bookingId/cancel", requireAuth, async (req, res) => {
  try {
    const { reasonCode } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isCustomer = booking.customerId === user.id;
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isCustomer && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    const newStatus = isCustomer ? "CUSTOMER_CANCELLED" : "PROVIDER_CANCELLED";
    const cancellableStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "LATE"];

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({
        where: { id: booking.id, status: { in: cancellableStatuses as any } },
      });

      if (!b) throw new Error("NOT_CANCELLABLE");

      const result = await tx.booking.update({
        where: { id: booking.id },
        data: { status: newStatus, cancellationReasonCode: reasonCode || null },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: b.status,
          toStatus: newStatus,
          changedBy: user.id,
          reason: reasonCode || (isCustomer ? "Customer cancelled" : "Provider cancelled"),
        },
      });

      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, isReleased: false },
        data: { isReleased: true },
      });

      return result;
    });

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "NOT_CANCELLABLE") {
      res.status(409).json({ errorCode: "NOT_CANCELLABLE", message: "Cannot cancel booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to cancel booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to cancel booking" });
  }
});

router.post("/bookings/:bookingId/checkin", requireAuth, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only providers can check in bookings" });
      return;
    }

    const updated = await transitionBooking(
      booking.id,
      ["PROVIDER_CONFIRMED", "LATE"],
      "CHECKED_IN",
      user.id,
      "Vehicle checked in",
      { providerCheckedInAtUtc: new Date() },
    );

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot check in booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to check in booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to check in booking" });
  }
});

router.post("/bookings/:bookingId/start-service", requireAuth, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only providers can start service" });
      return;
    }

    const updated = await transitionBooking(
      booking.id,
      ["CHECKED_IN"],
      "IN_SERVICE",
      user.id,
      "Service started",
      { serviceStartedAtUtc: new Date() },
    );

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot start service for booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to start service");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to start service" });
  }
});

router.post("/bookings/:bookingId/complete", requireAuth, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });

    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);
    const isProvider = isProviderRole(user, booking.location.providerId);

    if (!isAdmin && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Only providers can complete service" });
      return;
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({
        where: { id: booking.id, status: "IN_SERVICE" },
      });

      if (!b) throw new Error("INVALID_TRANSITION");

      const result = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "COMPLETED_PENDING_WINDOW",
          serviceCompletedAtUtc: now,
          completionWindowEndsUtc: windowEnd,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: "IN_SERVICE",
          toStatus: "COMPLETED_PENDING_WINDOW",
          changedBy: user.id,
          reason: "Service completed, dispute window open",
        },
      });

      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, isReleased: false },
        data: { isReleased: true },
      });

      return result;
    });

    res.json({ booking: updated });
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot complete booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to complete booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to complete booking" });
  }
});

export default router;
