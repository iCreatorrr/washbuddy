/**
 * Backfill default bays for any approved, visible location that ended
 * up with zero active wash bays. The earlier seed had a `take: 45`
 * cap on the bay-creation findMany, so locations beyond index 44
 * received no bays and showed as "No bay fits your active vehicle"
 * regardless of which vehicle the driver had active.
 *
 * Idempotent: locations that already have at least one active bay
 * are skipped. Re-runnable safely.
 *
 * Run: pnpm --filter @workspace/db demo:backfill-missing-bays
 */

import { prisma } from "../../index";

const DEFAULT_BAY_CLASSES: string[][] = [
  ["SMALL", "MEDIUM"],
  ["SMALL", "MEDIUM", "LARGE"],
  ["MEDIUM", "LARGE", "EXTRA_LARGE"],
  ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"],
];

async function main() {
  const candidates = await prisma.location.findMany({
    where: {
      isVisible: true,
      provider: { approvalStatus: "APPROVED" },
    },
    select: {
      id: true,
      name: true,
      services: { select: { capacityPerSlot: true } },
      _count: { select: { washBays: { where: { isActive: true } } } },
    },
  });

  let inspected = 0;
  let bayed = 0;
  let baysCreated = 0;
  let alreadyHadBays = 0;

  for (const loc of candidates) {
    inspected += 1;
    if ((loc._count.washBays ?? 0) > 0) {
      alreadyHadBays += 1;
      continue;
    }

    // Match the seed's per-location bay logic: 3-4 bays, classes
    // ramping from SMALL/MEDIUM up to a wide-coverage Bay 4. This
    // mirrors lib/db/prisma/seed.ts so a backfilled location is
    // indistinguishable from a freshly-seeded one.
    const maxCap = loc.services.length > 0
      ? Math.max(...loc.services.map((s) => s.capacityPerSlot), 3)
      : 3;
    const numBays = Math.min(Math.max(maxCap, 3), 4);

    for (let b = 0; b < numBays; b++) {
      await prisma.washBay.create({
        data: {
          locationId: loc.id,
          name: `Bay ${b + 1}`,
          maxVehicleLengthIn: b < 2 ? 480 : 720,
          maxVehicleHeightIn: b < 2 ? 144 : 168,
          supportedClasses: DEFAULT_BAY_CLASSES[Math.min(b, DEFAULT_BAY_CLASSES.length - 1)],
          isActive: true,
          displayOrder: b,
        },
      });
      baysCreated += 1;
    }
    bayed += 1;
  }

  console.log("\nBackfill summary:");
  console.log(`  inspected:        ${inspected}`);
  console.log(`  already had bays: ${alreadyHadBays}`);
  console.log(`  newly bayed:      ${bayed}`);
  console.log(`  bays created:     ${baysCreated}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
