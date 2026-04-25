/**
 * Backfill Vehicle.bodyType (from existing subtypeCode) and
 * User.defaultVehicleId (earliest-created eligible vehicle).
 *
 * Why: the schema migration adds these new columns with neutral defaults
 * (`bodyType = "OTHER"`, `defaultVehicleId = null`). The driver-side
 * redesign expects every vehicle to have a meaningful bodyType for visual
 * styling, and every driver with eligible vehicles to have an active
 * default. This script fills both gaps idempotently.
 *
 * Idempotent: safe to re-run. Skips rows that already look populated.
 *
 * Run: pnpm --filter @workspace/db exec tsx src/demo-seed/scripts/backfill-vehicle-body-type-and-default.ts
 */

import { prisma } from "../../index";

const SUBTYPE_TO_BODY_TYPE: Record<string, string> = {
  COACH: "COACH",
  DOUBLE_DECKER: "COACH",
  SCHOOL_BUS: "SCHOOL_BUS",
  SHUTTLE: "SHUTTLE",
  MINIBUS: "SHUTTLE",
  STANDARD: "TRANSIT_BUS",
  ARTICULATED: "TRANSIT_BUS",
};

async function backfillBodyType() {
  // Only update rows still at the migration default. Rows already mapped
  // to a non-OTHER bucket (e.g. on a re-run after edits) stay untouched.
  const candidates = await prisma.vehicle.findMany({
    where: { bodyType: "OTHER" },
    select: { id: true, subtypeCode: true, unitNumber: true },
  });

  const updates: Record<string, number> = {};
  for (const v of candidates) {
    const target = SUBTYPE_TO_BODY_TYPE[v.subtypeCode] ?? "OTHER";
    if (target === "OTHER") continue;
    await prisma.vehicle.update({ where: { id: v.id }, data: { bodyType: target } });
    updates[target] = (updates[target] ?? 0) + 1;
  }

  console.log("\n[bodyType] backfill summary:");
  console.log(`  candidates with bodyType=OTHER: ${candidates.length}`);
  for (const [k, v] of Object.entries(updates)) console.log(`  → ${k}: ${v}`);
  const stillOther = candidates.length - Object.values(updates).reduce((a, b) => a + b, 0);
  if (stillOther > 0) {
    console.log(`  → OTHER (no subtype match): ${stillOther} (left as-is)`);
  }
}

async function backfillDefaultVehicle() {
  // Eligible set = personally-owned (ownerUserId === user.id) ∪
  //                currently-assigned fleet vehicles (FleetDriverAssignment
  //                spanning now()).
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { defaultVehicleId: null, deletedAt: null, isActive: true },
    select: { id: true, email: true },
  });

  let assigned = 0;
  let skippedNoEligible = 0;

  for (const u of users) {
    const personal = await prisma.vehicle.findMany({
      where: { ownerUserId: u.id, isActive: true },
      select: { id: true, createdAt: true },
    });

    const assignments = await prisma.fleetDriverAssignment.findMany({
      where: {
        driverUserId: u.id,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      select: { vehicleId: true },
    });
    const fleetIds = assignments.map((a) => a.vehicleId).filter(Boolean) as string[];
    const fleetVehicles = fleetIds.length === 0 ? [] : await prisma.vehicle.findMany({
      where: { id: { in: fleetIds }, isActive: true },
      select: { id: true, createdAt: true },
    });

    const eligible = [...personal, ...fleetVehicles];
    if (eligible.length === 0) { skippedNoEligible++; continue; }

    eligible.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    await prisma.user.update({
      where: { id: u.id },
      data: { defaultVehicleId: eligible[0].id },
    });
    assigned++;
  }

  console.log("\n[defaultVehicleId] backfill summary:");
  console.log(`  users without a default: ${users.length}`);
  console.log(`  → assigned: ${assigned}`);
  console.log(`  → no eligible vehicles, left null: ${skippedNoEligible}`);
}

async function main() {
  console.log("Backfilling Vehicle.bodyType and User.defaultVehicleId...");
  await backfillBodyType();
  await backfillDefaultVehicle();
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
