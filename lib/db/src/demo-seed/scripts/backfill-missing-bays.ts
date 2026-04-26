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
 * The bay shape mirrors the seed's facility-tier distribution
 * (30% MEDIUM, 40% LARGE, 30% EXTRA_LARGE) deterministically by
 * location id, so a freshly backfilled location is indistinguishable
 * from a fresh seed of the same id.
 *
 * Run: pnpm --filter @workspace/db demo:backfill-missing-bays
 */

import { prisma } from "../../index";

type Tier = "MEDIUM" | "LARGE" | "EXTRA_LARGE";

function hashUuid(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function tierForLocation(id: string): Tier {
  const bucket = hashUuid(id) % 100;
  if (bucket < 30) return "MEDIUM";
  if (bucket < 70) return "LARGE";
  return "EXTRA_LARGE";
}

function bayCountForTier(id: string, tier: Tier): number {
  const n = hashUuid(id + ":bays") % 3;
  if (tier === "EXTRA_LARGE") return 2 + n;
  return 2 + (n % 2);
}

function shapeFor(tier: Tier, index: number, total: number): { supportedClasses: string[]; maxLengthIn: number; maxHeightIn: number } {
  const isLast = index === total - 1;
  if (tier === "MEDIUM") return { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
  if (tier === "LARGE") {
    return isLast
      ? { supportedClasses: ["SMALL", "MEDIUM", "LARGE"], maxLengthIn: 540, maxHeightIn: 156 }
      : { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
  }
  if (isLast) return { supportedClasses: ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"], maxLengthIn: 720, maxHeightIn: 168 };
  if (index === total - 2) return { supportedClasses: ["SMALL", "MEDIUM", "LARGE"], maxLengthIn: 540, maxHeightIn: 156 };
  return { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
}

async function main() {
  const candidates = await prisma.location.findMany({
    where: {
      isVisible: true,
      provider: { approvalStatus: "APPROVED" },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { washBays: { where: { isActive: true } } } },
    },
  });

  let inspected = 0;
  let bayed = 0;
  let baysCreated = 0;
  let alreadyHadBays = 0;
  const tierCounts = { MEDIUM: 0, LARGE: 0, EXTRA_LARGE: 0 };

  for (const loc of candidates) {
    inspected += 1;
    if ((loc._count.washBays ?? 0) > 0) {
      alreadyHadBays += 1;
      continue;
    }

    const tier = tierForLocation(loc.id);
    const numBays = bayCountForTier(loc.id, tier);
    tierCounts[tier] += 1;

    for (let b = 0; b < numBays; b++) {
      const shape = shapeFor(tier, b, numBays);
      await prisma.washBay.create({
        data: {
          locationId: loc.id,
          name: `Bay ${b + 1}`,
          maxVehicleLengthIn: shape.maxLengthIn,
          maxVehicleHeightIn: shape.maxHeightIn,
          supportedClasses: shape.supportedClasses,
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
  if (bayed > 0) {
    console.log(`  tier mix (newly): MEDIUM ${tierCounts.MEDIUM} · LARGE ${tierCounts.LARGE} · EXTRA_LARGE ${tierCounts.EXTRA_LARGE}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
