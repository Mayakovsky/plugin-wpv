import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Fix 2 (2026-04-23): findBestWhitepaper / findWhitepaper — name-path preference.
 *
 * Regression: eval Job 1243 requested "Uniswap V3" with the UNI token address.
 * Cache had BOTH `{name:"Uniswap v3", addr:null, claims:10}` AND
 * `{name:"Uniswap", addr:"0x1f98...", claims:15}`. Old logic merged candidates
 * from name + address lookups, sorted by claimCount, returned V2 (15>10).
 *
 * Fix: name-path preference — if name lookup yields any usable (claims>0)
 * candidate, return it immediately. Address-path consulted only when name
 * yields nothing usable. Preserves version intent when both rows exist.
 */

function createBaseDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue({
        structuralScore: 5, confidenceScore: 70, hypeTechRatio: 0,
        verdict: 'CONDITIONAL', totalClaims: 10, verifiedClaims: 10,
        llmTokensUsed: 1000, computeCostUsd: 0.1, focusAreaScores: {},
      }),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    structuralAnalyzer: { analyze: vi.fn(), computeQuickFilterScore: vi.fn(), computeHypeTechRatio: vi.fn() } as never,
    claimExtractor: { extractClaims: vi.fn().mockResolvedValue([]) } as never,
    claimEvaluator: { evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }) } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 70, focusAreaScores: {}, verdict: Verdict.CONDITIONAL,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn().mockReturnValue({ projectName: 'mock', verdict: 'PASS' }),
      generateTokenomicsAudit: vi.fn().mockImplementation((_v: unknown, _c: unknown, wp: { projectName: string }) => ({
        projectName: wp.projectName, verdict: 'CONDITIONAL', claims: [],
      })),
      generateFullVerification: vi.fn().mockImplementation((_v: unknown, _c: unknown, _e: unknown, wp: { projectName: string }) => ({
        projectName: wp.projectName, verdict: 'CONDITIONAL', confidenceScore: 70,
      })),
      generateDailyBriefing: vi.fn(),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: { resolveWhitepaper: vi.fn() } as never,
    tieredDiscovery: null,
  };
}

describe('findBestWhitepaper — Fix 2: name-path preference', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  const v3Row = {
    id: 'wp-uni-v3',
    projectName: 'Uniswap v3',
    tokenAddress: null,
    documentUrl: 'https://uniswap.org/whitepaper-v3.pdf',
  };
  const v2Row = {
    id: 'wp-uni-v2',
    projectName: 'Uniswap',
    tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    documentUrl: 'https://uniswap.org/whitepaper-v1.pdf',
  };

  beforeEach(() => {
    deps = createBaseDeps();
    router = new JobRouter(deps);
  });

  it('Uniswap V3 request with UNI address — returns V3 row even when V2 has more claims', async () => {
    // DB: exact match for "Uniswap V3" finds V3 row; address lookup would find V2 row
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockImplementation(async (name: string) => {
        if (name.toLowerCase() === 'uniswap v3') return [v3Row];
        if (name.toLowerCase() === 'uniswap') return [v2Row];
        return [];
      });
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>)
      .mockResolvedValue([v2Row]);

    // Claim counts: V3 has 10, V2 has 15 (V2 would win under old sort-by-claims)
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockImplementation(async (wpId: string) => {
        if (wpId === 'wp-uni-v3') return Array(10).fill({ claimText: 'v3' });
        if (wpId === 'wp-uni-v2') return Array(15).fill({ claimText: 'v2' });
        return [];
      });

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    }) as { projectName: string };

    // Should return V3 row's projectName, NOT V2's
    expect(result.projectName).toBe('Uniswap v3');
    // findByTokenAddress should NOT have been called (name-path won)
    expect(deps.whitepaperRepo.findByTokenAddress).not.toHaveBeenCalled();
  });

  it('name-path miss falls through to address-path', async () => {
    // DB: no row for "UnknownProject"; address matches V2 row
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>)
      .mockResolvedValue([v2Row]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockResolvedValue(Array(15).fill({ claimText: 'c' }));

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'UnknownProject',
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    }) as { projectName: string };

    expect(result.projectName).toBe('Uniswap');
    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalled();
  });

  it('name-path hit with 0 claims — address-path runs as fallback', async () => {
    // DB: name matches V3 row with 0 claims (stale seed); address matches V2 row with claims
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockResolvedValue([v3Row]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>)
      .mockResolvedValue([v2Row]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockImplementation(async (wpId: string) => {
        if (wpId === 'wp-uni-v3') return []; // 0 claims
        if (wpId === 'wp-uni-v2') return Array(15).fill({ claimText: 'c' });
        return [];
      });

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap v3',
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    }) as { projectName: string };

    // Should fall through to V2 since V3 has no usable claims
    expect(result.projectName).toBe('Uniswap');
    expect(deps.whitepaperRepo.findByTokenAddress).toHaveBeenCalled();
  });

  it('version-strip fallback still works when exact name miss', async () => {
    // DB: no "Uniswap V3" exact match, but "Uniswap" match has V3 in URL
    const strippedV3Row = {
      id: 'wp-uni-v3-stripped',
      projectName: 'Uniswap',
      tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      documentUrl: 'https://uniswap.org/whitepaper-v3.pdf', // V3 in URL
    };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockImplementation(async (name: string) => {
        if (name === 'Uniswap V3') return []; // exact miss
        if (name === 'Uniswap') return [strippedV3Row]; // strip fallback hits
        return [];
      });
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockResolvedValue(Array(10).fill({ claimText: 'c' }));

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
    }) as { projectName: string };

    expect(result.projectName).toBe('Uniswap');
    // Confirms version-strip filter matched (V3 in URL)
  });

  it('version mismatch on strip fallback — cache skipped (returns INSUFFICIENT_DATA for no discovery)', async () => {
    // DB: no "Uniswap V3" exact, "Uniswap" strip fallback has ONLY V2 (no V3 marker)
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockImplementation(async (name: string) => {
        if (name === 'Uniswap V3') return []; // exact miss
        if (name === 'Uniswap') return [v2Row]; // strip fallback — but V2 URL, no V3 marker
        return [];
      });
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]); // no address match either
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockResolvedValue(Array(15).fill({ claimText: 'c' }));

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
    }) as { verdict: string };

    // Version mismatch filter strips V2 from byName, no address, no discovery → INSUFFICIENT_DATA
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
  });
});
