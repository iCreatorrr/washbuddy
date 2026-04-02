# WASHBUDDY — ENGINEERING CONTEXT

## Demo Accounts (password for all: password123)

| Email | Role | Expected Landing Page |
|-------|------|----------------------|
| admin@washbuddy.com | PLATFORM_SUPER_ADMIN | /admin |
| demo.fleet@washbuddy.com | FLEET_ADMIN | /fleet |
| demo.driver@washbuddy.com | DRIVER | /search |
| driver1@example.com | DRIVER | /search |
| owner@cleanbus-nyc.com | PROVIDER_ADMIN | /provider |
| staff@cleanbus-nyc.com | PROVIDER_STAFF | /provider |

## Key Business Rules (Quick Reference)

- Platform fee: 15% of service total, capped at $25 per vehicle booking
- Fee is built into the customer-facing price (single all-in price, no separate line item)
- Provider sees their own price (no fee deducted from display)
- Provider response SLA: 5 minutes for bookings within 24h, 10 minutes for 24h+ out
- Expired bookings: auto-expire, notify customer with alternatives, warn provider
- Fleet policies: approved provider list, per-wash spending limit, wash frequency limit
- Vehicles are fleet-managed assets — drivers cannot create/delete vehicles
- Cross-border: providers price in local currency (USD or CAD), customers see their fleet's currency
- All monetary values are stored as integers in minor units (cents)

## Common Gotchas

1. The fleet dashboard pages EXIST in code but don't render because demo.fleet@washbuddy.com 
   lacks a proper FleetMembership record in the database. Fix the seed data first.
2. Provider duplication: the seed script ran multiple times. Delete all seed providers and re-seed clean.
3. Search results don't load on page mount — the TanStack Query hook needs `enabled: true` by default.
4. The `platformFeeMinor` field on the Service model is DEPRECATED for fee calculation. 
   Fees are now calculated dynamically at booking time. Set this field to 0 in seed data.
5. Operating hours (OperatingWindow model) exist in the schema but are not populated in seed data. 
   They must be seeded and enforced.
6. The OpenAPI spec at lib/api-spec/openapi.yaml must be updated when adding new API endpoints, 
   then regenerate the client with Orval to get new typed hooks.

## Development Commands
```bash
# Install dependencies
pnpm install

# Start development (both API and web)
# Check .replit file for the configured run command

# Database operations
cd lib/db
npx prisma migrate dev    # Apply migrations in development
npx prisma db push        # Quick schema sync (dev only)
npx prisma studio         # Visual database browser

# Regenerate API client after updating openapi.yaml
cd lib/api-spec
pnpm run generate
```

## Architecture Decisions

- Session-based auth (not JWT) — sessions stored in PostgreSQL via connect-pg-simple
- Booking holds use SERIALIZABLE transaction isolation to prevent double-booking
- All booking state transitions go through a state machine with audit history
- Frontend uses wouter for routing (not react-router) — lighter weight
- UI components are shadcn/ui (Radix primitives + Tailwind) — check artifacts/washbuddy-web/src/components/ui/
