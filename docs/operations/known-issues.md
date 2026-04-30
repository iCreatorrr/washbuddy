# Known Issues

Current gotchas in the codebase. These describe real bugs or quirks that affect development but haven't yet been fixed. As issues resolve, they're removed from this list.

## Active issues

### Fleet dashboard pages don't render for the demo fleet account

The fleet dashboard pages exist in code, but `demo.fleet@washbuddy.com` lacks a proper FleetMembership record in the database. The pages fail silently. Fix by populating the seed data with a valid FleetMembership for this account.

### Provider duplication in seed data

The seed script ran multiple times, leaving duplicate provider records. Delete all seed providers and re-seed clean. Don't add new seed data on top of the duplicates.

### Search results don't load on page mount

The TanStack Query hook for the search query needs `enabled: true` by default. Without it, the page renders empty until the user takes some action that triggers a refetch. New search-related work must verify this is set.

### `platformFeeMinor` field is deprecated

The `platformFeeMinor` field on the `Service` model is deprecated for fee calculation. Fees are now calculated dynamically at booking time based on the platform fee rules in effect. New seed data should set this field to 0; new code should not read from it. Eventual removal will be a separate cleanup initiative.

### OperatingWindow not populated in seed data

The `OperatingWindow` model exists in the schema but isn't populated by the seed script. Many features that depend on operating hours (the "Open at arrival" filter in the search work, for example) require this data. Seed data must be populated and operating-hours logic enforced for downstream features to work.

### OpenAPI spec must be updated for new endpoints

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the source of truth for API contracts. When adding new endpoints, update the spec first, then regenerate the typed client with Orval (`cd lib/api-spec && pnpm run generate`). New endpoints added without updating the spec will lack typed hooks on the frontend.

## Resolved issues

(None yet. As issues resolve, move them from "Active" to "Resolved" with the commit that fixed them and a brief note.)
