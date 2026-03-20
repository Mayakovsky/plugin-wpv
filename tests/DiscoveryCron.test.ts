import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryCron, type DiscoveryCronDeps } from '../src/discovery/DiscoveryCron';
import type { TokenCreationEvent, ProjectMetadata, ResolvedWhitepaper, TieredDiscoveryResult } from '../src/types';

function makeToken(overrides: Partial<TokenCreationEvent> = {}): TokenCreationEvent {
  return {
    contractAddress: `0x${Math.random().toString(16).slice(2, 10)}`,
    agentToken: `0xagent${Math.random().toString(16).slice(2, 10)}`,
    deployer: '0xdeployer',
    timestamp: Math.floor(Date.now() / 1000), // fresh
    blockNumber: 1000,
    transactionHash: `0xtx${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    agentName: 'TestProject',
    entityId: 'entity-1',
    description: 'A great project',
    linkedUrls: ['https://example.com/whitepaper.pdf'],
    category: 'DeFi',
    graduationStatus: 'graduated',
    ...overrides,
  };
}

function makeDiscoveryResult(overrides: Partial<TieredDiscoveryResult> = {}): TieredDiscoveryResult {
  return {
    resolved: {
      text: 'This document describes a consensus protocol with a novel algorithm for validator selection. The proof of the theorem shows convergence.',
      pageCount: 8,
      isImageOnly: false,
      isPasswordProtected: false,
      source: 'direct',
      originalUrl: 'https://example.com/whitepaper.pdf',
      resolvedUrl: 'https://example.com/whitepaper.pdf',
    },
    documentUrl: 'https://example.com/whitepaper.pdf',
    documentSource: 'pdf',
    tier: 1,
    ...overrides,
  };
}

function createMockDeps(): DiscoveryCronDeps {
  return {
    chainListener: {
      getLastProcessedBlock: vi.fn().mockReturnValue(0),
      getNewTokensSince: vi.fn().mockResolvedValue([]),
      getLatestTokens: vi.fn().mockResolvedValue([]),
    } as never,
    enricher: {
      enrichToken: vi.fn().mockResolvedValue(makeMetadata()),
    } as never,
    selector: {
      filterProjects: vi.fn((candidates) => candidates), // pass-through
      scoreProject: vi.fn().mockReturnValue(8),
    } as never,
    tieredDiscovery: {
      discover: vi.fn().mockResolvedValue(makeDiscoveryResult()),
    } as never,
    tractionAnalyzer: {
      evaluate: vi.fn().mockResolvedValue({
        graduationSpeed: 'moderate',
        transferCount7d: 10,
        uniqueAddresses7d: 5,
        agdp7d: null,
        marketTraction: false,
      }),
    } as never,
    whitepaperRepo: {
      create: vi.fn().mockResolvedValue({ id: 'wp-1' }),
    } as never,
  };
}

describe('DiscoveryCron', () => {
  let deps: DiscoveryCronDeps;
  let cron: DiscoveryCron;

  beforeEach(() => {
    deps = createMockDeps();
    cron = new DiscoveryCron(deps);
  });

  it('full mock pipeline: tokens → enriched → discovered → filtered → ingested', async () => {
    const tokens = Array.from({ length: 20 }, () => makeToken());
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    let enrichCallCount = 0;
    (deps.enricher.enrichToken as ReturnType<typeof vi.fn>).mockImplementation(() => {
      enrichCallCount++;
      if (enrichCallCount > 12) return Promise.resolve(null);
      return Promise.resolve(makeMetadata());
    });

    (deps.selector.filterProjects as ReturnType<typeof vi.fn>).mockImplementation((candidates) =>
      candidates.slice(0, 8).map((c: Record<string, unknown>) => ({ ...c, score: 8 }))
    );

    const result = await cron.runDaily();

    expect(result.tokensScanned).toBe(20);
    expect(result.whitepapersIngested).toBe(8);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('zero new tokens → empty result, no errors', async () => {
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await cron.runDaily();

    expect(result.tokensScanned).toBe(0);
    expect(result.candidatesFound).toBe(0);
    expect(result.whitepapersIngested).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('enrichment failure on some tokens → others continue, failures logged', async () => {
    const tokens = Array.from({ length: 5 }, () => makeToken());
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    let callCount = 0;
    (deps.enricher.enrichToken as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount <= 3) return Promise.reject(new Error('enrichment failed'));
      return Promise.resolve(makeMetadata());
    });

    const result = await cron.runDaily();

    expect(result.errors.length).toBe(3);
    expect(result.candidatesFound).toBe(2);
  });

  it('discovery failure on some tokens → others continue, failures logged', async () => {
    const tokens = Array.from({ length: 5 }, () => makeToken());
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    let discoverCount = 0;
    (deps.tieredDiscovery.discover as ReturnType<typeof vi.fn>).mockImplementation(() => {
      discoverCount++;
      if (discoverCount <= 2) return Promise.resolve(null); // all tiers failed
      return Promise.resolve(makeDiscoveryResult());
    });

    const result = await cron.runDaily();

    expect(result.errors.length).toBe(2);
    expect(result.candidatesFound).toBe(3);
  });

  it('returns accurate timing (durationMs)', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    const result = await cron.runDaily();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('stores results with correct status and document metadata', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.selector.filterProjects as ReturnType<typeof vi.fn>).mockImplementation((candidates) =>
      candidates.map((c: Record<string, unknown>) => ({ ...c, score: 8 }))
    );

    await cron.runDaily();

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INGESTED',
        metadataJson: expect.objectContaining({
          documentSource: 'pdf',
          discoveryTier: 1,
        }),
      })
    );
  });

  it('tokens returning null metadata are skipped', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.enricher.enrichToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
  });

  it('skips image-only documents and logs error', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.tieredDiscovery.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDiscoveryResult({
        resolved: {
          text: 'x', pageCount: 5, isImageOnly: true, isPasswordProtected: false,
          source: 'direct', originalUrl: 'x', resolvedUrl: 'x',
        },
      })
    );

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe('image_only');
  });

  it('skips password-protected documents and logs error', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.tieredDiscovery.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDiscoveryResult({
        resolved: {
          text: '', pageCount: 1, isImageOnly: false, isPasswordProtected: true,
          source: 'direct', originalUrl: 'x', resolvedUrl: 'x',
        },
      })
    );

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
    expect(result.errors[0].error).toBe('password_protected');
  });

  it('composed whitepaper (Tier 4) stores correct documentSource', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.tieredDiscovery.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDiscoveryResult({
        documentSource: 'composed',
        tier: 4,
        resolved: {
          text: '# Composed Whitepaper\nSome content about the project and its tokenomics.',
          pageCount: 1, isImageOnly: false, isPasswordProtected: false,
          source: 'composed', originalUrl: 'https://app.virtuals.io/virtuals/0x123',
          resolvedUrl: 'https://app.virtuals.io/virtuals/0x123',
        },
      })
    );
    (deps.selector.filterProjects as ReturnType<typeof vi.fn>).mockImplementation((c) =>
      c.map((x: Record<string, unknown>) => ({ ...x, score: 6 }))
    );

    await cron.runDaily();

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataJson: expect.objectContaining({
          documentSource: 'composed',
          discoveryTier: 4,
        }),
      })
    );
  });
});
