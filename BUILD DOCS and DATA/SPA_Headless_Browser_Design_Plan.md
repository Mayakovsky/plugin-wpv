# Design Plan: Headless Browser for SPA Whitepaper Extraction

**Date:** 2026-04-04
**Author:** Kovsky (Claude Opus 4.6)
**Status:** DRAFT — For Forces review and strengthening
**Priority:** HIGH — blocking graduation (MakerDAO SPA failure in eval run 20)

---

## 1. Problem Statement

Grey's document extraction pipeline (`FetchContentResolver`) uses plain HTTP fetch + HTML tag stripping. This works for:
- PDFs (binary → pdf-parse)
- Static HTML pages (tag strip → text)
- Raw text/markdown files

It fails for **JavaScript Single Page Applications (SPAs)** where content is rendered client-side. The initial HTML response contains only a shell (`<div id="root"></div>` + `<script>` bundles) with no extractable text.

### Evidence from Graduation Eval

**Job 1003326062:** `https://makerdao.com/whitepaper/`
- FetchContentResolver returned near-empty text after tag stripping
- ClaimExtractor received insufficient content → 0 claims
- Discovery fallback (DuckDuckGo) → Tier 4 composed whitepaper → also 0 claims
- Evaluator rejected: "The provided URL contains a highly detailed and technical whitepaper... The agent failed to process a valid and content-rich document"

### Prevalence

SPAs are increasingly common for crypto project documentation:
- MakerDAO/Sky: `makerdao.com/whitepaper/` (React SPA)
- Many GitBook-hosted docs render client-side
- Notion-exported pages
- Next.js/Nuxt.js marketing sites with embedded whitepapers
- docs.aave.com, docs.compound.finance, etc.

This is not an edge case — it's a growing gap.

---

## 2. Proposed Solution: Playwright Headless Browser

### Why Playwright

| Option | Pros | Cons |
|--------|------|------|
| **Playwright** | Chromium-based, handles all modern JS frameworks, Bun-compatible, well-maintained | ~200MB disk, 2-5s per page render |
| Puppeteer | Similar to Playwright | Larger install, less Bun-friendly |
| JSDOM | Lightweight, no browser binary | Cannot execute modern JS frameworks (React, Vue, Svelte) |
| Cheerio | Very fast HTML parsing | Zero JS execution — same limitation as current approach |
| External API (browserless.io) | No local install | Adds external dependency, latency, cost |

**Playwright is the right choice** — it's the only option that actually renders SPAs while being compatible with the Bun/Node.js stack.

---

## 3. Architecture

### 3.1 Integration Point

```
CryptoContentResolver.resolveWhitepaper(url)
  → FetchContentResolver.resolve(url)        // Current: fetch + tag strip
  → IF text.length < SPA_THRESHOLD (500 chars)
      → HeadlessBrowserResolver.resolve(url)  // NEW: Playwright render + extract
```

The headless browser is a **fallback**, not a replacement. Most URLs work fine with plain fetch. Only URLs that return near-empty text (SPA signature) escalate to the browser.

### 3.2 New File: `src/discovery/HeadlessBrowserResolver.ts`

```typescript
interface HeadlessBrowserOptions {
  timeoutMs?: number;      // Max wait for page load (default: 15000)
  waitForSelector?: string; // CSS selector to wait for (default: 'main, article, .content')
  maxContentLength?: number; // Truncate extracted text (default: 100000)
}

class HeadlessBrowserResolver {
  private browser: Browser | null = null;

  async resolve(url: string, options?: HeadlessBrowserOptions): Promise<ResolvedContent> {
    // 1. Launch browser (reuse instance across calls)
    // 2. Open page with URL
    // 3. Wait for content to render (networkidle or selector)
    // 4. Extract text from rendered DOM
    // 5. Return ResolvedContent with source: 'spa'
  }

  async close(): void {
    // Clean shutdown of browser instance
  }
}
```

### 3.3 SPA Detection Heuristic

In `FetchContentResolver`, after the existing HTML extraction:

```typescript
const text = /* existing tag-strip logic */;

// SPA detection: if HTML fetch yielded very little text but the page
// had script tags, it's likely a client-rendered SPA
const hasScriptTags = body.includes('<script');
const isSPA = text.length < 500 && hasScriptTags;

if (isSPA) {
  return {
    text: '',
    contentType: 'text/html',
    source: 'spa_detected',  // Signal to caller to try headless
    resolvedUrl: url,
    diagnostics: ['SPA detected — content rendered by JavaScript'],
  };
}
```

### 3.4 CryptoContentResolver Integration

```typescript
async resolveWhitepaper(url: string): Promise<ResolvedWhitepaper> {
  const content = await this.fetchResolver.resolve(url);

  // Escalate to headless browser if SPA detected
  if (content.source === 'spa_detected' && this.headlessBrowser) {
    const rendered = await this.headlessBrowser.resolve(url);
    return this.buildResult(rendered);
  }

  return this.buildResult(content);
}
```

---

## 4. Text Extraction Strategy

Once Playwright renders the page, extract text using:

```typescript
// Option A: innerText of body (preserves visual layout)
const text = await page.evaluate(() => document.body.innerText);

// Option B: Targeted extraction (more precise, less noise)
const text = await page.evaluate(() => {
  const selectors = ['main', 'article', '.content', '.whitepaper', '#content', '[role="main"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 200) return el.innerText;
  }
  return document.body.innerText;
});
```

**Recommendation:** Option B with Option A fallback. Targeted extraction avoids nav/footer/cookie-banner noise.

---

## 5. Resource Management

### 5.1 Browser Lifecycle

- **Lazy init:** Browser launches only on first SPA URL, not at startup
- **Shared instance:** Single browser process, reused across all SPA resolutions
- **Graceful shutdown:** Close browser when WpvService stops
- **Context isolation:** Each page gets a fresh `BrowserContext` (no cookie/state leakage)

### 5.2 Resource Limits

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Page load timeout | 15s | SPAs should render within this; longer = broken site |
| Max concurrent pages | 1 | Sequential queue prevents memory spikes |
| Max text extraction | 100k chars | Matches existing `text.slice(0, 50000)` in ClaimExtractor × 2 buffer |
| Browser restart threshold | 50 pages | Prevent memory leaks in long-running Chromium |

### 5.3 VPS Impact

- **Disk:** Playwright Chromium binary ~200MB (one-time install via `bun add playwright-core` + browser download)
- **RAM:** ~100-200MB per browser instance (acceptable on Lightsail)
- **CPU:** Brief spike during page render (2-5s), idle otherwise
- **Network:** Standard HTTP fetches, no additional external dependencies

---

## 6. Security Considerations

| Risk | Mitigation |
|------|------------|
| Malicious JavaScript execution | Browser runs in sandboxed Chromium process; no access to Node.js APIs or filesystem |
| Redirect chains to phishing sites | Limit redirects to 5; validate final URL domain |
| Resource exhaustion (crypto miners in JS) | 15s timeout + kill page after extraction |
| Cookie tracking / fingerprinting | Fresh BrowserContext per page, no persistence |
| file:// or javascript: URLs | Already blocked by URL protocol whitelist in WpvService validator |

---

## 7. Fallback Chain (Complete)

After implementation, the full document resolution chain becomes:

```
1. FetchContentResolver (plain HTTP)
   → PDF detected? → pdf-parse → DONE
   → HTML with text > 500 chars? → tag-strip → DONE
   → HTML with text < 500 chars + <script> tags? → SPA DETECTED

2. HeadlessBrowserResolver (Playwright)
   → Render page, wait for content
   → Extract text from rendered DOM
   → Text > 100 chars? → DONE
   → Still empty? → FALL THROUGH

3. TieredDocumentDiscovery (existing)
   → Tier 1: PDF/IPFS from metadata
   → Tier 2: WebsiteScraper link extraction
   → Tier 3: DuckDuckGo web search
   → Tier 4: Composed whitepaper from metadata
```

---

## 8. Testing Strategy

### Unit Tests
- Mock Playwright `page.evaluate()` to return known text
- Test SPA detection heuristic with real SPA HTML shells
- Test fallback chain: fetch → SPA detected → headless → text extracted

### Integration Tests
- Live test against `makerdao.com/whitepaper/` (known SPA)
- Live test against `docs.aave.com` (GitBook SPA)
- Verify PDF URLs still bypass headless browser (no regression)
- Verify static HTML pages still bypass headless browser

### VPS Smoke Test
- Install Playwright on VPS
- Run single SPA extraction
- Verify memory usage stays under 300MB
- Verify no orphaned Chromium processes after extraction

---

## 9. Implementation Estimate

| Task | Effort |
|------|--------|
| Install Playwright + browser binary | 15 min |
| `HeadlessBrowserResolver.ts` | 2 hours |
| SPA detection in `FetchContentResolver.ts` | 30 min |
| Integration in `CryptoContentResolver.ts` | 30 min |
| Browser lifecycle in `WpvService.ts` | 30 min |
| Unit tests | 1 hour |
| Integration tests + VPS smoke test | 1 hour |
| **Total** | **~6 hours** |

---

## 10. Dependencies

```json
{
  "playwright-core": "^1.45.0"
}
```

Note: `playwright-core` (not `playwright`) — avoids bundling test runner. Browser binary installed separately via `npx playwright install chromium`.

---

## 11. Open Questions for Forces

1. **Should the headless browser be optional?** If Playwright isn't installed, Grey falls through to existing discovery. This keeps the dependency soft.

2. **Should we cap the number of SPA resolutions per hour?** Browser rendering is expensive. A malicious buyer could send many SPA URLs to burn server resources.

3. **Should we charge more for SPA-resolved verifications?** The compute cost is higher than plain PDF extraction. This could justify a price differential on `verify_project_whitepaper`.

4. **Alternative: server-side rendering proxy?** Instead of running Playwright locally, use a cloud rendering service (browserless.io, ScrapingBee). Trades local resource usage for external dependency + per-request cost (~$0.001/page).

5. **GitBook/Notion special handling?** Both have APIs that return structured content without browser rendering. A site-specific handler registry could be faster and more reliable than Playwright for known documentation platforms.

---

*This plan addresses the MakerDAO SPA failure from eval run 20. Forces should review security considerations, resource impact on VPS, and the open questions before implementation begins.*
