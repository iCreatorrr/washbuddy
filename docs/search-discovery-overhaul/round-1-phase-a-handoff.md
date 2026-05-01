# Round 1 Phase A Handoff — Page Merge Structure

**Branch:** `main`
**Commits:** `ba953d9`, `8f1445f` (spec), `45a58a4` (Checkpoint 1), `b326656` (Checkpoint 2), this commit (Checkpoint 3 / handoff).
**Status:** Checkpoints 1 + 2 verified on Replit by the user. Phase A structural foundation complete; Checkpoint 4 follow-up bundles polish + the desktop autocomplete z-index fix.

---

## 1. What shipped

### New canonical page
[`artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx`](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) — clone of route-planner.tsx with mode-aware behavior. Single source of truth for the merge: `const mode = destination ? 'route' : 'nearby'`. Drives the card meta line (miles in nearby, `+~X min detour · X km from route` in route — detour text bolded, `~` flagging placeholder until Round 4). Three pre-existing TS errors that came along with the clone are fixed in this file (they remain in route-planner.tsx until Round 5 deletes it).

### Routing
[`App.tsx`](artifacts/washbuddy-web/src/App.tsx) gains a `RedirectTo` helper (Wouter has no built-in `<Redirect>`) and the `/find-a-wash` route. Legacy `/search` and `/route-planner` routes redirect to `/find-a-wash`; the route-planner redirect preserves the full querystring so `?from=&to=` round-trips correctly. `RootRedirect` and `RouteGuard` customer fallbacks point at `/find-a-wash` directly to avoid a redirect chain. Lazy imports for the unreferenced legacy chunks are dropped — Vite no longer bundles them, even though the `.tsx` files stay on disk per Round 5's deletion plan.

### Layout suppression + shared mobile menu
[`components/layout.tsx`](artifacts/washbuddy-web/src/components/layout.tsx) gains a `hideMobileHeader?: boolean` prop. When true, the `lg:hidden` sticky header is suppressed; desktop sidebar is unaffected. The mobile menu state is exposed via a new `MobileMenuContext` + `useMobileMenu()` hook so pages with a suppressed header can still trigger the shared dropdown. The dropdown's top offset is dynamic (`top-0` when header hidden, `top-[73px]` otherwise) — without this, the dropdown would render with a 73px gap above it.

### Floating header on /find-a-wash
[`find-a-wash.tsx`](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) reads `useMobileMenu()` and renders two fixed-position `lg:hidden` clusters: top-left (logomark or back chevron via `window.history.length > 1`), top-right (NotificationBell + hamburger trigger calling `mobileMenu.toggle()`). 36×36px circles with backdrop-blur and soft shadow per EID §3.1. Content wrapper gains `pt-14 lg:pt-0`.

### Hamburger menu items
Customer items in [`layout.tsx`](artifacts/washbuddy-web/src/components/layout.tsx) drop the legacy "Find a Wash" → `/search` and "Route Planner" → `/route-planner`, add merged "Find a Wash" → `/find-a-wash` and stub "Saved" → `/saved` (Bookmark icon).

### /saved stub
[`pages/customer/saved.tsx`](artifacts/washbuddy-web/src/pages/customer/saved.tsx) — pure stub. "Saved coming soon" Card under the standard AppLayout shell. No data, no state. Real saved-searches/providers in v1.5 per PRD §10.

### Search helpers extraction
[`lib/search-helpers.ts`](artifacts/washbuddy-web/src/lib/search-helpers.ts) — STATE_NAMES, METRO_ALIASES, resolveStateCode, matchesSearch extracted from search.tsx. search.tsx imports from here; find-a-wash imports too once Phase B's unified search pill needs them.

---

## 2. Spec updates (committed before code)

- [01-prd.md §4.1](docs/search-discovery-overhaul/01-prd.md): route paths corrected to `/search` and `/route-planner` (the old draft said `/customer/...`, which doesn't match `App.tsx`).
- [02-eid.md §2.1](docs/search-discovery-overhaul/02-eid.md): same path correction. Redirect example updated. New note clarifying that `customer/` is in the page filename, not the URL. Querystring preservation language switched from "the `?destination=` query param" to "the full querystring (existing route-planner params: `from`, `to`, `vehicleClass`)" — the route-planner page reads `?from=&to=`, not `?destination=`.
- [02-eid.md §6.2](docs/search-discovery-overhaul/02-eid.md): same path correction in Round 1 scope.
- [02-eid.md §6.7](docs/search-discovery-overhaul/02-eid.md): clarified that the defensive gate banner is in `pages/customer/location-detail.tsx` (the `/location/:id` page), not in the search/find-a-wash page. Earlier "preserve in the merged page" phrasing was misleading.

---

## 3. Verification

### TypeScript
Pre-Phase-A baseline: 21 errors. Post-Phase-A: **21 errors**, identical. Zero net-new errors in any of the 6 files touched (find-a-wash.tsx, search.tsx, search-helpers.ts, App.tsx, layout.tsx, saved.tsx).

### Production build
`PORT=3000 BASE_PATH=/ pnpm -F @workspace/washbuddy-web run build` succeeds. The `find-a-wash` chunk is 186.59 kB / 54.83 kB gzipped. No `route-planner` or `search` chunks are emitted — the redirect-only routes don't carry the legacy code, confirming the migration window's bundle hygiene.

### Code-level don't-regress sweep (against EID §6.7)
- **Pin selection model**: `selectedLocationId` (line 560), `markersByIdRef` (line 674), `fitBounds` only inside the `lastFitKeyRef` gate (lines 1003–1016). The selection effect (lines 1135+) explicitly reads "No setView / setZoom / fitBounds is called here." Inherited from the route-planner clone, untouched in Phase A's mode-aware edits. ✓
- **Hamburger single-state-owner pattern**: `AnimatePresence` is referenced only in a comment block in [layout.tsx:213](artifacts/washbuddy-web/src/components/layout.tsx:213) explaining why it isn't used around the icon. The dropdown still renders synchronously (no exit animation). ✓
- **Defensive gate banner**: [location-detail.tsx:215](artifacts/washbuddy-web/src/pages/customer/location-detail.tsx:215) untouched. Phase A doesn't navigate away from triggering it; the booking-already-exists check still fires when a card or pin chevron routes to `/location/:id`. ✓
- **Active vehicle pill**: [find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) still renders `<ActiveVehiclePill />` at the top of the content. ✓
- **All other shipped flows** (cancellation, review voting, receipt vehicle data, my-bookings tab strip, etc.): Phase A doesn't touch any of those code paths. ✓

### User-side Replit live-tests passed (Checkpoints 1 + 2)
- `/find-a-wash` loads in nearby and route mode with mode-correct meta lines.
- `/search` and `/route-planner` redirect (the latter preserves `?from=&to=`).
- Hamburger has the new structure; `/saved` renders the stub.
- Floating top-left button shows logomark on direct entry, back chevron when navigated to.
- AppLayout mobile header is suppressed only on `/find-a-wash`; other pages render normally.

### Out-of-scope / requires Replit re-verification with the full set landed
- Mobile viewport sweep at 320 / 414 / 768 / 1024 / 1440 (the user verified at 375 during Checkpoint 1+2 live-tests; the wider widths get bundled with the Checkpoint 4 desktop pass).

---

## 4. Known issues for Checkpoint 4

### User-flagged — desktop autocomplete clipping
At 1024 / 1440px, the city-autocomplete suggestions dropdown is clipped behind the map's stacking context. The dropdown uses `z-50` (Tailwind = z-index 50) inline; Leaflet's pane z-indices (markerPane = 600, popupPane = 700) sit above it. Fix by raising the dropdown to `z-[1000]` to match the floating button cluster (or formalize the EID §3.2 z-index variables). Lives in the inline `<CityAutocomplete>` inside [find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) (and the original copy in route-planner.tsx — fix only the find-a-wash copy since route-planner is being deleted in Round 5).

### Code-level — back-chevron heuristic edge case
The floating top-left button uses `window.history.length > 1` to choose chevron vs logomark. A user who lands directly on `/find-a-wash`, taps a location, and returns sees a chevron instead of the logomark because history grew. Same heuristic AppLayout's existing back button uses, so behavior is consistent across the app. Approach B (a Wouter-aware visit-history hook keyed on the prior path) is the cleaner fix; defer until Phase B's full header redesign.

### Code-level — interim cluster z-index vs map controls
The floating top-right cluster (z-1000) overlaps the map's existing fullscreen / expand button (z-401, sitting at `top-3 right-3` inside the map container). Different stacking contexts; the cluster wins visually, but it visually crowds. Phase B / Round 2's bottom-sheet rebuild replaces the route-planner-era fullscreen toggle entirely, so this self-resolves. Don't repaint the inline expand button now.

---

## 5. Deferred to Phase B (Round 2)

Per the Checkpoint 1 prompt's explicit allowance:

- **Full collapsed↔expanded header animation** with framer-motion shared `layoutId` (EID §3.1). Phase A keeps a single header that adapts content (mode-aware card meta line) but doesn't animate between two presentations.
- **Best-fit-for-route sort in route mode**. Phase A keeps `distFromOrigin` ordering in both modes; Round 3 introduces the `bestFitScore` formula from EID §4.6.
- **Time selector**. Doesn't exist today; Round 4 adds it. Phase A's "time selector hidden in nearby" is a no-op.
- **wash-pin component, clustering, search-this-area button, bottom sheet, pin-callout**. All Phase B / Round 2 per the original Round 1 §6.2 EID scope.

---

## 6. File-level summary

**New files:**
- [artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx)
- [artifacts/washbuddy-web/src/pages/customer/saved.tsx](artifacts/washbuddy-web/src/pages/customer/saved.tsx)
- [artifacts/washbuddy-web/src/lib/search-helpers.ts](artifacts/washbuddy-web/src/lib/search-helpers.ts)

**Modified:**
- [artifacts/washbuddy-web/src/App.tsx](artifacts/washbuddy-web/src/App.tsx) — RedirectTo, /find-a-wash + /saved routes, RouteGuard hideMobileHeader prop, customer fallback target update, dropped legacy lazy imports.
- [artifacts/washbuddy-web/src/components/layout.tsx](artifacts/washbuddy-web/src/components/layout.tsx) — hideMobileHeader prop, MobileMenuContext + useMobileMenu, customer hamburger items swap, dynamic dropdown top offset.
- [artifacts/washbuddy-web/src/pages/customer/search.tsx](artifacts/washbuddy-web/src/pages/customer/search.tsx) — imports matchesSearch from search-helpers instead of inline copy.

**Deleted:** none. Legacy page files (search.tsx, route-planner.tsx) stay on disk per Round 5's deletion plan.

---

## 7. For Phase B

- The new pin component (`wash-pin.tsx`) replaces inline `L.divIcon` calls in find-a-wash.tsx (search for `locationIcon`, `activeLocationIcon`, `incompatibleLocationIcon`). The selection effect's icon-swap logic at lines ~1135–1150 will need to call into the new component instead of swapping `L.divIcon` instances.
- The bottom sheet replaces the inline-popup pattern in find-a-wash.tsx (search for `bindPopup`). The pin-tap behavior already calls `selectLocationRef.current?.(loc.id)`; Phase B's sheet hooks into the same `selectedLocationId` state.
- The unified collapsed/expanded header in EID §3.1 replaces the existing route-planner-style search Card and the floating top-right cluster from Checkpoint 2. The cluster is interim — when the new header lands, remove the floating cluster and the `pt-14 lg:pt-0` content padding compensation.
- `lib/search-helpers.ts` is ready to consume; Phase B's unified search pill imports `matchesSearch` for nearby-mode city search.

---

## Checkpoint 5 — Z-index regression + text truncation

**Commit:** `<this commit>`. Three regressions surfaced after Checkpoint 4 (autocomplete dropdown overlapping the bell + vehicle pickers, floating cluster painting over fixed-position dropdowns, long destination text colliding with Edit) plus the truncation polish, fixed as one logical unit.

### What shipped
- [`pages/customer/find-a-wash.tsx`](artifacts/washbuddy-web/src/pages/customer/find-a-wash.tsx) — `CityAutocomplete` dropdown is now portaled to `<body>` via `createPortal` (Approach A from the audit). `position: fixed` at coordinates computed from the input's `getBoundingClientRect()`; recomputed on `window.scroll` (capture phase, to catch nested scroll containers) and `resize` while open; listeners attached/torn down with the open state. Click-outside check now compares against both `containerRef` and a new `dropdownRef` so clicks inside the portaled dropdown don't dismiss it. Both search Card variants drop the Checkpoint 4 `relative z-[1000]`. Floating top-left button + top-right cluster `z-[1000]` → `z-40` (below `z-50` fixed dropdowns; well below the portaled `z-[1000]`). Collapsed-summary From/To `<p>`s gain `truncate` (block-level, where it actually works) and the dead inner `<span className="truncate">` wrappers are removed.

### Spec sections governing
- EID §3.1 (search header presentation modes) — informs the cluster's interim status.
- EID §3.2 (z-index hierarchy) — `--z-header: 1000` is reserved for Phase B's collapsed-pill header. Phase A's interim cluster is **not** that header; it's a temporary affordance and intentionally sits at `z-40` to defer to fixed-position dropdowns. Phase B's redesigned header lives at z-1000 once it lands.
- Checkpoints 1–4 handoffs above — context for what mustn't regress.

### Verification (code + build)
- TypeScript: **21 errors**, baseline holds. Zero new in find-a-wash.tsx.
- Production build: succeeds.
- find-a-wash chunk: 186.59 kB → 187.89 kB raw (54.83 kB → 55.34 kB gzipped). Modest +1.3 kB / +0.5 kB gzipped from the portal logic + position state. `createPortal` from `react-dom` was already a transitive dep; no `package.json` change.
- Replit live verification (user-side): bell dropdown + vehicle picker render above search Card; autocomplete clears the map at 1024 / 1440px; truncation works at 320–1440px with the Edit button always tappable.

### Decisions made
- **Approach A (portal)** over Approach B (conditional z-index) and C (lower Leaflet). Codebase precedent: shadcn's [`ui/popover.tsx`](artifacts/washbuddy-web/src/components/ui/popover.tsx) uses Radix `Portal`. Approach B leaves a transient elevated stacking context that re-cascades on interleaved interactions (autocomplete open → bell tap). Approach C is global and fragile.
- **Cluster z-tier `z-40`**, not `z-50`. `z-40` keeps the cluster above page content but below fixed-position dropdowns at `z-50` (vehicle pill, notification bell), which document order alone wasn't enough to fix.
- **`truncate` on `<p>`** (block-level), not the inner `<span>` (inline, no-op). Outer flex item already has `min-w-0`; Edit button already has `shrink-0`. No structural change.

### Open items for Phase B
- The interim floating top-right cluster (bell + hamburger) and floating top-left button (logomark / chevron) are **replaced**, not relabeled, when the EID §3.1 collapsed↔expanded header lands. Phase B's audit step should plan to delete the `lg:hidden fixed top-4 ... z-40` blocks at the start of `find-a-wash.tsx`'s return, the `pt-14 lg:pt-0` content compensation, and `useMobileMenu()`'s consumption pattern from this page (the menu controller stays in AppLayout for other consumers).
- Phase B's redesigned header sits at `--z-header: 1000` per EID §3.2. Don't permanent-elevate parent containers — Approach A's portal pattern is the way to keep dropdowns above the map without cascade. Reuse `createPortal` for the Phase B unified search pill's autocomplete.
- The `dropdownPos` recompute is positional only — it doesn't constrain the dropdown to remain inside the viewport when the input scrolls partly off-screen. If Phase B's header has scroll-collapse animation, revisit (likely a `bottom`/`flip` policy via Floating UI or Radix `Popover`).

### Anything that surprised me
- The `CityAutocomplete` mounted with the dropdown initially closed and the listeners only attach when it opens, so the first paint after the user types has no position computed yet. Guard: `dropdownPos &&` in the render condition prevents an at-(0,0) flash before the first `recompute()` runs. Cheap to add, and it makes the open-handler order order-independent.
- `window.addEventListener("scroll", recompute, true)` with capture-phase `true` is required to catch scrolls in nested scroll containers (Leaflet's panes, the bottom card list when added in Round 2). Without capture, only document-level scrolls fire.
- Bug 4 from Checkpoint 4 (`detour pending…`) wasn't in scope, but the regression sweep confirmed it still works — the card meta line wasn't touched in this checkpoint.

### Known follow-ups (not in scope)
- **Home-page back chevron**: the `window.history.length > 1` heuristic shows a chevron after a same-page round-trip (`/find-a-wash` → `/location/:id` → back). Phase B can swap to a Wouter-aware visit-history hook if needed.
