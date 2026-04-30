# WashBuddy — Operations Docs

Current-state operational context that applies across all initiatives. These docs describe the codebase as it exists today, not the platform direction.

Files in this folder change frequently as the codebase evolves — gotchas resolve, seed accounts shift, dev environment details change. Treat them as living references, not archival commitments.

## Files

- `seed-accounts.md` — demo accounts and their expected behaviors.
- `known-issues.md` — gotchas in the current codebase that affect development.

## Distinction from initiative folders

- **Initiative folders** (`/docs/<initiative-name>/`) contain forward-looking product specs — what we're building and why.
- **Operations folder** (`/docs/operations/`) contains current operational reality — what's true about the codebase right now.
- **CONTEXT.md** at the repo root contains foundational platform truths — what's stable for years.

When something is true today but will likely change as initiatives ship, it belongs here. When it's been formalized as a stable platform decision, it moves to CONTEXT.md.
