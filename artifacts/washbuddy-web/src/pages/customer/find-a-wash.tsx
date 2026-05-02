import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "";
import { Input, Button } from "@/components/ui";
import { MapPin, Navigation, ArrowRight, X, Loader2, Crosshair, Maximize2, Minimize2, ArrowLeft, Menu, Droplets, Building2, Landmark, Search } from "lucide-react";
import { useLocation } from "wouter";
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
import { getInBoundsRatio } from "@/lib/map-bounds";
import { normalizeLocationsResponse } from "@/lib/normalize-location";
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
import { FindAWashHeader } from "@/components/customer/find-a-wash-header";
import { FilterChips } from "@/components/customer/filter-chips";
import {
  ActiveFilterPills,
  derivePillsFromSheetFilters,
} from "@/components/customer/active-filter-pills";
import { ServicePickerSheet } from "@/components/customer/service-picker-sheet";
import { AllFiltersSheet } from "@/components/customer/all-filters-sheet";
import { SearchBottomSheet } from "@/components/customer/search-bottom-sheet";
import { ResultCard, type CardServicePill } from "@/components/customer/result-card";
import { PinCallout } from "@/components/customer/pin-callout";
import {
  filterUIReducer,
  initialFilterState,
  passesAllSheetFilters,
  matchesAllSelectedServices,
  deriveCategoryCounts,
  countActiveSheetFilters,
  CATEGORY_DISPLAY_NAMES,
  type SheetFilters,
  type SortBy,
  type ServiceCategory,
} from "@/lib/filter-state";
import { scoreAndSort, applyDirectSort } from "@/lib/sort-scoring";

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
 * Soft viewbox bias for Nominatim. Â±5Â° around the user's position
 * is roughly a 500km box at temperate latitudes â€” enough to bias
 * toward "this side of the continent" without being so tight that
 * cross-region searches (Toronto user â†’ NYC's Central Park) fail
 * to surface. We pass it without `bounded=1`, so it's a ranking
 * hint, not a hard filter. Tunable: Â±10Â° if post-launch search
 * quality issues surface.
 */
function bboxAround(lat: number, lng: number, deg = 5): string {
  // Nominatim viewbox order: <x1>,<y1>,<x2>,<y2> = west,north,east,south.
  return `${lng - deg},${lat + deg},${lng + deg},${lat - deg}`;
}

/**
 * Freeform Nominatim search. Bug 2 fix (Checkpoint 4) â€” drops the
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
          // when Nominatim returns one alongside the POI â€” the
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
        // Generic fallback â€” region/landmark without a clean
        // address shape. Use Nominatim's display_name truncated to
        // its first three components (full strings can run a
        // dozen levels deep â€” country + admin + locality + ...).
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
  // granted), forwarded to Nominatim as a soft viewbox bias â€”
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
  // The dropdown is portaled to <body> (Checkpoint 5, Approach A â€”
  // resolves the cascading z-index regressions from Checkpoint 4)
  // so it lives outside the search Card's stacking context entirely
  // and reliably clears Leaflet's panes at every viewport. This ref
  // is the click-outside companion to containerRef â€” without it the
  // mousedown handler would fire on every click inside the dropdown
  // and close it on selection.
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portaled dropdown's pixel-precise position. Computed from the
  // input's getBoundingClientRect when the dropdown opens, and
  // re-computed on scroll/resize while open. `null` when the
  // dropdown isn't mounted â€” guards against rendering at (0,0)
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
            // existing destination), the prior `value` is still set â€”
            // the dropdown gate `!value && query.length >= 2` would
            // suppress suggestions even though the typed text no
            // longer matches the committed label. Clear `value` via
            // the parent's onChange the moment the typed text diverges
            // from the committed label so the suggestions render
            // cleanly. This is what "edit-to-replace" means in any
            // typeahead â€” the prior selection isn't valid anymore.
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
      {/* Portaled dropdown (Checkpoint 5, Approach A) â€” renders
          into <body> via createPortal so it lives outside the
          search Card's stacking context and clears Leaflet's
          panes (200â€“700) at all viewports without the parent
          Card needing an elevated z-index. AnimatePresence wraps
          the portal call so framer-motion's exit animation still
          runs on close. Position is `position:fixed` at the
          coordinates computed from the input's bounding rect,
          tracked via the scroll/resize listeners above.
          TODO(round-3+): formalize a `--z-search-dropdown` CSS
          variable per EID Â§3.2 z-index hierarchy. */}
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
 * component (Phase B Checkpoint 1, EID Â§3.5; CP1.6 spec correction
 * dropped per-category glyphs). The wash-pin module stays
 * Leaflet-free; this thin host helper bridges the rendered HTML
 * into Leaflet's `divIcon` API.
 *
 * Replaces the previous `locationIcon`, `activeLocationIcon`, and
 * `incompatibleLocationIcon` constants â€” those collapsed three
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
  // â€” even if our primary regex didn't match. Strip it.
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
  // the label before storing it in state â€” Bug A / Checkpoint 6.
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
 * /find-a-wash â€” merged search and discovery page.
 *
 * Phase A clone of route-planner.tsx (Round 1 of the search-and-
 * discovery overhaul). Same routing/ETA/pin/popup machinery as the
 * legacy page; the only behavioral differences in this phase are
 * mode-aware bits â€” distance metric on cards (miles in nearby vs
 * placeholder detour time in route mode) and a centralized `mode`
 * derivation downstream code reads instead of re-checking
 * `destination`.
 *
 * Bottom sheet, new pin component (`wash-pin.tsx`), clustering, and
 * the search-this-area button land in Phase B (Round 2). The
 * full collapsedâ†”expanded header animation per EID Â§3.1 is also
 * Phase B; Phase A keeps the existing route-planner header.
 *
 * Free-text city search (matchesSearch / metro aliases) lives in
 * `lib/search-helpers.ts` for Phase B's unified search pill â€” not
 * yet wired to a UI element on this page.
 *
 * Real per-location OSRM detour times land in Round 4. Until then,
 * route-mode cards show `+~{etaFromOrigin} min detour` with the `~`
 * prefix indicating placeholder per EID Â§3.7 fallback semantics.
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
  // aren't aborted â€” without the ref they'd setState after unmount and
  // produce a console warning during fast navigations.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // UI state for the redesigned shell. mapExpanded toggles the map
  // between its inline ~55vh shape and a full-viewport overlay; the
  // overlay uses position:fixed and locks body scroll.
  // selectedLocationId is the SINGLE source of truth for "which
  // location is the user looking at right now" â€” pin highlight,
  // popup-open state, and card highlight all derive from it. Any
  // tap that selects (pin, card body) writes here; any tap that
  // deselects (same pin, same card, empty map) clears it.
  // formCollapsed defaults to "collapse the From/To form when a
  // route is already planned" â€” less duplicate header weight on a
  // long scroll. The driver hits Edit to expand it again.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(!!cached);
  // Pin callout container-pixel position. Recomputed by an effect
  // below on selection change AND on map move/zoom â€” without the
  // moveend hookup, panning would leave the callout floating in the
  // wrong spot relative to its pin.
  const [pinCalloutPos, setPinCalloutPos] = useState<{ x: number; y: number } | null>(null);

  // Filter + UI state (Round 2+3 consolidation). The reducer owns
  // service-category selection, sheet filters, sort, sheet state
  // (peek/default/expanded), and modal open state. Origin/dest/route
  // stay in useState above â€” they have async-fetch dependencies
  // that don't belong in the reducer per the audit decision.
  // Mode default for sheet: route mode â†’ peek (map primary), nearby
  // mode â†’ default (~50% â€” list shares prominence with map).
  const [filterUI, dispatchFilter] = useReducer(
    filterUIReducer,
    destination ? "peek" : "default",
    initialFilterState,
  );

  // Mode default for sheet state changes when destination changes â€”
  // unless the user has manually overridden, in which case we
  // preserve their intent. EID Â§3.3.
  useEffect(() => {
    dispatchFilter({
      type: "RESET_SHEET_STATE_TO_MODE_DEFAULT",
      modeDefault: destination ? "peek" : "default",
    });
  }, [destination?.lat, destination?.lng]);

  // Mode is derived from a single source: whether a destination is
  // set. Drives sort default, distance metric on cards, and (in
  // Phase B+) header presentation and time-selector visibility.
  // Centralized so downstream JSX and effects read `mode` rather
  // than re-checking `destination` themselves.
  const mode: "nearby" | "route" = destination ? "route" : "nearby";

  // The AppLayout mobile header is suppressed on this page (per
  // EID Â§3.1). The hamburger trigger we render in the floating
  // top-right cluster controls the same shared dropdown via
  // context. Phase B replaces this interim cluster with the
  // unified collapsed/expanded header.
  const mobileMenu = useMobileMenu();

  // Top-level vs deep entry â€” drives the floating top-left
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
  // the map and reveal on scroll-up â€” Pinterest / Material
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
      // Coerce Prisma Decimal-as-string lat/lng â†’ number at the
      // boundary. Without this, leaflet.markercluster's bounds
      // aggregation recurses into a stack overflow when constructing
      // LatLngBounds from ["43.62", "-79.51"] entries â€” see the
      // Phase B Hotfix section of round-1-phase-b-handoff.md.
      return normalizeLocationsResponse(await r.json());
    },
    staleTime: 60_000,
  });
  // All locations are surfaced; we annotate each with a `fitsActiveVehicle`
  // flag so the route planner can render incompatible ones in a grayed
  // unclickable state instead of hiding them. Strict semantics:
  // a missing or empty washBays array means "we couldn't verify",
  // which is treated as incompatible â€” the prior permissive fallback
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
  // Phase B CP2 â€” single cluster group instance for the result-
  // location markers. Endpoint markers (start, destination,
  // my-location) stay direct on the map and are never added here.
  // The group is created once and persisted across marker-effect
  // re-runs; `clearLayers()` runs at the top of each re-run before
  // the new markers are added, so re-renders don't accumulate.
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  // Phase B CP3 v3 â€” scroll target for the bottom-sheet list. The
  // scroll-to-top effect (below) brings this element into view on
  // searchBoundsAnchor change so the user actually sees the list
  // re-order. CP4's bottom-sheet rebuild will replace the
  // mechanism (a contained scroll container with its own ref)
  // while preserving the user-visible behavior.
  const listAnchorRef = useRef<HTMLDivElement | null>(null);
  // Tracks which location id is currently shown on the map so the
  // selection effect doesn't double-open a popup that's already open.
  const openPopupIdRef = useRef<string | null>(null);
  // Ref-shaped selection toggle so Leaflet event handlers attached
  // inside the marker effect (which doesn't re-run on selection) can
  // call the freshest closure rather than capturing a stale snapshot.
  // Same pattern planRouteRef uses below.
  const selectLocationRef = useRef<((id: string) => void) | undefined>(undefined);
  // Memoized "did we already fit-bounds for this route/locations
  // combo?" â€” drops the marker effect's habit of re-fitting on every
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

  // Phase B CP3 v3 â€” "Search this area" is **list-reorder-only**.
  // Tapping the button sets searchBoundsAnchor to the current map
  // bounds; rankedLocations sorts the bottom-sheet list by
  // distance from the bounds center; the list scrolls to top so
  // the new ordering is visible. **Pin colors and cluster colors
  // do not change.** No map repaint at all.
  //
  // History: CP3 v1 (a6ee2b9) implemented as a filter â€” pins
  // outside bounds disappeared. CP3 v2 (27fd83b) re-implemented
  // as a re-rank that *also* repainted pins (pins outside bounds
  // dimmed gray, top-tier promoted "best of what's left"). CP3 v2
  // Hotfix (9514e6a) gated the repaint behind explicit anchor.
  // Each attempt failed because the user mental model treats
  // viewport context as a list-ordering hint, not a map-repainting
  // trigger. CP3 v3 removes all bounds-context tier classification:
  // pin tier is filter-relevance-driven (Round 3 territory) and
  // vehicle-compatibility-driven (today). Bounds context affects
  // list ordering only.
  //
  // searchBoundsAnchor: null when no anchor is set (default mode);
  // tuple `[[s, w], [n, e]]` once the user has tapped the button.
  const [searchBoundsAnchor, setSearchBoundsAnchor] = useState<L.LatLngBoundsLiteral | null>(null);

  // Track in-bounds fraction of the currently-displayed locations.
  // Updated by the moveend/zoomend listeners below (debounced 200ms)
  // and by displayLocations changes. The button is shown when this
  // drops below 0.5 â€” i.e. fewer than half of the result list is
  // visible on screen, signalling that the map and the list disagree.
  const [inBoundsRatio, setInBoundsRatio] = useState(1);

  // CP3 v2: displayLocations is the canonical render set â€” full
  // route/nearby base list, no bounds filter. Re-ranking under
  // search-this-area happens in `rankedLocations` below.
  const displayLocations = useMemo(() => {
    return route ? nearbyLocations : initialLocations;
  }, [route, nearbyLocations, initialLocations]);

  // Phase B CP3 v2 â€” re-rank when the user has anchored the
  // search to a map area. Sort by haversine distance from the
  // bounds center; stable ordering preserves origin-distance ties.
  // When searchBoundsAnchor is null, this is identity over
  // displayLocations and the existing distFromOrigin order
  // (baked into nearbyLocations / initialLocations) drives
  // rankIdx in the marker effect. Tap-locked re-ranking â€” the
  // marker effect doesn't depend on a moveend/zoomend counter, so
  // panning after tapping doesn't reshuffle tiers; the bounds
  // anchor is the user's "rank from here" gesture.
  const rankedLocations = useMemo(() => {
    if (!searchBoundsAnchor) return displayLocations;
    const [[south, west], [north, east]] = searchBoundsAnchor;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    return [...displayLocations].sort((a, b) => {
      const aDist = a.latitude != null && a.longitude != null
        ? haversineKm(centerLat, centerLng, a.latitude, a.longitude)
        : Infinity;
      const bDist = b.latitude != null && b.longitude != null
        ? haversineKm(centerLat, centerLng, b.latitude, b.longitude)
        : Infinity;
      return aDist - bDist;
    });
  }, [displayLocations, searchBoundsAnchor]);

  // Phase B CP3 v2 hotfix â€” empty-area state. When the user has
  // anchored to a region with zero providers in bounds, surface a
  // pill in the result-list area with a "Show closest â†’" recovery
  // CTA. Per EID Â§3.2 empty-area state spec.
  //
  // boundsCenter is derived from searchBoundsAnchor (null when no
  // anchor is set; tuple `[lat, lng]` when set). closestProvider
  // walks displayLocations once to find the min-haversine
  // candidate. inBoundsCount counts how many providers actually
  // fall inside the anchored bounds. Only the trio matters when
  // searchBoundsAnchor is set; in default mode each derivation
  // short-circuits to null/0 and the pill doesn't render.
  const boundsCenter = useMemo<[number, number] | null>(() => {
    if (!searchBoundsAnchor) return null;
    const [[south, west], [north, east]] = searchBoundsAnchor;
    return [(south + north) / 2, (west + east) / 2];
  }, [searchBoundsAnchor]);

  const inBoundsCount = useMemo(() => {
    if (!searchBoundsAnchor) return 0;
    const [[south, west], [north, east]] = searchBoundsAnchor;
    let count = 0;
    for (const l of displayLocations) {
      if (l.latitude == null || l.longitude == null) continue;
      if (l.latitude >= south && l.latitude <= north && l.longitude >= west && l.longitude <= east) count++;
    }
    return count;
  }, [displayLocations, searchBoundsAnchor]);

  const closestProvider = useMemo(() => {
    if (!boundsCenter) return null;
    const [centerLat, centerLng] = boundsCenter;
    let best: { loc: any; distKm: number } | null = null;
    for (const loc of displayLocations) {
      if (loc.latitude == null || loc.longitude == null) continue;
      const distKm = haversineKm(centerLat, centerLng, loc.latitude, loc.longitude);
      if (best === null || distKm < best.distKm) {
        best = { loc, distKm };
      }
    }
    return best;
  }, [displayLocations, boundsCenter]);

  // Empty-area pill is visible when the user has anchored AND zero
  // providers fall inside the anchored bounds. Closing the pill
  // happens via "Show closest â†’" tap (handleShowClosest below) or
  // any context change that clears searchBoundsAnchor.
  const showEmptyAreaPill = searchBoundsAnchor !== null && inBoundsCount === 0 && closestProvider !== null;

  // Origin / destination / route changes reset the search-this-area
  // anchor â€” switching context means the user is no longer asking
  // about that specific map region. searchBoundsAnchor is null on
  // the initial render, so this is a no-op until the first toggle.
  useEffect(() => {
    setSearchBoundsAnchor(null);
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, route]);

  // Phase B CP3 v3 â€” scroll the bottom-sheet list into view on
  // searchBoundsAnchor transitions so the user sees the new
  // ordering. Fires on null â†’ set ("Search this area" tap),
  // set â†’ set (re-tap in a different region), and set â†’ null
  // (anchor cleared by context change or "Show closest â†’"). The
  // initial-mount transition (undefined â†’ null on the first
  // render) doesn't fire because hasMountedRef gates the effect.
  // CP4's bottom-sheet rebuild will replace window.scrollTo with
  // a contained scroll container.
  const hasScrollMountedRef = useRef(false);
  useEffect(() => {
    if (!hasScrollMountedRef.current) {
      hasScrollMountedRef.current = true;
      return;
    }
    const target = listAnchorRef.current;
    if (!target) return;
    try {
      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } catch {}
  }, [searchBoundsAnchor]);

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
      // Cluster group's lifecycle is bound to the map's â€” once the
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
    // its layers (instead of looping markersByIdRef Ã— removeLayer)
    // so the cluster group's internal state stays consistent.
    if (clusterGroupRef.current) {
      clusterGroupRef.current.clearLayers();
    } else {
      // First mount of the marker effect â€” create the cluster
      // group, install its iconCreateFunction (per EID Â§3.5), and
      // add it to the map. Persists across effect re-runs.
      clusterGroupRef.current = L.markerClusterGroup({
        // EID Â§3.5: cluster at zoom <11; pins within 40px cluster.
        disableClusteringAtZoom: 11,
        maxClusterRadius: 40,
        // Default markercluster animations; explicit so a future
        // tweak is obvious.
        animate: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          // Read the stashed tier off each child marker â€” set at
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
      const endMarker = L.marker([destination.lat, destination.lng], { icon: endIcon }).addTo(map);
      endpointsRef.current = [startMarker, endMarker];
    } else if (origin && !route) {
      const myMarker = L.marker([origin.lat, origin.lng], { icon: startIcon }).addTo(map);
      endpointsRef.current = [myMarker];
    }

    // CP3 v3: marker layer iterates displayLocations, NOT
    // rankedLocations. Marker tier is filter-relevance-driven
    // (Round 3 territory) and vehicle-compatibility-driven (today),
    // never bounds-context-driven. Using displayLocations stabilizes
    // marker creation against searchBoundsAnchor changes â€” the
    // marker effect doesn't re-fire on tap, only the list renders
    // re-order. rankedLocations is consumed by the list render
    // (line ~2287) where ordering is the meaningful response.
    const locsToShow = displayLocations;

    locsToShow.forEach((loc, rankIdx) => {
      if (loc.latitude == null || loc.longitude == null) return;
      // Tier classification + glyph drive the icon â€” wash-pin handles
      // the visual treatment per EID Â§3.5. The selection effect
      // rebuilds the icon for the selected pin (gold ring); this
      // effect does NOT depend on selection state, which is the
      // load-bearing invariant from Phase A â€” keeps marker creation
      // out of the selection loop and prevents the "tap â†’ rebuild â†’
      // popup closes" two-tap bug. Labels deliberately undefined in
      // CP1: nearby-mode labels need the Round 3 service selector to
      // compute price; route-mode labels wait on Round 4's real
      // detour endpoint.
      const incompatible = (loc as any).fitsActiveVehicle === false;
      // CP3 v3: classifier no longer consumes inVisibleBounds; the
      // rule was removed (see EID Â§3.5 "Why inVisibleBounds is
      // reserved-but-unused"). rankIdx/totalRanked are kept
      // forward-compat in the signature for Round 3's filter-match-
      // strength scoring; today they don't drive tier selection.
      const tier = classifyPin({
        rankIdx,
        totalRanked: locsToShow.length,
        mode,
        fitsActiveVehicle: !incompatible,
      });
      const icon = buildWashPinDivIcon({ tier, isSelected: false });
      // Stash the tier on marker options so the cluster group's
      // iconCreateFunction can read it without re-deriving.
      // Plugin-pattern type cast â€” Leaflet's MarkerOptions doesn't
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

      // Round 2+3 consolidation â€” replaced bindPopup with the
      // PinCallout component (EID Â§3.6). The marker stays clickable
      // for compatible pins; selection drives the PinCallout overlay
      // rendered above the map. Incompatible pins don't get a click
      // handler â€” taps fall through and the global map click clears
      // selection. (Round 5 may reintroduce an incompatible-pin
      // explainer modal per EID Â§3.4 demoted-state spec.)
      if (!incompatible) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (!mountedRef.current) return;
          selectLocationRef.current?.(loc.id);
        });
      }
      markersByIdRef.current.set(loc.id, marker);
    });

    // Initial fit ONLY when the route or the no-route locations set
    // changed since the last fit â€” gated by a ref so subsequent
    // re-runs of this effect (driven by etas, ActiveVehicle pill
    // swaps, etc) don't yank the map view out from under a user who
    // panned/zoomed manually. The user-reported "zoom out on pin tap"
    // came from this block running on every activePinId change;
    // selection no longer touches this effect's deps.
    // Phase B CP3 â€” search-this-area mode uses its own fitKey so the
    // gate skips the fitBounds branch when the user just tapped the
    // button. The handler pre-sets lastFitKeyRef.current to this
    // same value so the marker effect's gate detects "already
    // fitted" and leaves the user's current view alone.
    const fitKey = searchBoundsAnchor
      ? `search-this-area:${searchBoundsAnchor[0][0]},${searchBoundsAnchor[0][1]},${searchBoundsAnchor[1][0]},${searchBoundsAnchor[1][1]}`
      : route
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
  }, [route, origin, destination, nearbyLocations, initialLocations, displayLocations, setNavLocation, etas]);

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
  // overflow value on collapse â€” preserved (not blindly set to "auto")
  // in case some other component sets it for its own reasons.
  useEffect(() => {
    if (!mapExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mapExpanded]);

  // Force a Leaflet `invalidateSize` when the map container resizes
  // between inline and fullscreen â€” without it the tile layer renders
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
  // the Edit button â€” we don't auto-expand on every state change.
  useEffect(() => {
    if (route) setFormCollapsed(true);
  }, [route]);

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    setRoute(null);
  };

  // Phase B CP3 â€” recompute the in-bounds ratio whenever the user
  // pans/zooms the map or the result set changes. Debounced 200ms
  // so a held drag doesn't flicker the button. The ratio drives
  // the floating "Search this area" button's visibility (showing
  // when fewer than half of currently-listed locations are in the
  // visible bounds â€” i.e. the map and the list disagree).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!mountedRef.current) return;
        const points = displayLocations
          .filter((l) => l.latitude != null && l.longitude != null)
          .map((l) => ({ lat: l.latitude as number, lng: l.longitude as number }));
        setInBoundsRatio(getInBoundsRatio(points, map.getBounds()));
      }, 200);
    };
    recompute();
    map.on("moveend", recompute);
    map.on("zoomend", recompute);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      map.off("moveend", recompute);
      map.off("zoomend", recompute);
    };
  }, [displayLocations]);

  // Phase B CP3 â€” "Search this area" tap. Shifts the client-side
  // result anchor from origin/route â†’ current map bounds. The
  // marker effect re-runs against the new displayLocations and
  // the cluster group rebuilds; the user's view stays put because
  // we pre-set lastFitKeyRef to the search-this-area key (the
  // marker effect's gate sees "already fitted" and skips its
  // fitBounds branch). No new server query â€” backend already
  // returned the full visible-providers set in the initial query.
  const handleSearchThisArea = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    lastFitKeyRef.current = `search-this-area:${south},${west},${north},${east}`;
    setSearchBoundsAnchor([
      [south, west],
      [north, east],
    ]);
  };

  // Phase B CP3 v3 â€” empty-area "Show closest â†’" recovery now
  // **zooms-and-centers** at zoom 13. Earlier hotfix used
  // panTo-only, which left the closest provider visible but
  // sometimes buried at the edge of a too-zoomed-out viewport.
  // Zoom 13 surfaces the provider with surrounding neighborhood
  // context. Anchor clears, pill dismisses, selection state
  // untouched.
  const handleShowClosest = () => {
    const map = mapInstanceRef.current;
    if (!map || !closestProvider) return;
    const { loc } = closestProvider;
    if (loc.latitude == null || loc.longitude == null) return;
    setSearchBoundsAnchor(null);
    try {
      map.setView([loc.latitude, loc.longitude], 13, { animate: true });
    } catch {}
  };

  // Button visibility â€” hidden when the result list and map agree,
  // or when there are no results to argue about. Empty-list guard
  // mirrors the helper's empty-input sentinel for clarity at the
  // call site.
  const showSearchAreaButton = displayLocations.length > 0 && inBoundsRatio < 0.5;

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // selectLocation toggles: tapping the same id clears (deselect),
  // tapping a different id swaps. The selection effect downstream
  // owns popup-open, icon swap, and pan-if-off-screen â€” this helper
  // is a pure state writer.
  const selectLocation = (id: string | null) => {
    setSelectedLocationId((prev) => (prev === id ? null : id));
  };
  selectLocationRef.current = (id) => selectLocation(id);

  // Selection effect â€” derives EVERYTHING visual on the map from
  // selectedLocationId:
  //   - opens popup on the selected marker (or closes if null)
  //   - swaps that marker's icon to the amber active glyph
  //   - reverts the previously-selected marker to its default icon
  //   - pans the map (NO zoom change) only if the selected pin is
  //     currently OFF-screen â€” already-visible pins produce zero
  //     map movement
  // No setView / setZoom / fitBounds is called here. Pan-if-off-
  // screen uses panTo without a zoom argument, preserving the
  // user's zoom level.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Rebuild every marker's icon in tier-aware form; the selected
    // marker gets `isSelected: true` (gold ring per EID Â§3.5) and
    // every other marker reverts. Iterating markersByIdRef keeps us
    // in sync with whatever the marker effect last produced. No
    // marker layer teardown â€” only `setIcon` swaps run here, which
    // is the Phase A invariant Phase B preserves.
    // CP3 v3: selection-effect classification mirrors marker
    // creation â€” vehicle-compat-only tier, no bounds context.
    // selLocs uses displayLocations (not rankedLocations) so
    // selection-time rank input is stable across "Search this
    // area" taps. The bottom-sheet list re-orders independently
    // via the rankedLocations consumer at line ~2287.
    const selLocs = displayLocations;
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
      // Incompatible pins never get the selected ring â€” the visual
      // explainer modal handles "you tapped this and it's not
      // bookable" instead.
      marker.setIcon(buildWashPinDivIcon({
        tier,
        isSelected: id === selectedLocationId && fits,
      }));
    });

    if (selectedLocationId == null) {
      openPopupIdRef.current = null;
      return;
    }

    const marker = markersByIdRef.current.get(selectedLocationId);
    if (!marker) {
      // Selected id refers to a location not currently on the map â€”
      // could happen during a route swap. Clear silently.
      openPopupIdRef.current = null;
      return;
    }

    // Phase B CP2 â€” when the selected pin is currently inside a
    // cluster, the marker exists in markersByIdRef but its DOM
    // element isn't on the visible layer yet. zoomToShowLayer
    // expands the cluster (zooms in if needed) and fires the
    // callback with the marker now visible. The pan-if-off-screen
    // logic runs from the callback so it operates on the post-
    // expansion state. PinCallout (Round 2+3) renders separately
    // off selectedLocationId; this effect drives icon swap +
    // map pan only.
    const finishSelection = () => {
      if (!mountedRef.current) return;
      openPopupIdRef.current = selectedLocationId;
      // Pan-if-off-screen â€” the only map-view change tied to selection.
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
      // or hidden inside a cluster â€” zoomToShowLayer no-ops in the
      // already-visible case (callback fires sync).
      try {
        cluster.zoomToShowLayer(marker, finishSelection);
      } catch {
        // Safety net for the rare race where the cluster group is
        // mid-rebuild â€” just run the selection logic directly.
        finishSelection();
      }
    } else {
      finishSelection();
    }
  }, [selectedLocationId, displayLocations, mode]);

  // PinCallout position tracking (Round 2+3). When selectedLocationId
  // is set, recompute the container-pixel position of the pin tip
  // each render AND on every map move/zoom so the callout stays
  // pinned to its pin. When selection clears, hide the callout.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      setPinCalloutPos(null);
      return;
    }
    if (!selectedLocationId) {
      setPinCalloutPos(null);
      return;
    }
    const marker = markersByIdRef.current.get(selectedLocationId);
    if (!marker) {
      setPinCalloutPos(null);
      return;
    }
    const recompute = () => {
      try {
        const ll = marker.getLatLng();
        const pt = map.latLngToContainerPoint(ll);
        setPinCalloutPos({ x: pt.x, y: pt.y });
      } catch {
        setPinCalloutPos(null);
      }
    };
    recompute();
    map.on("move", recompute);
    map.on("zoom", recompute);
    return () => {
      map.off("move", recompute);
      map.off("zoom", recompute);
    };
  }, [selectedLocationId, displayLocations]);

  // Tap on empty map area â†’ deselect. Leaflet's 'click' fires only
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

  // Helpers for the redesigned list card. Server doesn't expose
  // minimum price; compute from the services array already in the
  // search response.
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

  // Sum of base prices for the selected service-categories, used by
  // the multi-select Est. price label. Best-effort â€” picks the
  // cheapest matching service per selected category, sums them.
  const estPriceFor = (loc: any, selected: ServiceCategory[]): number | null => {
    if (selected.length === 0) return null;
    const svcs: any[] = loc.services || [];
    let total = 0;
    let any = false;
    for (const cat of selected) {
      const matching = svcs.filter((s) => s.category === cat);
      if (matching.length === 0) continue;
      let m = Infinity;
      for (const s of matching) {
        const p = (s.allInPriceMinor ?? s.basePriceMinor) ?? Infinity;
        if (p < m) m = p;
      }
      if (Number.isFinite(m)) {
        total += m;
        any = true;
      }
    }
    return any ? total : null;
  };

  // Apply best-fit scoring + sort. Per the audit decision (item 6):
  // the distance proxy is mode-aware â€” distFromOrigin in nearby
  // mode, distanceToRoute in route mode. Until Round 4 ships real
  // OSRM detour values, this proxy fills the 0.50 weighting slot
  // in the composite score.
  const scoredList = useMemo(() => {
    if (rankedLocations.length === 0) return [];
    const scoringInputs = rankedLocations.map((loc) => {
      const distanceProxyKm = route
        ? ((loc as any).distanceToRoute as number)
        : ((loc as any).distFromOrigin as number);
      // Service-match fraction: share of selected categories the
      // location offers. 1.0 if nothing selected (neutral).
      const sel = filterUI.selectedServiceCategories;
      let matchFrac = 1;
      if (sel.length > 0) {
        const cats = new Set<string>(
          ((loc as any).services ?? []).map((s: any) => s?.category).filter(Boolean),
        );
        const matched = sel.filter((c) => cats.has(c)).length;
        matchFrac = matched / sel.length;
      }
      return {
        id: loc.id,
        distanceProxyKm,
        serviceMatchFraction: matchFrac,
        estimatedPrice: filterUI.selectedServiceCategories.length >= 1
          ? estPriceFor(loc, filterUI.selectedServiceCategories) ?? minPriceFor(loc)
          : minPriceFor(loc),
        rating: (loc as any).averageRating ?? null,
        reviewCount: (loc as any).reviewCount ?? 0,
      };
    });
    return filterUI.sortBy === "best-fit"
      ? scoreAndSort(scoringInputs)
      : applyDirectSort(scoringInputs, filterUI.sortBy);
  }, [rankedLocations, filterUI.sortBy, filterUI.selectedServiceCategories, route]);

  const scoredById = useMemo(() => {
    const m = new Map<string, { rankIdx: number; isTopBadge: boolean }>();
    scoredList.forEach((s) => m.set(s.id, { rankIdx: s.rankIdx, isTopBadge: s.isTopBadge }));
    return m;
  }, [scoredList]);

  // Locations sorted by score for the bottom sheet's card list.
  const sortedLocations = useMemo(() => {
    if (scoredList.length === 0) return rankedLocations;
    const byId = new Map(rankedLocations.map((l) => [l.id, l]));
    return scoredList.map((s) => byId.get(s.id)).filter((l): l is any => !!l);
  }, [scoredList, rankedLocations]);

  // Live category-counts for the service picker.
  const categoryCounts = useMemo(
    () => deriveCategoryCounts(displayLocations, filterUI),
    [displayLocations, filterUI],
  );

  const computeApplyCountForServices = useCallback(
    (local: ServiceCategory[]): number => {
      return displayLocations.filter(
        (loc) =>
          matchesAllSelectedServices(loc, local) &&
          passesAllSheetFilters(loc, filterUI.sheetFilters),
      ).length;
    },
    [displayLocations, filterUI.sheetFilters],
  );

  const computeApplyCountForFilters = useCallback(
    (filters: SheetFilters, _sort: SortBy): number => {
      return displayLocations.filter(
        (loc) =>
          matchesAllSelectedServices(loc, filterUI.selectedServiceCategories) &&
          passesAllSheetFilters(loc, filters),
      ).length;
    },
    [displayLocations, filterUI.selectedServiceCategories],
  );

  // Sort options conditional on mode + review density (EID Â§4.3).
  const sortOptions = useMemo<ReadonlyArray<{ value: SortBy; label: string }>>(() => {
    const opts: { value: SortBy; label: string }[] = [{ value: "best-fit", label: "Best fit" }];
    if (route) opts.push({ value: "shortest-detour", label: "Shortest detour" });
    opts.push({ value: "distance", label: "Distance" });
    opts.push({ value: "price", label: "Price" });
    opts.push({ value: "rating", label: "Rating" });
    return opts;
  }, [route]);

  const sortLabel =
    sortOptions.find((o) => o.value === filterUI.sortBy)?.label.toLowerCase() ?? "best fit";

  // Pills derivation for ActiveFilterPills.
  const pillsForActiveFilters = useMemo(
    () =>
      derivePillsFromSheetFilters(filterUI.sheetFilters, {
        clearAvailability: (key) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "availability",
            value: { ...filterUI.sheetFilters.availability, [key]: false },
          }),
        clearServiceDetail: (code) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "serviceDetails",
            value: filterUI.sheetFilters.serviceDetails.filter((c) => c !== code),
          }),
        clearFuel: (key) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "fuel",
            value: { ...filterUI.sheetFilters.fuel, [key]: false },
          }),
        clearDriverAmenity: (key) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "driverAmenities",
            value: { ...filterUI.sheetFilters.driverAmenities, [key]: false },
          }),
        clearCoachAmenity: (key) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "coachAmenities",
            value: { ...filterUI.sheetFilters.coachAmenities, [key]: false },
          }),
        clearRepairFlag: (code) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "repairFlags",
            value: filterUI.sheetFilters.repairFlags.filter((c) => c !== code),
          }),
        clearCompliance: (key) =>
          dispatchFilter({
            type: "SET_SHEET_FILTER",
            key: "compliance",
            value: { ...filterUI.sheetFilters.compliance, [key]: false },
          }),
        clearBayOverride: () =>
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "bayOverride", value: false }),
      }),
    [filterUI.sheetFilters],
  );

  // Build ResultCard service pills for one location.
  const buildServicePillsFor = (loc: any): CardServicePill[] => {
    const sel = filterUI.selectedServiceCategories;
    const cats = new Set<string>(
      ((loc as any).services ?? []).map((s: any) => s?.category).filter(Boolean),
    );
    const pills: CardServicePill[] = [];
    if (sel.length > 0) {
      // Selected categories first â€” show match status.
      sel.forEach((c) => {
        pills.push({
          id: `sel-${c}`,
          label: CATEGORY_DISPLAY_NAMES[c],
          state: cats.has(c) ? "available" : "wanted-missing",
        });
      });
      // Up to 1-2 extras the user didn't select but the location offers.
      const extras = Array.from(cats).filter(
        (c) => !sel.includes(c as ServiceCategory),
      ) as ServiceCategory[];
      if (extras.length > 0) {
        pills.push({ id: "extras", label: `+${extras.length}`, state: "extra" });
      }
    } else {
      // No selection â†’ show top 3 categories the location offers.
      const offered = Array.from(cats).slice(0, 3) as ServiceCategory[];
      offered.forEach((c) =>
        pills.push({ id: `off-${c}`, label: CATEGORY_DISPLAY_NAMES[c], state: "available" }),
      );
      if (cats.size > 3) {
        pills.push({ id: "extras", label: `+${cats.size - 3}`, state: "extra" });
      }
    }
    return pills;
  };

  const sheetCountLine = useMemo(() => {
    const n = sortedLocations.length;
    if (route) return `${n} match${n === 1 ? "" : "es"} along route`;
    return `${n} wash spot${n === 1 ? "" : "s"} near you`;
  }, [sortedLocations.length, route]);

  // Header pill content for collapsed mode.
  const pillLine1 =
    activeVehicle?.nickname ||
    (origin?.label ? origin.label : "WashBuddy");
  const pillLine2 = destination
    ? `â†’ ${destination.label}`
    : origin?.label && origin.label !== pillLine1
      ? origin.label
      : "Tap to plan a trip";

  const sheetMode: "collapsed" | "expanded" =
    filterUI.sheetState === "peek" ? "collapsed" : "expanded";

  // Selected location lookup for PinCallout content.
  const selectedLocation = useMemo(
    () => (selectedLocationId ? sortedLocations.find((l) => l.id === selectedLocationId) : null),
    [selectedLocationId, sortedLocations],
  );

  // Open-status helper â€” server today exposes only `isOpenNow`; map
  // it to the EID color triplet. Closes-soon / closed gradients
  // arrive when backend exposes operating windows + relative-time.
  const openStatusFor = (loc: any) => {
    const isOpen = !!(loc as any).isOpenNow;
    return {
      label: isOpen ? "Open now" : "Closed",
      color: (isOpen ? "green" : "red") as "green" | "amber" | "red",
    };
  };

  const ratingFor = (loc: any) => {
    const reviewCount: number = (loc as any).reviewCount ?? 0;
    const averageRating: number | null = (loc as any).averageRating ?? null;
    if (reviewCount < 5 || averageRating == null) return null;
    return { value: averageRating, reviewCount };
  };

  const RATING_THRESHOLD = 5;
  void RATING_THRESHOLD; // documented in lib/sort-scoring.ts; gate above mirrors it

  // Over-filter guardrail copy. Per audit refinement #11 â€”
  // sheet-state-aware: when peek, render under the chip row (in
  // header); when default/expanded, render at top of result list.
  // Trigger: <5 active matches AND any filters/services applied.
  const showOverFilterGuardrail =
    sortedLocations.length > 0 &&
    sortedLocations.length < 5 &&
    (filterUI.selectedServiceCategories.length > 0 ||
      countActiveSheetFilters(filterUI.sheetFilters) > 0);

  const overFilterPill = showOverFilterGuardrail ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        background: "#FEF3C7",
        color: "#92400E",
        fontSize: 11.5,
        fontWeight: 500,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #FDE68A",
      }}
    >
      <span>âš  Only {sortedLocations.length} matches with current filters</span>
      <button
        type="button"
        onClick={() => dispatchFilter({ type: "CLEAR_ALL_FILTERS" })}
        style={{
          background: "transparent",
          color: "#92400E",
          fontSize: 11.5,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
        }}
      >
        Show all
      </button>
    </div>
  ) : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#FFFFFF",
      }}
    >
      {/* Map â€” fills the viewport behind the header + sheet.
          Round 2+3 fixed-position layout: the page is overflow-
          hidden + fixed-inset-0, the sheet has its own contained
          scroll container, so the document never scrolls. That
          fixes Bug 1 (page-has-no-bottom). */}
      <div
        ref={mapRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: "var(--z-map)" as unknown as number,
        }}
      />

      {/* Floating top-left button â€” logomark on top-level entry,
          back chevron when navigated in from another page.
          EID Â§3.1 / Â§3.8. */}
      <motion.div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: "var(--z-map-control)" as unknown as number,
          pointerEvents: "none",
        }}
        initial={false}
        animate={{ y: showFloatingChrome ? 0 : -80, opacity: showFloatingChrome ? 1 : 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <button
          type="button"
          onClick={() => {
            if (isDeepEntry) window.history.back();
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

      {/* Floating top-right cluster â€” bell + hamburger. */}
      <motion.div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: "var(--z-map-control)" as unknown as number,
          display: "flex",
          alignItems: "center",
          gap: 4,
          pointerEvents: "none",
        }}
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

      {/* "Search this area" floating pill (EID Â§3.2, --z-map-cta). */}
      <AnimatePresence>
        {showSearchAreaButton && (
          <motion.div
            key="search-this-area"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 78,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: "var(--z-map-cta)" as unknown as number,
            }}
          >
            <button
              type="button"
              onClick={handleSearchThisArea}
              aria-label="Search this area"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-[0_2px_6px_rgba(15,23,42,0.10)] hover:bg-white transition-colors text-sm font-medium text-slate-800"
            >
              <Search className="h-4 w-4 text-slate-500" />
              Search this area
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pin selection callout (EID Â§3.6) â€” positioned over the map
          at the selected pin's container-pixel coordinates. */}
      {pinCalloutPos && selectedLocation && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: "var(--z-pin-label)" as unknown as number,
          }}
        >
          <PinCallout
            pinX={pinCalloutPos.x}
            pinY={pinCalloutPos.y}
            isTopBadge={scoredById.get(selectedLocation.id)?.isTopBadge ?? false}
            providerName={selectedLocation.name}
            cityLine={`${selectedLocation.city}${(selectedLocation as any).stateCode ? `, ${(selectedLocation as any).stateCode}` : ""}`}
            metaText={
              route
                ? `+${Math.round((selectedLocation as any).distanceToRoute)} km from route`
                : `${(((selectedLocation as any).distFromOrigin as number) * 0.621371).toFixed(1)} mi`
            }
            metaEmphasis={
              route
                ? `+${Math.round((selectedLocation as any).distanceToRoute)} km from route`
                : undefined
            }
            openStatus={openStatusFor(selectedLocation)}
            onCardTap={() => {
              dispatchFilter({ type: "SET_SHEET_STATE", sheetState: "default", userInitiated: true });
              // Scroll the sheet's contained list to bring the
              // selected card into view â€” left as a future enhancement
              // since the sheet's scrollIntoView wiring lives inside
              // SearchBottomSheet's children div.
            }}
            onBook={() => setNavLocation(buildLocationUrl(selectedLocation.id))}
          />
        </div>
      )}

      {/* Header â€” collapsed when sheet at peek, expanded otherwise. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: 64, // clear floating top buttons
          zIndex: "var(--z-header)" as unknown as number,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <FindAWashHeader
            mode={sheetMode}
            pillLine1={pillLine1}
            pillLine2={pillLine2}
            onTapPill={() =>
              dispatchFilter({
                type: "SET_SHEET_STATE",
                sheetState: "default",
                userInitiated: true,
              })
            }
            onTapEdit={() => setFormCollapsed(false)}
            expandedFormSlot={
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ActiveVehiclePill />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    From
                  </div>
                  {origin?.name === "My Location" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <Crosshair size={14} color="#15803D" />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        My Location
                      </span>
                      <button
                        type="button"
                        onClick={() => { setOrigin(null); setRoute(null); }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}
                        aria-label="Clear origin"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <CityAutocomplete
                      value={origin}
                      onChange={(c) => {
                        setOrigin(c);
                        setRoute(null);
                        if (c && destination) {
                          setTimeout(() => planRouteRef.current?.(c, destination), 0);
                        }
                      }}
                      placeholder="Start city..."
                      exclude={destination}
                      userLat={origin?.lat ?? destination?.lat}
                      userLng={origin?.lng ?? destination?.lng}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    To
                  </div>
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
                {isRouting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" }}>
                    <Loader2 className="h-3 w-3 animate-spin" /> Planning route...
                  </div>
                )}
                {routeError && (
                  <div style={{ fontSize: 12, color: "#B91C1C" }}>{routeError}</div>
                )}
              </div>
            }
            chipRowSlot={
              <FilterChips
                selectedServiceCategories={filterUI.selectedServiceCategories}
                openFilterEnabled={filterUI.openFilterEnabled}
                openFilterLabel={destination ? "Open at arrival" : "Open now"}
                activeFilterCount={countActiveSheetFilters(filterUI.sheetFilters)}
                onOpenServicePicker={() =>
                  dispatchFilter({ type: "OPEN_MODAL", modal: "service-picker" })
                }
                onToggleOpenFilter={() => dispatchFilter({ type: "TOGGLE_OPEN_FILTER" })}
                onOpenAllFilters={() =>
                  dispatchFilter({ type: "OPEN_MODAL", modal: "all-filters" })
                }
              />
            }
            activePillsSlot={
              <>
                <ActiveFilterPills pills={pillsForActiveFilters} />
                {/* Audit refinement #11 â€” guardrail in header when
                    sheet is at peek (the user can't see the list
                    yet so the warning belongs near the chips). */}
                {filterUI.sheetState === "peek" && overFilterPill}
              </>
            }
          />
        </div>
      </div>

      {/* Bottom sheet with contained scroll â€” Bug 1 fix mechanism. */}
      <SearchBottomSheet
        state={filterUI.sheetState}
        onStateChange={(next, userInitiated) =>
          dispatchFilter({ type: "SET_SHEET_STATE", sheetState: next, userInitiated })
        }
        countLine={sheetCountLine}
        activeView={filterUI.sheetState === "peek" ? "map" : "list"}
        sortLabel={sortLabel}
        onTapSort={() => dispatchFilter({ type: "OPEN_MODAL", modal: "all-filters" })}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Audit refinement #11 â€” guardrail at top of list when
              sheet is default/expanded. */}
          {filterUI.sheetState !== "peek" && overFilterPill}

          {/* Empty-area pill (CP3 v2 hotfix preserved). */}
          {showEmptyAreaPill && closestProvider && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#F1F5F9",
                color: "#475569",
                border: "1px solid #E2E8F0",
                fontSize: 13,
              }}
            >
              <span>
                No providers in this area. Closest is{" "}
                <strong style={{ color: "#0F172A", fontWeight: 600 }}>
                  {mode === "nearby"
                    ? `${Math.max(1, Math.round(closestProvider.distKm * 0.621371))} mi`
                    : `${Math.max(1, Math.round(closestProvider.distKm))} km`}
                </strong>{" "}
                away.
              </span>
              <button
                type="button"
                onClick={handleShowClosest}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#1F52B0",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Show closest â†’
              </button>
            </div>
          )}

          {isRouting && sortedLocations.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "#475569", fontSize: 13 }}>
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-blue-500" />
              Calculating route...
            </div>
          )}

          {!isRouting && sortedLocations.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "#475569", fontSize: 13 }}>
              <MapPin className="h-8 w-8 mx-auto mb-3 text-slate-300" />
              {origin
                ? `No wash locations found within ${route ? ROUTE_CORRIDOR_KM : NEARBY_RADIUS_KM} km${route ? " of this route" : ""}.`
                : "Allow location access or enter a starting city to see nearby washes."}
            </div>
          )}

          {sortedLocations.map((loc) => {
            const incompatible = (loc as any).fitsActiveVehicle === false;
            const tier: WashPinTier = incompatible
              ? "incompatible"
              : (scoredById.get(loc.id)?.isTopBadge ? "top" : "mid");
            const scored = scoredById.get(loc.id);
            const distFromOriginMi = ((loc as any).distFromOrigin as number) * 0.621371;
            const kmFromRoute = Math.round((loc as any).distanceToRoute as number);
            const cityLine = `${loc.city}${(loc as any).stateCode ? `, ${(loc as any).stateCode}` : (loc as any).regionCode ? `, ${(loc as any).regionCode}` : ""}`;
            const metaText = route
              ? `+${kmFromRoute} km from route`
              : `${distFromOriginMi.toFixed(1)} mi`;
            const metaEmphasis = route ? `+${kmFromRoute} km from route` : undefined;

            // Price line â€” gated on selection state per EID Â§3.4.2.
            const sel = filterUI.selectedServiceCategories;
            let price: { prefix: "From" | "Est."; amount: string } | null = null;
            if (sel.length === 1) {
              const m = minPriceFor(loc);
              if (m != null) price = { prefix: "From", amount: formatCurrency(m) };
            } else if (sel.length >= 2) {
              const e = estPriceFor(loc, sel);
              if (e != null) price = { prefix: "Est.", amount: formatCurrency(e) };
            }

            return (
              <ResultCard
                key={loc.id}
                id={loc.id}
                providerName={loc.name}
                cityLine={cityLine}
                metaText={metaText}
                metaEmphasis={metaEmphasis}
                rankIdx={scored?.rankIdx ?? 0}
                isTopBadge={!incompatible && (scored?.isTopBadge ?? false)}
                tier={tier}
                serviceCategoriesSelected={sel}
                servicePills={incompatible ? [] : buildServicePillsFor(loc)}
                openStatus={incompatible ? null : openStatusFor(loc)}
                rating={incompatible ? null : ratingFor(loc)}
                price={incompatible ? null : price}
                isSelected={selectedLocationId === loc.id}
                onSelect={() => selectLocation(loc.id)}
                onChevron={() => setNavLocation(buildLocationUrl(loc.id))}
              />
            );
          })}
        </div>
      </SearchBottomSheet>

      {/* Service picker modal (EID Â§4.2). */}
      <ServicePickerSheet
        isOpen={filterUI.modalOpen === "service-picker"}
        onClose={() => dispatchFilter({ type: "CLOSE_MODAL" })}
        initialSelection={filterUI.selectedServiceCategories}
        categoryCounts={categoryCounts}
        computeApplyCount={computeApplyCountForServices}
        modeRouteSuffix={destination ? " along route" : ""}
        onApply={(next) => {
          dispatchFilter({ type: "SET_SERVICE_CATEGORIES", categories: next });
          dispatchFilter({ type: "CLOSE_MODAL" });
        }}
      />

      {/* All-filters modal (EID Â§4.3). */}
      <AllFiltersSheet
        isOpen={filterUI.modalOpen === "all-filters"}
        onClose={() => dispatchFilter({ type: "CLOSE_MODAL" })}
        initialFilters={filterUI.sheetFilters}
        initialSort={filterUI.sortBy}
        hasSelectedServices={filterUI.selectedServiceCategories.length > 0}
        sortOptions={sortOptions}
        computeApplyCount={computeApplyCountForFilters}
        onApply={(filters, sort) => {
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "availability", value: filters.availability });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "serviceDetails", value: filters.serviceDetails });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "fuel", value: filters.fuel });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "driverAmenities", value: filters.driverAmenities });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "coachAmenities", value: filters.coachAmenities });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "repairFlags", value: filters.repairFlags });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "compliance", value: filters.compliance });
          dispatchFilter({ type: "SET_SHEET_FILTER", key: "bayOverride", value: filters.bayOverride });
          dispatchFilter({ type: "SET_SORT_BY", sortBy: sort });
          dispatchFilter({ type: "CLOSE_MODAL" });
        }}
        onClearAll={() => dispatchFilter({ type: "CLEAR_ALL_FILTERS" })}
      />
    </div>
  );
}
