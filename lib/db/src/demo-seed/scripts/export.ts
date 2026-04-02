import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const EXPORTABLE_TABLES: Record<string, (ids: string[]) => Promise<any[]>> = {
  users: (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true } }),
  providers: (ids) => prisma.provider.findMany({ where: { id: { in: ids } } }),
  locations: (ids) => prisma.location.findMany({ where: { id: { in: ids } } }),
  fleets: (ids) => prisma.fleet.findMany({ where: { id: { in: ids } } }),
  vehicles: (ids) => prisma.vehicle.findMany({ where: { id: { in: ids } } }),
  services: (ids) => prisma.service.findMany({ where: { id: { in: ids } } }),
  bookings: (ids) => prisma.booking.findMany({ where: { id: { in: ids } } }),
  reviews: (ids) => prisma.review.findMany({ where: { id: { in: ids } } }),
  disputes: (ids) => prisma.dispute.findMany({ where: { id: { in: ids } } }),
};

async function main() {
  const format = process.argv.includes("--csv") ? "csv" : "json";
  const regionFilter = process.argv.find((a) => a.startsWith("--region="))?.split("=")[1];
  const personaFilter = process.argv.find((a) => a.startsWith("--persona="))?.split("=")[1];
  const scenarioFilter = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  WashBuddy Demo Data Export              ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Format: ${format.toUpperCase().padEnd(32)} ║`);
  if (regionFilter) console.log(`║  Region: ${regionFilter.padEnd(32)} ║`);
  if (personaFilter) console.log(`║  Persona: ${personaFilter.padEnd(31)} ║`);
  if (scenarioFilter) console.log(`║  Scenario: ${scenarioFilter.padEnd(30)} ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const where: any = {};
  if (regionFilter) where.seedRegionCode = regionFilter;
  if (personaFilter) where.demoPersonaCode = personaFilter;
  if (scenarioFilter) where.demoScenarioCode = scenarioFilter;

  const registryEntries = await prisma.demoDataRegistry.findMany({ where });

  const byTable = new Map<string, string[]>();
  for (const entry of registryEntries) {
    const existing = byTable.get(entry.tableName) ?? [];
    existing.push(entry.recordId);
    byTable.set(entry.tableName, existing);
  }

  const outputDir = path.join(process.cwd(), "demo-seed-export");
  fs.mkdirSync(outputDir, { recursive: true });

  for (const [table, ids] of byTable.entries()) {
    const fetcher = EXPORTABLE_TABLES[table];
    if (!fetcher) {
      console.log(`  [skip] ${table} — no export handler`);
      continue;
    }

    const records = await fetcher(ids);

    if (format === "json") {
      const filePath = path.join(outputDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
      console.log(`  [exported] ${records.length} ${table} → ${filePath}`);
    } else {
      if (records.length === 0) continue;
      const headers = Object.keys(records[0]);
      const rows = records.map((r: any) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const filePath = path.join(outputDir, `${table}.csv`);
      fs.writeFileSync(filePath, csv);
      console.log(`  [exported] ${records.length} ${table} → ${filePath}`);
    }
  }

  console.log(`\n✅ Export complete. Output: ${outputDir}\n`);
}

main()
  .catch((e) => {
    console.error("Export failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
