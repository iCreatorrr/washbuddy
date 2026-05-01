/**
 * WashBuddy pin — driver-side map pin for /find-a-wash and any future
 * map surface. Pure render + classification module: no Leaflet
 * imports inside this file. Leaflet integration lives at the host
 * (find-a-wash.tsx) which calls `renderWashPinHtml` to build the
 * HTML string passed into `L.divIcon`.
 *
 * Spec: EID §3.5. Visual reference: 05-visual-reference.md §4. The
 * pin encodes two signals — tier (color + size), and price/detour
 * (label, when host supplies it). The inner glyph is the WashBuddy
 * water-drop logomark, uniform across every pin (brand identity, not
 * categorical encoding). Booking mode is intentionally NOT encoded
 * per Decision 08 (invisible primary surface).
 *
 * Phase B Checkpoint 1 ships:
 * - All four tiers (top / mid / low / incompatible) with the spec's
 *   sizes, fills, strokes, and shadows.
 * - Selected state with gold ring (3px outset around the pin shape).
 * - Label rendering paths for top + mid tiers (host gates by mode +
 *   zoom; CP1 hosts pass `undefined` until Round 3 / Round 4 wire the
 *   data).
 * - Future-compatible classifier signature (`detourMinutes?`,
 *   `inVisibleBounds?`) for CP3 and Round 4 to light up without
 *   touching this module.
 *
 * Phase B Checkpoint 1.6 spec correction: per-category glyphs were
 * removed (squeegee / drain / box / star) in favor of the uniform
 * water-drop logomark. UX research showed shape variants don't
 * survive at 32×40px pin sizes (color is the strongest preattentive
 * categorical encoding; shape is much weaker). Service-category
 * info lives in filter chips, card service pills, and detail pages
 * — not in pin glyphs. See EID §3.5 for full rationale.
 *
 * TODO(asset): the inline water-drop is a hand-drawn approximation.
 * EID §6.9 says production should use the actual WashBuddy logomark
 * SVG. Swap when product provides the asset.
 */

export type WashPinTier = "top" | "mid" | "low" | "incompatible";

/**
 * Inputs to `classifyPin`. `detourMinutes` and `inVisibleBounds` are
 * optional — when absent (CP1 today), the corresponding 'low'-tier
 * rules from EID §3.5 don't fire and the classifier falls through to
 * 'mid'. CP3 wires `inVisibleBounds` (off-screen pins demote); Round
 * 4 wires `detourMinutes` (long-detour route-mode pins demote).
 */
export interface ClassifyPinInput {
  rankIdx: number;
  totalRanked: number;
  mode: "nearby" | "route";
  fitsActiveVehicle: boolean;
  detourMinutes?: number;
  inVisibleBounds?: boolean;
}

export function classifyPin(input: ClassifyPinInput): WashPinTier {
  if (!input.fitsActiveVehicle) return "incompatible";
  // Top: top 3 by rank, capped at 25% of result set so a small list
  // doesn't have everything-but-one as TOP. Per EID §3.5 reference
  // implementation.
  const topCutoff = Math.min(3, Math.ceil(input.totalRanked * 0.25));
  if (input.rankIdx < topCutoff) return "top";
  if (input.mode === "route" && input.detourMinutes != null && input.detourMinutes > 20) return "low";
  if (input.inVisibleBounds === false) return "low";
  return "mid";
}

/** iconSize for `L.divIcon`. Width × height of the pin shape only;
 *  labels and the selected ring extend beyond via overflow:visible. */
export const WASH_PIN_SIZE: Record<WashPinTier, [number, number]> = {
  top: [32, 40],
  mid: [26, 33],
  low: [22, 28],
  incompatible: [22, 28],
};

/** iconAnchor — bottom-center of the pin tip lands on the lat/lng. */
export const WASH_PIN_ANCHOR: Record<WashPinTier, [number, number]> = {
  top: [16, 40],
  mid: [13, 33],
  low: [11, 28],
  incompatible: [11, 28],
};

/** popupAnchor relative to iconAnchor — keeps the popup arrow lined
 *  up with the pin tip while clearing the pin head's height. */
export const WASH_PIN_POPUP_ANCHOR: Record<WashPinTier, [number, number]> = {
  top: [0, -42],
  mid: [0, -35],
  low: [0, -30],
  incompatible: [0, -30],
};

/** Worst-case label dimensions for the collision rule. Real labels
 *  are text-driven; these are sized for the longest expected content
 *  (`+99 min` or `$1,500`). The host computes label rects via
 *  `map.latLngToContainerPoint` + these dims and applies the
 *  hide-on-overlap rule per EID §3.5. */
export const WASH_PIN_LABEL_DIMS: Record<"top" | "mid", { w: number; h: number }> = {
  top: { w: 70, h: 22 },
  mid: { w: 56, h: 18 },
};

interface RenderWashPinInput {
  tier: WashPinTier;
  /** Label text. When undefined, no label renders. Top-tier shows
   *  whenever supplied; mid-tier is host-gated by zoom ≥13. */
  label?: string;
  /** When false, label is suppressed even if `label` is supplied —
   *  used by the host's collision rule to hide overlapping labels
   *  without rebuilding the pin classification. */
  labelVisible?: boolean;
  isSelected?: boolean;
}

const TIER_FILL: Record<WashPinTier, string> = {
  top: "#2D6FE3",
  mid: "#6B9AED",
  low: "#94A3B8",
  incompatible: "#E2E8F0",
};

const TIER_STROKE: Record<WashPinTier, { color: string; width: number; dash?: string }> = {
  top: { color: "#FFFFFF", width: 2 },
  mid: { color: "#FFFFFF", width: 2 },
  low: { color: "#FFFFFF", width: 1.8 },
  incompatible: { color: "#94A3B8", width: 1.5, dash: "2 1.5" },
};

const TIER_SHADOW: Record<WashPinTier, string | null> = {
  top: "drop-shadow(0 3px 6px rgba(15,23,42,0.20))",
  mid: "drop-shadow(0 2px 5px rgba(15,23,42,0.18))",
  low: null,
  incompatible: null,
};

const GLYPH_FILL = "#FFFFFF";
const INCOMPAT_GLYPH_FILL = "#94A3B8";

// Pin shape — teardrop, 32×40 reference space. Other tiers use
// SVG viewBox to scale this down without losing the path.
const PIN_PATH = "M16 1 C7.16 1 1 7.16 1 16 C1 22 5 28 16 39 C27 28 31 22 31 16 C31 7.16 24.84 1 16 1 Z";

// Inner glyph — uniform WashBuddy water-drop logomark across every
// pin (Phase B CP1.6 spec correction; see EID §3.5). Drawn at
// (16, 14) inside the pin's circular head in the 32×40 viewBox.
// Filled teardrop, point up.
//
// TODO(asset, EID §6.9): hand-drawn approximation. Production should
// swap in the actual WashBuddy logomark SVG once product provides it.
const GLYPH_PATH = "M16 8 C13 12 11 15 11 17.5 A5 5 0 0 0 21 17.5 C21 15 19 12 16 8 Z";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the HTML string for `L.divIcon`. Inline styles only — the
 * div ends up as a Leaflet child and Tailwind classes won't reach
 * inside the marker pane reliably (PostCSS has run before Leaflet
 * mounts).
 */
export function renderWashPinHtml(input: RenderWashPinInput): string {
  const { tier, label, labelVisible = true, isSelected = false } = input;
  const [w, h] = WASH_PIN_SIZE[tier];
  const fill = TIER_FILL[tier];
  const stroke = TIER_STROKE[tier];
  const shadow = TIER_SHADOW[tier];
  const glyphFill = tier === "incompatible" ? INCOMPAT_GLYPH_FILL : GLYPH_FILL;
  const dashAttr = stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : "";

  // Selected ring: a second pin path drawn behind the actual pin,
  // filled-none with a thicker gold stroke. Half the stroke sits
  // outside the pin shape, producing a 3px visible ring per spec.
  const ringSvg = isSelected
    ? `<path d="${PIN_PATH}" fill="none" stroke="#FBBF24" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`
    : "";

  // Pin SVG — viewBox always 32×40; width/height scales the pin per
  // tier. `overflow: visible` lets the selected ring extend beyond
  // the shape's bounds without clipping.
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 32 40" style="overflow:visible;display:block;${shadow ? `filter:${shadow};` : ""}">
      ${ringSvg}
      <path d="${PIN_PATH}" fill="${fill}" stroke="${stroke.color}" stroke-width="${stroke.width}"${dashAttr}/>
      <path d="${GLYPH_PATH}" fill="${glyphFill}"/>
    </svg>`;

  // Label — positioned above the pin; bottom-center of the label sits
  // 4px above the pin's top edge. White-text-on-blue for top, blue-
  // text-on-white pill for mid. Pointer-events:none so taps fall
  // through to the marker.
  let labelHtml = "";
  if (label && labelVisible && (tier === "top" || tier === "mid")) {
    if (tier === "top") {
      labelHtml = `
        <div style="position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:4px;background:#2D6FE3;color:#FFFFFF;font:500 10px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:0.2px;padding:3px 8px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,0.20);pointer-events:none;">${escHtml(label)}</div>`;
    } else {
      labelHtml = `
        <div style="position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:3px;background:rgba(255,255,255,0.97);color:#1F52B0;font:500 9.5px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:0.1px;padding:2.5px 7px;border-radius:5px;white-space:nowrap;border:0.5px solid #E2E8F0;box-shadow:0 1px 3px rgba(15,23,42,0.12);pointer-events:none;">${escHtml(label)}</div>`;
    }
  }

  return `<div style="position:relative;width:${w}px;height:${h}px;line-height:0;">${labelHtml}${svg}</div>`;
}

/**
 * Pin label collision rule per EID §3.5. Pure function — Leaflet-free
 * so this module stays portable. The host computes container-pixel
 * coordinates via `map.latLngToContainerPoint()` and passes them in;
 * this returns the set of pin IDs whose labels should be hidden so
 * higher-priority labels win the overlap.
 *
 * Priority order: tier desc (top > mid > low > incompatible), then
 * distance from map center asc (closer-to-center wins ties).
 *
 * Phase B Checkpoint 1 ships this function but doesn't wire it: CP1
 * pins don't render labels (Round 3 lights up the service-selector
 * → price-label path; Round 4 lights up the route-mode → detour-label
 * path). When labels first render, wire this into a `moveend` /
 * `zoomend` effect that calls `marker.setIcon()` with
 * `labelVisible: !hidden.has(id)`.
 */
export interface CollisionItem {
  id: string;
  tier: WashPinTier;
  /** Container-pixel x of the pin tip. */
  pinX: number;
  /** Container-pixel y of the pin tip. */
  pinY: number;
  /** Container-pixel distance from map center to the pin tip. */
  distFromCenter: number;
}

export function computeHiddenLabels({
  items,
  zoom,
}: {
  items: ReadonlyArray<CollisionItem>;
  zoom: number;
}): Set<string> {
  const hidden = new Set<string>();
  // Only top-tier (any zoom) and mid-tier (zoom ≥13) render labels.
  // Low and incompatible never label.
  const labelable = items.filter(
    (it) => it.tier === "top" || (it.tier === "mid" && zoom >= 13),
  );
  if (labelable.length < 2) return hidden;

  const tierWeight: Record<WashPinTier, number> = {
    top: 3,
    mid: 2,
    low: 1,
    incompatible: 0,
  };

  // Pre-compute label rect per item. Label sits centered above the
  // pin tip with the rect's bottom roughly 4px above the tip.
  const ranked = labelable
    .map((it) => {
      const dims = WASH_PIN_LABEL_DIMS[it.tier as "top" | "mid"];
      return {
        id: it.id,
        tier: it.tier,
        distFromCenter: it.distFromCenter,
        // Label rect in container-pixel space.
        x1: it.pinX - dims.w / 2,
        x2: it.pinX + dims.w / 2,
        y1: it.pinY - 4 - dims.h - 40, // ~4px gap + dims.h + pin height clearance
        y2: it.pinY - 4,
      };
    })
    .sort((a, b) => {
      const tw = tierWeight[b.tier] - tierWeight[a.tier];
      if (tw !== 0) return tw;
      return a.distFromCenter - b.distFromCenter;
    });

  const kept: typeof ranked = [];
  for (const r of ranked) {
    const overlaps = kept.some(
      (k) => r.x1 < k.x2 && r.x2 > k.x1 && r.y1 < k.y2 && r.y2 > k.y1,
    );
    if (overlaps) {
      hidden.add(r.id);
    } else {
      kept.push(r);
    }
  }
  return hidden;
}
