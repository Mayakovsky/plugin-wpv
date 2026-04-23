import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Fix 3 (2026-04-23): handler-level fetch-failure fallback.
 *
 * Regression: eval Job 1249 — Aave with document_url "https://aave.com/whitepaper.pdf"
 * which returns HTTP 404. Old handler let the exception propagate, bubbling
 * through handleVerifyWhitepaper's catch (which only handles Pipeline timeout)
 * → plugin-acp's handleJobFunded catch → Phase 2 INSUFFICIENT_DATA envelope
 * with `discoveryAttempts: []` and raw error string.
 *
 * Fix: catch fetch errors in the handler, fall through to tieredDiscovery,
 * re-run runL1L2 with discovered URL. If fallback also fails, return
 * insufficientData with populated discoveryAttempts so evaluator can see
 * the agent tried.
 */

function createFallbackDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'wp-new', projectName: 'Aave' }),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'v-new' }),
      deleteByWhitepaperId: vi.fn(),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'c-new' }),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    structuralAnalyzer: {
      analyze: vi.fn().mockResolvedValue({ hasAbstract: true }),
      computeQuickFilterScore: vi.fn().mockReturnValue(4),
      computeHypeTechRatio: vi.fn().mockReturnValue(0.1),
    } as never,
    claimExtractor: {
      extractClaims: vi.fn().mockResolvedValue([
        { claimId: 'c-1', category: 'TOKENOMICS', claimText: 'test', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { claimId: 'c-2', category: 'PERFORMANCE', claimText: 'test', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ]),
    } as never,
    claimEvaluator: {
      evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }),
    } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 70,
        focusAreaScores: { TOKENOMICS: 70, PERFORMANCE: 70, CONSENSUS: null, SCIENTIFIC: null },
        verdict: Verdict.PASS,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn(),
      generateTokenomicsAudit: vi.fn().mockReturnValue({
        projectName: 'Aave', verdict: 'PASS', claims: [], logicSummary: '',
      }),
      generateFullVerification: vi.fn().mockReturnValue({
        projectName: 'Aave', verdict: 'PASS', confidenceScore: 70, claims: [], evaluations: [],
      }),
      generateDailyBriefing: vi.fn(),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: {
      resolveWhitepaper: vi.fn(),
    } as never,
    tieredDiscovery: {
      discover: vi.fn(),
    } as never,
  };
}

describe('handleVerifyWhitepaper — Fix 3: fetch-failure fallback', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createFallbackDeps();
    router = new JobRouter(deps);
  });

  it('document_url 404 + successful discovery → falls through, succeeds, reports tier', async () => {
    // Tier 1: 404
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('HTTP 404 fetching https://aave.com/whitepaper.pdf'))
      .mockResolvedValueOnce({
        text: 'real aave whitepaper text', pageCount: 10,
        isImageOnly: false, isPasswordProtected: false,
        source: 'direct', originalUrl: 'github', resolvedUrl: 'github',
      });
    // Discovery succeeds at tier 3 (GitHub)
    (deps.tieredDiscovery!.discover as ReturnType<typeof vi.fn>).mockResolvedValue({
      resolved: { text: 'real aave whitepaper text', pageCount: 10, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'github', resolvedUrl: 'github' },
      documentUrl: 'https://github.com/aave/aave-protocol/blob/master/docs/Aave_Protocol_Whitepaper_v1_0.pdf',
      documentSource: 'pdf',
      tier: 3,
    });

    const result = await router.handleJob('verify_project_whitepaper', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    }) as { discoveryStatus: string; discoverySourceTier: number; discoveryAttempts: Array<{ tier: number; status: string }> };

    expect(result.discoveryStatus).toBe('community');
    expect(result.discoverySourceTier).toBe(3);
    expect(result.discoveryAttempts).toHaveLength(2);
    expect(result.discoveryAttempts[0].tier).toBe(1);
    expect(result.discoveryAttempts[0].status).toBe('error');
    expect(result.discoveryAttempts[1].tier).toBe(3);
    expect(result.discoveryAttempts[1].status).toBe('community');
  });

  it('document_url 404 + discovery also fails → INSUFFICIENT_DATA with populated discoveryAttempts', async () => {
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('HTTP 404 fetching https://aave.com/whitepaper.pdf'));
    (deps.tieredDiscovery!.discover as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await router.handleJob('verify_project_whitepaper', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    }) as { verdict: string; discoveryStatus: string; discoveryAttempts: Array<{ tier: number; status: string }> };

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.discoveryStatus).toBe('failed');
    expect(result.discoveryAttempts.length).toBeGreaterThan(0);
    // Tier 1 error recorded
    expect(result.discoveryAttempts[0].tier).toBe(1);
    expect(result.discoveryAttempts[0].status).toBe('error');
    // Discovery failure also recorded
    const tier4Attempt = result.discoveryAttempts.find((a) => a.tier === 4);
    expect(tier4Attempt).toBeDefined();
    expect(tier4Attempt?.status).toBe('failed');
  });

  it('document_url succeeds normally → single Tier 1 attempt recorded', async () => {
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'aave whitepaper content', pageCount: 10,
      isImageOnly: false, isPasswordProtected: false,
      source: 'direct', originalUrl: 'aave', resolvedUrl: 'aave',
    });

    const result = await router.handleJob('verify_project_whitepaper', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper-v1.pdf',
      project_name: 'Aave',
    }) as { discoveryStatus: string; discoverySourceTier: number; discoveryAttempts: Array<{ tier: number; status: string }> };

    expect(result.discoveryStatus).toBe('provided');
    expect(result.discoverySourceTier).toBe(1);
    expect(result.discoveryAttempts).toHaveLength(1);
    expect(result.discoveryAttempts[0].tier).toBe(1);
    expect(result.discoveryAttempts[0].status).toBe('provided');
    // Discovery should not have been called
    expect(deps.tieredDiscovery!.discover).not.toHaveBeenCalled();
  });

  it('Pipeline timeout still propagates (not caught by fetch-failure handler)', async () => {
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Pipeline timeout'));

    const result = await router.handleJob('verify_project_whitepaper', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    }) as { verdict: string };

    // Pipeline timeout bypasses fallback and returns INSUFFICIENT_DATA via outer catch
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    // Discovery should NOT have been called (timeout short-circuits)
    expect(deps.tieredDiscovery!.discover).not.toHaveBeenCalled();
  });
});

describe('handleFullVerification — Fix 3: fetch-failure fallback', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createFallbackDeps();
    router = new JobRouter(deps);
  });

  it('document_url 404 + successful discovery → falls through, reports tier', async () => {
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValueOnce({
        text: 'real whitepaper text', pageCount: 10,
        isImageOnly: false, isPasswordProtected: false,
        source: 'direct', originalUrl: 'found', resolvedUrl: 'found',
      });
    (deps.tieredDiscovery!.discover as ReturnType<typeof vi.fn>).mockResolvedValue({
      resolved: { text: 'real whitepaper text', pageCount: 10, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'found', resolvedUrl: 'found' },
      documentUrl: 'https://github.com/aave/whitepaper.pdf',
      documentSource: 'pdf',
      tier: 3,
    });

    const result = await router.handleJob('full_technical_verification', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    }) as { discoveryStatus: string; discoverySourceTier: number; discoveryAttempts: Array<{ tier: number; status: string }> };

    expect(result.discoveryStatus).toBe('community');
    expect(result.discoverySourceTier).toBe(3);
    expect(result.discoveryAttempts).toHaveLength(2);
    expect(result.discoveryAttempts[0].status).toBe('error');
    expect(result.discoveryAttempts[1].status).toBe('community');
  });

  it('document_url 404 + discovery fails → INSUFFICIENT_DATA with populated attempts', async () => {
    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('HTTP 404'));
    (deps.tieredDiscovery!.discover as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await router.handleJob('full_technical_verification', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    }) as { verdict: string; discoveryStatus: string; discoveryAttempts: Array<{ tier: number; status: string }> };

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.discoveryStatus).toBe('failed');
    expect(result.discoveryAttempts.length).toBeGreaterThanOrEqual(2);
    expect(result.discoveryAttempts[0].tier).toBe(1);
    expect(result.discoveryAttempts[0].status).toBe('error');
  });
});
