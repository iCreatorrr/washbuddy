/**
 * Provider-facing booking endpoints for V2 daily operations.
 * Daily Wash Board, Bay Timeline, Off-platform booking entry.
 */

import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";
import { calculatePlatformFee } from "../lib/feeCalculator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Helper: convert a date string + timezone to UTC start/end of day
function getDayRangeUtc(dateStr: string, timezone: string): { startUtc: Date; endUtc: Date } {
  // Parse as local midnight, convert to UTC
  const localDate = new Date(`${dateStr}T00:00:00`);
  const startParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(localDate);

  // Simpler approach: use the date string to create a range
  // Approximate: treat the date as the location's day, offset by typical timezone
  const approx = new Date(`${dateStr}T00:00:00Z`);
  const localInfo = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).formatToParts(approx);
  const hourAtUtcMidnight = parseInt(localInfo.find((p) => p.type === "hour")?.value || "0");
  const offsetHours = hourAtUtcMidnight > 12 ? hourAtUtcMidnight - 24 : hourAtUtcMidnight;
  const startUtc = new Date(approx.getTime() - offsetHours * 60 * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

const ACTIVE_STATUSES = ["PROVIDER_CONFIRMED", "HELD", "CHECKED_IN", "IN_SERVICE", "COMPLETED_PENDING_WINDOW", "COMPLETED", "SETTLED"];

// ─── Daily Wash Board ───────────────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/daily-board", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { locationId } = req.params;
    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, timezone: true } });
    if (!location) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" }); return; }

    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const { startUtc, endUtc } = getDayRangeUtc(dateStr, location.timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        locationId,
        scheduledStartAtUtc: { gte: startUtc, lt: endUtc },
        status: { in: ACTIVE_STATUSES as any },
      },
      include: {
        vehicle: { select: { id: true, unitNumber: true, subtypeCode: true, lengthInches: true, heightInches: true, licensePlate: true, fleet: { select: { name: true } } } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { name: true } },
        washBay: { select: { id: true, name: true } },
        assignedOperator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { photos: true, messages: true, washNotes: true } },
      },
      orderBy: { scheduledStartAtUtc: "asc" },
    });

    // Look up client tags for each booking
    const enriched = await Promise.all(bookings.map(async (b) => {
      let clientTags: string[] = [];
      if (b.customerId) {
        const profile = await prisma.clientProfile.findFirst({
          where: { providerId: req.params.providerId, userId: b.customerId },
          select: { tags: true },
        });
        clientTags = profile?.tags || [];
      }

      return {
        id: b.id,
        status: b.status,
        bookingSource: b.bookingSource,
        scheduledStartAtUtc: b.scheduledStartAtUtc,
        scheduledEndAtUtc: b.scheduledEndAtUtc,
        serviceStartedAtUtc: b.serviceStartedAtUtc,
        serviceCompletedAtUtc: b.serviceCompletedAtUtc,
        locationTimezone: location.timezone,
        serviceNameSnapshot: b.serviceNameSnapshot,
        serviceBasePriceMinor: b.serviceBasePriceMinor,
        platformFeeMinor: b.platformFeeMinor,
        totalPriceMinor: b.totalPriceMinor,
        currencyCode: b.currencyCode,
        discountAmountMinor: b.discountAmountMinor,
        vehicle: b.vehicle ? {
          id: b.vehicle.id, unitNumber: b.vehicle.unitNumber, subtypeCode: b.vehicle.subtypeCode,
          lengthInches: b.vehicle.lengthInches, heightInches: b.vehicle.heightInches, licensePlate: b.vehicle.licensePlate,
        } : null,
        fleetPlaceholderClass: b.fleetPlaceholderClass,
        customer: b.customer ? { id: b.customer.id, firstName: b.customer.firstName, lastName: b.customer.lastName } : null,
        offPlatformClientName: b.offPlatformClientName,
        fleetName: b.vehicle?.fleet?.name || null,
        assignedOperator: b.assignedOperator ? { id: b.assignedOperator.id, firstName: b.assignedOperator.firstName, lastName: b.assignedOperator.lastName } : null,
        washBay: b.washBay ? { id: b.washBay.id, name: b.washBay.name } : null,
        clientTags,
        washNoteCount: b._count.washNotes,
        photoCount: b._count.photos,
        messageCount: b._count.messages,
      };
    }));

    const now = new Date();
    const upcoming = enriched.filter((b) => b.status === "PROVIDER_CONFIRMED" && new Date(b.scheduledStartAtUtc) > now);
    const inProgress = enriched.filter((b) => ["CHECKED_IN", "IN_SERVICE"].includes(b.status));
    const completed = enriched.filter((b) => ["COMPLETED_PENDING_WINDOW", "COMPLETED", "SETTLED"].includes(b.status));

    // Sort in-progress by serviceStartedAtUtc ascending
    inProgress.sort((a, b) => (a.serviceStartedAtUtc ? new Date(a.serviceStartedAtUtc).getTime() : 0) - (b.serviceStartedAtUtc ? new Date(b.serviceStartedAtUtc).getTime() : 0));
    // Sort completed by serviceCompletedAtUtc descending
    completed.sort((a, b) => (b.serviceCompletedAtUtc ? new Date(b.serviceCompletedAtUtc).getTime() : 0) - (a.serviceCompletedAtUtc ? new Date(a.serviceCompletedAtUtc).getTime() : 0));

    res.json({ upcoming, inProgress, completed });
  } catch (err: any) {
    req.log.error({ err }, "Failed to load daily board");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load daily board" });
  }
});

router.get("/providers/:providerId/locations/:locationId/daily-board/counts", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { locationId } = req.params;
    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    if (!location) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const { startUtc, endUtc } = getDayRangeUtc(dateStr, location.timezone);
    const now = new Date();

    const [upcoming, inProgress, completed] = await Promise.all([
      prisma.booking.count({ where: { locationId, scheduledStartAtUtc: { gte: now, lt: endUtc }, status: "PROVIDER_CONFIRMED" } }),
      prisma.booking.count({ where: { locationId, scheduledStartAtUtc: { gte: startUtc, lt: endUtc }, status: { in: ["CHECKED_IN", "IN_SERVICE"] } } }),
      prisma.booking.count({ where: { locationId, scheduledStartAtUtc: { gte: startUtc, lt: endUtc }, status: { in: ["COMPLETED_PENDING_WINDOW", "COMPLETED", "SETTLED"] } } }),
    ]);

    res.json({ upcoming, inProgress, completed, waitlist: 0 });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load counts" });
  }
});

// ─── Bay Timeline ───────────────────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/bay-timeline", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { locationId } = req.params;
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { timezone: true, operatingWindows: { select: { dayOfWeek: true, openTime: true, closeTime: true } } },
    });
    if (!location) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const { startUtc, endUtc } = getDayRangeUtc(dateStr, location.timezone);

    const bays = await prisma.washBay.findMany({
      where: { locationId },
      orderBy: { displayOrder: "asc" },
    });

    const bayBookingsMap = new Map<string, any[]>();
    const unassignedBookings: any[] = [];

    const allBookings = await prisma.booking.findMany({
      where: {
        locationId,
        scheduledStartAtUtc: { gte: startUtc, lt: endUtc },
        status: { in: ACTIVE_STATUSES as any },
      },
      include: {
        vehicle: { select: { unitNumber: true, subtypeCode: true } },
        customer: { select: { firstName: true } },
        assignedOperator: { select: { firstName: true } },
      },
    });

    for (const b of allBookings) {
      const mapped = {
        id: b.id,
        scheduledStartAtUtc: b.scheduledStartAtUtc,
        scheduledEndAtUtc: b.scheduledEndAtUtc,
        serviceStartedAtUtc: b.serviceStartedAtUtc,
        serviceCompletedAtUtc: b.serviceCompletedAtUtc,
        status: b.status,
        bookingSource: b.bookingSource,
        serviceNameSnapshot: b.serviceNameSnapshot,
        vehicleUnitNumber: b.vehicle?.unitNumber || null,
        vehicleSubtypeCode: b.vehicle?.subtypeCode || null,
        fleetPlaceholderClass: b.fleetPlaceholderClass,
        driverFirstName: b.customer?.firstName || b.offPlatformClientName || null,
        assignedOperatorFirstName: b.assignedOperator?.firstName || null,
      };
      if (b.washBayId) {
        if (!bayBookingsMap.has(b.washBayId)) bayBookingsMap.set(b.washBayId, []);
        bayBookingsMap.get(b.washBayId)!.push(mapped);
      } else {
        unassignedBookings.push(mapped);
      }
    }

    const dayOfWeek = new Date(dateStr + "T12:00:00Z").getUTCDay();

    res.json({
      bays: [
        { id: "unassigned", name: "Unassigned", supportedClasses: [], isActive: true, outOfServiceSince: null, outOfServiceReason: null, outOfServiceEstReturn: null, displayOrder: -1, bookings: unassignedBookings },
        ...bays.map((bay) => ({
          id: bay.id, name: bay.name, supportedClasses: bay.supportedClasses, isActive: bay.isActive,
          outOfServiceSince: bay.outOfServiceSince, outOfServiceReason: bay.outOfServiceReason,
          outOfServiceEstReturn: bay.outOfServiceEstReturn, displayOrder: bay.displayOrder,
          bookings: bayBookingsMap.get(bay.id) || [],
        })),
      ],
      operatingWindows: location.operatingWindows.filter((w) => w.dayOfWeek === dayOfWeek),
      locationTimezone: location.timezone,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to load bay timeline");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load bay timeline" });
  }
});

// ─── Off-platform / Walk-in Booking Entry ───────────────────────────────────

router.post("/providers/:providerId/bookings/off-platform", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { providerId } = req.params;
    const { locationId, serviceId, vehicleClass, bayId, clientName, clientPhone, clientEmail, scheduledStartAtUtc, scheduledEndAtUtc, notes, processPayment, bookingSource } = req.body;

    if (!locationId || !serviceId || !clientName || !scheduledStartAtUtc || !scheduledEndAtUtc) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "locationId, serviceId, clientName, scheduledStartAtUtc, scheduledEndAtUtc are required" });
      return;
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId, locationId } });
    if (!service) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found" }); return; }

    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });

    // Auto-assign bay if not provided
    let assignedBayId = bayId || null;
    if (!assignedBayId && vehicleClass) {
      const available = await prisma.washBay.findFirst({
        where: { locationId, isActive: true, supportedClasses: { has: vehicleClass } },
      });
      assignedBayId = available?.id || null;
    }

    // Upsert client profile
    let profile = clientPhone || clientEmail
      ? await prisma.clientProfile.findFirst({
          where: { providerId, OR: [...(clientPhone ? [{ phone: clientPhone }] : []), ...(clientEmail ? [{ email: clientEmail }] : [])] },
        })
      : null;

    if (profile) {
      await prisma.clientProfile.update({
        where: { id: profile.id },
        data: { name: clientName, ...(clientPhone && { phone: clientPhone }), ...(clientEmail && { email: clientEmail }) },
      });
    } else {
      profile = await prisma.clientProfile.create({
        data: { providerId, name: clientName, phone: clientPhone || null, email: clientEmail || null, tags: ["NEW_CLIENT"] },
      });
    }

    // Off-platform/walk-in bookings NEVER incur platform fee (updated business rule)
    const fee = 0;
    const total = service.basePriceMinor;

    const booking = await prisma.booking.create({
      data: {
        locationId,
        serviceId,
        customerId: user.id,
        status: "PROVIDER_CONFIRMED",
        idempotencyKey: `offplat-${Date.now()}-${locationId}-${clientName.replace(/\s/g, "")}`,
        serviceNameSnapshot: service.name,
        serviceBasePriceMinor: service.basePriceMinor,
        platformFeeMinor: fee,
        totalPriceMinor: total,
        currencyCode: service.currencyCode,
        locationTimezone: location?.timezone || "America/New_York",
        scheduledStartAtUtc: new Date(scheduledStartAtUtc),
        scheduledEndAtUtc: new Date(scheduledEndAtUtc),
        bookingSource: bookingSource || "DIRECT",
        isOffPlatform: true,
        offPlatformClientName: clientName,
        offPlatformClientPhone: clientPhone || null,
        offPlatformClientEmail: clientEmail || null,
        offPlatformPaymentExternal: !processPayment,
        washBayId: assignedBayId,
        assignedOperatorId: user.id,
        fleetPlaceholderClass: vehicleClass || null,
      },
    });

    await prisma.bookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: null, toStatus: "PROVIDER_CONFIRMED", changedBy: user.id, reason: `Off-platform booking created (${bookingSource || "DIRECT"})` },
    });

    if (notes) {
      await prisma.washNote.create({
        data: { bookingId: booking.id, locationId, authorId: user.id, noteType: "BOOKING_INSTRUCTION", content: notes },
      });
    }

    // Update client profile
    await prisma.clientProfile.update({
      where: { id: profile.id },
      data: { visitCount: { increment: 1 }, lastVisitAt: new Date(), lifetimeSpendMinor: { increment: service.basePriceMinor } },
    });

    res.status(201).json({ booking });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create off-platform booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create booking" });
  }
});

router.post("/providers/:providerId/bookings/walk-in", requireAuth, requireProviderAccess(), async (req, res) => {
  // Delegate to off-platform with WALK_IN source and default times
  const now = new Date();
  if (!req.body.scheduledStartAtUtc) req.body.scheduledStartAtUtc = now.toISOString();
  if (!req.body.scheduledEndAtUtc) {
    const service = await prisma.service.findUnique({ where: { id: req.body.serviceId }, select: { durationMins: true } });
    req.body.scheduledEndAtUtc = new Date(now.getTime() + (service?.durationMins || 30) * 60000).toISOString();
  }
  req.body.bookingSource = "WALK_IN";

  // Forward to off-platform handler
  req.url = req.url.replace("/walk-in", "/off-platform");
  router.handle(req, res, () => {});
});

// ─── Booking Reschedule ─────────────────────────────────────────────────────

router.patch("/bookings/:bookingId/reschedule", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { newBayId, newScheduledStartAtUtc, newScheduledEndAtUtc } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true } } },
    });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const oldStart = booking.scheduledStartAtUtc;
    const oldBay = booking.washBayId;

    const data: any = {};
    if (newScheduledStartAtUtc) data.scheduledStartAtUtc = new Date(newScheduledStartAtUtc);
    if (newScheduledEndAtUtc) data.scheduledEndAtUtc = new Date(newScheduledEndAtUtc);
    if (newBayId !== undefined) data.washBayId = newBayId;

    const updated = await prisma.booking.update({ where: { id: booking.id }, data });

    await prisma.auditEvent.create({
      data: {
        actorId: user.id, entityType: "Booking", entityId: booking.id, action: "RESCHEDULE",
        metadata: { oldStart, oldBay, newStart: newScheduledStartAtUtc, newBay: newBayId },
      },
    });

    // Notify driver if on-platform
    if (!booking.isOffPlatform && booking.customerId) {
      const { createNotification } = await import("../lib/notifications");
      await createNotification(booking.customerId, {
        subject: "Booking rescheduled",
        body: `Your wash has been rescheduled. Please check the updated time in your bookings.`,
        actionUrl: `/bookings/${booking.id}`,
      });
    }

    res.json({ booking: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to reschedule booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to reschedule" });
  }
});

// ─── Booking Messages ───────────────────────────────────────────────────────

router.post("/bookings/:bookingId/messages", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { templateId, body } = req.body;
    if (!body) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Message body is required" }); return; }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { location: { select: { providerId: true, provider: { select: { name: true } } } }, vehicle: { select: { fleet: { select: { id: true } } } } },
    });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }
    if (booking.isOffPlatform) { res.status(400).json({ errorCode: "INVALID", message: "Messages can only be sent for on-platform bookings" }); return; }

    const message = await prisma.bookingMessage.create({
      data: { bookingId: booking.id, senderId: user.id, templateId: templateId || null, body },
    });

    // Notify customer
    const { createNotification } = await import("../lib/notifications");
    await createNotification(booking.customerId, {
      subject: `Message from ${booking.location.provider.name}`,
      body, actionUrl: `/bookings/${booking.id}`,
    });

    // Notify fleet admin if applicable
    if (booking.vehicle?.fleet?.id) {
      const fleetAdmins = await prisma.fleetMembership.findMany({
        where: { fleetId: booking.vehicle.fleet.id, role: "FLEET_ADMIN", isActive: true },
        select: { userId: true },
      });
      for (const fa of fleetAdmins) {
        await createNotification(fa.userId, {
          subject: `Provider message for booking`,
          body, actionUrl: `/bookings/${booking.id}`,
        });
      }
    }

    res.status(201).json({ message });
  } catch (err: any) {
    req.log.error({ err }, "Failed to send message");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to send message" });
  }
});

router.get("/bookings/:bookingId/messages", requireAuth, async (req, res) => {
  try {
    const messages = await prisma.bookingMessage.findMany({
      where: { bookingId: req.params.bookingId },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      messages: messages.map((m) => ({
        id: m.id, senderId: m.senderId, senderName: `${m.sender.firstName} ${m.sender.lastName}`,
        templateId: m.templateId, body: m.body, createdAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load messages" });
  }
});

// ─── Enhanced Status Transitions ────────────────────────────────────────────

router.patch("/bookings/:bookingId/assign-operator", requireAuth, async (req, res) => {
  try {
    const { operatorId } = req.body;
    const user = req.user as SessionUser;
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const prev = booking.assignedOperatorId;
    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { assignedOperatorId: operatorId } });
    await prisma.auditEvent.create({
      data: { actorId: user.id, entityType: "Booking", entityId: booking.id, action: "ASSIGN_OPERATOR", metadata: { previousOperatorId: prev, newOperatorId: operatorId } },
    });

    res.json({ booking: updated });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to assign operator" });
  }
});

router.patch("/bookings/:bookingId/assign-bay", requireAuth, async (req, res) => {
  try {
    const { bayId } = req.body;
    const user = req.user as SessionUser;
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const bay = await prisma.washBay.findUnique({ where: { id: bayId } });
    if (!bay || bay.locationId !== booking.locationId || !bay.isActive) {
      res.status(400).json({ errorCode: "INVALID", message: "Bay not available at this location" });
      return;
    }

    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { washBayId: bayId } });
    await prisma.auditEvent.create({
      data: { actorId: user.id, entityType: "Booking", entityId: booking.id, action: "ASSIGN_BAY", metadata: { previousBayId: booking.washBayId, newBayId: bayId } },
    });

    res.json({ booking: updated });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to assign bay" });
  }
});

router.patch("/bookings/:bookingId/adjust-price", requireAuth, async (req, res) => {
  try {
    const { newServiceBasePriceMinor, reason } = req.body;
    const user = req.user as SessionUser;
    if (!newServiceBasePriceMinor || !reason) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "newServiceBasePriceMinor and reason required" }); return; }

    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const newFee = booking.isOffPlatform && booking.offPlatformPaymentExternal ? 0 : calculatePlatformFee(newServiceBasePriceMinor);
    const newTotal = newServiceBasePriceMinor + newFee;

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { serviceBasePriceMinor: newServiceBasePriceMinor, platformFeeMinor: newFee, totalPriceMinor: newTotal },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: user.id, entityType: "Booking", entityId: booking.id, action: "PRICE_ADJUST",
        metadata: { oldBase: booking.serviceBasePriceMinor, newBase: newServiceBasePriceMinor, oldFee: booking.platformFeeMinor, newFee, reason },
      },
    });

    if (!booking.isOffPlatform && booking.customerId) {
      const { createNotification } = await import("../lib/notifications");
      await createNotification(booking.customerId, {
        subject: "Booking price adjusted",
        body: `The price for your wash has been adjusted. Reason: ${reason}`,
        actionUrl: `/bookings/${booking.id}`,
      });
    }

    res.json({ booking: updated });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to adjust price" });
  }
});

// ─── Client Profile Search ──────────────────────────────────────────────────

router.get("/providers/:providerId/client-profiles", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { search } = req.query;
    const where: any = { providerId: req.params.providerId };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }
    const profiles = await prisma.clientProfile.findMany({ where, take: 10, orderBy: { name: "asc" } });
    res.json({ profiles });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to search profiles" });
  }
});

export default router;
