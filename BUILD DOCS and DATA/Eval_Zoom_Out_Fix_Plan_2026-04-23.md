# Eval Zoom-Out Fix Plan — 12/15 → 15/15

> Date: 2026-04-23
> Status: Pending Forces approval before implementation
> Context: After two deploy cycles chasing individual eval failures, we're at
> 12/15 (down from 14/15 → 25/28 baseline). Forces called the zoom-out.

---

## What landed in prior cycles

**Phase 1 — Signal aggregator (OR semantics):** replaces field-AND validators.
Valid token OR name OR url → accept. Content filters (NSFW/injection/malicious)
still throw pre-acceptance. Deployed `a70267c`.

**Phase 2 — Never reject post-acceptance:** `handleJobFunded` catch path
delivers INSUFFICIENT_DATA envelope instead of `session.reject()`. Deployed
`0e0f4c6` (plugin-acp).

**Phase 3 — Tiered resolver additions:** GitHubResolver (Tier 3.5) +
AggregatorResolver (Tier 3.75, CoinGecko/CMC). Reordered ahead of legacy
WebSearchFallback. Env vars `GITHUB_TOKEN` + `CMC_API_KEY` stored on VPS
and locally.

**Phase 4 — Deliverable schema:** `discoveryStatus`, `discoverySourceTier`,
`discoveryAttempts` optional fields on all reports.

**ScoreAggregator null:** `focusAreaScores` now returns `null` for absent
categories (was `0`).

**Verdict thin-result mapping:** `structuralScore < 2 AND claimCount === 0`
→ `verdict: INSUFFICIENT_DATA` (was FAIL).

**MiCA discrepancy verdict downgrade:** Deployed `528729f`. When
`claimsMicaCompliance === 'YES'` AND `micaCompliant !== 'YES'`, downgrade
PASS → CONDITIONAL (or FAIL if structuralScore ≤ 3).

---

## Current eval: 12/15

**Passed the prior two targeted failures:**

- Aerodrome legitimacy scan (prior #1207) — now delivered via Tier 3 GitHub.
- Uniswap + broken URL (prior #1213) — signal aggregator strips bad URL,
  token/name discovery serves the right content.

**Three new failures that the evaluator did NOT flag in prior runs:**

### Failure 1 — Job 1243 (full_technical_verification)

- **Input:** plain text `"Mathematical analysis of Uniswap V3 (0x1f98...) liquidity math."`
- **Output:** Uniswap **V2** content (15 claims, V2 concepts like UQ112, meta
  transactions) with `projectName: "Uniswap"` — not V3.
- **Evaluator's objection:** "analysis must match the specific protocol
  version (V3) requested"
- **Root cause:** `JobRouter` has `stripVersionSuffix()` helper used for
  fuzzy cache matching. The plain-text parser correctly extracts "Uniswap V3"
  but the cache lookup falls through to the stripped name "Uniswap" and
  matches the V2 content row. Version intent is silently lost.

### Failure 2 — Job 1246 (project_legitimacy_scan)

- **Input:** `{"token_address":"0x940181a9ad482c1a306652651d769a677b8fd98631","project_name":"Aerodrome Finance"}`
- **Token address is a typo** — 40 hex chars (syntactically valid) but
  differs from real AERO `0x940181a94A35A4569E4529A3CDfB74e38FD98631`
  substantially.
- **Output:** cached Aerodrome Finance data (14 claims, verdict=PASS)
  delivered for a fabricated address.
- **Evaluator's objection:** "Implement strict validation for blockchain
  addresses (e.g., ensuring 20-byte hex format) and decline malformed
  inputs ... rather than submitting a deliverable for invalid data."
- **Root cause:** When building the signal aggregator I removed
  `eth_getCode` contract-existence validation. Under the new rules, any
  40-char hex string passes as a valid token signal.

### Failure 3 — Job 1249 (verify_project_whitepaper)

- **Input:** `{"token_address":"0x7fc66500...","document_url":"https://aave.com/whitepaper.pdf","project_name":"Aave"}`
- **Output:** `{"verdict":"INSUFFICIENT_DATA","error":"HTTP 404 fetching https://aave.com/whitepaper.pdf"}` — the Phase 2 fallback envelope.
- **Evaluator's objection:** "If a requirement contains invalid or
  inaccessible data (like a 404 URL), the agent should decline the request ...
  the agent should also be robust enough to search for correct information
  ... when a specific link fails."
- **Root cause:** `CryptoContentResolver.resolveWhitepaper(url)` throws on
  HTTP errors. The handler path that processes buyer-supplied
  `document_url` does NOT catch this and fall through to token/name
  discovery. The exception bubbles to `handleJobFunded`'s catch, which
  delivers an INSUFFICIENT_DATA error envelope. We never fall back.

---

## The pattern

When I built the signal aggregator, I moved validation from **strict**
(old field-level validator throws) to **permissive** (deferred to resolver).
I completed half the change — the aggregator became permissive — but did
not complete the other half — the resolver became the new enforcement point
with full fallback logic.

Current state:

- Validator: accepts too much (no contract check, no version-aware cache lookup).
- Handler: treats provided fields as authoritative, throws when one fails.
- Fallback: only kicks in at the Phase 2 last-resort level (error envelope),
  not as a real recovery path.

Evaluator wants:

1. **Strict validation** of obviously bad input at acceptance.
2. **Smart fallback** through the tier chain when one field is unreachable
   but others are valid.
3. **Exact version matching** when the buyer specifies a version.

---

## Proposed fix — coordinated, not sequential

### A. Validator tightening

Re-add `eth_getCode` contract check in `WpvService.aggregateSignals`:

- If `token_address` is provided and is EVM-format, query Base and Ethereum
  RPCs. If no bytecode on either chain, hard-reject pre-acceptance with a
  structured reason.
- Keep existing Solana/base58 path untouched.
- Keep OR semantics between fields.

Fixes #1246.

### B. Handler fallback for URL fetch failure

In `JobRouter.runL1L2` (and the verify / full_tech handler paths that call it):

- Wrap `cryptoResolver.resolveWhitepaper(documentUrl)` in try/catch.
- On error (HTTP 4xx/5xx, timeout, parse failure): log the attempt, clear
  `document_url` from the requirement, and fall through to
  `tieredDiscovery.discover(metadata, tokenAddress)` which invokes
  the full tier chain including Tier 3.5 GitHub and Tier 3.75 aggregator.
- Only surface INSUFFICIENT_DATA if the discovery fallback ALSO fails.
- Deliverable should record both attempts in `discoveryAttempts`.

Fixes #1249.

### C. Version-aware cache lookup

In `JobRouter.findWhitepaper` (or equivalent cache lookup):

- Primary lookup: exact projectName match.
- Fallback only if primary misses: stripped-version match.
- Do NOT replace primary hit with a stripped match even if both exist.
- Preserve the original version-qualified `projectName` in the delivered report.

Fixes #1243.

### D. What NOT to change

- Signal aggregator OR semantics — working.
- Phase 2 never-reject-post-acceptance — working.
- MiCA discrepancy verdict downgrade — working.
- Tier 3.5 / 3.75 resolvers — working.
- Cache write-back rules — working.
- Pre-accept content filters (NSFW/injection/malicious) — working.

---

## Verification plan before deploying

Manual curl sweep against ALL 15 eval cases locally via HTTP handler:

- 4 briefing (3 accept, 1 reject) → all passed already
- 4 full_tech (2 accept, 2 reject) → confirm #1243 now serves Uniswap V3
- 3 legit_scan (1 accept, 1 fail #1246, 1 reject) → confirm #1246 rejects
  malformed address pre-acceptance
- 4 verify (1 accept, 1 fail #1249, 2 reject) → confirm #1249 delivers Aave
  content via fallback

Only deploy if sweep shows 15/15 locally, OR a clear explanation of the
residual failure.

---

## Files affected

| File | Phase | Change |
|------|-------|--------|
| `plugin-wpv/src/WpvService.ts` | A | Re-enable `eth_getCode` branch in `aggregateSignals` |
| `plugin-wpv/src/acp/JobRouter.ts` | B, C | try/catch around resolveWhitepaper, version-aware findWhitepaper |
| `plugin-wpv/src/acp/JobRouter.ts` | C | Remove / demote `stripVersionSuffix()` in cache-first lookup |

No schema changes. No new files. No plugin-acp changes.

---

## Outstanding risk

If the evaluator's tests randomize which fields are provided per offering
(they do vary slightly eval-to-eval), my fixes may not land perfectly on
the next eval's shape either. Best hedge: verification sweep against
today's 15 cases plus a few edge cases (e.g., valid address + broken URL
+ no name) before deploying.
