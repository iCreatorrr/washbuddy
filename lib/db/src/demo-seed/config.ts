export const SEED_VERSION = "1.0.0";
export const MASTER_SEED = 0x57415348; // "WASH" in hex — stable PRNG anchor

export type SeedMode = "demo-lite" | "demo-full" | "demo-stress";

export interface SeedModeConfig {
  mode: SeedMode;
  providersPerRegion: number;
  locationsPerProvider: [number, number];
  fleetsTotal: number;
  driversTotal: number;
  vehiclesPerFleet: [number, number];
  independentDriversWithVehicles: number;
  bookingsPerLocation: [number, number];
  reviewsPercentOfCompleted: number;
  disputesPercentOfCompleted: number;
}

export const SEED_MODES: Record<SeedMode, SeedModeConfig> = {
  "demo-lite": {
    mode: "demo-lite",
    providersPerRegion: 4,
    locationsPerProvider: [1, 2],
    fleetsTotal: 4,
    driversTotal: 20,
    vehiclesPerFleet: [3, 6],
    independentDriversWithVehicles: 5,
    bookingsPerLocation: [5, 15],
    reviewsPercentOfCompleted: 60,
    disputesPercentOfCompleted: 5,
  },
  "demo-full": {
    mode: "demo-full",
    providersPerRegion: 8,
    locationsPerProvider: [1, 4],
    fleetsTotal: 16,
    driversTotal: 120,
    vehiclesPerFleet: [8, 20],
    independentDriversWithVehicles: 15,
    bookingsPerLocation: [20, 60],
    reviewsPercentOfCompleted: 70,
    disputesPercentOfCompleted: 8,
  },
  "demo-stress": {
    mode: "demo-stress",
    providersPerRegion: 15,
    locationsPerProvider: [2, 6],
    fleetsTotal: 30,
    driversTotal: 300,
    vehiclesPerFleet: [15, 40],
    independentDriversWithVehicles: 40,
    bookingsPerLocation: [80, 200],
    reviewsPercentOfCompleted: 75,
    disputesPercentOfCompleted: 10,
  },
};

export const DEMO_PASSWORD = "password123";

export const BOOKING_STATUS_DISTRIBUTION: Record<string, number> = {
  COMPLETED: 0.35,
  SETTLED: 0.15,
  PROVIDER_CONFIRMED: 0.12,
  HELD: 0.08,
  CHECKED_IN: 0.04,
  IN_SERVICE: 0.03,
  COMPLETED_PENDING_WINDOW: 0.03,
  PROVIDER_DECLINED: 0.05,
  CUSTOMER_CANCELLED: 0.04,
  PROVIDER_CANCELLED: 0.02,
  EXPIRED: 0.03,
  NO_SHOW: 0.03,
  DISPUTED: 0.02,
  REFUNDED: 0.01,
};

export const RATING_DISTRIBUTION = [
  { rating: 5, weight: 0.35 },
  { rating: 4, weight: 0.35 },
  { rating: 3, weight: 0.18 },
  { rating: 2, weight: 0.08 },
  { rating: 1, weight: 0.04 },
];

export const SERVICE_TEMPLATES = [
  {
    name: "Exterior Bus Wash",
    description: "Full exterior wash including undercarriage rinse",
    durationMins: 30,
    basePriceMinorRange: [12000, 18000] as [number, number],
    platformFeePercent: 0.15,
    capacityPerSlot: [1, 3] as [number, number],
    leadTimeMins: 60,
  },
  {
    name: "Full Detail Wash",
    description: "Complete interior and exterior deep clean",
    durationMins: 90,
    basePriceMinorRange: [30000, 45000] as [number, number],
    platformFeePercent: 0.15,
    capacityPerSlot: [1, 1] as [number, number],
    leadTimeMins: 120,
  },
  {
    name: "Quick Rinse",
    description: "Fast exterior rinse for light maintenance",
    durationMins: 15,
    basePriceMinorRange: [6000, 9000] as [number, number],
    platformFeePercent: 0.15,
    capacityPerSlot: [2, 4] as [number, number],
    leadTimeMins: 30,
  },
  {
    name: "Interior Sanitization",
    description: "Deep interior cleaning with sanitizing treatment",
    durationMins: 60,
    basePriceMinorRange: [20000, 28000] as [number, number],
    platformFeePercent: 0.15,
    capacityPerSlot: [1, 2] as [number, number],
    leadTimeMins: 90,
  },
  {
    name: "Fleet Express Wash",
    description: "Streamlined exterior wash optimized for fleet throughput",
    durationMins: 20,
    basePriceMinorRange: [9000, 13000] as [number, number],
    platformFeePercent: 0.12,
    capacityPerSlot: [3, 5] as [number, number],
    leadTimeMins: 45,
  },
];

export const VEHICLE_CATEGORIES = [
  { categoryCode: "BUS", subtypeCode: "STANDARD", lengthRange: [360, 480] as [number, number], heightRange: [120, 144] as [number, number], restroomChance: 0.1 },
  { categoryCode: "BUS", subtypeCode: "COACH", lengthRange: [420, 540] as [number, number], heightRange: [132, 162] as [number, number], restroomChance: 0.7 },
  { categoryCode: "BUS", subtypeCode: "SHUTTLE", lengthRange: [240, 360] as [number, number], heightRange: [96, 120] as [number, number], restroomChance: 0.0 },
  { categoryCode: "BUS", subtypeCode: "DOUBLE_DECKER", lengthRange: [420, 480] as [number, number], heightRange: [156, 180] as [number, number], restroomChance: 0.5 },
  { categoryCode: "BUS", subtypeCode: "MINIBUS", lengthRange: [180, 280] as [number, number], heightRange: [84, 108] as [number, number], restroomChance: 0.0 },
];

export const OPERATING_HOURS_TEMPLATES = {
  standard: { weekday: { open: "06:00", close: "20:00" }, weekend: { open: "08:00", close: "16:00" } },
  extended: { weekday: { open: "05:00", close: "22:00" }, weekend: { open: "06:00", close: "20:00" } },
  "24h": { weekday: { open: "00:00", close: "23:59" }, weekend: { open: "00:00", close: "23:59" } },
  weekdayOnly: { weekday: { open: "07:00", close: "18:00" }, weekend: null },
};
