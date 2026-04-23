/**
 * Backfill wash bays for any location that has zero.
 *
 * Why: the original seed (prisma/seed.ts) caps bay creation at the first 45
 * approved+visible locations. Any provider with more locations — or any
 * location created after seeding — ends up with zero bays, which makes the
 * Bay Timeline display an empty "Unassigned" row and blocks new bookings
 * with a misleading "All 0 compatible bay(s) are booked" error.
 *
 * This script is idempotent: it skips locations that already have bays.
 *
 * Run: pnpm --filter @workspace/db exec tsx src/demo-seed/scripts/backfill-bays.ts
 */

import { prisma } from "../../index";

const DEFAULTS = {
  // Two LARGE-capable bays cover SMALL/MEDIUM/LARGE. We include EXTRA_LARGE on
  // one bay since this system is primarily commercial (bus/truck washes).
  bays: [
    {
      name: "Bay 1",
      maxVehicleLengthIn: 720, // 60 ft
      maxVehicleHeightIn: 168, // 14 ft
      supportedClasses: ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"],
      displayOrder: 0,
    },
    {
      name: "Bay 2",
      maxVehicleLengthIn: 540, // 45 ft
      maxVehicleHeightIn: 156, // 13 ft
      supportedClasses: ["SMALL", "MEDIUM", "LARGE"],
      displayOrder: 1,
    },
  ],
};

async function main() {
  console.log("Backfilling wash bays for locations with zero bays...\n");

  const locations = await prisma.location.findMany({
    where: { washBays: { none: {} } },
    select: { id: true, name: true, providerId: true, provider: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  if (locations.length === 0) {
    console.log("All locations already have at least one bay. Nothing to do.");
    return;
  }

  console.log(`Found ${locations.length} location(s) with zero bays:\n`);
  for (const loc of locations) {
    console.log(`  • ${loc.provider.name} — ${loc.name}`);
  }
  console.log();

  let totalCreated = 0;
  for (const loc of locations) {
    const data = DEFAULTS.bays.map((b) => ({
      ...b,
      locationId: loc.id,
      isActive: true,
    }));
    await prisma.washBay.createMany({ data });
    totalCreated += data.length;
    console.log(`  ✓ ${loc.name}: ${data.length} bays created`);
  }

  console.log(`\nDone. Created ${totalCreated} bay(s) across ${locations.length} location(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
