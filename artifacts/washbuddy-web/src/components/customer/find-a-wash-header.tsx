/**
 * Search header for /find-a-wash per EID §3.1 + visual reference §5.
 *
 * Two presentation modes parameterized by sheet state:
 *  - **Collapsed** (sheet at peek): single floating pill that
 *    consolidates vehicle + destination summary, plus three Tier 1
 *    chips on the row below. ~96px total header height.
 *  - **Expanded** (sheet at default or expanded): full search card
 *    with vehicle pill, three rows (origin / destination / time-of-
 *    interest), then the Tier 1 chip row.
 *
 * Animation: framer-motion `layoutId` on the unified pill ↔ search
 * card hull lets framer interpolate position/size between the two
 * modes as the sheet drags. Single coordinated animation, not two.
 *
 * Slot pattern: this component owns layout + the unified pill
 * affordance; callers pass children as named slots (origin input,
 * destination input, time row, chip row, etc.). Keeps the
 * dependency one-way — header doesn't import filter-chips,
 * find-a-wash composes them together.
 *
 * Floating top-left button (logomark or back chevron) and the
 * top-right cluster (notification bell + hamburger) are rendered
 * by find-a-wash.tsx itself, not here — they live above the header
 * in the z-stack and don't transition between modes.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Edit3 } from "lucide-react";

const SHARED_LAYOUT_ID = "find-a-wash-header-pill";

export interface FindAWashHeaderProps {
  /** Sheet state from the filter reducer. Drives the mode switch. */
  mode: "collapsed" | "expanded";
  /** Mode label content for the unified pill in collapsed mode.
   *  Two-line layout: line1 above line2. Caller pre-formats. */
  pillLine1: string;
  pillLine2: string;
  /** Tap on the unified pill in collapsed mode — caller switches
   *  the sheet to default state, which expands the header. */
  onTapPill: () => void;
  /** Tap the small Edit affordance in expanded mode — caller
   *  re-runs the routing flow / opens an inline editor. */
  onTapEdit?: () => void;
  /** Slots — caller renders the actual form rows here. */
  expandedFormSlot?: React.ReactNode;
  chipRowSlot: React.ReactNode;
  activePillsSlot?: React.ReactNode;
}

export function FindAWashHeader(props: FindAWashHeaderProps) {
  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
        zIndex: "var(--z-header)" as unknown as number,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {props.mode === "collapsed" ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              padding: "12px 16px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <motion.button
              type="button"
              layoutId={SHARED_LAYOUT_ID}
              onClick={props.onTapPill}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.96)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid #E2E8F0",
                borderRadius: 999,
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                boxShadow: "0 2px 6px rgba(15,23,42,0.10)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#0F172A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {props.pillLine1}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#475569",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {props.pillLine2}
                </div>
              </div>
              <ChevronDown size={16} color="#475569" />
            </motion.button>
            <div>{props.chipRowSlot}</div>
            {props.activePillsSlot && <div>{props.activePillsSlot}</div>}
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              padding: "12px 16px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <motion.div
              layoutId={SHARED_LAYOUT_ID}
              style={{
                background: "rgba(255,255,255,0.98)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                padding: "10px 12px",
                boxShadow: "0 2px 6px rgba(15,23,42,0.10)",
                position: "relative",
              }}
            >
              {props.onTapEdit && (
                <button
                  type="button"
                  onClick={props.onTapEdit}
                  aria-label="Edit search"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "transparent",
                    border: "none",
                    padding: 4,
                    cursor: "pointer",
                    color: "#475569",
                  }}
                >
                  <Edit3 size={14} />
                </button>
              )}
              {props.expandedFormSlot}
            </motion.div>
            <div>{props.chipRowSlot}</div>
            {props.activePillsSlot && <div>{props.activePillsSlot}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
