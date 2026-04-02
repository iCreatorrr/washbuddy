# WashBuddy Demo Data Subsystem

Production-grade synthetic demo data for investor demos, sales walkthroughs, QA, regression testing, and local development.

## Architecture

### Seed Modes

| Mode | Providers | Locations | Drivers | Bookings | Use Case |
|------|-----------|-----------|---------|----------|----------|
| `demo-lite` | ~16 | ~24 | 20 | ~240 | Quick local dev, CI |
| `demo-full` | ~32 | ~80 | 120 | ~3,200 | Investor demos, sales |
| `demo-stress` | ~60 | ~240 | 300 | ~33,600 | Load testing, perf |

### Regions (4 metro areas)

- **NYC** — New York Metro (10 cities: Bronx, Brooklyn, Queens, Newark, etc.)
- **DET** — Detroit Metro (10 cities: Detroit, Dearborn, Ann Arbor, etc.)
- **TOR** — Toronto Metro (10 cities: Toronto, Scarborough, Mississauga, etc.)
- **MTL** — Montreal Metro (10 cities: Montreal, Laval, Longueuil, etc.)

### Demo Data Tracking

Every seeded record is tracked in `demo_data_registry` with:
- `table_name` — which table the record belongs to
- `record_id` — the record's UUID
- `seed_batch_id` — identifies this specific seed run
- `seed_mode` — lite/full/stress
- `seed_region_code` — NYC/DET/TOR/MTL
- `demo_scenario_code` — which golden scenario (if any)
- `demo_persona_code` — which stable persona (if any)

### Stable Personas (7)

| Code | Email | Role |
|------|-------|------|
| `driver_demo_primary` | demo.driver@washbuddy.com | Driver |
| `fleet_admin_demo_primary` | demo.fleet@washbuddy.com | Fleet Admin |
| `dispatcher_demo_primary` | demo.dispatch@washbuddy.com | Dispatcher |
| `provider_staff_demo_primary` | demo.staff@washbuddy.com | Provider Staff |
| `provider_admin_demo_primary` | demo.provider@washbuddy.com | Provider Admin |
| `support_admin_demo_primary` | demo.support@washbuddy.com | Support Admin |
| `super_admin_demo_primary` | demo.admin@washbuddy.com | Super Admin |

All demo accounts use password: `password123`

### Golden Scenarios (13)

Pre-built data scenarios for specific demo flows:
- `DRIVER_HAPPY_PATH` — Complete booking cycle
- `DRIVER_UPCOMING_BOOKING` — Confirmed booking for check-in demo
- `DRIVER_DISPUTE_FLOW` — Open dispute for resolution demo
- `FLEET_ADMIN_OVERVIEW` — Mixed booking states across fleet
- `PROVIDER_QUEUE` — Pending confirmation queue
- `PROVIDER_DAILY_SCHEDULE` — Full day of operations
- `PROVIDER_PAYOUT_CYCLE` — Payout settlement demo
- `ADMIN_DISPUTE_QUEUE` — Support admin dispute handling
- `ADMIN_KPI_REALISM` — 30-day data for dashboard charts
- And more...

## Directory Structure

```
lib/db/src/demo-seed/
├── config.ts              # Seed modes, entity targets, distributions
├── regions.ts             # 4 metro regions with cities and coordinates
├── personas.ts            # 7 stable demo user definitions
├── scenarios.ts           # 13 golden demo scenario templates
├── index.ts               # Re-exports
├── generators/
│   ├── seed-random.ts     # Deterministic seeded PRNG
│   ├── id-generator.ts    # Deterministic UUID generator (de000000-* prefix)
│   └── index.ts
├── templates/
│   ├── providers.ts       # Provider name/type templates
│   ├── fleets.ts          # Fleet name/size templates
│   ├── drivers.ts         # Name pools, phone patterns
│   ├── vehicles.ts        # Unit number and license plate patterns
│   ├── bookings.ts        # Status reasons, review comments, time slots
│   └── reviews.ts         # Review comment pools
├── media/
│   └── manifest.ts        # Asset generation manifest (SVG procedural)
├── scripts/
│   ├── seed.ts            # Main seed runner
│   ├── purge.ts           # Delete all demo data by registry
│   ├── export.ts          # Export to JSON/CSV with filters
│   └── validate.ts        # Post-seed integrity checks
└── README.md
```

## Commands

```bash
# Seed (architecture validation only — generation not yet implemented)
pnpm --filter @workspace/db run demo:seed demo-lite
pnpm --filter @workspace/db run demo:seed demo-full
pnpm --filter @workspace/db run demo:seed demo-stress

# Purge all demo data
pnpm --filter @workspace/db run demo:purge

# Purge specific batch
pnpm --filter @workspace/db run demo:purge seed-demo-full-v1.0.0-xxxxx

# Dry-run purge
pnpm --filter @workspace/db run demo:purge -- --dry-run

# Export to JSON
pnpm --filter @workspace/db run demo:export

# Export to CSV with filters
pnpm --filter @workspace/db run demo:export -- --csv --region=NYC
pnpm --filter @workspace/db run demo:export -- --persona=driver_demo_primary
pnpm --filter @workspace/db run demo:export -- --scenario=DRIVER_HAPPY_PATH

# Validate seeded data
pnpm --filter @workspace/db run demo:validate demo-full
```

## Design Principles

1. **Deterministic** — Same seed always produces same data (PRNG seeded with 0x57415348)
2. **Traceable** — Every record tracked in registry, identifiable demo UUIDs (de000000-*)
3. **Purgeable** — One command removes all demo data without touching real records
4. **Exportable** — JSON/CSV export with region/persona/scenario filters
5. **Modular** — Templates and generators are separate from orchestration
6. **Non-destructive** — Existing seed.ts (core demo users) is preserved; demo-seed adds on top
