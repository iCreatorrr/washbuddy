export interface ProviderTemplate {
  namePattern: string;
  locationNamePattern: string;
  hoursTemplate: "standard" | "extended" | "24h" | "weekdayOnly";
  serviceOffering: "basic" | "standard" | "premium" | "full";
  avgRating: [number, number];
}

export const PROVIDER_NAME_PARTS = {
  prefixes: [
    "Sparkle", "Crystal", "Metro", "Urban", "Prime",
    "Elite", "Express", "Superior", "Apex", "Atlas",
    "Summit", "Golden", "Patriot", "Northern", "Lakeshore",
    "Coastal", "Frontier", "Sterling", "Continental", "Transit",
  ],
  suffixes: [
    "Bus Wash", "Fleet Wash", "Coach Care", "Vehicle Services", "Transit Clean",
    "Wash Center", "Detailing", "Mobile Wash", "Auto Spa", "Commercial Wash",
  ],
};

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { namePattern: "premium", locationNamePattern: "{provider} - {city} Hub", hoursTemplate: "extended", serviceOffering: "full", avgRating: [4.4, 4.8] },
  { namePattern: "standard", locationNamePattern: "{provider} - {city} Yard", hoursTemplate: "standard", serviceOffering: "standard", avgRating: [3.8, 4.5] },
  { namePattern: "budget", locationNamePattern: "{provider} - {city} Depot", hoursTemplate: "weekdayOnly", serviceOffering: "basic", avgRating: [3.5, 4.2] },
  { namePattern: "24h", locationNamePattern: "{provider} - {city} 24h", hoursTemplate: "24h", serviceOffering: "standard", avgRating: [4.0, 4.6] },
];

export const SERVICE_OFFERINGS: Record<string, string[]> = {
  basic: ["Exterior Bus Wash", "Quick Rinse"],
  standard: ["Exterior Bus Wash", "Full Detail Wash", "Quick Rinse"],
  premium: ["Exterior Bus Wash", "Full Detail Wash", "Interior Sanitization"],
  full: ["Exterior Bus Wash", "Full Detail Wash", "Quick Rinse", "Interior Sanitization", "Fleet Express Wash"],
};

export const STREET_NAMES = [
  "Industrial Blvd", "Commerce Dr", "Depot Ave", "Terminal Rd", "Fleet Way",
  "Transit Ln", "Service Rd", "Warehouse St", "Loading Dock Dr", "Carrier Ave",
  "Dispatch Blvd", "Mainline Rd", "Crossroads Dr", "Parkway Ave", "Gateway Blvd",
  "Junction Rd", "Overpass Dr", "Station Ave", "Railyard Rd", "Freight Way",
];
