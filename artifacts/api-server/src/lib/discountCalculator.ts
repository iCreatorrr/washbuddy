/**
 * Discount eligibility engine — checks which provider discounts apply to a booking.
 */
import { prisma } from "@workspace/db";
import { getLocalTimeInfo } from "./timezone";

export interface ApplicableDiscount {
  id: string;
  name: string;
  discountType: string;
  percentOff: number | null;
  flatAmountOff: number | null;
  isStackable: boolean;
}

export async function getApplicableDiscounts(params: {
  providerId: string;
  locationId: string;
  scheduledStartAtUtc: Date;
  locationTimezone: string;
  fleetId?: string;
  customerId: string;
}): Promise<ApplicableDiscount[]> {
  const discounts = await prisma.providerDiscount.findMany({
    where: { providerId: params.providerId, isActive: true, OR: [{ locationId: params.locationId }, { locationId: null }] },
  });

  const applicable: ApplicableDiscount[] = [];
  const local = getLocalTimeInfo(params.scheduledStartAtUtc, params.locationTimezone);
  const currentMinutes = local.hours * 60 + local.minutes;

  for (const d of discounts) {
    let qualifies = false;

    if (d.discountType === "OFF_PEAK") {
      if (d.peakStartTime && d.peakEndTime && d.peakDaysOfWeek.includes(local.dayOfWeek)) {
        const [startH, startM] = d.peakStartTime.split(":").map(Number);
        const [endH, endM] = d.peakEndTime.split(":").map(Number);
        const peakStart = startH * 60 + startM;
        const peakEnd = endH * 60 + endM;
        qualifies = currentMinutes >= peakStart && currentMinutes < peakEnd;
      }
    } else if (d.discountType === "VOLUME" && params.fleetId) {
      const periodStart = new Date(Date.now() - (d.volumePeriodDays || 30) * 86400000);
      const count = await prisma.booking.count({
        where: {
          vehicle: { fleetId: params.fleetId },
          location: { providerId: params.providerId },
          status: { in: ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"] as any },
          scheduledStartAtUtc: { gte: periodStart },
        },
      });
      qualifies = count >= (d.volumeThreshold || 0);
    } else if (d.discountType === "FIRST_TIME") {
      const profile = await prisma.clientProfile.findFirst({
        where: { providerId: params.providerId, userId: params.customerId },
        select: { visitCount: true },
      });
      qualifies = !profile || profile.visitCount === 0;
    }

    if (qualifies) {
      applicable.push({
        id: d.id, name: d.name, discountType: d.discountType,
        percentOff: d.percentOff, flatAmountOff: d.flatAmountOff, isStackable: d.isStackable,
      });
    }
  }

  return applicable;
}
