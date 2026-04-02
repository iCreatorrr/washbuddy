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
  console.log("\n═══ WashBuddy Fleet Extended Seed ═══\n");

  const existingFleet = await prisma.fleet.findFirst({
    where: { name: "Northeast Express" },
  });

  let fleetId: string;

  if (existingFleet) {
    fleetId = existingFleet.id;
    console.log(`Found existing fleet: ${existingFleet.name} (${fleetId})`);

    await prisma.fleet.update({
      where: { id: fleetId },
      data: {
        status: "ACTIVE",
        defaultTimezone: "America/New_York",
        requestPolicyJson: {
          driver_requests_enabled: true,
          request_expiration_mode: "AUTO_APPROVE",
          request_expiration_minutes: 120,
          driver_reconfirm_required_on_modification: true,
          driver_reconfirm_timeout_minutes: 60,
          default_provider_selection_mode: "PREFERRED_THEN_FALLBACK",
          fallback_slot_tolerance_minutes: 60,
          auto_book_recurring_programs: false,
          allow_driver_freeform_requests: true,
          require_minimum_driver_request_time_window: "NEXT_24H",
        },
      },
    });
    console.log("  Updated fleet with policy and status");
  } else {
    const fleet = await prisma.fleet.create({
      data: {
        name: "Northeast Express",
        status: "ACTIVE",
        billingMode: "FLEET_PAYS",
        currencyCode: "USD",
        defaultTimezone: "America/New_York",
        requestPolicyJson: {
          driver_requests_enabled: true,
          request_expiration_mode: "AUTO_APPROVE",
          request_expiration_minutes: 120,
          driver_reconfirm_required_on_modification: true,
          driver_reconfirm_timeout_minutes: 60,
          default_provider_selection_mode: "PREFERRED_THEN_FALLBACK",
          fallback_slot_tolerance_minutes: 60,
          auto_book_recurring_programs: false,
          allow_driver_freeform_requests: true,
          require_minimum_driver_request_time_window: "NEXT_24H",
        },
      },
    });
    fleetId = fleet.id;
    console.log(`Created fleet: Northeast Express (${fleetId})`);
  }

  console.log("\nPhase 1: Fleet Depots...");
  const depotDefs = [
    { name: "Manhattan Depot", timezone: "America/New_York", city: "New York", regionCode: "NY", postalCode: "10001", addressLine1: "450 W 33rd St" },
    { name: "Bronx Depot", timezone: "America/New_York", city: "Bronx", regionCode: "NY", postalCode: "10451", addressLine1: "275 E 138th St" },
    { name: "Newark Depot", timezone: "America/New_York", city: "Newark", regionCode: "NJ", postalCode: "07102", addressLine1: "100 Broad St" },
  ];

  const depotIds: string[] = [];
  for (const def of depotDefs) {
    const existing = await prisma.fleetDepot.findFirst({
      where: { fleetId, name: def.name },
    });
    if (existing) {
      depotIds.push(existing.id);
      console.log(`  Depot exists: ${def.name}`);
      continue;
    }
    const depot = await prisma.fleetDepot.create({
      data: {
        fleetId,
        name: def.name,
        timezone: def.timezone,
        city: def.city,
        regionCode: def.regionCode,
        postalCode: def.postalCode,
        addressLine1: def.addressLine1,
        countryCode: "US",
        defaultProviderPreferencesJson: {},
      },
    });
    depotIds.push(depot.id);
    console.log(`  Created depot: ${def.name}`);
  }

  console.log("\nPhase 2: Vehicle Groups...");
  const groupDefs = [
    { name: "Motorcoach Fleet", criteriaJson: { categoryCode: "motorcoach" } },
    { name: "School Bus Fleet", criteriaJson: { categoryCode: "school_bus" } },
    { name: "Transit Fleet", criteriaJson: { categoryCode: "transit" } },
    { name: "Priority Vehicles", criteriaJson: { priority: true } },
  ];

  const groupIds: string[] = [];
  for (const def of groupDefs) {
    const existing = await prisma.fleetVehicleGroup.findFirst({
      where: { fleetId, name: def.name },
    });
    if (existing) {
      groupIds.push(existing.id);
      console.log(`  Group exists: ${def.name}`);
      continue;
    }
    const group = await prisma.fleetVehicleGroup.create({
      data: {
        fleetId,
        name: def.name,
        criteriaJson: def.criteriaJson,
      },
    });
    groupIds.push(group.id);
    console.log(`  Created group: ${def.name}`);
  }

  console.log("\nPhase 3: Ensure fleet personas...");
  const fleetPersonas = [
    { email: "demo.fleet@washbuddy.com", firstName: "Patricia", lastName: "Nakamura", role: "FLEET_ADMIN" as const },
    { email: "demo.dispatch@washbuddy.com", firstName: "Marcus", lastName: "Chen", role: "DISPATCHER" as const },
    { email: "demo.driver@washbuddy.com", firstName: "Alex", lastName: "Rivera", role: "DRIVER" as const },
    { email: "fleet.maint@washbuddy.com", firstName: "Carlos", lastName: "Reyes", role: "MAINTENANCE_MANAGER" as const },
    { email: "fleet.analyst@washbuddy.com", firstName: "Sarah", lastName: "Kim", role: "READ_ONLY_ANALYST" as const },
  ];

  const personaUserIds: Record<string, string> = {};
  for (const p of fleetPersonas) {
    let user = await prisma.user.findUnique({ where: { email: p.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          passwordHash: DEFAULT_PASSWORD,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`  Created user: ${p.email}`);
    } else {
      console.log(`  User exists: ${p.email}`);
    }
    personaUserIds[p.role] = user.id;

    const existingMembership = await prisma.fleetMembership.findUnique({
      where: { fleetId_userId: { fleetId, userId: user.id } },
    });
    if (!existingMembership) {
      await prisma.fleetMembership.create({
        data: { fleetId, userId: user.id, role: p.role, isActive: true },
      });
      console.log(`    Added ${p.role} membership`);
    }
  }

  console.log("\nPhase 4: Assign vehicles to depots and groups...");
  const vehicles = await prisma.vehicle.findMany({
    where: { fleetId, isActive: true },
  });
  console.log(`  Found ${vehicles.length} fleet vehicles`);

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const depotId = depotIds[i % depotIds.length];

    if (!v.depotId) {
      await prisma.vehicle.update({
        where: { id: v.id },
        data: { depotId },
      });
    }

    const matchingGroupIdx = v.categoryCode === "motorcoach" ? 0
      : v.categoryCode === "school_bus" ? 1
      : v.categoryCode === "transit" ? 2
      : -1;

    if (matchingGroupIdx >= 0 && groupIds[matchingGroupIdx]) {
      const existingMember = await prisma.fleetVehicleGroupMembership.findUnique({
        where: {
          vehicleGroupId_vehicleId: {
            vehicleGroupId: groupIds[matchingGroupIdx],
            vehicleId: v.id,
          },
        },
      });
      if (!existingMember) {
        await prisma.fleetVehicleGroupMembership.create({
          data: {
            vehicleGroupId: groupIds[matchingGroupIdx],
            vehicleId: v.id,
          },
        });
      }
    }

    if (i < 3 && groupIds[3]) {
      const existingPriority = await prisma.fleetVehicleGroupMembership.findUnique({
        where: {
          vehicleGroupId_vehicleId: {
            vehicleGroupId: groupIds[3],
            vehicleId: v.id,
          },
        },
      });
      if (!existingPriority) {
        await prisma.fleetVehicleGroupMembership.create({
          data: {
            vehicleGroupId: groupIds[3],
            vehicleId: v.id,
          },
        });
      }
    }
  }

  console.log("\nPhase 5: Driver assignments...");
  const fleetDrivers = await prisma.fleetMembership.findMany({
    where: { fleetId, role: "DRIVER", isActive: true },
    include: { user: true },
  });

  for (let i = 0; i < Math.min(fleetDrivers.length, vehicles.length); i++) {
    const driver = fleetDrivers[i];
    const vehicle = vehicles[i];

    const existing = await prisma.fleetDriverAssignment.findFirst({
      where: { fleetId, vehicleId: vehicle.id, driverUserId: driver.userId, endsAt: null },
    });

    if (!existing) {
      await prisma.fleetDriverAssignment.create({
        data: {
          fleetId,
          vehicleId: vehicle.id,
          driverUserId: driver.userId,
          startsAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      });
      console.log(`  Assigned ${driver.user.firstName} ${driver.user.lastName} → ${vehicle.unitNumber}`);
    }
  }

  console.log("\nPhase 6: Set vehicle wash status...");
  const now = new Date();
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const daysAgo = (i * 3) % 21;
    const lastWash = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const nextDue = new Date(lastWash.getTime() + 14 * 24 * 60 * 60 * 1000);

    await prisma.vehicle.update({
      where: { id: v.id },
      data: {
        lastWashAtUtc: lastWash,
        nextWashDueAtUtc: nextDue,
      },
    });
  }
  console.log(`  Updated wash status for ${vehicles.length} vehicles`);

  console.log("\nPhase 7: Sample wash requests...");
  const driverUserId = personaUserIds["DRIVER"];
  if (driverUserId && vehicles.length > 0) {
    const locations = await prisma.location.findMany({ where: { isVisible: true }, take: 3 });

    const requestDefs = [
      {
        vehicleId: vehicles[0]?.id,
        requestType: "STRUCTURED" as const,
        status: "PENDING_FLEET_APPROVAL" as const,
        desiredLocationId: locations[0]?.id,
        desiredStartAtUtc: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        notes: "Regular bi-weekly wash for Unit " + vehicles[0]?.unitNumber,
        timeWindowCode: "NEXT_48H",
      },
      {
        vehicleId: vehicles[1]?.id,
        requestType: "FLEXIBLE" as const,
        status: "PENDING_FLEET_APPROVAL" as const,
        desiredStartAtUtc: null,
        notes: "Vehicle is dirty after highway run. Need wash before weekend routes.",
        timeWindowCode: "TODAY",
      },
      {
        vehicleId: vehicles[2]?.id,
        requestType: "STRUCTURED" as const,
        status: "APPROVED_BOOKING_PENDING_PROVIDER" as const,
        desiredLocationId: locations[1]?.id,
        desiredStartAtUtc: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        notes: "Pre-approved recurring schedule wash",
        timeWindowCode: "NEXT_24H",
      },
      {
        vehicleId: vehicles[3]?.id,
        requestType: "STRUCTURED" as const,
        status: "DECLINED" as const,
        desiredLocationId: locations[0]?.id,
        desiredStartAtUtc: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        notes: "Requested express wash",
        timeWindowCode: "TODAY",
        declineReasonCode: "COST",
        declineNotes: "Budget exceeded for this period. Please use standard wash.",
      },
    ];

    for (const def of requestDefs) {
      if (!def.vehicleId) continue;

      const idempKey = crypto.randomUUID();
      const existingRequest = await prisma.washRequest.findFirst({
        where: { fleetId, vehicleId: def.vehicleId, status: def.status },
      });
      if (existingRequest) {
        console.log(`  Wash request already exists for vehicle in status ${def.status}`);
        continue;
      }

      const req = await prisma.washRequest.create({
        data: {
          fleetId,
          vehicleId: def.vehicleId,
          driverUserId,
          requestType: def.requestType,
          status: def.status,
          desiredLocationId: def.desiredLocationId || null,
          desiredStartAtUtc: def.desiredStartAtUtc || null,
          notes: def.notes,
          timeWindowCode: def.timeWindowCode,
          declineReasonCode: def.declineReasonCode || null,
          declineNotes: def.declineNotes || null,
          idempotencyKey: idempKey,
          expiresAtUtc: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      const thread = await prisma.washRequestThread.create({
        data: { washRequestId: req.id },
      });

      await prisma.washRequestMessage.create({
        data: {
          threadId: thread.id,
          authorUserId: driverUserId,
          body: def.notes || "Wash request submitted",
        },
      });

      console.log(`  Created ${def.requestType} request (${def.status})`);
    }
  }

  console.log("\nPhase 8: Recurring programs...");
  const existingPrograms = await prisma.fleetRecurringProgram.count({ where: { fleetId } });
  if (existingPrograms === 0) {
    await prisma.fleetRecurringProgram.create({
      data: {
        fleetId,
        name: "Bi-Weekly Full Fleet Wash",
        scopeType: "fleet",
        cadenceType: "BIWEEKLY",
        cadenceConfigJson: { dayOfWeek: 1, preferredTimeUtc: "10:00" },
        servicePolicyJson: { preferredServiceName: "Exterior Wash" },
        providerPolicyJson: { mode: "PREFERRED_THEN_FALLBACK" },
        horizonDays: 60,
        isActive: true,
      },
    });
    console.log("  Created: Bi-Weekly Full Fleet Wash");

    if (groupIds[0]) {
      await prisma.fleetRecurringProgram.create({
        data: {
          fleetId,
          name: "Weekly Motorcoach Premium Wash",
          scopeType: "vehicle_group",
          scopeVehicleGroupId: groupIds[0],
          cadenceType: "WEEKLY",
          cadenceConfigJson: { dayOfWeek: 3, preferredTimeUtc: "08:00" },
          servicePolicyJson: { preferredServiceName: "Full Detail" },
          providerPolicyJson: { mode: "PREFERRED_ONLY" },
          horizonDays: 30,
          isActive: true,
        },
      });
      console.log("  Created: Weekly Motorcoach Premium Wash");
    }

    if (depotIds[0]) {
      await prisma.fleetRecurringProgram.create({
        data: {
          fleetId,
          name: "Manhattan Depot Monthly Deep Clean",
          scopeType: "depot",
          scopeDepotId: depotIds[0],
          cadenceType: "MONTHLY",
          cadenceConfigJson: { dayOfMonth: 1, preferredTimeUtc: "06:00" },
          servicePolicyJson: { preferredServiceName: "Interior + Exterior" },
          providerPolicyJson: { mode: "PREFERRED_THEN_FALLBACK" },
          horizonDays: 60,
          isActive: false,
        },
      });
      console.log("  Created: Manhattan Depot Monthly Deep Clean (inactive)");
    }
  } else {
    console.log(`  ${existingPrograms} programs already exist`);
  }

  console.log("\nPhase 9: Policy overrides...");
  if (depotIds[0]) {
    const existing = await prisma.fleetPolicyOverride.findUnique({
      where: {
        fleetId_scopeType_scopeId: {
          fleetId,
          scopeType: "depot",
          scopeId: depotIds[0],
        },
      },
    });
    if (!existing) {
      await prisma.fleetPolicyOverride.create({
        data: {
          fleetId,
          scopeType: "depot",
          scopeId: depotIds[0],
          policyJson: {
            driver_requests_enabled: true,
            request_expiration_mode: "AUTO_APPROVE",
            request_expiration_minutes: 60,
            default_provider_selection_mode: "PREFERRED_ONLY",
          },
        },
      });
      console.log("  Created Manhattan Depot policy override");
    }
  }

  console.log("\n✅ Fleet extended seed complete!");
  console.log(`   Fleet: Northeast Express (${fleetId})`);
  console.log(`   Depots: ${depotIds.length}`);
  console.log(`   Vehicle Groups: ${groupIds.length}`);
  console.log(`   Fleet personas: ${Object.keys(personaUserIds).length}`);
}

main()
  .catch((e) => {
    console.error("Fleet seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
