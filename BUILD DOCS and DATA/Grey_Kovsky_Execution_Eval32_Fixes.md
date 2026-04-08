# Kovsky Execution Plan — Eval 32 Fixes (3 Issues, 6 Failures)

> **Source:** Forces + Claude Opus review of eval 32 results + Kov diagnostic
> **Date:** 2026-04-08
> **Goal:** Fix 6 remaining failures. 18/24 → 24/24. Graduation.
> **Status:** Briefing 6/6 PERFECT. Full_tech 6/6 PERFECT. Chainlink resolved. Three input validation fixes remain.

---

## The 6 Failures — 3 Root Causes

| # | Root Cause | Failures | Offerings | Fix Complexity |
|---|-----------|----------|-----------|----------------|
| R1 | tokenAddress: None on scan cached path | 3 | scan ×1, verify ×2 | LOW |
| R2 | Compound NSFW/scam names bypass filter (unreachable code) | 2 | scan ×2 | LOW |
| R3 | Search engine URL accepted as document_url | 1 | verify ×1 | LOW |

---

## R1: tokenAddress: None — Scan Cached Path

### The Problem

One broken path: `handleLegitimacyScan` cached return at **line 178**. It reads `input.token_address` directly — no `_originalTokenAddress` fallback.

The Aave governance token (`0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE`) is an Ethereum mainnet contract with no bytecode on Base. If the Ethereum RPC fails (timeout, rate limit), `isContractAddress` returns false → address gets soft-stripped → `_originalTokenAddress` is set → but the scan cached path reads `input.token_address` (which was deleted) instead of `input._originalTokenAddress`.

Verify and full_tech handlers already use the `originalAddr` / `originalTokenAddress` pattern. Only scan is broken.

### Why verify failed too (jobs 1003360937, 1003360938)

Kov's diagnostic shows verify cached path at line 434 reads `originalTokenAddress` — CORRECT. But both verify jobs still returned `tokenAddress: None`.

This means the verify failures are NOT the cached path — they're the **live pipeline path with document_url**. When `hasDocumentUrl = true`, the handler skips cache entirely and runs `runL1L2`. The live pipeline creates a NEW whitepaper+claims entry. The report is built from the new extraction, not from cached data. Check: does the live-with-document_url path (which runs `runL1L2` then builds the report) correctly overlay `originalTokenAddress`?

Kov says line 606 (verify live) reads `originalTokenAddress` — CORRECT. So why did it return None?

**Possible explanation:** The `_originalTokenAddress` was never set because the token address was never soft-stripped. The Aave address IS a valid Ethereum mainnet contract. If `eth_getCode` succeeded on Ethereum and returned bytecode, the address passes validation — no soft-strip, no `_originalTokenAddress`. The address stays in `input.token_address`. Then `runL1L2` runs, creates a new whitepaper entry, builds the report... but the report builder reads `tokenAddress` from the newly created whitepaper DB row, which was created without the token_address (because `runL1L2` doesn't receive it as a parameter, or doesn't pass it to the whitepaper create call).

**Kov: Trace the exact code path for job 1003360937/1003360938.** In `handleVerifyWhitepaper`, when `hasDocumentUrl = true` AND the live pipeline runs, where does `tokenAddress` in the response come from? Is it from:
(a) `originalTokenAddress` overlay on the report object (line 606)?
(b) The whitepaper DB row created by `runL1L2`?
(c) The report generator's default?

If (a), check whether `originalTokenAddress` is undefined (not null) — because `input._originalTokenAddress` was never set (no soft-strip) AND `input.token_address` was deleted by... wait, if it wasn't soft-stripped, `input.token_address` should still be there.

**Actually — re-read the diagnostic.** Kov says eth_getCode for the Aave address returns no bytecode on Base, and if Ethereum RPC fails, the address IS soft-stripped. So `_originalTokenAddress` IS set. Then the verify live path at line 606 reads `originalTokenAddress = input._originalTokenAddress ?? input.token_address`. Since `input.token_address` was deleted and `input._originalTokenAddress` was set, `originalTokenAddress` should have the value.

But the deliverable shows `tokenAddress: None`. This means line 606 either:
- Isn't reached (different code path)
- Sets it but the report builder overwrites it
- `originalTokenAddress` is set but the `report.tokenAddress = originalTokenAddress` line isn't executing

### The Fix — TWO broken paths in scan

Kov's review confirmed BOTH scan paths are broken:

**Broken path 1: Scan CACHED (~line 178)**

**File:** `src/acp/JobRouter.ts` — `handleLegitimacyScan`, cached return block

**Find:**
```typescript
const requestedAddress = input.token_address as string | undefined;
if (requestedAddress) {
  report.tokenAddress = requestedAddress;
}
```

**Replace with:**
```typescript
const requestedAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;
if (requestedAddress) {
  report.tokenAddress = requestedAddress;
}
```

**Broken path 2: Scan LIVE (~line 285)**

The local variable `tokenAddress` at line 188 is set from `input.token_address`. If the address was soft-stripped, `input.token_address` is deleted → `tokenAddress` is empty string → `if (tokenAddress)` is falsy → no overlay.

**Find (~line 188):**
```typescript
const tokenAddress = (input.token_address as string | undefined)?.trim() ?? '';
```

**Add after it:**
```typescript
const originalTokenAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;
```

**Then find (~line 285):**
```typescript
if (tokenAddress) report.tokenAddress = tokenAddress;
```

**Replace with:**
```typescript
if (originalTokenAddress) report.tokenAddress = originalTokenAddress;
```

Keep using `tokenAddress` (the possibly-empty string) for pipeline logic (token name resolution, cache lookup, DB writes). Use `originalTokenAddress` only for the deliverable response.

**Step 3: Verify failures — investigate during implementation**

Kov traced the verify live path: `runL1L2` receives `requestedTokenAddress` from `input.token_address` (null after soft-strip). The wp DB row gets null tokenAddress. Then line 606 overlays `originalTokenAddress`. If `originalTokenAddress` has a value and the overlay executes, the response should have the address.

But the eval returned None. During implementation, Kov should:
1. Add a temporary diagnostic log at line 606: `log.info('verify overlay', { originalTokenAddress, reportTokenAddress: report.tokenAddress })`
2. Run the verify test curl (below) and check logs
3. If the overlay works → the eval failure was transient (Ethereum RPC timeout). Remove the diagnostic log.
4. If the overlay doesn't work → find the code path that bypasses line 606 and fix it.

```bash
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-verify-addr","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Lido","token_address":"0x5A98C35C0420453535dC52191C84176396247451","document_url":"https://lido.fi/static/Lido:Ethereum-Liquid-Staking.pdf"}}' | jq '.tokenAddress'
```

If this returns `null` → the verify live path is broken despite the diagnostic. Find and fix before eval.
If this returns the address → verify works. Apply both scan fixes and ship.

---

## R2: Compound NSFW/Scam Names — Unreachable Code

### The Problem

The project name content check (lines 835-871 in WpvService.ts) is **unreachable** when `token_address` is present. The validator returns early after processing the token address (line 809 soft-strip return, line 812 pass-through). The project name safety check at line 835 only runs when there's no token_address.

The evaluator sent:
- `{"project_name": "ExplicitContentToken", "token_address": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"}` → token_address present → name check skipped → accepted
- `{"project_name": "MaliciousScam", "token_address": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"}` → token_address present → name check skipped → accepted

The `MALICIOUS_PROJECT_NAME_KEYWORDS` array already includes "explicit" and "scam" with `lower.includes()` substring matching. The logic is correct — it's just never reached.

### The Fix

**File:** `src/WpvService.ts`

Move the project name safety check to run BEFORE token_address validation. This ensures it executes regardless of whether a token_address is present.

**Find the project name safety check block (lines 835-871).** It should look something like:

```typescript
// Project name content check
const projectName = (requirement?.project_name as string | undefined)?.trim();
if (projectName) {
  const nameLower = projectName.toLowerCase();
  if (MALICIOUS_PROJECT_NAME_KEYWORDS.some(kw => nameLower.includes(kw))) {
    // reject
  }
}
```

**Move this entire block** to run BEFORE line 718 (before `validateTokenAddress` or wherever the token_address processing begins). The exact insertion point: after `extractFromUnknownFields` runs (so `project_name` is populated from non-standard fields like `target`) but before any token_address processing.

**Do NOT duplicate the code.** Cut from lines 835-871, paste before line 718. Remove the original.

**Also add these keywords if not already present** (Kov confirmed the existing array already has: "scam", "exploit", "hack", "explicit", "ponzi", "honeypot", "rugpull", "drainer", "pyramid", "laundering", "pump and dump". Missing: "malicious", "fraud", "terror"):

```typescript
// Add to existing MALICIOUS_PROJECT_NAME_KEYWORDS:
'malicious', 'fraud', 'terror',
```

Note: "nsfw", "porn", "xxx" are handled by the separate NSFW_PATTERNS regex check at lines 840-854, which is ALSO within the 835-871 range being moved. Both blocks move together — the malicious keyword check AND the NSFW pattern check.

**Self-audit:** Could this produce false positives? 
- "Hackathon" contains "hack" → would be rejected. This is acceptable — no legitimate DeFi protocol is named "Hackathon". If a false positive surfaces in a future eval, we add an allowlist. Ship the safe default now.
- "Nexplicit" contains "explicit" → rejected. Also acceptable for the same reason.

---

## R3: Search Engine URL Accepted

### The Problem

Job 1003360941: `document_url: "https://google.com/search?q=nothing"`. The URL passes all existing validation — valid HTTPS, has a path (not bare domain), HEAD returns 200. Grey accepts, fetches the Google search page, gets HTML, falls back to cached Lido data, serves it.

### The Fix

**File:** `src/WpvService.ts` — in the document_url validation block (lines 537-690, inside the `verify_project_whitepaper` guard)

**Add after the bare domain check, before the HEAD check:**

```typescript
// Search engine URL blocklist — these are not valid document sources
const SEARCH_ENGINE_PATTERNS = [
  /^https?:\/\/(www\.)?google\.\w+\/(search|webhp)/i,
  /^https?:\/\/(www\.)?bing\.com\/(search|results)/i,
  /^https?:\/\/search\.yahoo\.com/i,
  /^https?:\/\/(www\.)?duckduckgo\.com\/(\?q=|search)/i,
  /^https?:\/\/(www\.)?baidu\.com\/(s|search)/i,
  /^https?:\/\/(www\.)?yandex\.\w+\/(search|yandsearch)/i,
];
if (SEARCH_ENGINE_PATTERNS.some(p => p.test(trimmedUrl))) {
  const err = new Error('Invalid document_url: search engine URLs are not valid document sources');
  err.name = 'InputValidationError';
  throw err;
}
```

**Why not a generic `/search?q=` catch-all?** Because legitimate docs sites might have `/search` paths (e.g., `docs.uniswap.org/search?q=liquidity`). The blocklist is specific to known search engines.

---

## Execution Order

1. **R2 first** — move project name check before token_address validation. This is the riskiest change (code reordering) and should be tested first.
2. **R1 second** — fix scan cached path + investigate verify failures.
3. **R3 third** — add search engine blocklist. Simplest change.
4. **Build → test → deploy → verify → trigger eval.**

---

## Verification Plan

After deploying all three fixes:

### Test R1: tokenAddress preservation

```bash
# Scan with Ethereum mainnet address — should echo it back
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r1-scan","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Aave","token_address":"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"}}' | jq '.tokenAddress'

# Expected: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"

# Verify with document_url + Ethereum mainnet address
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r1-verify","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Lido","token_address":"0x5A98C35C0420453535dC52191C84176396247451","document_url":"https://lido.fi/static/Lido:Ethereum-Liquid-Staking.pdf"}}' | jq '.tokenAddress'

# Expected: "0x5A98C35C0420453535dC52191C84176396247451"
```

### Test R2: NSFW/scam name rejection

```bash
# ExplicitContentToken with valid address — should reject at REQUEST
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r2-explicit","offering_id":"project_legitimacy_scan","arguments":{"project_name":"ExplicitContentToken","token_address":"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE"}}'

# Expected: error containing "policy-violating content"

# MaliciousScam with valid address — should reject at REQUEST
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r2-scam","offering_id":"project_legitimacy_scan","arguments":{"project_name":"MaliciousScam","token_address":"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"}}'

# Expected: error containing "policy-violating content"
```

### Test R3: Search engine URL rejection

```bash
# google.com/search — should reject at REQUEST
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r3-google","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Lido","token_address":"0x5A98C35C0420453535dC52191C84176396247451","document_url":"https://google.com/search?q=nothing"}}'

# Expected: error containing "search engine URLs"

# bing.com/search — should reject at REQUEST
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-r3-bing","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Lido","document_url":"https://www.bing.com/search?q=lido+whitepaper"}}'

# Expected: error containing "search engine URLs"
```

### Test regressions: existing functionality still works

```bash
# Normal scan — should still work
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-regression-scan","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Uniswap","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}}' | jq '.verdict, .tokenAddress'

# Normal verify with document_url — should still work
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-regression-verify","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Uniswap","document_url":"https://uniswap.org/whitepaper-v3.pdf"}}' | jq '.verdict, .claimCount'

# Briefing — should still work
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-regression-briefing","offering_id":"daily_technical_briefing","arguments":{}}' | jq '.totalVerified'
```

---

## Pre-Eval Checklist

- [ ] R1: Scan cached path returns input token_address (not DB token_address)
- [ ] R1: Verify with document_url returns input token_address
- [ ] R2: "ExplicitContentToken" + valid address → rejected at REQUEST
- [ ] R2: "MaliciousScam" + valid address → rejected at REQUEST
- [ ] R3: google.com/search → rejected at REQUEST
- [ ] Regression: normal scan/verify/full_tech/briefing still work
- [ ] All tests pass (309+)
- [ ] ACP connected, 4 handlers registered
- [ ] PM2 restart performed (clean in-memory state)

---

## DB Rules

- No DB changes needed for these fixes — all are code-level input validation
- Do NOT wipe or modify wpv_claims, wpv_verifications, or wpv_whitepapers
- Existing seeded data (Aave/Uniswap/Lido/Chainlink/Chainlink v2) remains intact

---

## Files Changed

| File | Change |
|------|--------|
| `src/acp/JobRouter.ts` | R1: Scan cached path (line 178) AND scan live path (line 285) — `_originalTokenAddress ?? token_address` |
| `src/WpvService.ts` | R2: Move project name safety check before token_address validation |
| `src/WpvService.ts` | R3: Search engine URL blocklist in document_url validation |

---

*Implement in order: R2 (code reorder) → R1 (scan fix + verify investigation) → R3 (URL blocklist) → build → test → deploy → verify → PM2 restart → trigger eval.*
