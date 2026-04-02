import { PrismaClient } from "@prisma/client";
import { REGIONS } from "../regions.js";

const prisma = new PrismaClient();

interface ValidationResult {
  rule: string;
  pass: boolean;
  details: string;
}

async function main() {
  const batchFilter = process.argv[2];

  console.log(`\n═══ WashBuddy Future Booking Validation ═══`);
  if (batchFilter) console.log(`Filter: batch = ${batchFilter}`);
  console.log();

  const results: ValidationResult[] = [];

  const registryWhere = batchFilter
    ? { seedBatchId: batchFilter, seedMode: { startsWith: "future-" } }
    : { seedMode: { startsWith: "future-" } };

  const registryEntries = await prisma.demoDataRegistry.findMany({
    where: registryWhere,
    select: { tableName: true, recordId: true, seedRegionCode: true, demoScenarioCode: true },
  });

  const bookingIds = registryEntries
    .filter((e) => e.tableName === "bookings")
    .map((e) => e.recordId);

  console.log(`Found ${bookingIds.length} future-seeded bookings in registry.\n`);

  if (bookingIds.length === 0) {
    console.log("❌ No future bookings found. Run seed-future-bookings first.\n");
    process.exit(1);
  }

  results.push({
    rule: "Registry populated",
    pass: bookingIds.length > 0,
    details: `${bookingIds.length} bookings tracked`,
  });

  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    include: {
      location: { include: { operatingWindows: true } },
      service: true,
    },
  });

  results.push({
    rule: "All registry bookings exist in DB",
    pass: bookings.length === bookingIds.length,
    details: `${bookings.length}/${bookingIds.length} found`,
  });

  let invalidRelationships = 0;
  for (const b of bookings) {
    if (!b.location) invalidRelationships++;
    if (!b.service) invalidRelationships++;
    if (!b.customerId) invalidRelationships++;
  }
  results.push({
    rule: "All relationships valid (location, service, customer)",
    pass: invalidRelationships === 0,
    details: `${invalidRelationships} invalid relationships`,
  });

  let outsideHours = 0;
  for (const b of bookings) {
    if (!b.location || b.location.operatingWindows.length === 0) continue;

    const local = getLocalDate(b.scheduledStartAtUtc, b.locationTimezone);
    const window = b.location.operatingWindows.find((w) => w.dayOfWeek === local.dayOfWeek);

    if (!window) {
      if (["PROVIDER_CONFIRMED", "HELD", "REQUESTED"].includes(b.status)) {
        outsideHours++;
      }
      continue;
    }

    const [openH, openM] = window.openTime.split(":").map(Number);
    const [closeH, closeM] = window.closeTime.split(":").map(Number);
    const startMins = local.hour * 60 + local.minute;
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    if (startMins < openMins || startMins >= closeMins) {
      if (["PROVIDER_CONFIRMED", "HELD", "REQUESTED"].includes(b.status)) {
        outsideHours++;
      }
    }
  }
  results.push({
    rule: "Active bookings within operating hours",
    pass: outsideHours === 0,
    details: `${outsideHours} bookings outside hours`,
  });

  const statusCounts: Record<string, number> = {};
  for (const b of bookings) {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  }

  const activeStatuses = ["PROVIDER_CONFIRMED", "HELD", "REQUESTED"];
  const activeCount = activeStatuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
  const activePercent = Math.round((activeCount / bookings.length) * 100);
  results.push({
    rule: "Status distribution realistic (>60% active)",
    pass: activePercent > 60,
    details: `${activePercent}% active. Distribution: ${JSON.stringify(statusCounts)}`,
  });

  const now = new Date();
  const futureBookings = bookings.filter((b) => b.scheduledStartAtUtc > now);
  results.push({
    rule: "Bookings are future-dated",
    pass: futureBookings.length > 0,
    details: `${futureBookings.length}/${bookings.length} are future-dated`,
  });

  const locRegionMap = new Map<string, string>();
  for (const entry of registryEntries) {
    if (entry.tableName === "bookings" && entry.seedRegionCode) {
      const booking = bookings.find((b) => b.id === entry.recordId);
      if (booking) locRegionMap.set(booking.locationId, entry.seedRegionCode);
    }
  }

  console.log("Metro Urgency Validation:");
  let urgencyPass = true;
  let metrosWithLocations = 0;
  let metrosPassingUrgency = 0;

  for (const region of REGIONS) {
    const regionLocationCount = await prisma.location.count({
      where: {
        isVisible: true,
        latitude: { gte: region.bbox.minLat, lte: region.bbox.maxLat },
        longitude: { gte: region.bbox.minLng, lte: region.bbox.maxLng },
      },
    });

    if (regionLocationCount === 0) {
      console.log(`  [${region.code}] No locations seeded — skipped`);
      continue;
    }

    metrosWithLocations++;

    const urgencyEntries = registryEntries.filter(
      (e) => e.tableName === "bookings" && e.seedRegionCode === region.code && e.demoScenarioCode?.startsWith("urgency-")
    );

    const urgencyBookingIds = urgencyEntries.map((e) => e.recordId);
    const urgencyBookings = bookings.filter((b) => urgencyBookingIds.includes(b.id));

    const uniqueLocations = new Set(urgencyBookings.map((b) => b.locationId));
    const within30 = urgencyEntries.filter((e) => e.demoScenarioCode === "urgency-30min").length;
    const within60 = urgencyEntries.filter((e) => e.demoScenarioCode === "urgency-60min").length;

    const locPass = uniqueLocations.size >= 2;
    const t30Pass = within30 >= 1;
    const t60Pass = within60 >= 1;
    const pass = locPass && t30Pass && t60Pass;

    if (!pass) urgencyPass = false;
    else metrosPassingUrgency++;

    console.log(`  [${region.code}] locs=${uniqueLocations.size}/2 30m=${within30}/1 60m=${within60}/1 ${pass ? "✅" : "⚠️"}`);
  }

  results.push({
    rule: "Metro urgency requirements met (seeded metros)",
    pass: urgencyPass && metrosWithLocations > 0,
    details: `${metrosPassingUrgency}/${metrosWithLocations} seeded metros pass`,
  });

  const regionBookingCounts: Record<string, number> = {};
  for (const entry of registryEntries) {
    if (entry.tableName === "bookings" && entry.seedRegionCode) {
      regionBookingCounts[entry.seedRegionCode] = (regionBookingCounts[entry.seedRegionCode] || 0) + 1;
    }
  }

  let densityPass = true;
  let metrosWithDensity = 0;
  console.log("\nCalendar Density:");
  for (const region of REGIONS) {
    const count = regionBookingCounts[region.code] || 0;
    const regionLocCount = await prisma.location.count({
      where: {
        isVisible: true,
        latitude: { gte: region.bbox.minLat, lte: region.bbox.maxLat },
        longitude: { gte: region.bbox.minLng, lte: region.bbox.maxLng },
      },
    });
    if (regionLocCount === 0) {
      console.log(`  [${region.code}] No locations seeded — skipped`);
      continue;
    }
    const perLoc = (count / regionLocCount).toFixed(1);
    const pass = count > 0;
    if (!pass) densityPass = false;
    else metrosWithDensity++;
    console.log(`  [${region.code}] ${count} bookings across ${regionLocCount} locations (avg ${perLoc}/loc) ${pass ? "✅" : "⚠️"}`);
  }

  results.push({
    rule: "All seeded metros have booking density",
    pass: densityPass,
    details: `${metrosWithDensity} metros with density. Distribution: ${JSON.stringify(regionBookingCounts)}`,
  });

  const historyEntries = registryEntries.filter((e) => e.tableName === "booking_status_history");
  results.push({
    rule: "Status history entries exist",
    pass: historyEntries.length > 0,
    details: `${historyEntries.length} history entries`,
  });

  const holdEntries = registryEntries.filter((e) => e.tableName === "booking_holds");
  const heldBookings = statusCounts["HELD"] || 0;
  results.push({
    rule: "Held bookings have corresponding holds",
    pass: holdEntries.length >= heldBookings,
    details: `${holdEntries.length} holds for ${heldBookings} HELD bookings`,
  });

  console.log("\n═══ Validation Results ═══\n");

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`  ${icon} ${r.rule}`);
    console.log(`     ${r.details}`);
    if (r.pass) passed++;
    else failed++;
  }

  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} rules`);
  console.log(`\n${failed === 0 ? "✅ All validations passed!" : "❌ Some validations failed."}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

function getLocalDate(utcDate: Date, timezone: string): { hour: number; minute: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(utcDate);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    hour: parseInt(get("hour")),
    minute: parseInt(get("minute")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}

main()
  .catch((e) => {
    console.error("Validation failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
