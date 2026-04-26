/**
 * Backfill the BookingService join table from existing single-service
 * bookings. The new multi-service flow reads from booking_services;
 * historical rows live in Booking.serviceId + serviceNameSnapshot +
 * serviceBasePriceMinor. Mirror each existing booking into one
 * BookingService row so the new UI displays them correctly.
 *
 * Idempotent: skips bookings that already have a BookingService row.
 *
 * Run: pnpm --filter @workspace/db demo:backfill-booking-services
 */

import { prisma } from "../../index";

async function main() {
  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      serviceId: true,
      serviceNameSnapshot: true,
      serviceBasePriceMinor: true,
      service: { select: { durationMins: true } },
      _count: { select: { bookingServices: true } },
    },
  });

  let inspected = 0;
  let alreadyMigrated = 0;
  let migrated = 0;
  let skipped = 0;

  for (const b of bookings) {
    inspected += 1;
    if ((b._count.bookingServices ?? 0) > 0) {
      alreadyMigrated += 1;
      continue;
    }
    if (!b.serviceId || !b.service) {
      skipped += 1;
      continue;
    }
    await prisma.bookingService.create({
      data: {
        bookingId: b.id,
        serviceId: b.serviceId,
        nameSnapshot: b.serviceNameSnapshot || "",
        priceMinor: b.serviceBasePriceMinor || 0,
        durationMins: b.service.durationMins,
        displayOrder: 0,
      },
    });
    migrated += 1;
  }

  console.log("\nBackfill summary:");
  console.log(`  bookings inspected:   ${inspected}`);
  console.log(`  already had BS rows:  ${alreadyMigrated}`);
  console.log(`  newly migrated:       ${migrated}`);
  console.log(`  skipped (no service): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
