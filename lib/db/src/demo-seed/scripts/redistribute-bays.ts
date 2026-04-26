/**
 * Redistribute wash bays across all approved+visible locations into a
 * realistic facility-tier mix. Earlier seed runs created near-uniform
 * 3-bay locations where every location ended up with at least one
 * EXTRA_LARGE-capable bay, so the driver-side compatibility check
 * showed every location as compatible regardless of the active
 * vehicle's class. Real commercial bus-wash networks vary: some yards
 * top out at MEDIUM, most at LARGE, only a minority handle 45ft+
 * EXTRA_LARGE coaches.
 *
 * Tier mix:
 *   30% MEDIUM       — all bays cap at MEDIUM
 *   40% LARGE        — at least one bay caps at LARGE
 *   30% EXTRA_LARGE  — at least one bay caps at EXTRA_LARGE
 *
 * Tier assignment is deterministic on the location id so re-running
 * the script produces the same mix (and the same locations stay in
 * the same tier across runs).
 *
 * Bay supportedClasses are *contiguous from SMALL up to the cap* —
 * a LARGE bay is {SMALL, MEDIUM, LARGE}, never {MEDIUM, LARGE} or
 * {LARGE alone}. The earlier {MEDIUM, LARGE, EXTRA_LARGE} pattern was
 * the wrong domain semantic — physically larger bays accept smaller
 * vehicles too.
 *
 * Run: pnpm --filter @workspace/db demo:redistribute-bays
 */

import { prisma } from "../../index";

type Tier = "MEDIUM" | "LARGE" | "EXTRA_LARGE";

/** FNV-1a 32-bit hash. We only need a stable spread across [0, 100);
 * any deterministic hash on the uuid string works. Avoids pulling in a
 * crypto dep and keeps the per-location placement reproducible. */
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

/** Bay count within tier, also derived from the id so it's stable. */
function bayCountForTier(id: string, tier: Tier): number {
  // Use a different "page" of the hash so bay count and tier vary
  // independently — without this, every MEDIUM tier ends up with the
  // same bay count, etc.
  const n = (hashUuid(id + ":bays") % 3); // 0,1,2
  if (tier === "MEDIUM") return 2 + (n % 2); // 2 or 3
  if (tier === "LARGE") return 2 + (n % 2);  // 2 or 3
  return 2 + n;                               // 2, 3, or 4
}

/** Bay shape for a given tier and bay index. Last bay always carries
 * the tier cap; preceding bays carry smaller caps so the location
 * has a realistic mix of physical sizes. */
function shapeFor(tier: Tier, index: number, total: number): { name: string; supportedClasses: string[]; maxLengthIn: number; maxHeightIn: number } {
  const isLast = index === total - 1;

  if (tier === "MEDIUM") {
    return {
      name: `Bay ${index + 1}`,
      supportedClasses: ["SMALL", "MEDIUM"],
      maxLengthIn: 360,
      maxHeightIn: 132,
    };
  }

  if (tier === "LARGE") {
    if (isLast) {
      return {
        name: `Bay ${index + 1}`,
        supportedClasses: ["SMALL", "MEDIUM", "LARGE"],
        maxLengthIn: 540,
        maxHeightIn: 156,
      };
    }
    return {
      name: `Bay ${index + 1}`,
      supportedClasses: ["SMALL", "MEDIUM"],
      maxLengthIn: 360,
      maxHeightIn: 132,
    };
  }

  // EXTRA_LARGE tier — last bay is the XL bay, second-to-last is LARGE,
  // earlier bays are MEDIUM-capped.
  if (isLast) {
    return {
      name: `Bay ${index + 1}`,
      supportedClasses: ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"],
      maxLengthIn: 720,
      maxHeightIn: 168,
    };
  }
  if (index === total - 2) {
    return {
      name: `Bay ${index + 1}`,
      supportedClasses: ["SMALL", "MEDIUM", "LARGE"],
      maxLengthIn: 540,
      maxHeightIn: 156,
    };
  }
  return {
    name: `Bay ${index + 1}`,
    supportedClasses: ["SMALL", "MEDIUM"],
    maxLengthIn: 360,
    maxHeightIn: 132,
  };
}

async function main() {
  const locations = await prisma.location.findMany({
    where: { isVisible: true, provider: { approvalStatus: "APPROVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`Redistributing bays across ${locations.length} approved+visible locations...\n`);

  let baysDropped = 0;
  let baysCreated = 0;
  const tierCounts = { MEDIUM: 0, LARGE: 0, EXTRA_LARGE: 0 };
  const skippedLocations: string[] = [];

  for (const loc of locations) {
    const tier = tierForLocation(loc.id);
    const count = bayCountForTier(loc.id, tier);
    tierCounts[tier] += 1;

    // Drop any wash_bay row that has no foreign keys pointing at it
    // from elsewhere. Bays referenced by a Booking can't be deleted,
    // so we skip those locations and report them.
    const existing = await prisma.washBay.findMany({
      where: { locationId: loc.id },
      select: { id: true, _count: { select: { bookings: true } } },
    });
    const safeToDelete = existing.filter((b) => b._count.bookings === 0).map((b) => b.id);
    const referenced = existing.length - safeToDelete.length;

    if (referenced > 0) {
      // Some bays at this location have bookings — leave the existing
      // bays alone and skip. Realistically these should be rare and a
      // human should triage; we don't want to orphan booking history.
      skippedLocations.push(`${loc.name} (${referenced} bay(s) with active bookings)`);
      continue;
    }

    if (safeToDelete.length > 0) {
      await prisma.washBay.deleteMany({ where: { id: { in: safeToDelete } } });
      baysDropped += safeToDelete.length;
    }

    for (let i = 0; i < count; i++) {
      const shape = shapeFor(tier, i, count);
      await prisma.washBay.create({
        data: {
          locationId: loc.id,
          name: shape.name,
          maxVehicleLengthIn: shape.maxLengthIn,
          maxVehicleHeightIn: shape.maxHeightIn,
          supportedClasses: shape.supportedClasses,
          isActive: true,
          displayOrder: i,
        },
      });
      baysCreated += 1;
    }
  }

  console.log("Tier distribution:");
  console.log(`  MEDIUM:      ${tierCounts.MEDIUM} location(s)`);
  console.log(`  LARGE:       ${tierCounts.LARGE} location(s)`);
  console.log(`  EXTRA_LARGE: ${tierCounts.EXTRA_LARGE} location(s)`);
  console.log("");
  console.log(`Bays dropped: ${baysDropped}`);
  console.log(`Bays created: ${baysCreated}`);
  if (skippedLocations.length > 0) {
    console.log(`\nSkipped ${skippedLocations.length} location(s) with active bookings on existing bays:`);
    for (const s of skippedLocations) console.log(`  • ${s}`);
    console.log("\nThese keep their existing bay configuration. Triage by hand if redistribution is needed.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
