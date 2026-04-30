# WashBuddy — Search & Discovery Overhaul (PRD)

**Document type:** Product Requirements Document. Strategic rationale and behavioral specification for the merged Find a Wash surface.

**Audience:** Anyone trying to understand the product direction — current and future contributors, future Claude sessions, design partners, leadership.

**Sister documents:**
- `02-eid.md` — engineering implementation document. File paths, schema diffs, component structure, edge cases. Read this PRD first; the EID is the working surface for build.
- `03-service-taxonomy-decision.md` — foundational data decision that gates Round 0.
- `04-future-considerations.md` — strategic backlog, ideas explicitly out of scope for v1.
- `05-visual-reference.md` — annotated visual specifications. Tokens, components, states.

**Priority statement:** This document supersedes earlier PRDs and EIDs in the repo (the older `PRD.md` and `EID.md` at the root of the repository). Where this document and older documents conflict, this document wins. The older documents remain as historical context only.

**Version:** v1.0 (initial spec). Updates accompany changes to `02-eid.md` and `05-visual-reference.md`.

---

## 1. Problem statement

WashBuddy's driver-side discovery surface today consists of two separate flows — `Find a Wash` and `Route Planner` — that share substantial machinery but diverge in UX, leading to fragmented user experience and twice the polish cost.

Beyond the duplication, both flows fall short of the audience-specific bar this product needs to clear:

1. **Drivers operate under hours-of-service constraints that consumer apps don't address.** Commercial bus drivers track legal driving windows in 30-minute increments. A "5 km off-route" framing tells them distance; "+18 min detour" tells them what the stop will actually cost their day. The current product uses distance and ETA-from-origin as proxies — neither answers the question the driver is actually asking.

2. **The current Route Planner has a known list/map disconnect.** Users pan the map to a different region but the result list keeps ordering by distance from the original origin. This breaks the user's mental model of "what's on my map" and is a flagged friction point in working notes.

3. **The map UX is below standard.** Generic Leaflet pins, popups that clip off-screen, no pin labels at high zoom, list cards that take up disproportionate space. Compared to Google Maps, Apple Maps, and category-specific apps like GasBuddy, the current map experience signals "early product" — a problem in a category where operators are sophisticated and judge platforms quickly.

This overhaul addresses all three.

---

## 2. Goals and non-goals

### 2.1 Goals

**Primary:**
- Merge Find a Wash and Route Planner into a single discovery surface where mode shifts implicitly based on whether the user has set a destination.
- Elevate detour time as the primary distance metric in route mode, reflecting how this audience actually evaluates trade-offs.
- Replace the popup-on-pin pattern with a Google-Maps-style three-state bottom sheet that respects how users actually engage with map-driven discovery.
- Replace generic Leaflet pins with branded, ranking-aware pins that carry decision-relevant information (relevance via color, primary service via glyph, detour via always-visible label on top-tier).
- Reduce cognitive load on filters: three always-visible Tier 1 chips, with everything else behind a single "Filters" button. Adaptive chip labels that show user state.

**Secondary:**
- Establish a service category taxonomy that unblocks platform-level filtering, comparison, and analytics.
- Specify navigation behavior (back button, modal vs route) so user-flagged frustrations like the orphaned back arrow get resolved as part of this work.
- Specify loading, empty, and error states so production polish is built-in rather than retrofitted.

### 2.2 Non-goals

Explicitly **not** in scope for this overhaul:

- Booking flow detail screens, My Bookings, My Vehicles, Wash Requests pages.
- Provider-side surfaces (Daily Board, Bay Timeline, walk-in modal, provider settings).
- Saved searches and saved providers persistence (placement and stub UI included; backend deferred to v1.5).
- Provider profile photos (deferred to v1.5).
- Real-time provider capacity and parallel-service scheduling (deferred to v2 — see `04-future-considerations.md`).
- Hours-of-service integration / ELD partner connectivity (out of scope entirely for v1; flagged for v2 consideration).
- Map provider migration (Mapbox, premium tiles) — OSM tiles remain v1 baseline.

---

## 3. Audience

The driver-side users of WashBuddy fall into three patterns:

**The in-the-moment driver** is on the road and needs a wash in the next few hours. They're looking at a phone in a coach cab, often wearing gloves, often during a brief stop. Their decision criteria: "what's close enough to get to in my hours window, has the services I need, is open when I arrive, and won't blow my schedule?" Speed and clarity matter; configuration depth doesn't. This user lands in nearby mode without a destination.

**The planning driver or fleet operator** is preparing tomorrow's run or this week's charter schedule. They're at a desk or in a back office. Their decision criteria are richer: provider quality, vehicle accommodation, amenities for layovers, fuel availability, price across multiple stops on a multi-day trip. They benefit from filter depth and map-driven comparison. This user typically lands in route mode with a destination set.

**The fleet admin** runs a multi-vehicle operation and uses WashBuddy as part of a broader operational workflow. They care about repeating routes, saved providers, and integration with their existing fleet management. Most v1 features serve them in the meantime; v1.5 and beyond will address their workflow more directly.

The overhaul prioritizes the first two; v1 doesn't differentiate the fleet admin experience.

---

## 4. Strategic decisions

These are the architectural and behavioral decisions that define the redesign. Each is locked at v1 unless future research surfaces something we haven't anticipated.

### 4.1 Single merged page; mode shifts implicitly via destination

A single page, `/find-a-wash`, replaces both `/customer/search` and `/customer/route-planner`. The page operates in **nearby mode** when no destination is set and **route mode** when a destination is set. The mode shift is implicit — no mode picker. Two reasons:

- It matches how users think. A user who hasn't set a destination is implicitly searching "near me right now"; one who has set a destination is implicitly searching "along this route." Forcing them to choose is unnecessary cognitive overhead.
- It mirrors the Google Maps and Apple Maps pattern, which users now expect from any map-driven discovery experience.

| Aspect | Nearby mode | Route mode |
|---|---|---|
| Default sort | Distance from me | Best fit for route |
| Primary distance metric | Distance ("2.9 mi") | Detour time ("+6 min", bolded) |
| Open-status semantics | Open right now | Open at arrival time |
| Default sheet state | Default (50/50 map/list) | Peek (map dominant) |
| Header treatment | Standard (full search card) | Collapsed (single-line summary) |
| Time selector | Hidden | Visible |
| "Done by" line on cards | Hidden | Shown when service selected |

### 4.2 Detour time is the primary distance metric in route mode

Distance and ETA-from-origin are proxies for the question drivers actually ask: *"how much will this stop cost me?"* The truthful answer is detour time — the additional travel time this stop adds to the trip. Distance is irrelevant if the road is fast; ETA-from-origin doesn't account for the return to the route. Detour time is the single number that matters, and it gets the prominence to match.

Implementation requires per-location OSRM routing computations (origin → location → destination duration minus origin → destination duration). This is a meaningful backend investment — see `02-eid.md` §5.2.

### 4.3 Three-state bottom sheet, mode-aware default

Replaces the popup-on-pin pattern with a Google-Maps-style three-state sheet:

- **Peek** (~96px tall): drag handle + count + view toggle. Map fully visible.
- **Default** (~50% viewport): top result cards visible above-the-fold; map and list both useful.
- **Expanded** (~85% viewport): full result list; map shrunk to thin strip.

Default state per mode:
- Nearby mode → default state (the user is comparing places near them; map and list both matter).
- Route mode → peek state (the user just set a route; map is the primary surface; list is one drag away).

The pin-tap behavior is consistent: peek snaps to default; default and expanded stay where they are. Selected pin highlights its matching card in the sheet. This unifies what was three different popup patterns across the two old flows.

### 4.4 Three Tier 1 chips, no horizontal scroll

The filter chip row contains exactly three chips — Service Type, Open at arrival/Open now, Filters. This is a deliberate reduction from the original five-chip design because:

- Horizontal-scrolling chip rows are an anti-pattern at small viewports (320–390px width is where most usage lives).
- Two of the original chips (Avail Now and Sort) were borderline in usage and earn their place better as the first two sections inside the Filters sheet.
- Reducing visible filters keeps the user oriented in map-primary mode where every pixel of header eats map.

Service Type chip uses an adaptive label that adapts to selection state ("Services" → "Wash" → "Wash, Dump" → "Wash + 2 more"), giving the user state-aware feedback without opening a sheet to remember what they picked. This pattern is consistent across OpenTable, Airbnb, Booking and is the validated best-practice for multi-select category filters.

### 4.5 Tier 0 silent vehicle filter, audibly demoted incompatible providers

The active vehicle drives a silent filter that's automatically applied: locations whose bays don't fit the active vehicle are not eliminated, but they're visually demoted (faded gray pin with dashed outline; gray card with amber "No bay fits {vehicle}" chip; pushed to the bottom of the list). The Tier 0 filter is "audible" — users see the demotion happening, and an inline "{N} nearby providers don't fit big momma · Show" affordance lets them override the silent demotion when needed.

This pattern preserves provider context (the supply exists, just not for this vehicle) while keeping primary results clean.

### 4.6 Pin design encodes ranking, primary service, and detour

The pin replaces the generic Leaflet blue pin with a branded WashBuddy droplet shape that does meaningful visual work:

- **Color** encodes ranking: saturated blue for top-tier (top 3 by best-fit score), lighter blue for mid-tier, warm gray for low-relevance, dashed gray for incompatible.
- **Inner glyph** encodes primary service: water drop for wash, vacuum for interior, drain for dump, box for restock, star for add-ons.
- **Always-visible label** on top-tier pins shows detour time ("+6 min") in route mode or price ("$135") in nearby mode with services selected. This carries information that would otherwise require chip-level filtering or sort indicators.

Mid-tier pins gain similar but subtler labels at zoom ≥13. Low-relevance and incompatible pins never label.

The result: the user can scan a dense map and immediately see which providers are best matches and what they'll cost in time or money — without tapping anything.

### 4.7 Conditional pricing display

Card prices honestly answer "what will this cost me right now?" The label adapts to selection state:

| Selection | Label |
|---|---|
| 0 services selected | (no price shown — collapses card to single-row foot) |
| 1 service selected | `From $XX` (minimum across that location's matching services) |
| 2+ services selected | `Est. $XXX` (sum of base prices for selected services) |

Showing "From $25" when the user actually needs a $150 hand-wash-with-dry is misleading and damages trust. The conditional approach gives meaningful price info exactly when there's enough context for it to be meaningful.

### 4.8 Gated rating display

Star ratings appear only when a provider has crossed a minimum review threshold (default: 5 reviews). Below threshold, no rating renders — not even "No reviews yet."

This protects the rating system at low-data-density: a "★ 5.0 (1)" card distorts comparison against an unreviewed but genuinely better provider. Empty is cleaner than premature.

### 4.9 Curation trumps badges in v1

Hand-curated provider onboarding is the trust signal at launch. No "Verified" or "Pro Fleet" badges ship with v1 — adding badges to every curated provider provides no contrast and devalues the badge slot for when it earns its place. See `04-future-considerations.md` §6 for the future use of badges.

### 4.10 Disintermediation defense via comprehensive directory

Locations can have non-bookable capabilities listed (mobile repair, tire repair, A/C service, electrical, towing, replacement bus). These appear in filters with a "LISTING ONLY" tag and on location detail pages with phone-call CTAs. WashBuddy is the canonical industry directory in v1 even though only the four primary service categories are transactional. The booking happens off-platform; the discovery happens on WashBuddy. Over time, transaction volume migrates onto the platform.

---

## 5. Service taxonomy

Service categories are foundational. The current schema has freeform per-location services with no platform-level taxonomy, which breaks the Service Type filter chip and the picker as designed. The decision is detailed in `03-service-taxonomy-decision.md`; the v1 outcome is:

**Five canonical service categories** — required, enum-based:
1. Exterior wash
2. Interior cleaning
3. Restroom dump
4. Restock & consumables
5. Add-ons

**Optional free-form subcategory** — for provider-specific differentiation that doesn't fit the enum (e.g., "hand-wash-with-dry", "two-step-acid", "ceramic-coat"). Suggested values in a frontend constants file; providers can use them or invent their own.

**Optional free-form labels** — escape valve for marketing language ("Premium," "Express") that shouldn't be searched on but is meaningful to the provider's brand.

This is the hybrid Option C from `03-service-taxonomy-decision.md`. Hard-required category at the top level powers search and analytics; free-form subcategory captures variance without locking the schema; labels are decoration.

---

## 6. Phasing

The work is sized for six rounds of focused implementation. Each round has clean entry and exit criteria. Each gets its own prompt to Claude Code; no round attempts more than one logical unit.

| Round | Title | Dependencies |
|---|---|---|
| 0 | Service taxonomy migration | None |
| 1 | Page merge, pin component, hamburger nav | Round 0 |
| 2 | Bottom sheet (3 states, drag, snap) | Round 1 |
| 3 | Filter architecture (chips, sheets, pills) | Round 1 |
| 4 | Detour time and arrival logic | Round 1 + backend spike |
| 5 | Polish, file deletion, edge case sweep | Rounds 1-4 |

Rounds 2 and 3 can overlap. Round 4 depends on a backend engineering spike that should run in parallel with Round 1 to inform Round 4's architecture.

`02-eid.md` §6 details what each round covers in implementation terms.

---

## 7. Success criteria

Rough quality bar for v1 launch:

- A new user lands on the page, geolocates, and sees nearby providers with branded pins within 2 seconds.
- Setting a destination smoothly transitions the page into route mode with detour times visible on top-tier pins within 1 second of route computation.
- Tapping a pin opens its callout in <100ms and snaps the bottom sheet to default state.
- Filtering reduces results in <500ms with live count updates on chips and the Apply button.
- The over-filter guardrail catches every case where filters reduce results below 5.
- Active filter pills appear above the result list whenever non-Tier-1 filters are applied; users never silently over-filter.
- The "+X min detour" framing replaces every distance-from-origin reference in route mode; no card or pin shows raw distance when detour is more truthful.
- 0 generic Leaflet blue pins remain in production (all replaced with WashBuddy droplet pins).
- Visual reference (`05-visual-reference.md`) and built UI match within reasonable variance at 320, 375, 414, 768, 1024, 1440 viewports.

These aren't strict SLOs — the platform is pre-launch. They're the bar that this redesign needs to clear to be considered done.

---

## 8. Risks and mitigations

**Detour-time backend complexity.** Per-location OSRM routing computations are expensive. If the backend can't compute detours in <1 second for a typical urban route, the UX falls apart. Mitigation: a backend engineering spike runs parallel with Round 1 to validate the architecture before Round 4 commits. Fallback to ETA-from-origin + distance approximation if true detour computation is infeasible.

**Service taxonomy migration risk.** Backfilling existing test data into the new categories is straightforward but adopting it across the booking flow has downstream implications. Mitigation: Round 0 is scoped tightly to the taxonomy migration only; the search UI and booking flow adopt the new field gradually.

**Visual fidelity gap.** Prose specs miss visual nuance that mockups capture. Mitigation: `05-visual-reference.md` carries annotated SVG specs for every component and state, with explicit token values. Each round prompt references the relevant section.

**Round-to-round drift.** Across 6 rounds, decisions made early can be forgotten or reinterpreted later. Mitigation: each round prompt includes a brief "what's been decided" preamble. End-of-round handoff notes flag what shipped and any spec updates.

**Pin selection regression.** The existing route-planner.tsx has a multi-symptom bug where `activePinId` was in the marker creation effect's deps array, causing teardown-recreate cycles. The fix unified the selection model into a separate effect with stable deps. This pattern must not regress in the merged page. `02-eid.md` §6.4 details the audit gate.

**TypeScript backlog.** The codebase has ~110 pre-existing TS errors, some of which mask real bugs. We don't fix the backlog in this scope, but we don't add to it either. Each round's verification includes a TS error count check.

---

## 9. Open questions

These are the decisions still open as of v1.0 of this spec. They get resolved before Round 0 ships.

1. **Default review threshold for rating display** — recommended 5; finalize informed by current review density data.
2. **Pin clustering library** — Leaflet.markercluster is the default; verify license (BSD-2-Clause, fine) and bundle size (~10KB gzipped).
3. **Detour-time backend architecture** — self-hosted OSRM vs. public endpoint, caching strategy, fallback behavior. Resolve via the engineering spike.
4. **Saved-search persistence model** — phase 2 work, but the data model decision (per-user table? part of User profile?) influences the v1 stub placement. Recommended: decide in v1.0; implement in v1.5.
5. **Logomark SVG asset for pin glyph** — production should use the actual WashBuddy logomark for the default water-drop variant. Source asset to be confirmed.

---

## 10. Out-of-scope reminder

Reproduced here for emphasis. Things this PRD does NOT change:

- Booking flow detail screens.
- My Bookings, My Vehicles, Wash Requests pages.
- Provider-side surfaces.
- Saved searches and saved providers persistence (stub only in v1).
- Provider profile photos (v1.5).
- Real-time provider capacity / parallel scheduling (v2).
- Hours-of-service integration (v2+).
- Map provider migration (v2+).

If any of these surface as needing change during implementation, they're flagged for follow-up — not added mid-round.
