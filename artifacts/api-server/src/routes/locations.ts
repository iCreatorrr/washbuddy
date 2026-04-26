import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess } from "../middlewares/requireAuth";
import { isPlatformAdmin, type SessionUser } from "../lib/auth";
import { calculateAllInPrice } from "../lib/feeCalculator";
import { isWithinOperatingHours, getNextOpenAt, localTimeToUtc, formatLocalDate } from "../lib/timezone";

const router: IRouter = Router();

router.get("/locations/available-now", async (req, res) => {
  try {
    const LOOKAHEAD_MINS = 65;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_MINS * 60 * 1000);
    const todayStr = now.toISOString().split("T")[0];
    const dayOfWeek = now.getDay();

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const endMinutes = nowMinutes + LOOKAHEAD_MINS;
    const spansMidnight = endMinutes >= 24 * 60;
    const tomorrowDayOfWeek = (dayOfWeek + 1) % 7;

    const daysToQuery = spansMidnight ? [dayOfWeek, tomorrowDayOfWeek] : [dayOfWeek];

    const locations = await prisma.location.findMany({
      where: { isVisible: true, provider: { isActive: true, approvalStatus: "APPROVED" } },
      include: {
        services: {
          where: { isVisible: true },
          select: { id: true, durationMins: true, capacityPerSlot: true, leadTimeMins: true },
        },
        operatingWindows: {
          where: { dayOfWeek: { in: daysToQuery } },
          select: { dayOfWeek: true, openTime: true, closeTime: true },
        },
      },
    });

    const availableLocationIds: string[] = [];

    for (const loc of locations) {
      if (loc.operatingWindows.length === 0 || loc.services.length === 0) continue;

      let hasAvailableSlot = false;

      for (const svc of loc.services) {
        if (hasAvailableSlot) break;
        const slotDuration = svc.durationMins;

        for (const window of loc.operatingWindows) {
          if (hasAvailableSlot) break;
          const isToday = window.dayOfWeek === dayOfWeek;
          const [openH, openM] = window.openTime.split(":").map(Number);
          const [closeH, closeM] = window.closeTime.split(":").map(Number);
          const openMinutes = openH * 60 + openM;
          const closeMinutes = closeH * 60 + closeM;

          const windowStartAbs = isToday ? openMinutes : 24 * 60 + openMinutes;
          const windowEndAbs = isToday ? closeMinutes : 24 * 60 + closeMinutes;

          if (windowStartAbs >= endMinutes) continue;
          if (windowEndAbs <= nowMinutes) continue;

          for (let slotStart = openMinutes; slotStart + slotDuration <= closeMinutes; slotStart += slotDuration) {
            const slotStartAbs = isToday ? slotStart : 24 * 60 + slotStart;

            if (slotStartAbs >= endMinutes) break;
            if (slotStartAbs + slotDuration <= nowMinutes) continue;

            const startH = Math.floor(slotStart / 60);
            const startM = slotStart % 60;
            const startTime = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
            const dateStr = isToday ? todayStr : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const slotStartUtc = localTimeToUtc(dateStr, startTime, loc.timezone);

            if (slotStartUtc.getTime() <= now.getTime()) continue;

            const existingBookings = await prisma.booking.count({
              where: {
                locationId: loc.id,
                serviceId: svc.id,
                scheduledStartAtUtc: slotStartUtc,
                status: { notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "EXPIRED", "NO_SHOW", "REFUNDED"] },
              },
            });

            const activeHolds = await prisma.bookingHold.count({
              where: {
                locationId: loc.id,
                serviceId: svc.id,
                slotStartAtUtc: slotStartUtc,
                bookingId: null,
                isReleased: false,
                expiresAtUtc: { gt: now },
              },
            });

            const remaining = Math.max(0, svc.capacityPerSlot - existingBookings - activeHolds);
            if (remaining > 0) {
              hasAvailableSlot = true;
              break;
            }
          }
        }
      }

      if (hasAvailableSlot) {
        availableLocationIds.push(loc.id);
      }
    }

    res.json({ locationIds: availableLocationIds });
  } catch (err) {
    req.log.error({ err }, "Failed to check available-now locations");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to check availability" });
  }
});

router.get("/locations/search", async (req, res) => {
  try {
    const { lat, lng, radiusMiles, categoryCode, subtypeCode, openNow } = req.query;

    const where: Record<string, unknown> = { isVisible: true, provider: { isActive: true, approvalStatus: "APPROVED" } };

    const locations = await prisma.location.findMany({
      where,
      include: {
        provider: { select: { id: true, name: true } },
        services: {
          where: { isVisible: true },
          select: {
            id: true,
            name: true,
            description: true,
            durationMins: true,
            basePriceMinor: true,
            currencyCode: true,
            platformFeeMinor: true,
            capacityPerSlot: true,
            leadTimeMins: true,
            requiresConfirmation: true,
            compatibilityRules: {
              select: {
                categoryCode: true,
                subtypeCode: true,
                maxLengthInches: true,
                maxHeightInches: true,
              },
            },
          },
        },
        // Surface bay supportedClasses so the driver-side list can filter
        // locations to those with at least one bay compatible with the
        // active vehicle's class. Active-only — out-of-service bays don't
        // count toward "this location can host my bus".
        washBays: {
          where: { isActive: true },
          select: { id: true, supportedClasses: true },
        },
        operatingWindows: {
          select: { dayOfWeek: true, openTime: true, closeTime: true },
          orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }],
        },
        reviews: {
          where: { isHidden: false },
          select: { rating: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();

    let mapped = locations.map((loc) => {
      const openStatus = isWithinOperatingHours(now, loc.timezone, loc.operatingWindows);
      const nextOpen = openStatus ? null : getNextOpenAt(now, loc.timezone, loc.operatingWindows);

      const reviewRatings = (loc as any).reviews?.map((r: any) => r.rating) || [];
      const reviewCount = reviewRatings.length;
      const averageRating = reviewCount > 0 ? parseFloat((reviewRatings.reduce((s: number, r: number) => s + r, 0) / reviewCount).toFixed(1)) : null;

      return {
        ...loc,
        stateCode: loc.regionCode,
        isOpenNow: openStatus,
        nextOpenAt: nextOpen?.toISOString() ?? null,
        averageRating,
        reviewCount,
        reviews: undefined, // Don't send raw review data to client
        services: loc.services.map((s) => ({
          ...s,
          allInPriceMinor: calculateAllInPrice(s.basePriceMinor),
        })),
      };
    });

    // Server-side "Open Now" filter
    if (openNow === "true") {
      mapped = mapped.filter((loc) => loc.isOpenNow);
    }

    res.json({ locations: mapped });
  } catch (err) {
    req.log.error({ err }, "Failed to search locations");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to search locations" });
  }
});

// Public location detail — used by customer-facing location detail page
// Query by UUID only (no visibility/approval filters) — if the route planner
// surfaces the location, the detail page must be able to resolve it.
router.get("/locations/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;

    // Basic UUID format check to give a better error than a Prisma crash
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(locationId)) {
      res.status(400).json({ errorCode: "INVALID_ID", message: "Invalid location id format" });
      return;
    }

    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        provider: { select: { id: true, name: true, approvalStatus: true, isActive: true } },
        services: {
          where: { isVisible: true },
          select: {
            id: true, name: true, description: true, durationMins: true,
            basePriceMinor: true, currencyCode: true, platformFeeMinor: true,
            capacityPerSlot: true, leadTimeMins: true, requiresConfirmation: true,
            compatibilityRules: { select: { categoryCode: true, subtypeCode: true, maxLengthInches: true, maxHeightInches: true } },
          },
        },
        washBays: {
          where: { isActive: true },
          select: { id: true, supportedClasses: true },
        },
        operatingWindows: {
          select: { dayOfWeek: true, openTime: true, closeTime: true },
          orderBy: [{ dayOfWeek: "asc" as const }, { openTime: "asc" as const }],
        },
        reviews: { where: { isHidden: false }, select: { rating: true } },
      },
    });

    if (!loc) {
      req.log.warn({ locationId }, "Location detail 404 — no row with this id");
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
      return;
    }

    const now = new Date();
    const openStatus = isWithinOperatingHours(now, loc.timezone, loc.operatingWindows);
    const nextOpen = openStatus ? null : getNextOpenAt(now, loc.timezone, loc.operatingWindows);
    const reviewRatings = (loc as any).reviews?.map((r: any) => r.rating) || [];
    const reviewCount = reviewRatings.length;
    const averageRating = reviewCount > 0 ? parseFloat((reviewRatings.reduce((s: number, r: number) => s + r, 0) / reviewCount).toFixed(1)) : null;

    res.json({
      location: {
        ...loc,
        stateCode: loc.regionCode,
        isOpenNow: openStatus,
        nextOpenAt: nextOpen?.toISOString() ?? null,
        averageRating,
        reviewCount,
        reviews: undefined,
        services: loc.services.map((s) => ({
          ...s,
          allInPriceMinor: calculateAllInPrice(s.basePriceMinor),
        })),
      },
    });
  } catch (err: any) {
    req.log.error({ err: err?.message, stack: err?.stack, locationId: req.params.locationId }, "Failed to get location detail");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get location" });
  }
});

router.get("/providers/:providerId/locations", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const locations = await prisma.location.findMany({
      where: { providerId: req.params.providerId },
      include: {
        _count: { select: { services: true, washBays: true } },
        operatingWindows: { orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }] },
      },
      orderBy: { name: "asc" },
    });

    res.json({ locations });
  } catch (err) {
    req.log.error({ err }, "Failed to list locations");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list locations" });
  }
});

router.get("/providers/:providerId/locations/:locationId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const location = await prisma.location.findFirst({
      where: { id: req.params.locationId, providerId: req.params.providerId },
      include: {
        services: true,
        operatingWindows: { orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }] },
      },
    });

    if (!location) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
      return;
    }

    res.json({ location });
  } catch (err) {
    req.log.error({ err }, "Failed to get location");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get location" });
  }
});

router.post("/providers/:providerId/locations", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { name, timezone, addressLine1, addressLine2, city, regionCode, postalCode, countryCode, latitude, longitude } = req.body;

    if (!name || !timezone || !addressLine1 || !city || !regionCode || !postalCode || !countryCode || latitude === undefined || longitude === undefined) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "name, timezone, addressLine1, city, regionCode, postalCode, countryCode, latitude, and longitude are required",
      });
      return;
    }

    const location = await prisma.location.create({
      data: {
        providerId: req.params.providerId,
        name,
        timezone,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        regionCode,
        postalCode,
        countryCode,
        latitude,
        longitude,
      },
    });

    // Auto-provision one default bay so the location is immediately bookable.
    // The provider can rename/resize/add more in Settings → Bays; leaving zero
    // bays here is the exact state that causes the "0 compatible bay(s)" bug.
    const defaultBay = await prisma.washBay.create({
      data: {
        locationId: location.id,
        name: "Bay 1",
        maxVehicleLengthIn: 540,
        maxVehicleHeightIn: 156,
        supportedClasses: ["SMALL", "MEDIUM", "LARGE"],
        isActive: true,
        displayOrder: 0,
      },
    });

    res.status(201).json({ location, defaultBay });
  } catch (err) {
    req.log.error({ err }, "Failed to create location");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create location" });
  }
});

router.patch("/providers/:providerId/locations/:locationId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { name, timezone, addressLine1, addressLine2, city, regionCode, postalCode, countryCode, latitude, longitude, isVisible, responseSlaUnder1hMins, responseSlaFutureMins, bookingBufferMins } = req.body;

    const existing = await prisma.location.findFirst({
      where: { id: req.params.locationId, providerId: req.params.providerId },
    });

    if (!existing) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (timezone !== undefined) data.timezone = timezone;
    if (addressLine1 !== undefined) data.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) data.addressLine2 = addressLine2;
    if (city !== undefined) data.city = city;
    if (regionCode !== undefined) data.regionCode = regionCode;
    if (postalCode !== undefined) data.postalCode = postalCode;
    if (countryCode !== undefined) data.countryCode = countryCode;
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;
    if (isVisible !== undefined) data.isVisible = isVisible;
    if (responseSlaUnder1hMins !== undefined) data.responseSlaUnder1hMins = responseSlaUnder1hMins;
    if (responseSlaFutureMins !== undefined) data.responseSlaFutureMins = responseSlaFutureMins;
    if (bookingBufferMins !== undefined) data.bookingBufferMins = bookingBufferMins;

    const location = await prisma.location.update({
      where: { id: req.params.locationId },
      data,
    });

    res.json({ location });
  } catch (err) {
    req.log.error({ err }, "Failed to update location");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update location" });
  }
});

router.put("/providers/:providerId/locations/:locationId/hours", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { windows } = req.body;

    if (!Array.isArray(windows)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "windows array is required" });
      return;
    }

    for (const w of windows) {
      if (w.dayOfWeek === undefined || !w.openTime || !w.closeTime) {
        res.status(400).json({
          errorCode: "VALIDATION_ERROR",
          message: "Each window requires dayOfWeek (0-6), openTime (HH:MM), closeTime (HH:MM)",
        });
        return;
      }
      if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
        res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "dayOfWeek must be 0 (Sunday) through 6 (Saturday)" });
        return;
      }
    }

    const existing = await prisma.location.findFirst({
      where: { id: req.params.locationId, providerId: req.params.providerId },
    });

    if (!existing) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.operatingWindow.deleteMany({ where: { locationId: req.params.locationId } });

      if (windows.length > 0) {
        await tx.operatingWindow.createMany({
          data: windows.map((w: { dayOfWeek: number; openTime: string; closeTime: string }) => ({
            locationId: req.params.locationId,
            dayOfWeek: w.dayOfWeek,
            openTime: w.openTime,
            closeTime: w.closeTime,
          })),
        });
      }
    });

    const updated = await prisma.operatingWindow.findMany({
      where: { locationId: req.params.locationId },
      orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }],
    });

    res.json({ windows: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update operating hours");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update operating hours" });
  }
});

export default router;
