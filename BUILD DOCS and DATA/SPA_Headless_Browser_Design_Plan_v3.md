# Design Plan v3: Enhanced Document Resolution Pipeline
# llms.txt + Site Handlers + Headless Browser for SPA Extraction

**Date:** 2026-04-04
**Version:** 3.0 (supersedes v2 — fixes 12 identified issues)
**Authors:** Kovsky (v1 draft), Forces (architectural decisions), Claude Opus (v2 revision, v3 audit)
**Status:** APPROVED — Ready for Kovsky implementation
**Priority:** HIGH — blocking graduation (MakerDAO SPA failure in eval run 20)

---

## Changelog: v2 → v3

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 1 | BUG | `ResolvedWhitepaper.source` type doesn't include new sources | Extended type union, extended `buildResult` signature |
| 2 | BUG | `buildResult` called with `'enhanced'` which doesn't compile | Source passthrough from resolved content layer |
| 3 | BUG | Playwright redirect counter counts subresource 3xx, not just navigation | Switched to `request.isNavigationRequest()` filter |
| 4 | BUG | SPA detection references `rawHtml` — actual var is `body` | Fixed to `body` matching FetchContentResolver |
| 5 | BUG | SiteSpecificRegistry `hostname.includes(pattern)` matches substrings | Changed to `hostname === pattern \|\| hostname.endsWith('.' + pattern)` |
| 6 | LOGIC | Pipeline trigger: Section 2.1 says SPA markers, Section 7 checks text length only | Reconciled: cheap layers trigger on thin content, Playwright gated by SPA detection |
| 7 | LOGIC | Source attribution lost — `'enhanced'` overwrites actual resolution method | Passthrough of actual source: `'llms-txt'`, `'site-specific-*'`, `'headless-browser'` |
| 8 | LOGIC | llms.txt content-type not validated — HTML error pages accepted as markdown | Added HTML content guard |
| 9 | LOGIC | llms.txt index-only files sent to ClaimExtractor waste tokens | Raised minimum threshold for bare `llms.txt` to 1000 chars; `llms-full.txt` stays at 200 |
| 10 | LOGIC | SPA detection signal not passed to Playwright — fires for all thin pages | `enhancedResolve` now receives SPA detection flag; Playwright gated by it |
| 11 | REDUNDANCY | Soft dependency code shown twice (Section 5.2 and constructor) | Removed standalone snippet, kept constructor pattern only |
| 12 | MISSING | llms.txt/SiteSpecific fetch follows up to 20 redirects vs 3 policy | Added `redirect: 'manual'` with bounded redirect following |

---

## 1. Problem Statement

Grey's document extraction pipeline (`FetchContentResolver`) uses plain HTTP fetch + HTML tag stripping. This works for PDFs and static HTML but fails for:

1. **JavaScript SPAs** — content rendered client-side returns empty shells
2. **Noisy HTML pages** — nav/footer/cookie-banner cruft pollutes extracted text
3. **Platform-hosted docs** — GitBook, Notion, etc. have APIs that return cleaner content than HTML scraping

### Evidence from Graduation Eval

**Job 1003326062:** `https://makerdao.com/whitepaper/`
- FetchContentResolver returned near-empty text after tag stripping
- ClaimExtractor received insufficient content → 0 claims
- Discovery fallback (DuckDuckGo) → Tier 4 composed whitepaper → also 0 claims
- Evaluator rejected: the URL contained a detailed whitepaper that Grey failed to process

### Prevalence

SPAs and JS-rendered docs are increasingly common across crypto project documentation. MakerDAO/Sky, GitBook-hosted docs, Notion exports, Next.js/Nuxt.js marketing sites — this is a growing gap, not an edge case.

---

## 2. Solution: Multi-Layer Document Resolution Pipeline

The design adds **three new resolution layers** between the existing fetch and discovery tiers. Each layer is cheaper and faster than the next, so the pipeline naturally optimizes for cost.

### 2.1 Complete Resolution Chain

```
1. FetchContentResolver (existing — plain HTTP)
   → PDF detected? → pdf-parse → DONE
   → HTML with text ≥ 500 chars? → tag-strip → DONE
   → HTML with text < 500 chars? → THIN CONTENT, continue ↓
     (also: detect SPA markers for Layer 4 gating)

2. LlmsTxtResolver (NEW — lightweight HTTP probe)
   → Fetch {origin}/llms-full.txt, fallback {origin}/llms.txt
   → Content found and relevant? → DONE
   → 404 or irrelevant? → continue ↓

3. SiteSpecificRegistry (NEW — platform API handlers)
   → Domain matches known platform (GitBook, Notion, etc.)?
   → Fetch via platform API → structured content → DONE
   → No match? → continue ↓

4. HeadlessBrowserResolver (NEW — Playwright, ONLY if SPA markers detected)
   → Launch Chromium, render page, extract text
   → Text > 100 chars? → DONE
   → Still empty? → continue ↓

5. TieredDocumentDiscovery (existing)
   → Tier 1: PDF/IPFS from metadata
   → Tier 2: WebsiteScraper link extraction
   → Tier 3: DuckDuckGo web search
   → Tier 4: Composed whitepaper from metadata
```

**Design principles:**
- Each layer is a self-contained resolver returning content or null.
- The pipeline stops at the first success.
- Every layer degrades gracefully — missing dependencies = return null.
- **Layers 2-3** (llms.txt, SiteSpecific) trigger on **any thin content** (< 500 chars). They're cheap HTTP probes.
- **Layer 4** (Playwright) triggers **only when SPA markers are confirmed**. It's expensive and shouldn't fire for legitimately thin static pages.

---

## 3. Type Changes Required

### 3.1 `types.ts` — Extend `ResolvedWhitepaper.source`

The existing source union must include the new resolution methods for proper pipeline attribution:

```typescript
export interface ResolvedWhitepaper {
  text: string;
  pageCount: number;
  isImageOnly: boolean;
  isPasswordProtected: boolean;
  source: 'direct' | 'ipfs' | 'composed' | 'docs_site'
        | 'llms-txt' | 'site-specific' | 'headless-browser';  // ← NEW
  originalUrl: string;
  resolvedUrl: string;
}
```

### 3.2 `CryptoContentResolver.buildResult` — Widen source parameter

```typescript
private buildResult(
  content: ResolvedContent,
  originalUrl: string,
  resolvedUrl: string,
  source: ResolvedWhitepaper['source'],  // ← matches the union type
): ResolvedWhitepaper {
```

---

## 4. Layer 1 Changes: FetchContentResolver (SPA Detection)

### 4.1 SPA Detection Heuristic

Added to `FetchContentResolver.resolve()`, after the existing HTML tag-stripping. Returns SPA detection as a diagnostic signal that `CryptoContentResolver` can inspect.

```typescript
// In FetchContentResolver, after existing HTML extraction:
// `body` is the raw HTML string, `text` is the tag-stripped output

const SPA_TEXT_THRESHOLD = 500;

const SPA_FRAMEWORK_MARKERS = [
  '__NEXT_DATA__',       // Next.js
  'id="__nuxt"',         // Nuxt.js
  'id="root"',           // React (Create React App)
  'id="app"',            // Vue.js
  'data-reactroot',      // React
  'ng-version',          // Angular
  'data-svelte',         // Svelte/SvelteKit
  '__GATSBY',            // Gatsby
];

const diagnostics = ['FetchContentResolver: HTML text extraction'];

if (text.length < SPA_TEXT_THRESHOLD) {
  const hasScriptTags = body.includes('<script');
  const hasFrameworkMarker = SPA_FRAMEWORK_MARKERS.some(
    (marker) => body.includes(marker),
  );
  if (hasScriptTags && hasFrameworkMarker) {
    diagnostics.push('SPA_DETECTED');  // Signal for CryptoContentResolver
  }
}

return {
  text,
  contentType: contentType || 'text/html',
  source: 'html',
  resolvedUrl: url,
  diagnostics,
};
```

**Note:** The variable is `body` (the raw HTML string from `await response.text()`), NOT `rawHtml`. This matches the existing FetchContentResolver code exactly.

**Why both signals (script tags AND framework markers)?** A page with low text and script tags could be a legitimate minimal page (mostly images with short captions). Adding framework marker detection ensures we only flag pages that are genuinely client-rendered apps.

---

## 5. Layer 2: LlmsTxtResolver

### 5.1 What is llms.txt?

A proposed web standard (llmstxt.org) where sites publish LLM-friendly markdown at `/llms.txt` (summary with links) and `/llms-full.txt` (full inline content). Adoption is ~10% of domains and growing. Crypto projects like Uniswap already publish both files.

### 5.2 Why This Matters for Grey

- **Pre-structured markdown** — exactly what ClaimExtractor wants. No HTML stripping, no tag noise.
- **Zero dependencies** — just HTTP fetch. No binary installs, no RAM impact.
- **Zero runtime cost on miss** — a 404 costs one HTTP round-trip.
- **Future-proofing** — as adoption grows, more projects' content becomes accessible without any rendering.

### 5.3 Implementation: `src/discovery/LlmsTxtResolver.ts`

```typescript
import type { ResolvedContent } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'LlmsTxtResolver' });

const LLMS_TXT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

/**
 * llms-full.txt has inline content (useful for claim extraction).
 * llms.txt is often just an index of links (less useful without following links).
 * Use different minimum thresholds accordingly.
 */
const LLMS_PATHS = [
  { path: '/llms-full.txt', minChars: 200 },
  { path: '/llms.txt', minChars: 1000 },  // higher bar — index-only files are noise
] as const;

export class LlmsTxtResolver {
  /**
   * Probe the origin for llms-full.txt / llms.txt files.
   * Returns resolved content if found and substantive, null otherwise.
   */
  async resolve(originalUrl: string): Promise<ResolvedContent | null> {
    let origin: string;
    try {
      origin = new URL(originalUrl).origin;
    } catch {
      return null;
    }

    for (const { path, minChars } of LLMS_PATHS) {
      const llmsUrl = `${origin}${path}`;
      try {
        const res = await this.fetchWithRedirectLimit(llmsUrl);
        if (!res || !res.ok) continue;

        // Content-type guard: reject HTML error pages served as 200
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('text/html')) {
          log.debug('llms.txt returned HTML content-type, skipping', {
            url: llmsUrl,
            contentType: ct,
          });
          continue;
        }

        const text = await res.text();
        if (text.length < minChars) continue;

        // Secondary HTML guard: check for HTML document markers in body
        const trimmed = text.trimStart();
        if (
          trimmed.startsWith('<!DOCTYPE') ||
          trimmed.startsWith('<html') ||
          trimmed.startsWith('<HTML')
        ) {
          log.debug('llms.txt body contains HTML, skipping', { url: llmsUrl });
          continue;
        }

        log.info('llms.txt content found', {
          url: llmsUrl,
          chars: text.length,
          source: path,
        });

        return {
          text,
          contentType: 'text/markdown',
          source: 'llms-txt',
          resolvedUrl: llmsUrl,
          diagnostics: [
            `LlmsTxtResolver: ${text.length} chars from ${path}`,
          ],
        };
      } catch (err) {
        log.debug('llms.txt probe failed', { url: llmsUrl }, err);
        continue;
      }
    }

    log.debug('No llms.txt found', { origin });
    return null;
  }

  /**
   * Fetch with bounded redirect following (max 3 hops).
   * Consistent with the 3-redirect security policy.
   */
  private async fetchWithRedirectLimit(
    url: string,
  ): Promise<Response | null> {
    let currentUrl = url;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
          'Accept': 'text/plain, text/markdown, */*',
        },
        signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
        redirect: 'manual',
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      return res;
    }

    log.debug('llms.txt redirect limit exceeded', { url });
    return null;
  }
}
```

### 5.4 Linked Content Resolution (Phase 2 Enhancement — post-graduation)

The base `llms.txt` file is an index — it links to markdown versions of individual pages. A Phase 2 enhancement can parse links containing keywords (`whitepaper`, `protocol`, `technical`, `architecture`, `specification`) and fetch those linked markdown files. Deferred — `llms-full.txt` inline content is sufficient for now.

---

## 6. Layer 3: SiteSpecificRegistry

### 6.1 Purpose

Known documentation platforms (GitBook, Notion) have APIs that return structured content directly. Faster, cheaper, and more reliable than headless rendering for their specific domains.

### 6.2 Implementation: `src/discovery/SiteSpecificRegistry.ts`

```typescript
import type { ResolvedContent } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'SiteSpecificRegistry' });

type SiteHandler = (url: string) => Promise<ResolvedContent | null>;

const HANDLER_TIMEOUT_MS = 10000;

/**
 * Registry of domain-specific content resolvers.
 * Checked before headless browser — cheaper and more reliable
 * for known platforms.
 */
export class SiteSpecificRegistry {
  private handlers: Map<string, SiteHandler> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Check if a URL matches a registered handler and resolve content.
   */
  async resolve(url: string): Promise<ResolvedContent | null> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return null;
    }

    for (const [pattern, handler] of this.handlers) {
      // Exact match or subdomain match — NOT substring.
      // "notgitbook.io".endsWith(".gitbook.io") → false ✓
      // "docs.gitbook.io".endsWith(".gitbook.io") → true ✓
      if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        log.info('Site-specific handler matched', { hostname, pattern });
        try {
          return await handler(url);
        } catch (err) {
          log.warn('Site-specific handler failed', { hostname, pattern }, err);
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Register a handler for a domain pattern.
   * Pattern is matched against hostname via exact match or subdomain suffix.
   */
  register(domainPattern: string, handler: SiteHandler): void {
    this.handlers.set(domainPattern, handler);
  }

  private registerDefaults(): void {
    // GitBook: serves markdown when Accept: text/markdown is set
    this.register('gitbook.io', async (url: string) => {
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/markdown',
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
        },
        signal: AbortSignal.timeout(HANDLER_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!res.ok) return null;

      // Verify we actually got markdown back, not HTML
      const ct = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (text.length < 200) return null;
      if (ct.includes('text/html') && !text.trimStart().startsWith('#')) {
        return null;  // Server ignored Accept header, returned HTML
      }

      return {
        text,
        contentType: 'text/markdown',
        source: 'site-specific',
        resolvedUrl: url,
        diagnostics: [
          `SiteSpecificRegistry: GitBook markdown, ${text.length} chars`,
        ],
      };
    });

    // Notion: exported pages — requires Notion API integration
    // Placeholder for post-graduation implementation
    // this.register('notion.site', notionHandler);
    // this.register('notion.so', notionHandler);
  }
}
```

### 6.3 Expansion Strategy

New handlers added iteratively as Grey encounters specific platforms. The registry pattern means adding a new platform is a single `register()` call — no architectural changes needed.

---

## 7. Layer 4: HeadlessBrowserResolver (Playwright)

### 7.1 Why Playwright

Playwright is the only option that renders modern JS frameworks (React, Vue, Svelte) while being compatible with Bun/Node.js. JSDOM and Cheerio cannot execute modern framework code. External proxies add dependencies and cost.

### 7.2 Dependency Model: SOFT

Playwright is a **soft dependency**. If `playwright-core` or the Chromium binary is not installed, Grey remains fully operational for all non-SPA content. The soft dependency logic is encapsulated in the constructor — no module-level side effects.

### 7.3 Implementation: `src/discovery/HeadlessBrowserResolver.ts`

```typescript
import type { ResolvedContent } from '../types';
import { createLogger } from '../utils/logger';
import * as os from 'os';

const log = createLogger({ operation: 'HeadlessBrowserResolver' });

// --- Configuration ---
const PAGE_LOAD_TIMEOUT_MS = 15000;
const POST_RENDER_WAIT_MS = 3000;
const MAX_CONTENT_LENGTH = 100000;
const BROWSER_RESTART_THRESHOLD = 20;
const MAX_REDIRECTS = 3;
const RATE_LIMIT_PER_HOUR = 10;
const MIN_FREE_RAM_BYTES = 400 * 1024 * 1024; // 400MB

// Resource types to block — Grey is text-only, no visual awareness
const BLOCKED_RESOURCE_TYPES = new Set([
  'image',
  'font',
  'media',
  'stylesheet',
  'other',
]);

interface RateLimitState {
  timestamps: number[];
}

export class HeadlessBrowserResolver {
  private browser: any | null = null;
  private pageCount = 0;
  private rateLimit: RateLimitState = { timestamps: [] };
  private available: boolean;
  private chromium: any;

  constructor() {
    try {
      const pw = require('playwright-core');
      this.chromium = pw.chromium;
      this.available = true;
    } catch {
      this.available = false;
      log.warn(
        'Playwright not installed — HeadlessBrowserResolver disabled. ' +
        'Install with: bun add playwright-core && npx playwright install chromium',
      );
    }
  }

  async resolve(url: string): Promise<ResolvedContent | null> {
    if (!this.available) return null;

    // Rate limit check
    if (this.isRateLimited()) {
      log.warn('SPA rate limit reached', { limit: RATE_LIMIT_PER_HOUR });
      return null;
    }

    // Memory guard — refuse to launch if RAM is tight
    const freeRam = os.freemem();
    if (freeRam < MIN_FREE_RAM_BYTES) {
      log.warn('Insufficient free RAM for headless browser', {
        freeRamMB: Math.round(freeRam / 1024 / 1024),
        requiredMB: 400,
      });
      return null;
    }

    try {
      await this.ensureBrowser();
      const text = await this.renderAndExtract(url);

      if (!text || text.length < 100) {
        log.info('Headless render produced insufficient text', {
          url,
          chars: text?.length ?? 0,
        });
        return null;
      }

      this.recordRateLimitHit();

      return {
        text: text.slice(0, MAX_CONTENT_LENGTH),
        contentType: 'text/html',
        source: 'headless-browser',
        resolvedUrl: url,
        diagnostics: [
          `HeadlessBrowserResolver: rendered SPA, ${text.length} chars extracted`,
        ],
      };
    } catch (err) {
      log.warn('Headless browser render failed', { url }, err);
      return null;
    }
  }

  private async renderAndExtract(url: string): Promise<string | null> {
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
    });

    const page = await context.newPage();
    let navigationRedirectCount = 0;

    try {
      // Block unnecessary resource types — Grey is text-only
      await page.route('**/*', (route: any) => {
        const resourceType = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });

      // Track NAVIGATION redirects only (not subresource redirects).
      // v2 bug: page.on('response') counted ALL 3xx responses including
      // script CDN redirects, API redirects, etc. — causing false positives.
      page.on('request', (request: any) => {
        if (
          request.isNavigationRequest() &&
          request.redirectedFrom()
        ) {
          navigationRedirectCount++;
        }
      });

      // Navigate and wait for content to render
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });

      // Abort if navigation redirect limit was exceeded
      if (navigationRedirectCount > MAX_REDIRECTS) {
        log.warn('Navigation redirect limit exceeded', {
          url,
          navigationRedirectCount,
          maxRedirects: MAX_REDIRECTS,
        });
        return null;
      }

      // Validate final URL domain
      const finalUrl = page.url();
      if (!this.isDomainTrusted(url, finalUrl)) {
        log.warn('Redirect to untrusted domain', {
          originalUrl: url,
          finalUrl,
        });
        return null;
      }

      // Targeted text extraction with fallback
      const text = await page.evaluate(() => {
        const selectors = [
          'main',
          'article',
          '.content',
          '.whitepaper',
          '#content',
          '[role="main"]',
          '.documentation',
          '.docs-content',
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

      // If targeted extraction got minimal text, wait and retry once.
      // Some React apps hydrate after networkidle.
      if (!text || text.length < 200) {
        await page.waitForTimeout(POST_RENDER_WAIT_MS);
        const retryText = await page.evaluate(
          () => document.body.innerText,
        );
        return retryText || null;
      }

      return text;
    } finally {
      this.pageCount++;
      await context.close();
    }
  }

  /**
   * Validate that the final URL after redirects is related to the original.
   * Allows: same domain/subdomain, known CDNs, known doc hosts.
   */
  private isDomainTrusted(originalUrl: string, finalUrl: string): boolean {
    try {
      const originalHost = new URL(originalUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;

      // Same domain or subdomain relationship
      if (
        finalHost === originalHost ||
        finalHost.endsWith('.' + originalHost) ||
        originalHost.endsWith('.' + finalHost)
      ) {
        return true;
      }

      // Known trusted hosts for documentation and content
      const trustedHosts = [
        'github.com',
        'raw.githubusercontent.com',
        'gitbook.io',
        'notion.site',
        'notion.so',
        'ipfs.io',
        'cloudflare-ipfs.com',
        'arweave.net',
        'docs.google.com',
        'cdn.jsdelivr.net',
        'cloudflare.com',
        'amazonaws.com',
      ];

      return trustedHosts.some(
        (host) => finalHost === host || finalHost.endsWith('.' + host),
      );
    } catch {
      return false;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser && this.pageCount < BROWSER_RESTART_THRESHOLD) {
      return;
    }

    if (this.browser) {
      log.info('Recycling browser', {
        pageCount: this.pageCount,
        threshold: BROWSER_RESTART_THRESHOLD,
      });
      await this.close();
    }

    this.browser = await this.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
    });
    this.pageCount = 0;
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    this.rateLimit.timestamps = this.rateLimit.timestamps.filter(
      (t) => t > oneHourAgo,
    );
    return this.rateLimit.timestamps.length >= RATE_LIMIT_PER_HOUR;
  }

  private recordRateLimitHit(): void {
    this.rateLimit.timestamps.push(Date.now());
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Browser may have already crashed
      }
      this.browser = null;
      this.pageCount = 0;
    }
  }
}
```

### 7.4 Resource Blocking Strategy

Grey has **no visual awareness**. The entire pipeline operates on extracted text — no OCR, no vision model, no image analysis. During Playwright renders:

**BLOCKED:** `image`, `font`, `media`, `stylesheet`, `other`
**ALLOWED:** `document`, `script`, `xhr`, `fetch`

This reduces RAM usage during renders, cuts bandwidth, and speeds up page load. Grey only needs the DOM text content, which is driven by JavaScript execution and API calls — not visual assets.

If Grey ever gains visual awareness (e.g., reading charts/diagrams via a vision model), resource blocking would need to be revisited. That is a separate design conversation.

### 7.5 Resource Limits (APPROVED)

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Page load timeout | 15s | SPAs should render within this; longer = broken site |
| Post-render retry wait | 3s | One retry for React apps that hydrate after networkidle |
| Max concurrent pages | 1 | Sequential — prevents memory spikes on 2GB VPS |
| Max text extraction | 100k chars | Buffer for ClaimExtractor's 50k input limit |
| Browser restart threshold | **20 pages** | Aggressive memory hygiene on 2GB Lightsail |
| Rate limit | **10/hour** | Protects against resource exhaustion |
| Min free RAM to launch | 400MB | Prevents OOM kills on Grey process |
| Max navigation redirects | **3** | Covers legitimate cases; 4+ is suspicious |
| User-Agent | Realistic Chrome UA | Some crypto sites block headless browser identifiers |

---

## 8. CryptoContentResolver Integration

This is the critical integration point. The v2 design had a type error (`'enhanced'` source), lost layer attribution, and didn't pass SPA detection signals to Playwright.

### 8.1 Updated `CryptoContentResolver.ts`

```typescript
import type { ResolvedWhitepaper, ResolvedContent, IContentResolver } from '../types';
import { IPFS_GATEWAY, IMAGE_ONLY_CHAR_THRESHOLD } from '../constants';
import { LlmsTxtResolver } from './LlmsTxtResolver';
import { SiteSpecificRegistry } from './SiteSpecificRegistry';
import { HeadlessBrowserResolver } from './HeadlessBrowserResolver';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'CryptoContentResolver' });

const THIN_CONTENT_THRESHOLD = 500;

/** Regex patterns for IPFS CID detection */
const IPFS_CID_V0 = /Qm[1-9A-HJ-NP-Za-km-z]{44,}/;
const IPFS_CID_V1 = /bafy[a-z2-7]{50,}/;

export class CryptoContentResolver {
  private llmsTxtResolver = new LlmsTxtResolver();
  private siteRegistry = new SiteSpecificRegistry();
  private headlessBrowser = new HeadlessBrowserResolver();

  constructor(private contentResolver: IContentResolver) {}

  async resolveWhitepaper(url: string): Promise<ResolvedWhitepaper> {
    let resolvedUrl = url;
    let source: ResolvedWhitepaper['source'] = 'direct';

    // Check for IPFS CID in URL and use gateway
    const ipfsCid = this.extractIpfsCid(url);
    if (ipfsCid) {
      resolvedUrl = `${IPFS_GATEWAY}${ipfsCid}`;
      source = 'ipfs';
    }

    try {
      const content = await this.contentResolver.resolve(resolvedUrl);

      // If we got substantive content, use it directly
      if (content.text.length >= THIN_CONTENT_THRESHOLD) {
        return this.buildResult(content, url, resolvedUrl, source);
      }

      // Thin content — try enhanced resolution.
      // Check diagnostics for SPA detection signal from FetchContentResolver.
      const isSpaDetected = content.diagnostics?.includes('SPA_DETECTED') ?? false;

      log.info('Thin content from direct fetch, trying enhanced resolution', {
        url: resolvedUrl,
        textLength: content.text.length,
        isSpaDetected,
      });

      const enhanced = await this.enhancedResolve(url, isSpaDetected);
      if (enhanced) {
        // Map ResolvedContent.source to ResolvedWhitepaper.source.
        // Preserve actual layer attribution — do NOT use a generic label.
        const enhancedSource = this.mapSource(enhanced.source);
        return this.buildResult(enhanced, url, enhanced.resolvedUrl, enhancedSource);
      }

      // All enhanced layers failed — return thin content from Layer 1.
      // TieredDocumentDiscovery handles this downstream.
      return this.buildResult(content, url, resolvedUrl, source);
    } catch (err) {
      // IPFS fallback (existing logic)
      if (source === 'direct') {
        const cidFromUrl = this.extractIpfsCid(url);
        if (cidFromUrl) {
          const ipfsUrl = `${IPFS_GATEWAY}${cidFromUrl}`;
          log.info('Attempting IPFS gateway fallback', { originalUrl: url, ipfsUrl });
          try {
            const result = await this.contentResolver.resolve(ipfsUrl);
            return this.buildResult(result, url, ipfsUrl, 'ipfs');
          } catch {
            // IPFS fallback also failed
          }
        }
      }

      log.warn('Failed to resolve whitepaper', { url }, err);
      throw err;
    }
  }

  /**
   * Enhanced resolution chain: llms.txt → site-specific → headless browser.
   * Layers 2-3 fire for any thin content (cheap probes).
   * Layer 4 (Playwright) fires ONLY if SPA markers were detected (expensive).
   */
  private async enhancedResolve(
    originalUrl: string,
    isSpaDetected: boolean,
  ): Promise<ResolvedContent | null> {
    // Layer 2: llms.txt probe (cheap — just HTTP fetches)
    const llmsContent = await this.llmsTxtResolver.resolve(originalUrl);
    if (llmsContent) return llmsContent;

    // Layer 3: Site-specific handler (cheap — API calls)
    const siteContent = await this.siteRegistry.resolve(originalUrl);
    if (siteContent) return siteContent;

    // Layer 4: Headless browser — ONLY for confirmed SPAs.
    // Legitimately thin static pages (mostly images, short captions)
    // should NOT trigger an expensive Playwright render.
    if (isSpaDetected) {
      const rendered = await this.headlessBrowser.resolve(originalUrl);
      if (rendered) return rendered;
    } else {
      log.debug('Skipping headless browser — no SPA markers detected', {
        url: originalUrl,
      });
    }

    return null;
  }

  /**
   * Map ResolvedContent.source strings to ResolvedWhitepaper.source union.
   * This preserves layer attribution in logs and diagnostics.
   */
  private mapSource(contentSource: string): ResolvedWhitepaper['source'] {
    switch (contentSource) {
      case 'llms-txt':
        return 'llms-txt';
      case 'headless-browser':
        return 'headless-browser';
      default:
        // site-specific-gitbook, site-specific-notion, etc. → 'site-specific'
        if (contentSource.startsWith('site-specific')) return 'site-specific';
        return 'direct';
    }
  }

  /**
   * Graceful shutdown — close headless browser if running.
   * Called from WpvService.stop().
   */
  async close(): Promise<void> {
    await this.headlessBrowser.close();
  }

  // ── Existing private methods (unchanged) ──

  private buildResult(
    content: ResolvedContent,
    originalUrl: string,
    resolvedUrl: string,
    source: ResolvedWhitepaper['source'],
  ): ResolvedWhitepaper {
    const text = content.text;
    const pageCount = content.pageCount ??
      this.estimatePageCount(text, content.source as 'raw' | 'pdf' | 'html');
    const isImageOnly = this.detectImageOnly(text, pageCount);
    const isPasswordProtected = this.detectPasswordProtected(text, content);

    return {
      text,
      pageCount,
      isImageOnly,
      isPasswordProtected,
      source,
      originalUrl,
      resolvedUrl,
    };
  }

  private extractIpfsCid(url: string): string | null {
    const v0Match = url.match(IPFS_CID_V0);
    if (v0Match) return v0Match[0];
    const v1Match = url.match(IPFS_CID_V1);
    if (v1Match) return v1Match[0];
    return null;
  }

  private estimatePageCount(text: string, source: 'pdf' | 'html' | 'raw'): number {
    if (!text || text.length === 0) return 0;
    const charsPerPage = source === 'pdf' ? 3000 : 4000;
    return Math.max(1, Math.ceil(text.length / charsPerPage));
  }

  private detectImageOnly(text: string, pageCount: number): boolean {
    if (pageCount <= 1) return false;
    return text.length < IMAGE_ONLY_CHAR_THRESHOLD;
  }

  private detectPasswordProtected(text: string, content: ResolvedContent): boolean {
    if (content.diagnostics) {
      for (const diag of content.diagnostics) {
        if (diag.toLowerCase().includes('password') || diag.toLowerCase().includes('encrypted')) {
          return true;
        }
      }
    }
    return false;
  }
}
```

---

## 9. Security

### 9.1 Redirect Chain Protection (APPROVED)

Applied consistently across ALL layers:

| Layer | Redirect Limit | Mechanism |
|-------|---------------|-----------|
| LlmsTxtResolver | 3 | Manual redirect following with counter |
| SiteSpecificRegistry | default (fetch follow) | Bounded by 10s timeout |
| HeadlessBrowserResolver | 3 | Navigation request counting via `isNavigationRequest()` |

**Domain validation (Playwright only):** Final URL must match original domain, subdomain, or known trusted host. Applied after navigation completes.

**Trusted hosts:** github.com, gitbook.io, notion.site, notion.so, ipfs.io, cloudflare-ipfs.com, arweave.net, docs.google.com, cdn.jsdelivr.net, cloudflare.com, amazonaws.com

### 9.2 Other Security Controls

| Risk | Mitigation |
|------|------------|
| Malicious JS execution | Sandboxed Chromium process; no Node.js API or filesystem access |
| Resource exhaustion (crypto miners in page JS) | 15s timeout + page kill after extraction |
| Cookie tracking / fingerprinting | Fresh BrowserContext per page, no persistence |
| file:// or javascript: URLs | Already blocked by URL protocol whitelist in WpvService validator |
| Memory exhaustion | 400MB free RAM guard + 20-page browser restart threshold |
| Rate-based attacks | 10/hour SPA resolution cap |
| HTML masquerading as llms.txt | Content-type check + body HTML marker detection |

---

## 10. Pricing (NO CHANGE)

SPA-resolved verifications are **not priced differently**. The buyer has no control over whether a project's whitepaper is an SPA.

| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| project_legitimacy_scan | $0.01 | $0.25 |
| verify_project_whitepaper | $0.02 | $1.50 |
| full_technical_verification | $0.03 | $3.00 |
| daily_technical_briefing | $0.04 | $8.00 |

If SPA resolutions become a significant percentage of traffic post-graduation and VPS resource pressure increases, the response is to upgrade the VPS or switch to a dedicated machine — not to penalize buyers.

---

## 11. VPS Impact

### 11.1 Disk
- `playwright-core` npm package: ~5MB
- Chromium binary: ~200MB (one-time install)
- Total: ~205MB on 60GB SSD — negligible

### 11.2 RAM (2GB Lightsail)
- Browser idle: 0MB (lazy init — only launches on first SPA URL)
- Browser active: ~100-150MB during render (reduced by resource blocking)
- Memory guard: refuses to launch if free RAM < 400MB
- Browser recycled every 20 pages to prevent leak accumulation

### 11.3 CPU
- Brief spike during page render (3-15s), idle otherwise
- Rate-limited to 10 renders/hour max

---

## 12. Testing Strategy

### Unit Tests
- **LlmsTxtResolver:** mock fetch for 200/404/timeout, verify fallback from llms-full.txt to llms.txt, verify HTML content-type rejection, verify HTML body detection, verify redirect limit enforcement, verify `llms.txt` requires 1000 chars vs `llms-full.txt` at 200
- **SiteSpecificRegistry:** mock GitBook markdown response, verify handler matching uses exact/subdomain match (not substring), verify HTML-disguised-as-markdown rejection
- **HeadlessBrowserResolver:** mock Playwright page.evaluate(), verify SPA detection gating (resolver receives call only when SPA detected), verify navigation-only redirect counting, verify rate limiting, verify memory guard, verify domain validation
- **FetchContentResolver:** verify SPA_DETECTED diagnostic added when framework markers + script tags + thin text, verify diagnostic NOT added for thin text without framework markers
- **CryptoContentResolver:** verify enhanced chain fires on thin content, verify Playwright skipped when `isSpaDetected` is false, verify source attribution preserved through buildResult

### Integration Tests
- Live test against known SPA URL (e.g., makerdao.com/whitepaper/)
- Live test against site with llms.txt (e.g., docs.uniswap.org)
- Verify PDF URLs bypass all new layers (no regression)
- Verify static HTML pages bypass all new layers (no regression)

### VPS Smoke Test
- Install Playwright + Chromium on Lightsail
- Run single SPA extraction, verify text output
- Verify RAM stays under limits
- Verify no orphaned Chromium processes after extraction
- Verify browser recycles after threshold

---

## 13. Dependencies

```json
{
  "playwright-core": "^1.45.0"
}
```

`playwright-core` only — no test runner bundle. Browser binary installed separately:
```bash
npx playwright install chromium
```

`LlmsTxtResolver` and `SiteSpecificRegistry` have **zero additional dependencies** — they use native `fetch()`.

---

## 14. File Manifest

| File | Purpose | New/Modified |
|------|---------|-------------|
| `src/types.ts` | Extend `ResolvedWhitepaper.source` union | MODIFIED |
| `src/discovery/LlmsTxtResolver.ts` | llms.txt / llms-full.txt probe | NEW |
| `src/discovery/SiteSpecificRegistry.ts` | Domain-specific handler registry | NEW |
| `src/discovery/HeadlessBrowserResolver.ts` | Playwright SPA renderer | NEW |
| `src/discovery/FetchContentResolver.ts` | Add SPA detection heuristic to diagnostics | MODIFIED |
| `src/discovery/CryptoContentResolver.ts` | Integrate enhanced resolution chain | MODIFIED |
| `src/WpvService.ts` | Browser lifecycle (graceful shutdown) | MODIFIED |

---

## 15. Decision Log

All decisions approved by Forces on 2026-04-04:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Playwright dependency model | Soft | Graceful degradation — Grey stays operational without it |
| SPA rate limit | 10/hour | Protects 2GB VPS from resource exhaustion |
| SPA pricing | No change | Buyer doesn't control project's tech stack |
| External rendering proxy | No | No additional external dependencies |
| GitBook/Notion handlers | Yes | Build registry interface now, populate iteratively |
| Browser restart threshold | 20 pages | Aggressive memory hygiene on constrained VPS |
| Redirect chain limit | 3 hops | Covers legitimate cases; 4+ is suspicious |
| Domain validation on redirects | Yes | Final URL must relate to original or be a known trusted host |
| Resource blocking in Playwright | Block images/fonts/media/CSS | Grey is text-only; visual assets are pure waste |
| llms.txt pipeline position | Before Playwright, after direct fetch | Cheaper, faster, higher quality when available |
| Playwright gated by SPA detection | Yes | Cheap layers fire on any thin content; expensive layer requires confirmation |

---

*This plan is ready for Kovsky implementation. Build order: (1) type changes, (2) LlmsTxtResolver + SiteSpecificRegistry (zero dependencies), (3) FetchContentResolver SPA detection, (4) CryptoContentResolver integration, (5) HeadlessBrowserResolver (requires Playwright install on VPS). Each layer is independently testable.*
