import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaimExtractor, type AnthropicClient } from '../src/verification/ClaimExtractor';
import { CostTracker } from '../src/verification/CostTracker';
import { LLM_PRICING } from '../src/constants';
import { ClaimCategory } from '../src/types';

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
                },
                {
                  category: 'PERFORMANCE',
                  claimText: 'TPS exceeds 10,000',
                  statedEvidence: 'Benchmark tests in Section 5',
                  mathematicalProofPresent: false,
                  sourceSection: 'Performance',
                },
                {
                  category: 'CONSENSUS',
                  claimText: 'Byzantine fault tolerance with 2/3 threshold',
                  statedEvidence: 'Proof in Appendix A',
                  mathematicalProofPresent: true,
                  sourceSection: 'Consensus',
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
    const claims = await extractor.extractClaims('Some whitepaper text...', 'TestProject');
    expect(claims).toHaveLength(3);
    expect(claims[0].category).toBe('TOKENOMICS');
    expect(claims[0].claimText).toBe('APY of 12% is sustainable');
    expect(claims[0].mathematicalProofPresent).toBe(true);
  });

  it('returns empty array for empty API response', async () => {
    client = createMockClient({ claims: [] });
    extractor = new ClaimExtractor({ client, costTracker });

    const claims = await extractor.extractClaims('Some text', 'TestProject');
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

    const claims = await extractor.extractClaims('Some text', 'TestProject');
    expect(claims).toEqual([]);
  });

  it('tracks token usage with recordUsage', async () => {
    await extractor.extractClaims('Some text', 'TestProject');

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

    const claims = await extractor.extractClaims('Text', 'TestProject');
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

    await expect(extractor.extractClaims('Text', 'TestProject')).rejects.toThrow('500');
  });

  it('returns empty array for empty text input', async () => {
    const claims = await extractor.extractClaims('', 'TestProject');
    expect(claims).toEqual([]);
    // Should not call API for empty text
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('assigns sequential claimIds', async () => {
    const claims = await extractor.extractClaims('Text', 'TestProject');
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

    const claims = await extractor.extractClaims('Text', 'TestProject');
    expect(claims).toHaveLength(1);
    expect(claims[0].claimText).toBe('Valid claim');
  });

  it('accumulates cost across multiple calls', async () => {
    await extractor.extractClaims('Text 1', 'Project1');
    await extractor.extractClaims('Text 2', 'Project2');

    const tokens = costTracker.getTotalTokens();
    expect(tokens.input).toBe(4000);
    expect(tokens.output).toBe(1000);
  });
});
