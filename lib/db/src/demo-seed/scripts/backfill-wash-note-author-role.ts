/**
 * Backfill WashNote.authorRole for existing rows. The new column has a
 * default of "PROVIDER", so a fresh `db:push` will set every row to
 * PROVIDER — but that mislabels notes a driver or fleet admin already
 * authored. Resolve from the author's roles and rewrite.
 *
 * Heuristic (per the spec):
 *   - Provider role on user (PROVIDER_ADMIN | PROVIDER_STAFF) → PROVIDER
 *   - Driver role                                              → DRIVER
 *   - Fleet admin role (FLEET_ADMIN)                           → FLEET
 *   - Multiple roles or lookup miss                            → PROVIDER
 *
 * Idempotent: safe to re-run. Reports counts so a stray PROVIDER bias
 * is visible in the output.
 *
 * Run: pnpm --filter @workspace/db exec tsx \
 *      src/demo-seed/scripts/backfill-wash-note-author-role.ts
 */

import { prisma } from "../../index";

type Role = "PROVIDER" | "DRIVER" | "FLEET";

async function resolveAuthorRole(authorId: string): Promise<Role> {
  const memberships = await prisma.providerMembership.findMany({
    where: { userId: authorId, isActive: true },
    select: { role: true },
  });
  const isProvider = memberships.some((m) => m.role === "PROVIDER_ADMIN" || m.role === "PROVIDER_STAFF");

  const fleetMemberships = await prisma.fleetMembership.findMany({
    where: { userId: authorId, isActive: true },
    select: { role: true },
  });
  const isDriver = fleetMemberships.some((m) => m.role === "DRIVER");
  const isFleetAdmin = fleetMemberships.some((m) => m.role === "FLEET_ADMIN");

  // Single-role users get a clean answer. Multi-role users fall back to
  // PROVIDER (the safe default for existing seed data, which is mostly
  // James-authored walk-in notes). Order of preference: provider role
  // wins on ambiguity, then fleet, then driver.
  if (isProvider && !isDriver && !isFleetAdmin) return "PROVIDER";
  if (isDriver && !isProvider && !isFleetAdmin) return "DRIVER";
  if (isFleetAdmin && !isProvider) return "FLEET";
  return "PROVIDER";
}

async function main() {
  const notes = await prisma.washNote.findMany({
    select: { id: true, authorId: true, authorRole: true },
  });

  console.log(`Inspecting ${notes.length} wash notes...`);

  // Cache role lookups — many notes are authored by the same handful of
  // users (operators, drivers).
  const cache = new Map<string, Role>();

  const counts = { PROVIDER: 0, DRIVER: 0, FLEET: 0, unchanged: 0 };

  for (const note of notes) {
    if (!cache.has(note.authorId)) {
      cache.set(note.authorId, await resolveAuthorRole(note.authorId));
    }
    const target = cache.get(note.authorId)!;
    if (note.authorRole === target) {
      counts.unchanged += 1;
      continue;
    }
    await prisma.washNote.update({
      where: { id: note.id },
      data: { authorRole: target },
    });
    counts[target] += 1;
  }

  console.log("\nBackfill summary:");
  console.log(`  rewritten → PROVIDER: ${counts.PROVIDER}`);
  console.log(`  rewritten → DRIVER:   ${counts.DRIVER}`);
  console.log(`  rewritten → FLEET:    ${counts.FLEET}`);
  console.log(`  already correct:      ${counts.unchanged}`);
  console.log(`  total inspected:      ${notes.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
