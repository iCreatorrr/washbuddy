# WashBuddy — Search & Discovery Overhaul (EID)

**Document type:** Engineering Implementation Document. The working surface for build.

**Audience:** Claude Code, plus any human reviewing what Claude Code did.

**How to use this document:** Each round of implementation references specific sections by number. The prompt to Claude Code names the section and the scope; the agent reads the section during its audit step before writing code. This document supersedes earlier `EID.md` at the repo root.

**Read first:** `01-prd.md` (strategic rationale and decisions). The why-and-what governs the how-and-where here.

**Companion documents:**
- `03-service-taxonomy-decision.md` — schema decision that gates Round 0.
- `04-future-considerations.md` — out-of-scope future items (don't accidentally implement these).
- `05-visual-reference.md` — annotated visual specs. Each EID component spec references the corresponding visual section.

**Version:** v1.0. Updates to this document accompany changes to PRD or visual reference. Specs in `/docs` are canonical; any divergence between code and spec is treated as a bug. Update spec before changing code.

---

## Table of contents

1. [Stack and existing architecture](#1-stack-and-existing-architecture)
2. [Information architecture](#2-information-architecture)
3. [Component-level specs](#3-component-level-specs)
4. [Filter architecture](#4-filter-architecture)
5. [Service taxonomy and data dependencies](#5-service-taxonomy-and-data-dependencies)
6. [Implementation guidance per round](#6-implementation-guidance-per-round)
7. [Verification](#7-verification)

---

## 1. Stack and existing architecture

Per `02-engineering-state.md` (the project handoff doc, available in repo for additional context).

**Stack:**
- TypeScript / React frontend; Vite build; Wouter routing; TanStack Query; framer-motion; Tailwind CSS; lucide-react icons; shadcn-style components.
- TypeScript / Node backend; Express-style routes; Prisma ORM; PostgreSQL.
- Leaflet + OpenStreetMap tiles for maps; OSRM (`router.project-osrm.org`) for routing geometry and ETA Table API; Nominatim (OpenStreetMap) for autocomplete.
- pnpm workspaces monorepo: `artifacts/api-server`, `artifacts/washbuddy-web`, `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`.

**OpenAPI spec at `lib/api-spec/openapi.yaml`** is the API contract source of truth. Generated client to `lib/api-client-react/src/generated/`; generated Zod to `lib/api-zod/src/generated/`. Regenerate after every schema or contract change.

**Schema migrations via `prisma db push`** rather than versioned migrations. Boolean→enum and similar destructive changes require `--accept-data-loss`. Acceptable for pre-launch but should be considered carefully.

**Standard deploy sequence after schema change:**
```
pnpm install
pnpm --filter @workspace/db generate
pnpm --filter @workspace/db db:push   # or with --accept-data-loss for destructive changes
pnpm -F @workspace/api-server run build
pnpm -F @workspace/washbuddy-web run build
# restart api-server
```

**Auth pattern:** `authMiddleware` runs globally and attaches `req.user`. Routes that require auth use `requireAuth`. Routes where behavior differs by auth state read `req.user` directly without `requireAuth`.

**Existing pin selection model — must not regress.** The current route-planner.tsx had a multi-symptom bug where `activePinId` in the marker creation effect's deps array caused marker layer teardown on every selection change. The fix unified into a single `selectedLocationId` state with a separate selection effect using stable deps. This pattern is critical and detailed in §6.4 below.

---

## 2. Information architecture

### 2.1 Routes

| Old route | New behavior |
|---|---|
| `/search` | Permanent redirect to `/find-a-wash` |
| `/route-planner` | Permanent redirect to `/find-a-wash`, preserving the full querystring (existing route-planner params: `from`, `to`, `vehicleClass`) |
| `/find-a-wash` | New canonical merged page |

Note: actual route paths in `App.tsx` are `/search` and `/route-planner` (not `/customer/search` and `/customer/route-planner` as earlier drafts of this spec stated). The `customer/` segment exists in the page filenames under `pages/customer/`, not in the URL.

Wouter does not have a built-in `<Redirect>` component. Implementation pattern:

```tsx
<Route path="/route-planner">
  {() => {
    const [, setLocation] = useLocation();
    useEffect(() => {
      setLocation('/find-a-wash' + window.location.search, { replace: true });
    }, []);
    return null;
  }}
</Route>
```

For `/search` the same pattern applies without the querystring carry-over (search.tsx had no meaningful query params to preserve).

Verify the pattern against the project's existing redirect handling in `App.tsx` or wherever routes are registered.

### 2.2 Page state

The merged page has substantially more state than either old page. Use `useReducer` with an explicit state shape:

```ts
type FindAWashState = {
  // Search inputs
  origin: { type: 'geolocation' | 'address' | 'city'; lat: number; lng: number; label: string } | null;
  destination: { type: 'address' | 'city'; lat: number; lng: number; label: string } | null;
  arriveByTime: Date | null;  // null in nearby mode; computed default in route mode

  // Filters
  selectedServiceCategories: ServiceCategory[];  // from the picker
  openFilterEnabled: boolean;  // true by default
  sheetFilters: {
    availability: { availableNow: boolean; walkIns: boolean; open24_7: boolean };
    serviceDetails: string[];  // subcategory codes
    fuel: { diesel: boolean; def: boolean; highFlow: boolean };
    driverAmenities: { restroom: boolean; lounge: boolean; wifi: boolean; coffee: boolean; showers: boolean };
    coachAmenities: { overnightParking: boolean; shorePower: boolean; potableWater: boolean };
    repairFlags: string[];  // capability codes
    compliance: { certifiedDisposal: boolean };
    bayOverride: boolean;  // override the silent vehicle filter
  };
  sortBy: 'best-fit' | 'shortest-detour' | 'distance' | 'price' | 'rating';

  // UI state
  sheetState: 'peek' | 'default' | 'expanded';
  selectedLocationId: string | null;
  modalOpen: 'service-picker' | 'all-filters' | null;
  view: 'map' | 'list';
};
```

State persistence: URL-encode all of the above. On mount, hydrate state from URL. On state change, **replace** the URL (don't push) — back-nav doesn't unwind every filter toggle.

Active vehicle, geolocation, destination address autocomplete are global concerns and remain in their respective contexts (`useActiveVehicle`, etc.). They flow into the page's reducer via context.

### 2.3 Mode determination

```ts
const mode = state.destination ? 'route' : 'nearby';
```

This single derivation drives most of the mode-dependent behavior. Centralize it; don't recompute in multiple places.

### 2.4 Tier 0 — silent vehicle filter

Per PRD §4.5, the active vehicle drives a silent filter with two layers:

**Layer 1 — Bay-fit:**
A location is bay-compatible for the active vehicle if it has at least one active `WashBay` whose:
- `maxVehicleLengthIn >= vehicle.lengthInches`, AND
- `maxVehicleHeightIn >= vehicle.heightInches`, AND
- vehicle's derived class is in `supportedClasses[]`

**Layer 2 — Service-fit:**
A specific service at a location is bookable if `service.maxVehicleClass >= vehicle's derived class` (using the existing `deriveSizeClassFromLengthInches` helper).

Locations failing bay-fit (Layer 1) are visible but visually demoted:
- **Map:** light gray pin (`#E2E8F0`) with `#94A3B8` dashed outline. Same shape, smaller size (22×28px).
- **List:** sorted to bottom of results. Card uses `wb-bg-2` background. Amber warning chip with truck-with-X icon: "No bay fits big momma". See visual reference §8.3.
- **Tap:** opens explainer modal with bay vs vehicle dimensions. No booking CTA.

A persistent inline note appears at the bottom of the list when N≥1 locations fail bay-fit:

> ⓘ {N} nearby providers don't fit big momma · [Show]

Tapping "Show" expands those locations into the list. This makes the silent filter audible without polluting primary results.

Locations passing bay-fit but with the selected services failing service-fit appear normally; the per-service "doesn't fit" indicator surfaces in the booking flow (out of scope for this spec).

---

## 3. Component-level specs

### 3.1 Search header — two presentation modes

Visual reference: `05-visual-reference.md` §5.

The header has two presentation modes, parameterized by sheet state:

- **Collapsed mode** — sheet at peek state. Single floating pill consolidating vehicle + destination summary. Translucent backgrounds with backdrop-blur. ~96px total header height.
- **Expanded mode** — sheet at default or expanded state. Standard search card with vehicle pill above and three rows (origin, destination, time). ~166px total header height.

**No dedicated app bar zone.** The existing `<Layout>` shell's app bar is suppressed on this page. Replaced by:

- **Floating top-left button** (36×36px circle, white bg with backdrop-blur, soft drop shadow):
  - Logomark inside when `history.length <= 1` on mount (top-level entry). Tap does nothing or refreshes to default state.
  - Back chevron when `history.length > 1` on mount (came from another page). Tap pops nav stack.
- **Notification bell and hamburger menu** appear:
  - When sheet is at default or expanded state (i.e., user is in "browsing" mode).
  - Or when user taps the unified search pill in collapsed mode (which expands and reveals them).

**Header animation between modes:** parameterize header by sheet state. Use framer-motion `motion` components with shared `layoutId`s so the unified pill smoothly expands into the search card as the user drags. Single coordinated animation, not two separate ones.

**Implementation:** new component `artifacts/washbuddy-web/src/components/customer/find-a-wash-header.tsx`.

### 3.2 Map

Visual reference: `05-visual-reference.md` §4 (pins) and §5 (header overlay context).

Existing Leaflet map; this work doesn't change the underlying map library or tile provider.

**Pins:** new component, see §3.5.

**Route polyline (route mode only):**
- Stroke: `#2D6FE3` at 4px.
- White core overlay: 1px white at 50% opacity for legibility against varied tile backgrounds.
- Solid line when origin AND destination are confirmed addresses; dashed (8 4 dasharray) if either is approximate (geolocation or city-level).

**Origin marker:** white circle, 18px diameter, 2.5px green border (`#15803D`), 7px green center dot. Existing pattern; preserve.

**Destination marker:** same shape, red border and dot (`#B91C1C`).

**Map controls** — top-right edge, vertical column:
- Translucent white backgrounds (`rgba(255,255,255,0.96)`) with `backdrop-filter: blur(10px)`, 0.5px borders, soft drop shadows.
- Fullscreen toggle (top, ~130px from top of screen).
- Zoom in/out paired buttons (mid-right).
- Locate-me button (below zoom, with 6px gap, blue accent on icon to differentiate as action).

**"Search this area" button:**
- Floating pill in upper-middle of map.
- Visible only when user has panned/zoomed such that <50% of currently-listed locations are in visible bounds, AND there is at least one provider in the list.
- Tap behavior: the bottom-sheet list re-orders so providers closest to the visible bounds center surface at the top. The list scrolls to top so the new ordering is visible. The button hides. **Pin colors and cluster colors do not change.** No map repaint at all — the map's only visual response is the button hiding.
- Translucent white with backdrop-blur, soft drop shadow, ~40px tall.
- Should NOT be visible by default — it earns its place by user interaction.
- **Mental model:** "tell me about this area" (re-order the list) — not "show me only this area" (filter), not "highlight this area" (repaint). The user's pan + tap is a navigational hint about which providers they want to see first; the system uses it for list ordering only. Pin tier color is reserved for filter-relevance signals (Round 3) and vehicle compatibility (today).

**Empty-area state:**
When the user taps "Search this area" in a region containing zero providers from the current result set, an inline pill appears in the result list area of the bottom sheet:

- **Trigger:** `searchBoundsAnchor !== null` AND zero pins from the full `displayLocations` set fall inside the anchored bounds.
- **Copy:** "No providers in this area. Closest is **{N} {unit}** away." Distance is haversine from bounds center to the closest provider's lat/lng, rounded to whole units. Unit matches the active mode's card meta convention — `mi` in nearby mode (no destination set), `km` in route mode (destination set) — so the pill reads consistently with what the user is already seeing on cards.
- **CTA:** "Show closest →" — tapping clears `searchBoundsAnchor` and **zooms-and-centers** on the closest provider's lat/lng (`map.setView([lat, lng], 13, { animate: true })`). Zoom 13 surfaces the provider with surrounding neighborhood context, not buried at the edge of a too-zoomed-in viewport. Selection state is unchanged.
- **Placement:** inline in the bottom sheet's result-list area, above the cards. Not a floating toast.
- **Dismissal:** the pill dismisses naturally when the user pans/zooms such that providers reappear in bounds, OR when they tap "Show closest →", OR when `searchBoundsAnchor` clears for any other reason (origin/destination/route change).
- **No auto-pan on the original "Search this area" tap.** The user's tap is "tell me about this area," not "take me elsewhere." Auto-zoom-and-center happens only when they explicitly tap "Show closest →" — recovery, not default.

**Z-index hierarchy** (use CSS variables, not hardcoded values):

| Element | z-index var | Suggested value |
|---|---|---|
| Map tiles | `--z-map` | 0 |
| Route polyline | `--z-route` | 100 |
| Pin (incompatible/low) | `--z-pin-low` | 400 |
| Pin (mid-tier) | `--z-pin-mid` | 500 |
| Pin (top-tier) | `--z-pin-top` | 600 |
| Pin label | `--z-pin-label` | 700 |
| Map controls | `--z-map-control` | 800 |
| "Search this area" | `--z-map-cta` | 900 |
| Header (collapsed) | `--z-header` | 1000 |
| Bottom sheet | `--z-sheet` | 1100 |
| Modal overlay | `--z-modal-overlay` | 1100 |
| Modal sheet | `--z-modal` | 1200 |

Replace any hardcoded `z-50` etc. in route-planner.tsx with these tokens.

**Page layout — fixed-position with sheet-contained scroll (Round 2+3):**

`/find-a-wash` renders inside `<AppLayout noContentPadding>` (the prop suppresses the default `p-4 md:p-8 max-w-7xl mx-auto` content wrapper) and the page root is `position:fixed; inset:0; overflow:hidden`. The map fills the viewport behind a fixed-position header at `--z-header`; the bottom sheet is fixed at `--z-sheet`. The sheet's body wraps its children in a `flex-1 overflow-y:auto` div — that contained scroll is what allows the result list to scroll independently of the document. Without this, the document would scroll under the sheet (the "page-has-no-bottom" Bug 1 from CP3 v3 and earlier). Pages other than `/find-a-wash` do not opt into `noContentPadding`.

### 3.3 Bottom sheet

Visual reference: `05-visual-reference.md` §9.

New component: `artifacts/washbuddy-web/src/components/customer/search-bottom-sheet.tsx`. Reusable in case provider-side surfaces want similar treatment later.

Three states:

| State | Height | Header content | List visible |
|---|---|---|---|
| Peek | ~96px | Drag handle, count, view toggle | 0 cards |
| Default | ~50% viewport | Same as peek | Top 3-4 cards |
| Expanded | ~85% viewport | Peek header + small "Sorted by {sort}" line below count | Full list |

**State transitions:**

| From | Action | To |
|---|---|---|
| Any | Drag handle vertically and release | Snap to nearest state |
| Any | Drag handle with high velocity | Skip a state (peek↔expanded) |
| Any | Tap drag handle | Cycle peek → default → expanded → peek |
| Peek | Tap pin | Default |
| Default or Expanded | Tap pin | No state change; scroll/highlight matching card |
| Any | Tap empty map area | Deselect; no state change |
| Any | Tap List view tab | Expanded |
| Any | Tap Map view tab | Peek |

**Default state per mode:**
- Nearby mode → default.
- Route mode → peek.

**Drag implementation:** framer-motion `motion.div` with `drag="y"`, `dragConstraints={{ top: -X, bottom: 0 }}`, `onDragEnd` snap-to-nearest. Use `dragElastic={0.1}` for slight bounce. Velocity-aware snap: if `|info.velocity.y| > 500`, jump two states.

**Header content:**
- Left: count line — "{N} matches along route" (route mode) or "{N} wash spots near you" (nearby mode).
- Right: segmented Map/List toggle (small, 84×28px, `wb-bg-3` background with white pill on active side).

**Expanded state extra header line:**
Below the count, in 11px gray: "Sorted by best fit" (or "shortest detour", "distance", etc.). Tappable — opens the sort selector inline (the same Sort section from the all-filters sheet, but as a dropdown).

### 3.4 Result cards

Visual reference: `05-visual-reference.md` §8.

Single component used in both the bottom sheet (mobile) and the right rail (desktop). New component: `artifacts/washbuddy-web/src/components/customer/result-card.tsx`.

**Card structure:**

```
┌─[Rank col 32px]─┬─[Body 1fr]──────────────────────────────────[chevron]┐
│                  │ {Provider name}                                       │
│  [TOP] or "3"   │ {city} · {detour or distance bolded} · {arrival/done} │
│                  │ [svc][svc][svc][+N]                                  │
│                  │ ● {Open status}              {Est./From} ${price}    │
└──────────────────┴───────────────────────────────────────────────────────┘
```

**Rank column states:**
- Top-tier (top 3 by best-fit score): TOP badge — `#2D6FE3` background, white text, 9px / 500 / 0.4 letter-spacing, 4px corner radius.
- Numeric rank (4+): muted gray number ("3", "4", ...) in `wb-text-3`.
- Demoted (incompatible): info circle icon in `wb-text-3`.

**Rank vs. pin tier — distinct concepts:**

The result card's rank column is sort-position-driven: TOP for the top 3 by the active sort score (best-fit with stdev cutoff per §4.6 / direct-sort top 3), numeric for 4+, info-icon for incompatible. This is independent of pin tier classification (§3.5). A card can carry the TOP badge while its pin renders mid-tier (e.g., default mode with no filter context — every compatible pin is mid-tier, but the top-3 cards still show the TOP badge based on best-fit ordering). When filter context activates (Round 3 — service categories or sheet filters applied), pin tier promotes to top for the same top-3 set, so the two visuals re-align. Treat rank as "this card surfaces best for the active sort" and tier as "this pin matches your filter context"; they overlap when filters are present and diverge when they're not.

**Body content:**
- **Provider name** — 14px / 500 / `wb-text`. From `Location.name`.
- **Metadata line** — 11.5px / `wb-text-2`. Pattern depends on mode and state:
  - Nearby mode, no service: `{city} · {distance} mi`
  - Nearby mode, service selected: `{city} · {distance} mi · ★{rating} ({n})`
  - Route mode, no service: `{city} · +{detour} min detour`
  - Route mode, service selected: `{city} · +{detour} min detour · arrive {time}, done by ~{end time}`
  - **Detour text is bolded**: `+6 min detour` rendered with the "6 min detour" portion in `font-weight: 500 / wb-text` to draw the eye.
- **Service pills** — see §3.4.1 below.
- **Open status + price line** — see §3.4.2 below.

**Selected state:**
- Background: `wb-blue-50`.
- Left border: 3px solid `wb-blue` (replaces or supplements the existing amber border pattern from route-planner.tsx).
- Card padding-left increases by 3px to compensate so text alignment doesn't shift.

**Demoted state (incompatible):**
- Background: `wb-bg-2`.
- Provider name color: `wb-text-2` (not primary).
- Amber chip: `#FEF3C7` background, `#92400E` text, "No bay fits {vehicle}" with truck-with-X icon prefix.
- Chevron: `wb-text-3` (gray, not action color).

**Tap behavior:**
- Tap card body: select on map. Pin highlights, sheet stays at current state, map pans (no zoom change) if pin is off-screen.
- Tap chevron: navigate to location detail / booking flow.
- (Demoted card) Tap card body: opens explainer modal "Bay max length: 480in. {vehicle}: 560in." No booking CTA.

#### 3.4.1 Service pills

Small inline pills showing which of the user's selected services this provider offers.

| Pill state | Background | Text |
|---|---|---|
| Available (provider has it) | `#D1FAE5` | `#065F46` |
| Wanted but missing | `wb-bg-3` | `wb-text-3` strikethrough |
| Other available services (count) | `wb-bg-3` | `wb-text-2` |

Format: 10.5px / 500, 4px corner radius, 2px vertical / 6px horizontal padding.

Show 3 most relevant services + "+N" pill for the rest. "Most relevant" means: services the user selected, then services that are most differentiating (e.g., diesel + DEF if the user is in route mode and the location has both).

#### 3.4.2 Open status + price line

| Open state | Color | Text |
|---|---|---|
| Open at relevant time | `#15803D` (green) | "Open now" or "Open at 4:30 PM" |
| Closes within 1 hour of relevant time | `#B45309` (amber) | "Closes at 6:00 PM" |
| Closed at relevant time | `#B91C1C` (red) | "Closed" |

Colored dot prefix: same color as text, 6px diameter, 8px before text. Format: 11px / 500.

**Price label** (right-aligned, 13px / 500):

| Selection state | Label format |
|---|---|
| 0 services selected | (no price line — entire row collapses, just open status above) |
| 1 service selected | `From $XX` (10px "From" prefix in `wb-text-3`) |
| 2+ services selected | `Est. $XXX` (10px "Est." prefix in `wb-text-3`) |

The `From` price uses the minimum across the location's matching services. The `Est.` price uses the sum of base prices for selected services.

#### 3.4.3 Rating display gating

Star ratings (`★ 4.6 (23)`) appear on cards only when the provider has crossed a minimum review threshold (default: 5 reviews). Below threshold, no rating element renders — not even "No reviews yet."

Threshold is a feature flag / config value:
```ts
const RATING_DISPLAY_MIN_REVIEWS = 5;
```

Place in a frontend config file. Lower as review density grows.

When shown, rating appears in the metadata line after the open status, separated by `·`. E.g., `● Open at 4:30 PM · ★ 4.6 (23)`.

Tappable to open the existing reviews modal.

### 3.5 Pin component

Visual reference: `05-visual-reference.md` §4.

New component: `artifacts/washbuddy-web/src/components/customer/wash-pin.tsx`. Replaces inline pin creation in route-planner.tsx.

The pin is rendered as SVG. Leaflet integration uses `L.divIcon` with the SVG embedded in HTML.

**Pin tier classification:**

```ts
type PinTier = 'top' | 'mid' | 'low' | 'incompatible';

function classifyPin(location: Location, activeVehicle: Vehicle, mode: 'nearby' | 'route'): PinTier {
  if (!isBayCompatible(location, activeVehicle)) return 'incompatible';
  return 'mid';
}
```

**Default-mode tier rules (current — Round 2+3 consolidation):**
- Vehicle compatibility is checked first. Pins with no compatible bay for the active vehicle render at `incompatible` (gray with dashed outline) and the rest of the pipeline short-circuits.
- When the host passes filter context (`matchesAllSelectedServices` or `passesAllSheetFilters` defined), the classifier evaluates filter match: failing either check demotes to `low`, otherwise the rank-based top-3 cutoff promotes to `top` and the rest fall to `mid`.
- When the host doesn't pass filter context (both inputs undefined), all vehicle-compatible providers render at `mid` — the CP3 v3 baseline. This holds for any caller that doesn't yet wire filter UI.
- Round 4 introduces the dormant `detourMinutes > 20` rule for route-mode demotion to `low`.

**Runtime signature (Round 2+3):**

```ts
interface ClassifyPinInput {
  rankIdx: number;
  totalRanked: number;
  mode: 'nearby' | 'route';
  fitsActiveVehicle: boolean;
  matchesAllSelectedServices?: boolean; // when defined → fires filter-context tier rule
  passesAllSheetFilters?: boolean;      // when defined → fires filter-context tier rule
  detourMinutes?: number;               // reserved — Round 4 wires real detour
  inVisibleBounds?: boolean;            // RESERVED but not consumed; see below
}
```

The two filter-context inputs are independently optional. Either one being defined activates the filter-context branch — the host can pass just one if it wires only one of the two filter surfaces. Both undefined keeps the classifier in vehicle-compat-only baseline.

**Why `inVisibleBounds` is reserved-but-unused:**

CP1 introduced the input as an optional gate for "pins outside the user's anchored area visually de-prioritize." CP3 v1, v2, and v2 Hotfix all attempted to wire it; each attempt failed because the user's mental model treats viewport context as a list-ordering hint, not a map-repainting trigger. CP3 v3 removed the rule entirely. The signature retains the input for forward-compatibility — if a future round identifies a use case where viewport demotion *is* the right behavior (which would require explicit user research), the input is ready. Today: callers should not pass it.

**Pin sizes by tier:**
- Top: 32×40px, drop shadow `0 3px 6px rgba(15,23,42,0.20)`.
- Mid: 26×33px, drop shadow `0 2px 5px rgba(15,23,42,0.18)`.
- Low: 22×28px, no shadow.
- Incompatible: 22×28px, no shadow, dashed outline.

**Pin colors by tier:**
- Top: fill `#2D6FE3`, white 2px stroke.
- Mid: fill `#6B9AED`, white 2px stroke.
- Low: fill `#94A3B8`, white 1.8px stroke.
- Incompatible: fill `#E2E8F0`, `#94A3B8` 1.5px dashed stroke (`stroke-dasharray="2 1.5"`).

**Inner glyph: WashBuddy water-drop logomark (uniform across all pins).**

The logomark provides brand identity. Pin color encodes ranking (saturated blue / lighter blue / gray / dashed gray); price or detour label encodes decision-relevant information. Service category info lives in filter chips, card service pills, and detail pages — not in pin glyphs.

**Why not per-category glyphs:** UX research shows color is the strongest preattentive attribute for categorical encoding; shape is much weaker. At 32×40px pin sizes with 12-16px glyphs, abstract category icons (squeegee, drain, box) collapse into indistinguishable dark shapes inside the teardrop. Asking users to memorize 5 glyph-to-category mappings violates working memory norms (~7 item cap, with cognitive load rising sharply past 4-5). Category-leading map apps (PlugShare, GasBuddy, Airbnb) encode availability and ranking on pins, not category — category lives in filters and cards.

Operationally: most full-service bus washes offer 3-4 of the 5 service categories. There is no meaningful "primary service" to encode visually the way there is in gas vs. EV charging. Pins answering "does this match my filters" via color tier is the truthful encoding.

**Future consideration (Round 3+):** when filter chips and the service picker ship, a small numeric badge in the pin's lower-right corner could indicate "matches N of your filtered services" (e.g., "3/4" if the user filtered for 4 services and this provider offers 3). This is a layered badge, not a glyph replacement, and it's gated on filter UI existing. Worth piloting; not committed.

**Production note:** the visual reference uses a hand-drawn approximation of the WashBuddy logomark. Production should use the actual logomark SVG. Locate the asset in the repo (likely `artifacts/washbuddy-web/public/` or `src/assets/`); if unavailable, request from product before Round 1 ships.

**Pin labels:**

| Pin tier | Default zoom (<13) | Zoom ≥13 |
|---|---|---|
| Top | Always-visible saturated label: "+6 min" (route) or "$135" (nearby+service) | Same label, expanded: "Maple Leaf · +6 min" |
| Mid | None | Subtle white label with blue text: "+14m" or "$98" |
| Low | None | None |
| Incompatible | None | None |

Top-tier label: `#2D6FE3` background, white 10px / 500 text, 5px corner radius, 3×8px padding, drop shadow `0 2px 6px rgba(15,23,42,0.20)`. Positioned 22px above the pin's top edge.

Mid-tier label (zoom ≥13 only): `rgba(255,255,255,0.97)` background, `#1F52B0` 9.5px / 500 text, 5px corner radius, 2.5×7px padding, 0.5px `#E2E8F0` border, drop shadow `0 1px 3px rgba(15,23,42,0.12)`. Positioned 19px above the pin's top edge.

**Selected pin:**
- Gold ring: 3px solid `#FBBF24` around pin shape.
- Scale up: 1.15x.
- z-index raised to bring above neighboring pins.
- Label content unchanged.

**Pin clustering:** at zoom <11, pins within 40px of each other cluster. Use Leaflet.markercluster (BSD-2-Clause license, ~10KB gzipped — verify before committing). Cluster pin shows count and inherits the highest-relevance color of its members. Tap to expand (zoom in to next zoom level).

**Pin label collision:** at zoom ≥13 with mid-tier labels rendering, neighboring labels can overlap. Use a simple "hide closer labels" rule: for any two label rectangles that overlap, hide the one belonging to the lower-relevance pin. If both are same tier, hide the one further from map center.

### 3.6 Pin selection callout

Visual reference: `05-visual-reference.md` §12.

Replaces the Leaflet popup pattern. Renders as an absolutely-positioned div above the selected pin, in the map's coordinate space.

**Structure:**
- White card, 12px corner radius, drop shadow `0 4px 16px rgba(15,23,42,0.15)`.
- Pointing triangle below (12×12px rotated 45deg, same shadow).
- TOP badge + provider name + meta line (city + detour).
- Divider.
- Open status (left) + Book button (right).

**Book button:**
- 28px tall pill, `wb-blue` background, white 12px / 500 text.
- Tap navigates directly to booking flow (`/location/:id/book`).

**Tap behavior:**
- Tap card body (not the Book button): snap bottom sheet to default state, scroll matching card into view, leave callout visible.
- Tap Book button: navigate to booking.
- Tap empty map area or a different pin: close callout (deselect).

**Implementation:** new component `artifacts/washbuddy-web/src/components/customer/pin-callout.tsx`. Render conditionally based on `selectedLocationId`. Positioned via absolute `top` and `left` derived from the pin's lat/lng → map container coordinates.

### 3.7 Empty, loading, and error states

Visual reference: `05-visual-reference.md` §13.

**Loading states:**

| Surface | Skeleton |
|---|---|
| Initial page load | Map renders immediately (tile layer fades in). 3 skeleton cards in bottom sheet (gray bars at name + meta positions). Pin layer empty until first results arrive. |
| Detour-time computation | Cards in route mode show inline gray skeleton on the meta line. Card otherwise interactive. As detour values arrive, replace skeleton with bolded "+X min detour" text. |
| Filter change → result re-fetch | Sheet header count fades, shows spinner inline ("Loading 8 matches..."). Cards fade slightly. New cards fade in via TanStack Query's stale-while-revalidate behavior. |
| Map tile load | Tiles fade in over previous state, never blank tiles. |

Use TanStack Query's `isPending` (first load) and `isFetching` (background refetch) to distinguish heavy vs subtle loading treatment.

**Empty states:**

| Scenario | Treatment |
|---|---|
| Zero results match active filters | Inline below sheet header: small illustration, "No washes match your filters" message, "Clear filters" CTA. |
| User has no active vehicle | Block search experience entirely. Centered message: "Add your first vehicle to see compatible washes." CTA → My Vehicles. |
| Geolocation denied | Top banner: "Couldn't get your location. Search by city instead." Origin field becomes editable. |
| Geocoding failed on destination input | Inline error on destination field: "We couldn't find that location. Try a different address." |
| Network unavailable | Toast at bottom: "You're offline. Showing cached results from {time}." If no cache: full-page error with retry. |

**Error states:**

| Scenario | Treatment |
|---|---|
| OSRM route computation failed | Top banner: "Couldn't compute route. Showing locations near you instead." Falls back to nearby mode. |
| Detour-time API failed | Falls back to ETA-from-origin + distance × multiplier as approximation. Cards show "+~12 min detour" with `~` indicating approximation. Toast: "Detour times are approximate." |
| Specific location detail fetch failed | Card shows but with grayed-out CTA. "Couldn't load details. Tap to retry." |

### 3.8 Navigation and back-button behavior

Per PRD §4 / addressed at component level here.

**Back button progressively unwinds search state:**

| Current state | Back action |
|---|---|
| Modal sheet open | Closes modal; URL doesn't change |
| Bottom sheet expanded | Collapses to default state; URL doesn't change |
| Route mode with destination set | Clears destination; reverts to nearby mode; URL replaced |
| Nearby mode (no destination) | Pops nav stack — exits page |

URL state encoding must support this. Each state change replaces (not pushes) the URL until the user truly navigates away.

**Top-left button on this page:**

```ts
useEffect(() => {
  // history.length is the heuristic — tune based on Wouter's actual API
  const isTopLevelEntry = history.length <= 1;
  setShowLogomark(isTopLevelEntry);
}, []);
```

- Logomark → tap does nothing or refreshes to default state (clears destination, filters).
- Back chevron → tap pops nav stack normally.

**On detail surfaces (location detail, booking detail) — out of scope but worth noting:** always show back chevron. Tap returns to merged search page with state preserved. URL state must preserve filter/destination/scroll position.

**On modal surfaces:** modals do NOT push routes. Their open/close state is local UI state. Pressing device back on Android closes modal but does not pop route.

### 3.9 Accessibility

- Tap targets ≥44×44px on all interactive elements (iOS HIG). Existing design system Button is 36px — known tech debt. Set min-height 44px directly on new components; do not inherit.
- When a modal sheet opens, focus moves to the sheet's first interactive element. Tab order stays within the sheet until closed (use `focus-trap-react` or equivalent). On close, focus returns to the chip that opened it.
- `aria-live="polite"` on the result count element so screen readers announce filter changes: "Now showing 8 matches."
- Color is never the only signal: pin tier supplemented by size and label prominence; open-status colored dots paired with text labels; service pills have text + green tint, not green tint alone.
- Keyboard navigation on desktop: chips and result cards reachable via Tab. Pin layer focusable via roving Tab within map. Enter on card opens detail; Enter on pin selects it.

---

## 4. Filter architecture

### 4.1 Tier 1 chip row

Visual reference: `05-visual-reference.md` §6.

Three chips in the row, sized to fit at viewports ≥360px without horizontal scroll. New component: `artifacts/washbuddy-web/src/components/customer/filter-chips.tsx`.

| Chip | Position | Tap action |
|---|---|---|
| Service Type | Left | Opens service picker sheet |
| Open at arrival / Open now | Middle | Toggle (no sheet) |
| Filters | Right (margin-left: auto) | Opens all-filters sheet |

**Service Type — adaptive label:**

```ts
function getServiceTypeLabel(selected: ServiceCategory[]): string {
  if (selected.length === 0) return 'Services';
  if (selected.length === 1) return CATEGORY_SHORT_NAMES[selected[0]];
  if (selected.length === 2) return selected.map(c => CATEGORY_SHORT_NAMES[c]).join(', ');
  return `${CATEGORY_SHORT_NAMES[selected[0]]} + ${selected.length - 1} more`;
}

const CATEGORY_SHORT_NAMES = {
  EXTERIOR_WASH: 'Wash',
  INTERIOR_CLEANING: 'Interior',
  RESTROOM_DUMP: 'Dump',
  RESTOCK_CONSUMABLES: 'Restock',
  ADD_ON: 'Add-ons',
};
```

Visual state: solid blue (`wb-blue` background, white text) when any selected; white outline (`wb-bg`, `wb-border-2` border, `wb-text` color) when default. Chevron always present.

**Open at arrival / Open now:**
- Default ON.
- Label: `● Open at arrival` (route mode) or `● Open now` (nearby mode). Green dot prefix `#15803D`.
- ON state: `wb-blue-50` background, `#93BBF6` border, `#1F52B0` text.
- OFF state: white background, `wb-border-2` border, `wb-text-2` text. Dot becomes gray `#94A3B8`.
- Tap toggles. No sheet.

**Filters:**
- White outline always.
- Filter icon prefix.
- Badge appears on right when ≥1 sheet filter is active. Badge: `wb-blue` background, white 9px / 500 text, 14px diameter.
- Tap opens all-filters sheet.

### 4.2 Service picker sheet

Visual reference: `05-visual-reference.md` §10.

Modal bottom sheet. New component: `artifacts/washbuddy-web/src/components/customer/service-picker-sheet.tsx`.

**Five categories** (in order):
1. Exterior wash — Blue 50 icon bg / Blue 800 icon
2. Interior cleaning — Amber 50 / Amber 800
3. Restroom dump — Teal 50 / Teal 800
4. Restock & consumables — Purple 50 / Purple 800
5. Add-ons — Pink 50 / Pink 800

Each row:
- 36×36px icon container with 9px corner radius
- Category name (14px / 500)
- Subcategory hint text (11px / 400 / `wb-text-2`)
- Match count pill (`wb-bg-3` background, `wb-text-3` 11px text, 22×20 px, 10px corner radius)
- Selection checkmark (20×20 circle, `wb-blue` filled when selected with white check inside, white with `wb-border-2` outline when unselected)

Counts update live as user toggles, factoring in other applied filters.

**Apply button:**
- Full width minus 16px left/right padding
- 46px tall, 12px corner radius
- `wb-blue` background, white 14px / 500 text
- Label: "Apply ({count} matches{ along route})" — appends "along route" in route mode

Closes the sheet and applies selections.

**Critical dependency:** count + filter logic requires the service taxonomy from `03-service-taxonomy-decision.md`. Round 0 must complete first.

### 4.3 All-filters sheet

Visual reference: `05-visual-reference.md` §11.

Modal bottom sheet, max-height 85% viewport. New component: `artifacts/washbuddy-web/src/components/customer/all-filters-sheet.tsx`.

**Header:**
- "All filters" title (17px / 500)
- "{N} active" subtitle (11px / `wb-text-2`)
- Save button (right side, 64×22px outlined pill, save icon + "Save" text). Phase 2 stub — render in Round 3 but tap shows toast: "Saved searches coming soon."

**Sections** (in order, with default expansion state):

| # | Section | Default | Notes |
|---|---|---|---|
| 1 | Sort by | Always visible (no collapse) | Single-select radio. Options conditional on mode and review density. |
| 2 | Availability | Expanded | Available now, Walk-ins accepted, Open 24/7 |
| 3 | Service details | Collapsed (auto-expands if Service Type chip has selections) | Subcategories from service-taxonomy suggested values |
| 4 | Fuel & convenience | Collapsed | Diesel, DEF, high-flow truck pumps |
| 5 | Driver amenities | Collapsed | Restroom, lounge, Wi-Fi, coffee, showers |
| 6 | Coach amenities | Collapsed | Overnight parking, shore power 50A, potable water fill |
| 7 | Repair & roadside | Collapsed (LISTING ONLY tag on header) | Mobile repair, tire, A/C, electrical, towing, replacement bus, engine specialty |
| 8 | Compliance | Collapsed | Certified black-water disposal |
| 9 | Bay accommodation | Collapsed | Override silent vehicle filter |

**LISTING ONLY tag** (on Repair & roadside section header):
- 9px / 400 uppercase / 0.3px letter-spacing
- `wb-text-3` color
- `wb-bg-3` background, 1×6px padding, 4px corner radius

**Each filter option:**
- Standard checkbox (16×16px, accent color `wb-blue` when checked)
- Label (13px / 400 / `wb-text`)
- Match count (right-aligned, 11px / `wb-text-3`)

**Disabled options** (filter would result in 0 matches given current other filters):
- Checkbox grayed out, not interactive.
- Label `wb-text-3`.
- Count: strikethrough.
- Cursor: not-allowed.

**Footer (sticky bottom):**
- Clear all (left, 1/3 width, transparent with `wb-border-2` border, 13px / 500 / `wb-text`)
- Apply ({N} matches) (right, 2/3 width, `wb-blue` background, white 14px / 500)
- Both 44px tall, 12px corner radius.

Apply button count updates live as filters change inside the sheet.

### 4.4 Active filter pills

Visual reference: `05-visual-reference.md` §7.

Below the Tier 1 chip row when any sheet filters are active. New component: `artifacts/washbuddy-web/src/components/customer/active-filter-pills.tsx`.

Each pill: `wb-bg-3` background, 11px / 500 / `wb-text-2` text, 11px corner radius, label + × button. Tap × removes that single filter and re-runs search.

Tier 1 chip filters (Service Type, Open, Filters) do NOT appear as separate pills — they're already visible in the chip row.

Sort changes do not appear as a pill — sort is presentation order, not filtering. Current sort is shown in the bottom sheet's expanded-state header instead.

Pills wrap to multiple lines at narrow viewports. No horizontal scrolling.

### 4.5 Over-filter guardrail

When applied filters reduce result count below 5, show inline warning:

> ⚠ Only {N} matches with current filters · [Show all]

Position: bottom of bottom sheet header (or top of result list in expanded state).

"Show all" link clears all filters except:
- Tier 0 vehicle filter (absolute — never cleared automatically)
- Service Type chip (the user's primary stated need)

All other filters reset.

### 4.6 Sort scoring formula

For "Best fit for route" sort, composite ranking:

```ts
function bestFitScore(loc: Location, ctx: SearchContext): number {
  return (
    0.50 * normalize(loc.detourMinutes, ctx.allDetours) +
    0.25 * (1 - serviceMatchFraction(loc, ctx.selectedServices)) +
    0.125 * normalize(loc.estimatedPrice, ctx.allPrices) +
    0.125 * (1 - normalizeRating(loc.rating, RATING_DISPLAY_MIN_REVIEWS))
  );
}
```

Lower score = better. Cards present in score order.

Weights are config values, not hardcoded constants. Tuning happens with usage data; the formula above is a v1 starting point.

**TOP badge logic:**
- Top-tier badge applied to cards with score within 1 standard deviation of the best score, **capped at 3 cards**.
- If only one card is meaningfully better than the rest, only one gets TOP.
- If five cards cluster tightly at the top, only the top 3 get TOP and 4-5 get numeric ranks.

Implementation: compute `bestScore` and `stdDev` across the result set; iterate cards in order; for the first 3 cards, if `score <= bestScore + stdDev`, badge as TOP; else number them.

---

## 5. Service taxonomy and data dependencies

### 5.1 Schema migration (Round 0)

Per `03-service-taxonomy-decision.md`. Required schema changes to `lib/db/prisma/schema.prisma`:

```prisma
enum ServiceCategory {
  EXTERIOR_WASH
  INTERIOR_CLEANING
  RESTROOM_DUMP
  RESTOCK_CONSUMABLES
  ADD_ON
}

model Service {
  // ... existing fields preserved ...
  category    ServiceCategory  @default(EXTERIOR_WASH) @map("category")
  subcategory String?          @map("subcategory")
  labels      String[]         @default([]) @map("labels")
}
```

`@default(EXTERIOR_WASH)` keeps the migration non-destructive. Existing rows get the default; backfill follows.

**Backfill strategy:**

```ts
// Run as a seeded script after the migration
const KEYWORD_RULES: Array<[RegExp, ServiceCategory]> = [
  [/\b(wash|exterior|hand|drive.through|two.step|pressure)\b/i, 'EXTERIOR_WASH'],
  [/\b(interior|vacuum|detail|carpet|upholster)\b/i, 'INTERIOR_CLEANING'],
  [/\b(dump|toilet|black.water|holding|chemical)\b/i, 'RESTROOM_DUMP'],
  [/\b(restock|water|coffee|toilet.paper|consumable)\b/i, 'RESTOCK_CONSUMABLES'],
];

for (const service of services) {
  const matched = KEYWORD_RULES.find(([rx]) => rx.test(service.name));
  service.category = matched ? matched[1] : 'EXTERIOR_WASH'; // safe default
  // Flag for manual review if name doesn't match any rule clearly
}
```

Round 0 includes a manual review step: list every backfilled service with its inferred category, flag ambiguous cases, get sign-off before unblocking the search work.

**Suggested subcategory values** — frontend constants file at `artifacts/washbuddy-web/src/lib/service-taxonomy.ts`:

```ts
export const SUGGESTED_SUBCATEGORIES: Record<ServiceCategory, string[]> = {
  EXTERIOR_WASH: ['drive-through', 'hand-wash', 'hand-wash-with-dry', 'two-step', 'pressure-only', 'mobile'],
  INTERIOR_CLEANING: ['turn-clean', 'standard', 'deep-detail'],
  RESTROOM_DUMP: ['pump-only', 'pump-and-refresh'],
  RESTOCK_CONSUMABLES: [],
  ADD_ON: ['wax', 'ceramic-coat', 'vinyl-wrap'],
};

export const CATEGORY_DISPLAY_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: 'Exterior wash',
  INTERIOR_CLEANING: 'Interior cleaning',
  RESTROOM_DUMP: 'Restroom dump',
  RESTOCK_CONSUMABLES: 'Restock & consumables',
  ADD_ON: 'Add-ons',
};

export const CATEGORY_SHORT_NAMES: Record<ServiceCategory, string> = {
  EXTERIOR_WASH: 'Wash',
  INTERIOR_CLEANING: 'Interior',
  RESTROOM_DUMP: 'Dump',
  RESTOCK_CONSUMABLES: 'Restock',
  ADD_ON: 'Add-ons',
};
```

### 5.2 Detour-time computation backend

True detour time = `route(origin → location → destination).duration - route(origin → destination).duration`.

This requires per-location OSRM `route` calls, which are expensive. Recommended implementation:

**New backend endpoint:**
```
POST /api/locations/with-detour-times
Body: {
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  locationIds: string[]  // candidates already filtered server-side
}
Response: {
  detours: Array<{
    locationId: string,
    detourMinutes: number,
    isApproximation: boolean
  }>
}
```

**Caching strategy:**
- Cache key: hash of `(originLat, originLng, destLat, destLng, locationId)` rounded to 0.001 lat/lng precision.
- TTL: 1 hour for production, 5 minutes for dev/staging.
- Cache layer: Redis if already in stack, otherwise in-memory LRU keyed at the request-handler level (acceptable for v1; document the upgrade path).

**OSRM Table API option:** OSRM supports table-with-route in some builds. Verify the OSRM build (`router.project-osrm.org` or self-hosted) supports this and whether it's faster than per-location route calls. If yes, use it; if no, parallelize per-location route calls with a Promise pool of size 5.

**Production OSRM:** the public `router.project-osrm.org` endpoint has rate limits and is not for production. Self-host OSRM (Docker image readily available, ~30GB of region data per continent). For dev, public endpoint is fine.

**Client-side fallback:** if the detour endpoint fails or times out >2 seconds, fall back to ETA-from-origin + distance-from-route × multiplier (1.4 is a reasonable starting multiplier — verify empirically). Mark the result as `isApproximation: true`. Cards render the detour as `+~12 min detour` with `~` prefix. Toast appears: "Detour times are approximate."

**Engineering spike recommendation:** a backend spike running in parallel with Round 1 should validate the OSRM Table API availability, the per-route call cost, and the caching architecture before Round 4 commits. Spike output: documented architecture decision.

### 5.3 Repair & roadside flags — informational only

Per PRD §4.10. Schema addition:

```prisma
model LocationCapability {
  id          String   @id @default(uuid()) @db.Uuid
  locationId  String   @map("location_id") @db.Uuid
  capability  String   @map("capability")
  notes       String?
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  location    Location @relation(fields: [locationId], references: [id])

  @@unique([locationId, capability])
  @@index([capability])
  @@map("location_capabilities")
}
```

`capability` is a string (not enum) for flexibility — allows new capabilities to be added without schema migration. Recommended values:

```ts
export const CAPABILITIES = [
  'MOBILE_REPAIR', 'TIRE_REPAIR', 'AC_SERVICE', 'ELECTRICAL', 'TOWING',
  'REPLACEMENT_BUS', 'ENGINE_DETROIT', 'ENGINE_CUMMINS', 'ENGINE_VOLVO',
  'ENGINE_ALLISON', 'HIGH_FLOW_PUMPS', 'CERTIFIED_DISPOSAL'
] as const;
```

Surfaces:
- All-filters sheet "Repair & roadside" section (with LISTING ONLY tag).
- Location detail page (out of scope for this PRD but coordinated): "This location also offers: AC service · Tire repair · Mobile dispatch."

CTAs for these capabilities on the location detail page are phone-call links, not booking buttons.

---

## 6. Implementation guidance per round

### 6.1 Round 0 — Service taxonomy migration

**Scope:**
- Add `ServiceCategory` enum and three new fields on `Service` model per §5.1.
- Backfill existing test data via keyword matching script.
- Update OpenAPI spec at `lib/api-spec/openapi.yaml` to expose the new fields on Service responses.
- Regenerate API client (`pnpm --filter @workspace/api-spec codegen` or equivalent).
- Create frontend constants file at `artifacts/washbuddy-web/src/lib/service-taxonomy.ts`.
- Update provider-side service-creation form (`artifacts/washbuddy-web/src/pages/provider/...`) to add a category dropdown. Existing form is in the provider settings flow.

**Out of scope:**
- Search UI changes — Service Type chip uses existing freeform `Service.name` until Round 1.
- Booking flow changes.
- Anything else.

**Verification:**
- Schema migrates cleanly.
- Generated client compiles.
- Provider service creation works with category dropdown.
- Existing services are correctly categorized (manual review).
- TypeScript: no new errors.

**Don't-regress items:**
- All existing booking, review, and provider flows continue to work.
- Existing Service.name is not changed by the migration.

### 6.2 Round 1 — Page merge, pin component, hamburger nav

**Scope:**
- Create new page `artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx`. Start as a clone of the most-recent `route-planner.tsx`.
- Create new component `artifacts/washbuddy-web/src/components/customer/wash-pin.tsx` per §3.5. Replace inline pin creation in the new page.
- Add the "search this area" button per §3.2.
- Add pin labels at zoom thresholds per §3.5.
- Add pin clustering per §3.5 (Leaflet.markercluster).
- Add redirects from `/search` and `/route-planner` to `/find-a-wash` (preserving the route-planner querystring so `?from=&to=` round-trip).
- Update `artifacts/washbuddy-web/src/components/layout.tsx` hamburger menu: replace "Find a Wash" + "Route Planner" with single "Find a Wash" entry pointing to `/find-a-wash`. Add stub "Saved" entry pointing to a placeholder page.
- Implement floating logomark/back button per §3.8.
- New page works in nearby mode (no destination) and route mode (with destination), with the correct mode-determined behavior (sort, distance metric, time selector visibility, etc.).

**Out of scope:**
- Bottom sheet (still uses the centered-popup or inline-popup pattern from route-planner.tsx — Round 2 replaces this).
- Filter chip changes (still 5 chips like the original — Round 3 reduces to 3).
- Detour time computation (placeholder values acceptable — Round 4 adds the real backend).
- Old `search.tsx` and `route-planner.tsx` are NOT deleted yet (Round 5 deletes them after migration window).
- Booking flow changes.
- Saved search functionality (just the menu item stub).

**Verification:**
- New page loads at `/find-a-wash` and renders correctly.
- Old URLs redirect.
- Pins render with correct tier classification, color, and glyph.
- Pin clustering works at low zoom.
- Pin labels appear at correct zoom thresholds.
- "Search this area" button appears when expected and re-queries correctly.
- Hamburger has the new menu structure.
- Floating top-left button shows logomark on top-level entry, back chevron when navigated to.
- Mobile verification at 320, 375, 414, 768, 1024, 1440 viewports.
- TypeScript: no new errors.

**Don't-regress items:**
- Pin selection model: marker creation effect deps do NOT include selection state. Selection effect uses stable deps. `fitBounds` does not run on selection changes.
- Existing geolocation auto-fires planRoute when destination is set.
- Defensive gate banner when user lands on a location they already have an upcoming booking at — preserve in the merged page.
- Existing search.tsx metro alias logic (STATE_NAMES, METRO_ALIASES, matchesSearch) — extract to `artifacts/washbuddy-web/src/lib/search-helpers.ts` and reuse in the merged page for nearby-mode city search. Don't discard.
- Active vehicle pill, hamburger menu single-state-owner pattern, all other shipped flows.

### 6.3 Round 2 — Bottom sheet

**Scope:**
- Create new component `artifacts/washbuddy-web/src/components/customer/search-bottom-sheet.tsx` per §3.3.
- Implement three states (peek, default, expanded) with framer-motion drag-to-snap.
- Implement state transitions per §3.3 transition table.
- Replace the old popup-on-pin pattern (centered-popup in search.tsx, inline-popup in route-planner.tsx) with the new sheet's pin-tap behavior.
- Integrate result-card component per §3.4 (basic version — full filter integration comes in Round 3).
- Implement pin selection callout per §3.6.
- Sheet header shows count + view toggle in peek; adds sort indicator in expanded state.
- Default state per mode (peek for route, default for nearby).

**Out of scope:**
- Filter chips and filter sheets (Round 3).
- Detour time integration (Round 4).
- Service taxonomy integration in cards (uses fallback labeling until Round 3 fully integrates).

**Verification:**
- Sheet drags smoothly between three states.
- Velocity-aware snap works (fast flick jumps a state).
- Tap on drag handle cycles states.
- Pin tap snaps from peek to default; stays put from default/expanded.
- Selected pin highlights matching card; card scrolls into view.
- Tap card body selects pin; tap chevron navigates.
- View tabs (Map/List) snap correctly.
- Pin callout opens on tap, points correctly to pin, closes on tap-elsewhere or different-pin tap.
- Mobile verification at all viewports including drag at 320px (drag handle reachable).

**Don't-regress items:**
- Pin selection model intact (single `selectedLocationId`, marker effect deps stable).
- All Round 1 features.

### 6.4 Round 3 — Filter architecture

**Scope:**
- Create components per §4: `filter-chips.tsx`, `service-picker-sheet.tsx`, `all-filters-sheet.tsx`, `active-filter-pills.tsx`.
- Reduce Tier 1 chips from existing 5 to new 3 (Service Type, Open, Filters). Move Sort and Avail Now into the all-filters sheet at top.
- Implement Service Type adaptive label per §4.1.
- Implement service picker sheet per §4.2.
- Implement all-filters sheet with all 9 sections per §4.3.
- Implement active filter pills row per §4.4.
- Implement over-filter guardrail per §4.5.
- Implement Save button stub per §4.3 (renders, taps show "coming soon" toast).
- Wire up sort scoring formula per §4.6.
- Service category integration with cards (service pills derive from `Service.category`).

**Out of scope:**
- Detour time real values (still placeholder — Round 4).
- Saved search persistence (just the stub).
- Provider profile photos (deferred).

**Verification:**
- Three chips fit on a single row at viewports ≥360px (no horizontal scroll).
- Service Type label adapts correctly across selection states.
- Service picker counts update live.
- All-filters sheet sections expand/collapse correctly. Default expansion state matches §4.3 table.
- Apply button match count updates live.
- Active filter pills appear when sheet filters active; removing via × works.
- Over-filter guardrail triggers when results <5.
- Sort scoring produces sensible orderings (manual review of ranking with test data).
- TOP badge logic distributes correctly across edge cases.
- Mobile verification at all viewports including filter sheet at 320px (two-column filter grids collapse to single column).
- Accessibility: focus management on modal open/close, aria-live announcements on result updates.

**Don't-regress items:**
- All Round 1 and Round 2 features.

### 6.5 Round 4 — Detour time and arrival logic

**Scope:**
- Engineering spike: validate OSRM Table API or per-route call architecture. Document decision.
- New backend endpoint `POST /api/locations/with-detour-times` per §5.2.
- Caching layer per §5.2.
- Fallback logic per §5.2.
- Frontend integration: call detour endpoint when in route mode; render real detour values on pins (top-tier label) and cards (bolded inline).
- Implement arrival-time selector per §3.1 expanded mode (native date/time picker on tap of the time chip).
- Implement "Open at arrival" semantics: filter to providers whose operating windows include the user's selected arrival time (computed against `OperatingWindow` records, accounting for timezone via `Location.timezone`).
- Implement "done by ~X PM" line on cards: arrival time + sum of selected service `durationMins`. Use simple parallelism model (sequential sum for now; v1.5 adds the parallelism capability flag — see `04-future-considerations.md` §2).

**Out of scope:**
- Real-time provider capacity (v2).
- Hours-of-service integration.
- Anything visual that wasn't already in scope from Rounds 1-3.

**Verification:**
- Detour endpoint returns correct values within 1 second for 50-location urban routes.
- Caching reduces repeated-route latency to <100ms.
- Fallback works when endpoint times out (cards show "+~12 min detour" with toast).
- Top-tier pin labels show real detour values.
- Card metadata lines show bolded "+X min detour" correctly.
- Arrival-time selector opens native picker.
- "Open at arrival" filtering correctly handles timezone (test with Pacific Coast and Eastern operators).
- "Done by" line computes correctly.
- TypeScript: no new errors.

**Don't-regress items:**
- All prior round features.
- The `available-now` query timezone bug from working notes is acknowledged but not in scope to fix here unless it blocks "Open at arrival" semantics.

### 6.6 Round 5 — Polish, file deletion, sweep

**Scope:**
- Delete `artifacts/washbuddy-web/src/pages/customer/search.tsx`.
- Delete `artifacts/washbuddy-web/src/pages/customer/route-planner.tsx`.
- Verify all routes redirected; no stale imports.
- Mobile verification sweep at 6 viewports.
- Edge case sweep per §3.7 (loading, empty, error states all implemented).
- Accessibility sweep per §3.9.
- Don't-regress sweep against full list (§6.7 below).
- Performance: initial map render <2s on typical mobile connection; detour fetch <1s for 50 locations.

**Out of scope:**
- New features.
- Backlog cleanup beyond what's in this PRD.

**Verification:**
- All checks listed above pass.
- TypeScript count is the same as before this work started (no net new errors).
- Live testing on Replit deploy: full user flow works end-to-end.

### 6.7 Don't-regress callouts (consolidated)

Across all rounds, these items must continue to work as they do today:

- Cancellation flow with reason capture, customer note surfacing, rebook CTA on PROVIDER_CANCELLED bookings.
- ReviewVote model + voting UI with optimistic updates.
- Hamburger menu single-state-owner pattern (no AnimatePresence exit on the hamburger icon).
- Receipt vehicle data integrity (read from booking record, not active vehicle context).
- My Bookings tab strip mobile fit + URL-driven active tab.
- Compact active vehicle pill rendering.
- Defensive gate banner when user lands on a location they already have an upcoming booking at — preserve. The banner is implemented in `pages/customer/location-detail.tsx` (the `/location/:id` page), not in the search/find-a-wash page itself. The merged search work doesn't touch that code path; verify navigation flows from the merged page still trigger the banner correctly.
- Pin selection model (single `selectedLocationId`, no marker-layer teardown).
- Existing search.tsx metro alias logic — extracted to utility module, not discarded.
- Booking flow detail screens.
- Provider-side surfaces.
- My Vehicles, Wash Requests pages.
- Auth, notifications, hamburger menu, all other shipped flows.

### 6.8 File-level summary

**New files:**
- `artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx`
- `artifacts/washbuddy-web/src/components/customer/find-a-wash-header.tsx`
- `artifacts/washbuddy-web/src/components/customer/search-bottom-sheet.tsx`
- `artifacts/washbuddy-web/src/components/customer/wash-pin.tsx`
- `artifacts/washbuddy-web/src/components/customer/pin-callout.tsx`
- `artifacts/washbuddy-web/src/components/customer/result-card.tsx`
- `artifacts/washbuddy-web/src/components/customer/filter-chips.tsx`
- `artifacts/washbuddy-web/src/components/customer/service-picker-sheet.tsx`
- `artifacts/washbuddy-web/src/components/customer/all-filters-sheet.tsx`
- `artifacts/washbuddy-web/src/components/customer/active-filter-pills.tsx`
- `artifacts/washbuddy-web/src/lib/service-taxonomy.ts`
- `artifacts/washbuddy-web/src/lib/search-helpers.ts` (extracted from search.tsx)
- `artifacts/api-server/src/routes/detour.ts` (or equivalent for the new endpoint)

**Files deleted (Round 5):**
- `artifacts/washbuddy-web/src/pages/customer/search.tsx`
- `artifacts/washbuddy-web/src/pages/customer/route-planner.tsx`

**Files modified:**
- `artifacts/washbuddy-web/src/components/layout.tsx` — hamburger menu changes (Round 1)
- `lib/db/prisma/schema.prisma` — service taxonomy + LocationCapability (Round 0)
- `lib/api-spec/openapi.yaml` — new endpoints, new fields (Rounds 0 and 4)
- `artifacts/api-server/src/routes/locations.ts` — new query params for filtering by category, capability (Round 4)
- App-level routing config — redirects (Round 1)

**Generated client regeneration required after every API spec change.** See §1 standard deploy sequence.

### 6.9 Brand and asset specifications

**Primary brand color:** `#2D6FE3` — sampled from existing app screenshots. This supersedes any earlier reference to `#185FA5` in the codebase. All new components use the new value. Existing components that reference the old value should not be changed in this scope unless they're part of the merged page.

**Pin SVG asset:** the inner glyph for the default water-drop pin variant should use the actual WashBuddy logomark. The asset should exist at `artifacts/washbuddy-web/public/logo.svg` or similar. If unavailable, request from product before Round 1 ships. The visual reference (`05-visual-reference.md` §4) uses an approximation.

**Service category color tokens** — the WashBuddy service color system, used consistently across pin glyphs, picker icons, filter section accents, location detail service lists:

| Category | Background (light) | Foreground |
|---|---|---|
| Exterior wash | `#DBEAFE` | `#1E40AF` |
| Interior cleaning | `#FEF3C7` | `#92400E` |
| Restroom dump | `#D1FAE5` | `#065F46` |
| Restock & consumables | `#EDE9FE` | `#5B21B6` |
| Add-ons | `#FCE7F3` | `#9D174D` |

---

## 7. Verification

After implementation:

1. **Unit and component tests** — bottom sheet states, pin tier classification, filter reducer logic, conditional pricing display, sort scoring formula edge cases.
2. **Visual verification at 6 viewports** — 320, 375, 414, 768, 1024, 1440. Concrete bounding-rect data per viewport. Tap targets ≥44px on all new components. Screenshots at 375px for the most-impacted views.
3. **Live testing on Replit deploy** — full user flow: nearby search → set destination → enter route mode → tap pin → drag sheet → filter → sort. Driver verifies; agent diagnoses any issues from screenshots.
4. **TypeScript** — no new TS errors (existing ~110-error backlog acknowledged but not in scope).
5. **Performance** — initial map render <2s on typical mobile connection. Detour-time fetch <1s for 50 locations along a typical urban route. Filter changes apply <500ms.
6. **Accessibility** — focus management on modal open/close, aria-live announcements on result updates, color-not-only-signal verification.
7. **Visual fidelity check** — built UI matches `05-visual-reference.md` within reasonable variance.

---

## Document version

**v1.0** — initial spec. Updates to this document accompany changes to `01-prd.md` and `05-visual-reference.md`. The spec is canonical; any divergence between code and spec is a bug; update spec before changing code.
