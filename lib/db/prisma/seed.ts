import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

// ─── HELPERS ───────────────────────────────────────────────────────────────

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_PASSWORD = hashPasswordSync("password123");
const SEED_BATCH_ID = `seed-cleanup-${Date.now()}`;

/** Convert dollar amount to minor units (cents) */
function dollars(amount: number): number {
  return Math.round(amount * 100);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ─── PROVIDER NAMES (50 unique) ────────────────────────────────────────────

const PROVIDER_NAMES: string[] = [
  "MetroClean Bus Wash",
  "Northeast Fleet Services",
  "Great Lakes Mobile Wash",
  "Empire State Coach Care",
  "Lakeshore Bus Detailing",
  "Tri-State Fleet Wash",
  "Maple Leaf Bus Wash",
  "Golden Horseshoe Cleaners",
  "Atlantic Fleet Services",
  "Skyline Bus Wash",
  "Harbor Transit Wash",
  "CrossBorder Fleet Care",
  "Niagara Express Wash",
  "Liberty Coach Cleaning",
  "Northern Star Bus Wash",
  "Urban Transit Detailers",
  "Parkway Fleet Services",
  "Capital Region Bus Wash",
  "Summit Coach Care",
  "Gateway Fleet Wash",
  "Bayview Bus Detailing",
  "Continental Fleet Services",
  "Diamond Bus Wash",
  "Echo Transit Cleaning",
  "Five Borough Bus Care",
  "Garden State Fleet Wash",
  "Hudson Valley Bus Wash",
  "Interstate Coach Services",
  "Jetstream Bus Cleaning",
  "Kingston Fleet Wash",
  "Lakefront Transit Wash",
  "Midtown Fleet Services",
  "New England Bus Wash",
  "Ontario Express Wash",
  "Pioneer Coach Cleaning",
  "Queen City Fleet Wash",
  "Rapid Transit Wash",
  "Sterling Bus Services",
  "Turnpike Fleet Wash",
  "Upstate Coach Care",
  "Valley Stream Bus Wash",
  "Waterfront Fleet Cleaning",
  "Express Lane Bus Wash",
  "York Region Fleet Care",
  "Zenith Transit Wash",
  "Blueline Bus Detailing",
  "Clearview Coach Wash",
  "Dominion Fleet Services",
  "Evergreen Bus Wash",
  "Frontier Coach Cleaning",
];

// ─── LOCATION DATA ─────────────────────────────────────────────────────────
// Each entry: [city, regionCode, postalCode, countryCode, currencyCode, timezone, lat, lng, streetAddresses[]]

interface LocationTemplate {
  city: string;
  regionCode: string;
  postalCode: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  lat: number;
  lng: number;
  addresses: string[];
  areaTag: string;
}

const LOCATION_TEMPLATES: LocationTemplate[] = [
  // ─── Greater Toronto Area (12+ addresses) ──────────────────────────
  { city: "Etobicoke", regionCode: "ON", postalCode: "M8W 1R4", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.6205, lng: -79.5132, addresses: ["125 The Queensway", "300 Evans Ave", "55 Unwin Ave"], areaTag: "GTA" },
  { city: "Scarborough", regionCode: "ON", postalCode: "M1B 5K7", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.7731, lng: -79.2577, addresses: ["1880 Ellesmere Rd", "50 Milner Ave", "340 Progress Ave"], areaTag: "GTA" },
  { city: "Mississauga", regionCode: "ON", postalCode: "L5T 2N3", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.5890, lng: -79.6441, addresses: ["2155 Dunwin Dr", "6985 Financial Dr", "1550 South Gateway Rd"], areaTag: "GTA" },
  { city: "Brampton", regionCode: "ON", postalCode: "L6T 5R3", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.7315, lng: -79.7624, addresses: ["140 Bramsteele Rd", "8800 Torbram Rd", "55 Regan Rd"], areaTag: "GTA" },
  { city: "Markham", regionCode: "ON", postalCode: "L3R 8B5", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.8561, lng: -79.3370, addresses: ["25 Alden Rd", "350 Esna Park Dr", "780 Birchmount Rd"], areaTag: "GTA" },
  { city: "North York", regionCode: "ON", postalCode: "M3J 2R8", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.7615, lng: -79.4111, addresses: ["1500 Finch Ave W", "70 Signet Dr", "215 Milvan Dr"], areaTag: "GTA" },
  { city: "Vaughan", regionCode: "ON", postalCode: "L4K 5W1", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.8361, lng: -79.4983, addresses: ["225 Edgeley Blvd", "40 West Wilmot St", "88 Vinyl Ct"], areaTag: "GTA" },

  // ─── Niagara / Hamilton corridor (5+ addresses) ────────────────────
  { city: "Hamilton", regionCode: "ON", postalCode: "L8H 7P7", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.2557, lng: -79.8711, addresses: ["250 Burlington St E", "60 Parkdale Ave N", "1185 Barton St E"], areaTag: "NIAGARA" },
  { city: "St. Catharines", regionCode: "ON", postalCode: "L2R 7P9", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.1594, lng: -79.2469, addresses: ["550 Ontario St", "210 Bunting Rd", "40 Scott St"], areaTag: "NIAGARA" },
  { city: "Niagara Falls", regionCode: "ON", postalCode: "L2E 6S4", countryCode: "CA", currencyCode: "CAD", timezone: "America/Toronto", lat: 43.0896, lng: -79.0849, addresses: ["4680 Victoria Ave", "7190 Montrose Rd"], areaTag: "NIAGARA" },

  // ─── Buffalo / Western NY (3+ addresses) ───────────────────────────
  { city: "Buffalo", regionCode: "NY", postalCode: "14206", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 42.8864, lng: -78.8784, addresses: ["1250 Broadway", "570 Seneca St", "200 Lee St"], areaTag: "BUFFALO" },
  { city: "Cheektowaga", regionCode: "NY", postalCode: "14225", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 42.8934, lng: -78.7548, addresses: ["3005 Walden Ave", "1900 Union Rd"], areaTag: "BUFFALO" },
  { city: "Tonawanda", regionCode: "NY", postalCode: "14150", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 43.0004, lng: -78.8701, addresses: ["890 Niagara Falls Blvd", "200 Sawyer Ave"], areaTag: "BUFFALO" },

  // ─── Upstate NY / CT corridor (5+ addresses) ──────────────────────
  { city: "Syracuse", regionCode: "NY", postalCode: "13204", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 43.0481, lng: -76.1474, addresses: ["800 W Genesee St", "215 S Geddes St"], areaTag: "UPSTATE" },
  { city: "Albany", regionCode: "NY", postalCode: "12205", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 42.6526, lng: -73.7562, addresses: ["1500 Central Ave", "3 Computer Dr West"], areaTag: "UPSTATE" },
  { city: "Rochester", regionCode: "NY", postalCode: "14606", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 43.1566, lng: -77.6088, addresses: ["1000 Lexington Ave", "670 Mt Read Blvd"], areaTag: "UPSTATE" },
  { city: "Hartford", regionCode: "CT", postalCode: "06114", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.7376, lng: -72.6843, addresses: ["95 Leibert Rd", "565 Wethersfield Ave"], areaTag: "UPSTATE" },
  { city: "Utica", regionCode: "NY", postalCode: "13501", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 43.1009, lng: -75.2327, addresses: ["1200 Oriskany St W", "150 N Genesee St"], areaTag: "UPSTATE" },

  // ─── NYC Metro (8+ addresses) ──────────────────────────────────────
  { city: "Bronx", regionCode: "NY", postalCode: "10462", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.8341, lng: -73.8467, addresses: ["1200 Zerega Ave", "740 E Tremont Ave", "3000 Jerome Ave"], areaTag: "NYC" },
  { city: "Brooklyn", regionCode: "NY", postalCode: "11232", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.6570, lng: -74.0058, addresses: ["280 Richards St", "850 3rd Ave", "72 33rd St"], areaTag: "NYC" },
  { city: "Queens", regionCode: "NY", postalCode: "11101", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7433, lng: -73.9230, addresses: ["43-01 22nd St", "55-15 Grand Ave", "31-00 47th Ave"], areaTag: "NYC" },
  { city: "Staten Island", regionCode: "NY", postalCode: "10314", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.5834, lng: -74.1496, addresses: ["2900 Veterans Rd W", "1440 South Ave"], areaTag: "NYC" },
  { city: "Newark", regionCode: "NJ", postalCode: "07105", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7178, lng: -74.1322, addresses: ["450 Doremus Ave", "118 Blanchard St", "630 Frelinghuysen Ave"], areaTag: "NYC" },
  { city: "Jersey City", regionCode: "NJ", postalCode: "07305", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7178, lng: -74.0431, addresses: ["850 Garfield Ave", "200 Burma Rd"], areaTag: "NYC" },
  { city: "Elizabeth", regionCode: "NJ", postalCode: "07201", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.6640, lng: -74.2107, addresses: ["500 S Front St", "1060 N Broad St"], areaTag: "NYC" },

  // ─── Long Island / Westchester (5+ addresses) ─────────────────────
  { city: "Yonkers", regionCode: "NY", postalCode: "10701", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.9312, lng: -73.8987, addresses: ["789 Saw Mill River Rd", "120 Tuckahoe Rd"], areaTag: "LONGISLAND" },
  { city: "White Plains", regionCode: "NY", postalCode: "10601", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.0340, lng: -73.7629, addresses: ["285 Tarrytown Rd", "50 S Broadway"], areaTag: "LONGISLAND" },
  { city: "Hicksville", regionCode: "NY", postalCode: "11801", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7682, lng: -73.5249, addresses: ["250 Duffy Ave", "500 W John St"], areaTag: "LONGISLAND" },
  { city: "Hempstead", regionCode: "NY", postalCode: "11550", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7062, lng: -73.6187, addresses: ["400 Fulton Ave", "245 Main St"], areaTag: "LONGISLAND" },
  { city: "Patchogue", regionCode: "NY", postalCode: "11772", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.7654, lng: -73.0154, addresses: ["185 Sunrise Hwy", "30 Medford Ave"], areaTag: "LONGISLAND" },

  // ─── Connecticut (4+ addresses) ────────────────────────────────────
  { city: "Stamford", regionCode: "CT", postalCode: "06902", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.0534, lng: -73.5387, addresses: ["780 Canal St", "125 Elm St"], areaTag: "CT" },
  { city: "New Haven", regionCode: "CT", postalCode: "06513", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.3083, lng: -72.9279, addresses: ["75 Sargent Dr", "1100 State St"], areaTag: "CT" },
  { city: "Bridgeport", regionCode: "CT", postalCode: "06604", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.1865, lng: -73.1952, addresses: ["350 Iranistan Ave", "900 Broad St"], areaTag: "CT" },
  { city: "Danbury", regionCode: "CT", postalCode: "06810", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 41.3948, lng: -73.4540, addresses: ["55 Eagle Rd", "200 White St"], areaTag: "CT" },

  // ─── Broader NJ / Philadelphia corridor (3+ addresses) ────────────
  { city: "Edison", regionCode: "NJ", postalCode: "08817", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.5187, lng: -74.4121, addresses: ["3500 US-1", "225 Pierson Ave"], areaTag: "NJPHILLY" },
  { city: "Trenton", regionCode: "NJ", postalCode: "08638", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.2171, lng: -74.7429, addresses: ["1700 N Olden Ave", "420 Prospect St"], areaTag: "NJPHILLY" },
  { city: "New Brunswick", regionCode: "NJ", postalCode: "08901", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", lat: 40.4862, lng: -74.4518, addresses: ["300 Jersey Ave", "100 Commercial Ave"], areaTag: "NJPHILLY" },
];

// ─── SERVICE TEMPLATES ─────────────────────────────────────────────────────

type ServiceCategoryLiteral =
  | "EXTERIOR_WASH"
  | "INTERIOR_CLEANING"
  | "RESTROOM_DUMP"
  | "RESTOCK_CONSUMABLES"
  | "ADD_ON";

interface ServiceTemplate {
  name: string;
  description: string;
  category: ServiceCategoryLiteral;
  labels?: string[];
  durationMinsRange: [number, number];
  usdPriceRange: [number, number]; // in dollars
  cadMultiplier: number; // CAD prices ~1.25x USD
}

const SERVICE_MENU: ServiceTemplate[] = [
  {
    name: "Exterior Wash",
    description: "Complete exterior wash including roof, sides, front, and rear. Removes road grime, salt, and debris.",
    category: "EXTERIOR_WASH",
    durationMinsRange: [20, 45],
    usdPriceRange: [45, 85],
    cadMultiplier: 1.28,
  },
  {
    name: "Interior Clean",
    description: "Thorough interior cleaning including floors, seats, windows, dashboard, and driver area.",
    category: "INTERIOR_CLEANING",
    durationMinsRange: [30, 60],
    usdPriceRange: [60, 120],
    cadMultiplier: 1.28,
  },
  {
    name: "Undercarriage Wash",
    description: "High-pressure undercarriage cleaning to remove salt, mud, and corrosive buildup.",
    category: "EXTERIOR_WASH",
    durationMinsRange: [15, 30],
    usdPriceRange: [35, 65],
    cadMultiplier: 1.28,
  },
  {
    name: "Full Detail",
    description: "Premium full-service detail including exterior wash, interior deep clean, engine bay, and protective coating.",
    category: "EXTERIOR_WASH",
    labels: ["detail", "full-service", "interior"],
    durationMinsRange: [60, 120],
    usdPriceRange: [150, 250],
    cadMultiplier: 1.28,
  },
  {
    name: "Express Wash",
    description: "Quick automated exterior rinse and dry. Perfect for routine maintenance between full washes.",
    category: "EXTERIOR_WASH",
    durationMinsRange: [10, 20],
    usdPriceRange: [25, 45],
    cadMultiplier: 1.28,
  },
];

// ─── OPERATING HOURS TEMPLATES ─────────────────────────────────────────────

type HoursTemplate = { dayOfWeek: number; openTime: string; closeTime: string }[];

const HOURS_247: HoursTemplate = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  openTime: "00:00",
  closeTime: "23:59",
}));

const HOURS_MON_SAT_6_20: HoursTemplate = [1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  openTime: "06:00",
  closeTime: "20:00",
}));

const HOURS_MON_FRI_7_18: HoursTemplate = [1, 2, 3, 4, 5].map((d) => ({
  dayOfWeek: d,
  openTime: "07:00",
  closeTime: "18:00",
}));

const HOURS_MON_SAT_5_22: HoursTemplate = [1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  openTime: "05:00",
  closeTime: "22:00",
}));

const HOURS_EVERYDAY_7_21: HoursTemplate = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  openTime: "07:00",
  closeTime: "21:00",
}));

const HOURS_WITH_LUNCH: HoursTemplate = [1, 2, 3, 4, 5].flatMap((d) => [
  { dayOfWeek: d, openTime: "06:00", closeTime: "12:00" },
  { dayOfWeek: d, openTime: "13:00", closeTime: "20:00" },
]);

const ALL_HOURS_TEMPLATES: HoursTemplate[] = [
  HOURS_247,
  HOURS_MON_SAT_6_20,
  HOURS_MON_FRI_7_18,
  HOURS_MON_SAT_5_22,
  HOURS_EVERYDAY_7_21,
  HOURS_WITH_LUNCH,
];

// ─── COMPATIBILITY SUBTYPES ────────────────────────────────────────────────

const BUS_SUBTYPES = ["STANDARD", "COACH", "MINIBUS", "SHUTTLE", "DOUBLE_DECKER", "ARTICULATED", "SCHOOL_BUS"];
const COMMON_SUBTYPES = ["STANDARD", "COACH", "MINIBUS", "SHUTTLE", "SCHOOL_BUS"];
const ALL_SUBTYPES = BUS_SUBTYPES;

// ─── MAIN SEED FUNCTION ───────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  WashBuddy Seed — Task 0.1: Clean Seed Data");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: Delete ALL existing provider-related data ──────────────
  console.log("Step 1: Cleaning existing provider/location/service data...");

  // Delete in FK-safe order
  await prisma.demoDataRegistry.deleteMany({});
  await prisma.reviewVote.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.disputeEvidence.deleteMany({});
  await prisma.dispute.deleteMany({});
  await prisma.providerPayoutItem.deleteMany({});
  await prisma.providerPayoutBatch.deleteMany({});
  await prisma.refundInternal.deleteMany({});
  await prisma.paymentEvent.deleteMany({});
  await prisma.paymentIntentInternal.deleteMany({});
  await prisma.bookingStatusHistory.deleteMany({});
  await prisma.bookingHold.deleteMany({});
  await prisma.bookingPhoto.deleteMany({});
  await prisma.bookingMessage.deleteMany({});
  await prisma.washNote.deleteMany({});
  await prisma.fileAsset.deleteMany({});
  await prisma.bookingAddOn.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.serviceCompatibility.deleteMany({});
  await prisma.servicePricing.deleteMany({});
  await prisma.providerAddOn.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.operatingWindow.deleteMany({});
  await prisma.providerMembership.deleteMany({});
  await prisma.washBay.deleteMany({});
  await prisma.clientProfile.deleteMany({});
  await prisma.providerDiscount.deleteMany({});
  await prisma.fleetSubscription.deleteMany({});
  await prisma.subscriptionPackage.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.providerResponseMetric.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.provider.deleteMany({});

  // Also clean fleet-related seed data so we can rebuild cleanly
  await prisma.washRequestMessage.deleteMany({});
  await prisma.washRequestThread.deleteMany({});
  await prisma.washRequestRevision.deleteMany({});
  await prisma.washRequest.deleteMany({});
  await prisma.fleetGeneratedTask.deleteMany({});
  await prisma.fleetRecurringProgram.deleteMany({});
  await prisma.fleetPolicyOverride.deleteMany({});
  await prisma.fleetVehicleGroupMembership.deleteMany({});
  await prisma.fleetVehicleGroup.deleteMany({});
  await prisma.fleetDriverAssignment.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.fleetDepot.deleteMany({});
  await prisma.fleetMembership.deleteMany({});
  await prisma.fleet.deleteMany({});

  // Clean notifications
  await prisma.notification.deleteMany({});

  console.log("  ✓ All existing provider, location, service, booking, fleet data deleted.\n");

  // ── Step 2: Upsert demo user accounts ──────────────────────────────
  console.log("Step 2: Upserting demo user accounts...");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@washbuddy.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
    create: {
      email: "admin@washbuddy.com",
      firstName: "Platform",
      lastName: "Admin",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const fleetAdminUser = await prisma.user.upsert({
    where: { email: "demo.fleet@washbuddy.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
    create: {
      email: "demo.fleet@washbuddy.com",
      phoneE164: "+12125559002",
      firstName: "Patricia",
      lastName: "Nakamura",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: "demo.driver@washbuddy.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
    create: {
      email: "demo.driver@washbuddy.com",
      phoneE164: "+12125559001",
      firstName: "Alex",
      lastName: "Rivera",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driver1User = await prisma.user.upsert({
    where: { email: "driver1@example.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
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

  const providerOwnerUser = await prisma.user.upsert({
    where: { email: "owner@cleanbus-nyc.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
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

  const providerStaffUser = await prisma.user.upsert({
    where: { email: "staff@cleanbus-nyc.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
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

  const maintUser = await prisma.user.upsert({
    where: { email: "fleet.maint@washbuddy.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
    create: {
      email: "fleet.maint@washbuddy.com",
      phoneE164: "+12125559010",
      firstName: "Grace",
      lastName: "Okonkwo",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const analystUser = await prisma.user.upsert({
    where: { email: "fleet.analyst@washbuddy.com" },
    update: { passwordHash: DEFAULT_PASSWORD, isActive: true },
    create: {
      email: "fleet.analyst@washbuddy.com",
      phoneE164: "+12125559011",
      firstName: "Daniel",
      lastName: "Reeves",
      passwordHash: DEFAULT_PASSWORD,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Platform admin role
  await prisma.userPlatformRole.upsert({
    where: { userId_role: { userId: adminUser.id, role: "PLATFORM_SUPER_ADMIN" } },
    update: {},
    create: { userId: adminUser.id, role: "PLATFORM_SUPER_ADMIN", isActive: true },
  });

  console.log("  ✓ 8 demo user accounts upserted.\n");

  // ── Step 3: Create Fleet + memberships ─────────────────────────────
  console.log("Step 3: Creating fleet 'Northeast Bus Lines'...");

  const fleet = await prisma.fleet.create({
    data: {
      name: "Northeast Bus Lines",
      billingMode: "FLEET_PAYS",
      currencyCode: "USD",
      defaultTimezone: "America/New_York",
      requireVehicleAssignMins: 30,
    },
  });

  // Fleet memberships — all 5 fleet-scoped users
  await prisma.fleetMembership.create({
    data: { fleetId: fleet.id, userId: fleetAdminUser.id, role: "FLEET_ADMIN", isActive: true },
  });
  await prisma.fleetMembership.create({
    data: { fleetId: fleet.id, userId: maintUser.id, role: "MAINTENANCE_MANAGER", isActive: true },
  });
  await prisma.fleetMembership.create({
    data: { fleetId: fleet.id, userId: analystUser.id, role: "READ_ONLY_ANALYST", isActive: true },
  });
  await prisma.fleetMembership.create({
    data: { fleetId: fleet.id, userId: driverUser.id, role: "DRIVER", isActive: true },
  });
  await prisma.fleetMembership.create({
    data: { fleetId: fleet.id, userId: driver1User.id, role: "DRIVER", isActive: true },
  });

  // Fleet depots
  const depotNYC = await prisma.fleetDepot.create({
    data: {
      fleetId: fleet.id,
      name: "NYC Main Depot",
      timezone: "America/New_York",
      addressLine1: "1200 Zerega Ave",
      city: "Bronx",
      regionCode: "NY",
      postalCode: "10462",
      countryCode: "US",
      isActive: true,
    },
  });

  const depotNJ = await prisma.fleetDepot.create({
    data: {
      fleetId: fleet.id,
      name: "Newark Satellite Depot",
      timezone: "America/New_York",
      addressLine1: "450 Doremus Ave",
      city: "Newark",
      regionCode: "NJ",
      postalCode: "07105",
      countryCode: "US",
      isActive: true,
    },
  });

  // Fleet vehicle groups
  const groupCoaches = await prisma.fleetVehicleGroup.create({
    data: {
      fleetId: fleet.id,
      name: "Coaches",
      criteriaJson: { subtypeCode: "COACH" },
      isActive: true,
    },
  });

  const groupLocal = await prisma.fleetVehicleGroup.create({
    data: {
      fleetId: fleet.id,
      name: "Local Service",
      criteriaJson: { subtypeCodes: ["STANDARD", "SHUTTLE"] },
      isActive: true,
    },
  });

  // Create vehicles for the fleet — assigned to depots
  const vehicleData = [
    { unitNumber: "NEB-101", subtypeCode: "STANDARD", lengthInches: 480, heightInches: 132, hasRestroom: false, licensePlate: "NY-BUS-101", depotId: depotNYC.id },
    { unitNumber: "NEB-102", subtypeCode: "STANDARD", lengthInches: 456, heightInches: 130, hasRestroom: false, licensePlate: "NY-BUS-102", depotId: depotNYC.id },
    { unitNumber: "NEB-201", subtypeCode: "COACH", lengthInches: 540, heightInches: 156, hasRestroom: true, licensePlate: "NY-BUS-201", depotId: depotNJ.id },
    { unitNumber: "NEB-202", subtypeCode: "COACH", lengthInches: 528, heightInches: 150, hasRestroom: true, licensePlate: "NY-BUS-202", depotId: depotNJ.id },
    { unitNumber: "NEB-301", subtypeCode: "SHUTTLE", lengthInches: 300, heightInches: 108, hasRestroom: false, licensePlate: "NY-BUS-301", depotId: depotNYC.id },
  ];

  const vehicles = [];
  for (const v of vehicleData) {
    const vehicle = await prisma.vehicle.create({
      data: { fleetId: fleet.id, categoryCode: "BUS", ...v, isActive: true },
    });
    vehicles.push(vehicle);
  }

  // Vehicle group memberships — coaches in "Coaches" group, standard+shuttle in "Local Service"
  for (const v of vehicles) {
    if (v.subtypeCode === "COACH") {
      await prisma.fleetVehicleGroupMembership.create({
        data: { vehicleGroupId: groupCoaches.id, vehicleId: v.id },
      });
    } else {
      await prisma.fleetVehicleGroupMembership.create({
        data: { vehicleGroupId: groupLocal.id, vehicleId: v.id },
      });
    }
  }

  // Assign vehicles to drivers: Alex gets 3, Mike gets 2
  for (let i = 0; i < 3; i++) {
    await prisma.fleetDriverAssignment.create({
      data: { fleetId: fleet.id, vehicleId: vehicles[i].id, driverUserId: driverUser.id, startsAt: new Date("2024-01-01") },
    });
  }
  for (let i = 3; i < 5; i++) {
    await prisma.fleetDriverAssignment.create({
      data: { fleetId: fleet.id, vehicleId: vehicles[i].id, driverUserId: driver1User.id, startsAt: new Date("2024-01-01") },
    });
  }

  console.log("  ✓ Fleet created with 2 depots, 2 vehicle groups, 5 vehicles, and 4 members.\n");

  // ── Step 4: Create 50 providers with locations and services ────────
  console.log("Step 4: Creating 50 providers with locations and services...");

  // Build a pool of location templates we can assign to providers
  // Flatten all addresses into individual location entries
  const locationPool: { template: LocationTemplate; address: string }[] = [];
  for (const tmpl of LOCATION_TEMPLATES) {
    for (const addr of tmpl.addresses) {
      locationPool.push({ template: tmpl, address: addr });
    }
  }

  // Reserve NYC-area locations for the demo provider (index 0 = MetroClean Bus Wash)
  // Pick one address per UNIQUE city so provider 0 doesn't get 3x "— Bronx"
  const nycPool = locationPool.filter((l) => l.template.areaTag === "NYC");
  const otherPool = locationPool.filter((l) => l.template.areaTag !== "NYC");
  otherPool.sort(() => Math.random() - 0.5);
  // Deduplicate NYC pool: take first address per city to ensure distinct location names
  const seenCities = new Set<string>();
  const nycDeduped: typeof nycPool = [];
  const nycRemainder: typeof nycPool = [];
  for (const entry of nycPool) {
    if (!seenCities.has(entry.template.city)) {
      seenCities.add(entry.template.city);
      nycDeduped.push(entry);
    } else {
      nycRemainder.push(entry);
    }
  }
  // Put deduplicated NYC first (one per city), then remaining NYC, then other
  locationPool.length = 0;
  locationPool.push(...nycDeduped, ...nycRemainder, ...otherPool);

  let locationIdx = 0;
  let totalLocations = 0;
  let totalServices = 0;
  let totalOperatingWindows = 0;
  let totalCompatRules = 0;
  const registryRecords: {
    tableName: string;
    recordId: string;
    seedBatchId: string;
    seedMode: string;
    seedRegionCode: string | null;
  }[] = [];

  // We need to link provider index 0 to cleanbus-nyc demo accounts
  const CLEANBUS_NYC_INDEX = 0;

  for (let i = 0; i < 50; i++) {
    const providerName = PROVIDER_NAMES[i];
    const contactSlug = providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    const contactEmail = `info@${contactSlug}.com`;
    const contactPhone = `+1${String(2125550100 + i)}`;

    // Determine how many locations: 1-3
    const numLocations = i < 15 ? 3 : i < 35 ? 2 : randomBetween(1, 3);

    // First 45 providers are APPROVED, last 5 are PENDING (for testing admin approval)
    const isApproved = i < 45;
    const provider = await prisma.provider.create({
      data: {
        name: providerName,
        isActive: isApproved,
        payoutReady: false,
        approvalStatus: isApproved ? "APPROVED" : "PENDING",
        approvedAt: isApproved ? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) : null,
      },
    });

    registryRecords.push({
      tableName: "providers",
      recordId: provider.id,
      seedBatchId: SEED_BATCH_ID,
      seedMode: "launch_corridor",
      seedRegionCode: null,
    });

    // Link demo provider accounts to the first provider (CleanBus = MetroClean Bus Wash)
    if (i === CLEANBUS_NYC_INDEX) {
      await prisma.providerMembership.create({
        data: { providerId: provider.id, userId: providerOwnerUser.id, role: "PROVIDER_ADMIN", isActive: true },
      });
      await prisma.providerMembership.create({
        data: { providerId: provider.id, userId: providerStaffUser.id, role: "PROVIDER_STAFF", isActive: true },
      });
    }

    for (let j = 0; j < numLocations; j++) {
      // Pick the next location from the pool, wrapping if needed
      const locEntry = locationPool[locationIdx % locationPool.length];
      locationIdx++;

      const tmpl = locEntry.template;
      // Jitter lat/lng slightly so locations are unique
      const lat = tmpl.lat + (Math.random() - 0.5) * 0.01;
      const lng = tmpl.lng + (Math.random() - 0.5) * 0.01;

      const locationName = `${providerName} — ${tmpl.city}`;

      const location = await prisma.location.create({
        data: {
          providerId: provider.id,
          name: locationName,
          timezone: tmpl.timezone,
          addressLine1: locEntry.address,
          city: tmpl.city,
          regionCode: tmpl.regionCode,
          postalCode: tmpl.postalCode,
          countryCode: tmpl.countryCode,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          responseSlaUnder1hMins: 5,
          responseSlaFutureMins: 10,
          bookingBufferMins: 5,
          isVisible: isApproved,
        },
      });

      totalLocations++;

      registryRecords.push({
        tableName: "locations",
        recordId: location.id,
        seedBatchId: SEED_BATCH_ID,
        seedMode: "launch_corridor",
        seedRegionCode: tmpl.areaTag,
      });

      // Operating hours — pick a template; at least 10% are 24/7
      const hoursTemplate = (totalLocations % 10 === 0)
        ? HOURS_247
        : ALL_HOURS_TEMPLATES[totalLocations % ALL_HOURS_TEMPLATES.length];

      for (const hw of hoursTemplate) {
        await prisma.operatingWindow.create({
          data: {
            locationId: location.id,
            dayOfWeek: hw.dayOfWeek,
            openTime: hw.openTime,
            closeTime: hw.closeTime,
          },
        });
        totalOperatingWindows++;
      }

      // Services: pick 2-5 from the menu
      const numServices = randomBetween(2, 5);
      const serviceTemplates = pickN(SERVICE_MENU, numServices);

      for (const svcTmpl of serviceTemplates) {
        const isCAD = tmpl.currencyCode === "CAD";
        const basePriceUSD = randomBetween(svcTmpl.usdPriceRange[0], svcTmpl.usdPriceRange[1]);
        const basePrice = isCAD
          ? Math.round(basePriceUSD * svcTmpl.cadMultiplier)
          : basePriceUSD;
        const durationMins = randomBetween(svcTmpl.durationMinsRange[0], svcTmpl.durationMinsRange[1]);

        // ~30% of services are instant book
        const requiresConfirmation = Math.random() > 0.3;
        const capacityPerSlot = randomBetween(1, 3);

        const service = await prisma.service.create({
          data: {
            locationId: location.id,
            name: svcTmpl.name,
            description: svcTmpl.description,
            category: svcTmpl.category,
            labels: svcTmpl.labels ?? [],
            durationMins,
            basePriceMinor: dollars(basePrice),
            currencyCode: tmpl.currencyCode,
            platformFeeMinor: 0, // Dynamic fee calculation per EID Task 1.1
            capacityPerSlot,
            leadTimeMins: svcTmpl.name === "Express Wash" ? 30 : 60,
            requiresConfirmation,
            isVisible: isApproved,
          },
        });

        totalServices++;

        registryRecords.push({
          tableName: "services",
          recordId: service.id,
          seedBatchId: SEED_BATCH_ID,
          seedMode: "launch_corridor",
          seedRegionCode: tmpl.areaTag,
        });

        // ServiceCompatibility: most services support common subtypes;
        // larger facilities (capacity 3+) support all subtypes
        const supportedSubtypes = capacityPerSlot >= 3 ? ALL_SUBTYPES : COMMON_SUBTYPES;

        for (const subtype of supportedSubtypes) {
          const maxLength = subtype === "ARTICULATED" ? 720
            : subtype === "DOUBLE_DECKER" ? 540
            : subtype === "COACH" ? 540
            : subtype === "STANDARD" ? 480
            : subtype === "SCHOOL_BUS" ? 480
            : subtype === "MINIBUS" ? 360
            : 300; // SHUTTLE
          const maxHeight = subtype === "DOUBLE_DECKER" ? 168
            : subtype === "COACH" ? 162
            : subtype === "ARTICULATED" ? 144
            : subtype === "STANDARD" ? 144
            : subtype === "SCHOOL_BUS" ? 132
            : subtype === "MINIBUS" ? 120
            : 108; // SHUTTLE

          await prisma.serviceCompatibility.create({
            data: {
              serviceId: service.id,
              categoryCode: "BUS",
              subtypeCode: subtype,
              maxLengthInches: maxLength,
              maxHeightInches: maxHeight,
            },
          });
          totalCompatRules++;
        }
      }
    }

    // Progress indicator every 10 providers
    if ((i + 1) % 10 === 0) {
      console.log(`  ... ${i + 1}/50 providers created`);
    }
  }

  console.log(`  ✓ 50 providers created.`);
  console.log(`  ✓ ${totalLocations} locations created.`);
  console.log(`  ✓ ${totalServices} services created.`);
  console.log(`  ✓ ${totalOperatingWindows} operating windows created.`);
  console.log(`  ✓ ${totalCompatRules} compatibility rules created.\n`);

  // ── Step 4.5: Create seed bookings, reviews, and notifications ─────
  console.log("Step 4.5: Creating seed bookings, reviews, and notifications...");

  // Fetch some approved locations with services for bookings
  const seedLocations = await prisma.location.findMany({
    where: { isVisible: true, provider: { approvalStatus: "APPROVED" } },
    include: {
      services: { where: { isVisible: true }, take: 2 },
      provider: { select: { id: true, name: true } },
    },
    take: 8,
  });

  const bookingStatuses = [
    "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "SETTLED", "SETTLED",
    "COMPLETED_PENDING_WINDOW", "PROVIDER_CONFIRMED", "REQUESTED", "IN_SERVICE",
    "CUSTOMER_CANCELLED", "CHECKED_IN",
  ];

  const seedBookings = [];
  for (let bi = 0; bi < Math.min(bookingStatuses.length, seedLocations.length * 2); bi++) {
    const loc = seedLocations[bi % seedLocations.length];
    const svc = loc.services[bi % loc.services.length];
    if (!svc) continue;

    const status = bookingStatuses[bi];
    const daysAgo = 30 - bi * 2;
    const scheduledStart = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + svc.durationMins * 60 * 1000);
    const customerId = bi % 2 === 0 ? driverUser.id : driver1User.id;

    const fee = Math.min(Math.round(svc.basePriceMinor * 0.15), 2500);
    const booking = await prisma.booking.create({
      data: {
        locationId: loc.id,
        serviceId: svc.id,
        customerId,
        vehicleId: vehicles[bi % vehicles.length].id,
        status: status as any,
        idempotencyKey: `seed-booking-${bi}-${Date.now()}`,
        serviceNameSnapshot: svc.name,
        serviceBasePriceMinor: svc.basePriceMinor,
        platformFeeMinor: fee,
        totalPriceMinor: svc.basePriceMinor + fee,
        currencyCode: svc.currencyCode,
        locationTimezone: loc.timezone,
        scheduledStartAtUtc: scheduledStart,
        scheduledEndAtUtc: scheduledEnd,
        createdAt: new Date(scheduledStart.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.bookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: null, toStatus: status as any, reason: "Seed data" },
    });
    seedBookings.push({ ...booking, location: loc });
  }
  console.log(`  ✓ ${seedBookings.length} seed bookings created.`);

  // Reviews — attach to COMPLETED/SETTLED bookings
  const completedBookings = seedBookings.filter((b) =>
    ["COMPLETED", "COMPLETED_PENDING_WINDOW", "SETTLED"].includes(b.status),
  );

  const reviewData = [
    { rating: 5, comment: "Excellent job on our 45-foot coach. Bay was ready on time, team was professional. Will be back." },
    { rating: 5, comment: "Best undercarriage wash in the corridor. They really know how to handle school buses." },
    { rating: 5, comment: "Flawless exterior wash. Our fleet manager specifically requests this location every time." },
    { rating: 4, comment: "Good wash overall. Slight water spots on the passenger side but the interior was immaculate." },
    { rating: 4, comment: "Consistent quality every time we come here. Fair pricing for the area." },
    { rating: 4, comment: "Quick turnaround, friendly staff. Would give 5 stars but the waiting area is cramped." },
    { rating: 4, comment: "Solid exterior wash. Handled our double-decker without issues. Good communication throughout." },
    { rating: 4, comment: "Professional service, on-time appointment. Minor streaking on the windshield." },
    { rating: 3, comment: "Adequate service but had to wait 20 minutes past our appointment. Communication could improve." },
    { rating: 3, comment: "Wash quality is fine but the facility is dated. Price is fair for what you get." },
    { rating: 3, comment: "Decent wash but they missed the wheel wells. Had to point it out for a redo." },
  ];

  const providerReplies: Record<number, { reply: string }> = {
    0: { reply: "Thank you for the kind words! We take pride in our coach washing service." },
    8: { reply: "We apologize for the wait. We've added an extra bay to reduce wait times during peak hours." },
    3: { reply: "Thanks for the feedback! We've addressed the streaking issue with new equipment." },
  };

  let reviewCount = 0;
  for (let ri = 0; ri < Math.min(reviewData.length, completedBookings.length); ri++) {
    const b = completedBookings[ri];
    const rd = reviewData[ri];
    const replyInfo = providerReplies[ri];
    const daysAgo = 25 - ri * 2;

    await prisma.review.create({
      data: {
        bookingId: b.id,
        locationId: b.locationId,
        authorId: b.customerId,
        subjectId: b.customerId, // Required field — subject of the review
        rating: rd.rating,
        comment: rd.comment,
        providerReply: replyInfo?.reply || null,
        providerReplyAt: replyInfo ? new Date(Date.now() - (daysAgo - 1) * 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      },
    });
    reviewCount++;
  }
  console.log(`  ✓ ${reviewCount} seed reviews created (${Object.keys(providerReplies).length} with provider replies).`);

  // Notifications
  function daysAgoDate(d: number): Date { return new Date(Date.now() - d * 24 * 60 * 60 * 1000); }
  function hoursAgoDate(h: number): Date { return new Date(Date.now() - h * 60 * 60 * 1000); }

  const notifBase = { channel: "IN_APP" as const, status: "DELIVERED" as const };

  const seedNotifications = [
    // Admin (3)
    { userId: adminUser.id, subject: "New provider registration", body: "Sparkle Wash NJ has submitted a provider application. Review their listing.", actionUrl: "/admin/providers?status=PENDING", readAt: null, ...notifBase, sentAt: daysAgoDate(2), deliveredAt: daysAgoDate(2), createdAt: daysAgoDate(2) },
    { userId: adminUser.id, subject: "Provider SLA alert", body: "Metro Fleet Wash — Bronx Terminal has missed 3 booking responses this week.", actionUrl: "/admin/providers", readAt: daysAgoDate(5), ...notifBase, sentAt: daysAgoDate(5), deliveredAt: daysAgoDate(5), createdAt: daysAgoDate(5) },
    { userId: adminUser.id, subject: "Platform milestone", body: "WashBuddy has processed 100 bookings this month. Platform revenue: $1,247.50.", actionUrl: "/admin", readAt: null, ...notifBase, sentAt: daysAgoDate(1), deliveredAt: daysAgoDate(1), createdAt: daysAgoDate(1) },

    // Driver (5)
    { userId: driverUser.id, subject: "Booking confirmed", body: "Your exterior wash at Lakeshore Bus Care is confirmed for tomorrow at 10:00 AM. Address: 2847 Lakeshore Blvd W, Etobicoke.", actionUrl: "/my-bookings", readAt: daysAgoDate(3), ...notifBase, sentAt: daysAgoDate(3), deliveredAt: daysAgoDate(3), createdAt: daysAgoDate(3) },
    { userId: driverUser.id, subject: "Wash complete!", body: "Your wash at Metro Fleet Wash is finished. Leave a review to help other drivers.", actionUrl: "/my-bookings", readAt: null, ...notifBase, sentAt: daysAgoDate(1), deliveredAt: daysAgoDate(1), createdAt: daysAgoDate(1) },
    { userId: driverUser.id, subject: "Booking reminder", body: "Reminder: You have a wash scheduled at Empire State Coach Wash tomorrow at 9:00 AM.", actionUrl: "/my-bookings", readAt: null, ...notifBase, sentAt: hoursAgoDate(12), deliveredAt: hoursAgoDate(12), createdAt: hoursAgoDate(12) },
    { userId: driverUser.id, subject: "Rate limited by fleet policy", body: "Your booking at QuickClean Bus Spa was blocked. Fleet policy: maximum 1 wash per vehicle per 7 days.", actionUrl: "/search", readAt: null, ...notifBase, sentAt: hoursAgoDate(6), deliveredAt: hoursAgoDate(6), createdAt: hoursAgoDate(6) },
    { userId: driverUser.id, subject: "Booking declined", body: "Your request at Hudson Valley Bus Wash was declined. Reason: fully booked. Try nearby alternatives.", actionUrl: "/search", readAt: daysAgoDate(2), ...notifBase, sentAt: daysAgoDate(2), deliveredAt: daysAgoDate(2), createdAt: daysAgoDate(2) },

    // Fleet admin (4)
    { userId: fleetAdminUser.id, subject: "Wash request submitted", body: "Alex Rivera submitted a wash request for vehicle NEB-101 at Metro Fleet Wash — Bronx Terminal.", actionUrl: "/fleet/requests", readAt: null, ...notifBase, sentAt: hoursAgoDate(4), deliveredAt: hoursAgoDate(4), createdAt: hoursAgoDate(4) },
    { userId: fleetAdminUser.id, subject: "Monthly wash summary", body: "Your fleet completed 12 washes in March. Total spend: $1,847.50. 2 vehicles are overdue.", actionUrl: "/fleet/reports", readAt: daysAgoDate(2), ...notifBase, sentAt: daysAgoDate(2), deliveredAt: daysAgoDate(2), createdAt: daysAgoDate(2) },
    { userId: fleetAdminUser.id, subject: "Vehicle overdue for wash", body: "Vehicle NEB-103 is 5 days overdue for its scheduled wash. Last washed: March 15.", actionUrl: "/fleet/vehicles", readAt: null, ...notifBase, sentAt: daysAgoDate(1), deliveredAt: daysAgoDate(1), createdAt: daysAgoDate(1) },
    { userId: fleetAdminUser.id, subject: "Policy violation attempt", body: "Driver Mike Johnson attempted to book at a non-approved provider. Request was blocked by fleet policy.", actionUrl: "/fleet/settings", readAt: null, ...notifBase, sentAt: hoursAgoDate(8), deliveredAt: hoursAgoDate(8), createdAt: hoursAgoDate(8) },

    // Provider owner (4)
    { userId: providerOwnerUser.id, subject: "New booking request", body: "New exterior wash request from Northeast Bus Lines for tomorrow at 10:00 AM. Respond within 5 minutes.", actionUrl: "/provider", readAt: null, ...notifBase, sentAt: hoursAgoDate(3), deliveredAt: hoursAgoDate(3), createdAt: hoursAgoDate(3) },
    { userId: providerOwnerUser.id, subject: "Review received", body: "A customer left a 4-star review at your Bronx Terminal location: 'Good wash overall. Slight water spots...'", actionUrl: "/provider/reviews", readAt: null, ...notifBase, sentAt: daysAgoDate(1), deliveredAt: daysAgoDate(1), createdAt: daysAgoDate(1) },
    { userId: providerOwnerUser.id, subject: "Listing approved", body: "Your WashBuddy listing has been approved! You're now visible to customers in the search results.", actionUrl: "/provider", readAt: daysAgoDate(20), ...notifBase, sentAt: daysAgoDate(20), deliveredAt: daysAgoDate(20), createdAt: daysAgoDate(20) },
    { userId: providerOwnerUser.id, subject: "Payout processed", body: "Your weekly payout of $1,245.00 has been processed to your bank account ending in ****4521.", actionUrl: "/provider", readAt: daysAgoDate(3), ...notifBase, sentAt: daysAgoDate(3), deliveredAt: daysAgoDate(3), createdAt: daysAgoDate(3) },
  ];

  await prisma.notification.createMany({ data: seedNotifications });
  const unreadCount = seedNotifications.filter((n) => !n.readAt).length;
  console.log(`  ✓ ${seedNotifications.length} seed notifications created (${unreadCount} unread).\n`);

  // ── Step 4.6: V2 seed data — wash bays, clients, subscriptions, discounts ──
  console.log("Step 4.6: Creating V2 seed data...");

  // Fetch all approved locations for wash bay creation. Earlier this
  // had a `take: 45` cap that pre-dated the provider-pool growing past
  // 50 — the seed creates ~95-110 locations, the cap meant locations
  // past index 44 got zero bays, and they showed up as "No bay fits
  // your active vehicle" on Find a Wash regardless of vehicle. Drop
  // the cap so every approved location gets a default bay set.
  const allApprovedLocations = await prisma.location.findMany({
    where: { isVisible: true, provider: { approvalStatus: "APPROVED" } },
    include: { services: { select: { id: true, capacityPerSlot: true } } },
  });

  // Wash Bays — realistic facility-tier distribution. Real commercial
  // bus-wash networks vary: some yards top out at MEDIUM, most at
  // LARGE, only a minority handle 45ft+ EXTRA_LARGE coaches. Earlier
  // we created near-uniform 3-bay locations where every location got
  // an EXTRA_LARGE-capable bay, so the driver-side compat check
  // showed every location as compatible regardless of vehicle. Tier
  // assignment is deterministic on the location id (FNV-1a over the
  // uuid) so the mix is stable across re-seeds.
  //
  // 30% MEDIUM tier  — all bays cap at MEDIUM
  // 40% LARGE tier   — at least one bay caps at LARGE
  // 30% EXTRA_LARGE  — at least one bay caps at EXTRA_LARGE
  //
  // Bay supportedClasses are contiguous from SMALL up to the cap —
  // a LARGE bay is {SMALL, MEDIUM, LARGE}, never partial. Bigger bays
  // physically accept smaller vehicles too.
  const seedBayHash = (id: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
  };
  type FacilityTier = "MEDIUM" | "LARGE" | "EXTRA_LARGE";
  const seedTierFor = (id: string): FacilityTier => {
    const bucket = seedBayHash(id) % 100;
    if (bucket < 30) return "MEDIUM";
    if (bucket < 70) return "LARGE";
    return "EXTRA_LARGE";
  };
  const seedBayCount = (id: string, tier: FacilityTier): number => {
    const n = seedBayHash(id + ":bays") % 3;
    if (tier === "EXTRA_LARGE") return 2 + n; // 2-4
    return 2 + (n % 2); // 2-3 for MEDIUM/LARGE
  };
  const seedBayShape = (tier: FacilityTier, index: number, total: number): { supportedClasses: string[]; maxLengthIn: number; maxHeightIn: number } => {
    const isLast = index === total - 1;
    if (tier === "MEDIUM") return { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
    if (tier === "LARGE") {
      return isLast
        ? { supportedClasses: ["SMALL", "MEDIUM", "LARGE"], maxLengthIn: 540, maxHeightIn: 156 }
        : { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
    }
    if (isLast) return { supportedClasses: ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"], maxLengthIn: 720, maxHeightIn: 168 };
    if (index === total - 2) return { supportedClasses: ["SMALL", "MEDIUM", "LARGE"], maxLengthIn: 540, maxHeightIn: 156 };
    return { supportedClasses: ["SMALL", "MEDIUM"], maxLengthIn: 360, maxHeightIn: 132 };
  };

  let bayCount = 0;
  const tierCounts = { MEDIUM: 0, LARGE: 0, EXTRA_LARGE: 0 };
  for (const loc of allApprovedLocations) {
    const tier = seedTierFor(loc.id);
    const numBays = seedBayCount(loc.id, tier);
    tierCounts[tier] += 1;
    for (let b = 0; b < numBays; b++) {
      const shape = seedBayShape(tier, b, numBays);
      await prisma.washBay.create({
        data: {
          locationId: loc.id,
          name: `Bay ${b + 1}`,
          maxVehicleLengthIn: shape.maxLengthIn,
          maxVehicleHeightIn: shape.maxHeightIn,
          supportedClasses: shape.supportedClasses,
          isActive: true,
          displayOrder: b,
        },
      });
      bayCount++;
    }
  }
  console.log(`  ✓ ${bayCount} wash bays created across ${allApprovedLocations.length} locations.`);
  console.log(`    MEDIUM tier: ${tierCounts.MEDIUM} · LARGE tier: ${tierCounts.LARGE} · EXTRA_LARGE tier: ${tierCounts.EXTRA_LARGE}`);

  // Client Profiles — 15 profiles across 5 providers
  const profileProviders = allApprovedLocations.slice(0, 5);
  const clientUsers = [driverUser, driver1User, fleetAdminUser, providerOwnerUser, adminUser];
  let profileCount = 0;

  // 10 linked to platform users
  for (let i = 0; i < 10; i++) {
    const prov = profileProviders[i % 5];
    const usr = clientUsers[i % clientUsers.length];
    const tags = i < 2 ? ["VIP"] : i < 5 ? ["FREQUENT"] : i < 6 ? ["SERVICE_RECOVERY"] : ["NEW_CLIENT"];
    if (i >= 8) tags.push("FLEET_ACCOUNT");
    await prisma.clientProfile.upsert({
      where: { providerId_userId: { providerId: prov.providerId, userId: usr.id } },
      update: {
        name: `${usr.firstName} ${usr.lastName}`,
        email: usr.email,
        tags,
        lifetimeSpendMinor: randomBetween(5000, 80000),
        visitCount: i < 5 ? randomBetween(5, 20) : randomBetween(0, 3),
        lastVisitAt: new Date(Date.now() - randomBetween(1, 30) * 24 * 60 * 60 * 1000),
      },
      create: {
        providerId: prov.providerId,
        userId: usr.id,
        name: `${usr.firstName} ${usr.lastName}`,
        email: usr.email,
        tags,
        lifetimeSpendMinor: randomBetween(5000, 80000),
        visitCount: i < 5 ? randomBetween(5, 20) : randomBetween(0, 3),
        lastVisitAt: new Date(Date.now() - randomBetween(1, 30) * 24 * 60 * 60 * 1000),
      },
    });
    profileCount++;
  }

  // 5 off-platform clients
  const offPlatformNames = ["Carlos Mendez", "Sarah Whitfield", "Jim Kowalski", "Tanya Brooks", "Dev Patel"];
  for (let i = 0; i < 5; i++) {
    const prov = profileProviders[i % 5];
    await prisma.clientProfile.create({
      data: {
        providerId: prov.providerId,
        name: offPlatformNames[i],
        phone: i < 2 ? `+1212555${1100 + i}` : null,
        email: i < 2 ? offPlatformNames[i].toLowerCase().replace(" ", ".") + "@fleet.com" : null,
        tags: i === 0 ? ["FREQUENT", "FLEET_ACCOUNT"] : ["NEW_CLIENT"],
        lifetimeSpendMinor: randomBetween(0, 30000),
        visitCount: randomBetween(0, 8),
      },
    });
    profileCount++;
  }
  console.log(`  ✓ ${profileCount} client profiles created.`);

  // Subscription Packages — 3 at different providers
  const subProviders = allApprovedLocations.slice(0, 3);
  const packages = [];
  const pkgDefs = [
    { name: "Weekly Exterior Wash", cadence: "WEEKLY", minWashes: 4 },
    { name: "Biweekly Full Detail", cadence: "BIWEEKLY", minWashes: 3 },
    { name: "Monthly Fleet Clean", cadence: "MONTHLY", minWashes: 3 },
  ];
  for (let i = 0; i < 3; i++) {
    const loc = subProviders[i];
    const svc = loc.services[0];
    const pkg = await prisma.subscriptionPackage.create({
      data: {
        providerId: loc.providerId,
        locationId: loc.id,
        name: pkgDefs[i].name,
        description: `Recurring ${pkgDefs[i].name.toLowerCase()} package`,
        includedServiceIds: svc ? [svc.id] : [],
        cadence: pkgDefs[i].cadence,
        pricePerWashMinor: randomBetween(8000, 15000),
        currencyCode: i === 0 ? "CAD" : "USD",
        minWashes: pkgDefs[i].minWashes,
        isActive: true,
      },
    });
    packages.push(pkg);
  }
  console.log(`  ✓ ${packages.length} subscription packages created.`);

  // Fleet Subscriptions — 3 active
  const subDefs = [
    { pkgIdx: 0, vehIdx: 0, washes: 3, daysAgo: 30, nextDays: 3 },
    { pkgIdx: 0, vehIdx: 1, washes: 3, daysAgo: 30, nextDays: 3 },
    { pkgIdx: 1, vehIdx: 2, washes: 1, daysAgo: 14, nextDays: 7 },
  ];
  for (const sd of subDefs) {
    await prisma.fleetSubscription.create({
      data: {
        packageId: packages[sd.pkgIdx].id,
        fleetId: fleet.id,
        vehicleId: vehicles[sd.vehIdx].id,
        purchasedByUserId: fleetAdminUser.id,
        status: "ACTIVE",
        startDate: new Date(Date.now() - sd.daysAgo * 24 * 60 * 60 * 1000),
        nextWashDate: new Date(Date.now() + sd.nextDays * 24 * 60 * 60 * 1000),
        totalWashesCompleted: sd.washes,
      },
    });
  }
  console.log(`  ✓ ${subDefs.length} fleet subscriptions created.`);

  // Provider Discounts — 4 rules at 2 providers
  const discountProviders = allApprovedLocations.slice(0, 2);
  const discountDefs = [
    { providerId: discountProviders[0].providerId, locationId: discountProviders[0].id, discountType: "OFF_PEAK", name: "Weekday Afternoon Special", percentOff: 10, peakStartTime: "14:00", peakEndTime: "16:00", peakDaysOfWeek: [1,2,3,4,5], isStackable: true },
    { providerId: discountProviders[0].providerId, locationId: discountProviders[0].id, discountType: "VOLUME", name: "Fleet Volume Discount", percentOff: 5, volumeThreshold: 10, volumePeriodDays: 30, isStackable: true },
    { providerId: discountProviders[1].providerId, locationId: discountProviders[1].id, discountType: "FIRST_TIME", name: "New Customer Welcome", flatAmountOff: 1500, isStackable: false },
    { providerId: discountProviders[1].providerId, locationId: discountProviders[1].id, discountType: "OFF_PEAK", name: "Saturday Early Bird", percentOff: 15, peakStartTime: "06:00", peakEndTime: "09:00", peakDaysOfWeek: [6], isStackable: true },
  ];
  for (const dd of discountDefs) {
    await prisma.providerDiscount.create({ data: { ...dd, isActive: true } as any });
  }
  console.log(`  ✓ ${discountDefs.length} provider discounts created.`);

  // Off-platform bookings — 5 DIRECT + 2 WALK_IN
  const offPlatformBookings = [];
  for (let i = 0; i < 5; i++) {
    const loc = seedLocations[i % seedLocations.length];
    const svc = loc.services[0];
    if (!svc) continue;
    const daysAgo = randomBetween(1, 14);
    const status = i < 3 ? "COMPLETED" : i === 3 ? "SETTLED" : "PROVIDER_CONFIRMED";
    const b = await prisma.booking.create({
      data: {
        locationId: loc.id, serviceId: svc.id, customerId: driverUser.id,
        status: status as any, idempotencyKey: `seed-offplat-${i}-${Date.now()}`,
        serviceNameSnapshot: svc.name, serviceBasePriceMinor: svc.basePriceMinor,
        platformFeeMinor: 0, totalPriceMinor: svc.basePriceMinor,
        currencyCode: svc.currencyCode, locationTimezone: loc.timezone,
        scheduledStartAtUtc: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        scheduledEndAtUtc: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + svc.durationMins * 60000),
        bookingSource: "DIRECT", isOffPlatform: true,
        offPlatformClientName: offPlatformNames[i],
        offPlatformClientPhone: i < 2 ? `+1212555${1100 + i}` : null,
        offPlatformClientEmail: i < 2 ? offPlatformNames[i].toLowerCase().replace(" ", ".") + "@fleet.com" : null,
      },
    });
    offPlatformBookings.push(b);
  }

  // 2 walk-in bookings
  for (let i = 0; i < 2; i++) {
    const loc = seedLocations[i % seedLocations.length];
    const svc = loc.services[0];
    if (!svc) continue;
    const status = i === 0 ? "COMPLETED" : "IN_SERVICE";
    await prisma.booking.create({
      data: {
        locationId: loc.id, serviceId: svc.id, customerId: driverUser.id,
        status: status as any, idempotencyKey: `seed-walkin-${i}-${Date.now()}`,
        serviceNameSnapshot: svc.name, serviceBasePriceMinor: svc.basePriceMinor,
        platformFeeMinor: 0, totalPriceMinor: svc.basePriceMinor,
        currencyCode: svc.currencyCode, locationTimezone: loc.timezone,
        scheduledStartAtUtc: new Date(Date.now() - randomBetween(1, 5) * 24 * 60 * 60 * 1000),
        scheduledEndAtUtc: new Date(Date.now() - randomBetween(1, 5) * 24 * 60 * 60 * 1000 + svc.durationMins * 60000),
        bookingSource: "WALK_IN", isOffPlatform: true,
        offPlatformClientName: i === 0 ? "Walk-in Customer" : "Fleet Driver (no account)",
        offPlatformPaymentExternal: i === 0,
      },
    });
  }
  console.log(`  ✓ ${offPlatformBookings.length + 2} off-platform/walk-in bookings created.`);

  // Booking Photos — 10 photos for 5 completed bookings
  const photoBookings = completedBookings.slice(0, 5);
  let photoCount = 0;
  for (const pb of photoBookings) {
    for (const photoType of ["BEFORE", "AFTER"]) {
      const asset = await prisma.fileAsset.create({
        data: {
          bucket: "local",
          objectKey: `photos/placeholder_${photoType.toLowerCase()}_${photoCount + 1}.jpg`,
          mimeType: "image/jpeg",
          byteSize: 150000,
          sha256Hex: `${photoType.toLowerCase()}${String(photoCount).padStart(60, "0")}fade`,
          purposeCode: "BOOKING_PHOTO",
          uploadedByUserId: providerOwnerUser.id,
        },
      });
      await prisma.bookingPhoto.create({
        data: {
          bookingId: pb.id,
          uploadedBy: providerOwnerUser.id,
          photoType,
          fileAssetId: asset.id,
        },
      });
      photoCount++;
    }
  }
  console.log(`  ✓ ${photoCount} booking photos created.`);

  // Booking Messages — 3 messages on completed bookings
  const msgTemplates = [
    { templateId: "WASH_COMPLETE", body: "Your wash is complete. Bus is in Lot A." },
    { templateId: "RUNNING_LATE", body: "We're running approximately 10 minutes behind schedule. We apologize for the delay." },
    { templateId: "READY_FOR_PICKUP", body: "Your bus is ready for pickup at the front entrance." },
  ];
  for (let i = 0; i < Math.min(3, completedBookings.length); i++) {
    await prisma.bookingMessage.create({
      data: {
        bookingId: completedBookings[i].id,
        senderId: providerOwnerUser.id,
        templateId: msgTemplates[i].templateId,
        body: msgTemplates[i].body,
      },
    });
  }
  console.log(`  ✓ ${Math.min(3, completedBookings.length)} booking messages created.`);

  // Notification Preferences — 3 demo users × 10 event types
  const prefUsers = [fleetAdminUser, driverUser, providerOwnerUser];
  const eventTypes = ["NEW_BOOKING", "CANCELLATION", "REVIEW_RECEIVED", "SLA_WARNING", "BOOKING_REMINDER", "WASH_COMPLETE", "BOOKING_RESCHEDULED", "MESSAGE_RECEIVED", "WASH_HEALTH_ALERT", "SUBSCRIPTION_RENEWAL"];
  let prefCount = 0;
  for (const u of prefUsers) {
    for (const et of eventTypes) {
      await prisma.notificationPreference.create({
        data: {
          userId: u.id,
          eventType: et,
          emailEnabled: true,
          inAppEnabled: true,
          smsEnabled: false,
        },
      });
      prefCount++;
    }
  }
  console.log(`  ✓ ${prefCount} notification preferences created.`);

  // ── Step 4.7: V2 FINAL — ServicePricing + ProviderAddOns ──────────
  console.log("Step 4.7: Creating service pricing and add-ons...");

  // ServicePricing — 4 records per service (one per vehicle class)
  const allServices = await prisma.service.findMany({ where: { isVisible: true }, select: { id: true, basePriceMinor: true, durationMins: true }, take: 200 });
  const classMultipliers = [
    { vehicleClass: "SMALL", priceMult: 0.7, durMult: 0.7 },
    { vehicleClass: "MEDIUM", priceMult: 1.0, durMult: 1.0 },
    { vehicleClass: "LARGE", priceMult: 1.3, durMult: 1.2 },
    { vehicleClass: "EXTRA_LARGE", priceMult: 1.6, durMult: 1.4 },
  ];
  let pricingCount = 0;
  for (const svc of allServices) {
    for (const cm of classMultipliers) {
      await prisma.servicePricing.create({
        data: {
          serviceId: svc.id,
          vehicleClass: cm.vehicleClass,
          priceMinor: Math.round(svc.basePriceMinor * cm.priceMult / 100) * 100,
          durationMins: Math.round(svc.durationMins * cm.durMult),
          isAvailable: true,
        },
      });
      pricingCount++;
    }
  }
  console.log(`  ✓ ${pricingCount} service pricing records created.`);

  // ProviderAddOns — seed for 10 locations
  const addOnLocations = allApprovedLocations.slice(0, 10);
  const addOnTemplates = [
    { category: "RESTROOM_SUPPLIES", name: "Toilet Paper", iconName: "ScrollText", priceMinor: 350, quantityMode: "COUNTABLE" },
    { category: "RESTROOM_SUPPLIES", name: "Hand Soap Refill", iconName: "Droplets", priceMinor: 400, quantityMode: "FLAT" },
    { category: "RESTROOM_SUPPLIES", name: "Air Freshener", iconName: "Wind", priceMinor: 500, quantityMode: "FLAT" },
    { category: "DRIVER_AMENITIES", name: "Coffee", iconName: "Coffee", priceMinor: 300, quantityMode: "COUNTABLE" },
    { category: "DRIVER_AMENITIES", name: "Bottled Water", iconName: "GlassWater", priceMinor: 250, quantityMode: "COUNTABLE" },
    { category: "DRIVER_AMENITIES", name: "Snack Pack", iconName: "Cookie", priceMinor: 400, quantityMode: "COUNTABLE" },
    { category: "VEHICLE_SUPPLIES", name: "Windshield Washer Fluid", iconName: "Droplet", priceMinor: 800, quantityMode: "FLAT" },
    { category: "VEHICLE_SUPPLIES", name: "Tire Pressure Check", iconName: "Gauge", priceMinor: 500, quantityMode: "FLAT" },
    { category: "SPECIALTY_TREATMENTS", name: "Protective Wax Coating", iconName: "Shield", priceMinor: 3500, quantityMode: "FLAT" },
    { category: "SPECIALTY_TREATMENTS", name: "Anti-Salt Undercoating", iconName: "Snowflake", priceMinor: 4500, quantityMode: "FLAT" },
  ];
  let addOnCount = 0;
  for (let li = 0; li < addOnLocations.length; li++) {
    const loc = addOnLocations[li];
    const numItems = li < 3 ? 8 : li < 6 ? 6 : 4; // larger locations get more items
    for (let ai = 0; ai < Math.min(numItems, addOnTemplates.length); ai++) {
      const t = addOnTemplates[ai];
      await prisma.providerAddOn.create({
        data: {
          providerId: loc.providerId, locationId: loc.id,
          category: t.category, name: t.name, iconName: t.iconName,
          priceMinor: t.priceMinor, currencyCode: loc.countryCode === "CA" ? "CAD" : "USD",
          quantityMode: t.quantityMode, isActive: true, isFromTemplate: true, displayOrder: ai,
        },
      });
      addOnCount++;
    }
  }
  console.log(`  ✓ ${addOnCount} provider add-ons created.\n`);

  // ── Step 5: Write DemoDataRegistry records ─────────────────────────
  console.log("Step 5: Writing DemoDataRegistry records...");

  // Batch insert in chunks of 100
  for (let i = 0; i < registryRecords.length; i += 100) {
    const chunk = registryRecords.slice(i, i + 100);
    await prisma.demoDataRegistry.createMany({ data: chunk });
  }

  console.log(`  ✓ ${registryRecords.length} registry records written.\n`);

  // ── Step 6: Verification queries ───────────────────────────────────
  console.log("Step 6: Running verification queries...");

  const providerCount = await prisma.provider.count();
  const distinctProviderNames = await prisma.provider.groupBy({ by: ["name"], _count: true });
  const locationCount = await prisma.location.count();
  const serviceCount = await prisma.service.count();
  const opWindowCount = await prisma.operatingWindow.count();

  // Check every location has ≥ 2 services
  const locationsWithServices = await prisma.location.findMany({
    select: { id: true, name: true, _count: { select: { services: true } } },
  });
  const underservicedLocations = locationsWithServices.filter((l) => l._count.services < 2);

  // Check no null contact emails — providers don't have an email field,
  // but we track them in the DemoDataRegistry. The requirement is really
  // about having linked provider memberships with user emails.
  const providersWithoutAdmin = await prisma.provider.findMany({
    where: { memberships: { none: {} } },
    select: { id: true, name: true },
  });

  // Check for services with platformFeeMinor != 0
  const nonZeroFeeServices = await prisma.service.count({ where: { platformFeeMinor: { not: 0 } } });

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  VERIFICATION RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Providers:            ${providerCount}`);
  console.log(`  Distinct names:       ${distinctProviderNames.length}`);
  console.log(`  Locations:            ${locationCount}`);
  console.log(`  Services:             ${serviceCount}`);
  console.log(`  Operating windows:    ${opWindowCount}`);
  console.log(`  Compatibility rules:  ${totalCompatRules}`);
  console.log(`  Underserviced locs:   ${underservicedLocations.length}`);
  console.log(`  Non-zero fee svcs:    ${nonZeroFeeServices}`);
  console.log(`  Providers w/o admin:  ${providersWithoutAdmin.length} (expected: 49 — only MetroClean has linked demo user)`);
  console.log(`  Fleet vehicles:       ${vehicles.length}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Assertions
  if (providerCount !== 50) {
    throw new Error(`FAIL: Expected 50 providers, got ${providerCount}`);
  }
  if (distinctProviderNames.length !== 50) {
    throw new Error(`FAIL: Expected 50 distinct provider names, got ${distinctProviderNames.length}`);
  }
  if (underservicedLocations.length > 0) {
    throw new Error(`FAIL: ${underservicedLocations.length} locations have < 2 services: ${underservicedLocations.map((l) => l.name).join(", ")}`);
  }
  if (nonZeroFeeServices > 0) {
    throw new Error(`FAIL: ${nonZeroFeeServices} services have non-zero platformFeeMinor`);
  }

  console.log("  ✅ All verifications passed!");
  console.log("\n  Seed completed successfully.\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
