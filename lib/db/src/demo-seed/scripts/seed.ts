import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { SEED_MODES, MASTER_SEED, SEED_VERSION, SERVICE_TEMPLATES, VEHICLE_CATEGORIES, OPERATING_HOURS_TEMPLATES } from "../config.js";
import type { SeedMode } from "../config.js";
import { REGIONS } from "../regions.js";
import { STABLE_PERSONAS } from "../personas.js";
import { SeededRandom } from "../generators/seed-random.js";
import { PROVIDER_NAME_PARTS, PROVIDER_TEMPLATES, SERVICE_OFFERINGS, STREET_NAMES } from "../templates/providers.js";
import { FLEET_NAME_PARTS, FLEET_TEMPLATES } from "../templates/fleets.js";
import { FIRST_NAMES, LAST_NAMES, PHONE_AREA_CODES } from "../templates/drivers.js";

const prisma = new PrismaClient();

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_PASSWORD = hashPasswordSync("password123");

async function main() {
  const modeArg = process.argv[2] as SeedMode | undefined;
  const mode = modeArg && SEED_MODES[modeArg] ? modeArg : "demo-full";
  const config = SEED_MODES[mode];
  const batchId = `seed-${mode}-v${SEED_VERSION}-${Date.now()}`;

  console.log(`\n═══ WashBuddy Demo Seed — ${mode.toUpperCase()} ═══`);
  console.log(`Batch: ${batchId}\n`);

  const rng = new SeededRandom(MASTER_SEED);

  const registryBuffer: {
    tableName: string;
    recordId: string;
    seedBatchId: string;
    seedMode: string;
    seedRegionCode?: string;
    demoScenarioCode?: string;
    demoPersonaCode?: string;
  }[] = [];

  function track(tableName: string, recordId: string, regionCode?: string, personaCode?: string, scenarioCode?: string) {
    registryBuffer.push({
      tableName,
      recordId,
      seedBatchId: batchId,
      seedMode: mode,
      seedRegionCode: regionCode || null as any,
      demoScenarioCode: scenarioCode || null as any,
      demoPersonaCode: personaCode || null as any,
    });
  }

  console.log("Phase 1: Personas...");
  const personaUsers: Record<string, string> = {};
  for (const persona of STABLE_PERSONAS) {
    const existing = await prisma.user.findUnique({ where: { email: persona.email } });
    if (existing) {
      personaUsers[persona.code] = existing.id;
      continue;
    }
    const user = await prisma.user.create({
      data: {
        email: persona.email,
        phoneE164: persona.phone,
        firstName: persona.firstName,
        lastName: persona.lastName,
        passwordHash: DEFAULT_PASSWORD,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    personaUsers[persona.code] = user.id;
    track("users", user.id, undefined, persona.code);
    console.log(`  Created persona: ${persona.code} → ${persona.email}`);
  }

  console.log("\nPhase 2: Providers & Locations...");
  const allProviderIds: string[] = [];
  const allLocationIds: string[] = [];
  const locationsByRegion: Record<string, string[]> = {};

  let providerIndex = 0;
  let locationIndex = 0;
  const usedProviderNames = new Set<string>();

  for (const region of REGIONS) {
    const regionRng = rng.fork(`region-${region.code}`);
    locationsByRegion[region.code] = [];
    const providerCount = config.providersPerRegion;

    for (let pi = 0; pi < providerCount; pi++) {
      let providerName: string;
      do {
        const prefix = regionRng.pick(PROVIDER_NAME_PARTS.prefixes);
        const suffix = regionRng.pick(PROVIDER_NAME_PARTS.suffixes);
        providerName = `${prefix} ${suffix}`;
      } while (usedProviderNames.has(providerName));
      usedProviderNames.add(providerName);

      const provider = await prisma.provider.create({
        data: {
          name: providerName,
          payoutReady: regionRng.bool(0.6),
          isActive: true,
        },
      });
      allProviderIds.push(provider.id);
      track("providers", provider.id, region.code);
      providerIndex++;

      const locCount = regionRng.int(config.locationsPerProvider[0], config.locationsPerProvider[1]);

      for (let li = 0; li < locCount; li++) {
        const city = regionRng.pickWeighted(region.cities);
        const template = regionRng.pick(PROVIDER_TEMPLATES);
        const locationName = template.locationNamePattern
          .replace("{provider}", providerName.split(" ")[0])
          .replace("{city}", city.name);

        const latOffset = regionRng.float(-0.04, 0.04);
        const lngOffset = regionRng.float(-0.04, 0.04);
        const streetNum = regionRng.int(100, 9999);
        const streetName = regionRng.pick(STREET_NAMES);

        const postalSuffix = regionRng.int(10, 99).toString();
        const postalCode = region.countryCode === "CA"
          ? `${city.postalCodePrefix} ${regionRng.int(1, 9)}${String.fromCharCode(65 + regionRng.int(0, 25))}${regionRng.int(1, 9)}`
          : `${city.postalCodePrefix}${postalSuffix}`;

        const location = await prisma.location.create({
          data: {
            providerId: provider.id,
            name: locationName,
            timezone: region.timezone,
            addressLine1: `${streetNum} ${streetName}`,
            city: city.name,
            regionCode: city.regionCode,
            postalCode,
            countryCode: region.countryCode,
            latitude: city.center.lat + latOffset,
            longitude: city.center.lng + lngOffset,
            isVisible: true,
            responseSlaUnder1hMins: regionRng.pick([5, 10, 15]),
            responseSlaFutureMins: regionRng.pick([15, 30, 60]),
            bookingBufferMins: regionRng.pick([5, 10, 15]),
          },
        });
        allLocationIds.push(location.id);
        locationsByRegion[region.code].push(location.id);
        track("locations", location.id, region.code);
        locationIndex++;

        const hoursConfig = OPERATING_HOURS_TEMPLATES[template.hoursTemplate];
        const windowsData: { locationId: string; dayOfWeek: number; openTime: string; closeTime: string }[] = [];
        for (let d = 0; d < 7; d++) {
          const isWeekend = d === 0 || d === 6;
          const hours = isWeekend ? hoursConfig.weekend : hoursConfig.weekday;
          if (hours) {
            windowsData.push({
              locationId: location.id,
              dayOfWeek: d,
              openTime: hours.open,
              closeTime: hours.close,
            });
          }
        }
        if (windowsData.length > 0) {
          await prisma.operatingWindow.createMany({ data: windowsData });
        }

        const offering = SERVICE_OFFERINGS[template.serviceOffering];
        for (const svcName of offering) {
          const svcTemplate = SERVICE_TEMPLATES.find((t) => t.name === svcName);
          if (!svcTemplate) continue;

          const basePrice = regionRng.int(svcTemplate.basePriceMinorRange[0], svcTemplate.basePriceMinorRange[1]);
          const roundedPrice = Math.round(basePrice / 500) * 500;
          const platformFee = Math.round(roundedPrice * svcTemplate.platformFeePercent);
          const capacity = regionRng.int(svcTemplate.capacityPerSlot[0], svcTemplate.capacityPerSlot[1]);

          const service = await prisma.service.create({
            data: {
              locationId: location.id,
              name: svcTemplate.name,
              description: svcTemplate.description,
              category: svcTemplate.category,
              durationMins: svcTemplate.durationMins,
              basePriceMinor: roundedPrice,
              currencyCode: region.currencyCode,
              platformFeeMinor: platformFee,
              capacityPerSlot: capacity,
              leadTimeMins: svcTemplate.leadTimeMins,
              requiresConfirmation: regionRng.bool(0.7),
              isVisible: true,
            },
          });
          track("services", service.id, region.code);

          for (const vc of VEHICLE_CATEGORIES) {
            await prisma.serviceCompatibility.create({
              data: {
                serviceId: service.id,
                categoryCode: vc.categoryCode,
                subtypeCode: vc.subtypeCode,
                maxLengthInches: vc.lengthRange[1],
                maxHeightInches: vc.heightRange[1],
              },
            });
          }
        }
      }
    }

    console.log(`  [${region.code}] ${providerCount} providers, ${locationsByRegion[region.code].length} locations`);
  }

  console.log(`\n  Total: ${allProviderIds.length} providers, ${allLocationIds.length} locations`);

  console.log("\nPhase 3: Fleets & Drivers...");
  const fleetRng = rng.fork("fleets");
  const usedFleetNames = new Set<string>();
  const allFleetIds: string[] = [];
  const allDriverIds: string[] = [];

  for (let fi = 0; fi < config.fleetsTotal; fi++) {
    let fleetName: string;
    do {
      const prefix = fleetRng.pick(FLEET_NAME_PARTS.prefixes);
      const suffix = fleetRng.pick(FLEET_NAME_PARTS.suffixes);
      fleetName = `${prefix} ${suffix}`;
    } while (usedFleetNames.has(fleetName));
    usedFleetNames.add(fleetName);

    const template = fleetRng.pick(FLEET_TEMPLATES);
    const regionForFleet = fleetRng.pick(REGIONS);

    const fleet = await prisma.fleet.create({
      data: {
        name: fleetName,
        billingMode: template.billingMode,
        currencyCode: regionForFleet.currencyCode,
      },
    });
    allFleetIds.push(fleet.id);
    track("fleets", fleet.id, regionForFleet.code);

    const driversPerFleet = Math.ceil(config.driversTotal / config.fleetsTotal);
    const vehiclesPerFleet = fleetRng.int(config.vehiclesPerFleet[0], config.vehiclesPerFleet[1]);

    for (let di = 0; di < driversPerFleet && allDriverIds.length < config.driversTotal; di++) {
      const driverRng = fleetRng.fork(`driver-${fi}-${di}`);
      const firstName = driverRng.pick(FIRST_NAMES);
      const lastName = driverRng.pick(LAST_NAMES);
      const email = `demo.${firstName.toLowerCase()}.${lastName.toLowerCase()}.${fi}${di}@washbuddy-demo.com`;

      const areaCodes = PHONE_AREA_CODES[regionForFleet.code] || ["555"];
      const areaCode = driverRng.pick(areaCodes);
      const phone = `+1${areaCode}${driverRng.int(1000000, 9999999)}`;

      let driver;
      try {
        driver = await prisma.user.create({
          data: {
            email,
            phoneE164: phone,
            firstName,
            lastName,
            passwordHash: DEFAULT_PASSWORD,
            isActive: true,
            emailVerifiedAt: new Date(),
          },
        });
      } catch {
        continue;
      }

      allDriverIds.push(driver.id);
      track("users", driver.id, regionForFleet.code);

      await prisma.fleetMembership.create({
        data: {
          fleetId: fleet.id,
          userId: driver.id,
          role: "DRIVER",
          isActive: true,
        },
      });
    }

    for (let vi = 0; vi < vehiclesPerFleet; vi++) {
      const vRng = fleetRng.fork(`vehicle-${fi}-${vi}`);
      const vc = vRng.pick(VEHICLE_CATEGORIES);
      const unitNumber = `${fleetName.split(" ").map(w => w[0]).join("")}-${(100 + vi).toString()}`;

      await prisma.vehicle.create({
        data: {
          fleetId: fleet.id,
          categoryCode: vc.categoryCode,
          subtypeCode: vc.subtypeCode,
          lengthInches: vRng.int(vc.lengthRange[0], vc.lengthRange[1]),
          heightInches: vRng.int(vc.heightRange[0], vc.heightRange[1]),
          hasRestroom: vRng.bool(vc.restroomChance),
          unitNumber,
          licensePlate: `DEMO-${providerIndex}-${vi}`,
          isActive: true,
        },
      });
    }
  }

  console.log(`  ${allFleetIds.length} fleets, ${allDriverIds.length} drivers`);

  console.log("\nPhase 4: Writing registry...");
  if (registryBuffer.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < registryBuffer.length; i += BATCH_SIZE) {
      const batch = registryBuffer.slice(i, i + BATCH_SIZE);
      await prisma.demoDataRegistry.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  }
  console.log(`  ${registryBuffer.length} registry entries written`);

  console.log(`\n✅ Seed complete!`);
  console.log(`   ${allProviderIds.length} providers`);
  console.log(`   ${allLocationIds.length} locations`);
  console.log(`   ${allFleetIds.length} fleets`);
  console.log(`   ${allDriverIds.length} drivers`);
  console.log(`   Batch: ${batchId}\n`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
