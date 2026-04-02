import { PrismaClient, BookingStatus } from "@prisma/client";
import crypto from "crypto";
import { SEED_VERSION, MASTER_SEED, SERVICE_TEMPLATES } from "../config.js";
import { REGIONS } from "../regions.js";
import { SeededRandom } from "../generators/seed-random.js";
import { DECLINE_REASONS, CANCELLATION_REASONS, BOOKING_TIME_SLOTS } from "../templates/bookings.js";

const prisma = new PrismaClient();

type SeedTimeMode = "rolling" | "fixed";

interface FutureBookingConfig {
  timeMode: SeedTimeMode;
  fixedReferenceUtc?: Date;
  horizonDays: number;
  locationBookingPercent: [number, number];
  bookingsPerLocationDay: [number, number];
  urgencyLocationsPerMetro: number;
  urgency30minCount: number;
  urgency60minCount: number;
}

const DEFAULT_CONFIG: FutureBookingConfig = {
  timeMode: "rolling",
  horizonDays: 30,
  locationBookingPercent: [75, 80],
  bookingsPerLocationDay: [2, 8],
  urgencyLocationsPerMetro: 2,
  urgency30minCount: 1,
  urgency60minCount: 1,
};

const FUTURE_STATUS_DISTRIBUTION: Record<string, number> = {
  PROVIDER_CONFIRMED: 0.50,
  HELD: 0.15,
  REQUESTED: 0.15,
  PROVIDER_DECLINED: 0.08,
  CUSTOMER_CANCELLED: 0.07,
  EXPIRED: 0.05,
};

const SERVICE_MIX_WEIGHTS: Record<string, number> = {
  "Exterior Bus Wash": 0.30,
  "Quick Rinse": 0.25,
  "Fleet Express Wash": 0.20,
  "Interior Sanitization": 0.15,
  "Full Detail Wash": 0.10,
};

interface LocationWithServices {
  id: string;
  timezone: string;
  regionCode: string;
  operatingWindows: { dayOfWeek: number; openTime: string; closeTime: string }[];
  services: {
    id: string;
    name: string;
    durationMins: number;
    basePriceMinor: number;
    platformFeeMinor: number;
    capacityPerSlot: number;
    currencyCode: string;
    leadTimeMins: number;
    requiresConfirmation: boolean;
  }[];
  bookingBufferMins: number;
}

function getReferenceTime(config: FutureBookingConfig): Date {
  if (config.timeMode === "fixed" && config.fixedReferenceUtc) {
    return config.fixedReferenceUtc;
  }
  return new Date();
}

function getLocalDate(utcDate: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(utcDate);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    hour: parseInt(get("hour")),
    minute: parseInt(get("minute")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}

function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const dtStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const target = new Date(dtStr + "Z");
  const localParts = formatter.formatToParts(target);
  const get = (type: string) => parseInt(localParts.find((p) => p.type === type)?.value || "0");

  const localH = get("hour");
  const localM = get("minute");
  const targetMins = hour * 60 + minute;
  const currentMins = localH * 60 + localM;
  const diffMs = (targetMins - currentMins) * 60 * 1000;

  return new Date(target.getTime() + diffMs);
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hour: h, minute: m };
}

function isWithinOperatingWindow(
  loc: LocationWithServices,
  dayOfWeek: number,
  hour: number,
  minute: number,
  durationMins: number
): boolean {
  const window = loc.operatingWindows.find((w) => w.dayOfWeek === dayOfWeek);
  if (!window) return false;
  const open = parseTime(window.openTime);
  const close = parseTime(window.closeTime);
  const startMins = hour * 60 + minute;
  const endMins = startMins + durationMins;
  const openMins = open.hour * 60 + open.minute;
  const closeMins = close.hour * 60 + close.minute;
  return startMins >= openMins && endMins <= closeMins;
}

async function loadLocationData(): Promise<Map<string, LocationWithServices[]>> {
  const regionMap = new Map<string, LocationWithServices[]>();

  for (const region of REGIONS) {
    const locations = await prisma.location.findMany({
      where: {
        isVisible: true,
        provider: { isActive: true },
        latitude: { gte: region.bbox.minLat, lte: region.bbox.maxLat },
        longitude: { gte: region.bbox.minLng, lte: region.bbox.maxLng },
      },
      orderBy: { id: "asc" },
      include: {
        operatingWindows: { orderBy: { id: "asc" } },
        services: {
          where: { isVisible: true },
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            durationMins: true,
            basePriceMinor: true,
            platformFeeMinor: true,
            capacityPerSlot: true,
            currencyCode: true,
            leadTimeMins: true,
            requiresConfirmation: true,
          },
        },
      },
    });

    const mapped: LocationWithServices[] = locations.map((loc) => ({
      id: loc.id,
      timezone: loc.timezone,
      regionCode: region.code,
      operatingWindows: loc.operatingWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        openTime: w.openTime,
        closeTime: w.closeTime,
      })),
      services: loc.services,
      bookingBufferMins: loc.bookingBufferMins ?? 10,
    }));

    regionMap.set(region.code, mapped);
  }

  return regionMap;
}

async function loadAvailableCustomersAndVehicles(): Promise<{
  customers: { id: string }[];
  vehicles: { id: string; fleetId: string | null }[];
}> {
  const customers = await prisma.user.findMany({
    where: { isActive: true, email: { contains: "@washbuddy" } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 500,
  });

  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true, licensePlate: { startsWith: "DEMO" } },
    select: { id: true, fleetId: true },
    orderBy: { id: "asc" },
    take: 500,
  });

  return { customers, vehicles };
}

interface SlotTracker {
  counts: Map<string, number>;
  getCount(locationId: string, serviceId: string, slotKey: string): number;
  increment(locationId: string, serviceId: string, slotKey: string): void;
}

function createSlotTracker(): SlotTracker {
  const counts = new Map<string, number>();
  const key = (locId: string, svcId: string, slot: string) => `${locId}|${svcId}|${slot}`;
  return {
    counts,
    getCount(locId, svcId, slot) {
      return counts.get(key(locId, svcId, slot)) || 0;
    },
    increment(locId, svcId, slot) {
      const k = key(locId, svcId, slot);
      counts.set(k, (counts.get(k) || 0) + 1);
    },
  };
}

function pickServiceWeighted(services: LocationWithServices["services"], rng: SeededRandom): LocationWithServices["services"][0] {
  const weighted = services.map((s) => ({
    service: s,
    weight: SERVICE_MIX_WEIGHTS[s.name] || 0.1,
  }));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = rng.next() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.service;
  }
  return weighted[weighted.length - 1].service;
}

function pickFutureStatus(rng: SeededRandom): BookingStatus {
  return rng.pickFromDistribution(FUTURE_STATUS_DISTRIBUTION) as BookingStatus;
}

async function main() {
  const timeModeArg = (process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] || "rolling") as SeedTimeMode;
  const fixedRefArg = process.argv.find((a) => a.startsWith("--ref="))?.split("=")[1];
  const dryRun = process.argv.includes("--dry-run");

  const config: FutureBookingConfig = {
    ...DEFAULT_CONFIG,
    timeMode: timeModeArg,
    fixedReferenceUtc: fixedRefArg ? new Date(fixedRefArg) : undefined,
  };

  const now = getReferenceTime(config);
  const batchId = `seed-future-bookings-v${SEED_VERSION}-${config.timeMode}-${Date.now()}`;

  console.log(`\n═══ WashBuddy Future Booking Seed ═══`);
  console.log(`Mode: ${config.timeMode}`);
  console.log(`Reference: ${now.toISOString()}`);
  console.log(`Horizon: ${config.horizonDays} days`);
  console.log(`Batch: ${batchId}`);
  if (dryRun) console.log(`DRY RUN — no records will be created`);
  console.log();

  const rng = new SeededRandom(MASTER_SEED ^ 0x46555455); // "FUTU" in hex

  const regionLocations = await loadLocationData();
  const { customers, vehicles } = await loadAvailableCustomersAndVehicles();

  if (customers.length === 0) {
    console.error("No demo customers found. Run the base seed first.");
    process.exit(1);
  }
  if (vehicles.length === 0) {
    console.error("No demo vehicles found. Run the base seed first.");
    process.exit(1);
  }

  const registryBuffer: {
    tableName: string;
    recordId: string;
    seedBatchId: string;
    seedMode: string;
    seedRegionCode?: string;
    demoScenarioCode?: string;
  }[] = [];

  function track(tableName: string, recordId: string, regionCode?: string, scenarioCode?: string) {
    registryBuffer.push({
      tableName,
      recordId,
      seedBatchId: batchId,
      seedMode: `future-${config.timeMode}`,
      seedRegionCode: regionCode || (null as any),
      demoScenarioCode: scenarioCode || (null as any),
    });
  }

  const slotTracker = createSlotTracker();
  let totalBookings = 0;
  let totalHolds = 0;
  let totalHistory = 0;
  const metroUrgencyStats: Record<string, { locations: Set<string>; within30: number; within60: number }> = {};

  for (const region of REGIONS) {
    metroUrgencyStats[region.code] = { locations: new Set(), within30: 0, within60: 0 };
  }

  console.log("Phase 1: Generating calendar bookings (30-day horizon)...\n");

  for (const region of REGIONS) {
    const locations = regionLocations.get(region.code) || [];
    if (locations.length === 0) {
      console.log(`  [${region.code}] No locations found — skipping`);
      continue;
    }

    const regionRng = rng.fork(`future-${region.code}`);
    const bookingPercent = regionRng.int(config.locationBookingPercent[0], config.locationBookingPercent[1]);
    const locationsToBook = Math.max(2, Math.ceil((locations.length * bookingPercent) / 100));
    const selectedLocations = regionRng.sample(locations, locationsToBook);

    let regionBookings = 0;
    const regionCreatedBookingIds: string[] = [];

    for (const loc of selectedLocations) {
      if (loc.services.length === 0) continue;

      const locRng = regionRng.fork(`loc-${loc.id}`);

      for (let dayOffset = 0; dayOffset < config.horizonDays; dayOffset++) {
        const dayDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const local = getLocalDate(dayDate, loc.timezone);
        const window = loc.operatingWindows.find((w) => w.dayOfWeek === local.dayOfWeek);
        if (!window) continue;

        const dayRng = locRng.fork(`day-${dayOffset}`);
        const bookingsToday = dayRng.int(config.bookingsPerLocationDay[0], config.bookingsPerLocationDay[1]);

        const open = parseTime(window.openTime);
        const close = parseTime(window.closeTime);
        const openMins = open.hour * 60 + open.minute;
        const closeMins = close.hour * 60 + close.minute;
        if (closeMins <= openMins) continue;

        for (let bi = 0; bi < bookingsToday; bi++) {
          const slotRng = dayRng.fork(`slot-${bi}`);
          const service = pickServiceWeighted(loc.services, slotRng);

          const latestStart = closeMins - service.durationMins;
          if (latestStart <= openMins) continue;

          const rawStartMins = slotRng.int(openMins, latestStart);
          const startMins = Math.round(rawStartMins / 15) * 15;
          const startHour = Math.floor(startMins / 60);
          const startMinute = startMins % 60;

          if (!isWithinOperatingWindow(loc, local.dayOfWeek, startHour, startMinute, service.durationMins)) continue;

          const slotKey = `${local.year}-${local.month}-${local.day}-${startHour}:${startMinute}`;
          if (slotTracker.getCount(loc.id, service.id, slotKey) >= service.capacityPerSlot) continue;

          const scheduledStartUtc = localTimeToUtc(local.year, local.month, local.day, startHour, startMinute, loc.timezone);
          const scheduledEndUtc = new Date(scheduledStartUtc.getTime() + service.durationMins * 60 * 1000);

          if (scheduledStartUtc <= now) continue;

          const status = pickFutureStatus(slotRng);
          const customer = slotRng.pick(customers);
          const vehicle = slotRng.pick(vehicles);

          const totalPrice = service.basePriceMinor + service.platformFeeMinor;
          const taxAmount = Math.round(totalPrice * 0.13);
          const idempotencyKey = crypto.createHash("sha256")
            .update(`${batchId}|${loc.id}|${service.id}|${scheduledStartUtc.toISOString()}|${bi}`)
            .digest("hex")
            .slice(0, 32);

          const createdAt = new Date(scheduledStartUtc.getTime() - slotRng.int(1, 72) * 60 * 60 * 1000);
          const responseDeadline = new Date(scheduledStartUtc.getTime() - 60 * 60 * 1000);

          const bookingData: any = {
            locationId: loc.id,
            serviceId: service.id,
            customerId: customer.id,
            vehicleId: vehicle.id,
            status,
            idempotencyKey,
            serviceNameSnapshot: service.name,
            serviceBasePriceMinor: service.basePriceMinor,
            platformFeeMinor: service.platformFeeMinor,
            totalPriceMinor: totalPrice,
            taxAmountMinor: taxAmount,
            currencyCode: service.currencyCode,
            locationTimezone: loc.timezone,
            scheduledStartAtUtc: scheduledStartUtc,
            scheduledEndAtUtc: scheduledEndUtc,
            providerResponseDeadlineUtc: responseDeadline,
            createdAt,
          };

          if (status === "PROVIDER_DECLINED") {
            bookingData.declineReasonCode = slotRng.pick(DECLINE_REASONS);
          }
          if (status === "CUSTOMER_CANCELLED") {
            bookingData.cancellationReasonCode = slotRng.pick(CANCELLATION_REASONS);
          }

          if (!dryRun) {
            try {
              const booking = await prisma.booking.create({ data: bookingData });
              track("bookings", booking.id, region.code, `future-calendar`);

              const historyEntries: { bookingId: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; reason: string | null; createdAt: Date }[] = [
                { bookingId: booking.id, fromStatus: null, toStatus: "REQUESTED" as BookingStatus, reason: null, createdAt },
              ];

              if (status === "HELD" || status === "PROVIDER_CONFIRMED") {
                historyEntries.push({
                  bookingId: booking.id,
                  fromStatus: "REQUESTED" as BookingStatus,
                  toStatus: "HELD" as BookingStatus,
                  reason: null,
                  createdAt: new Date(createdAt.getTime() + 60000),
                });
              }

              if (status === "PROVIDER_CONFIRMED") {
                historyEntries.push({
                  bookingId: booking.id,
                  fromStatus: "HELD" as BookingStatus,
                  toStatus: "PROVIDER_CONFIRMED" as BookingStatus,
                  reason: null,
                  createdAt: new Date(createdAt.getTime() + 120000),
                });
              }

              if (status === "PROVIDER_DECLINED") {
                historyEntries.push({
                  bookingId: booking.id,
                  fromStatus: "REQUESTED" as BookingStatus,
                  toStatus: "PROVIDER_DECLINED" as BookingStatus,
                  reason: bookingData.declineReasonCode,
                  createdAt: new Date(createdAt.getTime() + 300000),
                });
              }

              if (status === "CUSTOMER_CANCELLED") {
                historyEntries.push({
                  bookingId: booking.id,
                  fromStatus: "REQUESTED" as BookingStatus,
                  toStatus: "CUSTOMER_CANCELLED" as BookingStatus,
                  reason: bookingData.cancellationReasonCode,
                  createdAt: new Date(createdAt.getTime() + 600000),
                });
              }

              if (status === "EXPIRED") {
                historyEntries.push({
                  bookingId: booking.id,
                  fromStatus: "REQUESTED" as BookingStatus,
                  toStatus: "EXPIRED" as BookingStatus,
                  reason: "Hold expired",
                  createdAt: new Date(createdAt.getTime() + 900000),
                });
              }

              await prisma.bookingStatusHistory.createMany({ data: historyEntries });
              totalHistory += historyEntries.length;
              regionCreatedBookingIds.push(booking.id);

              if (status === "HELD") {
                const hold = await prisma.bookingHold.create({
                  data: {
                    locationId: loc.id,
                    serviceId: service.id,
                    slotStartAtUtc: scheduledStartUtc,
                    slotEndAtUtc: scheduledEndUtc,
                    expiresAtUtc: new Date(scheduledStartUtc.getTime() + 10 * 60 * 1000),
                    bookingId: booking.id,
                    requestId: `demo-hold-${idempotencyKey}`,
                    userId: customer.id,
                    isReleased: false,
                  },
                });
                track("booking_holds", hold.id, region.code);
                totalHolds++;
              }

              slotTracker.increment(loc.id, service.id, slotKey);
              regionBookings++;
              totalBookings++;
            } catch (err: any) {
              if (err.code === "P2002") continue;
              throw err;
            }
          } else {
            slotTracker.increment(loc.id, service.id, slotKey);
            regionBookings++;
            totalBookings++;
          }
        }
      }
    }

    if (!dryRun && regionCreatedBookingIds.length > 0) {
      const CHUNK = 500;
      for (let ci = 0; ci < regionCreatedBookingIds.length; ci += CHUNK) {
        const chunk = regionCreatedBookingIds.slice(ci, ci + CHUNK);
        const historyRows = await prisma.bookingStatusHistory.findMany({
          where: { bookingId: { in: chunk } },
          select: { id: true },
        });
        for (const h of historyRows) {
          track("booking_status_history", h.id, region.code);
        }
      }
    }

    console.log(`  [${region.code}] ${selectedLocations.length}/${locations.length} locations → ${regionBookings} bookings`);
  }

  console.log(`\n  Phase 1 total: ${totalBookings} bookings, ${totalHolds} holds, ${totalHistory} history entries`);

  console.log("\nPhase 2: Metro urgency bookings (near-term)...\n");

  let urgencyBookings = 0;

  for (const region of REGIONS) {
    const locations = regionLocations.get(region.code) || [];
    if (locations.length === 0) continue;

    const urgRng = rng.fork(`urgency-${region.code}`);
    const urgencyLocations = urgRng.sample(
      locations.filter((l) => l.services.length > 0),
      Math.min(config.urgencyLocationsPerMetro, locations.length)
    );

    for (let li = 0; li < urgencyLocations.length; li++) {
      const loc = urgencyLocations[li];
      const locUrgRng = urgRng.fork(`urg-loc-${li}`);

      const offsets = li === 0
        ? [locUrgRng.int(10, 28)]
        : [locUrgRng.int(35, 58)];

      for (const minutesFromNow of offsets) {
        const scheduledStartAtUtc = new Date(now.getTime() + minutesFromNow * 60 * 1000);
        const local = getLocalDate(scheduledStartAtUtc, loc.timezone);

        if (!isWithinOperatingWindow(loc, local.dayOfWeek, local.hour, local.minute, 0)) {
          console.log(`    [${region.code}] Urgency slot at +${minutesFromNow}min outside operating hours — skipping`);
          continue;
        }

        const service = pickServiceWeighted(loc.services, locUrgRng);
        if (!isWithinOperatingWindow(loc, local.dayOfWeek, local.hour, local.minute, service.durationMins)) {
          continue;
        }

        const scheduledEndAtUtc = new Date(scheduledStartAtUtc.getTime() + service.durationMins * 60 * 1000);

        const slotKey = `${local.year}-${local.month}-${local.day}-${local.hour}:${local.minute}`;
        if (slotTracker.getCount(loc.id, service.id, slotKey) >= service.capacityPerSlot) {
          continue;
        }

        const forceStatus: BookingStatus = locUrgRng.bool(0.6) ? "PROVIDER_CONFIRMED" : "HELD";

        const customer = locUrgRng.pick(customers);
        const vehicle = locUrgRng.pick(vehicles);
        const totalPrice = service.basePriceMinor + service.platformFeeMinor;
        const taxAmount = Math.round(totalPrice * 0.13);
        const idempotencyKey = crypto.createHash("sha256")
          .update(`${batchId}|urgency|${loc.id}|${minutesFromNow}|${li}`)
          .digest("hex")
          .slice(0, 32);

        const createdAt = new Date(now.getTime() - locUrgRng.int(30, 180) * 60 * 1000);

        if (!dryRun) {
          try {
            const booking = await prisma.booking.create({
              data: {
                locationId: loc.id,
                serviceId: service.id,
                customerId: customer.id,
                vehicleId: vehicle.id,
                status: forceStatus,
                idempotencyKey,
                serviceNameSnapshot: service.name,
                serviceBasePriceMinor: service.basePriceMinor,
                platformFeeMinor: service.platformFeeMinor,
                totalPriceMinor: totalPrice,
                taxAmountMinor: taxAmount,
                currencyCode: service.currencyCode,
                locationTimezone: loc.timezone,
                scheduledStartAtUtc,
                scheduledEndAtUtc,
                providerResponseDeadlineUtc: new Date(scheduledStartAtUtc.getTime() - 5 * 60 * 1000),
                createdAt,
              },
            });
            track("bookings", booking.id, region.code, `urgency-${minutesFromNow <= 30 ? "30min" : "60min"}`);

            const historyEntries = [
              { bookingId: booking.id, fromStatus: null as BookingStatus | null, toStatus: "REQUESTED" as BookingStatus, reason: null as string | null, createdAt },
              { bookingId: booking.id, fromStatus: "REQUESTED" as BookingStatus, toStatus: "HELD" as BookingStatus, reason: null as string | null, createdAt: new Date(createdAt.getTime() + 30000) },
            ];

            if (forceStatus === "PROVIDER_CONFIRMED") {
              historyEntries.push({
                bookingId: booking.id,
                fromStatus: "HELD" as BookingStatus,
                toStatus: "PROVIDER_CONFIRMED" as BookingStatus,
                reason: null,
                createdAt: new Date(createdAt.getTime() + 60000),
              });
            }

            await prisma.bookingStatusHistory.createMany({ data: historyEntries });
            const createdUrgHistory = await prisma.bookingStatusHistory.findMany({
              where: { bookingId: booking.id },
              select: { id: true },
            });
            for (const h of createdUrgHistory) {
              track("booking_status_history", h.id, region.code, `urgency`);
            }

            if (forceStatus === "HELD") {
              const hold = await prisma.bookingHold.create({
                data: {
                  locationId: loc.id,
                  serviceId: service.id,
                  slotStartAtUtc: scheduledStartAtUtc,
                  slotEndAtUtc: scheduledEndAtUtc,
                  expiresAtUtc: new Date(scheduledStartAtUtc.getTime() + 10 * 60 * 1000),
                  bookingId: booking.id,
                  requestId: `demo-urgency-${idempotencyKey}`,
                  userId: customer.id,
                  isReleased: false,
                },
              });
              track("booking_holds", hold.id, region.code, `urgency`);
            }

            slotTracker.increment(loc.id, service.id, slotKey);
            metroUrgencyStats[region.code].locations.add(loc.id);
            if (minutesFromNow <= 30) metroUrgencyStats[region.code].within30++;
            else metroUrgencyStats[region.code].within60++;

            urgencyBookings++;
            totalBookings++;
          } catch (err: any) {
            if (err.code === "P2002") continue;
            throw err;
          }
        } else {
          slotTracker.increment(loc.id, service.id, slotKey);
          metroUrgencyStats[region.code].locations.add(loc.id);
          if (minutesFromNow <= 30) metroUrgencyStats[region.code].within30++;
          else metroUrgencyStats[region.code].within60++;
          urgencyBookings++;
          totalBookings++;
        }
      }
    }

    const stats = metroUrgencyStats[region.code];
    console.log(`  [${region.code}] ${stats.locations.size} urgency locations, ≤30min: ${stats.within30}, ≤60min: ${stats.within60}`);
  }

  console.log(`\n  Phase 2 total: ${urgencyBookings} urgency bookings`);

  if (!dryRun) {
    console.log("\nPhase 3: Writing registry...");
    const BATCH_SIZE = 500;
    for (let i = 0; i < registryBuffer.length; i += BATCH_SIZE) {
      const batch = registryBuffer.slice(i, i + BATCH_SIZE);
      await prisma.demoDataRegistry.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
    console.log(`  ${registryBuffer.length} registry entries written`);
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`  Total bookings: ${totalBookings}`);
  console.log(`  Time mode: ${config.timeMode}`);
  console.log(`  Reference: ${now.toISOString()}`);
  console.log(`  Batch: ${batchId}`);
  console.log();

  console.log(`  Metro Urgency Compliance:`);
  let allPass = true;
  for (const region of REGIONS) {
    const stats = metroUrgencyStats[region.code];
    const locPass = stats.locations.size >= config.urgencyLocationsPerMetro;
    const t30Pass = stats.within30 >= config.urgency30minCount;
    const t60Pass = stats.within60 >= config.urgency60minCount;
    const pass = locPass && t30Pass && t60Pass;
    if (!pass) allPass = false;
    console.log(`    [${region.code}] locs=${stats.locations.size}/${config.urgencyLocationsPerMetro} 30m=${stats.within30}/${config.urgency30minCount} 60m=${stats.within60}/${config.urgency60minCount} ${pass ? "✅" : "❌"}`);
  }
  console.log(`\n  ${allPass ? "✅ All metros pass urgency requirements" : "❌ Some metros failed urgency requirements"}`);
  console.log(`\n✅ Future booking seed complete!\n`);
}

main()
  .catch((e) => {
    console.error("Future booking seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
