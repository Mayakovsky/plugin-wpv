import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Fix 5A (2026-04-24): mutex bypass for legit_scan cache-hit.
 *
 * Regression: eval Job 1308. Aave legit_scan was a clean cache hit (tier 0,
 * 22 claims), deliverable generated correctly at 01:32:58Z — but queued
 * behind Jobs 1304+1305 (full_tech with Sonnet synthesis, ~20-30s each).
 * On-chain submit landed past the buyer's deadline → EXPIRED.
 *
 * Fix: cache-hit legit_scan runs before the mutex is acquired. Only cache
 * miss (live L1 pipeline) serializes. Reads touch none of the shared state
 * the mutex was protecting (no Playwright, no DB upserts, no cost-tracker
 * writes).
 */

function createMutexDeps(): JobRouterDeps {
  const aaveRow = {
    id: 'wp-aave',
    projectName: 'Aave',
    tokenAddress: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    documentUrl: 'https://aave.com/whitepaper-v1.pdf',
  };
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([aaveRow]),
      findByTokenAddress: vi.fn().mockResolvedValue([aaveRow]),
      findById: vi.fn().mockResolvedValue(aaveRow),
      create: vi.fn(),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue({
        structuralScore: 3, confidenceScore: 72, hypeTechRatio: 0,
        verdict: 'FAIL', totalClaims: 22, verifiedClaims: 22,
        llmTokensUsed: 0, computeCostUsd: 0, focusAreaScores: {},
      }),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(
        Array.from({ length: 22 }, (_, i) => ({
          id: `c-${i}`, category: 'TOKENOMICS', claimText: 'c', statedEvidence: '', sourceSection: '', mathProofPresent: false,
        })),
      ),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    structuralAnalyzer: { analyze: vi.fn(), computeQuickFilterScore: vi.fn(), computeHypeTechRatio: vi.fn() } as never,
    claimExtractor: { extractClaims: vi.fn().mockResolvedValue([]) } as never,
    claimEvaluator: { evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }) } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 72, focusAreaScores: {}, verdict: Verdict.FAIL,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn().mockReturnValue({
        projectName: 'Aave', tokenAddress: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
        verdict: 'FAIL', structuralScore: 3, claimCount: 22,
      }),
      generateTokenomicsAudit: vi.fn(),
      generateFullVerification: vi.fn(),
      generateDailyBriefing: vi.fn(),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: { resolveWhitepaper: vi.fn() } as never,
    tieredDiscovery: null,
  };
}

describe('Fix 5A: mutex bypass for legit_scan cache-hit', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createMutexDeps();
    router = new JobRouter(deps);
  });

  it('legit_scan cache-hit returns without waiting for held mutex', async () => {
    // Simulate a stuck job holding the mutex by acquiring it manually and never releasing.
    // Access private _jobLock via bracket notation; overwrite with a never-resolving promise
    // then kick off legit_scan. If Fix 5A works, legit_scan resolves immediately.
    // If not, it hangs behind the mutex.
    const stuckPromise = new Promise<void>(() => { /* never resolves */ });
    (router as never as { _jobLock: Promise<void> })._jobLock = stuckPromise;

    const legitScan = router.handleJob('project_legitimacy_scan', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      project_name: 'Aave',
    });

    // Race the legit_scan against a timeout — if Fix 5A works, legit_scan wins.
    const result = await Promise.race([
      legitScan,
      new Promise((_, reject) => setTimeout(() => reject(new Error('blocked by mutex')), 500)),
    ]) as { verdict: string; projectName: string };

    expect(result.projectName).toBe('Aave');
    expect(result.verdict).toBe('FAIL');
  });

  it('legit_scan cache-miss falls through to mutex (and runs live pipeline)', async () => {
    // Cache miss: both findByProjectName and findByTokenAddress return empty
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // No tieredDiscovery → falls through to insufficientData
    const result = await router.handleJob('project_legitimacy_scan', {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      project_name: 'UnknownProject',
    }) as { verdict: string };

    // Cache miss correctly handled — returns INSUFFICIENT_DATA since no discovery stack
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('non-legit_scan offerings still acquire mutex (serialization preserved)', async () => {
    // Block the mutex with a stuck promise
    const stuckPromise = new Promise<void>(() => { /* never resolves */ });
    (router as never as { _jobLock: Promise<void> })._jobLock = stuckPromise;

    // full_tech should hang behind the mutex
    const fullTech = router.handleJob('full_technical_verification', {
      project_name: 'Aave',
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    });

    const raced = await Promise.race([
      fullTech.then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 200)),
    ]);

    expect(raced).toBe('blocked'); // mutex correctly blocked full_tech
  });

  it('briefing offering still exempt from mutex', async () => {
    const stuckPromise = new Promise<void>(() => { /* never resolves */ });
    (router as never as { _jobLock: Promise<void> })._jobLock = stuckPromise;

    (deps.reportGenerator.generateDailyBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      date: '2026-04-24', totalVerified: 0, whitepapers: [],
    });

    const briefing = router.handleJob('daily_technical_briefing', {});

    const result = await Promise.race([
      briefing,
      new Promise((_, reject) => setTimeout(() => reject(new Error('blocked')), 500)),
    ]) as { date: string };

    expect(result.date).toBeDefined();
  });
});
