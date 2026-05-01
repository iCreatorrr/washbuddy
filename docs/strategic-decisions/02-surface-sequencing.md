# Decision 02 — Surface sequencing: drivers first, then providers, fleet, platform

**Date:** 2026-05-01
**Status:** Active
**Affects:** Initiative prioritization across all phases of work.

---

## Context

WashBuddy serves four user surfaces: drivers, providers, fleet operators, and platform (WashBuddy itself). Each has distinct concerns, distinct UI, and distinct development needs. The question is what order to invest in them.

Two viable approaches:

- **Sequential**: One surface at a time, fully built out before moving to the next.
- **Parallel**: Invest in multiple surfaces simultaneously, racing to a balanced minimum across all.

## Decision

**Sequential, in this order: drivers → providers → fleet → platform.**

Driver-side work is the current focus (search-and-discovery overhaul, then booking flow polish). Provider-side work begins after the driver-side initiative ships, drawing on existing partial work in the codebase. Fleet-side work follows providers and requires minimal incremental investment (most current functionality serves fleet admins acceptably). Platform-side work is last, with a specific focus on data mining and analytics that make the platform smarter over time.

## Rationale

**Drivers come first because they're the demand side of the marketplace.** Without drivers booking washes, providers have no transactions, fleet operators have nothing to govern, and the platform has no data. Marketplace dynamics demand demand-side investment first.

**Providers come second because they're the supply-side counterpart.** Once drivers are booking, the provider experience determines whether supply scales. Provider self-service sign-up specifically (see decision 05) is required from v1 because we want provider feedback on the platform itself, not just the listings.

**Fleet comes third because it's a downstream value-add over a working two-sided marketplace.** Fleet admins manage drivers who are already on the platform; they don't need their own onboarding pipeline. The current Fleet dashboard exists in code and just needs polish and bug fixes.

**Platform comes last because it's the data-mining and intelligence layer.** Once drivers, providers, and fleets are all transacting, the platform accumulates data that informs ranking, pricing intelligence, regional analytics, and the longer-term product evolution. Building the platform-admin surface before there's data to mine inverts the value chain.

## Implications

- The search-and-discovery initiative (current) is driver-side only.
- The next initiative after search-and-discovery will be a provider-side initiative — likely a provider onboarding and self-service experience, drawing on the existing provider-side codebase.
- Fleet-side work is scoped as a smaller, polish-and-fix initiative once the two-sided marketplace is healthy.
- Platform-side work is the long-term differentiator: data accumulation makes WashBuddy the canonical platform for commercial vehicle services, with intelligence that competitors can't match without comparable data depth.
- Each initiative has its own folder under `/docs/<initiative>/` with its own PRD, EID, and decisions, following the pattern established by the search-and-discovery initiative.

## Reversibility

This sequencing is the default; deviation is allowed when a specific opportunity demands it. For example, if a provider onboarding bug is blocking pre-launch validation work, we'd patch it even mid-driver-initiative. The order is a planning aid, not a constraint on tactical responsiveness.

The platform's data-mining ambition (the long-term moat) is a permanent strategic commitment, not a phase that ends. Surface order describes when we invest in user-facing work; data accumulation begins at v1 and never stops.
