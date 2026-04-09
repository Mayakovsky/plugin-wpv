import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaimExtractor, type AnthropicClient } from '../src/verification/ClaimExtractor';
import { CostTracker } from '../src/verification/CostTracker';
import { LLM_PRICING } from '../src/constants';
import { ClaimCategory } from '../src/types';

// Text must exceed ClaimExtractor's MIN_TEXT_FOR_EXTRACTION (200 chars)
const SAMPLE_TEXT = 'This whitepaper describes the protocol architecture including tokenomics, consensus mechanisms, and performance optimizations. The system uses a novel bonding curve with mathematical proofs for price stability and slashing conditions for validator misbehavior.';

function createMockClient(toolResponse?: Record<string, unknown>): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            input: toolResponse ?? {
              claims: [
                {
                  category: 'TOKENOMICS',
                  claimText: 'APY of 12% is sustainable',
                  statedEvidence: 'See Section 4',
                  mathematicalProofPresent: true,
                  sourceSection: 'Tokenomics',
                  regulatoryRelevance: false,
                },
                {
                  category: 'PERFORMANCE',
                  claimText: 'TPS exceeds 10,000',
                  statedEvidence: 'Benchmark tests in Section 5',
                  mathematicalProofPresent: false,
                  sourceSection: 'Performance',
                  regulatoryRelevance: false,
                },
                {
                  category: 'CONSENSUS',
                  claimText: 'Byzantine fault tolerance with 2/3 threshold',
                  statedEvidence: 'Proof in Appendix A',
                  mathematicalProofPresent: true,
                  sourceSection: 'Consensus',
                  regulatoryRelevance: false,
                },
              ],
            },
          },
        ],
        usage: { input_tokens: 2000, output_tokens: 500 },
      }),
    },
  };
}

describe('ClaimExtractor', () => {
  let client: AnthropicClient;
  let costTracker: CostTracker;
  let extractor: ClaimExtractor;

  beforeEach(() => {
    client = createMockClient();
    costTracker = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
    extractor = new ClaimExtractor({ client, costTracker });
  });

  it('extracts valid claims from mock API response', async () => {
    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims).toHaveLength(3);
    expect(claims[0].category).toBe('TOKENOMICS');
    expect(claims[0].claimText).toBe('APY of 12% is sustainable');
    expect(claims[0].mathematicalProofPresent).toBe(true);
  });

  it('returns empty array for empty API response', async () => {
    client = createMockClient({ claims: [] });
    extractor = new ClaimExtractor({ client, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims).toEqual([]);
  });

  it('handles malformed JSON gracefully', async () => {
    const malformedClient: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I cannot extract claims' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    };
    extractor = new ClaimExtractor({ client: malformedClient, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims).toEqual([]);
  });

  it('tracks token usage with recordUsage', async () => {
    await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');

    const tokens = costTracker.getTotalTokens();
    expect(tokens.input).toBe(2000);
    expect(tokens.output).toBe(500);
  });

  it('parses each ClaimCategory correctly', async () => {
    const allCategories = createMockClient({
      claims: [
        { category: 'TOKENOMICS', claimText: 'Tokenomics claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { category: 'PERFORMANCE', claimText: 'Performance claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { category: 'CONSENSUS', claimText: 'Consensus claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { category: 'SCIENTIFIC', claimText: 'Scientific claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ],
    });
    extractor = new ClaimExtractor({ client: allCategories, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims[0].category).toBe(ClaimCategory.TOKENOMICS);
    expect(claims[1].category).toBe(ClaimCategory.PERFORMANCE);
    expect(claims[2].category).toBe(ClaimCategory.CONSENSUS);
    expect(claims[3].category).toBe(ClaimCategory.SCIENTIFIC);
  });

  it('API error (500, rate limit) throws typed error', async () => {
    const errorClient: AnthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
      },
    };
    extractor = new ClaimExtractor({ client: errorClient, costTracker });

    await expect(extractor.extractClaims(SAMPLE_TEXT, 'TestProject')).rejects.toThrow('500');
  });

  it('returns empty array for empty text input', async () => {
    const claims = await extractor.extractClaims('', 'TestProject');
    expect(claims).toEqual([]);
    // Should not call API for empty text
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('returns empty array for text below minimum threshold (200 chars) without calling Sonnet', async () => {
    // SPA shells, image-only PDFs, and empty pages produce < 200 chars.
    // ClaimExtractor should skip the Sonnet API call entirely.
    const thinContent = 'Aerodrome Finance — a next-generation AMM on Base. Built on the Velodrome model with ve(3,3) tokenomics.'; // 105 chars
    expect(thinContent.length).toBeLessThan(200);

    const claims = await extractor.extractClaims(thinContent, 'Aerodrome');
    expect(claims).toEqual([]);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('assigns sequential claimIds', async () => {
    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims[0].claimId).toBe('claim-1');
    expect(claims[1].claimId).toBe('claim-2');
    expect(claims[2].claimId).toBe('claim-3');
  });

  it('filters out claims with empty claimText', async () => {
    const clientWithEmpty = createMockClient({
      claims: [
        { category: 'TOKENOMICS', claimText: '', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
        { category: 'PERFORMANCE', claimText: 'Valid claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ],
    });
    extractor = new ClaimExtractor({ client: clientWithEmpty, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims).toHaveLength(1);
    expect(claims[0].claimText).toBe('Valid claim');
  });

  it('parses regulatoryRelevance flag correctly', async () => {
    const regClient = createMockClient({
      claims: [
        { category: 'TOKENOMICS', claimText: 'APY of 12%', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '', regulatoryRelevance: false },
        { category: 'SCIENTIFIC', claimText: 'Compliant with MiCA Article 6', statedEvidence: 'Legal section', mathematicalProofPresent: false, sourceSection: 'Compliance', regulatoryRelevance: true },
      ],
    });
    extractor = new ClaimExtractor({ client: regClient, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims[0].regulatoryRelevance).toBe(false);
    expect(claims[1].regulatoryRelevance).toBe(true);
  });

  it('defaults regulatoryRelevance to false when missing', async () => {
    const noRegClient = createMockClient({
      claims: [
        { category: 'TOKENOMICS', claimText: 'Some claim', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '' },
      ],
    });
    extractor = new ClaimExtractor({ client: noRegClient, costTracker });

    const claims = await extractor.extractClaims(SAMPLE_TEXT, 'TestProject');
    expect(claims[0].regulatoryRelevance).toBe(false);
  });

  it('accumulates cost across multiple calls', async () => {
    await extractor.extractClaims(SAMPLE_TEXT, 'Project1');
    await extractor.extractClaims(SAMPLE_TEXT, 'Project2');

    const tokens = costTracker.getTotalTokens();
    expect(tokens.input).toBe(4000);
    expect(tokens.output).toBe(1000);
  });
});
