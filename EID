WASHBUDDY — ENGINEERING IMPLEMENTATION DOCUMENT (EID)
Version: 1.0 Date: April 2, 2026 Status: Ready for Engineering Companion Document: docs/PRD.md (must be read in full before beginning any work) Repository: github.com/iCreatorrr/washbuddy

PREAMBLE — INSTRUCTIONS FOR AI AGENTS
Before implementing any task in this document, read docs/PRD.md in full. The PRD is the authoritative source for all business rules, pricing logic, role permissions, feature requirements, and acceptance criteria. This EID tells you HOW and WHERE to implement. The PRD tells you WHAT and WHY.
This codebase is a TypeScript monorepo managed with pnpm workspaces. The structure is:
washbuddy/
├── artifacts/
│   ├── api-server/          # Express REST API (TypeScript)
│   ├── washbuddy-web/       # React SPA (Vite + shadcn/ui + TanStack Query + wouter)
│   └── mockup-sandbox/      # Ignore — not production code
├── lib/
│   ├── db/                  # Prisma ORM + PostgreSQL schema
│   │   └── prisma/schema.prisma  # DATABASE SCHEMA — source of truth for data model
│   ├── api-spec/            # OpenAPI 3.x specification (openapi.yaml)
│   ├── api-zod/             # Zod validation schemas (generated from OpenAPI)
│   └── api-client-react/    # Auto-generated React Query hooks (generated via Orval)
├── package.json             # Root workspace config
└── pnpm-workspace.yaml
Tech stack summary:
Backend: Express.js, TypeScript, Prisma ORM, PostgreSQL, express-session with pg-backed session store, pino logger
Frontend: React 18, Vite, wouter (routing), TanStack React Query (data fetching), shadcn/ui (55 Radix-based components), Tailwind CSS, react-hook-form + zod (forms), Leaflet/OpenStreetMap (maps)
API Contract: OpenAPI 3.x spec → Orval code generation → typed React Query hooks
Payments: Stripe Connect (models exist, integration partially scaffolded)
Auth: Session-based, HTTP-only cookies, scrypt password hashing
Critical conventions to follow:
All monetary values are integers in minor units (cents). A $125.00 price is stored as 12500.
All timestamps are UTC with @db.Timestamptz. Display in local timezone using the entity's timezone field.
All IDs are UUIDs (@db.Uuid).
Database column names use snake_case mapped from camelCase Prisma fields via @map().
API responses use camelCase (Prisma's default JS output).
Frontend API calls use the generated hooks from @workspace/api-client-react. When adding new endpoints, update the OpenAPI spec, regenerate the client, then use the new hooks.
All new UI components should use existing shadcn/ui primitives from artifacts/washbuddy-web/src/components/ui/.

IMPLEMENTATION PHASES
Work is organized into 5 phases, executed sequentially. Each phase builds on the previous one. Do not skip phases. Within each phase, tasks are numbered and should be completed in order unless explicitly marked as parallelizable.

PHASE 0: DATA INTEGRITY AND FOUNDATION FIXES (Week 1)
Goal: Fix critical bugs and data quality issues that make the current product unusable. After Phase 0, every existing page should load correctly and display accurate data.

TASK 0.1 — Fix Provider Duplication
Problem: 194 provider records exist with only 50 unique names (each duplicated ~4 times). This causes search results to show 3-4 identical cards per location and inflates the admin provider count.
Root cause: The seed script ran multiple times without deduplication.
Implementation:
File: lib/db/prisma/ — create new seed cleanup migration
Create a script at lib/db/src/cleanDuplicateProviders.ts that:
Queries all providers grouped by name
For each group of duplicates, keeps the one with the most complete data (has locations with services)
For duplicate providers being removed: reassigns any bookings, reviews, or provider memberships pointing to the duplicate to the canonical provider (or deletes if no real data exists)
Deletes the duplicate provider records
Logs every deletion and reassignment for audit
Before running, verify that ALL provider data is seed/demo data (confirmed by product owner). Since all data is seed, the simpler approach is acceptable: delete ALL existing providers, locations, services, operating windows, service compatibility records, and provider memberships, then re-seed with clean data (Task 0.2).
Use the DemoDataRegistry table to verify records are seed data before deletion.
Acceptance criteria: After execution, SELECT COUNT(*) FROM providers returns the exact number of unique intended providers (40-50 per Task 0.2), with zero duplicates.

TASK 0.2 — Replace Seed Data with Realistic Launch Corridor Data
Problem: Existing seed data is geographically scattered across Ontario and US locations with inconsistent quality. Per PRD Section 10.2, seed data must reflect the Toronto–Buffalo–Niagara–NYC launch corridor.
Implementation:
File: Create lib/db/src/seedLaunchCorridor.ts
Generate 45 realistic provider locations distributed as follows:
12 locations in the Greater Toronto Area (Etobicoke, Scarborough, Mississauga, Brampton, Markham)
5 locations in the Niagara/Hamilton corridor (St. Catharines, Hamilton, Niagara Falls ON)
3 locations in Buffalo/Western NY area
5 locations in upstate NY corridor (Syracuse, Albany, Hartford CT)
8 locations in NYC metro (Bronx, Brooklyn, Queens, New Jersey — Newark, Jersey City, Elizabeth)
5 locations in Long Island / Westchester
4 locations in Connecticut (Stamford, New Haven, Hartford)
3 locations in broader NJ / Philadelphia corridor
Each location must have:
A realistic business name (e.g., "Metro Fleet Wash — Bronx Terminal", "Lakeshore Bus Care — Mississauga", "Empire State Coach Wash — Albany")
A real-seeming address with valid lat/lng coordinates for that area
countryCode: "CA" for Canadian locations, "US" for American locations
currencyCode: "CAD" for CA locations, "USD" for US locations
Timezone: "America/Toronto" for Ontario, "America/New_York" for US East Coast
Operating hours via OperatingWindow records: vary across locations. Some 24/7 (24h facilities), some Mon-Sat 6AM-8PM, some Mon-Fri 7AM-6PM, some with lunch breaks. At least 5 locations should be 24/7.
capacityPerSlot: vary from 1 (small single-bay) to 4 (large commercial facility). Most locations should be 1-2.
2-4 services per location from this realistic menu:
Exterior Bus Wash: 20-45 min, $95-$175 USD / $120-$220 CAD
Full Detail Wash: 60-120 min, $275-$450 USD / $350-$550 CAD
Interior Clean: 30-60 min, $85-$150 USD / $110-$190 CAD
Undercarriage Wash: 15-30 min, $60-$95 USD / $75-$120 CAD
Quick Rinse: 10-15 min, $45-$75 USD / $55-$95 CAD
Engine Bay Clean: 30-45 min, $120-$200 USD / $150-$250 CAD
platformFeeMinor on each service: set to 0 for now (fee will be calculated dynamically per Task 1.1)
requiresConfirmation: mix of true and false. At least 30% of services should be instant-book (false).
isVisible: true for all
ServiceCompatibility records for each service: most exterior washes support all bus types up to STANDARD (480" length, 138" height). Some large facilities support DOUBLE_DECKER and ARTICULATED. MINIBUS and SHUTTLE services available at all locations.
Register all seed records in DemoDataRegistry with seedMode: "launch_corridor" and appropriate seedRegionCode.
Create 16 fleet organizations with realistic names matching the current fleet names in the system, each with 20-80 vehicles, properly assigned to depots.
Ensure the demo user accounts are properly linked:
demo.fleet@washbuddy.com (Patricia Nakamura) must have FLEET_ADMIN role in the "Northeast Bus Lines" fleet, which must have vehicles, drivers, and at least 5 booking records across various statuses
demo.driver@washbuddy.com (Alex Rivera) must have DRIVER role in the "Northeast Bus Lines" fleet with 3 vehicles assigned
driver1@example.com (Mike Johnson) must have DRIVER role in the same fleet with 2 vehicles assigned
owner@cleanbus-nyc.com (James Chen) must be PROVIDER_ADMIN for a provider with 2 NYC-area locations
admin@washbuddy.com remains PLATFORM_SUPER_ADMIN
Create 15-20 realistic booking records across various statuses (REQUESTED, PROVIDER_CONFIRMED, CHECKED_IN, IN_SERVICE, COMPLETED_PENDING_WINDOW, COMPLETED, SETTLED, CUSTOMER_CANCELLED) distributed across the last 30 days to populate dashboards and history views.
Create 10-15 review records with varied ratings (3-5 stars) and realistic comments attached to completed bookings.
Acceptance criteria: All search, dashboard, and detail pages show realistic, non-duplicated data. Fleet admin login shows a populated fleet dashboard. Provider login shows realistic booking activity. Admin dashboard shows accurate counts.

TASK 0.3 — Fix Search Results Not Loading on Page Load
Problem: The driver search page (/search) shows blank results until the user clicks the "Search" button. Results should load automatically on page load based on the user's current location.
File: artifacts/washbuddy-web/src/pages/customer/search.tsx
Fix: The search query should trigger automatically when the component mounts and geolocation is obtained. Review the TanStack Query hook that fetches locations — ensure enabled is not gated on a search-button click. The query should fire when the component has either: (a) obtained the user's geolocation, or (b) a fallback default location (center of launch corridor, approximately lat 42.5, lng -77.5 for the midpoint between Toronto and NYC).
If geolocation is denied or unavailable, default to showing all visible locations sorted alphabetically (no distance sort) with a banner suggesting the user enable location services for better results.
Acceptance criteria: Navigating to /search immediately shows location results without clicking any button. If geolocation is available, results are sorted by distance. If not, results show with a location-enable prompt.

TASK 0.4 — Fix Fleet Dashboard Routing
Problem: Logging in as demo.fleet@washbuddy.com (FLEET_ADMIN) redirects to /search instead of /fleet. The fleet pages exist in code (10 pages in artifacts/washbuddy-web/src/pages/fleet/) but are not accessible.
Root cause investigation: The RootRedirect component in App.tsx checks isFleetOperator(hasRole) and should redirect to /fleet. The RouteGuard for /fleet allows FLEET_ADMIN, DISPATCHER, MAINTENANCE_MANAGER, READ_ONLY_ANALYST, and DRIVER. The issue is likely that the fleet membership data is not properly linked in the database, so hasRole("FLEET_ADMIN") returns false even though the user should have that role.
File: artifacts/washbuddy-web/src/contexts/auth.tsx — Review the hasRole function implementation. Verify it checks against all role scopes (platform, fleet, provider).
File: artifacts/api-server/src/routes/auth.ts — Review the /auth/me endpoint response. Verify it returns fleet membership roles with the correct role string.
File: lib/db/ — Seed data — Verify that demo.fleet@washbuddy.com has a FleetMembership record with role: FLEET_ADMIN and isActive: true linked to a fleet. This is most likely the root cause — the membership record is missing or inactive.
Fix: Ensure the seed script (Task 0.2) creates the proper FleetMembership record. Then verify the auth flow returns the role correctly. The routing logic in App.tsx appears correct based on code review — the issue is data, not code.
Acceptance criteria: Logging in as demo.fleet@washbuddy.com redirects to /fleet and shows the Fleet Overview dashboard with real data (vehicles, recent bookings, wash requests).

TASK 0.5 — Fix Provider Settings Page (Read-Only Issue)
Problem: The provider settings page (/provider/settings) displays locations and services but provides no ability to edit them. Per PRD Section 4.1, providers must be able to manage their own locations and services.
File: artifacts/washbuddy-web/src/pages/provider/settings.tsx
Implementation:
Add "Edit" buttons next to each location and each service
Add an "Add Location" button at the top of the page
Add an "Add Service" button within each location's service list
Implement edit modals/forms using shadcn/ui Dialog components with react-hook-form
Location edit form fields: name, address (line 1, line 2, city, region, postal code, country), timezone, operating hours (day-by-day schedule builder), wash bay capacity per service
Service edit form fields: name, description, duration (minutes), price (in local currency — display as dollars, convert to minor units for API), vehicle compatibility (max length, max height, supported subtypes), booking mode (instant or request-and-confirm), visibility toggle
Wire forms to the existing API endpoints: PATCH /api/providers/:providerId/locations/:locationId, POST /api/providers/:providerId/locations, PATCH /api/providers/:providerId/locations/:locationId/services/:serviceId, POST /api/providers/:providerId/locations/:locationId/services, PUT /api/providers/:providerId/locations/:locationId/hours
Also fix: The "Max concurrent washes" field currently displays as empty. This should display the capacityPerSlot value from the service records and be editable.
Acceptance criteria: Provider admin can add new locations, edit existing location details (including operating hours and capacity), add new services, edit existing service details (including pricing, duration, compatibility, and booking mode), all through the settings UI. Changes persist after page reload.

TASK 0.6 — Fix Notification Bell
Problem: The notification bell icon shows a count badge (e.g., "5") but clicking it does nothing or shows an empty state.
File: artifacts/washbuddy-web/src/components/notification-bell.tsx
Implementation:
Clicking the bell should open a popover/dropdown panel (use shadcn/ui Popover or Sheet)
The panel fetches notifications from GET /api/notifications and displays them as a scrollable list
Each notification shows: subject (bold), body text, relative timestamp ("2 minutes ago", "yesterday"), and an action link
Unread notifications are visually distinguished (e.g., blue dot or highlighted background)
"Mark all as read" button at the top of the panel
Clicking a notification marks it as read and navigates to its actionUrl
The badge count shows only unread notifications (where readAt is null)
File: artifacts/api-server/src/routes/notifications.ts — Verify the GET endpoint returns notifications for the authenticated user. Add a PATCH /api/notifications/:id/read endpoint to mark individual notifications as read. Add a POST /api/notifications/mark-all-read endpoint.
Acceptance criteria: Bell shows accurate unread count. Clicking opens a panel with notification list. Notifications can be marked read individually and in bulk. Clicking a notification navigates to the relevant page.

PHASE 1: CORE BOOKING FLOW COMPLETION (Weeks 2-3)
Goal: Make the end-to-end booking flow work flawlessly for all participants. After Phase 1, a driver can search, book, show up, get washed, and the provider can process the booking through its full lifecycle.

TASK 1.1 — Implement Per-Booking Fee Calculation
Problem: The current fee calculation is per-service (each Service record has a static platformFeeMinor field set at creation time). Per PRD Section 3.1, the fee must be 15% of the combined service total for a vehicle booking, capped at $25 per vehicle booking (not per individual service).
Current behavior: Fee is stored on each Service record and added at booking creation time: totalPrice = service.basePriceMinor + service.platformFeeMinor.
Target behavior: Fee is calculated dynamically at booking creation based on the total service value for that vehicle visit. For the current single-service-per-booking model, the calculation is: fee = Math.min(Math.round(service.basePriceMinor * 0.15), 2500) (2500 = $25.00 in cents). The total shown to the customer is: allInPrice = service.basePriceMinor + fee.
Files to modify:
artifacts/api-server/src/routes/bookings.ts — In the POST /bookings handler, replace the static fee lookup:
// REMOVE THIS:
const totalPrice = service.basePriceMinor + service.platformFeeMinor;

// REPLACE WITH:
const FEE_RATE = 0.15;
const FEE_CAP_MINOR = 2500; // $25.00 cap per vehicle booking
const calculatedFee = Math.min(
  Math.round(service.basePriceMinor * FEE_RATE),
  FEE_CAP_MINOR
);
const totalPrice = service.basePriceMinor + calculatedFee;
Update the booking creation to use calculatedFee instead of service.platformFeeMinor:
platformFeeMinor: calculatedFee,
totalPriceMinor: totalPrice,
artifacts/api-server/src/lib/feeCalculator.ts — Create a new shared module:
typescript
export const PLATFORM_FEE_RATE = 0.15;
export const PLATFORM_FEE_CAP_MINOR = 2500;

export function calculatePlatformFee(serviceBasePriceMinor: number): number {
  return Math.min(
    Math.round(serviceBasePriceMinor * PLATFORM_FEE_RATE),
    PLATFORM_FEE_CAP_MINOR
  );
}

export function calculateAllInPrice(serviceBasePriceMinor: number): number {
  return serviceBasePriceMinor + calculatePlatformFee(serviceBasePriceMinor);
}
artifacts/api-server/src/routes/locations.ts — In the search and location detail endpoints, compute and return the all-in price for each service so the frontend displays the correct customer-facing price:
typescript
services: location.services.map(s => ({
  ...s,
  allInPriceMinor: calculateAllInPrice(s.basePriceMinor),
}))
artifacts/washbuddy-web/ — All frontend components that display prices to customers (search results, location detail, booking flow) must show allInPriceMinor instead of basePriceMinor. Provider-facing pages continue to show basePriceMinor (the provider's price).
Future multi-service bookings: When multi-service bookings per vehicle visit are implemented, the fee calculation must sum all service base prices first, then apply 15% to the total, then cap at $25. The calculatePlatformFee function should accept an array of prices: calculatePlatformFee(servicePrices: number[]): number.
Acceptance criteria: A $125 exterior wash shows as $144 to the customer ($125 + $18.75 fee). A $350 full detail shows as $375 ($350 + $25 capped fee). A $45 quick rinse shows as $52 ($45 + $6.75 fee). Provider dashboard shows $125 / $350 / $45 respectively. No line item breakdown of the fee is shown to the customer.

TASK 1.2 — Implement Operating Hours in Booking Flow
Problem: Operating hours exist in the schema (OperatingWindow model) but are not populated for seed locations and not enforced in the booking flow. Per PRD Sections 4.2 and 5.1, operating hours are mandatory for all locations and must be enforced.
Files to modify:
Seed data (Task 0.2): Ensure all seed locations have OperatingWindow records.
artifacts/api-server/src/routes/availability.ts — The GET /locations/:locationId/availability endpoint must filter available time slots to only include slots that fall within the location's operating windows. Currently this endpoint likely returns slots based on capacity only. Add operating-window filtering:
Fetch the location's OperatingWindow records
For each potential time slot, check if the slot's start and end times fall within an operating window for that day of the week (converting UTC slot times to the location's timezone)
Exclude slots that fall outside operating hours
artifacts/api-server/src/routes/locations.ts — The search endpoints should return operating hours for each location and support the "Open Now" filter:
In GET /locations/search and GET /locations/available-now, add operating window data to the response
For the "Open Now" filter: check current time (in location's timezone) against the location's operating windows for the current day of week
Return an isOpenNow boolean and nextOpenAt timestamp for each location
artifacts/washbuddy-web/src/pages/customer/search.tsx — Display operating hours status (OPEN/CLOSED badge) on each search result card. The "Open Now" filter chip should call the API with the appropriate filter parameter.
artifacts/washbuddy-web/src/pages/customer/location-detail.tsx — Display the full weekly operating hours schedule on the location detail page.
Acceptance criteria: Search results show accurate OPEN/CLOSED badges based on real-time operating hours. The "Open Now" filter correctly excludes closed locations. Booking flow only shows time slots within operating hours. Location detail page shows the complete weekly schedule.

TASK 1.3 — Implement Provider Response SLA Enforcement
Problem: The booking model has providerResponseDeadlineUtc but there is no automated system that expires bookings when the deadline passes or sends notifications to non-responsive providers.
Per PRD Section 3.3: Providers must respond within 5 minutes for bookings within 24 hours, 10 minutes for bookings 24+ hours out. Expired bookings must notify the customer with alternatives and warn the provider.
Implementation:
artifacts/api-server/src/routes/bookings.ts — The response deadline calculation already exists in the booking creation handler using responseSlaUnder1hMins and responseSlaFutureMins from the location. Update these values: the location seed data should set responseSlaUnder1hMins: 5 (for bookings within the next 24 hours — rename or reinterpret this field) and responseSlaFutureMins: 10 (for bookings 24+ hours out).
Create: artifacts/api-server/src/lib/slaEnforcer.ts — A background job that runs every 60 seconds:
Query all bookings with status REQUESTED where providerResponseDeadlineUtc < NOW()
For each expired booking: a. Transition status to EXPIRED b. Release the booking hold c. Create a booking status history record d. Send notification to customer (in-app + email): "Your booking request at [location] expired because the provider didn't respond. Here are nearby alternatives: [list 3 nearest available locations]" e. Send notification to provider (email): "You missed a booking request from [customer] for [service] at [location] on [date]. You lost $[amount] in potential revenue. Repeated failures to respond during your operating hours will impact your platform rating." f. Increment a provider response-miss counter (store in provider metadata or a new analytics table)
artifacts/api-server/src/index.ts — Start the SLA enforcer as a setInterval background task when the server starts. Use a PostgreSQL advisory lock to ensure only one server instance runs the enforcer if multiple instances exist.
Acceptance criteria: A booking in REQUESTED status that passes its response deadline automatically transitions to EXPIRED. The customer receives a notification with alternatives. The provider receives a warning email. No manual intervention required.

TASK 1.4 — Build Location Detail and Booking Flow
Problem: The location detail page (/location/:id) may be incomplete. The end-to-end flow from search → location detail → select service → select time → hold → book must work seamlessly.
File: artifacts/washbuddy-web/src/pages/customer/location-detail.tsx
Required elements on this page:
Location header: provider name, location name, address, OPEN/CLOSED badge, star rating, review count
Map showing the location pin
Operating hours (full weekly schedule, current day highlighted)
Services list: each service shows name, description, duration, all-in price (from allInPriceMinor), and an "Instant Book" or "Request" badge based on requiresConfirmation
For each service: a "Book Now" button that opens the booking flow
Reviews section at the bottom (use existing location-reviews.tsx component)
Booking flow (inline or modal):
User selects a service → display available time slots for the next 7 days (fetched from GET /api/locations/:locationId/availability?serviceId=X&startDate=Y&endDate=Z)
User selects a time slot → call POST /api/bookings/hold to create a hold (10-minute TTL)
Display hold confirmation with countdown timer showing hold expiry
User selects a vehicle (dropdown of their assigned vehicles, fetched from GET /api/fleet/driver/vehicles or GET /api/vehicles)
User confirms booking → call POST /api/bookings with holdId, vehicleId, and idempotencyKey
Display booking confirmation with details: service, location, date/time, vehicle, total price
If instant book: show "Confirmed!" immediately. If request: show "Request Submitted — waiting for provider confirmation"
Vehicle compatibility check: Before showing the "Book Now" button, check if the user's assigned vehicle is compatible with the service (compare vehicle dimensions against ServiceCompatibility rules). If incompatible, show the service grayed out with a note: "This service cannot accommodate your vehicle (too large/tall)."
Acceptance criteria: Full booking flow works from search result click through to confirmed booking. Vehicle compatibility is enforced. Hold countdown is visible. Both instant and request booking modes work correctly.

TASK 1.5 — Build Provider Booking Management
Problem: The provider dashboard exists but needs to support the full booking lifecycle per PRD Section 4.4.
File: artifacts/washbuddy-web/src/pages/provider/dashboard.tsx
Kanban board columns:
Action Required — Bookings in REQUESTED status. Each card shows: service name, customer name, vehicle info, scheduled date/time, all-in price, response deadline countdown timer, and two buttons: "Confirm" (green) and "Decline" (red with reason selection)
Upcoming Today — Bookings in PROVIDER_CONFIRMED status scheduled for today. Each card shows: service name, customer name, vehicle info, scheduled time, and a "Check In" button
In Progress — Bookings in CHECKED_IN or IN_SERVICE status. CHECKED_IN cards show a "Start Service" button. IN_SERVICE cards show a "Complete" button
Action implementations:
Confirm: POST /api/bookings/:id/confirm
Decline: POST /api/bookings/:id/decline with reasonCode (provider selects from: FULLY_BOOKED, EQUIPMENT_DOWN, VEHICLE_INCOMPATIBLE, WEATHER, OTHER)
Check In: POST /api/bookings/:id/checkin
Start Service: POST /api/bookings/:id/start-service
Complete: POST /api/bookings/:id/complete
Real-time updates: Use polling (TanStack Query's refetchInterval set to 30 seconds) to keep the dashboard current. New booking requests should appear without page refresh. Consider adding a more prominent notification sound or visual flash when a new request arrives in the Action Required column.
Mobile responsiveness: On mobile viewports, the Kanban board collapses to a single column with tabs for each status group (Action Required, Upcoming, In Progress).
Acceptance criteria: Provider can process a booking through the complete lifecycle: Confirm → Check In → Start Service → Complete. Decline with reason works. Dashboard updates without full page refresh. Countdown timers show remaining SLA time accurately.

TASK 1.6 — Implement Customer Booking Management
File: artifacts/washbuddy-web/src/pages/customer/my-bookings.tsx
Problem: Currently shows "No bookings yet" even when bookings exist. This is likely a data issue that Task 0.2 will fix, but the page also needs feature completion.
Required features:
Tab navigation: Upcoming, In Progress, Completed, Cancelled
Each booking card shows: service name, provider/location name, scheduled date/time, status badge (color-coded), vehicle info, total price paid
Clicking a booking navigates to /bookings/:id (the shared booking detail page)
Upcoming bookings show a "Cancel" button (only if booking is in a cancellable status per the state machine: REQUESTED, HELD, PROVIDER_CONFIRMED, LATE)
Completed bookings show a "Leave Review" button if no review exists yet for that booking
Empty states with helpful messaging: "No upcoming bookings — Find a Wash" with a link to search
Acceptance criteria: All booking tabs show correct bookings filtered by status. Cancel works for eligible bookings. Review prompt appears for completed bookings. Navigation to booking detail works.

PHASE 2: FLEET OPERATOR EXPERIENCE (Weeks 3-4)
Goal: Build the complete fleet operator dashboard so fleet admins can manage their fleet's washing operations.

TASK 2.1 — Fleet Overview Dashboard
File: artifacts/washbuddy-web/src/pages/fleet/overview.tsx
API endpoint: GET /api/fleet/overview (already exists in artifacts/api-server/src/routes/fleet.ts)
Required dashboard elements:
Summary stats cards: Total Vehicles (active count), Washes This Month (booking count for current month), Total Spend This Month (sum of totalPriceMinor for current month, formatted in fleet currency), Vehicles Due for Wash (count where nextWashDueAtUtc < NOW() or lastWashAtUtc is null/old)
Recent bookings table: last 10 bookings across all fleet vehicles, showing vehicle unit number, service, provider/location, date, status, price
Pending wash requests: list of wash requests submitted by drivers awaiting approval
Quick action buttons: "Book a Wash" (navigates to search with fleet context), "New Wash Request" (navigates to /fleet/requests/new)
Acceptance criteria: Fleet overview shows accurate aggregate data. Stats are calculated from real booking data. Navigation to sub-pages works.

TASK 2.2 — Fleet Vehicle Management
File: artifacts/washbuddy-web/src/pages/fleet/vehicles.tsx
API endpoint: GET /api/fleet/vehicles (exists)
Required features:
Vehicle list table: unit number, type/subtype, dimensions (displayed in feet/inches), assigned driver(s), last wash date, next wash due, status (active/inactive)
Search/filter: by unit number, vehicle type, depot, wash status (overdue, due soon, current)
"Add Vehicle" button (FLEET_ADMIN only) opening a form with fields per PRD Section 3.6: unit number, category (BUS), subtype (dropdown), length (inches), height (inches), has restroom (checkbox), license plate (optional), depot assignment (optional dropdown)
Edit vehicle (click row or edit button) — same form, pre-populated
Assign/unassign drivers to vehicles via FleetDriverAssignment model
Bulk actions: not required for launch
API endpoints needed:
POST /api/fleet/vehicles — create vehicle (wire to existing POST /api/vehicles but ensure fleet context)
PATCH /api/fleet/vehicles/:id — edit vehicle
POST /api/fleet/vehicles/:id/assign-driver — create driver assignment
DELETE /api/fleet/vehicles/:id/assign-driver/:assignmentId — remove driver assignment
If these endpoints don't exist in the fleet route, add them.
Acceptance criteria: Fleet admin can view all fleet vehicles, add new vehicles, edit vehicle details, and assign/unassign drivers. Vehicle dimensions are validated (positive integers). Vehicle type dropdown matches the enum in the schema.

TASK 2.3 — Fleet Wash Request Workflow
Files:
artifacts/washbuddy-web/src/pages/fleet/wash-requests.tsx (list)
artifacts/washbuddy-web/src/pages/fleet/new-request.tsx (create)
artifacts/washbuddy-web/src/pages/fleet/request-detail.tsx (detail/approve)
This implements the fleet approval workflow per PRD Section 3.5.
Wash request list page:
Tab navigation: Pending Approval, Approved, Declined, All
Each request shows: vehicle unit number, driver name, requested provider/location, requested service, requested date/time, status, submitted date
FLEET_ADMIN and DISPATCHER can approve or decline from the list or detail view
New request page (driver-initiated):
Vehicle selector (driver's assigned vehicles)
Provider/location search (inline search or link to main search)
Service selection
Preferred date/time window
Notes field
Submit creates a WashRequest record
Request detail page:
Full request details
Approval actions (FLEET_ADMIN/DISPATCHER): Approve (optionally modify provider/time), Decline (with reason)
Approval automatically creates a booking at the specified provider (transitions WashRequest status to CONVERTED_TO_BOOKING and creates a Booking)
Thread/messaging section for communication between driver and fleet manager about the request
Acceptance criteria: Driver can submit a wash request. Fleet admin sees it in the pending queue. Fleet admin can approve (creating a booking) or decline with a reason. Request status updates correctly through the lifecycle.

TASK 2.4 — Fleet Policy Configuration
File: artifacts/washbuddy-web/src/pages/fleet/settings.tsx
Required policy settings (per PRD Section 3.4):
Approved Provider List:
Toggle: "Restrict drivers to approved providers only" (on/off)
When enabled: searchable provider list with checkboxes to select approved providers
Save updates requestPolicyJson on the fleet record
Per-Wash Spending Limit:
Toggle: "Set maximum per-service spending limit" (on/off)
When enabled: numeric input for maximum amount (in fleet currency)
Save updates requestPolicyJson
Wash Frequency Limit:
Toggle: "Limit wash frequency per vehicle" (on/off)
When enabled: numeric inputs for "Maximum [X] washes per vehicle every [Y] days"
Save updates requestPolicyJson
Policy enforcement in booking flow:
artifacts/api-server/src/routes/bookings.ts — Before creating a booking hold, check fleet policies:
Load the booking customer's fleet membership
Load the fleet's requestPolicyJson
Check approved provider list: if enabled, verify the provider is in the list
Check spending limit: if enabled, verify the service price does not exceed the limit
Check frequency limit: if enabled, count recent bookings for the vehicle within the time window
If any policy is violated, return a 403 with errorCode: "POLICY_VIOLATION" and a message specifying which policy was violated
artifacts/washbuddy-web/src/pages/customer/search.tsx — When the logged-in user is a fleet driver with active policies, visually indicate restricted providers (grayed out or hidden) and show a note explaining the fleet restriction.
Acceptance criteria: Fleet admin can configure all three policy types. Policies are enforced when drivers attempt to book. Policy violation returns a clear, specific error message. Search results reflect policy restrictions for drivers.

TASK 2.5 — Fleet Reports
File: artifacts/washbuddy-web/src/pages/fleet/reports.tsx
Required reports:
Wash Activity Report: Table of all fleet bookings within a date range, with columns: date, vehicle, driver, provider/location, service, status, cost. Filterable by vehicle, driver, provider, status, date range. Sortable by any column. Summary row showing total spend.
Vehicle Wash Compliance: List of all vehicles showing: unit number, type, last wash date, next wash due, status (overdue/due soon/current). Highlight overdue vehicles in red.
Spending Summary: Aggregate spend by provider, by vehicle, and by month. Simple bar charts using the existing Chart component from shadcn/ui.
API endpoint: Create GET /api/fleet/reports with query parameters for report type, date range, and filters. If a reports endpoint doesn't exist in the fleet route, add it.
Acceptance criteria: All three report views show accurate data. Date range filtering works. Data can be used to understand fleet washing patterns and spending.

PHASE 3: ADMIN DASHBOARD AND PROVIDER ENHANCEMENTS (Weeks 5-6)
Goal: Complete the admin dashboard for platform management and fill remaining provider gaps.

TASK 3.1 — Admin Dashboard Overhaul
File: artifacts/washbuddy-web/src/pages/admin/dashboard.tsx
Problem: Current admin dashboard shows basic stats but is missing key operational data and has stale/duplicate provider counts.
Required elements:
Stats row: Total Bookings (all-time), Active Bookings Today, Total Providers (unique, active), Total Revenue (platform fees collected, sum of platformFeeMinor across all SETTLED/COMPLETED bookings)
Recent bookings panel: Last 20 bookings with status, provider, customer, date, amount. Click to navigate to booking detail.
Provider status panel: Counts by status — Active, Pending Approval, Suspended, Pending Stripe Connect. Click each count to filter the providers list.
Alerts panel: Bookings approaching SLA deadline, providers with low response rates, pending provider approvals needing review
Revenue chart: Platform fees collected over the last 30 days (daily bar chart)
Acceptance criteria: Dashboard shows accurate, non-duplicated counts. All clickable elements navigate correctly. Stats calculate from actual booking/provider data.


TASK 3.2 — Admin Provider Management 
File: artifacts/washbuddy-web/src/pages/admin/providers.tsx
Required enhancements:
Fix the provider count (currently shows 146/194 due to duplicates — resolved by Task 0.1/0.2)
Provider list table with columns: name, status (ACTIVE / PENDING APPROVAL / SUSPENDED), Stripe status (PAYOUTS ACTIVE / PENDING CONNECT / NOT STARTED), location count, total bookings, average rating, response rate percentage
Search and filter: by name, by status, by Stripe status
Click a provider row to open a provider detail view showing: all locations with their services, operating hours, and capacity; provider membership (admin/staff users); booking history; review summary; response rate metrics
Action buttons: Approve (for pending providers), Suspend, Reactivate, Initiate Stripe Connect onboarding link
"Contact info" column must display the email of the PROVIDER_ADMIN user associated with the provider (join through ProviderMembership → User). The current "No contact email" display is because the provider record itself has no email field — the email lives on the user record.
API changes: The GET /api/providers endpoint should include a computed contactEmail field (the email of the provider's PROVIDER_ADMIN member) and aggregate metrics (booking count, average rating, response rate). Add these as optional includes via query parameter to avoid performance impact on other callers.
Acceptance criteria: Provider list shows accurate data with no duplicates. Contact email displays correctly. All status filters work. Provider detail view shows complete provider information. Approve/suspend actions work.

TASK 3.3 — Admin Booking Management
File: artifacts/washbuddy-web/src/pages/admin/bookings.tsx
Required enhancements:
Booking list with all status filter tabs (already partially implemented)
Add date range filter (date picker for start and end date)
Add provider/location filter dropdown
Add customer/fleet filter search
Each booking row shows: booking ID (truncated), service name, provider/location, customer name, fleet name, vehicle, scheduled date/time, status badge (color-coded), total amount
Click a row to navigate to the shared booking detail page (/bookings/:id)
Admin-specific actions on booking detail: force-cancel (for stuck bookings), override status (with audit trail), refund initiation
Acceptance criteria: All bookings are visible with accurate data. All filters work correctly. Admin can navigate to any booking detail and take administrative actions.

TASK 3.4 — Provider Registration Flow
Problem: The current registration page (/register) creates a generic user account with no role selection. Per PRD Section 4.1, providers need a registration path that creates a provider account and guides them through location/service setup.
File: artifacts/washbuddy-web/src/pages/auth/register.tsx
Implementation:
Add an account type selector to the registration form: "I'm looking for wash services" (creates a driver/customer account) vs. "I'm a wash provider" (creates a provider account)
For customer registration: current flow (First Name, Last Name, Email, Phone, Password) creates a user. After registration, redirect to /search.
For provider registration: same user fields plus Business Name. After registration: a. Create a Provider record with the business name b. Create a ProviderMembership linking the user to the provider with role PROVIDER_ADMIN c. Redirect to /provider/onboarding — a new multi-step onboarding wizard
Create: artifacts/washbuddy-web/src/pages/provider/onboarding.tsx
Multi-step onboarding wizard:
Step 1: Add your first location (address, timezone, operating hours, capacity)
Step 2: Add services at that location (name, price, duration, vehicle compatibility, booking mode)
Step 3: Review summary — "Your listing is pending review. A WashBuddy admin will review and approve your listing within 24 hours."
Step 4: Stripe Connect prompt — "Set up payments to receive payouts" (link to Stripe Connect onboarding flow, can be skipped and completed later)
The provider's locations and services should have isVisible: false until admin approval.
API changes:
artifacts/api-server/src/routes/auth.ts — Modify the POST /auth/register endpoint to accept an optional accountType field ("customer" or "provider") and businessName (required when accountType is "provider"). When accountType is "provider":
Create the User record
Create a Provider record with isActive: false (pending approval)
Create a ProviderMembership with role PROVIDER_ADMIN
Return the user with provider context in the auth response
Acceptance criteria: New providers can register, add their first location with services, and land on a "pending review" state. Admins see the new provider in the pending approval queue. Upon admin approval, the provider's listings become visible in search.

TASK 3.5 — Review System Completion
Files:
artifacts/washbuddy-web/src/components/review-form.tsx (exists)
artifacts/washbuddy-web/src/components/location-reviews.tsx (exists)
artifacts/washbuddy-web/src/pages/provider/reviews.tsx
artifacts/washbuddy-web/src/pages/admin/reviews.tsx
Required work:
Customer review submission: After a booking reaches COMPLETED status, the customer should see a "Leave a Review" prompt in their booking detail and My Bookings page. The review form (star rating + optional comment) submits to POST /api/reviews (create this endpoint if it doesn't exist). Reviews are tied to a booking and a location.
Location reviews display: The location detail page should show all non-hidden reviews with star ratings, comments, author name, date, and provider reply (if any). Show average rating and total count at the top.
Provider review management: The provider reviews page (/provider/reviews) should list all reviews for the provider's locations. Provider admins can submit a reply to any review via PATCH /api/reviews/:id (add providerReply and providerReplyAt fields).
Admin review moderation: The admin reviews page (/admin/reviews) should list all reviews with ability to filter by flagged/hidden status. Admins can hide a review with a reason. Add a "Show Flagged" toggle that is already present but non-functional.
API endpoints needed (add to artifacts/api-server/src/routes/reviews.ts):
POST /api/reviews — create a review (authenticated customer, must have a completed booking at the location)
GET /api/reviews?locationId=X — get reviews for a location (public)
GET /api/reviews?providerId=X — get reviews for all provider locations (provider access)
GET /api/reviews — get all reviews (admin access)
PATCH /api/reviews/:id — update review (author can edit, provider can add reply, admin can hide)
Acceptance criteria: Customers can leave reviews after completed bookings. Reviews display on location detail pages. Providers can reply to reviews. Admins can moderate reviews.

PHASE 4: NOTIFICATIONS, EMAIL, AND POLISH (Weeks 7-8)
Goal: Implement the notification system that keeps the marketplace running, and polish the user experience for launch readiness.

TASK 4.1 — Email Notification Service
Create: artifacts/api-server/src/lib/emailService.ts
Implement an email sending service. For launch, use a transactional email provider (recommended: SendGrid, Resend, or AWS SES). The implementation should:
Define an EmailService interface with a send(to: string, subject: string, htmlBody: string, textBody: string) method
Implement the interface using the chosen email provider's SDK
Use environment variables for API keys and sender configuration: EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME
Include a development mode that logs emails to console instead of sending (when NODE_ENV !== "production")
Email templates: Create HTML email templates for each notification type. Templates should be clean, mobile-friendly, and branded with WashBuddy colors/logo. Store templates as functions that accept data parameters and return HTML strings. Required templates:
bookingRequested (to provider): "New booking request from [customer] for [service] at [location] on [date]. Respond within [X] minutes."
bookingConfirmed (to customer): "Your wash at [location] is confirmed for [date] at [time]. Address: [address]."
bookingDeclined (to customer): "Your booking at [location] was declined. [reason]. Here are alternatives: [list]."
bookingExpired (to customer): "[Provider] didn't respond in time. Here are alternatives: [list]."
bookingReminder (to customer): "Reminder: Your wash at [location] is scheduled for [time] today."
bookingCompleted (to customer): "Your wash is complete! Leave a review: [link]."
bookingCancelled (to both parties): "[Party] cancelled the booking for [service] at [location] on [date]."
providerMissedSLA (to provider): "You missed a booking request and lost $[amount]. Respond faster to maintain your rating."
providerApproved (to provider): "Your WashBuddy listing has been approved! You're now visible to customers."
washRequestSubmitted (to fleet admin): "[Driver] submitted a wash request for [vehicle] at [provider]."

TASK 4.2 — Notification Trigger Integration
Problem: The createNotification and createBulkNotifications functions exist in artifacts/api-server/src/lib/notifications.ts but are never called from the booking flow.
Implementation: Add notification triggers at each booking lifecycle transition point. Modify the following files:
artifacts/api-server/src/routes/bookings.ts — After each successful status transition, call the appropriate notification and email functions:
POST /bookings (booking created):
In-app + email notification to provider: new booking request
In-app notification to customer: booking submitted, awaiting confirmation (for request mode)
POST /bookings/:id/confirm:
In-app + email notification to customer: booking confirmed
POST /bookings/:id/decline:
In-app + email notification to customer: booking declined with alternatives
POST /bookings/:id/cancel:
In-app + email notification to the other party (if customer cancels, notify provider; if provider cancels, notify customer)
POST /bookings/:id/complete:
In-app + email notification to customer: service completed, leave a review
artifacts/api-server/src/lib/slaEnforcer.ts (from Task 1.3):
Already handles expired booking notifications
artifacts/api-server/src/routes/fleet.ts — When a wash request is created, notify the fleet admin(s). When a wash request is approved/declined, notify the driver.
For each notification, set the actionUrl field to the relevant deep link (e.g., /bookings/[id] for booking notifications, /fleet/requests/[id] for wash request notifications).
Acceptance criteria: Every booking status change triggers appropriate in-app and email notifications to the relevant parties. Notifications appear in the notification bell. Emails are sent (or logged in development mode).

TASK 4.3 — Booking Reminder System
Create: artifacts/api-server/src/lib/reminderScheduler.ts
A background job that runs every 15 minutes:
Query confirmed bookings scheduled within the next 1-2 hours that haven't had a reminder sent
Send reminder notifications (in-app + email) to the customer
Mark the booking as reminded (add a reminderSentAt field to the booking model, or track in a separate table)
For bookings scheduled for the next day: send a reminder at 8 AM in the location's timezone.
Acceptance criteria: Customers receive reminders before their scheduled wash — 1 hour before for same-day bookings, morning-of for next-day bookings. No duplicate reminders.

TASK 4.4 — UI Polish and Responsiveness
Cross-cutting task applying to all pages.
Consistent loading states: Every page that fetches data should show a skeleton loader (use shadcn/ui Skeleton component) during loading, not a blank page or a spinner. The provider dashboard's progressive column loading (where only the first column renders initially) should show skeleton cards in the other columns until data loads.
Consistent empty states: Every list/table that can be empty should show a helpful empty state with an icon, a message, and a call-to-action. Use the existing Empty component from shadcn/ui. Examples: "No bookings yet — Find a Wash", "No vehicles added — Add your first vehicle", "No reviews yet — reviews will appear after your first completed wash."
Error states: API errors should show a toast notification (use existing sonner.tsx / toast.tsx) with a human-readable message and a retry option where applicable. Never show raw error codes or stack traces to users.
Mobile responsiveness audit: Test every page at 375px width (iPhone SE) and 768px width (iPad). Fix any overflow, truncation, or layout issues. Specific known issues:
Admin dashboard sidebar: already handles mobile via hamburger menu — verify it works
Provider Kanban: must collapse to single-column tabs on mobile
Search results: cards should stack vertically on mobile with full-width layout
Fleet tables: use horizontal scroll on mobile, or collapse to card layout
Booking forms: all inputs must be full-width on mobile with large touch targets
Login page improvements:
Remove the pre-filled email from previous sessions (currently retains admin@washbuddy.com after signing out)
Clear the password field on sign-out
Add visible error messaging for failed login attempts (wrong password, user not found)
Visual role differentiation: Each role's navigation sidebar should have a subtle visual distinction:
Admin: use a neutral/dark theme accent
Provider: use a green or teal accent
Fleet: use a blue accent
Driver/Customer: use the default primary accent This helps users immediately know which context they're in, especially when switching between accounts during testing.
Acceptance criteria: No blank loading states. No unhelpful empty states. No raw error messages. All pages functional at 375px and 768px widths. Login/logout flow is clean.

PHASE 5: LAUNCH PREPARATION (Weeks 9-10)
Goal: Final integration testing, performance optimization, and production deployment readiness.

TASK 5.1 — End-to-End Flow Verification
Not a code task — this is a testing checklist. Every flow must be verified working:
Driver flow:
Log in as driver → lands on search page
Search shows nearby locations with correct prices (all-in), OPEN/CLOSED badges, and Instant/Request badges
Click a location → see detail with operating hours, services, reviews
Select a service → see available time slots (only within operating hours, only slots with capacity)
Select a time → hold is created (10-min countdown visible)
Select vehicle → book → booking created
If instant: status is PROVIDER_CONFIRMED. If request: status is REQUESTED
My Bookings shows the new booking
Notification bell shows booking status updates
After completion, can leave a review
Fleet operator flow:
Log in as fleet admin → lands on fleet overview dashboard
Overview shows stats, recent bookings, pending requests
Vehicles page shows fleet vehicles with wash status
Can add a new vehicle
Can assign a driver to a vehicle
Can book a wash on behalf of a vehicle
Settings page shows policy configuration
Can set approved provider list, spending limit, frequency limit
Driver login respects fleet policies (blocked from non-approved providers, over-limit services)
Wash request submitted by driver appears in fleet admin's queue
Fleet admin can approve → booking created at provider
Reports show accurate wash activity data
Provider flow:
Log in as provider admin → lands on provider dashboard
Dashboard shows Kanban columns with correct bookings
New booking request arrives (from driver booking) → appears in Action Required column
Confirm → moves to Upcoming Today (or next scheduled day)
Check In → Start Service → Complete → booking finishes
Decline → customer notified with alternatives
No response within SLA → booking expires automatically, provider receives warning email
Settings page allows editing locations, services, hours, capacity
Reviews page shows customer reviews, can submit reply
New provider registration → onboarding wizard → pending approval
Admin flow:
Log in as admin → lands on admin dashboard with accurate stats
Provider list shows all providers with correct counts, statuses, contact emails
Can approve a pending provider
Booking list shows all bookings with functional filters
Review moderation works (hide/unhide reviews)
Cross-border flow:
A US fleet driver books a wash at a Canadian provider
Driver sees the price in USD (converted from provider's CAD price)
Provider sees the price in CAD (their original price)
Booking record stores both the original currency and the fleet currency amounts

TASK 5.2 — Performance Optimization
Search query optimization: The location search query should use PostGIS or a distance calculation index. Currently the GET /locations/search endpoint likely performs distance calculation in application code. For 45 seed locations this is fine, but add a database-level distance filter using ST_DWithin or a bounding-box pre-filter for when the provider count grows. At minimum, add a WHERE clause limiting results to locations within the search radius before calculating exact distances.
API response optimization: Add select clauses to all Prisma queries to avoid fetching unnecessary fields. The current booking list query includes full location, service, customer, and vehicle objects — ensure only the fields needed for display are selected.
Frontend bundle optimization: Verify that Vite's code splitting is working correctly — each page route should be a separate chunk loaded on demand. The 55 shadcn/ui components should be tree-shaken so only used components are in the bundle.
Image optimization: Any provider/location images should use lazy loading and appropriate sizing. For seed data, use placeholder images from a CDN rather than local files.

TASK 5.3 — Security Hardening
Rate limiting: Add rate limiting to authentication endpoints (/auth/login, /auth/register) — maximum 10 attempts per IP per 5 minutes. Use express-rate-limit package.
Input validation: Ensure all API endpoints validate input using Zod schemas from @workspace/api-zod. The booking creation flow already validates, but audit all other endpoints (provider creation, location creation, service creation, vehicle creation, review submission).
CSRF protection: The session-based auth is vulnerable to CSRF. Add CSRF token validation for all state-changing requests (POST, PATCH, PUT, DELETE). Use csurf middleware or implement double-submit cookie pattern.
Environment variables: Audit all hardcoded secrets. The session secret has a development fallback (wash-buddy-dev-secret) which is correct, but ensure SESSION_SECRET is set in production. Ensure DATABASE_URL and Stripe keys are never committed.
Password requirements: Add password strength validation on registration — minimum 8 characters, at least one uppercase, one lowercase, one number.

TASK 5.4 — Production Deployment Configuration
Environment configuration: Create a .env.example file documenting all required environment variables:
  DATABASE_URL=postgresql://...
   SESSION_SECRET=<random-64-char-string>
   NODE_ENV=production
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   EMAIL_PROVIDER=sendgrid
   EMAIL_API_KEY=SG...
   EMAIL_FROM_ADDRESS=bookings@washbuddy.com
   EMAIL_FROM_NAME=WashBuddy
Database migrations: Ensure all schema changes are captured in Prisma migration files. Run prisma migrate deploy in production (not prisma db push).
Health check endpoint: The GET /api/health endpoint should verify database connectivity and return service status. This is used by monitoring and load balancers.
Logging: Pino logger is already configured. Ensure all API errors are logged with request context (user ID, endpoint, error details). In production, logs should be structured JSON for log aggregation services.

TASK 5.5 — Stripe Connect Integration
Note: This task requires Stripe API keys and is dependent on business account setup. Implementation can proceed with test-mode keys.
Files to create/modify:
Create: artifacts/api-server/src/lib/stripeService.ts
Initialize Stripe SDK with the secret key from environment
Implement provider onboarding: create a Stripe Connect account link for the provider, handle the OAuth return, store the connected account ID on the Provider record (externalPayoutAcctId field)
Implement payment authorization: when a booking is created, create a PaymentIntent with capture_method: manual and transfer_data pointing to the provider's connected account
Implement payment capture: when a booking reaches COMPLETED (after dispute window), capture the PaymentIntent
Implement refunds: for cancelled bookings, void the authorization or create a refund
Implement webhook handler: POST /api/stripe/webhooks to process Stripe events (payment succeeded, payment failed, payout completed, etc.)
artifacts/api-server/src/routes/bookings.ts — Integrate Stripe calls at the appropriate lifecycle points (authorization at booking creation, capture at completion, void at cancellation).
Create: artifacts/api-server/src/routes/stripe.ts — Stripe webhook endpoint and provider onboarding endpoints.
Cross-border payments: Use Stripe Connect's cross-border transfer capability. When a US fleet books a Canadian provider: the PaymentIntent is in USD (fleet's currency), and the transfer to the connected account is in CAD (provider's currency). Stripe handles the FX conversion automatically when the connected account's default currency differs from the payment currency.
Acceptance criteria: Providers can complete Stripe Connect onboarding. Payments are authorized at booking time and captured after completion. Provider payouts are processed. Cancellation refunds work correctly. Cross-border USD/CAD payments function.

SCHEMA CHANGES SUMMARY
The following modifications to lib/db/prisma/schema.prisma are required across the implementation phases. Apply these as Prisma migrations.
1. Add registration type tracking to User model:
prisma
model User {
  // ... existing fields ...
  accountType    String?  @map("account_type")  // "customer" | "provider"
}
2. Add operating hours data validation (no schema change needed — OperatingWindow model already exists and is correct)
3. Add reminder tracking to Booking model:
prisma
model Booking {
  // ... existing fields ...
  reminderSentAt    DateTime?  @map("reminder_sent_at")  @db.Timestamptz
}
4. Add provider response metrics (new model):
prisma
model ProviderResponseMetric {
  id                String   @id @default(uuid()) @db.Uuid
  providerId        String   @map("provider_id") @db.Uuid
  locationId        String   @map("location_id") @db.Uuid
  periodStart       DateTime @map("period_start") @db.Timestamptz
  periodEnd         DateTime @map("period_end") @db.Timestamptz
  totalRequests     Int      @default(0) @map("total_requests")
  respondedInSla    Int      @default(0) @map("responded_in_sla")
  missedSla         Int      @default(0) @map("missed_sla")
  avgResponseSecs   Int?     @map("avg_response_secs")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz

  provider  Provider @relation(fields: [providerId], references: [id])
  location  Location @relation(fields: [locationId], references: [id])

  @@unique([providerId, locationId, periodStart])
  @@map("provider_response_metrics")
}
Add the corresponding relation fields to Provider and Location models.
5. Add Provider model fields for approval workflow:
prisma
model Provider {
  // ... existing fields ...
  approvalStatus    String   @default("PENDING") @map("approval_status")  // PENDING, APPROVED, REJECTED, SUSPENDED
  approvedAt        DateTime? @map("approved_at") @db.Timestamptz
  approvedBy        String?   @map("approved_by") @db.Uuid
  rejectionReason   String?   @map("rejection_reason")
}
6. No changes needed for fee calculation — the fee is calculated dynamically at booking time, not stored on the Service model. The existing platformFeeMinor field on Service can be deprecated (set to 0 in seed data) and the dynamically calculated fee continues to be stored on each Booking record.

FILE CHANGE INDEX
Quick reference of every file that needs to be created or modified, organized by location:
New files to create:
lib/db/src/cleanDuplicateProviders.ts (Task 0.1)
lib/db/src/seedLaunchCorridor.ts (Task 0.2)
artifacts/api-server/src/lib/feeCalculator.ts (Task 1.1)
artifacts/api-server/src/lib/slaEnforcer.ts (Task 1.3)
artifacts/api-server/src/lib/emailService.ts (Task 4.1)
artifacts/api-server/src/lib/reminderScheduler.ts (Task 4.3)
artifacts/api-server/src/lib/stripeService.ts (Task 5.5)
artifacts/api-server/src/routes/stripe.ts (Task 5.5)
artifacts/washbuddy-web/src/pages/provider/onboarding.tsx (Task 3.4)
.env.example (Task 5.4)
Existing files to modify:
lib/db/prisma/schema.prisma (Schema Changes Summary)
artifacts/api-server/src/routes/bookings.ts (Tasks 1.1, 1.3, 2.4, 4.2)
artifacts/api-server/src/routes/locations.ts (Tasks 1.1, 1.2)
artifacts/api-server/src/routes/availability.ts (Task 1.2)
artifacts/api-server/src/routes/auth.ts (Task 3.4)
artifacts/api-server/src/routes/reviews.ts (Task 3.5)
artifacts/api-server/src/routes/notifications.ts (Task 0.6)
artifacts/api-server/src/routes/fleet.ts (Tasks 2.2, 2.3, 2.5, 4.2)
artifacts/api-server/src/routes/providers.ts (Task 3.2)
artifacts/api-server/src/routes/index.ts (add stripe route, Task 5.5)
artifacts/api-server/src/index.ts (start background jobs, Tasks 1.3, 4.3)
artifacts/api-server/src/lib/notifications.ts (Task 4.2)
artifacts/washbuddy-web/src/pages/customer/search.tsx (Tasks 0.3, 1.1, 1.2, 2.4)
artifacts/washbuddy-web/src/pages/customer/location-detail.tsx (Tasks 1.2, 1.4)
artifacts/washbuddy-web/src/pages/customer/my-bookings.tsx (Task 1.6)
artifacts/washbuddy-web/src/pages/customer/my-vehicles.tsx (Task 4.4)
artifacts/washbuddy-web/src/pages/provider/dashboard.tsx (Task 1.5)
artifacts/washbuddy-web/src/pages/provider/settings.tsx (Task 0.5)
artifacts/washbuddy-web/src/pages/provider/reviews.tsx (Task 3.5)
artifacts/washbuddy-web/src/pages/fleet/overview.tsx (Task 2.1)
artifacts/washbuddy-web/src/pages/fleet/vehicles.tsx (Task 2.2)
artifacts/washbuddy-web/src/pages/fleet/wash-requests.tsx (Task 2.3)
artifacts/washbuddy-web/src/pages/fleet/new-request.tsx (Task 2.3)
artifacts/washbuddy-web/src/pages/fleet/request-detail.tsx (Task 2.3)
artifacts/washbuddy-web/src/pages/fleet/settings.tsx (Task 2.4)
artifacts/washbuddy-web/src/pages/fleet/reports.tsx (Task 2.5)
artifacts/washbuddy-web/src/pages/admin/dashboard.tsx (Task 3.1)
artifacts/washbuddy-web/src/pages/admin/providers.tsx (Task 3.2)
artifacts/washbuddy-web/src/pages/admin/bookings.tsx (Task 3.3)
artifacts/washbuddy-web/src/pages/admin/reviews.tsx (Task 3.5)
artifacts/washbuddy-web/src/pages/auth/register.tsx (Task 3.4)
artifacts/washbuddy-web/src/components/notification-bell.tsx (Task 0.6)
artifacts/washbuddy-web/src/components/layout.tsx (Task 4.4)
artifacts/washbuddy-web/src/App.tsx (add provider onboarding route, Task 3.4)
lib/api-spec/openapi.yaml (update for all new/modified endpoints)
After modifying openapi.yaml: Regenerate the API client by running the Orval code generator per the configuration in lib/api-spec/orval.config.ts. This updates lib/api-client-react/src/generated/api.ts and api.schemas.ts with new typed hooks for all new endpoints.

IMPLEMENTATION PRIORITY MATRIX
If timeline pressure requires scope reduction, here is the priority ranking:
MUST HAVE (cannot launch without):
Task 0.1, 0.2 (data cleanup and realistic seed data)
Task 0.3 (search loads on page render)
Task 0.4 (fleet dashboard routing)
Task 1.1 (correct fee calculation)
Task 1.2 (operating hours enforcement)
Task 1.4 (location detail and booking flow)
Task 1.5 (provider booking management)
Task 1.6 (customer booking management)
Task 2.1 (fleet overview)
Task 4.2 (notification triggers — at minimum in-app)
Task 4.4 (UI polish — at minimum loading/empty states and mobile responsiveness)
SHOULD HAVE (significantly degrades experience without):
Task 0.5 (provider settings editability)
Task 0.6 (notification bell)
Task 1.3 (SLA enforcement)
Task 2.2 (fleet vehicle management)
Task 2.4 (fleet policy engine)
Task 3.1 (admin dashboard)
Task 3.2 (admin provider management)
Task 3.4 (provider registration flow)
Task 4.1 (email notifications)
NICE TO HAVE (can launch beta without):
Task 2.3 (fleet wash request workflow)
Task 2.5 (fleet reports)
Task 3.3 (admin booking management enhancements)
Task 3.5 (review system)
Task 4.3 (booking reminders)
Task 5.2 (performance optimization)
Task 5.3 (security hardening beyond basics)
Task 5.5 (Stripe Connect — can use manual payment reconciliation for beta)

End of Engineering Implementation Document

