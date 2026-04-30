# WashBuddy — Product Specifications Index

This folder contains the canonical product specifications for WashBuddy, organized by initiative. Each subfolder is a self-contained specification set (PRD, EID, decisions, visual reference, future considerations).

For foundational platform context that applies across all initiatives, see `/CONTEXT.md` at the repo root.

For current operational context (seed accounts, known issues, dev environment), see `/docs/operations/`.

---

## Active initiatives

### `search-discovery-overhaul/`

**Status:** Spec complete, implementation in progress.
**Surfaces:** Driver-side.
**Summary:** Merges the existing Find a Wash and Route Planner flows into a single discovery surface (`/find-a-wash`). Introduces a Google-Maps-style three-state bottom sheet, branded WashBuddy pins with ranking-aware color hierarchy, adaptive Tier 1 filter chips, "+detour minutes" as the primary distance metric in route mode, and a foundational service taxonomy.
**Phases:** Six rounds (Round 0 schema → Round 5 polish). See the initiative's `02-eid.md` §1.3 for the round breakdown.

---

## Archived initiatives

(None yet. As initiatives complete and ship, they move from `active` to `/docs/archive/<initiative-name>/` to preserve rationale for future reference.)

---

## How to use this index

- **Starting work on an active initiative?** Open the initiative's `00-readme.md` first, which orients you to the rest of the spec set.
- **Starting a brand-new initiative?** Create a new subfolder following the structure described in `/CONTEXT.md` under "Adding new initiatives." Update this index to list the new initiative.
- **Reviewing what's been shipped?** Browse `/docs/archive/` for completed initiatives. Each one captures the rationale and decisions made at the time, even if the code has evolved since.
- **Need to know how the codebase actually behaves today?** That's `/docs/operations/`, not the spec folders.

---

## Initiative naming convention

Use kebab-case, descriptive but concise. Examples of good names:

- `search-discovery-overhaul` (what we're working on now)
- `fleet-operator-v1` (likely future)
- `provider-availability-real-time` (likely future)
- `analytics-data-capture-foundation` (likely future)
- `cross-border-payments-v1` (likely future)

Avoid version numbers in the folder name unless they're meaningful (`v1`, `v2` are useful when there's a clear progression; `v0.1.4` is not). Avoid timestamps in the folder name — git commits already provide history.
