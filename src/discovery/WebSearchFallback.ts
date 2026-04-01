// ════════════════════════════════════════════
// Tier 3: WebSearchFallback
// Search the web for a project's whitepaper when Tiers 1-2 fail.
// Uses DuckDuckGo HTML API (free, no key needed).
// ════════════════════════════════════════════

import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'WebSearchFallback' });

export interface SearchResult {
  url: string;
  title: string;
}

export class WebSearchFallback {
  constructor(private fetchFn: typeof fetch = fetch) {}

  /**
   * Search for a project's whitepaper PDF.
   * Returns the best candidate URL, or null.
   */
  async searchWhitepaper(projectName: string): Promise<string | null> {
    const queries = [
      `${projectName} whitepaper filetype:pdf`,
      `${projectName} technical paper filetype:pdf`,
      `${projectName} tokenomics whitepaper`,
      `${projectName} protocol documentation`,
    ];

    for (const query of queries) {
      try {
        const results = await this.search(query);
        const candidate = this.pickBestResult(results, projectName);
        if (candidate) return candidate;
      } catch {
        // Try next query
      }
    }

    // Fallback: if project name has a version suffix (e.g., "Aave V3", "Uniswap v2"),
    // retry with the base name only
    const baseNameMatch = projectName.match(/^(.+?)\s+[vV]\d+$/);
    if (baseNameMatch) {
      const baseName = baseNameMatch[1].trim();
      const fallbackQueries = [
        `${baseName} whitepaper filetype:pdf`,
        `${baseName} technical paper filetype:pdf`,
        `${baseName} protocol documentation`,
      ];
      for (const query of fallbackQueries) {
        try {
          const results = await this.search(query);
          const candidate = this.pickBestResult(results, baseName);
          if (candidate) return candidate;
        } catch {
          // Try next query
        }
      }
    }

    return null;
  }

  /**
   * Execute a DuckDuckGo search and extract result URLs.
   */
  async search(query: string): Promise<SearchResult[]> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const response = await this.fetchFn(url, {
        headers: {
          'User-Agent': 'WhitepaperGrey/1.0',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseResults(html);
    } catch (err) {
      log.warn('Search failed', { query }, err);
      return [];
    }
  }

  /**
   * Parse DuckDuckGo HTML results page for links.
   */
  private parseResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    // DuckDuckGo HTML results have links in <a class="result__a" href="...">
    const linkPattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]*)</gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      if (url && !url.includes('duckduckgo.com')) {
        results.push({ url: decodeURIComponent(url), title: title ?? '' });
      }
    }
    return results.slice(0, 10); // Top 10 results
  }

  /**
   * Pick the best search result — prefer PDFs from plausible sources.
   */
  private pickBestResult(results: SearchResult[], projectName: string): string | null {
    const nameLower = projectName.toLowerCase();

    // First pass: PDF from project's own domain or IPFS
    for (const r of results) {
      const urlLower = r.url.toLowerCase();
      if (
        urlLower.endsWith('.pdf') &&
        (urlLower.includes(nameLower) || urlLower.includes('ipfs') || urlLower.includes('github'))
      ) {
        return r.url;
      }
    }

    // Second pass: any PDF
    for (const r of results) {
      if (r.url.toLowerCase().endsWith('.pdf')) {
        return r.url;
      }
    }

    // Third pass: docs sites that likely have parseable content
    for (const r of results) {
      const urlLower = r.url.toLowerCase();
      const titleLower = r.title.toLowerCase();
      if (
        (urlLower.includes('docs.') || urlLower.includes('/docs/') || urlLower.includes('gitbook')) &&
        (titleLower.includes(nameLower) || urlLower.includes(nameLower))
      ) {
        return r.url;
      }
    }

    return null;
  }
}
