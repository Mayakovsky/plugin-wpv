# Kovsky Execution Plan — Eval 35 Infrastructure Fixes (v3)

> **Source:** Forces v1 → Kovsky v2 review → Forces v3 (AbortController restored)
> **Date:** 2026-04-09
> **Goal:** Fix the pipeline, not the score. Build infrastructure that handles any input correctly.
> **Scope:** 9 fixes across 2 repos. AbortController threading restored from v1 — orphaned Playwright renders on a 2GB VPS hold the _renderLock mutex for up to 30s, blocking the next job's Playwright call. This cascading delay caused EXPIRED failures in prior evals.

---

## Architecture Review — What's Broken and Why

The three eval 35 failures expose systemic gaps, not edge cases:

**Layer 1 (Input Parsing):** AcpService's plain-text parser uses a single regex that fails on digits in names and captures text after the address instead of before. The KNOWN_PROTOCOL_PATTERN fallback only runs when NO address is found — the exact opposite of when it's needed most.

**Layer 2 (Name Resolution):** When AcpService produces "Unknown", all three JobRouter handlers treat it as a valid name and skip DexScreener resolution. "Unknown" is truthy in JavaScript.

**Layer 3 (Content Resolution):** CryptoContentResolver correctly detects SPAs and routes to Playwright. But Playwright's RAM threshold (250MB) is too high for the 2GB VPS, so SPAs silently fall back to 17-char shell content. No component short-circuits — the 17-char text flows through L1, L2 (wasting a Sonnet call), and L3 before producing 0 claims.

**Layer 4 (Handler Fallback):** The verify handler's discovery fallback runs inside the pipeline timeout. When the initial SPA fetch + enhanced resolution consumes most of the timeout budget, the fallback gets cut off. The discovered URL (aerodrome.finance/docs) is ALSO a SPA, doubling the problem.

**Layer 5 (Protocol Coverage):** Three separate protocol lists (AcpService, WpvService, WebSearchFallback) drift independently. WebSearchFallback has Aerodrome pointing to an SPA-only URL. No PDF fallback exists.

---

## The 9 Fixes

| # | Fix | Layer | File(s) | Impact |
|---|-----|-------|---------|--------|
| 1 | Plain-text parser rewrite | Input | AcpService.ts | Correct project name extraction for ALL plain-text patterns |
| 2 | "Unknown" → resolveTokenName | Name Resolution | JobRouter.ts | DexScreener fallback when parser fails |
| 3 | KNOWN_PROTOCOL_PATTERN sync | Coverage | New shared file + WpvService.ts | Single source of truth for protocol names |
| 4 | ClaimExtractor minimum text threshold | Content | ClaimExtractor.ts | Skip Sonnet when text is too short for extraction |
| 5 | CryptoContentResolver early SPA signal | Content | CryptoContentResolver.ts | Signal handlers to skip pipeline when SPA + no Playwright |
| 6 | Verify handler: SPA early bailout → discovery | Handler | JobRouter.ts | Don't waste timeout on unresolvable document_url |
| 7 | Playwright RAM threshold 250→200MB | Resource | HeadlessBrowserResolver.ts | Enable Playwright on 2GB VPS |
| 8 | AbortController threading through pipeline | Resource | JobRouter.ts, CryptoContentResolver.ts, HeadlessBrowserResolver.ts, FetchContentResolver.ts | Clean cancellation on timeout — prevents orphaned Playwright from blocking next job |
| 9 | Known URL audit — SPA→PDF alternatives | Coverage | WebSearchFallback.ts | PDF fallbacks for SPA-only protocols |

---

## Fix 1: AcpService Plain-Text Parser Rewrite

### The Problem

Current parser (line 530):
```typescript
const nameMatch = raw.match(/(?:for|verify|evaluate|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s*\(|\s*\.|\s*Token|\s*,|\s*'s)/i);
```

Two bugs:
- **No digits:** `[a-zA-Z\s]` excludes `3` in "Uniswap v3" → capture fails → "Unknown"
- **Positional:** `for` matches after the address in "Analyze X (0x...) for Y" → captures "Y" instead of "X"

The KNOWN_PROTOCOL_PATTERN at line 541 would catch both cases, but it only runs inside an `else` branch (when no EVM address found). When an address IS found, it never fires.

### The Fix

**File:** `plugin-acp/src/AcpService.ts` — `parseRequirement()` method

Rewrite the EVM address branch (lines 528-538) with a three-stage extraction:

```typescript
// Plain text with EVM address detected
const evmMatch = raw.match(/\b(0x[0-9a-fA-F]{10,42})\b/);
if (evmMatch) {
  let projectName: string | undefined;

  // Stage 1: KNOWN_PROTOCOL_PATTERN — always try first, regardless of address.
  // This catches "Uniswap v3", "Aerodrome Finance", "Aave V3", etc.
  const protocolMatch = raw.match(KNOWN_PROTOCOL_PATTERN);
  if (protocolMatch) {
    projectName = protocolMatch[0].trim();
  }

  // Stage 2: Structural extraction — last capitalized noun phrase before the address.
  // "Analyze Aerodrome Finance (0x940...)" → "Aerodrome Finance"
  // "Run full L1+L2+L3 pipeline for Virtuals Protocol (0x0b3e...)" → "Virtuals Protocol"
  if (!projectName) {
    const addrPos = raw.search(/[\(\[]\s*0x[0-9a-fA-F]/);
    if (addrPos > 0) {
      const before = raw.slice(0, addrPos).trim();
      const phrases = [...before.matchAll(
        /(?!(?:Verify|Analyze|Evaluate|Run|Check|Audit|Scan|Review|Perform|Do|Please|The|This|Assess|Inspect|Confirm|Determine|Test)\b)[A-Z][a-zA-Z0-9]*(?:\s+(?:v\d+|V\d+|[A-Z][a-zA-Z0-9]*|Finance|Protocol|Labs|Network|DAO|Exchange|Chain|Token|Bridge))*\b/g
      )];
      if (phrases.length > 0) {
        const last = phrases[phrases.length - 1][0].trim();
        if (last.length >= 2) {
          projectName = last;
        }
      }
    }
  }

  // Stage 3: Generic name regex — matches "Verify X for Y" patterns.
  // Allows digits for version numbers. Only matches BEFORE common delimiters.
  if (!projectName) {
    const nameMatch = raw.match(/(?:verify|evaluate|analyze|audit|check|review|scan)\s+([A-Z][a-zA-Z0-9\s.]+?)(?:\s*[\(\[\{]|\s*for\s|\s*,|\s*\.(?:\s|$)|\s*Token)/i);
    if (nameMatch) {
      projectName = nameMatch[1].trim();
    }
  }

  return {
    requirement: {
      token_address: evmMatch[1],
      project_name: projectName ?? 'Unknown',
      raw_instruction: raw,
    },
    isPlainText: true,
  };
}
```

**KNOWN_PROTOCOL_PATTERN in AcpService:** Move to a module-level constant. Use a raw regex string (not the builder from plugin-wpv) to keep plugin-acp simple and dependency-free:

```typescript
// SYNC: This pattern must match plugin-wpv/src/constants/protocols.ts KNOWN_PROTOCOL_NAMES.
// Update BOTH files when adding or removing protocols.
const KNOWN_PROTOCOL_PATTERN = /\b(Uniswap|Aave|Compound|MakerDAO|Maker|Curve|Synthetix|SushiSwap|Sushi|Balancer|Yearn|Chainlink|Lido|Rocket\s*Pool|Frax|Convex|Euler|Morpho|Radiant|Pendle|GMX|dYdX|Aerodrome|Jupiter|Raydium|1inch|Pancake\s*Swap|Trader\s*Joe|Camelot|Ethena|USDe|Hyperliquid|EigenLayer|Eigen\s*Layer|Bitcoin|Ethereum|Solana|Cardano|Polkadot|Avalanche|Cosmos|Arbitrum|Optimism|Base|Polygon|zkSync|Starknet|Scroll|Linea|Blast|Manta|Mode|Near|Algorand|Aptos|Sui|Sei|Celestia|Mantle|Toncoin|Tron|Hedera|Fantom|Stellar|XRP|Litecoin|Monero|Filecoin|Internet\s*Computer|Kaspa|Injective|Stargate|LayerZero|Layer\s*Zero|Wormhole|Across|Hop\s*Protocol|The\s*Graph|Arweave|Akash|Render|Pyth|API3|Jito|Drift|Orca|Marinade|Seamless|Virtuals\s*Protocol|Pepe|Shiba|Dogecoin|Floki|Bonk)\s*(v\d+)?\b/i;
```

The **`else` branch** (no address found, line 541) uses the same constant — no duplication within AcpService.

### Test Cases

| Input | Stage | Result |
|-------|-------|--------|
| `"Verify Uniswap v3 (0x1f98...) for claim consistency"` | 1 | "Uniswap v3" |
| `"Analyze Aerodrome Finance (0x940...) for mathematical validity"` | 1 | "Aerodrome" |
| `"Run full L1+L2+L3 pipeline for Virtuals Protocol (0x0b3e...)"` | 1 | "Virtuals Protocol" |
| `"Check NewDeFiToken (0xabc...) for whitepaper claims"` | 2 | "NewDeFiToken" |
| `"Verify the Aave V3 protocol (0xabc...)"` | 1 | "Aave V3" |
| `"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"` | all fail | "Unknown" → Fix 2 catches via DexScreener |
| `"Check Bitcoin (0xabc...)"` | 1 | "Bitcoin" |

**Known limitation:** Unknown protocols starting with "The" (e.g., "The Graph") — Stage 2's negative lookahead skips "The". Stage 1 (KNOWN_PROTOCOL_PATTERN) handles this for known protocols. For unknown protocols, Fix 2 (DexScreener) is the safety net.

---

## Fix 2: "Unknown" → resolveTokenName Defense-in-Depth

### The Problem

All three handlers check `if (!reqName && ...)` before calling resolveTokenName. But "Unknown" is truthy in JavaScript — the check passes, resolveTokenName is skipped.

### The Fix

**File:** `src/acp/JobRouter.ts` — all three handlers

**handleFullVerification:**
```typescript
// Current:
if (!reqName && (reqAddr || originalAddr)) {
// Fix:
if ((!reqName || reqName === 'Unknown') && (reqAddr || originalAddr)) {
```

**handleVerifyWhitepaper:**
```typescript
// Current:
if (!projectName && (requestedTokenAddress || originalTokenAddress)) {
// Fix:
if ((!projectName || projectName === 'Unknown') && (requestedTokenAddress || originalTokenAddress)) {
```

**handleLegitimacyScan:**
```typescript
// Current:
if (!projectName && (tokenAddress || originalTokenAddress)) {
// Fix:
if ((!projectName || projectName === 'Unknown') && (tokenAddress || originalTokenAddress)) {
```

**Also remove `projectName !== 'Unknown'` guards on discovery fallbacks.** Two locations gate discovery on the project name not being "Unknown". Remove these guards — discovery with "Unknown" + a valid address can still resolve the name via DexScreener → known URL map:

**Verify handler discovery fallback (~line 566):**
```typescript
// Current:
if (claims.length === 0 && this.deps.tieredDiscovery && projectName !== 'Unknown') {
// Fix:
if (claims.length === 0 && this.deps.tieredDiscovery) {
```

**Full_tech handler discovery fallback (~line 942):**
Same change — remove the `projectName !== 'Unknown'` guard.

---

## Fix 3: KNOWN_PROTOCOL_PATTERN Synchronization

### The Problem

Three separate protocol lists that drift apart:
- **AcpService** (line 541): Used for plain-text name extraction
- **WpvService** (line 35): Used for known-protocol gate in soft-strip
- **WebSearchFallback** (KNOWN_WHITEPAPER_URLS): Used for document discovery

### The Fix

**Create a shared constant file** in plugin-wpv:

**New file:** `src/constants/protocols.ts`

```typescript
/**
 * Canonical list of known crypto protocols.
 * Used by: WpvService (known-protocol gate), WebSearchFallback (URL map).
 * AcpService (plugin-acp) maintains a synced inline copy — see SYNC comment there.
 *
 * When adding a new protocol:
 * 1. Add the name here
 * 2. Add the name to plugin-acp/src/AcpService.ts KNOWN_PROTOCOL_PATTERN (SYNC comment)
 * 3. Add a KNOWN_WHITEPAPER_URL entry in WebSearchFallback.ts
 * 4. Rebuild and deploy both repos
 */
export const KNOWN_PROTOCOL_NAMES: string[] = [
  // ── DeFi Protocols ──
  'Uniswap', 'Aave', 'Compound', 'MakerDAO', 'Maker', 'Curve', 'Synthetix',
  'SushiSwap', 'Sushi', 'Balancer', 'Yearn', 'Chainlink', 'Lido',
  'Rocket Pool', 'Frax', 'Convex', 'Euler', 'Morpho', 'Radiant', 'Pendle',
  'GMX', 'dYdX', 'Aerodrome', 'Jupiter', 'Raydium', '1inch',
  'PancakeSwap', 'Pancake Swap', 'Trader Joe', 'Camelot', 'Ethena', 'USDe',
  'Hyperliquid', 'EigenLayer', 'Eigen Layer', 'Stargate',
  'Jito', 'Drift', 'Orca', 'Marinade', 'Seamless',
  // ── Infrastructure / Oracles ──
  'LayerZero', 'Layer Zero', 'Wormhole', 'Across', 'Hop Protocol',
  'The Graph', 'Arweave', 'Akash', 'Render', 'Pyth', 'API3',
  // ── L1/L2 Chains ──
  'Bitcoin', 'Ethereum', 'Solana', 'Cardano', 'Polkadot', 'Avalanche',
  'Cosmos', 'Arbitrum', 'Optimism', 'Base', 'Polygon', 'zkSync',
  'Starknet', 'Scroll', 'Linea', 'Blast', 'Manta', 'Mode',
  'Near', 'Algorand', 'Aptos', 'Sui', 'Sei', 'Celestia', 'Mantle',
  'Toncoin', 'Tron', 'Hedera', 'Fantom', 'Stellar', 'XRP', 'Litecoin',
  'Monero', 'Filecoin', 'Internet Computer', 'Kaspa', 'Injective',
  // ── Agent Platforms ──
  'Virtuals Protocol',
  // ── Meme (evaluator tests these) ──
  'Pepe', 'Shiba', 'Dogecoin', 'Floki', 'Bonk',
];

/**
 * Build a regex pattern from the protocol list.
 * Handles multi-word names (spaces → \s*) and appends optional version suffix.
 */
export function buildProtocolPattern(names: string[]): RegExp {
  const escaped = names.map(n =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // escape regex chars
     .replace(/\s+/g, '\\s*')                   // spaces → flexible whitespace
  );
  return new RegExp(`\\b(${escaped.join('|')})\\s*(v\\d+)?\\b`, 'i');
}

export const KNOWN_PROTOCOL_PATTERN = buildProtocolPattern(KNOWN_PROTOCOL_NAMES);
```

**Update consumers:**

- `WpvService.ts`: Replace the inline `KNOWN_PROTOCOL_PATTERN` constant (line 35) with `import { KNOWN_PROTOCOL_PATTERN } from './constants/protocols';`
- `AcpService.ts` (plugin-acp): **Inline raw regex** with `// SYNC:` comment (see Fix 1). Does NOT import from plugin-wpv — the dependency goes the other direction.
- `WebSearchFallback.ts`: No regex change needed. New protocols added to the shared list should also get a KNOWN_WHITEPAPER_URLS entry.

---

## Fix 4: ClaimExtractor Minimum Text Threshold

### The Problem

`ClaimExtractor.extractClaims()` calls Sonnet with ANY amount of text, including 17-char SPA shells. A 17-char input wastes ~1600 Sonnet tokens ($0.007) and returns 0 claims.

### Why ClaimExtractor, Not runL1L2

Putting the threshold in `runL1L2` would require returning a fake `wp: { id: 'thin-...' }`. Handlers call `verificationsRepo.create({ whitepaperId: wp.id })` after `runL1L2` returns — a temp ID causes a foreign key constraint violation.

In ClaimExtractor:
1. `runL1L2` still creates a real whitepaper in the DB (with 0 claims)
2. L1 structural analysis still runs (fast, no API call)
3. Only the Sonnet API call is skipped
4. The caller receives a valid `wp.id` — no FK issues
5. The 0-claims discovery fallback triggers normally

### The Fix

**File:** `src/verification/ClaimExtractor.ts` — `extractClaims()` method

After the existing empty-text check (line 119), add:

```typescript
if (!text || text.trim().length === 0) return [];

// Minimum text threshold — SPA shells, empty pages, and image-only PDFs
// don't have enough text for meaningful claim extraction.
const MIN_TEXT_FOR_EXTRACTION = 200;
if (text.trim().length < MIN_TEXT_FOR_EXTRACTION) {
  log.info('Text too short for claim extraction — skipping Sonnet call', {
    textLength: text.trim().length,
    threshold: MIN_TEXT_FOR_EXTRACTION,
    projectName,
  });
  return [];
}
```

This saves API cost and returns immediately from L2, letting `runL1L2` complete quickly (< 1s for thin content). The handler's 0-claims discovery fallback then has the full timeout budget.

---

## Fix 5: CryptoContentResolver Early SPA Signal

### Priority Note

Fix 4 already solves the Sonnet waste problem (200-char threshold). Fix 5 is additive — it returns empty text instead of garbage SPA shell, preventing L1 structural analysis on meaningless content, and provides diagnostic logging. Low risk, small scope.

### The Fix

**File:** `src/discovery/CryptoContentResolver.ts` — `enhancedResolve()` method

Currently at line 161-168, when SPA is detected but Playwright returns null, `enhancedResolve` returns `null`. Change to return a diagnostic result:

```typescript
if (isSpaDetected) {
  const rendered = await this.headlessBrowser.resolve(originalUrl);
  if (rendered) return rendered;
  // Playwright failed (RAM, timeout, crash) — signal this upstream
  log.warn('SPA detected but Playwright failed — content will be thin', { url: originalUrl });
  return {
    text: '',
    contentType: 'text/html',
    source: 'spa-unresolvable',
    resolvedUrl: originalUrl,
    diagnostics: ['SPA_DETECTED', 'PLAYWRIGHT_FAILED'],
  };
}
```

Returning empty text (instead of the 17-char shell) ensures Fix 4's threshold triggers immediately. The existing calling code at lines 98-119 handles this correctly — `enhanced.text.length >= 200` check (line 103) fails for empty text, so DocsSiteCrawler is skipped, and the empty result flows through to `buildResult`.

**Also handle `source: 'spa-unresolvable'` in `mapSource()`** if that method has a fixed union type — map it to `'headless'` or add it to the union.

---

## Fix 6: Verify Handler Discovery Fallback

### The Problem

The verify handler's document_url path calls `runL1L2(documentUrl, ...)`. With Fix 4, thin content returns 0 claims quickly. The handler then tries discovery fallback. But if the discovered URL is ALSO a SPA, it also returns 0 claims.

### The Fix

**No code changes needed beyond Fix 2's guard removal.** Once:
- Fix 2 removes the `projectName !== 'Unknown'` guard on discovery fallbacks
- Fix 4 makes thin-content pipeline return instantly (not burn 4 minutes)
- Fix 9 updates the known URL for Aerodrome to a resolvable source

...the existing verify handler discovery fallback works correctly. The SPA URL produces 0 claims instantly, the discovery fallback fires with the full timeout budget, and discovers a resolvable document.

**Do NOT add `webSearchFallback` to `JobRouterDeps`** — it leaks discovery internals into the routing layer. The existing `TieredDocumentDiscovery` already calls `WebSearchFallback` internally.

---

## Fix 7: Playwright RAM Threshold 250→200MB

### The Fix

**File:** `src/discovery/HeadlessBrowserResolver.ts`

```typescript
// Current:
const MIN_FREE_RAM_BYTES = 250 * 1024 * 1024;
// Fix:
const MIN_FREE_RAM_BYTES = 200 * 1024 * 1024;
```

Also update the log message if it hardcodes `requiredMB: 250` — use the constant instead:
```typescript
log.warn('Insufficient free RAM for headless browser', {
  freeRamMB: Math.round(freeRam / 1024 / 1024),
  requiredMB: Math.round(MIN_FREE_RAM_BYTES / 1024 / 1024),
});
```

**Safety analysis:** Playwright single-page render uses ~150MB. With 200MB free, there's a 50MB buffer. The `_renderLock` mutex prevents concurrent renders. OOM risk is minimal — Linux uses swap before OOM-killing (Lightsail instances have swap configured).

---

## Fix 8: Known URL Audit — SPA→PDF Alternatives

### The Problem

WebSearchFallback has `[/\baerodrome\b/i, 'https://aerodrome.finance/docs']`. This URL is a JavaScript SPA — it returns 17 chars without Playwright. Even with Playwright, docs sites yield fragmented content from sub-page crawling, not a coherent whitepaper.

### The Fix

**File:** `src/discovery/WebSearchFallback.ts`

Audit ALL known URLs for SPA content. During implementation, run this check:

```bash
# Audit known URLs — which return < 500 chars (SPA/thin content)?
for url in \
  "https://aerodrome.finance/docs" \
  "https://docs.uniswap.org/contracts/v4/overview" \
  "https://docs.synthetix.io/synthetix-protocol/the-synthetix-protocol/synthetix-litepaper" \
  "https://gmxio.gitbook.io/gmx/overview" \
  "https://docs.frax.finance" \
  "https://station.jup.ag/docs" \
  "https://docs.raydium.io" \
  "https://docs.sushi.com" \
  "https://docs.pancakeswap.finance" \
  "https://ethena-labs.gitbook.io/ethena-labs/solution-overview/usde-overview" \
  "https://docs.balancer.fi" \
  "https://docs.seamlessprotocol.com" \
  "https://docs.pyth.network" \
  "https://docs.wormhole.com/wormhole"; do
  chars=$(curl -sL --max-time 10 "$url" | sed 's/<[^>]*>//g' | tr -s '[:space:]' | wc -c)
  echo "$chars chars — $url"
done
```

For each URL returning < 500 chars, search for a PDF alternative:
```bash
curl -s "https://html.duckduckgo.com/html/?q=aerodrome+finance+whitepaper+filetype:pdf" | grep -oP 'href="[^"]*\.pdf[^"]*"' | head -5
```

**For Aerodrome specifically:** Check for GitHub docs repo with raw markdown, a PDF whitepaper, or any static-rendered alternative. If no PDF exists, keep the SPA URL — Fixes 4, 5, and 7 handle the SPA path.

Update the known URL map with PDFs where available.

---

## Execution Order

1. **Fix 3** — Create `src/constants/protocols.ts` shared protocol list. Update import in WpvService.ts.
2. **Fix 1** — AcpService parser rewrite. Add inline KNOWN_PROTOCOL_PATTERN with SYNC comment.
3. **Fix 2** — "Unknown" → resolveTokenName in all handlers. Remove `!== 'Unknown'` guards on discovery fallbacks.
4. **Fix 4** — ClaimExtractor minimum text threshold (200 chars).
5. **Fix 5** — CryptoContentResolver SPA early signal (`PLAYWRIGHT_FAILED` diagnostic).
6. **Fix 7** — Playwright RAM threshold 250→200MB.
7. **Fix 8** — AbortController threading through pipeline.
8. **Fix 9** — Known URL audit. Run the SPA check, update URLs.
9. **Fix 6** — Verify handler discovery fallback (validates naturally — no code changes beyond Fix 2).
10. **Build both repos → test (309+) → deploy → PM2 restart → verify.**

---

## Verification Plan

### Test Fix 1+2: Plain-text project name extraction

```bash
# Uniswap v3 with digits — should extract "Uniswap v3"
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-uni-v3","offering_id":"full_technical_verification","arguments":"Verify Uniswap v3 (0x1f9840a85d5af5bf1d1762f925bdaddc4201f984) for claim-by-claim consistency."}' | jq '.projectName, .verdict, .claimCount'
# Expected: "Uniswap" or "Uniswap v3", claims > 0

# Aerodrome with positional ambiguity
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-aero-pt","offering_id":"full_technical_verification","arguments":"Analyze Aerodrome Finance (0x940181a94a35a4569e4529a3cdfb74e38fd98631) for mathematical validity of its ve(3,3) tokenomics."}' | jq '.projectName, .verdict, .claimCount'
# Expected: "Aerodrome Finance" or "Aerodrome"

# Address only — should resolve via DexScreener (Fix 2)
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-addr-only","offering_id":"full_technical_verification","arguments":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}' | jq '.projectName, .verdict'
# Expected: "Uniswap" (via DexScreener), not "Unknown"
```

### Test Fix 4+5: Minimum text threshold + SPA signal

```bash
# Aerodrome whitepaper (SPA) — should not waste 4 minutes
time curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-spa","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Aerodrome Finance","token_address":"0x940181a94A35A4569E4529A3CDfB74e38FD98631","document_url":"https://aerodrome.finance/whitepaper"}}' | jq '.verdict, .claimCount, .projectName'
# Expected: Either claims > 0 (Playwright worked) or response in < 60s (not 4 min)
```

### Test Fix 7: Playwright RAM

```bash
# Check PM2 logs for Playwright status after deployment
pm2 logs grey --lines 50 | grep -i "playwright\|headless\|RAM\|freeRam\|rendered"
# Expected: No "Insufficient free RAM" at 200MB threshold, or fewer occurrences
```

### Regression tests

```bash
# Structured JSON — should still work
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-scan","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Uniswap","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}}' | jq '.verdict, .tokenAddress'

curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-verify","offering_id":"verify_project_whitepaper","arguments":{"project_name":"Uniswap","document_url":"https://uniswap.org/whitepaper-v3.pdf"}}' | jq '.verdict, .claimCount'

curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-briefing","offering_id":"daily_technical_briefing","arguments":{}}' | jq '.totalVerified'

# Empty {} — should reject
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-empty","offering_id":"full_technical_verification","arguments":{}}' | jq '.'

# NSFW name — should reject
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-nsfw","offering_id":"project_legitimacy_scan","arguments":{"project_name":"ExplicitContentToken","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}}' | jq '.'
```

---

## Deploy Notes

**plugin-acp (PRIVATE repo — SCP):**
```bash
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19 "export PATH=\$HOME/.bun/bin:\$PATH && cd /opt/grey/plugin-acp && bun run build"
# dist is SYMLINKED — no copy needed
```

**plugin-wpv (public repo — git pull):**
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19 "export PATH=\$HOME/.bun/bin:\$PATH && cd /opt/grey/plugin-wpv && git pull && bun install && bun run build && cd /opt/grey/wpv-agent && bun run build && pm2 restart grey"
```

**After restart:** Wait for "Registered 4 offering handlers". Run verification plan.

---

## Files Changed

| File | Repo | Fixes |
|------|------|-------|
| `src/constants/protocols.ts` | plugin-wpv | **NEW** — Fix 3: shared protocol list + builder |
| `src/AcpService.ts` | plugin-acp | Fix 1: plain-text parser rewrite, inline KNOWN_PROTOCOL_PATTERN |
| `src/acp/JobRouter.ts` | plugin-wpv | Fix 2: "Unknown" fallback, discovery guard removal |
| `src/verification/ClaimExtractor.ts` | plugin-wpv | Fix 4: min text threshold (200 chars) |
| `src/discovery/CryptoContentResolver.ts` | plugin-wpv | Fix 5: SPA early signal (`PLAYWRIGHT_FAILED` diagnostic) |
| `src/discovery/HeadlessBrowserResolver.ts` | plugin-wpv | Fix 7: RAM 250→200MB, Fix 8: AbortSignal check |
| `src/discovery/FetchContentResolver.ts` | plugin-wpv | Fix 8: AbortSignal on fetch |
| `src/discovery/WebSearchFallback.ts` | plugin-wpv | Fix 9: SPA→PDF URL audit |
| `src/WpvService.ts` | plugin-wpv | Fix 3: import shared KNOWN_PROTOCOL_PATTERN |

---

## Fix 8: AbortController Threading Through Pipeline

### The Problem

The current `withTimeout` uses `Promise.race`. When the timeout fires, the underlying operation (fetch, Playwright render) continues running in the background. On a 2GB VPS, an orphaned Playwright render holds the `_renderLock` mutex for up to 30s. The next job's Playwright call blocks on that lock, adding 30s of latency. In an eval with multiple SPA-dependent jobs queued, this cascading delay caused EXPIRED failures.

### The Fix

**File:** `src/acp/JobRouter.ts` — `withTimeout()` and `runL1L2()`

Replace the current `Promise.race` with an `AbortController`:

```typescript
private async withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
  try {
    const result = await fn(signal);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    if (signal.aborted) {
      throw new Error('Pipeline timeout');
    }
    throw err;
  }
}
```

Update `runL1L2` signature to accept and thread the signal:
```typescript
private async runL1L2(
  documentUrl: string,
  projectName: string,
  tokenAddress: string | null | undefined,
  requirementText: string | null | undefined,
  costTracker: CostTracker,
  signal?: AbortSignal,
)
```

Pass `signal` to `cryptoResolver.resolveWhitepaper()`.

**File:** `src/discovery/CryptoContentResolver.ts`

Add optional `signal` parameter to `resolveWhitepaper()` and `enhancedResolve()`. Thread through to:
- `this.contentResolver.resolve(resolvedUrl, signal)` — FetchContentResolver
- `this.headlessBrowser.resolve(originalUrl, signal)` — HeadlessBrowserResolver
- `this.docsCrawler.crawl(url, landingPageText, signal)` — DocsSiteCrawler sub-page fetches

**File:** `src/discovery/FetchContentResolver.ts`

Combine pipeline signal with per-request timeout using `AbortSignal.any()`:
```typescript
async resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent> {
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const response = await fetch(url, {
    headers: { ... },
    signal: combinedSignal,
    redirect: 'follow',
  });
  // ...
}
```

**Kov: Verify** that Bun supports `AbortSignal.any()` (added in Bun 1.0+). If not, create a manual combiner:
```typescript
function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); return controller.signal; }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
```

**File:** `src/discovery/HeadlessBrowserResolver.ts`

Check signal before launching Playwright and after page navigation:
```typescript
async resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent | null> {
  if (signal?.aborted) return null;
  // ... existing code ...
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (signal?.aborted) {
    await page.close();
    return null;
  }
  // ...
}
```

**Update IContentResolver interface** in `types.ts`:
```typescript
export interface IContentResolver {
  resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent>;
}
```

This is backwards-compatible — the parameter is optional.

**Callers:** Update all `withTimeout` call sites to pass the signal:
```typescript
return await this.withTimeout(async (signal) => {
  let { resolved, ... } = await this.runL1L2(documentUrl, projectName, requestedTokenAddress, requirementText, costTracker, signal);
  // ...
});
```

**Scope note:** Threading through ClaimExtractor (Sonnet API call) is not needed — Fix 4 already prevents the Sonnet call for thin content. The Anthropic SDK doesn't natively support AbortSignal. The main benefit is cancelling fetch and Playwright operations.

---

## DB Rules

- No DB schema changes
- After deployment: seed via live pipeline HTTP if DB has < 3 projects with claims > 0
- Clean garbage entries ("Unknown", 0-claim entries) before seeding
- **CRITICAL:** Never wipe/delete from wpv_claims, wpv_verifications, or wpv_whitepapers without explicit Forces approval

---

*Implement in order: Fix 3 (shared protocols) → Fix 1 (parser) → Fix 2 (Unknown fallback) → Fix 4 (min text) → Fix 5 (SPA signal) → Fix 7 (RAM) → Fix 8 (AbortController) → Fix 9 (URL audit) → Fix 6 (verify — validates naturally) → build → test → deploy → verify.*
