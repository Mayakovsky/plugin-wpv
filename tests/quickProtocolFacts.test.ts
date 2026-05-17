import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';

// quick_protocol_facts is cache-only — touches whitepaperRepo + claimsRepo
// (via findWhitepaper) + verificationsRepo. Everything else is stubbed.
function createMockDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(null),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    structuralAnalyzer: {} as never,
    claimExtractor: {} as never,
    claimEvaluator: {} as never,
    scoreAggregator: {} as never,
    reportGenerator: {} as never,
    pricingConfig: {
      inputPerToken: LLM_PRICING.inputPerToken,
      outputPerToken: LLM_PRICING.outputPerToken,
    },
    cryptoResolver: {} as never,
    tieredDiscovery: null,
  };
}

describe('quick_protocol_facts', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createMockDeps();
    router = new JobRouter(deps);
  });

  it('returns chat-sized summary on cache hit', async () => {
    const wp = {
      id: 'wp-1',
      projectName: 'Aave',
      tokenAddress: '0xaave',
      documentUrl: 'https://aave.com/whitepaper.pdf',
    };
    const verification = {
      verdict: 'PASS',
      structuralAnalysisJson: { mica: { micaCompliant: 'YES', claimsMicaCompliance: 'YES' } },
      verifiedAt: new Date('2026-04-20T12:00:00Z'),
    };

    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    // findWhitepaper requires claims > 0 to consider a row usable
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue(verification);

    const result = await router.handleJob('quick_protocol_facts', { projectQuery: 'Aave' }) as Record<string, unknown>;

    expect(result.project).toMatchObject({
      name: 'Aave',
      tokenAddress: '0xaave',
      whitepaperUrl: 'https://aave.com/whitepaper.pdf',
    });
    expect(result.miCAStatus).toBe('YES');
    expect(result.headlineVerdict).toBe('PASS');
    expect(result.lastVerified).toBe('2026-04-20T12:00:00.000Z');
    expect(result.sources).toEqual([{ kind: 'whitepaper', url: 'https://aave.com/whitepaper.pdf' }]);
    expect(result.type).toBeNull();
    expect(result.note).toBeUndefined();
  });

  it('routes a 0x token address through findByTokenAddress', async () => {
    const wp = { id: 'wp-1', projectName: 'X', tokenAddress: '0xABC', documentUrl: 'u' };
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      verdict: 'PASS', verifiedAt: new Date('2026-04-01T00:00:00Z'),
    });

    await router.handleJob('quick_protocol_facts', { projectQuery: '0xABCDEFabcdef0000111122223333444455556666' });

    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalled();
    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
  });

  it('routes a base58 (Solana) address through findByTokenAddress', async () => {
    const wp = { id: 'wp-sol', projectName: 'Y', tokenAddress: 'Sol123', documentUrl: 'u' };
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      verdict: 'PASS', verifiedAt: new Date('2026-04-01T00:00:00Z'),
    });

    await router.handleJob('quick_protocol_facts', { projectQuery: 'A4Aa91nTncdXH9f1yVwPFsboNzAZAQi2qDF7pXYhuRqe' });

    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalledWith('A4Aa91nTncdXH9f1yVwPFsboNzAZAQi2qDF7pXYhuRqe');
    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
  });

  it('returns NOT_IN_DATABASE for a URL identifier (no repo lookup available)', async () => {
    const result = await router.handleJob('quick_protocol_facts', {
      projectQuery: 'https://example.com/whitepaper.pdf',
    }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
    expect(deps.whitepaperRepo.findByTokenAddress).not.toHaveBeenCalled();
    expect(result.headlineVerdict).toBe('NOT_IN_DATABASE');
    expect(result.project).toEqual({ query: 'https://example.com/whitepaper.pdf' });
    expect((result.note as string)).toMatch(/not yet verified/);
  });

  it('returns NOT_IN_DATABASE with cache-miss note when no whitepaper resolves', async () => {
    const result = await router.handleJob('quick_protocol_facts', { projectQuery: 'UnknownProject' }) as Record<string, unknown>;

    expect(result.headlineVerdict).toBe('NOT_IN_DATABASE');
    expect(result.miCAStatus).toBeNull();
    expect(result.lastVerified).toBeNull();
    expect(result.sources).toEqual([]);
    expect(result.project).toEqual({ query: 'UnknownProject' });
    expect((result.note as string)).toMatch(/verify_whitepaper or verify_full_tech/);
  });

  it('returns INSUFFICIENT_DATA when whitepaper exists but no verification', async () => {
    const wp = { id: 'wp-bare', projectName: 'Bare', tokenAddress: '0xbare', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    // verification is null
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await router.handleJob('quick_protocol_facts', { projectQuery: 'Bare' }) as Record<string, unknown>;

    expect(result.headlineVerdict).toBe('INSUFFICIENT_DATA');
    expect((result.project as Record<string, unknown>).name).toBe('Bare');
    expect((result.note as string)).toMatch(/no verification record/);
    expect(result.sources).toEqual([{ kind: 'whitepaper', url: 'u' }]);
  });

  it('returns NOT_IN_DATABASE when projectQuery is empty', async () => {
    const result = await router.handleJob('quick_protocol_facts', { projectQuery: '   ' }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
    expect(result.headlineVerdict).toBe('NOT_IN_DATABASE');
    expect((result.note as string)).toBe('projectQuery is required');
  });

  it('extracts MiCA status from structuralAnalysisJson.mica', async () => {
    const wp = { id: 'wp-1', projectName: 'P', tokenAddress: '0xp', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      verdict: 'CONDITIONAL',
      structuralAnalysisJson: { mica: { micaCompliant: 'PARTIAL' } },
      verifiedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const result = await router.handleJob('quick_protocol_facts', { projectQuery: 'P' }) as Record<string, unknown>;

    expect(result.miCAStatus).toBe('PARTIAL');
    expect(result.headlineVerdict).toBe('CONDITIONAL');
  });

  it('returns miCAStatus=null when verification has no mica field', async () => {
    const wp = { id: 'wp-1', projectName: 'P', tokenAddress: '0xp', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1' }]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      verdict: 'PASS',
      structuralAnalysisJson: { /* no mica field */ },
      verifiedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const result = await router.handleJob('quick_protocol_facts', { projectQuery: 'P' }) as Record<string, unknown>;

    expect(result.miCAStatus).toBeNull();
    expect(result.headlineVerdict).toBe('PASS');
  });

  it('mutex bypass: resolves while a parallel verify_full_tech job hangs', async () => {
    let releaseFullTech: () => void = () => {};
    const fullTechBlocker = new Promise<void>((resolve) => { releaseFullTech = resolve; });

    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps as { tieredDiscovery: unknown }).tieredDiscovery = {
      discover: vi.fn().mockImplementation(async () => {
        await fullTechBlocker;
        return null;
      }),
    };

    const fullTechPromise = router.handleJob('verify_full_tech', { project_name: 'Slow', token_address: '0xslow' });

    // quick_protocol_facts must resolve without waiting on the hung full_tech job.
    const result = await Promise.race([
      router.handleJob('quick_protocol_facts', { projectQuery: 'Fast' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('quick_protocol_facts blocked by mutex')), 1000)),
    ]) as Record<string, unknown>;

    expect(result.headlineVerdict).toBe('NOT_IN_DATABASE');

    releaseFullTech();
    await fullTechPromise.catch(() => {});
  });
});
