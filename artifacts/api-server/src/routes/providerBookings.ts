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
import { deriveVehicleClassFromLength, normalizeVehicleClass } from "../lib/bayMatching";
import { localTimeToUtc } from "../lib/timezone";

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

// ─── Provider Bay Availability ──────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/bay-availability", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { locationId } = req.params;
    const dateStr = req.query.date as string;
    const vehicleClass = (req.query.vehicleClass as string) || "MEDIUM";
    const durationMins = parseInt(req.query.durationMins as string) || 30;

    if (!dateStr) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "date query param required" }); return; }

    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    if (!location) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" }); return; }

    const { startUtc, endUtc } = getDayRangeUtc(dateStr, location.timezone);

    // Get all active bays for this location, plus the subset compatible with
    // the requested vehicle class. The distinction matters for the UI: a
    // location with no bays at all gets a different message than one whose
    // bays just don't fit this vehicle class.
    const [totalBayCount, bays] = await Promise.all([
      prisma.washBay.count({ where: { locationId, isActive: true } }),
      prisma.washBay.findMany({
        where: { locationId, isActive: true, supportedClasses: { has: vehicleClass } },
        select: { id: true, name: true },
      }),
    ]);

    if (bays.length === 0) {
      const message = totalBayCount === 0
        ? "This location has no bays configured. Add a bay in Settings before booking."
        : `No bays at this location support ${vehicleClass} vehicles.`;
      res.json({
        slots: [],
        bayCount: 0,
        totalBayCount,
        errorCode: totalBayCount === 0 ? "LOCATION_HAS_NO_BAYS" : "NO_COMPATIBLE_BAY",
        message,
      });
      return;
    }

    // Get all active bookings for the day on these bays
    // Use raw UTC day range (matching frontend's UTC interpretation)
    const dayStartUtc = new Date(`${dateStr}T06:00:00Z`);
    const dayEndUtc = new Date(`${dateStr}T23:59:59Z`);
    const bayIds = bays.map((b) => b.id);
    const existingBookings = await prisma.booking.findMany({
      where: {
        washBayId: { in: bayIds },
        status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "NO_SHOW"] as any },
        scheduledStartAtUtc: { lt: dayEndUtc },
        scheduledEndAtUtc: { gt: dayStartUtc },
      },
      select: { washBayId: true, scheduledStartAtUtc: true, scheduledEndAtUtc: true },
    });

    // Generate 30-minute time slots from 6am to 9pm in the LOCATION's local time.
    // Each slot label is wall-clock in `location.timezone`; we convert to a real
    // UTC instant via the shared helper so overlap and past-time checks compare
    // apples-to-apples against `now`. Anything else regresses the timezone bug
    // class that previously surfaced provider availability ~10h off (slots
    // labeled e.g. 10:00 ET getting stored as 10:00Z = 06:00 ET).
    const slots: { time: string; available: boolean; availableBays: number }[] = [];
    const now = new Date();

    for (let hour = 6; hour <= 21; hour++) {
      for (const minute of [0, 30]) {
        const slotTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

        const slotStartUtc = localTimeToUtc(dateStr, slotTime, location.timezone);
        const slotEndUtc = new Date(slotStartUtc.getTime() + durationMins * 60000);

        // Past time check
        if (slotStartUtc < now) {
          slots.push({ time: slotTime, available: false, availableBays: 0 });
          continue;
        }

        // Count how many bays are free at this slot (considering full wash duration)
        let freeBays = bays.length;
        for (const bay of bays) {
          const hasConflict = existingBookings.some(
            (b) => b.washBayId === bay.id &&
              new Date(b.scheduledStartAtUtc) < slotEndUtc &&
              new Date(b.scheduledEndAtUtc) > slotStartUtc
          );
          if (hasConflict) freeBays--;
        }

        slots.push({ time: slotTime, available: freeBays > 0, availableBays: freeBays });
      }
    }

    res.json({ slots, bayCount: bays.length, totalBayCount });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get bay availability");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load availability" });
  }
});

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
        vehicle: { select: { id: true, unitNumber: true, subtypeCode: true, bodyType: true, nickname: true, lengthInches: true, heightInches: true, licensePlate: true, fleet: { select: { name: true } } } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { name: true } },
        washBay: { select: { id: true, name: true } },
        assignedOperator: { select: { id: true, firstName: true, lastName: true } },
        // Inline notes + add-ons so the Daily Board expanded view can
        // render them without a per-row round-trip. Limited to a small
        // number per booking to keep the payload sane.
        washNotes: {
          select: {
            id: true, content: true, noteType: true, authorRole: true, createdAt: true,
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 5,
        },
        addOns: {
          select: { id: true, name: true, priceMinor: true, quantity: true, totalMinor: true },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { photos: true, messages: true, washNotes: true, addOns: true } },
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
          bodyType: b.vehicle.bodyType, nickname: b.vehicle.nickname,
          lengthInches: b.vehicle.lengthInches, heightInches: b.vehicle.heightInches, licensePlate: b.vehicle.licensePlate,
        } : null,
        fleetPlaceholderClass: b.fleetPlaceholderClass,
        customer: b.customer ? { id: b.customer.id, firstName: b.customer.firstName, lastName: b.customer.lastName } : null,
        // Client-side resolver needs both offPlatformClientName AND
        // isOffPlatform to know which one to prefer; otherwise walk-in
        // bookings show the operator's name (Booking.customerId points
        // at the operator on off-platform creation). bookingSource is
        // already projected above; don't duplicate.
        offPlatformClientName: b.offPlatformClientName,
        isOffPlatform: b.isOffPlatform,
        fleetName: b.vehicle?.fleet?.name || null,
        assignedOperator: b.assignedOperator ? { id: b.assignedOperator.id, firstName: b.assignedOperator.firstName, lastName: b.assignedOperator.lastName } : null,
        washBay: b.washBay ? { id: b.washBay.id, name: b.washBay.name } : null,
        clientTags,
        washNotes: b.washNotes,
        washNoteCount: b._count.washNotes,
        addOns: b.addOns,
        addOnCount: b._count.addOns,
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
        vehicle: {
          select: {
            unitNumber: true, subtypeCode: true, bodyType: true, nickname: true,
            // Fleet name belongs in the bay-timeline payload so the
            // block can render "Northeast Bus Lines · NEB-202" as its
            // secondary line. Daily Board already had this — bringing
            // bay-timeline up to par.
            fleet: { select: { name: true } },
          },
        },
        customer: { select: { firstName: true, lastName: true } },
        assignedOperator: { select: { firstName: true, lastName: true } },
      },
    });

    for (const b of allBookings) {
      // For walk-in / direct bookings, customerId points at the
      // operator (e.g. James) — see the off-platform creation handler.
      // The actual walk-in client lives in offPlatformClientName, so
      // prefer that whenever the booking is off-platform. The boards
      // were universally showing "James Chen" otherwise.
      const isOffPlatform = b.isOffPlatform === true || b.bookingSource === "WALK_IN" || b.bookingSource === "DIRECT";
      const driverFirstName = isOffPlatform
        ? (b.offPlatformClientName || b.customer?.firstName || null)
        : (b.customer?.firstName || b.offPlatformClientName || null);

      const mapped = {
        id: b.id,
        scheduledStartAtUtc: b.scheduledStartAtUtc,
        scheduledEndAtUtc: b.scheduledEndAtUtc,
        serviceStartedAtUtc: b.serviceStartedAtUtc,
        serviceCompletedAtUtc: b.serviceCompletedAtUtc,
        status: b.status,
        bookingSource: b.bookingSource,
        isOffPlatform: b.isOffPlatform,
        offPlatformClientName: b.offPlatformClientName,
        serviceNameSnapshot: b.serviceNameSnapshot,
        vehicle: b.vehicle ? { unitNumber: b.vehicle.unitNumber, bodyType: b.vehicle.bodyType, nickname: b.vehicle.nickname } : null,
        vehicleUnitNumber: b.vehicle?.unitNumber || null,
        vehicleSubtypeCode: b.vehicle?.subtypeCode || null,
        fleetName: b.vehicle?.fleet?.name || null,
        fleetPlaceholderClass: b.fleetPlaceholderClass,
        driverFirstName,
        assignedOperatorFirstName: b.assignedOperator?.firstName || null,
        assignedOperatorLastName: b.assignedOperator?.lastName || null,
      };
      if (b.washBayId) {
        if (!bayBookingsMap.has(b.washBayId)) bayBookingsMap.set(b.washBayId, []);
        bayBookingsMap.get(b.washBayId)!.push(mapped);
      } else {
        unassignedBookings.push(mapped);
      }
    }

    const dayOfWeek = new Date(dateStr + "T12:00:00Z").getUTCDay();

    // Since auto-assignment landed, platform bookings should always carry a
    // washBayId. The timeline no longer renders a synthetic "Unassigned" row;
    // instead we return any stragglers in `unassignedBookings` so the
    // frontend can flag them with a warning banner.
    const rows = bays.map((bay) => ({
      id: bay.id, name: bay.name, supportedClasses: bay.supportedClasses, isActive: bay.isActive,
      outOfServiceSince: bay.outOfServiceSince, outOfServiceReason: bay.outOfServiceReason,
      outOfServiceEstReturn: bay.outOfServiceEstReturn, displayOrder: bay.displayOrder,
      bookings: bayBookingsMap.get(bay.id) || [],
    }));

    res.json({
      bays: rows,
      bayCount: bays.length,
      unassignedBookings,
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
    const { locationId, serviceId, serviceIds, vehicleClass, bayId, clientName, clientPhone, clientEmail, scheduledStartAtUtc, scheduledEndAtUtc, notes, processPayment, bookingSource, addOns } = req.body;

    if (!locationId || !serviceId || !clientName || !scheduledStartAtUtc || !scheduledEndAtUtc) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "locationId, serviceId, clientName, scheduledStartAtUtc, scheduledEndAtUtc are required" });
      return;
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId, locationId } });
    if (!service) { res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found" }); return; }

    // Resolve all selected service names for the snapshot
    const allServiceIds: string[] = Array.isArray(serviceIds) && serviceIds.length > 0 ? serviceIds : [serviceId];
    const allServices = await prisma.service.findMany({ where: { id: { in: allServiceIds }, locationId }, select: { name: true, basePriceMinor: true, durationMins: true } });
    const serviceNamesSnapshot = allServices.map((s) => s.name).join(", ") || service.name;
    const combinedPrice = allServices.reduce((sum, s) => sum + s.basePriceMinor, 0) || service.basePriceMinor;

    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });

    // Bug 3: Prevent booking in the past
    const bookingStartUtc = new Date(scheduledStartAtUtc);
    if (bookingStartUtc < new Date()) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Cannot book a wash in the past. Please select a future time." });
      return;
    }

    const bookingEndUtc = scheduledEndAtUtc ? new Date(scheduledEndAtUtc) : new Date(bookingStartUtc.getTime() + (service.durationMins || 30) * 60000);

    // Auto-assign bay if not provided — pick one with no time conflict
    let assignedBayId = bayId || null;
    const vClass = vehicleClass || "MEDIUM";

    // First distinguish "no bays at all" from "all bays busy" so the frontend
    // can surface the right message.
    const totalBayCount = await prisma.washBay.count({ where: { locationId, isActive: true } });
    if (totalBayCount === 0) {
      res.status(409).json({
        errorCode: "LOCATION_HAS_NO_BAYS",
        message: "This location has no bays configured. Add a bay in Settings before booking.",
      });
      return;
    }

    const candidateBays = await prisma.washBay.findMany({
      where: { locationId, isActive: true, supportedClasses: { has: vClass } },
      include: {
        bookings: {
          where: {
            status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "NO_SHOW"] as any },
            scheduledStartAtUtc: { lt: bookingEndUtc },
            scheduledEndAtUtc: { gt: bookingStartUtc },
          },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    if (!assignedBayId) {
      if (candidateBays.length === 0) {
        res.status(409).json({
          errorCode: "NO_COMPATIBLE_BAY",
          message: `No bay at this location supports ${vClass} vehicles. Update bay configuration in Settings.`,
        });
        return;
      }
      // Pick the first bay with no conflicting bookings
      const freeBay = candidateBays.find((b) => b.bookings.length === 0);
      if (!freeBay) {
        res.status(409).json({
          errorCode: "NO_BAY_AVAILABLE",
          message: `No wash bay available for ${vClass} vehicles at this time. All ${candidateBays.length} compatible bay(s) are booked.`,
        });
        return;
      }
      assignedBayId = freeBay.id;
    } else {
      // Validate manually selected bay has no conflict
      const selectedBay = candidateBays.find((b) => b.id === assignedBayId);
      if (selectedBay && selectedBay.bookings.length > 0) {
        res.status(409).json({
          errorCode: "BAY_CONFLICT",
          message: `${selectedBay.name || "Selected bay"} is already booked at this time. Choose a different bay or time.`,
        });
        return;
      }
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
    const total = combinedPrice;

    const booking = await prisma.booking.create({
      data: {
        locationId,
        serviceId,
        customerId: user.id,
        status: "PROVIDER_CONFIRMED",
        idempotencyKey: `offplat-${Date.now()}-${locationId}-${clientName.replace(/\s/g, "")}`,
        serviceNameSnapshot: serviceNamesSnapshot,
        serviceBasePriceMinor: combinedPrice,
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
      // Off-platform / walk-in booking entry is always done by provider
      // staff/admin, so the note's authorRole is PROVIDER. Frozen here.
      await prisma.washNote.create({
        data: { bookingId: booking.id, locationId, authorId: user.id, authorRole: "PROVIDER", noteType: "BOOKING_INSTRUCTION", content: notes },
      });
    }

    // Persist add-ons (catalog or custom one-offs). The quick-add UI sends
    // these as part of the body; previously they were silently dropped.
    if (Array.isArray(addOns) && addOns.length > 0) {
      const catalogIds = addOns
        .map((a: any) => a?.addOnId)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      const catalog = catalogIds.length > 0
        ? await prisma.providerAddOn.findMany({
            where: { id: { in: catalogIds }, providerId },
            select: { id: true, name: true, priceMinor: true },
          })
        : [];
      const catalogById = new Map(catalog.map((c) => [c.id, c]));

      for (const ao of addOns as any[]) {
        const fromCatalog = ao?.addOnId ? catalogById.get(ao.addOnId) : null;
        const name = ao?.isCustomOneOff ? (typeof ao?.name === "string" ? ao.name.trim() : "") : (fromCatalog?.name || "");
        if (!name) continue;
        const priceMinor = ao?.isCustomOneOff
          ? (Number.isFinite(ao?.priceMinor) ? Number(ao.priceMinor) : 0)
          : (fromCatalog?.priceMinor ?? 0);
        const quantity = Math.max(1, Number.isFinite(ao?.quantity) ? Number(ao.quantity) : 1);
        await prisma.bookingAddOn.create({
          data: {
            bookingId: booking.id,
            addOnId: ao?.isCustomOneOff ? null : (ao?.addOnId || null),
            name,
            priceMinor,
            quantity,
            totalMinor: priceMinor * quantity,
            isCustomOneOff: !!ao?.isCustomOneOff,
          },
        });
      }
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
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { vehicle: { select: { lengthInches: true } } },
    });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const bay = await prisma.washBay.findUnique({ where: { id: bayId } });
    if (!bay || bay.locationId !== booking.locationId || !bay.isActive) {
      res.status(400).json({ errorCode: "INVALID", message: "Bay not available at this location" });
      return;
    }

    // Class compatibility: derive class from the booking's vehicle length, or
    // fall back to fleetPlaceholderClass. If we can't determine a class, we
    // allow the move (matches pre-existing permissive behavior) but the
    // common path enforces compatibility.
    const vClass = deriveVehicleClassFromLength(booking.vehicle?.lengthInches ?? null)
      || normalizeVehicleClass(booking.fleetPlaceholderClass);
    if (vClass && !bay.supportedClasses.includes(vClass)) {
      res.status(409).json({
        errorCode: "BAY_CLASS_INCOMPATIBLE",
        message: `${bay.name} does not support ${vClass.replace("_", " ").toLowerCase()} vehicles.`,
      });
      return;
    }

    // Overlap check: is another non-cancelled booking already using this bay
    // during the target window?
    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        washBayId: bayId,
        status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "PROVIDER_DECLINED", "EXPIRED", "NO_SHOW"] as any },
        scheduledStartAtUtc: { lt: booking.scheduledEndAtUtc },
        scheduledEndAtUtc: { gt: booking.scheduledStartAtUtc },
      },
      select: { id: true },
    });
    if (conflict) {
      res.status(409).json({
        errorCode: "BAY_TIME_CONFLICT",
        message: `${bay.name} is already booked during this time window.`,
      });
      return;
    }

    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { washBayId: bayId } });
    await prisma.auditEvent.create({
      data: { actorId: user.id, entityType: "Booking", entityId: booking.id, action: "ASSIGN_BAY", metadata: { previousBayId: booking.washBayId, newBayId: bayId } },
    });

    res.json({ booking: updated });
  } catch (err: any) {
    req.log.error({ err }, "Failed to assign bay");
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
