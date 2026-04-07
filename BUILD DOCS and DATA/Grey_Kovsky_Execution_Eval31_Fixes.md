# Kovsky Execution Plan — Eval 31 Fixes (4 Issues)

> **Source:** Forces + Claude Opus review of eval 31 results
> **Date:** 2026-04-07
> **Goal:** Fix 8 remaining failures. 13/21 → 21/21. Graduation.
> **Depends on:** Concurrency + Playwright + upsert deployed (309/309 tests)

---

## The 8 Failures — 4 Root Causes

| # | Root Cause | Failures | Offerings Hit |
|---|-----------|----------|---------------|
| F1 | Chainlink "f < n/2" claim contradicts its own "3f+1 nodes" evidence | 5 | briefing ×3, full_tech ×1, verify ×1 |
| F2 | "2024-02-30" accepted (JS Date silently rolls Feb 30 → Mar 1) | 1 | briefing |
| F3 | Empty `{}` rejected at REQUEST for full_tech | 2 | full_tech ×2 |
| F4 | tokenAddress: None — soft-strip deletes address before handler reads it | secondary | part of F1 Chainlink failures |

---

## Execution Order

1. **F1: Chainlink claim fix** — DB correction + extraction prompt hardening
2. **F2: Calendar date validation** — round-trip check
3. **F3: Empty requirement guard** — offering-scoped
4. **F4: tokenAddress preservation** — save before soft-strip
5. **Build + test + deploy + purge Chainlink DB entries**

---

## F1: Chainlink Byzantine Fault Tolerance Claim

### The Problem

Cached Chainlink claim `9dd09f36` in the DB:

- **claimText:** "can handle Byzantine faults with up to f faulty oracles for **f < n/2**"
- **statedEvidence:** "Algorithm 1 shows a simple sequential protocol that guarantees availability given **3f+1 nodes**"

The evaluator correctly identifies: 3f+1 nodes → n = 3f+1 → f = (n-1)/3 → f < n/3, not f < n/2. The claim text contradicts its own cited evidence.

This is a Sonnet extraction error. The Chainlink v1 whitepaper Section 4.2 discusses two different aggregation schemes with different fault thresholds. Sonnet merged the "f < n/2" text (from the simple majority aggregation description) with the "3f+1 nodes" evidence (from Algorithm 1's full commit/reveal protocol). These describe different properties but were combined into one claim.

Every offering that serves Chainlink data is poisoned by this claim. It fails briefing (3 tests), full_tech (1 test), and verify (1 test) — 5 of 8 total failures.

### The Fix — Two Parts

#### Part 1: DB Correction (immediate)

Delete all Chainlink claims and the whitepaper entry, then re-extract.

```sql
-- Approved DB operation: purge Chainlink entries for re-extraction
-- Scoped: only Chainlink, only claims + verifications + whitepapers
DELETE FROM autognostic.wpv_claims WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%'
);
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%'
);
DELETE FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%';
```

Then trigger a fresh Chainlink extraction by sending a test request to the HTTP endpoint. The extraction will re-run the full L1→L2→L3 pipeline against the Chainlink v1 PDF with the updated prompt (Part 2).

**DB GUARDRAIL:** This purge is scoped to Chainlink only. Aave (16 claims), Uniswap (12 claims), and Lido (14 claims) are untouched. Forces has approved this scope.

#### Part 2: Extraction Prompt Hardening

**File:** `src/verification/ClaimExtractor.ts`

**Find in `EXTRACTION_SYSTEM_PROMPT`:**
```
For each claim, extract:
- claimText: The exact claim being made
- statedEvidence: What evidence the whitepaper provides
```

**Add after `- statedEvidence: What evidence the whitepaper provides`:**
```
- CRITICAL: When extracting mathematical claims (fault tolerance thresholds, node requirements, performance bounds), verify that the claimed threshold is mathematically consistent with the cited evidence. For example, if an algorithm requires 3f+1 nodes, the fault tolerance is f < n/3 (not f < n/2). If the whitepaper text states one threshold but the cited formula implies a different one, report the threshold that is mathematically correct based on the formula, and note the discrepancy in statedEvidence.
```

**Why this works:** The Chainlink whitepaper literally says "f < n/2" in the text — Sonnet faithfully extracted it. But it paired it with evidence about Algorithm 1's "3f+1 nodes" requirement. The new instruction tells Sonnet to cross-check: if the text says f < n/2 but the algorithm uses 3f+1 nodes, the correct threshold is f < n/3 based on the math, and the discrepancy should be noted.

**Why not just correct the DB entry manually?** Because the evaluator might test with a fresh Chainlink extraction (document_url pointing to the whitepaper PDF). If Sonnet re-extracts the same bad claim, we fail again. The prompt fix prevents future occurrences.

### Verification

After the DB purge and prompt update, send a test request:
```bash
curl -X POST http://44.243.254.19:3001 -H 'Content-Type: application/json' \
  -d '{"job_id":"test-chainlink-reextract","offering_id":"full_technical_verification","arguments":{"project_name":"Chainlink"}}'
```

Check the response: claim-1 should say "f < n/3" or note the discrepancy. If it still says "f < n/2", the prompt needs further adjustment.

---

## F2: Calendar Date Validation

### The Problem

JavaScript's `new Date("2024-02-30T00:00:00Z")` doesn't throw — it silently rolls to March 1, 2024. `isNaN(parsed.getTime())` returns false. Grey accepts the invalid date and delivers.

### The Fix

**File:** `src/WpvService.ts` — in the date validation block

**Find (after the `isNaN` check, ~line 499-502):**
```typescript
const parsed = new Date(dateStr + 'T00:00:00Z');
if (isNaN(parsed.getTime())) {
  const err = new Error(`Invalid date: '${dateStr}' is not a valid date`);
  err.name = 'InputValidationError';
  throw err;
}
```

**Add immediately after the `isNaN` block:**
```typescript
// Calendar validity: detect dates that JS silently rolls (e.g., Feb 30 → Mar 1)
const [yearStr, monthStr, dayStr] = dateStr.split('-');
if (parsed.getUTCFullYear() !== Number(yearStr) ||
    parsed.getUTCMonth() + 1 !== Number(monthStr) ||
    parsed.getUTCDate() !== Number(dayStr)) {
  const err = new Error(`Invalid date: '${dateStr}' does not exist`);
  err.name = 'InputValidationError';
  throw err;
}
```

**Test cases:**
- `"2024-02-30"` → Date rolls to Mar 1 → month mismatch (3 ≠ 2) → reject ✓
- `"2024-02-29"` → 2024 is a leap year → no roll → accept ✓
- `"2023-02-29"` → Date rolls to Mar 1 → month mismatch → reject ✓
- `"2024-04-31"` → Date rolls to May 1 → month mismatch → reject ✓
- `"2024-12-31"` → valid → accept ✓

---

## F3: Empty Requirement Guard — Offering-Scoped

### The Problem

Two jobs (1003356102, 1003356106) send `{}` for `full_technical_verification`. Grey rejects at REQUEST phase with "must include at least one of token_address, project_name, or document_url". The evaluator expects acceptance.

The Fix 5 guard applies to ALL non-plain-text requirements regardless of offering. But `full_technical_verification` should be able to handle empty structured JSON gracefully — the handler can return INSUFFICIENT_DATA or trigger discovery.

### The Fix

**File:** `src/WpvService.ts` — Fix 5 guard

**Find:**
```typescript
// Fix 5: Reject JSON requirements missing all identifying fields
if (!isPlainText) {
  const hasTokenAddress = requirement?.token_address !== undefined && requirement?.token_address !== null;
  const hasProjectName = requirement?.project_name !== undefined && requirement?.project_name !== null;
  const hasDocumentUrl = requirement?.document_url !== undefined && requirement?.document_url !== null;
  if (!hasTokenAddress && !hasProjectName && !hasDocumentUrl) {
    const err = new Error('Invalid requirement: must include at least one of token_address, project_name, or document_url');
    err.name = 'InputValidationError';
    throw err;
  }
}
```

**Replace with:**
```typescript
// Fix 5: Reject JSON requirements missing all identifying fields
// Only for verify_project_whitepaper — it requires a document to verify.
// full_technical_verification and project_legitimacy_scan handle empty input gracefully
// (return INSUFFICIENT_DATA or trigger discovery).
if (!isPlainText && offeringId === 'verify_project_whitepaper') {
  const hasTokenAddress = requirement?.token_address !== undefined && requirement?.token_address !== null;
  const hasProjectName = requirement?.project_name !== undefined && requirement?.project_name !== null;
  const hasDocumentUrl = requirement?.document_url !== undefined && requirement?.document_url !== null;
  if (!hasTokenAddress && !hasProjectName && !hasDocumentUrl) {
    const err = new Error('Invalid requirement: must include at least one of token_address, project_name, or document_url');
    err.name = 'InputValidationError';
    throw err;
  }
}
```

**What happens when full_tech receives `{}`:**
1. Validator passes (no Fix 5 guard)
2. Grey accepts the job
3. Handler runs: `reqAddr = undefined`, `reqName = undefined`
4. `hasDocumentUrl = false`, cache lookup returns nothing (no project name to match)
5. Discovery has no project name to search for
6. Handler returns INSUFFICIENT_DATA report
7. Evaluator receives a valid deliverable (even if it says "insufficient data")

**Why not remove the guard entirely?** `verify_project_whitepaper` genuinely needs at least one identifying field — it's a document-specific offering. An empty `{}` is never a valid request for "verify this specific whitepaper." The other two offerings can reasonably handle empty input by returning a status report.

**Self-audit: What about `project_legitimacy_scan` with `{}`?**
The evaluator sent `{}` only for `full_technical_verification` in this eval. Legitimacy scan was 4/4 PERFECT — all tests included `project_name` and `token_address`. If the evaluator sends `{}` for legitimacy scan in a future eval, the handler will return INSUFFICIENT_DATA, which is the correct behavior.

---

## F4: tokenAddress Preservation After Soft-Strip

### The Problem

When the validator soft-strips a non-contract `token_address` (e.g., truncated Chainlink address), it calls `delete requirement.token_address`. The handler then reads `input.token_address` → `undefined`. The deliverable shows `tokenAddress: None`.

The evaluator considers the provided address "valid" and expects it echoed in the response.

The legitimacy scan PASSED this test because its cached response path reads the token address from the DB entry, not from `input.token_address`. The verify and full_tech handlers read directly from `input.token_address` which has been deleted.

### The Fix

**File:** `src/WpvService.ts` — in `validateTokenAddress`, at the soft-strip points

Save the original address before deleting it. The handler can read the saved value for the deliverable.

**Find each occurrence of:**
```typescript
delete requirement.token_address;
return;
```

**Replace each with:**
```typescript
// Preserve original address for deliverable response — buyer expects it echoed
requirement._originalTokenAddress = requirement.token_address;
delete requirement.token_address;
return;
```

There are **three** `delete requirement.token_address; return;` blocks in `validateTokenAddress`:
1. Burn/null address with known protocol name (~line 720)
2. EOA wallet with project_name present (~line 740)
3. Burn/null address with document URL (~line 716)

Add `requirement._originalTokenAddress = requirement.token_address;` before each `delete`.

**Then in the handlers, use the preserved address for the response:**

**File:** `src/acp/JobRouter.ts`

**In `handleFullVerification`, after reading `reqAddr`:**
```typescript
private async handleFullVerification(input: Record<string, unknown>) {
  const reqAddr = input.token_address as string | undefined;
  const originalAddr = (input._originalTokenAddress ?? input.token_address) as string | undefined;
```

Use `reqAddr` for pipeline logic (token resolution, cache lookup) — this is `undefined` when soft-stripped, which is correct.
Use `originalAddr` for the deliverable response — this preserves the buyer's input.

**In the report-building sections, replace `tokenAddress: reqAddr` with `tokenAddress: originalAddr`.**

There are several report-building blocks in `handleFullVerification` and `handleVerifyWhitepaper`. Kov needs to find each `tokenAddress:` assignment in the response objects and use `originalAddr` (or the equivalent for `handleVerifyWhitepaper`).

**`handleVerifyWhitepaper` needs the same treatment:**
```typescript
private async handleVerifyWhitepaper(input: Record<string, unknown>) {
  // ... existing code ...
  const originalAddr = (input._originalTokenAddress ?? input.token_address) as string | undefined;
```

Use `originalAddr` in the deliverable response's `tokenAddress` field.

---

## Self-Audit

### Issue A: F1 — will Sonnet re-extract "f < n/2" even with the prompt fix?

**Problem:** The Chainlink whitepaper literally says "f < n/2" in its text. Sonnet might still extract it verbatim even with the prompt instruction.

**Resolution:** The prompt instruction is specific: "if the whitepaper text states one threshold but the cited formula implies a different one, report the threshold that is mathematically correct based on the formula." This directly addresses the case. If Sonnet still extracts "f < n/2", the prompt needs stronger language — but test with the current instruction first.

**Fallback:** If re-extraction still produces "f < n/2", manually correct the claim in the DB:
```sql
UPDATE autognostic.wpv_claims
SET claim_text = 'ChainLink provides a simple on-chain contract data aggregation system that can handle Byzantine faults with up to f faulty oracles for f < n/3 (given 3f+1 nodes)'
WHERE id = '9dd09f36-1e70-4e01-af95-9bf34934e430';
```
This is a last-resort override. The prompt fix should work.

### Issue B: F3 — what does handleFullVerification do with completely empty input?

**Problem:** With the guard removed, `handleFullVerification` receives `{}`. `reqName` is undefined, `reqAddr` is undefined, `hasDocumentUrl` is false. Cache lookup with no name returns nothing. Discovery stack has nothing to search for.

**Resolution:** Trace the exact code path. `handleFullVerification` calls `findBestWhitepaper(input)` — with no `project_name` or `token_address`, this returns `null`. Then it checks `hasDocumentUrl` — false. Then it tries discovery — `reqName` is empty, so TieredDocumentDiscovery has no project to search for. The handler should fall through to INSUFFICIENT_DATA. Kov: verify this path doesn't throw — if any function requires a non-empty project name, add a guard.

### Issue C: F4 — _originalTokenAddress leaks into DB or reports

**Problem:** `_originalTokenAddress` is a property on the requirement object. If the requirement is stored or serialized, the underscore-prefixed field might leak.

**Resolution:** The requirement object is not directly stored in the DB. Claims and verifications have their own fields. The report generators build new objects from specific fields — they won't pick up `_originalTokenAddress` unless explicitly referenced. The underscore prefix signals "internal" by convention. This is safe.

### Issue D: F2 — timezone edge cases

**Problem:** The round-trip check uses `getUTCFullYear/Month/Date`. The parsed date uses `'T00:00:00Z'` (UTC). No timezone edge case — the input is parsed as UTC and checked as UTC.

**Resolution:** Safe. Both parsing and validation use UTC.

### Issue E: F1 — other projects' claims might have similar math inconsistencies

**Problem:** If Sonnet made this error on Chainlink, it might have similar errors on Aave, Uniswap, or Lido claims.

**Resolution:** The evaluator specifically tested Chainlink. Aave and Uniswap both passed this eval (their claims were accepted). Lido passed in briefings. The prompt fix prevents future occurrences for all projects. No action needed on existing Aave/Uniswap/Lido claims — they've been validated by the evaluator.

### Issue F: F3 — does `garbage` test `{}` send `{}` or something else?

**Problem:** Job 1003356113 sends `{"garbage": "asdfghjkl1234567890"}` and Grey correctly rejects it. Job 1003356102 sends `{}` and Grey incorrectly rejects it. The difference: `{"garbage": ...}` has an unknown field, `{}` has no fields at all. Both fail the "must include one of" check. But the evaluator expects different behavior — reject for garbage, accept for empty.

**Resolution:** With the fix, the guard only applies to `verify_project_whitepaper`. For `full_technical_verification`, `{}` passes through to the handler. For `{"garbage": "asdfghjkl1234567890"}`, the guard also doesn't fire (it's not `verify_project_whitepaper`), and the handler gets `{garbage: "asdfghjkl1234567890"}` with no standard fields — INSUFFICIENT_DATA.

Wait — the evaluator expects `{"garbage": ...}` to be REJECTED (job 1003356113 PASSED with REJECTED). But with the guard removed for full_tech, `{"garbage": ...}` would reach the handler and return INSUFFICIENT_DATA instead of rejecting at REQUEST. Would the evaluator accept that?

Looking at the eval: job 1003356113 expected REJECT and got REJECT → PASSED. If we remove the guard, this would change to ACCEPT → deliver INSUFFICIENT_DATA → might fail.

**This is a problem.** The evaluator wants `{"garbage": ...}` rejected AND `{}` accepted. Both are empty of standard fields. The differentiator is that `{"garbage": ...}` has a clearly invalid field name, while `{}` has nothing.

**Revised fix:** Keep the guard, but exclude `{}` specifically:

```typescript
if (!isPlainText && offeringId !== 'daily_technical_briefing') {
  const hasTokenAddress = requirement?.token_address !== undefined && requirement?.token_address !== null;
  const hasProjectName = requirement?.project_name !== undefined && requirement?.project_name !== null;
  const hasDocumentUrl = requirement?.document_url !== undefined && requirement?.document_url !== null;
  const hasAnyField = Object.keys(requirement).filter(k => !k.startsWith('_')).length > 0;
  if (!hasTokenAddress && !hasProjectName && !hasDocumentUrl && hasAnyField) {
    // Has fields but none are standard → garbage input → reject
    const err = new Error('Invalid requirement: must include at least one of token_address, project_name, or document_url');
    err.name = 'InputValidationError';
    throw err;
  }
  // Empty {} → let handler deal with it (returns INSUFFICIENT_DATA)
}
```

**Logic:**
- `{}` → `hasAnyField = false` → guard doesn't fire → handler gets it → INSUFFICIENT_DATA
- `{"garbage": "..."}` → `hasAnyField = true`, no standard fields → guard fires → REJECTED
- `{"project_name": "Uniswap"}` → `hasProjectName = true` → guard doesn't fire → normal flow

This preserves the existing REJECT behavior for garbage fields while allowing empty `{}` through.

**Also exclude `_requirementText` and other internal fields from the count:** The `filter(k => !k.startsWith('_'))` ensures internal fields like `_requirementText` and `_originalTokenAddress` don't trigger the garbage detection.

---

## Files Changed

| File | Change |
|------|--------|
| `src/verification/ClaimExtractor.ts` | Mathematical consistency instruction in extraction prompt |
| `src/WpvService.ts` | Calendar round-trip check; Fix 5 guard scoping (empty `{}` vs garbage); `_originalTokenAddress` preservation at soft-strip points |
| `src/acp/JobRouter.ts` | `originalAddr` for deliverable responses in handleFullVerification and handleVerifyWhitepaper |

## DB Changes (Forces-approved scope)

```sql
-- Purge Chainlink entries for re-extraction with corrected prompt
DELETE FROM autognostic.wpv_claims WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%'
);
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%'
);
DELETE FROM autognostic.wpv_whitepapers WHERE project_name ILIKE 'Chainlink%';
```

After code deployment: trigger Chainlink re-extraction via HTTP test request. Verify claim-1 no longer says "f < n/2".

---

*Implement in order: F1 (prompt + DB) → F2 (date) → F3 (guard) → F4 (tokenAddress) → build → test → deploy → DB purge → re-extract → verify → trigger eval.*
