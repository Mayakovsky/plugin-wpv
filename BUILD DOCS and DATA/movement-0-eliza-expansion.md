# Movement 0: ElizaOS Expansion Pass

**For:** Kov
**Conductor:** Forces
**Score reference:** `phase2-work-breakdown-kovsky.md` Step 0; `phase2-deployment-checklist.md` Section 2 "After Step 0"
**Cold-start reading:** `grey-orientation.md` — read this first if you're starting fresh on Grey

---

## What this movement does

Add 6 new offerings to the live ElizaOS Grey ACP-served pipeline **before** Phase 2 starts and **before** Virtuals outreach Round 1 begins. All 6 are reshapings of existing pipeline outputs — no new pipeline capabilities. Once these are live and smoke-tested, tag `phase2-baseline` and lock ElizaOS Grey for the rest of Phase 2.

After this movement, Virtuals goes from 4 offerings to 10, with full V/R/I coverage. The expanded offering set is what every outreach Account will surface to target agents.

---

## Place in the larger work

Movement 0 is the only movement that touches ElizaOS Grey. Every other movement (1 through 6) is about building New Grey alongside ElizaOS Grey without modifying it. This movement is the deliberately-scoped exception, sequenced first so that:

1. Outreach Round 1 has a 10-offering pitch instead of a 4-offering pitch.
2. Each new offering registered on the ACP creates additional surfaces for ACP discovery.
3. ElizaOS Grey's expanded state becomes the locked baseline that Phase 2 verification gates compare against.

**What follows this movement:** Movement 1 (monorepo + pipeline extraction). Movement 1 does NOT begin until `phase2-baseline` is tagged and Forces signs off on the full 10-offering set being live.

---

## The 6 offerings to ship

| Offering | Price | Concentration | What it does | Pipeline operation |
|---|---|---|---|---|
| `claim_evaluation` | $0.10 | Verification | Atomic single-claim verification | Run only the existing L3 evaluator against one claim |
| `claim_history` | $0.10 | Research | Grey's accumulated knowledge on a project | Read-only Supabase query against `wpv_claims` / `wpv_verifications` |
| `quick_protocol_facts` | $0.30 | Research | Concise facts for conversational interfaces | Cache hit → brief summary; cache miss → run `legitimacy_scan`, return headline |
| `claim_extraction` | $0.50 | Research | Pure claim extraction without evaluation | Early-exit existing pipeline at L2 → L3 boundary |
| `audit_posture_check` | $0.75 | Verification | Audit history, scope, freshness | Invoke pipeline, post-process L3 to extract audit-related fields |
| `tokenomics_audit` | $1.75 | Verification | Tokenomic analysis | Invoke pipeline, post-process L3 to extract tokenomic fields |

All 6 are zero-new-pipeline-logic. They wrap existing tested pipeline outputs and reshape them as new offerings.

**Explicitly held back** (do NOT implement in this movement, even if you spot an opportunity):
- `comparative_analysis` — new multi-project synthesis
- `mass_screen` — new batch queuing
- `technical_briefing` (per-protocol delta) — new cache-comparison infrastructure
- `prediction_market_research`, `resolution_evidence_compiler`, `allocation_risk_report`, `compliance_research_input` — genuinely new pipeline capabilities

Those 7 ship via grey-core in later movements. Touching them in Movement 0 expands scope and defeats the bounded purpose.

---

## Scope discipline (this is the constraint that defines this movement)

This movement is the **one** deliberate exception to "ElizaOS Grey is untouched throughout Phase 2." After it lands, the lock applies. The exception is only worth taking if it stays narrow:

- **Six offerings. Nothing else.**
- **No opportunistic refactoring.** If something looks broken or smells worth improving, write it down for grey-core but do NOT fix it in ElizaOS Grey here.
- **No dependency updates** beyond what the 6 offerings strictly need.
- **No Supabase schema changes** beyond adding indexes if a new query pattern needs them.
- **No changes to the existing 4 offerings' behavior or output shape.** Smoke tests at the end confirm byte-identical output on identical inputs.

If implementing any of the 6 turns out to require more than a handler + response shaping (i.e., requires pipeline logic changes, schema changes, or refactoring beyond the handler surface), **stop and check with Forces** before proceeding. The bounded scope is what makes this exception safe.

---

## Pre-movement checklist (before any code)

1. **Confirm the working directory.** ElizaOS Grey repo at `C:\Users\kidco\dev\eliza\plugin-wpv\`.

2. **Tag the pre-expansion baseline.**
   ```bash
   cd C:\Users\kidco\dev\eliza\plugin-wpv
   git status   # MUST be clean — no uncommitted changes
   git rev-parse HEAD > pre-expansion-commit.txt
   git log -1 --format="%H %ai %s" >> pre-expansion-commit.txt
   git tag pre-expansion-baseline
   git push --tags
   ```
   Save `pre-expansion-commit.txt` outside the repo.

3. **Capture the deployment artifact hash on the VPS** (matches the deployment checklist Section 1 commands):
   ```bash
   find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) \
     -not -path "*/node_modules/*" -not -path "*/dist/*" \
     | sort | xargs sha256sum > /tmp/eliza-grey-pre-expansion.sha256
   ```
   Copy the file off VPS to Forces's local notes.

4. **Snapshot the database row counts** for `wpv_whitepapers`, `wpv_verifications`, `wpv_claims`. These are reference points for "did Movement 0 touch the wrong tables." Schema lives in `src/db/wpvSchema.ts` for reference.

5. **Confirm Grey is currently live and serving** the original 4 offerings on the ACP. If it isn't, stop and resolve that before Movement 0 work begins.

6. **Read `CLAUDE.md` at the repo root** for any project-specific Claude Code conventions Forces has set.

---

## Implementation (per offering)

Each new offering follows the same shape in `plugin-wpv`:

1. **Handler logic** in `src/acp/ResourceHandlers.ts` (or a sibling file if Forces or the existing pattern prefers separation per offering). Read the existing handlers in `ResourceHandlers.ts` to see how the 4 live offerings are implemented.

2. **Route registration** in `src/acp/JobRouter.ts` — add the new offering's route to whatever dispatch table or switch the existing 4 live in. Don't change existing routes.

3. **Agent card entry** in `src/acp/AgentCardConfig.ts` — add the new offering's metadata (name, description, price as ACP expects it). Forces handles the ACP-side registration via the agent card sync.

4. **Response shaping** — return structured JSON consistent with the existing offering envelope. Reasonable subset of what the larger offerings return.

5. **Unit test** for each handler — at minimum, a known-good input that exercises the handler's specific path. Add new test files to `tests/` following the existing naming convention (e.g., `tests/claimEvaluation.test.ts`).

### Per-offering implementation notes

**`claim_evaluation`** — atomic Verification
- Input: `{ claim: string, context?: { projectName?: string, projectUrl?: string } }`
- Logic: invoke `ClaimEvaluator` (`src/verification/ClaimEvaluator.ts`) against the single claim. The existing evaluator probably expects a list — pass a list of one and unwrap the result.
- Output: `{ claim, verdict, confidence, reasoning, evidence }`
- Watch: cost. A single L3 evaluation should be cheap, but if `ClaimEvaluator` does retrieval per claim (literature lookup, on-chain queries), one-shot calls could be expensive. `CostTracker` (`src/verification/CostTracker.ts`) is your friend here.

**`claim_history`** — Research
- Input: `{ projectIdentifier: string }` (token address, project name, or whitepaper URL)
- Logic: Supabase read-only query — use `wpvVerificationsRepo` and `wpvClaimsRepo` from `src/db/`. Filter by project identifier (try all three field types if unclear which the input is — mirror the matching logic in `findBestWhitepaper.test.ts` for the canonical resolution path). Order by date desc.
- Output: `{ project, verifications: [...], claims: [...] }`
- Watch: project identifier ambiguity. The repo layer should already handle fuzzy matching; if not, use what `legitimacy_scan` uses today.

**`quick_protocol_facts`** — Research
- Input: `{ projectQuery: string }` (loose query — name, token, URL)
- Logic: try cache first (use the same lookup `legitimacy_scan` uses for cache hits). If hit, format a brief summary. If miss, fall back to running `legitimacy_scan` and returning its headline-shaped output.
- Output: `{ project, type, miCAStatus, headlineVerdict, lastVerified, sources: [...] }`
- Watch: this should be CHEAP — chat-sized response, not a full report. Cap response size deliberately. If a cache miss triggers a full pipeline run, the offering's $0.30 price won't cover the cost — consider returning a structured "not yet verified, here's what we'd need to verify" response on miss rather than running the pipeline. Decide with Forces if this comes up.

**`claim_extraction`** — Research
- Input: `{ whitepaperUrl: string }` (or token address that resolves to a whitepaper)
- Logic: run the pipeline through L2 (`ClaimExtractor`, `src/verification/ClaimExtractor.ts`). Stop before L3. Return the extracted claims with their L1/L2 metadata. Either add an early-exit flag to the existing pipeline orchestrator or call L1 + L2 directly without invoking L3.
- Output: `{ whitepaper, structuralAnalysis, claims: [{ text, category, evidence_references, ... }] }`
- Watch: don't accidentally invoke L3 — that defeats the purpose (the buyer is choosing the cheaper extraction-only path).

**`audit_posture_check`** — Verification
- Input: `{ projectUrl: string }` or `{ projectIdentifier: string }`
- Logic: invoke the full pipeline (or fetch cached `wpv_verifications` row). Post-process the L3 + synthesis output (`ReportGenerator`, `src/verification/ReportGenerator.ts`) to extract audit-related fields — auditor names, audit dates, scope, recency, findings, gaps.
- Output: `{ project, audits: [...], lastAuditDate, scope, gaps, freshness }`
- Watch: if no audit data exists in the pipeline output, return a structured "no audit found" response rather than failing.

**`tokenomics_audit`** — Verification
- Input: `{ projectUrl: string, tokenAddress?: string }`
- Logic: invoke the full pipeline (or fetch cached). Post-process to extract tokenomic fields — supply schedule, unlock cliffs, emission curve, distribution, vesting.
- Output: `{ project, supplyMechanics, unlockSchedule, emissionCurve, distribution, vesting }`
- Watch: same as audit — if data missing, return structured "no tokenomic data found" rather than failing.

### Reference handlers to read first

Before writing any of the 6 new handlers, read the existing handlers for the live offerings to internalize the pattern:

- **`legitimacy_scan` handler** — cleanest reference for `quick_protocol_facts` (similar shape, cache-driven)
- **`verify_whitepaper` handler** — reference for `claim_extraction` (L1+L2 path)
- **`verify_full_tech` handler** — reference for `audit_posture_check`, `tokenomics_audit`, `claim_evaluation` (full L3 pipeline)
- **`daily_tech_brief` handler** — reference for `claim_history` (Supabase read patterns)

The existing handlers all live in or are wired through `src/acp/ResourceHandlers.ts` and `src/acp/JobRouter.ts`.

---

## Smoke testing (after all 6 handlers are implemented)

Run these against a known-good whitepaper that's already in cache. Uniswap V3 is a safe pick — it's in Grey's verified track record (see `grey-deployment-plan-v7.md` → "Differentiators" → "Verified track record").

**Step 1 — full test suite:**

```bash
cd C:\Users\kidco\dev\eliza\plugin-wpv
bun test
```

All existing tests must still pass. The eval sweep (`evalSweep.test.ts`) is the most comprehensive check that nothing regressed. New tests for the 6 offerings must also pass.

**Step 2 — for each new offering:** invoke it through the ACP path (or via the JobRouter test harness) with a known-good input. Confirm:
- Response shape matches the schema in your implementation notes
- Response time is reasonable (under 5 seconds for cache-hit paths; longer is fine for offerings that invoke the full pipeline)
- No errors in the ElizaOS Grey logs

**Step 3 — for each existing offering (the original 4):** invoke it with the same input you would have used before Movement 0. Compare against the pre-expansion output (captured from before the work started). The output MUST be byte-identical, or any difference MUST be deliberate and documented.

If anything fails:
- Existing 4 changed → revert and investigate. Do NOT tag `phase2-baseline` until the existing 4 are byte-identical again.
- New offering fails → fix or remove from scope. Better to ship 5 of 6 cleanly than 6 of 6 with one broken.

---

## Post-movement checklist

After all 6 offerings are live, smoke-tested, and Forces has signed off:

1. **Tag `phase2-baseline`.**
   ```bash
   cd C:\Users\kidco\dev\eliza\plugin-wpv
   git tag phase2-baseline
   git push --tags
   ```

2. **Capture the post-expansion deployment artifact hash** the same way you captured `pre-expansion`:
   ```bash
   find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) \
     -not -path "*/node_modules/*" -not -path "*/dist/*" \
     | sort | xargs sha256sum > /tmp/eliza-grey-phase2-baseline.sha256
   ```
   Copy off VPS.

3. **Confirm all 10 offerings are visible and responding on the live ACP**.

4. **Update Forces.** Movement 0 closes. Lock applies from this point forward — ElizaOS Grey is untouched for the rest of Phase 2 unless Forces explicitly approves an exception.

5. **Hand-off note for Movement 1.** Write a brief summary of what landed, anything unexpected, and any decisions made during Step 0 that affect downstream work (e.g., schema shape adjustments, pipeline behaviors discovered while implementing handlers). Drop it into `BUILD DOCS and DATA/` as `Movement_0_Handoff.md` or similar.

---

## What to do if you get stuck

- **Implementation question on existing pipeline behavior:** read `src/verification/ReportGenerator.ts` (synthesis) and the handler for the closest analogous existing offering (in `src/acp/ResourceHandlers.ts`). Do NOT modify the existing handlers or pipeline classes — only read.
- **A new offering needs more than a reshaping:** stop. Note what's needed. Tell Forces. Decide together whether to (a) descope that offering from Movement 0 and ship it later via grey-core, or (b) expand Movement 0 scope deliberately.
- **A smoke test on the existing 4 fails:** stop. Revert any uncommitted changes. Compare against `pre-expansion-baseline`. The lock-down rule means we don't let drift through, even small drift.
- **ACP registration issue:** Forces handles ACP-side (the registry sync from `AgentCardConfig.ts`). Hand the issue to Forces with the offering name and what failed.
- **A test won't run or build won't compile:** check `bun.lock` is clean. Re-run `bun install` if you've touched `package.json`. The repo's existing setup is the working baseline — match it, don't change it.
- **Anything ambiguous:** ask. The bounded scope is what makes Movement 0 safe; preserving the bound is more important than moving fast.

---

## Score references

If you need more detail beyond this packet:

- **Cold-start orientation (read first if you're new to Grey):** `grey-orientation.md` — what Grey is, codebase layout, pipeline architecture, current state, don't-touch rules
- **Step 0 in full:** `phase2-work-breakdown-kovsky.md` → "Phase 2 Step 0: Pre-Phase-2 ElizaOS expansion pass"
- **Verification gate:** `phase2-deployment-checklist.md` → Section 2 "After Step 0"
- **Hard constraints:** `phase2-work-breakdown-kovsky.md` → "Hard constraints (apply to every task below)"
- **Why Movement 0 exists strategically:** `grey-deployment-plan-v7.md` → "Step 0 pre-Phase-2 expansion" in v7 changes summary, plus offerings catalog
- **Outreach context (why this movement gates Round 1):** `grey-deployment-plan-v7.md` → "Virtuals ACP outreach" section

The score docs are authoritative. This packet is the part Kov plays from — extracted for performance, pointing back to the score for any detail not covered here. `grey-orientation.md` is the cold-start reference — separate from the movement packet because it doesn't change between movements.

---

## End of Movement 0 deliverables

Closing this movement produces:
- All 6 new offerings live and earning on the ACP
- 10 total ACP offerings registered and discoverable
- `pre-expansion-baseline` and `phase2-baseline` git tags on the ElizaOS Grey repo
- `pre-expansion-baseline.sha256` and `phase2-baseline.sha256` deployment artifact hashes
- Smoke test results documented (all 10 offerings responding correctly; existing 4 byte-identical to pre-expansion)
- Forces sign-off on full 10-offering set
- Hand-off note for Movement 1

When all of the above are true, Movement 1 (monorepo + pipeline extraction) can begin, and Virtuals outreach Round 1 can begin in parallel.

---

*Movement 0 packet, May 12, 2026. Companion to deployment plan v7. Audience: Kov.*
