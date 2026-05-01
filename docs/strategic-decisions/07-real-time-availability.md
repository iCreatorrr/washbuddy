# Decision 07 — Real-time availability with two-mode booking

**Date:** 2026-05-01
**Status:** Active
**Affects:** Provider data model; booking flow; search ranking; arrival-time semantics.

---

## Context

The PRD originally deferred real-time provider availability to v2, treating it as a feature that distinguishes the platform from a directory but not as foundational. Reconsideration during today's strategic conversation surfaced that real-time availability is foundational, not deferred — without it, the platform's "+X min detour" promise is a guess rather than a commitment, and providers can't credibly handle bookings made against stale capacity data.

The implementation question: how to handle the reality that some providers can confidently commit to instant booking and some need to confirm bookings before they're final.

## Decision

**Real-time availability is required from v1.** Implemented through a two-mode booking model:

- **Instant Book (default for all providers):** A driver who completes the booking flow gets an immediate confirmation. The slot is held; no provider intervention needed.
- **Approval Workflow (provider opt-out):** A driver who completes the booking flow gets a "request submitted" status. The provider has a defined SLA (default 5 minutes for bookings within 24h, 10 minutes for 24h+) to confirm or decline.

Default: every provider starts in Instant Book mode. Providers must explicitly opt out to Approval Workflow.

## Rationale

**Real-time availability is the difference between a directory and a platform.** A directory tells you a provider exists; a platform tells you whether you can book them right now. WashBuddy's "+X min detour" framing in route mode implies a commitment that the bookable provider can actually take the booking. Without real-time availability, the framing is dishonest — we'd be showing detour times to providers who might be fully booked.

**Two-mode handling respects provider operational reality.** A high-volume wash facility with predictable capacity can confidently commit to Instant Book. A small operator running a single bay during business hours might genuinely need a moment to confirm. Forcing all providers into one mode would push some providers off the platform entirely.

**Default-to-instant biases the platform toward fast booking.** The friction of opting out (rather than opting in) ensures that providers who haven't actively considered the choice still offer the better customer experience. Providers who genuinely need approval will find the setting; providers who don't need it stay in the default and benefit from faster booking conversion.

## Implications

### Data model

```
Provider.bookingMode: enum (INSTANT, APPROVAL)
  // Default: INSTANT. Providers opt out to APPROVAL via settings.

Provider.approvalResponseTimeMinutes: int?
  // SLA for providers in APPROVAL mode. Null for INSTANT mode.
  // Default to platform SLA values (5 min within 24h, 10 min for 24h+).
  // Providers can extend this if they're honestly slower.

Provider.observedResponseTimeMedianMinutes: int?
  // Platform-computed from booking history (median of last 50 bookings).
  // Surfaced in UI later (Round 4+) to give drivers truthful expectations.
```

### Booking flow

- Driver taps Book on a card or pin callout.
- Backend checks provider's `bookingMode`:
  - If INSTANT: immediate confirmation, slot reserved, both parties notified.
  - If APPROVAL: pending request, slot soft-held for the SLA window, provider notified to confirm.
- Driver sees confirmation status appropriate to mode.
- If APPROVAL provider declines or SLA expires: slot released, driver notified, alternative providers suggested.

### Search and ranking

- Both modes appear in search results equally.
- Ranking does not penalize APPROVAL providers; the user trades a small wait for the option of working with that provider.
- The "Open at arrival" semantic handles capacity, not just hours: a provider whose bay is booked at the requested arrival time is filtered out (or visibly marked as unavailable), regardless of mode.

### UI surfacing

The booking-mode UX is invisible by default. See decision 08 for full UX rationale and treatment.

## Reversibility

Adding the data model fields and the two-mode logic is foundational; removing it later would be a regression. The specific defaults (5 min and 10 min SLAs) are configurable values, not hard-coded — they can be tuned without architecture changes.

The decision to default to INSTANT (rather than APPROVAL) is reversible by changing the default value of `Provider.bookingMode`. If we observe that too many providers are in INSTANT mode and consistently failing to honor bookings, we'd flip the default. This is a tuning lever, not a structural change.

## Provider performance feedback loop

The `observedResponseTimeMedianMinutes` field feeds into a future provider-quality system. Providers who consistently miss SLA in APPROVAL mode get nudged (notified, then surfaced in UI as "responds slowly", then eventually removed from default visibility). Providers in INSTANT mode who decline post-confirmation also get tracked. This is platform-level intelligence (decision 02 — platform-side data mining as long-term moat) and ships in later rounds.
