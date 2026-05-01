# Round 0 Handoff — Service Taxonomy Migration

**Branch:** `round-0-service-taxonomy`
**Commits:** `0e2cb93` (Phase 1A), `cd76439` (taxonomy refinement)
**Status:** verified complete on Replit; ready to merge after review.

---

## 1. What shipped

**Schema (`lib/db/prisma/schema.prisma`):** new `enum ServiceCategory` with five values (`EXTERIOR_WASH`, `INTERIOR_CLEANING`, `RESTROOM_DUMP`, `RESTOCK_CONSUMABLES`, `ADD_ON`). `Service` gains `category ServiceCategory @default(EXTERIOR_WASH)`, `subcategory String?`, and `labels String[] @default([])`. Non-destructive migration — existing rows fill defaults; no `--accept-data-loss` required.

**API contract (`lib/api-spec/openapi.yaml`):** the three new fields are exposed on `Service`, `CreateServiceInput`, and `UpdateServiceInput`. `category` and `labels` are required on responses; both are optional on inputs (server fills defaults). Generated clients (`lib/api-client-react`, `lib/api-zod`) regenerated via `pnpm --filter @workspace/api-spec codegen`.

**API server (`artifacts/api-server/src/routes/services.ts`):** POST and PATCH handlers accept and persist `category`, `subcategory`, `labels`. Existing validation surface is unchanged.

**Provider forms:** new frontend constants file [artifacts/washbuddy-web/src/lib/service-taxonomy.ts](artifacts/washbuddy-web/src/lib/service-taxonomy.ts) exports `ServiceCategory`, `SERVICE_CATEGORIES`, `CATEGORY_DISPLAY_NAMES`, `CATEGORY_SHORT_NAMES`, and the industry-grounded `SUGGESTED_SUBCATEGORIES`. Both [onboarding.tsx](artifacts/washbuddy-web/src/pages/provider/onboarding.tsx) and [ServicesTab.tsx](artifacts/washbuddy-web/src/components/provider/settings/ServicesTab.tsx) gained a category dropdown wired to the new field; defaults to `EXTERIOR_WASH` for new services, reads existing values when editing.

**Backfill:** new idempotent script at [lib/db/src/demo-seed/scripts/backfill-service-categories.ts](lib/db/src/demo-seed/scripts/backfill-service-categories.ts) (registered as `pnpm --filter @workspace/db demo:backfill-service-categories`) applies category and labels by keyword-matching service name and description. `--dry-run` prints the proposal grouped by confidence (LOW first); without the flag, it applies. Re-runnable: labels converge to the proposed set, never accumulate.

**Seed sources:** all three (`lib/db/prisma/seed.ts`, `lib/db/src/seed.ts`, `lib/db/src/demo-seed/config.ts` + its consumer script) carry `category` literals and label arrays for cross-category rows. Future DB resets reproduce the canonical state without needing the backfill.

**Final data state on Replit:** 368 services (unchanged from pre-migration). 297 rows updated by backfill, 71 already correct from seed defaults, 0 rows added or lost.

---

## 2. Spec sections governing this round

- [02-eid.md §5.1](docs/search-discovery-overhaul/02-eid.md) — schema migration spec. Implemented exactly: enum + three fields with the documented defaults.
- [02-eid.md §6.1](docs/search-discovery-overhaul/02-eid.md) — Round 0 scope and verification. All listed items shipped; verification deliverables produced (TS counts, schema integrity, distribution, provider form, don't-regress sweep).
- [02-eid.md §6.7](docs/search-discovery-overhaul/02-eid.md) — don't-regress callouts. Existing services preserved; booking flow unaffected; `platformFeeMinor` untouched (still 0); existing forms still render.
- [03-service-taxonomy-decision.md](docs/search-discovery-overhaul/03-service-taxonomy-decision.md) — Option C (required category + optional subcategory + free-string labels) implemented as designed. The `Full Detail` industry-research finding is a refinement applied during Phase 1A.1 — section §4.2's `SUGGESTED_SUBCATEGORIES` example was superseded by the industry-grounded list; this is documented in the round, not the decision doc, because the decision-level intent (suggested-not-locked) is unchanged.
- [01-prd.md §5](docs/search-discovery-overhaul/01-prd.md) — five canonical categories, hybrid model. Matches.

---

## 3. Verification results

**TypeScript (zero net new errors):**

| Package | Pre-round | Post-round |
|---|---|---|
| `@workspace/washbuddy-web` | 21 | 21 |
| `@workspace/api-server` | 134 | 134 |
| `@workspace/db` | 0 | 0 |

**Builds:** Vite (`PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm -F @workspace/washbuddy-web build`) and esbuild (`pnpm -F @workspace/api-server build`) both clean.

**Database (psql on Replit, post-backfill):**
- Total services: **368** (matches pre-migration count — zero rows added or lost).
- Distribution: **EXTERIOR_WASH 291**, **INTERIOR_CLEANING 77**, RESTROOM_DUMP 0, RESTOCK_CONSUMABLES 0, ADD_ON 0.
- Rows with labels: **220** (cross-category rows, primarily Full Detail variants and other multi-keyword names).
- Rows without labels: **148** (single-category services).
- `platform_fee_minor != 0`: 0 services confirm the deprecated field stayed at 0 across all rows post-backfill.

**Dry-run / apply correspondence:** the dry-run preview matched the applied state exactly. 297 rows changed (category and/or labels differed from defaults); 71 rows were already correct from seed-time literals (the "Full Detail Wash" entries and EXTERIOR_WASH-defaulted exterior services). Idempotency confirmed: the dry-run after apply would now show 0 updates needed.

---

## 4. Decisions made during the round

**(a) Full Detail → EXTERIOR_WASH with cross-category labels.** Industry research (motorcoach detailing trade sources; marketplace UX research from Baymard, Nielsen Norman) converged on: services with multiple attributes get one primary category and labels for secondaries; don't create combination categories. Motorcoach industry treats "Full Detail" as a comprehensive *exterior* service that includes interior cleaning as a component. Implemented: `detail` is a primary EXTERIOR_WASH keyword; cross-category primary matches generate `labels = [matched-keywords, loser-category-labels, "full-service"]`. Reversibility: rule edits + re-run dry-run + apply.

**(b) Keyword priority order in `RULES`:** RESTROOM_DUMP → RESTOCK_CONSUMABLES → EXTERIOR_WASH → INTERIOR_CLEANING. EXTERIOR_WASH moves above INTERIOR_CLEANING specifically so `detail` (which appears in both rule sets historically) lands at EXTERIOR_WASH. Reason: industry-aligned outcome on Full Detail rows. Reversibility: reorder the array.

**(c) Subcategory taxonomy expansion.** `SUGGESTED_SUBCATEGORIES` rewritten across all five categories with industry-grounded values, including new amenity subcategories under RESTOCK_CONSUMABLES (Bottled water, Coffee & tea supplies, Cups/lids/napkins, Snacks). Positions WashBuddy as the platform for the full service-stop experience, not just washes. Free-string autocomplete hints; not enum-locked. Reversibility: edit constants file.

**(d) Both provider forms updated, not just `pages/provider/`.** Per Round 0 audit gate, scoping included `components/provider/settings/ServicesTab.tsx` so existing providers can set categories on services they edit. Skipping it would have created a half-finished feature.

**(e) Two-phase deploy split.** Local environment lacks `DATABASE_URL`; the round was split into Phase 1A (all code, committed locally) and Phase 1B (db:push + backfill on Replit). Standard for this codebase per `CONTEXT.md` ("Live testing happens on Replit deploys, not locally"). Reversibility: branch-based; can be rolled back before merge.

---

## 5. Open items for the next round

- **Schema fields are populated and queryable.** `Service.category`, `Service.subcategory`, `Service.labels` exist in DB, OpenAPI, generated clients, and the route handler. No frontend filtering or UI consumes them yet — Round 1 is the first round to wire the search surface.
- **`SUGGESTED_SUBCATEGORIES` is ready for autocomplete** in any provider-side subcategory UI Round 1+ adds. Currently exported but not surfaced in either provider form (out of Round 0 scope).
- **`CATEGORY_DISPLAY_NAMES` and `CATEGORY_SHORT_NAMES` are stable.** Round 3's adaptive Service Type chip label (per [02-eid.md §4.1](docs/search-discovery-overhaul/02-eid.md)) reads from `CATEGORY_SHORT_NAMES` directly. Round 2 service-picker sheet rows will read `CATEGORY_DISPLAY_NAMES`.
- **Labels vocabulary is stable.** Cross-category rows carry labels from the set `{exterior, interior, restroom-dump, restock, add-on, full-service}` plus matched-keyword tokens. Round 1 search filtering can group on these labels.
- **Backfill script remains in place** for any future imports of unclassified `Service` rows. Idempotent and safe to re-run.

---

## 6. Anything that surprised me

- **Codegen command name doc drift.** `docs/operations/known-issues.md` and `docs/search-discovery-overhaul/02-eid.md` reference `pnpm run generate` for the OpenAPI codegen step, but the actual script in `lib/api-spec/package.json` is `codegen` (Orval). A small follow-up was spawned to fix these doc references after merge — non-blocking.
- **`user_sessions` schema drift during `db:push`.** The Replit run surfaced an unrelated drift on the sessions table at migration time. Worked around (Round 0 didn't touch it), but the auth/sessions team should look at why the schema and live DB diverge there. Flagging here so it doesn't get lost.
- **Three seed sources, not one.** The audit caught two (`lib/db/prisma/seed.ts`, `lib/db/src/seed.ts`); a third — `lib/db/src/demo-seed/scripts/seed.ts` reading `SERVICE_TEMPLATES` from `config.ts` — turned up while grepping `prisma.service.create`. All three updated in lockstep so DB resets stay coherent across entry points.
- **Local env-var dependencies.** Both Prisma (`DATABASE_URL`) and the Vite build (`PORT`, `BASE_PATH`) refuse to run without env vars; reinforces the Replit-only deploy story but worth flagging for any future contributor running things locally.
- **Generated Zod files multiplied.** Orval emits one `.ts` per enum and per schema property union, producing three new files (`serviceCategory.ts`, `createServiceInputCategory.ts`, `updateServiceInputCategory.ts`) for what is conceptually one enum. Cosmetic, not actionable.
