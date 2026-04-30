# WASHBUDDY — ENGINEERING CONTEXT

This file is loaded automatically at the start of every Claude Code session. Read it carefully — it contains operational details (demo accounts, gotchas, commands) and strategic guidance (where canonical specs live, update discipline, workflow expectations) that apply to every round of work.

For round-specific scope, paths, and instructions, see the per-round prompt and the documents it references.

---

## Demo Accounts (password for all: password123)

| Email | Role | Expected Landing Page |
|---|---|---|
| admin@washbuddy.com | PLATFORM_SUPER_ADMIN | /admin |
| demo.fleet@washbuddy.com | FLEET_ADMIN | /fleet |
| demo.driver@washbuddy.com | DRIVER | /search |
| driver1@example.com | DRIVER | /search |
| owner@cleanbus-nyc.com | PROVIDER_ADMIN | /provider |
| staff@cleanbus-nyc.com | PROVIDER_STAFF | /provider |

---

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

---

## Common Gotchas

1. The fleet dashboard pages EXIST in code but don't render because demo.fleet@washbuddy.com lacks a proper FleetMembership record in the database. Fix the seed data first.
2. Provider duplication: the seed script ran multiple times. Delete all seed providers and re-seed clean.
3. Search results don't load on page mount — the TanStack Query hook needs `enabled: true` by default.
4. The `platformFeeMinor` field on the Service model is DEPRECATED for fee calculation. Fees are now calculated dynamically at booking time. Set this field to 0 in seed data.
5. Operating hours (OperatingWindow model) exist in the schema but are not populated in seed data. They must be seeded and enforced.
6. The OpenAPI spec at `lib/api-spec/openapi.yaml` must be updated when adding new API endpoints, then regenerate the client with Orval to get new typed hooks.

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development (both API and web)
# Check .replit file for the configured run command

# Database operations
cd lib/db
npx prisma migrate dev    # Apply migrations in development
npx prisma db push         # Quick schema sync (dev only)
npx prisma studio          # Visual database browser

# Regenerate API client after updating openapi.yaml
cd lib/api-spec
pnpm run generate
```

---

## Architecture Decisions

- Session-based auth (not JWT) — sessions stored in PostgreSQL via connect-pg-simple
- Booking holds use SERIALIZABLE transaction isolation to prevent double-booking
- All booking state transitions go through a state machine with audit history
- Frontend uses wouter for routing (not react-router) — lighter weight
- UI components are shadcn/ui (Radix primitives + Tailwind) — check artifacts/washbuddy-web/src/components/ui/

---

## Where the canonical specs live

**The canonical product specification lives in `/docs/`.** Every round of implementation work references documents in this folder by path. Start with `/docs/00-readme.md` — it orients which document covers what.

The five documents:

- `/docs/01-prd.md` — strategic rationale (why we're building what we're building).
- `/docs/02-eid.md` — implementation document (file paths, schema diffs, component structure, per-round scope). The working surface for build.
- `/docs/03-service-taxonomy-decision.md` — schema decision that gates Round 0.
- `/docs/04-future-considerations.md` — strategic backlog (what's deferred). Don't accidentally implement these.
- `/docs/05-visual-reference.md` — annotated visual specs with embedded SVG mocks. Visual files in `/docs/visuals/`.

**These documents supersede `/PRD.md` and `/EID.md` at the repo root.** The older PRD and EID remain as historical context only. Where the older documents and `/docs/` conflict, `/docs/` wins.

---

## Update discipline

Specs in `/docs/` are canonical. Code-spec divergence is treated as a bug.

**When implementation reveals something that changes the design, update the spec first, then change the code.** Not the reverse. This is non-negotiable. If a round of implementation surfaces a needed change to the design — a schema field needs a different type, a component needs different padding, a UX decision needs revisiting — the relevant doc gets updated as a small commit, *before* the next round of code starts.

Failing to maintain this discipline causes cumulative drift: future rounds reference outdated documentation, build on mismatched assumptions, and the spec gradually loses its authority.

---

## Workflow

Every round follows the same shape:

1. **Audit before code.** Read the relevant doc sections referenced in the prompt. Check the existing codebase for related files and conventions. Identify any ambiguities or potential conflicts. Surface questions before writing code, not during.
2. **Implement focused.** Stay strictly inside the round's scope as defined in the prompt and the EID. Don't expand scope mid-round, even if you notice something that "should also be fixed" — flag it for a follow-up round instead.
3. **Verify per the EID's verification section** for the round in question. Run mobile viewports (320, 375, 414, 768, 1024, 1440), check TypeScript count hasn't increased, run the don't-regress sweep against `02-eid.md` §6.7.
4. **Hand off.** End the round with a brief summary: what shipped, any spec updates made, anything for the next round to be aware of.

---

## Engineering ground rules across all rounds

- **Standard deploy sequence after schema change:** `pnpm install` → `pnpm --filter @workspace/db generate` → `pnpm --filter @workspace/db db:push` (with `--accept-data-loss` for destructive changes) → rebuild api-server and web → restart api-server.
- **TypeScript backlog:** ~110 pre-existing TS errors exist. Don't fix them in scope of feature work, but don't add to them either. Each round's verification confirms no net-new errors.
- **Mobile-first.** Every UI change verified at 320, 375, 414, 768, 1024, 1440 viewports. Tap targets ≥44×44px on new components.
- **One commit per logical unit.** Push at end of round, not mid-round.
- **Live testing happens on Replit deploys, not locally.** The cycle is: implement → push → user runs Replit deploy → user takes screenshots / live-tests → user pastes findings back to agent → agent diagnoses or iterates. Don't claim verification complete on something that hasn't been live-tested by the user.

---

## Pin selection model — do not regress

The previous Route Planner had a multi-symptom bug where `activePinId` lived in the marker creation effect's deps array, causing marker layer teardown on every selection change. The fix unified the selection model into a single `selectedLocationId` state with a separate selection effect using stable deps.

This pattern is preserved in the merged `/find-a-wash` page and must not regress in any future round. Specifically:

1. Marker creation effect deps do NOT include selection state.
2. Selection effect uses stable deps and operates on existing markers.
3. `fitBounds` does not run on selection changes (only on initial load and explicit "fit to results" actions).

Any audit step before code changes affecting the map must explicitly verify these three properties.

---

## Top don't-regress callouts

Things shipped recently that must continue to work across all rounds. Full list in `/docs/02-eid.md` §6.7. The most-likely-to-regress items:

- Cancellation flow with reason capture, customer note surfacing, rebook CTA on PROVIDER_CANCELLED bookings.
- ReviewVote model + voting UI with optimistic updates.
- Hamburger menu single-state-owner pattern (no AnimatePresence exit on hamburger icon).
- Receipt vehicle data integrity (read from booking record, not active vehicle context).
- "Use my location" geolocation auto-fires planRoute when destination is set.
- Find a Wash defensive gate banner when user lands on a location they already have an upcoming booking at.
