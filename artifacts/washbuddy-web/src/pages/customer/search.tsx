import React, { useState, useEffect, useMemo } from "react";
import { useListBookings, useGetAvailableNowLocations } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "";
import { Card, Input, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Search, Navigation, Map, List, ArrowRight, X, Zap, Star, Truck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import LocationMap from "@/components/location-map";
import { useAuth } from "@/contexts/auth";
import { ActiveVehiclePill } from "@/components/customer/active-vehicle-pill";
import { useActiveVehicle } from "@/contexts/activeVehicle";
import { deriveSizeClassFromLengthInches } from "@/lib/vehicleBodyType";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


function formatDistance(miles: number): string {
  if (miles < 1) return `${Math.round(miles * 5280)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

const STATE_NAMES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
  NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming",
  DC: "district of columbia",
  AB: "alberta", BC: "british columbia", MB: "manitoba", NB: "new brunswick",
  NL: "newfoundland", NS: "nova scotia", NT: "northwest territories", NU: "nunavut",
  ON: "ontario", PE: "prince edward island", QC: "quebec", SK: "saskatchewan", YT: "yukon",
};

const METRO_ALIASES: Record<string, string[]> = {
  "new york": ["bronx", "brooklyn", "queens", "staten island", "manhattan", "new york"],
  "nyc": ["bronx", "brooklyn", "queens", "staten island", "manhattan", "new york"],
  "los angeles": ["los angeles", "la", "hollywood", "long beach", "pasadena", "glendale"],
  "chicago": ["chicago", "evanston", "cicero"],
  "dallas": ["dallas", "fort worth", "arlington", "plano", "irving"],
  "philadelphia": ["philadelphia", "camden"],
  "houston": ["houston", "pasadena", "sugar land"],
  "detroit": ["detroit", "dearborn", "warren", "flint"],
  "boston": ["boston", "cambridge", "somerville", "quincy"],
  "san francisco": ["san francisco", "oakland", "berkeley", "daly city"],
  "dc": ["washington", "arlington", "alexandria"],
  "washington dc": ["washington", "arlington", "alexandria"],
};

function resolveStateCode(term: string): string | null {
  const t = term.toLowerCase().trim();
  if (t.length === 2) {
    const upper = t.toUpperCase();
    if (STATE_NAMES[upper]) return upper;
  }
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (name === t) return code;
  }
  return null;
}

function matchesSearch(loc: { name: string; city: string; addressLine1?: string; stateCode?: string; postalCode?: string }, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase().trim();

  const stateCode = resolveStateCode(t);
  if (stateCode) {
    return (loc.stateCode || "").toUpperCase() === stateCode;
  }

  const metroCities = METRO_ALIASES[t];
  if (metroCities) {
    const cityLow = loc.city.toLowerCase();
    return metroCities.some(alias => cityLow.includes(alias));
  }

  const fields = [
    loc.name, loc.city, loc.addressLine1 || "", loc.stateCode || "", loc.postalCode || "",
  ].map(f => f.toLowerCase());

  const terms = t.split(/\s+/);
  return terms.every(word => fields.some(f => f.includes(word)));
}

type LocationWithMeta = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  stateCode: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
  provider?: { id: string; name: string };
  services?: Array<{ id: string; name: string; basePriceMinor: number; allInPriceMinor?: number; durationMins: number }>;
  washBays?: Array<{ id: string; supportedClasses: string[] }>;
  operatingWindows?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  isOpenNow?: boolean;
  nextOpenAt?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  distance?: number;
  isOpen: boolean;
  fitsActiveVehicle?: boolean;
};

/** True if at least one active bay at the location supports the given
 * vehicle class. The earlier version had a "missing washBays → return
 * true (permissive)" fallback that silently masked any wire-format
 * issue: if the response ever dropped the field — a stale dist, a
 * generated-client strip, a proxy quirk — every location showed as
 * compatible regardless of vehicle, which is exactly the symptom we
 * just chased down. Strict semantics now: missing data means we
 * couldn't verify, so we don't pretend it fits. */
function locationFitsClass(loc: LocationWithMeta, vehicleClass: string | null): boolean {
  if (!vehicleClass) return true; // no active vehicle → nothing to gate against
  const bays = loc.washBays;
  if (!Array.isArray(bays) || bays.length === 0) return false;
  return bays.some((b) => Array.isArray(b.supportedClasses) && b.supportedClasses.includes(vehicleClass));
}

export default function CustomerSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterAvailNow, setFilterAvailNow] = useState(false);
  const [filterTopRated, setFilterTopRated] = useState(false);
  const { activeVehicle } = useActiveVehicle();
  const activeVehicleClass = activeVehicle ? deriveSizeClassFromLengthInches(activeVehicle.lengthInches) : null;
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Use a raw useQuery so the URL itself carries vehicleClass as a
  // query param. Two reasons over the generated useSearchLocations:
  //   (1) The auto-derived queryKey is strictly tied to the URL, so
  //       swapping vehicles is *observably* a different request in
  //       dev tools' Network tab (you can confirm a refetch fired).
  //   (2) The generated client's queryFn was closed over the original
  //       `params` arg — a queryKey override created separate cache
  //       entries but the same underlying fetch, which made any
  //       runtime "did the refetch happen?" debugging opaque.
  // Server currently ignores vehicleClass and returns the same data;
  // the client filters via locationFitsClass. The param is forward-
  // compatible with server-side filtering when we add it.
  const locationsUrl = `${API_BASE}/api/locations/search${activeVehicleClass ? `?vehicleClass=${activeVehicleClass}` : ""}`;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/locations/search", { vehicleClass: activeVehicleClass ?? "ANY" }],
    queryFn: async () => {
      const r = await fetch(locationsUrl, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
  });
  const { data: bookingsData } = useListBookings(
    { status: "COMPLETED", limit: 100 },
    { request: { credentials: "include" }, query: { enabled: !!user } }
  );
  const { data: availNowData, isLoading: availNowLoading } = useGetAvailableNowLocations(
    { request: { credentials: "include" }, query: { enabled: filterAvailNow, staleTime: 60_000 } }
  );

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setGeoStatus("granted");
        },
        () => {
          setGeoStatus("denied");
        }
      );
    } else {
      setGeoStatus("denied");
    }
  }, []);

  const previousLocationIds = useMemo(() => {
    if (!bookingsData?.bookings) return new Set<string>();
    return new Set(bookingsData.bookings.map((b: { locationId: string }) => b.locationId));
  }, [bookingsData]);

  const enrichedLocations: LocationWithMeta[] = useMemo(() => {
    const locs = (data?.locations || []) as Array<LocationWithMeta>;
    return locs.map((loc) => {
      const dist = userLat != null && userLng != null && loc.latitude && loc.longitude
        ? haversineDistance(userLat, userLng, loc.latitude, loc.longitude)
        : undefined;
      return {
        ...loc,
        distance: dist,
        isOpen: loc.isOpenNow ?? false,
        fitsActiveVehicle: locationFitsClass(loc, activeVehicleClass),
      };
    });
  }, [data, userLat, userLng, activeVehicleClass]);

  const availNowIds = useMemo(() => {
    if (!availNowData?.locationIds) return new Set<string>();
    return new Set(availNowData.locationIds);
  }, [availNowData]);

  const filtered = useMemo(() => {
    let result = enrichedLocations.filter((l) => matchesSearch(l, searchTerm));
    if (filterOpenNow) {
      result = result.filter((l) => l.isOpen);
    }
    if (filterAvailNow) {
      result = result.filter((l) => availNowIds.has(l.id));
    }
    if (filterTopRated) {
      result = result.filter((l) => (l.averageRating ?? 0) >= 4.0);
    }
    // Vehicle compatibility no longer hides locations — incompatible
    // ones render in a grayed unclickable state instead, so the driver
    // can see why a location is unavailable instead of "missing".
    return result;
  }, [enrichedLocations, searchTerm, filterOpenNow, filterAvailNow, filterTopRated, availNowIds]);

  const sortLocations = (a: LocationWithMeta, b: LocationWithMeta) => {
    if (filterTopRated) {
      return (b.averageRating ?? 0) - (a.averageRating ?? 0);
    }
    if (a.distance != null && b.distance != null) return a.distance - b.distance;
    if (a.distance != null) return -1;
    if (b.distance != null) return 1;
    return a.name.localeCompare(b.name);
  };

  const nearbyLocations = useMemo(() => {
    const sorted = [...filtered].filter((l) => !previousLocationIds.has(l.id));
    sorted.sort(sortLocations);
    return sorted;
  }, [filtered, previousLocationIds]);

  const previousLocations = useMemo(() => {
    if (previousLocationIds.size === 0) return [];
    const sorted = [...filtered].filter((l) => previousLocationIds.has(l.id));
    sorted.sort(sortLocations);
    return sorted;
  }, [filtered, previousLocationIds]);

  const allSorted = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort(sortLocations);
    return sorted;
  }, [filtered]);

  const renderStars = (rating: number | null | undefined) => {
    const r = rating ?? 0;
    const full = Math.floor(r);
    const half = r - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    return (
      <>
        {Array.from({ length: full }, (_, i) => <Star key={`f${i}`} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}
        {half && <Star key="h" className="h-3.5 w-3.5 fill-amber-400/50 text-amber-400" />}
        {Array.from({ length: empty }, (_, i) => <Star key={`e${i}`} className="h-3.5 w-3.5 text-slate-300" />)}
      </>
    );
  };

  const renderLocationCard = (loc: LocationWithMeta, idx: number) => {
    const incompatible = !!activeVehicleClass && loc.fitsActiveVehicle === false;

    // "From $X" — cheapest service at this location. Reads from the
    // `services` array already in the search response, so no extra
    // round-trip; null if the location has no services attached.
    const minPriceMinor = (() => {
      const svcs = loc.services || [];
      if (svcs.length === 0) return null;
      let m = Infinity;
      for (const s of svcs) {
        const p = (s.allInPriceMinor ?? s.basePriceMinor) ?? Infinity;
        if (p < m) m = p;
      }
      return Number.isFinite(m) ? m : null;
    })();

    // Compact card — ~120-130px target on mobile. Collapsed details
    // (no services subsection, no separate distance row) so the first
    // listing fits above the fold at 375px after the slim header.
    const cardInner = (
      <Card
        className={`flex flex-col border-2 ${
          incompatible
            ? "bg-slate-50 border-slate-200 cursor-default"
            : "group cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
        }`}
        title={incompatible ? "Change your active vehicle to book at this location" : undefined}
      >
        <div className="p-4 sm:p-5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`text-base sm:text-lg font-bold leading-tight truncate ${incompatible ? "text-slate-500" : "text-slate-900"}`}>{loc.name}</h3>
            {!incompatible && (
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors shrink-0 mt-1" />
            )}
          </div>

          {incompatible ? (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-xs font-medium">
              <Truck className="h-3 w-3" /> No bay fits your active vehicle
            </div>
          ) : (
            <>
              {/* Rating · distance · open-now: single 14px line on mobile,
                  truncates on the right via min-w-0 inside the flex row. */}
              <p className="text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                {(loc.averageRating != null || (loc.reviewCount ?? 0) > 0) && (
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-slate-700">{loc.averageRating != null ? loc.averageRating.toFixed(1) : "—"}</span>
                    <span className="text-slate-400">({loc.reviewCount ?? 0})</span>
                  </span>
                )}
                {loc.distance != null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="shrink-0">{formatDistance(loc.distance)}</span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                {loc.isOpen ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Open Now
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium shrink-0">Closed</span>
                )}
              </p>

              {/* Address: single line, truncate. min-w-0 on the wrapper
                  flex item is what lets `truncate` actually clip — without
                  it the address would push the card past viewport. */}
              <p className="text-sm text-slate-500 flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{loc.addressLine1}, {loc.city}, {loc.stateCode}{loc.postalCode ? ` ${loc.postalCode}` : ""}</span>
              </p>

              {minPriceMinor != null && (
                <p className="text-sm font-semibold text-slate-700">From {formatCurrency(minPriceMinor)}</p>
              )}
            </>
          )}
        </div>
      </Card>
    );

    return (
      <motion.div key={loc.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
        {incompatible ? (
          <div className="block">{cardInner}</div>
        ) : (
          <Link href={`/location/${loc.id}`} className="block">{cardInner}</Link>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Active vehicle pill — primary affordance for swapping the
          active vehicle. The persistent "Some locations don't fit"
          banner that used to live below it is gone — per-card "No
          bay fits" badges already communicate this contextually. */}
      <div className="flex items-center gap-3 max-w-full">
        <div className="min-w-0 max-w-full">
          <ActiveVehiclePill />
        </div>
      </div>

      {/* Slim search bar — Uber-style. ~60px tall, full bleed minus the
          layout's outer p-4. No hero card, no headline, no description.
          The first listing renders above the fold at 375px. */}
      <form
        onSubmit={(e) => { e.preventDefault(); refetch(); }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <Input
          placeholder="Find a wash near you"
          className="h-12 pl-11 pr-12 text-base rounded-2xl border-2 border-slate-200 bg-white focus-visible:border-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      {geoStatus === "denied" && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <Navigation className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-amber-800">
            <span className="font-semibold">Enable location services</span> to sort by distance.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Filter strip: three chips in one row, scrollable if a future
            translation makes them not fit. Each chip is compact (px-3
            py-2) so all three fit at 375px without wrapping. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            <button
              onClick={() => { if (!filterAvailNow) setFilterOpenNow(!filterOpenNow); }}
              disabled={filterAvailNow}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium border transition-all ${
                filterAvailNow
                  ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                  : filterOpenNow
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-slate-600 border-border hover:border-slate-300"
              }`}
            >
              {filterOpenNow && !filterAvailNow && <X className="h-3.5 w-3.5" />}
              Open Now
            </button>
            <button
              onClick={() => {
                const next = !filterAvailNow;
                setFilterAvailNow(next);
                if (next) setFilterOpenNow(false);
              }}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium border transition-all ${
                filterAvailNow
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-slate-600 border-border hover:border-slate-300"
              }`}
            >
              {filterAvailNow ? <X className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              Avail Now
              {filterAvailNow && availNowLoading && (
                <span className="ml-1 h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
              )}
            </button>
            <button
              onClick={() => setFilterTopRated(!filterTopRated)}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium border transition-all ${
                filterTopRated
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-slate-600 border-border hover:border-slate-300"
              }`}
            >
              {filterTopRated ? <X className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
              Top Rated
            </button>
          </div>
          {/* List/map toggle — desktop-only on mobile-tight layouts.
              The result count moves to a sub-header below to free row
              space for filters. */}
          <div className="hidden sm:flex bg-slate-100 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Map className="h-4 w-4" /> Map
            </button>
          </div>
        </div>

        {/* Mobile list/map switch + count: on mobile the toggle moves
            here below the filter strip so the filter row is free for
            three full chips. md+ keeps the toggle inline with filters. */}
        <div className="flex items-center justify-between sm:hidden">
          <span className="text-xs font-medium text-slate-500">
            {filtered.length} location{filtered.length === 1 ? "" : "s"}
          </span>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <Map className="h-3.5 w-3.5" /> Map
            </button>
          </div>
        </div>

        {isError ? (
          <ErrorState message="Could not load wash locations." onRetry={() => refetch()} />
        ) : isLoading ? (
          viewMode === "map" ? (
            <div className="h-[400px] rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-64 animate-pulse bg-slate-100 border-none" />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
            <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No locations found</h3>
            <p className="text-slate-500">
              {filterTopRated ? "No locations with 4.0+ rating match your filters." : filterAvailNow ? "No locations have wash bay availability this hour. Try removing the filter." : filterOpenNow ? "No locations are open right now. Try removing the filter." : "Try adjusting your search terms"}
            </p>
          </div>
        ) : viewMode === "map" ? (
          <div>
            <LocationMap
              locations={allSorted}
              onLocationClick={(id) => setLocation(`/location/${id}`)}
              className="mb-6"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allSorted.map((loc) => (
                <Link key={loc.id} href={`/location/${loc.id}`} className="block">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
                    <div className={`p-2 rounded-lg shrink-0 ${loc.isOpen ? "bg-emerald-50" : "bg-slate-50"}`}>
                      <MapPin className={`h-4 w-4 ${loc.isOpen ? "text-emerald-600" : "text-slate-400"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm truncate">{loc.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {loc.city}, {loc.stateCode}
                        {loc.distance != null && ` · ${formatDistance(loc.distance)}`}
                      </p>
                    </div>
                    {loc.isOpen ? (
                      <Badge className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200 text-xs shrink-0">Open</Badge>
                    ) : (
                      <Badge className="ml-auto bg-slate-50 text-slate-500 border-slate-200 text-xs shrink-0">Closed</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          // Tighter gap on mobile (gap-3) so 4-5 cards fit in a phone scroll;
          // desktop keeps the breathing room (gap-4). Single column at every
          // mobile width — the cards are wide-form, not grid tiles.
          <div className="space-y-6">
            {nearbyLocations.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {nearbyLocations.map((loc, idx) => renderLocationCard(loc, idx))}
              </div>
            )}

            {previousLocations.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Your Previous Wash Locations</h2>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {previousLocations.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {previousLocations.map((loc, idx) => renderLocationCard(loc, idx))}
                </div>
              </div>
            )}

            {nearbyLocations.length === 0 && previousLocations.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {allSorted.map((loc, idx) => renderLocationCard(loc, idx))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
