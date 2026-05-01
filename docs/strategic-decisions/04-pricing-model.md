# Decision 04 — Pricing model: 15% / $25 cap for v1, with subscription transition path

**Date:** 2026-05-01
**Status:** Active
**Affects:** Booking transactions; provider economics; financial flow architecture.

---

## Context

WashBuddy's marketplace model requires a pricing structure that compensates the platform fairly while leaving providers and customers with healthy economics. The current implementation uses a per-transaction fee: 15% of service total, capped at $25 per vehicle booking. The fee is built into the customer-facing price (single all-in price, no separate line item); the provider sees their own price.

The question is whether to commit to this model long-term or design for a transition.

The 15%/$25 model has known limitations:
- It taxes the motion the platform wants most (more transactions = more fees, which discourages high-frequency use by fleet operators).
- It scales linearly with transaction volume rather than with platform value, which can become extractive at fleet scale.
- It compares unfavorably to subscription models that fleet operators may prefer for budgeting predictability.

Subscription models have their own complications:
- Subscription pricing depends on knowing supply and demand curves we don't yet have.
- Setting tiers prematurely creates churn risk if pricing turns out wrong.
- Provider incentives change under subscription models (less revenue per booking but higher volume).

## Decision

**Ship v1 with the 15%/$25 per-transaction model.** Architect the financial flow to support a transition to a subscription + small-fee model later without major rework.

## Rationale

**The platform is pre-launch.** Per-transaction fees are the right primitive for early-stage marketplaces because they self-adjust to volume — if volume is low, the platform earns little; if volume is high, the platform earns more. This avoids the failure mode where a subscription model is mispriced and either undermonetizes or creates churn.

**Subscription is the likely future state.** Fleet operators consistently prefer predictable monthly costs over variable per-transaction fees. Once we have data on usage patterns, average transaction value, and fleet size distribution, we can design a subscription model that captures more value while feeling fair to the customer.

**The architectural commitment is to flexibility, not the specific number.** What matters is that the codebase can support a different fee structure without rewriting the booking flow, the financial reporting, or the provider payout logic. The recently-completed cleanup (deprecating `platformFeeMinor` on Service, moving fee calculation to booking time) supports this — fees are computed dynamically per booking, not baked into static service pricing.

## Implications

- v1 ships with 15%/$25 per-transaction. Booking flow displays single all-in price to customer; provider sees pre-fee price.
- The fee calculation lives in a single, testable module (`computePlatformFee(booking)` or similar), not scattered across the codebase.
- Provider earnings reports show pre-fee amounts (they earn what they earned, no surprise).
- Customer-side reports show all-in amounts (no surprise charges).
- The `Service.platformFeeMinor` field is set to 0 in seed data and not read by new code (deprecated for fee calculation).

## When to revisit

The natural trigger to revisit pricing is when we have data to support a different model:

- **Trigger A**: A meaningful subset of fleet customers (5+) explicitly request subscription pricing or churn citing per-transaction cost.
- **Trigger B**: We have 6 months of transaction data showing usage patterns that don't fit per-transaction pricing well.
- **Trigger C**: A competitor launches a subscription model and customer expectations shift.

The pricing-model conversation is itself a multi-week strategic conversation involving customer research, provider conversations, and financial modeling. It deserves its own initiative when the time comes.

## Reversibility

Fully reversible. The architectural design supports any reasonable fee structure. The "decision" here is the v1 number; the flexibility is permanent.
