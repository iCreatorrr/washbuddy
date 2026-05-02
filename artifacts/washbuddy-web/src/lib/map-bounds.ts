import type L from "leaflet";

/**
 * Bounds-versus-results helpers used by the driver-side map surfaces
 * to decide when the UI should suggest "the result list and the
 * visible map don't agree" — most prominently, the "Search this
 * area" button per EID §3.2.
 *
 * Pure module; the caller passes a Leaflet `LatLngBounds` instance
 * obtained from `map.getBounds()`. Keeping the math here (not
 * inline in find-a-wash.tsx) makes it testable in isolation and
 * lets future surfaces (e.g., a card-level "this provider isn't
 * in your visible map" indicator) share the same primitive.
 */

/**
 * Fraction (0–1) of `locations` whose lat/lng falls inside the
 * supplied bounds. Empty input returns 1 — the "no out-of-bounds
 * locations" sentinel — so consumers comparing against a `< 0.5`
 * threshold don't accidentally trip on an empty result set. The
 * caller still typically guards with an explicit
 * `locations.length > 0` check before showing UI that suggests
 * "your map and your results disagree" — there's no disagreement
 * to surface when there are no results in the first place.
 */
export function getInBoundsRatio(
  locations: ReadonlyArray<{ lat: number; lng: number }>,
  bounds: L.LatLngBounds,
): number {
  if (locations.length === 0) return 1;
  let inCount = 0;
  for (const loc of locations) {
    if (bounds.contains([loc.lat, loc.lng])) inCount++;
  }
  return inCount / locations.length;
}
