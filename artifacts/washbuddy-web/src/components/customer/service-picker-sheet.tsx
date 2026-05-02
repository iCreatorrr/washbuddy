/**
 * Service picker modal sheet per EID §4.2 + visual reference §10.
 *
 * Modal bottom sheet (not the search bottom sheet — distinct layer
 * via --z-modal-overlay / --z-modal). Five rows, multi-select, live
 * match-counts that update as user toggles. Apply button commits
 * the local selection back to the reducer; closing without Apply
 * discards local changes.
 *
 * Why local-then-apply (vs reduce-on-toggle): the visual spec calls
 * for a live count badge in the Apply button — "Apply (24 matches)"
 * — that updates as the user toggles, distinct from the count pill
 * to the right of each category row (which already factors in
 * other filters). Local state lets the user explore "what would 24
 * become if I added Restroom dump?" without committing each step.
 *
 * Counts come from the caller's `categoryCounts` map (derived via
 * `deriveCategoryCounts` in lib/filter-state.ts). The Apply button's
 * "{N} matches" comes from the caller's running count of locations
 * passing the hypothetical new selection set.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Droplets, Sparkles, Briefcase, ShoppingBag, Plus } from "lucide-react";
import {
  type ServiceCategory,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_HINT,
  CATEGORY_COLORS,
} from "@/lib/filter-state";

const CATEGORY_ORDER: ServiceCategory[] = [
  "EXTERIOR_WASH",
  "INTERIOR_CLEANING",
  "RESTROOM_DUMP",
  "RESTOCK_CONSUMABLES",
  "ADD_ON",
];

const CATEGORY_ICON: Record<ServiceCategory, React.ComponentType<{ size?: number; color?: string }>> = {
  EXTERIOR_WASH: Droplets,
  INTERIOR_CLEANING: Sparkles,
  RESTROOM_DUMP: Briefcase,
  RESTOCK_CONSUMABLES: ShoppingBag,
  ADD_ON: Plus,
};

export interface ServicePickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelection: ServiceCategory[];
  /** Live count per category: "if I add/remove this category, holding
   *  all OTHER filters fixed, how many matches?" */
  categoryCounts: Record<ServiceCategory, number>;
  /** Called with the running count given current local selection. */
  computeApplyCount: (local: ServiceCategory[]) => number;
  modeRouteSuffix?: string; // " along route" appended in route mode
  onApply: (next: ServiceCategory[]) => void;
}

export function ServicePickerSheet(props: ServicePickerSheetProps) {
  const [local, setLocal] = useState<ServiceCategory[]>(props.initialSelection);

  useEffect(() => {
    if (props.isOpen) setLocal(props.initialSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  const toggle = (c: ServiceCategory) => {
    setLocal((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const applyCount = props.computeApplyCount(local);

  return (
    <AnimatePresence>
      {props.isOpen && (
        <>
          {/* Overlay */}
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
          {/* Sheet */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Choose services"
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
            <div style={{ padding: "8px 16px 12px", borderBottom: "1px solid #F1F5F9" }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "#0F172A", margin: 0 }}>
                Services
              </h2>
              <p style={{ fontSize: 11.5, color: "#475569", margin: "2px 0 0" }}>
                Pick what you need. Multiple selections OK.
              </p>
            </div>
            {/* Rows — scrollable */}
            <div style={{ overflowY: "auto", padding: "8px 8px 16px", flex: 1 }}>
              {CATEGORY_ORDER.map((c) => {
                const selected = local.includes(c);
                const Icon = CATEGORY_ICON[c];
                const colors = CATEGORY_COLORS[c];
                const count = props.categoryCounts[c] ?? 0;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    aria-pressed={selected}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "10px 8px",
                      borderRadius: 10,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        background: colors.bg,
                        color: colors.fg,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} color={colors.fg} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>
                        {CATEGORY_DISPLAY_NAMES[c]}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                        {CATEGORY_HINT[c]}
                      </div>
                    </div>
                    {/* Count pill */}
                    <span
                      style={{
                        background: "#F1F5F9",
                        color: "#94A3B8",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 10,
                        marginRight: 12,
                        minWidth: 22,
                        textAlign: "center",
                      }}
                    >
                      {count}
                    </span>
                    {/* Checkmark */}
                    <span
                      aria-hidden
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: selected ? "#2D6FE3" : "#FFFFFF",
                        border: selected ? "1px solid #2D6FE3" : "1px solid #CBD5E1",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Apply */}
            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #F1F5F9" }}>
              <button
                type="button"
                onClick={() => props.onApply(local)}
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: 12,
                  background: "#2D6FE3",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Apply ({applyCount} match{applyCount === 1 ? "" : "es"}
                {props.modeRouteSuffix ?? ""})
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
