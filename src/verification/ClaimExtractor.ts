// ════════════════════════════════════════════
// WS-B2: ClaimExtractor
// Layer 2 — LLM-based claim extraction using Anthropic API with tool_use.
// ════════════════════════════════════════════

import type { ExtractedClaim, ClaimCategory } from '../types';
import type { CostTracker } from './CostTracker';
import { WPV_MODEL, CLAIM_EXTRACTION_MAX_TOKENS } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'ClaimExtractor' });

/** Minimal Anthropic client interface for testability */
export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
      tools: unknown[];
    }): Promise<{
      content: { type: string; input?: Record<string, unknown>; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You are a scientific claim extractor for cryptocurrency and DeFi whitepapers.

Extract all testable claims from the document. A testable claim is a specific assertion that can be verified against external data, mathematical analysis, or benchmark comparison.

Categorize each claim into one of these categories:
- TOKENOMICS: Claims about token supply, distribution, yield, APY, vesting, burns, inflation
- PERFORMANCE: Claims about TPS, latency, throughput, scalability, benchmarks
- CONSENSUS: Claims about consensus mechanisms, finality, validator selection, fault tolerance
- SCIENTIFIC: Claims citing academic research, mathematical proofs, novel algorithms

For each claim, extract:
- claimText: The exact claim being made
- statedEvidence: What evidence the whitepaper provides
- mathematicalProofPresent: Whether a mathematical proof accompanies the claim
- sourceSection: Which section of the document contains this claim

Example:
{
  "category": "TOKENOMICS",
  "claimText": "Staking APY will be maintained at 12% through algorithmic token emission",
  "statedEvidence": "Emission curve formula in Section 4.2",
  "mathematicalProofPresent": true,
  "sourceSection": "Tokenomics"
}`;

const CLAIM_EXTRACTION_TOOL = {
  name: 'extract_claims',
  description: 'Extract testable claims from the whitepaper text',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['TOKENOMICS', 'PERFORMANCE', 'CONSENSUS', 'SCIENTIFIC'],
            },
            claimText: { type: 'string' },
            statedEvidence: { type: 'string' },
            mathematicalProofPresent: { type: 'boolean' },
            sourceSection: { type: 'string' },
          },
          required: ['category', 'claimText', 'statedEvidence', 'mathematicalProofPresent', 'sourceSection'],
        },
      },
    },
    required: ['claims'],
  },
};

export class ClaimExtractor {
  private client: AnthropicClient;
  private costTracker: CostTracker;
  private model: string;

  constructor(deps: {
    client: AnthropicClient;
    costTracker: CostTracker;
    model?: string;
  }) {
    this.client = deps.client;
    this.costTracker = deps.costTracker;
    this.model = deps.model ?? WPV_MODEL;
  }

  /**
   * Extract testable claims from whitepaper text.
   * Returns empty array (not error) if no claims found.
   */
  async extractClaims(text: string, projectName: string): Promise<ExtractedClaim[]> {
    if (!text || text.trim().length === 0) return [];

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: CLAIM_EXTRACTION_MAX_TOKENS,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract all testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}`,
          },
        ],
        tools: [CLAIM_EXTRACTION_TOOL],
      });

      // Track token usage
      this.costTracker.recordUsage(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      // Extract claims from tool_use response
      return this.parseResponse(response.content);
    } catch (err) {
      log.warn('Claim extraction failed', { projectName }, err);
      throw err;
    }
  }

  private parseResponse(
    content: { type: string; input?: Record<string, unknown>; text?: string }[],
  ): ExtractedClaim[] {
    for (const block of content) {
      if (block.type === 'tool_use' && block.input) {
        const input = block.input as { claims?: unknown[] };
        if (!Array.isArray(input.claims)) return [];

        return input.claims
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map((c, i) => ({
            claimId: `claim-${i + 1}`,
            category: this.parseCategory(String(c.category ?? 'SCIENTIFIC')),
            claimText: String(c.claimText ?? ''),
            statedEvidence: String(c.statedEvidence ?? ''),
            mathematicalProofPresent: Boolean(c.mathematicalProofPresent),
            sourceSection: String(c.sourceSection ?? ''),
          }))
          .filter((c) => c.claimText.length > 0);
      }
    }

    return [];
  }

  private parseCategory(raw: string): ClaimCategory {
    const upper = raw.toUpperCase();
    if (upper === 'TOKENOMICS') return 'TOKENOMICS' as ClaimCategory;
    if (upper === 'PERFORMANCE') return 'PERFORMANCE' as ClaimCategory;
    if (upper === 'CONSENSUS') return 'CONSENSUS' as ClaimCategory;
    return 'SCIENTIFIC' as ClaimCategory;
  }
}
