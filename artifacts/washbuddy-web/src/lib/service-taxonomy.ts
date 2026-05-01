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

// Suggested subcategories shown as autocomplete hints in the provider
// service-creation form. Free-string, not enum-locked — providers can type
// their own. Sourced from motorcoach-industry conventions and analogous
// service-marketplace UX patterns. Capitalized for human-readable display
// in the form; matching against provider-typed values is case-insensitive.
export const SUGGESTED_SUBCATEGORIES: Record<ServiceCategory, string[]> = {
  EXTERIOR_WASH: [
    "Hand wash",
    "Drive-through",
    "Touchless",
    "High-pressure",
    "Two-step",
    "Undercarriage",
    "Roof",
    "Wax / polish",
  ],
  INTERIOR_CLEANING: [
    "Standard",
    "Deep clean",
    "Detail",
    "Sanitization",
    "Floor / mat",
    "Upholstery",
    "Window",
  ],
  RESTROOM_DUMP: [
    "Black water pump-out",
    "Gray water pump-out",
    "Black tank flush",
    "Fresh water fill",
    "Tank deodorize",
  ],
  RESTOCK_CONSUMABLES: [
    "Restroom supplies",
    "Cleaning supplies",
    "Bottled water",
    "Coffee & tea supplies",
    "Cups, lids & napkins",
    "Snacks",
    "Tank chemicals",
  ],
  ADD_ON: [
    "Wax / paint protection",
    "Engine bay clean",
    "Tire / wheel detail",
    "Decal / vinyl care",
    "Pet hair / odor",
    "Specialty",
  ],
};
