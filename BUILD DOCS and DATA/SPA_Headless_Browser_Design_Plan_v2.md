# Design Plan v2: Enhanced Document Resolution Pipeline
# llms.txt + Site Handlers + Headless Browser for SPA Extraction

**Date:** 2026-04-04
**Version:** 2.0 (supersedes SPA_Headless_Browser_Design_Plan.md)
**Authors:** Kovsky (v1 draft), Forces (architectural decisions), Claude Opus (v2 revision)
**Status:** APPROVED — Ready for Kovsky implementation
**Priority:** HIGH — blocking graduation (MakerDAO SPA failure in eval run 20)

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

The v2 design adds **three new resolution layers** between the existing fetch and discovery tiers. Each layer is cheaper and faster than the next, so the pipeline naturally optimizes for cost.

### 2.1 Complete Resolution Chain

```
1. FetchContentResolver (existing — plain HTTP)
   → PDF detected? → pdf-parse → DONE
   → HTML with text > 500 chars? → tag-strip → DONE
   → HTML with text < 500 chars + SPA markers? → SPA DETECTED, continue ↓

2. LlmsTxtResolver (NEW — lightweight HTTP probe)
   → Fetch {origin}/llms-full.txt, fallback {origin}/llms.txt
   → Content found and relevant? → DONE
   → 404 or irrelevant? → continue ↓

3. SiteSpecificRegistry (NEW — platform API handlers)
   → Domain matches known platform (GitBook, Notion, etc.)?
   → Fetch via platform API → structured content → DONE
   → No match? → continue ↓

4. HeadlessBrowserResolver (NEW — Playwright, last resort before discovery)
   → Launch Chromium, render page, extract text
   → Text > 100 chars? → DONE
   → Still empty? → continue ↓

5. TieredDocumentDiscovery (existing)
   → Tier 1: PDF/IPFS from metadata
   → Tier 2: WebsiteScraper link extraction
   → Tier 3: DuckDuckGo web search
   → Tier 4: Composed whitepaper from metadata
```

**Design principle:** Each layer is a self-contained resolver that returns content or null. The pipeline tries each in order and stops at the first success. Every layer degrades gracefully — if a resolver's dependencies are missing or it errors, it returns null and the next layer handles it.

---

## 3. Layer 2: LlmsTxtResolver

### 3.1 What is llms.txt?

A proposed web standard (llmstxt.org) where sites publish LLM-friendly markdown at `/llms.txt` (summary with links) and `/llms-full.txt` (full inline content). Adoption is ~10% of domains and growing, with strong representation among developer/SaaS sites. Crypto projects like Uniswap already publish both files with dedicated AI tool documentation sections.

### 3.2 Why This Matters for Grey

- **Pre-structured markdown** — exactly what ClaimExtractor wants. No HTML stripping, no tag noise.
- **Zero dependencies** — just HTTP fetch. No binary installs, no RAM impact.
- **Universal quality improvement** — benefits even non-SPA pages by providing cleaner input than HTML tag-stripping.
- **Zero runtime cost on miss** — a 404 costs one HTTP round-trip with a 5s timeout.
- **Future-proofing** — as adoption grows, more projects' content becomes accessible without any rendering.

### 3.3 Implementation: `src/discovery/LlmsTxtResolver.ts`

```typescript
import type { ResolvedContent } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'LlmsTxtResolver' });

const LLMS_TXT_PATHS = ['/llms-full.txt', '/llms.txt'] as const;
const LLMS_TXT_TIMEOUT_MS = 5000;
const MIN_CONTENT_LENGTH = 200;

export class LlmsTxtResolver {
  /**
   * Probe the origin for llms.txt / llms-full.txt files.
   * Returns resolved content if found and substantive, null otherwise.
   */
  async resolve(originalUrl: string): Promise<ResolvedContent | null> {
    let origin: string;
    try {
      origin = new URL(originalUrl).origin;
    } catch {
      return null;
    }

    for (const path of LLMS_TXT_PATHS) {
      const llmsUrl = `${origin}${path}`;
      try {
        const res = await fetch(llmsUrl, {
          headers: {
            'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
            'Accept': 'text/plain, text/markdown, */*',
          },
          signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
          redirect: 'follow',
        });

        if (!res.ok) continue;

        const text = await res.text();
        if (text.length < MIN_CONTENT_LENGTH) continue;

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
}
```

### 3.4 Linked Content Resolution (Phase 2 Enhancement)

The base `llms.txt` file is an index — it links to markdown versions of individual pages. If the base file doesn't contain enough whitepaper-relevant content inline, a Phase 2 enhancement can:

1. Parse the llms.txt for links containing keywords: `whitepaper`, `protocol`, `technical`, `architecture`, `specification`
2. Fetch those linked markdown files
3. Concatenate the relevant content

This is deferred to post-graduation. The base resolver alone may be sufficient — `llms-full.txt` often contains full inline content.

---

## 4. Layer 3: SiteSpecificRegistry

### 4.1 Purpose

Known documentation platforms (GitBook, Notion) have APIs that return structured content directly. These are faster, cheaper, and more reliable than headless browser rendering for their specific domains.

### 4.2 Implementation: `src/discovery/SiteSpecificRegistry.ts`

```typescript
import type { ResolvedContent } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'SiteSpecificRegistry' });

type SiteHandler = (url: string) => Promise<ResolvedContent | null>;

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
      if (hostname.includes(pattern)) {
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
   * Pattern is matched against hostname via includes().
   */
  register(domainPattern: string, handler: SiteHandler): void {
    this.handlers.set(domainPattern, handler);
  }

  private registerDefaults(): void {
    // GitBook: fetch page content via known API pattern
    this.register('gitbook.io', async (url: string) => {
      // GitBook serves markdown when Accept: text/markdown is set
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/markdown',
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length < 200) return null;
      return {
        text,
        contentType: 'text/markdown',
        source: 'site-specific-gitbook',
        resolvedUrl: url,
        diagnostics: [`SiteSpecificRegistry: GitBook markdown, ${text.length} chars`],
      };
    });

    // Notion: exported pages — requires Notion API integration
    // Placeholder for post-graduation implementation
    // this.register('notion.site', notionHandler);
  }
}
```

### 4.3 Expansion Strategy

New handlers are added iteratively as Grey encounters specific platforms in production. The registry pattern means adding a new platform is a single `register()` call with a handler function — no architectural changes needed.

---

## 5. Layer 4: HeadlessBrowserResolver (Playwright)

### 5.1 Why Playwright

Playwright is the only option that renders modern JS frameworks (React, Vue, Svelte) while being compatible with the Bun/Node.js stack. JSDOM and Cheerio cannot execute modern framework code. External proxies add dependencies and cost.

### 5.2 Dependency Model: SOFT

Playwright is a **soft dependency**. If `playwright-core` or the Chromium binary is not installed:

- Grey logs a single warning at startup
- `HeadlessBrowserResolver.resolve()` returns null on every call
- The pipeline falls through to TieredDocumentDiscovery
- Grey remains fully operational for all non-SPA content

```typescript
let playwrightAvailable = false;
let chromium: any;

try {
  const pw = require('playwright-core');
  chromium = pw.chromium;
  playwrightAvailable = true;
} catch {
  log.warn('Playwright not installed — SPA resolution disabled. Install with: bun add playwright-core && npx playwright install chromium');
}
```

### 5.3 Implementation: `src/discovery/HeadlessBrowserResolver.ts`

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
const BLOCKED_RESOURCE_TYPES = [
  'image',
  'font',
  'media',
  'stylesheet',
  'other',
] as const;

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
      log.warn('Playwright not installed — HeadlessBrowserResolver disabled');
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
    });

    const page = await context.newPage();
    let redirectCount = 0;

    try {
      // Block unnecessary resource types — Grey is text-only
      await page.route('**/*', (route: any) => {
        const resourceType = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });

      // Track redirects
      page.on('response', (response: any) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            log.warn('Redirect limit exceeded', { url, redirectCount });
            // Page navigation will be aborted by timeout
          }
        }
      });

      // Navigate and wait for content to render
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });

      // Abort if redirect limit was exceeded
      if (redirectCount > MAX_REDIRECTS) {
        log.warn('Aborting — exceeded redirect limit', {
          url,
          redirectCount,
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
        // Try targeted selectors first (less nav/footer noise)
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
        // Fallback: full body text
        return document.body.innerText;
      });

      // If targeted extraction got minimal text, wait and retry once
      // Some React apps hydrate after networkidle
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
   * Allows: same domain, known CDNs, known doc hosts.
   */
  private isDomainTrusted(originalUrl: string, finalUrl: string): boolean {
    try {
      const originalHost = new URL(originalUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;

      // Same domain (including subdomains)
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
        'githubusercontent.com',
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
    if (
      this.browser &&
      this.pageCount < BROWSER_RESTART_THRESHOLD
    ) {
      return;
    }

    // Restart threshold reached — recycle browser to prevent memory leaks
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

### 5.4 Resource Blocking Strategy

Grey has **no visual awareness**. The entire pipeline operates on extracted text — no OCR, no vision model, no image analysis. During Playwright renders:

**BLOCKED:** `image`, `font`, `media`, `stylesheet`, `other`
**ALLOWED:** `document`, `script`, `xhr`, `fetch`

This reduces RAM usage during renders, cuts bandwidth, and speeds up page load. The page will render "ugly" (no CSS, no images) but Grey only needs the DOM text content, which is driven by JavaScript execution and API calls — not visual assets.

If Grey ever gains visual awareness (e.g., reading charts/diagrams from whitepapers via a vision model), resource blocking would need to be revisited. That is a separate design conversation.

### 5.5 Resource Limits (APPROVED)

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Page load timeout | 15s | SPAs should render within this; longer = broken site |
| Post-render retry wait | 3s | One retry for React apps that hydrate after networkidle |
| Max concurrent pages | 1 | Sequential — prevents memory spikes on 2GB VPS |
| Max text extraction | 100k chars | Buffer for ClaimExtractor's 50k input limit |
| Browser restart threshold | **20 pages** | Aggressive memory hygiene on 2GB Lightsail. Restart cost is ~2s. |
| Rate limit | **10/hour** | Protects against resource exhaustion from bad actors or eval edge cases |
| Min free RAM to launch | 400MB | Refuses to start Chromium if RAM is tight — prevents OOM kills |
| Max redirects | **3** | Covers HTTP→HTTPS + domain migration. Beyond 3 = suspicious. |
| User-Agent | Realistic Chrome UA | Some crypto sites block headless browser identifiers |

### 5.6 SPA Detection Heuristic (Updated)

The original plan used text length < 500 chars + `<script>` presence. Enhanced with framework-specific markers to reduce false positives:

```typescript
// In FetchContentResolver, after existing HTML extraction:

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

const hasScriptTags = rawHtml.includes('<script');
const hasFrameworkMarker = SPA_FRAMEWORK_MARKERS.some(
  (marker) => rawHtml.includes(marker),
);
const isSPA = text.length < SPA_TEXT_THRESHOLD
  && hasScriptTags
  && hasFrameworkMarker;
```

**Why both signals?** A page with low text and script tags could be a legitimate minimal page (e.g., a page with mostly images and short captions). Adding framework marker detection ensures we only escalate pages that are genuinely client-rendered apps.

---

## 6. Security

### 6.1 Redirect Chain Protection (APPROVED)

| Control | Value |
|---------|-------|
| Max redirects | **3** |
| Domain validation | Final URL must match original domain, subdomain, or known trusted host |
| Trusted hosts | github.com, gitbook.io, notion.site, ipfs.io, cloudflare-ipfs.com, arweave.net, amazonaws.com, cdn.jsdelivr.net |

Redirect chain beyond 3 hops → abort and log as suspicious.
Final domain unrelated to original → abort and log as suspicious.

### 6.2 Other Security Controls

| Risk | Mitigation |
|------|------------|
| Malicious JS execution | Sandboxed Chromium process; no Node.js API or filesystem access |
| Resource exhaustion (crypto miners in page JS) | 15s timeout + page kill after extraction |
| Cookie tracking / fingerprinting | Fresh BrowserContext per page, no persistence |
| file:// or javascript: URLs | Already blocked by URL protocol whitelist in WpvService validator |
| Memory exhaustion | 400MB free RAM guard + 20-page browser restart threshold |
| Rate-based attacks | 10/hour SPA resolution cap |

---

## 7. CryptoContentResolver Integration

Updated integration point in `CryptoContentResolver.ts`:

```typescript
import { LlmsTxtResolver } from './LlmsTxtResolver';
import { SiteSpecificRegistry } from './SiteSpecificRegistry';
import { HeadlessBrowserResolver } from './HeadlessBrowserResolver';

export class CryptoContentResolver {
  private llmsTxtResolver = new LlmsTxtResolver();
  private siteRegistry = new SiteSpecificRegistry();
  private headlessBrowser = new HeadlessBrowserResolver();

  constructor(private contentResolver: IContentResolver) {}

  async resolveWhitepaper(url: string): Promise<ResolvedWhitepaper> {
    // ... existing IPFS CID check ...

    // Layer 1: Direct fetch (existing)
    const content = await this.contentResolver.resolve(resolvedUrl);

    // If we got substantive content, use it
    if (content.text.length >= 500) {
      return this.buildResult(content, url, resolvedUrl, source);
    }

    // Layers 2-4: Enhanced resolution for low-content results
    const enhanced = await this.enhancedResolve(url);
    if (enhanced) {
      return this.buildResult(enhanced, url, enhanced.resolvedUrl, 'enhanced');
    }

    // Return whatever we got from Layer 1 (may be insufficient,
    // but TieredDocumentDiscovery handles this downstream)
    return this.buildResult(content, url, resolvedUrl, source);
  }

  /**
   * Enhanced resolution chain: llms.txt → site-specific → headless browser.
   * Each layer returns null to fall through to the next.
   */
  private async enhancedResolve(
    originalUrl: string,
  ): Promise<ResolvedContent | null> {
    // Layer 2: llms.txt probe
    const llmsContent = await this.llmsTxtResolver.resolve(originalUrl);
    if (llmsContent) return llmsContent;

    // Layer 3: Site-specific handler (GitBook, Notion, etc.)
    const siteContent = await this.siteRegistry.resolve(originalUrl);
    if (siteContent) return siteContent;

    // Layer 4: Headless browser (Playwright) — last resort
    const rendered = await this.headlessBrowser.resolve(originalUrl);
    if (rendered) return rendered;

    return null;
  }

  /**
   * Graceful shutdown — close headless browser if running.
   * Called from WpvService.stop().
   */
  async close(): Promise<void> {
    await this.headlessBrowser.close();
  }
}
```

---

## 8. Pricing (NO CHANGE)

SPA-resolved verifications are **not priced differently**. The buyer has no control over whether a project's whitepaper is an SPA. The compute cost difference is server-side and marginal per-request.

| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| project_legitimacy_scan | $0.01 | $0.25 |
| verify_project_whitepaper | $0.02 | $1.50 |
| full_technical_verification | $0.03 | $3.00 |
| daily_technical_briefing | $0.04 | $8.00 |

If SPA resolutions become a significant percentage of traffic post-graduation and VPS resource pressure increases, the response is to upgrade the VPS or switch to a dedicated machine — not to penalize buyers.

---

## 9. VPS Impact

### 9.1 Disk
- `playwright-core` npm package: ~5MB
- Chromium binary: ~200MB (one-time install)
- Total: ~205MB on 60GB SSD — negligible

### 9.2 RAM (2GB Lightsail)
- Browser idle: 0MB (lazy init — only launches on first SPA URL)
- Browser active: ~100-150MB during render (reduced by resource blocking)
- Memory guard: refuses to launch if free RAM < 400MB
- Browser recycled every 20 pages to prevent leak accumulation

### 9.3 CPU
- Brief spike during page render (3-15s), idle otherwise
- Rate-limited to 10 renders/hour max

---

## 10. Testing Strategy

### Unit Tests
- LlmsTxtResolver: mock fetch for 200/404/timeout responses, verify fallback from llms-full.txt to llms.txt
- SiteSpecificRegistry: mock GitBook markdown response, verify handler matching
- HeadlessBrowserResolver: mock Playwright page.evaluate(), test SPA detection heuristic with real SPA HTML shells
- Test resource blocking configuration
- Test rate limiting (11th request in an hour returns null)
- Test memory guard (low free RAM returns null)
- Test redirect limit (4th redirect aborts)
- Test domain validation (untrusted final domain aborts)

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

## 11. Dependencies

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

## 12. File Manifest

| File | Purpose | New/Modified |
|------|---------|-------------|
| `src/discovery/LlmsTxtResolver.ts` | llms.txt / llms-full.txt probe | NEW |
| `src/discovery/SiteSpecificRegistry.ts` | Domain-specific handler registry (GitBook, etc.) | NEW |
| `src/discovery/HeadlessBrowserResolver.ts` | Playwright SPA renderer | NEW |
| `src/discovery/FetchContentResolver.ts` | Add SPA detection heuristic | MODIFIED |
| `src/discovery/CryptoContentResolver.ts` | Integrate enhanced resolution chain | MODIFIED |
| `src/WpvService.ts` | Browser lifecycle (graceful shutdown) | MODIFIED |

---

## 13. Decision Log

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

---

*This plan is ready for Kovsky implementation. The llms.txt resolver and SiteSpecificRegistry require no new dependencies and can be built and tested immediately. Playwright integration follows as a separate PR after the zero-dependency layers are in place.*
