# WashBuddy — Search & Discovery Specifications

This folder contains the canonical specification for the WashBuddy search and discovery overhaul. Five documents, designed to be read in order, that together define what we're building, why, and how.

**Priority statement:** These documents supersede the older `PRD.md` and `EID.md` at the repo root. Where this folder and older documents conflict, this folder wins. Older documents remain as historical context only and should not be used to guide new implementation decisions.

**Update discipline:** Specs in this folder are canonical. Any divergence between code and spec is treated as a bug — update the spec before changing the code. When implementation reveals something that should change the design, update the relevant document first as a small commit, then change the code in the next commit. This is how we avoid round-to-round drift.

---

## What's in this folder

### `01-prd.md` — Product Requirements Document

**Audience:** Anyone trying to understand the product direction. Designers, contributors, future Claude sessions, leadership.

**What it covers:** The strategic why-and-what. Why the merge, why the bottom sheet, why detour time, why three chips not five, why the silent vehicle filter is "audible," why no badges in v1. Locks the architectural decisions that downstream documents depend on.

**Read first.** Don't dive into the EID without grounding in the PRD's rationale — implementation details make a lot more sense once you know the why.

**~3,500 words. Read time: ~12 minutes.**

### `02-eid.md` — Engineering Implementation Document

**Audience:** Claude Code, plus humans reviewing what Claude Code did.

**What it covers:** The how-and-where. File paths, schema diffs, component structure, state shapes, routing changes, edge cases (loading/empty/error), accessibility, brand specs, per-round implementation guidance, the don't-regress list. Includes a complete file-level summary so you can see what's new, deleted, and modified at a glance.

**Read after the PRD.** This is the working surface for build. Every per-round prompt to Claude Code references specific sections here by number.

**~7,500 words. Read time: ~28 minutes (skim) / ~60 minutes (thorough).**

### `03-service-taxonomy-decision.md` — Service Taxonomy

**Audience:** Anyone implementing or reviewing Round 0 (the schema migration that gates everything else).

**What it covers:** The foundational data decision underneath the Service Type filter chip and the entire service categorization architecture. Three options considered, recommendation, migration plan with backfill keyword rules.

**Read when:** before Round 0 ships. The PRD references this document; the EID's Round 0 section assumes the decision in this document.

**~2,000 words. Read time: ~8 minutes.**

### `04-future-considerations.md` — Future Considerations

**Audience:** Anyone tempted to add scope. Anyone planning v1.5 or v2.

**What it covers:** Strategic backlog. Things we discussed and explicitly punted to a later version. Real-time provider availability, parallel-service scheduling, hours-of-service integration, Mapbox migration, badge taxonomy when it earns its place, etc. Each item has a brief argument for value and a sketch of implementation.

**Read when:** before any round, to confirm what's *not* in scope. Especially useful when an idea surfaces mid-round — check here first to see if it's already been considered and deferred.

**~3,500 words. Read time: ~12 minutes (skim).**

### `05-visual-reference.md` — Visual Reference

**Audience:** Anyone implementing or reviewing visual surfaces.

**What it covers:** Annotated SVG specifications for every component and state. Color tokens, typography tokens, spacing tokens, the pin in all four tiers and selected state, both header presentation modes, all three Tier 1 chips with all states, active filter pills, result cards in all variants (top-tier, selected, demoted), the bottom sheet in all three states, the service picker, the all-filters sheet, the pin selection callout, empty/loading/error states, and the desktop layout.

**Read alongside the EID.** Every component spec in the EID references the corresponding visual section here.

**~6,000 words plus 14 inline SVG mocks. Read time: ~25 minutes (with visuals).**

---

## How to use this set

### If you're implementing a round

1. Read the PRD section referenced in the prompt (usually 5-10 minutes).
2. Read the relevant EID section in detail. Cross-reference the visual reference for any component called out.
3. Skim §6.7 of the EID (don't-regress callouts) to understand what must continue to work.
4. Skim §10 of the PRD (out-of-scope reminder) to confirm what's *not* being asked.
5. Run the audit step (per the agent's existing protocol) referencing the specific sections.
6. Implement.
7. Verify per §7 of the EID.

### If you're updating the spec

1. Identify the document that needs updating. PRD for strategic changes; EID for implementation; visual reference for component specs; taxonomy or future considerations for their respective domains.
2. Make the change as a small, focused commit.
3. If the change ripples (a PRD change requires an EID change too), update both in the same commit with a clear message: "Update PRD §4.6 and EID §4.6 — clarify TOP badge logic for tied scores."
4. The visual reference document version number should match the spec version when visual surfaces change. PRD/EID version numbers track each other.

### If you're reviewing what shipped

1. Open the PRD's success criteria section (§7) and verify each criterion was met.
2. Cross-check the EID's verification section (§7) for the round in question.
3. Compare the built UI against the relevant visual reference sections.
4. Check the don't-regress list (EID §6.7) against current behavior.

---

## Document relationships at a glance

```
01-prd.md ──────── strategic decisions ────────► drives 02-eid.md
   │
   │ references for foundational data
   ▼
03-service-taxonomy-decision.md ─── gates Round 0 of EID

01-prd.md ─── notes things deferred ────► 04-future-considerations.md
                                            (reverse: this doc protects PRD scope)

02-eid.md ─── component specs reference ────► 05-visual-reference.md
                  (each EID component spec names the matching visual section)
```

---

## Round phasing reference

The work is six rounds. Each gets its own prompt to Claude Code. See EID §6 for full per-round implementation guidance.

| Round | Title | Sections in EID | Sections in visual reference |
|---|---|---|---|
| 0 | Service taxonomy migration | §5.1, §6.1 | (none — schema only) |
| 1 | Page merge, pin component, hamburger nav | §3.5, §6.2 | §4 (pins), §5 (header) |
| 2 | Bottom sheet | §3.3, §3.4, §3.6, §6.3 | §8 (cards), §9 (sheet), §12 (callout) |
| 3 | Filter architecture | §4, §6.4 | §6 (chips), §7 (pills), §10, §11 |
| 4 | Detour time and arrival logic | §5.2, §6.5 | §4.2 (labels), §8.1 (cards in route mode) |
| 5 | Polish, file deletion, sweep | §3.7, §3.9, §6.6 | §13 (states) |

---

## Document versions

| Document | Version |
|---|---|
| `01-prd.md` | v1.0 |
| `02-eid.md` | v1.0 |
| `03-service-taxonomy-decision.md` | v1.0 |
| `04-future-considerations.md` | v1.0 |
| `05-visual-reference.md` | v1.0 |
| `00-readme.md` | v1.0 |

All v1.0 means this is the initial complete specification. Bumps happen as implementation proceeds and the spec gets refined.
