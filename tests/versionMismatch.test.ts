import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Fix 4 (2026-04-23): verdict downgrade on version mismatch.
 *
 * Safety net for Fix 2. When the request specifies a version (e.g., "Uniswap V3")
 * and the delivered report's projectName doesn't contain that version token,
 * downgrade verdict to INSUFFICIENT_DATA rather than serve different-version
 * content. Applies at the _handleJobImpl dispatch boundary so it covers every
 * return path (cached, live, discovery-only, enriched).
 */

function createMockDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(null),
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
    structuralAnalyzer: { analyze: vi.fn(), computeQuickFilterScore: vi.fn().mockReturnValue(5), computeHypeTechRatio: vi.fn().mockReturnValue(0) } as never,
    claimExtractor: { extractClaims: vi.fn().mockResolvedValue([]) } as never,
    claimEvaluator: { evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }) } as never,
    scoreAggregator: { aggregate: vi.fn().mockReturnValue({ confidenceScore: 70, focusAreaScores: {}, verdict: Verdict.CONDITIONAL }) } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn(),
      generateTokenomicsAudit: vi.fn().mockImplementation((_v: unknown, _c: unknown, wp: { projectName: string }) => ({
        projectName: wp.projectName, verdict: 'CONDITIONAL', claims: [], logicSummary: 'V2 analysis',
      })),
      generateFullVerification: vi.fn().mockImplementation((_v: unknown, _c: unknown, _e: unknown, wp: { projectName: string }) => ({
        projectName: wp.projectName, verdict: 'CONDITIONAL', confidenceScore: 70, claims: [], evaluations: [], logicSummary: 'V2 analysis',
      })),
      generateDailyBriefing: vi.fn(),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: { resolveWhitepaper: vi.fn() } as never,
    tieredDiscovery: null,
  };
}

describe('Fix 4: verdict downgrade on version mismatch', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createMockDeps();
    router = new JobRouter(deps);
  });

  it('request "Uniswap V3" + cached "Uniswap" → downgrade to INSUFFICIENT_DATA', async () => {
    // Cache returns a row named "Uniswap" (V2) but request is for V3
    const v2Row = {
      id: 'wp-uni',
      projectName: 'Uniswap',
      tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      documentUrl: 'https://uniswap.org/whitepaper-v1.pdf',
    };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>)
      .mockImplementation(async (name: string) => {
        if (name === 'Uniswap V3') return [];
        if (name === 'Uniswap') return [v2Row];
        return [];
      });
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([v2Row]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'c-1', category: 'TOKENOMICS', claimText: 'V2 claim', statedEvidence: '', mathProofPresent: false, sourceSection: '' },
    ]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      structuralScore: 5, confidenceScore: 70, hypeTechRatio: 0,
      verdict: 'CONDITIONAL', totalClaims: 15, verifiedClaims: 15,
      llmTokensUsed: 1000, computeCostUsd: 0.1, focusAreaScores: {},
    });

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    }) as { verdict: string; projectName: string; logicSummary: string };

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.logicSummary).toContain('Version mismatch');
    expect(result.logicSummary).toContain('Uniswap V3');
  });

  it('request "Uniswap V3" + delivered "Uniswap v3" → verdict preserved', async () => {
    // Cache has the V3 row
    const v3Row = {
      id: 'wp-uni-v3',
      projectName: 'Uniswap v3',
      tokenAddress: null,
      documentUrl: 'https://uniswap.org/whitepaper-v3.pdf',
    };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([v3Row]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'c-1', category: 'TOKENOMICS', claimText: 'V3 claim', statedEvidence: '', mathProofPresent: false, sourceSection: '' },
    ]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      structuralScore: 5, confidenceScore: 70, hypeTechRatio: 0,
      verdict: 'CONDITIONAL', totalClaims: 10, verifiedClaims: 10,
      llmTokensUsed: 1000, computeCostUsd: 0.1, focusAreaScores: {},
    });

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
    }) as { verdict: string; projectName: string };

    expect(result.verdict).toBe('CONDITIONAL'); // preserved
    expect(result.projectName).toBe('Uniswap v3');
  });

  it('request without version suffix — no-op even if delivered differs', async () => {
    // Request "Uniswap" (no version) — should not trigger downgrade regardless
    const anyRow = {
      id: 'wp-any',
      projectName: 'Uniswap v2',
      tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      documentUrl: 'https://uniswap.org/whitepaper-v1.pdf',
    };
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([anyRow]);
    (deps.claimsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'c-1', category: 'TOKENOMICS', claimText: 'V2', statedEvidence: '', mathProofPresent: false, sourceSection: '' },
    ]);
    (deps.verificationsRepo.findByWhitepaperId as ReturnType<typeof vi.fn>).mockResolvedValue({
      structuralScore: 5, confidenceScore: 70, hypeTechRatio: 0,
      verdict: 'CONDITIONAL', totalClaims: 10, verifiedClaims: 10,
      llmTokensUsed: 1000, computeCostUsd: 0.1, focusAreaScores: {},
    });

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap', // no version
    }) as { verdict: string };

    expect(result.verdict).toBe('CONDITIONAL'); // unchanged
  });

  it('error envelope is not touched by the downgrade helper', async () => {
    // Force an invalid URL path that returns an error envelope (not a report)
    const result = await router.handleJob('verify_project_whitepaper', {
      project_name: 'Uniswap V3',
      document_url: 'file:///etc/passwd',
    }) as { error?: string; verdict?: string };

    // Error envelope should remain — no spurious verdict field added
    expect(result.error).toBe('invalid_url');
    expect(result.verdict).toBeUndefined();
  });

  it('already-INSUFFICIENT_DATA is not re-touched (idempotent)', async () => {
    // All lookups return empty → insufficientData envelope. Request has a version.
    (deps.whitepaperRepo.findByProjectName as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.whitepaperRepo.findByTokenAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await router.handleJob('full_technical_verification', {
      project_name: 'Uniswap V3',
    }) as { verdict: string; logicSummary: string };

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    // logicSummary should NOT contain the version-mismatch note since verdict was already INSUFFICIENT_DATA
    expect(result.logicSummary).not.toContain('Version mismatch');
  });
});
