# Decision 03 — OSRM hosting: self-hosted, production-ready

**Date:** 2026-05-01
**Status:** Active
**Affects:** Round 1 OSRM engineering spike; Round 4 detour-time implementation; ongoing operational cost.

---

## Context

The search-and-discovery initiative requires per-location OSRM (Open Source Routing Machine) computations to deliver detour-time as the primary distance metric in route mode. True detour time = `route(origin → location → destination).duration - route(origin → destination).duration`. This is computationally expensive at scale (tens of route calls per search query) and depends on infrastructure that has to be reliable, fast, and not subject to third-party rate limits.

Three hosting options were considered:

- **Option A — Self-hosted OSRM.** Run OSRM ourselves on dedicated infrastructure with full region data (US + Canada).
- **Option B — Mapbox Directions API.** Use Mapbox as the routing provider; pay per request; outsource ops complexity.
- **Option C — Public OSRM endpoint** (`router.project-osrm.org`). Use the free public service with rate limits, plan migration before launch.

## Decision

**Option A: self-hosted OSRM, production-ready architecture from the start.** Public endpoint is off the table for the chosen architecture.

## Rationale

**Self-hosted gives us control over what becomes a load-bearing platform capability.** Detour-time is one of the most differentiated features in the search experience. If the detour computation is slow, unreliable, or subject to a third-party SLA we don't control, the experience degrades visibly. A pre-launch product can't tolerate that risk on a feature this central.

**Mapbox is a viable alternative but with two concerns.** First, costs scale with usage and become meaningful at scale (tens of routes per search × thousands of searches per day = thousands of API calls per day, priced per call). Second, switching providers later is non-trivial — every routing call is a Mapbox-specific contract. Self-hosting OSRM means routing logic stays portable.

**Public OSRM endpoint is unsuitable for production.** The PRD explicitly takes it off the table. Rate limits and shared infrastructure create operational risk without compensating benefit.

## Implications

- The OSRM engineering spike (parallel with Round 1) validates the self-hosted architecture: deployment model, region data ingest (US + Canada per cross-border decision 06), caching strategy, and per-request latency targets.
- Self-hosted OSRM requires roughly 60GB of region data (US ~30GB + Canada ~30GB) on dedicated infrastructure (Docker containers on a server with sufficient memory and disk).
- Operational responsibility: the team or contractor running OSRM is responsible for region data updates (typically quarterly), version upgrades, and uptime monitoring.
- Round 4's backend implementation depends on the spike's output. The endpoint (`POST /api/locations/with-detour-times`) wraps OSRM as an internal service; the rest of the codebase doesn't know whether OSRM is self-hosted or external.

## Reversibility

If self-hosting OSRM proves operationally too costly during the spike (hardware costs, ops complexity, region data update burden), we revert to Mapbox as a fallback. The interface contract (`POST /api/locations/with-detour-times`) is provider-agnostic, so the migration cost is bounded to the routing service implementation, not the calling code.

The reverse migration (Mapbox → self-hosted) would also be possible later if cost or control become limiting factors, but it's the harder direction because we'd already be paying per-call costs while building self-hosted capacity.

## Open question for the spike

Whether to use OSRM's `route` API per-location or `table` API for the entire result set. The spike documents this decision; it's a performance optimization, not an architectural decision.
