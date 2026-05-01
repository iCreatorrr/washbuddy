# Decision 08 — Booking-mode UX: invisible primary surface, expectation-set at booking

**Date:** 2026-05-01
**Status:** Active
**Affects:** Search results display; booking flow; filter architecture (Round 3); result card design (Round 2).

---

## Context

Decision 07 establishes that providers operate in one of two booking modes (Instant Book default, Approval Workflow opt-out). The follow-on question: how does the search UI surface this distinction to drivers?

Four options were considered:

- **A: Badge on results.** Visible "Instant Book" badge on cards and pins for instant providers; approval providers unbadged.
- **B: Filter chip.** A Tier 1 "Instant Book only" filter chip alongside Service Type, Open, Filters.
- **C: Both badge and filter.** Maximum signal density.
- **D: Invisible primary, exception-handled.** No badge, no Tier 1 chip; the difference surfaces only at booking confirmation and (softly) in expanded list view.

Research informed the decision. Airbnb explicitly studied this: when most listings are instant-bookable, badging "Instant Book" creates negative signal because it stops being a positive distinction (everything has it) and implies that listings without the badge are second-class. OpenTable goes further: they don't badge instant or approval at all — the difference surfaces only at booking-flow confirmation. Thumbtack's "Instant Book" badge is meaningful precisely because the supermajority of their listings are NOT instant; for WashBuddy, the supermajority will be instant.

## Decision

**Option D: invisible primary surface, exception-handled at booking moment and in expanded list view.**

Concretely:

1. **No badge on pins.** Pins encode tier, primary service, and detour/price (per the existing pin spec). Adding booking-mode is too much signal density on a small element.

2. **No badge on result cards in the bottom sheet's default state.** The default state is the primary comparison surface; it stays clean and information-dense.

3. **Soft inline indicator in the bottom sheet's expanded state.** When a driver pulls the sheet to expanded for detailed comparison, approval-mode providers show a small text indicator near the open status: "Confirms within {X} min." Not a badge — an informational tag in the existing metadata-line style.

4. **Explicit at booking confirmation.** When a driver taps Book on an approval-mode provider, the confirmation screen clearly states: "{Provider} confirms bookings within {X} minutes." The CTA changes from "Book" to "Request booking." This is where expectation-setting happens, at the moment the driver commits.

5. **Filter for "Instant Book only" exists but is buried.** The all-filters sheet (Round 3) includes an "Instant Book only" toggle in the Availability section. Default off. Not visible until the driver opens the all-filters sheet and finds it. This handles the rare case where a driver is in extreme time pressure and explicitly wants to filter approval-mode providers out.

## Rationale

**Default-to-instant means most listings are instant.** Per decision 07, every provider starts in Instant Book mode and has to explicitly opt out. The expected ratio is heavily skewed toward instant. A badge for the supermajority is invisible (everything has it) or worse, anti-signal (the few without it look broken).

**Drivers are operational users, not leisure shoppers.** They want speed and clarity. Adding visual signal density to the search experience for an exception case taxes the primary use case (most users, most of the time, are booking instant providers without thinking about mode).

**Approval-mode providers shouldn't be penalized at search time.** They might be the best fit for the driver's needs (closest, best service, right vehicle accommodation). Burying them with a "request to book" warning at search time pushes drivers toward instant providers even when an approval-mode provider is genuinely better. The right place to set expectations is at the booking moment — once the driver has committed to that provider.

**The expanded-state inline indicator respects driver autonomy.** A driver who pulls up the expanded list is in detailed comparison mode. They want to see all the relevant details. Showing "Confirms within 5 min" alongside "Open at 4:30 PM" in the metadata line gives them the information without demanding it.

**The all-filters toggle handles edge cases without bloating the primary UX.** A fleet operator planning a tight schedule who genuinely needs guaranteed instant booking can find the toggle. It's not Tier 1 because it's not a primary use case — it's an exception path.

## Implications

### Round 2 (bottom sheet, result cards)

The result card component supports the expanded-state inline indicator. In default state, the card looks identical regardless of mode. In expanded state, approval-mode providers add the "Confirms within {X} min" text to the metadata line, after the open status, separated by `·`.

Format:
```
Default state:    ● Open at 4:30 PM · ★ 4.6 (23)
Expanded state (approval):  ● Open at 4:30 PM · ★ 4.6 (23) · Confirms within 5 min
```

The "Confirms within {X} min" text uses the same typography as other metadata-line items: 11.5px / 400 / `wb-text-2`. No special color or weight.

### Round 3 (filter architecture)

The all-filters sheet's Availability section gains an "Instant Book only" toggle. Default off. Standard checkbox treatment. Match count updates live as user toggles.

### Round 4 (booking flow, arrival logic)

The booking confirmation screen detects provider mode and adapts:
- INSTANT: "Book" CTA, immediate confirmation on tap.
- APPROVAL: "Request booking" CTA, with explanatory text: "{Provider} confirms bookings within {X} minutes."

## What we don't do

- No badge for "Instant Book" anywhere in the search experience.
- No "Instant Book only" filter chip in Tier 1.
- No badge for "Approval Required" anywhere.
- No mode indicator on pins.
- No mode indicator on default-state cards.
- No prejudicial language at search time (no "may not be available", "request to book", "may take longer").

## Reversibility

The UX treatment is fully reversible. Adding badges later (if data shows drivers want the distinction) is a pure UI change. Removing the all-filters toggle later (if data shows nobody uses it) is a pure UI change. The data model from decision 07 supports any UX treatment we eventually settle on.

## When to revisit

Revisit if:

- Driver feedback explicitly says they want to know booking mode at search time.
- Approval-mode providers are systematically failing to confirm within SLA, eroding trust in the platform's commitment.
- A meaningful subset of providers shifts to APPROVAL mode (e.g., >30%), in which case the supermajority assumption breaks and the design rationale changes.
