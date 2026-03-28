// Minimal IContentResolver using fetch — for live L1 scans where
// plugin-autognostic's ContentResolver may not be available.
// Handles HTML pages. PDF support is basic (extracts raw text).

import type { IContentResolver, ResolvedContent } from '../types';

export class FetchContentResolver implements IContentResolver {
  async resolve(url: string): Promise<ResolvedContent> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
        'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    if (contentType.includes('application/pdf')) {
      return {
        text: body.length > 100 ? body : '',
        contentType: 'application/pdf',
        source: 'pdf',
        resolvedUrl: url,
        diagnostics: ['FetchContentResolver: raw PDF text'],
      };
    }

    // HTML — strip tags for plain text
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#?\w+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      text,
      contentType: contentType || 'text/html',
      source: 'html',
      resolvedUrl: url,
      diagnostics: ['FetchContentResolver: HTML text extraction'],
    };
  }
}
