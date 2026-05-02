/**
 * Tier 1 filter chip row per EID §4.1 + visual reference §6.
 *
 * Three chips, single row, no horizontal scroll at viewports ≥360px.
 * Layout:
 *   [Service Type ▾]  [● Open at arrival]            margin-l-auto:[≣ Filters ●]
 *
 * - Service Type chip: adaptive label based on selectedServices count
 *   (per `getServiceTypeLabel` in lib/filter-state.ts). Solid blue fill
 *   when ≥1 selected; outlined white when 0.
 * - Open chip: pure toggle (no sheet). Default ON. Mode-aware label
 *   ("Open at arrival" vs "Open now") supplied by caller.
 * - Filters chip: white outline always; numeric badge when active
 *   sheet-filter count > 0.
 */

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  type ServiceCategory,
  getServiceTypeLabel,
} from "@/lib/filter-state";

export interface FilterChipsProps {
  selectedServiceCategories: ServiceCategory[];
  openFilterEnabled: boolean;
  openFilterLabel: string; // "Open at arrival" or "Open now"
  activeFilterCount: number; // sheet-filter count, drives Filters badge
  onOpenServicePicker: () => void;
  onToggleOpenFilter: () => void;
  onOpenAllFilters: () => void;
}

export function FilterChips(props: FilterChipsProps) {
  const serviceLabel = getServiceTypeLabel(props.selectedServiceCategories);
  const serviceActive = props.selectedServiceCategories.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Filter chips"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
      }}
    >
      <Chip
        active={serviceActive}
        onClick={props.onOpenServicePicker}
        ariaLabel={`Service type: ${serviceLabel}`}
      >
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{serviceLabel}</span>
        <ChevronDown size={14} style={{ marginLeft: 4 }} />
      </Chip>

      <OpenChip
        enabled={props.openFilterEnabled}
        label={props.openFilterLabel}
        onClick={props.onToggleOpenFilter}
      />

      <button
        type="button"
        onClick={props.onOpenAllFilters}
        aria-label={`Open all filters${props.activeFilterCount > 0 ? `, ${props.activeFilterCount} active` : ""}`}
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#FFFFFF",
          color: "#0F172A",
          border: "1px solid #CBD5E1",
          borderRadius: 999,
          padding: "8px 12px",
          height: 36,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
          position: "relative",
        }}
      >
        <SlidersHorizontal size={14} />
        <span>Filters</span>
        {props.activeFilterCount > 0 && (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 14,
              height: 14,
              padding: "0 4px",
              borderRadius: 999,
              background: "#2D6FE3",
              color: "#FFFFFF",
              fontSize: 9,
              fontWeight: 500,
              marginLeft: 2,
            }}
          >
            {props.activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}

function Chip(props: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.ariaLabel}
      aria-pressed={props.active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: props.active ? "#2D6FE3" : "#FFFFFF",
        color: props.active ? "#FFFFFF" : "#0F172A",
        border: props.active ? "1px solid #2D6FE3" : "1px solid #CBD5E1",
        borderRadius: 999,
        padding: "8px 12px",
        height: 36,
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

function OpenChip(props: { enabled: boolean; label: string; onClick: () => void }) {
  const dotColor = props.enabled ? "#15803D" : "#94A3B8";
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={`${props.label} filter ${props.enabled ? "on" : "off"}`}
      aria-pressed={props.enabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: props.enabled ? "#EBF2FD" : "#FFFFFF",
        color: props.enabled ? "#1F52B0" : "#475569",
        border: props.enabled ? "1px solid #93BBF6" : "1px solid #CBD5E1",
        borderRadius: 999,
        padding: "8px 12px",
        height: 36,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dotColor,
        }}
      />
      <span>{props.label}</span>
    </button>
  );
}
