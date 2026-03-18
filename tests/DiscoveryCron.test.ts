import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryCron, type DiscoveryCronDeps } from '../src/discovery/DiscoveryCron';
import type { TokenCreationEvent, ProjectMetadata, ResolvedWhitepaper } from '../src/types';

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

function makeResolved(overrides: Partial<ResolvedWhitepaper> = {}): ResolvedWhitepaper {
  // Default: 20K chars with technical keywords (consensus, protocol, algorithm = 3 hits)
  return {
    text: 'This document describes a consensus protocol with a novel algorithm for validator selection. The proof of the theorem shows convergence.',
    pageCount: 8,
    isImageOnly: false,
    isPasswordProtected: false,
    source: 'direct',
    originalUrl: 'https://example.com/whitepaper.pdf',
    resolvedUrl: 'https://example.com/whitepaper.pdf',
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
    resolver: {
      resolveWhitepaper: vi.fn().mockResolvedValue(makeResolved()),
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

  it('full mock pipeline: tokens → enriched → resolved → filtered → ingested', async () => {
    // 20 tokens, 12 with docs, 8 pass filter
    const tokens = Array.from({ length: 20 }, () => makeToken());
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    // 12 tokens have metadata with docs, 8 return null
    let enrichCallCount = 0;
    (deps.enricher.enrichToken as ReturnType<typeof vi.fn>).mockImplementation(() => {
      enrichCallCount++;
      if (enrichCallCount > 12) return Promise.resolve(null);
      return Promise.resolve(makeMetadata());
    });

    // Selector passes 8 of 12
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
    // 2 tokens enriched successfully → candidates
    expect(result.candidatesFound).toBe(2);
  });

  it('resolution failure on some docs → others continue, failures logged', async () => {
    const tokens = Array.from({ length: 5 }, () => makeToken());
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);

    let resolveCount = 0;
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockImplementation(() => {
      resolveCount++;
      if (resolveCount <= 2) return Promise.reject(new Error('resolution failed'));
      return Promise.resolve(makeResolved());
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

  it('stores results with correct status (INGESTED)', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.selector.filterProjects as ReturnType<typeof vi.fn>).mockImplementation((candidates) =>
      candidates.map((c: Record<string, unknown>) => ({ ...c, score: 8 }))
    );

    await cron.runDaily();

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'INGESTED' })
    );
  });

  it('tokens with no document URL are skipped', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.enricher.enrichToken as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMetadata({ linkedUrls: [] })
    );

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
    expect(result.whitepapersIngested).toBe(0);
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
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolved({ isImageOnly: true, text: 'x', pageCount: 5 })
    );

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe('image_only');
  });

  it('skips password-protected documents and logs error', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolved({ isPasswordProtected: true, text: '' })
    );

    const result = await cron.runDaily();

    expect(result.candidatesFound).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe('password_protected');
  });

  it('stores pageCount and isImageOnly in whitepaper record', async () => {
    const tokens = [makeToken()];
    (deps.chainListener.getNewTokensSince as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (deps.resolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolved({ pageCount: 12 })
    );
    (deps.selector.filterProjects as ReturnType<typeof vi.fn>).mockImplementation((candidates) =>
      candidates.map((c: Record<string, unknown>) => ({ ...c, score: 8 }))
    );

    await cron.runDaily();

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pageCount: 12,
        metadataJson: expect.objectContaining({ isImageOnly: false }),
      })
    );
  });
});
