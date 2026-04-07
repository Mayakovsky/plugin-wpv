# Kovsky Execution Plan — Fix 4: Playwright Integration in DocsSiteCrawler

> **Date:** 2026-04-07
> **Author:** Kovsky (for Forces review)
> **Goal:** SPA docs sites (Aerodrome, etc.) produce meaningful content instead of 17-char shells.
> **Depends on:** Eval 30 fixes deployed (briefing quality filter, plain-text URL extraction, burn+nonsense rejection)

---

## The Problem

Aerodrome's docs site (`aerodrome.finance/docs`) is a JavaScript SPA. The current flow:

1. `FetchContentResolver` fetches with plain HTTP → 17 chars (JS shell)
2. Content is below `THIN_CONTENT_THRESHOLD` (500) → falls to enhanced resolution
3. `enhancedResolve` → llms.txt (no) → site-specific (no) → HeadlessBrowserResolver (SPA detected)
4. HeadlessBrowserResolver renders the page, gets ~400 chars (navigation shell)
5. 400 chars < `THIN_SPA_THRESHOLD` (2000) → `followInternalLinks` fires
6. `followInternalLinks` extracts DOM links, scores them, follows up to 5 sub-pages
7. Sub-pages are also SPAs → Playwright renders each one in the same browser context
8. Result: some content, but thin — lands in DB as 0-claim L1-only entry

**The problem is NOT that Playwright can't render Aerodrome.** It's that the content HeadlessBrowserResolver collects goes through the wrong path. It returns from `enhancedResolve` as a `ResolvedContent`, and CryptoContentResolver returns it directly — **DocsSiteCrawler never sees it**. The 8-page crawl with section labels and scoring never happens.

Meanwhile, `DocsSiteCrawler.isDocsSite()` requires 200-10000 chars of text — but the HTTP fetch only got 17. So the docs-site detection at line 75 of CryptoContentResolver never fires.

**Two sub-problems to solve:**

1. CryptoContentResolver doesn't route SPA docs content through DocsSiteCrawler
2. DocsSiteCrawler extracts links from raw HTML — SPA shells have no `<a>` tags in raw HTML

---

## The Fix: Three Changes

### Change 1: URL-based docs-site detection

**File:** `src/discovery/DocsSiteCrawler.ts`

Add `isDocsSiteUrl()` — detects docs sites by URL pattern alone, no text length required. The existing `isDocsSite()` requires 200-10000 chars which SPA shells never reach.

```typescript
/**
 * Detect docs sites by URL pattern when text-based detection fails (SPA shells).
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
    if (pathname.startsWith('/docs/') || pathname === '/docs') return true;
    if (pathname.startsWith('/documentation')) return true;
    if (pathname.startsWith('/wiki')) return true;
    return false;
  } catch { return false; }
}
```

**Placement:** Static method on `DocsSiteCrawler`, right after the existing `isDocsSite()` method.

---

### Change 2: SPA docs routing in CryptoContentResolver

When `enhancedResolve` returns content for a URL that matches `isDocsSiteUrl()`, route that content through DocsSiteCrawler instead of returning it directly. DocsSiteCrawler crawls 8 pages with section labels and scoring vs HeadlessBrowserResolver's 5 pages with no structure.

**File:** `src/discovery/CryptoContentResolver.ts`

**Find (line ~97):**
```typescript
const enhanced = await this.enhancedResolve(url, isSpaDetected);
if (enhanced) {
  const enhancedSource = this.mapSource(enhanced.source);
  return this.buildResult(enhanced, url, enhanced.resolvedUrl, enhancedSource);
}
```

**Replace with:**
```typescript
const enhanced = await this.enhancedResolve(url, isSpaDetected);
if (enhanced) {
  // If enhanced resolution returned content for a docs-site URL,
  // route through DocsSiteCrawler for comprehensive sub-page crawling.
  // HeadlessBrowserResolver's followInternalLinks gets ~5 pages with no section labels;
  // DocsSiteCrawler gets 8 pages with scored links and section structure.
  if (DocsSiteCrawler.isDocsSiteUrl(url) && enhanced.text.length >= 200) {
    log.info('SPA docs site — routing enhanced content through DocsSiteCrawler', {
      url, enhancedChars: enhanced.text.length,
    });
    const crawled = await this.docsCrawler.crawl(url, enhanced.text);
    if (crawled && crawled.text.length > enhanced.text.length * 1.5) {
      return this.buildResult(crawled, url, crawled.resolvedUrl ?? url, 'docs-crawl');
    }
  }
  const enhancedSource = this.mapSource(enhanced.source);
  return this.buildResult(enhanced, url, enhanced.resolvedUrl, enhancedSource);
}
```

**Also wire HeadlessBrowserResolver into DocsSiteCrawler (line 29):**

```typescript
// Change:
private docsCrawler = new DocsSiteCrawler();
// To:
private docsCrawler = new DocsSiteCrawler(this.headlessBrowser);
```

---

### Change 3: Playwright fallback in DocsSiteCrawler

DocsSiteCrawler currently uses plain HTTP for everything. SPA sub-pages return JS shells via plain HTTP. Two additions:

#### 3A. Constructor accepts optional HeadlessBrowserResolver

```typescript
export class DocsSiteCrawler {
  constructor(
    private headlessResolver?: { resolve: (url: string) => Promise<ResolvedContent | null> } | null,
  ) {}
```

#### 3B. `fetchAndStrip` falls back to Playwright when HTTP returns thin content

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
        log.info('Playwright fallback for sub-page', { url, chars: rendered.text.length });
        return rendered.text;
      }
    } catch {
      // Playwright failed — return whatever we got from HTTP
    }
  }
  return html ? this.stripHtml(html) : null;
}
```

#### 3C. Link extraction falls back to Playwright-rendered text when raw HTML has no links

DocsSiteCrawler extracts links from raw HTML via `extractLinks()`. For SPAs, raw HTML has no useful `<a>` tags — they're only in the DOM after JS executes.

**In `crawl()`, after `extractLinks` returns, add fallback:**

```typescript
let links = this.extractLinks(rawHtml, url);

// SPA shell — no links in raw HTML. Try Playwright-rendered text for URL extraction.
if (links.length === 0 && this.headlessResolver) {
  const rendered = await this.headlessResolver.resolve(url);
  if (rendered && rendered.text) {
    // HeadlessBrowserResolver.resolve() returns text, not HTML.
    // Extract URLs that appear in the rendered text output.
    const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
    const textUrls = rendered.text.match(urlPattern) ?? [];
    const origin = new URL(url).origin;
    const seen = new Set<string>([url.split('#')[0]]);
    for (const u of textUrls) {
      try {
        const canonical = new URL(u).href.split('#')[0];
        if (canonical.startsWith(origin) && !seen.has(canonical)) {
          seen.add(canonical);
          links.push(canonical);
        }
      } catch { continue; }
    }
    log.info('Extracted links from Playwright-rendered text', { url, linkCount: links.length });
  }
}
```

**Why text-based URL extraction instead of DOM link extraction:** HeadlessBrowserResolver.resolve() returns `text` (via `document.body.innerText`), not HTML. Adding a `resolveHtml()` method would require deeper API changes. URLs from `innerText` aren't perfect — some internal links may not appear as full URLs in the text. But for docs sites, navigation links typically render as visible text. This is good enough for graduation; post-graduation we can add proper DOM extraction.

---

### Change 4: Rate limit increase

**File:** `src/discovery/HeadlessBrowserResolver.ts`

```typescript
// Change:
const RATE_LIMIT_PER_HOUR = 10;
// To:
const RATE_LIMIT_PER_HOUR = 30;
```

**Why:** DocsSiteCrawler with Playwright fallback could consume: 1 render for landing page link extraction (3C) + up to 8 renders for sub-pages (3B) = 9 renders per crawl. At 10/hour, a single docs-site crawl nearly exhausts the budget. 30/hour supports 3 full crawls per hour with headroom.

**Why safe:** VPS has ~500MB free RAM after plugin trim. HeadlessBrowserResolver reuses a single browser instance. The rate limit was set conservatively pre-graduation.

---

## Execution Flow for Aerodrome (after fix)

1. Known URL map → `aerodrome.finance/docs`
2. HTTP fetch → 17 chars → thin content
3. `enhancedResolve` → HeadlessBrowserResolver renders SPA → ~2000 chars from followInternalLinks
4. **NEW:** `isDocsSiteUrl("aerodrome.finance/docs")` → true, 2000 >= 200
5. **NEW:** DocsSiteCrawler.crawl() called with Playwright-rendered text as landingPageText
6. **NEW:** `extractLinks` on raw HTML → 0 links → Playwright fallback renders page → extracts URLs from text
7. **NEW:** Scored links followed via `fetchAndStrip` → each sub-page uses Playwright fallback when HTTP is thin
8. Result: 8 sub-pages crawled with section labels → 20-40k chars → L2 claim extraction succeeds → substantive claims in DB

---

## Files Changed

| File | Change |
|------|--------|
| `src/discovery/DocsSiteCrawler.ts` | `isDocsSiteUrl()` static method; constructor accepts optional HeadlessBrowserResolver; `fetchAndStrip` Playwright fallback for thin sub-pages; Playwright-based link extraction fallback in `crawl()` |
| `src/discovery/CryptoContentResolver.ts` | SPA docs routing after `enhancedResolve` returns; pass `headlessBrowser` to DocsSiteCrawler constructor |
| `src/discovery/HeadlessBrowserResolver.ts` | `RATE_LIMIT_PER_HOUR` 10 → 30 |

---

## Self-Audit

### Issue A: Double Playwright render for landing page

**Problem:** Change 2 routes content from `enhancedResolve` (which already used Playwright) to DocsSiteCrawler. Change 3C then calls `this.headlessResolver.resolve(url)` AGAIN for link extraction. That's 2 Playwright renders of the same landing page.

**Resolution:** Acceptable. The first render (in enhancedResolve) returns text for the landing page content. The second render (in 3C) is needed to extract URLs from the rendered DOM text since we don't cache the first render's output. Post-graduation, add a render cache keyed by URL with 5-minute TTL. For graduation, 2 renders at ~2s each is 4s overhead — negligible against the 5-minute SLA.

### Issue B: Text-based URL extraction may miss links

**Problem:** `innerText` renders links as visible text, but some SPA navigation uses icons, images, or CSS-hidden text. URLs may not appear in `innerText` output.

**Resolution:** For docs sites specifically, navigation is almost always text-based (sidebar menus, breadcrumbs). Aerodrome's docs use Docusaurus-style text navigation. If text extraction misses some links, the crawler still gets the links it does find — partial coverage is better than zero. The existing `scoreLink()` scoring ensures the best links are prioritized.

### Issue C: Rate limit with concurrent eval tests

**Problem:** The evaluator sends multiple jobs simultaneously. If two docs-site crawls fire at once, they could consume 18 of 30 rate limit slots.

**Resolution:** The evaluator tests sequentially within each offering category. Two simultaneous docs-site crawls would require two different offerings testing docs sites at the same time — unlikely but possible. At 30/hour, two full crawls (18 renders) leaves 12 for other SPA rendering. Acceptable for eval and production workloads.

### Issue D: DocsSiteCrawler.crawl() returns null when 0 sub-pages contribute

**Problem:** If Playwright link extraction finds links but all sub-page fetches fail or return thin content, `parts.length <= 1` and crawl returns null. CryptoContentResolver then falls back to the enhanced content (the Playwright-rendered landing page).

**Resolution:** This is correct fallback behavior. The enhanced content from HeadlessBrowserResolver is still returned — the user gets something. The DocsSiteCrawler just didn't improve on it. Not a failure, just no improvement.

### Issue E: Existing tests

**Problem:** DocsSiteCrawler tests use mock HTTP. The Playwright fallback is behind `if (this.headlessResolver)` — since existing tests construct `new DocsSiteCrawler()` with no argument, `headlessResolver` is undefined and all fallback paths are skipped. Tests pass unchanged.

**Resolution:** No existing test changes needed. New tests for the Playwright fallback path should be added post-graduation with a mocked HeadlessBrowserResolver.

---

## DB Rules

- No DB changes needed
- No purges required
- New entries created during eval will have claims if Fix 4 works → briefing quality filter allows them

---

*Pending Forces review. Implement as: Change 1 → Change 3A → Change 3B → Change 3C → Change 2 → Change 4 → build → test → deploy.*
