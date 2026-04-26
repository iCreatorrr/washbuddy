import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { getLocalTimeInfo, localTimeToUtc } from "../lib/timezone";
import { SHORT_NOTICE_THRESHOLD_MINUTES } from "../lib/bookingPolicy";
import {
  findAvailableBayTx,
  normalizeVehicleClass,
  resolveServiceDuration,
  type VehicleClass,
} from "../lib/bayMatching";

const router: IRouter = Router();

router.get("/locations/:locationId/availability", async (req, res) => {
  try {
    const { date, serviceId, serviceIds: serviceIdsRaw, vehicleClass: vehicleClassRaw } = req.query;

    // Multi-service availability: caller passes serviceIds=A,B,C OR
    // a single serviceId. The slot grid reflects the total duration
    // across all selected services (the smart-slot guarantee — every
    // displayed slot has a contiguous block large enough to host the
    // full bundle on a single bay).
    const orderedServiceIds: string[] = (() => {
      if (typeof serviceIdsRaw === "string" && serviceIdsRaw.length > 0) {
        return serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(serviceIdsRaw)) {
        return (serviceIdsRaw as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0);
      }
      if (typeof serviceId === "string" && serviceId.length > 0) return [serviceId];
      return [];
    })();

    if (!date || orderedServiceIds.length === 0) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "date (YYYY-MM-DD) and serviceIds (or serviceId) are required",
      });
      return;
    }

    const vehicleClass = normalizeVehicleClass(vehicleClassRaw as string | null | undefined);

    const location = await prisma.location.findUnique({
      where: { id: req.params.locationId as string },
      include: { provider: { select: { isActive: true } } },
    });

    if (!location || !location.isVisible || !location.provider.isActive) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found or not available" });
      return;
    }

    const services = await prisma.service.findMany({
      where: { id: { in: orderedServiceIds }, locationId: location.id, isVisible: true },
    });

    if (services.length !== orderedServiceIds.length) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "One or more services not found at this location" });
      return;
    }

    // Preserve caller's service order so the snapshot ordering on
    // the resulting hold matches the driver's pick order.
    const servicesById = new Map(services.map((s) => [s.id, s]));
    const orderedServices = orderedServiceIds.map((id) => servicesById.get(id)!);
    // Single-service callers still expect `service` (back-compat with
    // the prior contract); set it to the first ordered service.
    const service = orderedServices[0];

    const dateStr = date as string;
    const tz = location.timezone;

    const localInfo = getLocalTimeInfo(new Date(`${dateStr}T12:00:00Z`), tz);
    const dayOfWeek = localInfo.dayOfWeek;

    const windows = await prisma.operatingWindow.findMany({
      where: { locationId: location.id, dayOfWeek },
      orderBy: { openTime: "asc" },
    });

    if (windows.length === 0) {
      res.json({ date: dateStr, slots: [], message: "Location is closed on this day" });
      return;
    }

    // Total slot duration is the SUM of every selected service's
    // duration, class-aware when the caller specifies a vehicle. Each
    // displayed slot has a contiguous block this large on a single
    // compatible bay — the smart-slot guarantee for multi-service
    // bundles. The buffer (currently 0) is layered on top so future
    // tuning never eats into the operational gap between bookings.
    const effectiveClass: VehicleClass = vehicleClass || "MEDIUM";
    const perServiceDurations = await Promise.all(
      orderedServices.map(async (s) => {
        if (vehicleClass) {
          const d = await resolveServiceDuration(prisma, s.id, effectiveClass);
          return d ?? s.durationMins;
        }
        return s.durationMins;
      })
    );
    const slotDuration = perServiceDurations.reduce((a, b) => a + b, 0);

    const slots: Array<{
      startTime: string;
      endTime: string;
      startUtc: string;
      endUtc: string;
      available: boolean;
      shortNotice?: boolean;
      reason?: string;
    }> = [];
    const now = new Date();
    const shortNoticeCutoff = now.getTime() + SHORT_NOTICE_THRESHOLD_MINUTES * 60 * 1000;

    for (const window of windows) {
      const [openH, openM] = window.openTime.split(":").map(Number);
      const [closeH, closeM] = window.closeTime.split(":").map(Number);

      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      for (let slotStart = openMinutes; slotStart + slotDuration <= closeMinutes; slotStart += slotDuration) {
        const startH = Math.floor(slotStart / 60);
        const startM = slotStart % 60;
        const endMin = slotStart + slotDuration;
        const endH = Math.floor(endMin / 60);
        const endM = endMin % 60;

        const startTime = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
        const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        const slotStartUtc = localTimeToUtc(dateStr, startTime, tz);
        const slotEndUtc = localTimeToUtc(dateStr, endTime, tz);

        // Past slots are not bookable. There is no hard lead-time block: any
        // future slot is bookable. Slots that start within
        // SHORT_NOTICE_THRESHOLD_MINUTES are flagged so the UI prompts a
        // confirmation, but the server never refuses on lead-time alone.
        if (slotStartUtc.getTime() <= now.getTime()) {
          slots.push({ startTime, endTime, startUtc: slotStartUtc.toISOString(), endUtc: slotEndUtc.toISOString(), available: false, reason: "PAST" });
          continue;
        }
        const isShortNotice = slotStartUtc.getTime() < shortNoticeCutoff;

        // Drive slot availability off bay occupancy, not per-service capacity.
        // When the caller supplies a vehicleClass we filter precisely; when
        // they don't, we check whether ANY supported class has a free bay —
        // the driver still can't see a slot that zero bays can host.
        let bayFree: { id: string } | null = null;
        if (vehicleClass) {
          bayFree = await findAvailableBayTx(prisma, {
            locationId: location.id,
            vehicleClass,
            startUtc: slotStartUtc,
            durationMins: slotDuration,
          });
        } else {
          const classesToTry: VehicleClass[] = ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"];
          for (const c of classesToTry) {
            bayFree = await findAvailableBayTx(prisma, {
              locationId: location.id,
              vehicleClass: c,
              startUtc: slotStartUtc,
              durationMins: slotDuration,
            });
            if (bayFree) break;
          }
        }

        slots.push({
          startTime,
          endTime,
          startUtc: slotStartUtc.toISOString(),
          endUtc: slotEndUtc.toISOString(),
          available: !!bayFree,
          shortNotice: bayFree ? isShortNotice : undefined,
          reason: bayFree ? undefined : "NO_BAY_AVAILABLE",
        });
      }
    }

    res.json({
      date: dateStr,
      locationId: location.id,
      serviceId: service.id,
      serviceName: service.name,
      durationMins: slotDuration,
      vehicleClass: vehicleClass || null,
      slots,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to check availability");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to check availability" });
  }
});

export default router;
