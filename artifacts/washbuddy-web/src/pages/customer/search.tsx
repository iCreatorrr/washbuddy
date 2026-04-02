import React, { useState, useEffect, useMemo } from "react";
import { useSearchLocations, useListBookings, useGetAvailableNowLocations } from "@workspace/api-client-react";
import { Card, Input, Button, Badge, ErrorState } from "@/components/ui";
import { MapPin, Search, Navigation, Map, List, Clock, Filter, X, Zap } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import LocationMap from "@/components/location-map";
import { useAuth } from "@/contexts/auth";

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
  operatingWindows?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  isOpenNow?: boolean;
  nextOpenAt?: string | null;
  distance?: number;
  isOpen: boolean;
};

export default function CustomerSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterAvailNow, setFilterAvailNow] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useSearchLocations(
    {},
    { request: { credentials: "include" }, query: { enabled: true, staleTime: 60_000 } }
  );
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
      };
    });
  }, [data, userLat, userLng]);

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
    return result;
  }, [enrichedLocations, searchTerm, filterOpenNow, filterAvailNow, availNowIds]);

  const sortByDistance = (a: LocationWithMeta, b: LocationWithMeta) => {
    if (a.distance != null && b.distance != null) return a.distance - b.distance;
    if (a.distance != null) return -1;
    if (b.distance != null) return 1;
    return a.name.localeCompare(b.name);
  };

  const nearbyLocations = useMemo(() => {
    const sorted = [...filtered].filter((l) => !previousLocationIds.has(l.id));
    sorted.sort(sortByDistance);
    return sorted;
  }, [filtered, previousLocationIds]);

  const previousLocations = useMemo(() => {
    if (previousLocationIds.size === 0) return [];
    const sorted = [...filtered].filter((l) => previousLocationIds.has(l.id));
    sorted.sort(sortByDistance);
    return sorted;
  }, [filtered, previousLocationIds]);

  const allSorted = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort(sortByDistance);
    return sorted;
  }, [filtered]);

  const renderLocationCard = (loc: LocationWithMeta, idx: number) => (
    <motion.div key={loc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
      <Link href={`/location/${loc.id}`} className="block h-full">
        <Card className="h-full flex flex-col group cursor-pointer border-2 hover:border-primary/30">
          <div className="p-6 flex-1">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">{loc.provider?.name}</Badge>
                {loc.isOpen ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <Clock className="h-3 w-3 mr-1" />Open Now
                  </Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-500 border-slate-200">
                    Closed{loc.nextOpenAt ? ` · Opens ${new Date(loc.nextOpenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                  </Badge>
                )}
              </div>
              <div className="bg-slate-50 p-2 rounded-full text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors">
                <Navigation className="h-4 w-4" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{loc.name}</h3>
            <p className="text-slate-500 flex items-start gap-2 text-sm leading-relaxed">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {loc.addressLine1}
                <br />
                {loc.city}, {loc.stateCode} {loc.postalCode}
              </span>
            </p>
            {loc.distance != null && (
              <p className="mt-2 text-sm font-semibold text-purple-600 flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" />
                {formatDistance(loc.distance)} away
              </p>
            )}
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Available Services</p>
            <div className="space-y-2">
              {loc.services?.slice(0, 2).map((svc) => (
                <div key={svc.id} className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-700">{svc.name}</span>
                  <span className="font-bold text-slate-900">{formatCurrency(svc.allInPriceMinor ?? svc.basePriceMinor)}</span>
                </div>
              ))}
              {(loc.services?.length || 0) > 2 && (
                <p className="text-xs text-primary font-semibold pt-1">+{(loc.services?.length || 0) - 2} more services</p>
              )}
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );

  return (
    <div className="space-y-8">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 text-white p-8 sm:p-12">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(59,130,246,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(6,182,212,0.3) 0%, transparent 40%)",
          }}
        />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4">Find your next wash</h1>
          <p className="text-lg text-slate-300 mb-8">Search our network of premium commercial bus washing facilities.</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search by facility name or city..."
                className="pl-12 h-14 text-lg bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus-visible:bg-white focus-visible:text-slate-900 transition-all rounded-2xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button
              size="lg"
              className="h-14 rounded-2xl px-8 shadow-blue-500/25"
              onClick={() => refetch()}
            >
              Search
            </Button>
          </div>
        </div>
      </div>

      {geoStatus === "denied" && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm">
          <Navigation className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-amber-800">
            <span className="font-semibold">Enable location services</span> to see wash facilities sorted by distance from you. Showing all locations alphabetically.
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold font-display text-slate-900">
              {userLat != null ? "Nearby Locations" : "Available Locations"}
            </h2>
            <button
              onClick={() => { if (!filterAvailNow) setFilterOpenNow(!filterOpenNow); }}
              disabled={filterAvailNow}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                filterAvailNow
                  ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                  : filterOpenNow
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {filterOpenNow && !filterAvailNow ? <X className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
              Open Now
            </button>
            <button
              onClick={() => {
                const next = !filterAvailNow;
                setFilterAvailNow(next);
                if (next) setFilterOpenNow(false);
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                filterAvailNow
                  ? "bg-amber-50 text-amber-700 border-amber-300 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {filterAvailNow ? <X className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              Wash Bay Avail this Hour
              {filterAvailNow && availNowLoading && (
                <span className="ml-1 h-3 w-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {filtered.length} found
            </span>
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <List className="h-4 w-4" />
                List
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Map className="h-4 w-4" />
                Map
              </button>
            </div>
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
              {filterAvailNow ? "No locations have wash bay availability this hour. Try removing the filter." : filterOpenNow ? "No locations are open right now. Try removing the filter." : "Try adjusting your search terms"}
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
          <div className="space-y-10">
            {nearbyLocations.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nearbyLocations.map((loc, idx) => renderLocationCard(loc, idx))}
              </div>
            )}

            {previousLocations.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold font-display text-slate-900">Your Previous Wash Locations</h2>
                  <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    {previousLocations.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {previousLocations.map((loc, idx) => renderLocationCard(loc, idx))}
                </div>
              </div>
            )}

            {nearbyLocations.length === 0 && previousLocations.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allSorted.map((loc, idx) => renderLocationCard(loc, idx))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
