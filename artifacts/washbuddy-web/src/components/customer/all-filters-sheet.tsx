/**
 * All-filters modal sheet per EID §4.3 + visual reference §11.
 *
 * Modal bottom sheet, max-height 85% viewport. Nine sections in
 * fixed order — Sort by, Availability, Service details, Fuel,
 * Driver amenities, Coach amenities, Repair & roadside (LISTING
 * ONLY), Compliance, Bay accommodation. Sticky footer with Clear
 * all (1/3) + Apply ({N} matches) (2/3).
 *
 * Local state pattern (same as service-picker-sheet): user toggles
 * apply locally; Apply commits to the reducer; closing without
 * Apply discards local changes. Lets the user explore filter
 * combinations without thrashing the result list.
 *
 * Counts are stub-level today (the seed data doesn't populate the
 * real amenity flags yet, so backend wire-up is a Round 5 task).
 * The UI is structurally complete: sections render, toggles fire,
 * pills appear, Apply count updates locally. Once backend exposes
 * the flags, only the predicate in lib/filter-state.ts narrows.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
import {
  type SheetFilters,
  type SortBy,
  INITIAL_SHEET_FILTERS,
  countActiveSheetFilters,
} from "@/lib/filter-state";

// Section IDs that drive the open/closed state map.
type SectionId =
  | "availability"
  | "serviceDetails"
  | "fuel"
  | "driverAmenities"
  | "coachAmenities"
  | "repairFlags"
  | "compliance"
  | "bayOverride";

export interface AllFiltersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilters: SheetFilters;
  initialSort: SortBy;
  /** Auto-open Service details if Service Type chip has selections —
   *  caller passes hasSelectedServices. */
  hasSelectedServices: boolean;
  /** Mode-aware sort options + labels. Caller decides what's
   *  available (e.g., "shortest detour" only in route mode). */
  sortOptions: ReadonlyArray<{ value: SortBy; label: string }>;
  /** Live "{N} matches" count for the Apply button. */
  computeApplyCount: (filters: SheetFilters, sort: SortBy) => number;
  onApply: (filters: SheetFilters, sort: SortBy) => void;
  onClearAll: () => void;
}

export function AllFiltersSheet(props: AllFiltersSheetProps) {
  const [local, setLocal] = useState<SheetFilters>(props.initialFilters);
  const [localSort, setLocalSort] = useState<SortBy>(props.initialSort);
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(() => ({
    availability: true,
    serviceDetails: props.hasSelectedServices,
    fuel: false,
    driverAmenities: false,
    coachAmenities: false,
    repairFlags: false,
    compliance: false,
    bayOverride: false,
  }));

  useEffect(() => {
    if (props.isOpen) {
      setLocal(props.initialFilters);
      setLocalSort(props.initialSort);
      setOpenSections((s) => ({ ...s, serviceDetails: props.hasSelectedServices }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  const toggleSection = (id: SectionId) =>
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));

  const setAvailability = (key: keyof SheetFilters["availability"], val: boolean) =>
    setLocal((s) => ({ ...s, availability: { ...s.availability, [key]: val } }));
  const setFuel = (key: keyof SheetFilters["fuel"], val: boolean) =>
    setLocal((s) => ({ ...s, fuel: { ...s.fuel, [key]: val } }));
  const setDriver = (key: keyof SheetFilters["driverAmenities"], val: boolean) =>
    setLocal((s) => ({ ...s, driverAmenities: { ...s.driverAmenities, [key]: val } }));
  const setCoach = (key: keyof SheetFilters["coachAmenities"], val: boolean) =>
    setLocal((s) => ({ ...s, coachAmenities: { ...s.coachAmenities, [key]: val } }));
  const setCompliance = (key: keyof SheetFilters["compliance"], val: boolean) =>
    setLocal((s) => ({ ...s, compliance: { ...s.compliance, [key]: val } }));

  const activeCount = countActiveSheetFilters(local);
  const applyCount = props.computeApplyCount(local, localSort);

  return (
    <AnimatePresence>
      {props.isOpen && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={props.onClose}
            aria-hidden
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              zIndex: "var(--z-modal-overlay)" as unknown as number,
            }}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="All filters"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#FFFFFF",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              boxShadow: "0 -8px 28px rgba(15,23,42,0.10)",
              zIndex: "var(--z-modal)" as unknown as number,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
              <span
                aria-hidden
                style={{ width: 36, height: 4, borderRadius: 2, background: "#E2E8F0" }}
              />
            </div>
            {/* Header */}
            <div
              style={{
                padding: "8px 16px 12px",
                borderBottom: "1px solid #F1F5F9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 500, color: "#0F172A", margin: 0 }}>
                  All filters
                </h2>
                <p style={{ fontSize: 11, color: "#475569", margin: "2px 0 0" }}>
                  {activeCount} active
                </p>
              </div>
              <button
                type="button"
                onClick={() => alert("Saved searches coming soon.")}
                aria-label="Save this filter set"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  color: "#475569",
                  border: "1px solid #CBD5E1",
                  borderRadius: 999,
                  padding: "4px 10px",
                  height: 22,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <Save size={11} /> Save
              </button>
            </div>
            {/* Sections (scrollable) */}
            <div style={{ overflowY: "auto", padding: "12px 16px 12px", flex: 1 }}>
              {/* 1. Sort by — always visible, no collapse */}
              <SectionHeader title="Sort by" />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
                {props.sortOptions.map((opt) => (
                  <RadioRow
                    key={opt.value}
                    label={opt.label}
                    selected={localSort === opt.value}
                    onSelect={() => setLocalSort(opt.value)}
                  />
                ))}
              </div>

              {/* 2. Availability */}
              <CollapseSection
                title="Availability"
                open={openSections.availability}
                onToggle={() => toggleSection("availability")}
              >
                <CheckRow
                  label="Available now"
                  checked={local.availability.availableNow}
                  onChange={(v) => setAvailability("availableNow", v)}
                />
                <CheckRow
                  label="Walk-ins accepted"
                  checked={local.availability.walkIns}
                  onChange={(v) => setAvailability("walkIns", v)}
                />
                <CheckRow
                  label="Open 24/7"
                  checked={local.availability.open24_7}
                  onChange={(v) => setAvailability("open24_7", v)}
                />
              </CollapseSection>

              {/* 3. Service details */}
              <CollapseSection
                title="Service details"
                open={openSections.serviceDetails}
                onToggle={() => toggleSection("serviceDetails")}
              >
                {SERVICE_DETAIL_OPTIONS.map((o) => (
                  <CheckRow
                    key={o}
                    label={o}
                    checked={local.serviceDetails.includes(o)}
                    onChange={(v) =>
                      setLocal((s) => ({
                        ...s,
                        serviceDetails: v
                          ? [...s.serviceDetails, o]
                          : s.serviceDetails.filter((x) => x !== o),
                      }))
                    }
                  />
                ))}
              </CollapseSection>

              {/* 4. Fuel & convenience */}
              <CollapseSection
                title="Fuel & convenience"
                open={openSections.fuel}
                onToggle={() => toggleSection("fuel")}
              >
                <CheckRow
                  label="Diesel"
                  checked={local.fuel.diesel}
                  onChange={(v) => setFuel("diesel", v)}
                />
                <CheckRow
                  label="DEF"
                  checked={local.fuel.def}
                  onChange={(v) => setFuel("def", v)}
                />
                <CheckRow
                  label="High-flow truck pumps"
                  checked={local.fuel.highFlow}
                  onChange={(v) => setFuel("highFlow", v)}
                />
              </CollapseSection>

              {/* 5. Driver amenities */}
              <CollapseSection
                title="Driver amenities"
                open={openSections.driverAmenities}
                onToggle={() => toggleSection("driverAmenities")}
              >
                <CheckRow
                  label="Restroom"
                  checked={local.driverAmenities.restroom}
                  onChange={(v) => setDriver("restroom", v)}
                />
                <CheckRow
                  label="Lounge"
                  checked={local.driverAmenities.lounge}
                  onChange={(v) => setDriver("lounge", v)}
                />
                <CheckRow
                  label="Wi-Fi"
                  checked={local.driverAmenities.wifi}
                  onChange={(v) => setDriver("wifi", v)}
                />
                <CheckRow
                  label="Coffee"
                  checked={local.driverAmenities.coffee}
                  onChange={(v) => setDriver("coffee", v)}
                />
                <CheckRow
                  label="Showers"
                  checked={local.driverAmenities.showers}
                  onChange={(v) => setDriver("showers", v)}
                />
              </CollapseSection>

              {/* 6. Coach amenities */}
              <CollapseSection
                title="Coach amenities"
                open={openSections.coachAmenities}
                onToggle={() => toggleSection("coachAmenities")}
              >
                <CheckRow
                  label="Overnight parking"
                  checked={local.coachAmenities.overnightParking}
                  onChange={(v) => setCoach("overnightParking", v)}
                />
                <CheckRow
                  label="Shore power 50A"
                  checked={local.coachAmenities.shorePower}
                  onChange={(v) => setCoach("shorePower", v)}
                />
                <CheckRow
                  label="Potable water fill"
                  checked={local.coachAmenities.potableWater}
                  onChange={(v) => setCoach("potableWater", v)}
                />
              </CollapseSection>

              {/* 7. Repair & roadside (LISTING ONLY) */}
              <CollapseSection
                title="Repair & roadside"
                open={openSections.repairFlags}
                onToggle={() => toggleSection("repairFlags")}
                tag="LISTING ONLY"
              >
                {REPAIR_OPTIONS.map((o) => (
                  <CheckRow
                    key={o}
                    label={o}
                    checked={local.repairFlags.includes(o)}
                    onChange={(v) =>
                      setLocal((s) => ({
                        ...s,
                        repairFlags: v
                          ? [...s.repairFlags, o]
                          : s.repairFlags.filter((x) => x !== o),
                      }))
                    }
                  />
                ))}
              </CollapseSection>

              {/* 8. Compliance */}
              <CollapseSection
                title="Compliance"
                open={openSections.compliance}
                onToggle={() => toggleSection("compliance")}
              >
                <CheckRow
                  label="Certified black-water disposal"
                  checked={local.compliance.certifiedDisposal}
                  onChange={(v) => setCompliance("certifiedDisposal", v)}
                />
              </CollapseSection>

              {/* 9. Bay accommodation */}
              <CollapseSection
                title="Bay accommodation"
                open={openSections.bayOverride}
                onToggle={() => toggleSection("bayOverride")}
              >
                <CheckRow
                  label="Override silent vehicle filter (show incompatible bays)"
                  checked={local.bayOverride}
                  onChange={(v) => setLocal((s) => ({ ...s, bayOverride: v }))}
                />
              </CollapseSection>
            </div>
            {/* Sticky footer */}
            <div
              style={{
                padding: "12px 16px 16px",
                borderTop: "1px solid #F1F5F9",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setLocal(INITIAL_SHEET_FILTERS);
                  props.onClearAll();
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  background: "transparent",
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#0F172A",
                  cursor: "pointer",
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => props.onApply(local, localSort)}
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: 12,
                  background: "#2D6FE3",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#FFFFFF",
                  cursor: "pointer",
                }}
              >
                Apply ({applyCount} match{applyCount === 1 ? "" : "es"})
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionHeader({ title, tag }: { title: string; tag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "#475569",
        }}
      >
        {title}
      </span>
      {tag && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            color: "#94A3B8",
            background: "#F1F5F9",
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

function CollapseSection(props: {
  title: string;
  tag?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <SectionHeader title={props.title} tag={props.tag} />
        {props.open ? <ChevronUp size={14} color="#475569" /> : <ChevronDown size={14} color="#475569" />}
      </button>
      {props.open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {props.children}
        </div>
      )}
    </div>
  );
}

function CheckRow(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: props.checked ? "#2D6FE3" : "#FFFFFF",
          border: props.checked ? "1px solid #2D6FE3" : "1px solid #CBD5E1",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {props.checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span style={{ fontSize: 13, fontWeight: 400, color: "#0F172A" }}>{props.label}</span>
    </label>
  );
}

function RadioRow(props: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      role="radio"
      aria-checked={props.selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#FFFFFF",
          border: props.selected ? "5px solid #2D6FE3" : "1px solid #CBD5E1",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 400, color: "#0F172A" }}>{props.label}</span>
    </button>
  );
}

const SERVICE_DETAIL_OPTIONS = [
  "Drive-through wash",
  "Hand wash",
  "Two-step wash",
  "Vacuum",
  "Deep detail",
];

const REPAIR_OPTIONS = [
  "Mobile repair",
  "Tire",
  "A/C",
  "Electrical",
  "Towing",
  "Replacement bus",
  "Engine specialty",
];
