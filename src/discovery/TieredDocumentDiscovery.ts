// ════════════════════════════════════════════
// TieredDocumentDiscovery
// Orchestrator for multi-tier whitepaper discovery.
// Tier 1: ACP description (PDF/IPFS links)
// Tier 2: Website scraping (follow project URLs)
// Tier 3: Web search fallback
// Tier 4: Composed whitepaper from Virtuals page
// ════════════════════════════════════════════

import type { ProjectMetadata, TieredDiscoveryResult, DocumentSource } from '../types';
import type { CryptoContentResolver } from './CryptoContentResolver';
import type { WebsiteScraper } from './WebsiteScraper';
import type { WebSearchFallback } from './WebSearchFallback';
import type { SyntheticWhitepaperComposer } from './SyntheticWhitepaperComposer';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'TieredDocumentDiscovery' });

export interface TieredDocumentDiscoveryDeps {
  resolver: CryptoContentResolver;
  websiteScraper: WebsiteScraper;
  webSearch: WebSearchFallback;
  composer: SyntheticWhitepaperComposer;
}

export class TieredDocumentDiscovery {
  constructor(private deps: TieredDocumentDiscoveryDeps) {}

  /**
   * Discover and resolve a whitepaper through 4 tiers of fallback.
   * Returns null only if all tiers fail completely.
   */
  async discover(
    metadata: ProjectMetadata,
    tokenAddress: string,
  ): Promise<TieredDiscoveryResult | null> {
    const projectName = metadata.agentName ?? tokenAddress;

    // ── Tier 1: ACP description — PDF/IPFS links ──
    const pdfUrl = metadata.linkedUrls.find(
      (u) => u.endsWith('.pdf') || u.includes('ipfs'),
    );
    if (pdfUrl) {
      try {
        const resolved = await this.deps.resolver.resolveWhitepaper(pdfUrl);
        if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
          const source: DocumentSource = resolved.source === 'ipfs' ? 'ipfs' : 'pdf';
          log.info('Tier 1: PDF/IPFS from ACP description', { projectName, url: pdfUrl });
          return { resolved, documentUrl: pdfUrl, documentSource: source, tier: 1 };
        }
      } catch {
        // Fall through to Tier 2
      }
    }

    // ── Tier 2: Website scraping ──
    const websiteUrls = metadata.linkedUrls.filter(
      (u) => !u.endsWith('.pdf') && !u.includes('ipfs'),
    );
    if (websiteUrls.length > 0) {
      try {
        const scraped = await this.deps.websiteScraper.findWhitepaperLink(websiteUrls);
        if (scraped) {
          const resolved = await this.deps.resolver.resolveWhitepaper(scraped.url);
          if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
            const source: DocumentSource = scraped.type === 'pdf' ? 'pdf' : 'docs_site';
            log.info('Tier 2: Found via website scraping', { projectName, url: scraped.url, type: scraped.type });
            return { resolved, documentUrl: scraped.url, documentSource: source, tier: 2 };
          }
        }
      } catch {
        // Fall through to Tier 3
      }
    }

    // ── Tier 3: Web search fallback ──
    try {
      const searchUrl = await this.deps.webSearch.searchWhitepaper(projectName);
      if (searchUrl) {
        const resolved = await this.deps.resolver.resolveWhitepaper(searchUrl);
        if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
          log.info('Tier 3: Found via web search', { projectName, url: searchUrl });
          return { resolved, documentUrl: searchUrl, documentSource: 'pdf', tier: 3 };
        }
      }
    } catch {
      // Fall through to Tier 4
    }

    // ── Tier 4: Composed whitepaper from Virtuals + metadata ──
    try {
      const composed = await this.deps.composer.compose(tokenAddress, metadata);
      if (composed.text.length > 50) {
        log.info('Tier 4: Composed whitepaper from available data', { projectName });
        return {
          resolved: composed,
          documentUrl: composed.originalUrl,
          documentSource: 'composed',
          tier: 4,
        };
      }
    } catch (err) {
      log.warn('Tier 4: Composition failed', { projectName }, err);
    }

    log.warn('All discovery tiers failed', { projectName, tokenAddress });
    return null;
  }
}
