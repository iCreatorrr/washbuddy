/**
 * Best-fit sort scoring per EID §4.6.
 *
 * Composite score over four dimensions: detour weight 0.50, service
 * match weight 0.25, price weight 0.125, rating weight 0.125.
 * Lower score = better fit.
 *
 * Round 4 will swap the real per-location OSRM detour value into
 * the detour-weight slot. Until then we substitute mode-aware
 * distance proxies per the Round 2+3 audit:
 *
 *  - Nearby mode: `distFromOrigin` (km from current location to
 *    provider; already computed in find-a-wash's nearbyLocations
 *    derivation).
 *  - Route mode: `distanceToRoute` (perpendicular km from the
 *    sampled route polyline to the provider; also already
 *    computed in find-a-wash's nearbyLocations derivation via
 *    minDistanceToRouteWithProgress).
 *
 * The substitution uses the existing `distanceToRoute` /
 * `distFromOrigin` fields the marker layer already consumes —
 * no new geometry calculations.
 *
 * TOP badge logic (EID §4.6): top 3 cards within 1 standard
 * deviation of the best score get the TOP badge; 4+ get numeric
 * ranks. Independent of pin tier (rank column on cards is always
 * sort-position-driven; pin tier gates on filter context per
 * EID §3.5).
 */

export type SortBy =
  | "best-fit"
  | "shortest-detour"
  | "distance"
  | "price"
  | "rating";

export interface ScoredLocation {
  id: string;
  /** Composite best-fit score (lower = better). */
  score: number;
  /** Sort-position rank (0-indexed). */
  rankIdx: number;
  /** True when the card should render the TOP badge. */
  isTopBadge: boolean;
}

interface ScoringInput {
  id: string;
  distanceProxyKm: number; // distFromOrigin (nearby) or distanceToRoute (route)
  serviceMatchFraction: number; // 0..1, share of selected categories matched
  estimatedPrice: number | null; // minor units
  rating: number | null;
  reviewCount: number;
}

const RATING_DISPLAY_MIN_REVIEWS = 5;

function normalize(value: number, all: number[]): number {
  if (all.length === 0) return 0;
  const max = Math.max(...all);
  const min = Math.min(...all);
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function computeBestFitScore(
  loc: ScoringInput,
  ctx: { allDistances: number[]; allPrices: number[] },
): number {
  // Lower = better. Each term is normalized to 0..1 then weighted.
  // Service-match and rating are inverted (higher match / better
  // rating → lower score) so the composite is monotone "lower = better."
  const distance = normalize(loc.distanceProxyKm, ctx.allDistances);
  const services = 1 - loc.serviceMatchFraction;
  const price = loc.estimatedPrice != null
    ? normalize(loc.estimatedPrice, ctx.allPrices)
    : 0.5; // mid-fallback when price unknown
  const ratingNorm =
    loc.rating != null && loc.reviewCount >= RATING_DISPLAY_MIN_REVIEWS
      ? loc.rating / 5
      : 0.5;
  return (
    0.50 * distance +
    0.25 * services +
    0.125 * price +
    0.125 * (1 - ratingNorm)
  );
}

/** Score every location, sort ascending, apply TOP badge per stdev rule. */
export function scoreAndSort(locations: ScoringInput[]): ScoredLocation[] {
  if (locations.length === 0) return [];
  const ctx = {
    allDistances: locations.map((l) => l.distanceProxyKm),
    allPrices: locations.map((l) => l.estimatedPrice ?? 0).filter((p) => p > 0),
  };
  const scored = locations.map((loc) => ({
    id: loc.id,
    score: computeBestFitScore(loc, ctx),
  }));
  scored.sort((a, b) => a.score - b.score);

  // TOP badge: top 3 within 1 stdev of the best score, AND capped
  // at floor(25%) so a result set of 8 doesn't produce 3 TOPs (3
  // is the floor anyway). Per EID §4.6: top 3 if scores cluster
  // tightly; fewer if only the best is meaningfully better.
  const bestScore = scored[0].score;
  const mean = scored.reduce((s, x) => s + x.score, 0) / scored.length;
  const variance =
    scored.reduce((s, x) => s + (x.score - mean) ** 2, 0) / scored.length;
  const stdDev = Math.sqrt(variance);
  const cutoff = bestScore + stdDev;
  const topLimit = Math.min(3, Math.max(1, Math.ceil(scored.length * 0.25)));

  return scored.map((s, idx) => ({
    id: s.id,
    score: s.score,
    rankIdx: idx,
    isTopBadge: idx < topLimit && s.score <= cutoff,
  }));
}

/**
 * Apply a non-best-fit sort directive. For "best-fit" the caller
 * uses `scoreAndSort` directly. For other sort keys the caller
 * sorts by the raw field and TOP-badges the top 3 by that key.
 */
export function applyDirectSort(
  locations: ScoringInput[],
  sortBy: Exclude<SortBy, "best-fit">,
): ScoredLocation[] {
  if (locations.length === 0) return [];
  const cmps: Record<Exclude<SortBy, "best-fit">, (a: ScoringInput, b: ScoringInput) => number> = {
    "shortest-detour": (a, b) => a.distanceProxyKm - b.distanceProxyKm,
    distance: (a, b) => a.distanceProxyKm - b.distanceProxyKm,
    price: (a, b) => (a.estimatedPrice ?? Infinity) - (b.estimatedPrice ?? Infinity),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0), // higher rating first
  };
  const cmp = cmps[sortBy];
  const sorted = [...locations].sort(cmp);
  const topLimit = Math.min(3, Math.max(1, Math.ceil(sorted.length * 0.25)));
  return sorted.map((loc, idx) => ({
    id: loc.id,
    score: 0,
    rankIdx: idx,
    isTopBadge: idx < topLimit,
  }));
}
