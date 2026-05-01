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
