# Decision 06 — Cross-border: US and Canada from launch

**Date:** 2026-05-01
**Status:** Active
**Affects:** OSRM region data scope; payment infrastructure; tax handling; provider onboarding markets.

---

## Context

WashBuddy is based in Toronto with significant US clientele. Cross-border operation is reflected in CONTEXT.md as a foundational architectural decision (providers price in local currency, customers see fleet's currency). The question is whether to launch in both markets simultaneously or stage US-first then Canada.

## Decision

**Launch in both US and Canada simultaneously.**

## Rationale

**The team's existing relationships span both markets.** Limiting v1 to US-only would arbitrarily exclude Canadian providers and customers we've already identified, for no operational benefit. Cross-border isn't an aspirational expansion goal — it's the team's actual market.

**The architecture has been designed cross-border from day one.** Currency handling (USD/CAD), provider pricing in local currency, customer display in fleet currency, and tax handling per province/state are foundational decisions, not retrofit. Launching US-only would be cheaper in the very short term but would force a cross-border retrofit later, which is more expensive than building cross-border from the start.

**Geographic separation by border is the wrong axis.** Toronto-NYC traffic is a heavily-traveled motorcoach corridor. Drivers and fleet operators routinely cross the border in normal operations. A platform that handles only one side of the border misses the use case.

## Implications

**Routing infrastructure:** Self-hosted OSRM (decision 03) requires both US and Canada region data, doubling the data footprint to roughly 60GB. Region updates apply to both data sets.

**Payments:** Cross-border payment flow (USD/CAD conversion, Stripe Connect with multi-currency support, settlement to providers in their local currency) is a v1 requirement. Stripe handles the mechanics; the platform decides exchange rate timing (at booking vs. at settlement) and disclosure to customers. This decision is documented separately when the financial flow is built out.

**Tax handling:** Sales tax/GST/HST handling differs by jurisdiction. US states have different tax rules; Canadian provinces have GST + provincial HST/QST. Providers are responsible for tax compliance in their own jurisdiction; the platform displays tax-inclusive prices and remits records to providers. Specific tax mechanics are scoped during the financial flow build-out, not the search initiative.

**Compliance:** Privacy law differs between jurisdictions (PIPEDA in Canada, state-level laws in the US). The platform is designed for the more restrictive standard (typically Canadian) so it satisfies both.

**Provider onboarding:** Provider sign-up (decision 05) accepts both US and Canadian addresses, identity documents, and tax forms. The sign-up flow detects country and presents the appropriate inputs.

**Market labels:** Throughout the platform, "metro" or "region" labels work across borders (e.g., "Toronto metro" and "NYC metro" are equivalent constructs). No US-vs-Canada toggle is exposed to drivers; the system treats it as one continuous market.

## Implications for the search-and-discovery initiative specifically

- OSRM spike scopes both US and Canada region data.
- Detour-time computations work for cross-border routes (Toronto → Buffalo, NYC → Montreal).
- Provider listings include their currency; the search UI displays prices in the fleet's currency (with conversion).
- "Open at arrival" semantics handle cross-timezone correctly (a Toronto driver searching for a wash in Buffalo sees Buffalo's local time correctly).

## Reversibility

Strategically, this decision is permanent. The team's market is cross-border; ignoring half of it isn't a viable position. Tactically, individual cross-border features (multi-currency conversion, cross-border tax handling, etc.) ship in pieces, so the implementation can be staged even though the strategic intent is single-launch.
