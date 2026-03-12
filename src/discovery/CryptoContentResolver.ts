// ════════════════════════════════════════════
// WS-A4: CryptoContentResolver
// Extends existing ContentResolver for crypto whitepaper edge cases.
// Handles IPFS fallback, image-only detection, password-protection detection.
// ════════════════════════════════════════════

import type { ResolvedWhitepaper } from '../types';
import type { IContentResolver, ResolvedContent } from '../types';
import { IPFS_GATEWAY, IMAGE_ONLY_CHAR_THRESHOLD } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'CryptoContentResolver' });

/** Regex patterns for IPFS CID detection */
const IPFS_CID_V0 = /Qm[1-9A-HJ-NP-Za-km-z]{44,}/;
const IPFS_CID_V1 = /bafy[a-z2-7]{50,}/;

export class CryptoContentResolver {
  constructor(private contentResolver: IContentResolver) {}

  /**
   * Resolve a whitepaper URL to extracted text with crypto-specific handling.
   */
  async resolveWhitepaper(url: string): Promise<ResolvedWhitepaper> {
    let resolvedUrl = url;
    let source: 'direct' | 'ipfs' = 'direct';

    // Check for IPFS CID in URL and use gateway
    const ipfsCid = this.extractIpfsCid(url);
    if (ipfsCid) {
      resolvedUrl = `${IPFS_GATEWAY}${ipfsCid}`;
      source = 'ipfs';
    }

    try {
      const result = await this.contentResolver.resolve(resolvedUrl);
      return this.buildResult(result, url, resolvedUrl, source);
    } catch (err) {
      // If direct URL failed and we haven't tried IPFS, check if the URL contains an IPFS CID
      if (source === 'direct' && ipfsCid) {
        // Already tried IPFS fallback path, re-throw
        throw err;
      }

      // Try IPFS gateway fallback if CID found in original URL
      const cidFromUrl = this.extractIpfsCid(url);
      if (cidFromUrl && source === 'direct') {
        const ipfsUrl = `${IPFS_GATEWAY}${cidFromUrl}`;
        log.info('Attempting IPFS gateway fallback', { originalUrl: url, ipfsUrl });
        try {
          const result = await this.contentResolver.resolve(ipfsUrl);
          return this.buildResult(result, url, ipfsUrl, 'ipfs');
        } catch {
          // IPFS fallback also failed
        }
      }

      log.warn('Failed to resolve whitepaper', { url }, err);
      throw err;
    }
  }

  private buildResult(
    content: ResolvedContent,
    originalUrl: string,
    resolvedUrl: string,
    source: 'direct' | 'ipfs',
  ): ResolvedWhitepaper {
    const text = content.text;
    const pageCount = this.estimatePageCount(text, content.source as 'raw' | 'pdf' | 'html');
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
   * For PDFs: ~3000 chars/page is typical for academic content.
   * For HTML: use a rough heuristic.
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
   * ContentResolver may throw or return specific error messages for these.
   */
  private detectPasswordProtected(text: string, content: ResolvedContent): boolean {
    // Check diagnostics for password-related messages
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
