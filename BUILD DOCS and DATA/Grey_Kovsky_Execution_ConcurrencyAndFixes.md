# Kovsky Execution Plan — Concurrency Architecture + Eval 30 Fixes

> **Source:** Forces + Claude Opus context window (reviewed by Kov)
> **Date:** 2026-04-07
> **Goal:** Fix concurrency bugs, integrate Playwright DocsSiteCrawler, fix remaining eval failures.
> **Depends on:** Eval 29 fixes deployed (briefing quality filter, plain-text URL extraction, burn+nonsense rejection)

---

## What This Plan Covers

**Part A: Concurrency (3 layers)** — structural fixes for shared mutable state
**Part B: Playwright DocsSiteCrawler** — Fix 4 from Kov's plan, with review corrections
**Part C: Remaining Eval Fixes** — Fix 5 (404 soft-fallback), Fix 6 (upsert at write time)
**Part D: Cleanup** — shared protocol regex constant, remove debug log

---

## Execution Order

1. Part A Layer 1: Job mutex on `handleJob`
2. Part A Layer 2: Per-job CostTracker
3. Part A Layer 3: Playwright mutex + `resolveLinks()`
4. Part B: Playwright DocsSiteCrawler (Changes 1–4)
5. Part C: Fix 5 (404 soft-fallback) + Fix 6 (upsert)
6. Part D: Cleanup
7. Build + test + deploy

---

# Part A: Concurrency Architecture

## The Problem

`AcpService.handleNewTask` fires from a WebSocket callback with no queue, no mutex, no serialization. Multiple jobs can fire concurrently. Every shared resource downstream is unprotected:

| Resource | Bug | Impact |
|----------|-----|--------|
| CostTracker | Shared instance; `reset()` at job start wipes other jobs' accumulated tokens | Wrong `llmTokensUsed` and `computeCostUsd` in reports |
| HeadlessBrowserResolver | No mutex on shared browser instance; `ensureBrowser()` race; TOCTOU on RAM guard and rate limit | Concurrent Playwright renders spike RAM; rate limit bypassed |
| DB upsert (Fix 6) | Check-then-create without lock | Duplicate whitepaper entries |

## Three-Layer Fix

### Layer 1: Job-Level Mutex on `JobRouter.handleJob`

Serialize all job processing. One job runs at a time. This prevents all downstream concurrency issues.

**File:** `src/acp/JobRouter.ts`

**Add mutex field to JobRouter class:**
```typescript
export class JobRouter {
  private _jobLock: Promise<void> = Promise.resolve();

  constructor(private deps: JobRouterDeps) {}
```

**Wrap `handleJob`:**

**Current:**
```typescript
async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
  log.info('Routing job', { offeringId });
  this.deps.costTracker.reset();
  switch (offeringId) {
    // ...
  }
}
```

**New:**
```typescript
async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
  // Serialize job processing — prevents CostTracker data corruption,
  // Playwright race conditions, and DB upsert TOCTOU.
  let release: () => void;
  const acquired = new Promise<void>(r => { release = r; });
  const previous = this._jobLock;
  this._jobLock = acquired;
  await previous;
  try {
    return await this._handleJobImpl(offeringId, input);
  } finally {
    release!();
  }
}

private async _handleJobImpl(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
  log.info('Routing job', { offeringId });
  // ... existing handleJob body, with CostTracker changes from Layer 2 ...
}
```

The existing `handleJob` body moves unchanged into `_handleJobImpl`. The only modification inside that body is the CostTracker change in Layer 2.

---

### Layer 2: Per-Job CostTracker

CostTracker is a counter. It should be a local variable, not a shared instance. Create it at the start of each job, pass it through the pipeline, read it at the end.

**Step 1: Change JobRouterDeps — remove shared CostTracker, add pricing config**

**File:** `src/acp/JobRouter.ts`

**Current:**
```typescript
export interface JobRouterDeps {
  // ...
  costTracker: CostTracker;
  // ...
}
```

**New:**
```typescript
export interface JobRouterDeps {
  // ...
  pricingConfig: { inputPerToken: number; outputPerToken: number };
  // ...
}
```

**Step 2: Create per-job CostTracker in `_handleJobImpl`**

**At the top of `_handleJobImpl`:**
```typescript
private async _handleJobImpl(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
  log.info('Routing job', { offeringId });

  // Per-job cost tracker — scoped to this invocation, no shared state
  const costTracker = new CostTracker(
    this.deps.pricingConfig.inputPerToken,
    this.deps.pricingConfig.outputPerToken,
  );

  switch (offeringId) {
    case 'project_legitimacy_scan':
      return this.handleLegitimacyScan(input, costTracker);
    case 'verify_project_whitepaper':
      return this.handleVerifyWhitepaper(input, costTracker);
    case 'full_technical_verification':
      return this.handleFullVerification(input, costTracker);
    case 'daily_technical_briefing':
      return this.handleDailyBriefing(input);
    default:
      return { error: 'unknown_offering', message: `Unknown offering: ${offeringId}` };
  }
}
```

**Step 3: Thread `costTracker` through handlers**

Every handler that uses `this.deps.costTracker` changes to accept and use the local `costTracker` parameter instead. This is a mechanical find-and-replace within each handler:

- `handleLegitimacyScan(input, costTracker)` — add `costTracker` parameter, replace all `this.deps.costTracker` with `costTracker`
- `handleVerifyWhitepaper(input, costTracker)` — same
- `handleFullVerification(input, costTracker)` — same
- `runL1L2(...)` — add `costTracker` parameter, replace all `this.deps.costTracker` with `costTracker`
- `handleDailyBriefing` — doesn't use CostTracker, no change needed

**Specific lines to change:** Every occurrence of `this.deps.costTracker` in JobRouter.ts (lines 128, 191, 192, 199, 268, 272, 275, 376, 378, 440, 442, 453, 454, 465, 491, 509, 574, 575, 577, 583, 587, 698, 700, 766, 777, 788, 801) becomes `costTracker` (the local variable).

**Step 4: Pass per-job CostTracker to ClaimExtractor and ClaimEvaluator via options**

**File:** `src/verification/ClaimExtractor.ts`

**Change `extractClaims` options type:**
```typescript
async extractClaims(
  text: string,
  projectName: string,
  options?: { maxRetries?: number; requirementText?: string | null; costTracker?: CostTracker },
): Promise<ExtractedClaim[]> {
  const maxRetries = options?.maxRetries ?? 2;
  const requirementText = options?.requirementText ?? null;
  const tracker = options?.costTracker ?? this.costTracker;  // Fall back to constructor-injected for tests
```

**Change the `recordUsage` call (~line 139):**
```typescript
// Was:
this.costTracker.recordUsage(response.usage.input_tokens, response.usage.output_tokens);
// Now:
tracker.recordUsage(response.usage.input_tokens, response.usage.output_tokens);
```

**File:** `src/verification/ClaimEvaluator.ts`

**Change `evaluateAll` options type:**
```typescript
async evaluateAll(
  claims: ExtractedClaim[],
  fullText: string,
  options?: { requirementText?: string | null; costTracker?: CostTracker },
): Promise<{ evaluations: ClaimEvaluation[]; scores: Map<string, number> }> {
  const requirementText = options?.requirementText ?? null;
  const tracker = options?.costTracker ?? this.costTracker;
```

Pass `tracker` to `evaluateClaim` calls and any internal `this.costTracker.recordUsage()` calls.

**Change `evaluateClaim`:**
```typescript
async evaluateClaim(
  claim: ExtractedClaim,
  fullText: string,
  requirementText?: string | null,
  costTracker?: CostTracker,
): Promise<ClaimEvaluation> {
  const tracker = costTracker ?? this.costTracker;
```

Replace all `this.costTracker.recordUsage(...)` in evaluateClaim with `tracker.recordUsage(...)`.

**Step 5: Thread costTracker from JobRouter into ClaimExtractor/ClaimEvaluator calls**

In JobRouter's `runL1L2` and other methods, pass `costTracker` via the options object:

```typescript
// Was:
const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName, {
  requirementText,
});

// Now:
const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName, {
  requirementText,
  costTracker,
});
```

Same pattern for all `claimEvaluator.evaluateAll(...)` calls — add `costTracker` to options.

**Step 6: Update WpvService.initFromRuntime**

**Change the JobRouter constructor call:**
```typescript
// Was:
const jobRouter = new JobRouter({
  // ...
  costTracker,
  // ...
});

// Now:
const jobRouter = new JobRouter({
  // ...
  pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
  // ...
});
```

The shared `costTracker` is still created and passed to ClaimExtractor and ClaimEvaluator constructors — this is backward compatibility for tests and the fallback path inside those classes. But JobRouter no longer uses it.

**Remove the `costTracker` getter from WpvService if nothing else reads it.** Check: is `WpvService.costTracker` accessed anywhere outside of tests? If not, remove it.

**Test impact:** Existing tests construct ClaimExtractor/ClaimEvaluator with a CostTracker in the constructor. Since we added `options?.costTracker ?? this.costTracker` fallback, tests that don't pass a per-call costTracker still work with the constructor-injected one. No test changes needed.

---

### Layer 3: Playwright Mutex + `resolveLinks()`

**File:** `src/discovery/HeadlessBrowserResolver.ts`

**Add mutex:**
```typescript
export class HeadlessBrowserResolver {
  private browser: unknown | null = null;
  private chromium: unknown | null = null;
  private pageCount = 0;
  private rateLimit: RateLimitState = { timestamps: [] };
  private available = false;
  private initPromise: Promise<void> | null = null;
  private _renderLock: Promise<void> = Promise.resolve();  // NEW
```

**Wrap `resolve()` in mutex:**
```typescript
async resolve(url: string): Promise<ResolvedContent | null> {
  let release: () => void;
  const acquired = new Promise<void>(r => { release = r; });
  const previous = this._renderLock;
  this._renderLock = acquired;
  await previous;
  try {
    return await this._resolveImpl(url);
  } finally {
    release!();
  }
}

private async _resolveImpl(url: string): Promise<ResolvedContent | null> {
  // ... existing resolve() body (lazy init, rate limit, RAM guard, renderAndExtract) ...
}
```

**Add `resolveLinks()` method — also uses the same mutex:**

This replaces the broken Change 3C from Kov's plan. Instead of extracting URLs from `innerText` (which doesn't contain URLs), we render the page and use `querySelectorAll('a[href]')` to get actual DOM links. The pattern already exists in `followInternalLinks` at line 317.

```typescript
/**
 * Render a page and extract internal <a href> links from the DOM.
 * Used by DocsSiteCrawler when raw HTML has no links (SPA shell).
 * Acquires the same render lock as resolve().
 */
async resolveLinks(url: string): Promise<string[]> {
  let release: () => void;
  const acquired = new Promise<void>(r => { release = r; });
  const previous = this._renderLock;
  this._renderLock = acquired;
  await previous;
  try {
    return await this._resolveLinksImpl(url);
  } finally {
    release!();
  }
}

private async _resolveLinksImpl(url: string): Promise<string[]> {
  // Lazy init
  if (!this.initPromise && !this.available && !this.chromium) {
    this.initPromise = this.loadPlaywright();
    await this.initPromise;
  }
  if (!this.available) return [];

  if (this.isRateLimited()) return [];

  const freeRam = os.freemem();
  if (freeRam < MIN_FREE_RAM_BYTES) return [];

  try {
    await this.ensureBrowser();
    const browser = this.browser as { newContext: (opts: unknown) => Promise<unknown> };
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
    }) as { newPage: () => Promise<unknown>; close: () => Promise<void> };

    const page = await context.newPage() as {
      route: (pattern: string, handler: (route: unknown) => void) => Promise<void>;
      goto: (url: string, opts: unknown) => Promise<void>;
      evaluate: <T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
    };

    try {
      await page.route('**/*', (route: unknown) => {
        const r = route as { request: () => { resourceType: () => string }; abort: () => Promise<void>; continue: () => Promise<void> };
        if (BLOCKED_RESOURCE_TYPES.has(r.request().resourceType())) return r.abort();
        return r.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_LOAD_TIMEOUT_MS });
      const origin = new URL(url).origin;

      const links: string[] = await page.evaluate((originStr) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map((a) => {
            try {
              const href = (a as HTMLAnchorElement).href;
              if (href.startsWith(originStr as string)) return href;
              return null;
            } catch { return null; }
          })
          .filter((href): href is string => href !== null)
          .filter((href, i, arr) => arr.indexOf(href) === i);
      }, origin);

      this.recordRateLimitHit();
      this.pageCount++;

      log.info('resolveLinks completed', { url, linkCount: links.length });
      return links;
    } finally {
      await Promise.race([
        context.close(),
        new Promise<void>((resolve) => setTimeout(resolve, CONTEXT_CLOSE_TIMEOUT_MS)),
      ]);
    }
  } catch (err) {
    log.warn('resolveLinks failed', { url, error: (err as Error).message });
    return [];
  }
}
```

**Also change these constants:**

```typescript
const RATE_LIMIT_PER_HOUR = 30;         // Was 10 — DocsSiteCrawler needs headroom
const MIN_FREE_RAM_BYTES = 250 * 1024 * 1024;  // Was 400MB — Linux freemem() includes reclaimable cache
```

**Update the HeadlessBrowserResolver interface for DocsSiteCrawler:**

DocsSiteCrawler's constructor type should accept `resolveLinks`:
```typescript
// In DocsSiteCrawler constructor:
constructor(
  private headlessResolver?: {
    resolve: (url: string) => Promise<ResolvedContent | null>;
    resolveLinks: (url: string) => Promise<string[]>;
  } | null,
) {}
```

---

# Part B: Playwright DocsSiteCrawler

Kov's plan with three corrections from review:

### Change 1: `isDocsSiteUrl()` — UNCHANGED from Kov's plan

Static method on DocsSiteCrawler. URL-only detection, no text length requirement.

### Change 2: SPA docs routing in CryptoContentResolver — UNCHANGED from Kov's plan

After `enhancedResolve` returns, if `isDocsSiteUrl(url)` and `enhanced.text.length >= 200`, route through `docsCrawler.crawl(url, enhanced.text)`.

Also pass `headlessBrowser` to DocsSiteCrawler constructor.

### Change 3A: Constructor accepts HeadlessBrowserResolver — UPDATED

```typescript
export class DocsSiteCrawler {
  constructor(
    private headlessResolver?: {
      resolve: (url: string) => Promise<ResolvedContent | null>;
      resolveLinks: (url: string) => Promise<string[]>;
    } | null,
  ) {}
```

### Change 3B: `fetchAndStrip` Playwright fallback — UNCHANGED from Kov's plan

When plain HTTP returns < 200 chars, fall back to `this.headlessResolver.resolve(url)`.

### Change 3C: REPLACED — DOM link extraction via `resolveLinks()`

Kov's original Change 3C used text URL extraction from `innerText`, which won't work because SPA navigation renders as text labels ("Overview"), not as URLs ("https://...").

**New Change 3C:** Use `resolveLinks()` to extract actual DOM `<a href>` links.

**In `crawl()`, after `extractLinks` returns:**

```typescript
let links = this.extractLinks(rawHtml, url);

// SPA shell — no links in raw HTML. Use Playwright to render page and extract DOM links.
if (links.length === 0 && this.headlessResolver) {
  log.info('No links in raw HTML — using Playwright DOM extraction', { url });
  const domLinks = await this.headlessResolver.resolveLinks(url);
  // Filter to same-origin, deduplicate, strip fragments
  const origin = new URL(url).origin;
  const seen = new Set<string>([url.split('#')[0]]);
  for (const href of domLinks) {
    const canonical = href.split('#')[0];
    if (canonical.startsWith(origin) && !seen.has(canonical)) {
      seen.add(canonical);
      links.push(canonical);
    }
  }
  log.info('DOM link extraction complete', { url, linkCount: links.length });
}
```

### Change 4: Rate limit and RAM guard — UPDATED

- `RATE_LIMIT_PER_HOUR`: 10 → 30
- `MIN_FREE_RAM_BYTES`: 400MB → 250MB

Both changes are in HeadlessBrowserResolver.ts (covered in Part A Layer 3).

---

# Part C: Remaining Eval Fixes

## Fix 5: 404 Soft-Fallback for `verify_project_whitepaper`

**UNCHANGED from Kov's plan.** Split 404 behavior: known protocol → soft-fallback (clear URL, discover via known URL map). Unknown project → hard-reject.

**File:** `src/WpvService.ts` — HEAD check section

**Find:**
```typescript
if (headResp.status === 404 || headResp.status === 410) {
  const err = new Error(`Invalid document_url: URL returned HTTP ${headResp.status} — document not found`);
  err.name = 'InputValidationError';
  throw err;
}
```

**Replace with:**
```typescript
if (headResp.status === 404 || headResp.status === 410) {
  const projectName = typeof requirement.project_name === 'string' ? requirement.project_name.trim() : '';
  if (KNOWN_PROTOCOL_PATTERN.test(projectName)) {
    logger.warn('document_url returned ' + headResp.status + ' for known protocol — clearing for discovery fallback', {
      url: trimmedUrl.slice(0, 80), projectName,
    });
    delete requirement.document_url;
  } else {
    const err = new Error(`Invalid document_url: URL returned HTTP ${headResp.status} — document not found`);
    err.name = 'InputValidationError';
    throw err;
  }
}
```

Uses the shared `KNOWN_PROTOCOL_PATTERN` constant from Part D.

---

## Fix 6: Upsert at Write Time

**From Kov's plan, with brace placement clarification from review.**

Before creating a new whitepaper record, check if one exists for the same project. Replace if new result has more claims. Reuse if existing is equal or better.

**File:** `src/acp/JobRouter.ts` — live pipeline write section (~line 283)

**Find:**
```typescript
    } else {
      wp = await this.deps.whitepaperRepo.create({
        projectName,
        tokenAddress: tokenAddress ?? undefined,
        documentUrl,
        chain: tokenAddress?.startsWith('0x') ? 'base' : 'unknown',
        pageCount: resolved.pageCount,
        status: 'VERIFIED',
        selectionScore: 0,
      });

      // Store claims
      for (const claim of claims) {
        await this.deps.claimsRepo.create({
```

**Replace with:**
```typescript
    } else {
      // Upsert: check for existing whitepaper by project name
      const existing = await this.deps.whitepaperRepo.findByProjectName(projectName);
      const existingWithClaims = existing.length > 0
        ? await (async () => {
            for (const e of existing) {
              const eClaims = await this.deps.claimsRepo.findByWhitepaperId(e.id);
              if (eClaims.length > 0) return { wp: e, claimCount: eClaims.length };
            }
            return null;
          })()
        : null;

      if (existingWithClaims && existingWithClaims.claimCount >= claims.length) {
        // Existing record has equal or more claims — reuse it
        wp = existingWithClaims.wp;
        log.info('Upsert: reusing existing record', {
          projectName, existingClaims: existingWithClaims.claimCount, newClaims: claims.length,
        });
      } else {
        // New result is better, or no existing record — create new
        if (existingWithClaims) {
          log.info('Upsert: replacing — new result has more claims', {
            projectName, existingClaims: existingWithClaims.claimCount, newClaims: claims.length,
          });
          await this.deps.claimsRepo.deleteByWhitepaperId(existingWithClaims.wp.id);
          await this.deps.verificationsRepo.deleteByWhitepaperId(existingWithClaims.wp.id);
          await this.deps.whitepaperRepo.deleteById(existingWithClaims.wp.id);
        } else if (existing.length > 0) {
          // Existing records with 0 claims — clean them up
          for (const e of existing) {
            await this.deps.verificationsRepo.deleteByWhitepaperId(e.id);
            await this.deps.whitepaperRepo.deleteById(e.id);
          }
        }

        wp = await this.deps.whitepaperRepo.create({
          projectName,
          tokenAddress: tokenAddress ?? undefined,
          documentUrl,
          chain: tokenAddress?.startsWith('0x') ? 'base' : 'unknown',
          pageCount: resolved.pageCount,
          status: 'VERIFIED',
          selectionScore: 0,
        });

        // Store claims — ONLY when creating/replacing, NOT when reusing
        for (const claim of claims) {
          await this.deps.claimsRepo.create({
            // ... existing claim create body ...
          });
        }
      }
      // CLOSE the else block for upsert here

      // Verification create is UNCONDITIONAL — every job produces a verification record
      // regardless of whether we reused, replaced, or created the whitepaper
```

**CRITICAL brace placement:** The verification `create()` call that follows the claims loop must be OUTSIDE the upsert conditional. Every job run produces a verification record with job-specific metadata (`generatedAt`, `costUsd`, `llmTokensUsed`). The claims-writing `for` loop is INSIDE the conditional (only when creating/replacing). The verification create is UNCONDITIONAL.

**Kov:** trace the exact code at implementation time. The claims-writing block ends, the upsert conditional ends, THEN the verification create runs. Get the braces right.

**Repo methods needed (add if missing):**

**`src/db/wpvClaimsRepo.ts`:**
```typescript
async deleteByWhitepaperId(whitepaperId: string): Promise<void> {
  await this.db.delete(wpvClaims).where(eq(wpvClaims.whitepaperId, whitepaperId));
}
```

**`src/db/wpvVerificationsRepo.ts`:**
```typescript
async deleteByWhitepaperId(whitepaperId: string): Promise<void> {
  await this.db.delete(wpvVerifications).where(eq(wpvVerifications.whitepaperId, whitepaperId));
}
```

**`src/db/wpvWhitepapersRepo.ts`:**
```typescript
async deleteById(id: string): Promise<void> {
  await this.db.delete(wpvWhitepapers).where(eq(wpvWhitepapers.id, id));
}
```

---

# Part D: Cleanup

## Shared `KNOWN_PROTOCOL_PATTERN` Constant

Currently duplicated in four places. Extract to a module-level constant in `WpvService.ts`.

**File:** `src/WpvService.ts`

**Add at module level (after the content filtering constants):**
```typescript
/**
 * Known crypto protocols — L1s, L2s, DeFi, infrastructure, meme tokens.
 * Used by: plain-text project name extraction, burn-address soft-strip,
 * 404 soft-fallback, and extractFromUnknownFields.
 * Single source of truth — update HERE when adding protocols.
 */
export const KNOWN_PROTOCOL_PATTERN = /\b(Bitcoin|Ethereum|Solana|Cardano|Polkadot|Avalanche|Cosmos|Toncoin|Tron|Near|Algorand|Aptos|Sui|Sei|Hedera|Fantom|Stellar|XRP|Litecoin|Monero|Filecoin|Internet\s*Computer|Kaspa|Injective|Celestia|Mantle|Arbitrum|Optimism|Base|Polygon|zkSync|Starknet|Scroll|Linea|Blast|Manta|Mode|Uniswap|Aave|Compound|MakerDAO|Maker|Curve|Synthetix|SushiSwap|Balancer|Yearn|Chainlink|Lido|Rocket\s*Pool|Frax|Convex|Euler|Morpho|Radiant|Pendle|GMX|dYdX|Virtuals\s*Protocol|Aerodrome|Jupiter|Raydium|Orca|Marinade|Jito|Drift|1inch|PancakeSwap|Pancake\s*Swap|Trader\s*Joe|Camelot|Stargate|LayerZero|Layer\s*Zero|Wormhole|Across|Hop\s*Protocol|The\s*Graph|Arweave|Akash|Render|Pyth|API3|Ethena|USDe|Hyperliquid|EigenLayer|Eigen\s*Layer|Pepe|Shiba|Dogecoin|Floki|Bonk)\b/i;
```

**Replace all inline copies:**
1. `extractFromUnknownFields` protocol regex → use `KNOWN_PROTOCOL_PATTERN`
2. Burn-address soft-strip `KNOWN_PROTOCOL_PATTERN` → use the exported constant
3. 404 soft-fallback `KNOWN_PROTOCOL_PATTERN` → use the exported constant
4. Plain-text project name extraction regex → use `KNOWN_PROTOCOL_PATTERN` (note: this one also captures `(v\d+)?` — keep the version capture group on the call site, use the constant for the protocol names only, OR duplicate with version capture)

**Note on #4:** The plain-text extraction regex includes `\s*(v\d+)?` for version capture. The shared constant doesn't include this. Two options:
- **Option A:** Add `\s*(v\d+)?` to the shared constant. All four uses get version capture. The burn-address and 404 checks will harmlessly capture a version group they don't use.
- **Option B:** Keep the plain-text extraction regex separate, with version capture. Share the constant for the other three uses.

**Recommendation:** Option A. A harmless unused capture group is better than maintaining a separate regex. The version capture doesn't affect `.test()` results (used by burn-address and 404 checks).

## Remove Scope Check Debug Log

**File:** `src/WpvService.ts`

**Find and remove:**
```typescript
// TEMP DEBUG — remove after eval 28 confirms scope check works
logger.info('Scope check fullText', { fullText: fullText.slice(0, 200), keys: Object.keys(requirement) });
```

---

# Files Changed (Complete)

| File | Changes |
|------|---------|
| `src/acp/JobRouter.ts` | Job mutex (`_jobLock`, `handleJob` → `_handleJobImpl`); per-job CostTracker (local variable, threaded through handlers); `pricingConfig` replaces `costTracker` in deps; upsert before create (Fix 6); verification create unconditional |
| `src/verification/ClaimExtractor.ts` | Optional `costTracker` in `extractClaims` options; fall back to constructor-injected tracker |
| `src/verification/ClaimEvaluator.ts` | Optional `costTracker` in `evaluateAll` and `evaluateClaim` options; fall back to constructor-injected tracker |
| `src/discovery/HeadlessBrowserResolver.ts` | Render mutex (`_renderLock`); `resolve()` → `_resolveImpl()`; new `resolveLinks()` method with mutex; `RATE_LIMIT_PER_HOUR` 10→30; `MIN_FREE_RAM_BYTES` 400MB→250MB |
| `src/discovery/DocsSiteCrawler.ts` | `isDocsSiteUrl()` static; constructor accepts HeadlessBrowserResolver with `resolveLinks`; `fetchAndStrip` Playwright fallback; DOM link extraction via `resolveLinks()` in `crawl()` |
| `src/discovery/CryptoContentResolver.ts` | SPA docs routing after `enhancedResolve`; pass `headlessBrowser` to DocsSiteCrawler constructor |
| `src/WpvService.ts` | Exported `KNOWN_PROTOCOL_PATTERN` constant; 404 soft-fallback (Fix 5); remove scope check debug log; update JobRouter construction (pricingConfig) |
| `src/db/wpvClaimsRepo.ts` | Add `deleteByWhitepaperId` |
| `src/db/wpvVerificationsRepo.ts` | Add `deleteByWhitepaperId` |
| `src/db/wpvWhitepapersRepo.ts` | Add `deleteById` |

---

# DB Rules

- No manual DB changes needed
- Fix 6 prevents future pollution automatically
- **CRITICAL:** Never instruct Kovsky to wipe/delete from `wpv_claims`, `wpv_verifications`, or `wpv_whitepapers` without explicit Forces approval

---

# Self-Audit

### Issue A: Layer 1 mutex — what if a job hangs?

**Problem:** If a job hangs (e.g., Playwright page never loads, Anthropic API never responds), the mutex is held forever. All subsequent jobs queue behind it.

**Resolution:** Both Playwright and the Anthropic client have timeouts (PAGE_LOAD_TIMEOUT_MS=15s, AbortSignal.timeout(120000)=2min). The worst case is a 2-minute hang from an API timeout, after which the job throws, the finally block fires, and the mutex releases. Add a safety timeout wrapper around `_handleJobImpl` if needed:

```typescript
// Optional safety net — add if needed
const HANDLER_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
const result = await Promise.race([
  this._handleJobImpl(offeringId, input),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Job handler timeout')), HANDLER_TIMEOUT_MS)),
]);
```

### Issue B: Layer 2 — does `handleDailyBriefing` need CostTracker?

**Problem:** `handleDailyBriefing` doesn't make LLM calls and doesn't use CostTracker. Passing it through is unnecessary.

**Resolution:** Don't pass it. The switch statement in `_handleJobImpl` only passes `costTracker` to handlers that use it. `handleDailyBriefing` keeps its current signature.

### Issue C: Layer 3 — resolveLinks() double-renders landing page

**Problem:** Change 2 routes enhanced content (already Playwright-rendered) to DocsSiteCrawler. DocsSiteCrawler calls `resolveLinks()` which renders the same page again for link extraction.

**Resolution:** This is the one remaining double-render. The first render (in enhancedResolve → HeadlessBrowserResolver.resolve()) returns text. The second render (resolveLinks()) returns DOM links. These are different outputs and can't be combined without caching. The renders are serialized by the mutex, so there's no RAM spike. Each render takes ~2-5s, and both happen within the mutex, so total overhead is ~4-10s per docs-site crawl. Acceptable.

A render cache (keyed by URL, 5-minute TTL, storing both text and links) would eliminate this. Design it as a private `Map<string, { text: string; links: string[]; timestamp: number }>` in HeadlessBrowserResolver. On cache hit, return stored data. On cache miss or expiry, render fresh. Both `resolve()` and `resolveLinks()` populate the cache. This prevents re-rendering the same URL within the same job's docs crawl.

### Issue D: Fix 6 — upsert only in one pipeline path

**Problem:** `handleLegitimacyScan` also calls `whitepaperRepo.create()` (line ~209). This path creates L1-only entries (0 claims). Fix 6 only covers the main verify/full_tech path.

**Resolution:** Apply the same upsert pattern to `handleLegitimacyScan`. When a legitimacy scan runs for a project that already has a whitepaper with claims, don't create a duplicate L1-only entry. Check existing → if claims exist, reuse. If no claims exist, replace (L1 entry replacing another L1 entry is fine).

### Issue E: Shared protocol regex — version capture group

**Problem:** The shared `KNOWN_PROTOCOL_PATTERN` includes `\s*(v\d+)?` for version capture if we go with Option A. The burn-address and 404 checks use `.test()` which ignores capture groups. No functional impact. But `extractFromUnknownFields` uses `match()` and reads `projectMatch[2]` for the version. If we change the regex source, the capture group index must stay correct.

**Resolution:** Verify at implementation time. The shared constant's capture group structure must match what `extractFromUnknownFields` expects. If the shared constant wraps the entire alternation in a capture group (group 1 = protocol name, group 2 = version), then `projectMatch[2]` still works. If the structure changes, update the access pattern.

### Issue F: Backward compatibility of CostTracker change

**Problem:** Removing `costTracker` from `JobRouterDeps` breaks any test that constructs a JobRouter with `costTracker` in deps.

**Resolution:** Kov needs to update test fixtures. Change test JobRouter construction from `costTracker: new CostTracker(...)` to `pricingConfig: { inputPerToken: 0, outputPerToken: 0 }`. Mechanical change.

---

*Forces review requested. Implement in order: Part A (Layer 1→2→3) → Part B → Part C → Part D → build → test → deploy.*
