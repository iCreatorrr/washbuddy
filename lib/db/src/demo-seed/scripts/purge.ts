import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PURGE_ORDER = [
  "dispute_evidence",
  "disputes",
  "reviews",
  "provider_payout_items",
  "provider_payout_batches",
  "refunds_internal",
  "payment_events",
  "payment_intents_internal",
  "booking_status_history",
  "booking_holds",
  "bookings",
  "service_compatibility",
  "services",
  "operating_windows",
  "notifications",
  "audit_events",
  "provider_memberships",
  "fleet_memberships",
  "user_platform_roles",
  "vehicles",
  "locations",
  "providers",
  "fleets",
  "users",
];

async function main() {
  const batchFilter = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  WashBuddy Demo Data Purge               ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Mode: ${dryRun ? "DRY RUN (no deletions)    " : "LIVE (will delete records) "}    ║`);
  if (batchFilter) {
    console.log(`║  Filter: ${batchFilter.slice(0, 30).padEnd(30)} ║`);
  }
  console.log(`╚══════════════════════════════════════════╝\n`);

  const whereClause = batchFilter
    ? { seedBatchId: batchFilter }
    : {};

  const registryEntries = await prisma.demoDataRegistry.findMany({
    where: whereClause,
    select: { tableName: true, recordId: true },
  });

  const byTable = new Map<string, string[]>();
  for (const entry of registryEntries) {
    const existing = byTable.get(entry.tableName) ?? [];
    existing.push(entry.recordId);
    byTable.set(entry.tableName, existing);
  }

  console.log(`Found ${registryEntries.length} demo records across ${byTable.size} tables.\n`);

  for (const table of PURGE_ORDER) {
    const ids = byTable.get(table);
    if (!ids || ids.length === 0) continue;

    if (dryRun) {
      console.log(`  [dry-run] Would delete ${ids.length} records from ${table}`);
    } else {
      const result = await prisma.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE id = ANY($1::uuid[])`,
        ids
      );
      console.log(`  [purged] ${result} records from ${table}`);
    }
  }

  if (!dryRun) {
    const deletedRegistry = await prisma.demoDataRegistry.deleteMany({
      where: whereClause,
    });
    console.log(`\n  [purged] ${deletedRegistry.count} registry entries`);
  }

  console.log("\n✅ Purge complete.\n");
}

main()
  .catch((e) => {
    console.error("Purge failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
