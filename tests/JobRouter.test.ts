import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { CostTracker } from '../src/verification/CostTracker';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

function createMockDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([{ id: 'wp-1', projectName: 'Test', tokenAddress: '0x1' }]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ id: 'wp-1', projectName: 'Test', tokenAddress: '0x1' }),
      create: vi.fn().mockResolvedValue({ id: 'wp-new', projectName: 'New' }),
      deleteById: vi.fn().mockResolvedValue(undefined),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue({
        structuralScore: 4, confidenceScore: 75, hypeTechRatio: 1.0,
        verdict: 'PASS', totalClaims: 5, verifiedClaims: 4, llmTokensUsed: 1000, computeCostUsd: 0.25,
        focusAreaScores: {},
      }),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'v-1' }),
      deleteByWhitepaperId: vi.fn().mockResolvedValue(undefined),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue([
        { id: 'c-1', category: 'TOKENOMICS', claimText: 'Test', statedEvidence: '', sourceSection: '', mathProofPresent: false },
      ]),
      create: vi.fn().mockResolvedValue({ id: 'c-new' }),
      deleteByWhitepaperId: vi.fn().mockResolvedValue(undefined),
    } as never,
    structuralAnalyzer: {
      analyze: vi.fn().mockResolvedValue({ hasAbstract: true }),
      computeQuickFilterScore: vi.fn().mockReturnValue(4),
      computeHypeTechRatio: vi.fn().mockReturnValue(1.0),
    } as never,
    claimExtractor: {
      extractClaims: vi.fn().mockResolvedValue([
        { claimId: 'c-1', category: 'TOKENOMICS', claimText: 'APY 12%', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { claimId: 'c-2', category: 'PERFORMANCE', claimText: 'TPS 5000', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { claimId: 'c-3', category: 'CONSENSUS', claimText: 'BFT', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ]),
    } as never,
    claimEvaluator: {
      evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }),
    } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 75,
        focusAreaScores: { TOKENOMICS: 80, PERFORMANCE: 70, CONSENSUS: 75, SCIENTIFIC: 0 },
        verdict: Verdict.PASS,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn().mockReturnValue({ projectName: 'Test', verdict: 'PASS' }),
      generateTokenomicsAudit: vi.fn().mockReturnValue({ projectName: 'Test', verdict: 'PASS', claims: [] }),
      generateFullVerification: vi.fn().mockReturnValue({ projectName: 'Test', verdict: 'PASS', confidenceScore: 75 }),
      generateDailyBriefing: vi.fn().mockReturnValue({ date: '2026-03-11', totalVerified: 0, whitepapers: [] }),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: {
      resolveWhitepaper: vi.fn().mockResolvedValue({ text: 'whitepaper text', pageCount: 10, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'url', resolvedUrl: 'url' }),
    } as never,
    tieredDiscovery: null,
  };
}

describe('JobRouter', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createMockDeps();
    router = new JobRouter(deps);
  });

  it('routes legitimacy_scan correctly', async () => {
    const result = await router.handleJob('legitimacy_scan', { project_name: 'Test' });
    expect(deps.reportGenerator.generateLegitimacyScan).toHaveBeenCalled();
  });

  it('routes daily_tech_brief correctly', async () => {
    const result = await router.handleJob('daily_tech_brief', {});
    expect(deps.reportGenerator.generateDailyBriefing).toHaveBeenCalled();
  });

  it('cached lookup returns report (mock DB)', async () => {
    const result = await router.handleJob('legitimacy_scan', { project_name: 'Test' }) as Record<string, unknown>;
    expect(result.projectName).toBe('Test');
  });

  it('live verification runs pipeline (mock LLM)', async () => {
    const result = await router.handleJob('verify_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'NewProject',
    });
    expect(deps.cryptoResolver.resolveWhitepaper).toHaveBeenCalled();
    expect(deps.structuralAnalyzer.analyze).toHaveBeenCalled();
    expect(deps.claimExtractor.extractClaims).toHaveBeenCalled();
  });

  it('verify_whitepaper creates DB record', async () => {
    // Ensure "creates new record" path is exercised: no existing row for this project.
    // (The default shared mock returns a stub row regardless of input; override here.)
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await router.handleJob('verify_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'NewProject',
    });
    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'NewProject', status: 'VERIFIED' }),
    );
  });

  it('cache miss with no discovery returns INSUFFICIENT_DATA', async () => {
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await router.handleJob('legitimacy_scan', { project_name: 'Unknown' }) as Record<string, unknown>;
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.projectName).toBe('Unknown');
    expect(result.structuralScore).toBe(0);
    expect(result.claims).toEqual([]);
  });

  it('unknown offering_id returns error', async () => {
    const result = await router.handleJob('nonexistent' as never, {}) as Record<string, unknown>;
    expect(result.error).toBe('unknown_offering');
  });

  it('missing required input fields returns INSUFFICIENT_DATA', async () => {
    const result = await router.handleJob('verify_whitepaper', {}) as Record<string, unknown>;
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('verify_full_tech uses cached result when available', async () => {
    await router.handleJob('verify_full_tech', { project_name: 'Test' });
    expect(deps.reportGenerator.generateFullVerification).toHaveBeenCalled();
    // Should NOT call resolver (cached)
    expect(deps.cryptoResolver.resolveWhitepaper).not.toHaveBeenCalled();
  });

  it('verify_full_tech falls back to live when no cache', async () => {
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await router.handleJob('verify_full_tech', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'NewProject',
    });
    expect(deps.cryptoResolver.resolveWhitepaper).toHaveBeenCalled();
  });

  it('routes by token_address when project_name not found', async () => {
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'wp-1', projectName: 'Token', tokenAddress: '0xabc' }]);

    await router.handleJob('legitimacy_scan', { token_address: '0xabc' });
    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalledWith('0xabc');
  });
});
