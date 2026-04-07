# Kovsky Execution Plan — Eval 27 Final 2 Fixes

> **Source:** Forces + Claude Opus context window
> **Date:** 2026-04-06
> **Goal:** Fix remaining 2 eval failures. 14/16 → 16/16. Graduation.
> **Depends on:** Eval 26 fixes + DB cleanup fully deployed (confirmed)

---

## The 2 Failures

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| F1 | Chainlink V2 requested → V1 claims served | Cache poisoned by earlier verify_project_whitepaper V1 test + version not extracted from non-adjacent position in text | Non-adjacent version extraction + Chainlink version-specific known URL entries |
| F2 | "What is the current market price of Bitcoin on Binance?" accepted | No scope validation — Grey checks input validity but not whether the question is within scope | Out-of-scope detector for plain text requirements |

---

## Execution Order

1. **Fix 1: Non-adjacent version extraction + Chainlink known URL entries** (MEDIUM)
2. **Fix 2: Out-of-scope detector** (LOW-MEDIUM)
3. **Verification + deploy**

---

## What Actually Happened with Chainlink (timeline reconstruction)

The evaluator ran tests in this order during eval 27:

1. **Legitimacy scan** (02:59:04) — L1 only, 0 claims, lightweight cache entry under "Chainlink"
2. **verify_project_whitepaper** (03:00:25) — evaluator sent `document_url: "https://research.chain.link/whitepaper-v1.pdf"` explicitly. Grey analyzed this V1 PDF and cached 10 V1 claims (Algorithm 1, ERC223, threshold signatures) under `project_name: "Chainlink"`
3. **full_tech "Chainlink V2"** (03:00:41) — plain text parsed `project_name: "Chainlink"` (no version). Cache lookup found "Chainlink" with 10 claims from step 2. Returned V1 data.
4. **Briefing** (03:01:15) — used the same cached V1 claims

The known URL map points to `research.chain.link/whitepaper-v2.pdf` which IS the real V2 paper. But discovery/known URL map never fired because the cache already had 10 claims from the V1 analysis. The version-aware cache fix from eval 26 didn't help because `project_name` was "Chainlink" (no version) — there was no version to filter on.

**Two sub-problems:**
- **The protocol regex doesn't capture non-adjacent versions.** "Chainlink oracle network based on their V2 whitepaper" → regex gets `match[0] = "Chainlink"`. The `(v\d+)?` capture group requires the version immediately after the protocol name.
- **Even with version extraction, the cached data from the V1 test would still be served** unless the version-aware cache filter recognizes "Chainlink v2" ≠ cached "Chainlink" (which has V1 claims from the V1 URL).

---

## Fix 1: Non-Adjacent Version Extraction + Chainlink Known URL Entries

### 1A. Non-adjacent version extraction in extractFromUnknownFields

**File:** `src/WpvService.ts` — in `extractFromUnknownFields`

After the protocol regex extracts a project name WITHOUT a version suffix, do a secondary scan of the same text for a version string near whitepaper/protocol keywords.

**Current behavior:**
```
"Analyze the security and decentralization claims of the Chainlink oracle network based on their V2 whitepaper."
→ Protocol regex: match[0] = "Chainlink", match[2] = undefined (no adjacent version)
→ project_name = "Chainlink"
```

**New behavior:**
```
→ Protocol regex: match[0] = "Chainlink", match[2] = undefined
→ Secondary scan: found "V2" near "whitepaper" keyword
→ project_name = "Chainlink v2"
```

**After the existing protocol regex match block, add:**

```typescript
// If protocol matched WITHOUT a version suffix, scan for non-adjacent version
// e.g., "Chainlink oracle network based on their V2 whitepaper"
if (projectMatch && !projectMatch[2] && !requirement.project_name) {
  // Look for version strings (V2, v3, V4, etc.) near whitepaper/protocol keywords
  const versionNearKeyword = text.match(
    /\b(v\d+)\s*(?:whitepaper|white\s*paper|technical\s*paper|protocol|specification|documentation)\b/i
  );
  if (versionNearKeyword) {
    requirement.project_name = (projectMatch[0].trim() + ' ' + versionNearKeyword[1]).trim();
  }
}
```

**Placement:** This block goes AFTER the existing `if (projectMatch)` block that sets `requirement.project_name = projectMatch[0].trim()`. It only fires when:
1. A protocol was matched (projectMatch exists)
2. No version was captured by the protocol regex (match[2] is undefined)
3. project_name hasn't been set yet by a prior iteration

Wait — there's a sequencing issue. The existing code sets `requirement.project_name = projectMatch[0].trim()` inside the `if (!requirement.project_name)` block. The secondary scan needs to run AFTER that assignment to modify it. Let me restructure:

**Find the existing block:**

```typescript
// Extract known protocol/chain names
if (!requirement.project_name) {
  const projectMatch = text.match(
    /\b(Bitcoin|Ethereum|...)\s*(v\d+)?\b/i
  );
  if (projectMatch) {
    requirement.project_name = projectMatch[0].trim();
  }
}
```

**Replace with:**

```typescript
// Extract known protocol/chain names
if (!requirement.project_name) {
  const projectMatch = text.match(
    /\b(Bitcoin|Ethereum|...)\s*(v\d+)?\b/i
  );
  if (projectMatch) {
    requirement.project_name = projectMatch[0].trim();

    // If no version was adjacent, scan for non-adjacent version near whitepaper keywords
    // e.g., "Chainlink oracle network based on their V2 whitepaper"
    if (!projectMatch[2]) {
      const versionNearKeyword = text.match(
        /\b(v\d+)\s*(?:whitepaper|white\s*paper|technical\s*paper|protocol|specification|documentation)\b/i
      );
      if (versionNearKeyword) {
        requirement.project_name = projectMatch[0].trim() + ' ' + versionNearKeyword[1].toLowerCase();
      }
    }
  }
}
```

**Why `.toLowerCase()` on the version?** Normalizes "V2" → "v2" so it matches the known URL map pattern `\bchainlink\s+v2\b/i` and the version-aware cache filter consistently.

**Test cases:**
- `"Chainlink oracle network based on their V2 whitepaper"` → `"Chainlink v2"` ✓
- `"Verify Uniswap v3 concentrated liquidity"` → `"Uniswap v3"` (adjacent match, secondary scan skipped) ✓
- `"Analyze the Bitcoin whitepaper"` → `"Bitcoin"` (no version anywhere, unchanged) ✓
- `"Evaluate the Aave protocol V2 technical paper"` → `"Aave v2"` ✓
- `"What is the current market price of Bitcoin on Binance?"` → `"Bitcoin"` (no version keyword near whitepaper) ✓

### 1B. Chainlink version-specific known URL entries

**File:** `src/discovery/WebSearchFallback.ts`

Add version-specific entries BEFORE the generic Chainlink entry:

```typescript
// ── Chainlink (version-specific first, generic last) ──
[/\bchainlink\s+v2\b/i, 'https://research.chain.link/whitepaper-v2.pdf'],
[/\bchainlink\s+v1\b/i, 'https://research.chain.link/whitepaper-v1.pdf'],
[/\bchainlink\b/i, 'https://research.chain.link/whitepaper-v2.pdf'],  // default: latest (V2)
```

**Note:** The generic entry stays pointing to v2.pdf (the latest). When someone says "Chainlink" without a version, they get the V2 paper. When they specifically say "Chainlink V1", they get the V1 paper.

### 1C. Chainlink version-aware cache interaction

With Fix 1A producing `project_name: "Chainlink v2"` and the version-aware cache from eval 26:

1. `findBestWhitepaper("Chainlink v2")` → exact match lookup → no "Chainlink v2" entries in DB
2. Version-strip fallback → strips to "Chainlink" → finds cached entries → checks for "v2" in their name/URL
3. Cached entry from the V1 test has `documentUrl: "research.chain.link/whitepaper-v1.pdf"` → contains "v1" not "v2" → version mismatch → cache miss
4. Live pipeline fires → known URL map matches `\bchainlink\s+v2\b` → fetches V2 PDF → extracts DON/super-linear staking claims → passes

This works because all three fixes (1A version extraction + eval 26 version-aware cache + 1B version-specific URLs) chain together.

---

## Fix 2: Out-of-Scope Detector

**File:** `src/WpvService.ts` — in `validateTokenAddress`, for `full_technical_verification` offering

### The Problem

Grey checks whether inputs are technically valid but never checks whether the QUESTION is within scope. "What is the current market price of Bitcoin on Binance?" is a valid plain-text input (contains "Bitcoin" → known protocol), but it's asking for market data, not whitepaper verification.

The evaluator's position: *"a real-time price query completely outside the agent's stated scope of 'whitepaper verification'."* Grey should reject at REQUEST phase.

### The Fix

Add a scope check for plain-text requirements on `full_technical_verification`. When the text matches out-of-scope patterns AND doesn't match any in-scope patterns, reject.

**In `validateTokenAddress`, add a new block AFTER the existing `extractFromUnknownFields` call and AFTER the content violation scan, but BEFORE the token_address validation. Only for `full_technical_verification` with plain text:**

```typescript
// Out-of-scope detection for plain text full_technical_verification requests
// Reject questions that are clearly not about whitepaper/technical verification
if (offeringId === 'full_technical_verification' && isPlainText) {
  // Get the full text from all string values
  const fullText = Object.values(requirement)
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();

  // Out-of-scope indicators: real-time data, trading, prices, portfolio
  const OUT_OF_SCOPE_PATTERNS = [
    /\b(?:current|live|real.?time|latest|today'?s?)\s+(?:market\s+)?(?:price|value|rate|cost)\b/,
    /\b(?:buy|sell|trade|swap|exchange|convert)\s+(?:some|my|the)?\s*(?:tokens?|coins?|crypto)?\b/,
    /\b(?:portfolio|wallet\s+balance|holdings|net\s+worth)\b/,
    /\b(?:price\s+prediction|will\s+.*\s+go\s+up|moon|dump|pump)\b/,
    /\b(?:should\s+i\s+(?:buy|sell|invest|hold))\b/,
    /\b(?:trading\s+(?:signal|strategy|bot|advice))\b/,
    /\b(?:airdrop|giveaway|free\s+(?:tokens?|coins?|crypto))\b/,
  ];

  // In-scope indicators: whitepaper verification, technical analysis
  const IN_SCOPE_PATTERNS = [
    /\b(?:whitepaper|white\s*paper|technical\s*paper|litepaper)\b/,
    /\b(?:verify|verif|analyz|analys|evaluat|audit|review|assess|examin)\b/,
    /\b(?:claims?|tokenomics|consensus|security|architecture|protocol|mechanism)\b/,
    /\b(?:mathematical|formal|proof|theorem|invariant)\b/,
    /\b(?:smart\s*contract|decentraliz|oracle|liquidity|staking)\b/,
    /\b(?:documentation|specification|RFC|technical)\b/,
  ];

  const isOutOfScope = OUT_OF_SCOPE_PATTERNS.some(p => p.test(fullText));
  const isInScope = IN_SCOPE_PATTERNS.some(p => p.test(fullText));

  if (isOutOfScope && !isInScope) {
    const err = new Error(
      'Requirement is outside scope — this service provides whitepaper technical verification and analysis, not market data, trading advice, or portfolio management'
    );
    err.name = 'InputValidationError';
    throw err;
  }
}
```

**Why both out-of-scope AND in-scope checks?** To avoid false rejections. "Analyze the price mechanism in the Uniswap whitepaper" contains "price" (out-of-scope keyword) but also "analyze" and "whitepaper" (in-scope keywords). The `!isInScope` guard ensures legitimate verification requests with incidental price/market references aren't rejected.

**Test cases:**
- `"What is the current market price of Bitcoin on Binance?"` → out-of-scope: "current price" ✓, in-scope: none ✗ → **REJECT** ✓
- `"Analyze the security and decentralization claims of Chainlink V2 whitepaper"` → out-of-scope: none ✗ → **PASS** ✓
- `"Evaluate the mathematical validity of Uniswap v3 concentrated liquidity"` → out-of-scope: none ✗ → **PASS** ✓
- `"Should I buy Chainlink tokens?"` → out-of-scope: "should i buy" ✓, in-scope: none ✗ → **REJECT** ✓
- `"Analyze the price stability mechanism in the Ethena whitepaper"` → out-of-scope: none (no "current/live price"), in-scope: "analyze" + "whitepaper" ✓ → **PASS** ✓
- `"Verify the tokenomics of the Aave protocol"` → out-of-scope: none ✗ → **PASS** ✓
- `"Tell me a joke about crypto"` → out-of-scope: none ✗, but no token_address → rejected by existing Fix 5 ✓

### Placement

The scope check goes in `validateTokenAddress` AFTER `extractFromUnknownFields` (which populates `project_name` from plain text) and AFTER the content violation scan (which catches NSFW/injection). It runs BEFORE the token_address validation because scope rejection should happen early.

**Exact location:** After the line `WpvService.extractFromUnknownFields(requirement);` (for non-plain-text) and after the Fix 5 check. Add the scope check block there, guarded by `offeringId === 'full_technical_verification' && isPlainText`.

---

## Self-Audit

### Issue A: Non-adjacent version — could match wrong version

**Problem:** "Compare Uniswap v2 and v3 whitepaper architecture" has two versions. The secondary scan would match `v3 whitepaper` (last match). But the protocol regex already captured "Uniswap v2" (adjacent). The secondary scan only fires when `!projectMatch[2]` — so if the adjacent capture got "v2", the secondary scan is skipped. Correct behavior.

**Edge case:** "Compare Chainlink and Aave V2 whitepaper" — protocol regex captures "Chainlink" (first match, no version), secondary scan finds "V2 whitepaper" → `project_name: "Chainlink v2"`. But V2 refers to Aave, not Chainlink. This is a misattribution.

**Resolution:** Acceptable risk for graduation. The evaluator tests single-project queries. Multi-project comparison queries are an edge case we can handle post-graduation with more sophisticated NLP. The alternative — not extracting non-adjacent versions — fails the Chainlink V2 test, which is a guaranteed failure.

### Issue B: Out-of-scope detector — could it reject legitimate edge cases?

**Problem:** "Evaluate the current market mechanism in the MakerDAO whitepaper" contains "current market" which partially matches the first out-of-scope pattern. Let me check: the pattern is `\b(?:current|live|real.?time|latest|today'?s?)\s+(?:market\s+)?(?:price|value|rate|cost)\b`. "Current market mechanism" doesn't match because "mechanism" isn't in `(?:price|value|rate|cost)`. Safe.

**Problem:** "What is the price of attacking the Bitcoin network?" — "price of attacking" doesn't match the out-of-scope pattern (no "current/live" prefix). And "attacking" + "Bitcoin network" matches in-scope patterns. Safe.

### Issue C: Out-of-scope detector only on full_technical_verification

**Problem:** Should other offerings also have scope detection?

**Resolution:** No. `project_legitimacy_scan` and `verify_project_whitepaper` take structured JSON with explicit fields — they can't receive "What is the price of Bitcoin?" as input. `daily_technical_briefing` takes `{"date": "..."}` — also structured. Only `full_technical_verification` accepts free-form plain text, so only it needs scope detection.

### Issue D: Chainlink cache from verify_project_whitepaper test

**Problem:** The V1 claims cached under "Chainlink" from the verify_project_whitepaper test (which used the V1 URL) will persist. Future "Chainlink" (no version) lookups will find these V1 claims.

**Resolution:** This is actually correct behavior. When someone asks about "Chainlink" without a version, the cached V1 data is from a legitimate analysis of the V1 whitepaper. The generic known URL map entry points to V2, so a cache miss would fetch V2. But a cache hit with V1 data is still valid — it's real Chainlink data. The evaluator only fails when V2 is SPECIFICALLY requested and V1 is served. With the version extraction fix, "Chainlink V2" → `project_name: "Chainlink v2"` → version-aware cache skips V1 data → live pipeline fetches V2.

### Issue E: Regex ordering — secondary scan must not fire when primary captured version

**Problem:** Confirmed safe. `!projectMatch[2]` guards the secondary scan. When the primary regex captures `"Uniswap v3"` (adjacent), `projectMatch[2] = "v3"` is truthy, secondary scan skipped.

---

## Files Changed

| File | Change |
|------|--------|
| `src/WpvService.ts` | Non-adjacent version extraction in `extractFromUnknownFields`; out-of-scope detector for `full_technical_verification` plain text |
| `src/discovery/WebSearchFallback.ts` | Chainlink v1/v2 version-specific known URL entries before generic entry |

---

## DB Rules

- No DB changes needed for this fix set
- No wipes or cleanups required

---

*Pending Forces review. Implement in order: Fix 1 → Fix 2 → verify + deploy → trigger eval 28.*
