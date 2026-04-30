# WashBuddy — Future Strategic Considerations

**Document type:** Living doc capturing strategic ideas worth keeping on the radar. Not a roadmap. Not a commitment. Context, rationale, and rough valuation for each.

**How to use this:** When prioritizing the next phase of work, scan this doc for items that have either gained urgency or become unblocked. Items move out of this doc into actual PRDs when they're ready to ship.

**Last meaningful update:** 2026-04-29.

---

## 1. Saved searches & saved providers

**The idea:** Drivers and fleet operators save common searches ("Tuesday Buffalo run with hand wash + dump") and favorite providers ("our regulars in NYC metro"). Both surface as one-tap shortcuts in the search flow.

**Why it matters:** Fleet operators run repeating routes. The same Charlotte-to-Nashville charter every Friday means re-entering the same destination, services, and filter set every time. Saved searches eliminate that friction. More strategically, saved providers create a switching cost — once an operator has a curated list of trusted providers, leaving WashBuddy means rebuilding it. This is a defensive moat that grows in value with usage.

**Why it's deferred from phase 1:** No pre-launch users mean nothing to save yet. Saved searches are a feature that needs an existing search history to feel valuable. Better to ship with the search experience polished and add saved-search as a v1.5 enhancement once usage patterns emerge.

**Implementation sketch:**
- New `SavedSearch` model: per user, with serialized filter state, optional name, optional schedule (for "remind me on Tuesday").
- New `FavoriteProvider` model: per user, list of `Location` ids with optional notes.
- "Saved" entry in hamburger menu, pointing to a list of saved searches and saved providers.
- Heart icon on provider cards and detail pages for one-tap save.
- Filter sheet header gets a "Save this search" button.
- The smart auto-suggestion: after a user runs the same search 2-3 times in a short window, surface an inline "Save this search?" prompt. Spotify "Add to playlist" pattern.

**Estimated value:** High once usage is established. Estimated effort: medium (~1 round each for searches and providers if done sequentially).

---

## 2. Real-time provider capacity & parallelism-aware scheduling

**The idea:** Currently the system can know that a provider supports parallel services in principle (the simple capability flag we'll have from phase 1) but doesn't know whether a specific arrival time has the capacity to actually run them in parallel. v2 adds real-time bay/staff availability so the estimate adapts to current load.

**Why it matters:** A provider with three bays and a fully-booked Tuesday afternoon can't actually run a customer's hand wash + interior + dump in parallel even if their general capability flag says they can. Showing a 60-minute estimate when reality will be 105 minutes is the kind of bad data that destroys trust in the platform's recommendations. With real-time capacity awareness, the estimate adapts: "Est. 60 min" becomes "Est. 105 min — provider is busy at this time" or alternatively "Open 30 min later for a faster service."

**Why it's deferred:** Requires providers to maintain accurate bay-and-staff availability data in real time. That's a substantial provider-side workflow change and shouldn't precede the basic flow shipping. Also, the v1 simple model (declared parallelism capability + per-service durations) is "good enough" for honest estimates with normal variance.

**Implementation sketch:**
- Provider profile gets `numBays` and `numStaff` (or similar) — already partially in WashBay model.
- Booking system tracks bay occupancy through time.
- Search-time query for a provider checks current load at the requested arrival time and computes a real-capacity estimate.
- Card display becomes: "Est. {time} — {confidence indicator}" where confidence is based on data freshness.

**Estimated value:** High for power users and large fleets where small estimate errors compound. Estimated effort: large (multiple rounds, touches search, booking, provider-side bay management).

---

## 3. Hours-of-service awareness in ranking

**The idea:** Surface FMCSA / Canadian hours-of-service constraints in the search experience. A driver who's already 7 hours into their shift sees different recommendations than one who just started.

**Why it matters:** This is the audience-specific superpower that no generic mapping or marketplace product can match. Drivers track their hours obsessively because violations are six-figure fines. An app that knows "you have 2 hours of driving window left, here's the closest viable wash that doesn't push you into violation" is dramatically more useful than one that just shows distances. This is the kind of feature that creates evangelism among the target user base.

**Why it's deferred:** Requires either driver self-reporting of current hours (annoying and unreliable) or ELD integration (technically complex and platform-specific — Geotab, Samsara, KeepTruckin etc. all have different APIs and authentication).

**Implementation sketch (light version):**
- Driver can optionally enter "hours remaining today" before searching. Defaults from a setting.
- Search ranking considers detour + service time vs. hours remaining.
- Cards visually flag locations that would push the driver into a violation if they completed services there ("⚠ Would exceed your driving window").

**Implementation sketch (full version):**
- ELD integration with the major providers.
- Live hours read on app open.
- Real-time recommendations adapt as the driver's hours change throughout the day.

**Estimated value:** Light version: medium (incremental useful tool). Full version: very high (platform-defining differentiator). Estimated effort: light = small, full = very large + ongoing partner integration cost.

---

## 4. Provider photos with structured categories

**The idea:** Providers upload photos categorized by purpose: "Bay entrance," "Facility overview," "Driver amenities," "Approach from road." Different photos surface in different contexts (search card, provider detail, navigation arrival).

**Why it matters:** Three specific decisions photos help with: "Will my coach fit?" (bay entrance photo answers what specs alone don't), "Is this a real operation?" (facility overview), and "Where do I pull in?" (approach from road — the photo nobody takes but every driver wishes existed). Providers with photos signal more professionalism and reduce first-visit friction.

**Why it's deferred from phase 1:** Photos require provider-side upload UI, storage infrastructure, moderation policy, and content guidelines — none of which exist today. Better to ship the search overhaul with text-based provider data first and add photos when the supply side has settled into the platform.

**Implementation sketch:**
- New `LocationPhoto` model with photoType enum and FileAsset reference.
- Provider-side upload UI in their profile settings.
- Search card shows single thumbnail (priority: bay entrance > facility overview > nothing).
- Provider detail shows a small carousel.
- Cards without photos collapse height — no placeholder stock images.
- At onboarding, photos are encouraged but not strictly required (see consideration in §4.1 below).

### 4.1 Bay-entrance photo as onboarding requirement

A specific subcase worth considering for the curated launch phase: requiring a bay-entrance photo at provider onboarding. This serves two purposes — (a) drivers get a useful trust signal, and (b) providers who can't or won't send a clean bay photo are signaling something about their operation that the curation team should investigate.

**Estimated value:** Medium-high. Estimated effort: medium (provider upload UI + storage + display).

---

## 5. "Search this area" pattern with map-bounds-driven results

**The idea:** When the user pans or zooms the map to a different area than what was originally searched, a "Search this area" button appears. Tapping it re-queries for locations within the visible map bounds rather than relative to origin/destination.

**Why it matters:** This is the Yelp / Google Maps / Tripadvisor pattern that users now expect from any map-based discovery experience. Without it, panning the map to a different region feels broken — the list still shows locations from where the search started, disconnecting from what the user is looking at.

**Why it's deferred:** It's listed as a phase 1 feature in the search PRD but flagged here because it's substantial enough to potentially get cut for time. If cut, it absolutely belongs in phase 1.5 because the disconnect between map view and list ordering is a known UX pain point.

**Implementation sketch:**
- When user pans/zooms such that fewer than X% (suggested 50%) of currently-listed locations are in visible bounds, button appears.
- Button query: location list within bounds + applied filters, ranked by some relevance scoring (distance to bounds center? distance to a tentative center-point of the user's interest?).
- Tapping the button updates the list and clears the route mode's "best fit for route" sort, replacing with "distance from map center."

**Estimated value:** High — solves a user-flagged friction point. Estimated effort: small.

---

## 6. Provider taxonomy / trust badges

**The idea:** Once curation alone isn't enough to communicate quality, introduce specific badges on provider cards: "Verified," "Pro Fleet Operator" (BEGIJ pattern — provider also runs a fleet), "Quick to Respond" (response SLA history), "Premium Service" (verified premium amenities).

**Why it matters:** As the platform scales beyond curation and supply density grows, drivers need quality signals to compare providers efficiently. Badges are scannable shorthand for what would otherwise be a deep-dive into reviews and amenities.

**Why it's deferred (and why we're not doing it now):** While the platform is still in curated-launch mode, every provider is hand-vetted. Adding "Verified" to every card communicates nothing because there's no contrast. Worse, badges introduced too early get devalued by being universal. The clean play: launch without badges, communicate curation as a platform-level promise, reserve the badge slot for when it earns its place.

**When to introduce:**
- When a meaningful subset of providers do something extra worth highlighting (certification, insurance verification, accepting WashBuddy direct payment, etc.).
- When the supply side opens beyond manual curation and a quality signal becomes useful.
- When data exists to justify performance-based badges (response SLA, completion rate, etc.).

**Implementation sketch:** Tag-based, similar to capability flags. Each provider has zero or more badges from a curated platform list. Badges render on cards as small icons with tooltip on tap.

**Estimated value:** Medium-high once thresholds are crossed. Estimated effort: small once the criteria are decided.

---

## 7. ELD integration & route optimization for fleet admins

**The idea:** For larger fleets, integrate with their existing fleet management systems (telematics, ELD, dispatch software) so WashBuddy becomes part of the operational workflow rather than a separate consumer-style app.

**Why it matters:** A 50-coach fleet doesn't have drivers individually picking wash stops on a phone app. They have a dispatch operation that integrates wash scheduling into route planning. WashBuddy that feeds into Geotab / Samsara / etc. and surfaces wash stops in the dispatcher's existing tooling is a fundamentally different and bigger product than a driver-facing app.

**Why it's deferred:** Way too early. Get the driver experience right first, then look at fleet-admin integrations once volume justifies the partner work.

**Implementation sketch:** Public API for fleet partners. Webhooks for booking events. SSO for fleet admins. Integration partners over time.

**Estimated value:** Very high (changes the addressable market). Estimated effort: very large + ongoing.

---

## 8. Bundled multi-stop charter washes

**The idea:** For long-haul charters, a fleet operator can book a sequence of services across multiple providers as a single "trip wash plan" — Tuesday's Buffalo stop with provider A, Thursday's NYC return stop with provider B. Atomic booking, single payment, single confirmation.

**Why it matters:** Charter trips often need two washes (depart-clean and return-clean), and the operator is making decisions about both at the same time. Forcing them into two separate bookings on different days fragments the workflow. Bundled trip-wash plans match how the operator actually thinks.

**Why it's deferred:** Booking flow is complex enough as a single-stop transaction. Multi-stop adds payment complexity (split payment? cancellation logic?), provider coordination complexity, and UX complexity around scheduling.

**Implementation sketch:** New `WashPlan` model containing multiple `Booking`s. Multi-stop search experience. Plan-level cancellation and modification. Provider-side: just sees individual bookings as today.

**Estimated value:** Medium-high for charter operators specifically. Estimated effort: large.

---

## 9. Subscription / repeating wash plans

**The idea:** A fleet runs the same wash schedule every week (every coach gets a standard interior + exterior every Friday). Rather than booking each one manually, set up a subscription that auto-creates bookings on a recurring schedule.

**Why it matters:** Most fleet washing is recurring, not ad-hoc. The recurring case is where 80% of the volume actually lives. A platform that makes recurring effortless captures that majority.

**Why it's deferred:** Worth noting that the schema already has `FleetRecurringProgram` and `FleetGeneratedTask` models — there's clearly some prior thinking here. Worth investigating whether to revive that work as a coherent v2 capability rather than treating it as unrelated existing tech.

**Implementation sketch:** Use existing schema. New customer-side UI for setting up recurring programs. Provider-side acceptance/rejection of recurring slots. Edge cases: holidays, vehicle availability changes, route changes.

**Estimated value:** Very high once supply density supports it. Estimated effort: medium-large.

---

## 10. Direct-payment processing & marketplace fees

**The idea:** WashBuddy handles payment from driver to provider directly, taking a marketplace fee. Providers get next-day or weekly settlement. Drivers see WashBuddy as the single source of payment record.

**Why it matters:** This is the marketplace business model. Without it, WashBuddy is a discovery and booking tool but not a marketplace — providers handle their own payment outside the platform, and the platform's role is informational. Direct payment is what turns this into a transactional business.

**Why it's worth thinking about now:** The schema has substantial payment-related models already (`PaymentIntentInternal`, `PaymentEvent`, `RefundInternal`, `ProviderPayoutBatch`, `ProviderPayoutItem`). Some payment-flow work has clearly been done. Worth understanding the current state and gap before deciding when to push it forward.

**Implementation sketch:** Stripe Connect (most likely) for marketplace payments. KYC for providers. Dispute handling. Refund and cancellation flows that integrate with payment state. 

**Estimated value:** Defines the business model. Estimated effort: large + ongoing compliance.

---

## 11. Driver onboarding with vehicle photo and verification

**The idea:** First-time drivers complete a richer onboarding: upload vehicle photos (for visual identification at provider sites), enter fleet info, register specific equipment quirks ("low-clearance entertainer coach — needs special bay"), set notification preferences.

**Why it matters:** A richer driver profile improves matching, reduces friction at provider sites (the provider knows what they're looking for), and creates a stickier relationship with the platform.

**Why it's deferred:** Less urgent than supply-side polish. Drivers will use the platform with a basic profile; the richer profile is a v1.5 enhancement.

**Estimated value:** Medium. Estimated effort: medium.

---

## 12. Provider-of-record feature for fellow operators

**The idea:** When a provider is also a working fleet (the BEGIJ pattern from the source taxonomy doc), surface that they understand the customer's needs from the operator side. A small icon, optional copy, and possibly priority routing for fleet-operator-to-fleet-operator bookings.

**Why it matters:** Fellow operators have a specific kind of trust between them — "they get it because they're us." Surfacing this creates a small but real preference axis that competitors can't replicate without changing their supply mix.

**Why it's deferred:** Need to know which providers fall into this category first. Once data exists, the feature is small.

**Estimated value:** Low-medium individually, but it's the kind of differentiator detail that compounds. Estimated effort: small.

---

## 13. Wash-quality verification with before/after photos

**The idea:** Use the existing `BookingPhoto` model (which already has BEFORE/AFTER/PROBLEM_AREA categories). Driver uploads BEFORE photos at check-in; provider uploads AFTER photos at completion. Driver reviews AFTER photos before paying. Disputes have photographic record built in.

**Why it matters:** Wash quality complaints are a major friction point in this category. Photographic evidence preempts most disputes and creates accountability that improves quality over time. The schema is already in place, suggesting this has been thought about — the implementation just hasn't followed.

**Why it's deferred:** Solid foundational feature but not blocking the search overhaul. Worth coming back to once the discovery flow is polished.

**Estimated value:** High for trust and dispute reduction. Estimated effort: medium (photo UI exists in patterns; needs the booking-flow integration).

---

## 14. Map provider upgrade (Mapbox or premium tiles)

**The idea:** Migrate from Leaflet + OpenStreetMap tiles to Mapbox (or a similar premium provider — MapTiler, Maptiler, ProtoMaps with a custom style). Better-rendered tiles, better routing data, optional 3D and traffic, better place data for search and POI display.

**Why it matters:** OSM tiles look amateur compared to what users now expect from any modern mapping app. Once the platform has paying customers, the visual quality of the map is a meaningful trust signal — it's the largest visual surface the user looks at, and it's the first thing that signals "this is a real product." Mapbox also gives access to better routing (Mapbox Directions API supports detour-time queries natively), traffic-aware ETAs, and 3D rendering for a premium feel.

**Why it's deferred:** The free OSM stack (Leaflet + OSM tiles + public OSRM) gets the v1 product to market without infrastructure cost. Switching incurs (a) Mapbox subscription costs that scale with usage, (b) a small but non-trivial code migration to Mapbox GL JS or a wrapper, and (c) re-styling work to ensure the premium tiles match the app's aesthetic.

**Implementation sketch:**
- Mapbox GL JS replaces Leaflet (different API, but conceptually similar).
- Mapbox Directions API replaces OSRM for routing and detour-time queries — likely simplifies the detour-computation backend significantly.
- Mapbox Search Box API replaces Nominatim for autocomplete — better address-level matching, POI search, and country-restricted scoping.
- Custom Mapbox Style for branded look (water in WashBuddy blue, transit lines de-emphasized, etc.).
- Cost monitoring from day one. Mapbox's free tier is generous for early-stage products but scales linearly with map loads.

**Estimated value:** Medium-high. The product feels meaningfully more polished, and several search/routing features become easier to build. Estimated effort: medium-large (full migration, styling work, cost monitoring setup).

---

## Things deliberately NOT in this doc

These are ideas that came up at various points but I'm explicitly recommending against:

- **Premature feature gating / paid tiers.** Too early. The product has to work for everyone before it can have a premium tier.
- **Social features (driver community, public reviews of facilities beyond ratings).** Not the audience. Drivers don't want a social product.
- **AI chatbot interface for searching.** Search filters are right for this audience. Drivers know what they want; they don't need to "have a conversation" with an app to find a wash.
- **Aggressive gamification (badges for drivers, points, levels).** Wrong tone for B2B operations.
- **Generic "deals" or "promotions" surfaces.** Conflates this with consumer apps. Pricing in this space is contractual and relationship-based, not promotional.
