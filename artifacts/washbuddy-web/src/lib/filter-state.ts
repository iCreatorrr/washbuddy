/**
 * Filter + UI state reducer for /find-a-wash per EID §2.2.
 *
 * Owns the dimensions Round 2+3 introduced: selectedServiceCategories,
 * openFilterEnabled, sheetFilters (9 sections from EID §4.3), sortBy,
 * sheetState (peek/default/expanded), modalOpen (service-picker /
 * all-filters / null).
 *
 * Origin / destination / route stay in find-a-wash.tsx as separate
 * useState — they have async-fetch dependencies that don't belong
 * in a reducer.
 *
 * Per the audit's "filter persistence on destination change"
 * decision: filters DO NOT reset when destination changes. The
 * user's "I want diesel + DEF" preference outlives a route swap.
 * Only `searchBoundsAnchor` (CP3 v3 state, lives separately)
 * clears on context change.
 */

export type ServiceCategory =
  | "EXTERIOR_WASH"
  | "INTERIOR_CLEANING"
  | "RESTROOM_DUMP"
  | "RESTOCK_CONSUMABLES"
  | "ADD_ON";

export type SortBy =
  | "best-fit"
  | "shortest-detour"
  | "distance"
  | "price"
  | "rating";

export type SheetState = "peek" | "default" | "expanded";

export type ModalKind = "service-picker" | "all-filters" | null;

export interface SheetFilters {
  availability: { availableNow: boolean; walkIns: boolean; open24_7: boolean };
  serviceDetails: string[]; // subcategory codes
  fuel: { diesel: boolean; def: boolean; highFlow: boolean };
  driverAmenities: { restroom: boolean; lounge: boolean; wifi: boolean; coffee: boolean; showers: boolean };
  coachAmenities: { overnightParking: boolean; shorePower: boolean; potableWater: boolean };
  repairFlags: string[]; // capability codes
  compliance: { certifiedDisposal: boolean };
  bayOverride: boolean; // overrides Tier 0 silent vehicle filter
}

export interface FilterUIState {
  selectedServiceCategories: ServiceCategory[];
  openFilterEnabled: boolean; // default true
  sheetFilters: SheetFilters;
  sortBy: SortBy;
  sheetState: SheetState;
  modalOpen: ModalKind;
  /** Tracks whether the user has manually overridden the
   *  mode-default sheet state, so a destination change doesn't
   *  yank the user back to mode-default if they intentionally
   *  expanded/collapsed. */
  userOverrodeSheetState: boolean;
}

export const INITIAL_SHEET_FILTERS: SheetFilters = {
  availability: { availableNow: false, walkIns: false, open24_7: false },
  serviceDetails: [],
  fuel: { diesel: false, def: false, highFlow: false },
  driverAmenities: { restroom: false, lounge: false, wifi: false, coffee: false, showers: false },
  coachAmenities: { overnightParking: false, shorePower: false, potableWater: false },
  repairFlags: [],
  compliance: { certifiedDisposal: false },
  bayOverride: false,
};

export function initialFilterState(initialSheetState: SheetState): FilterUIState {
  return {
    selectedServiceCategories: [],
    openFilterEnabled: true,
    sheetFilters: INITIAL_SHEET_FILTERS,
    sortBy: "best-fit",
    sheetState: initialSheetState,
    modalOpen: null,
    userOverrodeSheetState: false,
  };
}

export type FilterUIAction =
  | { type: "SET_SERVICE_CATEGORIES"; categories: ServiceCategory[] }
  | { type: "TOGGLE_SERVICE_CATEGORY"; category: ServiceCategory }
  | { type: "TOGGLE_OPEN_FILTER" }
  | { type: "SET_SHEET_FILTER"; key: keyof SheetFilters; value: SheetFilters[keyof SheetFilters] }
  | { type: "CLEAR_ALL_FILTERS" }
  | { type: "SET_SORT_BY"; sortBy: SortBy }
  | { type: "SET_SHEET_STATE"; sheetState: SheetState; userInitiated: boolean }
  | { type: "RESET_SHEET_STATE_TO_MODE_DEFAULT"; modeDefault: SheetState }
  | { type: "OPEN_MODAL"; modal: Exclude<ModalKind, null> }
  | { type: "CLOSE_MODAL" };

export function filterUIReducer(state: FilterUIState, action: FilterUIAction): FilterUIState {
  switch (action.type) {
    case "SET_SERVICE_CATEGORIES":
      return { ...state, selectedServiceCategories: action.categories };
    case "TOGGLE_SERVICE_CATEGORY": {
      const has = state.selectedServiceCategories.includes(action.category);
      return {
        ...state,
        selectedServiceCategories: has
          ? state.selectedServiceCategories.filter((c) => c !== action.category)
          : [...state.selectedServiceCategories, action.category],
      };
    }
    case "TOGGLE_OPEN_FILTER":
      return { ...state, openFilterEnabled: !state.openFilterEnabled };
    case "SET_SHEET_FILTER":
      return {
        ...state,
        sheetFilters: { ...state.sheetFilters, [action.key]: action.value },
      };
    case "CLEAR_ALL_FILTERS":
      return {
        ...state,
        selectedServiceCategories: [],
        sheetFilters: INITIAL_SHEET_FILTERS,
        // openFilterEnabled stays — it's a Tier 1 chip, not a sheet
        // filter, and the user hasn't asked to clear it.
      };
    case "SET_SORT_BY":
      return { ...state, sortBy: action.sortBy };
    case "SET_SHEET_STATE":
      return {
        ...state,
        sheetState: action.sheetState,
        userOverrodeSheetState: action.userInitiated || state.userOverrodeSheetState,
      };
    case "RESET_SHEET_STATE_TO_MODE_DEFAULT":
      // Only fires when destination changes AND the user hasn't
      // manually overridden. Preserves user intent across mode flips.
      return state.userOverrodeSheetState
        ? state
        : { ...state, sheetState: action.modeDefault };
    case "OPEN_MODAL":
      return { ...state, modalOpen: action.modal };
    case "CLOSE_MODAL":
      return { ...state, modalOpen: null };
    default:
      return state;
  }
}

/**
 * Predicate: does a location pass the current sheet filters?
 * Wired against the location response shape from
 * /api/locations/search. Sheet filters today are mostly stub-
 * level (the seed data doesn't populate amenity flags yet, so
 * many filters degrade to "always true" until backend extends).
 * This implementation is structurally complete for the sheet UI
 * to render and toggle filters; backend wiring of the actual
 * amenity flags is a Round 5 cleanup.
 */
export function passesAllSheetFilters(loc: any, filters: SheetFilters): boolean {
  // Availability section
  if (filters.availability.availableNow) {
    // Currently the search endpoint doesn't expose real-time
    // availability per location; treat as pass until backend
    // exposes the field.
  }
  if (filters.availability.open24_7) {
    const windows: any[] = loc.operatingWindows ?? [];
    const is247 = windows.length === 7 && windows.every(
      (w) => w.openTime === "00:00" && (w.closeTime === "24:00" || w.closeTime === "23:59"),
    );
    if (!is247) return false;
  }
  // walkIns: backend doesn't expose; treat as pass.

  // Service details (subcategory): if any subcategory codes
  // selected, location must have a service whose subcategory
  // matches.
  if (filters.serviceDetails.length > 0) {
    const svcs: any[] = loc.services ?? [];
    const has = filters.serviceDetails.every((sub) =>
      svcs.some((s) => s.subcategory === sub),
    );
    if (!has) return false;
  }

  // Fuel & convenience / driver amenities / coach amenities /
  // repair flags / compliance: backend doesn't expose these
  // capability flags on the search response yet. Until it does,
  // these filters always pass — the UI exposes the toggles so
  // future backend work doesn't require a frontend re-design,
  // but selecting them today is a no-op. Round 5 wires the
  // real backend data; this function then narrows correctly.
  return true;
}

/**
 * Predicate: does a location offer at least one service in every
 * selected category?
 */
export function matchesAllSelectedServices(
  loc: any,
  selected: ServiceCategory[],
): boolean {
  if (selected.length === 0) return true;
  const cats: string[] = (loc.services ?? [])
    .map((s: any) => s?.category)
    .filter((c: any): c is string => !!c);
  return selected.every((c) => cats.includes(c));
}

/**
 * Live-count derivation for the service picker (per audit §9):
 * for each category, what would the displayLocations count be
 * if the user toggled this category, holding all OTHER filters
 * fixed?
 */
export function deriveCategoryCounts(
  baseList: any[],
  state: FilterUIState,
): Record<ServiceCategory, number> {
  const cats: ServiceCategory[] = [
    "EXTERIOR_WASH", "INTERIOR_CLEANING", "RESTROOM_DUMP", "RESTOCK_CONSUMABLES", "ADD_ON",
  ];
  const result = {} as Record<ServiceCategory, number>;
  for (const c of cats) {
    const has = state.selectedServiceCategories.includes(c);
    const hypothetical = has
      ? state.selectedServiceCategories.filter((x) => x !== c)
      : [...state.selectedServiceCategories, c];
    result[c] = baseList.filter(
      (loc) =>
        matchesAllSelectedServices(loc, hypothetical) &&
        passesAllSheetFilters(loc, state.sheetFilters),
    ).length;
  }
  return result;
}

/** Total active sheet-filter count, for the Filters chip badge
 *  and the "{N} active" subtitle in the all-filters sheet header. */
export function countActiveSheetFilters(filters: SheetFilters): number {
  let n = 0;
  if (filters.availability.availableNow) n++;
  if (filters.availability.walkIns) n++;
  if (filters.availability.open24_7) n++;
  n += filters.serviceDetails.length;
  if (filters.fuel.diesel) n++;
  if (filters.fuel.def) n++;
  if (filters.fuel.highFlow) n++;
  if (filters.driverAmenities.restroom) n++;
  if (filters.driverAmenities.lounge) n++;
  if (filters.driverAmenities.wifi) n++;
  if (filters.driverAmenities.coffee) n++;
  if (filters.driverAmenities.showers) n++;
  if (filters.coachAmenities.overnightParking) n++;
  if (filters.coachAmenities.shorePower) n++;
  if (filters.coachAmenities.potableWater) n++;
  n += filters.repairFlags.length;
  if (filters.compliance.certifiedDisposal) n++;
  if (filters.bayOverride) n++;
  return n;
}

/**
 * Adaptive Service Type chip label per EID §4.1. Returns the
 * truncated form when 3+ categories are selected.
 */
const CATEGORY_SHORT_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: "Wash",
  INTERIOR_CLEANING: "Interior",
  RESTROOM_DUMP: "Dump",
  RESTOCK_CONSUMABLES: "Restock",
  ADD_ON: "Add-ons",
};

export function getServiceTypeLabel(selected: ServiceCategory[]): string {
  if (selected.length === 0) return "Services";
  if (selected.length === 1) return CATEGORY_SHORT_NAMES[selected[0]];
  if (selected.length === 2) return selected.map((c) => CATEGORY_SHORT_NAMES[c]).join(", ");
  return `${CATEGORY_SHORT_NAMES[selected[0]]} + ${selected.length - 1} more`;
}

export const CATEGORY_DISPLAY_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: "Exterior wash",
  INTERIOR_CLEANING: "Interior cleaning",
  RESTROOM_DUMP: "Restroom dump",
  RESTOCK_CONSUMABLES: "Restock & consumables",
  ADD_ON: "Add-ons",
};

export const CATEGORY_HINT: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: "Drive-through, hand wash, two-step",
  INTERIOR_CLEANING: "Turn-clean, deep detail, vacuum",
  RESTROOM_DUMP: "Pump-only, pump-and-refresh",
  RESTOCK_CONSUMABLES: "Water, coffee, paper goods",
  ADD_ON: "Wax, ceramic, vinyl-wrap",
};

export const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; fg: string }> = {
  EXTERIOR_WASH: { bg: "#DBEAFE", fg: "#1E40AF" },
  INTERIOR_CLEANING: { bg: "#FEF3C7", fg: "#92400E" },
  RESTROOM_DUMP: { bg: "#D1FAE5", fg: "#065F46" },
  RESTOCK_CONSUMABLES: { bg: "#EDE9FE", fg: "#5B21B6" },
  ADD_ON: { bg: "#FCE7F3", fg: "#9D174D" },
};
