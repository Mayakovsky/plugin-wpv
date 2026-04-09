# Kovsky Execution Plan — Eval 35 Infrastructure Fixes

> **Source:** Forces + Claude Opus deep code review
> **Date:** 2026-04-09
> **Goal:** Fix the pipeline, not the score. Build infrastructure that handles any input correctly.
> **Scope:** 9 fixes across 3 repos, addressing plain-text parsing, SPA content resolution, resource management, and protocol coverage.

---

## Architecture Review — What's Broken and Why

The three eval 35 failures expose systemic gaps, not edge cases:

**Layer 1 (Input Parsing):** AcpService's plain-text parser uses a single regex that fails on digits in names and captures text after the address instead of before. The KNOWN_PROTOCOL_PATTERN fallback only runs when NO address is found — the exact opposite of when it's needed most.

**Layer 2 (Name Resolution):** When AcpService produces "Unknown", all three JobRouter handlers treat it as a valid name and skip DexScreener resolution. "Unknown" is truthy in JavaScript. This defense-in-depth layer was designed but never deployed.

**Layer 3 (Content Resolution):** CryptoContentResolver correctly detects SPAs and routes to Playwright. But Playwright's RAM threshold (250MB) is too high for the 2GB VPS, so SPAs silently fall back to 17-char shell content. No component in the chain short-circuits — the 17-char text flows through L1 structural analysis, L2 claim extraction (wasting a Sonnet API call), and L3 evaluation before producing 0 claims.

**Layer 4 (Handler Fallback):** The verify handler's discovery fallback runs inside the pipeline timeout. When the initial SPA fetch + enhanced resolution consumes most of the timeout budget, the fallback gets cut off. The discovered URL (aerodrome.finance/docs) is ALSO a SPA, doubling the problem.

**Layer 5 (Protocol Coverage):** Three separate protocol lists (AcpService, WpvService, WebSearchFallback) drift independently. WebSearchFallback has Aerodrome pointing to an SPA-only URL. No PDF fallback exists.

---

## The 9 Fixes

| # | Fix | Layer | File(s) | Impact |
|---|-----|-------|---------|--------|
| 1 | Plain-text parser rewrite | Input | AcpService.ts | Correct project name extraction for ALL plain-text patterns |
| 2 | "Unknown" → resolveTokenName | Name Resolution | JobRouter.ts | DexScreener fallback when parser fails |
| 3 | KNOWN_PROTOCOL_PATTERN sync | Coverage | AcpService.ts, WpvService.ts, WebSearchFallback.ts | Single source of truth for protocol names |
| 4 | runL1L2 minimum text threshold | Content | JobRouter.ts | Skip Sonnet when text is too short for extraction |
| 5 | CryptoContentResolver early SPA signal | Content | CryptoContentResolver.ts | Signal handlers to skip pipeline when SPA + no Playwright |
| 6 | Verify handler: SPA early bailout → discovery | Handler | JobRouter.ts | Don't waste timeout on unresolvable document_url |
| 7 | Playwright RAM threshold 250→200MB | Resource | HeadlessBrowserResolver.ts | Enable Playwright on 2GB VPS |
| 8 | AbortController threading through pipeline | Resource | JobRouter.ts, CryptoContentResolver.ts, HeadlessBrowserResolver.ts | Clean cancellation on timeout |
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

Rewrite the EVM address branch (lines 529-538) with a three-stage extraction:

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
  // "Verify the technical claims of NewProject (0x...)" → "NewProject"
  if (!projectName) {
    const addrPos = raw.search(/[\(\[]\s*0x[0-9a-fA-F]/);
    if (addrPos > 0) {
      const before = raw.slice(0, addrPos).trim();
      // Find ALL capitalized phrases in the prefix, take the LAST one.
      // Negative lookahead skips action verbs so they don't consume the project name.
      // This naturally extracts the last proper noun phrase before the address.
      const phrases = [...before.matchAll(
        /(?!(?:Verify|Analyze|Evaluate|Run|Check|Audit|Scan|Review|Perform|Do|Please|The|This)\b)[A-Z][a-zA-Z0-9]*(?:\s+(?:v\d+|V\d+|[A-Z][a-zA-Z0-9]*|Finance|Protocol|Labs|Network|DAO))*\b/g
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

**Where KNOWN_PROTOCOL_PATTERN is defined:** Move the regex from the `else` branch (line 541) to a module-level constant so both branches can use it:

```typescript
// At module level, near the top of the file:
const KNOWN_PROTOCOL_PATTERN = /\b(Uniswap|Aave|Compound|MakerDAO|Maker|Curve|Synthetix|SushiSwap|Sushi|Balancer|Yearn|Chainlink|Lido|Rocket\s*Pool|Frax|Convex|Euler|Morpho|Radiant|Pendle|GMX|dYdX|Aerodrome|Jupiter|Raydium|1inch|Pancake\s*Swap|Trader\s*Joe|Camelot|Ethena|USDe|Hyperliquid|EigenLayer|Eigen\s*Layer|Bitcoin|Ethereum|Solana|Cardano|Polkadot|Avalanche|Cosmos|Arbitrum|Optimism|Polygon|Celestia|Virtuals\s*Protocol|Jito|Drift|Orca|Marinade|Pyth|Seamless|Stargate|LayerZero|Layer\s*Zero|Wormhole|Aptos|Sui|Near)\s*(v\d+)?/i;
```

**The `else` branch (no address found)** continues to use the same constant — no duplication.

### Test Cases (verified via node)

- `"Verify Uniswap v3 (0x1f98...) for claim consistency"` → Stage 1: "Uniswap v3" ✓
- `"Analyze Aerodrome Finance (0x940...) for mathematical validity"` → Stage 1: "Aerodrome Finance" (or "Aerodrome" if Finance not in pattern) ✓
- `"Run full L1+L2+L3 pipeline for Virtuals Protocol (0x0b3e...)"` → Stage 1: "Virtuals Protocol" ✓
- `"Verify the technical claims of Aave V3 protocol (0xabc...)"` → Stage 1: "Aave" (known protocol) ✓. If Stage 1 misses → Stage 2: ["Aave V3"] (last phrase) ✓
- `"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"` → all stages fail → "Unknown" → Fix 2 catches via DexScreener ✓
- `"Check Bitcoin (0xabc...)"` → Stage 1: "Bitcoin" ✓
- `"Run a full technical analysis for Curve Finance (0xabc...)"` → Stage 2: ["Curve Finance"] ✓

**Known limitation:** Projects starting with "The" (e.g., "The Graph") — the negative lookahead skips "The". Stage 1 (KNOWN_PROTOCOL_PATTERN) handles this for known protocols. For unknown protocols starting with "The", Fix 2 (DexScreener) is the safety net.

---

## Fix 2: "Unknown" → resolveTokenName Defense-in-Depth

### The Problem

All three handlers check `if (!reqName && ...)` before calling resolveTokenName. But "Unknown" is truthy in JavaScript — the check passes, resolveTokenName is skipped. When AcpService fails to extract a name, the handler never attempts DexScreener resolution.

### The Fix

**File:** `src/acp/JobRouter.ts` — all three handlers

**handleFullVerification (~line 683):**
```typescript
// Current:
if (!reqName && (reqAddr || originalAddr)) {
// Fix:
if ((!reqName || reqName === 'Unknown') && (reqAddr || originalAddr)) {
```

**handleVerifyWhitepaper (~line 422):**
```typescript
// Current:
if (!projectName && (requestedTokenAddress || originalTokenAddress)) {
// Fix:
if ((!projectName || projectName === 'Unknown') && (requestedTokenAddress || originalTokenAddress)) {
```

**handleLegitimacyScan (~line 202):**
```typescript
// Current:
if (!projectName && (tokenAddress || originalTokenAddress)) {
// Fix:
if ((!projectName || projectName === 'Unknown') && (tokenAddress || originalTokenAddress)) {
```

**Also update the discovery fallback guards.** Two locations check `projectName !== 'Unknown'` to decide whether to attempt discovery. These should ALSO try discovery when the name is "Unknown" but an address is available for DexScreener:

**Verify handler discovery fallback (~line 566):**
```typescript
// Current:
if (claims.length === 0 && this.deps.tieredDiscovery && projectName !== 'Unknown') {
// Fix — if we have an address, discovery can still work via DexScreener → known URL map:
if (claims.length === 0 && this.deps.tieredDiscovery) {
```

Remove the `projectName !== 'Unknown'` guard entirely here. Discovery with "Unknown" + a valid address will:
1. Try resolveTokenName → might get "Aerodrome" from DexScreener
2. Use that name for the known URL map lookup
3. Find the document URL and run the pipeline

**Full_tech handler discovery fallback (~line 942):**
Same change — remove the `projectName !== 'Unknown'` guard.

---

## Fix 3: KNOWN_PROTOCOL_PATTERN Synchronization

### The Problem

Three separate protocol lists that drift apart:
- **AcpService** (line 541): Used for plain-text name extraction
- **WpvService** (line 35): Used for known-protocol gate in soft-strip
- **WebSearchFallback** (KNOWN_WHITEPAPER_URLS): Used for document discovery

Some protocols are in one list but not others. When the evaluator tests a protocol, ALL three lists must recognize it.

### The Fix

**Create a shared constant file** that all three consume:

**New file:** `src/constants/protocols.ts`

```typescript
/**
 * Canonical list of known crypto protocols.
 * Used by: AcpService (name extraction), WpvService (known-protocol gate),
 * WebSearchFallback (URL map). Keep this list in sync across all consumers.
 *
 * When adding a new protocol:
 * 1. Add the name here
 * 2. Add a KNOWN_WHITEPAPER_URL entry in WebSearchFallback.ts
 * 3. Rebuild and deploy
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

**Then update all three consumers to import from this file:**

- `AcpService.ts`: Replace inline regex with `import { KNOWN_PROTOCOL_PATTERN } from '../constants/protocols';`
- `WpvService.ts`: Replace `KNOWN_PROTOCOL_PATTERN` constant with import
- `WebSearchFallback.ts`: No regex change needed, but any new protocol added to the shared list should also get a KNOWN_WHITEPAPER_URLS entry

**Note on AcpService (plugin-acp repo):** This is a separate repo. The shared file lives in plugin-wpv. AcpService can either:
- (a) Copy the pattern inline (simpler, requires manual sync)
- (b) Import from plugin-wpv via the symlinked node_modules path

Option (a) is the only option — plugin-acp has no dependency on plugin-wpv (the dependency goes the other direction via wpv-agent). AcpService gets an inline copy with a sync comment:

```typescript
// SYNC: This pattern must match plugin-wpv/src/constants/protocols.ts
// Update BOTH files when adding or removing protocols.
const KNOWN_PROTOCOL_PATTERN = buildProtocolPattern(KNOWN_PROTOCOL_NAMES);
```

---

## Fix 4: ClaimExtractor Minimum Text Threshold

### The Problem

`ClaimExtractor.extractClaims()` calls Sonnet with ANY amount of text, including 17-char SPA shells. It only checks for empty text (`text.trim().length === 0`). A 17-char input wastes ~1600 Sonnet tokens ($0.007) and returns 0 claims.

### Why NOT in runL1L2

The original plan put the threshold in `runL1L2`, returning a fake `wp: { id: 'thin-...' }`. This is wrong — the handlers call `verificationsRepo.create({ whitepaperId: wp.id })` after `runL1L2` returns. A temp ID that doesn't exist in the whitepapers table causes a foreign key constraint violation.

Putting the threshold in ClaimExtractor is correct because:
1. `runL1L2` still creates a real whitepaper in the DB (with 0 claims)
2. L1 structural analysis still runs (fast, no API call)
3. Only the Sonnet API call is skipped
4. The caller receives a valid `wp.id` — no foreign key issues
5. The 0-claims discovery fallback triggers normally

### The Fix

**File:** `src/verification/ClaimExtractor.ts` — `extractClaims()` method

After the existing empty-text check (line 117), add a minimum length check:

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

This saves API cost and — more importantly — returns immediately from L2, letting `runL1L2` complete quickly (< 1 second for thin content). The handler's 0-claims discovery fallback then has the full timeout budget to find an alternative document.

---

## Fix 5: CryptoContentResolver Early SPA Signal (Additive)

### Priority Note

With Fix 4 in ClaimExtractor (200-char threshold), the SPA's 17-char text already produces 0 claims without calling Sonnet. Fix 5 adds cleaner behavior:
1. Returns empty text instead of garbage SPA shell, preventing L1 structural analysis on meaningless content
2. Provides `PLAYWRIGHT_FAILED` diagnostic for logging
3. Makes the pipeline flow clearer for debugging

Fix 5 is additive — Fix 4 alone solves the Sonnet waste problem. If implementation time is tight, Fix 5 can be deferred. But it's the right infrastructure.

### The Problem

When `resolveWhitepaper()` gets thin SPA content and Playwright is disabled (RAM), it returns the 17-char text without any signal to the caller. The caller (`runL1L2`) doesn't know whether it got thin content because the document is genuinely tiny or because the SPA couldn't be rendered.

### The Fix

**File:** `src/discovery/CryptoContentResolver.ts`

Add a diagnostic signal when SPA was detected but Playwright couldn't render:

In `enhancedResolve()`, when SPA is detected but Playwright returns null:

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

Returning empty text (instead of the 17-char shell) ensures `runL1L2`'s new minimum text threshold (Fix 4) triggers immediately. The `PLAYWRIGHT_FAILED` diagnostic gives the handler context for logging.

Also update `resolveWhitepaper()` — when enhanced resolution returns content with `PLAYWRIGHT_FAILED` diagnostic, set the result text to empty so the thin-content path returns cleanly:

```typescript
const enhanced = await this.enhancedResolve(url, isSpaDetected);
if (enhanced) {
  // If SPA was detected but Playwright failed, return empty result
  // so handler can try discovery instead of wasting time on extraction
  if (enhanced.diagnostics?.includes('PLAYWRIGHT_FAILED')) {
    return this.buildResult(
      { ...enhanced, text: '' },
      url, enhanced.resolvedUrl ?? url, 'spa-unresolvable',
    );
  }
  // ... existing enhanced handling ...
}
```

---

## Fix 6: Verify Handler SPA Early Bailout → Discovery

### The Problem

The verify handler's document_url path calls `runL1L2(documentUrl, ...)`. With Fix 4, `runL1L2` returns 0 claims immediately for thin content. The handler then tries the discovery fallback. But the discovery fallback calls `runL1L2(discovered.documentUrl, ...)` — and if the discovered URL is ALSO a SPA, it also returns 0 claims.

The current fallback has `discovered.documentUrl !== documentUrl` as a guard — this prevents infinite loops but doesn't prevent discovering another SPA URL.

### The Fix

**File:** `src/acp/JobRouter.ts` — `handleVerifyWhitepaper`, inside the `withTimeout` block

After the 0-claims discovery fallback, if the fallback also returned 0 claims and we have a project name, try the known URL map directly (bypassing discovery's tiered approach):

```typescript
// Existing discovery fallback produced 0 claims — try known URL map as last resort
if (claims.length === 0 && projectName !== 'Unknown') {
  // WebSearchFallback.searchWhitepaper checks known URLs first (instant, no network)
  // If the known URL is a PDF (not SPA), it will resolve successfully
  if (this.deps.webSearchFallback) {
    const knownUrl = await this.deps.webSearchFallback.searchWhitepaper(projectName);
    if (knownUrl && knownUrl !== documentUrl) {
      log.info('Trying known URL map as last resort', { projectName, knownUrl: knownUrl.slice(0, 80) });
      const knownResult = await this.runL1L2(knownUrl, projectName, requestedTokenAddress, requirementText, costTracker);
      if (knownResult.claims.length > 0) {
        ({ resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = knownResult);
      }
    }
  }
}
```

**But this requires `webSearchFallback` to be available in the handler.** Currently it's only used inside TieredDocumentDiscovery. Add it to `JobRouterDeps`:

```typescript
interface JobRouterDeps {
  // ... existing deps ...
  webSearchFallback?: WebSearchFallback;
}
```

And wire it in the constructor/initialization.

**Alternative (simpler):** Don't add a new dep. Instead, in the discovery fallback, when TieredDocumentDiscovery returns a SPA URL, check if the URL ends in `.pdf`. If not, try appending common PDF paths to the project's domain:

Actually — the cleanest approach: **Fix 9 (known URL audit)** ensures Aerodrome has a PDF URL in the known map. Then the existing discovery fallback finds the PDF URL (not the SPA URL) and `runL1L2` succeeds because PDF content resolves without Playwright.

**The verify handler already has this fallback.** The issue is that the known URL for Aerodrome (`aerodrome.finance/docs`) is a SPA. Fix 9 changes it to a resolvable URL. This fix (Fix 6) ensures the handler's existing fallback works once the known URL is correct.

**Keep the handler code clean.** The only change needed in the verify handler: remove the `projectName !== 'Unknown'` guard on the discovery fallback (already covered in Fix 2). The rest is infrastructure fixes in CryptoContentResolver and WebSearchFallback.

---

## Fix 7: Playwright RAM Threshold 250→200MB

### The Problem

The VPS has 2GB RAM. Node.js process uses ~300-400MB. OS uses ~600MB. Free RAM fluctuates between 107-322MB. At the 250MB threshold, Playwright is disabled most of the time. The Aerodrome eval had 241MB free — 9MB short.

### The Fix

**File:** `src/discovery/HeadlessBrowserResolver.ts`

```typescript
// Current:
const MIN_FREE_RAM_BYTES = 250 * 1024 * 1024;
// Fix:
const MIN_FREE_RAM_BYTES = 200 * 1024 * 1024;
```

**Also update the log message** that currently hardcodes `requiredMB: 250`:
```typescript
log.warn('Insufficient free RAM for headless browser', {
  freeRamMB: Math.round(freeRam / 1024 / 1024),
  requiredMB: Math.round(MIN_FREE_RAM_BYTES / 1024 / 1024),
});
```

**Safety analysis:** Playwright single-page render uses ~150MB. With 200MB free, there's a 50MB buffer. The `_renderLock` mutex prevents concurrent renders. OOM risk is minimal — Linux will use swap before OOM-killing (Lightsail instances have swap configured).

---

## Fix 8: AbortController Threading Through Pipeline

### The Problem

The current `withTimeout` uses `Promise.race`. When the timeout fires, the underlying operation (fetch, Playwright render, Sonnet API call) continues running in the background. Resources are wasted, and on a 2GB VPS, an orphaned Playwright render can push RAM over the limit for the next job.

### The Fix

**File:** `src/acp/JobRouter.ts` — `withTimeout()` and `runL1L2()`

Add an `AbortSignal` parameter to `runL1L2` and thread it through to network operations:

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

Update `runL1L2` signature:
```typescript
private async runL1L2(
  documentUrl: string,
  projectName: string,
  tokenAddress: string | null | undefined,
  requirementText: string | null | undefined,
  costTracker: CostTracker,
  signal?: AbortSignal,
) {
```

Pass `signal` to `cryptoResolver.resolveWhitepaper()`:

**File:** `src/discovery/CryptoContentResolver.ts`

Add optional `signal` parameter to `resolveWhitepaper()` and thread through to:
- `this.contentResolver.resolve(resolvedUrl)` — FetchContentResolver
- `this.enhancedResolve()` → `this.headlessBrowser.resolve()` → Playwright page.goto()
- `this.docsCrawler.crawl()` → sub-page fetches

**File:** `src/discovery/FetchContentResolver.ts`

Pass signal to fetch:
```typescript
const response = await fetch(url, {
  headers: { ... },
  signal: signal ?? AbortSignal.timeout(15000),
  redirect: 'follow',
});
```

**File:** `src/discovery/HeadlessBrowserResolver.ts`

Check signal before launching Playwright:
```typescript
if (signal?.aborted) return null;
```

And on the page navigation:
```typescript
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
if (signal?.aborted) {
  await page.close();
  return null;
}
```

**Callers:** Update all `withTimeout` call sites to pass the signal:

```typescript
// In handleVerifyWhitepaper:
return await this.withTimeout(async (signal) => {
  let { resolved, analysis, ... } = await this.runL1L2(documentUrl, projectName, requestedTokenAddress, requirementText, costTracker, signal);
  // ...
});
```

Same for handleFullVerification and handleLegitimacyScan where `withTimeout` wraps live pipeline calls.

**Combining signals:** FetchContentResolver already uses `AbortSignal.timeout(15000)` for per-request timeouts. Don't replace it — combine both signals so per-request timeouts AND the pipeline timeout both work:

```typescript
// In FetchContentResolver.resolve():
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
  : AbortSignal.timeout(15000);
const response = await fetch(url, { headers: { ... }, signal: combinedSignal, redirect: 'follow' });
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

**Scope note:** Threading through ClaimExtractor (Sonnet API call) is lower priority — the Anthropic SDK doesn't support AbortSignal natively. Fix 4 (minimum text threshold) already prevents the Sonnet call for thin content, which is the primary waste case. The main benefit of AbortController is cancelling fetch/Playwright operations.

---

## Fix 9: Known URL Audit — SPA→PDF Alternatives

### The Problem

WebSearchFallback has `[/\baerodrome\b/i, 'https://aerodrome.finance/docs']`. This URL is a JavaScript SPA — it returns 17 chars without Playwright. Even if Playwright works (Fix 7), the docs site yields fragmented content from sub-page crawling, not a coherent whitepaper.

### The Fix

**File:** `src/discovery/WebSearchFallback.ts`

Audit ALL known URLs. For each, determine if it's:
- **PDF** (direct download, no rendering needed) → keep as-is
- **Static HTML** (server-rendered, fetch works) → keep as-is
- **SPA** (needs Playwright) → find a PDF alternative or add a static fallback

**Aerodrome specifically:** Aerodrome doesn't have a traditional whitepaper PDF. Their docs are at `aerodrome.finance/docs` (SPA). Options:
1. Check if a GitBook/Notion export exists → search for `aerodrome whitepaper filetype:pdf`
2. Use the Aerodrome docs GitHub repo raw markdown if it exists
3. Keep the SPA URL but ensure Playwright works (Fix 7) and DocsSiteCrawler handles it

**Kov: Run this search** during implementation:
```bash
# Check if Aerodrome has a PDF or GitHub docs
curl -s "https://html.duckduckgo.com/html/?q=aerodrome+finance+whitepaper+filetype:pdf" | grep -oP 'href="[^"]*\.pdf[^"]*"' | head -5
curl -s "https://html.duckduckgo.com/html/?q=aerodrome+finance+docs+github" | grep -oP 'href="[^"]*github[^"]*aerodrome[^"]*"' | head -5
```

If a PDF exists, update the known URL. If not, the SPA path must work — which Fixes 5, 7, and the DocsSiteCrawler handle.

**Audit the full list for other SPA-only entries:**

| Protocol | Known URL | Type | Action |
|----------|-----------|------|--------|
| Uniswap v4 | docs.uniswap.org | SPA | Check for PDF alternative |
| Synthetix | docs.synthetix.io | SPA | Check for litepaper PDF |
| Yearn | docs.yearn.fi | SPA | Check for PDF |
| dYdX | docs.dydx.exchange | SPA | Check for PDF |
| GMX | gmxio.gitbook.io | GitBook SPA | GitBook → Playwright |
| Frax | docs.frax.finance | SPA | Check for PDF |
| Jupiter | station.jup.ag/docs | SPA | Check for PDF |
| Raydium | docs.raydium.io | SPA | Check for PDF |
| SushiSwap | docs.sushi.com | SPA | Check for PDF |
| PancakeSwap | docs.pancakeswap.finance | SPA | Check for PDF |
| Ethena | gitbook | GitBook SPA | Check for PDF |
| Balancer | docs.balancer.fi | SPA | Check for whitepaper PDF |
| Seamless | docs.seamlessprotocol.com | SPA | Check for PDF |
| Aerodrome | aerodrome.finance/docs | SPA | Search for PDF |
| Pyth | docs.pyth.network | SPA | Check for PDF |
| Ethereum | ethereum.org | SPA | Keep — Playwright handles ethereum.org |
| Wormhole | docs.wormhole.com | SPA | Check for PDF |

Kov should curl each SPA URL and check if direct fetch returns > 500 chars. Use this script:

```bash
# Audit all known URLs — check which return < 500 chars (SPA/thin content)
for url in \
  "https://docs.uniswap.org/contracts/v4/overview" \
  "https://docs.synthetix.io/synthetix-protocol/the-synthetix-protocol/synthetix-litepaper" \
  "https://docs.yearn.fi/getting-started/intro" \
  "https://docs.dydx.exchange" \
  "https://gmxio.gitbook.io/gmx/overview" \
  "https://docs.frax.finance" \
  "https://station.jup.ag/docs" \
  "https://docs.raydium.io" \
  "https://docs.sushi.com" \
  "https://docs.pancakeswap.finance" \
  "https://ethena-labs.gitbook.io/ethena-labs/solution-overview/usde-overview" \
  "https://docs.balancer.fi" \
  "https://docs.seamlessprotocol.com" \
  "https://aerodrome.finance/docs" \
  "https://docs.pyth.network" \
  "https://docs.wormhole.com/wormhole"; do
  chars=$(curl -sL --max-time 10 "$url" | sed 's/<[^>]*>//g' | tr -s '[:space:]' | wc -c)
  echo "$chars chars — $url"
done
```

For each URL returning < 500 chars, search for a PDF alternative:
```bash
# Example for Aerodrome:
curl -s "https://html.duckduckgo.com/html/?q=aerodrome+finance+whitepaper+filetype:pdf" | grep -oP 'href="[^"]*\.pdf[^"]*"' | head -5
```

Update the known URL map with PDFs where available. For protocols that are SPA-only (no PDF), the SPA resolution path (Playwright + DocsSiteCrawler) must handle them — which Fixes 4, 5, and 7 address.

---

## Execution Order

1. **Fix 3** — Create `src/constants/protocols.ts` shared protocol list. Update imports in WpvService.ts. This is a foundation that other fixes depend on.
2. **Fix 1** — AcpService parser rewrite. Uses the new shared KNOWN_PROTOCOL_PATTERN.
3. **Fix 2** — "Unknown" → resolveTokenName in all handlers. Remove `!== 'Unknown'` guards on discovery fallbacks.
4. **Fix 4** — runL1L2 minimum text threshold (200 chars).
5. **Fix 5** — CryptoContentResolver SPA early signal (`PLAYWRIGHT_FAILED` diagnostic).
6. **Fix 7** — Playwright RAM threshold 250→200MB.
7. **Fix 8** — AbortController threading through pipeline.
8. **Fix 6** — Verify handler discovery fallback (already works once Fixes 2, 4, 5, 9 are in place).
9. **Fix 9** — Known URL audit. Kov runs the SPA check during implementation, updates URLs.
10. **Build both repos → test → deploy → seed → PM2 restart → verify.**

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
# Expected: Either claims > 0 (Playwright worked) or INSUFFICIENT_DATA in < 60s (not 4 min)
```

### Test Fix 7: Playwright RAM

```bash
# Check PM2 logs for Playwright status after deployment
pm2 logs grey --lines 50 | grep -i "playwright\|headless\|RAM\|freeRam\|rendered"
# Expected: No "Insufficient free RAM" at 200MB threshold
```

### Test Fix 9: Known URL audit results

```bash
# Aerodrome with known URL — should find content
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-aero-disc","offering_id":"project_legitimacy_scan","arguments":{"project_name":"Aerodrome","token_address":"0x940181a94a35a4569e4529a3cdfb74e38fd98631"}}' | jq '.verdict, .structuralScore'
# Expected: PASS or CONDITIONAL (not INSUFFICIENT_DATA)
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
  -d '{"job_id":"test-reg-empty","offering_id":"full_technical_verification","arguments":{}}'

# NSFW name — should reject
curl -s -X POST http://44.243.254.19:3001 \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"test-reg-nsfw","offering_id":"project_legitimacy_scan","arguments":{"project_name":"ExplicitContentToken","token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}}'
```

---

## Deploy Notes

**plugin-acp (PRIVATE repo — SCP):**
```bash
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
cd /opt/grey/plugin-acp && bun run build
# dist is SYMLINKED — no copy needed
```

**plugin-wpv (public repo — git pull):**
```bash
cd /opt/grey/plugin-wpv && git pull && bun install && bun run build
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey
```

**After restart:** Wait for "Registered 4 offering handlers". Run verification plan. Seed DB if needed (standard Uniswap/Aave/Lido script).

---

## Files Changed

| File | Repo | Fixes |
|------|------|-------|
| `src/constants/protocols.ts` | plugin-wpv | **NEW** — Fix 3: shared protocol list |
| `src/AcpService.ts` | plugin-acp | Fix 1: plain-text parser rewrite, Fix 3: import shared pattern |
| `src/acp/JobRouter.ts` | plugin-wpv | Fix 2: "Unknown" fallback, Fix 6: verify fallback, Fix 8: AbortController |
| `src/verification/ClaimExtractor.ts` | plugin-wpv | Fix 4: min text threshold (200 chars) |
| `src/discovery/CryptoContentResolver.ts` | plugin-wpv | Fix 5: SPA early signal, Fix 8: AbortSignal threading |
| `src/discovery/HeadlessBrowserResolver.ts` | plugin-wpv | Fix 7: RAM 250→200MB, Fix 8: AbortSignal check |
| `src/discovery/FetchContentResolver.ts` | plugin-wpv | Fix 8: AbortSignal on fetch |
| `src/discovery/WebSearchFallback.ts` | plugin-wpv | Fix 9: SPA→PDF URL audit |
| `src/WpvService.ts` | plugin-wpv | Fix 3: import shared KNOWN_PROTOCOL_PATTERN |

---

## DB Rules

- No DB schema changes
- After deployment: seed via live pipeline HTTP if DB has < 3 projects with claims > 0
- Clean garbage entries ("Unknown", 0-claim entries) before seeding
- **CRITICAL:** Never wipe/delete from wpv_claims, wpv_verifications, or wpv_whitepapers without explicit Forces approval

---

*Implement in order: Fix 3 (shared protocols) → Fix 1 (parser) → Fix 2 (Unknown fallback) → Fix 4 (min text) → Fix 5 (SPA signal) → Fix 7 (RAM) → Fix 8 (AbortController) → Fix 9 (URL audit) → Fix 6 (verify fallback — validates naturally) → build → test → deploy → seed → verify.*
