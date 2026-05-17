# BUILD DOCS and DATA

This is Forces's active project working directory for Whitepaper Grey.

## What's here

The documents at the root of this directory are the **current authoritative set** for the multi-platform deployment work. Read these as instructions; treat them as the source of truth.

If you are starting cold, read `grey-orientation.md` first.

## What's in `build_archive/`

`build_archive/` contains historical work — graduation-era plans, eval-run analyses, hotfix work orders, pre-launch checklists, superseded architecture documents. **Do not execute against anything in the archive.** It exists for historical context only (understanding *why* something is the way it is). It is not a backlog of pending work.

If you find a document anywhere in the archive that looks like a work order and aren't sure whether it's current, the answer is no — archived documents are not current. Ask Forces if you need clarification.

## Current authoritative set

### Cold-start
- `_README.md` — this file
- `grey-orientation.md` — what Grey is, codebase layout, pipeline architecture, current state, don't-touch rules. Read first.

### Score documents (strategy + specifications)
- `grey-deployment-plan-v7.md` — strategic frame, V/R/I posture, offerings catalog, pricing per platform, Virtuals outreach, tier analysis
- `phase2-work-breakdown-kovsky.md` — Phase 2 step-by-step task list (Steps 0 through 9)
- `phase2-deployment-checklist.md` — operational verification gates per step
- `grey-wallet-infrastructure.md` — multi-chain wallet hierarchy, central treasury, tax split
- `x402-middleware-adapter-skeleton.md` — buildable TypeScript scaffold for the x402 adapter

### Working packets (per-session context for Kov)
- `movement-0-eliza-expansion.md` — Movement 0 packet (Step 0 ElizaOS expansion)
- (additional movement packets added as drafted: `movement-1-*.md` through `movement-6-*.md`)

## How the documents relate

The score documents are stable and authoritative. They describe the full plan in detail and are Forces's primary reference.

The movement packets are extracted views into the score — one per working session — sized to fit a single Claude Code conversation without compaction. Each packet contains the bounded work for one movement and points back to the score documents for any detail not covered.

The orientation document is read once on cold start, then skimmed before each movement. It describes the state of Grey (what's running, what the code looks like, what the rules are), not the work to be done.

## When the documents are wrong

Tell Forces. The score is intended to be stable but it represents Forces's understanding at the time of writing. If something on disk or in production contradicts what's in these documents, Forces wants to know.

---

*Active document set as of May 12, 2026. Updated as Phase 2 progresses.*
