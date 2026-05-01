# Decision 01 — Modularity level for v1

**Date:** 2026-05-01
**Status:** Active
**Affects:** All implementation rounds; component organization across the codebase.

---

## Context

The codebase organizes UI by page (`pages/customer/...`) and by component category (`components/customer/...`, `components/provider/...`, `components/ui/...`). This is a mix of folder-organized-by-domain and folder-organized-by-page. As the platform grows from driver-only to four surfaces (drivers, providers, fleet, platform), the question is how aggressively to enforce module boundaries.

Three levels were considered:

- **Component-level**: each component is self-contained (state, styles, types co-located), importable independently. shadcn/ui already gives us this pattern.
- **Feature-level**: features (search-and-discovery, booking, profile) become discrete modules with a stable public surface; other features import only from that surface.
- **Domain-level**: each user surface (driver, provider, fleet, platform) becomes its own module with explicit contracts between them — heaviest restructuring.

## Decision

**Component-level modularity for v1.** Each new component is self-contained and importable. We do not restructure into feature-modules or domain-modules right now.

## Rationale

Feature-level and domain-level modularity are tools for managing complexity at scale. WashBuddy is pre-launch with a small codebase. Imposing those structures now creates upfront cost (refactoring, contract design, import-discipline enforcement) without proportionate benefit (we don't yet have multiple teams, conflicting development streams, or a large surface area where module boundaries pay off).

Component-level modularity gives us the immediate benefits (testability, reuse, clean imports) without the structural cost. It also matches the existing codebase, so the search initiative doesn't need to fight prevailing patterns to land.

## Implications

- New components in the search-and-discovery initiative live alongside existing components in `components/customer/` rather than in a separate `features/` folder.
- Provider-side, fleet-side, and platform-side work continues to use the existing `components/<surface>/` and `pages/<surface>/` pattern.
- Cross-cutting utilities (e.g., `lib/service-taxonomy.ts`) live in `lib/` as standalone modules.
- We do not introduce module boundaries (barrel exports, `index.ts` re-exports, or import linting rules) at this time.

## Reversibility

This decision is revisitable before the Phase 2 wave of work begins (after the search-and-discovery initiative ships). The natural trigger to escalate is when a single component or feature crosses surface boundaries (e.g., a shared booking-flow component used by drivers, providers, and fleet) and its contract becomes load-bearing. At that point, feature-level modularity earns its weight.

Restructuring later is a one-time cost; doing it now would be a recurring cost on every commit.
