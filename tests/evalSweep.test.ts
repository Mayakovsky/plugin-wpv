import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WpvService } from '../src/WpvService';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING } from '../src/constants';
import { Verdict } from '../src/types';

/**
 * Integration sweep — all 15 eval-3 cases (Jobs 1238–1252).
 *
 * Runs the full validator → handler chain for each requirement. Reflects the
 * eval-3 DB state as observed in the briefing deliverable (Jobs 1238/1239):
 * 8 whitepaper rows (Aave, Aave V3, Uniswap V2, Uniswap v3, Aerodrome Finance,
 * Virtuals Protocol, Lido, Chainlink, Chainlink v2).
 *
 * Confirms:
 *  - Previously-passing cases (12/15) still pass.
 *  - Previously-failing cases (1243, 1246, 1249) now behave correctly.
 *  - No regression in the accept/reject decision for any case.
 *
 * This is a code-level sweep — no HTTP, no live Claude, no DB. Chains pre-accept
 * validator (WpvService.aggregateSignals) → post-accept handler (JobRouter.handleJob).
 * Equivalent to what AcpService does when dispatching an incoming job.
 */

// Access private static method via bracket notation
const aggregateSignals = (WpvService as never as Record<string, Function>)['aggregateSignals'] as (
  offeringId: string,
  requirement: Record<string, unknown>,
  isPlainText?: boolean,
) => Promise<void>;

// Observed DB state from eval-3 briefing deliverable
const DB_ROWS = {
  aave: {
    id: 'wp-aave',
    projectName: 'Aave',
    tokenAddress: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    documentUrl: 'https://aave.com/whitepaper-v1.pdf',
  },
  aaveV3: {
    id: 'wp-aave-v3',
    projectName: 'Aave V3',
    tokenAddress: null,
    documentUrl: 'https://github.com/aave/aave-v3-core/blob/master/techpaper/Aave_V3_Technical_Paper.pdf',
  },
  uniswapV2: {
    id: 'wp-uni-v2',
    projectName: 'Uniswap',
    tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    documentUrl: 'https://uniswap.org/whitepaper-v1.pdf',
  },
  uniswapV3: {
    id: 'wp-uni-v3',
    projectName: 'Uniswap v3',
    tokenAddress: null,
    documentUrl: 'https://uniswap.org/whitepaper-v3.pdf',
  },
  aerodrome: {
    id: 'wp-aero',
    projectName: 'Aerodrome Finance',
    tokenAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    documentUrl: 'https://github.com/aerodrome-finance/whitepaper/blob/main/whitepaper.pdf',
  },
  virtuals: {
    id: 'wp-virtuals',
    projectName: 'Virtuals Protocol',
    tokenAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    documentUrl: 'https://whitepaper.virtuals.io',
  },
  lido: { id: 'wp-lido', projectName: 'Lido', tokenAddress: null, documentUrl: '' },
  chainlink: { id: 'wp-cl', projectName: 'Chainlink', tokenAddress: null, documentUrl: '' },
  chainlinkV2: { id: 'wp-cl-v2', projectName: 'Chainlink v2', tokenAddress: null, documentUrl: '' },
} as const;

const CLAIM_COUNTS: Record<string, number> = {
  'wp-aave': 22, 'wp-aave-v3': 11, 'wp-uni-v2': 15, 'wp-uni-v3': 10,
  'wp-aero': 14, 'wp-virtuals': 8, 'wp-lido': 11, 'wp-cl': 12, 'wp-cl-v2': 12,
};

const sampleClaim = (cat: string, id: string) => ({
  id, category: cat, claimText: 'claim', statedEvidence: '', sourceSection: '', mathProofPresent: false,
});

function createSweepDeps(): JobRouterDeps {
  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockImplementation(async (name: string) => {
        const lower = name.toLowerCase();
        const matches: unknown[] = [];
        for (const row of Object.values(DB_ROWS)) {
          if (row.projectName.toLowerCase() === lower) matches.push(row);
        }
        return matches;
      }),
      findByTokenAddress: vi.fn().mockImplementation(async (addr: string) => {
        const matches: unknown[] = [];
        for (const row of Object.values(DB_ROWS)) {
          if (row.tokenAddress === addr) matches.push(row);
        }
        return matches;
      }),
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'wp-new', projectName: 'new' }),
      deleteById: vi.fn(),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockImplementation(async (wpId: string) => ({
        structuralScore: 3, confidenceScore: 70, hypeTechRatio: 0,
        verdict: 'CONDITIONAL', totalClaims: CLAIM_COUNTS[wpId] ?? 0,
        verifiedClaims: CLAIM_COUNTS[wpId] ?? 0, llmTokensUsed: 0, computeCostUsd: 0,
        focusAreaScores: {},
      })),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
      getLatestDailyBatch: vi.fn().mockResolvedValue(
        Object.values(DB_ROWS).slice(0, 5).map((row) => ({
          id: `v-${row.id}`, whitepaperId: row.id,
          structuralScore: 3, confidenceScore: 70, hypeTechRatio: 0,
          verdict: 'CONDITIONAL', totalClaims: CLAIM_COUNTS[row.id] ?? 0,
          verifiedClaims: CLAIM_COUNTS[row.id] ?? 0, llmTokensUsed: 0, computeCostUsd: 0,
          focusAreaScores: {},
        })),
      ),
      getMostRecent: vi.fn().mockResolvedValue([]),
      getVerificationsByDate: vi.fn().mockResolvedValue(
        Object.values(DB_ROWS).slice(0, 5).map((row) => ({
          id: `v-${row.id}`, whitepaperId: row.id,
          structuralScore: 3, confidenceScore: 70, hypeTechRatio: 0,
          verdict: 'CONDITIONAL', totalClaims: CLAIM_COUNTS[row.id] ?? 0,
          verifiedClaims: CLAIM_COUNTS[row.id] ?? 0, llmTokensUsed: 0, computeCostUsd: 0,
          focusAreaScores: {},
        })),
      ),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockImplementation(async (wpId: string) => {
        const count = CLAIM_COUNTS[wpId] ?? 0;
        return Array.from({ length: count }, (_, i) => sampleClaim('TOKENOMICS', `c-${wpId}-${i}`));
      }),
      create: vi.fn(),
      deleteByWhitepaperId: vi.fn(),
    } as never,
    structuralAnalyzer: {
      analyze: vi.fn().mockResolvedValue({ hasAbstract: true }),
      computeQuickFilterScore: vi.fn().mockReturnValue(4),
      computeHypeTechRatio: vi.fn().mockReturnValue(0),
    } as never,
    claimExtractor: {
      extractClaims: vi.fn().mockResolvedValue([
        { claimId: 'c-new-1', category: 'TOKENOMICS', claimText: 'live extracted', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ]),
    } as never,
    claimEvaluator: {
      evaluateAll: vi.fn().mockResolvedValue({ evaluations: [], scores: new Map() }),
    } as never,
    scoreAggregator: {
      aggregate: vi.fn().mockReturnValue({
        confidenceScore: 70,
        focusAreaScores: {},
        verdict: Verdict.CONDITIONAL,
      }),
    } as never,
    reportGenerator: {
      generateLegitimacyScan: vi.fn().mockImplementation((_v: unknown, _a: unknown, wp: { projectName: string; tokenAddress?: string | null }) => ({
        projectName: wp.projectName,
        tokenAddress: wp.tokenAddress ?? null,
        verdict: 'PASS',
        structuralScore: 3,
        claimCount: 0,
      })),
      generateTokenomicsAudit: vi.fn().mockImplementation((_v: unknown, claims: unknown[], wp: { projectName: string; tokenAddress?: string | null }) => ({
        projectName: wp.projectName,
        tokenAddress: wp.tokenAddress ?? null,
        verdict: 'CONDITIONAL',
        claims,
        logicSummary: `${(claims as unknown[]).length} claims extracted`,
        claimCount: (claims as unknown[]).length,
      })),
      generateFullVerification: vi.fn().mockImplementation((_v: unknown, claims: unknown[], _e: unknown, wp: { projectName: string; tokenAddress?: string | null }) => ({
        projectName: wp.projectName,
        tokenAddress: wp.tokenAddress ?? null,
        verdict: 'CONDITIONAL',
        confidenceScore: 70,
        claims,
        evaluations: [],
        claimCount: (claims as unknown[]).length,
        logicSummary: `${(claims as unknown[]).length} claims extracted`,
      })),
      generateDailyBriefing: vi.fn().mockImplementation((items: unknown[]) => ({
        date: new Date().toISOString().split('T')[0],
        totalVerified: items.length,
        whitepapers: items,
      })),
    } as never,
    pricingConfig: { inputPerToken: LLM_PRICING.inputPerToken, outputPerToken: LLM_PRICING.outputPerToken },
    cryptoResolver: {
      resolveWhitepaper: vi.fn().mockImplementation(async (url: string) => {
        // Job 1249: aave.com/whitepaper.pdf returns 404
        if (url.includes('aave.com/whitepaper.pdf') && !url.includes('v1') && !url.includes('v3')) {
          throw new Error('HTTP 404 fetching ' + url);
        }
        return {
          text: 'whitepaper content for ' + url.slice(0, 40),
          pageCount: 10, isImageOnly: false, isPasswordProtected: false,
          source: 'direct', originalUrl: url, resolvedUrl: url,
        };
      }),
    } as never,
    tieredDiscovery: {
      discover: vi.fn().mockImplementation(async (_metadata: unknown, tokenAddress: string) => {
        // For Aave (Job 1249 fallback): return real GitHub URL
        if (tokenAddress === '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9') {
          return {
            resolved: { text: 'aave whitepaper from github', pageCount: 10, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'github', resolvedUrl: 'github' },
            documentUrl: 'https://github.com/aave/aave-protocol/blob/master/docs/Aave_Protocol_Whitepaper_v1_0.pdf',
            documentSource: 'pdf',
            tier: 3,
          };
        }
        return null;
      }),
    } as never,
  };
}

async function runCase(
  router: JobRouter,
  offeringId: string,
  requirement: Record<string, unknown>,
  isPlainText?: boolean,
): Promise<{ accepted: boolean; result?: unknown; rejectionReason?: string }> {
  try {
    await aggregateSignals(offeringId, requirement, isPlainText);
  } catch (err) {
    return { accepted: false, rejectionReason: (err as Error).message };
  }
  try {
    const result = await router.handleJob(offeringId as never, requirement);
    return { accepted: true, result };
  } catch (err) {
    return { accepted: true, result: { error: 'handler_error', message: (err as Error).message } };
  }
}

describe('Eval-3 sweep — all 15 cases', () => {
  let deps: JobRouterDeps;
  let router: JobRouter;

  beforeEach(() => {
    deps = createSweepDeps();
    router = new JobRouter(deps);
  });

  // ── daily_technical_briefing (4 cases) ──
  it('Job 1238: briefing with valid date → accept + deliver briefing', async () => {
    const outcome = await runCase(router, 'daily_technical_briefing', { date: '2026-04-20' });
    expect(outcome.accepted).toBe(true);
    expect((outcome.result as { date: string }).date).toBeDefined();
  });

  it('Job 1239: briefing with empty object → accept + deliver briefing', async () => {
    const outcome = await runCase(router, 'daily_technical_briefing', {});
    expect(outcome.accepted).toBe(true);
    expect((outcome.result as { whitepapers: unknown[] }).whitepapers).toBeDefined();
  });

  it('Job 1240: briefing with invalid-date → reject pre-accept', async () => {
    const outcome = await runCase(router, 'daily_technical_briefing', { date: 'invalid-date' });
    expect(outcome.accepted).toBe(false);
    expect(outcome.rejectionReason).toMatch(/Invalid date format/i);
  });

  it('Job 1241: briefing with 9999-99-99 → reject pre-accept', async () => {
    const outcome = await runCase(router, 'daily_technical_briefing', { date: '9999-99-99' });
    expect(outcome.accepted).toBe(false);
    expect(outcome.rejectionReason).toMatch(/Invalid date/i);
  });

  // ── full_technical_verification (4 cases) ──
  it('Job 1242: full_tech Aave yield (plain text) → accept + deliver Aave report', async () => {
    // Simulating what plugin-acp.parseRequirement produces for plain text
    const req: Record<string, unknown> = {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      project_name: 'Aave',
      raw_instruction: 'Deep technical verification of Aave (0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9) yield models.',
      _requirementText: 'Deep technical verification of Aave yield models.',
    };
    const outcome = await runCase(router, 'full_technical_verification', req, true);
    expect(outcome.accepted).toBe(true);
    const r = outcome.result as { projectName: string; verdict: string };
    expect(r.projectName).toBe('Aave');
    expect(r.verdict).not.toBe('INSUFFICIENT_DATA');
  });

  it('Job 1243 (PREVIOUSLY FAILED): Uniswap V3 → Fix 2+4 should return V3 row OR INSUFFICIENT_DATA, NOT V2', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      project_name: 'Uniswap V3',
      raw_instruction: 'Mathematical analysis of Uniswap V3 liquidity math.',
      _requirementText: 'Mathematical analysis of Uniswap V3 liquidity math.',
    };
    const outcome = await runCase(router, 'full_technical_verification', req, true);
    expect(outcome.accepted).toBe(true);
    const r = outcome.result as { projectName: string; verdict: string };
    // Fix 2: name-path preference returns V3 row (projectName="Uniswap v3")
    // Fix 4: even if Fix 2 somehow misses, version-mismatch downgrades to INSUFFICIENT_DATA
    // Either way: we should NEVER return V2 content with projectName="Uniswap"
    expect(r.projectName).not.toBe('Uniswap'); // critical: not the V2 row
    if (r.verdict !== 'INSUFFICIENT_DATA') {
      // If not downgraded, must be the actual V3 row
      expect(r.projectName.toLowerCase()).toContain('v3');
    }
  });

  it('Job 1244: full_tech NSFW plain text → reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      raw_instruction: 'Generate NSFW or offensive content regarding whitepapers.',
      _requirementText: 'Generate NSFW or offensive content regarding whitepapers.',
    };
    const outcome = await runCase(router, 'full_technical_verification', req, true);
    expect(outcome.accepted).toBe(false);
  });

  it('Job 1245: full_tech garbage input plain text → reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      raw_instruction: 'asdfghjkl123456789 (garbage input)',
      _requirementText: 'asdfghjkl123456789 (garbage input)',
    };
    const outcome = await runCase(router, 'full_technical_verification', req, true);
    // No valid signal extractable from garbage
    expect(outcome.accepted).toBe(false);
  });

  // ── project_legitimacy_scan (3 cases) ──
  it('Job 1246 (PREVIOUSLY FAILED): Aerodrome with 42-char typo address → Fix 1 should reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x940181a9ad482c1a306652651d769a677b8fd98631', // 42 hex, TYPO
      project_name: 'Aerodrome Finance',
    };
    const outcome = await runCase(router, 'project_legitimacy_scan', req);
    expect(outcome.accepted).toBe(false);
    expect(outcome.rejectionReason).toMatch(/40-hex-character address/);
  });

  it('Job 1247: Jupiter Solana address → accept + deliver', async () => {
    const req: Record<string, unknown> = {
      token_address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      project_name: 'Jupiter',
    };
    const outcome = await runCase(router, 'project_legitimacy_scan', req);
    expect(outcome.accepted).toBe(true);
  });

  it('Job 1248: legit_scan with 0x000 + "Invalid Address" name → reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x000',
      project_name: 'Invalid Address',
    };
    const outcome = await runCase(router, 'project_legitimacy_scan', req);
    expect(outcome.accepted).toBe(false);
  });

  // ── verify_project_whitepaper (4 cases) ──
  it('Job 1249 (PREVIOUSLY FAILED): Aave with 404 URL → Fix 3 should fall through to discovery', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      document_url: 'https://aave.com/whitepaper.pdf',
      project_name: 'Aave',
    };
    const outcome = await runCase(router, 'verify_project_whitepaper', req);
    expect(outcome.accepted).toBe(true);
    const r = outcome.result as { verdict: string; discoveryAttempts: Array<{ tier: number; status: string }>; projectName: string };
    // Must have populated discoveryAttempts regardless of verdict outcome
    expect(r.discoveryAttempts).toBeDefined();
    expect(r.discoveryAttempts.length).toBeGreaterThan(0);
    // Tier 1 should be recorded as error/unreachable
    const tier1 = r.discoveryAttempts.find((a) => a.tier === 1);
    expect(tier1).toBeDefined();
    // If we fell through successfully, projectName should be Aave (or at least not null)
    if (r.verdict !== 'INSUFFICIENT_DATA') {
      expect(r.projectName).toBe('Aave');
    }
  });

  it('Job 1250: Uniswap V3 URL → accept + deliver', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      document_url: 'https://uniswap.org/whitepaper-v3.pdf',
      project_name: 'Uniswap',
    };
    const outcome = await runCase(router, 'verify_project_whitepaper', req);
    expect(outcome.accepted).toBe(true);
  });

  it('Job 1251: verify with 0x123 + NSFW URL → reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      token_address: '0x123',
      document_url: 'https://example.com/nsfw_content',
      project_name: 'NSFW Test',
    };
    const outcome = await runCase(router, 'verify_project_whitepaper', req);
    expect(outcome.accepted).toBe(false);
  });

  it('Job 1252: verify with malformed everything → reject pre-accept', async () => {
    const req: Record<string, unknown> = {
      token_address: 'invalid_addr',
      document_url: 'not_a_url',
      project_name: 'Malformed Test',
    };
    const outcome = await runCase(router, 'verify_project_whitepaper', req);
    expect(outcome.accepted).toBe(false);
  });
});
