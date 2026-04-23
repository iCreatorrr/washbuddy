/**
 * One-time cleanup + vehicle-class audit.
 *
 *  1. Deletes platform-sourced bookings (bookingSource = "PLATFORM") where
 *     washBayId is NULL. These accumulated before auto-assignment shipped
 *     and are orphan slots that clutter the Bay Timeline's "Unassigned" row.
 *
 *     Walk-in bookings (bookingSource in {"WALK_IN","DIRECT"}) with a null
 *     bay are flagged but NOT deleted — they may represent a real
 *     provider-side data quality issue that needs manual triage.
 *
 *  2. Audits Vehicle records for a resolvable class. The schema currently
 *     has no explicit `Vehicle.vehicleClass` field — class is derived from
 *     `lengthInches`. Rows with invalid length (<= 0) will fail
 *     auto-assignment, so we surface them now.
 *
 * Run:
 *     pnpm --filter @workspace/db run demo:cleanup-unassigned-bookings
 *     pnpm --filter @workspace/db run demo:cleanup-unassigned-bookings -- --dry-run
 */

import { prisma } from "../../index";

const DRY_RUN = process.argv.includes("--dry-run");

function classifyLength(lengthInches: number | null | undefined):
  | "SMALL"
  | "MEDIUM"
  | "LARGE"
  | "EXTRA_LARGE"
  | null {
  if (typeof lengthInches !== "number" || !Number.isFinite(lengthInches) || lengthInches <= 0) return null;
  if (lengthInches < 300) return "SMALL";
  if (lengthInches < 420) return "MEDIUM";
  if (lengthInches < 540) return "LARGE";
  return "EXTRA_LARGE";
}

async function main() {
  console.log(`Cleanup run — ${DRY_RUN ? "DRY RUN (no deletes)" : "LIVE"}\n`);

  // ── Step 1: legacy platform-sourced unassigned bookings ──────────────────
  const platformUnassigned = await prisma.booking.findMany({
    where: { washBayId: null, bookingSource: "PLATFORM" },
    select: {
      id: true,
      status: true,
      scheduledStartAtUtc: true,
      locationId: true,
      serviceNameSnapshot: true,
    },
  });

  console.log(`Found ${platformUnassigned.length} PLATFORM bookings with null washBayId.`);
  if (platformUnassigned.length > 0) {
    const sample = platformUnassigned.slice(0, 10);
    for (const b of sample) {
      console.log(
        `  • ${b.id} [${b.status}] ${b.scheduledStartAtUtc.toISOString()} — ${b.serviceNameSnapshot}`,
      );
    }
    if (platformUnassigned.length > sample.length) {
      console.log(`  … and ${platformUnassigned.length - sample.length} more.`);
    }
  }

  const offPlatformUnassigned = await prisma.booking.findMany({
    where: { washBayId: null, bookingSource: { in: ["DIRECT", "WALK_IN"] } },
    select: { id: true, bookingSource: true, scheduledStartAtUtc: true },
  });

  if (offPlatformUnassigned.length > 0) {
    console.log(
      `\n⚠ Flagged (NOT deleted): ${offPlatformUnassigned.length} walk-in/direct bookings with null washBayId. These may need manual triage:`,
    );
    for (const b of offPlatformUnassigned.slice(0, 20)) {
      console.log(`  • ${b.id} [${b.bookingSource}] ${b.scheduledStartAtUtc.toISOString()}`);
    }
    if (offPlatformUnassigned.length > 20) {
      console.log(`  … and ${offPlatformUnassigned.length - 20} more.`);
    }
  }

  let deletedCount = 0;
  if (!DRY_RUN && platformUnassigned.length > 0) {
    const ids = platformUnassigned.map((b) => b.id);
    // Cascading children: BookingStatusHistory, BookingHold, BookingPhoto,
    // BookingMessage, WashNote, BookingAddOn. Delete in dependency order.
    await prisma.bookingStatusHistory.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.bookingHold.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.bookingPhoto.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.bookingMessage.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.washNote.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.bookingAddOn.deleteMany({ where: { bookingId: { in: ids } } });
    const del = await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    deletedCount = del.count;
    console.log(`\n✓ Deleted ${deletedCount} platform-unassigned bookings (plus their child rows).`);
  } else if (DRY_RUN) {
    console.log(`\n(Dry run — would delete ${platformUnassigned.length} platform-unassigned bookings.)`);
  }

  // ── Step 2: Vehicle class audit ───────────────────────────────────────────
  const vehicles = await prisma.vehicle.findMany({
    select: {
      id: true,
      unitNumber: true,
      lengthInches: true,
      fleetId: true,
      ownerUserId: true,
      fleet: { select: { name: true } },
      owner: { select: { email: true } },
    },
  });

  const invalid = vehicles.filter((v) => classifyLength(v.lengthInches) === null);

  console.log(`\nVehicle class audit: ${invalid.length} of ${vehicles.length} vehicles cannot be classified.`);
  console.log(`(Reason: lengthInches is <= 0, missing, or non-finite. Schema has no explicit vehicleClass field.)\n`);

  if (invalid.length > 0) {
    const sampleSize = Math.min(invalid.length, 30);
    console.log(`Showing first ${sampleSize}:`);
    for (const v of invalid.slice(0, sampleSize)) {
      const ownerLabel = v.fleet?.name
        ? `fleet=${v.fleet.name}`
        : v.owner?.email
          ? `owner=${v.owner.email}`
          : "unowned";
      console.log(`  • ${v.id} (unit=${v.unitNumber ?? "—"}, length=${v.lengthInches}, ${ownerLabel})`);
    }
    if (invalid.length > sampleSize) console.log(`  … and ${invalid.length - sampleSize} more.`);
  }

  console.log(`\n── SUMMARY ───────────────────────────────────────────────`);
  console.log(`Deleted platform-unassigned bookings:   ${DRY_RUN ? `(dry run) ${platformUnassigned.length}` : deletedCount}`);
  console.log(`Flagged walk-in/direct unassigned:      ${offPlatformUnassigned.length} (not deleted)`);
  console.log(`Vehicles with unresolvable class:       ${invalid.length} / ${vehicles.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
