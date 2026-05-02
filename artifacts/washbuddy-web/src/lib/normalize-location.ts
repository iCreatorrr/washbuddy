/**
 * Single-boundary normalizer for `Location` API responses.
 *
 * Background: `Location.latitude` and `Location.longitude` are
 * Prisma `Decimal(9, 6)` columns. Prisma + Express `res.json()`
 * serialize Decimal as a JSON string ("43.622994"), even though
 * the OpenAPI contract types them as `number`. The mismatch was
 * silent for nearby-mode distance math (JavaScript coerces strings
 * to numbers in arithmetic), but blew up Phase B Checkpoint 3 when
 * `leaflet.markercluster`'s bounds aggregation tried to construct
 * `new LatLngBounds([str, str])` — Leaflet's `toLatLng` returns null
 * for `[string, string]` if `typeof a[0] !== "object"` is the only
 * coercion gate (which it isn't, BUT the markercluster path doesn't
 * always go through `toLatLng` — it sometimes hits the recursive
 * fallback in `LatLngBounds.extend`, which then loops infinitely
 * over the string-shaped input).
 *
 * Fix: coerce strings → numbers at the boundary where the response
 * lands (per the user's hotfix direction). Single shared helper so
 * every consumer that fetches `Location`-shaped data goes through
 * the same gate. NaN-result fields become `null` so downstream
 * filters that gate on `latitude != null` continue to work.
 *
 * Long-term: the server should match its own OpenAPI contract — a
 * Prisma response transformer at the api-server boundary would be
 * the cleaner fix. Tracked for a future cleanup pass.
 */

function coerceLatLng(loc: any): any {
  if (loc == null || typeof loc !== "object") return loc;
  // Avoid mutating shared response objects; return a shallow copy.
  const out: any = { ...loc };
  if (typeof out.latitude === "string") {
    const n = parseFloat(out.latitude);
    out.latitude = Number.isFinite(n) ? n : null;
  }
  if (typeof out.longitude === "string") {
    const n = parseFloat(out.longitude);
    out.longitude = Number.isFinite(n) ? n : null;
  }
  return out;
}

/**
 * Apply lat/lng coercion to a single-location response shape, e.g.
 * the body of `GET /api/locations/:id` (or the `location` field of
 * such a response). No-op for null / non-object inputs.
 */
export function normalizeLocation<T>(loc: T): T {
  return coerceLatLng(loc) as T;
}

/**
 * Apply lat/lng coercion to every entry in a search-response shape,
 * e.g. `GET /api/locations/search` returning `{ locations: [...] }`.
 * Pass-through for responses without a `locations` array.
 */
export function normalizeLocationsResponse<T extends { locations?: any[] }>(data: T): T {
  if (!data || !Array.isArray((data as any).locations)) return data;
  return { ...data, locations: (data as any).locations.map(coerceLatLng) };
}
