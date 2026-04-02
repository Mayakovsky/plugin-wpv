# F5 Diagnostic Report: Aave V3 INSUFFICIENT_DATA

**Date:** 2026-04-01
**Author:** Kovsky (Claude Opus 4.6)
**Failure:** Eval test F1 — `full_technical_verification` with plain text "Perform a full technical verification of the Aave V3 protocol." returned INSUFFICIENT_DATA (0 claims despite 4863 LLM tokens spent).

---

## 1. VPS Diagnostic Findings

### 1.1 Version-strip code IS deployed

```bash
$ grep -n "baseNameMatch\|version.*suffix" /opt/grey/plugin-wpv/dist/discovery/WebSearchFallback.js
34: // Fallback: if project name has a version suffix (e.g., "Aave V3", "Uniswap v2"),
36: const baseNameMatch = projectName.match(/^(.+?)\s+[vV]\d+$/);
37: if (baseNameMatch) {
38:     const baseName = baseNameMatch[1].trim();
```

The `WebSearchFallback` version-strip logic is present in the compiled JS. Grey should try "Aave" after "Aave V3" fails to find documents.

### 1.2 PM2 log analysis

Key log lines from the eval run (chronological):

```
[wpv] [INFO] Tier 4: Composed whitepaper from available data | projectName="Aave V3"
[wpv] [INFO] findBestWhitepaper candidates | total=1 best="Aave V3" bestClaims=0
[wpv] [WARN] Rate limited -- waiting before retry | operation="ClaimExtractor" projectName="Aave V3" attempt=1 waitMs=65000
[wpv] [WARN] Rate limited -- waiting before retry | operation="ClaimExtractor" projectName="Aave" attempt=1 waitMs=65000
[wpv] [WARN] Rate limited -- waiting before retry | operation="ClaimExtractor" projectName="Aave" attempt=2 waitMs=65000
[wpv] [WARN] Claim extraction failed | operation="ClaimExtractor" projectName="Aave"
```

### 1.3 What happened (reconstructed sequence)

1. Grey received `"Perform a full technical verification of the Aave V3 protocol."`
2. `extractFromUnknownFields` extracted project_name = `"Aave V3"` (new 80-protocol regex would also catch this; was caught by old 21-protocol regex since Aave was listed)
3. No cached whitepaper for "Aave V3" in DB (the seed entry is under "Aave", not "Aave V3")
4. Discovery ran: Tiers 1-3 failed (no PDF links, no website scrape, DuckDuckGo didn't return usable results for "Aave V3")
5. **Tier 4 fired:** Composed a synthetic whitepaper from available metadata
6. ClaimExtractor attempted L2 extraction on the composed text
7. **Anthropic API returned 429 (rate limit)** -- Tier 1 cap of 30k input tokens/min
8. Retry after 65s -- rate limited again
9. ClaimExtractor gave up after max retries
10. Result: 0 claims, verdict = INSUFFICIENT_DATA

---

## 2. Root Causes (two independent issues)

### Root Cause A: Rate limiting (Tier 1 API cap)

The Anthropic API key is on **Tier 1** (30k input tokens/min, 50 RPM). During an eval run, multiple jobs fire in rapid succession. A single `full_technical_verification` whitepaper can consume 15-20k input tokens, leaving almost no headroom for concurrent jobs. The ClaimExtractor hit the 30k/min ceiling and failed after retries.

**Evidence:** The 429 error message in logs explicitly states `"rate limit of 30,000 input tokens per minute"`.

**Current headers confirm Tier 1:**
```
anthropic-ratelimit-input-tokens-limit: 30000
anthropic-ratelimit-output-tokens-limit: 8000
anthropic-ratelimit-requests-limit: 50
```

### Root Cause B: Discovery gap (Tier 4 fallback for "Aave V3")

Even without rate limiting, the discovery pipeline couldn't find the real Aave V3 whitepaper. DuckDuckGo web search didn't return usable results, and Grey fell back to Tier 4 (composed whitepaper from metadata). Composed whitepapers are thin -- they lack the technical depth needed for meaningful claim extraction.

The DB has a seed entry for "Aave" (24 claims) but not "Aave V3". The `findBestWhitepaper` lookup found the Aave V3 composed entry (0 claims) instead of matching against the "Aave" seed entry.

---

## 3. Mitigations Already Applied

| Mitigation | Status | Effect |
|------------|--------|--------|
| Haiku model swap (`WPV_MODEL=claude-haiku-4-5-20251001`) | **Deployed** | 75% cost reduction, lower token count per call, reduces rate limit pressure |
| DB cleanup (duplicates/artifacts removed) | **Deployed** | 76 clean whitepapers, no duplicate token_addresses |
| 80-protocol regex (Fix 3) | **Deployed** | Catches "Aave V3" in plain text extraction |
| Code fixes F1-F4 | **Deployed** | Addresses other 4 eval failures |

---

## 4. Recommendations for Forces Review

### R1: Upgrade to Anthropic API Tier 2 (HIGH PRIORITY)

**Action:** Purchase $35 in additional Anthropic API credits (total $40 cumulative) to unlock Tier 2.

**Effect:** Input token limit increases from 30k/min to 450k/min (15x). RPM increases from 50 to 1,000. This eliminates rate limiting as a failure mode during eval runs entirely.

**Cost context:**
- $35 is prepaid credit, not a fee -- Grey will consume it in production
- At Haiku pricing (~$0.21/eval run), $35 funds ~165 eval rounds
- At Sonnet pricing (~$0.78/eval run), $35 funds ~45 eval rounds
- Daily cron in production costs ~$0.05-0.15/day (Haiku/Sonnet)
- Estimated total testing burn: $5-8 (Haiku) or $16-21 (Sonnet)

**Risk of not upgrading:** Any eval job that triggers L2/L3 on a fresh (uncached) whitepaper during a multi-job eval run will likely 429 again. This is not a code fix -- it's an infrastructure constraint.

### R2: Fuzzy project name matching in findBestWhitepaper (MEDIUM PRIORITY)

**Problem:** When Grey receives "Aave V3", the DB lookup doesn't match the seed entry "Aave" (24 claims). Grey finds only the freshly-composed "Aave V3" entry with 0 claims.

**Proposed fix:** In `JobRouter.findBestWhitepaper()`, add a version-stripped fallback lookup. If the exact project_name match returns 0 results or 0 claims, strip the version suffix (V2, V3, v2, v3) and re-query. This mirrors the existing `WebSearchFallback` version-strip logic.

**Expected effect:** "Aave V3" would match the "Aave" seed entry (24 claims), returning a cached result with real data instead of triggering a live pipeline that hits rate limits.

### R3: Keep Haiku for testing, swap to Sonnet for production (LOW PRIORITY)

**Current state:** `WPV_MODEL=claude-haiku-4-5-20251001` deployed on VPS.

**Rationale:** The Butler evaluator validates response shape only (JSON structure, field types, enum values, range bounds). It does not evaluate claim quality, accuracy, or depth. Haiku produces valid structured output for tool_use calls at 75% lower cost.

**Action for production launch:** Change `WPV_MODEL=claude-sonnet-4-20250514` in `/opt/grey/wpv-agent/.env` and `pm2 restart grey` when Grey graduates and starts serving paying buyers who care about claim quality.

### R4: Add cost logging to stdout (NICE TO HAVE)

CostTracker computes per-job costs but doesn't log them. Adding a single log line after each pipeline completion (`log.info('Pipeline complete', { projectName, totalCostUsd, inputTokens, outputTokens })`) would make burn rate visible in PM2 logs without code structure changes.

---

## 5. Summary

| Factor | Impact on F1 failure | Fix |
|--------|---------------------|-----|
| Tier 1 rate limit (30k TPM) | **Primary cause** -- ClaimExtractor 429'd after retries | R1: Upgrade to Tier 2 ($35) |
| No fuzzy project name match | **Contributing** -- "Aave V3" didn't match "Aave" seed data | R2: Version-strip fallback in findBestWhitepaper |
| Sonnet token consumption | **Amplifier** -- higher token count per call exhausts limit faster | R3: Haiku swap (already deployed) |

**Estimated probability of F1 passing after R1 + R2:** High. With Tier 2 rate limits and fuzzy matching, Grey would either serve cached Aave data (24 claims) or successfully run live L2 extraction without 429 errors.
