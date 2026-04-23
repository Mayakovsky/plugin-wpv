# Eval Zoom-Out Fix Plan — 12/15 → 15/15 (v2)

> Date: 2026-04-23
> Status: Pending Forces approval before implementation
> Supersedes: v1 of this document (same filename, 2026-04-23 morning)
> Context: After two deploy cycles chasing individual eval failures, we're at
> 12/15 (down from 14/15 → 25/28 baseline). Forces called the zoom-out. v1
> of this plan was drafted; code review against the raw eval report revealed
> two of the three proposed fixes targeted the wrong code paths. This is v2.

---

## Framing correction (new in v2)

"REJECTED" in the evaluator report refers to the **job phase set by the
evaluator after reviewing Grey's deliverable**, not pre-acceptance rejection
by the provider. For all three failures:

- Grey accepted the job (OR logic in `aggregateSignals` worked correctly).
- Grey submitted a deliverable.
- The evaluator judged the deliverable's quality as unacceptable and set
  phase = REJECTED.

The delivered payloads in the raw report confirm this:

| Job | Delivered |
|-----|-----------|
| 1246 | `verdict: PASS` Aerodrome report with the typo address stamped on it |
| 1249 | `verdict: INSUFFICIENT_DATA` with `discoveryAttempts: []` and `error: "HTTP 404..."` |
| 1243 | `verdict: CONDITIONAL` V2 content with `projectName: "Uniswap"` and logicSummary containing *"CRITICAL NOTE: The document provided describes Uniswap V2, not V3 as requested"* |

So the pattern is **silent corruption of the deliverable**, not
over-rejection. Fixes target that.

---

## What landed in prior cycles (unchanged)

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

**Three new failures — verified against the raw report:**

### Failure 1 — Job 1243 (full_technical_verification) — Uniswap V3 → V2

- **Input:** plain text `"Mathematical analysis of Uniswap V3 (0x1f9840a85d5af5bf1d1762f925bdaddc4201f984) liquidity math."`
- **Output:** V2 content (15 V2-era claims: UQ112.112, flash swaps, meta
  transactions) with `projectName: "Uniswap"` (no version) and a
  synthesis-generated note admitting the content is V2 not V3.
- **DB state (confirmed via briefing deliverable in same report):** cache
  contains BOTH rows — `{projectName: "Uniswap v3", tokenAddress: null,
  claimCount: 10}` AND `{projectName: "Uniswap", tokenAddress: "0x1f9840...",
  claimCount: 15}`.
- **Root cause (verified):** `findBestWhitepaper` (`JobRouter.ts:1309`):
  1. `findByProjectName("Uniswap V3")` correctly matches the V3 row.
  2. `findByTokenAddress("0x1f9840...")` separately returns the V2 row.
  3. Both are pushed into `candidates`; dedup is by `id`, so both survive.
  4. `usable.sort((a, b) => b.claimCount - a.claimCount)` prefers V2 (15 > 10).
  5. V2 wins. Delivered.
- **v1 plan's proposed fix targets dead code.** `stripVersionSuffix` is not
  even on this path — it only runs when `byName.length === 0`, but byName
  had the V3 hit. The bug is in the sort-by-claim-count merge of name and
  address lookups.
- **Secondary bug:** Grey's synthesis correctly detected the V2/V3 mismatch
  and wrote it into `logicSummary`, but the verdict and delivery path ignored
  that signal.

### Failure 2 — Job 1246 (project_legitimacy_scan) — Aerodrome typo address

- **Input:** `{"token_address":"0x940181a9ad482c1a306652651d769a677b8fd98631","project_name":"Aerodrome Finance"}`
- **Typo analysis:** 42 hex chars after `0x` (real AERO has 40). Fails the
  EVM format regex `/^0x[0-9a-fA-F]{20,40}$/` at `WpvService.ts:651`.
- **Output:** `verdict: PASS` with the typo address stamped onto the report:
  ```json
  {"projectName":"Aerodrome Finance", "tokenAddress":"0x940181a9ad482c1a306652651d769a677b8fd98631",
   "verdict":"PASS", "discoveryStatus":"cached", "discoverySourceTier":0, ...}
  ```
- **Root cause (verified):** typo fails format regex → `validToken = false` →
  silently stripped to `_originalTokenAddress` → name signal "Aerodrome
  Finance" accepted via OR → cache hit on name → cached PASS delivered →
  `_originalTokenAddress` stamped back onto the report at `JobRouter.ts:194-197`.
- **Evaluator's explicit guidance:** *"Implement strict validation for blockchain
  addresses (e.g., ensuring 20-byte hex format) and decline malformed inputs ...
  rather than submitting a deliverable for invalid data."*
- **v1 plan's proposed fix (`eth_getCode`) does not solve this.** `eth_getCode`
  only fires for addresses that pass format validation. The Aerodrome typo
  fails format at the regex, never reaches the bytecode path.

### Failure 3 — Job 1249 (verify_project_whitepaper) — Aave 404

- **Input:** `{"token_address":"0x7fc66500...","document_url":"https://aave.com/whitepaper.pdf","project_name":"Aave"}`
- **Output:** `{"verdict":"INSUFFICIENT_DATA","discoveryStatus":"failed","discoveryAttempts":[],"error":"HTTP 404 fetching https://aave.com/whitepaper.pdf"}`
- **Root cause (verified):** `aggregateSignals` accepts (URL syntactically
  valid, no reachability check — intentionally removed in Phase 1). Handler
  calls `runL1L2(documentUrl, ...)` which calls `cryptoResolver.resolveWhitepaper`
  which throws on HTTP 404. `handleVerifyWhitepaper`'s catch only handles
  `'Pipeline timeout'` — rethrows → bubbles to plugin-acp's `handleJobFunded`
  catch → Phase 2 envelope delivered with `discoveryAttempts: []` and raw error.
- **Evaluator guidance:** *"the agent should decline the request ... or ...
  search for correct information ... when a specific link fails."* Two options;
  we choose to recover, not decline, since we have valid token + name signals.
- **v1 plan's placement for the fix (inside `runL1L2`) is wrong.** `runL1L2`
  is shared with the L1-only-cache enrichment path — wrapping inside it would
  swallow errors that other callers expect to see.

---

## The pattern (updated in v2)

When I built the signal aggregator in Phase 1, I moved validation from **strict**
(old field-level validator throws) to **permissive** (deferred to resolver).
I completed half the change — the aggregator became permissive — but did not
complete the other half — the resolver became the new enforcement point with
full fallback logic.

Current state across the three failures:

- **Validator:** accepts malformed addresses by silently stripping them, then
  re-stamping them back onto the delivered report.
- **Cache lookup:** merges name-path and address-path candidates and sorts
  by claim count, allowing an unrelated address hit to beat an exact
  version-qualified name hit.
- **Handler:** treats provided URL as authoritative, throws when it fails,
  never falls through to discovery even though valid token + name are present.
- **Verdict logic:** ignores Grey's own synthesis detecting wrong content.

Evaluator wants:

1. **Strict format validation** of obviously bad addresses at acceptance.
2. **Exact version matching** when the buyer specifies a version — don't
   substitute a cached different-version match.
3. **Smart fallback** through the tier chain when a field is unreachable
   but others are valid, with provenance recorded in `discoveryAttempts`.

---

## Proposed fix (v2) — four coordinated changes

### Fix 1. Strict format rejection in `aggregateSignals`

**File:** `plugin-wpv/src/WpvService.ts`

In both `aggregateSignals` and `validateTokenAddress` (the latter still used
by `daily_technical_briefing`), when `token_address` is provided:

- If it starts with `0x` but fails `/^0x[0-9a-fA-F]{40}$/` (exactly 40 hex
  chars — the EVM standard): **throw InputValidationError pre-acceptance.**
  Structured reason: "Invalid token_address: expected 0x-prefixed 40-hex-
  character address (20-byte EVM format), got `<truncated>`."
- If it does not start with `0x` and is not Bitcoin (already rejected) and
  fails the base58 regex `/^[a-zA-Z0-9]{26,50}$/`: **throw InputValidationError
  pre-acceptance** with a similar structured reason.
- Do NOT silently strip malformed addresses. The current silent-strip
  behavior papers over buyer errors and lets downstream code serve
  different-project data with a bad address attached.

**Regex decision — exact 40 hex, not a range.** The existing code uses
`{20,40}` with a comment claiming "some chains use shorter addresses."
That claim does not hold up: every EVM chain (Ethereum, Base, Polygon,
BSC, Avalanche C-Chain, Arbitrum, Optimism, all testnets) uses 20-byte
addresses — the Solidity and ERC-20 standard, hardcoded across viem,
ethers, web3.js. EIP-55 checksummed addresses are still exactly 40 hex
(mixed case). Every `tokenAddress` field in today's briefing deliverable
is 40 hex. The `{20,40}` range has never been exercised by real data.
The evaluator's guidance was explicit: "ensuring 20-byte hex format" —
that's exactly 40 hex chars, no range. Tightening to `{40}` also catches
the Aerodrome 42-hex typo that the current `{20,40}` rejects too (42 > 40)
but means we stop silently accepting truncated addresses like 20-hex
strings that have no legitimate source.

**Separation: validate strictly, extract loosely.** Four regex sites touch
EVM addresses in the codebase:

| Site | Current | After Fix 1 | Purpose |
|------|---------|-------------|---------|
| `WpvService.ts:651` (`aggregateSignals`) | `{20,40}` | `{40}` | Validate structured input |
| `WpvService.ts:1079` (`validateTokenAddress`) | `{20,40}` | `{40}` | Validate structured input (briefing) |
| `WpvService.ts:408` (`extractFromUnknownFields`) | `{20,42}` | *(unchanged)* | Scrape from free text |
| `plugin-acp/AcpService.ts:611` (`parseRequirement` plain-text) | `{10,42}` | *(unchanged)* | Scrape from plain text |

Extractors stay loose because plain-text requirements sometimes abbreviate
addresses; any extracted candidate then flows through the (now-strict)
validator. Defense in depth: extract generously, validate strictly.

**Preserves OR semantics** for the case we care about (valid name + bad URL):
URL reachability is still handled in the resolver, not the validator. Only
address *syntax* is tightened. Name-path with a bad URL still works.

**Does not re-introduce the Uniswap-with-broken-URL regression.** That
regression was about URL reachability (HEAD check); this change is about
address syntax (format regex). Orthogonal.

**Separate (not this plan):** `eth_getCode` re-enable for EOA-wallet detection
is a real gap but a different failure mode. Bundle it as a follow-up once we
see an EOA-wallet failure in evaluation.

Fixes #1246.

### Fix 2. Name-path preference in `findBestWhitepaper`

**File:** `plugin-wpv/src/acp/JobRouter.ts`

In `findBestWhitepaper`:

- Run the name lookup (including version-aware strip fallback) first.
- **If the name lookup returns any usable candidate (claims > 0), return
  the best name-path match immediately.** Do NOT proceed to the token-address
  lookup.
- Only run `findByTokenAddress` when the name lookup returned zero usable
  candidates.
- Same change applies to `findWhitepaper` (used by legitimacy scan).

**Alternative considered:** filter address-lookup results by `requestedVersion`
when projectName contains a version. Rejected — adds complexity without
removing the sort-by-claim-count hazard for other version-qualified names
we haven't seen yet.

Fixes #1243 at the cache-lookup layer. Also safer for any future
version-qualified name request.

### Fix 3. Handler-level fetch-failure fallback

**File:** `plugin-wpv/src/acp/JobRouter.ts`

In both `handleVerifyWhitepaper` (around line 581) and `handleFullVerification`
(around line 958):

- Wrap the `runL1L2(documentUrl, ...)` call in try/catch.
- On fetch failure (any non-timeout error from `runL1L2`): log the attempt
  as a Tier 1 failure; call `tieredDiscovery.discover(metadata, tokenAddress)`;
  re-run `runL1L2(discovered.documentUrl, ...)` with the discovered URL.
- If discovery also fails: return `insufficientData(input)` with
  `discoveryAttempts` populated: `[{tier: 1, status: 'unreachable', url: ...},
  {tier: N, status: 'failed'}]` — not the current empty array.
- Only surface INSUFFICIENT_DATA after the fallback is exhausted.

**Do NOT put the try/catch inside `runL1L2`.** `runL1L2` is shared by the
L1-only-cache enrichment path at `JobRouter.ts:775` which expects errors
to propagate differently.

**Extend `insufficientData` helper** to accept an optional `discoveryAttempts`
array parameter, defaulting to empty (current behavior preserved for callers
that don't have attempt data).

Fixes #1249. Also improves the deliverable for any future fetch-failure-then-
fallback-failure case.

### Fix 4. Verdict downgrade on synthesis-detected version mismatch

**File:** `plugin-wpv/src/acp/JobRouter.ts` (or `ReportGenerator.ts`)

When `requirementText` specifies a version (`v\d+`) and the cached/delivered
`projectName` does not contain that version:

- If the synthesis output (`logicSummary`) contains the phrases "V2, not V3"
  / "V3, not V2" / "different version" / equivalent — OR more reliably, if
  the request's requested-version differs from the delivered row's version —
  downgrade `verdict: PASS|CONDITIONAL → INSUFFICIENT_DATA`. Do not deliver
  the wrong-version content as a satisfied request.

**Cheap safety net** even after Fix 2. If Fix 2 has an edge case we miss,
Fix 4 catches the mismatch at the delivery boundary. 5-line check.

Fixes #1243 defensively (Fix 2 is the primary fix; Fix 4 is insurance).

### What NOT to change

- Signal aggregator OR semantics — working.
- Phase 2 never-reject-post-acceptance — working.
- MiCA discrepancy verdict downgrade — working.
- Tier 3.5 / 3.75 resolvers — working.
- Cache write-back rules — working.
- Pre-accept content filters (NSFW/injection/malicious) — working.
- URL reachability HEAD check in `aggregateSignals` — intentionally absent,
  do not re-introduce (would re-create the Uniswap-with-broken-URL regression).

---

## Differences from v1

| | v1 plan | v2 plan |
|---|---------|---------|
| Aerodrome | Re-enable `eth_getCode` | Strict format rejection, regex tightened to exact 40 hex (eth_getCode doesn't fire for malformed-format addresses) |
| Uniswap V3 | Demote `stripVersionSuffix` to fallback-only | Return first usable name-path match; skip address lookup when name hit (stripVersionSuffix not on this path) |
| Aave 404 | try/catch inside `runL1L2` | try/catch in handlers; populate `discoveryAttempts` on insufficient data |
| New fix | — | Verdict downgrade on version-mismatch synthesis (safety net) |
| Tests | Not specified | Unit tests per fix |
| Deploy | Single commit | Per-fix commits for granular revert |
| Regression sweep | 15 current cases | 15 current + 25 prior eval-1 passes; explicit grep for non-40-hex EVM addresses before Fix 1 deploy |

---

## Verification plan

**Unit tests (new) — written alongside each fix:**

- Fix 1: 42-char `0x...` address (Aerodrome typo shape) → `aggregateSignals`
  throws InputValidationError. 20-char `0x...` address (truncated) →
  throws. 40-char valid address → accepted as token signal. 40-char EIP-55
  checksummed address (mixed case) → accepted. Malformed non-hex address
  → throws. Bitcoin address still rejects separately. Same four cases
  against `validateTokenAddress` for briefing parity.
- Fix 2: cache has both `{name: "Uniswap v3", addr: null}` and
  `{name: "Uniswap", addr: "0x1f98..."}` — request `{project_name: "Uniswap V3",
  token_address: "0x1f98..."}` → returns the V3 row, not V2.
- Fix 3: mock `cryptoResolver.resolveWhitepaper` to throw HTTP 404 → handler
  falls through to `tieredDiscovery.discover`; on double failure, result has
  `discoveryAttempts` populated.
- Fix 4: cache row `{name: "Uniswap", ...}` returned for request with
  `requested_version: "v3"` → verdict downgraded to INSUFFICIENT_DATA.

**Manual curl sweep against HTTP handler (before VPS deploy):**

- All 15 current eval cases (must pass).
- Spot-check of 5–10 prior eval-1 passes that involved valid token addresses
  (must still pass — Fix 1 risk zone).
- Edge cases:
  - Valid 40-char address + valid project_name + broken URL (should accept,
    fall through to discovery).
  - 42-char typo address + valid project_name (should reject pre-acceptance).
  - 20-char truncated address + valid project_name (should reject
    pre-acceptance under tightened regex).
  - EIP-55 checksummed 40-char address (mixed case) + valid project_name
    (should accept — regex is case-insensitive).
  - Valid address + project_name "Uniswap V3" where only V2 is cached
    (should skip cache, go to live discovery for V3).
  - Cache has V2 only, request for V3 with broken URL (Fix 2 + Fix 3 combined).

Only deploy if the sweep shows 15/15 locally AND the prior-pass spot-check
shows no regressions.

---

## Files affected

| File | Fix | Change |
|------|-----|--------|
| `plugin-wpv/src/WpvService.ts` | 1 | Strict format rejection in `aggregateSignals` (line 651) AND `validateTokenAddress` (line 1079). Tighten EVM regex from `{20,40}` to exact `{40}`. Throw `InputValidationError` on format failure instead of silent-strip. Extraction regexes (line 408; plugin-acp line 611) stay loose — defense in depth. |
| `plugin-wpv/src/acp/JobRouter.ts` | 2 | `findBestWhitepaper` + `findWhitepaper`: return first usable name-path match; address lookup only when name yields nothing |
| `plugin-wpv/src/acp/JobRouter.ts` | 3 | try/catch around `runL1L2(documentUrl, ...)` in `handleVerifyWhitepaper` and `handleFullVerification`; extend `insufficientData` to accept `discoveryAttempts` |
| `plugin-wpv/src/acp/JobRouter.ts` or `ReportGenerator.ts` | 4 | Version-mismatch detection + verdict downgrade at delivery boundary |
| `plugin-wpv/src/**/__tests__/*.test.ts` | all | New unit tests per fix |

No schema changes. No new source files. No `plugin-acp` changes.

---

## Deploy strategy

**Per-fix commits**, not a bundle. Commit in order:

1. Fix 1 + unit test → local sweep → if pass, commit.
2. Fix 2 + unit test → local sweep → if pass, commit.
3. Fix 3 + unit test → local sweep → if pass, commit.
4. Fix 4 + unit test → local sweep → if pass, commit.
5. Full manual curl sweep (15 current + spot-check prior passes).
6. If all pass: SCP to VPS, `bun install && bun run build`, `pm2 restart grey`.
7. Verify SDK reconnect + 4 handlers registered in logs before signaling DevRel.
8. Re-run DevRel eval.

If eval regresses, the revert is one or more `git revert <sha>` commands —
we can bisect which fix caused the regression instead of reverting the full
bundle.

---

## Outstanding risk

**Fix 1 (strict format rejection) is the highest-regression-risk change.**
It tightens pre-acceptance validation from `{20,40}` to exactly `{40}` hex
chars. Before deploy, grep the 25 prior-eval-1 pass inputs for any `0x...`
token_address fields that are not exactly 40 hex chars. If any are found,
we need to reconcile — either the address was padded/abbreviated (real regression
risk) or it's a test artifact we can ignore. No reconciliation = block deploy.
Checksummed (mixed-case) 40-hex addresses are safe: the regex uses
`[0-9a-fA-F]` which is case-insensitive on length, and no EVM tool normalizes
length away from 40.

**Fix 2 (name-path preference) could change behavior for cases where the
name lookup returns a thin row and the address lookup has a richer row for
the same project.** Previously we'd return the richer row; now we return
the thinner one. This matters mostly if we have rows like `{name: "Aave",
claims: 2}` AND `{name: "Aave", addr: "0x...", claims: 20}` — both match
name, both survive, sort picks the richer. Fix 2 still works here because
both come from the *name path*; the sort-by-claim-count still applies
within a single path. Verify via DB snapshot before deploy.

**Fix 4 depends on reliable version extraction from the request.** If the
request's "v3" lives only in `requirementText` (plain-text) and not in
`projectName`, we need to extract it before the version-mismatch check.
`WpvService.extractFromUnknownFields` already does this for structured
requests but skips for plain-text (line 513). The plain-text parser in
`AcpService.parseRequirement` captures "V3" via `KNOWN_PROTOCOL_PATTERN`.
Verify both paths set `projectName` with version intact before trusting
Fix 4.

---

## Success criteria

1. All 15 current eval cases pass locally before deploy.
2. Spot-checked prior-eval-1 passes show no regressions locally.
3. Each fix has an accompanying passing unit test.
4. Per-fix commits enable granular revert if eval regresses.
5. Re-run DevRel eval → target **15/15**.
6. Evaluator's specific complaints addressed:
   - Job 1246 objection ("decline malformed inputs") → addressed by Fix 1.
   - Job 1243 objection ("match the specific protocol version requested") →
     addressed by Fix 2, belt-and-suspenders via Fix 4.
   - Job 1249 objection ("search for correct information when a specific
     link fails") → addressed by Fix 3 with populated `discoveryAttempts`.
