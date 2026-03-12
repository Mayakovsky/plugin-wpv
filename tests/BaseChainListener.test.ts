import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseChainListener, type RpcProvider, type RpcLogEntry } from '../src/discovery/BaseChainListener';

function padAddress(addr: string): string {
  return '0x' + addr.replace('0x', '').padStart(64, '0');
}

function makeLog(overrides: Partial<RpcLogEntry> & { tokenAddress?: string; deployer?: string } = {}): RpcLogEntry {
  const tokenAddr = overrides.tokenAddress ?? '0xabc123';
  const deployer = overrides.deployer ?? '0xdef456';
  return {
    address: '0xFACTORY',
    topics: [
      '0xEventSigHash',
      padAddress(tokenAddr),
      padAddress(deployer),
    ],
    data: '0x' + (1700000000).toString(16).padStart(64, '0'),
    blockNumber: overrides.blockNumber ?? 100,
    transactionHash: overrides.transactionHash ?? `0xtx${Math.random().toString(36).slice(2)}`,
  };
}

function createMockProvider(overrides: Partial<RpcProvider> = {}): RpcProvider {
  return {
    getLogs: vi.fn().mockResolvedValue([]),
    getBlockNumber: vi.fn().mockResolvedValue(1000),
    ...overrides,
  };
}

describe('BaseChainListener', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let listener: BaseChainListener;

  beforeEach(() => {
    provider = createMockProvider();
    listener = new BaseChainListener(provider, '0xFACTORY', 0);
  });

  it('parses a known token creation event correctly', async () => {
    const log = makeLog({ tokenAddress: '0xABCDEF', deployer: '0x123456', blockNumber: 500 });
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([log]);

    const events = await listener.getNewTokensSince(0);
    expect(events).toHaveLength(1);
    expect(events[0].contractAddress.toLowerCase()).toContain('abcdef');
    expect(events[0].deployer.toLowerCase()).toContain('123456');
    expect(events[0].blockNumber).toBe(500);
    expect(events[0].transactionHash).toBe(log.transactionHash);
  });

  it('handles RPC timeout gracefully (returns empty, does not throw)', async () => {
    (provider.getLogs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));

    const events = await listener.getNewTokensSince(0);
    expect(events).toEqual([]);
  });

  it('handles RPC returning empty results', async () => {
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const events = await listener.getNewTokensSince(0);
    expect(events).toEqual([]);
  });

  it('deduplicates events across multiple calls', async () => {
    const log = makeLog({ transactionHash: '0xDUPE', blockNumber: 100 });
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([log]);

    const first = await listener.getNewTokensSince(0);
    expect(first).toHaveLength(1);

    // Reset mock to return same log again
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([log]);
    const second = await listener.getNewTokensSince(0);
    expect(second).toHaveLength(0);
  });

  it('returns events sorted by block number descending', async () => {
    const logs = [
      makeLog({ blockNumber: 50 }),
      makeLog({ blockNumber: 200 }),
      makeLog({ blockNumber: 100 }),
    ];
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(logs);

    const events = await listener.getNewTokensSince(0);
    expect(events).toHaveLength(3);
    expect(events[0].blockNumber).toBe(200);
    expect(events[1].blockNumber).toBe(100);
    expect(events[2].blockNumber).toBe(50);
  });

  it('handles malformed event data without crashing', async () => {
    const malformed: RpcLogEntry = {
      address: '0xFACTORY',
      topics: ['0xEventSig'], // Missing indexed params
      data: '0x',
      blockNumber: 100,
      transactionHash: '0xmalformed',
    };
    const valid = makeLog({ blockNumber: 200 });
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([malformed, valid]);

    const events = await listener.getNewTokensSince(0);
    expect(events).toHaveLength(1); // Only valid one parsed
    expect(events[0].blockNumber).toBe(200);
  });

  it('respects the sinceBlockNumber filter', async () => {
    (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await listener.getNewTokensSince(300);

    expect(provider.getLogs).toHaveBeenCalledWith({
      address: '0xFACTORY',
      fromBlock: 301,
      toBlock: 500,
    });
  });

  it('tracks last processed block correctly', async () => {
    expect(listener.getLastProcessedBlock()).toBe(0);

    (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await listener.getNewTokensSince(0);

    expect(listener.getLastProcessedBlock()).toBe(500);
  });

  it('returns empty when sinceBlockNumber >= current block', async () => {
    (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockResolvedValue(100);

    const events = await listener.getNewTokensSince(100);
    expect(events).toEqual([]);
  });

  it('getLatestTokens respects limit', async () => {
    const logs = Array.from({ length: 10 }, (_, i) => makeLog({ blockNumber: i * 10 }));
    (provider.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(logs);

    const events = await listener.getLatestTokens(3);
    expect(events).toHaveLength(3);
  });

  it('getLatestTokens handles RPC error gracefully', async () => {
    (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));

    const events = await listener.getLatestTokens(5);
    expect(events).toEqual([]);
  });
});
