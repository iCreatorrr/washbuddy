import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "";
import { Card, Input, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Navigation, Route, ArrowRight, X, Loader2, ChevronDown, Crosshair, Star, Maximize2, Minimize2, Pencil, ArrowLeft, Menu, Droplets, Building2, Landmark } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Marker clustering (Phase B CP2). Plugin attaches `markerClusterGroup`
// to the L namespace as a side effect; the type augmentation comes
// via @types/leaflet.markercluster.
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { ActiveVehiclePill } from "@/components/customer/active-vehicle-pill";
import { useActiveVehicle } from "@/contexts/activeVehicle";
import { deriveSizeClassFromLengthInches } from "@/lib/vehicleBodyType";
import { useMobileMenu } from "@/components/layout";
import { NotificationBell } from "@/components/notification-bell";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import {
  classifyPin,
  pickHighestTier,
  renderWashPinHtml,
  renderWashClusterHtml,
  WASH_PIN_SIZE,
  WASH_PIN_ANCHOR,
  WASH_PIN_POPUP_ANCHOR,
  type WashPinTier,
} from "@/components/customer/wash-pin";

type PlaceKind = "city" | "address" | "poi" | "other";

interface CityOption {
  name: string;
  state: string;
  lat: number;
  lng: number;
  label: string;
  // Optional kind tag used by the autocomplete dropdown to choose
  // an icon and secondary line. Older callers (URL hydration via
  // getCityByLabel, sessionStorage cache restore) leave this
  // undefined; the UI treats undefined as "other".
  kind?: PlaceKind;
  secondary?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  // Nominatim type/class identify what the result is. `class`
  // examples: 'place' (city/town), 'building'/'highway' (address),
  // 'amenity'/'shop'/'tourism'/'leisure'/'historic' (POI).
  class?: string;
  type?: string;
  // POIs typically include a top-level `name`.
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    province?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
    amenity?: string;
  };
}

/**
 * Soft viewbox bias for Nominatim. ±5° around the user's position
 * is roughly a 500km box at temperate latitudes — enough to bias
 * toward "this side of the continent" without being so tight that
 * cross-region searches (Toronto user → NYC's Central Park) fail
 * to surface. We pass it without `bounded=1`, so it's a ranking
 * hint, not a hard filter. Tunable: ±10° if post-launch search
 * quality issues surface.
 */
function bboxAround(lat: number, lng: number, deg = 5): string {
  // Nominatim viewbox order: <x1>,<y1>,<x2>,<y2> = west,north,east,south.
  return `${lng - deg},${lat + deg},${lng + deg},${lat - deg}`;
}

/**
 * Freeform Nominatim search. Bug 2 fix (Checkpoint 4) — drops the
 * `featuretype=city` restriction so this returns the same broad
 * mix Google Maps' search box does: addresses, POIs/venues, and
 * cities. The result types each get a different icon and label
 * pattern in the dropdown so the user can tell what they're
 * picking.
 *
 * Checkpoint 6 additions:
 * - `countrycodes=us,ca` (no `mx`) tightens to Decision 06's US +
 *   Canada launch scope. Update this single string when Mexico
 *   joins.
 * - `viewbox` provides a soft geographic bias when we know the
 *   user's position. Resolves the "rogers centre returns
 *   Philadelphia" class of bug where Nominatim's global
 *   importance ranking surfaced unrelated cities.
 * - `namedetails=1` ensures Nominatim returns the venue `name`
 *   field on POI results so the dropdown can show
 *   "Scotiabank Arena" as the primary line and the address as the
 *   secondary line.
 *
 * `dedupe=1` and `addressdetails=1` are Nominatim flags. Limit 8
 * picked because the dropdown is `max-h-60 overflow-y-auto`; ~8
 * rows fits without forcing scroll.
 */
async function searchPlaces(query: string, userLat?: number, userLng?: number): Promise<CityOption[]> {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    namedetails: "1",
    dedupe: "1",
    limit: "8",
    countrycodes: "us,ca",
  });
  if (Number.isFinite(userLat) && Number.isFinite(userLng)) {
    params.set("viewbox", bboxAround(userLat as number, userLng as number));
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "Accept-Language": "en" },
    });
    if (!res.ok) return [];
    const data: NominatimResult[] = await res.json();
    return data
      .map((r): CityOption | null => {
        const a = r.address ?? {};
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const cityName = a.city || a.town || a.village || a.municipality || a.hamlet || "";
        const localArea = a.suburb || a.neighbourhood || cityName;
        const stateName = a.state || a.province || "";

        const isAddress = !!(a.house_number && a.road);
        const POI_CLASSES = ["amenity", "shop", "tourism", "leisure", "historic", "railway", "aeroway"];
        const isPoi = !isAddress && (POI_CLASSES.includes(r.class ?? "") || (!!r.name && !cityName));

        if (isAddress) {
          const street = `${a.house_number} ${a.road}`;
          const cityPart = localArea ? `, ${localArea}` : "";
          const statePart = stateName ? `, ${stateName}` : "";
          const postal = a.postcode ? ` ${a.postcode}` : "";
          const label = `${street}${cityPart}${statePart}${postal}`.trim();
          return {
            name: street,
            state: stateName,
            lat, lng, label,
            kind: "address",
            secondary: [localArea, stateName].filter(Boolean).join(", "),
          };
        }
        if (isPoi) {
          const venueName = (r.name || r.display_name.split(",")[0] || "").trim();
          // Bug C / Checkpoint 6: secondary line is the address
          // when Nominatim returns one alongside the POI — the
          // Google Places / Apple Maps "venue / address" pattern.
          // Falls back to city + state when the response has no
          // street components (less common but possible for
          // landmark-style POIs).
          const street = a.house_number && a.road
            ? `${a.house_number} ${a.road}`
            : a.road || "";
          const addressLine = [street, cityName, stateName].filter(Boolean).join(", ");
          const cityPart = cityName ? `, ${cityName}` : "";
          const label = `${venueName}${cityPart}`.trim();
          return {
            name: venueName,
            state: stateName,
            lat, lng, label,
            kind: "poi",
            secondary: addressLine || [cityName, stateName].filter(Boolean).join(", "),
          };
        }
        if (cityName) {
          const label = stateName ? `${cityName}, ${stateName}` : cityName;
          return {
            name: cityName,
            state: stateName,
            lat, lng, label,
            kind: "city",
            secondary: stateName,
          };
        }
        // Generic fallback — region/landmark without a clean
        // address shape. Use Nominatim's display_name truncated to
        // its first three components (full strings can run a
        // dozen levels deep — country + admin + locality + ...).
        const truncated = r.display_name.split(",").slice(0, 3).map((s) => s.trim()).filter(Boolean).join(", ");
        return {
          name: truncated,
          state: stateName,
          lat, lng,
          label: truncated,
          kind: "other",
        };
      })
      .filter((p): p is CityOption => p !== null)
      .filter((p, i, arr) => arr.findIndex((x) => x.label === p.label) === i);
  } catch {
    return [];
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return "";
    const data: NominatimResult = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || "";
    const state = data.address?.state || data.address?.province || "";
    return city && state ? `${city}, ${state}` : city || state;
  } catch {
    return "";
  }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minDistanceToRouteWithProgress(lat: number, lng: number, routePoints: [number, number][]): { distanceKm: number; progress: number } {
  let minDist = Infinity;
  let bestSegmentIndex = 0;
  let bestT = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const [aLat, aLng] = routePoints[i];
    const [bLat, bLng] = routePoints[i + 1];
    const dx = bLat - aLat;
    const dy = bLng - aLng;
    let t = 0;
    if (dx !== 0 || dy !== 0) {
      t = ((lat - aLat) * dx + (lng - aLng) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
    }
    const projLat = aLat + t * dx;
    const projLng = aLng + t * dy;
    const d = Math.sqrt((lat - projLat) ** 2 + (lng - projLng) ** 2);
    if (d < minDist) {
      minDist = d;
      bestSegmentIndex = i;
      bestT = t;
    }
  }

  const totalSegments = routePoints.length - 1;
  const progress = totalSegments > 0 ? (bestSegmentIndex + bestT) / totalSegments : 0;

  return { distanceKm: minDist * 111, progress };
}

const ROUTE_CORRIDOR_KM = 50;
const NEARBY_RADIUS_KM = 80;

function CityAutocomplete({
  value,
  onChange,
  placeholder,
  exclude,
  userLat,
  userLng,
}: {
  value: CityOption | null;
  onChange: (city: CityOption | null) => void;
  placeholder: string;
  exclude?: CityOption | null;
  // When the user's position is known (origin set, geolocation
  // granted), forwarded to Nominatim as a soft viewbox bias —
  // Bug C / Checkpoint 6.
  userLat?: number;
  userLng?: number;
}) {
  const [query, setQuery] = useState(value?.label || "");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<CityOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The dropdown is portaled to <body> (Checkpoint 5, Approach A —
  // resolves the cascading z-index regressions from Checkpoint 4)
  // so it lives outside the search Card's stacking context entirely
  // and reliably clears Leaflet's panes at every viewport. This ref
  // is the click-outside companion to containerRef — without it the
  // mousedown handler would fire on every click inside the dropdown
  // and close it on selection.
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portaled dropdown's pixel-precise position. Computed from the
  // input's getBoundingClientRect when the dropdown opens, and
  // re-computed on scroll/resize while open. `null` when the
  // dropdown isn't mounted — guards against rendering at (0,0)
  // before the first measurement.
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setQuery(value?.label || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Position the portaled dropdown under the input. Recomputes on
  // mount-when-open, on window scroll, and on window resize so the
  // dropdown follows the input through page scroll and orientation
  // change. Listeners are attached only while the dropdown is open
  // and torn down on close.
  useEffect(() => {
    const shouldShowDropdown = isOpen && !value && query.length >= 2;
    if (!shouldShowDropdown) {
      setDropdownPos(null);
      return;
    }
    const recompute = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [isOpen, value, query]);

  const searchVersionRef = useRef(0);
  const handleSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const version = ++searchVersionRef.current;
    // userLat/userLng captured by closure; the useCallback deps
    // below ensure the closure refreshes when geolocation arrives
    // or the user picks a different origin.
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(q, userLat, userLng);
      if (version !== searchVersionRef.current) return;
      const filtered = exclude
        ? places.filter((c) => c.label !== exclude.label)
        : places;
      setResults(filtered);
      setIsSearching(false);
    }, 200);
  }, [exclude, userLat, userLng]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const val = e.target.value;
          setQuery(val);
          setIsOpen(true);
          if (!val) {
            onChange(null);
            setResults([]);
          } else {
            // If the user starts typing into a field that has a
            // previously-committed CityOption (e.g. they're editing the
            // existing destination), the prior `value` is still set —
            // the dropdown gate `!value && query.length >= 2` would
            // suppress suggestions even though the typed text no
            // longer matches the committed label. Clear `value` via
            // the parent's onChange the moment the typed text diverges
            // from the committed label so the suggestions render
            // cleanly. This is what "edit-to-replace" means in any
            // typeahead — the prior selection isn't valid anymore.
            if (value && val !== value.label) {
              onChange(null);
            }
            handleSearch(val);
          }
        }}
        onFocus={() => { if (query.length >= 2 && results.length > 0) setIsOpen(true); }}
        className="h-12 rounded-xl"
      />
      {value && (
        <button
          onClick={() => {
            onChange(null);
            setQuery("");
            setResults([]);
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {/* Portaled dropdown (Checkpoint 5, Approach A) — renders
          into <body> via createPortal so it lives outside the
          search Card's stacking context and clears Leaflet's
          panes (200–700) at all viewports without the parent
          Card needing an elevated z-index. AnimatePresence wraps
          the portal call so framer-motion's exit animation still
          runs on close. Position is `position:fixed` at the
          coordinates computed from the input's bounding rect,
          tracked via the scroll/resize listeners above.
          TODO(round-3+): formalize a `--z-search-dropdown` CSS
          variable per EID §3.2 z-index hierarchy. */}
      {createPortal(
        <AnimatePresence>
          {isOpen && !value && (query.length >= 2) && dropdownPos && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                position: "fixed",
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
              className="z-[1000] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto"
            >
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                </div>
              ) : results.length > 0 ? (
                results.map((place, idx) => {
                  // Bug 2 (Checkpoint 4): kind drives icon +
                  // primary/secondary lines so addresses, venues,
                  // and cities are visually distinct.
                  const Icon = place.kind === "address"
                    ? MapPin
                    : place.kind === "poi"
                      ? Landmark
                      : place.kind === "city"
                        ? Building2
                        : MapPin;
                  return (
                    <button
                      key={`${place.label}-${idx}`}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex items-start gap-2 transition-colors"
                      onClick={() => {
                        onChange(place);
                        setQuery(place.label);
                        setIsOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800 truncate">{place.name}</div>
                        {place.secondary && (
                          <div className="text-xs text-slate-400 truncate">{place.secondary}</div>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-3 text-sm text-slate-400">
                  No matches found. Try a different search.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/**
 * Build an `L.divIcon` for a result-location pin via the wash-pin
 * component (Phase B Checkpoint 1, EID §3.5; CP1.6 spec correction
 * dropped per-category glyphs). The wash-pin module stays
 * Leaflet-free; this thin host helper bridges the rendered HTML
 * into Leaflet's `divIcon` API.
 *
 * Replaces the previous `locationIcon`, `activeLocationIcon`, and
 * `incompatibleLocationIcon` constants — those collapsed three
 * static treatments into one tier-aware path.
 */
function buildWashPinDivIcon(input: {
  tier: WashPinTier;
  label?: string;
  labelVisible?: boolean;
  isSelected?: boolean;
}): L.DivIcon {
  return L.divIcon({
    className: "",
    html: renderWashPinHtml(input),
    iconSize: WASH_PIN_SIZE[input.tier],
    iconAnchor: WASH_PIN_ANCHOR[input.tier],
    popupAnchor: WASH_PIN_POPUP_ANCHOR[input.tier],
  });
}

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#22c55e,#16a34a);border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="8"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const endIcon = L.divIcon({
  className: "",
  html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#ef4444,#dc2626);border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

interface RouteResult {
  points: [number, number][];
  distanceKm: number;
  durationMins: number;
}

async function fetchETAsFromOrigin(
  originLat: number,
  originLng: number,
  locations: { id: string; latitude: number | null; longitude: number | null }[],
  onPartial?: (partial: Record<string, number>) => void
): Promise<Record<string, number>> {
  const validLocs = locations.filter((l) => l.latitude != null && l.longitude != null);
  if (validLocs.length === 0) return {};

  const batchSize = 25;
  const result: Record<string, number> = {};
  const batches: typeof validLocs[] = [];

  for (let i = 0; i < validLocs.length; i += batchSize) {
    batches.push(validLocs.slice(i, i + batchSize));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const coords = [`${originLng},${originLat}`, ...batch.map((l) => `${l.longitude},${l.latitude}`)].join(";");
      const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.code !== "Ok" || !data.durations?.[0]) return;
        const durations = data.durations[0];
        batch.forEach((loc, idx) => {
          const secs = durations[idx + 1];
          if (secs != null && secs > 0) {
            result[loc.id] = Math.round(secs / 60);
          }
        });
        if (onPartial) onPartial({ ...result });
      } catch {}
    })
  );
  return result;
}

function formatETA(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function downsamplePoints(points: [number, number][], maxPoints: number): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

async function fetchRoute(from: CityOption, to: CityOption): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing failed");
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) throw new Error("No route found");
  const route = data.routes[0];
  const coords: [number, number][] = route.geometry.coordinates.map(
    (c: [number, number]) => [c[1], c[0]] as [number, number]
  );
  return {
    points: coords,
    distanceKm: Math.round(route.distance / 1000),
    durationMins: Math.round(route.duration / 60),
  };
}

/**
 * Strict invariant (Bug A / Checkpoint 6): the user-facing label
 * for a My Location option must NEVER contain raw lat/lng. Coords
 * live on the lat/lng fields of CityOption only. This sanitizer
 * is called from every path that parses a label back into an
 * option (URL hydration, legacy backcompat, cache restoration) so
 * a single defensive layer catches every code path that could
 * leak lat/lng into the To input after a flip.
 *
 * Handles formatting variants observed in legacy URLs: differing
 * decimal precision (4 vs 6 places), optional whitespace around
 * commas, and labels with or without the "near " prefix.
 */
function sanitizeMyLocationLabel(rawLabel: string): string {
  if (!rawLabel.startsWith("My Location")) return rawLabel;
  // Try to recover the area portion: everything before the trailing
  // "..., <lat>, <lng>)" tail. Lazy match on the area so we stop at
  // the first comma-then-coordinate, not the last. The legacy
  // makeMyLocationOption produced two shapes:
  //   - `My Location (near {area}, {lat}, {lng})` when reverse-geocode succeeded
  //   - `My Location (detected, {lat}, {lng})` when it failed
  // Both are handled below.
  const areaMatch = rawLabel.match(/^My Location \((?:near\s+)?(.+?)\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)\s*$/);
  if (areaMatch) {
    const area = areaMatch[1].trim();
    if (!area || area === "detected") return "My Location (detected)";
    return `My Location (near ${area})`;
  }
  // Fallback for any My Location label that still contains a
  // lat/lng-shaped substring (`<digits>.<digits>, <digits>.<digits>`)
  // — even if our primary regex didn't match. Strip it.
  if (/-?\d+\.\d+\s*,\s*-?\d+\.\d+/.test(rawLabel)) {
    return "My Location (detected)";
  }
  return rawLabel;
}

function getCityByLabel(label: string): CityOption | null {
  if (!label) return null;

  // Primary: uniform bracket-suffix format used by serializeCityForUrl
  // for every kind of place (post-Checkpoint-4). My Location now uses
  // the same shape as cities/addresses/POIs.
  const coordMatch = label.match(/^(.+?)\s*\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]$/);
  if (coordMatch) {
    const displayName = coordMatch[1].trim();
    const lat = parseFloat(coordMatch[2]);
    const lng = parseFloat(coordMatch[3]);
    if (displayName.startsWith("My Location")) {
      // Defense-in-depth (Bug A / Checkpoint 6): even in the
      // post-Checkpoint-4 bracket format, ensure no stray
      // lat/lng leaked into the displayName itself.
      return { name: "My Location", state: "", lat, lng, label: sanitizeMyLocationLabel(displayName) };
    }
    const parts = displayName.split(", ");
    return {
      name: parts[0] || displayName,
      state: parts[1] || "",
      lat,
      lng,
      label: displayName,
    };
  }

  // Backwards-compat: old My Location label that embedded lat/lng in
  // the parenthetical (no bracket suffix). Bookmarked URLs from
  // before Checkpoint 4 still hydrate cleanly because we sanitize
  // the label before storing it in state — Bug A / Checkpoint 6.
  if (label.startsWith("My Location")) {
    const match = label.match(/My Location \((.*),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
    if (match) {
      return {
        name: "My Location",
        state: "",
        lat: parseFloat(match[2]),
        lng: parseFloat(match[3]),
        label: sanitizeMyLocationLabel(label),
      };
    }
  }

  return null;
}

function serializeCityForUrl(city: CityOption): string {
  // Bug 3 fix (Checkpoint 4): all options now use the bracketed
  // [lat,lng] suffix for URL serialization, including My Location.
  // The previous My Location special case baked lat/lng into the
  // human-readable label, which then leaked back into the To
  // input field after a flip.
  return `${city.label} [${city.lat.toFixed(4)},${city.lng.toFixed(4)}]`;
}

function makeMyLocationOption(lat: number, lng: number, areaName?: string): CityOption {
  const area = areaName || "";
  // Bug 3 fix (Checkpoint 4): label is human-readable only. lat/lng
  // is preserved on the lat/lng fields and embedded in the URL by
  // serializeCityForUrl; it's no longer leaked into the user-facing
  // string.
  return {
    name: "My Location",
    state: "",
    lat,
    lng,
    label: area ? `My Location (near ${area})` : "My Location (detected)",
    kind: "other",
  };
}

const ROUTE_CACHE_KEY = "washbuddy_route_cache";

function cacheRoute(from: CityOption, to: CityOption, result: RouteResult, etaData: Record<string, number>) {
  try {
    sessionStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify({
      from, to, result, etas: etaData, ts: Date.now(),
    }));
  } catch {}
}

function restoreCachedRoute(from: CityOption | null, to: CityOption | null): { result: RouteResult; etas: Record<string, number> } | null {
  if (!from || !to) return null;
  try {
    const raw = sessionStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (
      cached.from?.lat === from.lat && cached.from?.lng === from.lng &&
      cached.to?.lat === to.lat && cached.to?.lng === to.lng &&
      Date.now() - cached.ts < 30 * 60 * 1000
    ) {
      return { result: cached.result, etas: cached.etas || {} };
    }
  } catch {}
  return null;
}

/**
 * /find-a-wash — merged search and discovery page.
 *
 * Phase A clone of route-planner.tsx (Round 1 of the search-and-
 * discovery overhaul). Same routing/ETA/pin/popup machinery as the
 * legacy page; the only behavioral differences in this phase are
 * mode-aware bits — distance metric on cards (miles in nearby vs
 * placeholder detour time in route mode) and a centralized `mode`
 * derivation downstream code reads instead of re-checking
 * `destination`.
 *
 * Bottom sheet, new pin component (`wash-pin.tsx`), clustering, and
 * the search-this-area button land in Phase B (Round 2). The
 * full collapsed↔expanded header animation per EID §3.1 is also
 * Phase B; Phase A keeps the existing route-planner header.
 *
 * Free-text city search (matchesSearch / metro aliases) lives in
 * `lib/search-helpers.ts` for Phase B's unified search pill — not
 * yet wired to a UI element on this page.
 *
 * Real per-location OSRM detour times land in Round 4. Until then,
 * route-mode cards show `+~{etaFromOrigin} min detour` with the `~`
 * prefix indicating placeholder per EID §3.7 fallback semantics.
 */
export default function FindAWash() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialOrigin = getCityByLabel(urlParams.get("from") || "");
  const initialDest = getCityByLabel(urlParams.get("to") || "");

  const cached = useMemo(() => restoreCachedRoute(initialOrigin, initialDest), []);

  const [origin, setOrigin] = useState<CityOption | null>(initialOrigin);
  const [destination, setDestination] = useState<CityOption | null>(initialDest);
  const [route, setRoute] = useState<RouteResult | null>(cached?.result || null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied" | "unavailable">(initialOrigin ? "granted" : "pending");
  const [etas, setEtas] = useState<Record<string, number>>(cached?.etas || {});
  const [, setNavLocation] = useLocation();
  const autoRoutedRef = useRef(!!cached);
  const geoAttemptedRef = useRef(false);
  // Mounted ref guards async setStates after unmount. Leaflet's own
  // map.remove() is wrapped in try/catch, but the ETA / route fetches
  // aren't aborted — without the ref they'd setState after unmount and
  // produce a console warning during fast navigations.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // UI state for the redesigned shell. mapExpanded toggles the map
  // between its inline ~55vh shape and a full-viewport overlay; the
  // overlay uses position:fixed and locks body scroll.
  // selectedLocationId is the SINGLE source of truth for "which
  // location is the user looking at right now" — pin highlight,
  // popup-open state, and card highlight all derive from it. Any
  // tap that selects (pin, card body) writes here; any tap that
  // deselects (same pin, same card, empty map) clears it.
  // formCollapsed defaults to "collapse the From/To form when a
  // route is already planned" — less duplicate header weight on a
  // long scroll. The driver hits Edit to expand it again.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(!!cached);

  // Mode is derived from a single source: whether a destination is
  // set. Drives sort default, distance metric on cards, and (in
  // Phase B+) header presentation and time-selector visibility.
  // Centralized so downstream JSX and effects read `mode` rather
  // than re-checking `destination` themselves.
  const mode: "nearby" | "route" = destination ? "route" : "nearby";

  // The AppLayout mobile header is suppressed on this page (per
  // EID §3.1). The hamburger trigger we render in the floating
  // top-right cluster controls the same shared dropdown via
  // context. Phase B replaces this interim cluster with the
  // unified collapsed/expanded header.
  const mobileMenu = useMobileMenu();

  // Top-level vs deep entry — drives the floating top-left
  // button's icon (logomark vs back chevron). Approach A from the
  // Checkpoint 2 prompt: `window.history.length` is the same
  // heuristic AppLayout's previous mobile back button used. Known
  // limitation: history grows during in-app navigation, so a user
  // who lands on /find-a-wash, taps a location, then returns,
  // sees a back chevron even though /find-a-wash was their entry
  // point. Approach B (a Wouter-aware visit-history hook) replaces
  // this if the heuristic causes confusion in testing.
  const isDeepEntry = typeof window !== "undefined" && window.history.length > 1;

  // Scroll-aware floating chrome (Bug B / Checkpoint 6). The
  // top-left button + top-right cluster hide on scroll-down past
  // the map and reveal on scroll-up — Pinterest / Material
  // Design pattern. `isAtTop` keeps the chrome pinned while the
  // user is at the top of the page so they don't see a hide-then-
  // reveal flicker on tiny scroll deltas at rest.
  const { direction: scrollDirection, isAtTop } = useScrollDirection();
  const showFloatingChrome = isAtTop || scrollDirection === "up";

  const { activeVehicle } = useActiveVehicle();
  const activeVehicleClass = activeVehicle ? deriveSizeClassFromLengthInches(activeVehicle.lengthInches) : null;
  // Raw useQuery so vehicleClass lives in the URL; mirrors search.tsx
  // for the same observability reasons (every swap is a visible
  // network request rather than a cache-key trick on the same URL).
  const locationsUrl = `${API_BASE}/api/locations/search${activeVehicleClass ? `?vehicleClass=${activeVehicleClass}` : ""}`;
  const { data, isLoading } = useQuery({
    queryKey: ["/api/locations/search", { vehicleClass: activeVehicleClass ?? "ANY" }],
    queryFn: async () => {
      const r = await fetch(locationsUrl, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
  });
  // All locations are surfaced; we annotate each with a `fitsActiveVehicle`
  // flag so the route planner can render incompatible ones in a grayed
  // unclickable state instead of hiding them. Strict semantics:
  // a missing or empty washBays array means "we couldn't verify",
  // which is treated as incompatible — the prior permissive fallback
  // silently passed every location through as compatible whenever the
  // response shape skipped the field, which is the bug we're closing.
  const allLocations = useMemo(() => {
    const raw = (data?.locations || []) as any[];
    return raw.map((loc: any) => {
      let fits: boolean | null = null;
      if (activeVehicleClass) {
        const bays = loc.washBays;
        if (!Array.isArray(bays) || bays.length === 0) fits = false;
        else fits = bays.some((b: any) => Array.isArray(b.supportedClasses) && b.supportedClasses.includes(activeVehicleClass));
      }
      return { ...loc, fitsActiveVehicle: fits };
    });
  }, [data, activeVehicleClass]);

  useEffect(() => {
    if (geoAttemptedRef.current) return;
    geoAttemptedRef.current = true;

    if (initialOrigin) {
      setGeoStatus("granted");
      return;
    }

    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const areaName = await reverseGeocode(latitude, longitude);
        const myLoc = makeMyLocationOption(latitude, longitude, areaName);
        setOrigin(myLoc);
        setGeoStatus("granted");
      },
      () => {
        setGeoStatus("denied");
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (initialOrigin && initialDest && !autoRoutedRef.current && allLocations.length > 0) {
      autoRoutedRef.current = true;
      (async () => {
        setIsRouting(true);
        try {
          const result = await fetchRoute(initialOrigin, initialDest);
          setRoute(result);
        } catch {}
        setIsRouting(false);
      })();
    }
  }, [allLocations.length]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  // Markers keyed by location.id so the selection effect can find a
  // marker by id without re-running the whole marker effect. The Map
  // is mutated in-place by the marker effect; the selection effect
  // reads it. Endpoints (start / destination / your-location) live
  // separately because they don't participate in selection.
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const endpointsRef = useRef<L.Marker[]>([]);
  // Phase B CP2 — single cluster group instance for the result-
  // location markers. Endpoint markers (start, destination,
  // my-location) stay direct on the map and are never added here.
  // The group is created once and persisted across marker-effect
  // re-runs; `clearLayers()` runs at the top of each re-run before
  // the new markers are added, so re-renders don't accumulate.
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  // Tracks which location id is currently shown on the map so the
  // selection effect doesn't double-open a popup that's already open.
  const openPopupIdRef = useRef<string | null>(null);
  // Ref-shaped selection toggle so Leaflet event handlers attached
  // inside the marker effect (which doesn't re-run on selection) can
  // call the freshest closure rather than capturing a stale snapshot.
  // Same pattern planRouteRef uses below.
  const selectLocationRef = useRef<((id: string) => void) | undefined>(undefined);
  // Memoized "did we already fit-bounds for this route/locations
  // combo?" — drops the marker effect's habit of re-fitting on every
  // re-run (etas, ActiveVehicle pill swaps, etc), which is what made
  // the map yank out from under a user who panned manually.
  const lastFitKeyRef = useRef<string | null>(null);

  const initialLocations = useMemo(() => {
    if (route || !origin) return [];
    return allLocations
      .filter((loc) => loc.latitude != null && loc.longitude != null)
      .map((loc) => {
        const dist = haversineKm(origin.lat, origin.lng, loc.latitude!, loc.longitude!);
        return { ...loc, distanceToRoute: dist, routeProgress: 0, distFromOrigin: dist };
      })
      .filter((loc) => loc.distFromOrigin <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distFromOrigin - b.distFromOrigin);
  }, [route, allLocations, origin?.lat, origin?.lng]);

  const sampledRoutePoints = useMemo(() => {
    if (!route) return [];
    return downsamplePoints(route.points, 200);
  }, [route]);

  const nearbyLocations = useMemo(() => {
    if (!route || sampledRoutePoints.length === 0) return [];
    return allLocations
      .filter((loc) => loc.latitude != null && loc.longitude != null)
      .map((loc) => {
        const { distanceKm, progress } = minDistanceToRouteWithProgress(loc.latitude!, loc.longitude!, sampledRoutePoints);
        const distFromOrigin = origin
          ? haversineKm(origin.lat, origin.lng, loc.latitude!, loc.longitude!)
          : 0;
        return { ...loc, distanceToRoute: distanceKm, routeProgress: progress, distFromOrigin };
      })
      .filter((loc) => loc.distanceToRoute <= ROUTE_CORRIDOR_KM)
      .sort((a, b) => a.distFromOrigin - b.distFromOrigin);
  }, [route, sampledRoutePoints, allLocations, origin?.lat, origin?.lng]);

  const displayLocations = route ? nearbyLocations : initialLocations;

  const etasFetchedForRef = useRef<string>("");
  useEffect(() => {
    if (!origin || displayLocations.length === 0 || geoStatus !== "granted") {
      if (!route) setEtas({});
      return;
    }
    const etaKey = `${origin.lat},${origin.lng}:${displayLocations.length}:${route ? "route" : "nearby"}`;
    if (Object.keys(etas).length > 0 && etasFetchedForRef.current === etaKey) {
      return;
    }
    let cancelled = false;
    etasFetchedForRef.current = etaKey;
    fetchETAsFromOrigin(
      origin.lat,
      origin.lng,
      displayLocations,
      (partial) => {
        if (!cancelled) setEtas(partial);
      }
    ).then((etaResult) => {
      if (!cancelled) {
        setEtas(etaResult);
        if (route && origin && destination) {
          cacheRoute(origin, destination, route, etaResult);
        }
      }
    });
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, displayLocations, geoStatus]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current, {
      center: [42.5, -78],
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      try {
        map.stop();
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
      // Cluster group's lifecycle is bound to the map's — once the
      // map is removed, drop the ref so the next mount creates a
      // fresh group rather than reusing a detached instance.
      clusterGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    // Result-location markers all live in clusterGroupRef. Clear
    // its layers (instead of looping markersByIdRef × removeLayer)
    // so the cluster group's internal state stays consistent.
    if (clusterGroupRef.current) {
      clusterGroupRef.current.clearLayers();
    } else {
      // First mount of the marker effect — create the cluster
      // group, install its iconCreateFunction (per EID §3.5), and
      // add it to the map. Persists across effect re-runs.
      clusterGroupRef.current = L.markerClusterGroup({
        // EID §3.5: cluster at zoom <11; pins within 40px cluster.
        disableClusteringAtZoom: 11,
        maxClusterRadius: 40,
        // Default markercluster animations; explicit so a future
        // tweak is obvious.
        animate: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          // Read the stashed tier off each child marker — set at
          // marker creation below via `(opts as any).washPinTier`.
          // pickHighestTier degrades to 'incompatible' if none are
          // set, which is the safe visual no-op.
          const childMarkers = cluster.getAllChildMarkers();
          const tiers: WashPinTier[] = childMarkers
            .map((m) => (m.options as any).washPinTier)
            .filter((t): t is WashPinTier => !!t);
          const tier = pickHighestTier(tiers);
          const count = cluster.getChildCount();
          const { html, size } = renderWashClusterHtml({ tier, count });
          return L.divIcon({
            className: "",
            html,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
      map.addLayer(clusterGroupRef.current);
    }
    endpointsRef.current.forEach((m) => map.removeLayer(m));
    endpointsRef.current = [];

    if (route && origin && destination) {
      const polyline = L.polyline(route.points, {
        color: "#3b82f6",
        weight: 5,
        opacity: 0.7,
        dashArray: "10,6",
      }).addTo(map);
      routeLayerRef.current = polyline;

      const startMarker = L.marker([origin.lat, origin.lng], { icon: startIcon }).addTo(map);
      const startPopup = L.DomUtil.create("div");
      startPopup.style.cssText = "font-family:system-ui;min-width:120px;";
      const startLabel = L.DomUtil.create("div", "", startPopup);
      startLabel.style.cssText = "font-weight:700;font-size:13px;color:#16a34a;margin-bottom:2px;";
      startLabel.textContent = "START";
      const startName = L.DomUtil.create("div", "", startPopup);
      startName.style.cssText = "font-size:14px;font-weight:600;color:#0f172a;";
      startName.textContent = origin.label;
      startMarker.bindPopup(startPopup, { closeButton: false });

      const endMarker = L.marker([destination.lat, destination.lng], { icon: endIcon }).addTo(map);
      const endPopup = L.DomUtil.create("div");
      endPopup.style.cssText = "font-family:system-ui;min-width:120px;";
      const endLabel = L.DomUtil.create("div", "", endPopup);
      endLabel.style.cssText = "font-weight:700;font-size:13px;color:#dc2626;margin-bottom:2px;";
      endLabel.textContent = "DESTINATION";
      const endName = L.DomUtil.create("div", "", endPopup);
      endName.style.cssText = "font-size:14px;font-weight:600;color:#0f172a;";
      endName.textContent = destination.label;
      endMarker.bindPopup(endPopup, { closeButton: false });

      endpointsRef.current = [startMarker, endMarker];
    } else if (origin && !route) {
      const myMarker = L.marker([origin.lat, origin.lng], { icon: startIcon }).addTo(map);
      const myPopup = L.DomUtil.create("div");
      myPopup.style.cssText = "font-family:system-ui;min-width:120px;";
      const myLabel = L.DomUtil.create("div", "", myPopup);
      myLabel.style.cssText = "font-weight:700;font-size:13px;color:#16a34a;margin-bottom:2px;";
      myLabel.textContent = "YOUR LOCATION";
      const myName = L.DomUtil.create("div", "", myPopup);
      myName.style.cssText = "font-size:14px;font-weight:600;color:#0f172a;";
      myName.textContent = origin.name === "My Location" ? "Current Position" : origin.label;
      myMarker.bindPopup(myPopup, { closeButton: false });
      endpointsRef.current = [myMarker];
    }

    const locsToShow = route ? nearbyLocations : initialLocations;

    locsToShow.forEach((loc, rankIdx) => {
      if (loc.latitude == null || loc.longitude == null) return;
      // Tier classification + glyph drive the icon — wash-pin handles
      // the visual treatment per EID §3.5. The selection effect
      // rebuilds the icon for the selected pin (gold ring); this
      // effect does NOT depend on selection state, which is the
      // load-bearing invariant from Phase A — keeps marker creation
      // out of the selection loop and prevents the "tap → rebuild →
      // popup closes" two-tap bug. Labels deliberately undefined in
      // CP1: nearby-mode labels need the Round 3 service selector to
      // compute price; route-mode labels wait on Round 4's real
      // detour endpoint.
      const incompatible = (loc as any).fitsActiveVehicle === false;
      const tier = classifyPin({
        rankIdx,
        totalRanked: locsToShow.length,
        mode,
        fitsActiveVehicle: !incompatible,
      });
      const icon = buildWashPinDivIcon({ tier, isSelected: false });
      // Stash the tier on marker options so the cluster group's
      // iconCreateFunction can read it without re-deriving.
      // Plugin-pattern type cast — Leaflet's MarkerOptions doesn't
      // formally allow extension without module augmentation.
      const marker = L.marker([loc.latitude, loc.longitude], {
        icon,
        ...({ washPinTier: tier } as Partial<L.MarkerOptions>),
      });
      // Add to cluster group instead of the map directly. The
      // cluster group decides whether to render the marker
      // individually or as part of a cluster bubble based on
      // current zoom + maxClusterRadius.
      clusterGroupRef.current?.addLayer(marker);

      const popup = L.DomUtil.create("div");
      popup.style.cssText = "font-family:system-ui;min-width:220px;max-width:260px;";

      // Title — same weight as list card
      const nameEl = L.DomUtil.create("div", "", popup);
      nameEl.style.cssText = `font-weight:700;font-size:15px;line-height:1.2;color:${incompatible ? "#475569" : "#0f172a"};`;
      nameEl.textContent = loc.name;

      if (incompatible) {
        const badge = L.DomUtil.create("div", "", popup);
        badge.style.cssText = "margin-top:8px;padding:6px 8px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:11px;font-weight:600;color:#92400e;display:flex;align-items:center;gap:4px;";
        badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> No bay fits your active vehicle`;
        const helpEl = L.DomUtil.create("div", "", popup);
        helpEl.style.cssText = "margin-top:6px;font-size:11px;color:#64748b;";
        helpEl.textContent = "Change your active vehicle to book at this location.";
        marker.bindPopup(popup, { closeButton: false });
        markersByIdRef.current.set(loc.id, marker);
        return;
      }

      // Rating · distance · status row — same shape as list card
      const reviewCountP: number = (loc as any).reviewCount ?? 0;
      const averageRatingP: number | null = (loc as any).averageRating ?? null;
      const isOpenP = !!(loc as any).isOpenNow;
      const etaMins = etas[loc.id];
      const distLine = route
        ? `${Math.round((loc as any).distanceToRoute)} km from route`
        : `${Math.round((loc as any).distFromOrigin)} km`;

      const metaEl = L.DomUtil.create("div", "", popup);
      metaEl.style.cssText = "margin-top:6px;font-size:13px;color:#475569;line-height:1.3;";
      const metaParts: string[] = [];
      if (reviewCountP > 0) {
        metaParts.push(`<span style="color:#f59e0b;">★</span> <strong style="color:#334155;">${averageRatingP != null ? averageRatingP.toFixed(1) : "—"}</strong> <span style="color:#94a3b8;">(${reviewCountP})</span>`);
      } else {
        metaParts.push(`<span style="color:#cbd5e1;">☆</span> <span style="color:#94a3b8;">No reviews yet</span>`);
      }
      metaParts.push(`<span style="color:#475569;">${distLine}</span>`);
      if (etaMins != null) metaParts.push(`<span style="color:#475569;">${formatETA(etaMins)} away</span>`);
      metaParts.push(isOpenP
        ? `<span style="color:#059669;font-weight:500;">Open Now</span>`
        : `<span style="color:#94a3b8;font-weight:500;">Closed</span>`);
      metaEl.innerHTML = metaParts.join('<span style="color:#cbd5e1;"> · </span>');

      // Address line (provider + city / region)
      const addrEl = L.DomUtil.create("div", "", popup);
      addrEl.style.cssText = "margin-top:4px;font-size:12px;color:#94a3b8;line-height:1.3;";
      const stateP = (loc as any).stateCode || (loc as any).regionCode || "";
      addrEl.textContent = `${loc.addressLine1 || loc.city}, ${loc.city}${stateP ? `, ${stateP}` : ""}`;

      // From $X — match list card price line
      const minP = (() => {
        const svcs: any[] = loc.services || [];
        if (svcs.length === 0) return null;
        let m = Infinity;
        for (const s of svcs) {
          const p = (s.allInPriceMinor ?? s.basePriceMinor) ?? Infinity;
          if (p < m) m = p;
        }
        return Number.isFinite(m) ? m : null;
      })();
      if (minP != null) {
        const priceEl = L.DomUtil.create("div", "", popup);
        priceEl.style.cssText = "margin-top:6px;font-size:13px;font-weight:600;color:#334155;";
        priceEl.textContent = `From ${formatCurrency(minP)}`;
      }

      // Book a Wash CTA — matches the rebook CTA from 2g-1.5: filled
      // blue, 44px tall, full-width inside the popup.
      const btn = L.DomUtil.create("button", "", popup);
      btn.textContent = "Book a Wash";
      btn.style.cssText = `
        margin-top:10px;padding:10px 16px;width:100%;min-height:40px;
        background:#2563eb;color:white;border:none;border-radius:8px;
        font-size:13px;font-weight:600;cursor:pointer;
      `;
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stopPropagation(e);
        // Inline URL build — buildLocationUrl closure captures stale state in
        // the Leaflet popup effect, so construct directly with current values.
        const qs = new URLSearchParams();
        if (origin && destination) {
          qs.set("ref", "route");
          qs.set("from", serializeCityForUrl(origin));
          qs.set("to", serializeCityForUrl(destination));
        }
        if (origin && geoStatus === "granted") {
          qs.set("ulat", origin.lat.toFixed(4));
          qs.set("ulng", origin.lng.toFixed(4));
        }
        const query = qs.toString();
        setNavLocation(`/location/${loc.id}${query ? `?${query}` : ""}`);
      });

      // autoPanPadding tells Leaflet how much room to keep between the
      // popup's bounding box and the map edges when it auto-pans on
      // open. Default `[5, 5]` is too small — the popup overlapped
      // the zoom controls (Leaflet built-in, top-left, ~30×60) and
      // the custom expand button (top-right, 40×40) on every popup
      // open. [70, 80] leaves enough margin for both control clusters
      // plus a comfortable gutter, and Leaflet pans the map down
      // automatically when the popup would otherwise cross into a
      // control's space. Picked option (a) per spec — the cleanest
      // fix that respects Leaflet's intended behaviour, no z-index
      // shuffling or hide-on-popup logic needed.
      marker.bindPopup(popup, {
        closeButton: false,
        maxWidth: 280,
        autoPan: true,
        autoPanPadding: [70, 80],
      });
      // Pin click is the selection trigger. selectLocation toggles —
      // tapping the same pin a second time deselects, atomically
      // swaps highlight if a different pin is currently selected.
      // No setView / setZoom / fitBounds runs from here; the
      // selection effect handles popup-open, icon swap, and the
      // pan-if-off-screen pan. We attach to `click`, not
      // `popupopen`, because Leaflet's bindPopup fires popupopen
      // both on user click AND on programmatic openPopup() — using
      // popupopen for state writes loops back through the selection
      // effect which then calls openPopup() again.
      marker.on("click", (e) => {
        // L.DomEvent.stopPropagation prevents the map's own click
        // handler from firing, which would otherwise treat this as
        // a tap-on-empty-area and immediately deselect.
        L.DomEvent.stopPropagation(e);
        if (!mountedRef.current) return;
        selectLocationRef.current?.(loc.id);
      });
      markersByIdRef.current.set(loc.id, marker);
    });

    // Initial fit ONLY when the route or the no-route locations set
    // changed since the last fit — gated by a ref so subsequent
    // re-runs of this effect (driven by etas, ActiveVehicle pill
    // swaps, etc) don't yank the map view out from under a user who
    // panned/zoomed manually. The user-reported "zoom out on pin tap"
    // came from this block running on every activePinId change;
    // selection no longer touches this effect's deps.
    const fitKey = route
      ? `route:${origin?.lat},${origin?.lng}->${destination?.lat},${destination?.lng}:n=${nearbyLocations.length}`
      : `nearby:${origin?.lat},${origin?.lng}:n=${initialLocations.length}`;
    if (lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      if (route) {
        const allPoints: L.LatLngExpression[] = [
          ...route.points,
          ...nearbyLocations
            .filter((l) => l.latitude != null && l.longitude != null)
            .map((l) => [l.latitude!, l.longitude!] as L.LatLngExpression),
        ];
        if (allPoints.length > 0) {
          map.fitBounds(L.latLngBounds(allPoints).pad(0.1), { animate: false });
        }
      } else if (origin && locsToShow.length > 0) {
        const allPoints: L.LatLngExpression[] = [
          [origin.lat, origin.lng],
          ...locsToShow
            .filter((l) => l.latitude != null && l.longitude != null)
            .map((l) => [l.latitude!, l.longitude!] as L.LatLngExpression),
        ];
        map.fitBounds(L.latLngBounds(allPoints).pad(0.15), { animate: true });
      } else if (origin) {
        map.setView([origin.lat, origin.lng], 10, { animate: true });
      }
    }
  }, [route, origin, destination, nearbyLocations, initialLocations, setNavLocation, etas]);

  // Build a location detail URL with optional return-to-route + user coords.
  // Uses URLSearchParams so separators (? vs &) are always correct, even when
  // some params are absent (e.g. no destination set yet).
  const buildLocationUrl = (locId: string) => {
    const qs = new URLSearchParams();
    if (origin && destination) {
      qs.set("ref", "route");
      qs.set("from", serializeCityForUrl(origin));
      qs.set("to", serializeCityForUrl(destination));
    }
    if (origin && geoStatus === "granted") {
      qs.set("ulat", origin.lat.toFixed(4));
      qs.set("ulng", origin.lng.toFixed(4));
    }
    const query = qs.toString();
    return `/location/${locId}${query ? `?${query}` : ""}`;
  };

  const routeVersionRef = useRef(0);
  const planRouteRef = useRef<((o: CityOption, d: CityOption) => void) | undefined>(undefined);
  const handlePlanRoute = async (overrideOrigin?: CityOption, overrideDest?: CityOption) => {
    const o = overrideOrigin || origin;
    const d = overrideDest || destination;
    if (!o || !d) return;
    const version = ++routeVersionRef.current;
    setIsRouting(true);
    setRouteError(null);
    try {
      const result = await fetchRoute(o, d);
      if (version !== routeVersionRef.current) return;
      setRoute(result);
      cacheRoute(o, d, result, {});
      const params = new URLSearchParams();
      params.set("from", serializeCityForUrl(o));
      params.set("to", serializeCityForUrl(d));
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } catch {
      if (version !== routeVersionRef.current) return;
      setRouteError("Could not calculate route. Please try different cities.");
    } finally {
      if (version === routeVersionRef.current) setIsRouting(false);
    }
  };
  planRouteRef.current = (o, d) => handlePlanRoute(o, d);

  // Body scroll lock while the map is in fullscreen mode so the page
  // underneath doesn't scroll behind the map. Restored to the prior
  // overflow value on collapse — preserved (not blindly set to "auto")
  // in case some other component sets it for its own reasons.
  useEffect(() => {
    if (!mapExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mapExpanded]);

  // Force a Leaflet `invalidateSize` when the map container resizes
  // between inline and fullscreen — without it the tile layer renders
  // off-position because Leaflet caches the container's dimensions.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const id = window.setTimeout(() => {
      try { map.invalidateSize({ animate: false }); } catch {}
    }, 50);
    return () => window.clearTimeout(id);
  }, [mapExpanded]);

  // Auto-collapse the form when the route resolves so the map gets the
  // primary screen real estate. Re-expanding stays the user's call via
  // the Edit button — we don't auto-expand on every state change.
  useEffect(() => {
    if (route) setFormCollapsed(true);
  }, [route]);

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    setRoute(null);
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // selectLocation toggles: tapping the same id clears (deselect),
  // tapping a different id swaps. The selection effect downstream
  // owns popup-open, icon swap, and pan-if-off-screen — this helper
  // is a pure state writer.
  const selectLocation = (id: string | null) => {
    setSelectedLocationId((prev) => (prev === id ? null : id));
  };
  selectLocationRef.current = (id) => selectLocation(id);

  // Selection effect — derives EVERYTHING visual on the map from
  // selectedLocationId:
  //   - opens popup on the selected marker (or closes if null)
  //   - swaps that marker's icon to the amber active glyph
  //   - reverts the previously-selected marker to its default icon
  //   - pans the map (NO zoom change) only if the selected pin is
  //     currently OFF-screen — already-visible pins produce zero
  //     map movement
  // No setView / setZoom / fitBounds is called here. Pan-if-off-
  // screen uses panTo without a zoom argument, preserving the
  // user's zoom level.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Rebuild every marker's icon in tier-aware form; the selected
    // marker gets `isSelected: true` (gold ring per EID §3.5) and
    // every other marker reverts. Iterating markersByIdRef keeps us
    // in sync with whatever the marker effect last produced. No
    // marker layer teardown — only `setIcon` swaps run here, which
    // is the Phase A invariant Phase B preserves.
    const selLocs = route ? nearbyLocations : initialLocations;
    markersByIdRef.current.forEach((marker, id) => {
      const rankIdx = selLocs.findIndex((l) => l.id === id);
      const loc = rankIdx >= 0 ? selLocs[rankIdx] : null;
      if (!loc) return;
      const fits = (loc as any).fitsActiveVehicle !== false;
      const tier = classifyPin({
        rankIdx,
        totalRanked: selLocs.length,
        mode,
        fitsActiveVehicle: fits,
      });
      // Incompatible pins never get the selected ring — the visual
      // explainer modal handles "you tapped this and it's not
      // bookable" instead.
      marker.setIcon(buildWashPinDivIcon({
        tier,
        isSelected: id === selectedLocationId && fits,
      }));
    });

    if (selectedLocationId == null) {
      if (openPopupIdRef.current != null) {
        try { map.closePopup(); } catch {}
        openPopupIdRef.current = null;
      }
      return;
    }

    const marker = markersByIdRef.current.get(selectedLocationId);
    if (!marker) {
      // Selected id refers to a location not currently on the map —
      // could happen during a route swap. Clear silently.
      if (openPopupIdRef.current != null) {
        try { map.closePopup(); } catch {}
        openPopupIdRef.current = null;
      }
      return;
    }

    // Phase B CP2 — when the selected pin is currently inside a
    // cluster, the marker exists in markersByIdRef but its DOM
    // element isn't on the visible layer yet. zoomToShowLayer
    // expands the cluster (zooms in if needed) and fires the
    // callback with the marker now visible. The popup-open and
    // pan-if-off-screen logic runs from the callback so it
    // operates on the post-expansion state. If the marker is
    // already visible (zoom ≥11 or already in a non-clustered
    // group), zoomToShowLayer's callback fires synchronously.
    const finishSelection = () => {
      if (!mountedRef.current) return;
      if (openPopupIdRef.current !== selectedLocationId) {
        try { marker.openPopup(); } catch {}
        openPopupIdRef.current = selectedLocationId;
      }
      // Pan-if-off-screen — the only map-view change tied to selection.
      // panTo without a zoom argument preserves the user's zoom level.
      try {
        const ll = marker.getLatLng();
        const bounds = map.getBounds();
        if (!bounds.contains(ll)) {
          map.panTo(ll, { animate: true });
        }
      } catch {}
    };

    const cluster = clusterGroupRef.current;
    if (cluster && cluster.hasLayer(marker)) {
      // hasLayer is true whether the marker is rendered individually
      // or hidden inside a cluster — zoomToShowLayer no-ops in the
      // already-visible case (callback fires sync).
      try {
        cluster.zoomToShowLayer(marker, finishSelection);
      } catch {
        // Safety net for the rare race where the cluster group is
        // mid-rebuild — just run the selection logic directly.
        finishSelection();
      }
    } else {
      finishSelection();
    }
  }, [selectedLocationId, route, nearbyLocations, initialLocations, mode]);

  // Tap on empty map area → deselect. Leaflet's 'click' fires only
  // on tap (not drag), and individual marker clicks call
  // L.DomEvent.stopPropagation so they don't bubble here.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handler = () => {
      if (mountedRef.current) setSelectedLocationId(null);
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, []);

  // Reset selection when the underlying location set changes (route
  // swap, vehicle filter swap). Otherwise a stale id could outlive
  // its marker.
  useEffect(() => {
    setSelectedLocationId(null);
  }, [route?.points.length, allLocations.length]);

  // Helpers for the redesigned list card. Mirror Find a Wash so a
  // driver scanning one page reads the other identically (same row
  // layout, same star treatment, same "From $X" line, same incompat
  // badge). Server doesn't expose minimum price; compute from the
  // services array already in the search response.
  const minPriceFor = (loc: any): number | null => {
    const svcs: any[] = loc.services || [];
    if (svcs.length === 0) return null;
    let m = Infinity;
    for (const s of svcs) {
      const p = (s.allInPriceMinor ?? s.basePriceMinor) ?? Infinity;
      if (p < m) m = p;
    }
    return Number.isFinite(m) ? m : null;
  };

  return (
    <div className="space-y-4 pt-14 lg:pt-0">
      {/* Floating top-left button — logomark on top-level entry,
          back chevron when navigated in from another page. Mobile
          only; desktop uses the AppLayout sidebar's branding and
          notification bell. EID §3.1 / §3.8. The 36px circle has
          ~44px effective tap target via the surrounding p-1 span;
          accessibility note about sub-44 visible size is in the
          checkpoint-2 verification §2. */}
      <motion.div
        className="lg:hidden fixed top-4 left-4 z-40 pointer-events-none"
        initial={false}
        animate={{ y: showFloatingChrome ? 0 : -80, opacity: showFloatingChrome ? 1 : 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <button
          type="button"
          onClick={() => {
            if (isDeepEntry) window.history.back();
            // logomark tap is a no-op for now; refresh-to-default
            // semantics land in Phase B per EID §3.8.
          }}
          aria-label={isDeepEntry ? "Back" : "WashBuddy home"}
          aria-hidden={!showFloatingChrome}
          tabIndex={showFloatingChrome ? 0 : -1}
          className="pointer-events-auto h-9 w-9 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center shadow-[0_2px_6px_rgba(15,23,42,0.10)] border border-slate-200/80 hover:bg-white transition-colors"
        >
          {isDeepEntry ? (
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          ) : (
            <Droplets className="h-5 w-5 text-blue-600" />
          )}
        </button>
      </motion.div>

      {/* Floating top-right cluster — interim Phase A placement
          for the bell + hamburger trigger while the AppLayout
          mobile header is suppressed. Hides on scroll-down (Bug B
          / Checkpoint 6) so it doesn't float over result cards
          when the user is reading the list. Phase B integrates
          these into the unified collapsed/expanded header. */}
      <motion.div
        className="lg:hidden fixed top-4 right-4 z-40 flex items-center gap-1 pointer-events-none"
        initial={false}
        animate={{ y: showFloatingChrome ? 0 : -80, opacity: showFloatingChrome ? 1 : 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        aria-hidden={!showFloatingChrome}
      >
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-full shadow-[0_2px_6px_rgba(15,23,42,0.10)] border border-slate-200/80 p-1">
          <NotificationBell />
        </div>
        <button
          type="button"
          onClick={mobileMenu.toggle}
          aria-label={mobileMenu.isOpen ? "Close menu" : "Open menu"}
          tabIndex={showFloatingChrome ? 0 : -1}
          className="pointer-events-auto h-9 w-9 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center shadow-[0_2px_6px_rgba(15,23,42,0.10)] border border-slate-200/80 hover:bg-white transition-colors"
        >
          {mobileMenu.isOpen ? (
            <X className="h-5 w-5 text-slate-700" />
          ) : (
            <Menu className="h-5 w-5 text-slate-700" />
          )}
        </button>
      </motion.div>

      <div className="flex items-center gap-3 max-w-full">
        <div className="min-w-0 max-w-full">
          <ActiveVehiclePill />
        </div>
      </div>

      {/* Slim header — collapsed when a route is planned, full form
          otherwise. Drops the gradient hero + verbose copy ("Plan
          your trip and find wash locations…") that ate ~200px above
          the fold on mobile. */}
      {/* The autocomplete dropdown portals to <body> at z-[1000]
          (Checkpoint 5, Approach A), so neither search Card
          variant needs an elevated stacking context. Reverting
          the Checkpoint 4 `relative z-[1000]` resolves the
          cascade where the Card painted over the notifications
          dropdown, the active vehicle picker, and any other
          fixed-position dropdown opened from outside the Card. */}
      {!formCollapsed || !route ? (
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-end gap-2 sm:gap-3 flex-col sm:flex-row">
            <div className="flex-1 w-full min-w-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">From</label>
              {origin?.name === "My Location" ? (
                <div className="h-12 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center px-3 gap-2">
                  <Crosshair className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-slate-900 text-sm font-medium truncate min-w-0">My Location</span>
                  <button
                    type="button"
                    onClick={() => { setOrigin(null); setRoute(null); }}
                    className="ml-auto text-slate-400 hover:text-slate-700 shrink-0"
                    aria-label="Clear origin"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <CityAutocomplete
                    value={origin}
                    onChange={(c) => {
                      setOrigin(c);
                      setRoute(null);
                      // Symmetric auto-fire with the To field — when
                      // the user picks an origin from autocomplete and
                      // a destination is already set, recompute the
                      // route immediately. setTimeout(0) lets React
                      // commit the setOrigin batch first so
                      // planRouteRef.current reads the freshest closure
                      // (same pattern as the To field below). Free
                      // typing without selecting from autocomplete
                      // does NOT enter this path — onChange only fires
                      // when CityAutocomplete commits a selection
                      // (or null on clear).
                      if (c && destination) {
                        setTimeout(() => planRouteRef.current?.(c, destination), 0);
                      }
                    }}
                    placeholder="Start city..."
                    exclude={destination}
                    userLat={origin?.lat ?? destination?.lat}
                    userLng={origin?.lng ?? destination?.lng}
                  />
                  {!origin && geoStatus !== "unavailable" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (geoStatus === "denied") {
                          setRouteError("Location access was denied. Please enable location in your browser settings.");
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            const { latitude, longitude } = pos.coords;
                            const areaName = await reverseGeocode(latitude, longitude);
                            const myLoc = makeMyLocationOption(latitude, longitude, areaName);
                            setOrigin(myLoc);
                            setGeoStatus("granted");
                            setRoute(null);
                            // Symmetric with From's autocomplete onChange
                            // (2g-2.1 commit 944fb08): when the user
                            // commits a new origin via the geolocation
                            // crosshair AND a destination is already set,
                            // recompute the route immediately. setTimeout(0)
                            // lets React commit the setOrigin batch first
                            // so planRouteRef.current reads the freshest
                            // closure.
                            if (destination) {
                              setTimeout(() => planRouteRef.current?.(myLoc, destination), 0);
                            }
                          },
                          () => {
                            setGeoStatus("denied");
                            setRouteError("Could not access your location. Please enter a city manually.");
                          },
                          { timeout: 8000 }
                        );
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                      title="Use my location"
                      aria-label="Use my current location"
                    >
                      <Crosshair className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSwap}
              className="h-10 w-10 sm:h-10 sm:w-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0 self-end mb-0 sm:mb-1"
              title="Swap"
              aria-label="Swap origin and destination"
            >
              <ArrowRight className="h-4 w-4 text-slate-600 rotate-90 sm:rotate-0" />
            </button>

            <div className="flex-1 w-full min-w-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">To</label>
              <CityAutocomplete
                value={destination}
                onChange={(c) => {
                  setDestination(c);
                  setRoute(null);
                  if (c && origin) {
                    setTimeout(() => planRouteRef.current?.(origin, c), 0);
                  }
                }}
                placeholder="Destination city..."
                exclude={origin}
                userLat={origin?.lat ?? destination?.lat}
                userLng={origin?.lng ?? destination?.lng}
              />
            </div>

            {/* Demoted secondary affordance now that From + To both
                auto-fire planRoute on autocomplete selection. The
                button stays visible for keyboard submitters and for
                users who type free text without picking a suggestion.
                Outline variant + min-h-11 keeps the tap target above
                the 44px iOS floor while reading as quieter than the
                prior filled-primary 48px button. The functional shape
                is unchanged — onClick still wraps in an arrow so the
                MouseEvent fix from 2g-2 (commit 50b4211) holds. */}
            <Button
              variant="outline"
              size="md"
              className="min-h-11 rounded-xl px-5 w-full sm:w-auto shrink-0"
              onClick={() => handlePlanRoute()}
              disabled={!origin || !destination || isRouting}
            >
              {isRouting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Planning...</>
              ) : (
                <><Navigation className="h-4 w-4 mr-2" /> Plan Route</>
              )}
            </Button>
          </div>
          {geoStatus === "pending" && !initialOrigin && (
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Detecting location...
            </div>
          )}
          {routeError && (
            <p className="text-red-600 text-sm">{routeError}</p>
          )}
        </Card>
      ) : (
        // Collapsed summary — shows BOTH from and to (the prior shape
        // hid From in the collapsed state, which left the user
        // wondering "did I plan this trip?"). Edit reopens the full
        // form for changes.
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-1 min-w-0">
              {/* truncate sits on the <p> (block-level) so a long
                  label gets ellipsis. Inner <span>'s `truncate` on
                  inline elements is a no-op — that was the bug
                  where long destinations collided with the Edit
                  button (Checkpoint 5). The outer flex item has
                  min-w-0; Edit button has shrink-0. */}
              <p className="text-xs text-slate-500 leading-tight truncate">
                <span className="font-semibold text-slate-700">From:</span>{" "}
                {origin?.name === "My Location" ? "My Location" : (origin?.label || "—")}
              </p>
              <p className="text-xs text-slate-500 leading-tight mt-0.5 truncate">
                <span className="font-semibold text-slate-700">To:</span>{" "}
                {destination?.label || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormCollapsed(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </Card>
      )}

      {/* Compact metrics strip — single inline row replaces the three
          icon cards. Only shows when a route is planned. */}
      {route && (
        <p className="text-xs sm:text-sm text-slate-600 px-1">
          <span className="font-semibold text-slate-900">{route.distanceKm} km</span>
          <span className="text-slate-300"> · </span>
          <span className="font-semibold text-slate-900">{formatDuration(route.durationMins)}</span>
          <span className="text-slate-300"> · </span>
          <span className="font-semibold text-slate-900">{nearbyLocations.length} stops</span>
        </p>
      )}

      {/* Map — primary surface. Inline ~55vh on mobile so users see
          the route at a glance + scroll the list below. The expand
          button overlays in the top-right; tap to enter fullscreen
          (position:fixed inset-0). Body scroll is locked while
          expanded so the page underneath doesn't scroll. */}
      <div
        className={
          mapExpanded
            ? "fixed inset-0 z-50 bg-white p-2"
            : "relative"
        }
      >
        <div
          ref={mapRef}
          className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm w-full"
          style={{
            height: mapExpanded ? "calc(100vh - 16px)" : "55vh",
            minHeight: mapExpanded ? undefined : "320px",
            maxHeight: mapExpanded ? undefined : "640px",
            zIndex: 0,
          }}
        />
        <button
          type="button"
          onClick={() => setMapExpanded((v) => !v)}
          className="absolute top-3 right-3 z-[401] h-10 w-10 rounded-xl bg-white shadow-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
          aria-label={mapExpanded ? "Collapse map" : "Expand map"}
        >
          {mapExpanded ? <Minimize2 className="h-4 w-4 text-slate-700" /> : <Maximize2 className="h-4 w-4 text-slate-700" />}
        </button>
      </div>

      {/* List of locations. Hidden while map is fullscreen — the
          fullscreen overlay covers the entire viewport, so the list
          would render behind it and waste DOM. */}
      {!mapExpanded && (
        <div className="space-y-3">
          {!route && (
            <p className="text-xs text-slate-500 px-1">
              Enter a destination to see locations along your route.
            </p>
          )}

          {!route && !isRouting && displayLocations.length === 0 && !origin && (
            <Card className="text-center py-12 border-dashed">
              <Route className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                Allow location access to see nearby wash locations, or enter a starting city above.
              </p>
            </Card>
          )}

          {!route && !isRouting && origin && displayLocations.length === 0 && (
            <Card className="text-center py-12 border-dashed">
              <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                No wash locations found within {NEARBY_RADIUS_KM} km. Enter a destination to plan a route.
              </p>
            </Card>
          )}

          {isRouting && (
            <Card className="text-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Calculating route...</p>
            </Card>
          )}

          {route && nearbyLocations.length === 0 && !isRouting && (
            <Card className="text-center py-12 border-dashed">
              <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No wash locations found within {ROUTE_CORRIDOR_KM} km of this route.</p>
            </Card>
          )}

          {displayLocations.length > 0 && !isRouting && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {displayLocations.map((loc, idx) => {
                const incompatible = (loc as any).fitsActiveVehicle === false;
                const minPrice = minPriceFor(loc);
                const reviewCount: number = (loc as any).reviewCount ?? 0;
                const averageRating: number | null = (loc as any).averageRating ?? null;
                const isOpen = !!(loc as any).isOpenNow;
                // Mode-aware metadata. Nearby mode shows miles from
                // me. Route mode shows "detour pending…" until
                // Round 4 wires the real per-location OSRM detour
                // endpoint — the prior numeric placeholder
                // (ETA-from-origin) was actively misleading
                // because real detour means round-trip incremental
                // cost, not time-from-origin. Bug 4 (Checkpoint 4).
                // TODO(round-4): Replace 'detour pending…' with
                // real detour value from
                // POST /api/locations/with-detour-times per EID §5.2.
                const milesFromMe = ((loc as any).distFromOrigin as number) * 0.621371;
                const kmFromRoute = Math.round((loc as any).distanceToRoute as number);
                const isSelected = selectedLocationId === loc.id;

                const card = (
                  <Card
                    className={`flex flex-col border-2 ${
                      incompatible
                        ? "bg-slate-50 border-slate-200 cursor-default"
                        : isSelected
                          ? "border-amber-400 bg-amber-50/40 cursor-pointer"
                          : "group cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
                    }`}
                    title={incompatible ? "Change your active vehicle to book at this location" : undefined}
                  >
                    <div className="p-4 sm:p-5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-base sm:text-lg font-bold leading-tight truncate ${incompatible ? "text-slate-500" : "text-slate-900"}`}>{loc.name}</h3>
                        {/* Chevron is the booking-navigation affordance now.
                            Card body tap selects on map; chevron tap
                            navigates to /location/:id. p-3 makes the tap
                            target 44px square (h-5 icon + 12px padding
                            each side) — clears the iOS minimum. -mr-2
                            -mt-2 visually pulls the bigger tap area
                            back into the card padding box so it doesn't
                            push the title. */}
                        {!incompatible && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNavLocation(buildLocationUrl(loc.id)); }}
                            className="shrink-0 -mr-2 -mt-2 p-3 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
                            aria-label={`Book at ${loc.name}`}
                            title="Book at this location"
                          >
                            <ArrowRight className="h-5 w-5" />
                          </button>
                        )}
                      </div>

                      {incompatible ? (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-xs font-medium">
                          No bay fits your active vehicle
                        </div>
                      ) : (
                        <>
                          {/* Rating · distance · status — same line
                              shape as Find a Wash. flex-wrap so a long
                              translated string breaks cleanly at
                              narrow widths. */}
                          <p className="text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                            {reviewCount > 0 ? (
                              <span className="inline-flex items-center gap-1 shrink-0">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span className="font-semibold text-slate-700">{averageRating != null ? averageRating.toFixed(1) : "—"}</span>
                                <span className="text-slate-400">({reviewCount})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 shrink-0 text-slate-400">
                                <Star className="h-3.5 w-3.5 text-slate-300" />
                                No reviews yet
                              </span>
                            )}
                            <span className="text-slate-300">·</span>
                            {mode === "route" ? (
                              <>
                                <span className="shrink-0 text-slate-400">detour pending…</span>
                                <span className="text-slate-300">·</span>
                                <span className="shrink-0">{kmFromRoute} km from route</span>
                              </>
                            ) : (
                              <span className="shrink-0">{milesFromMe.toFixed(1)} mi</span>
                            )}
                            <span className="text-slate-300">·</span>
                            {isOpen ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium shrink-0">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Open Now
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium shrink-0">Closed</span>
                            )}
                          </p>

                          <p className="text-sm text-slate-500 flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{loc.addressLine1 ? `${loc.addressLine1}, ` : ""}{loc.city}, {(loc as any).stateCode || (loc as any).regionCode}{loc.postalCode ? ` ${loc.postalCode}` : ""}</span>
                          </p>

                          {minPrice != null && (
                            <p className="text-sm font-semibold text-slate-700">From {formatCurrency(minPrice)}</p>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                );

                return (
                  <motion.div
                    key={loc.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                  >
                    {incompatible ? (
                      <div className="block">{card}</div>
                    ) : (
                      // Card body tap = select on map (popup, highlight,
                      // pan-if-off-screen). The chevron inside the card
                      // is the booking affordance and stops propagation
                      // so it doesn't reach this onClick. role="button" +
                      // a keyboard handler so keyboard users can still
                      // select with Enter or Space — no longer a Link.
                      <div
                        role="button"
                        tabIndex={0}
                        className="block text-left w-full"
                        onClick={() => selectLocation(loc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectLocation(loc.id);
                          }
                        }}
                      >
                        {card}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
