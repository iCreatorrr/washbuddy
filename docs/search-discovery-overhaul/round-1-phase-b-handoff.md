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
