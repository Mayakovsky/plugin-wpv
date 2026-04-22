# Video Graduation Test Report

> Date: 2026-04-22
> Buyer: `0x22a37c576f7c7ed7755a2673b56130b773dc56a6` (Grey Test Buyer)
> Provider: `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f` (Whitepaper Grey)
> Chain: Base (8453)
> Video jobs: #1049–#1056

---

## Summary

| # | Offering | Type | Job ID | Result | Notes |
|---|----------|------|--------|--------|-------|
| 1 | project_legitimacy_scan | Positive | 1049 | ✅ PASS | Full lifecycle, legit deliverable |
| 2 | project_legitimacy_scan | Negative | 1050 | ✅ PASS | Pre-accept reject, burn address |
| 3 | verify_project_whitepaper | Positive | 1051 | ✅ PASS | Aave V3, full lifecycle |
| 4 | verify_project_whitepaper | Negative | 1052 | ✅ PASS | Pre-accept reject, malformed address |
| 5 | full_technical_verification | Positive | 1053 | ✅ PASS | Uniswap, full lifecycle |
| 6 | full_technical_verification | Negative | 1054 | ✅ PASS | Accepted, INSUFFICIENT_DATA, no fabrication |
| 7 | daily_technical_briefing | Positive | 1055 | ✅ PASS | Empty requirements, full lifecycle |
| 8 | daily_technical_briefing | Negative | 1056 | ⚠️ REJECTED | Diverged from test script — see below |

- **USDC spent:** 0.13 (0.01 + 0.02 + 0.03 + 0.03 + 0.04)
- **Grey uptime:** No crashes or restarts during the 8-test run
- **Deliverable integrity:** All 5 positives submitted as `{type:"object", value:{...}}` envelopes with on-chain `deliverableHash`

---

## Infrastructure fix shipped pre-video

**Race condition** in `plugin-acp/src/AcpService.ts` exposed on the first real v2 socket-path job:

- The buyer's SDK posts the `requirement` message via **REST** (`transport.postMessage`), not the socket.
- Grey's `agent.on('entry', ...)` never fires for the requirement message — only `job.created` arrives on the socket.
- `handleJobCreated` and `handleJobFunded` both read the requirement from `session.entries`, which is empty on `job.created` → immediate rejection or handler failure.

**Fix applied** (local + VPS, deployed, SDK reconnected, 4 handlers re-registered):

- `waitForRequirement()` helper with three fallbacks: fast-path `session.entries` lookup → brief poll → `transport.getHistory()` REST pull.
- Dual-trigger: `handleJobCreated` fires on either `job.created` system entry OR `requirement.message` agent entry (for future-proofing against server-side broadcast changes).
- Same fallback applied in `handleJobFunded` so delivery handlers always get the real requirement, not an error payload.
- `${jobId}:__decided` sentinel in `recentJobs` guarantees accept/reject runs at most once per job regardless of which trigger fires first.

Tests 1 and 2 passed cleanly after this fix went in. Video was recorded on the patched build.

---

## Test 8 — detailed

### Setup

- **Offering:** `daily_technical_briefing`
- **Requirement sent:** `{"token_address": "0xabc123", "garbage_field": "noise"}`
- **Job ID:** 1056
- **Test-script expectation:** Grey accepts, returns briefing normally, ignores noise fields.
- **Actual behavior:** Grey rejected pre-acceptance with a structured reason. No escrow moved.

### On-chain lifecycle

```
job.created → job.rejected
```

3 entries total. No `budget.set`, no `job.funded`, no deliverable.

### Grey's rejection message

```
Invalid requirement: Unknown field(s): 'token_address', 'garbage_field' —
daily_technical_briefing accepts only 'date' (YYYY-MM-DD format)
```

This comes from the WPV input validator for the `daily_technical_briefing` offering. The validator uses a strict allow-list (only `date` is permitted) and rejects any requirement containing unrecognized fields.

### Why this happened

The validator's allow-list policy predates the test script. It was written defensively so that ambiguous inputs (`token_address` + `project_name` + `date` mixed together) can't silently trigger unintended pipeline paths. For `daily_technical_briefing` specifically the validator is very narrow because the offering is "just hand me today's batch summary" — any field the caller might *think* should filter the result (token address? project name?) actually wouldn't, so rejecting with a clear message is more honest than accepting and silently ignoring.

### Is this a defect?

**Not clearly.** Two legitimate design positions:

1. **Strict (current):** Reject noise. Forces buyers to send clean requirements and gives them a machine-readable reason. No silent surprises.
2. **Permissive (test-script expectation):** Ignore noise, return the briefing anyway. More forgiving to buyers who copy/paste requirement templates between offerings.

The negative test's *intent* is "prove Grey handles unexpected input robustly." Both behaviors satisfy that intent — neither fabricates output, neither crashes. The difference is whether unknown fields are ignored or refused.

### Options for resolution

| Option | Change | Tradeoff |
|--------|--------|----------|
| **A — No change** | Keep strict validator. Update the test script / video narration to reframe Test 8 as "Grey refuses noise fields with a structured reason." | Zero code risk. Documentation cost only. Defensible story to the evaluator. |
| **B — Loosen validator** | Change `daily_technical_briefing` validator to ignore unrecognized fields (process only `date` if present, otherwise return today's briefing). | Small code change (~5 LOC in `inputValidators`). Matches test script literally. Slightly weaker invariant: buyers can't rely on Grey to surface typos. |
| **C — Log-and-accept** | Accept the job but log a warning about unknown fields, still return briefing. | Middle ground. Adds a log noise line per such job. Still matches test script. |

### Recommendation

**Option A (no change)** unless the evaluator specifically flags this behavior as a defect during the review. The strict rejection is:

- Defensible engineering practice (fail fast on malformed input)
- Consistent with how the other three offerings' validators behave
- Machine-readable for the buyer to self-correct
- Zero-cost to document vs. a code change + redeploy

If the evaluator disagrees, Option B is a ~5-minute change. Option C is not worth the log noise.

---

## Notes on prior debug runs

Before the video take, Jobs #1043–#1048 were consumed during debugging of the race condition fix:

- #1043, #1044: rejected by Grey due to the race (pre-fix)
- #1045: deferred/open (intermediate fix, incomplete)
- #1046: completed but delivered INSUFFICIENT_DATA fallback due to second-phase race (cost 0.01 USDC)
- #1047, #1048: clean pass and clean reject after full fix
- #1049–#1056: video run (this report)

These earlier jobs are visible in the buyer's on-chain history. If an evaluator scrolls the wallet log they will see the rejected/abandoned entries. They are labeled correctly on-chain (`rejected`, `open`) and don't invalidate the video-run results, but worth flagging for context.

---

## Next steps

1. Review Test 8 behavior with Forces, decide between Options A/B/C.
2. If graduating on this run: submit for evaluation.
3. Close Lightsail ports 3000/3001 after graduation per the post-launch checklist.
