// ════════════════════════════════════════════
// WS-A4: CryptoContentResolver
// Extends existing ContentResolver for crypto whitepaper edge cases.
// Handles IPFS fallback, image-only detection, password-protection detection.
// Enhanced with multi-layer resolution: llms.txt → site-specific → headless browser.
// ════════════════════════════════════════════

import type { ResolvedWhitepaper } from '../types';
import type { IContentResolver, ResolvedContent } from '../types';
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

  /**
   * Resolve a whitepaper URL to extracted text with crypto-specific handling.
   */
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
   * Preserves layer attribution in logs and diagnostics.
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

  // ── Private methods ──────────────────────────

  private buildResult(
    content: ResolvedContent,
    originalUrl: string,
    resolvedUrl: string,
    source: ResolvedWhitepaper['source'],
  ): ResolvedWhitepaper {
    const text = content.text;
    const pageCount = content.pageCount ?? this.estimatePageCount(text, content.source as 'raw' | 'pdf' | 'html');
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

  /**
   * Extract IPFS CID from a URL string.
   */
  private extractIpfsCid(url: string): string | null {
    const v0Match = url.match(IPFS_CID_V0);
    if (v0Match) return v0Match[0];

    const v1Match = url.match(IPFS_CID_V1);
    if (v1Match) return v1Match[0];

    return null;
  }

  /**
   * Estimate page count from text.
   */
  private estimatePageCount(text: string, source: 'pdf' | 'html' | 'raw'): number {
    if (!text || text.length === 0) return 0;
    const charsPerPage = source === 'pdf' ? 3000 : 4000;
    return Math.max(1, Math.ceil(text.length / charsPerPage));
  }

  /**
   * Detect image-only PDFs: very little text from a multi-page document.
   */
  private detectImageOnly(text: string, pageCount: number): boolean {
    if (pageCount <= 1) return false;
    return text.length < IMAGE_ONLY_CHAR_THRESHOLD;
  }

  /**
   * Detect password-protected documents.
   */
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
