/**
 * Pin selection callout per EID §3.6 + visual reference §12.
 *
 * Replaces the Leaflet popup pattern. The host (find-a-wash.tsx)
 * computes the pin's container-pixel position via
 * `map.latLngToContainerPoint()` and passes it as `pinX`/`pinY`;
 * this component renders an absolutely-positioned div above the
 * pin within the map's coordinate space. No Leaflet imports —
 * keeps the dependency one-way.
 *
 * Structure:
 *   White card with heavy drop shadow + pointing triangle below.
 *   TOP badge + provider name + city · detour line.
 *   Divider.
 *   Open status (left) + Book button (right).
 *
 * Tap behavior:
 *   - Tap card body (anywhere except Book button): caller hooks
 *     this to "snap sheet to default + scroll matching card".
 *   - Tap Book: caller navigates to /location/:id/book.
 *
 * The host wraps this in a `<div style={{position:absolute}}>` whose
 * top/left are pinX/pinY-adjusted; this component takes care of the
 * card's own positioning relative to that anchor (centered above,
 * triangle pointing down to the pin tip).
 */

import { ChevronRight } from "lucide-react";

export interface PinCalloutProps {
  /** Container-pixel coordinates of the selected pin's tip. */
  pinX: number;
  pinY: number;
  isTopBadge: boolean;
  providerName: string;
  cityLine: string;
  metaText: string;
  metaEmphasis?: string;
  openStatus: {
    label: string;
    color: "green" | "amber" | "red";
  } | null;
  onCardTap: () => void;
  onBook: () => void;
}

const OPEN_COLOR = {
  green: "#15803D",
  amber: "#B45309",
  red: "#B91C1C",
} as const;

const CARD_WIDTH = 280;
const CARD_GAP_FROM_PIN = 14; // space between triangle tip and pin tip

export function PinCallout(props: PinCalloutProps) {
  // Center the card horizontally over the pin; bottom of the
  // triangle sits CARD_GAP_FROM_PIN above the pin tip.
  const cardLeft = props.pinX - CARD_WIDTH / 2;
  const cardBottomFromTop = props.pinY - CARD_GAP_FROM_PIN;
  // Card is positioned by its bottom edge so the triangle (rendered
  // as a downward-pointing chevron via a rotated square) sits on
  // the card's bottom.
  return (
    <div
      role="dialog"
      aria-label={`${props.providerName} details`}
      style={{
        position: "absolute",
        left: cardLeft,
        top: cardBottomFromTop,
        width: CARD_WIDTH,
        transform: "translateY(-100%)",
        zIndex: "var(--z-pin-label)" as unknown as number,
        pointerEvents: "auto",
      }}
    >
      <div
        onClick={props.onCardTap}
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          boxShadow: "0 4px 16px rgba(15,23,42,0.15)",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        {/* Top: badge + name + chevron */}
        <div style={{ padding: "10px 12px 8px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          {props.isTopBadge && (
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
                marginTop: 2,
                flexShrink: 0,
              }}
            >
              TOP
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#0F172A",
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
            />
          </div>
          <ChevronRight size={16} color="#475569" style={{ marginTop: 2 }} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#F1F5F9" }} />

        {/* Bottom: open status + book button */}
        <div
          style={{
            padding: "8px 12px 10px",
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
                color: OPEN_COLOR[props.openStatus.color],
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: OPEN_COLOR[props.openStatus.color],
                }}
              />
              {props.openStatus.label}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.onBook();
            }}
            style={{
              height: 28,
              padding: "0 14px",
              borderRadius: 999,
              background: "#2D6FE3",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Book
          </button>
        </div>
      </div>

      {/* Pointing triangle — rotated square with same shadow,
          centered horizontally below the card. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: -6,
          width: 12,
          height: 12,
          background: "#FFFFFF",
          transform: "translateX(-50%) rotate(45deg)",
          boxShadow: "2px 2px 4px rgba(15,23,42,0.06)",
        }}
      />
    </div>
  );
}

function MetaLine(props: { cityLine: string; metaText: string; metaEmphasis?: string }) {
  const renderMeta = () => {
    if (!props.metaEmphasis) return <span>{props.metaText}</span>;
    const idx = props.metaText.indexOf(props.metaEmphasis);
    if (idx === -1) return <span>{props.metaText}</span>;
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
    </div>
  );
}
