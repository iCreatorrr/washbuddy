import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { getLocalTimeInfo, localTimeToUtc } from "../lib/timezone";
import {
  findAvailableBayTx,
  normalizeVehicleClass,
  resolveServiceDuration,
  type VehicleClass,
} from "../lib/bayMatching";

const router: IRouter = Router();

router.get("/locations/:locationId/availability", async (req, res) => {
  try {
    const { date, serviceId, vehicleClass: vehicleClassRaw } = req.query;

    if (!date || !serviceId) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "date (YYYY-MM-DD) and serviceId are required",
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

    const service = await prisma.service.findFirst({
      where: { id: serviceId as string, locationId: location.id, isVisible: true },
    });

    if (!service) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found at this location" });
      return;
    }

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

    // Service duration is class-aware when the caller specifies a vehicle
    // class; otherwise we use the base duration. The driver's availability
    // view typically hits this before the vehicle is picked, in which case
    // the base duration is the most conservative estimate.
    const effectiveClass: VehicleClass = vehicleClass || "MEDIUM";
    const resolvedDuration = vehicleClass
      ? await resolveServiceDuration(prisma, service.id, effectiveClass)
      : service.durationMins;
    const slotDuration = resolvedDuration ?? service.durationMins;

    const slots: Array<{
      startTime: string;
      endTime: string;
      startUtc: string;
      endUtc: string;
      available: boolean;
      reason?: string;
    }> = [];
    const now = new Date();

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

        const leadTimeDeadline = new Date(slotStartUtc.getTime() - service.leadTimeMins * 60 * 1000);
        if (now > leadTimeDeadline) {
          slots.push({ startTime, endTime, startUtc: slotStartUtc.toISOString(), endUtc: slotEndUtc.toISOString(), available: false, reason: "LEAD_TIME_PASSED" });
          continue;
        }

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
