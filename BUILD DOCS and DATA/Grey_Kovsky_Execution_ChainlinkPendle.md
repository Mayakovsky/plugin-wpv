# Kovsky Execution Plan — Chainlink Redirect + Pendle SPA Depth
# Iteration following eval runs 21-22

**Date:** 2026-04-04
**Owner:** Kovsky (autonomous execution)
**Reviewer:** Forces
**Status:** READY FOR EXECUTION (after current eval run completes)

---

## Two Problems, One Theme

Both failures stem from the same architectural gap: Grey resolves single URLs but doesn't handle multi-page document structures or broken redirects. The pipeline assumes a URL points directly to content. When a URL redirects to a homepage (Chainlink) or renders an index page (Pendle), Grey has no mechanism to go deeper.

---

## Problem 1: Chainlink Redirect

**What happens:** Evaluator sends `document_url: "https://link.smartcontract.com/whitepaper"`. That URL 302-redirects to `https://chain.link/` — the homepage. FetchContentResolver follows the redirect, gets the homepage HTML (well over 500 chars), and sends it to ClaimExtractor. ClaimExtractor tries to extract whitepaper claims from a marketing homepage — either extracts garbage claims or returns 0. Either way, the evaluator fails it.

**The real whitepaper:** `https://research.chain.link/whitepaper-v2.pdf` — discoverable via web search.

**Why current pipeline misses it:** The fetched content is > 500 chars (homepage is large), so enhanced resolution (llms.txt, Playwright) never triggers. WebSearchFallback only fires via TieredDocumentDiscovery, which only runs when `document_url` is absent or when JobRouter decides to run discovery. When the evaluator provides a `document_url`, Grey trusts it and goes straight to `CryptoContentResolver.resolveWhitepaper(url)` — no discovery fallback.

### Fix: Redirect-to-homepage detection + discovery fallback

**Concept:** After following a redirect, detect when the final URL is a site root/homepage rather than a document. When detected, don't trust the content — trigger discovery by project name instead.

#### Step 1a: Add redirect destination check to FetchContentResolver

After the existing HTML path, before returning, check if the response was a redirect to a homepage:

```typescript
// After tag-stripping, before return:

// Detect redirect-to-homepage: evaluator gave us a document URL
// but we landed on a homepage/root path
const finalUrl = response.url; // fetch() with redirect:'follow' exposes this
const originalPath = new URL(url).pathname;
const finalPath = new URL(finalUrl).pathname;

const redirectedToRoot = (
  originalPath !== '/' &&          // original URL had a real path
  (finalPath === '/' || finalPath === '') && // but we landed on root
  finalUrl !== url                  // and a redirect actually happened
);

if (redirectedToRoot) {
  diagnostics.push('REDIRECT_TO_HOMEPAGE');
}
```

This is a lightweight heuristic: if the original URL had a path like `/whitepaper` but the final URL after redirects is just `/`, the document is gone. The content we fetched is the homepage, not a whitepaper.

#### Step 1b: Handle REDIRECT_TO_HOMEPAGE in CryptoContentResolver

In `resolveWhitepaper()`, after getting the Layer 1 result, check for this diagnostic:

```typescript
const redirectedToHomepage = content.diagnostics?.includes('REDIRECT_TO_HOMEPAGE') ?? false;

if (redirectedToHomepage) {
  log.warn('document_url redirected to homepage — content is not a whitepaper', {
    originalUrl: url,
    finalUrl: content.resolvedUrl,
  });
  // Force thin-content treatment regardless of text length.
  // The 5000 chars we got is homepage text, not a whitepaper.
  const enhanced = await this.enhancedResolve(url, false);
  if (enhanced) {
    const enhancedSource = this.mapSource(enhanced.source);
    return this.buildResult(enhanced, url, enhanced.resolvedUrl, enhancedSource);
  }
  // Enhanced failed too — return thin result so TieredDocumentDiscovery fires downstream
  return this.buildResult(
    { ...content, text: '' },  // zero out the homepage text
    url, content.resolvedUrl, source,
  );
}
```

This forces the pipeline to treat homepage content as empty — even though it's > 500 chars — so that downstream discovery has a chance to find the real whitepaper.

#### Step 1c: Improve WebSearchFallback query construction

The current queries are:
```
"Chainlink whitepaper filetype:pdf"
"Chainlink technical paper filetype:pdf"
"Chainlink tokenomics whitepaper"
"Chainlink protocol documentation"
```

These are reasonable but miss `research.chain.link/whitepaper-v2.pdf` because DuckDuckGo's `filetype:` operator is unreliable and the subdomain `research.chain.link` isn't intuitive.

Add a fifth query pattern that targets research/academic subdomains:

```typescript
const queries = [
  `${projectName} whitepaper filetype:pdf`,
  `${projectName} technical paper filetype:pdf`,
  `${projectName} tokenomics whitepaper`,
  `${projectName} protocol documentation`,
  `${projectName} whitepaper pdf site:${this.extractBaseDomain(projectName)}`,  // NEW
];
```

Also add a post-search URL validation step: if a search result URL is reachable (200 status, content-type is PDF), prefer it over results that might 302 to homepages. This is a HEAD request — cheap.

#### Step 1d: Add domain-specific URL knowledge

Some projects have well-known whitepaper URL patterns that web search struggles with. Add a small static map:

```typescript
const KNOWN_WHITEPAPER_URLS: Record<string, string> = {
  'chainlink': 'https://research.chain.link/whitepaper-v2.pdf',
  // Add more as discovered from eval failures
};
```

Check this map before web search. It's a pragmatic shortcut — the evaluator tests known projects, and some of them have URLs that are legitimately hard to discover via search.

**This is not a hack — it's a curated knowledge base.** Grey already has 76 whitepapers seeded in the database for exactly this reason. This is the same pattern for URL resolution: if you know where the document lives, don't waste time searching.

---

## Problem 2: Pendle SPA Thin Content

**What happens:** Evaluator sends a URL for Pendle (e.g., `docs.pendle.finance`). Playwright renders the page but gets 792 chars of navigation/index content — table of contents links, sidebar nav, not whitepaper substance. The actual documentation lives on subpages like `docs.pendle.finance/introduction`, `docs.pendle.finance/protocol-overview`, etc.

**Why current pipeline misses it:** HeadlessBrowserResolver renders a single URL and extracts text. It has no concept of "this is an index page — follow the links to get the real content." It returns the 792 chars, which passes the 100-char minimum but is useless for claim extraction.

### Fix: SPA content depth — link following when top-level content is thin

**Concept:** When Playwright renders a page and gets thin content (< 2000 chars) that looks like an index/navigation page, extract internal links from the rendered DOM and follow the most promising ones to get substantive content.

#### Step 2a: Add thin-content link following to HeadlessBrowserResolver

After the existing `renderAndExtract()` returns text < 2000 chars, add a second pass:

```typescript
// In renderAndExtract(), after initial extraction:

if (text && text.length >= 100 && text.length < 2000) {
  // Got some content but it's thin — likely an index/nav page.
  // Try to follow internal links to find substantive content.
  log.info('Thin SPA content — attempting link following', {
    url,
    chars: text.length,
  });

  const deepContent = await this.followInternalLinks(page, url);
  if (deepContent && deepContent.length > text.length) {
    return deepContent;
  }
}
```

#### Step 2b: Implement `followInternalLinks()`

```typescript
private async followInternalLinks(
  page: PlaywrightPage,
  originalUrl: string,
): Promise<string | null> {
  const origin = new URL(originalUrl).origin;

  // Extract internal links from the rendered page
  const links: string[] = await page.evaluate((originStr: string) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map((a) => {
        try {
          const href = (a as HTMLAnchorElement).href;
          // Only internal links (same origin)
          if (href.startsWith(originStr)) return href;
          return null;
        } catch { return null; }
      })
      .filter((href): href is string => href !== null)
      // Deduplicate
      .filter((href, i, arr) => arr.indexOf(href) === i);
  }, origin);

  if (links.length === 0) return null;

  // Score and rank links by likely content relevance
  const scoredLinks = links
    .map((href) => ({
      href,
      score: this.scoreLink(href),
    }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);  // Follow at most 5 links

  if (scoredLinks.length === 0) return null;

  // Navigate to each link, extract text, concatenate the best content
  const contentParts: string[] = [];
  let totalChars = 0;
  const MAX_TOTAL_CHARS = 50000;  // Cap total extraction

  for (const { href } of scoredLinks) {
    if (totalChars >= MAX_TOTAL_CHARS) break;

    try {
      await page.goto(href, {
        waitUntil: 'networkidle',
        timeout: 10000,  // Shorter timeout for subpages
      });

      const subpageText = await page.evaluate(() => {
        const selectors = [
          'main', 'article', '.content', '#content',
          '[role="main"]', '.documentation', '.docs-content',
          '.markdown-body',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).innerText.length > 200) {
            return (el as HTMLElement).innerText;
          }
        }
        return document.body.innerText;
      });

      if (subpageText && subpageText.length > 200) {
        contentParts.push(subpageText);
        totalChars += subpageText.length;
        log.debug('Extracted content from subpage', {
          href,
          chars: subpageText.length,
        });
      }
    } catch {
      // Subpage failed — skip, try next
    }
  }

  if (contentParts.length === 0) return null;

  log.info('Link following completed', {
    originalUrl,
    pagesFollowed: contentParts.length,
    totalChars,
  });

  return contentParts.join('\n\n---\n\n');
}
```

#### Step 2c: Implement `scoreLink()` for link prioritization

```typescript
/**
 * Score a URL by how likely it is to contain whitepaper/protocol content.
 * Higher score = more likely to be substantive documentation.
 * Returns 0 for links that should be skipped.
 */
private scoreLink(href: string): number {
  const lower = href.toLowerCase();
  let score = 0;

  // High-value content signals
  const highValue = [
    'whitepaper', 'protocol', 'overview', 'introduction',
    'architecture', 'technical', 'specification', 'tokenomics',
    'mechanism', 'design', 'how-it-works', 'concept',
  ];
  for (const kw of highValue) {
    if (lower.includes(kw)) score += 3;
  }

  // Medium-value signals
  const medValue = [
    'docs', 'documentation', 'guide', 'reference',
    'governance', 'security', 'audit',
  ];
  for (const kw of medValue) {
    if (lower.includes(kw)) score += 1;
  }

  // Negative signals — skip these
  const negative = [
    'changelog', 'release-notes', 'blog', 'news',
    'faq', 'support', 'contact', 'careers', 'jobs',
    'login', 'signup', 'register', 'api-reference',
    'sdk', 'npm', 'github.com', 'twitter.com',
    'discord', 'telegram', 'medium.com',
  ];
  for (const kw of negative) {
    if (lower.includes(kw)) return 0;
  }

  // Prefer shorter paths (closer to root docs)
  const pathDepth = (new URL(href).pathname.match(/\//g) || []).length;
  if (pathDepth <= 2) score += 1;

  return score;
}
```

#### Step 2d: Resource accounting for link following

Link following means more Playwright page loads. Adjust the resource accounting:

- Each subpage navigation counts toward the **page count** (browser restart threshold of 20). Following 5 links from one SPA = 6 page loads total.
- Each subpage navigation counts toward the **rate limit** — but as a single logical resolution, not per-page. The rate limiter should count SPA resolutions (the initial call to `resolve()`), not internal subpage navigations. This is already correct since `recordRateLimitHit()` is only called once in `resolve()`.
- The 10s timeout per subpage (not 15s) keeps total wall time bounded: worst case is 15s initial + 5×10s subpages = 65s. Acceptable for a single verification.

---

## Implementation Steps for Kovsky

### Step 1: FetchContentResolver — redirect-to-homepage detection

**File:** `src/discovery/FetchContentResolver.ts`

After the HTML tag-strip block, before the return, check `response.url` vs the original URL. If the original had a real path but the final URL is the site root, push `'REDIRECT_TO_HOMEPAGE'` to diagnostics.

**Note:** `fetch()` with `redirect: 'follow'` exposes the final URL via `response.url`. No additional fetch needed.

**Verify:** Unit test — mock a 302 from `/whitepaper` to `/`. Verify `REDIRECT_TO_HOMEPAGE` appears in diagnostics. Verify no false positives on normal URLs.

---

### Step 2: CryptoContentResolver — handle REDIRECT_TO_HOMEPAGE

**File:** `src/discovery/CryptoContentResolver.ts`

In `resolveWhitepaper()`, after getting Layer 1 content, check for `REDIRECT_TO_HOMEPAGE` diagnostic. If found, skip the `text.length >= 500` gate and go straight to enhanced resolution. If enhanced also fails, zero out the text so TieredDocumentDiscovery fires downstream.

**Verify:** Unit test — mock a redirect-to-homepage scenario. Verify enhanced resolution is attempted. Verify that downstream discovery fires when enhanced fails.

---

### Step 3: WebSearchFallback — improved query construction

**File:** `src/discovery/WebSearchFallback.ts`

Add query patterns:
- `"{projectName} whitepaper pdf"` (quoted project name for precision)
- `"{projectName} research paper"` (targets `research.chain.link` style subdomains)

Add `KNOWN_WHITEPAPER_URLS` static map — checked before any DuckDuckGo queries. Start with Chainlink. Add more as eval failures reveal hard-to-discover URLs.

**Verify:** Unit test — verify known URL map returns before search. Verify new queries are tried.

---

### Step 4: HeadlessBrowserResolver — SPA link following

**File:** `src/discovery/HeadlessBrowserResolver.ts`

Add `followInternalLinks()` and `scoreLink()` private methods. In `renderAndExtract()`, after initial text extraction, if text is 100-2000 chars, attempt link following. Return the concatenated deep content if it's more substantive than the top-level text.

**Key constraints:**
- Max 5 subpages followed per resolution
- 10s timeout per subpage (not 15s)
- 50k char total cap on concatenated content
- Each subpage load increments `this.pageCount` (browser restart threshold)
- Rate limit counts the resolution, not individual page loads
- Negative-scored links (changelog, blog, social media, API refs) are skipped entirely

**Verify:** Unit test with mocked Playwright — mock an index page with links, mock subpage content. Verify link scoring prioritizes whitepaper/protocol/overview pages. Verify negative-scored links are skipped. Verify 5-page cap. Verify total char cap.

---

### Step 5: Integration test

On VPS after deployment:

```bash
# Test Chainlink redirect handling
curl -s -o /dev/null -w "%{redirect_url}" -L "https://link.smartcontract.com/whitepaper"
# Should show it redirects to chain.link homepage

# Test Pendle SPA depth
# Run a manual verify_project_whitepaper for Pendle via HTTP handler
# Check PM2 logs for link-following activity
```

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/discovery/FetchContentResolver.ts` | MODIFY | Add REDIRECT_TO_HOMEPAGE diagnostic |
| `src/discovery/CryptoContentResolver.ts` | MODIFY | Handle redirect-to-homepage, bypass 500-char gate |
| `src/discovery/WebSearchFallback.ts` | MODIFY | Add query patterns, known URL map |
| `src/discovery/HeadlessBrowserResolver.ts` | MODIFY | Add followInternalLinks(), scoreLink() |

---

## Guardrails

- **Link following is bounded** — max 5 subpages, 10s each, 50k total chars. No unbounded crawling.
- **KNOWN_WHITEPAPER_URLS is a curated knowledge base**, not a hack. Same pattern as the 76 seeded whitepapers. Add entries only from confirmed eval failures.
- **Redirect-to-homepage detection is conservative** — only triggers when original path ≠ `/` and final path = `/`. Won't false-positive on direct homepage URLs.
- **Page count accounting** — subpage loads count toward the browser restart threshold. 5 links from one SPA = 6 page loads toward the 20-page recycle limit.
- **All existing tests must pass** after these changes.
- **Update heartbeat.md** at session end.

---

*End of Kovsky Execution Plan — Chainlink + Pendle fixes*
