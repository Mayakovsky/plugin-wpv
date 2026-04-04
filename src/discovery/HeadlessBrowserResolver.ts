// ════════════════════════════════════════════
// HeadlessBrowserResolver — Layer 4 of enhanced document resolution.
// Renders JavaScript SPAs via Playwright headless Chromium.
// SOFT dependency — if playwright-core is not installed, returns null.
//
// Security note: --no-sandbox + --single-process removes process isolation.
// Acceptable for Grey's use case (controlled URLs from ACP buyers, not
// arbitrary browsing). Do NOT use this pattern for general-purpose crawling.
// ════════════════════════════════════════════

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
const CONTEXT_CLOSE_TIMEOUT_MS = 5000;

// Resource types to block — Grey is text-only, no visual awareness.
// If Grey ever gains visual awareness (OCR, vision model), revisit this.
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
  private browser: unknown | null = null;
  private chromium: unknown | null = null;
  private pageCount = 0;
  private rateLimit: RateLimitState = { timestamps: [] };
  private available = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Lazy dynamic import — deferred to first use via ensureBrowser().
    // Cannot use require() in ESM context.
  }

  async resolve(url: string): Promise<ResolvedContent | null> {
    // Lazy init: attempt to load playwright-core on first call
    if (!this.initPromise && !this.available && !this.chromium) {
      this.initPromise = this.loadPlaywright();
      await this.initPromise;
    }

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
      log.warn('Headless browser render failed', { url });
      return null;
    }
  }

  private async loadPlaywright(): Promise<void> {
    try {
      // @ts-ignore — soft dependency, may not be installed
      const pw = await import('playwright-core');
      this.chromium = (pw as Record<string, unknown>).chromium ?? (pw.default as Record<string, unknown>)?.chromium;
      if (this.chromium) {
        this.available = true;
        log.info('Playwright loaded successfully');
      } else {
        log.warn('Playwright module found but chromium export missing');
      }
    } catch {
      this.available = false;
      log.warn(
        'Playwright not installed — HeadlessBrowserResolver disabled. ' +
        'Install with: bun add playwright-core && npx playwright install chromium',
      );
    }
  }

  private async renderAndExtract(url: string): Promise<string | null> {
    const browser = this.browser as { newContext: (opts: unknown) => Promise<unknown> };
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
    }) as { newPage: () => Promise<unknown>; close: () => Promise<void> };

    const page = await context.newPage() as {
      route: (pattern: string, handler: (route: unknown) => void) => Promise<void>;
      on: (event: string, handler: (arg: unknown) => void) => void;
      goto: (url: string, opts: unknown) => Promise<void>;
      url: () => string;
      evaluate: (fn: () => string) => Promise<string>;
      waitForFunction: (fn: string | (() => boolean), opts?: unknown) => Promise<void>;
    };
    let navigationRedirectCount = 0;

    try {
      // Block unnecessary resource types — Grey is text-only
      await page.route('**/*', (route: unknown) => {
        const r = route as { request: () => { resourceType: () => string }; abort: () => Promise<void>; continue: () => Promise<void> };
        const resourceType = r.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return r.abort();
        }
        return r.continue();
      });

      // Track NAVIGATION redirects only (not subresource redirects like CDN 3xx).
      page.on('request', (request: unknown) => {
        const req = request as { isNavigationRequest: () => boolean; redirectedFrom: () => unknown | null };
        if (req.isNavigationRequest() && req.redirectedFrom()) {
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

      // If targeted extraction got minimal text, wait for hydration and retry.
      // Fix #5: Use waitForFunction instead of deprecated waitForTimeout.
      if (!text || text.length < 200) {
        try {
          await page.waitForFunction(
            () => document.body.innerText.length > 200,
            { timeout: POST_RENDER_WAIT_MS },
          );
        } catch {
          // Timeout — page didn't hydrate in time, use what we have
        }
        const retryText = await page.evaluate(
          () => document.body.innerText,
        );
        return retryText || null;
      }

      return text;
    } finally {
      this.pageCount++;
      // Fix #4: Timeout on context.close() to prevent hanging on bad browser state
      await Promise.race([
        context.close(),
        new Promise<void>((resolve) => setTimeout(resolve, CONTEXT_CLOSE_TIMEOUT_MS)),
      ]);
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

    const chromium = this.chromium as { launch: (opts: unknown) => Promise<unknown> };
    this.browser = await chromium.launch({
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
        const b = this.browser as { close: () => Promise<void> };
        await b.close();
      } catch {
        // Browser may have already crashed
      }
      this.browser = null;
      this.pageCount = 0;
    }
  }
}
