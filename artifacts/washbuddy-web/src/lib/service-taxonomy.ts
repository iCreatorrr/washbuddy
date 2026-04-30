// Service taxonomy constants — paired with the ServiceCategory enum on the
// backend (lib/db/prisma/schema.prisma). The category is the platform-level
// canonical type used for filtering, ranking, and analytics. The subcategory
// is provider-supplied free text with these values offered as suggestions.
//
// Spec: docs/search-discovery-overhaul/03-service-taxonomy-decision.md
//       docs/search-discovery-overhaul/02-eid.md §5.1

export type ServiceCategory =
  | "EXTERIOR_WASH"
  | "INTERIOR_CLEANING"
  | "RESTROOM_DUMP"
  | "RESTOCK_CONSUMABLES"
  | "ADD_ON";

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  "EXTERIOR_WASH",
  "INTERIOR_CLEANING",
  "RESTROOM_DUMP",
  "RESTOCK_CONSUMABLES",
  "ADD_ON",
];

export const CATEGORY_DISPLAY_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: "Exterior wash",
  INTERIOR_CLEANING: "Interior cleaning",
  RESTROOM_DUMP: "Restroom dump",
  RESTOCK_CONSUMABLES: "Restock & consumables",
  ADD_ON: "Add-ons",
};

export const CATEGORY_SHORT_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: "Wash",
  INTERIOR_CLEANING: "Interior",
  RESTROOM_DUMP: "Dump",
  RESTOCK_CONSUMABLES: "Restock",
  ADD_ON: "Add-ons",
};

export const SUGGESTED_SUBCATEGORIES: Record<ServiceCategory, string[]> = {
  EXTERIOR_WASH: [
    "drive-through",
    "hand-wash",
    "hand-wash-with-dry",
    "two-step",
    "pressure-only",
    "mobile",
  ],
  INTERIOR_CLEANING: ["turn-clean", "standard", "deep-detail"],
  RESTROOM_DUMP: ["pump-only", "pump-and-refresh"],
  RESTOCK_CONSUMABLES: [],
  ADD_ON: ["wax", "ceramic-coat", "vinyl-wrap"],
};
