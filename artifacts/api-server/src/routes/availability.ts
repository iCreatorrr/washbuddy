import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";

const router: IRouter = Router();

router.get("/locations/:locationId/availability", async (req, res) => {
  try {
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "date (YYYY-MM-DD) and serviceId are required",
      });
      return;
    }

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
    const jsDate = new Date(dateStr + "T00:00:00");
    const dayOfWeek = jsDate.getUTCDay();

    const windows = await prisma.operatingWindow.findMany({
      where: { locationId: location.id, dayOfWeek },
      orderBy: { openTime: "asc" },
    });

    if (windows.length === 0) {
      res.json({ date: dateStr, slots: [], message: "Location is closed on this day" });
      return;
    }

    const slots: Array<{
      startTime: string;
      endTime: string;
      startUtc: string;
      endUtc: string;
      available: boolean;
      remainingCapacity: number;
    }> = [];

    const slotDuration = service.durationMins;
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

        const slotStartUtc = new Date(`${dateStr}T${startTime}:00Z`);
        const slotEndUtc = new Date(`${dateStr}T${endTime}:00Z`);

        const leadTimeDeadline = new Date(slotStartUtc.getTime() - service.leadTimeMins * 60 * 1000);
        const tooLate = now > leadTimeDeadline;

        const existingBookings = await prisma.booking.count({
          where: {
            locationId: location.id,
            serviceId: service.id,
            scheduledStartAtUtc: slotStartUtc,
            status: {
              notIn: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "EXPIRED", "NO_SHOW", "REFUNDED"],
            },
          },
        });

        const activeHolds = await prisma.bookingHold.count({
          where: {
            locationId: location.id,
            serviceId: service.id,
            slotStartAtUtc: slotStartUtc,
            bookingId: null,
            isReleased: false,
            expiresAtUtc: { gt: now },
          },
        });

        const usedCapacity = existingBookings + activeHolds;
        const remaining = Math.max(0, service.capacityPerSlot - usedCapacity);

        slots.push({
          startTime,
          endTime,
          startUtc: slotStartUtc.toISOString(),
          endUtc: slotEndUtc.toISOString(),
          available: remaining > 0 && !tooLate,
          remainingCapacity: remaining,
        });
      }
    }

    res.json({
      date: dateStr,
      locationId: location.id,
      serviceId: service.id,
      serviceName: service.name,
      durationMins: service.durationMins,
      slots,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to check availability");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to check availability" });
  }
});

export default router;
