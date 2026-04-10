WASHBUDDY — ENGINEERING IMPLEMENTATION DOCUMENT (EID)
Version: 2.0
Date: April 10, 2026
Status: Ready for Engineering
Companion Document: PRD.md v2.0 (must be read in full before beginning any work)
Repository: github.com/iCreatorrr/washbuddy

---

# PREAMBLE — INSTRUCTIONS FOR AI AGENTS

Before implementing any task in this document, read PRD.md v2.0 in full. The PRD is the authoritative source for all business rules, pricing logic, role permissions, feature requirements, and acceptance criteria. This EID tells you HOW and WHERE to implement. The PRD tells you WHAT and WHY.

This EID supersedes EID v1.0. All Phase 0 bug fixes from v1.0 are preserved as Phase 0 here. New work begins at Phase 1.

## Codebase Structure
```
washbuddy/
├── artifacts/
│   ├── api-server/          # Express REST API (TypeScript)
│   ├── washbuddy-web/       # React SPA (Vite + shadcn/ui + TanStack Query + wouter)
│   └── mockup-sandbox/      # Ignore — not production code
├── lib/
│   ├── db/                  # Prisma ORM + PostgreSQL schema
│   │   └── prisma/schema.prisma  # DATABASE SCHEMA — source of truth
│   ├── api-spec/            # OpenAPI 3.x specification (openapi.yaml)
│   ├── api-zod/             # Zod validation schemas (generated from OpenAPI)
│   └── api-client-react/    # Auto-generated React Query hooks (via Orval)
├── package.json
└── pnpm-workspace.yaml
```

## Tech Stack
- Backend: Express.js, TypeScript, Prisma ORM, PostgreSQL, express-session (pg-backed), pino logger
- Frontend: React 18, Vite, wouter (routing), TanStack React Query, shadcn/ui (55+ Radix components), Tailwind CSS, react-hook-form + zod, Leaflet/OpenStreetMap
- API Contract: OpenAPI 3.x → Orval → typed React Query hooks
- Payments: Stripe Connect (Express accounts)
- Auth: Session-based, HTTP-only cookies, scrypt

## Critical Conventions
- All monetary values: integers in minor units (cents). $125.00 = 12500.
- All timestamps: UTC with @db.Timestamptz. Display in local timezone using entity's timezone field.
- All IDs: UUIDs (@db.Uuid).
- DB columns: snake_case via @map(). API responses: camelCase.
- Frontend API calls: use generated hooks from @workspace/api-client-react.
- New endpoints: update OpenAPI spec → regenerate client → use new hooks.
- UI components: use existing shadcn/ui primitives from artifacts/washbuddy-web/src/components/ui/.
- New pages: follow existing patterns in artifacts/washbuddy-web/src/pages/.

---

# IMPLEMENTATION PHASES OVERVIEW

| Phase | Focus | Scope |
|-------|-------|-------|
| 0 | Bug Fixes & Data Foundation | Fix v1 bugs, clean seed data (from EID v1) |
| 1 | Schema Evolution | New Prisma models, migrations, seed data for new features |
| 2 | Provider Core Experience | Daily Wash Board, Bay Timeline, booking lifecycle, off-platform bookings |
| 3 | Provider Admin Dashboard | CRM, reporting, analytics, operator performance, settings |
| 4 | Cross-Role Features | Messaging, photos, subscriptions, discounts |
| 5 | Driver & Fleet Enhancements | Find a Wash Now, subscription browsing, wash health, enhanced reports |
| 6 | Notifications & Polish | Full notification system, notification preferences, UI polish |
| 7 | Launch Prep | E2E testing, Stripe integration, performance, security |

Execute phases sequentially. Within each phase, tasks are numbered and should be completed in order unless marked as parallelizable.

---

# PHASE 0: BUG FIXES AND DATA FOUNDATION (Week 1)

*Goal: Fix critical bugs from v1 that make the current product unusable. After Phase 0, every existing page loads correctly and displays accurate data.*

All tasks from EID v1.0 Phase 0 remain applicable:

## TASK 0.1 — Fix Provider Duplication
Per EID v1 Task 0.1. Delete all seed providers, re-seed clean.

## TASK 0.2 — Replace Seed Data with Realistic Launch Corridor Data
Per EID v1 Task 0.2 with additions specified in PRD v2 Section 12. In addition to the original 45 locations, seed data must now include:
- Named wash bays per location (see Phase 1 schema for WashBay model)
- At least 3 providers with subscription packages
- At least 2 providers with discount rules
- At least 5 off-platform booking records
- At least 2 walk-in booking records
- Photo records for at least 5 completed bookings
- Message records for at least 3 bookings
- Client profile tags on at least 10 client records

**Note:** Some seed data depends on new schema models from Phase 1. Run Phase 0 tasks 0.1-0.6 first to fix existing bugs, then run Phase 1 schema migration, then re-run expanded seed.

## TASK 0.3 — Fix Search Results Not Loading
Per EID v1 Task 0.3. TanStack Query hook must fire on mount.

## TASK 0.4 — Fix Fleet Dashboard Routing
Per EID v1 Task 0.4. Ensure FleetMembership records exist in seed data.

## TASK 0.5 — Fix Provider Settings Page
Per EID v1 Task 0.5. Add edit/add capability for locations and services.

## TASK 0.6 — Fix Notification Bell
Per EID v1 Task 0.6. Implement popover with notification list, mark-read functionality.

---

# PHASE 1: SCHEMA EVOLUTION (Week 2)

*Goal: Extend the Prisma schema with all new models needed for v2 features. Run migration. Update seed data.*

## TASK 1.1 — Add New Prisma Models

File: `lib/db/prisma/schema.prisma`

Add the following models. Follow existing conventions: UUIDs, snake_case mapping, Timestamptz, proper indexes.

### WashBay (new model)
```prisma
model WashBay {
  id                    String   @id @default(uuid()) @db.Uuid
  locationId            String   @map("location_id") @db.Uuid
  name                  String   // e.g., "Bay 1", "Bay A"
  maxVehicleLengthIn    Int      @map("max_vehicle_length_in")
  maxVehicleHeightIn    Int      @map("max_vehicle_height_in")
  supportedClasses      String[] @map("supported_classes") // ["SMALL","MEDIUM","LARGE","EXTRA_LARGE"]
  isActive              Boolean  @default(true) @map("is_active")
  displayOrder          Int      @default(0) @map("display_order")
  outOfServiceSince     DateTime? @map("out_of_service_since") @db.Timestamptz
  outOfServiceReason    String?   @map("out_of_service_reason")
  outOfServiceEstReturn DateTime? @map("out_of_service_est_return") @db.Timestamptz
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz

  location Location  @relation(fields: [locationId], references: [id])
  bookings Booking[] @relation("booking_bay")

  @@index([locationId, isActive])
  @@map("wash_bays")
}
```

### OffPlatformBooking (new model — extends Booking concept)
Rather than a separate model, add fields to the existing Booking model:
```prisma
// ADD to existing Booking model:
  bookingSource         String    @default("PLATFORM") @map("booking_source") // PLATFORM, DIRECT, WALK_IN
  isOffPlatform         Boolean   @default(false) @map("is_off_platform")
  offPlatformClientName String?   @map("off_platform_client_name")
  offPlatformClientPhone String?  @map("off_platform_client_phone")
  offPlatformClientEmail String?  @map("off_platform_client_email")
  offPlatformPaymentExternal Boolean @default(false) @map("off_platform_payment_external")
  washBayId             String?   @map("wash_bay_id") @db.Uuid
  assignedOperatorId    String?   @map("assigned_operator_id") @db.Uuid

// ADD relations:
  washBay               WashBay?  @relation("booking_bay", fields: [washBayId], references: [id])
  assignedOperator      User?     @relation("booking_operator", fields: [assignedOperatorId], references: [id])
```

### BookingPhoto (new model)
```prisma
model BookingPhoto {
  id          String   @id @default(uuid()) @db.Uuid
  bookingId   String   @map("booking_id") @db.Uuid
  uploadedBy  String   @map("uploaded_by") @db.Uuid
  photoType   String   @map("photo_type") // BEFORE, AFTER, PROBLEM_AREA, OTHER
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

### BookingMessage (new model)
```prisma
model BookingMessage {
  id         String   @id @default(uuid()) @db.Uuid
  bookingId  String   @map("booking_id") @db.Uuid
  senderId   String   @map("sender_id") @db.Uuid
  templateId String?  @map("template_id") // which predefined template was used
  body       String   // final message text (template + edits)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  booking Booking @relation(fields: [bookingId], references: [id])
  sender  User    @relation("message_sender", fields: [senderId], references: [id])

  @@index([bookingId, createdAt])
  @@map("booking_messages")
}
```

### ClientProfile (new model)
```prisma
model ClientProfile {
  id            String   @id @default(uuid()) @db.Uuid
  providerId    String   @map("provider_id") @db.Uuid
  userId        String?  @map("user_id") @db.Uuid // null for off-platform-only clients
  name          String
  phone         String?
  email         String?
  fleetName     String?  @map("fleet_name")
  tags          String[] @default([]) // VIP, FREQUENT, SERVICE_RECOVERY, NEW_CLIENT, etc.
  notes         String?
  lifetimeSpendMinor Int @default(0) @map("lifetime_spend_minor")
  visitCount    Int      @default(0) @map("visit_count")
  lastVisitAt   DateTime? @map("last_visit_at") @db.Timestamptz
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz

  provider Provider @relation(fields: [providerId], references: [id])
  user     User?    @relation(fields: [userId], references: [id])

  @@unique([providerId, userId])
  @@index([providerId])
  @@map("client_profiles")
}
```

### WashNote (new model)
```prisma
model WashNote {
  id         String   @id @default(uuid()) @db.Uuid
  bookingId  String?  @map("booking_id") @db.Uuid // null for shift-level notes
  locationId String   @map("location_id") @db.Uuid
  authorId   String   @map("author_id") @db.Uuid
  noteType   String   @map("note_type") // SHIFT, BOOKING_INSTRUCTION, OPERATOR_NOTE, SUPPLY_REQUEST
  content    String
  shiftDate  DateTime? @map("shift_date") @db.Date // for shift-level notes
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  booking  Booking?  @relation(fields: [bookingId], references: [id])
  location Location  @relation(fields: [locationId], references: [id])
  author   User      @relation("note_author", fields: [authorId], references: [id])

  @@index([bookingId])
  @@index([locationId, shiftDate])
  @@map("wash_notes")
}
```

### ProviderDiscount (new model)
```prisma
model ProviderDiscount {
  id              String   @id @default(uuid()) @db.Uuid
  providerId      String   @map("provider_id") @db.Uuid
  locationId      String?  @map("location_id") @db.Uuid // null = all locations
  discountType    String   @map("discount_type") // OFF_PEAK, VOLUME, FIRST_TIME
  name            String
  description     String?
  percentOff      Int?     @map("percent_off") // e.g., 10 for 10%
  flatAmountOff   Int?     @map("flat_amount_off") // in minor units
  // OFF_PEAK specific:
  peakStartTime   String?  @map("peak_start_time") // HH:MM
  peakEndTime     String?  @map("peak_end_time")   // HH:MM
  peakDaysOfWeek  Int[]    @default([]) @map("peak_days_of_week") // 0=Sun..6=Sat
  // VOLUME specific:
  volumeThreshold Int?     @map("volume_threshold") // min bookings in period
  volumePeriodDays Int?    @map("volume_period_days") // rolling window
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

### SubscriptionPackage (new model)
```prisma
model SubscriptionPackage {
  id               String   @id @default(uuid()) @db.Uuid
  providerId       String   @map("provider_id") @db.Uuid
  locationId       String   @map("location_id") @db.Uuid
  name             String
  description      String?
  serviceIds       String[] @map("service_ids") // services included per wash
  cadence          String   // WEEKLY, BIWEEKLY, MONTHLY, CUSTOM
  cadenceIntervalDays Int?  @map("cadence_interval_days") // for CUSTOM
  pricePerWashMinor Int     @map("price_per_wash_minor") // per vehicle class pricing in separate model
  currencyCode     String   @map("currency_code") @db.Char(3)
  minWashes        Int      @default(3) @map("min_washes") // minimum commitment
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz

  provider      Provider                @relation(fields: [providerId], references: [id])
  location      Location                @relation(fields: [locationId], references: [id])
  subscriptions FleetSubscription[]

  @@index([providerId, isActive])
  @@map("subscription_packages")
}

model FleetSubscription {
  id                  String    @id @default(uuid()) @db.Uuid
  packageId           String    @map("package_id") @db.Uuid
  fleetId             String    @map("fleet_id") @db.Uuid
  vehicleId           String    @map("vehicle_id") @db.Uuid
  status              String    @default("ACTIVE") // ACTIVE, PAUSED, CANCELLED
  startDate           DateTime  @map("start_date") @db.Date
  nextWashDate        DateTime? @map("next_wash_date") @db.Date
  totalWashesCompleted Int      @default(0) @map("total_washes_completed")
  cancelledAt         DateTime? @map("cancelled_at") @db.Timestamptz
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  package SubscriptionPackage @relation(fields: [packageId], references: [id])
  fleet   Fleet               @relation(fields: [fleetId], references: [id])
  vehicle Vehicle             @relation(fields: [vehicleId], references: [id])

  @@index([fleetId, status])
  @@index([packageId])
  @@map("fleet_subscriptions")
}
```

### NotificationPreference (new model)
```prisma
model NotificationPreference {
  id          String  @id @default(uuid()) @db.Uuid
  userId      String  @map("user_id") @db.Uuid
  eventType   String  @map("event_type") // e.g., NEW_BOOKING, CANCELLATION, REVIEW_RECEIVED
  emailEnabled Boolean @default(true) @map("email_enabled")
  inAppEnabled Boolean @default(true) @map("in_app_enabled")
  smsEnabled   Boolean @default(false) @map("sms_enabled")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, eventType])
  @@map("notification_preferences")
}
```

**Also update these existing models with new relations:**
- `Location`: add `washBays WashBay[]`, `washNotes WashNote[]`, `discounts ProviderDiscount[]`, `subscriptionPackages SubscriptionPackage[]`
- `Booking`: add `photos BookingPhoto[]`, `messages BookingMessage[]`, `washNotes WashNote[]`, plus the new fields listed above
- `Provider`: add `clientProfiles ClientProfile[]`, `discounts ProviderDiscount[]`, `subscriptionPackages SubscriptionPackage[]`
- `User`: add new relation annotations for `bookingPhotos`, `bookingMessages`, `washNotes`, `clientProfiles`, `notificationPreferences`, `assignedBookings`
- `Fleet`: add `subscriptions FleetSubscription[]`
- `Vehicle`: add `subscriptions FleetSubscription[]`
- `FileAsset`: add `bookingPhotos BookingPhoto[]`

## TASK 1.2 — Run Migration

```bash
cd lib/db
npx prisma migrate dev --name v2_provider_features
```

Verify migration succeeds. Check that all new tables are created and all existing data is preserved.

## TASK 1.3 — Update OpenAPI Spec

File: `lib/api-spec/openapi.yaml`

Add schemas and endpoints for all new models. Key new endpoints (organized by route file):

**Provider routes** (`/api/providers/:providerId/...`):
- `GET/POST /locations/:locationId/bays` — list/create wash bays
- `PATCH/DELETE /locations/:locationId/bays/:bayId` — update/delete bay
- `POST /locations/:locationId/bays/:bayId/out-of-service` — mark bay out of service
- `POST /locations/:locationId/bays/:bayId/restore` — restore bay
- `GET/POST /discounts` — list/create discount rules
- `PATCH/DELETE /discounts/:discountId` — update/delete discount
- `GET/POST /subscription-packages` — list/create packages
- `PATCH/DELETE /subscription-packages/:packageId` — update/delete package
- `GET /client-profiles` — list all client profiles for provider
- `GET/PATCH /client-profiles/:profileId` — get/update profile
- `POST /client-profiles` — create off-platform client profile
- `GET /analytics/overview` — dashboard metrics
- `GET /analytics/revenue` — revenue reports with filters
- `GET /analytics/operations` — operational metrics
- `GET /analytics/clients` — client metrics
- `GET /analytics/operators` — operator performance
- `GET /audit-log` — audit log with filters

**Booking routes** (`/api/bookings/...`):
- `POST /off-platform` — create off-platform booking (provider-initiated)
- `POST /walk-in` — create walk-in booking
- `POST /:bookingId/photos` — upload booking photo
- `GET /:bookingId/photos` — get booking photos
- `POST /:bookingId/messages` — send message
- `GET /:bookingId/messages` — get messages
- `PATCH /:bookingId/assign-bay` — assign/reassign bay
- `PATCH /:bookingId/assign-operator` — assign/reassign operator
- `PATCH /:bookingId/reschedule` — reschedule (drag-and-drop)
- `PATCH /:bookingId/adjust-price` — adjust price for service mismatch

**Wash Notes routes:**
- `GET/POST /api/locations/:locationId/wash-notes` — shift notes
- `GET/POST /api/bookings/:bookingId/wash-notes` — booking notes

**Subscription routes:**
- `POST /api/subscriptions/purchase` — fleet purchases subscription
- `GET /api/fleets/:fleetId/subscriptions` — fleet's active subscriptions
- `PATCH /api/subscriptions/:subscriptionId/cancel` — cancel subscription

**Notification Preference routes:**
- `GET/PUT /api/users/me/notification-preferences`

After updating the spec, regenerate the client:
```bash
cd lib/api-spec && pnpm run generate
```

## TASK 1.4 — Update Fee Calculator

File: `artifacts/api-server/src/lib/feeCalculator.ts`

Expand the fee calculator to handle subscription pricing:

```typescript
export const STANDARD_FEE_RATE = 0.15;
export const STANDARD_FEE_CAP_MINOR = 2500; // $25.00
export const SUBSCRIPTION_FEE_CAP_MINOR = 2000; // $20.00
export const SUBSCRIPTION_MIN_WASHES = 3;

export function calculatePlatformFee(
  serviceBasePriceMinor: number,
  options?: {
    isSubscription?: boolean;
    discountAmountMinor?: number;
  }
): number {
  const effectivePrice = serviceBasePriceMinor - (options?.discountAmountMinor ?? 0);
  const cap = options?.isSubscription ? SUBSCRIPTION_FEE_CAP_MINOR : STANDARD_FEE_CAP_MINOR;
  return Math.min(
    Math.round(effectivePrice * STANDARD_FEE_RATE),
    cap
  );
}

export function calculateAllInPrice(
  serviceBasePriceMinor: number,
  options?: {
    isSubscription?: boolean;
    discountAmountMinor?: number;
  }
): number {
  const effectivePrice = serviceBasePriceMinor - (options?.discountAmountMinor ?? 0);
  return effectivePrice + calculatePlatformFee(serviceBasePriceMinor, options);
}

export function calculateDiscounts(
  serviceBasePriceMinor: number,
  applicableDiscounts: Array<{
    percentOff?: number | null;
    flatAmountOff?: number | null;
  }>
): number {
  let totalDiscount = 0;
  for (const d of applicableDiscounts) {
    if (d.percentOff) {
      totalDiscount += Math.round(serviceBasePriceMinor * (d.percentOff / 100));
    }
    if (d.flatAmountOff) {
      totalDiscount += d.flatAmountOff;
    }
  }
  // Discount cannot exceed base price
  return Math.min(totalDiscount, serviceBasePriceMinor);
}
```

## TASK 1.5 — Expand Seed Data

File: `lib/db/src/seedLaunchCorridor.ts`

After migration, expand the seed script to include all new entities per PRD Section 12. This task depends on Phase 1 models being migrated.

---

# PHASE 2: PROVIDER CORE EXPERIENCE (Weeks 3-4)

*Goal: Build the primary operational views that provider operators and admins use every day. After Phase 2, providers can manage their full daily workflow including off-platform bookings.*

## TASK 2.1 — Daily Wash Board (List View)

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`
Add endpoint: `GET /api/providers/:providerId/locations/:locationId/daily-board`
Parameters: `date` (ISO date string, defaults to today), `locationId`
Returns: bookings for the specified date at the specified location, grouped by status (UPCOMING, IN_PROGRESS, COMPLETED), enriched with: vehicle details, customer/fleet info, assigned operator, booking source, client profile tags, wash notes. Sort UPCOMING by scheduledStartAtUtc ascending.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/daily-board.tsx`

Layout:
- Top bar: Date picker (defaults to today, can browse forward/back), location selector (for multi-location providers).
- Filter bar: Status, Operator, Vehicle Class, Service Type, Booking Source. Use shadcn/ui `Select` components.
- Three collapsible sections: Upcoming, In Progress, Completed.
- Each booking rendered as a card component per PRD Section 5.1.

Booking card component (`artifacts/washbuddy-web/src/components/provider/booking-card.tsx`):
- Compact: 72px height collapsed showing: time, vehicle icon+class badge, driver name, services (abbreviated), operator, status badge, source badge.
- Expanded (on click): full details including notes, special requests, client tags, action buttons.
- Action buttons at bottom of expanded card: "Check In" (for PROVIDER_CONFIRMED), "Start Wash" (for CHECKED_IN), "Complete" (for IN_SERVICE). Each button triggers a status transition via `PATCH /api/bookings/:id/status`.
- Source badges: Use `shadcn/ui Badge` with variants — "WashBuddy" (blue/default), "Direct" (gray/secondary), "Walk-in" (orange/destructive variant with custom color).
- Client tag badges: VIP (gold), Service Recovery (red), New Client (green), Frequent (blue). Use small pill badges.
- Photo prompt: When marking "Complete," show a non-blocking dialog: "Take an 'after' photo? (recommended)" with Camera and Skip buttons. Camera opens device camera via `<input type="file" accept="image/*" capture="environment">`. On capture, compress client-side using canvas (max 1200px width, 80% JPEG quality), then upload via `POST /api/bookings/:id/photos` with `photoType: "AFTER"`.

**UX requirements:**
- Cards must be touch-friendly: minimum 44px tap targets for all buttons.
- Status transitions should use optimistic updates (update UI immediately, roll back on error).
- The In Progress section should show a live elapsed timer on each card. Use `setInterval` updating every second, displaying "MM:SS elapsed" with color coding: green (<estimated duration), yellow (75-100% of estimated), red (>estimated).
- Page should auto-refresh every 30 seconds via TanStack Query's `refetchInterval` to catch new bookings.

**Acceptance criteria:** Provider operator can view all of today's bookings in a scannable list, see booking source and client context at a glance, process bookings through status transitions with one tap, and capture after-photos at completion.

## TASK 2.2 — Bay Timeline View

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`
Add endpoint: `GET /api/providers/:providerId/locations/:locationId/bay-timeline`
Parameters: `date`, `startHour`, `endHour`
Returns: All wash bays for the location with their bookings for the specified time range. Each bay includes: id, name, supportedClasses, isActive, outOfServiceSince/Reason/EstReturn. Each booking includes: id, scheduledStart, scheduledEnd, vehicleClass, vehicleUnitNumber, driverFirstName, services, status, bookingSource, assignedOperatorId.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/bay-timeline.tsx`

Implementation approach: Use a CSS Grid layout. The grid has one column for bay labels and remaining columns for time slots. Each bay is a row.

Layout:
- Left column (fixed): Bay labels showing bay name + vehicle class icons (S/M/L/XL badges for supported classes).
- Horizontal axis: Time slots in 15-minute increments. Total width: 96 columns for a 24-hour view, or proportional for shorter views. Use horizontal scrolling with the current time anchored to the center.
- Current time: Red vertical line spanning all rows. Use `position: absolute` with left offset calculated from current time.
- Booking blocks: `position: absolute` elements within each bay row. Left offset = (booking start - view start) / total view duration * 100%. Width = booking duration / total view duration * 100%. Color-coded by service type using CSS custom properties.
- Gap indicators: For each gap >30 minutes between bookings, render a subtle dashed-border area with a "+" button centered. The "+" button opens a quick-add form.

**Drag-and-drop implementation:**
Use the HTML5 Drag and Drop API (or a lightweight library like `@dnd-kit/core` if already in dependencies, otherwise use native):
- `draggable="true"` on booking blocks.
- On dragstart: store booking ID and original position.
- On dragover bay rows: calculate the time slot the user is hovering over. Show a ghost indicator of where the booking would land.
- On drop: validate target bay/time (bay supports vehicle class, no overlap, within operating hours). If valid, call `PATCH /api/bookings/:id/reschedule` with `newBayId`, `newStartTime`, `newEndTime`. If the booking is on-platform, the API creates a notification to the driver/fleet with accept/reject. If off-platform, the move is immediate.

**Mobile view:**
On viewports <768px, collapse to single-bay view:
- Bay selector dropdown at top.
- Vertical timeline (top=morning, bottom=evening) showing bookings as blocks stacked vertically.
- Drag-and-drop replaced with "Reschedule" button in booking detail that opens a time picker.

**Quick-add off-platform booking (clicking "+" in gap):**
Opens a `shadcn/ui Sheet` (slides in from right) with form:
- Source selector: "Direct Call" or "Walk-in"
- Client info: Name (required), Phone (optional), Email (optional). Autocomplete against existing ClientProfile records.
- Vehicle class selector: Small/Medium/Large/Extra Large
- Service selector: checkboxes for available services
- Time: pre-populated from the gap they clicked
- Bay: pre-populated from the bay row they clicked
- Notes: optional text area
- "Process Payment via WashBuddy" toggle (default off for off-platform)
- Save button creates booking via `POST /api/bookings/off-platform`

**Acceptance criteria:** Provider can see all bays and their bookings on a visual timeline, identify gaps for additional bookings, drag bookings to reschedule them, and add off-platform bookings by clicking gaps. On mobile, the view is usable as a vertical single-bay timeline.

## TASK 2.3 — Off-Platform Booking API

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`

Add `POST /api/bookings/off-platform` endpoint:
- Auth: requires PROVIDER_ADMIN or PROVIDER_STAFF role for the provider
- Body: `{ locationId, serviceId, vehicleClass, bayId?, clientName, clientPhone?, clientEmail?, scheduledStartAtUtc, scheduledEndAtUtc, notes?, processPayment: boolean }`
- Logic:
  1. Validate the user has provider membership for this location
  2. Create or update ClientProfile for this client (match by phone or email if provided, otherwise create new)
  3. Create Booking with: `bookingSource: "DIRECT"` or `"WALK_IN"`, `isOffPlatform: true`, `platformFeeMinor: 0` (unless processPayment is true), `status: "PROVIDER_CONFIRMED"` (skip REQUESTED since provider is creating it)
  4. If `processPayment: true`, create PaymentIntent via Stripe with standard fee calculation
  5. Auto-assign bay if `bayId` not provided (find first compatible available bay)
  6. Create BookingStatusHistory record
  7. Update ClientProfile: increment visitCount, update lastVisitAt
  8. Return the created booking

Add `POST /api/bookings/walk-in` endpoint:
- Same as off-platform but with `bookingSource: "WALK_IN"` and `scheduledStartAtUtc: now()`

**Acceptance criteria:** Providers can create bookings for clients who called or walked in. These bookings appear on the timeline and daily board alongside platform bookings. Off-platform bookings have zero platform fee unless the provider opts to process payment through WashBuddy.

## TASK 2.4 — Booking Status Transitions (Enhanced)

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`

Enhance existing status transition endpoints to support new fields:

`PATCH /api/bookings/:id/status`:
- When transitioning to IN_SERVICE: start a timer (set `serviceStartedAtUtc` to now)
- When transitioning to COMPLETED_PENDING_WINDOW: set `serviceCompletedAtUtc` to now, calculate actual duration, update vehicle's `lastWashAtUtc`, update ClientProfile stats

`PATCH /api/bookings/:id/assign-operator`:
- Body: `{ operatorId }`
- Validates operator has PROVIDER_STAFF or PROVIDER_ADMIN membership at this location
- Sets `assignedOperatorId` on booking
- Creates AuditEvent

`PATCH /api/bookings/:id/assign-bay`:
- Body: `{ bayId }`
- Validates bay is at the same location and supports the vehicle class
- Sets `washBayId` on booking
- Creates AuditEvent

`PATCH /api/bookings/:id/adjust-price`:
- Body: `{ newServiceBasePriceMinor, reason }` (for service mismatch scenarios)
- Recalculates platform fee
- Creates AuditEvent with before/after values
- Sends notification to customer about price adjustment

## TASK 2.5 — Waitlist for Walk-Ins

**Backend:**
File: Create `artifacts/api-server/src/routes/waitlist.ts`

`POST /api/locations/:locationId/waitlist`:
- Body: `{ clientName, clientPhone?, vehicleClass, serviceIds }`
- Creates a WashNote with noteType "WAITLIST_ENTRY" and estimated wait time calculated from current in-progress booking durations
- Returns estimated wait time

`GET /api/locations/:locationId/waitlist`:
- Returns current waitlist entries sorted by creation time

`POST /api/locations/:locationId/waitlist/:entryId/notify`:
- Sends SMS (future) or in-app notification to waitlisted client that a bay is available

**Frontend:**
Add waitlist panel to the Daily Wash Board as a collapsible "Waitlist" section above the three main sections.

---

# PHASE 3: PROVIDER ADMIN DASHBOARD (Weeks 5-6)

*Goal: Build the full Provider Administrator experience — CRM, reporting, analytics, operator performance, settings, and audit log.*

## TASK 3.1 — Client Profiles (CRM)

**Backend:**
File: Create `artifacts/api-server/src/routes/clientProfiles.ts`

Endpoints per Task 1.3 spec. Key logic:
- `GET /api/providers/:providerId/client-profiles`: paginated, sortable (by name, visitCount, lifetimeSpend, lastVisitAt), filterable by tags
- `PATCH /api/providers/:providerId/client-profiles/:id`: update tags, notes. Auto-tag logic: if `visitCount >= 5` in last 90 days, auto-add "FREQUENT". If latest review rating ≤ 3, auto-add "SERVICE_RECOVERY".
- ClientProfile creation happens automatically on first booking (on-platform or off-platform). For on-platform: populated from User record. For off-platform: populated from the off-platform booking form fields.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/clients.tsx`

Layout:
- Search bar at top: search by name, phone, email, fleet name
- Filter pills: by tag (VIP, Frequent, Service Recovery, New, etc.)
- Client list: table with columns — Name, Fleet, Visits, Lifetime Spend, Last Visit, Tags, Rating Avg
- Click a client: opens detail panel (Sheet from right) showing: full profile, visit history (chronological list of bookings at this provider with dates, services, operator, duration, rating), notes thread (chronological), editable tags, add note form.

**Sidebar integration:**
When viewing a booking (on Daily Wash Board or Bay Timeline), a client summary should appear in a sidebar or expandable section showing: client name, tags (prominently), lifetime spend, visit count, last visit, and any notes. The operator should see this context without navigating away.

Component: `artifacts/washbuddy-web/src/components/provider/client-summary-sidebar.tsx`

## TASK 3.2 — Reporting & Analytics Dashboard

**Backend:**
File: Create `artifacts/api-server/src/routes/providerAnalytics.ts`

`GET /api/providers/:providerId/analytics/overview`:
Returns dashboard metrics: overall rating, total washes (by period), revenue, utilization rate, new clients, repeat rate. Parameters: `startDate`, `endDate`, `locationId?`

`GET /api/providers/:providerId/analytics/revenue`:
Returns: revenue by service type, by vehicle class, by booking source, revenue per bay-hour, revenue trend (daily/weekly data points). Same parameters.

`GET /api/providers/:providerId/analytics/operations`:
Returns: average wash duration by service/class, peak demand heatmap (24x7 matrix of booking counts), capacity utilization trend, no-show rate, cancellation rate.

`GET /api/providers/:providerId/analytics/clients`:
Returns: first-time client count/trend, repeat rate, retention rate, average lead time, upsell attach rate.

`GET /api/providers/:providerId/analytics/operators`:
Returns: per-operator stats (washes, avg duration, on-time %, avg rating, upsell rate).

Implementation: Use Prisma raw SQL queries for aggregations. Calculate metrics from the Booking, Review, and ClientProfile tables. Cache results with a 5-minute TTL for the overview endpoint to avoid expensive recalculations on every request.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/analytics.tsx`

Use `recharts` (already available in the project as a dependency of shadcn charts) for visualizations.

Layout per PRD Section 5.7:
- Top: date range selector (Today, This Week, This Month, This Quarter, This Year, Custom) + location filter + export button
- Metric cards row: Rating (with gauge), Total Washes (with delta), Revenue (with delta), Utilization (with gauge), New Clients, Repeat Rate
- Tab sections: Revenue, Operations, Clients, Staff
- Each tab contains the relevant charts described in PRD Section 5.7
- Export: PDF (use browser print CSS) and CSV (generate and download)

Color palette for charts: WashBuddy Platform bookings = `hsl(221, 83%, 53%)` (blue), Direct = `hsl(220, 9%, 46%)` (gray), Walk-in = `hsl(25, 95%, 53%)` (orange). Consistent across all charts.

## TASK 3.3 — Operator Performance Dashboard

**Backend:**
Included in analytics endpoints (Task 3.2) — the operators endpoint.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/operator-performance.tsx`

Admin view: Table of all operators with columns — Name, Washes, Avg Duration, On-Time %, Avg Rating, Upsell Rate. Each cell includes a sparkline trend (last 30 days). Top performer highlighted with subtle gold background. Operators with declining metrics flagged with a small warning icon.

Click an operator: detail view showing full metrics breakdown, individual wash history, and rating distribution chart.

Operator self-view (for PROVIDER_STAFF accessing their own stats): "Personal Scorecard" layout showing their own metrics in a positive, encouraging format. Large numbers for achievements (total washes, rating). Trends shown as "improving" badges when positive.

## TASK 3.4 — Shift Dashboard

**Backend:**
File: `artifacts/api-server/src/routes/providerAnalytics.ts`
Add `GET /api/providers/:providerId/locations/:locationId/shift-overview`
Parameters: `date`, `shiftStart`, `shiftEnd`
Returns: vehicle count by class, operators on shift, capacity utilization, revenue forecast, booking source breakdown.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/shift-overview.tsx`
Layout per PRD Section 5.3. Metric cards at top, booking source chart below.

## TASK 3.5 — Audit Log

**Backend:**
Audit events are already created via the AuditEvent model. Ensure all new booking operations (off-platform create, status change, reschedule, price adjust, operator assign, bay assign) create AuditEvent records.

Add endpoint: `GET /api/providers/:providerId/audit-log`
Parameters: `startDate`, `endDate`, `actorId?`, `actionType?`, `entityType?`, page/limit
Returns: paginated audit events.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/provider/audit-log.tsx`
Filterable, paginated table per PRD Section 5.10.

## TASK 3.6 — Settings & User Management

**Frontend:**
File: Enhance `artifacts/washbuddy-web/src/pages/provider/settings.tsx`

Reorganize into tabbed sections:
- **Business Info:** Provider name, contact details (read-only for now, editable future)
- **Locations:** Existing location management (enhanced in Phase 0 Task 0.5) + bay management UI
- **Services:** Service menu management with price-per-vehicle-class matrix [NEW]
- **Discounts:** CRUD for discount rules [NEW]
- **Subscriptions:** CRUD for subscription packages [NEW]
- **Team:** User management — list of admins and operators, invite new users, assign to locations, deactivate [NEW]
- **Notifications:** Notification preferences per event type [NEW]
- **Display:** Light/dark mode toggle, default view preferences [NEW]

Each section uses shadcn/ui `Tabs` component. Forms use react-hook-form + zod validation.

---

# PHASE 4: CROSS-ROLE FEATURES (Weeks 7-8)

*Goal: Build features that span multiple user roles — messaging, photos, subscriptions, discounts.*

## TASK 4.1 — In-Platform Messaging

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`

`POST /api/bookings/:id/messages`:
- Auth: PROVIDER_ADMIN or PROVIDER_STAFF only (drivers cannot initiate messages in v2)
- Body: `{ templateId?, body }`
- Validates: booking is on-platform (`isOffPlatform: false`), booking is in active status (PROVIDER_CONFIRMED through IN_SERVICE or COMPLETED_PENDING_WINDOW)
- Creates BookingMessage record
- Creates Notification for the driver (in-app + email)
- Creates Notification for the fleet admin if the booking is fleet-associated

`GET /api/bookings/:id/messages`:
- Auth: booking customer, fleet admin of booking's fleet, provider admin/staff of booking's provider
- Returns: all messages for this booking, sorted chronologically

**Frontend — Provider side:**
Component: `artifacts/washbuddy-web/src/components/provider/send-message.tsx`
- Button "Message Driver" on booking detail/card (only visible for on-platform bookings)
- Opens dialog with: template selector (dropdown of 5 predefined templates per PRD Section 5.8), editable text area (pre-populated with selected template), Send button
- After sending: show success toast, message appears in booking's message history

**Frontend — Driver side:**
Component: `artifacts/washbuddy-web/src/components/customer/booking-messages.tsx`
- On the booking detail page, add a "Messages" section showing chronological list of messages received
- Each message shows: sender name, timestamp, message body
- Read-only for drivers in v2 (no reply capability)

**Frontend — Fleet side:**
On the fleet booking detail view, add the same "Messages" section (read-only) for transparency.

## TASK 4.2 — Photo Documentation

**Backend:**
File: `artifacts/api-server/src/routes/bookings.ts`

`POST /api/bookings/:id/photos`:
- Auth: PROVIDER_ADMIN, PROVIDER_STAFF (for BEFORE/AFTER photos), or DRIVER (for PROBLEM_AREA photos at booking time)
- Body: multipart form with `photoType` (BEFORE, AFTER, PROBLEM_AREA) and image file
- Store file: save to local filesystem for MVP (future: S3). Create FileAsset record. Create BookingPhoto record.
- Return: photo URL

`GET /api/bookings/:id/photos`:
- Auth: booking customer, fleet admin, provider admin/staff, platform admin
- Returns: all photos for this booking with type, uploader name, caption, timestamp

**Frontend — Provider Operator photo prompt:**
In the booking card component, when status transitions to IN_SERVICE or COMPLETED_PENDING_WINDOW:
- Show a non-blocking `shadcn/ui AlertDialog` with title "Take a photo? (recommended)"
- Two buttons: "Open Camera" and "Skip"
- "Open Camera" triggers `<input type="file" accept="image/*" capture="environment">` which opens the device camera
- After capture: show preview with "Use Photo" / "Retake" buttons
- "Use Photo" compresses image (canvas resize to max 1200px width, toBlob at quality 0.8) and uploads
- "Skip" dismisses the dialog and proceeds with the status transition

**Frontend — Driver photo attachment at booking time:**
In the booking flow (step 4 per PRD Section 6.2), add an optional "Attach photos" section with a file input that accepts images. Multiple photos allowed. Each uploaded as PROBLEM_AREA type.

**Frontend — Photo display:**
On booking detail pages (all roles), display a "Photos" section showing thumbnail grid of all booking photos. Thumbnails expand to full-size on click (use `shadcn/ui Dialog` with the image centered). Each photo labeled with type badge (Before/After/Problem Area) and uploader name.

## TASK 4.3 — Subscription Packages

**Backend:**
File: Create `artifacts/api-server/src/routes/subscriptions.ts`

Provider-side:
- `GET /api/providers/:providerId/subscription-packages` — list packages
- `POST /api/providers/:providerId/subscription-packages` — create package
- `PATCH /api/providers/:providerId/subscription-packages/:id` — update
- `DELETE /api/providers/:providerId/subscription-packages/:id` — deactivate

Fleet-side:
- `GET /api/fleets/:fleetId/available-subscriptions?locationId=` — list available packages at a location
- `POST /api/fleets/:fleetId/subscriptions` — purchase (creates FleetSubscription, auto-schedules first wash booking with subscription fee tier)
- `GET /api/fleets/:fleetId/subscriptions` — list active subscriptions
- `PATCH /api/fleets/:fleetId/subscriptions/:id/cancel` — cancel

Subscription booking creation logic:
When a FleetSubscription is active, the system auto-creates bookings for each scheduled wash. Use a cron-like scheduled job (or on-demand when checking for next washes) that:
1. Finds FleetSubscriptions where `nextWashDate <= today + 7 days` and status is ACTIVE
2. For each, creates a booking at the subscription's location with: `bookingSource: "PLATFORM"`, subscription fee rate ($20 cap), auto-assigned bay, status PROVIDER_CONFIRMED (instant)
3. Updates `nextWashDate` based on cadence
4. Sends notification to driver about upcoming scheduled wash

**Frontend — Provider side:**
In provider settings (Task 3.6), the "Subscriptions" tab shows:
- List of existing packages with: name, services included, cadence, price, active subscribers count
- "Create Package" button → form with fields per SubscriptionPackage model
- Edit/deactivate actions

**Frontend — Fleet side:**
- On location detail page (driver view): "Subscription Packages Available" section showing packages offered at this location. "Request Subscription" button sends to fleet admin for approval.
- Fleet admin: `artifacts/washbuddy-web/src/pages/fleet/subscriptions.tsx` [NEW page] showing active subscriptions, available packages to browse, and purchase flow.

## TASK 4.4 — Discount System

**Backend:**
File: Create `artifacts/api-server/src/routes/discounts.ts`

Provider-side CRUD per Task 1.3 endpoints.

Discount application logic in booking creation:
When a booking is created, before calculating the platform fee:
1. Query active ProviderDiscount records for this provider/location
2. For each applicable discount type:
   - OFF_PEAK: check if booking time falls within the discount's time window and day-of-week
   - VOLUME: check if the fleet's booking count at this provider in the rolling window exceeds the threshold
   - FIRST_TIME: check if this is the client's first booking at this provider (via ClientProfile.visitCount == 0)
3. If stackable, sum all applicable discounts. If not stackable, apply the largest single discount.
4. Calculate platform fee on post-discount price.
5. Store discount details on the booking (add `discountAmountMinor` and `discountDescription` fields to Booking model).

**Frontend — Booking flow:**
In the booking summary step, if discounts apply, show:
- Original price (struck through)
- Discount label (e.g., "10% off-peak discount")
- Final all-in price

**Frontend — Provider settings:**
In the "Discounts" tab (Task 3.6), show:
- List of discount rules with type, name, value, status
- Create/edit forms per ProviderDiscount model fields

---

# PHASE 5: DRIVER & FLEET ENHANCEMENTS (Weeks 9-10)

*Goal: Enhance the driver and fleet operator experiences with the new features defined in PRD.*

## TASK 5.1 — "Find a Wash Now" Quick Action

**Frontend:**
File: `artifacts/washbuddy-web/src/pages/customer/search.tsx`

Add a prominent button at the top of the search page: "Find a Wash Now" (use `shadcn/ui Button` with `size="lg"` and a distinctive color — orange or green to stand out).

On click:
1. Get user's current location via geolocation API
2. Apply filters: available within next 2 hours, within 15 miles, sorted by soonest available slot
3. Show results in a focused list view (no map, just cards sorted by availability)
4. Each card shows: provider name, distance, soonest available time, services available, all-in price for driver's vehicle class, "Book Now" button

This should feel fast and decisive — a driver in a hurry should be able to find and book a wash in under 60 seconds from tapping this button.

## TASK 5.2 — Wash Health Indicators

**Backend:**
File: `artifacts/api-server/src/routes/vehicles.ts`
Enhance the vehicle list endpoint to compute wash health status for each vehicle:
- Green: `lastWashAtUtc` is within recommended frequency (7 days in Nov-Mar, 14 days otherwise for Northeast corridor)
- Yellow: within 2 days of threshold
- Red: past threshold
- Gray: no wash history

Add `GET /api/fleets/:fleetId/vehicles/wash-health-summary`:
Returns: { green: N, yellow: N, red: N, gray: N } for the fleet overview dashboard.

**Frontend:**
- Vehicle list page (`fleet/vehicles.tsx`): add a colored circle indicator next to each vehicle showing wash health status
- Fleet overview page (`fleet/overview.tsx`): add a "Wash Health" summary card showing the counts per status with a simple horizontal bar visualization
- Alert notifications: when a vehicle transitions from Yellow to Red, create a Notification for the FLEET_ADMIN and MAINTENANCE_MANAGER

## TASK 5.3 — Enhanced Fleet Reports

**Frontend:**
File: `artifacts/washbuddy-web/src/pages/fleet/reports.tsx`

Add new report tabs (alongside existing):
- **Spend per Vehicle:** Bar chart showing total wash spend per vehicle, sortable by amount
- **Wash Frequency:** Per-vehicle line chart showing wash frequency over time
- **Provider Comparison:** Table showing each provider the fleet uses with: name, total bookings, avg rating, avg duration, avg cost, on-time rate
- **Subscription Savings:** If fleet has active subscriptions, show: total saved from reduced fee cap ($20 vs $25), projected annual savings

## TASK 5.4 — Fleet Subscription Management

**Frontend:**
File: Create `artifacts/washbuddy-web/src/pages/fleet/subscriptions.tsx`

Layout:
- Active Subscriptions: list of current subscriptions with provider, service, vehicle, next wash date, price, savings indicator
- Browse Packages: search available packages by provider/location
- Purchase flow: select package → select vehicle(s) → confirm → payment authorized

---

# PHASE 6: NOTIFICATIONS & POLISH (Weeks 11-12)

*Goal: Complete the notification system, implement notification preferences, and polish the entire UI for launch.*

## TASK 6.1 — Notification Preferences

**Backend:**
File: `artifacts/api-server/src/routes/notifications.ts`
- `GET /api/users/me/notification-preferences` — returns all preferences (or defaults if not yet set)
- `PUT /api/users/me/notification-preferences` — batch update preferences

When creating a notification, check the user's preferences before dispatching via each channel.

**Frontend:**
File: Create `artifacts/washbuddy-web/src/components/settings/notification-preferences.tsx`
Table/grid showing each event type with toggles for Email, In-App, SMS (disabled for now).

## TASK 6.2 — Full Notification Integration

Audit every feature from Phases 2-5 and ensure notifications are created for all events listed in PRD Section 8.2. Key gaps to fill:
- Booking rescheduled by provider (accept/reject notification to driver) [NEW]
- Messages from provider (notification to driver) [Phase 4]
- Wash health alerts (notification to fleet admin/maintenance manager) [Phase 5]
- Subscription renewal (notification to fleet admin) [Phase 4]

## TASK 6.3 — UI Polish and Responsiveness

Go through every page and ensure:
1. **Mobile-first for operators:** The Daily Wash Board, Bay Timeline (single-bay), booking status transitions, photo capture, and messaging all work on a phone. Test at 375px width (iPhone SE).
2. **Desktop-first for admins:** Analytics, CRM, audit log, settings all have proper wide-screen layouts. Test at 1440px width.
3. **Consistent visual language:** Source badges, status badges, and health indicators use the exact colors specified in PRD Section 13.3 across every page.
4. **Loading states:** Replace all spinner-based loading with skeleton screens using shadcn/ui `Skeleton`.
5. **Empty states:** Every list/table/chart has a meaningful empty state (not just blank space). Example: "No bookings yet today. Walk-in bookings can be added from the Bay Timeline."
6. **Error states:** Every API call has error handling with user-friendly messages via `shadcn/ui toast`.
7. **Touch targets:** All interactive elements on mobile views are at least 44px.
8. **Keyboard navigation:** All forms are navigable via Tab. All dialogs are closeable via Escape.

---

# PHASE 7: LAUNCH PREPARATION (Weeks 13-14)

*Goal: Final integration testing, Stripe Connect, performance optimization, security hardening.*

## TASK 7.1 — End-to-End Flow Verification

Test every complete user journey:
1. **Driver books a wash:** Search → select location → select vehicle → select service → see all-in price → book → receive confirmation → check in → wash completed → see photos → leave review.
2. **Provider processes a booking:** Receive notification → confirm → check in vehicle → start wash → capture before photo → complete wash → capture after photo → send message "wash complete."
3. **Provider enters off-platform booking:** Open bay timeline → click gap → fill quick-add form → booking appears on timeline → mark as complete.
4. **Provider walks in a client:** Walk-in arrives → operator creates walk-in booking → optionally processes payment → booking tracked in reports.
5. **Fleet admin manages fleet:** View overview → see wash health (red vehicles) → book wash for overdue vehicle → view reports → see provider comparison → purchase subscription → see fee savings.
6. **Subscription lifecycle:** Fleet buys subscription → auto-scheduled washes appear → driver gets notification → wash completed → subscription fee ($20 cap) applied correctly.
7. **Discount application:** Provider creates off-peak discount → driver books during off-peak → discount shown in booking summary → fee calculated on post-discount price.
8. **Dispute with photos:** Driver disputes wash quality → platform admin sees before/after photos → resolves dispute.

## TASK 7.2 — Stripe Connect Integration
Per EID v1 Task 5.5. Additionally:
- Subscription payments: recurring PaymentIntents with subscription fee cap
- Walk-in payments: on-demand PaymentIntents when provider opts in
- Discount adjustments: ensure Stripe amounts reflect post-discount prices

## TASK 7.3 — Performance Optimization
- Bay timeline with 50 bookings must render in under 2 seconds
- Analytics queries with 30 days of data must return in under 1 second
- Photo uploads must complete in under 5 seconds on 4G
- Implement query caching for analytics endpoints (5-minute TTL)

## TASK 7.4 — Security Hardening
Per EID v1 Task 5.3. Additionally:
- Messages visible only to authorized parties (sender, recipient, fleet admin, platform admin)
- Off-platform client data visible only to the provider who created it
- Photo access restricted to booking participants and platform admins
- Audit log access restricted to provider admins (for their own provider) and platform admins

## TASK 7.5 — Production Deployment Configuration
Per EID v1 Task 5.4. Additionally:
- File storage configuration for photos (local filesystem for beta, S3-ready architecture)
- Cron job for subscription auto-scheduling

---

# NAVIGATION STRUCTURE

## Provider Admin Navigation (web)
```
/provider
  /provider/daily-board          ← Daily Wash Board (default landing)
  /provider/bay-timeline         ← Bay Timeline View
  /provider/shift-overview       ← Shift Dashboard
  /provider/bookings             ← All bookings (list with filters)
  /provider/clients              ← Client Profiles (CRM)
  /provider/analytics            ← Reporting & Analytics
  /provider/operator-performance ← Operator Performance
  /provider/reviews              ← Reviews (existing)
  /provider/audit-log            ← Audit Log
  /provider/settings             ← Settings (tabbed: Business, Locations, Services, Discounts, Subscriptions, Team, Notifications, Display)
  /provider/help                 ← Help & Feedback
  /provider/onboarding           ← Onboarding (existing)
```

## Provider Operator Navigation (mobile-optimized)
```
/operator
  /operator/my-schedule          ← Today's assigned washes
  /operator/daily-board          ← Full daily board for their location
  /operator/bay-timeline         ← Bay timeline (single-bay mobile view)
  /operator/my-stats             ← Personal performance scorecard
  /operator/settings             ← Personal notification/display preferences
  /operator/help                 ← Help & Feedback
```

## Driver Navigation (mobile, existing enhanced)
```
/search                          ← Search + "Find a Wash Now" [enhanced]
/search/:locationId              ← Location detail + booking flow [enhanced with photos, subscriptions]
/my-bookings                     ← Booking list [enhanced with messages, photos]
/my-bookings/:bookingId          ← Booking detail [enhanced with messages, photos, status tracking]
/my-vehicles                     ← Assigned vehicles
/route-planner                   ← Route planner (existing)
```

## Fleet Admin Navigation (desktop, existing enhanced)
```
/fleet
  /fleet/overview                ← Dashboard [enhanced with wash health]
  /fleet/vehicles                ← Vehicle management [enhanced with wash health indicators]
  /fleet/wash-requests           ← Wash requests (existing)
  /fleet/subscriptions           ← Subscription management [NEW]
  /fleet/recurring-programs      ← Recurring programs (existing)
  /fleet/reports                 ← Reports [enhanced with new report types]
  /fleet/settings                ← Settings (existing)
```

## Admin Navigation (desktop, existing enhanced)
```
/admin
  /admin/dashboard               ← Platform overview [enhanced]
  /admin/providers               ← Provider management [enhanced with quality monitoring]
  /admin/bookings                ← Booking management [enhanced with photos, messages]
  /admin/reviews                 ← Review moderation (existing)
```

---

# FILE CREATION SUMMARY

New files to create (in approximate order of implementation):

**Backend (artifacts/api-server/src/):**
- `routes/clientProfiles.ts`
- `routes/providerAnalytics.ts`
- `routes/subscriptions.ts`
- `routes/discounts.ts`
- `routes/waitlist.ts`
- `lib/discountCalculator.ts`
- `lib/subscriptionScheduler.ts`
- `lib/washHealthCalculator.ts`

**Frontend (artifacts/washbuddy-web/src/pages/):**
- `provider/daily-board.tsx`
- `provider/bay-timeline.tsx`
- `provider/shift-overview.tsx`
- `provider/clients.tsx`
- `provider/analytics.tsx`
- `provider/operator-performance.tsx`
- `provider/audit-log.tsx`
- `operator/my-schedule.tsx`
- `operator/daily-board.tsx`
- `operator/bay-timeline.tsx`
- `operator/my-stats.tsx`
- `operator/settings.tsx`
- `operator/help.tsx`
- `fleet/subscriptions.tsx`

**Frontend Components (artifacts/washbuddy-web/src/components/):**
- `provider/booking-card.tsx`
- `provider/bay-timeline-view.tsx`
- `provider/client-summary-sidebar.tsx`
- `provider/send-message.tsx`
- `provider/photo-prompt.tsx`
- `provider/quick-add-booking.tsx`
- `provider/shift-metric-card.tsx`
- `customer/booking-messages.tsx`
- `customer/booking-photos.tsx`
- `customer/find-wash-now.tsx`
- `fleet/wash-health-indicator.tsx`
- `fleet/subscription-card.tsx`
- `settings/notification-preferences.tsx`

---

End of Engineering Implementation Document v2.0
