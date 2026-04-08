# Kovsky Execution Plan — Eval 34 Fixes (4 Failures, 3 Root Causes)

> **Source:** Forces + Claude Opus review of eval 34 results + Kov intel report
> **Date:** 2026-04-08
> **Goal:** Fix 4 failures. 11/15 → 15/15. Graduation.
> **Status:** Verify 4/4 PERFECT. Empty {} rejection working. NSFW/safety filters working. Three new issues from DB cleanup + slow pipeline.

---

## The 4 Failures — 3 Root Causes

| # | Root Cause | Failures | Jobs | Fix |
|---|-----------|----------|------|-----|
| F1 | Job mutex blocks briefing behind slow jobs | 2 (briefing EXPIRED) | 1003368556, 1003368558 | Exempt briefings from mutex |
| F2 | Playwright+DocsSiteCrawler exceeds 5min SLA | 1 (scan EXPIRED) | 1003368540 | Pipeline timeout cap |
| F3 | Soft-stripped token_address not used for resolveTokenName | 1 (full_tech INSUFFICIENT_DATA) | 1003368550 | _originalTokenAddress fallback |

---

## F3: resolveTokenName Falls Back to Null After Soft-Strip (CODE BUG)

### The Problem

Kov's root cause trace for job 1003368550:

1. Evaluator sends plain text: `"Verify the technical claims and mathematical validity of the Aave V3 protocol (token: 0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE)..."`
2. Token address extracted → `input.token_address` set
3. eth_getCode: Aave governance token has no bytecode on Base. Ethereum RPC timeout → `isContractAddress` returns false → soft-strip fires
4. `input._originalTokenAddress` = `"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"`, `input.token_address` deleted
5. Handler reads `requestedTokenAddress = input.token_address` → **null**
6. `if (!projectName && requestedTokenAddress)` → **false** (requestedTokenAddress is null)
7. `resolveTokenName` never called → DexScreener never queried → projectName stays "Unknown"
8. Discovery with "Unknown" + no address → fails → INSUFFICIENT_DATA

The fix exists for the deliverable response (`originalTokenAddress` overlay) but NOT for the token name resolution step.

### The Fix

**File:** `src/acp/JobRouter.ts`

**In `handleVerifyWhitepaper` (~line 400):**

Find:
```typescript
if (!projectName && requestedTokenAddress) {
  const resolved = await resolveTokenName(requestedTokenAddress);
```

Replace with:
```typescript
if (!projectName && (requestedTokenAddress || originalTokenAddress)) {
  const resolved = await resolveTokenName((requestedTokenAddress || originalTokenAddress)!);
```

**In `handleFullVerification` (~line 630-635):**

Same pattern. Find the `if (!reqName && reqAddr)` block. The local variable for the original address is `originalAddr`. Change to:

```typescript
if (!reqName && (reqAddr || originalAddr)) {
  const resolved = await resolveTokenName((reqAddr || originalAddr)!);
```

**In `handleLegitimacyScan` (~lines 185-195):**

Same pattern. Find the `if (!projectName && tokenAddress)` block. The local variable for the original address is `originalTokenAddress`. Change to:

```typescript
if (!projectName && (tokenAddress || originalTokenAddress)) {
  const resolved = await resolveTokenName((tokenAddress || originalTokenAddress)!);
```

**In `findBestWhitepaper` (~line 1193):**

The address-based lookup reads `input.token_address` directly, which is null after soft-strip. Add `_originalTokenAddress` fallback:

Find:
```typescript
if (tokenAddress) {
  const byAddr = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
```

Change the variable assignment above it (where `tokenAddress` is read from input) to:
```typescript
const tokenAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;
```

Or if the variable is already set from `input.token_address`, add the fallback at the assignment point. The goal: `findBestWhitepaper` should search by the original address when the validator soft-stripped it.

**Self-audit:** Could using `_originalTokenAddress` for cache lookup return wrong results? No — the address is the buyer's input. If they sent an Aave governance token address, finding cached Aave data by that address is correct behavior. The soft-strip only means "don't use this address for on-chain calls" — it shouldn't prevent DB lookups.

---

## F1: Briefing EXPIRED — Mutex Exemption (ARCHITECTURE)

### The Problem

The job mutex serializes ALL jobs. Briefings are read-only — they query `getMostRecent` or `getVerificationsByDate`, build a report, return it. Zero DB writes. Zero Playwright. Zero Sonnet calls. But they wait behind slow live pipeline runs (Aerodrome scan took ~7 minutes).

The ACP SLA is ~5 minutes. When a briefing queues behind a 7-minute Playwright crawl + Sonnet extraction, it expires before the mutex releases.

### The Fix

**File:** `src/acp/JobRouter.ts` — in the `handleJob` method (or wherever the mutex is acquired)

The mutex wraps the `handleJob` dispatch. Briefings should bypass it entirely.

Find the mutex acquisition point. It likely looks like:

```typescript
async handleJob(offeringId: string, input: Record<string, unknown>) {
  return this._jobMutex.runExclusive(async () => {
    // ... switch(offeringId) dispatch
  });
}
```

Change to:

```typescript
async handleJob(offeringId: string, input: Record<string, unknown>) {
  // Briefings are read-only — no DB writes, no Playwright, no Sonnet.
  // Exempt from mutex to prevent SLA violations from slow pipeline jobs.
  if (offeringId === 'daily_technical_briefing') {
    return this._handleJobImpl(offeringId, input);
  }
  return this._jobMutex.runExclusive(async () => {
    return this._handleJobImpl(offeringId, input);
  });
}
```

If the dispatch logic is inline (not in a separate `_handleJobImpl`), extract it first, then route briefings around the mutex.

**Self-audit: Is briefing truly read-only?**

The briefing handler:
1. Reads verifications by date (`getVerificationsByDate`) or most recent (`getMostRecent`)
2. Builds report from results
3. Returns report

No `create`, `update`, `delete`, `upsert` calls. No Playwright. No Sonnet. No CostTracker writes. It's a pure read path. Safe to run outside the mutex.

**Self-audit: Could concurrent briefing + live pipeline cause read inconsistency?**

Supabase handles concurrent reads. A briefing reading `getMostRecent` while a live pipeline writes a new verification is fine — the briefing either sees the new row or doesn't, both are valid states. No TOCTOU risk because briefings don't write.

---

## F2: Pipeline Timeout Cap (ARCHITECTURE)

### The Problem

The Aerodrome scan took ~7 minutes. The ACP SLA is ~5 minutes. The job completed (`generatedAt: 2026-04-08T16:42:19`) but the delivery window had closed. Even with the mutex, a single slow job shouldn't exceed the SLA.

The slowness came from Playwright + DocsSiteCrawler. Aerodrome's docs site required headless rendering + sub-page crawling. The crawl itself took the majority of the time.

### The Fix

**File:** `src/acp/JobRouter.ts` — wrap the live pipeline with a timeout

Add a constant:
```typescript
const PIPELINE_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes — leaves 1 min for ACP overhead
```

In each handler's live pipeline path (where `runL1L2` is called), wrap with `Promise.race`:

```typescript
const pipelineResult = await Promise.race([
  this.runL1L2(documentUrl, projectName, tokenAddress, requirementText, costTracker),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Pipeline timeout: exceeded 4-minute limit')), PIPELINE_TIMEOUT_MS)
  ),
]);
```

Catch the timeout error and return INSUFFICIENT_DATA:

```typescript
try {
  const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = await Promise.race([
    this.runL1L2(...),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Pipeline timeout')), PIPELINE_TIMEOUT_MS)
    ),
  ]);
  // ... normal processing
} catch (err) {
  if ((err as Error).message === 'Pipeline timeout') {
    log.warn('Pipeline timeout — returning INSUFFICIENT_DATA', { projectName, offeringId });
    return this.insufficientData(input);
  }
  throw err;
}
```

Apply this pattern to:
1. `handleLegitimacyScan` — live L1 path (discovery + structural analysis)
2. `handleVerifyWhitepaper` — live pipeline path (when hasDocumentUrl or discovery fallback)
3. `handleFullVerification` — live pipeline path (discovery + L1+L2+L3)

**Self-audit: Does the timeout clean up resources?**

The `Promise.race` doesn't cancel the underlying operation — `runL1L2` continues running in the background. But:
- The mutex releases when the handler returns (INSUFFICIENT_DATA), unblocking the next job
- Playwright has its own timeout (30s per page render)
- The background operation will eventually complete or timeout on its own
- No DB corruption risk — the background write may complete after the response is sent, adding data for future cache hits

This is a pragmatic tradeoff: the timeout prevents SLA violations without requiring a full cancellation mechanism. The background operation wastes some CPU/RAM but doesn't corrupt state.

**Alternative considered: AbortController.** Could pass an AbortSignal through the pipeline to cancel fetch/Playwright operations. This is cleaner but requires threading the signal through `runL1L2` → `CryptoContentResolver` → `HeadlessBrowserResolver` → `DocsSiteCrawler`. Significant refactor. The `Promise.race` approach works now and can be upgraded later.

---

## DB Operations

### Fix 4: Purge Garbage Entries

After code deployment, before seeding:

```sql
-- Remove eval artifacts with no useful data
-- Forces-approved scope: only entries with 0 claims or no verification

-- Delete claims for garbage entries (should be 0 but be safe)
DELETE FROM autognostic.wpv_claims WHERE whitepaper_id IN (
  SELECT w.id FROM autognostic.wpv_whitepapers w
  LEFT JOIN autognostic.wpv_verifications v ON v.whitepaper_id = w.id
  WHERE w.project_name IN ('Unknown')
  OR (v.id IS NULL AND w.project_name NOT IN ('Uniswap', 'Aave', 'Lido', 'Chainlink', 'Chainlink v2'))
);

-- Delete verifications for garbage entries
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT w.id FROM autognostic.wpv_whitepapers w
  WHERE w.project_name IN ('Unknown')
);

-- Delete the whitepaper entries themselves
DELETE FROM autognostic.wpv_whitepapers
WHERE project_name IN ('Unknown')
OR id NOT IN (SELECT DISTINCT whitepaper_id FROM autognostic.wpv_claims WHERE whitepaper_id IS NOT NULL);
```

**Review the DB state after purge.** Report what remains.

### Fix 5: Re-Seed via Live Pipeline

After purge, seed 3 projects through HTTP (same as pre-eval 32):

```bash
# Seed 1: Uniswap v3
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"seed-uniswap","offering_id":"full_technical_verification","arguments":{"project_name":"Uniswap","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","document_url":"https://uniswap.org/whitepaper-v3.pdf"}}' | jq '.claimCount, .verdict, .confidenceScore'

# Seed 2: Aave v1
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"seed-aave","offering_id":"full_technical_verification","arguments":{"project_name":"Aave","document_url":"https://raw.githubusercontent.com/aave/aave-protocol/master/docs/Aave_Protocol_Whitepaper_v1_0.pdf"}}' | jq '.claimCount, .verdict, .confidenceScore'

# Seed 3: Lido
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"seed-lido","offering_id":"full_technical_verification","arguments":{"project_name":"Lido","token_address":"0x5a98fcbea516cf06857215779fd812ca3bef1b32","document_url":"https://docs.lido.fi/"}}' | jq '.claimCount, .verdict, .confidenceScore'
```

Wait for each to complete before sending the next (mutex serializes them anyway).

---

## Execution Order

1. **F3 first** — resolveTokenName fallback. Lowest risk, pure code bug fix.
2. **F1 second** — briefing mutex exemption. Low risk, read-only path.
3. **F2 third** — pipeline timeout cap. Most architectural change.
4. **Build → test** — must pass 309+
5. **Deploy to VPS**
6. **Fix 4** — DB purge (after deploy, uses deployed code)
7. **Fix 5** — re-seed (after purge)
8. **PM2 restart** — clean in-memory state
9. **Verify** — run all tests below

---

## Verification Plan

### Test F3: resolveTokenName with soft-stripped address

```bash
# Aave governance token (Ethereum mainnet, no Base bytecode)
# Should resolve to "Aave" via DexScreener, not "Unknown"
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-f3-aave","offering_id":"full_technical_verification","arguments":{"token_address":"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"}}' | jq '.projectName, .verdict, .claimCount'

# Expected: "Aave" (or "Aave Token"), not "Unknown". Claims > 0.
```

### Test F1: Briefing doesn't block behind slow jobs

This is hard to test in isolation. The verification is:
1. After deployment, confirm briefing returns in <2 seconds:

```bash
time curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-f1-briefing","offering_id":"daily_technical_briefing","arguments":{}}' | jq '.totalVerified'

# Expected: response in <2s, totalVerified >= 3
```

2. The real test is during the eval when briefings run concurrently with live pipeline jobs. The mutex exemption ensures they don't queue.

### Test F2: Pipeline timeout

```bash
# Test with a project that requires Playwright crawling
# Should return within 4.5 minutes max, not 7+
time curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-f2-timeout","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Aerodrome","token_address":"0x940181a94A35A4569E4529A3CDfB74e38FD98631"}}' | jq '.verdict, .projectName'

# Expected: completes within 4.5 minutes. Either valid result or INSUFFICIENT_DATA.
```

### Test regressions

```bash
# Scan — cached, should be fast
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-scan","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Uniswap","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}}' | jq '.verdict, .tokenAddress'

# Verify — cached
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-verify","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Uniswap","document_url":"https://uniswap.org/whitepaper-v3.pdf"}}' | jq '.verdict, .claimCount'

# Empty {} — should reject
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-empty","offering_id":"full_technical_verification","arguments":{}}'

# Expected: error "must include at least one of"

# Briefing
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-briefing","offering_id":"daily_technical_briefing","arguments":{}}' | jq '.totalVerified'
```

---

## Pre-Eval Checklist

- [ ] F3: Aave governance token resolves to "Aave" (not "Unknown")
- [ ] F1: Briefing returns in <2s
- [ ] F2: Aerodrome scan completes within 4.5 minutes
- [ ] Regression: scan/verify/full_tech/briefing all work
- [ ] Empty {} rejected on full_tech
- [ ] DB: 3+ seeded projects with claims > 0
- [ ] All tests pass (309+)
- [ ] ACP connected, 4 handlers registered
- [ ] PM2 restart performed

---

## DB Rules

- Purge scoped to garbage entries only (Unknown, 0-claim entries without matching seed projects)
- Re-seed via live pipeline HTTP — no manual SQL INSERT for claim data
- **CRITICAL:** Never wipe/delete from wpv_claims, wpv_verifications, or wpv_whitepapers without explicit Forces approval. The purge SQL above is Forces-approved.

---

## Files Changed

| File | Change |
|------|--------|
| `src/acp/JobRouter.ts` | F3: `_originalTokenAddress` fallback in resolveTokenName calls (3 handlers + findBestWhitepaper) |
| `src/acp/JobRouter.ts` | F1: Briefing mutex exemption — route around `_jobMutex` |
| `src/acp/JobRouter.ts` | F2: `PIPELINE_TIMEOUT_MS` (4 min) wrapping `runL1L2` in all live pipeline paths |

---

*Implement in order: F3 (resolveTokenName) → F1 (briefing mutex) → F2 (pipeline timeout) → build → test → deploy → DB purge → re-seed → PM2 restart → verify → trigger eval.*
