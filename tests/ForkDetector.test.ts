import { describe, it, expect, vi } from 'vitest';
import { ForkDetector } from '../src/discovery/ForkDetector';
import { textSimilarity, jaccardSimilarity, extractNgrams, normalizeText } from '../src/discovery/similarity';

// ── Similarity utilities ──────────────────

describe('similarity utilities', () => {
  it('normalizeText lowercases and strips punctuation', () => {
    expect(normalizeText('Hello, World! Test.')).toBe('hello world test');
  });

  it('extractNgrams produces correct 3-grams', () => {
    const ngrams = extractNgrams('the quick brown fox jumps', 3);
    expect(ngrams.has('the quick brown')).toBe(true);
    expect(ngrams.has('quick brown fox')).toBe(true);
    expect(ngrams.has('brown fox jumps')).toBe(true);
    expect(ngrams.size).toBe(3);
  });

  it('jaccardSimilarity returns 1 for identical sets', () => {
    const set = new Set(['a', 'b', 'c']);
    expect(jaccardSimilarity(set, set)).toBe(1);
  });

  it('jaccardSimilarity returns 0 for disjoint sets', () => {
    const a = new Set(['a', 'b']);
    const b = new Set(['c', 'd']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('jaccardSimilarity returns 0 for empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('textSimilarity returns high value for near-identical texts', () => {
    const a = 'This is a decentralized finance protocol for cross-chain swaps with low fees';
    const b = 'This is a decentralized finance protocol for cross-chain swaps with low fees and more';
    expect(textSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it('textSimilarity returns low value for unrelated texts', () => {
    const a = 'This is a decentralized finance protocol for cross-chain swaps';
    const b = 'The weather in Tokyo is warm and sunny today with clear skies';
    expect(textSimilarity(a, b)).toBeLessThan(0.1);
  });
});

// ── ForkDetector ──────────────────────────

function createMockRepo(records: Array<{ projectName: string; metadataJson: Record<string, unknown> }> = []) {
  return {
    listRecent: vi.fn().mockResolvedValue(
      records.map((r, i) => ({
        id: `wp-${i}`,
        projectName: r.projectName,
        metadataJson: r.metadataJson,
      })),
    ),
  };
}

describe('ForkDetector', () => {
  describe('checkNamePattern', () => {
    it('flags SafeMoonInu as fork', () => {
      const detector = new ForkDetector(createMockRepo() as never);
      const result = detector.checkNamePattern('SafeMoonInu');
      expect(result.isFork).toBe(true);
      expect(result.method).toBe('name_pattern');
    });

    it('flags BabyDogeToken as fork', () => {
      const detector = new ForkDetector(createMockRepo() as never);
      expect(detector.checkNamePattern('BabyDogeToken').isFork).toBe(true);
    });

    it('flags ElonPepeSwap as fork', () => {
      const detector = new ForkDetector(createMockRepo() as never);
      expect(detector.checkNamePattern('ElonPepeSwap').isFork).toBe(true);
    });

    it('does NOT flag legitimate project names', () => {
      const detector = new ForkDetector(createMockRepo() as never);
      expect(detector.checkNamePattern('Uniswap').isFork).toBe(false);
      expect(detector.checkNamePattern('Aave').isFork).toBe(false);
      expect(detector.checkNamePattern('Chainlink').isFork).toBe(false);
      expect(detector.checkNamePattern('OmniSwap Protocol').isFork).toBe(false);
    });
  });

  describe('detect — description similarity', () => {
    it('flags project with copied description', async () => {
      const existingDesc = 'A revolutionary DeFi protocol that enables cross-chain swaps with minimal slippage and maximum efficiency for all users';
      const repo = createMockRepo([
        { projectName: 'OriginalProject', metadataJson: { description: existingDesc } },
      ]);
      const detector = new ForkDetector(repo as never);

      const result = await detector.detect('CopyProject', existingDesc, 'some whitepaper text');

      expect(result.isFork).toBe(true);
      expect(result.method).toBe('description_similarity');
      expect(result.matchedProject).toBe('OriginalProject');
    });

    it('does NOT flag project with unique description', async () => {
      const repo = createMockRepo([
        { projectName: 'OriginalProject', metadataJson: { description: 'A lending protocol on Ethereum' } },
      ]);
      const detector = new ForkDetector(repo as never);

      const result = await detector.detect(
        'UniqueProject',
        'An innovative NFT marketplace with AI-powered curation and social features',
        'unique whitepaper content',
      );

      expect(result.isFork).toBe(false);
    });
  });

  describe('detect — whitepaper text similarity', () => {
    it('flags project with copied whitepaper text', async () => {
      const wpText = 'Our protocol uses a novel bonding curve mechanism with a mathematical proof that the invariant holds for all valid state transitions across multiple chains and validators ensuring safety and liveness. The consensus algorithm achieves finality within two seconds on Base chain through recursive SNARK composition.';
      const repo = createMockRepo([
        { projectName: 'OriginalProject', metadataJson: { description: 'different desc', textFingerprint: wpText } },
      ]);
      const detector = new ForkDetector(repo as never);

      const result = await detector.detect('CopyProject', 'totally different description', wpText);

      expect(result.isFork).toBe(true);
      expect(result.method).toBe('whitepaper_similarity');
      expect(result.matchedProject).toBe('OriginalProject');
    });
  });

  describe('detect — composite', () => {
    it('name pattern takes priority over other checks', async () => {
      const repo = createMockRepo([
        { projectName: 'Original', metadataJson: { description: 'unique' } },
      ]);
      const detector = new ForkDetector(repo as never);

      const result = await detector.detect('SafeMoonInu', 'unique desc', 'unique wp');

      expect(result.isFork).toBe(true);
      expect(result.method).toBe('name_pattern');
    });

    it('returns isFork: false for fully unique project', async () => {
      const repo = createMockRepo([
        { projectName: 'Other', metadataJson: { description: 'A lending protocol', textFingerprint: 'lending stuff here' } },
      ]);
      const detector = new ForkDetector(repo as never);

      const result = await detector.detect(
        'OmniSwap',
        'A novel cross-chain DEX aggregator with intent-based routing',
        'This whitepaper describes a completely different approach to automated market making using concentrated liquidity positions',
      );

      expect(result.isFork).toBe(false);
    });

    it('caches records across multiple detect calls', async () => {
      const repo = createMockRepo([]);
      const detector = new ForkDetector(repo as never);

      await detector.detect('A', 'desc', 'text');
      await detector.detect('B', 'desc', 'text');

      expect(repo.listRecent).toHaveBeenCalledTimes(1); // Cached after first call
    });

    it('clearCache forces re-fetch', async () => {
      const repo = createMockRepo([]);
      const detector = new ForkDetector(repo as never);

      await detector.detect('A', 'desc', 'text');
      detector.clearCache();
      await detector.detect('B', 'desc', 'text');

      expect(repo.listRecent).toHaveBeenCalledTimes(2);
    });
  });
});
