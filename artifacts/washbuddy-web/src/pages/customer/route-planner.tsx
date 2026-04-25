import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchLocations } from "@workspace/api-client-react";
import { Card, Input, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Navigation, Route, ArrowRight, X, Loader2, ChevronDown, Crosshair } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ActiveVehiclePill } from "@/components/customer/active-vehicle-pill";

interface CityOption {
  name: string;
  state: string;
  lat: number;
  lng: number;
  label: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    province?: string;
    country?: string;
    country_code?: string;
  };
}

async function searchCities(query: string): Promise<CityOption[]> {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "8",
    countrycodes: "us,ca,mx",
    featuretype: "city",
  });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "Accept-Language": "en" },
    });
    if (!res.ok) return [];
    const data: NominatimResult[] = await res.json();
    return data
      .filter((r) => r.address && (r.address.city || r.address.town || r.address.village || r.address.municipality))
      .map((r) => {
        const cityName = r.address!.city || r.address!.town || r.address!.village || r.address!.municipality || "";
        const stateName = r.address!.state || r.address!.province || "";
        const stateShort = stateName.length > 3 ? stateName : stateName;
        const label = stateShort ? `${cityName}, ${stateShort}` : cityName;
        return {
          name: cityName,
          state: stateShort,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          label,
        };
      })
      .filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i);
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
}: {
  value: CityOption | null;
  onChange: (city: CityOption | null) => void;
  placeholder: string;
  exclude?: CityOption | null;
}) {
  const [query, setQuery] = useState(value?.label || "");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<CityOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value?.label || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    debounceRef.current = setTimeout(async () => {
      const cities = await searchCities(q);
      if (version !== searchVersionRef.current) return;
      const filtered = exclude
        ? cities.filter((c) => c.label !== exclude.label)
        : cities;
      setResults(filtered);
      setIsSearching(false);
    }, 200);
  }, [exclude]);

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
      <AnimatePresence>
        {isOpen && !value && (query.length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto"
          >
            {isSearching ? (
              <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
              </div>
            ) : results.length > 0 ? (
              results.map((city, idx) => (
                <button
                  key={`${city.label}-${idx}`}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-2 transition-colors"
                  onClick={() => {
                    onChange(city);
                    setQuery(city.label);
                    setIsOpen(false);
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-800">{city.name}</span>
                  <span className="text-slate-400">{city.state}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-slate-400">
                No cities found. Try a different search.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const locationIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

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

function getCityByLabel(label: string): CityOption | null {
  if (!label) return null;
  if (label.startsWith("My Location")) {
    const match = label.match(/My Location \((.*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
    if (match) {
      return { name: "My Location", state: "", lat: parseFloat(match[2]), lng: parseFloat(match[3]), label };
    }
    return null;
  }
  const coordMatch = label.match(/^(.+?)\s*\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]$/);
  if (coordMatch) {
    const displayName = coordMatch[1].trim();
    const parts = displayName.split(", ");
    return {
      name: parts[0] || displayName,
      state: parts[1] || "",
      lat: parseFloat(coordMatch[2]),
      lng: parseFloat(coordMatch[3]),
      label: displayName,
    };
  }
  return null;
}

function serializeCityForUrl(city: CityOption): string {
  if (city.name === "My Location") return city.label;
  return `${city.label} [${city.lat.toFixed(4)},${city.lng.toFixed(4)}]`;
}

function makeMyLocationOption(lat: number, lng: number, areaName?: string): CityOption {
  const area = areaName || "";
  return {
    name: "My Location",
    state: "",
    lat,
    lng,
    label: `My Location (${area ? `near ${area}` : "detected"}, ${lat.toFixed(4)}, ${lng.toFixed(4)})`,
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

export default function RoutePlanner() {
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

  const { data, isLoading } = useSearchLocations({}, { request: { credentials: "include" } });
  const allLocations = data?.locations || [];

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
  const markersRef = useRef<L.Marker[]>([]);
  const endpointsRef = useRef<L.Marker[]>([]);

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
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
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

    locsToShow.forEach((loc) => {
      if (loc.latitude == null || loc.longitude == null) return;
      const marker = L.marker([loc.latitude, loc.longitude], { icon: locationIcon }).addTo(map);

      const popup = L.DomUtil.create("div");
      popup.style.cssText = "font-family:system-ui;min-width:180px;";

      const nameEl = L.DomUtil.create("div", "", popup);
      nameEl.style.cssText = "font-weight:700;font-size:14px;margin-bottom:4px;color:#0f172a;";
      nameEl.textContent = loc.name;

      if (loc.provider?.name) {
        const provEl = L.DomUtil.create("div", "", popup);
        provEl.style.cssText = "font-size:12px;color:#64748b;margin-bottom:2px;";
        provEl.textContent = loc.provider.name;
      }

      const addrEl = L.DomUtil.create("div", "", popup);
      addrEl.style.cssText = "font-size:12px;color:#94a3b8;margin-bottom:4px;";
      addrEl.textContent = route
        ? `${loc.city} — ${Math.round(loc.distanceToRoute)} km from route`
        : `${loc.city} — ${Math.round(loc.distFromOrigin)} km away`;

      const etaMins = etas[loc.id];
      if (etaMins != null) {
        const etaEl = L.DomUtil.create("div", "", popup);
        etaEl.style.cssText = "font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:4px;display:flex;align-items:center;gap:4px;";
        etaEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${formatETA(etaMins)} away`;
      }

      const servCount = loc.services?.length || 0;
      if (servCount > 0) {
        const svcEl = L.DomUtil.create("div", "", popup);
        svcEl.style.cssText = "font-size:11px;color:#3b82f6;font-weight:600;margin-bottom:6px;";
        svcEl.textContent = `${servCount} service${servCount > 1 ? "s" : ""} available`;
      }

      const btn = L.DomUtil.create("button", "", popup);
      btn.textContent = "Book a Wash";
      btn.style.cssText = `
        margin-top:4px;padding:6px 12px;width:100%;
        background:linear-gradient(135deg,#3b82f6,#1d4ed8);
        color:white;border:none;border-radius:8px;
        font-size:12px;font-weight:600;cursor:pointer;
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

      marker.bindPopup(popup, { closeButton: false });
      markersRef.current.push(marker);
    });

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
  const planRouteRef = useRef<(o: CityOption, d: CityOption) => void>();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveVehiclePill />
      </div>
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900 text-white p-8 sm:p-10">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, rgba(139,92,246,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59,130,246,0.3) 0%, transparent 40%)",
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Route className="h-6 w-6 text-purple-300" />
            <h1 className="text-3xl sm:text-4xl font-display font-bold">Route Planner</h1>
          </div>
          <p className="text-slate-300 mb-6 max-w-xl">
            Plan your trip and find wash locations along the way. Your current location is detected automatically — just enter your destination to get started.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
              {origin?.name === "My Location" ? (
                <div className="h-12 rounded-xl bg-white/10 border border-white/20 flex items-center px-4 gap-2">
                  <Crosshair className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="text-white text-sm font-medium truncate">My Location</span>
                  <span className="text-slate-400 text-xs truncate hidden sm:inline">
                    {(() => {
                      const m = origin.label.match(/My Location \((.*),\s*-?\d+\.?\d*,\s*-?\d+\.?\d*\)/);
                      return m ? `(${m[1].trim()})` : "(detected)";
                    })()}
                  </span>
                  <button
                    onClick={() => { setOrigin(null); setRoute(null); }}
                    className="ml-auto text-slate-400 hover:text-white shrink-0"
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
                    }}
                    placeholder="Start city..."
                    exclude={destination}
                  />
                  {!origin && geoStatus !== "unavailable" && (
                    <button
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
                          },
                          () => {
                            setGeoStatus("denied");
                            setRouteError("Could not access your location. Please enter a city manually.");
                          },
                          { timeout: 8000 }
                        );
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors"
                      title="Use my location"
                    >
                      <Crosshair className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {geoStatus === "pending" && !initialOrigin && (
                <div className="flex items-center gap-1.5 mt-1.5 text-slate-400 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Detecting location...
                </div>
              )}
            </div>

            <div className="flex items-end justify-center sm:pb-1">
              <button
                onClick={handleSwap}
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="Swap"
              >
                <ArrowRight className="h-4 w-4 text-white sm:rotate-0 rotate-90" />
              </button>
            </div>

            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
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
              />
            </div>

            <div className="flex items-end">
              <Button
                size="lg"
                className="h-12 rounded-xl px-8 w-full sm:w-auto"
                onClick={handlePlanRoute}
                disabled={!origin || !destination || isRouting}
              >
                {isRouting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Planning...
                  </>
                ) : (
                  <>
                    <Navigation className="h-4 w-4 mr-2" />
                    Plan Route
                  </>
                )}
              </Button>
            </div>
          </div>

          {routeError && (
            <p className="text-red-300 text-sm mt-3">{routeError}</p>
          )}
        </div>
      </div>

      {route && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Route className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Distance</p>
              <p className="text-lg font-bold text-slate-900">{route.distanceKm} km</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="bg-purple-50 p-2 rounded-lg">
              <Navigation className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Drive Time</p>
              <p className="text-lg font-bold text-slate-900">{formatDuration(route.durationMins)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="bg-green-50 p-2 rounded-lg">
              <MapPin className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Wash Stops</p>
              <p className="text-lg font-bold text-slate-900">{nearbyLocations.length} locations</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div
            ref={mapRef}
            className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm"
            style={{ height: "550px", width: "100%", zIndex: 0 }}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 font-display">
            {route
              ? `Wash Locations Along Route (${nearbyLocations.length})`
              : displayLocations.length > 0
                ? `Nearby Wash Locations (${displayLocations.length})`
                : "Wash Locations"}
          </h2>

          {!route && !isRouting && displayLocations.length === 0 && !origin && (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
              <Route className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                Allow location access to see nearby wash locations, or enter a starting city above.
              </p>
            </div>
          )}

          {!route && !isRouting && origin && displayLocations.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
              <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                No wash locations found within {NEARBY_RADIUS_KM} km. Enter a destination to plan a route.
              </p>
            </div>
          )}

          {isRouting && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Calculating route...</p>
            </div>
          )}

          {route && nearbyLocations.length === 0 && !isRouting && (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
              <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No wash locations found within {ROUTE_CORRIDOR_KM} km of this route.</p>
            </div>
          )}

          {displayLocations.length > 0 && !isRouting && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {displayLocations.map((loc, idx) => (
                <motion.div
                  key={loc.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Link href={buildLocationUrl(loc.id)} className="block">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">{loc.name}</h3>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {etas[loc.id] != null && (
                            <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              {formatETA(etas[loc.id])} away
                            </Badge>
                          )}
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                            {route ? `${Math.round(loc.distanceToRoute)} km` : `${Math.round(loc.distFromOrigin)} km`}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        {loc.city}, {(loc as any).stateCode || (loc as any).regionCode}
                      </p>
                      {loc.services && loc.services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {loc.services.slice(0, 2).map((svc) => (
                            <span
                              key={svc.id}
                              className="text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded-md"
                            >
                              {svc.name} · {formatCurrency((svc as any).allInPriceMinor ?? svc.basePriceMinor)}
                            </span>
                          ))}
                          {loc.services.length > 2 && (
                            <span className="text-xs text-blue-600 font-medium px-1">
                              +{loc.services.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
