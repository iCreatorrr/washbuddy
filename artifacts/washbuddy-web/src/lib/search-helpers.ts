/**
 * Free-text search helpers for nearby-mode location matching.
 *
 * Originally lived inline in `pages/customer/search.tsx`. Extracted
 * here so the merged `/find-a-wash` page (Phase B unified search
 * pill) can reuse the same metro/state alias logic without
 * duplicating the constants. `search.tsx` now imports from this
 * module too — deletion of `search.tsx` in Round 5 won't take this
 * logic with it.
 */

export const STATE_NAMES: Record<string, string> = {
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

export const METRO_ALIASES: Record<string, string[]> = {
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

export function resolveStateCode(term: string): string | null {
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

export type SearchableLocation = {
  name: string;
  city: string;
  addressLine1?: string;
  stateCode?: string;
  postalCode?: string;
};

export function matchesSearch(loc: SearchableLocation, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase().trim();

  const stateCode = resolveStateCode(t);
  if (stateCode) {
    return (loc.stateCode || "").toUpperCase() === stateCode;
  }

  const metroCities = METRO_ALIASES[t];
  if (metroCities) {
    const cityLow = loc.city.toLowerCase();
    return metroCities.some((alias) => cityLow.includes(alias));
  }

  const fields = [
    loc.name, loc.city, loc.addressLine1 || "", loc.stateCode || "", loc.postalCode || "",
  ].map((f) => f.toLowerCase());

  const terms = t.split(/\s+/);
  return terms.every((word) => fields.some((f) => f.includes(word)));
}
