/**
 * One-off setup: configure the MetroClean Bronx location's three bays with
 * differentiated supportedClasses so tightest-fit auto-assignment can be
 * meaningfully verified.
 *
 *   Bay 1 → [SMALL, MEDIUM]
 *   Bay 2 → [SMALL, MEDIUM, LARGE]
 *   Bay 3 → [MEDIUM, LARGE, EXTRA_LARGE]
 *
 * With these three bays free and a MEDIUM booking, pickTightestFit should
 * pick Bay 1 (2 supportedClasses — fewest), even though Bay 2 and Bay 3
 * also qualify. If the location has fewer than 3 bays, the script creates
 * the missing ones. Run:
 *
 *     pnpm --filter @workspace/db run demo:configure-bronx-bays
 */

import { prisma } from "../../index";

const BAY_CONFIG = [
  { name: "Bay 1", supportedClasses: ["SMALL", "MEDIUM"],                       maxLen: 360, maxHeight: 144, order: 0 },
  { name: "Bay 2", supportedClasses: ["SMALL", "MEDIUM", "LARGE"],              maxLen: 540, maxHeight: 156, order: 1 },
  { name: "Bay 3", supportedClasses: ["MEDIUM", "LARGE", "EXTRA_LARGE"],        maxLen: 720, maxHeight: 168, order: 2 },
];

async function main() {
  const loc = await prisma.location.findFirst({
    where: { name: { contains: "Bronx", mode: "insensitive" }, provider: { name: { contains: "MetroClean", mode: "insensitive" } } },
    select: { id: true, name: true, provider: { select: { name: true } } },
  });
  if (!loc) {
    console.error("Could not find a MetroClean Bronx location. Check the seed.");
    process.exit(1);
  }
  console.log(`Configuring bays for ${loc.provider.name} — ${loc.name}\n`);

  const existing = await prisma.washBay.findMany({
    where: { locationId: loc.id },
    orderBy: { displayOrder: "asc" },
  });

  for (const cfg of BAY_CONFIG) {
    // Prefer match-by-name so we don't collide with random existing bays.
    const existingBay = existing.find((b) => b.name.toLowerCase() === cfg.name.toLowerCase()) ?? existing[cfg.order];
    if (existingBay) {
      await prisma.washBay.update({
        where: { id: existingBay.id },
        data: {
          name: cfg.name,
          supportedClasses: cfg.supportedClasses,
          maxVehicleLengthIn: cfg.maxLen,
          maxVehicleHeightIn: cfg.maxHeight,
          displayOrder: cfg.order,
          isActive: true,
          outOfServiceSince: null,
          outOfServiceReason: null,
          outOfServiceEstReturn: null,
        },
      });
      console.log(`  ✓ Updated ${cfg.name} → [${cfg.supportedClasses.join(", ")}]`);
    } else {
      await prisma.washBay.create({
        data: {
          locationId: loc.id,
          name: cfg.name,
          supportedClasses: cfg.supportedClasses,
          maxVehicleLengthIn: cfg.maxLen,
          maxVehicleHeightIn: cfg.maxHeight,
          displayOrder: cfg.order,
          isActive: true,
        },
      });
      console.log(`  ✓ Created ${cfg.name} → [${cfg.supportedClasses.join(", ")}]`);
    }
  }

  const finalBays = await prisma.washBay.findMany({
    where: { locationId: loc.id, isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { name: true, supportedClasses: true },
  });
  console.log(`\nFinal bay config at ${loc.name}:`);
  for (const b of finalBays) console.log(`  ${b.name} → [${b.supportedClasses.join(", ")}]`);
  console.log("\nNext: book a MEDIUM wash at this location — it should auto-assign to Bay 1 (tightest fit).");
}

main().then(() => prisma.$disconnect()).catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
