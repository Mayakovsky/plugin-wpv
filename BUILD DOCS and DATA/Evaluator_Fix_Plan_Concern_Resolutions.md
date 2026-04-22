# Concern Resolutions — Evaluator Fix Plan 28/28

> Date: 2026-04-22
> From: Forces + Claude (architecture window)
> To: Kovsky
> Re: Your 5 concerns and 4 implementation risks on the 28/28 plan

All five concerns accepted. Resolutions below. Integrate these into the build.

---

## Concern 1 — GitHub API search patterns

You're right. `filetype:pdf` is web-UI-only, returns 422 on REST. Resolution:

- Drop `filetype:` qualifier from all GitHub API queries
- Filter results client-side by file extension: `.pdf`, `.md`, `.tex`
- Combine search patterns into a single OR query per job to stay within rate limits
- Use a GitHub personal access token from the start (5000 req/hour). No reason to start unauthenticated at 10 req/minute and hit the wall on the first multi-pattern job
- Corrected rate limit: 10 req/minute for Search API (not 60/hour as plan stated)

## Concern 2 — Cache poisoning from buyer-supplied URLs

Your option 1 is confirmed. Rule:

**Tier 1 results from buyer-supplied URLs NEVER write to cache.**

The buyer's URL is a hint for the current job only. It is not a canonical source. Tiers 2, 3, and 4 may write to cache under the existing rules (only if cache is missing or thin). Tier 1 does not.

## Concern 3 — Tier 3/4 document-to-project verification

Add a sanity check after fetching from Tier 3 or Tier 4:

- Extract the first 2000 characters of the fetched document
- Verify that the document mentions the `project_name` OR `token_address` from the request signals
- If neither appears: treat the document as thin (does not meet threshold), continue to next tier
- This prevents false positives from GitHub search returning unrelated repos

## Concern 4 — Per-tier timeout budgets

Your proposed numbers are accepted:

| Tier | Timeout |
|------|---------|
| Tier 1 (explicit URL) | 10s |
| Tier 2 (primary site) | 60s |
| Tier 3 (GitHub) | 20s |
| Tier 4 (CoinGecko/CMC) | 15s |

Additional rule: before entering each tier, check remaining time against the offering-level SLA deadline. If less than 60 seconds remain on the SLA, skip remaining tiers and deliver the best result found so far. Wire through the existing AbortController.

## Concern 5 — Cost amplification

Confirmed. Only run L1 structural analysis at each tier's threshold check. L1 is cheap (no LLM calls — it scores document structure only).

Defer L2 claim extraction and L3/L4 evaluation until after the best tier is selected. The full pipeline runs exactly once, against the document from the winning tier. Not once per tier.

---

## Implementation Risks — Resolutions

### Risk A — Threshold vs. existing passes

Run a regression sweep over today's 25 passes after implementing the tier chain. The "best result across tiers" fallback logic should return the same content for projects like Virtuals Protocol (structuralScore 1, claimCount 8) — no higher tier will find a better doc. The deliverable is identical, just with extra discoveryAttempts metadata. Verify this explicitly.

### Risk B — Logging tier selection

Log at INFO level for every job: which tier was selected, why it met the threshold (or that all tiers were exhausted), and which tier produced the best result. One structured log line per job. Essential for debugging the next eval run.

### Risk C — Briefing catch path

The "never reject post-acceptance" rule applies to ALL offerings including `daily_technical_briefing`. If the briefing handler errors mid-generation inside `handleJobFunded`, deliver an INSUFFICIENT_DATA error envelope. Do not call `session.reject()`. Confirm the briefing handler's catch path matches the other offerings.

### Risk D — Missing Tier 1 label

Add `"provided"` to the discoveryStatus enum. Full set:

`cached | provided | primary | community | aggregator | failed`

Maps to: Tier 0, Tier 1, Tier 2, Tier 3, Tier 4, exhausted-all-tiers.

---

## Flag Items — Build These As You Go

**Unit tests per tier.** Mock GitHub and CoinGecko API responses. Test tier logic deterministically without burning API quota. Build each tier's tests alongside the tier implementation.

**Rollback flag.** Add a single boolean `USE_TIERED_RESOLVER` (env var or constant). If the new chain regresses any of today's 25 passes, flip it off and redeploy on the old discovery path. Remove the flag after graduation.

**Tier distribution counter.** Log one line per job showing which tier terminated the chain. After deploy, scan logs to confirm distribution makes sense (most jobs should terminate at Tier 0 cache or Tier 2 primary site, not Tier 4).

**focusAreaScores null check.** When fixing the 0→null change in ScoreAggregator, verify that ReportGenerator and any downstream consumers don't choke on null values. The evaluator already handles missing categories (confirmed from today's report).

**InputValidationError reuse.** The signal aggregator's "no valid signals" and content-filter rejection paths should use the existing `InputValidationError` class from AcpService. No new error class needed.

---

## Build Order

1. Signal aggregator (Phase 1)
2. Completion logic — never reject post-acceptance (Phase 2)
3. Tiered resolver chain with Tiers 0-4 (Phase 3) — build unit tests per tier as you go
4. Deliverable schema expansion (Phase 4)
5. focusAreaScores null fix
6. Local verification against the 3 failure replay cases
7. Regression sweep against today's 25 passes
8. Deploy to VPS
9. Forces runs evaluator

Go build.
