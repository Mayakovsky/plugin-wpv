# Kovsky Execution Plan — Eval 26 Final 3 Fixes

> **Source:** Forces + Claude Opus context window + Kov eval 26 analysis
> **Date:** 2026-04-05
> **Goal:** Fix remaining 3 eval 26 failures. 13/16 → 16/16.
> **Depends on:** Eval 25 fixes fully deployed (confirmed)

---

## The 3 Failures

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| F1 | Uniswap v3 → v2 cache served | `findBestWhitepaper` version-strips "Uniswap v3" → "Uniswap", returns 27 v2 claims | Version-aware cache: skip cache when version mismatch |
| F2 | Aave v2 flash loan → generic v1 claims | Cache hit bypasses entire requirement-aware pipeline (synthesis never fires) | Run synthesis on cached path when requirementText present |
| F3 | friend.tech fake URL accepted | 404 soft-fallback clears URL instead of rejecting | Revert 404 to hard-reject |

---

## Execution Order

1. **Fix 3: Revert 404 to hard-reject** (LOW risk — one-line change)
2. **Fix 1: Version-aware cache lookup** (MEDIUM risk — logic in findBestWhitepaper/findWhitepaper)
3. **Fix 2: Synthesis on cached path** (MEDIUM risk — restructure cached return in handleFullVerification + handleVerifyWhitepaper)
4. **Verification + deploy**

---

## Fix 3: Revert 404 to Hard-Reject

**File:** `src/WpvService.ts` — in `validateTokenAddress`, the HEAD check block for `verify_project_whitepaper`

**Why this is safe now:** The 404 soft-fallback was added in eval 23 to handle Aave's stale URL. Aave is now in the known URL map (34 entries). Any known project with a stale evaluator URL will be found via discovery regardless. The soft-fallback is duct tape over a problem we've properly solved.

**Find this block (~line 563):**

```typescript
if (headResp.status === 404 || headResp.status === 410) {
  // Stale URL — clear document_url so JobRouter falls through to cache/discovery
  logger.warn('document_url returned ' + headResp.status + ' — clearing for discovery fallback', { url: trimmedUrl.slice(0, 80) });
  delete requirement.document_url;
}
```

**Replace with:**

```typescript
if (headResp.status === 404 || headResp.status === 410) {
  const err = new Error(`Invalid document_url: URL returned HTTP ${headResp.status} — document not found`);
  err.name = 'InputValidationError';
  throw err;
}
```

**That's it.** One block replacement. 404/410 now hard-rejects at REQUEST phase, exactly what the evaluator expects.

---

## Fix 1: Version-Aware Cache Lookup

**Files:** `src/acp/JobRouter.ts` — `findBestWhitepaper` and `findWhitepaper` methods

### The Problem

Both methods use `stripVersionSuffix` to broaden matching:

```
Input: "Uniswap v3"
→ Exact match: findByProjectName("Uniswap v3") → 0 results
→ Strip: "Uniswap v3" → "Uniswap"
→ Stripped match: findByProjectName("Uniswap") → 4 results (all v2 data)
→ Returns: 27 v2 claims ← WRONG
```

The version-strip was designed to help ("Aave V3" → finds "Aave" entry). But it doesn't check whether the cached data actually corresponds to the requested version.

### The Fix

When the input `project_name` has a version suffix AND the version-stripped fallback returned results, check whether those results match the requested version. If the cached `projectName` doesn't contain the requested version string, treat it as a cache miss.

**In `findBestWhitepaper`, modify the version-strip fallback block:**

**Current:**
```typescript
// Version-strip fallback: "Aave V3" → try "Aave"
if (byName.length === 0) {
  const stripped = stripVersionSuffix(projectName);
  if (stripped) {
    byName = await this.deps.whitepaperRepo.findByProjectName(stripped);
    if (byName.length > 0) {
      log.info('findBestWhitepaper: version-strip fallback matched', { original: projectName, stripped, matches: byName.length });
    }
  }
}
```

**New:**
```typescript
// Version-strip fallback: "Aave V3" → try "Aave"
if (byName.length === 0) {
  const stripped = stripVersionSuffix(projectName);
  if (stripped) {
    // Extract the requested version (e.g., "v3" from "Uniswap v3")
    const requestedVersion = projectName.match(/\b(v\d+)\b/i)?.[1]?.toLowerCase();

    const strippedResults = await this.deps.whitepaperRepo.findByProjectName(stripped);

    if (strippedResults.length > 0 && requestedVersion) {
      // Filter: only use stripped results if they match the requested version
      // Check both the DB projectName and the documentUrl for version hints
      const versionMatched = strippedResults.filter((wp) => {
        const wpName = ((wp as Record<string, unknown>).projectName as string ?? '').toLowerCase();
        const wpUrl = ((wp as Record<string, unknown>).documentUrl as string ?? '').toLowerCase();
        return wpName.includes(requestedVersion) || wpUrl.includes(requestedVersion);
      });

      if (versionMatched.length > 0) {
        // Found version-specific cached data — use it
        byName = versionMatched;
        log.info('findBestWhitepaper: version-strip fallback matched (version-filtered)', {
          original: projectName, stripped, requestedVersion,
          total: strippedResults.length, versionMatched: versionMatched.length,
        });
      } else {
        // Cached data is for a DIFFERENT version — treat as cache miss
        log.info('findBestWhitepaper: version-strip found results but wrong version — cache miss', {
          original: projectName, stripped, requestedVersion,
          cachedNames: strippedResults.map((wp) => (wp as Record<string, unknown>).projectName).slice(0, 3),
        });
        // byName stays empty → cache miss → live pipeline fires
      }
    } else if (strippedResults.length > 0) {
      // No specific version requested — use all stripped results (existing behavior)
      byName = strippedResults;
      log.info('findBestWhitepaper: version-strip fallback matched', { original: projectName, stripped, matches: byName.length });
    }
  }
}
```

**Apply the same pattern to `findWhitepaper`** — it has an identical version-strip block. Same logic: extract requested version, filter stripped results by version, cache miss if no version match.

### Why This Works

- "Uniswap v3" → strips to "Uniswap" → finds 4 results → none contain "v3" in name or URL → cache miss → live pipeline fires → known URL map matches `\buniswap\s+v3\b` → fetches v3 whitepaper PDF
- "Aave v2" → strips to "Aave" → finds 4 results → none contain "v2" in name or URL → cache miss → live pipeline fires → known URL map matches `\baave\b` → fetches Aave technical paper
- "Uniswap" (no version) → no version suffix → exact match on "Uniswap" → returns existing cache → existing behavior preserved
- "Aave" (no version) → exact match → returns existing cache → existing behavior preserved

---

## Fix 2: Synthesis on Cached Path

**File:** `src/acp/JobRouter.ts` — `handleFullVerification` and `handleVerifyWhitepaper`

### The Problem

The cached return path at line ~543 exits before `extractRequirementText` is called:

```typescript
if (totalClaims > 0 && claims.length > 0) {
  log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
  // ... build report ...
  return fullReport;  // ← exits here, synthesis never fires
}
```

The requirement-aware pipeline (Fix 3 from eval 25) only fires on the LIVE pipeline path. For cached data, the buyer's analytical question is ignored.

### The Fix (Kov's Option B)

Move `extractRequirementText` BEFORE the cache check. When cache hits AND requirementText exists, still return cached claims but run `generateSynthesis` on them to produce a focused analysis.

**In `handleFullVerification`, restructure the top of the method:**

**Current flow:**
```
1. Extract reqAddr, reqName
2. Check cache via findBestWhitepaper
3. If cache hit with claims → return immediately
4. ... live pipeline ...
5. extractRequirementText (never reached if cache hit)
6. generateSynthesis (never reached if cache hit)
```

**New flow:**
```
1. Extract reqAddr, reqName
2. Extract requirementText EARLY (before cache check)
3. Check cache via findBestWhitepaper
4. If cache hit with claims:
   a. Build report from cached data
   b. IF requirementText exists → run generateSynthesis on cached claims + requirement
   c. Attach synthesis to report.logicSummary
   d. Return report
5. ... live pipeline (unchanged) ...
```

**Code change — add this AFTER the reqAddr/reqName extraction, BEFORE the cache check:**

```typescript
// Extract requirement text EARLY — needed for both cached and live paths
const requirementText = this.extractRequirementText(input);
```

**Then modify the cached return block (line ~543):**

**Current:**
```typescript
if (totalClaims > 0 && claims.length > 0) {
  log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
  const analysis = this.extractStructuralAnalysis(verification);
  const fullReport = this.deps.reportGenerator.generateFullVerification(
    this.verificationRowToResult(verification),
    claims.map((c) => ({ /* ... */ })),
    [],
    wp as never,
    undefined,
    analysis,
  );
  if (reqAddr) fullReport.tokenAddress = reqAddr;
  return fullReport;
}
```

**New:**
```typescript
if (totalClaims > 0 && claims.length > 0) {
  log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
  const analysis = this.extractStructuralAnalysis(verification);
  const mappedClaims = claims.map((c) => ({
    claimId: c.id,
    category: c.category as never,
    claimText: c.claimText,
    statedEvidence: c.statedEvidence,
    mathematicalProofPresent: c.mathProofPresent,
    sourceSection: c.sourceSection,
    regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
  }));
  const fullReport = this.deps.reportGenerator.generateFullVerification(
    this.verificationRowToResult(verification),
    mappedClaims,
    [],
    wp as never,
    undefined,
    analysis,
  );
  if (reqAddr) fullReport.tokenAddress = reqAddr;

  // Requirement-aware synthesis on cached data:
  // If the buyer asked a specific analytical question, generate a focused
  // analysis even though we're serving cached claims.
  if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil|risk|attack|exploit|vulnerab)/i.test(requirementText)) {
    const docUrl = (wp as Record<string, unknown>).documentUrl as string | undefined;
    let docText = '';
    if (docUrl) {
      try {
        const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(docUrl));
        docText = resolved.text;
      } catch {
        // Can't re-fetch — synthesis will work with claims only
      }
    }
    const synthesis = await this.generateSynthesis(requirementText, wpName, mappedClaims as never, docText);
    if (synthesis) {
      fullReport.logicSummary = synthesis;
      log.info('Synthesis attached to cached result', { projectName: wpName, synthesisLength: synthesis.length });
    }
  }

  return fullReport;
}
```

**Apply the same pattern to `handleVerifyWhitepaper`** — its cached return path at line ~336 has the same early exit. Move `extractRequirementText` before the cache check, add synthesis after report generation on cached path.

### Note on document re-fetch for synthesis

The synthesis call needs the source document text to produce a substantive analysis. The cached `wp` record has `documentUrl` but not the text. We re-fetch the document via `cryptoResolver.resolveWhitepaper()`. This adds one HTTP request per synthesis-on-cache call. If the URL is unreachable, the synthesis falls back to working with claims only (less focused but still better than generic).

**When the persistence layer is added later**, the document text will be stored alongside claims, eliminating this re-fetch. For now, the extra fetch is acceptable — synthesis only fires when `requirementText` contains analytical keywords.

---

## Self-Audit

### Issue A: Fix 1 version filter — what if DB projectName has the version but claims are from wrong doc?

**Problem:** The version filter checks if `projectName` or `documentUrl` contains the version string. But what if someone cached a whitepaper with `projectName: "Uniswap v3"` but the document was actually the v2 PDF? The filter would return it as a v3 match.

**Resolution:** This is a data quality problem, not a logic problem. The filter checks the metadata — if the metadata says v3, we trust it. If the data is wrong, the underlying DB entry is the issue. For graduation, this is acceptable. The persistence layer will add content hashing and version tagging in the next phase.

### Issue B: Fix 2 synthesis re-fetches the document — what if it's slow or fails?

**Problem:** `cryptoResolver.resolveWhitepaper(docUrl)` is called inside the cached path. This could be slow (docs site crawling) or fail (URL unreachable). The cached path was supposed to be fast.

**Resolution:** The re-fetch is wrapped in try/catch. If it fails, `docText` is empty and the synthesis works with claims only. The synthesis call itself has a timeout (Anthropic API call, max_tokens 2048). Total worst case: one failed HTTP fetch (8s timeout) + one Sonnet call (~5s). For a `full_technical_verification` job at $3.00 production pricing, this latency is acceptable. The synthesis only fires when `requirementText` contains analytical keywords — standard cached requests skip it entirely.

### Issue C: Fix 3 revert — what about future projects with stale URLs not in the known map?

**Problem:** If a future evaluator sends a stale URL for a project NOT in the known URL map, Grey will hard-reject instead of falling back to discovery.

**Resolution:** The evaluator's position is clear: invalid URLs should be rejected at REQUEST phase. The friend.tech test was explicitly marked as "expected: reject." If a legitimate project has a stale URL, the buyer should send the correct URL or omit it (Grey will discover the whitepaper by project_name/token_address). The soft-fallback was trying to be too clever — the evaluator wants strict input validation.

### Issue D: Fix 2 keyword regex — does it match "risk of flash loan attacks"?

**Problem:** The eval 25 plan had `/\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil)/i`. "risk" and "attack" are not in that list.

**Resolution:** The updated regex in Fix 2 adds `risk|attack|exploit|vulnerab`. "Evaluate the risk of flash loan attacks" matches on both `evaluat` and `risk` and `attack`.

### Issue E: Fix 1 + Fix 2 interaction — version cache miss triggers live pipeline, which then fires synthesis

**Problem:** If Fix 1 causes a cache miss for "Uniswap v3", the live pipeline fires. The live pipeline already has requirement-aware synthesis from the eval 25 fix. Does the synthesis fire twice — once on the live path and once... no, it only fires once because the cached path was skipped.

**Resolution:** No conflict. Fix 1 causes cache miss → live pipeline → synthesis fires on live path. Fix 2 adds synthesis to the CACHED path. They're mutually exclusive — either the cache hits (Fix 2 applies) or it misses (live path synthesis applies). Never both.

### Issue F: The `extractRequirementText` call needs to be moved in BOTH handlers

**Problem:** Both `handleFullVerification` and `handleVerifyWhitepaper` have cached paths that return early. Both need `extractRequirementText` moved before the cache check.

**Resolution:** Confirmed in the plan. Both handlers get the same restructuring.

### Issue G: Cached claims format mismatch

**Problem:** The `mappedClaims` variable in the cached path maps DB rows to the `ExtractedClaim` shape. But `generateSynthesis` expects `ExtractedClaim[]`. The mapping produces objects with `claimId`, `category`, `claimText`, `statedEvidence`, `mathematicalProofPresent`, `sourceSection`, `regulatoryRelevance` — which matches `ExtractedClaim`. No mismatch.

**Resolution:** Confirmed compatible. The `as never` cast is needed for TypeScript but the runtime shape is correct.

---

## Files Changed

| File | Change |
|------|--------|
| `src/WpvService.ts` | Revert 404/410 from soft-fallback to hard-reject |
| `src/acp/JobRouter.ts` | Version-aware filtering in `findBestWhitepaper` and `findWhitepaper`; move `extractRequirementText` before cache check in both `handleFullVerification` and `handleVerifyWhitepaper`; add synthesis call on cached path |

---

## DB Rules (reminder)

- **NO wipes** of `wpv_claims`, `wpv_verifications`, `wpv_whitepapers` without explicit Forces approval
- No DB cleanup needed for this fix set — the failures are logic bugs, not data pollution

---

*Pending Forces review. Implement in order: Fix 3 → Fix 1 → Fix 2 → verify + deploy.*
