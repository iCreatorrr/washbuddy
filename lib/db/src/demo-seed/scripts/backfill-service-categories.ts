/**
 * Backfill ServiceCategory for existing Service rows by keyword-matching the
 * Service.name (and falling back to description). Idempotent.
 *
 * Spec: docs/search-discovery-overhaul/02-eid.md §5.1
 *       docs/search-discovery-overhaul/03-service-taxonomy-decision.md
 *
 * Modes:
 *   --dry-run   Print the proposed categorization grouped by confidence.
 *               No DB writes. This is the Phase 1B preview output that gets
 *               reviewed before the real run.
 *   (no flag)   Apply the assignments. Updates Service.category in place.
 *
 * Run:
 *   pnpm --filter @workspace/db demo:backfill-service-categories -- --dry-run
 *   pnpm --filter @workspace/db demo:backfill-service-categories
 */

import { prisma } from "../../index";

type Confidence = "HIGH" | "MEDIUM" | "LOW";
type Category =
  | "EXTERIOR_WASH"
  | "INTERIOR_CLEANING"
  | "RESTROOM_DUMP"
  | "RESTOCK_CONSUMABLES"
  | "ADD_ON";

// Per-category keyword rules. Order matters — first match wins. The same
// list also drives the confidence score: a match on a "primary" keyword
// (whole-word, distinctive) is HIGH; a match on a "secondary" keyword
// (broader, may overlap with adjacent categories) is MEDIUM.
//
// Anything that fails to match every rule defaults to EXTERIOR_WASH at
// LOW confidence — the safe default per the spec.
const RULES: Array<{
  category: Category;
  primary: string[];   // HIGH-confidence keywords
  secondary: string[]; // MEDIUM-confidence keywords
}> = [
  {
    category: "RESTROOM_DUMP",
    primary: ["dump", "black water", "blackwater", "holding tank", "septic"],
    secondary: ["toilet", "chemical", "lavatory"],
  },
  {
    category: "RESTOCK_CONSUMABLES",
    primary: ["restock", "consumable", "consumables"],
    secondary: ["coffee", "toilet paper", "supply", "supplies", "refill"],
  },
  {
    category: "INTERIOR_CLEANING",
    primary: ["interior", "vacuum", "carpet", "upholstery", "upholster"],
    secondary: ["detail", "deep clean", "sanitize", "sanitization"],
  },
  {
    category: "EXTERIOR_WASH",
    primary: [
      "exterior",
      "hand wash",
      "drive-through",
      "drive through",
      "drivethrough",
      "two-step",
      "two step",
      "pressure",
      "rinse",
      "undercarriage",
    ],
    secondary: ["wash", "express"],
  },
];

function classify(name: string, description: string | null): {
  category: Category;
  triggers: string[];
  confidence: Confidence;
} {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();

  // Whole-word match: spaces or word boundaries on both sides.
  const matches = (kw: string) => {
    const lk = kw.toLowerCase();
    if (lk.includes(" ") || lk.includes("-")) {
      return haystack.includes(lk);
    }
    const re = new RegExp(`\\b${lk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(haystack);
  };

  for (const rule of RULES) {
    const primaryHits = rule.primary.filter(matches);
    if (primaryHits.length > 0) {
      return { category: rule.category, triggers: primaryHits, confidence: "HIGH" };
    }
  }
  for (const rule of RULES) {
    const secondaryHits = rule.secondary.filter(matches);
    if (secondaryHits.length > 0) {
      return { category: rule.category, triggers: secondaryHits, confidence: "MEDIUM" };
    }
  }
  return { category: "EXTERIOR_WASH", triggers: [], confidence: "LOW" };
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  const services = await prisma.service.findMany({
    select: { id: true, name: true, description: true, category: true },
    orderBy: { name: "asc" },
  });

  type Row = {
    id: string;
    name: string;
    description: string | null;
    current: Category;
    proposed: Category;
    triggers: string[];
    confidence: Confidence;
  };

  const rows: Row[] = services.map((s) => {
    const r = classify(s.name, s.description);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      current: s.category as Category,
      proposed: r.category,
      triggers: r.triggers,
      confidence: r.confidence,
    };
  });

  const byConf: Record<Confidence, Row[]> = { LOW: [], MEDIUM: [], HIGH: [] };
  for (const r of rows) byConf[r.confidence].push(r);

  console.log(`\n${isDryRun ? "[DRY RUN]" : "[APPLY]"} Service Category Backfill`);
  console.log(`  Total services: ${rows.length}`);
  console.log(`  HIGH confidence:   ${byConf.HIGH.length}`);
  console.log(`  MEDIUM confidence: ${byConf.MEDIUM.length}`);
  console.log(`  LOW confidence:    ${byConf.LOW.length}\n`);

  // Print LOW first, then MEDIUM, then HIGH — riskiest assignments up top.
  for (const conf of ["LOW", "MEDIUM", "HIGH"] as const) {
    const group = byConf[conf];
    if (group.length === 0) continue;
    console.log(`── ${conf} confidence (${group.length}) ──`);
    for (const r of group) {
      const trig = r.triggers.length ? `[${r.triggers.join(", ")}]` : "[no rule matched — default]";
      console.log(`  ${r.id}`);
      console.log(`    name:        ${r.name}`);
      if (r.description) console.log(`    description: ${truncate(r.description, 80)}`);
      console.log(`    current:     ${r.current}`);
      console.log(`    proposed:    ${r.proposed}    ${trig}`);
      console.log("");
    }
  }

  // Distribution after the proposed categorization.
  const dist: Record<Category, number> = {
    EXTERIOR_WASH: 0,
    INTERIOR_CLEANING: 0,
    RESTROOM_DUMP: 0,
    RESTOCK_CONSUMABLES: 0,
    ADD_ON: 0,
  };
  for (const r of rows) dist[r.proposed]++;
  console.log("── Proposed category distribution ──");
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(22)} ${v}`);

  if (isDryRun) {
    console.log("\nDry run complete. No DB writes. Re-run without --dry-run to apply.");
    return;
  }

  // Only update rows whose proposed category differs from the current one.
  const toUpdate = rows.filter((r) => r.current !== r.proposed);
  console.log(`\nApplying ${toUpdate.length} update${toUpdate.length === 1 ? "" : "s"}…`);

  for (const r of toUpdate) {
    await prisma.service.update({
      where: { id: r.id },
      data: { category: r.proposed },
    });
  }

  console.log(`Done. Row count unchanged: ${rows.length}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
