WASHBUDDY — PRODUCT REQUIREMENTS DOCUMENT (PRD)
Version: 1.0
Date: April 2, 2026
Status: Approved for Engineering
Product Owner: [Your Name]
Document Type: Product Requirements — Source of Truth

1. EXECUTIVE SUMMARY
1.1 Product Definition
WashBuddy is a multi-sided marketplace platform that connects commercial bus fleet operators and drivers with wash service providers. It enables drivers and fleet operators to discover, book, and pay for bus wash services across multiple independent providers through a single unified platform, eliminating the fragmented, phone-call-driven scheduling process that dominates the industry today.
1.2 Mission Statement
Become the definitive platform through which commercial bus fleets, drivers, and wash providers conduct business — the infrastructure layer for fleet vehicle washing across North America.
1.3 Market Opportunity
The fleet washing market is valued at $2.1B in 2024, projected to reach $4.3B by 2033. The bus washing system market independently tracks at $2.1B growing at 6% CAGR. Today, virtually all bus wash scheduling happens via phone calls, personal relationships, and manual coordination. No dominant digital marketplace exists for this vertical. WashBuddy's existing relationship with over 1,200 bus wash providers across the Northeast corridor provides an immediate supply-side advantage that would take competitors years to replicate.
1.4 Launch Definition
Production ready is defined as a closed beta deployment with 3-5 fleet operators and 10-15 wash providers in the Northeast corridor (Toronto–Buffalo–Niagara–New York City). The product must deliver a flawless core loop: a driver or fleet operator searches for a wash facility, finds available locations, books a service, the provider confirms (or instant-books), the vehicle arrives and is washed, the provider marks completion, the fleet operator sees it in their dashboard, and payment settles. Every screen, every notification, every data field must work reliably for this core flow.
1.5 Launch Geography
The initial corridor spans Toronto, Ontario through Buffalo/Niagara to New York City and the broader tri-state area. This is a cross-border (US/Canada) market requiring dual-currency support (USD and CAD). Expansion targets include Washington DC, Florida, and Texas corridors. All seed data, demo content, and default configurations must reflect this Northeast corridor reality.

2. PLATFORM PARTICIPANTS AND ROLES
2.1 Role Taxonomy
WashBuddy serves four distinct participant types, each with specific roles and permissions. The platform uses a membership-based role system where a single user account can hold roles across multiple scopes (e.g., a person could be a FLEET_ADMIN for one fleet and a DRIVER for another).
2.2 Drivers (DRIVER role, fleet scope)
Drivers are the end users who physically operate buses and bring vehicles to wash locations. They are mobile-first users who interact with WashBuddy primarily from their phones while on route or during breaks.
What drivers can do:

Search for wash locations by proximity, availability, service type, and price
View location details including services offered, pricing, operating hours, ratings, and real-time availability
Plan routes with wash stops integrated into their driving path
Book wash services for vehicles assigned to them by their fleet
View and manage their own bookings (upcoming, in-progress, completed)
Check in at a wash location upon arrival (optional self-check-in)
Leave reviews and ratings after completed washes
Submit wash requests to their fleet for approval (when fleet policy requires it)
View their assigned vehicles and vehicle wash history

What drivers cannot do:

Add, edit, or delete vehicles (fleet-managed assets only)
Book washes for vehicles not assigned to them
Book at providers outside their fleet's approved list (when fleet policy restricts)
Exceed per-wash spending limits set by their fleet
Exceed wash frequency limits set by their fleet
Enter personal payment information (fleet pays)
Access fleet-level dashboards, reports, or settings
Access other drivers' booking history

2.3 Fleet Operators
Fleet operators manage fleets of buses and are the paying customers of the platform. They operate from desktops and need comprehensive management tools. The fleet operator category includes four sub-roles:
FLEET_ADMIN (full fleet management):

Complete visibility and control over all fleet operations on WashBuddy
Add, edit, deactivate vehicles and assign them to drivers
Manage fleet membership (invite drivers, assign roles)
Set fleet-wide policies: approved provider lists, per-wash spending limits, wash frequency limits
Book washes on behalf of any driver/vehicle in the fleet
Approve or decline driver-submitted wash requests
Create and manage recurring wash programs (automated scheduling)
Configure fleet depots and vehicle groups
View all fleet bookings, spending, and analytics
Manage fleet billing settings and payment methods
Access fleet reports and export data

DISPATCHER (operational coordination):

View all fleet bookings and wash requests
Book washes on behalf of drivers/vehicles
Approve or decline driver-submitted wash requests
View fleet vehicles and their wash status
Cannot modify fleet policies, billing, or membership settings

MAINTENANCE_MANAGER (vehicle and compliance focus):

View all fleet vehicles and their wash history/status
Set up and manage recurring wash programs
Book washes on behalf of drivers/vehicles
View fleet reports focused on vehicle maintenance compliance
Cannot modify fleet policies, billing, or membership settings

READ_ONLY_ANALYST (reporting only):

View all fleet bookings, vehicles, wash requests, and reports
Cannot create bookings, modify vehicles, or change any settings
Export data for external analysis

2.4 Wash Providers
Providers are the businesses that operate wash facilities and deliver the actual wash services. They use the platform to receive bookings, manage their operations, and get paid.
PROVIDER_ADMIN (full provider management):

Manage all provider locations (add, edit, deactivate)
Set operating hours for each location (day-by-day, multiple windows per day)
Configure wash bay capacity (concurrent washes per location)
Create and manage services at each location (name, description, price, duration, vehicle compatibility)
Choose booking mode per service: instant booking or request-and-confirm
View and respond to incoming booking requests (confirm or decline)
Process bookings through the service lifecycle (check-in, start service, complete)
View customer reviews and submit provider replies
Manage provider staff membership
View payout reports and earnings
Complete Stripe Connect onboarding for payment processing

PROVIDER_STAFF (operational only):

View incoming bookings for their assigned location(s)
Confirm, decline, check-in, start, and complete bookings
Cannot modify location settings, services, pricing, or provider-level configuration

2.5 Platform Administrators
Platform administrators are WashBuddy internal team members who oversee the marketplace.
PLATFORM_SUPER_ADMIN (full platform control):

View and manage all providers, locations, services, bookings, users, and reviews
Approve or reject new provider registrations
Initiate Stripe Connect onboarding for providers
Moderate reviews (hide inappropriate content)
View platform-wide analytics (total bookings, revenue, provider performance)
Manage platform configuration and seed data
Resolve disputes between customers and providers

PLATFORM_SUPPORT_ADMIN and PLATFORM_OPS_ADMIN are reserved for future role segmentation but currently have the same access as PLATFORM_SUPER_ADMIN.

3. CORE BUSINESS RULES
3.1 Pricing and Fee Structure
Provider pricing: Each provider sets their own prices for each service at each location. Prices are set in the provider's local currency (USD for US locations, CAD for Canadian locations). The provider's price represents what the provider receives — this is their revenue.
Platform fee: WashBuddy charges a platform fee of 15% of the combined service total for a vehicle booking, capped at a maximum of $25 (in the booking's currency) per vehicle booking. A "vehicle booking" is defined as a single visit by one vehicle to one location, regardless of how many services are included. For example, if a driver books an exterior wash ($125), interior clean ($75), and undercarriage wash ($50) at the same location for the same vehicle in a single visit, the combined service total is $250. The platform fee would be 15% × $250 = $37.50, but the cap applies, so the fee is $25. The total charged to the customer is $275.
Customer-facing price display: Customers (drivers and fleet operators) always see a single all-in price. The platform fee is built into the displayed price and is never shown as a separate line item. A small note such as "includes WashBuddy service fee" may appear on invoices and receipts, but the booking flow shows one number only.
Provider-facing price display: Providers see the price they set. Their dashboard shows earnings as the service price they defined. The platform fee deduction appears only in payout/settlement reports.
Cross-border currency handling: Each provider's location is priced in local currency. When a customer's fleet billing currency differs from the provider's local currency (e.g., a US fleet booking a wash in Canada), the customer sees the price converted to their fleet's billing currency using a real-time exchange rate at the time of booking. The invoice settles in the fleet's currency. The provider receives payment in their local currency. Currency conversion is handled by Stripe Connect's cross-border payout capabilities.
3.2 Booking Flow
WashBuddy supports two booking modes, configurable at the service level by the provider:
Instant Booking: The driver selects a time slot, confirms the booking, and it is immediately confirmed with no provider action needed. The service's requiresConfirmation flag is set to false. This mode is ideal for automated/drive-through wash systems where the provider does not need to manually approve each booking. Search results badge these locations with an "Instant Book" indicator.
Request & Confirm: The driver selects a time slot and submits a booking request. The provider must explicitly confirm or decline the request within the SLA window. The service's requiresConfirmation flag is set to true. Search results badge these locations with a "Request" indicator.
Booking lifecycle (full status progression):
REQUESTED → The customer has submitted a booking request. A hold is placed on the time slot. The provider has been notified and must respond within the SLA window.
PROVIDER_CONFIRMED → The provider has accepted the booking. The customer is notified. The time slot is locked.
PROVIDER_DECLINED → The provider has declined the booking. The customer is notified with suggested nearby alternatives. The hold is released.
EXPIRED → The provider did not respond within the SLA window. The hold is released. The customer is notified with suggested nearby alternatives. The provider receives an automated warning (see Section 3.3).
CUSTOMER_CANCELLED → The customer cancelled the booking before the service began.
PROVIDER_CANCELLED → The provider cancelled a previously confirmed booking.
CHECKED_IN → The provider has confirmed the vehicle has arrived at the facility.
IN_SERVICE → The wash service has begun.
COMPLETED_PENDING_WINDOW → The service is complete. A 24-hour dispute window is open.
COMPLETED → The dispute window has closed without a dispute. The booking is finalized.
SETTLED → Payment has been captured and provider payout has been processed.
For instant bookings, the status skips REQUESTED and goes directly to PROVIDER_CONFIRMED upon creation.
3.3 Provider Response SLA and Accountability
Response time requirements:

Bookings scheduled within the next 24 hours: provider must respond within 5 minutes
Bookings scheduled 24+ hours out: provider must respond within 10 minutes

When a provider fails to respond in time:

The booking status transitions to EXPIRED
The customer (driver/fleet operator) receives a notification explaining the provider did not respond, along with suggested nearby alternative locations that have availability
The non-responsive provider receives an automated email informing them they missed a booking request and lost the revenue
The email warns that repeated failures to respond within SLA during their self-designated operating hours will negatively impact their platform rating and search ranking
The platform tracks response-rate metrics per provider per location. These metrics are visible to platform admins and factor into search result ordering

3.4 Fleet Policy Engine (Launch Scope)
Fleet operators can define guardrails that govern how their drivers book washes. For launch, three policy types are supported:
Approved Provider List: Fleet admin can designate a whitelist of approved providers. When this policy is active, drivers in the fleet can only book at approved providers. Bookings at non-approved providers are blocked at the UI level (non-approved providers are hidden or visually marked as unavailable) and enforced at the API level.
Per-Wash Spending Limit: Fleet admin sets a maximum dollar amount per service per booking. If a driver attempts to book a service that exceeds this limit, the booking is blocked with a clear message explaining the fleet policy.
Wash Frequency Limit: Fleet admin sets the maximum number of washes allowed per vehicle within a time period (e.g., 1 wash per vehicle per 7 days). If a vehicle has already been washed within the restricted window, the driver sees a message indicating the vehicle is not yet due for a wash per fleet policy.
These policies are stored in the fleet's requestPolicyJson field and enforced both in the frontend (preventing the user from reaching the booking step) and in the backend (rejecting the booking API call if policy is violated). Policy override capability exists per-depot or per-vehicle-group via the FleetPolicyOverride model for future use.
3.5 Driver-Fleet Booking Relationship
Who can book: Both drivers and fleet operators (FLEET_ADMIN, DISPATCHER, MAINTENANCE_MANAGER) can create bookings. Drivers book for vehicles assigned to them. Fleet operators can book on behalf of any vehicle/driver in their fleet.
Who pays: The fleet is always the billing entity. Drivers never enter personal payment information. The fleet's billing currency and payment method are used for all bookings made by fleet members.
Policy enforcement: When a driver initiates a booking, fleet policies are evaluated before the booking can proceed. If a booking falls outside policy bounds, the driver is informed of the specific policy that blocked it. Fleet operators booking on behalf of drivers are not subject to policy restrictions (they are the policy setters).
Wash Request workflow (for fleets that require pre-approval): Fleets can optionally require that driver-initiated bookings go through a fleet approval step before being sent to the provider. In this flow: the driver submits a "wash request" specifying the desired provider, location, service, and time window. The fleet admin or dispatcher reviews and approves, modifies, or declines the request. Upon approval, the request is automatically converted into a booking at the specified provider. This is managed through the WashRequest model and its associated status machine.
3.6 Vehicle Data Model
Vehicles are fleet-managed assets. Fleet admins add vehicles to the system; drivers cannot create or delete vehicles.
Required vehicle fields:

Unit Number (fleet's internal identifier, e.g., "NEB-101")
Category Code: BUS (currently the only supported category)
Subtype Code: STANDARD, COACH, MINIBUS, SHUTTLE, DOUBLE_DECKER, SCHOOL_BUS, ARTICULATED
Length (inches) — critical for wash bay compatibility
Height (inches) — critical for wash bay clearance
Has Restroom (boolean) — affects interior service requirements

Optional vehicle fields:

License Plate
Depot assignment (which fleet depot the vehicle is based at)
Vehicle group memberships (for batch scheduling)

Wash tracking fields (system-managed):

Last Wash Date/Time — updated automatically when a booking reaches COMPLETED status
Next Wash Due Date/Time — calculated based on recurring program configuration or fleet policy

Vehicle-service compatibility: Each wash service defines compatibility rules specifying which vehicle categories, subtypes, and maximum dimensions it can accommodate. When a driver searches for washes, the results are filtered to show only services compatible with their assigned vehicle. If a vehicle is too large for a facility's wash bay, that service does not appear in results.

4. PROVIDER CONFIGURATION
4.1 Provider Onboarding Flow
Provider onboarding follows a hybrid self-service plus admin-approval model:
Step 1 — Registration: The provider visits the WashBuddy registration page and creates an account, selecting "I'm a Wash Provider" as their account type. They provide: business name, primary contact name, email, phone, and password.
Step 2 — Location Setup: After registration, the provider is guided through adding their first location: facility name, full address (with geocoding validation), timezone, operating hours (day-by-day with support for multiple windows per day, e.g., 6AM-12PM and 1PM-8PM), and wash bay capacity (number of concurrent washes the facility can handle).
Step 3 — Service Configuration: For each location, the provider adds their wash services: service name, description, duration (minutes), price (in local currency), vehicle compatibility rules (which vehicle types and maximum dimensions the service supports), and booking mode (instant or request-and-confirm).
Step 4 — Pending Review: The provider's listing is saved but not visible to customers. Status is set to pending admin approval. The provider sees a dashboard message indicating their listing is under review.
Step 5 — Admin Approval: A WashBuddy platform admin reviews the provider submission, verifies it represents a real business capable of washing commercial buses, and either approves or requests modifications. Upon approval, the provider's locations and services become visible in search results.
Step 6 — Stripe Connect Onboarding: The approved provider is prompted to complete Stripe Connect onboarding to enable payment processing. Until Stripe Connect is completed, the provider can receive bookings but payouts are held. The provider's status shows "PENDING CONNECT" until Stripe onboarding is complete, then transitions to "PAYOUTS ACTIVE."
4.2 Operating Hours
Every location must define operating hours as part of setup. Operating hours are stored in the OperatingWindow model with the following structure: location ID, day of week (0=Sunday through 6=Saturday), open time (HH:MM in local timezone), close time (HH:MM in local timezone).
A location can have multiple operating windows per day (e.g., 6:00-12:00 and 13:00-20:00 for a location that closes for lunch). A location with no operating windows defined for a given day is considered closed that day.
Operating hours are used for: filtering search results (the "Open Now" filter checks current time against operating windows in the location's timezone), determining available booking slots (customers cannot book outside operating hours), enforcing provider response SLAs (missed-response penalties only apply during the provider's self-designated operating hours), and displaying "OPEN" / "CLOSED" badges in search results.
4.3 Wash Bay Capacity
Each location defines its capacityPerSlot at the service level — the number of concurrent bookings it can handle for that service in a given time slot. The default is 1. The booking hold system enforces capacity: when a customer attempts to hold a slot, the system counts existing confirmed bookings plus active unexpired holds for that slot. If the count equals or exceeds capacity, the slot is shown as unavailable.
4.4 Provider Dashboard Operations
The provider dashboard is organized as a Kanban-style board showing three columns: Action Required (bookings in REQUESTED status needing provider response), Upcoming Today (confirmed bookings scheduled for today), and In Progress (bookings in CHECKED_IN or IN_SERVICE status).
Providers process bookings through the following actions: Confirm (REQUESTED → PROVIDER_CONFIRMED), Decline with reason (REQUESTED → PROVIDER_DECLINED), Check In vehicle arrival (PROVIDER_CONFIRMED → CHECKED_IN), Start Service (CHECKED_IN → IN_SERVICE), Complete Service (IN_SERVICE → COMPLETED_PENDING_WINDOW). Each transition is logged in the booking status history with the acting user and timestamp.

5. SEARCH AND DISCOVERY
5.1 Location Search
The primary search interface allows drivers and fleet operators to find wash locations. The search supports the following parameters:
Geographic proximity: Results are sorted by distance from the user's current location (obtained via browser geolocation API) or from a manually entered address. The search radius defaults to 50 miles but can be adjusted.
Filters:

"Open Now" — shows only locations currently within their operating hours
"Wash Bay Available This Hour" — shows only locations with available capacity in the current or next hour
"Instant Book" — shows only locations offering instant booking
Vehicle compatibility — automatically applied based on the driver's assigned vehicle dimensions; locations whose services cannot accommodate the vehicle are excluded
Service type — filter by specific service names (exterior wash, full detail, interior clean, undercarriage wash, etc.)
Price range — minimum and maximum price filter
Rating — minimum star rating filter

Search results display: Each result shows: provider name and location name, address with distance, OPEN/CLOSED status badge, INSTANT BOOK or REQUEST badge, available services with pricing (single all-in price per service), star rating and review count, and next available time slot.
5.2 Location Detail Page
When a customer taps a search result, they see a detailed location page showing: full address with map, operating hours for each day of the week, all available services with pricing (all-in price), duration, and vehicle compatibility, customer reviews and ratings, and a booking interface showing available time slots for the selected service.
5.3 Route Planner
The route planner allows drivers to plan a route from point A to point B and discover wash locations along the route. It displays a map with the route drawn and wash location pins near the route. Drivers can select a location from the route view and proceed to book directly. The route planner uses Leaflet/OpenStreetMap for mapping.

6. NOTIFICATIONS
6.1 Notification Channels (Launch)
For launch, two notification channels are implemented: email (for all critical booking lifecycle events) and in-app notifications (persisted in the notification center, accessible via the bell icon in the navigation).
SMS and push notifications are Phase 2.
6.2 Notification Events
Notifications to the Provider:

New booking request received (REQUESTED) — this is the highest-priority notification; provider must see it within seconds
Booking cancelled by customer
Customer has arrived / checked in (if self-check-in is enabled)
New review received for their location
Missed response SLA warning (automated email when they fail to respond in time)
Repeated missed SLA warning (escalated email warning about rating impact)

Notifications to the Driver/Customer:

Booking confirmed by provider
Booking declined by provider — includes suggested nearby alternatives with availability
Booking expired (provider didn't respond) — includes suggested nearby alternatives
Booking reminder (sent 1 hour before scheduled start time for same-day bookings, sent at 8 AM day-of for future bookings)
Service completed — includes prompt to leave a review
Booking cancelled by provider

Notifications to Fleet Operators:

New wash request submitted by a driver (when fleet requires approval)
Booking completed for a fleet vehicle
Daily digest summary of fleet wash activity (future enhancement)

6.3 Notification Center (In-App)
The notification bell icon in the navigation displays an unread count badge. Clicking it opens a notification panel showing recent notifications sorted by date, with unread items highlighted. Each notification includes a subject, body text, timestamp, and an action URL that deep-links to the relevant booking or page. Notifications can be marked as read individually or all at once.

7. REVIEWS AND RATINGS
7.1 Review Eligibility
Only customers who have completed a booking (status COMPLETED or later) at a location can leave a review for that location. Reviews are tied to a specific booking and a specific location. One review per booking per author.
7.2 Review Content
A review consists of: a star rating (1 to 5, required), a text comment (optional), and a timestamp. Reviews can be edited by the author (the isEdited flag and editedAt timestamp are set upon edit).
7.3 Provider Replies
Provider admins can submit a single reply to any review of their locations. The reply text and timestamp are stored on the review record. Provider replies are visible to all users viewing the location.
7.4 Review Moderation
Platform admins can hide reviews that violate platform guidelines. Hidden reviews include a hiddenReason and are not displayed to customers but remain in the database for audit purposes. The admin reviews page shows flagged and pending reviews.
7.5 Rating Aggregation
Each location's average rating is calculated from all non-hidden reviews. The average rating and total review count are displayed in search results and on the location detail page.

8. PAYMENT AND SETTLEMENT
8.1 Payment Architecture
WashBuddy uses Stripe Connect in a marketplace model. The platform is the Stripe Connect platform account. Each provider onboards as a connected account (Standard or Express, to be determined during Stripe integration). Customer payments are processed through the platform account and split: the provider's service price is transferred to the provider's connected account, and the platform fee is retained by the platform account.
8.2 Payment Flow
At booking creation: A Stripe PaymentIntent is created for the total amount (service price + platform fee) and authorized against the fleet's payment method. The payment is not captured yet (authorization hold only).
At service completion (COMPLETED_PENDING_WINDOW): The 24-hour dispute window begins. Payment remains authorized but not captured.
At booking finalization (COMPLETED, after dispute window): The payment is captured. The provider's share is transferred to their connected account. The platform fee is retained.
At settlement (SETTLED): The provider payout batch is created and processed through Stripe Connect. The booking transitions to SETTLED.
8.3 Cancellations and Refunds
If a booking is cancelled before the provider confirms (REQUESTED or HELD status), the payment authorization is voided with no charge. If a confirmed booking is cancelled by the customer, the refund policy is: full refund if cancelled more than 2 hours before scheduled start, 50% refund if cancelled less than 2 hours before scheduled start (to be refined based on beta feedback). If a confirmed booking is cancelled by the provider, the customer receives a full refund.
8.4 Disputes
Customers can open a dispute within 24 hours of service completion. Disputes are managed through the Dispute model with status progression: OPEN → UNDER_REVIEW → resolution (CUSTOMER_UPHELD, PROVIDER_UPHELD, or PARTIAL_RESOLUTION) → CLOSED. Dispute evidence can be uploaded as file assets. Platform admins review and resolve disputes.

9. ADMIN DASHBOARD
9.1 Platform Overview
The admin dashboard displays: total bookings (all-time and current period), active bookings (in-progress today), total providers (active, pending approval, suspended), total revenue (platform fees collected), and recent booking activity.
9.2 Provider Management
Admins can view all providers with their status (ACTIVE, PENDING APPROVAL, SUSPENDED), Stripe Connect status (PAYOUTS ACTIVE, PENDING CONNECT, NOT STARTED), number of locations, and aggregate metrics (total bookings, average rating, response rate). Admins can approve pending providers, suspend or reactivate providers, and view detailed provider profiles.
9.3 Booking Management
Admins can view all bookings across the platform with filtering by status, provider, location, customer, and date range. Admins can view full booking details including status history, payment information, and associated reviews/disputes. Admins can intervene in bookings if needed (e.g., cancel on behalf of either party, override status in exceptional cases).
9.4 Review Moderation
Admins can view all reviews, filter for flagged or reported reviews, hide inappropriate reviews with a reason, and view hidden reviews.

10. SEED DATA REQUIREMENTS
10.1 Current State
The existing 194 providers (50 unique names, each duplicated approximately 4 times) are dummy seed data. They contain a mix of Canadian (Ontario) and US (New York/New Jersey) locations with inconsistent data quality: missing contact emails, missing operating hours, missing capacity configuration, and geographically scattered addresses that don't reflect the launch corridor.
10.2 Target State
The seed data must be replaced with a curated, realistic dataset that accurately represents the launch market. The seed data should include approximately 40-50 unique provider locations distributed across the Toronto–Buffalo–Niagara–NYC corridor. Each location must have: a realistic business name, a real-seeming street address in the correct geographic area, complete operating hours (varied across locations — some 24h, some business hours only, some closed weekends), wash bay capacity (varied: 1-4 concurrent washes), 2-4 services per location with realistic pricing for the local market (USD for US locations, CAD for Canadian locations), vehicle compatibility rules (some locations can handle all bus types, some only standard and smaller), a mix of instant-book and request-and-confirm services, and placeholder images that represent bus wash facilities.
Duplicate providers must be eliminated entirely. The DemoDataRegistry model should be used to track all seed records for easy cleanup when real provider data replaces them.
10.3 Demo User Accounts
The demo accounts should remain as currently configured but with fleet membership data properly linked so that the fleet admin experience works correctly when logged in as demo.fleet@washbuddy.com. Specifically, the fleet admin user must have a FLEET_ADMIN membership in a fleet that contains vehicles, drivers, and booking history.

11. AUTONOMOUS FUTURE ARCHITECTURE (NON-FUNCTIONAL, INFORMATIONAL)
This section documents architectural principles that should guide current technical decisions without requiring implementation today. The goal is to ensure WashBuddy's architecture remains durable as autonomous bus fleets become reality (meaningful scale expected 2030-2035).
11.1 Core Insight
As autonomous vehicles proliferate, the transaction initiator shifts from a human driver to a fleet management system making API calls. WashBuddy must evolve from a human-facing marketplace to a machine-to-machine coordination layer.
11.2 Architectural Principles for Today
API-First Always: Every capability exposed through the UI must also be accessible via a well-documented API. The current OpenAPI spec and generated client approach already supports this.
Vehicle-Centric Identity: The data model should treat the vehicle (not the driver) as the primary entity in a booking. The current schema already supports this with vehicleId on bookings and the optional fleetPlaceholderClass for bookings without a specific vehicle assigned. This is correct and forward-looking.
Policy Engine in the Platform: Fleet washing policies (frequency, provider preferences, budget) should be expressible as structured rules the platform enforces, not as human judgment calls. The requestPolicyJson and FleetPolicyOverride models already support this.
Machine-Readable Facility Data: Provider capabilities (bay dimensions, equipment type, supported vehicle sizes) should be structured data, not free-text descriptions. The ServiceCompatibility model already supports this.
11.3 What This Means for Current Development
Do not build any autonomous-specific features. Do ensure that every feature built today follows the API-first pattern, uses vehicle-centric booking identity, and stores configuration as structured data rather than freeform text. These patterns cost nothing extra today and preserve optionality for the autonomous future.

12. RESPONSIVE DESIGN REQUIREMENTS
12.1 Design Philosophy
All user interfaces must be fully functional on both desktop and mobile viewports. The platform is launching as a responsive web application (not a native mobile app). A native mobile application will be developed before public launch, but the responsive web version must provide complete functionality for all user roles on mobile devices.
12.2 Role-Specific Viewport Priority
Drivers: Mobile-first design. All driver interfaces (search, booking, route planner, my bookings, my vehicles) must be optimized for touch interaction on phones. Large tap targets (minimum 44px), minimal typing (location-aware defaults, pre-populated fields from vehicle assignment), and fast performance on cellular connections.
Fleet Operators: Desktop-first design with full mobile functionality. The fleet dashboard, vehicle management, and reporting interfaces are primarily used at a desk but must remain usable on tablets and phones.
Providers: Desktop-first design with critical mobile functionality. The provider dashboard (especially the incoming booking notification and confirm/decline flow) must be usable on mobile since providers may not always be at a computer. The Kanban board should collapse to a single-column view on mobile.
Platform Admins: Desktop only. Admin interfaces are not prioritized for mobile optimization.

13. NON-FUNCTIONAL REQUIREMENTS
13.1 Performance
Page load time under 3 seconds on 4G cellular connections for all driver-facing pages. API response time under 500ms for all read operations. Booking hold creation under 1 second (including transaction). Search results must load on initial page render without requiring the user to click a search button (current bug to fix).
13.2 Reliability
The booking hold system uses PostgreSQL serializable transactions to prevent double-booking. All booking state transitions are atomic and logged in the status history. Idempotency keys prevent duplicate bookings from retry scenarios.
13.3 Security
Session-based authentication with HTTP-only secure cookies. Passwords hashed with scrypt (salt + key derivation). Role-based access control enforced at both the API middleware layer and the frontend route guard level. All API endpoints require authentication except public search endpoints (location search and availability check).
13.4 Data Integrity
All monetary values stored as integers in minor currency units (cents) to avoid floating-point errors. All timestamps stored in UTC with timezone metadata preserved on the relevant entity (location timezone, fleet default timezone). UUIDs used as primary keys for all entities.

End of Product Requirements Document
