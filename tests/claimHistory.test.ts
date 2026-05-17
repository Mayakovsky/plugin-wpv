import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';

// Minimal mock deps. claim_history only touches three repos; everything else
// is stubbed out as `vi.fn()` for the JobRouterDeps shape.
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

describe('claim_history', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createMockDeps();
    router = new JobRouter(deps);
  });

  it('returns full history when a project_name resolves to a whitepaper', async () => {
    const wp = {
      id: 'wp-aave-v3',
      projectName: 'Aave V3',
      tokenAddress: '0xaave',
      documentUrl: 'https://aave.com/whitepaper.pdf',
    };
    const verification = {
      verdict: 'PASS',
      structuralScore: 4,
      confidenceScore: 85,
      hypeTechRatio: 0.6,
      totalClaims: 12,
      verifiedClaims: 10,
      llmTokensUsed: 5000,
      computeCostUsd: 0.85,
      verifiedAt: new Date('2026-04-20T12:00:00Z'),
    };
    const claims = [
      {
        id: 'c-1',
        category: 'TOKENOMICS',
        claimText: 'Stablecoin overcollateralized at 150%',
        statedEvidence: 'Section 3.2',
        sourceSection: '3.2',
        mathProofPresent: true,
        claimScore: 80,
        evaluatedAt: new Date('2026-04-20T12:05:00Z'),
      },
    ];

    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue(verification);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue(claims);

    const result = await router.handleJob('claim_history', { projectIdentifier: 'Aave V3' }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).toHaveBeenCalledWith('Aave V3');
    expect(deps.whitepaperRepo.findByTokenAddress).not.toHaveBeenCalled();
    expect(result.project).toMatchObject({
      name: 'Aave V3',
      tokenAddress: '0xaave',
      whitepaperUrl: 'https://aave.com/whitepaper.pdf',
    });
    expect(result.verifications).toHaveLength(1);
    expect((result.verifications as Array<Record<string, unknown>>)[0]).toMatchObject({
      whitepaperId: 'wp-aave-v3',
      verdict: 'PASS',
      confidenceScore: 85,
      verifiedAt: '2026-04-20T12:00:00.000Z',
    });
    expect(result.claims).toHaveLength(1);
    expect((result.claims as Array<Record<string, unknown>>)[0]).toMatchObject({
      whitepaperId: 'wp-aave-v3',
      claimId: 'c-1',
      category: 'TOKENOMICS',
      mathProofPresent: true,
    });
    expect(result.note).toBeUndefined();
  });

  it('routes a 0x token address through findByTokenAddress, not findByProjectName', async () => {
    const wp = { id: 'wp-1', projectName: 'X', tokenAddress: '0xabc', documentUrl: 'u' };
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);

    await router.handleJob('claim_history', { projectIdentifier: '0xABCDEFabcdef0000111122223333444455556666' });

    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalledWith('0xABCDEFabcdef0000111122223333444455556666');
    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
  });

  it('routes a base58 (Solana) address through findByTokenAddress', async () => {
    const wp = { id: 'wp-sol', projectName: 'Y', tokenAddress: 'A4Aa91nTncdXH9f1yVwPFsboNzAZAQi2qDF7pXYhuRqe', documentUrl: 'u' };
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);

    await router.handleJob('claim_history', { projectIdentifier: 'A4Aa91nTncdXH9f1yVwPFsboNzAZAQi2qDF7pXYhuRqe' });

    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalledWith('A4Aa91nTncdXH9f1yVwPFsboNzAZAQi2qDF7pXYhuRqe');
    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
  });

  it('returns structured no-match for a URL identifier (no repo lookup available)', async () => {
    const result = await router.handleJob('claim_history', {
      projectIdentifier: 'https://aave.com/whitepaper.pdf',
    }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
    expect(deps.whitepaperRepo.findByTokenAddress).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      project: { query: 'https://aave.com/whitepaper.pdf' },
      verifications: [],
      claims: [],
      note: 'no prior verifications found',
    });
  });

  it('returns structured no-match when no whitepaper resolves', async () => {
    const result = await router.handleJob('claim_history', { projectIdentifier: 'UnknownProject' }) as Record<string, unknown>;

    expect(result).toMatchObject({
      project: { query: 'UnknownProject' },
      verifications: [],
      claims: [],
      note: 'no prior verifications found',
    });
  });

  it('falls back to version-strip when exact project name misses', async () => {
    const wp = { id: 'wp-aave-base', projectName: 'Aave', tokenAddress: '0xaave', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])    // exact "Aave V3" misses
      .mockResolvedValueOnce([wp]); // stripped "Aave" hits

    const result = await router.handleJob('claim_history', { projectIdentifier: 'Aave V3' }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).toHaveBeenNthCalledWith(1, 'Aave V3');
    expect(deps.whitepaperRepo.findByProjectName).toHaveBeenNthCalledWith(2, 'Aave');
    expect((result.project as Record<string, unknown>).name).toBe('Aave');
  });

  it('aggregates across multiple whitepapers (e.g., V1 + V3)', async () => {
    const wp1 = { id: 'wp-v1', projectName: 'Aave', tokenAddress: '0xaave-v1', documentUrl: 'u1' };
    const wp3 = { id: 'wp-v3', projectName: 'Aave V3', tokenAddress: '0xaave-v3', documentUrl: 'u3' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp1, wp3]);

    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => ({
      verdict: id === 'wp-v3' ? 'PASS' : 'CONDITIONAL',
      verifiedAt: id === 'wp-v3'
        ? new Date('2026-04-20T12:00:00Z')
        : new Date('2026-02-10T08:00:00Z'),
      totalClaims: 5,
    }));

    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => [
      { id: `${id}-c-1`, category: 'PERFORMANCE', claimText: 'x', statedEvidence: '', sourceSection: '', mathProofPresent: false, evaluatedAt: null },
    ]);

    const result = await router.handleJob('claim_history', { projectIdentifier: 'Aave' }) as Record<string, unknown>;

    expect((result.verifications as unknown[]).length).toBe(2);
    expect((result.claims as unknown[]).length).toBe(2);
    // Most recent verification first (desc by date)
    expect(((result.verifications as Array<Record<string, unknown>>)[0]).whitepaperId).toBe('wp-v3');
    expect(((result.verifications as Array<Record<string, unknown>>)[1]).whitepaperId).toBe('wp-v1');
  });

  it('returns empty arrays + note when projectIdentifier is empty', async () => {
    const result = await router.handleJob('claim_history', { projectIdentifier: '   ' }) as Record<string, unknown>;

    expect(deps.whitepaperRepo.findByProjectName).not.toHaveBeenCalled();
    expect(deps.whitepaperRepo.findByTokenAddress).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      project: { query: '' },
      verifications: [],
      claims: [],
      note: 'projectIdentifier is required',
    });
  });

  it('includes project metadata even when a matched whitepaper has no verification yet', async () => {
    const wp = { id: 'wp-bare', projectName: 'BareProject', tokenAddress: '0xbare', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([wp]);
    // verificationsRepo + claimsRepo return empty for this whitepaper (default mock)

    const result = await router.handleJob('claim_history', { projectIdentifier: 'BareProject' }) as Record<string, unknown>;

    expect(result.project).toMatchObject({
      name: 'BareProject',
      tokenAddress: '0xbare',
      whitepaperUrl: 'u',
    });
    expect(result.verifications).toHaveLength(0);
    expect(result.claims).toHaveLength(0);
    expect(result.note).toBeUndefined();
  });

  it('mutex bypass: does not block waiting on a prior verify_full_tech job', async () => {
    // Simulate a long-running verify_full_tech job that has acquired the mutex.
    // Mock the full pipeline deps so handleFullVerification will hang (we never
    // resolve the cryptoResolver promise inside the discovery branch).
    let releaseFullTech: () => void = () => {};
    const fullTechBlocker = new Promise<void>((resolve) => {
      releaseFullTech = resolve;
    });

    // Make findBestWhitepaper return null so handleFullVerification falls into
    // the discovery path, then make tieredDiscovery hang on the blocker.
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const hangingDiscovery = {
      discover: vi.fn().mockImplementation(async () => {
        await fullTechBlocker;
        return null;
      }),
    };
    (deps as { tieredDiscovery: unknown }).tieredDiscovery = hangingDiscovery;

    // Fire and forget — the mutex bypass means claim_history doesn't wait on this.
    const fullTechPromise = router.handleJob('verify_full_tech', { project_name: 'Slow', token_address: '0xslow' });

    // Now run claim_history — should resolve without waiting for fullTechPromise.
    const wp = { id: 'wp-fast', projectName: 'Fast', tokenAddress: '0xfast', documentUrl: 'u' };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValueOnce([wp]);

    const result = await Promise.race([
      router.handleJob('claim_history', { projectIdentifier: 'Fast' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('claim_history blocked by mutex')), 1000)),
    ]) as Record<string, unknown>;

    expect((result.project as Record<string, unknown>).name).toBe('Fast');

    // Cleanup — release the blocked full_tech job
    releaseFullTech();
    await fullTechPromise.catch(() => {}); // swallow any errors from the unblocked path
  });
});
