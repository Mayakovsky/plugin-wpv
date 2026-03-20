import { describe, it, expect, vi } from 'vitest';
import { TieredDocumentDiscovery, type TieredDocumentDiscoveryDeps } from '../src/discovery/TieredDocumentDiscovery';
import type { ProjectMetadata, ResolvedWhitepaper } from '../src/types';

function makeMetadata(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    agentName: 'TestProject',
    entityId: 'entity-1',
    description: 'A project',
    linkedUrls: [],
    category: 'DeFi',
    graduationStatus: 'graduated',
    ...overrides,
  };
}

function makeResolved(overrides: Partial<ResolvedWhitepaper> = {}): ResolvedWhitepaper {
  return {
    text: 'This is a comprehensive whitepaper about a consensus protocol and algorithm design with validator nodes. The protocol achieves byzantine fault tolerance through a novel proof mechanism that ensures finality within 3 seconds.',
    pageCount: 8,
    isImageOnly: false,
    isPasswordProtected: false,
    source: 'direct',
    originalUrl: 'https://example.com/wp.pdf',
    resolvedUrl: 'https://example.com/wp.pdf',
    ...overrides,
  };
}

function createMockDeps(): TieredDocumentDiscoveryDeps {
  return {
    resolver: {
      resolveWhitepaper: vi.fn().mockResolvedValue(makeResolved()),
    } as never,
    websiteScraper: {
      findWhitepaperLink: vi.fn().mockResolvedValue(null),
    } as never,
    webSearch: {
      searchWhitepaper: vi.fn().mockResolvedValue(null),
    } as never,
    composer: {
      compose: vi.fn().mockResolvedValue(makeResolved({ source: 'composed', text: '# Composed Whitepaper — TestProject\n\n## Project Overview\nA revolutionary DeFi protocol that enables cross-chain swaps with minimal slippage.\n\n## Token Information\nToken Address: 0xtoken\nChain: Base\n\n## Tokenomics\nTotal supply: 1,000,000,000 tokens. 40% community, 20% team.' })),
    } as never,
  };
}

describe('TieredDocumentDiscovery', () => {
  it('Tier 1: uses PDF from ACP linkedUrls', async () => {
    const deps = createMockDeps();
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://example.com/whitepaper.pdf'] }),
      '0xtoken',
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
    expect(result!.documentSource).toBe('pdf');
    expect(deps.resolver.resolveWhitepaper).toHaveBeenCalledWith('https://example.com/whitepaper.pdf');
  });

  it('Tier 1: uses IPFS link from ACP linkedUrls', async () => {
    const deps = createMockDeps();
    // IPFS URLs resolve with source: 'ipfs'
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolved({ source: 'ipfs' }),
    );
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://ipfs.io/ipfs/QmExample'] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(1);
    expect(result!.documentSource).toBe('ipfs');
  });

  it('Tier 2: falls back to website scraping when no PDF in ACP', async () => {
    const deps = createMockDeps();
    (deps.websiteScraper.findWhitepaperLink as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'https://project.io/docs/whitepaper.pdf',
      type: 'pdf',
    });
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://project.io'] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(2);
    expect(result!.documentSource).toBe('pdf');
    expect(deps.websiteScraper.findWhitepaperLink).toHaveBeenCalledWith(['https://project.io']);
  });

  it('Tier 2: docs_site source for GitBook/Notion links', async () => {
    const deps = createMockDeps();
    (deps.websiteScraper.findWhitepaperLink as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'https://docs.project.io/whitepaper',
      type: 'docs_site',
    });
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://project.io'] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(2);
    expect(result!.documentSource).toBe('docs_site');
  });

  it('Tier 3: falls back to web search when Tier 2 fails', async () => {
    const deps = createMockDeps();
    (deps.webSearch.searchWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(
      'https://found.com/project-whitepaper.pdf',
    );
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: [] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(3);
    expect(result!.documentSource).toBe('pdf');
    expect(deps.webSearch.searchWhitepaper).toHaveBeenCalledWith('TestProject');
  });

  it('Tier 4: falls back to composed whitepaper when all else fails', async () => {
    const deps = createMockDeps();
    (deps.webSearch.searchWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: [] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(4);
    expect(result!.documentSource).toBe('composed');
    expect(deps.composer.compose).toHaveBeenCalledWith('0xtoken', expect.objectContaining({ agentName: 'TestProject' }));
  });

  it('returns null when all tiers fail', async () => {
    const deps = createMockDeps();
    (deps.webSearch.searchWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (deps.composer.compose as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('compose failed'));
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: [] }),
      '0xtoken',
    );

    expect(result).toBeNull();
  });

  it('skips Tier 1 if PDF resolves as image-only', async () => {
    const deps = createMockDeps();
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeResolved({ isImageOnly: true, text: 'x' })) // Tier 1 fails
      .mockResolvedValueOnce(makeResolved()); // Tier 2 succeeds
    (deps.websiteScraper.findWhitepaperLink as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'https://docs.project.io/wp',
      type: 'docs_site',
    });
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://example.com/scanned.pdf', 'https://project.io'] }),
      '0xtoken',
    );

    expect(result!.tier).toBe(2);
  });

  it('stores documentSource and discoveryTier in metadata', async () => {
    const deps = createMockDeps();
    const discovery = new TieredDocumentDiscovery(deps);

    const result = await discovery.discover(
      makeMetadata({ linkedUrls: ['https://example.com/wp.pdf'] }),
      '0xtoken',
    );

    expect(result!.documentSource).toBeDefined();
    expect(result!.tier).toBeDefined();
    expect(typeof result!.tier).toBe('number');
  });
});

describe('WebsiteScraper', () => {
  // Import inline to avoid module issues with fetch mock
  it('extracts PDF links from HTML', async () => {
    const { WebsiteScraper } = await import('../src/discovery/WebsiteScraper');
    const scraper = new WebsiteScraper();

    const links = scraper.extractLinks(
      '<a href="/docs/whitepaper.pdf">Whitepaper</a><a href="https://gitbook.io/project">Docs</a>',
      'https://example.com',
    );

    expect(links.length).toBeGreaterThanOrEqual(1);
    const pdfLink = links.find((l) => l.type === 'pdf');
    expect(pdfLink).toBeDefined();
    expect(pdfLink!.url).toContain('whitepaper.pdf');
  });

  it('identifies docs_site links', async () => {
    const { WebsiteScraper } = await import('../src/discovery/WebsiteScraper');
    const scraper = new WebsiteScraper();

    const links = scraper.extractLinks(
      '<a href="https://docs.project.gitbook.io/whitepaper">Read our whitepaper</a>',
      'https://example.com',
    );

    const docsLink = links.find((l) => l.type === 'docs_site');
    expect(docsLink).toBeDefined();
  });

  it('resolves relative URLs', async () => {
    const { WebsiteScraper } = await import('../src/discovery/WebsiteScraper');
    const scraper = new WebsiteScraper();

    const links = scraper.extractLinks(
      '<a href="/assets/whitepaper.pdf">Download</a>',
      'https://example.com',
    );

    expect(links[0]?.url).toBe('https://example.com/assets/whitepaper.pdf');
  });
});

describe('SyntheticWhitepaperComposer', () => {
  it('composes a document with project sections', async () => {
    const { SyntheticWhitepaperComposer } = await import('../src/discovery/SyntheticWhitepaperComposer');
    const mockFetch = vi.fn().mockRejectedValue(new Error('no page'));
    const composer = new SyntheticWhitepaperComposer(mockFetch as never);

    const result = await composer.compose('0xtoken123', {
      agentName: 'TestProject',
      entityId: 'e-1',
      description: 'A revolutionary DeFi protocol.',
      linkedUrls: ['https://testproject.io'],
      category: 'DeFi',
      graduationStatus: 'graduated',
    });

    expect(result.source).toBe('composed');
    expect(result.text).toContain('Composed Whitepaper');
    expect(result.text).toContain('TestProject');
    expect(result.text).toContain('revolutionary DeFi protocol');
    expect(result.text).toContain('0xtoken123');
    expect(result.text).toContain('DeFi');
    expect(result.isImageOnly).toBe(false);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('handles missing metadata gracefully', async () => {
    const { SyntheticWhitepaperComposer } = await import('../src/discovery/SyntheticWhitepaperComposer');
    const mockFetch = vi.fn().mockRejectedValue(new Error('no page'));
    const composer = new SyntheticWhitepaperComposer(mockFetch as never);

    const result = await composer.compose('0xtoken', {
      agentName: null,
      entityId: null,
      description: null,
      linkedUrls: [],
      category: null,
      graduationStatus: null,
    });

    expect(result.source).toBe('composed');
    expect(result.text).toContain('0xtoken');
    expect(result.text).toContain('No description available');
  });
});
