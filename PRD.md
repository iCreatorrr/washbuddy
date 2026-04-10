WASHBUDDY — PRODUCT REQUIREMENTS DOCUMENT (PRD)
Version: 2.0
Date: April 10, 2026
Status: Approved for Engineering
Previous Version: PRD v1.0 (April 2, 2026)
Document Type: Product Requirements — Source of Truth

This document supersedes PRD v1.0 in its entirety. All features from v1.0 are preserved and expanded. New capabilities are marked with [NEW] for easy identification of additions.

---

# 1. EXECUTIVE SUMMARY

## 1.1 Product Definition
WashBuddy is a multi-sided marketplace platform that connects commercial bus fleet operators and drivers with wash service providers. It enables drivers and fleet operators to discover, book, and pay for bus wash services across multiple independent providers through a single unified platform, eliminating the fragmented, phone-call-driven scheduling process that dominates the industry today.

## 1.2 Mission Statement
Become the definitive platform through which commercial bus fleets, drivers, and wash providers conduct business — the infrastructure layer for fleet vehicle washing across North America. WashBuddy will be the default software that providers use to manage ALL of their wash bookings — whether those bookings originated on the platform or not — just as OpenTable became the default reservation system for restaurants.

## 1.3 System-of-Record Strategy [NEW]
WashBuddy's long-term competitive moat is becoming the operating system for the wash provider's business. This means:
- Providers enter ALL bookings into WashBuddy, not just platform-sourced ones
- Off-platform bookings (phone calls, walk-ins) are entered at zero platform fee
- The provider dashboard becomes the tool they open every morning to see their day
- Once WashBuddy is the system of record, switching costs become enormous and the platform has complete market visibility
Every feature in this document is designed to reinforce this strategy.

## 1.4 Launch Definition
Production ready is defined as a closed beta deployment with 3–5 fleet operators and 10–15 wash providers in the Northeast corridor (Toronto–Buffalo–Niagara–New York City). The product must deliver a flawless core loop: a driver or fleet operator searches for a wash facility, finds available locations, books a service, the provider confirms (or instant-books), the vehicle arrives and is washed, the provider marks completion, the fleet operator sees it in their dashboard, and payment settles. Every screen, every notification, every data field must work reliably for this core flow.

## 1.5 Launch Geography
The initial corridor spans Toronto, Ontario through Buffalo/Niagara to New York City and the broader tri-state area. This is a cross-border (US/Canada) market requiring dual-currency support (USD and CAD). All seed data, demo content, and default configurations must reflect this Northeast corridor reality.

---

# 2. PLATFORM PARTICIPANTS AND ROLES

## 2.1 Role Taxonomy
WashBuddy serves five distinct participant types. The platform uses a membership-based role system where a single user account can hold roles across multiple scopes.

## 2.2 Drivers (DRIVER role, fleet scope)
Drivers are the end users who physically operate buses and bring vehicles to wash locations. They are mobile-first users who interact with WashBuddy primarily from their phones while on route or during breaks.

**What drivers can do:**
- Search for wash locations by proximity, availability, service type, price, and vehicle compatibility
- View location details including services offered, pricing, operating hours, ratings, real-time availability, and facility photos
- Use "Find a Wash Now" quick action to find immediate same-day availability [NEW]
- Plan routes with wash stops integrated into their driving path
- Book wash services for vehicles assigned to them by their fleet
- Browse and request subscription wash packages offered by providers [NEW]
- Attach photos of vehicle problem areas when booking to communicate special needs [NEW]
- View and manage their own bookings (upcoming, in-progress, completed)
- Check in at a wash location upon arrival (optional self-check-in)
- Receive in-platform messages from providers about their booking status [NEW]
- View before/after wash photos posted by the provider operator [NEW]
- Leave reviews and ratings after completed washes
- Submit wash requests to their fleet for approval (when fleet policy requires it)
- View their assigned vehicles and vehicle wash history

**What drivers cannot do:**
- Add, edit, or delete vehicles (fleet-managed assets only)
- Book washes for vehicles not assigned to them
- Book at providers outside their fleet's approved list (when fleet policy restricts)
- Exceed per-wash spending limits set by their fleet
- Exceed wash frequency limits set by their fleet
- Enter personal payment information (fleet pays)
- Access fleet-level dashboards, reports, or settings
- Access other drivers' booking history
- Send freeform messages to providers (only receive predefined messages) [NEW]

## 2.3 Fleet Operators
Fleet operators manage fleets of buses and are the paying customers of the platform. They operate from desktops and need comprehensive management tools. The fleet operator category includes four sub-roles:

**FLEET_ADMIN (full fleet management):**
- Complete visibility and control over all fleet operations on WashBuddy
- Add, edit, deactivate vehicles and assign them to drivers
- Manage fleet membership (invite drivers, assign roles)
- Set fleet-wide policies: approved provider lists, per-wash spending limits, wash frequency limits
- Book washes on behalf of any driver/vehicle in the fleet
- Approve or decline driver-submitted wash requests
- Create and manage recurring wash programs (automated scheduling)
- Browse, purchase, and manage subscription packages from providers [NEW]
- View subscription fee savings (reduced $20 cap vs. standard $25 cap) [NEW]
- Configure fleet depots and vehicle groups
- View wash health indicators per vehicle with overdue alerts [NEW]
- View all fleet bookings, spending, and analytics
- View message threads between fleet drivers and providers for transparency [NEW]
- Manage fleet billing settings and payment methods
- Access enhanced fleet reports with provider performance comparison [NEW]
- Export data

**DISPATCHER (operational coordination):**
- View all fleet bookings and wash requests
- Book washes on behalf of drivers/vehicles
- Approve or decline driver-submitted wash requests
- View fleet vehicles and their wash status
- Cannot modify fleet policies, billing, or membership settings

**MAINTENANCE_MANAGER (vehicle and compliance focus):**
- View all fleet vehicles and their wash history/status
- View wash health indicators and overdue alerts [NEW]
- Set up and manage recurring wash programs
- Book washes on behalf of drivers/vehicles
- View fleet reports focused on vehicle maintenance compliance
- Cannot modify fleet policies, billing, or membership settings

**READ_ONLY_ANALYST (reporting only):**
- View all fleet bookings, vehicles, wash requests, and reports
- Cannot create bookings, modify vehicles, or change any settings
- Export data for external analysis

## 2.4 Wash Providers [SIGNIFICANTLY EXPANDED]
Providers are the businesses that operate wash facilities and deliver the actual wash services. They use the platform to receive bookings, manage their operations, and get paid. The provider role is split into two distinct user experiences:

### 2.4.1 PROVIDER_ADMIN (Provider Administrator — full business management)
The Provider Administrator is the business owner or manager. They access the platform primarily via web (desktop) and have complete control over all aspects of their business on WashBuddy.

**What Provider Administrators can do:**

*Location & Service Management:*
- Manage all provider locations (add, edit, deactivate)
- Set operating hours for each location (day-by-day, multiple windows per day)
- Configure named wash bays per location with vehicle class compatibility and max dimensions [NEW]
- Create and manage services at each location (name, description, price per vehicle class, duration per vehicle class, vehicle compatibility)
- Manage service menu including add-ons and upsells (supplies, food, beverages) [NEW]
- Choose booking mode per service: instant booking or request-and-confirm
- Create and manage discount rules (off-peak, volume, first-time client) [NEW]
- Create and manage subscription wash packages [NEW]

*Booking & Operations:*
- View all bookings across all locations, including off-platform and walk-in bookings [NEW]
- Process bookings through the full service lifecycle (confirm/decline, check-in, start, complete)
- Enter off-platform bookings (phone, walk-in) at zero platform fee [NEW]
- Use the Bay Timeline View to see bay utilization and identify scheduling gaps [NEW]
- Drag-and-drop reschedule bookings on the timeline [NEW]
- View the Daily Wash Board (list view) for a dense operational overview [NEW]
- View the Shift Dashboard with vehicle counts, staff availability, booking source breakdown, revenue forecast, and capacity utilization [NEW]
- Manage wash notes per shift and per booking [NEW]
- View and manage the waitlist for walk-in clients [NEW]

*Staff Management:*
- Add, invite, deactivate Provider Operators [NEW]
- Assign operators to specific locations (for multi-location providers) [NEW]
- Assign operators to specific washes [NEW]
- Share operators across multiple locations [NEW]
- View operator performance metrics: washes completed, average duration, on-time percentage, average customer rating, upsell conversion rate [NEW]
- View comparative operator performance (side-by-side) [NEW]

*Client Relationship Management (CRM):* [NEW — entire section]
- View and manage client profiles for all clients (on-platform and off-platform)
- See client visit history, lifetime spend, vehicle information, and fleet affiliation
- Apply tags to clients: VIP, Frequent Client, Service Recovery Needed, New Client, Special Requirements, Payment Issue
- Add freeform notes to client profiles
- View communication history per client

*Reporting & Analytics:* [NEW — entire section]
- View dashboard with: overall WashBuddy rating (with network benchmark comparison), total washes by source (platform/direct/walk-in), revenue by service type/vehicle class/source, bay utilization rate, first-time vs. repeat client rates, peak demand heatmap, seasonal trends, average lead time, client retention rate, service mix breakdown, average revenue per wash, no-show rate, cancellation rate, operator performance summary
- Additional metrics: revenue per bay-hour, provider confirmation response time, upsell attach rate
- Filter reports by: date range (presets + custom), location, shift, operator, vehicle class, service type, booking source
- Export reports as PDF or CSV
- Schedule automated report delivery (e.g., weekly summary email) [future]
- View benchmarking against anonymized network averages (when network is large enough) [future]

*Financial:*
- View customer reviews and submit provider replies
- View payout reports and earnings
- Complete Stripe Connect onboarding for payment processing
- View booking source attribution (what percentage of revenue comes from WashBuddy vs. off-platform) [NEW]

*Platform Settings:*
- Manage notification preferences (channels, scope, frequency) [NEW]
- View audit log of all operator actions [NEW]
- Manage user accounts (add/remove admins and operators) [NEW]
- Configure light/dark mode and display preferences [NEW]
- Access help center and submit platform feedback [NEW]

### 2.4.2 PROVIDER_STAFF (Provider Operator — on-the-ground operations)
The Provider Operator is the bay attendant or shift manager at the wash facility. They access the platform primarily via mobile (responsive web) and focus on day-to-day wash execution.

**What Provider Operators can do:**
- View their own schedule for the day (assigned washes) [NEW]
- View the Daily Wash Board for their assigned location [NEW]
- View the Bay Timeline for their assigned location [NEW]
- Confirm or decline incoming booking requests (for manual-confirmation services)
- Check in vehicles upon arrival
- Mark washes as In Progress and Complete (simple 4-step status: Scheduled → Checked In → In Progress → Complete)
- Capture before/after photos of washes (encouraged, skippable) [NEW]
- Enter off-platform bookings (phone calls, walk-ins) into the calendar [NEW]
- Process walk-in payments through WashBuddy (when provider chooses to use platform payment) [NEW]
- Send predefined messages (editable) to drivers for on-platform bookings [NEW]
- View wash notes and special instructions per booking [NEW]
- View client profile information (tags, notes, visit history) for the client they are currently serving [NEW]
- Add notes to client profiles [NEW]
- View their own performance metrics [NEW]
- Manage their own notification preferences [NEW]
- Access help center and submit platform feedback [NEW]

**What Provider Operators cannot do:**
- Access the admin dashboard, reporting, or analytics
- Modify location settings, services, pricing, or bay configuration
- Manage staff (add/remove operators)
- View other operators' performance metrics (comparative view)
- Modify provider-level configuration or billing
- View financial reports or payout information
- Manage discounts, subscriptions, or promotions
- View the audit log

## 2.5 Platform Administrators
Platform administrators are WashBuddy internal team members who oversee the marketplace. Desktop-only interface.

**PLATFORM_SUPER_ADMIN (full platform control):**
- View and manage all providers, locations, services, bookings, users, and reviews
- Approve or reject new provider registrations
- Initiate Stripe Connect onboarding for providers
- Moderate reviews (hide inappropriate content)
- View platform-wide analytics (total bookings, revenue, provider performance)
- Monitor provider quality metrics: response rates, confirmation times, auto-flagging of poor performers [NEW]
- Manage graduated penalty system for providers (warning → reduced visibility → suspension) [NEW]
- View network benchmarking aggregate data [NEW]
- Manage platform configuration and seed data
- Resolve disputes between customers and providers, with access to before/after photos as evidence [NEW]
- Oversee subscription packages and verify fee calculations [NEW]

---

# 3. CORE BUSINESS RULES

## 3.1 Pricing and Fee Structure

**Provider pricing:** Each provider sets their own prices for each service at each location, per vehicle size class. Prices are set in the provider's local currency (USD for US locations, CAD for Canadian locations). Vehicle size classes for pricing are:
- Small — minibus/shuttle (under 25 feet)
- Medium — mid-size coach (25–35 feet)
- Large — full-size motorcoach (35–45 feet)
- Extra Large — double-decker, articulated (45+ feet)

**Standard platform fee:** WashBuddy charges a platform fee of 15% of the combined service total for a vehicle booking, capped at a maximum of $25 (in the booking's currency) per vehicle booking. A "vehicle booking" is defined as a single visit by one vehicle to one location, regardless of how many services are included.

**Subscription platform fee:** [NEW] For subscription packages consisting of 3 or more washes (whether as a recurring weekly plan or 3+ individual bookings by the same fleet at the same provider in one month), the platform fee is reduced to 15% capped at a maximum of $20 per wash. Example: A subscription of 4 weekly washes at $150 each = $600 total service cost. Fee per wash = min($150 × 0.15, $20) = $20. Total platform fee = $80. Total charged to fleet = $680.

**Discount interaction with fees:** [NEW] When a provider offers a discount (off-peak, volume, or first-time), the platform fee is calculated on the POST-discount price. Example: A $200 exterior wash with a 10% off-peak discount = $180 post-discount. Platform fee = min($180 × 0.15, $25) = $25. Customer pays $205.

**Off-platform booking fees:** [NEW] Bookings entered by the provider for off-platform clients (phone, walk-in) incur ZERO platform fee. These bookings are tracked for the provider's operational benefit only. Revenue from off-platform bookings is shown in provider reports but the platform does not process payment or take a cut. Exception: if the provider chooses to process a walk-in payment through WashBuddy's Stripe Connect infrastructure, the standard platform fee applies.

**Customer-facing price display:** Customers always see a single all-in price. The platform fee is built into the displayed price and never shown as a separate line item.

**Provider-facing price display:** Providers see the price they set. Their dashboard shows earnings as the service price they defined. The platform fee deduction appears only in payout/settlement reports.

**Cross-border currency handling:** Each provider's location is priced in local currency. When a customer's fleet billing currency differs from the provider's local currency, the customer sees the price converted to their fleet's billing currency using a real-time exchange rate at the time of booking.

## 3.2 Booking Flow
WashBuddy supports three booking sources: [EXPANDED]

**On-platform bookings** (via WashBuddy by drivers or fleet operators): Two modes configurable per service:
- Instant Booking: Driver selects a time slot, confirms, immediately confirmed. Badge: "Instant Book."
- Request & Confirm: Driver selects a time slot, submits request. Provider must confirm or decline within SLA. Badge: "Request."

**Off-platform bookings** [NEW] (entered by provider admin or operator): The provider enters booking details manually — client name, contact info (optional), vehicle type, services, date/time. These bookings appear on the bay timeline and daily wash board alongside on-platform bookings. They are tagged with source: "Direct" (phone call) or "Walk-in." No platform fee is charged. No payment is processed through WashBuddy (unless the provider opts to process a walk-in payment).

**Walk-in bookings** [NEW] (driver arrives without a booking): The provider operator creates an on-the-spot booking. If the walk-in client is an existing WashBuddy user, the operator can look them up and link the booking. The provider can optionally process payment through WashBuddy (standard fee applies) or collect payment externally (zero fee). Walk-ins are tracked separately in reporting for demand analysis.

**Booking lifecycle — full status progression:**
- REQUESTED → Customer has submitted a booking request. Hold placed on time slot. Provider notified.
- PROVIDER_CONFIRMED → Provider accepted. Customer notified. Slot locked.
- PROVIDER_DECLINED → Provider declined. Customer notified with alternatives. Hold released.
- EXPIRED → Provider did not respond within SLA. Hold released. Customer notified with alternatives.
- CUSTOMER_CANCELLED → Customer cancelled before service began.
- PROVIDER_CANCELLED → Provider cancelled a previously confirmed booking.
- CHECKED_IN → Provider confirmed vehicle arrival at facility.
- IN_SERVICE → Wash service has begun.
- COMPLETED_PENDING_WINDOW → Service complete. 24-hour dispute window open.
- COMPLETED → Dispute window closed without dispute. Booking finalized.
- SETTLED → Payment captured and provider payout processed.

For instant bookings, status skips REQUESTED and goes directly to PROVIDER_CONFIRMED.

**Problem booking types** [NEW] — the system must handle these scenarios:
1. **Driver late:** If driver hasn't checked in within 15 minutes of booking time, system auto-flags. After 30 minutes, operator prompted to mark as no-show or reschedule.
2. **Driver canceled:** Flagged with cancellation reason. Refund policy applied per Section 3.8.
3. **Provider canceled:** Logged with reason. Full refund. Admin review if frequent.
4. **Bay conflict/double-booking:** If an off-platform booking overlaps with a platform booking, system alerts immediately and suggests resolution (move one to next available slot).
5. **Service mismatch:** Driver arrives with vehicle class different from booking. Operator can adjust booking and price in real-time, triggering price difference notification to driver/fleet.
6. **Equipment failure:** Operator marks bay as "out of service." Affected bookings offered reschedule or full refund.
7. **Incomplete service:** Wash started but couldn't be completed. Operator logs issue. Partial refund or reschedule offered.
8. **Driver dispute on-site:** Driver claims wash quality inadequate. Operator flags for admin review.

## 3.3 Provider Response SLA and Accountability
**Response time requirements:**
- Bookings within next 24 hours: provider must respond within 5 minutes
- Bookings 24+ hours out: provider must respond within 10 minutes

**When a provider fails to respond:**
- Booking status → EXPIRED
- Customer receives notification with suggested nearby alternatives
- Provider receives automated email warning about lost revenue
- Response-rate metrics tracked per provider per location

**Graduated penalty system** [NEW]:
- Warning level 1: Provider misses SLA 3 times in a 7-day period → automated email warning
- Warning level 2: Provider misses SLA 5 times in a 30-day period → reduced visibility in search results (lower ranking)
- Warning level 3: Provider misses SLA 10 times in a 30-day period or has response rate below 70% → admin review triggered, potential suspension
- Providers can see their own response-rate metrics in their admin dashboard

## 3.4 Fleet Policy Engine
Fleet operators can define guardrails that govern how their drivers book washes:
- **Approved Provider List:** Whitelist of approved providers. Drivers can only book at approved providers.
- **Per-Wash Spending Limit:** Maximum dollar amount per service per booking.
- **Wash Frequency Limit:** Maximum washes per vehicle per time period.

Policies stored in `requestPolicyJson` and enforced both frontend and backend.

## 3.5 Driver-Fleet Booking Relationship
- Both drivers and fleet operators can create bookings
- The fleet is always the billing entity — drivers never enter personal payment info
- Fleet policies evaluated before booking can proceed
- Optional wash request workflow for fleets requiring pre-approval

## 3.6 Vehicle Data Model
Vehicles are fleet-managed assets. Required fields: Unit Number, Category Code (BUS), Subtype Code (STANDARD, COACH, MINIBUS, SHUTTLE, DOUBLE_DECKER, SCHOOL_BUS, ARTICULATED), Length (inches), Height (inches), Has Restroom (boolean). Optional: License Plate, Depot assignment, Vehicle group memberships.

Wash tracking fields (system-managed): Last Wash Date/Time, Next Wash Due Date/Time.

**Wash health indicators** [NEW]: Each vehicle displays a wash health status:
- Green: Washed within recommended frequency
- Yellow: Approaching overdue threshold
- Red: Overdue for wash
The recommended frequency adjusts seasonally — more frequent during winter months (November–March) in the Northeast corridor due to road salt exposure. Default recommendation: weekly during winter, biweekly during other seasons. Fleet admins can customize thresholds.

## 3.7 Subscription Packages [NEW — entire section]
Providers can create subscription wash packages that fleets can purchase:
- **Package definition:** Provider admin sets: package name, included services (per wash), frequency (weekly, biweekly, monthly, or custom interval), price per wash (by vehicle class), minimum commitment (number of washes or months), and which locations the package is valid at.
- **Purchase flow:** Fleet admin browses available packages at a provider, selects vehicle(s) to enroll, selects start date. Payment is authorized for the first wash cycle. Subsequent washes are auto-charged.
- **Fee structure:** Platform fee is 15% capped at $20/wash for packages of 3+ washes.
- **Scheduling:** Once a subscription is active, bookings are auto-created for the recurring schedule. Driver receives notification before each scheduled wash.
- **Cancellation:** Fleet admin can cancel a subscription with notice. Already-scheduled washes within the current billing cycle are honored.

## 3.8 Cancellation and Refund Policy
- Cancelled before provider confirms (REQUESTED or HELD): authorization voided, no charge.
- Confirmed booking cancelled by customer more than 24 hours before: full refund.
- Confirmed booking cancelled by customer within 24 hours: 50% charge (split proportionally between platform and provider).
- No-show: full charge.
- Provider cancels: full refund to customer, incident logged against provider.
- Equipment failure preventing service: full refund, incident logged.

---

# 4. PROVIDER CONFIGURATION

## 4.1 Provider Onboarding Flow
Step 1 — Registration: Provider creates account selecting "I'm a Wash Provider." Provides: business name, primary contact name, email, phone, password.
Step 2 — Location Setup: Add first location with: facility name, full address (geocoded), timezone, operating hours, wash bay configuration.
Step 3 — Bay Configuration [NEW]: Define individual wash bays with: bay name/number, maximum vehicle length (inches), maximum vehicle height (inches), supported vehicle classes (Small/Medium/Large/Extra Large), supported service types. This enables auto-matching of bookings to compatible bays.
Step 4 — Service Configuration: Add wash services with: name, description, duration per vehicle class, price per vehicle class, vehicle compatibility rules, booking mode (instant or request-and-confirm).
Step 5 — Pending Review: Listing saved but not visible. Provider sees "under review" message.
Step 6 — Admin Approval: WashBuddy admin reviews, approves or requests modifications.
Step 7 — Stripe Connect Onboarding: Provider completes Stripe Connect to enable payments.

## 4.2 Operating Hours
Every location must define operating hours via OperatingWindow records: location ID, day of week (0=Sun through 6=Sat), open time (HH:MM local), close time (HH:MM local). Multiple windows per day supported. Used for: filtering search results, determining available booking slots, enforcing SLAs, displaying OPEN/CLOSED badges.

## 4.3 Bay Management [NEW — entire section]
Each location defines individual wash bays:
- **Bay model fields:** bayId, locationId, name (e.g., "Bay 1", "Bay A"), maxVehicleLengthInches, maxVehicleHeightInches, supportedVehicleClasses (array: SMALL, MEDIUM, LARGE, EXTRA_LARGE), supportedServiceTypes (array of service IDs), isActive, displayOrder.
- **Auto-matching:** When a booking is created, the system auto-assigns the booking to a compatible bay based on: vehicle class compatibility, time slot availability, and service type support. If no compatible bay is available, the time slot is shown as unavailable.
- **Bay timeline:** Bays are displayed as horizontal swim lanes on the timeline view. Each bay shows its bookings as colored time blocks.
- **Out of service:** Operators can mark a bay as temporarily out of service (with reason and estimated return time). Affected bookings are flagged.

## 4.4 Discount and Promotion Management [NEW — entire section]
Provider administrators can create discount rules:
- **Off-peak discount:** Percentage discount applied automatically for bookings during specified time windows (e.g., 10% off for bookings 2pm–4pm weekdays).
- **Fleet volume discount:** Percentage discount applied when a fleet has booked X+ washes at this provider in the current month (e.g., 5% off after 10 washes/month).
- **First-time client promotion:** Flat amount or percentage discount for a client's first booking at this provider.
- **Stacking:** Discounts can stack. The platform fee is calculated on the final post-discount price.
- **Visibility:** Discounts are displayed to drivers/fleet operators during the booking flow (e.g., "10% off-peak discount applied").

## 4.5 Service Menu Management [NEW — entire section]
The provider's service catalog is organized into categories:
- **Core wash services:** Exterior Wash, Interior Clean, Detailed Clean, Undercarriage Wash, Quick Rinse, Engine Bay Clean.
- **Add-on services:** Bathroom waste emptying, wheel/tire treatment, window treatment, wax coating.
- **Supply restocking:** Toilet paper, paper towels, soap, hand sanitizer — available as add-ons to any wash service.
- **Amenities/upsells:** Food, beverages, bottled water, driver lounge access.
Each service has: name, description, price per vehicle class (Small/Medium/Large/Extra Large), estimated duration per vehicle class, active/inactive toggle.

---

# 5. PROVIDER DASHBOARD — DETAILED INTERFACE SPECIFICATIONS [NEW — entire section]

This section specifies every view and interaction in the provider experience, separated by Provider Administrator and Provider Operator access.

## 5.1 Daily Wash Board (List View)
**Access:** Both Provider Admin and Provider Operator
**Purpose:** Dense, scrollable list of all washes for today, organized by status.
**Layout:** Three zones displayed as collapsible sections:
- **Upcoming:** Confirmed bookings not yet started. Sorted by scheduled time.
- **In Progress:** Washes currently underway. Shows live elapsed timer.
- **Completed:** Finished washes from today.

**Each booking card displays:**
- Time (scheduled start)
- Vehicle type icon with size class badge (S/M/L/XL)
- Vehicle unit number and license plate (if available)
- Driver name and fleet name
- Services requested (icons + abbreviated names)
- Estimated duration
- Assigned operator name
- Booking source badge: "WashBuddy" (blue), "Direct" (gray), "Walk-in" (orange) [NEW]
- Status badge with color coding: Scheduled (blue), Checked In (yellow), In Progress (green), Complete (dark green)
- Special indicators: VIP client tag, Service Recovery Needed tag, first-time client tag [NEW]

**Interactions:**
- Tap a booking to expand details (notes, special requests, client profile link)
- Quick-action buttons: Check In, Start, Complete (appropriate to current status)
- Filter bar: by status, operator, vehicle class, service type, booking source
- Sort options: by time (default), by vehicle class, by operator

**UX guidance:** This view must be fast and scannable. Use a monochromatic color scheme for the base with color only for status badges and source badges. Minimum touch target of 44px for all interactive elements. Cards should be compact — no more than 80px height in the collapsed state. The view should be usable on a phone held in one hand by an operator who may have wet/gloved hands.

## 5.2 Bay Timeline View [NEW]
**Access:** Both Provider Admin and Provider Operator
**Purpose:** Visual timeline showing all bays as horizontal swim lanes with bookings as time blocks.
**Layout:**
- Vertical axis: One row per wash bay, labeled with bay name and vehicle class compatibility icons.
- Horizontal axis: Time, scrollable. Default view: current time ± 4 hours. Zoom levels: 1 hour, 4 hours, full day.
- Bookings appear as colored blocks. Block width = estimated duration. Color coding by service type (exterior = blue, interior = green, detail = purple, etc.). Block label: vehicle unit number + driver first name.
- Gaps between blocks are visually highlighted with a subtle dashed border and a "+" icon [NEW].
- Current time shown as a vertical red line.

**Interactions:**
- **Drag-and-drop rescheduling:** Drag a booking block to a different time or different bay. On drop, system validates: bay compatibility with vehicle class, no overlap with existing bookings, within operating hours. If valid, booking is moved. For on-platform bookings: driver/fleet operator receives notification and can accept or reject the change. For off-platform bookings: move is immediate (provider handles communication).
- **Click gap to add booking:** Clicking the "+" in a gap opens a quick-add form for entering an off-platform or walk-in booking.
- **Click booking block:** Opens booking detail popover with full information and action buttons.
- **Bay out-of-service:** Right-click (or long-press on mobile) a bay label to mark it out of service with reason and estimated return time. The bay row is grayed out.

**UX guidance:** This is the most complex view in the provider experience. It must remain performant with up to 50 bookings visible. Use hardware-accelerated scrolling. On mobile, the timeline should collapse to a single-bay view with a bay selector dropdown. Touch-and-hold should initiate drag on mobile. Use subtle animations for drag feedback. The "+" for adding bookings in gaps should be prominently visible — this is the primary mechanism for the system-of-record strategy.

## 5.3 Shift Dashboard [NEW]
**Access:** Provider Admin only
**Purpose:** High-level operational overview of the current or upcoming shift.
**Layout:** Grid of metric cards at the top, followed by detail sections.

**Metric cards:**
- Vehicle count by class: icon + count for each of Small, Medium, Large, Extra Large scheduled this shift
- Staff on shift: count of active operators with names listed
- Capacity utilization: percentage of available bay-hours that are booked (circular gauge visualization)
- Revenue forecast: total expected revenue for this shift based on booked services

**Booking source breakdown:** Horizontal stacked bar chart showing:
- WashBuddy Platform bookings (blue)
- Direct/phone bookings (gray)
- Walk-in bookings (orange)
- Advertisement response bookings (green) [future]
With counts and percentages for each.

**UX guidance:** This view should feel like a command center. Use large, bold numbers for the metric cards. The capacity utilization gauge should use green (>80%), yellow (50-80%), red (<50%) coloring to immediately communicate whether the shift is well-booked. This is a Provider Admin exclusive view — operators see only their own daily schedule.

## 5.4 Wash Notes [NEW]
**Access:** Both Provider Admin and Provider Operator
**Purpose:** Display all relevant notes and special instructions for a booking.

**Per-shift notes** (set by Provider Admin): Free-text notes visible to all operators for the shift. Example: "Water pressure reduced 2-4pm for maintenance."

**Per-booking notes** (multiple sources, displayed together):
- **From driver/fleet at booking time:** Special requests, vehicle condition notes, supply needs. May include photo attachments.
- **From Provider Admin:** Instructions for the operator handling this wash. Example: "VIP fleet — priority treatment."
- **Supply requests and upsells:** Itemized list of requested add-ons (paper towels, toilet paper, soap, food, beverages).
- **Operator notes:** The assigned operator can add notes during or after the wash.

**UX guidance:** Notes should be displayed in a chronological thread format, similar to a chat view, with clear attribution (who posted what). Photo attachments should display as thumbnails that expand on tap. Supply/upsell items should be displayed as a checklist that the operator can check off as they fulfill each item.

## 5.5 Client Profiles (CRM) [NEW]
**Access:** Provider Admin has full access. Provider Operator has read access + can add notes.
**Purpose:** Comprehensive client database for all clients, on-platform and off-platform.

**Client profile fields:**
- Contact info: name, phone, email (auto-populated for on-platform, manual for off-platform)
- Company/fleet affiliation
- Vehicle(s) associated with this client
- Visit history: every wash at this provider (on-platform and off-platform), with date, services, operator, duration, rating
- Lifetime spend at this provider
- Tags: VIP Client, Frequent Client, Service Recovery Needed (last review ≤3 stars), New Client, Fleet Account, Special Requirements (e.g., custom wrap — touchless only), Payment Issue
- Freeform notes (added by any admin or operator)
- Communication history (messages sent via platform) [NEW]
- Last review and rating given

**Tag automation:** [NEW]
- "Frequent Client" auto-applied after 5+ visits in 3 months
- "Service Recovery Needed" auto-applied when latest review ≤3 stars
- "New Client" auto-applied for first visit, auto-removed after second visit
- "VIP Client" and "Special Requirements" are manually applied by Provider Admin

**UX guidance:** When an operator views a booking, the client profile summary should be visible in a sidebar or expandable panel — they shouldn't have to navigate away to see client context. The most important information (tags, last visit, lifetime spend, any special requirements) should be visible at a glance. The "Service Recovery Needed" tag should be visually prominent (red badge) so operators know to provide exceptional service.

## 5.6 Operator Performance [NEW]
**Access:** Provider Admin sees all operators. Provider Operator sees only their own stats.
**Purpose:** Track and improve operator performance.

**Metrics per operator:**
- Total washes completed (filterable by time period)
- Average wash duration by service type (compared to estimated duration)
- Percentage of washes completed within scheduled time
- Average customer rating received
- Number of complaints/disputes associated with their washes
- Check-in timeliness: did they start the wash on time?
- Upsell conversion rate: how often they successfully added upsell items

**Provider Admin comparative view:** Side-by-side table of all operators with sparkline trends for each metric. Highlight top performer with a subtle badge. Flag operators whose metrics are declining.

**UX guidance:** For the operator's own view, present metrics in a "personal scorecard" format — encouraging and non-punitive. Show positive trends prominently. For the admin view, present as a management dashboard with the ability to drill down into any operator's detail.

## 5.7 Reporting & Analytics Dashboard [NEW]
**Access:** Provider Admin only
**Purpose:** Comprehensive business intelligence for the provider's wash operations.

**Dashboard overview (top-level cards):**
- Overall WashBuddy rating (with network average comparison when available)
- Total washes this period (with % change from previous period)
- Total revenue this period (with % change)
- Bay utilization rate (with trend)
- New clients this period
- Repeat client rate

**Detailed report sections:**

*Revenue reports:*
- Revenue by service type (bar chart)
- Revenue by vehicle class (bar chart)
- Revenue by booking source: WashBuddy platform vs. direct vs. walk-in (stacked bar)
- Revenue per bay-hour (the most important efficiency metric)
- Revenue trend over time (line chart)

*Operational reports:*
- Average wash duration by service type and vehicle class (vs. estimated)
- Peak demand heatmap: hours × days matrix with color intensity showing booking volume
- Capacity utilization over time (line chart)
- No-show rate trend
- Cancellation rate trend (customer-cancelled vs. provider-cancelled)

*Client reports:*
- First-time client count and trend
- Repeat client rate (% of clients who returned within 30 days)
- Client retention rate (month-over-month)
- Average lead time (how far in advance bookings are made)
- Upsell attach rate (% of washes with add-on services)

*Staff reports:*
- Operator performance summary table
- Washes per operator (bar chart)
- Average rating per operator

**Report controls:**
- Date range selector: Today, This Week, This Month, This Quarter, This Year, Custom Range
- Location filter (for multi-location providers)
- Operator filter
- Vehicle class filter
- Service type filter
- Booking source filter (Platform / Direct / Walk-in / All)
- Export: PDF or CSV
- Print-friendly view

**UX guidance:** The reporting dashboard should feel professional and data-rich but not overwhelming. Use a card-based layout at the top for key metrics, with expandable chart sections below. Charts should use the same color palette consistently (e.g., blue for WashBuddy bookings, gray for direct, orange for walk-ins throughout all charts). Default to the current month view. Make the date range selector prominent and easy to change.

## 5.8 In-Platform Messaging [NEW]
**Access:** Provider Operator sends messages. Provider Admin can view message history.
**Purpose:** Structured communication between providers and drivers for on-platform bookings.

**Message templates (predefined, editable before sending):**
- "Your wash is complete. [Custom note field]"
- "We're running approximately [X] minutes behind schedule. We apologize for the delay."
- "Your bus is ready for pickup in [location field]."
- "We need to discuss something about your booking. Please contact us at [phone]."
- "Your scheduled wash has been moved to [new time]. Please confirm or contact us."

**How it works:**
- Operator selects a booking → taps "Message Driver" → selects a template → optionally edits the template text → sends.
- Driver receives the message as a push notification / in-app notification / email.
- For on-platform bookings ONLY. Off-platform clients are communicated with outside WashBuddy.
- All messages are logged on the booking record and visible to: the operator who sent it, the Provider Admin, the driver, and the Fleet Admin (for transparency).

**UX guidance:** The messaging interface should be minimal — not a full chat system. Think of it like a restaurant sending a "your table is ready" text. The predefined templates should be selectable with one tap, and the edit field should appear inline below the selected template. Send button should be prominent. Message history on a booking should be displayed as a simple chronological list.

## 5.9 Photo Documentation [NEW]
**Access:** Provider Operator captures photos. Provider Admin can view all photos.
**Purpose:** Before/after photo evidence for quality assurance and dispute resolution.

**Workflow:**
- When an operator marks a wash as "In Progress," the system prompts: "Take a 'before' photo? (recommended)" with Camera and Skip buttons.
- When an operator marks a wash as "Complete," the system prompts: "Take an 'after' photo? (recommended)" with Camera and Skip buttons.
- Photos are attached to the booking record.
- Photos are visible to: the operator, the Provider Admin, the driver, and the Fleet Admin.
- In case of a dispute, Platform Admins can view the photos as evidence.

**UX guidance:** The photo prompt should be a non-blocking modal — easy to dismiss with one tap on "Skip" but prominent enough that operators develop the habit. The camera interface should open the device camera directly (using the HTML5 camera API). After capture, show a quick preview with "Use Photo" and "Retake" options. Photos should be compressed client-side before upload to minimize bandwidth usage on cellular connections.

## 5.10 Audit Log [NEW]
**Access:** Provider Admin only
**Purpose:** Complete record of all actions taken by all provider users.

**Logged actions include:**
- Booking created (with source: platform, off-platform, walk-in)
- Booking status changed (with before/after status and who changed it)
- Booking rescheduled (with before/after times and who moved it)
- Booking price adjusted (with before/after amounts and reason)
- Client profile edited (with what changed)
- Operator assigned/reassigned to booking
- Bay marked out of service / restored
- Service added/edited/deactivated
- Discount rule created/edited/deactivated
- User added/removed/role changed

**Each log entry shows:** Timestamp, actor (who did it), action description, entity affected, before/after values where applicable.

**UX guidance:** Presented as a filterable, paginated table. Filter by: date range, actor (operator name), action type, entity type. Most recent actions at top. Each row should be a single scannable line with the option to expand for full detail.

## 5.11 Settings [NEW]
**Access:** Provider Admin has full settings access. Provider Operator has personal preference settings only.

**Provider Admin settings:**
- Business information (name, contact details)
- Location management (link to full location configuration)
- User management: invite new admins/operators, deactivate users, set roles, assign to locations
- Notification preferences (per event type: new booking, cancellation, review received, etc. — toggle email/in-app/both)
- Display preferences (light/dark mode, default calendar view, timezone)
- Notification sound toggle and notification scope (same-day, this week, all)

**Provider Operator settings (personal):**
- Notification preferences (own preferences only)
- Display preferences (light/dark mode)
- Notification sound toggle

## 5.12 Help & Feedback [NEW]
**Access:** Both Provider Admin and Provider Operator

**Help section:**
- Searchable help center (articles TBD — structure built for future content)
- Contact WashBuddy support: email (support@washbuddy.com), phone (placeholder)
- Link to online resources (placeholder URL)

**Feedback section:**
- Submit feedback form with categories: Bug Report, Feature Request, General Feedback, Suggestion
- Text area for description
- Optional screenshot attachment
- Optional email for follow-up
- Confirmation message: "Thank you for your feedback! Our team reviews every submission and uses it to improve WashBuddy."

---

# 6. DRIVER EXPERIENCE — DETAILED SPECIFICATIONS

## 6.1 Search and Discovery
**Primary search interface:** Map + list hybrid view. Map shows wash location pins. List below shows location cards. User's current location detected via browser geolocation (fallback: center of launch corridor).

**"Find a Wash Now" quick action** [NEW]: Prominent button at top of search screen. One tap filters to: providers with same-day availability, within 15 miles, sorted by soonest available slot. Designed for drivers who need an immediate wash (e.g., heavy salt buildup noticed during a route).

**Filters:**
- Open Now
- Available This Hour
- Instant Book
- Vehicle compatibility (auto-applied based on assigned vehicle)
- Service type
- Price range
- Minimum star rating

**Search result cards display:** Provider name, location name, address with distance, OPEN/CLOSED badge, INSTANT BOOK or REQUEST badge, available services with all-in pricing, star rating and review count, next available time slot, subscription packages available badge [NEW].

## 6.2 Booking Flow
Step 1: Select vehicle (from assigned vehicles in fleet — pre-selected if only one)
Step 2: Select service(s) — shows only services compatible with vehicle class, displays all-in price per vehicle class
Step 3: Select date/time from availability calendar — unavailable slots grayed out with tooltips explaining why (bay incompatible, outside hours, etc.)
Step 4: Add special notes and attach photos of problem areas (optional) [NEW]
Step 5: Review booking summary showing single all-in price (with discount breakdown if applicable [NEW])
Step 6: Confirm booking — payment authorized against fleet's payment method

## 6.3 Booking Detail View
Shows: booking status with real-time progression (Scheduled → Checked In → In Progress → Complete), scheduled time, location with map/directions link, assigned operator name, services booked, total price paid, special notes submitted, photos attached at booking time, before/after photos from operator [NEW], message history from provider [NEW], review prompt (after completion).

## 6.4 Subscription Browsing [NEW]
Drivers can view available subscription packages at a provider's location detail page. To purchase, the request goes to their fleet admin for approval (since the fleet pays). The driver sees their active subscriptions and upcoming scheduled washes in their "My Bookings" view.

---

# 7. FLEET OPERATOR EXPERIENCE — DETAILED SPECIFICATIONS

## 7.1 Fleet Overview Dashboard
Shows: active vehicle count, upcoming washes this week, washes completed this month, total spend this month, wash health summary (X vehicles overdue) [NEW], recent booking activity feed.

## 7.2 Vehicle Management
Full CRUD for fleet vehicles. Each vehicle card shows: unit number, type/class, assigned driver(s), last wash date, next wash due date, wash health indicator (green/yellow/red) [NEW]. Bulk actions: assign to depot, assign to vehicle group, assign driver.

**Wash health alerts** [NEW]: Fleet admins and maintenance managers receive notifications when vehicles are approaching or past their recommended wash date. Seasonal intelligence: thresholds tighten during November–March in the Northeast corridor due to salt exposure.

## 7.3 Subscription Management [NEW]
- Browse available subscription packages from providers (searchable by provider, location, service type)
- Purchase subscriptions for specific vehicles
- View active subscriptions with: provider, services included, frequency, price per wash, vehicles enrolled, next scheduled wash, fee savings (showing $20 cap vs. standard $25)
- Cancel subscriptions with notice
- View subscription spending vs. à la carte spending comparison

## 7.4 Fleet Reports (Enhanced) [NEW additions to existing]
All existing report capabilities plus:
- Spend per vehicle (bar chart, sortable)
- Wash frequency trends per vehicle
- Provider performance comparison: for each provider the fleet uses, show average rating, average wash duration, on-time rate, spend
- On-platform vs. off-platform booking visibility: how many of the fleet's washes are booked through WashBuddy vs. directly with providers
- Subscription fee savings report: total saved due to reduced $20 cap

## 7.5 Message Visibility [NEW]
Fleet admins can view message threads between their drivers and providers for on-platform bookings. Read-only — fleet admins cannot send messages on behalf of drivers. This provides transparency into service communication.

---

# 8. NOTIFICATIONS

## 8.1 Notification Channels
Launch: Email + in-app notifications (bell icon with unread count).
Phase 2: SMS (for time-critical provider notifications) + push notifications.

## 8.2 Notification Events

**To Provider (Admin and Operator):**
- New booking request received (REQUESTED) — highest priority
- Booking cancelled by customer
- Customer checked in
- New review received
- Missed response SLA warning
- Repeated missed SLA warning (escalated)
- Message from driver (for on-platform bookings) [NEW — future when driver reply is added]

**To Driver:**
- Booking confirmed by provider
- Booking declined — with suggested alternatives
- Booking expired (provider didn't respond) — with suggested alternatives
- Booking reminder (1 hour before for same-day, 8 AM day-of for future)
- Service completed — with review prompt
- Booking cancelled by provider
- Booking rescheduled by provider (accept/reject) [NEW]
- Message from provider (predefined template messages) [NEW]
- Before/after photos available [NEW]
- Subscription wash upcoming [NEW]

**To Fleet Operator:**
- New wash request from driver (when fleet requires approval)
- Booking completed for fleet vehicle
- Vehicle wash overdue alert [NEW]
- Subscription renewal confirmation [NEW]
- Monthly fleet wash summary [NEW — future]

## 8.3 Notification Preferences [NEW]
Each user can configure:
- Per-event toggle: enable/disable for each notification type
- Channel preference: in-app only, email only, or both
- Sound toggle: play sound for new notifications (in-app)
- Scope: same-day events only, this week, or all events
- Quiet hours: do not send notifications during specified hours (Provider Operators working night shifts may want this)

## 8.4 Notification Center (In-App)
Bell icon with unread count badge. Click opens panel: scrollable list of notifications sorted by date, unread highlighted. Each notification: subject (bold), body, relative timestamp, action URL. Mark as read individually or all at once.

---

# 9. REVIEWS AND RATINGS

## 9.1 Review Eligibility
Only customers with completed bookings (COMPLETED or later) can review. One review per booking per author.

## 9.2 Review Content
Star rating (1-5, required), text comment (optional), timestamp. Editable by author.

## 9.3 Provider Replies
Provider admins can submit one reply per review. Visible to all users.

## 9.4 Review Moderation
Platform admins can hide reviews violating guidelines with reason. Hidden reviews retained in DB for audit.

## 9.5 Rating Aggregation
Location average rating from all non-hidden reviews. Displayed in search results and location detail.

## 9.6 Operator-Linked Reviews [NEW]
Reviews are associated with the operator who performed the wash (via the booking record). This feeds into operator performance metrics visible to the Provider Admin.

---

# 10. PAYMENT AND SETTLEMENT

## 10.1 Payment Architecture
Stripe Connect marketplace model. Platform = Connect platform account. Each provider = connected account (Express). Customer payments processed through platform, split: provider's service price transferred to provider's connected account, platform fee retained.

## 10.2 Payment Flow
- At booking creation: PaymentIntent created, authorized (not captured)
- At service completion: 24-hour dispute window begins
- After dispute window: payment captured, provider share transferred, platform fee retained
- At settlement: provider payout batch processed

## 10.3 Subscription Payments [NEW]
For subscription packages:
- First wash: PaymentIntent created and authorized at subscription purchase
- Subsequent washes: auto-charged at booking creation for each scheduled wash
- Failed payment: driver and fleet admin notified, wash still scheduled but flagged
- Fee calculation: 15% capped at $20/wash for packages of 3+ washes

## 10.4 Walk-In Payments [NEW]
When a provider opts to process a walk-in payment through WashBuddy:
- Operator enters the service details and price
- System generates a payment link or processes card on file (if client is a returning WashBuddy user)
- Standard platform fee (15% capped at $25) applies
- Provider receives payout through normal Stripe Connect flow
When provider processes payment externally: zero platform fee, booking tracked for operational purposes only.

## 10.5 Cancellations and Refunds
Per Section 3.8.

## 10.6 Disputes
24-hour window after completion. Status: OPEN → UNDER_REVIEW → resolution → CLOSED. Photo evidence from before/after documentation available to admin reviewers [NEW].

---

# 11. ADMIN DASHBOARD

## 11.1 Platform Overview
Total bookings, active bookings today, total providers (by status), total revenue (platform fees), recent activity.

## 11.2 Provider Management
View all providers with: status, Stripe Connect status, location count, total bookings, average rating, response rate. Approve/reject/suspend providers. View detailed provider profiles.

## 11.3 Provider Quality Monitoring [NEW]
Dashboard view of: providers with declining response rates, providers approaching penalty thresholds, providers with recent disputes, providers with average rating below 3.5. Automated alerts when providers cross warning thresholds. One-click warning email, visibility reduction, or suspension.

## 11.4 Booking Management
View all bookings with filters. View full booking details including status history, payment info, photos [NEW], messages [NEW], reviews, disputes. Intervene in bookings if needed.

## 11.5 Review Moderation
View all reviews, filter for flagged/reported, hide with reason, view hidden reviews.

## 11.6 Network Benchmarking Data [NEW]
Aggregate anonymized metrics across all providers (when network reaches 25+ providers in a market): average rating, average utilization rate, average revenue per wash, average response time. This data feeds into provider admin dashboards for competitive benchmarking.

---

# 12. SEED DATA REQUIREMENTS
Per existing PRD v1 Section 10, with these additions:
- All seed locations must have named wash bays with vehicle class compatibility [NEW]
- At least 3 seed providers should have subscription packages defined [NEW]
- At least 2 seed providers should have discount rules defined [NEW]
- At least 5 off-platform bookings should exist in seed data [NEW]
- At least 2 walk-in bookings should exist in seed data [NEW]
- Photo documentation records should exist for at least 5 completed bookings [NEW]
- Message records should exist for at least 3 on-platform bookings [NEW]
- Client profile tags should be applied to at least 10 client records [NEW]

---

# 13. RESPONSIVE DESIGN REQUIREMENTS

## 13.1 Design Philosophy
All interfaces must be fully functional on both desktop and mobile viewports. Responsive web application (not native mobile). Native mobile app is a future enhancement.

## 13.2 Role-Specific Viewport Priority
- **Drivers:** Mobile-first. Large tap targets (44px minimum), minimal typing, fast performance on cellular. The "Find a Wash Now" button must be reachable with one thumb.
- **Fleet Operators:** Desktop-first with full mobile functionality. Dashboard and reports designed for large screens but usable on tablets.
- **Provider Operators:** Mobile-first [CHANGED from v1]. Operators are on their feet at the wash bay. The Daily Wash Board, Bay Timeline (single-bay mobile view), booking status updates, photo capture, and messaging must all work flawlessly on a phone. The phone may be wet or handled with gloves — all critical actions must use large touch targets.
- **Provider Administrators:** Web (desktop) only. Full admin dashboard, reporting, analytics, and configuration accessed from a computer.
- **Platform Admins:** Desktop only.

## 13.3 UX Principles [NEW]
- **Speed over beauty:** Every interaction should feel instant. Optimistic UI updates where possible. Loading states should show skeleton screens, not spinners.
- **One-hand usability** for mobile operator views: critical actions (check-in, start, complete) accessible at bottom of screen, reachable with thumb.
- **Glanceable status:** Use color coding and iconography consistently so operators can assess the state of their shift in under 3 seconds.
- **Progressive disclosure:** Show the minimum information needed at each level. Details available on tap/click, never forced on the user.
- **Consistent visual language:** Source badges (WashBuddy blue, Direct gray, Walk-in orange), status badges (Scheduled blue, Checked In yellow, In Progress green, Complete dark green), and health indicators (green/yellow/red) must be identical across every view.

---

# 14. NON-FUNCTIONAL REQUIREMENTS

## 14.1 Performance
- Page load under 3 seconds on 4G for driver/operator pages
- API response under 500ms for read operations
- Booking creation under 1 second
- Bay timeline rendering under 2 seconds with 50 bookings visible [NEW]
- Photo upload under 5 seconds on 4G (client-side compression required) [NEW]

## 14.2 Reliability
PostgreSQL serializable transactions for booking holds. Atomic status transitions with audit history. Idempotency keys prevent duplicate bookings.

## 14.3 Security
Session-based auth with HTTP-only secure cookies. Scrypt password hashing. Role-based access control at API middleware and frontend route guard level. Public endpoints: location search and availability only. In-platform messages visible only to sender, recipient, and authorized admins [NEW].

## 14.4 Data Integrity
Monetary values as integers in minor units. Timestamps in UTC with timezone metadata. UUIDs as primary keys. Off-platform bookings clearly flagged and excluded from platform fee calculations [NEW].

---

# 15. AUTONOMOUS FUTURE ARCHITECTURE (NON-FUNCTIONAL, INFORMATIONAL)
Per existing PRD v1 Section 11 — unchanged. API-first, vehicle-centric identity, policy engine in platform, machine-readable facility data. Do not build autonomous-specific features. Ensure all features follow these patterns.

---

End of Product Requirements Document v2.0
