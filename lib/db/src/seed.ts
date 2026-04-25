import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_PASSWORD = hashPasswordSync("password123");

async function main() {
  console.log("Seeding database...");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@washbuddy.com" },
    update: {},
    create: {
      email: "admin@washbuddy.com",
      firstName: "Platform",
      lastName: "Admin",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driver1 = await prisma.user.upsert({
    where: { email: "driver1@example.com" },
    update: {},
    create: {
      email: "driver1@example.com",
      phoneE164: "+12125551001",
      firstName: "Mike",
      lastName: "Johnson",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driver2 = await prisma.user.upsert({
    where: { email: "driver2@example.com" },
    update: {},
    create: {
      email: "driver2@example.com",
      phoneE164: "+12125551002",
      firstName: "Sarah",
      lastName: "Williams",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const fleetAdmin = await prisma.user.upsert({
    where: { email: "fleet.admin@northeastbus.com" },
    update: {},
    create: {
      email: "fleet.admin@northeastbus.com",
      phoneE164: "+12125551003",
      firstName: "Tom",
      lastName: "Richards",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const providerOwner1 = await prisma.user.upsert({
    where: { email: "owner@cleanbus-nyc.com" },
    update: {},
    create: {
      email: "owner@cleanbus-nyc.com",
      phoneE164: "+12125551010",
      firstName: "James",
      lastName: "Chen",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const providerOwner2 = await prisma.user.upsert({
    where: { email: "owner@sparklewash-nj.com" },
    update: {},
    create: {
      email: "owner@sparklewash-nj.com",
      phoneE164: "+12015551020",
      firstName: "Linda",
      lastName: "Martinez",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const providerStaff1 = await prisma.user.upsert({
    where: { email: "staff@cleanbus-nyc.com" },
    update: {},
    create: {
      email: "staff@cleanbus-nyc.com",
      phoneE164: "+12125551011",
      firstName: "Kevin",
      lastName: "Park",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const fleet = await prisma.fleet.upsert({
    where: { id: "00000000-0000-4000-a000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-a000-000000000001",
      name: "Northeast Bus Lines",
      billingMode: "FLEET_PAYS",
      currencyCode: "USD",
      requireVehicleAssignMins: 30,
    },
  });

  await prisma.userPlatformRole.upsert({
    where: { userId_role: { userId: adminUser.id, role: "PLATFORM_SUPER_ADMIN" } },
    update: {},
    create: {
      userId: adminUser.id,
      role: "PLATFORM_SUPER_ADMIN",
      isActive: true,
    },
  });

  await prisma.fleetMembership.upsert({
    where: { fleetId_userId: { fleetId: fleet.id, userId: fleetAdmin.id } },
    update: {},
    create: {
      fleetId: fleet.id,
      userId: fleetAdmin.id,
      role: "FLEET_ADMIN",
      isActive: true,
    },
  });

  await prisma.fleetMembership.upsert({
    where: { fleetId_userId: { fleetId: fleet.id, userId: driver1.id } },
    update: {},
    create: {
      fleetId: fleet.id,
      userId: driver1.id,
      role: "DRIVER",
      isActive: true,
    },
  });

  const provider1 = await prisma.provider.upsert({
    where: { id: "00000000-0000-4000-b000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-b000-000000000001",
      name: "CleanBus NYC",
      payoutReady: false,
      isActive: true,
    },
  });

  const provider2 = await prisma.provider.upsert({
    where: { id: "00000000-0000-4000-b000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-4000-b000-000000000002",
      name: "Sparkle Wash NJ",
      payoutReady: false,
      isActive: true,
    },
  });

  await prisma.providerMembership.upsert({
    where: {
      providerId_userId_locationId: {
        providerId: provider1.id,
        userId: providerOwner1.id,
        locationId: "00000000-0000-0000-0000-000000000000",
      },
    },
    update: {},
    create: {
      providerId: provider1.id,
      userId: providerOwner1.id,
      role: "PROVIDER_ADMIN",
      isActive: true,
    },
  });

  await prisma.providerMembership.upsert({
    where: {
      providerId_userId_locationId: {
        providerId: provider2.id,
        userId: providerOwner2.id,
        locationId: "00000000-0000-0000-0000-000000000000",
      },
    },
    update: {},
    create: {
      providerId: provider2.id,
      userId: providerOwner2.id,
      role: "PROVIDER_ADMIN",
      isActive: true,
    },
  });

  const locationNYC = await prisma.location.upsert({
    where: { id: "00000000-0000-4000-c000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-c000-000000000001",
      providerId: provider1.id,
      name: "CleanBus NYC - Bronx Depot",
      timezone: "America/New_York",
      addressLine1: "1200 Zerega Ave",
      city: "Bronx",
      regionCode: "NY",
      postalCode: "10462",
      countryCode: "US",
      latitude: 40.8341,
      longitude: -73.8467,
      responseSlaUnder1hMins: 5,
      responseSlaFutureMins: 15,
      bookingBufferMins: 5,
      isVisible: true,
    },
  });

  const locationNJ = await prisma.location.upsert({
    where: { id: "00000000-0000-4000-c000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-4000-c000-000000000002",
      providerId: provider2.id,
      name: "Sparkle Wash - Newark Yard",
      timezone: "America/New_York",
      addressLine1: "450 Doremus Ave",
      city: "Newark",
      regionCode: "NJ",
      postalCode: "07105",
      countryCode: "US",
      latitude: 40.7178,
      longitude: -74.1322,
      responseSlaUnder1hMins: 5,
      responseSlaFutureMins: 15,
      bookingBufferMins: 5,
      isVisible: true,
    },
  });

  const locationCT = await prisma.location.upsert({
    where: { id: "00000000-0000-4000-c000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-4000-c000-000000000003",
      providerId: provider1.id,
      name: "CleanBus NYC - Hartford Hub",
      timezone: "America/New_York",
      addressLine1: "95 Leibert Rd",
      city: "Hartford",
      regionCode: "CT",
      postalCode: "06120",
      countryCode: "US",
      latitude: 41.7876,
      longitude: -72.6534,
      responseSlaUnder1hMins: 5,
      responseSlaFutureMins: 15,
      bookingBufferMins: 10,
      isVisible: true,
    },
  });

  const days = [0, 1, 2, 3, 4, 5, 6];
  for (const loc of [locationNYC, locationNJ, locationCT]) {
    for (const day of days) {
      const openTime = day === 0 ? "08:00" : "06:00";
      const closeTime = day === 0 ? "16:00" : "20:00";
      await prisma.operatingWindow.upsert({
        where: {
          locationId_dayOfWeek_openTime: {
            locationId: loc.id,
            dayOfWeek: day,
            openTime,
          },
        },
        update: {},
        create: {
          locationId: loc.id,
          dayOfWeek: day,
          openTime,
          closeTime,
        },
      });
    }
  }

  await prisma.providerMembership.upsert({
    where: {
      providerId_userId_locationId: {
        providerId: provider1.id,
        userId: providerStaff1.id,
        locationId: locationNYC.id,
      },
    },
    update: {},
    create: {
      providerId: provider1.id,
      userId: providerStaff1.id,
      locationId: locationNYC.id,
      role: "PROVIDER_STAFF",
      isActive: true,
    },
  });

  const serviceExterior = await prisma.service.upsert({
    where: { id: "00000000-0000-4000-d000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-d000-000000000001",
      locationId: locationNYC.id,
      name: "Exterior Bus Wash",
      description: "Full exterior wash for standard and coach buses",
      durationMins: 30,
      basePriceMinor: 15000,
      currencyCode: "USD",
      platformFeeMinor: 2500,
      capacityPerSlot: 2,
      leadTimeMins: 60,
      requiresConfirmation: false,
      isVisible: true,
    },
  });

  const serviceFullDetail = await prisma.service.upsert({
    where: { id: "00000000-0000-4000-d000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-4000-d000-000000000002",
      locationId: locationNYC.id,
      name: "Full Detail Wash",
      description: "Interior and exterior deep clean for all bus types",
      durationMins: 90,
      basePriceMinor: 35000,
      currencyCode: "USD",
      platformFeeMinor: 5000,
      capacityPerSlot: 1,
      leadTimeMins: 120,
      requiresConfirmation: false,
      isVisible: true,
    },
  });

  await prisma.service.upsert({
    where: { id: "00000000-0000-4000-d000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-4000-d000-000000000003",
      locationId: locationNJ.id,
      name: "Exterior Bus Wash",
      description: "Quick exterior wash",
      durationMins: 30,
      basePriceMinor: 12500,
      currencyCode: "USD",
      platformFeeMinor: 2000,
      capacityPerSlot: 3,
      leadTimeMins: 30,
      requiresConfirmation: false,
      isVisible: true,
    },
  });

  await prisma.service.upsert({
    where: { id: "00000000-0000-4000-d000-000000000004" },
    update: {},
    create: {
      id: "00000000-0000-4000-d000-000000000004",
      locationId: locationCT.id,
      name: "Exterior Bus Wash",
      description: "Standard exterior wash",
      durationMins: 45,
      basePriceMinor: 14000,
      currencyCode: "USD",
      platformFeeMinor: 2500,
      capacityPerSlot: 1,
      leadTimeMins: 60,
      requiresConfirmation: false,
      isVisible: true,
    },
  });

  await prisma.serviceCompatibility.upsert({
    where: {
      serviceId_categoryCode_subtypeCode: {
        serviceId: serviceExterior.id,
        categoryCode: "BUS",
        subtypeCode: "STANDARD",
      },
    },
    update: {},
    create: {
      serviceId: serviceExterior.id,
      categoryCode: "BUS",
      subtypeCode: "STANDARD",
      maxLengthInches: 540,
      maxHeightInches: 144,
    },
  });

  await prisma.serviceCompatibility.upsert({
    where: {
      serviceId_categoryCode_subtypeCode: {
        serviceId: serviceExterior.id,
        categoryCode: "BUS",
        subtypeCode: "COACH",
      },
    },
    update: {},
    create: {
      serviceId: serviceExterior.id,
      categoryCode: "BUS",
      subtypeCode: "COACH",
      maxLengthInches: 540,
      maxHeightInches: 162,
    },
  });

  await prisma.serviceCompatibility.upsert({
    where: {
      serviceId_categoryCode_subtypeCode: {
        serviceId: serviceFullDetail.id,
        categoryCode: "BUS",
        subtypeCode: "STANDARD",
      },
    },
    update: {},
    create: {
      serviceId: serviceFullDetail.id,
      categoryCode: "BUS",
      subtypeCode: "STANDARD",
      maxLengthInches: 480,
      maxHeightInches: 144,
    },
  });

  await prisma.serviceCompatibility.upsert({
    where: {
      serviceId_categoryCode_subtypeCode: {
        serviceId: serviceFullDetail.id,
        categoryCode: "BUS",
        subtypeCode: "COACH",
      },
    },
    update: {},
    create: {
      serviceId: serviceFullDetail.id,
      categoryCode: "BUS",
      subtypeCode: "COACH",
      maxLengthInches: 480,
      maxHeightInches: 162,
    },
  });

  for (const svcId of [
    "00000000-0000-4000-d000-000000000003",
    "00000000-0000-4000-d000-000000000004",
  ]) {
    for (const subtype of ["STANDARD", "COACH", "SHUTTLE"]) {
      await prisma.serviceCompatibility.upsert({
        where: {
          serviceId_categoryCode_subtypeCode: {
            serviceId: svcId,
            categoryCode: "BUS",
            subtypeCode: subtype,
          },
        },
        update: {},
        create: {
          serviceId: svcId,
          categoryCode: "BUS",
          subtypeCode: subtype,
          maxLengthInches: 540,
          maxHeightInches: 162,
        },
      });
    }
  }

  const vehicle1 = await prisma.vehicle.upsert({
    where: { id: "00000000-0000-4000-e000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-e000-000000000001",
      fleetId: fleet.id,
      categoryCode: "BUS",
      subtypeCode: "STANDARD",
      lengthInches: 480,
      heightInches: 132,
      hasRestroom: false,
      unitNumber: "NEB-101",
      licensePlate: "NY-BUS-101",
      isActive: true,
    },
  });

  await prisma.vehicle.upsert({
    where: { id: "00000000-0000-4000-e000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-4000-e000-000000000002",
      fleetId: fleet.id,
      categoryCode: "BUS",
      subtypeCode: "COACH",
      lengthInches: 540,
      heightInches: 156,
      hasRestroom: true,
      unitNumber: "NEB-201",
      licensePlate: "NY-BUS-201",
      isActive: true,
    },
  });

  await prisma.vehicle.upsert({
    where: { id: "00000000-0000-4000-e000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-4000-e000-000000000003",
      fleetId: fleet.id,
      categoryCode: "BUS",
      subtypeCode: "SHUTTLE",
      lengthInches: 300,
      heightInches: 108,
      hasRestroom: false,
      unitNumber: "NEB-301",
      licensePlate: "NY-BUS-301",
      isActive: true,
    },
  });

  await prisma.vehicle.upsert({
    where: { id: "00000000-0000-4000-e000-000000000004" },
    update: {},
    create: {
      id: "00000000-0000-4000-e000-000000000004",
      ownerUserId: driver2.id,
      categoryCode: "BUS",
      subtypeCode: "STANDARD",
      lengthInches: 420,
      heightInches: 126,
      hasRestroom: false,
      unitNumber: "IND-001",
      licensePlate: "NJ-IND-001",
      isActive: true,
    },
  });

  console.log("Seed completed successfully!");
  console.log(`  Users: 7`);
  console.log(`  Fleet: 1 (Northeast Bus Lines)`);
  console.log(`  Providers: 2 (CleanBus NYC, Sparkle Wash NJ)`);
  console.log(`  Locations: 3 (Bronx, Newark, Hartford)`);
  console.log(`  Services: 4`);
  console.log(`  Vehicles: 4`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
