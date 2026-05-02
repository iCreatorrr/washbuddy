# Round 1 Phase B Handoff — Pin component, clustering, search-this-area, header

**Branch:** `main`. Phase A completed at commit `1c61c3b` (handoff at [round-1-phase-a-handoff.md](docs/search-discovery-overhaul/round-1-phase-a-handoff.md)). This file is the cumulative Phase B log — fresh file rather than appending to Phase A's so each phase has its own coherent record.

---

## Checkpoint 1 — Pin component + labels

**Commits:** `05a29bc` (api: surface Service.category), `<this commit>` (Phase B CP1: wash-pin). Two-commit checkpoint per the audit's Path A — backend selection-set fix lands separately so the frontend pin work has a clean diff.

### What shipped

**Backend (commit 1):** `category: true` added to the services select in [artifacts/api-server/src/routes/locations.ts](artifacts/api-server/src/routes/locations.ts:131-152). `category` field added to the `ServiceSummary` schema in [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml) (required, ServiceCategory enum). Typed clients regenerated via `pnpm --filter @workspace/api-spec codegen` — adds `serviceSummaryCategory.ts` zod schema and threads the field through api-client-react / api-zod generated types.

**Frontend (commit 2):** New component [components/customer/wash-pin.tsx](artifacts/washbuddy-web/src/components/customer/wash-pin.tsx) — pure render + classification module, Leaflet-free. Exports:
- `WashPinTier` / `WashPinGlyph` types.
- `classifyPin({ rankIdx, totalRanked, mode, fitsActiveVehicle, detourMinutes?, inVisibleBounds? })` — returns the tier per EID §3.5. Optional inputs let the classifier fall through to `'mid'` when CP3 (`inVisibleBounds`) and Round 4 (`detourMinutes`) haven't lit them up yet.
- `pickPrimaryGlyph(serviceCategories, selectedCategories)` — primary-service glyph rule (selected-categories match → first category → default water-drop).
- `WASH_PIN_SIZE`, `WASH_PIN_ANCHOR`, `WASH_PIN_POPUP_ANCHOR` — Leaflet `divIcon` size/anchor maps per tier.
- `WASH_PIN_LABEL_DIMS` — worst-case label rect dimensions for the collision rule.
- `renderWashPinHtml({ tier, glyph, label?, labelVisible?, isSelected? })` — produces the HTML string Leaflet ingests via `L.divIcon`.
- `computeHiddenLabels({ items, zoom })` — pure collision-rule helper. Sort priority: tier desc, then container-pixel distance from map center asc. Pre-positioned for Round 3's labels-on-pin path.

In [find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx): the three legacy `L.divIcon` constants (`locationIcon`, `activeLocationIcon`, `incompatibleLocationIcon`) collapsed into a single `buildWashPinDivIcon` host helper. Marker creation effect computes tier per location via `classifyPin` and glyph via `pickPrimaryGlyph(locationServiceCategories(loc))`. Selection effect rebuilds icons with `isSelected: id === selectedLocationId && fits` — incompatible pins never get the selected ring. Both effects preserve the Phase A invariants (selection state out of marker creation deps; no marker layer teardown).

Endpoint markers (`startIcon`, `endIcon`) **not migrated** — they're route polyline endpoints, not result locations. Out of scope per audit. Flag for future maintenance: don't fold them into wash-pin without first deciding they should share its visual language.

### Spec sections governing
- [02-eid.md §3.5](docs/search-discovery-overhaul/02-eid.md) — pin spec: tiers, sizes, colors, glyphs, labels, selected state, collision rule.
- [02-eid.md §6.9](docs/search-discovery-overhaul/02-eid.md) — brand specs (`#2D6FE3` primary, service-category color tokens, the WashBuddy logomark TODO).
- [03-service-taxonomy-decision.md](docs/search-discovery-overhaul/03-service-taxonomy-decision.md) — Round 0's canonical categories drive the glyph picker.
- [Decision 08 — booking-mode UX](docs/strategic-decisions/08-booking-mode-ux.md) — confirms pins do **not** carry a booking-mode badge. Pin signals remain tier + service + price/detour.

### Verification
- TypeScript: **21 errors**, baseline holds. Zero net-new in wash-pin.tsx or find-a-wash.tsx.
- Production build: succeeds. find-a-wash chunk: 189.51 → 191.65 kB raw (+2.1 kB) / 55.91 → 57.25 kB gzipped (+1.3 kB). wash-pin.tsx code-splits into the find-a-wash chunk; no separate bundle.
- Replit live verification (user-side):
  - Pins render with tier color/size/glyph correct for each location.
  - Selected pin gets gold ring; tap-again deselects; tap-different swaps cleanly.
  - DevTools marker-pane `<div>` count stays stable across selection changes (no teardown).
  - Active-vehicle swap → incompatible pins re-render with the dimmed dashed treatment.
  - Service-category change isn't yet possible (no service selector — Round 3 work) so the glyph-on-selection-change path can't be exercised in CP1; the underlying logic is in place and unit-testable.

### Decisions made

- **Two-commit checkpoint, not one** (Path A from the audit). The api-server selection-set fix is its own logical unit — surfacing `Service.category` is a Round 0 follow-up that happens to unblock CP1's pin work. Separating the commits keeps the bisect clean if either part regresses.
- **`computeHiddenLabels` ships in the module but isn't wired to a `useEffect`** in CP1. Labels don't render in CP1 (nearby-mode labels need Round 3's service selector to compute price; route-mode labels need Round 4's detour endpoint). Wiring an effect that does nothing has cost and zero benefit. The function is pure, exported, and consumer-ready — Round 3 / Round 4 wires it with a small `moveend`/`zoomend` listener and a `setIcon` call per affected pin.
- **Logomark fallback is a hand-drawn water-drop SVG**, not the production WashBuddy logomark. EID §6.9 anticipates this and says to swap when the asset is provided. Phase A's floating top-left button uses the lucide `Droplets` icon for the same reason — same precedent.
- **Classifier signature is future-compatible** (`detourMinutes?`, `inVisibleBounds?`). When CP3 ships the search-this-area button it'll already have a `moveend`/`zoomend` listener with map bounds — wiring `inVisibleBounds: !map.getBounds().contains([loc.lat, loc.lng])` adds one line per pin classification. Round 4's detour endpoint similarly threads `detourMinutes` without touching the component.

### Open items for next round (Phase B Checkpoint 2)
- **Pin clustering** per EID §3.5. `npm install leaflet.markercluster` (BSD-2-Clause, ~10KB gzipped — verify before committing). Configure clustering at zoom <11. Cluster pin shows count + inherits the highest-relevance color of its members. Tap to expand to next zoom level. The wash-pin module's tier+color export makes the "highest relevance color" lookup straightforward.
- The `mode` dependency I added to the selection effect's deps array is forward-compatible for the eventual `inVisibleBounds`/`detourMinutes` wiring — no need to refactor when those land.

### Anything that surprised me

- **Service.category wasn't in the search endpoint's selection set.** Round 0 added it to the schema and the full Service OpenAPI schema, but the `/api/locations/search` route returns services through `ServiceSummary`, which was a separate slim schema that didn't include category. The Prisma `select` clause matched `ServiceSummary`'s shape. Single line of code each in two places, but easy to miss.

  **Round 0 follow-up flagged for future taxonomy consumers**: when `subcategory` and `labels` (also added in Round 0) get their first frontend consumers, audit the search endpoint's `ServiceSummary` against the full Service schema first. The contract has been correct in the full Service shape since Round 0, but the search slice hadn't caught up. Worth grepping `select: {` blocks in `artifacts/api-server/src/routes/` whenever a Round-0 field starts being read on the frontend.

- **`overflow: visible` on the pin SVG is load-bearing.** The selected-state gold ring is a second `<path>` drawn behind the pin with `stroke-width="6"` (3px visible outside the shape). Without `overflow: visible` on the SVG element, the ring gets clipped at the path's bounding box and the visual effect collapses. Same property lets labels position above the pin via `bottom: 100%; margin-bottom: 4px` without being clipped by the iconSize rect.

- **Label collision in pure-function form takes container-pixel inputs, not L.LatLng.** Keeping wash-pin.tsx Leaflet-free meant the host has to do the `latLngToContainerPoint` conversion before calling `computeHiddenLabels`. Slightly more wiring at the call site but worth it — the wash-pin module is reusable for any future map surface (provider-side coverage map, fleet-admin route review, etc.) without dragging Leaflet types around.

### Phase A → Phase B continuity check

Phase A's permanent surfaces that Phase B CP1 builds on (per Phase A close-out): all intact.

- `mode = destination ? 'route' : 'nearby'` — passed to `classifyPin` directly.
- Pin selection model — `selectedLocationId`, `markersByIdRef`, `lastFitKeyRef` — preserved exactly. Selection effect's deps gained `mode` but no other change in shape.
- `RedirectTo` / `useMobileMenu` / `useScrollDirection` / `searchPlaces` — all untouched.

Phase A's interim surfaces still in place (CP4 retires them):
- Floating top-left button (`Droplets` / `ArrowLeft`).
- Floating top-right cluster (NotificationBell + hamburger trigger).
- `pt-14 lg:pt-0` content compensation.
- Route-planner-era inline form Card + collapsed summary Card.
- Route-planner-era `bindPopup` pattern (Round 2 replaces with the dedicated pin-callout component).

Phase B Checkpoint 2 (clustering) is unblocked.

---

## Checkpoint 1.5 — Glyph rewrite for legibility

**Commit:** `<this commit>`. Single follow-up commit before dispatching CP2. Replit verification of CP1 surfaced the `INTERIOR_CLEANING` glyph rendering as a literal "T" character (the original path was a T-shape silhouette with proportions that read as a letter, not a vacuum). All five glyphs audited and rewritten where needed; rendering refactored so each glyph picks its own technique (filled vs stroke) instead of a one-size-fits-all `path/fill+stroke` template.

### What shipped

[wash-pin.tsx](artifacts/washbuddy-web/src/components/customer/wash-pin.tsx): `GLYPH_PATHS: Record<WashPinGlyph, string>` replaced with `GLYPH_FRAGMENT: Record<WashPinGlyph, (fill) => string>`. Each glyph returns its own SVG markup — closed-path fill for shapes that read well solid, stroke-only line art for shapes that need open contours. The original CP1 fill+stroke template silently produced invisible no-ops for `dump` and the X-mark inside `restock` because `fill` won't fill an unclosed path.

### Glyph designs (paste these into the verification harness)

| Category enum | Glyph name | Render style | SVG fragment |
|---|---|---|---|
| `EXTERIOR_WASH` | `wash` | Filled teardrop | `<path d="M16 8 C13 12 11 15 11 17.5 A5 5 0 0 0 21 17.5 C21 15 19 12 16 8 Z" fill="…"/>` |
| `INTERIOR_CLEANING` | `interior` | Stroke (1.6) | Diagonal blade `(11,19)→(20,11)` plus perpendicular handle `(17.7,9.2)→(20,11)`. Reads as a squeegee/wiper. EID §3.5 explicitly accepts vacuum-or-squeegee. |
| `RESTROOM_DUMP` | `dump` | Stroke (1.6) | Top horizontal grate bar `y=11.5, x=11..21` plus two downward chevrons `(13,14)→(16,17)→(19,14)` and `(14.5,17.2)→(16,18.7)→(17.5,17.2)`. Reads as water flowing into a drain. |
| `RESTOCK_CONSUMABLES` | `restock` | Stroke (1.5) | Rounded rectangle `x=11,y=11,w=10,h=8,rx=0.5` plus horizontal divider `(11,15)→(21,15)`. Reads as a sealed package with packing tape. |
| `ADD_ON` | `addon` | Filled 5-pointed star | `<path d="M16 9.5 L17.5 13.2 L21.4 13.7 L18.4 16.3 L19.2 20.2 L16 18.3 L12.8 20.2 L13.6 16.3 L10.6 13.7 L14.5 13.2 Z" fill="…"/>` (10 vertices, alternating outer/inner). |

All glyphs designed in the 32×40 viewBox space, centered roughly at (16, 14) inside the pin's circular head. Stroke-based glyphs use `stroke-linecap="round"` and `stroke-linejoin="round"` so the strokes don't shear at endpoints. Stroke widths chosen so the visible weight at 22-32px pin sizes stays around 1px effective — heavy enough to read, thin enough not to overpower the pin shape behind.

### Why the original `interior` failed

Original path: `M11 11 H21 V13 H17.5 V19 H14.5 V13 H11 Z`. Tracing this:
- (11,11) → (21,11) → (21,13) → (17.5,13) → (17.5,19) → (14.5,19) → (14.5,13) → (11,13) → close.

That literally draws a T-shape — top horizontal bar (10 wide × 2 tall) with a centered vertical stem (3 wide × 6 tall). At icon size, the proportions read as the letter T rather than as a vacuum silhouette. The fix replaces it with a stroke-based squeegee — a different visual language that doesn't risk being mistaken for a glyph from the Latin alphabet.

### Verification

- TypeScript: **21 errors**, baseline holds. Zero new in wash-pin.tsx.
- Production build: succeeds. find-a-wash chunk: 191.65 → 192.07 kB raw / 57.25 → 57.32 kB gzipped. Negligible change (+0.4 kB raw, +0.07 kB gzipped) — the rewrite is mostly a render-strategy shift, not new code volume.

### Acknowledged test gap (not a regression)

The CP1 test protocol included "select services to verify labels render." That test wasn't runnable on CP1 — there's no service picker UI on `/find-a-wash` until Round 3 per EID §4.2. Labels are wired in code (the `label` parameter on `renderWashPinHtml`, the top-tier and mid-tier rendering paths, and the `computeHiddenLabels` collision helper) but the UI gate that would supply a label string doesn't exist yet. CP1's behavior of rendering pins without labels is the intended state for this checkpoint and shouldn't show up as a regression in later verification passes.

### Open items for CP2

Unchanged from the CP1 handoff section above. CP2 dispatches after the user verifies the new glyphs render recognizably on Replit.

---

## Checkpoint 1.6 — Drop per-category glyphs, unify on brand logomark

**Commits:** `4639bb2` (spec update), `<this commit>` (code simplification). Two-commit checkpoint per the prompt's spec-before-code direction. **This is a spec correction, not a feature addition** — CP1.5's verification on Replit showed the per-category glyphs (squeegee, drain, box, star) collapse into indistinguishable shapes at typical pin sizes, and the encoding burden was misaligned with how category-leading map apps use pin glyphs.

### What shipped

**Spec (commit 1):** [02-eid.md §3.5](docs/search-discovery-overhaul/02-eid.md) "Inner glyph" subsection rewritten — uniform WashBuddy water-drop logomark across every pin. Rationale block grounds the change in UX research (color > shape for preattentive categorical encoding; ~7-item working memory cap; legibility at 32×40px) and references category-leading map apps (PlugShare, GasBuddy, Airbnb encode availability and ranking on pins, not category). [05-visual-reference.md §4](docs/search-discovery-overhaul/05-visual-reference.md) header updated; the per-category color tokens in §1 stay (they apply to filter chips, card service pills, detail pages — surfaces with room to be legibly displayed).

**Future consideration documented in spec:** when filter chips and the service picker ship in Round 3, a small numeric "matches N of your filtered services" badge in the pin's lower-right corner could indicate per-pin filter alignment. Layered on the pin, not a glyph replacement. Worth piloting; not committed.

**Code (commit 2):** [wash-pin.tsx](artifacts/washbuddy-web/src/components/customer/wash-pin.tsx) — removed:
- `WashPinGlyph` type
- `pickPrimaryGlyph` function (~30 lines including JSDoc)
- `CATEGORY_TO_GLYPH` map
- `glyph` parameter on `RenderWashPinInput`
- `GLYPH_FRAGMENT` table with the five per-category render functions

Replaced with: a single inline `GLYPH_PATH` constant (the same teardrop fill that worked correctly for `wash` in CP1.5) rendered as a `<path d="..." fill="..."/>` inside `renderWashPinHtml`. Renderer simplified by ~50 lines.

[find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) — removed:
- `pickPrimaryGlyph` and `WashPinGlyph` imports
- `locationServiceCategories(loc)` host helper (its only consumer was the glyph computation)
- `glyph` field on the `buildWashPinDivIcon` input shape
- Glyph computation in the marker creation effect (`pickPrimaryGlyph(locationServiceCategories(loc))`)
- Glyph computation in the selection effect

The api-server `Service.category` selection-set fix from CP1 commit `05a29bc` is **kept** — it remains useful for Round 2's card service pills and Round 3's filter chips. CP1.6 doesn't reach into the backend.

### Spec sections governing
- [02-eid.md §3.5](docs/search-discovery-overhaul/02-eid.md) — pin spec (post-CP1.6 rewrite).
- [05-visual-reference.md §4](docs/search-discovery-overhaul/05-visual-reference.md) — visual reference banner pointing at EID §3.5.

### Verification
- TypeScript: **21 errors**, baseline holds. Zero new in either touched file.
- Production build: succeeds.
- find-a-wash chunk size deltas:
  - CP1: 191.65 kB raw / 55.91 kB gzipped
  - CP1.5: 192.07 kB raw / 57.32 kB gzipped (per-glyph render refactor)
  - **CP1.6: 190.73 kB raw / 56.79 kB gzipped** (–1.34 kB raw, –0.53 kB gzipped vs CP1.5; –0.92 kB raw vs CP1 baseline)
  - The number going down is the kind of thing future engineers appreciate seeing.

### Decisions made
- **Spec-before-code split into two commits** per the prompt's discipline. Commit 1 is `docs(eid)`-tagged; commit 2 is `Phase B CP1.6`-tagged. Bisecting is straightforward if either part regresses.
- **Production-note phrasing updated** in EID §3.5: the original "the water-drop variant" implied multiple variants exist. Post-CP1.6 there's only the uniform glyph, so "the water-drop variant" became "the WashBuddy logomark."
- **Backend Service.category select stays** — Round 2 cards and Round 3 filters consume it. Reverting it would force a re-add later.
- **Glyph SVG inline, not via a `GLYPH_PATH` indirection helper** — there's only one path now; a function-returning-string for a single value is overkill. The path is a plain `const`, used once in `renderWashPinHtml`.

### Open items for next round (Phase B CP2)
- Unchanged from CP1 handoff: pin clustering via `leaflet.markercluster` (BSD-2-Clause, ~10KB gzipped — verify before committing). Cluster pin shows count + inherits highest-relevance color of its members. The CP1.6 simplification (no glyph variability) makes the cluster pin's design easier — the cluster pin can use the same uniform water-drop glyph or just a count badge.
- The spec's "future consideration" — a numeric "matches N filters" badge in the pin's lower-right corner — is gated on Round 3's filter UI. Worth picking up there.

### Anything that surprised me
- The per-category glyph system was a remnant of the pre-Round-0 thinking where service taxonomy was supposed to drive most of the UI. Round 0's actual landing (5 broad categories, most providers offering 3-4 of them) made "primary service" mostly fictional for this market. The pin glyph was the most user-visible place where that fiction was being asserted. Dropping it aligns the spec with the operational reality the seed data already encodes.
- Chunk size went down despite CP1.6 adding ~6 lines of explanatory comments (the spec-correction note in `wash-pin.tsx`'s top docstring). Removing the per-glyph render functions, `pickPrimaryGlyph`, `CATEGORY_TO_GLYPH`, `locationServiceCategories`, the `WashPinGlyph` union type, and the unused glyph imports/params more than offset the comment additions. Removing code is the cheapest way to reduce bundle size — when you can do it.

---

## Checkpoint 2 — Pin clustering

**Commit:** `<this commit>`. Single commit per the prompt's "one logical unit" rule. Ships pin clustering at zoom <11 via `leaflet.markercluster` (BSD-2-Clause, ~10KB gzipped), branded cluster bubbles that inherit the highest-tier member's color, and `zoomToShowLayer` integration so the selection model survives clustering.

### What shipped

**Dependency:** [`leaflet.markercluster@^1.5.3`](artifacts/washbuddy-web/package.json) and `@types/leaflet.markercluster@^1.5.6` added to [artifacts/washbuddy-web/package.json](artifacts/washbuddy-web/package.json). The plugin attaches `markerClusterGroup` to the `L` namespace as a side effect of importing `"leaflet.markercluster"`; `@types/leaflet.markercluster` provides the type augmentation.

**CSS imports** added at the top of [find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) alongside the existing `leaflet/dist/leaflet.css`: `leaflet.markercluster/dist/MarkerCluster.css` (positioning) and `MarkerCluster.Default.css` (default cluster styles, mostly overridden by our `iconCreateFunction`). Mirrors the project's existing co-located CSS-import pattern; no global stylesheet entry point.

**[wash-pin.tsx](artifacts/washbuddy-web/src/components/customer/wash-pin.tsx)** new exports:
- `pickHighestTier(tiers: WashPinTier[])` — pure function. Priority order `top > mid > low > incompatible`. Empty input falls through to `incompatible`. An all-incompatible cluster correctly stays at `incompatible` (no false promotion).
- `WASH_PIN_TIER_FILL` — re-exports `TIER_FILL` so cluster styling pulls from the same color tokens as individual pins (single source of truth).
- `renderWashClusterHtml({ tier, count })` — produces the cluster bubble's HTML string. Returns `{ html, size }` so the host can pass `size` into `L.divIcon`'s `iconSize`. Diameter scales with count (32 / 40 / 48 px for ≤9 / 10–99 / 100+ — reasonable defaults, tunable). Circular bubble (not teardrop — clusters represent aggregations, not individual decision targets, matching Google Maps / Airbnb cluster conventions). Background fill = highest-tier member's color via `TIER_FILL`. Stroke uses the same dashed treatment for `incompatible` tier so all-incompatible clusters render gray dashed.

**[find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx)** changes:
- New `clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)` alongside the existing `markersByIdRef` and `endpointsRef`.
- Marker effect creates the cluster group on first run with `disableClusteringAtZoom: 11`, `maxClusterRadius: 40`, `animate: true`, `spiderfyOnMaxZoom: true`, `showCoverageOnHover: false`, and the custom `iconCreateFunction`. Subsequent runs call `clusterGroupRef.current.clearLayers()` before adding new markers (instead of removing markers individually from the map) so the cluster group's internal indices stay consistent.
- Result-location markers are added to `clusterGroupRef.current.addLayer(marker)` instead of `marker.addTo(map)`. Tier is stashed on marker options via `{ icon, ...({ washPinTier: tier } as Partial<L.MarkerOptions>) }`. The `iconCreateFunction` reads `(m.options as any).washPinTier` from each child marker.
- **Endpoint markers stay direct on the map** — `startMarker`, `endMarker`, and the My-Location marker continue to use `.addTo(map)`. They're route polyline endpoints, not result locations; clustering them would group "START" with nearby washes which is incoherent.
- Selection effect's pan-if-off-screen logic moved into a `finishSelection` callback. When the marker is currently inside a cluster, `cluster.zoomToShowLayer(marker, finishSelection)` expands the cluster (zooming in if necessary) and fires the callback synchronously after the marker becomes visible. If the marker is already visible (zoom ≥11 or inside a non-clustered group), `zoomToShowLayer` no-ops and fires `finishSelection` synchronously. Try/catch wraps the call as a safety net for the rare race where the cluster group is mid-rebuild.
- Map teardown effect drops `clusterGroupRef.current = null` so a fresh map mount creates a new cluster group rather than reusing a detached instance.

### Spec sections governing
- [02-eid.md §3.5](docs/search-discovery-overhaul/02-eid.md) — clustering spec (zoom <11, 40px radius, count + highest-tier color, tap to expand).
- [02-eid.md §3.2](docs/search-discovery-overhaul/02-eid.md) — z-index hierarchy. Clusters use Leaflet's default pane z-ordering (no explicit `zIndexOffset`). If clusters paint over top-tier individual pins in testing, a `zIndexOffset: -100` on the cluster div-icon is the safety valve.

### Verification

- TypeScript: **21 errors**, baseline holds. Zero new in either touched file.
- Production build: **environmental issue, not code-related.** The `pnpm install` for `leaflet.markercluster` triggered a known pnpm-on-Windows quirk where the resolver scrubbed Windows-native optional binaries (`@rollup/rollup-win32-x64-msvc`, `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`) from `.pnpm/`. Local `vite build` fails with "Cannot find module @rollup/rollup-win32-x64-msvc" / "lightningcss" — neither comes from CP2's actual changes. Replit's Linux install will pull the corresponding `linux-x64-gnu` binaries fresh and succeed. CP1.6's chunk size baseline of 190.73 kB raw / 56.79 kB gzipped will grow by roughly the markercluster footprint (~10KB gzip claimed by spec); the user can confirm the actual delta on Replit deploy.
- Code-level all-incompatible cluster check: traced through `pickHighestTier` — priority order `top:3 > mid:2 > low:1 > incompatible:0`. Loop iterates without any `p > bestPrio` hit when all inputs are `incompatible` (priority 0). Returns `'incompatible'`. The cluster bubble's `incompatible` branch sets fill `#E2E8F0`, stroke `#94A3B8 1.5px dashed`, text color `#475569` — gray dashed, matching individual incompatible pins.

### Decisions made
- **Cluster shape: circular bubble**, not teardrop. The teardrop says "this specific point" — clusters represent aggregations, so a circle reads correctly as "group" (matching the Google Maps / Airbnb / generic-cluster convention). EID §3.5 specifies the spec; the audit confirmed the visual choice.
- **Sizing thresholds 32 / 40 / 48 px at counts ≤9 / 10–99 / 100+** — defaults from the prompt, kept as-is. No visual tuning yet (Replit will surface if any look awkward).
- **`zoomToShowLayer` over manual fallback.** The card-tap → pin-select flow is too central to leave behind a "but only at zoom ≥11" caveat. The integration was actually small (one wrap of `finishSelection` in a `cluster.hasLayer(marker)` check, with try/catch).
- **Tier stash via marker options spread cast.** `L.MarkerOptions` doesn't formally allow extension without module augmentation; `Partial<L.MarkerOptions>` cast is the standard Leaflet plugin pattern. Module augmentation would be cleaner but adds a `.d.ts` for one extra field — not worth the ceremony for one consumer.
- **`pickHighestTier` empty-input default = `incompatible`.** A cluster with no readable tiers shouldn't promote itself to top-tier blue. `incompatible` is the safest visual no-op; in practice this branch only fires if all child markers somehow lost their stashed tier (unlikely given the marker-creation path).

### Open items for next round (Phase B CP3)
- **"Search this area" button** per EID §3.2. Floating pill in upper-middle of map, visible only when <50% of currently-listed locations are in visible bounds. Tap re-queries relative to visible bounds. The cluster group's `getVisibleParent(marker)` and `eachLayer` APIs make the bounds-vs-results check straightforward — CP3 can use the same `clusterGroupRef`.
- **`inVisibleBounds` for tier classification** lights up in CP3. The `classifyPin` signature already accepts the optional input; CP3 wires `!map.getBounds().contains([loc.lat, loc.lng])` per pin and the `low` tier rule from EID §3.5 starts firing.
- **Cluster z-index safety valve.** If Replit testing shows clusters painting over selected top-tier pins (gold ring obscured), add `zIndexOffset: -100` to the cluster's `iconCreateFunction` div-icon.

### Anything that surprised me
- **`L.MarkerClusterGroup`'s lifecycle versus React effect re-runs.** First instinct was to recreate the group on every effect re-run. That accumulates dangling cluster instances on the map, breaks `zoomToShowLayer` (the marker's current cluster isn't the same as the new one), and creates a memory leak. The right pattern: lazy-init in a ref, `clearLayers()` between runs, drop the ref on map teardown. Same shape as `mapInstanceRef` itself — a long-lived Leaflet primitive that survives effect churn.
- **Type augmentation friction with marker-options stash.** The `L.MarkerOptions` interface in `@types/leaflet` is closed (no index signature for plugin extensions). The plugin pattern of stashing custom keys via cast (`{ washPinTier: tier } as Partial<L.MarkerOptions>`) works but isn't pretty. Module augmentation would clean it up at the cost of a `.d.ts` file in the project — punted; one cast site is acceptable.
- **`leaflet.markercluster`'s default `Default.css` styles are visually loud** (yellow / orange / blue gradients with letter-spacing 0). Custom `iconCreateFunction` overrides the visuals entirely, but the CSS still imports for positioning + spiderfy classes. Worth knowing if a future change touches cluster styling — overriding the colors via CSS instead of `iconCreateFunction` would still leave the default classes wrapping the bubble.
- **Local Windows pnpm + native deps interaction.** The first install reported Windows-native binaries as `+`-added; subsequent installs for new packages list them with `-` (removed). Pre-existing pnpm/Windows quirk unrelated to CP2 — flag for any future contributor running local builds on Windows. Replit's Linux env doesn't trigger this.

---

## Checkpoint 3 — "Search this area" button

**Commit:** `<this commit>`. Single commit per the audit's "no backend change needed" finding — the locations search endpoint already returns the full visible-providers set; CP3 just shifts which client-side filter runs.

### What shipped

**New file** [`lib/map-bounds.ts`](artifacts/washbuddy-web/src/lib/map-bounds.ts) — pure helper `getInBoundsRatio(locations, bounds)`. Returns the fraction (0–1) of locations whose lat/lng falls inside the supplied Leaflet `LatLngBounds`. Empty input returns 1 (the "no out-of-bounds locations" sentinel) so consumers don't trip on `0/0` NaN. Future map-bounds-aware UI (e.g., a card-level "this provider isn't in your visible map" indicator in Round 2+) shares the same primitive.

**[find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx)** changes:
- New state: `searchBoundsAnchor: L.LatLngBoundsLiteral | null` (the bounds the user committed via the button) and `inBoundsRatio: number` (driven by map events).
- `displayLocations` converted from a ternary to a memoized filter — base list is `route ? nearbyLocations : initialLocations`, then applies a lat/lng-in-bounds pass when `searchBoundsAnchor` is set. Marker effect's `locsToShow` and selection effect's `selLocs` both unified to `displayLocations` so the marker layer, the cluster group, and the result cards stay in lockstep.
- Marker effect's fitKey extended with a `search-this-area:<bounds>` branch. `handleSearchThisArea` pre-sets `lastFitKeyRef.current` to that key so the fit-bounds gate skips its branch when the marker effect re-runs — the user's view stays put (they're already looking at the area they wanted).
- New effect listens to `map.on("moveend", recompute)` and `map.on("zoomend", recompute)`. Debounced 200ms via `setTimeout` so a held drag doesn't flicker the button. Cleanup tears down listeners and clears any pending timeout.
- Bounds-clear effect: `searchBoundsAnchor` resets to `null` whenever `origin`, `destination`, or `route` changes — switching context means the user is no longer asking about that specific map region.
- Floating button JSX inside the map container: `motion.div` wrapped in `<AnimatePresence>`, `top-3 left-1/2 -translate-x-1/2 z-30`, fade + slide-down on appear. Translucent white pill (`bg-white/95 backdrop-blur-md`), 44px tall, `Search` icon prefix from lucide. Visible only when `displayLocations.length > 0 && inBoundsRatio < 0.5`.

### Spec sections governing
- [02-eid.md §3.2](docs/search-discovery-overhaul/02-eid.md) — "Search this area" button spec (floating pill, upper-middle, visible when <50% of currently-listed locations are in visible bounds, tap re-queries relative to visible bounds, translucent white + backdrop-blur).
- The CP3 implementation reads "tap re-queries relative to visible bounds" as a client-side anchoring shift, not a new server call — the existing endpoint returns the full visible-providers set already. Consistent with the spec's intent (the result list should match the visible bounds).

### Verification
- TypeScript: **21 errors**, baseline holds. Zero new in either file.
- Production build: **environmentally broken on local Windows** — same pnpm/Windows native-deps resolver quirk that affected CP2 (`pnpm install` for `leaflet.markercluster` scrubbed `@rollup/rollup-win32-x64-msvc` etc. from `.pnpm/`). Not caused by CP3; CP3 added no new deps. Replit's Linux env installs fresh and is unaffected.
- Code-level threshold check: empty `displayLocations` short-circuits in the visibility gate (`displayLocations.length > 0 && inBoundsRatio < 0.5`); no NaN-trip path even without the helper's sentinel.

### Decisions made
- **No backend change.** The audit confirmed the locations search endpoint at [locations.ts:119](artifacts/api-server/src/routes/locations.ts:119) returns the full `isVisible: true` provider set without filtering by `lat`/`lng`/`radiusMiles` — those query params are destructured but not applied to the Prisma `where`. The frontend already filters by `distFromOrigin` (nearby) or `distanceToRoute` (route) client-side. CP3 introduces a third client-side filter (bounds) without touching the server. Single commit; no openapi/codegen.
- **`displayLocations` unified across marker effect, selection effect, and JSX.** Pre-CP3, the marker effect computed its own `locsToShow = route ? nearbyLocations : initialLocations` inline — equivalent to `displayLocations` until CP3. After CP3, the bounds filter would be applied at one site and not the others, creating a marker-vs-card mismatch. Unifying through `displayLocations` keeps every consumer in lockstep.
- **`lastFitKeyRef` extension over a separate suppression flag.** The fit-bounds gate's existing keying scheme handles "don't yank the view" via ref equality. Adding a `search-this-area:<bounds>` key value is a smaller change than introducing a new `suppressFitBounds` boolean. Fewer state variables, less drift risk.
- **200ms debounce.** Standard pattern. Avoids button flicker during a held drag (each `moveend` fires once when the drag releases, but rapid sequences — e.g., scroll-zoom — fire multiple `zoomend` events in quick succession).
- **Empty-list guard at the call site, not just in the helper.** Both layers handle the empty case explicitly. The helper returns 1 (sentinel); the JSX condition checks `displayLocations.length > 0` first. Defense-in-depth so a future helper change doesn't accidentally show the button.

### Open items for next round (Phase B CP4)
- **Header replacement** per EID §3.1 — the last and most structural CP of Phase B. Replaces:
  - The floating top-left logomark/back button (Phase A interim).
  - The floating top-right cluster (NotificationBell + hamburger) (Phase A interim).
  - The `pt-14 lg:pt-0` content compensation (Phase A interim).
  - The route-planner-era inline form Card and collapsed summary Card.
  Adds: `find-a-wash-header.tsx` per EID §3.1. Phase B CP4 builds expanded mode only — collapsed mode + the `layoutId` shared-element animation lands in Round 2 alongside the bottom sheet (since EID §3.1 parameterizes the header by sheet state).
  CP4 audit will be the **full audit gate**, not the lighter version — header replacement is the most user-visible structural change of Phase B.
- **Route-mode-with-long-route caveat (flagged for future tuning).** In route mode with a long corridor (e.g., Toronto → Montreal), the user's natural map view at any zoom that fits the route only contains ~30% of the corridor's pins. CP3's threshold of `< 0.5` causes the button to appear immediately even though the user is looking at one part of a planned route, not panning to a different region. **This is by design per the spec** — the button is honest about "the visible map and the result list don't agree." If post-Phase-B testing surfaces this as intrusive in route mode, the threshold becomes a tunable: either a higher threshold in route mode (e.g., `< 0.3`), or a route-mode opt-out (button only appears in nearby mode). Worth piloting; not committed.
- **Z-index variable formalization.** The button uses `z-30` per EID §3.2's reservation for `--z-map-cta: 900`. CP4 is a natural place to formalize the CSS variables since the new header is the first consumer at the `--z-header: 1000` tier — the variables can land alongside.

### Anything that surprised me
- **The backend's `radiusMiles` query param is dead.** Destructured at [locations.ts:121](artifacts/api-server/src/routes/locations.ts:121) but never used in the `where` clause. The full provider set has been flowing through every search since the endpoint shipped — the filter is entirely client-side. Made CP3 cleaner (no API change), but worth knowing as a "things look wired but aren't" anomaly. Not in CP3's scope to fix; flag for any future query-param cleanup pass.
- **`lastFitKeyRef` was already designed for exactly this kind of extension.** Phase A's authors keyed it as a string so additional anchoring modes could be added without restructuring the gate's logic. The CP3 add (one new branch in the fitKey computation, one pre-set in the handler) was a 6-line change because the existing scaffolding handled the rest.
- **`displayLocations` deduplication paid off twice.** Unifying `locsToShow` (marker effect) and `selLocs` (selection effect) into `displayLocations` was structurally needed for CP3. It also incidentally cleaned up two places where the same expression was inlined and would have drifted independently. The kind of refactor that's worth making explicit in spec (rather than letting it stay invisible until a future round needs to fix it).

---

## Checkpoint 3.5 — Vite Leaflet dedupe (preventive; misdiagnosed at the time)

**Commit:** `f9f8d87`. Single-line config edit added in response to a Replit `Maximum call stack size exceeded` crash on destination set. **The diagnosis at the time was wrong.** The Replit agent pattern-matched the stack-overflow trace to a known Vite + Leaflet duplicate-copy failure mode (real bug class, well-documented online) and recommended `resolve.dedupe` + `optimizeDeps.include` for `leaflet`. Both were added; the running session's symptoms cleared after a `.vite` cache clear and restart, which the dedupe was credited with making permanent.

**The crash actually came back after CP3.5 shipped** — same recursion trace, but now with all `LatLngBounds` frames at the same Vite version hash (`v=44f4182e`), proving single Leaflet copy. The duplicate-copy theory was never the cause; the cache clear had cleared a stale pre-bundle, not a duplicate-copy condition. The actual root cause is the [Hotfix entry below](#hotfix--latlngbounds-recursion-the-actual-fix) — Prisma `Decimal` columns serializing as JSON strings.

**Why the dedupe stays anyway:** the duplicate-copy failure mode is real. `leaflet.markercluster` does reach into `leaflet`'s exports and Vite's pre-bundle resolution can theoretically split `leaflet` into two slots under the right HMR conditions, even with this codebase's clean dependency tree. The `resolve.dedupe` and `optimizeDeps.include` entries close that real-but-latent failure mode preventively. The institutional record needs to make clear: this commit fixes a future failure mode, not the destination-set crash it was originally credited with fixing.

**Lesson for future engineers reading this cold:** the symptoms looked like the documented Vite + Leaflet duplicate-copy issue (Symbol.hasInstance recursion in a `LatLngBounds` trace), but the load-bearing diagnostic was the version hash on each frame in the trace. When all frames share a `?v=...` hash, it's a single copy. Don't pattern-match to a known runtime quirk without confirming against the trace's specifics.

### What shipped

[`artifacts/washbuddy-web/vite.config.ts`](artifacts/washbuddy-web/vite.config.ts) — two edits inside `defineConfig({...})`:
- `resolve.dedupe` extended from `["react", "react-dom"]` to `["react", "react-dom", "leaflet"]`. Tells Vite to enforce a single resolution of `leaflet` across the dependency graph.
- New `optimizeDeps.include: ["leaflet", "leaflet.markercluster"]` block. Tells Vite to pre-bundle both packages together at startup so they share a single dep-cache entry.

Either alone reduces the risk; both together close it. Inline comment in the config explains the failure mode for any future engineer reading the file cold.

### Spec sections governing
- N/A — config-only change. The runtime behavior is per the existing CP2 / CP3 specs; this commit just stops the dev environment from violating them under HMR.

### Verification
- TypeScript: **21 errors**, baseline holds. (Vite config isn't compiled into the app bundle; tsc passes unchanged.)
- Local production build: still environmentally broken on Windows from CP2's pnpm/Windows native-deps quirk. CP3.5 doesn't add or change deps. Replit's Linux env is unaffected.
- Replit smoke test (post-deploy):
  - Clear `.vite` cache one final time: `rm -rf artifacts/washbuddy-web/node_modules/.vite`.
  - Restart the web workflow.
  - `/find-a-wash` should load and accept a destination without the `Maximum call stack size exceeded` error.
  - Subsequent fresh installs / HMR cycles should not require manual cache clears for the Leaflet stack-overflow specifically.

### Decisions made
- **`leaflet` added to `dedupe`; `leaflet.markercluster` not.** The crash was Leaflet core's `instanceof LatLng` check returning false across duplicate copies. The plugin doesn't have its own `instanceof`-recursion path — its dedupe value is shared package-cache locality (handled by `optimizeDeps.include`), not single-resolution.
- **Both `dedupe` and `optimizeDeps.include`, not just one.** `dedupe` enforces single resolution at the module-graph level; `optimizeDeps.include` pre-bundles at dev-server startup. Different layers; both matter. With only `dedupe`, a Vite cache that already pre-bundled two copies before the dedupe rule could keep them around through HMR. With only `optimizeDeps.include`, an `npm install` that introduces a transitive `leaflet` could still nest a second copy. Belt-and-suspenders.
- **Inline comment, not just a doc reference.** A future engineer hitting an unrelated dedupe-or-optimizeDeps issue will read the surrounding code to understand the existing entries. The comment explains the specific failure mode (LatLngBounds.extend recursion via instanceof crossing copy boundaries) so the entries don't read as cargo-culted.

### Open items for next round (Phase B CP4)
- Unchanged from CP3 handoff. CP4 dispatches after the user re-runs CP3's full test protocol (cleared cache, restarted workflow, "Search this area" verified end-to-end on Replit) so any latent CP3 issue surfaces *before* CP4's structural header rewrite layers on top of it.

### Anything that surprised me
*Original write-up's "surprises" attributed the crash to the duplicate-copy Vite + Leaflet failure mode. That diagnosis was wrong (see the retro-correction at the top of this section and the Hotfix section below). The dedupe still closes a real preventive concern, but the technical surprise narrative no longer holds.* The actual surprise — captured in the Hotfix section — was that Prisma's Decimal serialization had been silently producing string-typed lat/lng since the endpoint shipped, and the bug only manifested once `leaflet.markercluster` started consuming the field for bounds aggregation.

---

## Hotfix — LatLngBounds recursion (the actual fix)

**Commit:** `<this commit>`. Step 2 of a two-step hotfix; step 1 (`e751fb6`) added diagnostic console.logs that captured the response shape on Replit and revealed the actual root cause.

### What was actually wrong

`Location.latitude` and `Location.longitude` are Prisma `@db.Decimal(9, 6)` columns. Prisma's `Decimal` type serializes to a **string** in JSON (`"43.622994"`, not `43.622994`), even though the OpenAPI contract types these fields as `number`. The mismatch had been silent since the endpoint shipped:

- **Phase A** used the values for `haversineKm` distance math, where JavaScript's `*`/`-` operators auto-coerce strings to numbers. The math worked; nobody noticed the type mismatch.
- **Phase B CP1** added `wash-pin` and called `L.marker([loc.latitude, loc.longitude], ...)`. Leaflet's `toLatLng` coerces `[string, string]` arrays via `+` arithmetic, so individual marker construction worked.
- **Phase B CP2** added `leaflet.markercluster`, which aggregates child marker bounds via `LatLngBounds.extend` on each marker's `_latlng`. The cluster's bounds construction takes a different path — when `LatLngBounds.extend` receives a value that isn't a `LatLng` or `LatLngBounds` instance and `toLatLng` returns null for it, it falls into `this.extend(toLatLngBounds(obj))`. `toLatLngBounds` calls `new LatLngBounds(obj)`, which iterates `obj.length` and calls `extend(item)` on each element. With string-typed lat/lng flowing into this path under specific cluster-aggregation conditions, the recursion stops bottoming out and the stack overflows.

The diagnostic from step 1 confirmed the wire format empirically: `latType: "string", latValue: "43.622994"`.

### Why CP3.5's diagnosis was wrong

CP3.5 was triggered by the same crash trace (`Maximum call stack size exceeded` inside `LatLngBounds.extend`), and the Replit agent matched it to a documented Vite + Leaflet failure mode where two copies of Leaflet load simultaneously and `obj instanceof LatLng` returns false against the wrong copy. That failure mode produces an identical-looking trace; the load-bearing differentiator is whether the `LatLngBounds` frames in the stack reference the same Vite version hash (single copy) or different ones (duplicate copy). The hashes weren't checked at the time. After CP3.5 shipped, the crash recurred and the new trace's frames all shared `v=44f4182e` — proving single copy, ruling out the duplicate-copy theory.

The dedupe + optimizeDeps additions from CP3.5 stay in `vite.config.ts` because they close a real-but-latent failure mode that could surface in the future (HMR cycles, transitive deps adding a second `leaflet`). They just didn't fix the destination-set crash they were originally credited with fixing.

### The fix

New file [`lib/normalize-location.ts`](artifacts/washbuddy-web/src/lib/normalize-location.ts) — single shared boundary normalizer. Two exports:
- `normalizeLocation(loc)` — coerces `latitude`/`longitude` from string to number on a single location object. NaN-result fields become `null` so downstream `latitude != null` filters continue to work.
- `normalizeLocationsResponse(data)` — applies `normalizeLocation` to every entry in a search-response shape (`{ locations: [...] }`).

Applied at every client-side site that fetches Location-shaped data:
- [find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) — search response landing site (the consumer that crashed).
- [search.tsx](artifacts/washbuddy-web/src/pages/customer/search.tsx) — legacy page, still in repo until Round 5.
- [route-planner.tsx](artifacts/washbuddy-web/src/pages/customer/route-planner.tsx) — legacy page, still in repo until Round 5.
- [location-detail.tsx](artifacts/washbuddy-web/src/pages/customer/location-detail.tsx) — both the single-location fetch (`/api/locations/:id`) and the search fallback.

Diagnostic `[diag-hotfix]` console.logs from step 1 removed in this same commit.

### Spec sections governing
- N/A — bug fix, no spec change.
- The OpenAPI contract at [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml) types `latitude`/`longitude` as `number`; the runtime is now consistent with the contract on the consumer side. The api-server is still the truer boundary for this fix (the wire format itself is wrong, not just the consumer's reading of it). Tracked as a future cleanup pass — see Open items.

### Verification
- TypeScript: **21 errors**, baseline holds. Zero new in any of the 5 touched files.
- Replit (post-deploy):
  - `/find-a-wash` loads in nearby mode without crash.
  - Setting a destination triggers route + nearby-locations fetch + cluster bounds aggregation — no `Maximum call stack size exceeded`.
  - Pin clustering + tier colors + selection model from CP1/CP2/CP3 all continue to work.

### Decisions made
- **Client-side fix at the four call sites, not server-side.** Per the user's hotfix direction. Long-term the api-server should match its own OpenAPI contract (a Prisma response transformer would coerce `Decimal` → `number` once, at the wire boundary, for every consumer). Tracked for a future cleanup pass; the client-side fix unblocks today.
- **Single shared helper, not a per-call-site `Number()` cast.** Per the user's "fix at the boundary so this can't recur in future code paths" direction. Future fetch sites that consume `Location`-shaped data import `normalizeLocation` / `normalizeLocationsResponse` and the recursion can't recur.
- **NaN-results become null, not 0.** A non-numeric latitude string would produce `NaN` from `parseFloat`. `NaN` would fail downstream in different ways (Leaflet would throw "Invalid LatLng"; cluster aggregation would still misbehave). Coercing to `null` makes the existing `latitude != null` filters in find-a-wash.tsx (line 1229, 1417, 1427) catch and skip the bad row cleanly.
- **Legacy pages (search.tsx, route-planner.tsx) get the fix too.** They redirect to `/find-a-wash` on first navigation, but the underlying query still runs during the brief window before the redirect fires. Adding the helper there is one line per file and prevents a recurrence if anyone hits those URLs directly during the migration window. They get deleted in Round 5 anyway.

### Open items
- **Server-side coercion in api-server is the cleaner long-term fix.** A Prisma response transformer at [`artifacts/api-server/src/routes/locations.ts`](artifacts/api-server/src/routes/locations.ts) (or a model middleware in `lib/db`) that maps `Decimal` → `number` on serialization would align the wire format with the OpenAPI contract and eliminate the need for client-side coercion entirely. Tracked for a Round 5 cleanup pass alongside the legacy-page deletions.
- **`Location` is the only Decimal-bearing model today.** Money is stored as integer minor units per CONTEXT.md. But future schema additions that introduce Decimal columns would have the same silent-string-on-the-wire problem; the client-side helper handles only the lat/lng case, so any new Decimal fields would need their own normalizer or the server-side fix above.

### Anything that surprised me
- **The bug had been latent since the endpoint shipped.** Prisma Decimal → JSON string is documented behavior, but it's quiet until a consumer treats the value as a strict number type. JavaScript's lenient arithmetic coercion (`"43.62" * Math.PI / 180` works) hid it through Phase A's distance math. The first strict-type consumer in this codebase was `leaflet.markercluster`'s bounds aggregation — a transitive dep added in CP2, three rounds after the wire-format mismatch first appeared. Bugs that survive this many code paths are a reminder to type-check at every boundary, not just where a strict-type consumer lives.
- **The CP3.5 misdiagnosis was unusually convincing.** The trace literally matched a documented Vite + Leaflet failure mode. The standard fix (dedupe + optimizeDeps.include) was applied. The session's symptoms cleared after a `.vite` cache clear. Three independent signals all pointing at "duplicate-copy issue" — but the cache clear had cleared a *different* stale state (the stale TS build artifact, or a stale pre-bundle that happened to mask the real bug for a few minutes), not the duplicate-copy condition. The lesson: when the standard fix's verification has a step that incidentally clears unrelated state, you can't tell from the symptom-clearing alone whether the fix actually fixed anything. Capture the trace's distinguishing details (version hashes, frame contents) before applying the fix; capture them again after.
- **Lesson learned for future runtime-tool diagnoses.** Don't trust runtime-environment-tool diagnoses without verifying against actual stack traces. Always inspect the trace before pattern-matching. The Replit agent's pattern-match was reasonable given the symptoms it had; my acceptance of it without re-verifying when the crash recurred was the institutional failure. Step 1 of this hotfix (the diagnostic console.log patch) is the template for future similar bug investigations — capture ground truth before proposing a fix.

---

## Checkpoint 3 v2 — "Search this area" re-rank (not filter)

**Commit:** `<this commit>`. Single commit per the prompt — EID §3.2 spec phrasing fix and the code change ship together as one logical unit ("fix the spec that misled the implementation, fix the implementation").

### What was actually wrong (CP3 v1 retro)

CP3 v1 (`a6ee2b9`) implemented "Search this area" as a **filter** on `displayLocations` — when `searchBoundsAnchor` was set, the memo narrowed the result list to providers inside the visible bounds. Three user-visible failures from Replit testing:

1. **Empty result with no message.** Tapping the button in a region with no providers silently dropped `displayLocations.length` to 0; pin layer disappeared, list cleared, no empty state. Looked broken.
2. **Tier signal collapsed to "best of what's left."** With only ~5–10 providers surviving the filter, `classifyPin`'s top-tier cutoff (`Math.min(3, Math.ceil(totalRanked * 0.25))`) promoted mid-tier pins to top-tier purely because they were now the only candidates. The TOP signal stopped meaning "best fit for the driver" and started meaning "best of what's left after filtering."
3. **Locations along the rest of the route disappeared.** Tap "Search this area" in one region of a long Toronto → Buffalo route, then zoom out — providers along the rest of the corridor were gone. The user became blind to options they could still consider.

Root cause traced to EID §3.2's wording: "re-queries locations relative to visible bounds (not original origin/route); button disappears." The phrase "re-queries" reasonably reads as "narrow to this region." But the user mental model — verified across category-leading apps (Google Maps, Yelp, Tripadvisor, Airbnb, PlugShare) — is "re-rank for this area," not "filter to this area."

### What shipped (CP3 v2)

**[02-eid.md §3.2](docs/search-discovery-overhaul/02-eid.md)** — the "Search this area" subsection rewritten. Before:

> Tap re-queries locations relative to visible bounds (not original origin/route); button disappears.

After (key bullets):

> Tap **re-ranks** existing results relative to the visible map area — it does not filter or re-query. All providers stay visible on the map and in the list both before and after tapping. The ranking criterion shifts from distance-from-origin (or distance-along-route) to distance-from-bounds-center, which feeds `rankIdx` into `classifyPin`.
>
> Pins that fall outside the current visible bounds render at low-tier (gray) via `classifyPin`'s `inVisibleBounds` rule, so the visual answers "what's most relevant for this area" without hiding anything. The user can still see and select gray pins; they just don't compete for top-tier.
>
> Button hides on tap. The in-bounds ratio recomputes against the same set (now re-ordered) on the next moveend/zoomend; the button reappears only if the user pans/zooms enough to disagree with the new ranking again.
>
> **Mental model:** "tell me about this area" (re-rank) — the standard map-discovery pattern across category-leading apps. Not "show only this area" (filter).

**[find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx)** — three structural changes:

1. **`displayLocations` memo no longer filters.** Returns the full `route ? nearbyLocations : initialLocations` set unchanged. `searchBoundsAnchor` no longer in the memo's deps. The bounds-clear-on-context-change effect still fires (origin/destination/route changes still reset `searchBoundsAnchor` to null) — that part is unchanged.

2. **New `rankedLocations` memo.** Sorts `displayLocations` by haversine distance from the bounds center when `searchBoundsAnchor` is set; identity over `displayLocations` otherwise. Stable sort preserves the existing distFromOrigin order on ties. Tap-locked: only re-derives when `searchBoundsAnchor` changes or `displayLocations` itself changes — panning after tapping doesn't reshuffle tiers.

3. **`classifyPin`'s `inVisibleBounds` input lights up.** The marker creation effect snapshots `map.getBounds()` once per run and passes `inVisibleBounds: bounds.contains([loc.latitude, loc.longitude])` per pin. The selection effect does the same per pin during icon-rebuild on selection change. CP1's audit deferred this input pending CP3; CP3 v2 closes the deferred audit point.

The marker effect's `locsToShow` and the selection effect's `selLocs` both switched from `displayLocations` → `rankedLocations` so tier classification (rank-based) and selection-time tier reclassification (rank-based) reflect the active anchor.

The `searchBoundsAnchor` declaration comment block updated to describe re-rank semantics; the old "shifts which client-side filter runs" wording removed.

### Spec sections governing
- [02-eid.md §3.2](docs/search-discovery-overhaul/02-eid.md) — corrected in this commit.
- [02-eid.md §3.5](docs/search-discovery-overhaul/02-eid.md) — `classifyPin`'s `inVisibleBounds` rule (low-tier when false). Already specified; CP3 v2 lights it up at the host call site.
- CP1 handoff section above — the "future-compatible classifier signature" decision. The deferred `inVisibleBounds` audit point closes here.

### Verification
- TypeScript: **21 errors**, baseline holds. Zero new in either touched file.
- Production build: see hotfix verification — local Windows env still environmentally broken from CP2's pnpm/Windows native-deps quirk; Replit's Linux env is unaffected.
- Hotfix stays fixed: `normalizeLocationsResponse` is upstream of `displayLocations` / `rankedLocations`; CP3 v2 touches neither the fetch path nor the response normalizer.

### Decisions made
- **Tap-locked re-ranking (Option A in the prompt), not continuous (Option B).** The marker effect doesn't depend on a `boundsVersion` counter that increments on moveend/zoomend; tier recomputes only when `searchBoundsAnchor` changes (i.e., on tap). User mental model: "Search this area" is the *anchor here* gesture; subsequent panning is exploration, not re-ranking.
- **Haversine over Euclidean for the rank sort.** Sort precision doesn't matter — we're ordering, not measuring. But the existing `haversineKm` helper at the top of find-a-wash.tsx is already in use; reusing it costs nothing and is more honest about what we're computing.
- **`rankedLocations` is a sibling derivation, not a replacement for `displayLocations`.** Per the prompt's "don't shadow it with a 'filtered display set'" rule. `displayLocations` stays the canonical render set; the result-card list and the in-bounds-ratio calculation continue to use it.
- **`inVisibleBounds` snapshot once per effect run, not per pin re-classification.** Marker creation reads `map.getBounds()` once at the top of the locsToShow loop; selection effect reads it once at the top of the markersByIdRef loop. Tap-locked semantics — bounds at marker-creation time anchor the visual classification until the next user-driven re-render.

### Open items for next round (Phase B CP4)
- **Header replacement** per EID §3.1 — last and most structural CP of Phase B. Unchanged scope from the CP3 v1 handoff. Full audit gate.

### Anything that surprised me
- **The spec phrasing was the load-bearing defect.** "re-queries locations relative to visible bounds" is technically accurate (the implementation could read it as "re-rank by distance to the new center") but the natural-language reading is "narrow to this region." Specs that depend on a precise distinction between "re-rank" and "filter" should call out the distinction explicitly, not leave it implicit in a verb choice. This is an institutional reminder to validate spec phrasing against the implementer's first-pass reading.
- **CP1's future-compatible classifier signature paid off.** `inVisibleBounds?: boolean` was added optionally during CP1's audit, with the deferral note "CP3 wires this." Two checkpoints later, lighting it up was a one-line change at the call site — no signature break, no module restructure. Worth doing more of: when adding a new classifier or pure-function helper, accept the optional inputs the spec calls out, even if the immediate consumer doesn't supply them.
- **Lessons learned for spec validation.** Implementation should validate user mental model against a handful of category-leading apps before locking spec phrasing. The "category-leading apps re-rank, don't filter" insight should have been in PRD/EID research, not surfaced during implementation. For Phase C and beyond: when a spec describes a user-facing affordance, the audit step should explicitly ask "does this match what the user expects from comparable apps?" — and answer with at least 3 specific examples — before locking the implementation approach.

### Replit canary protocol
1. Set destination — no crash (hotfix still holds).
2. Pan map ~200km from results — "Search this area" appears.
3. Tap the button — button hides, **all locations stay visible on the map and in the list**, pins outside the bounds dim to gray low-tier, pins inside re-rank by distance from bounds center.
4. Zoom out — previously-out-of-bounds providers stay visible (gray low-tier from where they were). Critical regression check: nothing disappears.
5. Tap an out-of-bounds (gray) pin — selection works, popup opens, gold ring on the gray pin (the selected ring is independent of tier).
6. Set a different destination — `searchBoundsAnchor` clears via the bounds-clear-on-context-change effect, re-ranking resets to origin distance.
