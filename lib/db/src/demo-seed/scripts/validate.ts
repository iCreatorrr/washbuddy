import { PrismaClient } from "@prisma/client";
import { REGIONS } from "../regions.js";
import { STABLE_PERSONAS } from "../personas.js";
import { GOLDEN_SCENARIOS } from "../scenarios.js";
import { SEED_MODES } from "../config.js";
import type { SeedMode } from "../config.js";

const prisma = new PrismaClient();

interface ValidationResult {
  check: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

async function main() {
  const modeArg = process.argv[2] as SeedMode | undefined;
  const mode = modeArg && SEED_MODES[modeArg] ? modeArg : "demo-full";
  const config = SEED_MODES[mode];

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  WashBuddy Demo Data Validation          ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Mode: ${mode.padEnd(34)} ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const results: ValidationResult[] = [];

  const registryCount = await prisma.demoDataRegistry.count();
  results.push({
    check: "Registry populated",
    status: registryCount > 0 ? "PASS" : "FAIL",
    detail: `${registryCount} entries in demo_data_registry`,
  });

  const demoUsers = await prisma.demoDataRegistry.count({ where: { tableName: "users" } });
  results.push({
    check: "Demo users exist",
    status: demoUsers >= STABLE_PERSONAS.length ? "PASS" : "FAIL",
    detail: `${demoUsers} demo users (need ≥${STABLE_PERSONAS.length} personas)`,
  });

  const demoProviders = await prisma.demoDataRegistry.count({ where: { tableName: "providers" } });
  const minProviders = REGIONS.length * config.providersPerRegion;
  results.push({
    check: "Provider count",
    status: demoProviders >= minProviders ? "PASS" : demoProviders > 0 ? "WARN" : "FAIL",
    detail: `${demoProviders} providers (target ≥${minProviders})`,
  });

  const demoLocations = await prisma.demoDataRegistry.count({ where: { tableName: "locations" } });
  const minLocations = REGIONS.length * config.providersPerRegion * config.locationsPerProvider[0];
  results.push({
    check: "Location count",
    status: demoLocations >= minLocations ? "PASS" : demoLocations > 0 ? "WARN" : "FAIL",
    detail: `${demoLocations} locations (target ≥${minLocations})`,
  });

  for (const region of REGIONS) {
    const regionLocs = await prisma.demoDataRegistry.count({
      where: { tableName: "locations", seedRegionCode: region.code },
    });
    results.push({
      check: `Locations in ${region.code}`,
      status: regionLocs >= config.providersPerRegion ? "PASS" : regionLocs > 0 ? "WARN" : "FAIL",
      detail: `${regionLocs} locations`,
    });
  }

  const demoBookings = await prisma.demoDataRegistry.count({ where: { tableName: "bookings" } });
  results.push({
    check: "Booking count",
    status: demoBookings > 0 ? "PASS" : "FAIL",
    detail: `${demoBookings} bookings`,
  });

  const demoReviews = await prisma.demoDataRegistry.count({ where: { tableName: "reviews" } });
  results.push({
    check: "Reviews exist",
    status: demoReviews > 0 ? "PASS" : "WARN",
    detail: `${demoReviews} reviews`,
  });

  const demoDisputes = await prisma.demoDataRegistry.count({ where: { tableName: "disputes" } });
  results.push({
    check: "Disputes exist",
    status: demoDisputes > 0 ? "PASS" : "WARN",
    detail: `${demoDisputes} disputes`,
  });

  for (const persona of STABLE_PERSONAS) {
    const exists = await prisma.demoDataRegistry.count({
      where: { demoPersonaCode: persona.code },
    });
    results.push({
      check: `Persona: ${persona.code}`,
      status: exists > 0 ? "PASS" : "FAIL",
      detail: exists > 0 ? `${exists} records` : "Missing",
    });
  }

  for (const scenario of GOLDEN_SCENARIOS) {
    const exists = await prisma.demoDataRegistry.count({
      where: { demoScenarioCode: scenario.code },
    });
    results.push({
      check: `Scenario: ${scenario.code}`,
      status: exists > 0 ? "PASS" : "WARN",
      detail: exists > 0 ? `${exists} records` : "Not yet generated",
    });
  }

  const orphanCheck = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) as cnt FROM demo_data_registry d
    WHERE d.table_name = 'bookings'
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = d.record_id)
  `;
  const orphanCount = Number(orphanCheck[0]?.cnt ?? 0);
  results.push({
    check: "No orphaned registry entries (bookings)",
    status: orphanCount === 0 ? "PASS" : "FAIL",
    detail: orphanCount === 0 ? "Clean" : `${orphanCount} orphaned entries`,
  });

  console.log("── Results ───────────────────────────────\n");
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️";
    console.log(`  ${icon} ${r.check.padEnd(40)} ${r.detail}`);
    if (r.status === "PASS") passCount++;
    else if (r.status === "FAIL") failCount++;
    else warnCount++;
  }

  console.log(`\n── Summary ───────────────────────────────`);
  console.log(`  ✅ Pass: ${passCount}  ❌ Fail: ${failCount}  ⚠️ Warn: ${warnCount}`);
  console.log(`  Total checks: ${results.length}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Validation failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
