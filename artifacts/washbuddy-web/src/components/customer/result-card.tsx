/**
 * Result card for /find-a-wash. Per EID §3.4 + visual reference §8.
 *
 * Single component, identical behavior across nearby and route modes —
 * only the metadata line content varies. Used in the bottom sheet on
 * mobile and (Round 5) the right rail on desktop.
 *
 * Card structure (left → right):
 *   [Rank col 32px] [Body 1fr]                              [Chevron]
 *                    Provider name
 *                    {city} · {detour or distance bolded} · {arrival}
 *                    [svc][svc][svc][+N]
 *                    ● Open status                {Est./From} ${price}
 *
 * Slot-based design: this module owns layout and visual states; the
 * caller passes pre-derived display strings (city, distanceText,
 * detourText, openStatus, etc.) and a tier classification. No data
 * fetching, no Leaflet imports — keeps the dependency graph one-way
 * (find-a-wash → result-card) and avoids the import-cycle risk
 * called out in the audit.
 */

import { ChevronRight, Info, Truck } from "lucide-react";
import type { WashPinTier } from "@/components/customer/wash-pin";
import type { ServiceCategory } from "@/lib/filter-state";

export type CardSelectionState = "available" | "wanted-missing" | "extra";

export interface CardServicePill {
  /** Stable id for React key. */
  id: string;
  label: string;
  state: CardSelectionState;
}

export interface ResultCardProps {
  id: string;
  providerName: string;
  /** "Toronto, ON" — city + state/province as one ready string. */
  cityLine: string;
  /**
   * Pre-formatted distance/detour string. Caller chooses route-mode
   * vs nearby-mode wording per EID §3.4 metadata-line table:
   *   - Nearby:  "{x} mi"
   *   - Route:   "+{x} min detour"
   * The card emboldens the text via the inline span style — caller
   * passes the substring that should be bolded as `metaEmphasis`.
   */
  metaText: string;
  metaEmphasis?: string;
  /** Optional trailing arrival/done line (route + service mode). */
  arrivalText?: string;
  /** Result-list rank (0-indexed). Drives TOP badge / numeric column. */
  rankIdx: number;
  /** True for top-3 by best-fit score (per EID §4.6). */
  isTopBadge: boolean;
  /** Pin tier — drives demoted (incompatible) styling. Cards for
   *  low-tier providers still render normally; only `incompatible`
   *  triggers the demoted state. */
  tier: WashPinTier;
  serviceCategoriesSelected: ServiceCategory[];
  servicePills: CardServicePill[];
  openStatus: {
    /** "Open at 4:30 PM" / "Closed" — fully formatted. */
    label: string;
    /** Color of the dot + text. */
    color: "green" | "amber" | "red";
  } | null;
  /** Star rating display. Caller decides gating (≥5 reviews). */
  rating?: { value: number; reviewCount: number } | null;
  /** Right-aligned price line. Null when 0 services selected. */
  price?: {
    /** "From" or "Est." */
    prefix: "From" | "Est.";
    /** Pre-formatted, e.g. "$135" — caller handles minor-unit math. */
    amount: string;
  } | null;
  isSelected: boolean;
  onSelect: () => void;
  onChevron: () => void;
}

const PILL_BG_AVAILABLE = "#D1FAE5";
const PILL_FG_AVAILABLE = "#065F46";
const PILL_BG_NEUTRAL = "#F1F5F9";
const PILL_FG_NEUTRAL = "#475569";
const PILL_FG_MISSING = "#94A3B8";

const OPEN_COLOR = {
  green: { dot: "#15803D", text: "#15803D" },
  amber: { dot: "#B45309", text: "#B45309" },
  red: { dot: "#B91C1C", text: "#B91C1C" },
} as const;

export function ResultCard(props: ResultCardProps) {
  const isIncompat = props.tier === "incompatible";
  const bg = props.isSelected
    ? "#EBF2FD"
    : isIncompat
      ? "#F8FAFC"
      : "#FFFFFF";
  const nameColor = isIncompat ? "#475569" : "#0F172A";
  const chevronColor = isIncompat ? "#94A3B8" : "#475569";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onSelect();
        }
      }}
      aria-pressed={props.isSelected}
      style={{
        background: bg,
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
        cursor: "pointer",
        position: "relative",
        // Selected accent stripe — 3px solid blue along the left edge.
        // We compensate for the stripe by adding 3px to padding-left
        // so card body text alignment doesn't shift visually when
        // selection toggles.
        paddingLeft: props.isSelected ? 19 : 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderLeft: props.isSelected ? "3px solid #2D6FE3" : "0px solid transparent",
        marginLeft: props.isSelected ? -3 : 0,
        display: "grid",
        gridTemplateColumns: "32px 1fr 24px",
        columnGap: 12,
        alignItems: "start",
      }}
    >
      {/* Rank column */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 2 }}>
        {isIncompat ? (
          <Info size={16} color="#94A3B8" />
        ) : props.isTopBadge ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2D6FE3",
              color: "#FFFFFF",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "3px 6px",
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            TOP
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: "#94A3B8" }}>
            {props.rankIdx + 1}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: nameColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {props.providerName}
        </div>
        <MetaLine
          cityLine={props.cityLine}
          metaText={props.metaText}
          metaEmphasis={props.metaEmphasis}
          arrivalText={props.arrivalText}
        />
        {isIncompat ? (
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "#FEF3C7",
                color: "#92400E",
                fontSize: 10.5,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              <Truck size={11} />
              <span>No bay fits this vehicle</span>
            </span>
          </div>
        ) : props.servicePills.length > 0 ? (
          <ServicePillRow pills={props.servicePills} />
        ) : null}
        {(props.openStatus || props.price) && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {props.openStatus ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  color: OPEN_COLOR[props.openStatus.color].text,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: OPEN_COLOR[props.openStatus.color].dot,
                  }}
                />
                {props.openStatus.label}
                {props.rating && (
                  <span style={{ color: "#475569", fontWeight: 400, marginLeft: 4 }}>
                    · ★ {props.rating.value.toFixed(1)} ({props.rating.reviewCount})
                  </span>
                )}
              </span>
            ) : (
              <span />
            )}
            {props.price && (
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 400, color: "#94A3B8" }}>
                  {props.price.prefix}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>
                  {props.price.amount}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chevron */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          props.onChevron();
        }}
        aria-label="Open details"
        style={{
          background: "transparent",
          border: "none",
          padding: 4,
          margin: -4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: chevronColor,
        }}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function MetaLine(props: {
  cityLine: string;
  metaText: string;
  metaEmphasis?: string;
  arrivalText?: string;
}) {
  // The metaText drawn with an emphasized substring. We split the
  // string once on the first occurrence of metaEmphasis (case-
  // sensitive); pre/post render in regular weight, the matched
  // span renders bold/dark.
  const renderMeta = () => {
    if (!props.metaEmphasis) {
      return <span>{props.metaText}</span>;
    }
    const idx = props.metaText.indexOf(props.metaEmphasis);
    if (idx === -1) {
      return <span>{props.metaText}</span>;
    }
    return (
      <>
        <span>{props.metaText.slice(0, idx)}</span>
        <span style={{ fontWeight: 500, color: "#0F172A" }}>{props.metaEmphasis}</span>
        <span>{props.metaText.slice(idx + props.metaEmphasis.length)}</span>
      </>
    );
  };
  return (
    <div
      style={{
        marginTop: 2,
        fontSize: 11.5,
        fontWeight: 400,
        color: "#475569",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      <span>{props.cityLine}</span>
      <span style={{ margin: "0 6px" }}>·</span>
      {renderMeta()}
      {props.arrivalText && (
        <>
          <span style={{ margin: "0 6px" }}>·</span>
          <span>{props.arrivalText}</span>
        </>
      )}
    </div>
  );
}

function ServicePillRow({ pills }: { pills: CardServicePill[] }) {
  return (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
      }}
    >
      {pills.map((p) => {
        let bg = PILL_BG_NEUTRAL;
        let fg = PILL_FG_NEUTRAL;
        let strike = false;
        if (p.state === "available") {
          bg = PILL_BG_AVAILABLE;
          fg = PILL_FG_AVAILABLE;
        } else if (p.state === "wanted-missing") {
          bg = PILL_BG_NEUTRAL;
          fg = PILL_FG_MISSING;
          strike = true;
        }
        return (
          <span
            key={p.id}
            style={{
              fontSize: 10.5,
              fontWeight: 500,
              padding: "2px 6px",
              borderRadius: 4,
              background: bg,
              color: fg,
              textDecoration: strike ? "line-through" : "none",
            }}
          >
            {p.label}
          </span>
        );
      })}
    </div>
  );
}
