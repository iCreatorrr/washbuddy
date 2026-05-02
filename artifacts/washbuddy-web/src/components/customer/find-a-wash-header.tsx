import React from "react";

/**
 * /find-a-wash expanded-mode header per EID §3.1 + visual
 * reference §5.2.
 *
 * Phase B Checkpoint 4 ships the **expanded-mode-only** header.
 * Collapsed mode (single floating pill that drops down to expand)
 * waits for Round 2 to land alongside the bottom sheet whose
 * peek/default/expanded states drive the mode transitions. CP4's
 * header is therefore static — no framer-motion shared layoutId,
 * no internal mode state.
 *
 * Design: slots-based. The host page (find-a-wash.tsx) owns the
 * autocomplete state, the city-option machinery, the route
 * planning handlers, and the placeholder time chip — and passes
 * each row's rendered content as a `React.ReactNode` slot. The
 * header just provides the visual container: sticky positioning
 * at `--z-header`, surface styling (white + backdrop-blur),
 * vehicle-pill row + three-row search card layout, and
 * top-of-page placement.
 *
 * Slots design rationale: avoids a circular import between this
 * component and the host page (find-a-wash.tsx exports
 * `CityAutocomplete` for the autocomplete row, and would itself
 * import this header — slots sidestep the cycle entirely). Round
 * 2 may want to reuse this header inside the bottom sheet's
 * expanded state with different slots; the props shape supports
 * that.
 *
 * Replaces the Phase A interim chrome:
 * - Floating top-left logomark/back button (gone)
 * - Floating top-right NotificationBell + hamburger cluster (gone)
 * - `pt-14 lg:pt-0` content compensation (gone)
 * - Route-planner-era inline form Card + collapsed-summary Card
 *   (replaced by this header's slots-based search card)
 *
 * The page's content (map, result list, trip metrics, empty-area
 * pill) lives BELOW this header in normal document flow. Sticky
 * positioning keeps the header visible while the user scrolls
 * the result list.
 */
export interface FindAWashHeaderProps {
  /** Active vehicle pill content. Host passes `<ActiveVehiclePill />`. */
  vehiclePill: React.ReactNode;
  /** From row content — origin label + autocomplete OR My Location pill. */
  fromRow: React.ReactNode;
  /** Swap button rendered between From and To. Small centered chip. */
  swapButton: React.ReactNode;
  /** To row content — destination label + autocomplete. */
  toRow: React.ReactNode;
  /** Time row content — read-only chip placeholder until Round 4
   *  introduces the real arrival-time picker. */
  timeRow: React.ReactNode;
  /** Optional inline-text Plan Route affordance below the time row,
   *  for manual-text submitters who don't pick from autocomplete.
   *  The auto-fire pattern handles autocomplete-commit submitters
   *  without this button. */
  planRouteAffordance?: React.ReactNode;
  /** Optional status message rendered below the search card —
   *  geolocation-detecting indicator or routing error. */
  statusMessage?: React.ReactNode;
}

export function FindAWashHeader({
  vehiclePill,
  fromRow,
  swapButton,
  toRow,
  timeRow,
  planRouteAffordance,
  statusMessage,
}: FindAWashHeaderProps) {
  return (
    <header
      // `position: sticky; top: 0` keeps the header pinned while
      // the user scrolls the result list. Translucent white +
      // backdrop-blur matches the surface conventions established
      // in Phase A's interim chrome (now formalized).
      // `--z-header` (1000) is the EID §3.2 reserved tier.
      className="sticky top-0 -mx-4 px-4 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200/80 space-y-3"
      style={{ zIndex: "var(--z-header)" } as React.CSSProperties}
    >
      {/* Vehicle pill row. min-w-0 + max-w-full lets a long
          vehicle nickname truncate cleanly inside the pill rather
          than push the row past the viewport. */}
      <div className="flex items-center gap-3 max-w-full">
        <div className="min-w-0 max-w-full">
          {vehiclePill}
        </div>
      </div>

      {/* Search card — three vertically-stacked rows per visual
          reference §5.2. Mobile-first; the same layout works on
          desktop because the inputs are full-width within the
          card and the swap button stays centered between rows. */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        {fromRow}
        {/* Swap button gets centered horizontally between From and
            To. -my-1 pulls the rows tighter so the swap chip sits
            visually inside the gap rather than expanding it. */}
        <div className="flex justify-center -my-1">
          {swapButton}
        </div>
        {toRow}
        {timeRow}
        {planRouteAffordance && (
          <div className="pt-1">
            {planRouteAffordance}
          </div>
        )}
      </div>

      {statusMessage}
    </header>
  );
}
