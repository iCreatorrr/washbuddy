/**
 * Given a location, service, and vehicle class, find the next slot (after a
 * reference start) where at least one compatible bay is free. Used to power
 * the `nextAvailableSlot` field on SLOT_JUST_TAKEN responses.
 *
 * This is a lightweight reimplementation of the slot-generation loop in
 * availability.ts — keeping it separate avoids a circular import between
 * the availability route and the bay-matching helper.
 */

import { findAvailableBayTx, type VehicleClass } from "./bayMatching";
import { getLocalTimeInfo, localTimeToUtc, formatLocalDate } from "./timezone";

export interface NextSlotResult {
  startUtc: string;
  endUtc: string;
  startTime: string;
}

/**
 * Walk forward up to `horizonDays` days of operating windows to find the
 * first slot matching the requested service duration where a compatible bay
 * is free. Returns null if nothing is bookable within the horizon.
 */
export async function findNextAvailableSlot(
  tx: any,
  params: {
    locationId: string;
    serviceId: string;
    vehicleClass: VehicleClass;
    durationMins: number;
    afterUtc: Date;
    horizonDays?: number;
  },
): Promise<NextSlotResult | null> {
  const { locationId, vehicleClass, durationMins, afterUtc } = params;
  const horizonDays = params.horizonDays ?? 14;

  const location = await tx.location.findUnique({
    where: { id: locationId },
    select: {
      timezone: true,
      operatingWindows: { select: { dayOfWeek: true, openTime: true, closeTime: true } },
    },
  });
  if (!location || location.operatingWindows.length === 0) return null;

  const service = await tx.service.findUnique({ where: { id: params.serviceId }, select: { leadTimeMins: true } });
  const leadTimeMins = service?.leadTimeMins ?? 0;

  const tz = location.timezone;
  const now = new Date();

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    const dayUtc = new Date(afterUtc.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = formatLocalDate(dayUtc, tz);
    const dayInfo = getLocalTimeInfo(dayUtc, tz);

    const windows = location.operatingWindows
      .filter((w: { dayOfWeek: number }) => w.dayOfWeek === dayInfo.dayOfWeek)
      .sort((a: { openTime: string }, b: { openTime: string }) => a.openTime.localeCompare(b.openTime));

    for (const w of windows) {
      const [openH, openM] = w.openTime.split(":").map(Number);
      const [closeH, closeM] = w.closeTime.split(":").map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      for (let slotStart = openMinutes; slotStart + durationMins <= closeMinutes; slotStart += durationMins) {
        const startH = Math.floor(slotStart / 60);
        const startM = slotStart % 60;
        const endMin = slotStart + durationMins;
        const endH = Math.floor(endMin / 60);
        const endM = endMin % 60;
        const startTime = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
        const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        const startUtc = localTimeToUtc(dateStr, startTime, tz);
        const endUtc = localTimeToUtc(dateStr, endTime, tz);

        if (startUtc.getTime() <= afterUtc.getTime()) continue;
        if (startUtc.getTime() < now.getTime() + leadTimeMins * 60 * 1000) continue;

        const bay = await findAvailableBayTx(tx, { locationId, vehicleClass, startUtc, durationMins });
        if (bay) {
          return {
            startUtc: startUtc.toISOString(),
            endUtc: endUtc.toISOString(),
            startTime,
          };
        }
      }
    }
  }

  return null;
}
