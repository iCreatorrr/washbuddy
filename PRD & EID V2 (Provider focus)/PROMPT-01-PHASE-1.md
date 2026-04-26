# WASHBUDDY — CLAUDE CODE IMPLEMENTATION PROMPT
# Phase 1: Schema Evolution & Data Foundation for V2
# Prompt 1 of 7

---

## CONTEXT — READ THIS FIRST

You are implementing Phase 1 of the WashBuddy V2 platform expansion. WashBuddy is a multi-sided marketplace connecting commercial bus fleet operators/drivers with wash service providers — "OpenTable for bus washing."

**Current state of the codebase:** The original EID v1 (Phases 0–5, 35+ tasks) has been fully implemented and committed. The app runs on Replit with PostgreSQL. All original bugs are fixed. The codebase has:
- 50 seed providers (45 approved, 5 pending) with 45 locations across the Toronto–Buffalo–NYC corridor
- Working auth, booking lifecycle, fleet management, provider dashboard (basic Kanban), search, reviews, notifications
- Stripe Connect scaffolded (8 stub functions in stripeService.ts, webhook route, provider onboarding endpoint)
- Performance optimizations (React.lazy, Vite chunks, Prisma select)
- Security hardening (helmet, rate limiting, body limits)
- Fee calculator with dynamic 15% capped at $25

**What this phase does:** Phase 1 extends the Prisma schema with all new models and fields needed for V2 features, updates the fee calculator to support subscriptions and discounts, updates the OpenAPI spec, regenerates the typed client, and expands the seed data to include the new entity types. This phase writes NO new UI pages and NO new route handlers (those come in Phases 2–6). It is purely foundational — schema, migration, seed data, and shared utility code.

**Before writing any code, read these two files in the repository root:**
1. `PRD.md` (v2.0) — The complete product requirements. Read Sections 3.1 (pricing/fees including subscriptions and discounts), 3.2 (booking sources: platform, off-platform, walk-in), 3.7 (subscription packages), 4.3 (bay management), 4.4 (discounts), 5.5 (client profiles/CRM), 5.8 (messaging), 5.9 (photo documentation), and 5.10 (audit log).
2. `EID.md` (v2.0) — The engineering implementation plan. Read the entire Phase 1 section (Tasks 1.1–1.5) for exact model definitions, field types, and relationships.

---

## CRITICAL CONVENTIONS — FOLLOW THESE EXACTLY

These conventions are established throughout the existing codebase. Violating them will cause runtime errors or data corruption.

1. **Monetary values:** Always integers in minor units (cents). `$125.00` = `12500`. Never use floats for money.
2. **Timestamps:** Always `DateTime @db.Timestamptz` stored in UTC. Display conversion uses the entity's `timezone` field.
3. **IDs:** Always `String @id @default(uuid()) @db.Uuid`.
4. **Column mapping:** Prisma field names are camelCase. Database column names are snake_case via `@map()`. Example: `locationId String @map("location_id") @db.Uuid`.
5. **API responses:** camelCase (Prisma's default JS output). Never snake_case in API responses.
6. **Indexes:** Add `@@index` for any field used in WHERE clauses, JOIN conditions, or ORDER BY.
7. **Relations:** Always define both sides of a relation. Add the relation array on the parent model.
8. **Enums vs strings:** Use `String` with comments documenting valid values (not Prisma enums) for fields that may need new values without a migration — specifically `bookingSource`, `photoType`, `noteType`, `discountType`, `templateId`. Use Prisma enums only for well-established finite sets (like `BookingStatus`).

---

## TASK 1.1 — Add New Prisma Models

**File:** `lib/db/prisma/schema.prisma`

You will add 8 new models and modify 7 existing models. Complete the entire schema change as a single migration. Read the existing schema thoroughly before starting — the file is ~1000 lines. Understand every existing model, enum, and relation before adding anything.

### NEW MODEL 1: WashBay

Purpose: Individual named wash bays at a location, each with vehicle size constraints. Enables the Bay Timeline View (Phase 2) and auto-matching bookings to compatible bays.

```prisma
model WashBay {
  id                    String    @id @default(uuid()) @db.Uuid
  locationId            String    @map("location_id") @db.Uuid
  name                  String    // e.g., "Bay 1", "Bay A"
  maxVehicleLengthIn    Int       @map("max_vehicle_length_in")   // max vehicle length in inches
  maxVehicleHeightIn    Int       @map("max_vehicle_height_in")   // max vehicle height in inches
  supportedClasses      String[]  @map("supported_classes")       // e.g., ["SMALL","MEDIUM","LARGE","EXTRA_LARGE"]
  isActive              Boolean   @default(true) @map("is_active")
  displayOrder          Int       @default(0) @map("display_order")
  outOfServiceSince     DateTime? @map("out_of_service_since") @db.Timestamptz
  outOfServiceReason    String?   @map("out_of_service_reason")
  outOfServiceEstReturn DateTime? @map("out_of_service_est_return") @db.Timestamptz
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  location Location  @relation(fields: [locationId], references: [id])
  bookings Booking[] @relation("booking_bay")

  @@index([locationId, isActive])
  @@map("wash_bays")
}
```

**Design notes:**
- `supportedClasses` is a PostgreSQL text array. Valid values: "SMALL" (under 25ft), "MEDIUM" (25–35ft), "LARGE" (35–45ft), "EXTRA_LARGE" (45ft+). These correspond to PRD Section 3.1 vehicle size classes.
- `maxVehicleLengthIn` and `maxVehicleHeightIn` are the physical bay constraints in inches — used for precise compatibility checks beyond the class shorthand.
- `displayOrder` controls the vertical ordering of bays on the Bay Timeline View.
- The out-of-service fields allow operators to temporarily disable a bay (Phase 2 UI).

### NEW MODEL 2: BookingPhoto

Purpose: Before/after/problem-area photos attached to bookings. Used for quality assurance, dispute resolution, and marketing.

```prisma
model BookingPhoto {
  id          String   @id @default(uuid()) @db.Uuid
  bookingId   String   @map("booking_id") @db.Uuid
  uploadedBy  String   @map("uploaded_by") @db.Uuid
  photoType   String   @map("photo_type")    // BEFORE, AFTER, PROBLEM_AREA, OTHER
  fileAssetId String   @map("file_asset_id") @db.Uuid
  caption     String?
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  booking   Booking   @relation(fields: [bookingId], references: [id])
  uploader  User      @relation("photo_uploader", fields: [uploadedBy], references: [id])
  fileAsset FileAsset @relation(fields: [fileAssetId], references: [id])

  @@index([bookingId])
  @@map("booking_photos")
}
```

### NEW MODEL 3: BookingMessage

Purpose: Predefined (editable) messages sent from providers to drivers for on-platform bookings. Creates a communication record visible to both parties and the fleet admin.

```prisma
model BookingMessage {
  id         String   @id @default(uuid()) @db.Uuid
  bookingId  String   @map("booking_id") @db.Uuid
  senderId   String   @map("sender_id") @db.Uuid
  templateId String?  @map("template_id")   // WASH_COMPLETE, RUNNING_LATE, READY_FOR_PICKUP, NEED_TO_DISCUSS, RESCHEDULED
  body       String                          // final message text after any edits to the template
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  booking Booking @relation(fields: [bookingId], references: [id])
  sender  User    @relation("message_sender", fields: [senderId], references: [id])

  @@index([bookingId, createdAt])
  @@map("booking_messages")
}
```

### NEW MODEL 4: ClientProfile

Purpose: CRM — every client (on-platform or off-platform) who has visited a provider gets a profile. This is per-provider (the same driver has separate profiles at different providers).

```prisma
model ClientProfile {
  id                 String    @id @default(uuid()) @db.Uuid
  providerId         String    @map("provider_id") @db.Uuid
  userId             String?   @map("user_id") @db.Uuid          // null for off-platform-only clients
  name               String
  phone              String?
  email              String?
  fleetName          String?   @map("fleet_name")
  tags               String[]  @default([])                       // VIP, FREQUENT, SERVICE_RECOVERY, NEW_CLIENT, FLEET_ACCOUNT, SPECIAL_REQUIREMENTS, PAYMENT_ISSUE
  notes              String?
  lifetimeSpendMinor Int       @default(0) @map("lifetime_spend_minor")
  currencyCode       String    @default("USD") @map("currency_code") @db.Char(3)
  visitCount         Int       @default(0) @map("visit_count")
  lastVisitAt        DateTime? @map("last_visit_at") @db.Timestamptz
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  provider Provider @relation(fields: [providerId], references: [id])
  user     User?    @relation("client_profiles", fields: [userId], references: [id])

  @@unique([providerId, userId])
  @@index([providerId])
  @@index([providerId, tags])
  @@map("client_profiles")
}
```

**Design notes:**
- `@@unique([providerId, userId])` ensures one profile per user per provider. Off-platform clients (userId=null) are not constrained by this unique — there can be multiple off-platform profiles at the same provider.
- `tags` is a PostgreSQL text array. Tags are addable/removable individually. Some tags are auto-applied (FREQUENT after 5+ visits in 90 days, SERVICE_RECOVERY when latest review ≤3 stars, NEW_CLIENT on first visit). Others are manual (VIP, SPECIAL_REQUIREMENTS).
- `lifetimeSpendMinor` is updated when bookings complete. For off-platform bookings where the provider doesn't process payment through WashBuddy, this field is updated with the provider's stated service price (even though no platform fee was charged).

### NEW MODEL 5: WashNote

Purpose: Notes attached to shifts or individual bookings — from admins, operators, or drivers.

```prisma
model WashNote {
  id         String    @id @default(uuid()) @db.Uuid
  bookingId  String?   @map("booking_id") @db.Uuid   // null for shift-level notes
  locationId String    @map("location_id") @db.Uuid
  authorId   String    @map("author_id") @db.Uuid
  noteType   String    @map("note_type")              // SHIFT, BOOKING_INSTRUCTION, OPERATOR_NOTE, SUPPLY_REQUEST, CLIENT_NOTE
  content    String
  shiftDate  DateTime? @map("shift_date") @db.Date    // for shift-level notes only
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  booking  Booking?  @relation(fields: [bookingId], references: [id])
  location Location  @relation(fields: [locationId], references: [id])
  author   User      @relation("note_author", fields: [authorId], references: [id])

  @@index([bookingId])
  @@index([locationId, shiftDate])
  @@map("wash_notes")
}
```

### NEW MODEL 6: ProviderDiscount

Purpose: Discount rules that providers can create to attract bookings. Three types: off-peak time-based, fleet volume-based, and first-time client.

```prisma
model ProviderDiscount {
  id              String   @id @default(uuid()) @db.Uuid
  providerId      String   @map("provider_id") @db.Uuid
  locationId      String?  @map("location_id") @db.Uuid   // null = applies to all provider locations
  discountType    String   @map("discount_type")           // OFF_PEAK, VOLUME, FIRST_TIME
  name            String
  description     String?
  percentOff      Int?     @map("percent_off")             // e.g., 10 means 10%. Mutually exclusive with flatAmountOff.
  flatAmountOff   Int?     @map("flat_amount_off")         // in minor units. Mutually exclusive with percentOff.
  // OFF_PEAK specific fields:
  peakStartTime   String?  @map("peak_start_time")         // HH:MM in location timezone
  peakEndTime     String?  @map("peak_end_time")           // HH:MM in location timezone
  peakDaysOfWeek  Int[]    @default([]) @map("peak_days_of_week")  // 0=Sunday through 6=Saturday
  // VOLUME specific fields:
  volumeThreshold Int?     @map("volume_threshold")        // min bookings within period to qualify
  volumePeriodDays Int?    @map("volume_period_days")      // rolling window in days (e.g., 30)
  // General:
  isActive        Boolean  @default(true) @map("is_active")
  isStackable     Boolean  @default(true) @map("is_stackable")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  provider Provider  @relation(fields: [providerId], references: [id])
  location Location? @relation(fields: [locationId], references: [id])

  @@index([providerId, isActive])
  @@map("provider_discounts")
}
```

**Design notes:**
- `percentOff` and `flatAmountOff` are mutually exclusive. Application logic (built in Phase 4) validates this.
- For OFF_PEAK: the discount applies when the booking's scheduled start time falls within the `peakStartTime`–`peakEndTime` window on one of the specified `peakDaysOfWeek`.
- For VOLUME: the discount applies when the fleet's booking count at this provider in the last `volumePeriodDays` days meets or exceeds `volumeThreshold`.
- For FIRST_TIME: the discount applies when the ClientProfile for this client at this provider has `visitCount == 0`.
- `isStackable`: when true, this discount can be combined with other active discounts. When false, only this discount OR other stackable discounts apply (the largest non-stackable discount wins over any combination of stackable discounts).

### NEW MODEL 7: SubscriptionPackage

Purpose: Recurring wash packages that providers offer and fleets purchase.

```prisma
model SubscriptionPackage {
  id                   String   @id @default(uuid()) @db.Uuid
  providerId           String   @map("provider_id") @db.Uuid
  locationId           String   @map("location_id") @db.Uuid
  name                 String
  description          String?
  includedServiceIds   String[] @map("included_service_ids")        // IDs of Service records included per wash
  cadence              String                                       // WEEKLY, BIWEEKLY, MONTHLY, CUSTOM
  cadenceIntervalDays  Int?     @map("cadence_interval_days")       // for CUSTOM cadence only
  pricePerWashMinor    Int      @map("price_per_wash_minor")        // provider's price per wash (before platform fee)
  currencyCode         String   @map("currency_code") @db.Char(3)
  minWashes            Int      @default(3) @map("min_washes")      // minimum commitment
  isActive             Boolean  @default(true) @map("is_active")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz

  provider      Provider            @relation(fields: [providerId], references: [id])
  location      Location            @relation(fields: [locationId], references: [id])
  subscriptions FleetSubscription[]

  @@index([providerId, isActive])
  @@index([locationId, isActive])
  @@map("subscription_packages")
}
```

### NEW MODEL 8: FleetSubscription

Purpose: A fleet's active enrollment in a subscription package for a specific vehicle.

```prisma
model FleetSubscription {
  id                   String    @id @default(uuid()) @db.Uuid
  packageId            String    @map("package_id") @db.Uuid
  fleetId              String    @map("fleet_id") @db.Uuid
  vehicleId            String    @map("vehicle_id") @db.Uuid
  purchasedByUserId    String    @map("purchased_by_user_id") @db.Uuid
  status               String    @default("ACTIVE")               // ACTIVE, PAUSED, CANCELLED
  startDate            DateTime  @map("start_date") @db.Date
  nextWashDate         DateTime? @map("next_wash_date") @db.Date
  totalWashesCompleted Int       @default(0) @map("total_washes_completed")
  cancelledAt          DateTime? @map("cancelled_at") @db.Timestamptz
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt            DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  package     SubscriptionPackage @relation(fields: [packageId], references: [id])
  fleet       Fleet               @relation(fields: [fleetId], references: [id])
  vehicle     Vehicle             @relation(fields: [vehicleId], references: [id])
  purchasedBy User                @relation("subscription_purchaser", fields: [purchasedByUserId], references: [id])

  @@index([fleetId, status])
  @@index([packageId])
  @@index([vehicleId])
  @@map("fleet_subscriptions")
}
```

### NEW MODEL 9: NotificationPreference

Purpose: Per-user, per-event-type notification channel preferences.

```prisma
model NotificationPreference {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  eventType    String   @map("event_type")       // NEW_BOOKING, CANCELLATION, REVIEW_RECEIVED, SLA_WARNING, BOOKING_REMINDER, WASH_COMPLETE, BOOKING_RESCHEDULED, MESSAGE_RECEIVED, WASH_HEALTH_ALERT, SUBSCRIPTION_RENEWAL
  emailEnabled Boolean  @default(true) @map("email_enabled")
  inAppEnabled Boolean  @default(true) @map("in_app_enabled")
  smsEnabled   Boolean  @default(false) @map("sms_enabled")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, eventType])
  @@map("notification_preferences")
}
```

---

### MODIFICATIONS TO EXISTING MODELS

**IMPORTANT:** For each existing model, add ONLY the new fields and relations listed. Do NOT remove, rename, or reorder any existing fields.

#### Booking model — add these fields AFTER the existing `reminderSentAt` field and BEFORE `createdAt`:

```prisma
  // V2 fields
  bookingSource              String    @default("PLATFORM") @map("booking_source")       // PLATFORM, DIRECT, WALK_IN
  isOffPlatform              Boolean   @default(false) @map("is_off_platform")
  offPlatformClientName      String?   @map("off_platform_client_name")
  offPlatformClientPhone     String?   @map("off_platform_client_phone")
  offPlatformClientEmail     String?   @map("off_platform_client_email")
  offPlatformPaymentExternal Boolean   @default(false) @map("off_platform_payment_external")
  washBayId                  String?   @map("wash_bay_id") @db.Uuid
  assignedOperatorId         String?   @map("assigned_operator_id") @db.Uuid
  discountAmountMinor        Int       @default(0) @map("discount_amount_minor")
  discountDescription        String?   @map("discount_description")
```

And add these relations inside the Booking model (after existing relations):
```prisma
  washBay          WashBay?         @relation("booking_bay", fields: [washBayId], references: [id])
  assignedOperator User?            @relation("booking_operator", fields: [assignedOperatorId], references: [id])
  photos           BookingPhoto[]
  messages         BookingMessage[]
  washNotes        WashNote[]
```

Add indexes:
```prisma
  @@index([bookingSource])
  @@index([washBayId])
  @@index([assignedOperatorId])
```

#### Location model — add these relations:
```prisma
  washBays             WashBay[]
  washNotes            WashNote[]
  discounts            ProviderDiscount[]
  subscriptionPackages SubscriptionPackage[]
```

#### Provider model — add these relations:
```prisma
  clientProfiles       ClientProfile[]
  discounts            ProviderDiscount[]
  subscriptionPackages SubscriptionPackage[]
```

#### User model — add these relations:
```prisma
  bookingPhotos          BookingPhoto[]         @relation("photo_uploader")
  bookingMessages        BookingMessage[]       @relation("message_sender")
  washNotes              WashNote[]             @relation("note_author")
  clientProfiles         ClientProfile[]        @relation("client_profiles")
  notificationPreferences NotificationPreference[]
  assignedBookings       Booking[]              @relation("booking_operator")
  purchasedSubscriptions FleetSubscription[]    @relation("subscription_purchaser")
```

#### Fleet model — add this relation:
```prisma
  subscriptions FleetSubscription[]
```

#### Vehicle model — add this relation:
```prisma
  subscriptions FleetSubscription[]
```

#### FileAsset model — add this relation:
```prisma
  bookingPhotos BookingPhoto[]
```

---

## TASK 1.2 — Run Migration

After making all schema changes, run:

```bash
cd lib/db
npx prisma migrate dev --name v2_schema_evolution
```

If the migration fails due to existing data conflicts (e.g., new non-nullable fields on existing records), the approach is:
- All new fields on existing models have defaults (`@default(...)`) or are nullable (`String?`), so there should be no conflicts.
- If a conflict arises anyway, review the specific field causing it. For the Booking model, all new fields either have `@default(false)`, `@default(0)`, `@default("PLATFORM")`, or are nullable — so existing booking rows will get the default values.

**Verify:** Run `npx prisma studio` and confirm all new tables exist: `wash_bays`, `booking_photos`, `booking_messages`, `client_profiles`, `wash_notes`, `provider_discounts`, `subscription_packages`, `fleet_subscriptions`, `notification_preferences`. Confirm the `bookings` table has the new columns.

---

## TASK 1.3 — Update Fee Calculator

**File:** `artifacts/api-server/src/lib/feeCalculator.ts`

The existing fee calculator has `calculatePlatformFee(serviceBasePriceMinor)` and `calculateAllInPrice(serviceBasePriceMinor)`. Expand it to handle:

1. **Subscription pricing:** 15% capped at $20/wash (instead of $25) for subscription bookings
2. **Discount-aware pricing:** Fee calculated on post-discount price
3. **Discount calculation utility:** Sum applicable discounts for a booking

Replace the entire file with:

```typescript
import { logger } from "./logger";

// Standard booking: 15% capped at $25
export const STANDARD_FEE_RATE = 0.15;
export const STANDARD_FEE_CAP_MINOR = 2500; // $25.00

// Subscription booking (3+ washes): 15% capped at $20
export const SUBSCRIPTION_FEE_CAP_MINOR = 2000; // $20.00
export const SUBSCRIPTION_MIN_WASHES = 3;

export interface FeeOptions {
  isSubscription?: boolean;
  discountAmountMinor?: number;
}

/**
 * Calculate the platform fee for a booking.
 * Fee = 15% of (base price - discount), capped at $25 (standard) or $20 (subscription).
 * Fee is calculated on the POST-DISCOUNT price per PRD Section 3.1.
 */
export function calculatePlatformFee(
  serviceBasePriceMinor: number,
  options?: FeeOptions
): number {
  const discount = options?.discountAmountMinor ?? 0;
  const effectivePrice = Math.max(serviceBasePriceMinor - discount, 0);
  const cap = options?.isSubscription
    ? SUBSCRIPTION_FEE_CAP_MINOR
    : STANDARD_FEE_CAP_MINOR;
  const fee = Math.min(Math.round(effectivePrice * STANDARD_FEE_RATE), cap);

  logger.debug(
    { serviceBasePriceMinor, discount, effectivePrice, cap, fee, isSubscription: !!options?.isSubscription },
    "feeCalculator.calculatePlatformFee"
  );

  return fee;
}

/**
 * Calculate the all-in price the customer sees.
 * = (base price - discount) + platform fee
 */
export function calculateAllInPrice(
  serviceBasePriceMinor: number,
  options?: FeeOptions
): number {
  const discount = options?.discountAmountMinor ?? 0;
  const effectivePrice = Math.max(serviceBasePriceMinor - discount, 0);
  return effectivePrice + calculatePlatformFee(serviceBasePriceMinor, options);
}

/**
 * Calculate total discount from a set of applicable discount rules.
 * Handles stacking logic: stackable discounts sum together;
 * non-stackable discounts compete (largest wins).
 * Returns total discount in minor units.
 */
export function calculateDiscounts(
  serviceBasePriceMinor: number,
  applicableDiscounts: Array<{
    percentOff?: number | null;
    flatAmountOff?: number | null;
    isStackable: boolean;
  }>
): { totalDiscountMinor: number; appliedDescriptions: string[] } {
  // Separate stackable and non-stackable
  const stackable = applicableDiscounts.filter((d) => d.isStackable);
  const nonStackable = applicableDiscounts.filter((d) => !d.isStackable);

  // Calculate stackable total
  let stackableTotal = 0;
  const descriptions: string[] = [];
  for (const d of stackable) {
    if (d.percentOff) {
      const amount = Math.round(serviceBasePriceMinor * (d.percentOff / 100));
      stackableTotal += amount;
      descriptions.push(`${d.percentOff}% off`);
    }
    if (d.flatAmountOff) {
      stackableTotal += d.flatAmountOff;
      descriptions.push(`$${(d.flatAmountOff / 100).toFixed(2)} off`);
    }
  }

  // Calculate best non-stackable
  let bestNonStackable = 0;
  let bestNonStackableDesc = "";
  for (const d of nonStackable) {
    let amount = 0;
    let desc = "";
    if (d.percentOff) {
      amount = Math.round(serviceBasePriceMinor * (d.percentOff / 100));
      desc = `${d.percentOff}% off`;
    }
    if (d.flatAmountOff && d.flatAmountOff > amount) {
      amount = d.flatAmountOff;
      desc = `$${(d.flatAmountOff / 100).toFixed(2)} off`;
    }
    if (amount > bestNonStackable) {
      bestNonStackable = amount;
      bestNonStackableDesc = desc;
    }
  }

  // The result is the MAX of (all stackable combined) vs (best non-stackable)
  let totalDiscountMinor: number;
  let appliedDescriptions: string[];
  if (bestNonStackable > stackableTotal) {
    totalDiscountMinor = bestNonStackable;
    appliedDescriptions = [bestNonStackableDesc];
  } else {
    totalDiscountMinor = stackableTotal;
    appliedDescriptions = descriptions;
  }

  // Discount cannot exceed base price
  totalDiscountMinor = Math.min(totalDiscountMinor, serviceBasePriceMinor);

  return { totalDiscountMinor, appliedDescriptions };
}

/**
 * Determine if a booking qualifies for subscription fee rates.
 * Subscription rate applies when the booking is part of a subscription package
 * with 3+ washes.
 */
export function isSubscriptionEligible(totalWashesInPackage: number): boolean {
  return totalWashesInPackage >= SUBSCRIPTION_MIN_WASHES;
}
```

**Verify:** The existing code that calls `calculatePlatformFee` and `calculateAllInPrice` must still work without modification, since the `options` parameter is optional and defaults produce the same behavior as before. Search the codebase for all usages of these functions and confirm they still compile:
```bash
grep -rn "calculatePlatformFee\|calculateAllInPrice" artifacts/api-server/src/
```

---

## TASK 1.4 — Update OpenAPI Spec

**File:** `lib/api-spec/openapi.yaml`

Add schemas for all 9 new models. You do NOT need to add endpoint definitions yet (those come in Phases 2–4 when the routes are built). But you MUST add the schema definitions so the Orval code generator can produce TypeScript types.

For each new model, add a schema under `components.schemas` with all fields, proper types, and required fields marked. Follow the existing patterns in the file.

Also add these fields to the existing `Booking` schema:
- `bookingSource` (string)
- `isOffPlatform` (boolean)
- `offPlatformClientName` (string, nullable)
- `offPlatformClientPhone` (string, nullable)
- `offPlatformClientEmail` (string, nullable)
- `offPlatformPaymentExternal` (boolean)
- `washBayId` (string, nullable)
- `assignedOperatorId` (string, nullable)
- `discountAmountMinor` (integer)
- `discountDescription` (string, nullable)

After updating the spec, regenerate the client:
```bash
cd lib/api-spec && pnpm run generate
```

**Verify:** The generated types in `lib/api-client-react` should include the new model types and the updated Booking type. Check that `pnpm run typecheck` passes from the `artifacts/washbuddy-web` directory.

---

## TASK 1.5 — Expand Seed Data

**File:** `lib/db/src/seed.ts` (or wherever the current seed script lives — find it via `package.json` in `lib/db`)

After the migration, expand the seed data to include the new entity types. Add this data IN ADDITION to all existing seed data (do not delete or re-create providers, locations, services, bookings, reviews, etc.).

### Seed wash bays:
For each of the 45 seed locations, create 1–4 wash bays:
- Small single-bay locations (capacityPerSlot=1): 1 bay
- Medium locations (capacityPerSlot=2): 2 bays
- Large locations (capacityPerSlot=3-4): 3–4 bays
- Each bay should have realistic vehicle class support. At least 1 bay per location that supports SMALL and MEDIUM. Larger locations should have at least 1 bay supporting LARGE and EXTRA_LARGE.
- Bay names: "Bay 1", "Bay 2", etc.
- All bays active, none out of service in seed data.

### Seed client profiles:
Create 15 client profiles distributed across 5 providers:
- 10 linked to existing WashBuddy users (via userId) who have booking history at those providers
- 5 off-platform clients (userId null) with realistic names and phone numbers
- Apply tags: 2 VIP, 3 FREQUENT, 1 SERVICE_RECOVERY (linked to a review ≤3 stars), 4 NEW_CLIENT, 2 FLEET_ACCOUNT
- Populate lifetimeSpendMinor and visitCount based on their booking history

### Seed subscription packages:
Create 3 subscription packages at 3 different providers:
1. "Weekly Exterior Wash" — weekly cadence, pricePerWashMinor based on the provider's exterior wash price, minWashes=4, at a Toronto-area provider (CAD)
2. "Biweekly Full Detail" — biweekly cadence, pricePerWashMinor based on the provider's detail wash price, minWashes=3, at a NYC-area provider (USD)
3. "Monthly Fleet Clean" — monthly cadence, pricePerWashMinor at a discount from standard pricing, minWashes=3, at a Buffalo-area provider (USD)

### Seed fleet subscriptions:
Create 2 active FleetSubscription records:
- "Northeast Bus Lines" fleet subscribed to package 1 for 2 vehicles, status ACTIVE, startDate 30 days ago, totalWashesCompleted=3 each, nextWashDate in the next 3 days
- "Northeast Bus Lines" fleet subscribed to package 2 for 1 vehicle, status ACTIVE, startDate 14 days ago, totalWashesCompleted=1, nextWashDate in the next 7 days

### Seed discount rules:
Create 4 discount rules at 2 providers:
1. OFF_PEAK: 10% off, weekdays 2pm–4pm, at a NYC provider, stackable
2. VOLUME: 5% off after 10 bookings in 30 days, at the same NYC provider, stackable
3. FIRST_TIME: $15 flat off first visit, at a Toronto provider, non-stackable
4. OFF_PEAK: 15% off Saturday mornings 6am–9am, at the Toronto provider, stackable

### Seed off-platform bookings:
Create 5 bookings with `bookingSource: "DIRECT"`, `isOffPlatform: true`, `platformFeeMinor: 0`:
- Distributed across 3 providers and the last 14 days
- Status: 3 COMPLETED, 1 SETTLED, 1 PROVIDER_CONFIRMED (upcoming)
- Each should have `offPlatformClientName` populated. 2 should also have phone/email.
- Create corresponding ClientProfile records for these off-platform clients.

### Seed walk-in bookings:
Create 2 bookings with `bookingSource: "WALK_IN"`, `isOffPlatform: true`:
- Status: 1 COMPLETED, 1 IN_SERVICE (current)
- `offPlatformPaymentExternal: true` for one, `false` for the other

### Seed booking photos:
For 5 completed bookings, create BookingPhoto records:
- You will need to create FileAsset records as well. Use placeholder data — the actual files don't need to exist. Set `bucket: "local"`, `objectKey: "photos/placeholder_before_1.jpg"` (etc.), `mimeType: "image/jpeg"`, `byteSize: 150000`, `sha256Hex: "<generate a fake hex string>"`, `purposeCode: "BOOKING_PHOTO"`.
- Create 1 BEFORE and 1 AFTER photo per booking (10 photos total).

### Seed booking messages:
For 3 on-platform completed bookings, create BookingMessage records:
- 1 message per booking from the provider operator
- Use realistic template-based messages: "Your wash is complete. Bus is in Lot A.", "We're running approximately 10 minutes behind schedule. We apologize for the delay.", "Your bus is ready for pickup at the front entrance."

### Seed notification preferences:
Create NotificationPreference records for the demo users (demo.fleet@washbuddy.com, demo.driver@washbuddy.com, owner@cleanbus-nyc.com) with sensible defaults: all email and in-app enabled, sms disabled.

### Register all new seed records in DemoDataRegistry
All new seed records must be registered in DemoDataRegistry with `seedMode: "v2_expansion"`.

**Verify after seeding:**
```sql
SELECT COUNT(*) FROM wash_bays;           -- should be 80-120 (1-4 per location × 45 locations)
SELECT COUNT(*) FROM client_profiles;      -- should be 15
SELECT COUNT(*) FROM subscription_packages; -- should be 3
SELECT COUNT(*) FROM fleet_subscriptions;  -- should be 3
SELECT COUNT(*) FROM provider_discounts;   -- should be 4
SELECT COUNT(*) FROM bookings WHERE booking_source != 'PLATFORM'; -- should be 7 (5 DIRECT + 2 WALK_IN)
SELECT COUNT(*) FROM booking_photos;       -- should be 10
SELECT COUNT(*) FROM booking_messages;     -- should be 3
SELECT COUNT(*) FROM notification_preferences; -- should be ~30 (3 users × ~10 event types)
```

---

## WHAT NOT TO DO IN THIS PHASE

- Do NOT create any new API route files or endpoints. Schema and seed only.
- Do NOT create any new frontend pages or components.
- Do NOT modify any existing API route logic (the existing booking creation, search, etc. should continue to work unchanged — the new Booking fields all have safe defaults).
- Do NOT modify the existing frontend except if TypeScript compilation breaks due to the updated API types (in which case, make the minimum change needed to fix the type error).

---

## ACCEPTANCE CRITERIA — Verify ALL before committing

1. `npx prisma migrate dev` succeeds without errors
2. `npx prisma studio` shows all 9 new tables with correct columns
3. The `bookings` table has all new columns with default values on existing rows
4. Seed script runs without errors and populates all new tables per the counts above
5. All existing functionality still works: login, search, booking, fleet dashboard, provider dashboard, admin dashboard. Test by logging in as each demo user and verifying their landing page loads.
6. `calculatePlatformFee(12500)` still returns `1875` (backward compatible — no options)
7. `calculatePlatformFee(12500, { isSubscription: true })` returns `1875` (under $20 cap)
8. `calculatePlatformFee(20000, { isSubscription: true })` returns `2000` ($20 cap, not $25)
9. `calculatePlatformFee(20000, { discountAmountMinor: 5000 })` returns `2250` (15% of $150)
10. `pnpm run typecheck` passes in both `artifacts/api-server` and `artifacts/washbuddy-web`
11. The app builds and runs without errors

**Commit with message:** `"Phase 1: V2 schema evolution — 9 new models, fee calculator v2, expanded seed data"`

---

## AFTER COMPLETING — Report back with:

1. The commit hash
2. Number and names of all files created or modified
3. Confirmation of each numbered acceptance criterion (1–11)
4. The output of the seed data verification queries
5. Any issues encountered or deviations from this spec
6. Any questions or ambiguities you encountered that required a judgment call (and what you decided)

This is Phase 1 of 7. Do not proceed to Phase 2 until this phase is confirmed complete and verified.
