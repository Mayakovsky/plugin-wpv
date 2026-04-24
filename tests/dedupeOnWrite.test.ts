import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Option B Fix B (2026-04-24): dedupe upsert by token_address with version awareness.
 *
 * Regression: `handleVerifyWhitepaper` and `handleFullVerification` drove their
 * "existing row" lookup off project_name only. When a buyer requested AAVE by
 * address alone, `resolveTokenName` returned the on-chain ERC-20 name "Aave
 * Token" → a new row was created parallel to the canonical "Aave" row.
 *
 * Fix: when tokenAddress is set, also look up rows by that address in the same
 * version-family. If an address match exists, fold it into the "existing"
 * candidate list. On replace, preserve the existing canonical name (first-seen
 * wins) so on-chain verbose labels don't overwrite short canonical forms.
 *
 * Version-family: "Aave" + "Aave V3" share an address but have different
 * versions → NOT merged.
 */

function createDedupeDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'wp-new', projectName: 'Aave', tokenAddress: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9' }),
      deleteById: vi.fn().mockResolvedValue(undefined),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'v-new' }),
      deleteByWhitepaperId: vi.fn().mockResolvedValue(undefined),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      getMostRecent: vi.fn().mockResolvedValue([]),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'c-new' }),
      deleteByWhitepaperId: vi.fn().mockResolvedValue(undefined),
    } as never,
    structuralAnalyzer: {
      analyze: vi.fn().mockResolvedValue({ hasAbstract: true }),
      computeQuickFilterScore: vi.fn().mockReturnValue(4),
      computeHypeTechRatio: vi.fn().mockReturnValue(0),
    } as never,
    claimExtractor: {
      extractClaims: vi.fn().mockResolvedValue([
        { claimId: 'c-1', category: 'TOKENOMICS', claimText: 'new', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ]),
    } as never,
    claimEvaluator: { evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }) } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 70, focusAreaScores: {}, verdict: Verdict.CONDITIONAL,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn(),
      generateTokenomicsAudit: vi.fn().mockImplementation((_v: unknown, c: unknown[], wp: { projectName: string }) => ({
        projectName: wp.projectName, verdict: 'CONDITIONAL', claims: c, claimCount: c.length,
      })),
      generateFullVerification: vi.fn(),
      generateDailyBriefing: vi.fn(),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: {
      resolveWhitepaper: vi.fn().mockResolvedValue({
        text: 'whitepaper content',
        pageCount: 10, isImageOnly: false, isPasswordProtected: false,
        source: 'direct', originalUrl: 'u', resolvedUrl: 'u',
      }),
    } as never,
    tieredDiscovery: null,
  };
}

describe('Option B Fix B — dedupe-on-address upsert in runL1L2', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  const aaveAddr = '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9';
  const aaveRow = {
    id: 'wp-aave', projectName: 'Aave',
    tokenAddress: aaveAddr,
    documentUrl: 'https://aave.com/whitepaper-v1.pdf',
  };
  const aaveV3Row = {
    id: 'wp-aave-v3', projectName: 'Aave V3',
    tokenAddress: null,
    documentUrl: 'https://github.com/aave/aave-v3-core',
  };

  beforeEach(() => {
    deps = createDedupeDeps();
    router = new JobRouter(deps);
  });

  it('request for "Aave Token" with AAVE address — reuses existing "Aave" row instead of creating parallel', async () => {
    // "Aave Token" has no existing row by name
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Address path returns the canonical "Aave" row
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([aaveRow]);
    // Existing Aave has 22 claims (richer than the 1 new claim we extract)
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockResolvedValue(Array.from({ length: 22 }, (_, i) => ({ id: `c-a-${i}`, category: 'TOKENOMICS' })));

    await router.handleJob('verify_project_whitepaper', {
      project_name: 'Aave Token',
      token_address: aaveAddr,
      document_url: 'https://aave.com/whitepaper-v1.pdf',
    });

    // Existing row should be reused — no create() call
    expect(deps.whitepaperRepo.create).not.toHaveBeenCalled();
  });

  it('request for "Aave Token" when new extraction is richer — preserves "Aave" canonical name on replace', async () => {
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([aaveRow]);
    // Existing Aave has only 0 claims (empty seed), so 1 new claim wins
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Need claim_count > 0 to trigger existingWithClaims path — return 1 claim
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 'c-existing', category: 'TOKENOMICS' }]);
    // And make the new extraction richer (say 5 claims vs existing 1)
    (deps.claimExtractor.extractClaims as ReturnType<typeof vi.fn>).mockResolvedValue([
      { claimId: 'c-1', category: 'TOKENOMICS', claimText: 'new1', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      { claimId: 'c-2', category: 'PERFORMANCE', claimText: 'new2', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      { claimId: 'c-3', category: 'CONSENSUS', claimText: 'new3', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      { claimId: 'c-4', category: 'SCIENTIFIC', claimText: 'new4', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      { claimId: 'c-5', category: 'TOKENOMICS', claimText: 'new5', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
    ]);

    await router.handleJob('verify_project_whitepaper', {
      project_name: 'Aave Token',
      token_address: aaveAddr,
      document_url: 'https://aave.com/whitepaper-v1.pdf',
    });

    // On replace, create() should preserve canonical name "Aave", not "Aave Token"
    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Aave', tokenAddress: aaveAddr }),
    );
    expect(deps.whitepaperRepo.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Aave Token' }),
    );
  });

  it('request for "Aave V3" + AAVE address — does NOT merge with "Aave" v1 row (version-family mismatch)', async () => {
    // byName returns the existing Aave V3 row (the proper target for V3 requests)
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockImplementation(async (name: string) => {
        if (name.toLowerCase() === 'aave v3') return [aaveV3Row];
        return [];
      });
    // byAddr returns the Aave v1 row (version=none, different from v3)
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([aaveRow]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockImplementation(async (wpId: string) => {
      if (wpId === 'wp-aave-v3') return Array.from({ length: 15 }, (_, i) => ({ id: `c-v3-${i}`, category: 'SCIENTIFIC' }));
      if (wpId === 'wp-aave') return Array.from({ length: 22 }, (_, i) => ({ id: `c-v1-${i}`, category: 'TOKENOMICS' }));
      return [];
    });

    await router.handleJob('verify_project_whitepaper', {
      project_name: 'Aave V3',
      token_address: aaveAddr,
      document_url: 'https://github.com/aave/aave-v3-core/whitepaper.pdf',
    });

    // The existing v3 row should be reused (15 claims >= 1 new). v1 row untouched.
    expect(deps.whitepaperRepo.create).not.toHaveBeenCalled();
    expect(deps.whitepaperRepo.deleteById).not.toHaveBeenCalledWith('wp-aave');
  });

  it('no existing row anywhere — create new row with requested name', async () => {
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await router.handleJob('verify_project_whitepaper', {
      project_name: 'BrandNew',
      token_address: '0x1234567890abcdef1234567890abcdef12345678',
      document_url: 'https://brandnew.io/wp.pdf',
    });

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'BrandNew' }),
    );
  });
});
