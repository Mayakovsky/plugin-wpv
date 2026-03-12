import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaimEvaluator } from '../src/verification/ClaimEvaluator';
import { ScoreAggregator } from '../src/verification/ScoreAggregator';
import { CostTracker } from '../src/verification/CostTracker';
import type { AnthropicClient } from '../src/verification/ClaimExtractor';
import { LLM_PRICING } from '../src/constants';
import { ClaimCategory, type ExtractedClaim, Verdict } from '../src/types';

function makeClaim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    claimId: 'claim-1',
    category: ClaimCategory.TOKENOMICS,
    claimText: 'Staking APY of 12% is sustainable',
    statedEvidence: 'See Section 4',
    mathematicalProofPresent: false,
    sourceSection: 'Tokenomics',
    ...overrides,
  };
}

function createMockClient(): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            input: {
              results: [{ claimId: 'claim-1', consistent: true }],
            },
          },
        ],
        usage: { input_tokens: 500, output_tokens: 100 },
      }),
    },
  };
}

function createMathClient(validity: string): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'tool_use', input: { validity } },
        ],
        usage: { input_tokens: 300, output_tokens: 80 },
      }),
    },
  };
}

// ── ClaimEvaluator Tests ─────────────────────

describe('ClaimEvaluator', () => {
  let client: AnthropicClient;
  let costTracker: CostTracker;
  let evaluator: ClaimEvaluator;

  beforeEach(() => {
    client = createMockClient();
    costTracker = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
    evaluator = new ClaimEvaluator({ client, costTracker });
  });

  it('evaluateClaim returns evaluation with claimId', async () => {
    const claim = makeClaim();
    const result = await evaluator.evaluateClaim(claim, 'Some text');
    expect(result.claimId).toBe('claim-1');
  });

  it('evaluateClaim with math proof calls LLM for math sanity', async () => {
    const mathClient = createMathClient('VALID');
    evaluator = new ClaimEvaluator({ client: mathClient, costTracker });

    const claim = makeClaim({ mathematicalProofPresent: true });
    const result = await evaluator.evaluateClaim(claim, 'Full text with proofs');
    expect(result.mathValidity).toBe('VALID');
  });

  it('evaluateClaim detects implausible TPS claims', async () => {
    const claim = makeClaim({
      category: ClaimCategory.PERFORMANCE,
      claimText: 'Our network achieves 5,000,000 TPS',
    });
    const result = await evaluator.evaluateClaim(claim, '');
    expect(result.plausibility).toBe('OUTLIER');
  });

  it('evaluateClaim detects implausible APY claims', async () => {
    const claim = makeClaim({
      claimText: 'Guaranteed APY of 5000%',
    });
    const result = await evaluator.evaluateClaim(claim, '');
    expect(result.plausibility).toBe('OUTLIER');
  });

  it('evaluateConsistency returns CONSISTENT for single claim', async () => {
    const claims = [makeClaim()];
    const result = await evaluator.evaluateConsistency(claims);
    expect(result.get('claim-1')).toBe('CONSISTENT');
  });

  it('evaluateConsistency detects contradictions via LLM', async () => {
    const contradictionClient: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'tool_use',
            input: {
              results: [
                { claimId: 'claim-1', consistent: true },
                { claimId: 'claim-2', consistent: false },
              ],
            },
          }],
          usage: { input_tokens: 400, output_tokens: 100 },
        }),
      },
    };
    evaluator = new ClaimEvaluator({ client: contradictionClient, costTracker });

    const claims = [
      makeClaim({ claimId: 'claim-1', claimText: 'TPS is 10,000' }),
      makeClaim({ claimId: 'claim-2', claimText: 'TPS is 100' }),
    ];
    const result = await evaluator.evaluateConsistency(claims);
    expect(result.get('claim-1')).toBe('CONSISTENT');
    expect(result.get('claim-2')).toBe('CONTRADICTED');
  });

  it('evaluateAll runs consistency AFTER individual evaluations', async () => {
    const callOrder: string[] = [];
    const orderedClient: AnthropicClient = {
      messages: {
        create: vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
          const system = params.system as string;
          if (system?.includes('mathematical proof')) {
            callOrder.push('math');
          } else if (system?.includes('contradictions')) {
            callOrder.push('consistency');
          }
          return {
            content: [{ type: 'tool_use', input: { validity: 'VALID', results: [{ claimId: 'claim-1', consistent: true }] } }],
            usage: { input_tokens: 100, output_tokens: 50 },
          };
        }),
      },
    };
    evaluator = new ClaimEvaluator({ client: orderedClient, costTracker });

    const claims = [makeClaim({ mathematicalProofPresent: true }), makeClaim({ claimId: 'claim-2', mathematicalProofPresent: true })];
    await evaluator.evaluateAll(claims, 'text');

    // Consistency should come after individual evals
    const lastConsistency = callOrder.lastIndexOf('consistency');
    const lastMath = callOrder.lastIndexOf('math');
    expect(lastConsistency).toBeGreaterThan(lastMath);
  });

  it('CostTracker records usage from all LLM calls', async () => {
    const mathClient = createMathClient('VALID');
    evaluator = new ClaimEvaluator({ client: mathClient, costTracker });

    const claims = [
      makeClaim({ claimId: 'c1', mathematicalProofPresent: true }),
      makeClaim({ claimId: 'c2', mathematicalProofPresent: true }),
    ];
    await evaluator.evaluateAll(claims, 'text');

    const tokens = costTracker.getTotalTokens();
    expect(tokens.input).toBeGreaterThan(0);
    expect(tokens.output).toBeGreaterThan(0);
  });

  it('mock S2 citation verification', async () => {
    const mockS2 = {
      lookupPaper: vi.fn().mockResolvedValue({ title: 'Test Paper', citationCount: 42 }),
    };
    evaluator = new ClaimEvaluator({ client, costTracker, semanticScholar: mockS2 });

    const claim = makeClaim({
      statedEvidence: 'As shown in 10.1234/paper.2020',
    });
    const result = await evaluator.evaluateClaim(claim, '');
    expect(result.citationSupportsClaim).toBe(true);
    expect(mockS2.lookupPaper).toHaveBeenCalled();
  });
});

// ── ScoreAggregator Tests ────────────────────

describe('ScoreAggregator', () => {
  let aggregator: ScoreAggregator;

  beforeEach(() => {
    aggregator = new ScoreAggregator();
  });

  it('aggregation with default weights', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 80 },
      { category: ClaimCategory.PERFORMANCE, score: 60 },
      { category: ClaimCategory.CONSENSUS, score: 70 },
    ];
    const result = aggregator.aggregate(scores);
    expect(result.confidenceScore).toBe(70); // avg(80,60,70)
    expect(result.verdict).toBe(Verdict.PASS);
  });

  it('custom weights via constructor', () => {
    const custom = new ScoreAggregator({
      mathValidity: 0.50,
      benchmarks: 0.10,
      citations: 0.10,
      originality: 0.20,
      consistency: 0.10,
    });
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 50 },
      { category: ClaimCategory.PERFORMANCE, score: 50 },
      { category: ClaimCategory.SCIENTIFIC, score: 50 },
    ];
    const result = custom.aggregate(scores);
    expect(result.confidenceScore).toBe(50);
  });

  it('verdict: 71 → PASS', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 71 },
      { category: ClaimCategory.PERFORMANCE, score: 71 },
      { category: ClaimCategory.CONSENSUS, score: 71 },
    ];
    expect(aggregator.aggregate(scores).verdict).toBe(Verdict.PASS);
  });

  it('verdict: 69 → CONDITIONAL', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 69 },
      { category: ClaimCategory.PERFORMANCE, score: 69 },
      { category: ClaimCategory.CONSENSUS, score: 69 },
    ];
    expect(aggregator.aggregate(scores).verdict).toBe(Verdict.CONDITIONAL);
  });

  it('verdict: 39 → FAIL', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 39 },
      { category: ClaimCategory.PERFORMANCE, score: 39 },
      { category: ClaimCategory.CONSENSUS, score: 39 },
    ];
    expect(aggregator.aggregate(scores).verdict).toBe(Verdict.FAIL);
  });

  it('< 3 claims → INSUFFICIENT_DATA regardless of scores', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 95 },
      { category: ClaimCategory.PERFORMANCE, score: 95 },
    ];
    expect(aggregator.aggregate(scores).verdict).toBe(Verdict.INSUFFICIENT_DATA);
  });

  it('focus area scores computed per category', () => {
    const scores = [
      { category: ClaimCategory.TOKENOMICS, score: 80 },
      { category: ClaimCategory.TOKENOMICS, score: 60 },
      { category: ClaimCategory.PERFORMANCE, score: 50 },
    ];
    const result = aggregator.aggregate(scores);
    expect(result.focusAreaScores.TOKENOMICS).toBe(70); // avg(80,60)
    expect(result.focusAreaScores.PERFORMANCE).toBe(50);
    expect(result.focusAreaScores.CONSENSUS).toBe(0); // no claims
  });

  it('empty claims → INSUFFICIENT_DATA', () => {
    const result = aggregator.aggregate([]);
    expect(result.verdict).toBe(Verdict.INSUFFICIENT_DATA);
    expect(result.confidenceScore).toBe(0);
  });
});
