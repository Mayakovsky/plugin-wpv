# Eval Run 26 Analysis — 13/16

**Date:** 2026-04-05
**Eval run:** 26
**Score:** 13/16 (3 failures)
**Analyst:** Claude Opus (Kovsky context window)
**Status:** Pending Forces review

---

## Score by Offering

| Offering | Score | Notes |
|----------|-------|-------|
| daily_technical_briefing | **4/4** | PERFECT — both dates passed, both rejections correct |
| project_legitimacy_scan | **4/4** | PERFECT — Uniswap+Aerodrome passed, Zero Address+invalid rejected |
| verify_project_whitepaper | **3/4** | 1 failure: friend.tech invalid URL accepted instead of rejected |
| full_technical_verification | **2/4** | 2 failures: Uniswap v3→v2 cache served, Aave v2 flash loan→generic analysis |

## Big Wins (vs eval 25)

- **daily_technical_briefing 4/4** (was 2/4) — date-specific briefings working, 0-claim filter working
- **project_legitimacy_scan 4/4** (was 2/4) — Aerodrome PASSED (DocsSiteCrawler + known URL map), Zero Address correctly rejected (Fix 1)
- **Seamless Protocol no longer failing** — passed in briefing context

---

## The 3 Failures

### F1: full_technical_verification — Uniswap v3 requested, v2 data served

**Job:** 1003340306
**Requirement:** `"Verify the mathematical consistency of Uniswap v3's concentrated liquidity model."`
**Expected:** Accept, analyze Uniswap v3 whitepaper (ticks, concentrated liquidity, virtual reserves)
**Actual:** Served cached Uniswap v2 data (27 claims, x*y=k invariant, sqrt(k) fee growth)

**Diagnostic evidence:**
```
findBestWhitepaper: version-strip fallback matched | original="Uniswap v3" stripped="Uniswap" matches=4
findBestWhitepaper candidates | total=4 usable=4 best="Uniswap" bestClaims=27
Returning cached result with claims | projectName="Uniswap" totalClaims=27
```

**Root cause:** The requirement is plain text. `parseRequirement` extracted `project_name: "Uniswap"` (version "v3" lost during text parsing — the protocol regex captured it in `match[0]` but the text goes through `findBestWhitepaper`, not the known URL map). `findBestWhitepaper` version-strips "Uniswap v3" → "Uniswap" and finds 4 cached entries, all for the Uniswap v2 whitepaper PDF (27 claims). Returns the v2 data.

**Why Fix 2 didn't help:** Fix 2 added version-specific entries to the known URL map. But `handleFullVerification` checks cache FIRST via `findBestWhitepaper`. The cache had Uniswap entries with 27 claims. The handler returned cached data without ever reaching discovery/known URL map.

**The fix:** `findBestWhitepaper` (and `findWhitepaper`) need version-aware matching. When the input has `project_name: "Uniswap v3"`, the cache lookup should prefer entries whose `projectName` contains "v3". If no v3-specific entry exists, it should treat the cache as a miss and let discovery find the v3 whitepaper via the known URL map.

**Specific implementation:** Before version-stripping, check if any candidate's `projectName` matches the requested version. Only fall back to version-stripped results if no version-specific match exists. If the version-stripped match has a DIFFERENT version (e.g., cached "Uniswap V3 Whitepaper" data but the claims are actually from v2 PDF), the cache should be skipped.

**Alternative:** Since the request is plain text, `extractRequirementText` should capture the full text. The `generateSynthesis` L4 call should fire. But diagnostics show synthesis never ran (see F2 analysis below for why).

---

### F2: full_technical_verification — Aave v2 flash loan risk, generic analysis served

**Job:** 1003340307
**Requirement:** `"Evaluate the risk of flash loan attacks on the Aave v2 protocol."`
**Expected:** Focused flash loan risk analysis
**Actual:** Generic Aave v1 whitepaper claims (LEND token, not AAVE), empty evaluations, no flash loan risk assessment

**Diagnostic evidence:**
```
findBestWhitepaper: version-strip fallback matched | original="Aave v2" stripped="Aave" matches=4
findBestWhitepaper candidates | total=4 usable=4 best="Aave" bestClaims=24
Returning cached result with claims | projectName="Aave" totalClaims=24
```

**Root cause (same pattern as F1):** Cache hit bypassed the entire live pipeline. The handler returned 24 cached claims from the Aave v1 whitepaper. The requirement-aware pipeline (Fix 3) never fired because:

1. `handleFullVerification` checks cache via `findBestWhitepaper` FIRST
2. Cache had Aave entries with 24 claims → returned immediately
3. `extractRequirementText`, `runL1L2`, `generateSynthesis` — all skipped because the cached path returns early at line ~543 (before any of them execute)

**This is the critical bug.** The requirement-aware pipeline (Fix 3) only fires on the LIVE pipeline path. The CACHED path returns at line ~543 in `handleFullVerification` and line ~336 in `handleVerifyWhitepaper` — before `extractRequirementText` is even called. For projects that have cached data, the buyer's analytical question is completely ignored.

**The fix:** The requirement-aware pipeline needs to fire EVEN on cached results when `requirementText` is present. Options:

**Option A (minimal):** When `requirementText` is present AND contains analytical keywords, skip the cache and force the live pipeline. This ensures the requirement-aware prompt reaches ClaimExtractor and the synthesis runs. Cost: one extra Sonnet call per requirement-aware request.

**Option B (better):** Allow cached claims to be used, but still run `generateSynthesis` on the cached claims + requirement text. The synthesis can analyze the cached claims through the lens of the buyer's question. Cost: one synthesis call, but no re-extraction needed.

**Option B is recommended** — it uses cached claims (fast) but still generates a focused response to the buyer's question. The synthesis has access to the full document text (from the cached whitepaper's documentUrl) and can reference the specific analytical question.

**However**, for F1 (wrong version served), Option B won't help — the cached claims are from the WRONG document. For version mismatches, the cache must be skipped entirely.

---

### F3: verify_project_whitepaper — friend.tech invalid URL accepted

**Job:** 1003340302
**Requirement:** `{"project_name": "Friend.tech", "token_address": "0x01E06...", "document_url": "https://friend.tech/no-whitepaper-exists"}`
**Expected:** Reject at REQUEST phase (invalid/unreachable URL)
**Actual:** Accepted, ran pipeline, delivered INSUFFICIENT_DATA

**Diagnostic evidence:**
```
curl -sI -L "https://friend.tech/no-whitepaper-exists"
HTTP/1.1 308 Permanent Redirect → https://www.friend.tech/no-whitepaper-exists
HTTP/1.1 404 Not Found
```

**Root cause:** The URL returns 308 → 404 after redirect. Our HEAD check in `validateTokenAddress` follows redirects (`redirect: 'follow'`). The final response is 404. Our code at line ~563 handles 404 by clearing `document_url` (the soft-fallback fix from eval 23). But the evaluator expected a HARD REJECT for this case.

**The problem:** We made 404 a soft-fallback to handle the Aave case (stale URL, project exists, discovery can find the real doc). But friend.tech is a different case — the project doesn't have a whitepaper at all. The evaluator expects Grey to reject invalid URLs, not accept them and return INSUFFICIENT_DATA.

**The fix:** Distinguish between "known project with stale URL" and "unknown project with fake URL":
- If `project_name` matches a known protocol in our registry AND the 404 URL is on a different domain than the project → soft-fallback (clear URL, discovery finds the real one)
- If the 404 URL is on the project's OWN domain (friend.tech/no-whitepaper-exists is on friend.tech) → the project itself doesn't have a whitepaper at that path → hard reject

**Simpler alternative:** Revert to hard-rejecting 404 URLs. The Aave 404 case (eval 23 F5) is now handled by the known URL map — Aave is in the map, so discovery finds the real whitepaper even without the evaluator's stale URL. The soft-fallback was a workaround for a problem we've since solved properly.

---

## Diagnostic Summary

### (a) rawContent flow: AcpService → WpvService → JobRouter

**Code is deployed correctly.** Both `AcpService.ts` (lines 556, 612) and `JobRouter.js` (lines 785-787) have the rawContent/requirementText code. **But it never executed** because both F1 and F2 hit the cached path, which returns before `extractRequirementText` is called.

### (b) generateSynthesis: never called

**Zero log entries** for synthesis, requirementText, or rawContent. The code exists (line 796 in compiled JS) but was never reached. Both full_tech jobs hit cache and returned early.

### (c) Uniswap cache served stale v2 data

**Confirmed.** `findBestWhitepaper: version-strip fallback matched | original="Uniswap v3" stripped="Uniswap"` → returned 27-claim v2 cache. The version-specific known URL map entry for v3 (`uniswap.org/whitepaper-v3.pdf`) was never consulted because cache hit came first.

### (d) friend.tech URL returns 308→404

**Confirmed.** Redirects to www.friend.tech, then 404. Our soft-fallback cleared the URL instead of rejecting.

---

## Proposed Fixes

| # | Fix | Impact | Complexity |
|---|-----|--------|------------|
| 1 | **Version-aware cache lookup** — skip cache when requested version doesn't match cached version | Fixes F1 | MEDIUM |
| 2 | **Run synthesis on cached results** — when requirementText present, call generateSynthesis even on cached path | Fixes F2 | LOW-MEDIUM |
| 3 | **Revert 404 to hard-reject** — known URL map now handles stale URLs for known projects | Fixes F3 | LOW |

---

## Eval Trajectory

| Run | Score | Total | Key Issue |
|-----|-------|-------|-----------|
| 23 | 13/18 | 18 | Briefing key, Lido/MakerDAO, USDC MiCA, Aave 404 |
| 24 | 8/16 | 16 | Seamless/Aerodrome docs sites — sub-page crawling gap |
| 25 | 12/16 | 16 | Empty Address, Uniswap v4/v2, Ethena math, briefings |
| **26** | **13/16** | **16** | **Cache serves wrong version, synthesis bypassed on cache, friend.tech 404** |

The failures are shifting from discovery/crawling to **cache intelligence** and **requirement-aware analysis on cached data**. The live pipeline works correctly — it's the cached shortcut that's causing problems now.

---

*Pending Forces review. Compare with Forces' independent analysis before implementing.*
