import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess, requirePlatformAdmin } from "../middlewares/requireAuth";
import { isPlatformAdmin, isProviderRole, isFleetRole, type SessionUser } from "../lib/auth";
import { canTransition, isCancellable, isActiveBooking } from "../lib/bookingStateMachine";
import { calculatePlatformFee, calculateAllInPrice } from "../lib/feeCalculator";
import { incrementRespondedInSla } from "../lib/slaEnforcer";
import { isDriver, getFleetId } from "../lib/auth";
import { notifyBookingRequested, notifyBookingConfirmed, notifyBookingDeclined, notifyBookingCancelled, notifyBookingCompleted } from "../lib/bookingNotifier";
import {
  deriveVehicleClassFromLength,
  findAvailableBayTx,
  normalizeVehicleClass,
  resolveServiceDuration,
  type VehicleClass,
} from "../lib/bayMatching";
import { findNextAvailableSlot } from "../lib/nextAvailableSlot";
import crypto from "crypto";

const router: IRouter = Router();

const HOLD_TTL_MS = 10 * 60 * 1000;

router.post("/bookings/hold", requireAuth, async (req, res) => {
  try {
    const { locationId, serviceId, serviceIds, slotStartUtc, vehicleId } = req.body;

    // Multi-service contract: caller passes serviceIds (ordered array)
    // OR a single serviceId (back-compat). The hold persists the full
    // ordered list and uses the SUM of service durations to validate
    // the slot. The single column tracks the first id so legacy code
    // paths that still read .serviceId keep working.
    const orderedServiceIds: string[] = Array.isArray(serviceIds) && serviceIds.length > 0
      ? serviceIds.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : (typeof serviceId === "string" ? [serviceId] : []);

    if (!locationId || orderedServiceIds.length === 0 || !slotStartUtc) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "locationId, serviceIds (or serviceId), and slotStartUtc are required",
      });
      return;
    }

    const user = req.user as SessionUser;

    const services = await prisma.service.findMany({
      where: { id: { in: orderedServiceIds }, locationId, isVisible: true },
      include: { location: { select: { providerId: true } } },
    });

    if (services.length !== orderedServiceIds.length) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "One or more services not found at this location" });
      return;
    }

    // Order the result the same as the caller's array so the snapshot
    // on the hold preserves the driver's selected order.
    const servicesById = new Map(services.map((s) => [s.id, s]));
    const orderedServices = orderedServiceIds.map((id) => servicesById.get(id)!);
    // Backward-compat: single-service call sites still read `service`.
    const service = orderedServices[0];

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

    // Resolve the vehicle class up front: the hold checks that at least one
    // compatible bay is free for the requested window, matching what the
    // driver was shown by the availability endpoint.
    const vehicleClassHint = await resolveBookingVehicleClass(prisma, {
      vehicleId: vehicleId || null,
      fleetPlaceholderClass: req.body.fleetPlaceholderClass || null,
    });

    const slotStart = new Date(slotStartUtc);
    // Total duration is the SUM of every selected service's duration,
    // class-aware where the service has a per-class override. The
    // smart-slot search needs a contiguous block this large.
    const perServiceDurations = await Promise.all(
      orderedServices.map(async (s) => {
        if (vehicleClassHint) {
          const d = await resolveServiceDuration(prisma, s.id, vehicleClassHint);
          return d ?? s.durationMins;
        }
        return s.durationMins;
      })
    );
    const durationMins = perServiceDurations.reduce((a, b) => a + b, 0);
    const slotEnd = new Date(slotStart.getTime() + durationMins * 60 * 1000);
    const now = new Date();

    // Driver bookings have no hard lead-time block — only a past-time guard.
    // Slots within SHORT_NOTICE_THRESHOLD_MINUTES of `now` are confirmed
    // explicitly by the client (modal) before this endpoint is called.
    if (slotStart.getTime() <= now.getTime()) {
      res.status(409).json({ errorCode: "SLOT_IN_PAST", message: "Slot start time has already passed" });
      return;
    }

    const requestId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + HOLD_TTL_MS);

    const hold = await prisma.$transaction(async (tx) => {
      // Bay-level guard: if we know the class, require a matching free bay;
      // otherwise require any free bay. Matches the availability endpoint.
      const classToCheck: VehicleClass = vehicleClassHint || "MEDIUM";
      const classesToTry: VehicleClass[] = vehicleClassHint
        ? [vehicleClassHint]
        : ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"];
      let anyBay: { id: string } | null = null;
      for (const c of classesToTry) {
        anyBay = await findAvailableBayTx(tx, {
          locationId,
          vehicleClass: c,
          startUtc: slotStart,
          durationMins,
        });
        if (anyBay) break;
      }
      if (!anyBay) throw new Error("NO_BAY_AVAILABLE");

      return tx.bookingHold.create({
        data: {
          locationId,
          // Single serviceId column tracks the first service for the
          // FK to satisfy. The full ordered list is the canonical
          // source for the booking-creation step.
          serviceId: orderedServiceIds[0],
          serviceIds: orderedServiceIds,
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
    if (err?.message === "NO_BAY_AVAILABLE") {
      res.status(409).json({
        errorCode: "NO_BAY_AVAILABLE",
        message: "No compatible wash bay is free for this slot.",
      });
      return;
    }
    req.log.error({ err }, "Failed to create booking hold");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create booking hold" });
  }
});

/**
 * Resolve the vehicle class for a booking from either the vehicle's length
 * or an explicit fleet placeholder. Returns null when neither is usable —
 * callers decide how to handle that (e.g. auto-assign with best-effort
 * MEDIUM fallback vs. hard reject). We reject at booking-creation time;
 * hold creation is permissive.
 */
async function resolveBookingVehicleClass(
  tx: any,
  params: { vehicleId: string | null; fleetPlaceholderClass: string | null },
): Promise<VehicleClass | null> {
  if (params.vehicleId) {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: params.vehicleId },
      select: { lengthInches: true },
    });
    const fromLength = deriveVehicleClassFromLength(vehicle?.lengthInches ?? null);
    if (fromLength) return fromLength;
  }
  return normalizeVehicleClass(params.fleetPlaceholderClass);
}

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

    // Runs the hold→booking creation inside a Serializable transaction and
    // auto-assigns a bay. Wrapped so we can retry once on serialization
    // conflict (another concurrent booking that grabbed the same bay).
    const runCreate = async () => prisma.$transaction(async (tx) => {
      const now = new Date();

      const hold = await tx.bookingHold.findFirst({
        where: {
          id: holdId,
          userId: user.id,
          bookingId: null,
          isReleased: false,
          expiresAtUtc: { gt: now },
        },
      });
      if (!hold) throw new Error("HOLD_NOT_AVAILABLE");

      // Multi-service: read the ordered list off the hold. Older
      // single-service holds (rows that predate this column) fall
      // back to the singular serviceId.
      const orderedHoldServiceIds: string[] = (hold.serviceIds && hold.serviceIds.length > 0)
        ? hold.serviceIds
        : [hold.serviceId];

      const heldServices = await tx.service.findMany({
        where: { id: { in: orderedHoldServiceIds } },
        include: { location: true },
      });
      if (heldServices.length !== orderedHoldServiceIds.length) throw new Error("SERVICE_NOT_FOUND");

      const heldById = new Map(heldServices.map((s: any) => [s.id, s]));
      const orderedServices = orderedHoldServiceIds.map((id) => heldById.get(id)!);
      const primary = orderedServices[0];

      const vClass = await resolveBookingVehicleClass(tx, {
        vehicleId: vehicleId || null,
        fleetPlaceholderClass: fleetPlaceholderClass || null,
      });
      if (!vClass) throw new Error("VEHICLE_CLASS_UNRESOLVED");

      // Per-service duration (class-aware); the booking covers the
      // sum across all selected services.
      const perServiceDurations = await Promise.all(
        orderedServices.map(async (s: any) => {
          const d = await resolveServiceDuration(tx, s.id, vClass);
          return d ?? s.durationMins;
        })
      );
      const duration = perServiceDurations.reduce((a, b) => a + b, 0);
      const startUtc = hold.slotStartAtUtc;
      const endUtc = new Date(startUtc.getTime() + duration * 60 * 1000);

      const bay = await findAvailableBayTx(tx, {
        locationId: hold.locationId,
        vehicleClass: vClass,
        startUtc,
        durationMins: duration,
      });
      if (!bay) throw new Error("SLOT_JUST_TAKEN");

      const combinedBasePrice = orderedServices.reduce((sum: number, s: any) => sum + s.basePriceMinor, 0);
      const calculatedFee = calculatePlatformFee(combinedBasePrice);
      const totalPrice = combinedBasePrice + calculatedFee;
      const combinedNameSnapshot = orderedServices.map((s: any) => s.name).join(", ");

      // PRD 3.3: 5 min SLA for bookings within 24h, 10 min for 24h+ out.
      // Use the primary service's location SLA settings — all
      // services in a multi-select share the same location.
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const responseSla = startUtc.getTime() - now.getTime() < TWENTY_FOUR_HOURS_MS
        ? primary.location.responseSlaUnder1hMins
        : primary.location.responseSlaFutureMins;
      const responseDeadline = new Date(now.getTime() + responseSla * 60 * 1000);

      // Any service in the bundle requiring confirmation flips the
      // whole booking to REQUESTED — the strictest gate wins.
      const anyRequiresConfirmation = orderedServices.some((s: any) => s.requiresConfirmation);

      const b = await tx.booking.create({
        data: {
          locationId: hold.locationId,
          serviceId: primary.id,
          customerId: user.id,
          vehicleId: vehicleId || null,
          fleetPlaceholderClass: fleetPlaceholderClass || null,
          status: anyRequiresConfirmation ? "REQUESTED" : "PROVIDER_CONFIRMED",
          idempotencyKey,
          serviceNameSnapshot: combinedNameSnapshot,
          serviceBasePriceMinor: combinedBasePrice,
          platformFeeMinor: calculatedFee,
          totalPriceMinor: totalPrice,
          currencyCode: primary.currencyCode,
          locationTimezone: primary.location.timezone,
          scheduledStartAtUtc: startUtc,
          scheduledEndAtUtc: endUtc,
          providerResponseDeadlineUtc: anyRequiresConfirmation ? responseDeadline : null,
          bookingHoldExpiresUtc: hold.expiresAtUtc,
          washBayId: bay.id,
          bookingSource: "PLATFORM",
        },
      });

      // Persist the join rows. Snapshots freeze name/price/duration
      // here so a future Service rename / re-price never alters the
      // historical record.
      for (let i = 0; i < orderedServices.length; i++) {
        const s = orderedServices[i] as any;
        await tx.bookingService.create({
          data: {
            bookingId: b.id,
            serviceId: s.id,
            nameSnapshot: s.name,
            priceMinor: s.basePriceMinor,
            durationMins: perServiceDurations[i],
            displayOrder: i,
          },
        });
      }

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: null,
          toStatus: anyRequiresConfirmation ? "REQUESTED" : "PROVIDER_CONFIRMED",
          changedBy: user.id,
          reason: `Booking created; assigned to ${bay.name}`,
        },
      });

      await tx.bookingHold.update({
        where: { id: holdId },
        data: { bookingId: b.id },
      });

      return { booking: b, service: primary, vClass, duration, startUtc };
    }, { isolationLevel: "Serializable" });

    let result;
    try {
      result = await runCreate();
    } catch (err: any) {
      // Prisma emits P2034 for serialization failures. Retry once.
      const isSerializationFailure = err?.code === "P2034" || /could not serialize/i.test(err?.message || "");
      if (isSerializationFailure) {
        try {
          result = await runCreate();
        } catch (err2: any) {
          // Convert to SLOT_JUST_TAKEN so the client renders the alternate-slot CTA.
          throw Object.assign(new Error("SLOT_JUST_TAKEN"), { cause: err2 });
        }
      } else {
        throw err;
      }
    }

    res.status(201).json({ booking: result.booking });

    if (result.booking.status === "REQUESTED") {
      notifyBookingRequested(result.booking.id).catch(() => {});
    } else if (result.booking.status === "PROVIDER_CONFIRMED") {
      notifyBookingConfirmed(result.booking.id).catch(() => {});
    }
  } catch (err: any) {
    if (err?.message === "HOLD_NOT_AVAILABLE") {
      res.status(410).json({ errorCode: "HOLD_EXPIRED", message: "Hold is no longer available. Please create a new hold." });
      return;
    }
    if (err?.message === "SERVICE_NOT_FOUND") {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service no longer exists" });
      return;
    }
    if (err?.message === "VEHICLE_CLASS_UNRESOLVED") {
      res.status(400).json({
        errorCode: "VEHICLE_CLASS_UNRESOLVED",
        message: "Couldn't determine vehicle class. Make sure the vehicle has a valid length, or supply a fleetPlaceholderClass.",
      });
      return;
    }
    if (err?.message === "SLOT_JUST_TAKEN") {
      // Compute a helpful next-available slot for the client's one-tap retry.
      try {
        const { holdId: holdIdFromBody } = req.body;
        const hold = await prisma.bookingHold.findUnique({ where: { id: holdIdFromBody } });
        if (hold) {
          const vClass = await resolveBookingVehicleClass(prisma, {
            vehicleId: req.body.vehicleId || null,
            fleetPlaceholderClass: req.body.fleetPlaceholderClass || null,
          });
          const duration = vClass
            ? (await resolveServiceDuration(prisma, hold.serviceId, vClass)) ?? 0
            : 0;
          const next = vClass && duration
            ? await findNextAvailableSlot(prisma, {
                locationId: hold.locationId,
                serviceId: hold.serviceId,
                vehicleClass: vClass,
                durationMins: duration,
                afterUtc: hold.slotStartAtUtc,
              })
            : null;
          res.status(409).json({
            errorCode: "SLOT_JUST_TAKEN",
            message: "Another booking just took this slot. Try the next available time.",
            nextAvailableSlot: next,
          });
          return;
        }
      } catch (nextErr) {
        req.log.warn({ err: nextErr }, "Failed to compute nextAvailableSlot");
      }
      res.status(409).json({
        errorCode: "SLOT_JUST_TAKEN",
        message: "Another booking just took this slot.",
        nextAvailableSlot: null,
      });
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
    const viewerId = (req.user as SessionUser).id;
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: {
        // Address fields are needed by the booking detail page to render
        // a "Get Directions" link (Google Maps URL) without a second
        // round-trip. The schema field is `regionCode`, not `stateCode`
        // — selecting `stateCode` was crashing Prisma with PrismaClient
        // ValidationError "Unknown field" and 500-ing every booking
        // detail fetch. /api/locations/* endpoints expose this column
        // as `stateCode` for backwards-compat on the wire; this endpoint
        // returns `regionCode` directly and the client reads that.
        location: { select: { id: true, name: true, timezone: true, providerId: true, addressLine1: true, city: true, regionCode: true, postalCode: true, latitude: true, longitude: true, provider: { select: { id: true, name: true } } } },
        service: { select: { id: true, name: true, durationMins: true } },
        bookingServices: {
          select: { id: true, serviceId: true, nameSnapshot: true, priceMinor: true, durationMins: true, displayOrder: true },
          orderBy: { displayOrder: "asc" },
        },
        // Surface whether the requesting viewer has reviewed this exact
        // booking. Driving the "Thanks for your review" state from server
        // truth (per-booking) rather than client-only state stops it from
        // leaking across bookings at the same provider when wouter
        // re-renders BookingDetail without remounting.
        reviews: {
          where: { authorId: viewerId },
          select: { id: true },
          take: 1,
        },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        vehicle: true,
        // Bay was missing from this projection — the detail page was
        // rendering "Unassigned" for every booking, even ones with a
        // washBayId set, because b.washBay was always undefined here.
        washBay: { select: { id: true, name: true } },
        // Operator is needed for the "Booked by" line on walk-in /
        // off-platform bookings on the standalone detail page (matches
        // the Daily Board expanded view).
        assignedOperator: { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        // Surface notes + add-ons inline so the detail page can render
        // them without a second round-trip; both are bookings-of-truth
        // signals the operator needs at a glance.
        washNotes: {
          select: {
            id: true, content: true, noteType: true, authorRole: true, createdAt: true,
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        addOns: {
          select: { id: true, name: true, priceMinor: true, quantity: true, totalMinor: true, isCustomOneOff: true },
          orderBy: { createdAt: "asc" },
        },
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

    // Provider-authored notes are internal to the provider org —
    // drivers (customers) never see them. The driver still sees their
    // own DRIVER notes and any FLEET notes from their fleet admin.
    // Existing rows stay in the database; the API just filters them
    // out for non-provider viewers.
    let washNotes = (booking as any).washNotes ?? [];
    if (!isProvider && !isAdmin) {
      washNotes = washNotes.filter((n: any) => n.authorRole !== "PROVIDER");
    }
    // Boolean flatten of the viewer-scoped reviews relation. Strip the
    // raw `reviews` array from the response so we don't leak the review
    // id back to the client (it's not needed for the UI gate).
    const hasReview = Array.isArray((booking as any).reviews) && (booking as any).reviews.length > 0;
    const { reviews: _viewerReviews, ...rest } = booking as any;
    const sanitized = { ...rest, washNotes, hasReview };

    res.json({ booking: sanitized });
  } catch (err) {
    req.log.error({ err }, "Failed to get booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get booking" });
  }
});

// Append-only note attachment. Drivers can attach to their own bookings,
// provider staff/admin to bookings at their location, platform admins
// anywhere. There is intentionally NO PATCH or DELETE handler — once a
// note lands, it's frozen. The append-only contract is enforced at the
// route surface; protecting the provider from mid-flight rewrites by the
// driver matters more than supporting edits.
router.post("/bookings/:bookingId/notes", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { content } = req.body as { content?: unknown };
    if (typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "content is required" });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "content must be 2000 characters or fewer" });
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      select: { id: true, locationId: true, customerId: true, location: { select: { providerId: true } } },
    });
    if (!booking) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Booking not found" });
      return;
    }

    const isAdmin = isPlatformAdmin(user);
    const isCustomer = booking.customerId === user.id;
    const isProvider = isProviderRole(user, booking.location.providerId);
    if (!isAdmin && !isCustomer && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    // Resolve the author's role *now*, freeze on the row. Customer of a
    // booking authoring a note is by definition the driver (or a fleet
    // admin who booked on behalf of a driver — distinguish via fleet
    // membership). Provider role wins on multi-membership for the same
    // user (a provider operator who happens to also be a driver is here
    // in their provider capacity).
    let authorRole: "PROVIDER" | "DRIVER" | "FLEET" = "PROVIDER";
    if (isProvider || isAdmin) {
      authorRole = "PROVIDER";
    } else if (isCustomer) {
      // Distinguish driver vs fleet admin booking on behalf of a driver
      const fleetMemberships = await prisma.fleetMembership.findMany({
        where: { userId: user.id, isActive: true },
        select: { role: true },
      });
      const isFleetAdmin = fleetMemberships.some((m) => m.role === "FLEET_ADMIN");
      authorRole = isFleetAdmin ? "FLEET" : "DRIVER";
    }

    const note = await prisma.washNote.create({
      data: {
        bookingId: booking.id,
        locationId: booking.locationId,
        authorId: user.id,
        authorRole,
        noteType: "BOOKING_INSTRUCTION",
        content: content.trim(),
      },
      select: {
        id: true, content: true, noteType: true, authorRole: true, createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ note });
  } catch (err) {
    req.log.error({ err }, "Failed to add booking note");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to add note" });
  }
});

// Provider-only edit/delete for provider-authored notes. Driver- and
// fleet-authored notes stay strictly append-only — protecting the
// provider from mid-flight rewrites by the driver. The viewer must be
// in the same provider org as the note's booking location.
async function authorizeProviderNoteMutation(
  user: SessionUser,
  noteId: string,
): Promise<{ ok: true; note: { id: string; bookingId: string | null } } | { ok: false; status: number; error: { errorCode: string; message: string } }> {
  const note = await prisma.washNote.findUnique({
    where: { id: noteId },
    select: {
      id: true, bookingId: true, authorRole: true,
      location: { select: { providerId: true } },
    },
  });
  if (!note) return { ok: false, status: 404, error: { errorCode: "NOT_FOUND", message: "Note not found" } };
  if (note.authorRole !== "PROVIDER") {
    // Append-only for everyone else.
    return { ok: false, status: 403, error: { errorCode: "FORBIDDEN", message: "This note is append-only and cannot be edited or deleted." } };
  }
  const isAdmin = isPlatformAdmin(user);
  const isProvider = isProviderRole(user, note.location.providerId);
  if (!isAdmin && !isProvider) {
    return { ok: false, status: 403, error: { errorCode: "FORBIDDEN", message: "Access denied" } };
  }
  return { ok: true, note: { id: note.id, bookingId: note.bookingId } };
}

router.patch("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { content } = req.body as { content?: unknown };
    if (typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "content is required" });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "content must be 2000 characters or fewer" });
      return;
    }

    const auth = await authorizeProviderNoteMutation(user, req.params.noteId as string);
    if (!auth.ok) { res.status(auth.status).json(auth.error); return; }

    const note = await prisma.washNote.update({
      where: { id: auth.note.id },
      data: { content: content.trim() },
      select: {
        id: true, content: true, noteType: true, authorRole: true, createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });

    res.json({ note });
  } catch (err) {
    req.log.error({ err }, "Failed to update note");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update note" });
  }
});

router.delete("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const auth = await authorizeProviderNoteMutation(user, req.params.noteId as string);
    if (!auth.ok) { res.status(auth.status).json(auth.error); return; }

    await prisma.washNote.delete({ where: { id: auth.note.id } });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete note");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to delete note" });
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
    notifyBookingConfirmed(booking.id).catch(() => {});
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
    notifyBookingDeclined(booking.id, reasonCode).catch(() => {});
  } catch (err: any) {
    if (err?.message === "INVALID_TRANSITION") {
      res.status(409).json({ errorCode: "INVALID_TRANSITION", message: "Cannot decline booking in its current status" });
      return;
    }
    req.log.error({ err }, "Failed to decline booking");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to decline booking" });
  }
});

// Allowed cancellation reason codes. The values are user-facing only via
// the notification template branch — the column itself stores the raw
// code so analytics / future filters stay precise. Anything outside this
// set falls back to "OTHER" wording on the notification side.
const VALID_CANCELLATION_REASONS = new Set([
  "CUSTOMER_REQUESTED",
  "PROVIDER_UNAVAILABLE",
  "CUSTOMER_NO_SHOW",
  "OTHER",
  // Legacy / driver-side reason codes — keep accepted so existing
  // clients (driver self-cancel) don't break.
  "USER_REQUESTED",
]);

router.post("/bookings/:bookingId/cancel", requireAuth, async (req, res) => {
  try {
    const { reasonCode, note } = req.body as { reasonCode?: string; note?: string };

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
    const isCustomer = booking.customerId === user.id;

    if (!isAdmin && !isCustomer && !isProvider) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Access denied" });
      return;
    }

    // Actor priority: PROVIDER first, then CUSTOMER. Walk-in bookings
    // have customerId pointing at the provider's own user, so a naive
    // isCustomer-first check mis-attributed every walk-in cancel to
    // CUSTOMER_CANCELLED. Provider-role membership at the booking's
    // location is the unambiguous signal — if you're a member of the
    // provider org, your cancel is a provider cancel. Platform admins
    // are treated as provider-side too (admin actions on the org's
    // bookings shouldn't be filed under "customer"). Customer-only
    // is the explicit fallback when neither role applies.
    const isProviderActor = isProvider || (isAdmin && !isCustomer);
    const newStatus = isProviderActor ? "PROVIDER_CANCELLED" : "CUSTOMER_CANCELLED";

    const cleanReasonCode = (typeof reasonCode === "string" && VALID_CANCELLATION_REASONS.has(reasonCode))
      ? reasonCode
      : (typeof reasonCode === "string" && reasonCode.length > 0 ? "OTHER" : null);

    const cancellableStatuses = ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "LATE"];

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({
        where: { id: booking.id, status: { in: cancellableStatuses as any } },
      });

      if (!b) throw new Error("NOT_CANCELLABLE");

      // Persist the optional provider note alongside reason + status.
      // The note column was added in 2g-1.5 — prior to that the note
      // was parsed from the request body and dropped on the floor, so
      // any existing /cancel callers that omit `note` continue to work
      // (note stays null, no DB error). Empty / whitespace-only notes
      // are coerced to null so a stale empty submission doesn't leave
      // a vacant "Message from provider:" block on the customer view.
      const cleanNote = (typeof note === "string" && note.trim().length > 0) ? note.trim().slice(0, 500) : null;
      const result = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: newStatus,
          cancellationReasonCode: cleanReasonCode,
          cancellationNote: cleanNote,
          // visibility flag isn't writable from the client yet — the
          // dialog's note is customer-visible by default per 2g-1.5
          // product decision. Leave default (true) so the customer
          // sees the note unless a future toggle says otherwise.
        },
      });

      // bookingStatusHistory.changedBy carries the actor user id — this
      // is the source of truth for "who cancelled" if we ever need to
      // re-derive without the new fields. The reason text below is
      // for human-readable history; the structured code lives on
      // booking.cancellationReasonCode.
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: b.status,
          toStatus: newStatus,
          changedBy: user.id,
          reason: cleanReasonCode || (isProviderActor ? "Provider cancelled" : "Customer cancelled"),
        },
      });

      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, isReleased: false },
        data: { isReleased: true },
      });

      return result;
    });

    res.json({ booking: updated });
    notifyBookingCancelled(booking.id, isProviderActor ? "provider" : "customer", cleanReasonCode, note?.trim() || null).catch(() => {});
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
    notifyBookingCompleted(booking.id).catch(() => {});

    // V2: Update vehicle lastWashAtUtc and ClientProfile on completion
    try {
      if (booking.vehicleId) {
        await prisma.vehicle.update({ where: { id: booking.vehicleId }, data: { lastWashAtUtc: new Date() } });
      }
      if (booking.customerId && booking.location?.providerId) {
        const profile = await prisma.clientProfile.findFirst({
          where: { providerId: booking.location.providerId, userId: booking.customerId },
        });
        if (profile) {
          const newVisitCount = profile.visitCount + 1;
          const newTags = [...profile.tags];
          if (newTags.includes("NEW_CLIENT") && newVisitCount >= 2) {
            newTags.splice(newTags.indexOf("NEW_CLIENT"), 1);
          }
          if (!newTags.includes("FREQUENT") && newVisitCount >= 5) {
            newTags.push("FREQUENT");
          }
          await prisma.clientProfile.update({
            where: { id: profile.id },
            data: { visitCount: newVisitCount, lastVisitAt: new Date(), lifetimeSpendMinor: { increment: booking.serviceBasePriceMinor }, tags: newTags },
          });
        }
      }
    } catch (profileErr) {
      req.log.warn({ err: profileErr }, "Failed to update vehicle/client profile on completion");
    }
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
