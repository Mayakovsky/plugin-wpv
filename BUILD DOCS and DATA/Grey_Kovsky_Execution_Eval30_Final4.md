# Kovsky Execution Plan — Eval 30 Final 4 Fixes (v2)

> **Source:** Forces + Claude Opus context window
> **Date:** 2026-04-07
> **Goal:** Fix remaining failures. Target 16/16. Graduation.
> **Depends on:** Eval 29 fixes + SDK fix deployed

---

## The 4 Failures to Fix

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| F1 | Briefing backfill pulls 0-claim junk (Aerodrome 0 claims in briefing) | `getMostRecent()` backfill has no quality filter; live L1 scan creates 0-claim entries that immediately appear in briefing | Add claim-count filter to backfill |
| F2 | Aave V1 URL in plain text → V3 claims served | `extractFromUnknownFields` skipped for plain text; URL in plain text never reaches `document_url` | Extract URLs from plain text (from eval 29 plan, not yet deployed) |
| F3 | `nonsense_asdfghjkl` + null address accepted | Burn-address soft-strip treats any name not in `NON_MEANINGFUL_NAMES` as meaningful | Add known-protocol check (from eval 29 plan, not yet deployed) |
| F4 | Aerodrome docs SPA → 17 chars → 0 claims → thin entry in DB | DocsSiteCrawler uses plain HTTP only; SPA docs return shell HTML; Playwright exists but DocsSiteCrawler doesn't use it | Integrate Playwright fallback into DocsSiteCrawler |

---

## Execution Order

1. **Fix 4: Playwright in DocsSiteCrawler** (MEDIUM-HIGH — most impactful, fixes Aerodrome class of bugs)
2. **Fix 2: Extract URLs from plain text** (MEDIUM — from eval 29 plan)
3. **Fix 3: Nonsense name + burn address** (LOW — from eval 29 plan)
4. **Fix 1: Briefing backfill quality filter** (LOW — one-line change)
5. **Verification + deploy**

---

## Fix 4: Playwright Fallback in DocsSiteCrawler

### The Problem

Aerodrome's docs (`aerodrome.finance/docs`) is a JavaScript SPA. The current flow:

1. FetchContentResolver fetches with plain HTTP → gets 17 chars (SPA shell)
2. CryptoContentResolver checks `isDocsSite(url, 17)` → returns `false` (minimum is 200 chars)
3. Falls through to enhanced resolution → HeadlessBrowserResolver renders the SPA
4. Playwright gets some content but it's thin — the SPA landing page is a navigation shell
5. HeadlessBrowserResolver's link-following gets limited content from sub-pages
6. Result: thin content → L1 only → 0 claims → stored in DB → pollutes briefing

The problem is twofold:
- **`isDocsSite` rejects thin content** — it requires 200-10000 chars, but SPA shells return <200
- **DocsSiteCrawler uses plain HTTP** — even if it were invoked, its `fetchAndStrip` would get the same SPA shells for sub-pages

### The Fix (three changes)

#### 4A. URL-based docs site detection

**File:** `src/discovery/DocsSiteCrawler.ts`

Add a URL-only detection method that doesn't require text length:

```typescript
/**
 * Detect whether a URL is a documentation site based on URL patterns alone.
 * Used when content is thin (SPA) and text-based detection fails.
 */
static isDocsSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (hostname.startsWith('docs.')) return true;
    if (hostname.includes('gitbook.io')) return true;
    if (hostname.includes('readthedocs.io')) return true;
    if (hostname.includes('notion.site')) return true;
    if (pathname.startsWith('/docs/') || pathname.startsWith('/docs')) return true;
    if (pathname.startsWith('/documentation')) return true;
    if (pathname.startsWith('/wiki')) return true;

    return false;
  } catch { return false; }
}
```

#### 4B. Playwright fallback in DocsSiteCrawler

**File:** `src/discovery/DocsSiteCrawler.ts`

Add HeadlessBrowserResolver as an optional dependency. When plain HTTP returns thin content, fall back to Playwright.

**Add to constructor:**
```typescript
export class DocsSiteCrawler {
  private headlessResolver: { resolve: (url: string) => Promise<{ text: string } | null> } | null;

  constructor(headlessResolver?: { resolve: (url: string) => Promise<{ text: string } | null> } | null) {
    this.headlessResolver = headlessResolver ?? null;
  }
```

**Add Playwright fallback to `fetchAndStrip`:**

**Current:**
```typescript
private async fetchAndStrip(url: string): Promise<string | null> {
  const html = await this.fetchRawHtml(url);
  if (!html) return null;
  return this.stripHtml(html);
}
```

**New:**
```typescript
private async fetchAndStrip(url: string): Promise<string | null> {
  const html = await this.fetchRawHtml(url);
  if (html) {
    const stripped = this.stripHtml(html);
    if (stripped.length >= 200) return stripped;
  }
  // Plain HTTP returned thin/empty content — try Playwright if available
  if (this.headlessResolver) {
    try {
      const rendered = await this.headlessResolver.resolve(url);
      if (rendered && rendered.text.length >= 100) {
        log.info('Playwright fallback succeeded for sub-page', { url, chars: rendered.text.length });
        return rendered.text;
      }
    } catch {
      // Playwright failed — return whatever we got from HTTP
    }
  }
  return html ? this.stripHtml(html) : null;
}
```

**Also add Playwright fallback to `fetchRawHtml` for link extraction:**

The landing page `crawl()` method calls `fetchRawHtml` to get HTML for link extraction. For SPAs, this returns a JS shell with no useful `<a>` tags. We need the rendered HTML.

**Add a new method for rendered link extraction:**

```typescript
/**
 * Get navigation links from a SPA page using Playwright rendering.
 * Falls back to plain HTTP link extraction if Playwright unavailable.
 */
private async extractLinksWithPlaywright(url: string): Promise<string[]> {
  if (!this.headlessResolver) return [];
  try {
    // Use HeadlessBrowserResolver to render the page and get text
    // But we need links, not text — resolve() only returns text.
    // Instead, fetch the raw HTML from Playwright would require deeper integration.
    // For now: render the page, then use the resolved text to extract any URLs
    // Actually, we need a different approach — see below
    return [];
  } catch {
    return [];
  }
}
```

Actually, this gets complex. HeadlessBrowserResolver.resolve() returns text, not HTML. We need links. Let me simplify.

**Simpler approach:** Don't modify DocsSiteCrawler's link extraction. Instead, modify the entry point in CryptoContentResolver:

When content is thin AND URL matches a docs-site pattern:
1. Use HeadlessBrowserResolver to render the landing page (get rendered text with navigation)
2. Pass the rendered text to DocsSiteCrawler.crawl() as `landingPageText`
3. DocsSiteCrawler extracts links from the raw HTML (or Playwright-rendered HTML)
4. For each sub-page, DocsSiteCrawler uses Playwright fallback when HTTP is thin

But the link extraction in DocsSiteCrawler operates on raw HTML, not text. And for SPAs, the raw HTML has no useful links — they're only in the DOM after JS executes.

**Revised approach — the pragmatic fix:**

Instead of modifying DocsSiteCrawler's link extraction (which requires DOM access), change CryptoContentResolver to route SPA docs sites to HeadlessBrowserResolver's existing sub-page following. HeadlessBrowserResolver already has `followInternalLinks` which uses Playwright to:
1. Render the landing page
2. Extract `<a>` links from the rendered DOM
3. Score and follow top links
4. Concatenate sub-page content

The problem is that HeadlessBrowserResolver's link-following is limited (MAX_SUBPAGES=5, THIN_SPA_THRESHOLD=2000). For Aerodrome, the landing page renders with some content but the link-following either doesn't fire or doesn't get enough content.

**Root cause confirmation needed:** Kov's diagnostic says "Playwright renders the SPA but the content is thin." We need to know: how thin? Is it under THIN_SPA_THRESHOLD (2000) triggering link-following? Or is it above 2000 but still insufficient for L2?

**The most pragmatic fix for graduation:**

Change HeadlessBrowserResolver's thresholds and DocsSiteCrawler integration:

#### 4C. Route SPA docs sites to DocsSiteCrawler with Playwright sub-page rendering

**File:** `src/discovery/CryptoContentResolver.ts`

**Current flow (line ~73):**
```typescript
if (content.text.length >= THIN_CONTENT_THRESHOLD) {
  const isHtml = !content.contentType?.includes('pdf');
  if (isHtml && DocsSiteCrawler.isDocsSite(url, content.text.length)) {
    // ...crawl...
  }
  return this.buildResult(content, url, resolvedUrl, source);
}
// Thin content — try enhanced resolution
```

**New flow:** Before falling through to enhanced resolution for thin content, check if the URL is a docs site. If so, use DocsSiteCrawler with Playwright for sub-page fetching:

```typescript
if (content.text.length >= THIN_CONTENT_THRESHOLD) {
  const isHtml = !content.contentType?.includes('pdf');
  if (isHtml && DocsSiteCrawler.isDocsSite(url, content.text.length)) {
    log.info('Docs site detected — attempting sub-page crawl', {
      url, textLength: content.text.length,
    });
    const crawled = await this.docsCrawler.crawl(url, content.text);
    if (crawled && crawled.text.length > content.text.length * 1.5) {
      return this.buildResult(crawled, url, crawled.resolvedUrl ?? url, 'docs-crawl');
    }
  }
  return this.buildResult(content, url, resolvedUrl, source);
}

// NEW: Thin content from SPA — if URL is a docs site, try Playwright + docs crawl
if (DocsSiteCrawler.isDocsSiteUrl(url)) {
  log.info('SPA docs site detected — trying Playwright + docs crawl', {
    url, textLength: content.text.length,
  });

  // Step 1: Render landing page with Playwright to get actual content + links
  const rendered = await this.headlessResolver?.resolve(url);
  if (rendered && rendered.text.length >= 200) {
    // Step 2: Use DocsSiteCrawler with Playwright-backed sub-page fetching
    const crawled = await this.docsCrawler.crawl(url, rendered.text);
    if (crawled && crawled.text.length > rendered.text.length) {
      return this.buildResult(crawled, url, crawled.resolvedUrl ?? url, 'docs-crawl');
    }
    // Crawl didn't improve — return Playwright-rendered content
    return this.buildResult(rendered, url, rendered.resolvedUrl ?? url, 'headless-browser');
  }
}

// Thin content — try enhanced resolution (existing path)
```

**CRITICAL:** This requires `this.headlessResolver` to be accessible in CryptoContentResolver. Check if it already is.

**File:** `src/discovery/CryptoContentResolver.ts` — check if HeadlessBrowserResolver is available:

```typescript
// If CryptoContentResolver doesn't have headlessResolver, add it
// It's likely already part of the enhanced resolution chain
```

Kov needs to check whether `this.headlessResolver` exists in CryptoContentResolver or if it's accessed through a different path (like `this.enhancedResolve()` which internally calls HeadlessBrowserResolver). If it's internal to enhanced resolution, expose it.

**Also:** Pass HeadlessBrowserResolver to DocsSiteCrawler constructor:

```typescript
// In CryptoContentResolver constructor or wherever docsCrawler is created:
private docsCrawler = new DocsSiteCrawler(this.headlessResolver);
```

**For the sub-page Playwright fallback in DocsSiteCrawler.fetchAndStrip:**

When DocsSiteCrawler fetches sub-pages and gets thin content (<200 chars), it uses the injected HeadlessBrowserResolver to render that specific sub-page. This means Aerodrome's sub-pages (which are also SPAs) get rendered properly.

**Important: link extraction from Playwright-rendered landing page.**

DocsSiteCrawler.crawl() calls `fetchRawHtml(url)` to get HTML for link extraction. For SPAs, this returns a JS shell with no useful `<a>` tags. But in the new flow, we already have `rendered.text` from Playwright. The links need to come from somewhere.

**Solution:** Add a `crawlWithRenderedHtml` method or modify `crawl` to accept pre-rendered HTML:

```typescript
/**
 * Crawl a documentation site, optionally using pre-rendered HTML for link extraction.
 * When renderedHtml is provided (from Playwright), use it for link extraction
 * instead of fetching raw HTML via plain HTTP.
 */
async crawl(url: string, landingPageText: string, renderedHtml?: string): Promise<ResolvedContent | null> {
  const crawlStart = Date.now();
  try {
    // Use pre-rendered HTML if provided, otherwise fetch raw
    const rawHtml = renderedHtml ?? await this.fetchRawHtml(url);
    if (!rawHtml) return null;
    // ... rest unchanged
```

But wait — HeadlessBrowserResolver.resolve() returns text, not HTML. We'd need a `resolveHtml()` method or a way to get the rendered DOM HTML.

**Simplest viable approach that doesn't require HeadlessBrowserResolver API changes:**

Skip the link extraction from rendered HTML. Instead, use a hardcoded or pattern-based link discovery for known docs sites. DocsSiteCrawler already has `extractLinks` from raw HTML. For SPAs where raw HTML has no links, fall back to generating candidate URLs from common docs-site URL patterns:

```typescript
/**
 * Generate candidate sub-page URLs for a docs site when HTML link extraction fails.
 * Uses common docs-site URL patterns to guess high-value sub-pages.
 */
private generateCandidateLinks(baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, '');

  const commonSubpages = [
    'overview', 'introduction', 'getting-started', 'how-it-works',
    'architecture', 'protocol', 'tokenomics', 'governance',
    'security', 'risks', 'technical', 'mechanism', 'design',
    'smart-contracts', 'liquidity', 'staking', 'rewards',
    'whitepaper', 'specification', 'audit', 'compliance',
  ];

  return commonSubpages.map(page => `${origin}${basePath}/${page}`);
}
```

Then in `crawl()`, when `extractLinks` returns 0 links, try `generateCandidateLinks`:

```typescript
let links = this.extractLinks(rawHtml, url);
if (links.length === 0 && this.headlessResolver) {
  // SPA shell — no links in raw HTML. Try candidate URLs.
  links = this.generateCandidateLinks(url);
  log.info('No links in raw HTML — using candidate URLs', { url, candidates: links.length });
}
```

Each candidate URL goes through `fetchAndStrip` which has the Playwright fallback — so even SPA sub-pages get rendered.

### Summary of Fix 4 changes:

| File | Change |
|------|--------|
| `DocsSiteCrawler.ts` | Add `isDocsSiteUrl()` static method; constructor accepts optional `headlessResolver`; `fetchAndStrip` Playwright fallback for thin sub-pages; `generateCandidateLinks` for SPA link discovery |
| `CryptoContentResolver.ts` | Route SPA docs sites to DocsSiteCrawler+Playwright before enhanced resolution; pass HeadlessBrowserResolver to DocsSiteCrawler constructor |

---

## Fix 2: Extract URLs from Plain Text (from eval 29 plan v2)

**File:** `src/WpvService.ts`

After `extractFromUnknownFields` block, add plain-text URL extraction. See eval 29 plan v2 for exact code. Key points:
- Only fires for `isPlainText && !requirement.document_url`
- Document-quality filter (PDF, docs path, GitHub, GitBook, arXiv)
- `break` inside the filter (v2 fix)
- `extractFromUnknownFields` can't be reused (hasStandard early return)

No changes from eval 29 plan v2. Copy verbatim.

---

## Fix 3: Nonsense Name + Burn Address (from eval 29 plan v2)

**File:** `src/WpvService.ts`

Split `if (hasDocUrl || hasMeaningfulName)` into separate checks. `hasMeaningfulName` path adds known-protocol gate. See eval 29 plan v2 for exact code. Key points:
- `hasDocUrl` → always soft-strip (unchanged)
- `hasMeaningfulName` → soft-strip only if `KNOWN_PROTOCOL_PATTERN.test(projectName)` matches
- Unknown name + burn address → hard reject
- Includes Pepe/Shiba/Dogecoin/Floki/Bonk in pattern

No changes from eval 29 plan v2. Copy verbatim.

---

## Fix 1: Briefing Backfill Quality Filter

**File:** `src/acp/JobRouter.ts`

**The problem:** The backfill we added calls `getMostRecent()` with no quality filter. During the eval, Grey runs a legitimacy scan → creates a 0-claim entry → backfill immediately pulls it into the briefing → evaluator sees thin entries.

**Find (in handleDailyBriefing):**
```typescript
if (batch.length === 0) {
  log.info('Briefing: no verifications for requested date — backfilling from recent', { requestedDate });
  batch = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE);
}
```

**Replace with:**
```typescript
if (batch.length === 0) {
  log.info('Briefing: no verifications for requested date — backfilling from recent', { requestedDate });
  const recent = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE * 3);
  // Only backfill with entries that have claims — 0-claim entries are L1-only noise
  batch = recent.filter(v => (v.totalClaims as number ?? 0) > 0).slice(0, MAX_BRIEFING_SIZE);
}
```

**Note:** Check whether `v.totalClaims` exists on the verification row type. If the field is named differently (e.g., `total_claims` or stored in a JSON column), Kov needs to adjust. The key is: only include verifications where the pipeline produced actual claims.

**If `totalClaims` isn't on the verification row:** Join with claims table and count:
```typescript
// Alternative if totalClaims isn't directly available:
const recent = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE * 3);
const filtered = [];
for (const v of recent) {
  const claims = await this.deps.claimsRepo.findByWhitepaperId(v.whitepaperId);
  if (claims.length > 0) {
    filtered.push(v);
    if (filtered.length >= MAX_BRIEFING_SIZE) break;
  }
}
batch = filtered;
```

This is less efficient but guaranteed to work with the existing schema.

---

## Fix 4 Implementation Notes for Kov

### Checking HeadlessBrowserResolver availability in CryptoContentResolver

**Kov must check:** Does CryptoContentResolver have access to HeadlessBrowserResolver? Look for:
- A `headlessResolver` property or constructor parameter
- The `enhancedResolve` method — it likely creates or uses a HeadlessBrowserResolver internally

If HeadlessBrowserResolver is internal to `enhancedResolve`, expose it:
```typescript
// In CryptoContentResolver:
private headlessResolver = new HeadlessBrowserResolver();
```

And pass it to DocsSiteCrawler:
```typescript
private docsCrawler = new DocsSiteCrawler(this.headlessResolver);
```

### Rate limiting concern

HeadlessBrowserResolver has a rate limit of 10 per hour. DocsSiteCrawler with Playwright fallback could consume multiple rate limit slots per crawl (1 for landing page + up to 8 for sub-pages = 9 per crawl). This could exhaust the rate limit for a single docs-site crawl.

**Fix:** Either increase the rate limit to 30/hour, or have DocsSiteCrawler's Playwright fallback not count against the rate limit (it's a different usage pattern — controlled crawling of known-safe docs URLs, not arbitrary SPA rendering).

Kov should check whether HeadlessBrowserResolver.resolve() internally calls `recordRateLimitHit()` — if so, the rate limit will be consumed quickly. Consider adding a `resolve(url, { skipRateLimit: true })` option for DocsSiteCrawler usage.

### Memory guard

HeadlessBrowserResolver checks `os.freemem() < 400MB` before launching. After the plugin trim (eval 24), we have ~500-900MB free. A single browser instance for sub-page crawling should be fine. But if multiple crawls happen simultaneously, the memory guard will kick in. For graduation eval (sequential tests), this is not a concern.

---

## Self-Audit

### Issue A: Fix 4 complexity — is this too much change for one eval cycle?

**Problem:** Fix 4 touches 2-3 files and adds a Playwright integration to DocsSiteCrawler. Higher risk than Fixes 1-3.

**Resolution:** The alternative is to keep failing Aerodrome tests indefinitely. The HeadlessBrowserResolver already exists, works, and has been tested (Pendle, eval 22). The integration is straightforward — inject dependency, add fallback in fetchAndStrip, add SPA detection in CryptoContentResolver. The candidate URL generation is the only truly new code.

### Issue B: Candidate URL generation — what if sub-page URLs don't follow the pattern?

**Problem:** `generateCandidateLinks` assumes `{baseUrl}/{subpage}` format. Some docs sites use hashes (`#/overview`), query params (`?page=overview`), or nested paths (`/docs/v1/overview`).

**Resolution:** The candidate URLs are tried optimistically — if a URL 404s or returns thin content, it's skipped (fetchAndStrip returns null, crawl continues to next candidate). The worst case is wasted HTTP requests, not incorrect data. Post-graduation, improve with actual DOM link extraction via Playwright.

### Issue C: Fix 1 backfill filter — could filter out ALL recent entries

**Problem:** If all recent verifications are L1-only (0 claims), the filtered backfill is empty.

**Resolution:** After the DB purge, the remaining entries all have claims (Kov's diagnostic showed Aave 16, Chainlink 10, Lido 14, Uniswap 12). New entries created during the eval may be 0-claim (legitimacy scans are L1-only). The filter correctly excludes these. If everything in the DB is 0-claim, the briefing returns empty — but that's accurate (Grey has no substantive analysis to report).

### Issue D: Fix 2 and Fix 4 interaction — URL extraction + docs crawl

**Problem:** If the evaluator sends "Evaluate Aerodrome docs at https://aerodrome.finance/docs", Fix 2 extracts the URL to `document_url`. `handleFullVerification` sees `hasDocumentUrl = true` → skips cache → runs live pipeline with the URL. CryptoContentResolver fetches the URL → thin content → Fix 4's SPA docs detection fires → DocsSiteCrawler with Playwright. These two fixes work together correctly.

### Issue E: debug log line in scope check

**Problem:** Kov added `logger.info('Scope check fullText', ...)` for debugging. Should be removed before eval.

**Resolution:** Add to Kov's task list: remove debug log line.

---

## DB Changes

**Purge 0-claim entries created during eval 30:**
```sql
-- Remove 0-claim entries from eval 30 that would pollute briefings
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT w.id FROM autognostic.wpv_whitepapers w
  LEFT JOIN autognostic.wpv_claims c ON c.whitepaper_id = w.id
  GROUP BY w.id
  HAVING COUNT(c.id) = 0
);
DELETE FROM autognostic.wpv_whitepapers WHERE id NOT IN (
  SELECT DISTINCT whitepaper_id FROM autognostic.wpv_claims
) AND id NOT IN (
  SELECT DISTINCT whitepaper_id FROM autognostic.wpv_verifications
);
```

**Wait** — this is too aggressive. It would delete seed entries that have verifications but no claims. Better approach:

```sql
-- Only purge entries from eval 30 (today's date, 0 claims)
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT w.id FROM autognostic.wpv_whitepapers w
  LEFT JOIN autognostic.wpv_claims c ON c.whitepaper_id = w.id
  WHERE w.ingested_at >= '2026-04-07T00:00:00Z'
  GROUP BY w.id
  HAVING COUNT(c.id) = 0
);
DELETE FROM autognostic.wpv_whitepapers WHERE ingested_at >= '2026-04-07T00:00:00Z'
AND id NOT IN (SELECT DISTINCT whitepaper_id FROM autognostic.wpv_claims);
```

Actually — with Fix 1's backfill quality filter, 0-claim entries won't appear in briefings anyway. **No purge needed.** The filter handles it.

---

## Files Changed

| File | Change |
|------|--------|
| `src/discovery/DocsSiteCrawler.ts` | `isDocsSiteUrl()` static; constructor accepts HeadlessBrowserResolver; `fetchAndStrip` Playwright fallback; `generateCandidateLinks` for SPA discovery |
| `src/discovery/CryptoContentResolver.ts` | SPA docs detection route before enhanced resolution; pass HeadlessBrowserResolver to DocsSiteCrawler |
| `src/WpvService.ts` | Plain-text URL extraction; known-protocol check in burn-address soft-strip; remove scope check debug log |
| `src/acp/JobRouter.ts` | Backfill quality filter (claim count > 0) |

---

## DB Rules

- No DB purge needed (Fix 1 quality filter handles 0-claim entries)
- No blanket wipes

---

*Forces review requested. Implement in order: Fix 4 → Fix 2 → Fix 3 → Fix 1 → verify + deploy.*
