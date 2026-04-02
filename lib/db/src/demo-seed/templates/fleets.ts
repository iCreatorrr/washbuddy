export interface FleetTemplate {
  namePattern: string;
  billingMode: "FLEET_PAYS" | "DRIVER_PAYS" | "MIXED";
  sizeCategory: "small" | "medium" | "large";
  regionBias?: string;
}

export const FLEET_NAME_PARTS = {
  prefixes: [
    "Northeast", "Great Lakes", "Metro", "Tri-State", "Golden",
    "Pacific", "Atlantic", "Southern", "Northern", "Central",
    "Capital", "Heritage", "Pioneer", "Frontier", "Lakeshore",
  ],
  suffixes: [
    "Bus Lines", "Transit Co", "Coach Services", "Express", "Transportation",
    "Charter", "Shuttle Services", "Fleet Services", "Motor Coach", "Coaches",
  ],
};

export const FLEET_TEMPLATES: FleetTemplate[] = [
  { namePattern: "large-fleet", billingMode: "FLEET_PAYS", sizeCategory: "large" },
  { namePattern: "medium-fleet", billingMode: "FLEET_PAYS", sizeCategory: "medium" },
  { namePattern: "small-fleet", billingMode: "DRIVER_PAYS", sizeCategory: "small" },
  { namePattern: "mixed-fleet", billingMode: "MIXED", sizeCategory: "medium" },
];

export const FLEET_SIZE_RANGES: Record<string, [number, number]> = {
  small: [3, 8],
  medium: [8, 20],
  large: [20, 40],
};
