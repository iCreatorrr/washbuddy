/**
 * Active filter pills row per EID §4.4 + visual reference §7.
 *
 * Renders below the Tier 1 chip row when the user has applied any
 * sheet-level filters. Each pill shows the filter label + an × to
 * remove that single filter. Critical guardrail against silent
 * over-filtering — the user can see and reverse what they've applied
 * without re-opening the sheet.
 *
 * Tier 1 chip filters (Service Type, Open, Filters) are NOT mirrored
 * here — they're already visible in the chip row. Sort changes are
 * not pills either (presentation order is shown in the sheet header).
 *
 * The caller derives the pill set from `sheetFilters` via
 * `derivePillsFromSheetFilters`. Pills wrap to multiple lines at
 * narrow viewports.
 */

import { X } from "lucide-react";
import type { SheetFilters } from "@/lib/filter-state";

export interface ActiveFilterPill {
  /** Stable id used as React key + for the remove handler. */
  id: string;
  label: string;
  /** Called when the user taps × — caller dispatches the right
   *  reducer action to clear this filter. */
  onRemove: () => void;
}

export interface ActiveFilterPillsProps {
  pills: ActiveFilterPill[];
}

export function ActiveFilterPills({ pills }: ActiveFilterPillsProps) {
  if (pills.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="Active filters"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      {pills.map((p) => (
        <span
          key={p.id}
          role="listitem"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "#F1F5F9",
            color: "#475569",
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 8px",
            borderRadius: 11,
          }}
        >
          <span>{p.label}</span>
          <button
            type="button"
            onClick={p.onRemove}
            aria-label={`Remove filter ${p.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#475569",
              lineHeight: 0,
            }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * Walk a SheetFilters value and produce a pill per active filter.
 * Caller supplies `dispatch` to wire each pill's × button to the
 * reducer. Pure derivation — no React hooks here so the helper can
 * be reused by the all-filters-sheet header subtitle if needed.
 */
export function derivePillsFromSheetFilters(
  filters: SheetFilters,
  dispatch: {
    clearAvailability: (key: keyof SheetFilters["availability"]) => void;
    clearServiceDetail: (code: string) => void;
    clearFuel: (key: keyof SheetFilters["fuel"]) => void;
    clearDriverAmenity: (key: keyof SheetFilters["driverAmenities"]) => void;
    clearCoachAmenity: (key: keyof SheetFilters["coachAmenities"]) => void;
    clearRepairFlag: (code: string) => void;
    clearCompliance: (key: keyof SheetFilters["compliance"]) => void;
    clearBayOverride: () => void;
  },
): ActiveFilterPill[] {
  const pills: ActiveFilterPill[] = [];

  if (filters.availability.availableNow) {
    pills.push({
      id: "avail-now",
      label: "Available now",
      onRemove: () => dispatch.clearAvailability("availableNow"),
    });
  }
  if (filters.availability.walkIns) {
    pills.push({
      id: "avail-walkins",
      label: "Walk-ins",
      onRemove: () => dispatch.clearAvailability("walkIns"),
    });
  }
  if (filters.availability.open24_7) {
    pills.push({
      id: "avail-247",
      label: "Open 24/7",
      onRemove: () => dispatch.clearAvailability("open24_7"),
    });
  }
  for (const code of filters.serviceDetails) {
    pills.push({
      id: `svc-${code}`,
      label: code,
      onRemove: () => dispatch.clearServiceDetail(code),
    });
  }
  if (filters.fuel.diesel) {
    pills.push({ id: "fuel-diesel", label: "Diesel", onRemove: () => dispatch.clearFuel("diesel") });
  }
  if (filters.fuel.def) {
    pills.push({ id: "fuel-def", label: "DEF", onRemove: () => dispatch.clearFuel("def") });
  }
  if (filters.fuel.highFlow) {
    pills.push({ id: "fuel-highflow", label: "High-flow pumps", onRemove: () => dispatch.clearFuel("highFlow") });
  }
  if (filters.driverAmenities.restroom) {
    pills.push({ id: "amen-restroom", label: "Restroom", onRemove: () => dispatch.clearDriverAmenity("restroom") });
  }
  if (filters.driverAmenities.lounge) {
    pills.push({ id: "amen-lounge", label: "Lounge", onRemove: () => dispatch.clearDriverAmenity("lounge") });
  }
  if (filters.driverAmenities.wifi) {
    pills.push({ id: "amen-wifi", label: "Wi-Fi", onRemove: () => dispatch.clearDriverAmenity("wifi") });
  }
  if (filters.driverAmenities.coffee) {
    pills.push({ id: "amen-coffee", label: "Coffee", onRemove: () => dispatch.clearDriverAmenity("coffee") });
  }
  if (filters.driverAmenities.showers) {
    pills.push({ id: "amen-showers", label: "Showers", onRemove: () => dispatch.clearDriverAmenity("showers") });
  }
  if (filters.coachAmenities.overnightParking) {
    pills.push({
      id: "coach-overnight",
      label: "Overnight parking",
      onRemove: () => dispatch.clearCoachAmenity("overnightParking"),
    });
  }
  if (filters.coachAmenities.shorePower) {
    pills.push({
      id: "coach-shorepower",
      label: "Shore power",
      onRemove: () => dispatch.clearCoachAmenity("shorePower"),
    });
  }
  if (filters.coachAmenities.potableWater) {
    pills.push({
      id: "coach-water",
      label: "Potable water",
      onRemove: () => dispatch.clearCoachAmenity("potableWater"),
    });
  }
  for (const code of filters.repairFlags) {
    pills.push({
      id: `repair-${code}`,
      label: code,
      onRemove: () => dispatch.clearRepairFlag(code),
    });
  }
  if (filters.compliance.certifiedDisposal) {
    pills.push({
      id: "comp-disposal",
      label: "Certified disposal",
      onRemove: () => dispatch.clearCompliance("certifiedDisposal"),
    });
  }
  if (filters.bayOverride) {
    pills.push({
      id: "bay-override",
      label: "Bay override",
      onRemove: () => dispatch.clearBayOverride(),
    });
  }
  return pills;
}
