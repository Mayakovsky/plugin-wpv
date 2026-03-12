/**
 * WPV Integration Test — End-to-end verification pipeline
 * Exercises: CryptoContentResolver → StructuralAnalyzer → ClaimExtractor →
 *            ScoreAggregator → ReportGenerator → JobRouter
 * All external APIs (Anthropic, RPC, ACP) are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import { CostTracker } from '../src/verification/CostTracker';
import { StructuralAnalyzer } from '../src/verification/StructuralAnalyzer';
import { ScoreAggregator } from '../src/verification/ScoreAggregator';
import { ReportGenerator } from '../src/verification/ReportGenerator';
import { JobRouter, type JobRouterDeps } from '../src/acp/JobRouter';
import { LLM_PRICING, VERDICT_THRESHOLDS } from '../src/constants';
import { Verdict, ClaimCategory, type ExtractedClaim, type ClaimEvaluation, type TokenomicsAuditReport } from '../src/types';

// ── Shared fixtures ──────────────────────────────────────

// Sample text with TECH_KEYWORDS (algorithm, protocol, consensus, proof, theorem, finality, byzantine, throughput, validator, function, contract)
const SAMPLE_WHITEPAPER_TEXT = `
Abstract
This paper presents a novel proof-of-stake consensus mechanism with 5000 TPS throughput.

1. Introduction
We propose a Byzantine Fault Tolerant consensus protocol for decentralized finance applications.
Our algorithm achieves validator finality in under 2 seconds.

2. Tokenomics
The native token has a fixed supply of 100M with 12% annual staking yield.
Token distribution: 40% community, 20% team (4-year vest), 15% foundation, 25% ecosystem.
The smart contract mapping handles staking rewards via a modifier function.

3. Technical Architecture
Our consensus achieves finality in 2 seconds using a modified PBFT algorithm.
Mathematical proof: Given n validators where n >= 3f+1, the protocol tolerates f Byzantine faults.
Theorem 1: The expected throughput T = n * b / (2d + l) where b = block size, d = network delay, l = latency.

4. Benchmarks
Compared to Ethereum (15 TPS) and Solana (65K TPS), our protocol achieves 5000 TPS with 2s finality.

5. References
[1] Castro, M. and Liskov, B. (1999). Practical Byzantine Fault Tolerance.
[2] Buterin, V. (2014). Ethereum: A Next-Generation Smart Contract Platform.
[3] Yakovenko, A. (2018). Solana: A new architecture for a high performance blockchain.
`;

function makeMockClaims(): ExtractedClaim[] {
  return [
    { claimId: 'c-1', category: ClaimCategory.PERFORMANCE, claimText: '5000 TPS throughput', statedEvidence: 'Section 4 benchmarks', mathematicalProofPresent: false, sourceSection: 'Abstract' },
    { claimId: 'c-2', category: ClaimCategory.TOKENOMICS, claimText: '12% annual staking yield', statedEvidence: 'Section 2', mathematicalProofPresent: false, sourceSection: 'Tokenomics' },
    { claimId: 'c-3', category: ClaimCategory.CONSENSUS, claimText: 'BFT with n >= 3f+1', statedEvidence: 'Theorem 1', mathematicalProofPresent: true, sourceSection: 'Technical Architecture' },
    { claimId: 'c-4', category: ClaimCategory.PERFORMANCE, claimText: '2 second finality', statedEvidence: 'Section 3', mathematicalProofPresent: false, sourceSection: 'Technical Architecture' },
  ];
}

function createIntegrationDeps(): JobRouterDeps {
  const claims = makeMockClaims();

  return {
    whitepaperRepo: {
      findByProjectName: vi.fn().mockResolvedValue([]),
      findByTokenAddress: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'wp-int-1', ...data }),
      ),
    } as never,
    verificationsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(null),
      getLatestDailyBatch: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'v-int-1' }),
    } as never,
    claimsRepo: {
      findByWhitepaperId: vi.fn().mockResolvedValue(claims),
      create: vi.fn().mockResolvedValue({ id: 'c-new' }),
    } as never,
    structuralAnalyzer: new StructuralAnalyzer(),
    claimExtractor: {
      extractClaims: vi.fn().mockResolvedValue(claims),
    } as never,
    claimEvaluator: {
      evaluateAll: vi.fn().mockResolvedValue({
        evaluations: [],
        scores: new Map([['c-1', 75], ['c-2', 80], ['c-3', 90], ['c-4', 70]]),
      }),
    } as never,
    scoreAggregator: new ScoreAggregator(),
    reportGenerator: new ReportGenerator(),
    costTracker: new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken),
    cryptoResolver: {
      resolveWhitepaper: vi.fn().mockResolvedValue({
        text: SAMPLE_WHITEPAPER_TEXT,
        pageCount: 12,
        isImageOnly: false,
        isPasswordProtected: false,
        source: 'direct',
        originalUrl: 'https://example.com/wp.pdf',
        resolvedUrl: 'https://example.com/wp.pdf',
      }),
    } as never,
  };
}

// ── Tests ────────────────────────────────────────────────

describe('WPV Integration — end-to-end pipeline', () => {
  // Note: handleVerifyWhitepaper returns TokenomicsAuditReport (not FullVerificationReport)
  // because the live pipeline does L1+L2 then aggregates, but does not run claimEvaluator.

  it('verify_project_whitepaper produces valid TokenomicsAuditReport', async () => {
    const deps = createIntegrationDeps();
    const router = new JobRouter(deps);

    const result = await router.handleJob('verify_project_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'IntegrationTest',
    }) as TokenomicsAuditReport;

    expect(result.projectName).toBe('IntegrationTest');
    expect(result.verdict).toBeDefined();
    expect(result.claims).toBeDefined();
    expect(result.claims.length).toBe(4);
    expect(result.claimScores).toBeDefined();
    expect(result.logicSummary).toBeDefined();
    expect(result.generatedAt).toBeDefined();
    expect(result.structuralScore).toBeGreaterThanOrEqual(1);
    expect(result.structuralScore).toBeLessThanOrEqual(5);
  });

  it('pipeline calls resolve → structural → extract → aggregate in order', async () => {
    const deps = createIntegrationDeps();
    const router = new JobRouter(deps);
    const callOrder: string[] = [];

    // Replace real analyzer with tracked mock
    deps.structuralAnalyzer = {
      analyze: vi.fn().mockImplementation(async () => {
        callOrder.push('structural');
        return { hasAbstract: true, hasMethodology: true, hasTokenomics: true, hasReferences: true, citationCount: 3, verifiedCitationRatio: 0, hasMath: true, mathDensityScore: 0.4, coherenceScore: 0.8, similarityTopMatch: null, similarityScore: 0, hasAuthors: false, hasDates: false };
      }),
      computeQuickFilterScore: vi.fn().mockImplementation(() => 4),
      computeHypeTechRatio: vi.fn().mockImplementation(() => 1.2),
    } as never;
    deps.scoreAggregator = {
      aggregate: vi.fn().mockImplementation(() => {
        callOrder.push('aggregate');
        return { confidenceScore: 50, focusAreaScores: { TOKENOMICS: 50, PERFORMANCE: 50, CONSENSUS: 50, SCIENTIFIC: 0 }, verdict: Verdict.CONDITIONAL };
      }),
    } as never;

    (deps.cryptoResolver.resolveWhitepaper as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('resolve');
      return { text: SAMPLE_WHITEPAPER_TEXT, pageCount: 12, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'url', resolvedUrl: 'url' };
    });
    (deps.claimExtractor.extractClaims as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('extract');
      return makeMockClaims();
    });

    await router.handleJob('verify_project_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'OrderTest',
    });

    expect(callOrder).toEqual(['resolve', 'structural', 'extract', 'aggregate']);
  });

  it('COC/V stays under budget ($0.60) for single verification', async () => {
    const costTracker = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);

    // Simulate realistic token usage for a single verification:
    // ClaimExtractor: ~2000 input, ~500 output
    // ClaimEvaluator math check: ~1000 input, ~200 output
    // ClaimEvaluator consistency: ~1500 input, ~300 output
    costTracker.recordUsage(2000, 500);
    costTracker.recordUsage(1000, 200);
    costTracker.recordUsage(1500, 300);

    const totalCost = costTracker.getTotalCostUsd();
    expect(totalCost).toBeLessThan(0.60);

    const tokens = costTracker.getTotalTokens();
    expect(tokens.input).toBe(4500);
    expect(tokens.output).toBe(1000);
  });

  it('PASS verdict when confidence >= 70', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      { category: ClaimCategory.TOKENOMICS, score: 80 },
      { category: ClaimCategory.PERFORMANCE, score: 75 },
      { category: ClaimCategory.CONSENSUS, score: 70 },
    ]);
    expect(result.verdict).toBe(Verdict.PASS);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.PASS);
  });

  it('CONDITIONAL verdict when 40 <= confidence < 70', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      { category: ClaimCategory.TOKENOMICS, score: 50 },
      { category: ClaimCategory.PERFORMANCE, score: 45 },
      { category: ClaimCategory.CONSENSUS, score: 55 },
    ]);
    expect(result.verdict).toBe(Verdict.CONDITIONAL);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.CONDITIONAL);
    expect(result.confidenceScore).toBeLessThan(VERDICT_THRESHOLDS.PASS);
  });

  it('FAIL verdict when confidence < 40', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      { category: ClaimCategory.TOKENOMICS, score: 20 },
      { category: ClaimCategory.PERFORMANCE, score: 30 },
      { category: ClaimCategory.CONSENSUS, score: 25 },
    ]);
    expect(result.verdict).toBe(Verdict.FAIL);
    expect(result.confidenceScore).toBeLessThan(VERDICT_THRESHOLDS.CONDITIONAL);
  });

  it('INSUFFICIENT_DATA when < 3 claims', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      { category: ClaimCategory.TOKENOMICS, score: 90 },
      { category: ClaimCategory.PERFORMANCE, score: 85 },
    ]);
    expect(result.verdict).toBe(Verdict.INSUFFICIENT_DATA);
  });

  it('report contains superset fields (legitimacy → tokenomics)', async () => {
    const deps = createIntegrationDeps();
    const router = new JobRouter(deps);

    const report = await router.handleJob('verify_project_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'SupersetTest',
    }) as TokenomicsAuditReport;

    // LegitimacyScan fields
    expect(report).toHaveProperty('projectName');
    expect(report).toHaveProperty('structuralScore');
    expect(report).toHaveProperty('verdict');
    expect(report).toHaveProperty('hypeTechRatio');
    expect(report).toHaveProperty('claimCount');
    expect(report).toHaveProperty('generatedAt');

    // TokenomicsAudit fields (superset)
    expect(report).toHaveProperty('claims');
    expect(report).toHaveProperty('claimScores');
    expect(report).toHaveProperty('logicSummary');
  });

  it('DB records created for new whitepaper verification', async () => {
    const deps = createIntegrationDeps();
    const router = new JobRouter(deps);

    await router.handleJob('verify_project_whitepaper', {
      document_url: 'https://example.com/wp.pdf',
      project_name: 'DbTest',
    });

    expect(deps.whitepaperRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'DbTest', status: 'VERIFIED' }),
    );
    expect(deps.verificationsRepo.create).toHaveBeenCalled();
  });

  it('StructuralAnalyzer detects key sections in sample text', async () => {
    const analyzer = new StructuralAnalyzer();
    const analysis = await analyzer.analyze(SAMPLE_WHITEPAPER_TEXT, 12);

    expect(analysis.hasAbstract).toBe(true);
    expect(analysis.hasTokenomics).toBe(true);
    expect(analysis.hasReferences).toBe(true);
    expect(analysis.hasMath).toBe(true);
    expect(analysis.citationCount).toBeGreaterThanOrEqual(0);
  });

  it('StructuralAnalyzer hype-tech ratio is low for technical paper', () => {
    const analyzer = new StructuralAnalyzer();
    const ratio = analyzer.computeHypeTechRatio(SAMPLE_WHITEPAPER_TEXT);

    // Technical paper with many tech keywords and no hype keywords → ratio should be 0 or very low
    expect(ratio).toBeLessThanOrEqual(3.0);
    // Ratio is 0 because there are no HYPE_KEYWORDS in the sample
    expect(ratio).toBe(0);
  });
});
