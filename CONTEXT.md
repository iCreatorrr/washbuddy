# WASHBUDDY — ENGINEERING CONTEXT

This file is loaded automatically at the start of every Claude Code session. It contains foundational information that applies to **every initiative**, every round of work, every part of the platform — driver-side, provider-side, fleet-operator-side, and platform-side data work.

For initiative-specific scope, see `/docs/README.md` for the index of active initiatives.

For current operational context (seed accounts, known issues, dev environment), see `/docs/operations/`.

This file changes rarely. Updates happen only when foundational decisions evolve.

---

## What WashBuddy is

WashBuddy is a B2B bus-wash marketplace. The platform serves four user surfaces, each with distinct concerns:

- **Drivers** — bus drivers who book washes between routes. Need fast, low-cognitive-load discovery and booking. Often using their phone in a coach cab.
- **Providers** — wash facility operators who manage bookings, bays, services, and pricing. Need clear ops tools and reliable availability signals.
- **Fleet operators** — managers of multi-vehicle operations who set policy, monitor activity, and govern spend. Need oversight, controls, and reporting.
- **Platform** — WashBuddy itself. Runs the marketplace, captures data, monitors quality, builds the data moat that compounds over time.

When working on any feature, identify which surface it touches. Some features span multiple surfaces (a booking touches driver, provider, and fleet); others are isolated. The four-surface frame helps reason about ripple effects.

---

## Stack

Frontend: TypeScript / React / Vite / Wouter (routing) / TanStack Query / framer-motion / Tailwind / shadcn-style components.

Backend: TypeScript / Node / Express / Prisma / PostgreSQL.

External services: Leaflet + OpenStreetMap tiles for maps; OSRM for routing; Nominatim for autocomplete; Stripe for payments (scaffolding stage).

Repository: pnpm workspaces monorepo with `artifacts/api-server`, `artifacts/washbuddy-web`, `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`.

---

## Foundational architectural decisions

These decisions are committed for the long term. Changing them later is painful by design — that's why they're foundational. Any work that wants to deviate must surface the conflict and get explicit approval before proceeding.

- **Session-based auth.** Sessions stored in PostgreSQL via connect-pg-simple. Not JWT. `authMiddleware` runs globally and attaches `req.user`. Routes requiring auth use `requireAuth`. Routes with auth-conditional behavior read `req.user` directly without `requireAuth`.
- **Booking holds use SERIALIZABLE transaction isolation.** This prevents double-booking under concurrent load and is the reason holds work correctly. Don't relax to a weaker isolation level without deep consideration.
- **All booking state transitions go through a state machine with audit history.** New booking-related features integrate with the state machine; they don't bypass it.
- **OpenAPI is the source of truth for all API contracts.** `lib/api-spec/openapi.yaml` defines every endpoint and response shape. Generated typed clients (`lib/api-client-react`, `lib/api-zod`) come from this file. Regenerate clients after every contract change. Don't write API client code by hand.
- **All monetary values are stored as integers in minor units (cents).** No floating-point money anywhere. Display formatting happens at the UI boundary.
- **Frontend uses Wouter for routing.** Lighter weight than React Router. Don't introduce a second routing library.
- **UI components built on shadcn/ui.** Radix primitives + Tailwind. Live at `artifacts/washbuddy-web/src/components/ui/`. Don't introduce a parallel component library.
- **All UI surfaces are mobile-first.** Drivers and providers use phones in operational contexts. Verify at 320, 375, 414, 768, 1024, 1440 viewports. Tap targets ≥44×44px on new components.

---

## Where specs live

Active product specifications live in `/docs/`, organized by initiative:

```
/docs/
├── README.md                          ← index of all initiatives
├── operations/                        ← current operational reality (seed accounts, known issues)
├── search-discovery-overhaul/         ← active driver-side initiative
├── (future initiatives go here)
└── archive/                           ← completed or superseded specs
```

`/docs/README.md` is the live index. Read it to find what's active and where its specs live. Each initiative has its own complete spec set: PRD, EID, decisions, future considerations, visual reference, README.

`/docs/operations/` contains current-state operational documents that change as the codebase evolves but apply across initiatives — seed accounts, known issues, dev setup. Different from initiative folders, which contain forward-looking specs.

Per-round prompts reference specific paths within the relevant folder. Don't infer paths — the prompt names them explicitly.

The older `/PRD.md` and `/EID.md` at the repo root are historical context only. Where they conflict with `/docs/`, `/docs/` wins.

---

## Update discipline

Specs are canonical. Code-spec divergence is treated as a bug.

**When implementation reveals something that should change a spec, update the spec first, then change the code.** Not the reverse.

Failing this discipline causes cumulative drift: future rounds reference outdated documentation, build on mismatched assumptions, and the spec gradually loses its authority. Don't let that happen.

This applies to every initiative, every round, every spec change.

---

## Workflow

Every round of work follows the same shape:

1. **Audit before code.** Read the doc sections referenced in the prompt. Check the existing codebase for related files and conventions. Identify ambiguities or potential conflicts. Surface questions before writing code, not during.
2. **Implement focused.** Stay strictly inside the round's scope. If you notice something else that should be fixed, flag it for a follow-up round — don't expand scope.
3. **Verify per the EID's verification section.** Mobile viewports, TypeScript count check, don't-regress sweep against the initiative's EID.
4. **Hand off.** End with a brief summary: what shipped, any spec updates made, anything for the next round to know.

---

## Engineering ground rules

- **Standard deploy sequence after schema change:** `pnpm install` → `pnpm --filter @workspace/db generate` → `pnpm --filter @workspace/db db:push` (with `--accept-data-loss` for destructive changes) → rebuild api-server and web → restart api-server.
- **TypeScript backlog:** ~110 pre-existing TS errors exist as of writing. Don't fix them in scope of feature work, but don't add to them either. Each round's verification confirms no net-new errors.
- **One commit per logical unit.** Push at end of round, not mid-round.
- **Live testing happens on Replit deploys, not locally.** Cycle: implement → push → user runs Replit deploy → user takes screenshots / live-tests → user pastes findings back to agent → agent diagnoses or iterates. Don't claim verification complete on something that hasn't been live-tested by the user.

---

## Adding new initiatives

When a new product initiative begins, create a subfolder under `/docs/<initiative-name>/` containing its complete spec set:

- `00-readme.md` — orientation
- `01-prd.md` — strategic rationale
- `02-eid.md` — implementation document
- decisions docs as needed
- `04-future-considerations.md` — backlog
- `05-visual-reference.md` if there are visual surfaces, with `visuals/` subfolder

Update `/docs/README.md` to add the new initiative to the index. CONTEXT.md doesn't change — initiatives come and go without touching the foundation.

When an initiative completes (its work has fully shipped), move its folder to `/docs/archive/` and update the index. The archive preserves rationale for future agents asking "why does the code do X?" without polluting the active spec list.

---

## Development commands

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
