# Kovsky Execution Plan — Eval 26 Final: Code Fixes + DB Cleanup (v2)

> **Source:** Forces v1 + Kovsky v2 corrections
> **Date:** 2026-04-05
> **v2 Author:** Kovsky (1 bug fix from Forces v1)
> **Goal:** Fix remaining 3 eval failures + purge stale cache data. 13/16 → 16/16.
> **SLA note:** Minimum SLA on Virtuals is 5 minutes. Live pipeline latency (10-30s) is well within bounds.

---

## v2 Changelog (from Forces v1)

| # | Section | Issue | Fix |
|---|---------|-------|-----|
| 1 | Phase 0, SQL | `'Jupiter%'` ILIKE pattern won't match DB entry named `"JUP"`. ILIKE is case-insensitive but "JUP" doesn't start with "Jupiter". Thin 3-claim entry survives purge. | Added `'JUP'` to the ILIKE array alongside `'Jupiter%'`. |
| 2 | Phase 3A | Plan says "move extractRequirementText before cache check" — already done in eval 25 Fix 3 implementation. | Marked as already-done verification step, not a code change. |

---

## Execution Order (strict)

1. **Phase 0: DB Cleanup** — purge eval-polluted entries for evaluator-tested projects
2. **Phase 1: Code Fix 3** — revert 404 to hard-reject (LOW risk)
3. **Phase 2: Code Fix 1** — version-aware cache + case-insensitive lookup (MEDIUM risk)
4. **Phase 3: Code Fix 2** — synthesis on cached path (MEDIUM risk)
5. **Verification + deploy**

**Why DB cleanup first:** The code fixes improve cache logic, but stale/wrong-version data in the DB would still cause problems. Cleaning first means the code fixes work against a clean dataset. When the evaluator tests Uniswap v3, the cache is empty for Uniswap → live pipeline fires → known URL map serves v3 PDF → fresh extraction → correct data cached for future queries.

---

## Phase 0: DB Cleanup — Purge Evaluator-Tested Projects

**Projects to purge (ALL entries — whitepapers + verifications + claims):**

| Project | Why Purge |
|---------|-----------|
| Uniswap (all entries including "Uniswap V3") | 4 generic entries are v2 data; 2 "Uniswap V3" entries have mixed quality; live pipeline with known URL map will produce correct version-specific data |
| Aave (all entries including "Aave V2") | 3 entries from v1 PDF, 1 mislabeled "Aave V2" with v1 data, 1 thin docs crawl; live pipeline will produce fresh v2/v3 data |
| Ethena | Created by earlier Grey without requirement-aware extraction; live pipeline will produce math-focused claims when evaluator asks |
| Seamless Protocol | All entries from pre-DocsSiteCrawler Grey; current pipeline will crawl 8 sub-pages and produce 15-25 claims |
| Aerodrome Finance | 2 composed entries (0 claims) + 1 thin docs entry; current pipeline will crawl docs.aerodrome.finance properly |
| Virtuals Protocol | Duplicate entries from eval testing; live pipeline will produce fresh data |
| Jupiter | Thin cached data from API reference page; current pipeline uses station.jup.ag/docs |
| Pyth | May have 0-claim composed entries from failed discovery; current pipeline has known URL map entry |
| Solana | Seed entry but evaluator tests it — fresh extraction with current Sonnet will be higher quality |
| Ethereum | Same as Solana — seed entry, better to let current pipeline re-extract |

**Projects to KEEP (seed entries not tested by evaluator):**
All other seed entries (Compound, Lido, MakerDAO, Chainlink, Synthetix, Curve, Balancer, etc.) — these provide briefing content and aren't actively causing failures. They'll be re-seeded post-graduation with the current pipeline.

**SQL script (run in order — CASCADE won't work across manual queries):**

```sql
-- ═══════════════════════════════════════════
-- DB CLEANUP: Purge evaluator-tested projects
-- Forces-approved. Explicitly scoped.
-- ═══════════════════════════════════════════

-- Step 1: Identify target whitepaper IDs
-- Using ILIKE for case-insensitive matching
CREATE TEMP TABLE purge_targets AS
SELECT id FROM autognostic.wpv_whitepapers
WHERE project_name ILIKE ANY(ARRAY[
  'Uniswap%', 'Aave%', 'Ethena%', 'Seamless%', 'Aerodrome%',
  'Virtuals Protocol%', 'Jupiter%', 'JUP', 'Pyth%', 'Solana%', 'Ethereum%'
]);

-- Step 2: Count before delete (for verification)
SELECT 'whitepapers' as table_name, COUNT(*) as count FROM purge_targets
UNION ALL
SELECT 'claims', COUNT(*) FROM autognostic.wpv_claims WHERE whitepaper_id IN (SELECT id FROM purge_targets)
UNION ALL
SELECT 'verifications', COUNT(*) FROM autognostic.wpv_verifications WHERE whitepaper_id IN (SELECT id FROM purge_targets);

-- Step 3: Delete in dependency order
DELETE FROM autognostic.wpv_claims WHERE whitepaper_id IN (SELECT id FROM purge_targets);
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (SELECT id FROM purge_targets);
DELETE FROM autognostic.wpv_whitepapers WHERE id IN (SELECT id FROM purge_targets);

-- Step 4: Verify remaining data
SELECT COUNT(*) as remaining_whitepapers FROM autognostic.wpv_whitepapers;
SELECT COUNT(*) as remaining_claims FROM autognostic.wpv_claims;
SELECT COUNT(*) as remaining_verifications FROM autognostic.wpv_verifications;

-- Step 5: Cleanup
DROP TABLE purge_targets;
```

**Kov: run the Step 2 count query FIRST and report the numbers before executing deletes. This is the checkpoint — if the count looks wrong (e.g., deleting more than expected), stop and report.**

**Expected result:** ~30-40 whitepapers deleted, ~50-60 remaining (the untouched seed entries). Claims and verifications for deleted whitepapers are also removed.

---

## Phase 1: Revert 404 to Hard-Reject

**File:** `src/WpvService.ts`

**Find this block in the HEAD check section (~line 563):**

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

**Why safe:** The soft-fallback was a workaround for Aave's stale URL (eval 23 F5). Aave is now in the known URL map with 34 entries. Any known project with a stale evaluator URL will be found via discovery when the buyer omits `document_url`. The evaluator explicitly expects 404 URLs to be rejected at REQUEST phase — friend.tech proved this.

---

## Phase 2: Version-Aware Cache + Case-Insensitive Lookup

**File:** `src/acp/JobRouter.ts`

### 2A. Case-insensitive findByProjectName

**File:** `src/db/wpvWhitepapersRepo.ts`

The current `findByProjectName` uses `eq()` which is case-sensitive in PostgreSQL. "Uniswap v3" won't match a DB entry stored as "Uniswap V3".

**Find:**
```typescript
async findByProjectName(projectName: string): Promise<WpvWhitepaperRow[]> {
  return this.db
    .select()
    .from(wpvWhitepapers)
    .where(eq(wpvWhitepapers.projectName, projectName));
}
```

**Replace with:**
```typescript
async findByProjectName(projectName: string): Promise<WpvWhitepaperRow[]> {
  return this.db
    .select()
    .from(wpvWhitepapers)
    .where(sql`LOWER(${wpvWhitepapers.projectName}) = LOWER(${projectName})`);
}
```

**Import `sql` if not already imported** — check the existing imports at the top of the file. The file already imports from `drizzle-orm`, but may need `sql` added:

```typescript
import { eq, and, desc, sql } from 'drizzle-orm';
```

### 2B. Version-aware filtering in findBestWhitepaper

**File:** `src/acp/JobRouter.ts`

**Find the version-strip fallback block in `findBestWhitepaper`:**

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

**Replace with:**

```typescript
// Version-strip fallback: "Aave V3" → try "Aave"
if (byName.length === 0) {
  const stripped = stripVersionSuffix(projectName);
  if (stripped) {
    const requestedVersion = projectName.match(/\b(v\d+)\b/i)?.[1]?.toLowerCase();
    const strippedResults = await this.deps.whitepaperRepo.findByProjectName(stripped);

    if (strippedResults.length > 0 && requestedVersion) {
      // Filter: only use stripped results if their name or URL contains the requested version
      const versionMatched = strippedResults.filter((wp) => {
        const wpName = ((wp as Record<string, unknown>).projectName as string ?? '').toLowerCase();
        const wpUrl = ((wp as Record<string, unknown>).documentUrl as string ?? '').toLowerCase();
        return wpName.includes(requestedVersion) || wpUrl.includes(requestedVersion);
      });

      if (versionMatched.length > 0) {
        byName = versionMatched;
        log.info('findBestWhitepaper: version-strip fallback (version-filtered)', {
          original: projectName, stripped, requestedVersion,
          total: strippedResults.length, matched: versionMatched.length,
        });
      } else {
        // Cached data is for a different version — treat as cache miss
        log.info('findBestWhitepaper: version mismatch — skipping cache', {
          original: projectName, stripped, requestedVersion,
          cachedNames: strippedResults.slice(0, 3).map((wp) => (wp as Record<string, unknown>).projectName),
        });
        // byName stays empty → cache miss → live pipeline fires
      }
    } else if (strippedResults.length > 0) {
      // No version requested — use all stripped results (existing behavior)
      byName = strippedResults;
      log.info('findBestWhitepaper: version-strip fallback matched', {
        original: projectName, stripped, matches: byName.length,
      });
    }
  }
}
```

**Apply the identical pattern to `findWhitepaper`** — it has the same version-strip block. Same logic.

---

## Phase 3: Synthesis on Cached Path

**File:** `src/acp/JobRouter.ts`

### 3A. Verify extractRequirementText is before cache check (v2: already done)

**v2 note:** This was already implemented in the eval 25 Fix 3 deployment. Both `handleFullVerification` and `handleVerifyWhitepaper` have `const requirementText = this.extractRequirementText(input);` at the top of the method, before any cache lookup. **Verify this is still in place — no code change needed.**

### 3B. Add synthesis to cached return path in handleFullVerification

**Find the cached return block (~line 543):**

```typescript
if (totalClaims > 0 && claims.length > 0) {
  log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
  const analysis = this.extractStructuralAnalysis(verification);
  const fullReport = this.deps.reportGenerator.generateFullVerification(
    this.verificationRowToResult(verification),
    claims.map((c) => ({
      claimId: c.id,
      category: c.category as never,
      claimText: c.claimText,
      statedEvidence: c.statedEvidence,
      mathematicalProofPresent: c.mathProofPresent,
      sourceSection: c.sourceSection,
      regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
    })),
    [],
    wp as never,
    undefined,
    analysis,
  );
  if (reqAddr) fullReport.tokenAddress = reqAddr;
  return fullReport;
}
```

**Replace with:**

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

  // Requirement-aware synthesis on cached data
  if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil|risk|attack|exploit|vulnerab)/i.test(requirementText)) {
    const docUrl = (wp as Record<string, unknown>).documentUrl as string | undefined;
    let docText = '';
    if (docUrl) {
      try {
        const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(docUrl));
        docText = resolved.text;
      } catch {
        log.warn('Could not re-fetch document for synthesis — using claims only', { docUrl });
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

### 3C. Apply the same pattern to handleVerifyWhitepaper

The cached return in `handleVerifyWhitepaper` (~line 336) has the same early-exit structure. Apply the identical changes:

1. Move `const requirementText = this.extractRequirementText(input);` before the cache check
2. After building the report from cached data, add the synthesis block (same code as 3B)

### 3D. Expanded keyword regex

The synthesis trigger regex now includes `risk|attack|exploit|vulnerab` in addition to the original keywords. This ensures "Evaluate the risk of flash loan attacks" matches on multiple terms.

---

## Self-Audit

### Issue A: DB cleanup uses ILIKE with wildcards — could over-match

**Problem:** `'Uniswap%'` would match a hypothetical project named "Uniswap Fork XYZ" if it existed.

**Resolution:** The only projects in the DB are from seed ingestion (66 curated tokens) and eval runs. There are no "Uniswap Fork" entries. The wildcard is needed to catch "Uniswap", "Uniswap V3", "Uniswap v3" variants. The Step 2 count query is the safety check — Kov reports numbers before deleting.

### Issue B: Case-insensitive findByProjectName — performance impact

**Problem:** `LOWER()` on both sides prevents index usage on the `project_name` column.

**Resolution:** The `wpv_wp_project_chain_idx` index is on `(project_name, chain)`. `LOWER()` comparisons won't use this index. But with 50-80 rows in the table, a sequential scan is sub-millisecond. This is a non-issue at Grey's scale. If the table grows to thousands of rows post-graduation, add a functional index: `CREATE INDEX ON autognostic.wpv_whitepapers (LOWER(project_name))`.

### Issue C: Live pipeline latency after DB purge

**Problem:** With evaluator-tested projects purged, the first request for each will run the live pipeline (10-30s).

**Resolution:** Forces confirmed minimum SLA is 5 minutes. Live pipeline latency is well within bounds. The evaluator won't penalize for response times under 5 minutes. After the first live run, data is cached for subsequent requests within the same eval.

### Issue D: Briefing content after DB purge

**Problem:** If the evaluator requests a briefing for today's date, it needs verifications from today. Purging evaluator-tested projects removes their verifications. The briefing will only contain non-purged seed entries.

**Resolution:** The remaining seed entries (Compound, Lido, MakerDAO, Chainlink, Synthetix, Curve, etc.) provide briefing content. If the evaluator requests briefing for today (2026-04-05), the `getVerificationsByDate` query returns verifications from today — these are mostly eval-generated entries. Some will survive the purge (non-evaluator-tested projects). Worst case: the briefing has fewer entries but all are high-quality seed data, which is better than polluted eval data.

Additionally, any accept-and-deliver tests that run BEFORE the briefing test will cache fresh data. If the evaluator runs a legitimacy scan for Uniswap, that creates a fresh Uniswap entry in the DB. If the briefing test runs later, the fresh Uniswap entry appears in the briefing.

### Issue E: findByProjectName now uses raw SQL — injection risk?

**Problem:** The `LOWER(${projectName})` syntax uses Drizzle's `sql` template literal, which parameterizes the input. This is NOT string concatenation — Drizzle generates `LOWER($1)` with `projectName` as a bound parameter. No injection risk.

**Resolution:** Safe by construction. Drizzle's `sql` tagged template always parameterizes.

### Issue F: Version-aware cache + synthesis interaction

**Problem:** If Fix 1 causes a cache miss (version mismatch), the live pipeline fires with requirement-aware extraction (eval 25 Fix 3). If Fix 1 causes a cache HIT (version matches), Fix 2's synthesis fires on the cached data. These are mutually exclusive paths — no conflict.

**Resolution:** Confirmed. Cache hit → synthesis on cached data. Cache miss → live pipeline with requirement-aware extraction + synthesis. Never both.

### Issue G: Document re-fetch in synthesis — what if DocsSiteCrawler fires?

**Problem:** The synthesis re-fetches the document via `cryptoResolver.resolveWhitepaper(docUrl)`. If `docUrl` is a docs site, this triggers the DocsSiteCrawler (8 sub-pages, up to 45s). Combined with the Sonnet synthesis call (~5s), total latency could hit 50s.

**Resolution:** Still well within 5-minute SLA. The re-fetch only fires on the cached path when `requirementText` exists AND contains analytical keywords — a narrow trigger. Most cached requests skip synthesis entirely. For the rare synthesis-on-cache case, 50s is acceptable for a $3.00 full_technical_verification job.

---

## Post-Graduation Plan (noted for reference, not implemented now)

After graduation:
1. Re-seed all 66 tokens with current pipeline (Sonnet + DocsSiteCrawler + requirement-aware extraction)
2. Build thin persistence layer (text + embeddings in Supabase pgvector)
3. Close ports 3000+3001
4. Set production prices ($0.25/$1.50/$3.00/$8.00)
5. Enable DB hygiene service in purge mode

---

## Files Changed

| File | Change |
|------|--------|
| Database (Supabase) | Purge all entries for 10 evaluator-tested projects |
| `src/WpvService.ts` | Revert 404/410 to hard-reject |
| `src/db/wpvWhitepapersRepo.ts` | Case-insensitive `findByProjectName` via `LOWER()` |
| `src/acp/JobRouter.ts` | Version-aware filtering in `findBestWhitepaper` + `findWhitepaper`; move `extractRequirementText` before cache check; add synthesis to cached return path in both `handleFullVerification` + `handleVerifyWhitepaper` |

---

## DB Rules

- Purge scope: ONLY the 10 projects listed above
- Kov MUST run count query (Step 2) and report numbers BEFORE executing deletes
- Remaining seed entries (~50-60) are preserved
- Re-seed planned post-graduation, not now

---

*Forces v1 approved. v2 corrections by Kovsky — 1 bug fix (JUP pattern), 1 redundancy noted (3A already done). Implement in strict order: Phase 0 → 1 → 2 → 3 → verify + deploy.*
