import { describe, it, expect, vi } from 'vitest';
import { MarketTractionAnalyzer } from '../src/discovery/MarketTractionAnalyzer';
import type { RpcProvider } from '../src/discovery/BaseChainListener';

function createMockProvider(overrides: Partial<RpcProvider> = {}): RpcProvider {
  return {
    getLogs: vi.fn().mockResolvedValue([]),
    getBlockNumber: vi.fn().mockResolvedValue(1_000_000),
    ...overrides,
  };
}

describe('MarketTractionAnalyzer', () => {
  describe('checkGraduationSpeed', () => {
    it('fast: graduation within 7 days of creation', () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      // 100,000 blocks ≈ 2.3 days at 2s/block (< 302,400 threshold)
      expect(analyzer.checkGraduationSpeed(200_000, 100_000)).toBe('fast');
    });

    it('moderate: graduation 7–30 days after creation', () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      // 500,000 blocks ≈ 11.6 days
      expect(analyzer.checkGraduationSpeed(600_000, 100_000)).toBe('moderate');
    });

    it('slow: graduation >30 days after creation', () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      // 2,000,000 blocks ≈ 46 days
      expect(analyzer.checkGraduationSpeed(2_100_000, 100_000)).toBe('slow');
    });

    it('defaults to moderate when creation block unknown', () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      expect(analyzer.checkGraduationSpeed(500_000)).toBe('moderate');
    });
  });

  describe('checkTransferActivity', () => {
    it('returns transfer count and unique addresses', async () => {
      const provider = createMockProvider({
        getLogs: vi.fn().mockResolvedValue([
          { topics: ['0xddf2...', '0x' + '0'.repeat(24) + 'aaa', '0x' + '0'.repeat(24) + 'bbb'], data: '0x' },
          { topics: ['0xddf2...', '0x' + '0'.repeat(24) + 'aaa', '0x' + '0'.repeat(24) + 'ccc'], data: '0x' },
          { topics: ['0xddf2...', '0x' + '0'.repeat(24) + 'ddd', '0x' + '0'.repeat(24) + 'bbb'], data: '0x' },
        ]),
      });
      const analyzer = new MarketTractionAnalyzer(provider);

      const result = await analyzer.checkTransferActivity('0xtoken');

      // 3 transfers across chunks (mock returns same 3 for each chunk, but let's check structure)
      expect(result.transferCount7d).toBeGreaterThan(0);
      expect(result.uniqueAddresses7d).toBeGreaterThan(0);
    });

    it('returns zeros on RPC failure', async () => {
      const provider = createMockProvider({
        getBlockNumber: vi.fn().mockRejectedValue(new Error('network')),
      });
      const analyzer = new MarketTractionAnalyzer(provider);

      const result = await analyzer.checkTransferActivity('0xtoken');

      expect(result.transferCount7d).toBe(0);
      expect(result.uniqueAddresses7d).toBe(0);
    });
  });

  describe('evaluate (composite)', () => {
    it('marketTraction true for fast graduation', async () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      const result = await analyzer.evaluate('0xtoken', 200_000, 100_000);

      expect(result.graduationSpeed).toBe('fast');
      expect(result.marketTraction).toBe(true);
    });

    it('marketTraction true for high transfer activity', async () => {
      // Create enough transfer logs to exceed thresholds
      const logs = Array.from({ length: 60 }, (_, i) => ({
        topics: [
          '0xddf2...',
          '0x' + '0'.repeat(24) + i.toString(16).padStart(3, '0'),
          '0x' + '0'.repeat(24) + (i + 100).toString(16).padStart(3, '0'),
        ],
        data: '0x',
      }));
      const provider = createMockProvider({
        getLogs: vi.fn().mockResolvedValue(logs),
      });
      const analyzer = new MarketTractionAnalyzer(provider);

      // Slow graduation but high transfers
      const result = await analyzer.evaluate('0xtoken', 3_000_000, 100_000);

      expect(result.graduationSpeed).toBe('slow');
      expect(result.transferCount7d).toBeGreaterThan(50);
      expect(result.uniqueAddresses7d).toBeGreaterThan(30);
      expect(result.marketTraction).toBe(true);
    });

    it('marketTraction false for slow graduation and low activity', async () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      // Slow graduation, zero transfers (default mock)
      const result = await analyzer.evaluate('0xtoken', 3_000_000, 100_000);

      expect(result.graduationSpeed).toBe('slow');
      expect(result.transferCount7d).toBe(0);
      expect(result.marketTraction).toBe(false);
    });

    it('aGDP is null until Phase 2', async () => {
      const provider = createMockProvider();
      const analyzer = new MarketTractionAnalyzer(provider);

      const result = await analyzer.evaluate('0xtoken', 200_000);

      expect(result.agdp7d).toBeNull();
    });
  });
});
