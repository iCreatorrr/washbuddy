/**
 * Flip every existing service to instant-book (requires_confirmation=false).
 *
 * Why: drivers were stuck waiting for provider confirmation on services
 * that should have flowed straight through. The schema default now matches
 * (false), but the rows already in the table were created when the default
 * was true. This idempotent one-shot brings them in line.
 *
 * Idempotent: safe to re-run. Reports counts before and after.
 *
 * Run: pnpm --filter @workspace/db exec tsx src/demo-seed/scripts/backfill-services-instant-book.ts
 */

import { prisma } from "../../index";

async function main() {
  const before = await prisma.service.groupBy({
    by: ["requiresConfirmation"],
    _count: { _all: true },
  });

  const beforeTrue = before.find((g) => g.requiresConfirmation === true)?._count._all ?? 0;
  const beforeFalse = before.find((g) => g.requiresConfirmation === false)?._count._all ?? 0;

  console.log("Before:");
  console.log(`  requires_confirmation=true:  ${beforeTrue}`);
  console.log(`  requires_confirmation=false: ${beforeFalse}`);

  const { count } = await prisma.service.updateMany({
    where: { requiresConfirmation: true },
    data: { requiresConfirmation: false },
  });

  console.log(`\nFlipped ${count} service${count === 1 ? "" : "s"} to instant-book.`);

  const after = await prisma.service.groupBy({
    by: ["requiresConfirmation"],
    _count: { _all: true },
  });
  const afterTrue = after.find((g) => g.requiresConfirmation === true)?._count._all ?? 0;
  const afterFalse = after.find((g) => g.requiresConfirmation === false)?._count._all ?? 0;

  console.log("\nAfter:");
  console.log(`  requires_confirmation=true:  ${afterTrue}`);
  console.log(`  requires_confirmation=false: ${afterFalse}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
