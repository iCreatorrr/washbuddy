# WashBuddy — Service Taxonomy Decision

**Document type:** Architectural decision document. Frames the problem, lays out options, recommends an approach.

**Why this exists:** Several user-facing improvements in the search overhaul (Service Type filter chip, service picker sheet, "Est. $X for selection" pricing, service-availability pin glyphs) require the platform to know which canonical service category each provider's services belong to. The current schema has no such concept — Service is a freeform per-location record. This decision unblocks the search PRD and sets the foundation for several future product capabilities.

---

## 1. The current state

`Service` model (per Location):

```
model Service {
  name              String   // "Express Wash", "Full Detail", "Premium Hand Wash"
  description       String?
  durationMins      Int
  basePriceMinor    Int
  maxVehicleClass   String   // length-only gate
  ...
}
```

What this gives us:
- A provider can offer any list of services they want, named whatever they want.
- The booking flow shows the provider's service list and lets the driver pick from it.
- Pricing and duration are per-service.
- There's no way to say "show me providers that offer exterior washes" without doing string matching against `name`.

What it doesn't give us:
- A consistent way to compare like-for-like services across providers.
- A clean filter for "show me providers that do interior cleaning."
- The ability to surface category-level pricing comparisons ("hand wash with dry typically costs $90-180 in this region").
- A way for drivers to specify what they need without first picking a provider.

---

## 2. Why this matters now

The search & discovery overhaul (PRD: `01-search-and-discovery-prd.md`) introduces UX patterns that assume canonical categories:

- **Service Type filter chip** — primary entry point, opens picker for "Exterior wash / Interior cleaning / Restroom dump / Restock & consumables." Without categories, this doesn't work.
- **Service-availability glyphs on map pins** — pin shows water-drop for wash, vacuum for interior, etc. Without categories, can't choose the glyph.
- **"Est. $X for selection" pricing** — sums service-category-level base prices. Without categories, can't sum because we don't know which services to include.
- **All-filters service-detail subcategories** — "Hand wash with dry," "Two-step (acid)," "Mobile wash" filters under Exterior wash. Implies a two-level hierarchy.

These patterns are not negotiable for a world-class search experience in this category. The driver's primary mental model is "I need X, Y, and Z services" — not "I need to pick a provider and then see what they offer." Forcing the latter inverts the funnel and makes the marketplace feel like a directory rather than a booking engine.

---

## 3. The options

### Option A — Platform-defined taxonomy, providers map their services to it

Introduce a closed enum of canonical service categories at the platform level. Every Service must be tagged with one (or potentially more) categories at creation time.

```
enum ServiceCategory {
  EXTERIOR_WASH
  INTERIOR_CLEANING
  RESTROOM_DUMP
  RESTOCK_CONSUMABLES
}

enum ServiceSubcategory {
  // Exterior wash sub-types
  EXT_DRIVE_THROUGH
  EXT_HAND_WASH
  EXT_HAND_WASH_DRY
  EXT_TWO_STEP
  EXT_PRESSURE_ONLY
  EXT_MOBILE
  // Interior cleaning sub-tiers
  INT_TURN_CLEAN
  INT_STANDARD
  INT_DEEP_DETAIL
  // ...
}

model Service {
  name           String          // still freeform — "Premium Hand Wash with Wax"
  category       ServiceCategory
  subcategory    ServiceSubcategory?
  ...
}
```

**Pros:**
- Clean, predictable filtering and aggregation.
- Strong search and comparison UX.
- Enables platform-level analytics ("average dump price in NYC metro").
- Forces providers into a shared vocabulary, which is itself a value the marketplace adds.

**Cons:**
- Requires every existing provider's services to be re-classified. With curated launch, this is tractable — onboarding team can do it during provider intake. Past the curated phase, it's a UX burden on providers at signup.
- Closed taxonomy is brittle. Adding a new sub-type later requires schema migration, code change, and data backfill.
- Some real services don't fit cleanly into one category. A "wash + interior detail combo" package would have to either pick one category (loses information) or have multiple categories (data complexity).

### Option B — Tag-based, open vocabulary with platform-suggested tags

Instead of a closed enum, services have free-form tags that the platform can suggest from a curated list but doesn't strictly enforce.

```
model Service {
  name    String
  tags    String[]  // ["exterior", "hand-wash", "with-dry", "premium"]
  ...
}
```

The platform maintains a "primary tags" list (`exterior`, `interior`, `dump`, `restock`) and surfaces them in the picker sheet.

**Pros:**
- Flexible. New tags can be added without schema changes.
- Multi-tag services represent themselves naturally (a combo service tags as both exterior and interior).
- Low data-quality cost on providers — they can use the suggested tags or invent their own.

**Cons:**
- No data-quality guarantee. Providers may use inconsistent tags ("ext-wash" vs "exterior" vs "wash"), breaking search.
- Filtering logic becomes set-membership-and-fuzzy-match rather than clean enum equality.
- Aggregation and analytics are harder.
- "Inventing your own tag" sounds nice in principle but in practice means most providers don't tag anything, which makes the search broken.

### Option C — Hybrid: required category + optional free-form labels

The strongest of both. Every service must have one canonical `category` (closed enum, 4-6 values), and may optionally have free-form `labels` for provider-specific differentiation.

```
enum ServiceCategory {
  EXTERIOR_WASH
  INTERIOR_CLEANING
  RESTROOM_DUMP
  RESTOCK_CONSUMABLES
  ADD_ON  // for things that don't fit but are still bookable (vinyl wrap, ceramic coat, etc.)
}

model Service {
  name        String
  category    ServiceCategory  // required
  subcategory String?          // optional, free-form, but with platform-suggested values like "hand-wash-with-dry"
  labels      String[]         // optional provider-specific tags
}
```

Rationale: the high-level category is closed because UX and analytics depend on it. The subcategory is open because providers' specific offerings vary too much to enumerate. Labels are escape valves for marketing language ("Premium," "Express," "VIP").

**Pros:**
- Hard guarantee on top-level category for search and analytics.
- Flexibility on subcategories without locking the schema.
- Clean upgrade path: subcategories can be promoted to enum values later if patterns emerge.
- Multi-category services handled by creating multiple Service records (a "wash + dump combo" becomes two Service rows that share a `bundleId` or similar).

**Cons:**
- Slightly more complex to implement than pure Option A.
- Subcategory free-text means search-by-subcategory uses string matching with the same risks as Option B.
- "Multiple services for one offered package" is a data shape the booking flow has to handle thoughtfully.

---

## 4. Recommendation

**Adopt Option C — required category + optional free-form subcategory + free-form labels.**

The core argument: the category is what powers search, filtering, and price comparison — that absolutely must be reliable. The subcategory captures meaningful variance ("hand wash with dry" vs "drive-through") that drivers care about, but enumerating it exhaustively is unwise given the long tail of operator-specific offerings. Labels exist for marketing and shouldn't be searched on.

Implementation plan:

### 4.1 Schema changes

```prisma
enum ServiceCategory {
  EXTERIOR_WASH
  INTERIOR_CLEANING
  RESTROOM_DUMP
  RESTOCK_CONSUMABLES
  ADD_ON
}

model Service {
  // ... existing fields ...
  category    ServiceCategory  @default(EXTERIOR_WASH)
  subcategory String?
  labels      String[]         @default([])
}
```

Migration: backfill `category` for existing test data based on keyword matching on `name`. Onboarding team verifies categorization for new live providers during intake.

### 4.2 Subcategory suggested values

Maintain a frontend-side constants file (`lib/service-taxonomy.ts`) with suggested subcategories per category. UI for provider creating a service shows these as autocomplete suggestions but allows free text:

```ts
export const SUGGESTED_SUBCATEGORIES = {
  EXTERIOR_WASH: [
    'drive-through',
    'hand-wash',
    'hand-wash-with-dry',
    'two-step',
    'pressure-only',
    'mobile',
  ],
  INTERIOR_CLEANING: [
    'turn-clean',
    'standard',
    'deep-detail',
  ],
  RESTROOM_DUMP: [
    'pump-only',
    'pump-and-refresh',
  ],
  RESTOCK_CONSUMABLES: [],
  ADD_ON: [],
};
```

The search filter sheet's "Service details" section reads from this same source so the suggested subcategories appear as filter checkboxes. When a provider has used a subcategory not in the suggested list, it appears as a filter option below the suggested ones in italics ("seasonal-detail").

### 4.3 Booking flow implications (note for future scope)

When a driver selects multiple categories in the search, then taps into a provider, the booking flow needs to show that provider's services grouped by category and let the driver pick which actual Service rows to book. This is a small change to the existing booking flow but worth flagging.

For combo packages (wash + dump in one package): provider creates two Service rows linked by a shared `packageId` (new optional field). Booking flow detects packages and presents them as bundles. Out of scope for the search PRD; flagged here for awareness.

### 4.4 Provider-side onboarding

When a provider creates a Service, the form requires:
- Name (free text)
- Category (dropdown, required)
- Subcategory (autocomplete from suggested + free text, optional)
- Duration (existing)
- Base price (existing)
- Max vehicle class (existing)

This is a small change to the provider-side service-creation UI. Out of scope for the search PRD but a hard prerequisite — without it, new providers can't create properly-categorized services.

---

## 5. Decisions to confirm

Before implementing the search PRD, the following decisions need explicit sign-off:

1. **The four primary categories** — Exterior wash, Interior cleaning, Restroom dump, Restock & consumables. Plus Add-on as a catch-all. Are there others (e.g., "Roadside repair" if we ever transactionalize that)? Recommend keeping the v1 list to these five and adding more as actual demand surfaces.

2. **The subcategory list** — proposed in §4.2 above. Worth a quick review with the operator side of the team or a few friendly providers before locking.

3. **What happens to existing test data** — recommended: backfill category by keyword-matching the freeform name; flag any unclassifiable rows for manual review. Should not require `--accept-data-loss` because the new column is optional with a default.

4. **Migration timing** — recommended: schema migration ships before the search PRD work begins, even if the new fields aren't yet referenced in the UI. Reduces coupling between data and UI changes; the search PRD work assumes the data shape exists.

5. **Subcategory matching strategy** — when filtering by subcategory in the all-filters sheet, exact match (case-insensitive) on the subcategory string. Not fuzzy matching. Because subcategories are suggested-but-free-text, providers may use slight variants ("hand wash dry" vs "hand-wash-with-dry"). Mitigation: validate provider input against suggestions and gently nudge to canonical form, but don't block free text.
