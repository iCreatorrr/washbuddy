/**
 * Bottom sheet for /find-a-wash per EID §3.3 + visual reference §9.
 *
 * Three states: peek (~96px), default (~50% viewport), expanded
 * (~85% viewport). Drag-to-snap via framer-motion with
 * velocity-aware behavior (fast flick can skip a state). Tap drag
 * handle cycles peek → default → expanded → peek.
 *
 * Header content:
 *   - Left: count line ("8 wash spots near you").
 *   - Right: segmented Map / List toggle.
 *   - When expanded: extra small line "Sorted by best fit" — tappable
 *     to open inline sort selector. (Caller renders the sort
 *     selector itself via the `sortFooter` slot when they want it.)
 *
 * The sheet's body is rendered into a *contained scroll container*
 * — caller passes `children` and the sheet wraps them in a flex-1
 * overflow-y:auto div. That contained scroll is what fixes Bug 1
 * (page-has-no-bottom): the page is fixed-position, the sheet has
 * its own scroll, no document-level scroll happens.
 *
 * State transitions — see EID §3.3 transition table for the full
 * matrix. The host owns the canonical `sheetState` (in the filter
 * reducer); this component is fully controlled by `state` +
 * `onStateChange`.
 *
 * Dragging is one-axis (y). dragConstraints clamp to a virtual
 * ladder of three positions; onDragEnd snaps to the nearest, with
 * |velocity| > 500 jumping two steps (peek↔expanded).
 */

import React, { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import type { SheetState } from "@/lib/filter-state";

export interface SearchBottomSheetProps {
  state: SheetState;
  onStateChange: (next: SheetState, userInitiated: boolean) => void;
  /** Mode-aware count line — caller decides "8 along route" vs
   *  "8 wash spots near you". Empty string acceptable for skeleton. */
  countLine: string;
  /** Currently active list view — Map shows the sheet at peek, List
   *  shows it expanded. */
  activeView: "map" | "list";
  /** Sort label for the expanded-state subtitle ("best fit", etc.).
   *  Tap opens caller's sort dropdown. */
  sortLabel: string;
  onTapSort: () => void;
  children: React.ReactNode;
}

export function SearchBottomSheet(props: SearchBottomSheetProps) {
  const [vh, setVh] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Heights for each state. The sheet is rendered with
  // `top: peek + drag-y` style — a drag of `0` shows peek; dragging
  // upward (negative y) reveals more sheet. We compute snap-points
  // as drag offsets from the peek anchor.
  const peekHeight = 96;
  const defaultHeight = Math.round(vh * 0.5);
  const expandedHeight = Math.round(vh * 0.85);

  // The rendered height of the sheet at a given state.
  const heightFor = (s: SheetState): number =>
    s === "peek" ? peekHeight : s === "default" ? defaultHeight : expandedHeight;

  // Drag offsets — `top: vh - heightFor(state) + dragY`. We
  // express the snap-points as `top` values so framer-motion's
  // dragConstraints clamp the visible top edge.
  const topFor = (s: SheetState): number => vh - heightFor(s);

  // Anchor the motion.div by its `top`. y motion value drives
  // top via useTransform — we don't directly mutate top because
  // framer-motion's drag wants a transform-driven prop. So we
  // animate y and use it as a delta from the current state's top.
  const y = useMotionValue(0);
  const sheetTop = useTransform(y, (yVal) => topFor(props.state) + yVal);

  // When the canonical state changes (caller dispatched), reset
  // y back to 0 so the sheet "anchors" at the new state's top.
  useEffect(() => {
    y.set(0);
  }, [props.state, vh, y]);

  // Drag bounds — y can go from "delta from peek to expanded"
  // (negative) to "delta from current state to peek" (positive).
  const dragTop = topFor("expanded") - topFor(props.state);
  const dragBottom = topFor("peek") - topFor(props.state);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const dragOffset = info.offset.y; // negative = dragged up
    const velocity = info.velocity.y;
    const currentTop = topFor(props.state) + dragOffset;
    // Velocity-aware: fast flick crosses two states.
    const fastFlick = Math.abs(velocity) > 500;
    let next: SheetState;
    if (fastFlick) {
      next = velocity < 0 ? "expanded" : "peek";
    } else {
      // Snap to nearest top edge among peek / default / expanded.
      const candidates: SheetState[] = ["peek", "default", "expanded"];
      let bestS = candidates[0];
      let bestD = Math.abs(currentTop - topFor(bestS));
      for (const c of candidates) {
        const d = Math.abs(currentTop - topFor(c));
        if (d < bestD) {
          bestD = d;
          bestS = c;
        }
      }
      next = bestS;
    }
    if (next !== props.state) {
      props.onStateChange(next, true);
    } else {
      // Snap back if we didn't change states.
      y.set(0);
    }
  };

  const cycleHandle = () => {
    const order: SheetState[] = ["peek", "default", "expanded"];
    const idx = order.indexOf(props.state);
    const next = order[(idx + 1) % order.length];
    props.onStateChange(next, true);
  };

  return (
    <motion.div
      role="region"
      aria-label="Search results"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: sheetTop,
        height: vh, // we let it bleed; only the top matters
        background: "#FFFFFF",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        boxShadow: "0 -8px 28px rgba(15,23,42,0.10)",
        zIndex: "var(--z-sheet)" as unknown as number,
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
      }}
    >
      {/* Drag handle row — drag-only when grabbing the handle
          itself. Body content scrolls without yanking the sheet. */}
      <motion.div
        drag="y"
        dragElastic={0.1}
        dragMomentum={false}
        dragConstraints={{ top: dragTop, bottom: dragBottom }}
        style={{ y }}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          onClick={cycleHandle}
          aria-label={`Bottom sheet at ${props.state}. Tap to cycle.`}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "10px 0 8px",
            background: "transparent",
            border: "none",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <span
            aria-hidden
            style={{ width: 38, height: 4, borderRadius: 2, background: "#CBD5E1" }}
          />
        </button>
        {/* Header row */}
        <div
          style={{
            padding: "0 16px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>
            {props.countLine}
          </span>
          <ViewToggle
            active={props.activeView}
            onMap={() => props.onStateChange("peek", true)}
            onList={() => props.onStateChange("expanded", true)}
          />
        </div>
        {/* Sort subtitle (expanded only) */}
        {props.state === "expanded" && (
          <div style={{ padding: "0 16px 8px" }}>
            <button
              type="button"
              onClick={props.onTapSort}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 11,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Sorted by {props.sortLabel} ▾
            </button>
          </div>
        )}
      </motion.div>
      {/* Contained scroll container — Bug 1 fix mechanism. */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 16px 32px",
          // When at peek, list is hidden visually (header takes the
          // ~96px). We still render content so React keeps the
          // scroll container alive across state transitions.
          opacity: props.state === "peek" ? 0 : 1,
          pointerEvents: props.state === "peek" ? "none" : "auto",
          transition: "opacity 0.15s ease-out",
        }}
      >
        {props.children}
      </div>
    </motion.div>
  );
}

function ViewToggle(props: {
  active: "map" | "list";
  onMap: () => void;
  onList: () => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Toggle between map and list view"
      style={{
        display: "inline-flex",
        background: "#F1F5F9",
        borderRadius: 999,
        padding: 2,
        height: 28,
        width: 84,
      }}
    >
      <ToggleBtn
        label="Map"
        active={props.active === "map"}
        onClick={props.onMap}
      />
      <ToggleBtn
        label="List"
        active={props.active === "list"}
        onClick={props.onList}
      />
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        height: 24,
        borderRadius: 999,
        background: active ? "#FFFFFF" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(15,23,42,0.06)" : "none",
        color: active ? "#0F172A" : "#475569",
        fontSize: 11,
        fontWeight: 500,
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
