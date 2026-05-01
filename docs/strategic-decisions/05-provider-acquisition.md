# Decision 05 — Provider acquisition: hybrid curation plus self-service from v1

**Date:** 2026-05-01
**Status:** Active
**Affects:** Provider-side product scope; pre-launch operational work; provider feedback loops.

---

## Context

The platform launches with hand-curated providers. The team has decades of industry relationships and has already identified an initial cohort of providers who would join the platform. The question is whether self-service provider sign-up is a launch requirement or a later-stage feature.

The PRD defaulted toward "curated only at launch, self-service later." Reconsideration during today's strategic conversation surfaced a stronger position.

## Decision

**Hybrid model: curated initial cohort plus working self-service sign-up from v1.** Self-service is required from launch, not deferred.

## Rationale

**Self-service sign-up is itself a product surface that needs validation.** Providers who go through the sign-up flow give us feedback on whether the platform represents their business well — does the listing display their services correctly, do the photos and descriptions feel professional, does the pricing display match how they actually quote, do the operational settings (Instant Book vs. Approval, hours, capacity) reflect their workflow.

This feedback can't come from curated providers because curation is hand-holding. The team enters their data on their behalf. Curated providers don't experience the sign-up flow as customers — they experience a concierge service. Self-service is the test.

**Curated launch protects quality at v1.** We're not opening sign-up to anyone, anywhere. The initial provider cohort is invite-controlled (we approve who gets onto the platform) but uses the self-service sign-up flow once invited. The flow is the same; the gate is invitation, not the flow itself.

**The platform vision is provider business management, not just marketplace listing.** The long-term goal is for providers to use WashBuddy as the platform through which they manage their business — bookings, customer relationships, business analytics. Self-service onboarding is the first interaction with that platform vision. If it's clunky, providers will reasonably conclude that the rest of the platform is clunky too.

## Implications

- Provider sign-up is a real product surface, designed and validated alongside driver-side surfaces (though sequenced after the search initiative per decision 02).
- The provider-side initiative (after search-and-discovery ships) includes self-service sign-up as a primary deliverable, not a stub.
- Provider invite/approval gating is a separate layer above sign-up. Invites are issued by the platform team; sign-up is what happens once a provider accepts an invite.
- Provider onboarding includes setting `bookingMode` (decision 07), service catalog with the new taxonomy (Round 0), pricing, hours, capacity, and amenities.
- The sign-up flow itself becomes a feedback channel — we explicitly solicit provider opinions on the flow as part of onboarding.

## What "self-service" means concretely

- A provider can complete sign-up without WashBuddy team involvement (no manual steps required to publish a listing).
- The flow is mobile-friendly (some providers will sign up from their phones).
- Errors and edge cases are handled gracefully (incomplete data, missing photos, invalid pricing).
- The provider can edit their listing post-sign-up without re-engaging WashBuddy support.

## What "self-service" does not mean

- Open public sign-up. Sign-up requires an invitation code or a hand-approved email.
- Zero-touch curation. Some providers will get hands-on help; the flow supports both modes.
- Permanently auto-approved. We retain the right to suspend listings that don't meet platform standards.

## Reversibility

The decision to invest in self-service sign-up from v1 is reversible only at the cost of significant rework. Once the provider-side initiative ships with self-service, removing it would be a regression. We'd more likely tune the gating (more or less restrictive) than remove the capability.
