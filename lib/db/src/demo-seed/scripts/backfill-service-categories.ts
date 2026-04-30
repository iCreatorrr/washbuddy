/**
 * Backfill ServiceCategory + labels for existing Service rows by keyword-
 * matching the Service.name (and falling back to description). Idempotent.
 *
 * Spec: docs/search-discovery-overhaul/02-eid.md §5.1
 *       docs/search-discovery-overhaul/03-service-taxonomy-decision.md
 *
 * Categorization model:
 *   - Each row gets one canonical category. Order in RULES = priority;
 *     the first rule whose primary keywords match wins.
 *   - When primary keywords from MULTIPLE categories match, the winner
 *     becomes the category and the loser-categories' lowercased names
 *     become labels (with "full-service" added as a marker for cross-
 *     category packages). Matched primary keywords are also added as
 *     labels (lowercase-hyphenated, deduped). Secondary-keyword hits
 *     do NOT contribute labels — kept narrow on purpose.
 *   - "Full Detail" lands at EXTERIOR_WASH, not INTERIOR_CLEANING:
 *     industry research treats motorcoach detail as primarily an
 *     exterior service that includes interior work as a component.
 *
 * Modes:
 *   --dry-run   Print the proposed categorization grouped by confidence.
 *               No DB writes. This is the Phase 1B preview output that
 *               gets reviewed before the real run.
 *   (no flag)   Apply the assignments. Updates Service.category AND
 *               Service.labels in place. Re-runnable: labels converge to
 *               the proposed set; they do not accumulate.
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

// Priority order matters. The first rule whose primary keywords match
// wins the category assignment. EXTERIOR_WASH sits above INTERIOR_CLEANING
// because "detail" is a primary EXTERIOR_WASH keyword and "Full Detail"
// services should land at EXTERIOR_WASH (industry standard).
const RULES: Array<{
  category: Category;
  primary: string[];   // HIGH-confidence keywords; also feed label generation
  secondary: string[]; // MEDIUM-confidence keywords; not labeled
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
      "detail",
    ],
    secondary: ["wash", "express"],
  },
  {
    category: "INTERIOR_CLEANING",
    primary: ["interior", "vacuum", "carpet", "upholstery", "upholster"],
    secondary: ["deep clean", "sanitize", "sanitization"],
  },
];

// Map a category to the lowercase label form used when it appears as a
// secondary match. Distinct from the keyword text — this is a stable label
// vocabulary the search UI can group on later.
const CATEGORY_LABEL: Record<Category, string> = {
  EXTERIOR_WASH: "exterior",
  INTERIOR_CLEANING: "interior",
  RESTROOM_DUMP: "restroom-dump",
  RESTOCK_CONSUMABLES: "restock",
  ADD_ON: "add-on",
};

function toLabel(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "-");
}

function classify(name: string, description: string | null): {
  category: Category;
  triggers: string[];
  labels: string[];
  confidence: Confidence;
} {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();

  // Whole-word match: spaces/hyphens use raw includes; single-word keywords
  // use word-boundary regex.
  const matches = (kw: string) => {
    const lk = kw.toLowerCase();
    if (lk.includes(" ") || lk.includes("-")) {
      return haystack.includes(lk);
    }
    const re = new RegExp(`\\b${lk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(haystack);
  };

  // First pass: gather every category whose primary keywords match.
  const primaryMatches: Array<{ rule: typeof RULES[number]; hits: string[] }> = [];
  for (const rule of RULES) {
    const hits = rule.primary.filter(matches);
    if (hits.length > 0) primaryMatches.push({ rule, hits });
  }

  if (primaryMatches.length > 0) {
    // Winner = first in RULES order (= highest priority).
    const winner = primaryMatches[0];
    const losers = primaryMatches.slice(1);

    // Labels: matched-keyword tokens (lowercase-hyphenated, deduped),
    // plus the loser categories' label forms, plus "full-service" if
    // there's any cross-category overlap.
    const labelSet = new Set<string>();
    for (const { hits } of primaryMatches) {
      for (const h of hits) labelSet.add(toLabel(h));
    }
    for (const { rule } of losers) {
      labelSet.add(CATEGORY_LABEL[rule.category]);
    }
    if (losers.length > 0) labelSet.add("full-service");

    // Don't include the winner's own category label as a redundant label.
    labelSet.delete(CATEGORY_LABEL[winner.rule.category]);

    return {
      category: winner.rule.category,
      triggers: winner.hits,
      labels: [...labelSet].sort(),
      confidence: "HIGH",
    };
  }

  // No primary match anywhere — fall through to secondary keywords.
  for (const rule of RULES) {
    const hits = rule.secondary.filter(matches);
    if (hits.length > 0) {
      return {
        category: rule.category,
        triggers: hits,
        labels: [],
        confidence: "MEDIUM",
      };
    }
  }

  return {
    category: "EXTERIOR_WASH",
    triggers: [],
    labels: [],
    confidence: "LOW",
  };
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  const services = await prisma.service.findMany({
    select: { id: true, name: true, description: true, category: true, labels: true },
    orderBy: { name: "asc" },
  });

  type Row = {
    id: string;
    name: string;
    description: string | null;
    current: Category;
    currentLabels: string[];
    proposed: Category;
    proposedLabels: string[];
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
      currentLabels: s.labels ?? [],
      proposed: r.category,
      proposedLabels: r.labels,
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
      const labelsStr = r.proposedLabels.length ? `[${r.proposedLabels.join(", ")}]` : "[]";
      console.log(`  ${r.id}`);
      console.log(`    name:           ${r.name}`);
      if (r.description) console.log(`    description:    ${truncate(r.description, 80)}`);
      console.log(`    current cat:    ${r.current}`);
      console.log(`    current labels: ${r.currentLabels.length ? `[${r.currentLabels.join(", ")}]` : "[]"}`);
      console.log(`    proposed cat:   ${r.proposed}    ${trig}`);
      console.log(`    proposed labels: ${labelsStr}`);
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

  // Label-population summary.
  const withLabels = rows.filter((r) => r.proposedLabels.length > 0).length;
  console.log(`\n── Label population ──`);
  console.log(`  Rows with labels:    ${withLabels}`);
  console.log(`  Rows without labels: ${rows.length - withLabels}`);

  if (isDryRun) {
    console.log("\nDry run complete. No DB writes. Re-run without --dry-run to apply.");
    return;
  }

  // Apply: update any row whose proposed category OR proposed labels differ
  // from the current state.
  const toUpdate = rows.filter(
    (r) => r.current !== r.proposed || !arraysEqual(r.currentLabels, r.proposedLabels)
  );
  console.log(`\nApplying ${toUpdate.length} update${toUpdate.length === 1 ? "" : "s"}…`);

  for (const r of toUpdate) {
    await prisma.service.update({
      where: { id: r.id },
      data: { category: r.proposed, labels: r.proposedLabels },
    });
  }

  console.log(`Done. Row count unchanged: ${rows.length}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
