# Kovsky Execution Plan — Pre-Eval 24 Hardening

> **Source:** Forces + Claude Opus context window
> **Date:** 2026-04-05
> **Goal:** Maximize pass rate on eval 24 by closing discovery gaps and tightening edge cases
> **Priority:** Ship before triggering eval 24

---

## Context

Eval 23 scored 13/18. All 5 failures were fixed and deployed. But the evaluator rotates projects and edge cases every run. The biggest systemic vulnerability is **discovery** — Grey can only find whitepapers for 5 protocols in the known URL map, and DuckDuckGo is unreliable for crypto whitepapers. Every discovery failure from eval 20-23 (MakerDAO, Lido, Chainlink, Aave) was the same class of bug: well-documented protocol, non-obvious whitepaper URL, DuckDuckGo can't find it.

This plan has 5 tasks ordered by impact. Tasks 1-3 are critical. Tasks 4-5 are hardening.

---

## Task 1: Expand KNOWN_WHITEPAPER_URLS Map (CRITICAL)

**File:** `src/discovery/WebSearchFallback.ts`

**What:** Add entries for every major protocol the evaluator might test. The known URL map is deterministic — no DuckDuckGo dependency, instant resolution, zero network latency.

**How:** Add the following entries to `KNOWN_WHITEPAPER_URLS`. **Kov must verify each URL returns actual content (not a redirect to homepage or 404) before adding.** Use `curl -sI <url>` to check status code and content-type. PDFs should return `application/pdf`. HTML docs pages are acceptable if they have substantive content.

### Verified URLs (confirmed via web search)

```typescript
// ── DeFi Protocols ──
[/\buniswap\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],
[/\bcurve\b/i, 'https://docs.curve.finance/assets/pdf/whitepaper_stableswap.pdf'],
[/\baave\b/i, 'https://raw.githubusercontent.com/aave/aave-v3-core/master/techpaper/Aave_V3_Technical_Paper.pdf'],
[/\bbalancer\b/i, 'https://balancer.fi/whitepaper.pdf'],
[/\beigenlayer\b|\beigen\s*layer\b/i, 'https://docs.eigenlayer.xyz/assets/files/EigenLayer_WhitePaper-88c47923ca0319870c611decd6e562ad.pdf'],
```

### URLs Kov Must Verify (search suggests these exist but exact URLs need confirmation)

```typescript
// ── DeFi (verify URLs) ──
[/\bdydx\b/i, '<VERIFY: check dydx.exchange or github for whitepaper PDF>'],
[/\bgmx\b/i, '<VERIFY: check gmx-io.gitbook.io or github>'],
[/\bfrax\b/i, '<VERIFY: check docs.frax.finance for technical paper>'],
[/\byearn\b/i, '<VERIFY: check docs.yearn.fi or github>'],
[/\bjupiter\b/i, '<VERIFY: check docs.jup.ag or station.jup.ag>'],
[/\braydium\b/i, '<VERIFY: check raydium.io/whitepaper or docs>'],
[/\bsushiswap\b|\bsushi\s*swap\b/i, '<VERIFY: check docs.sushi.com or github>'],
[/\bpancakeswap\b|\bpancake\s*swap\b/i, '<VERIFY: check docs.pancakeswap.finance>'],

// ── L1/L2 Chains (verify URLs) ──
[/\bcelestia\b/i, '<VERIFY: check celestia.org for whitepaper PDF>'],
[/\bpolkadot\b/i, '<VERIFY: check polkadot.com/whitepaper or github gavin wood>'],
[/\bavalanche\b/i, '<VERIFY: check avax.network or avalabs github>'],
[/\bnear\b/i, '<VERIFY: check near.org/papers or github>'],
[/\baptos\b/i, '<VERIFY: check aptoslabs.com/whitepaper>'],
[/\bsui\b/i, '<VERIFY: check sui.io/whitepaper or github MystenLabs>'],
[/\barbitrum\b/i, '<VERIFY: check github offchainlabs/nitro for technical paper>'],

// ── Infrastructure (verify URLs) ──
[/\blayerzero\b|\blayer\s*zero\b/i, '<VERIFY: check layerzero.network/whitepaper>'],
[/\bethena\b/i, '<VERIFY: check ethena-labs.gitbook.io>'],
[/\bwormhole\b/i, '<VERIFY: check wormhole.com/whitepaper>'],
```

### Verification Script

Run this on VPS or local to batch-verify URLs:

```bash
#!/bin/bash
URLS=(
  "https://uniswap.org/whitepaper-v3.pdf"
  "https://docs.curve.finance/assets/pdf/whitepaper_stableswap.pdf"
  "https://raw.githubusercontent.com/aave/aave-v3-core/master/techpaper/Aave_V3_Technical_Paper.pdf"
  "https://balancer.fi/whitepaper.pdf"
  "https://docs.eigenlayer.xyz/assets/files/EigenLayer_WhitePaper-88c47923ca0319870c611decd6e562ad.pdf"
)

for url in "${URLS[@]}"; do
  status=$(curl -sI -o /dev/null -w "%{http_code}" -L "$url" --max-time 10)
  echo "$status  $url"
done
```

Add only URLs that return 200. For "VERIFY" entries, search for the actual URL, confirm it returns content, then add.

### Regex Pattern Rules

- Use word boundaries (`\b`) to prevent substring collisions
- Match common variants: `EigenLayer` / `Eigen Layer`, `PancakeSwap` / `Pancake Swap`
- Case-insensitive flag `/i` on all patterns
- Test: make sure `"MarketMaker"` doesn't match `maker` (existing pattern handles this with `\bmakerdao\b|\bmaker\s*dao\b`)

### Target

Get the map to 20+ entries covering the top DeFi protocols and L1/L2 chains. This single change eliminates the most common class of eval failure.

---

## Task 2: Redirect-to-Homepage Detection (CRITICAL)

**File:** `src/discovery/FetchContentResolver.ts` (or wherever the initial HTTP fetch happens in the resolution chain)

**What:** When a URL redirects to a project's homepage (like Chainlink's `link.smartcontract.com/whitepaper` → `chain.link/`), detect this and trigger discovery fallback instead of trying to extract claims from a marketing page.

**How:**

1. After following redirects, compare the final URL's pathname to the original URL's pathname
2. If the final URL resolves to root (`/`, `/en`, `/en/`) and the original URL had a meaningful path (`/whitepaper`, `/docs/...`), flag as redirect-to-homepage
3. Also check: if the resolved content is < 1000 chars AND looks like a marketing page (contains nav bars, hero sections, footer links but no technical content), flag as thin content
4. When flagged: log a warning, return null/empty so the pipeline falls through to TieredDocumentDiscovery

**Detection heuristics:**

```typescript
function isHomepageRedirect(originalUrl: string, finalUrl: string): boolean {
  try {
    const orig = new URL(originalUrl);
    const final = new URL(finalUrl);
    
    // Same domain but path collapsed to root
    const rootPaths = ['/', '/en', '/en/', ''];
    if (orig.pathname.length > 5 && rootPaths.includes(final.pathname)) {
      return true;
    }
    
    // Different domain entirely (redirect to parent company site)
    if (orig.hostname !== final.hostname && rootPaths.includes(final.pathname)) {
      return true;
    }
    
    return false;
  } catch { return false; }
}
```

**Important:** This is already described in `Grey_Kovsky_Execution_ChainlinkPendle.md` — refer to that plan for the full context. This task is the implementation.

---

## Task 3: Pendle SPA Link-Following (IMPORTANT)

**File:** `src/discovery/HeadlessBrowserResolver.ts` (or the Playwright-based resolver)

**What:** When Playwright renders a page and gets < 1000 chars of navigation/index content, follow internal links to find the actual documentation content.

**How:**

1. After initial page render, check if content is < 1000 chars or looks like a table of contents
2. Extract all internal links from the rendered page
3. Score links by relevance: prioritize links containing keywords like `whitepaper`, `protocol`, `overview`, `introduction`, `architecture`, `tokenomics`, `mechanics`
4. Follow top 5 links, render each (10s timeout per page)
5. Concatenate content from all followed pages (cap at 50k chars total)
6. Return the concatenated content as the resolved document

**Bounds:**
- Max 5 subpages
- 10s timeout per subpage
- 50k chars total cap
- Only follow links on the same domain (no external links)
- Skip links to assets (images, CSS, JS files)

**This is already described in `Grey_Kovsky_Execution_ChainlinkPendle.md`** — refer to that plan for detailed architecture. This task is the implementation.

---

## Task 4: WebSearchFallback pickBestResult Improvements (HARDENING)

**File:** `src/discovery/WebSearchFallback.ts`

**What:** The `pickBestResult` method is too strict. It only matches PDFs in the first two passes, and the third pass requires both a docs-site URL AND the project name in the URL or title. This misses valid results.

**Changes:**

1. **Add pass for research subdomains:** Before the generic "any PDF" pass, add a check for URLs containing `research.`, `docs.`, `whitepaper.`, `papers.` in the hostname — these are high-quality sources even without `.pdf` extension

2. **Loosen the docs-site title matching:** In the third pass, don't require the project name in BOTH the URL and title. Matching in either one should be sufficient. Many DuckDuckGo results have generic titles like "Documentation" but the URL contains the project name.

3. **Add a fourth pass for GitBook:** Many crypto projects use GitBook. Add a pass that matches `gitbook.io` URLs even without the project name — GitBook is almost always project documentation.

```typescript
// New pass: research/docs subdomains (high quality, any content type)
for (const r of results) {
  const urlLower = r.url.toLowerCase();
  try {
    const hostname = new URL(r.url).hostname.toLowerCase();
    if (/^(research|docs|papers|whitepaper)\./.test(hostname) ||
        hostname.includes('gitbook.io')) {
      if (urlLower.includes(nameLower) || r.title.toLowerCase().includes(nameLower)) {
        return r.url;
      }
    }
  } catch { continue; }
}
```

---

## Task 5: Briefing Key Case Sensitivity (HARDENING)

**File:** `src/WpvService.ts` — in `validateTokenAddress`, the briefing key validation block

**What:** The briefing validator rejects unknown keys with exact match against `Set(['date'])`. If the evaluator sends `{"Date": "2026-04-05"}` (capital D), it'll be rejected. This is technically correct per schema, but the evaluator might consider it a usability failure.

**Forces decision: Option B (lenient).** Normalize all keys to lowercase before validation. `Date`, `DATE`, `dAtE` all resolve to `date`. More forgiving, fewer edge case failures, zero security implication.

**Implementation:**

```typescript
// Normalize keys to lowercase for comparison
const BRIEFING_ALLOWED_KEYS = new Set(['date']);
const normalizedRequirement: Record<string, unknown> = {};
for (const [key, value] of Object.entries(requirement)) {
  normalizedRequirement[key.toLowerCase()] = value;
}
const unknownKeys = Object.keys(normalizedRequirement).filter((k) => !BRIEFING_ALLOWED_KEYS.has(k));
// ... rest of validation uses normalizedRequirement
```

**Also propagate the normalized key:** If the original was `Date`, the downstream code expects `requirement.date` — so after normalization, set `requirement.date = normalizedRequirement.date` and delete the original cased key.

---

## Execution Order

1. **Task 1** (known URL map) — highest impact, lowest risk. Do this first.
2. **Task 4** (pickBestResult) — quick improvement, low risk. Do alongside Task 1.
3. **Task 5** (briefing key normalization) — quick, pending Forces decision on Option A vs B.
4. **Task 2** (redirect detection) — moderate complexity, already planned.
5. **Task 3** (SPA link-following) — most complex, already planned.

## After Implementation

1. Run full test suite: `bun run build && bun run test` — must be 303/303 + 59/59 + 13/13
2. Deploy to VPS: `git pull && bun install && bun run build && pm2 restart grey`
3. Spot-check: `curl http://44.243.254.19:3001` to verify Grey is responding
4. Update heartbeat with changes
5. Signal Forces: ready for eval 24

## DB Rules (reminder)

- **NO wipes** of `wpv_claims`, `wpv_verifications`, `wpv_whitepapers` without explicit Forces approval
- Clean only eval artifacts (null token_address, 0-claim entries from test runs)
- Current state: 77 whitepapers, 77 verifications, 337 claims

---

*Pending Forces review. Do not implement until approved.*
