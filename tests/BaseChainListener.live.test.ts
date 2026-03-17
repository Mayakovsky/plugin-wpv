/**
 * Live integration test: BaseChainListener against real Base mainnet RPC.
 *
 * Verifies that the Graduated event topic and parsing logic work against
 * actual on-chain data from the Virtuals Bonding Proxy contract.
 *
 * Run explicitly: bun vitest run tests/BaseChainListener.live.test.ts
 * Requires: BASE_RPC_URL env var (defaults to https://mainnet.base.org)
 *
 * NOTE: Public RPCs throttle eth_getLogs. Tests that require getLogs will
 * skip gracefully if the RPC returns an error. Use a paid RPC for reliable runs.
 */

import { describe, it, expect } from 'vitest';
import { BaseChainListener, type RpcProvider, type RpcLogEntry } from '../src/discovery/BaseChainListener';
import {
  VIRTUALS_FACTORY_CONTRACT,
  GRADUATED_EVENT_TOPIC,
  BASE_RPC_URL,
} from '../src/constants';

// ── Minimal JSON-RPC provider with retry for public RPCs ──────

let rpcCallCount = 0;

class RpcUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcUnavailableError';
  }
}

async function rpcCall(method: string, params: unknown[], retries = 3): Promise<unknown> {
  let lastError = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    rpcCallCount++;
    const res = await fetch(BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcCallCount, method, params }),
    });
    const json = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) {
      lastError = json.error.message;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new RpcUnavailableError(`RPC error after ${retries} retries: ${lastError}`);
    }
    return json.result;
  }
}

function skipIfRpcUnavailable(err: unknown): void {
  if (err instanceof RpcUnavailableError) {
    console.log(`  SKIPPED — public RPC throttled: ${err.message}`);
    return; // test passes with skip note
  }
  throw err;
}

const liveProvider: RpcProvider = {
  async getBlockNumber(): Promise<number> {
    const hex = (await rpcCall('eth_blockNumber', [])) as string;
    return parseInt(hex, 16);
  },
  async getLogs(params: {
    address: string;
    fromBlock: number;
    toBlock: number | 'latest';
    topics?: string[];
  }): Promise<RpcLogEntry[]> {
    const filter = {
      address: params.address,
      fromBlock: '0x' + params.fromBlock.toString(16),
      toBlock: params.toBlock === 'latest' ? 'latest' : '0x' + params.toBlock.toString(16),
      topics: params.topics ?? [],
    };
    const logs = (await rpcCall('eth_getLogs', [filter])) as Array<{
      address: string;
      topics: string[];
      data: string;
      blockNumber: string;
      transactionHash: string;
    }>;
    return logs.map((l) => ({
      address: l.address,
      topics: l.topics,
      data: l.data,
      blockNumber: parseInt(l.blockNumber, 16),
      transactionHash: l.transactionHash,
    }));
  },
};

// ── Tests ──────────────────────────────────────────────────────

describe('BaseChainListener — Live Base RPC', () => {
  it('connects to Base RPC and gets current block number', async () => {
    const block = await liveProvider.getBlockNumber();
    expect(block).toBeGreaterThan(0);
    console.log(`  Current Base block: ${block}`);
    console.log(`  RPC endpoint: ${BASE_RPC_URL}`);
  }, 15_000);

  it('fetches Graduated events from Virtuals Bonding Proxy', async () => {
    try {
      const currentBlock = await liveProvider.getBlockNumber();
      // Public RPCs limit getLogs to 10,000 block range — use ~5.5h window
      const fromBlock = currentBlock - 9999;

      const logs = await liveProvider.getLogs({
        address: VIRTUALS_FACTORY_CONTRACT,
        fromBlock,
        toBlock: currentBlock,
        topics: [GRADUATED_EVENT_TOPIC],
      });

      console.log(`  Graduated events in ~10k blocks: ${logs.length}`);
      console.log(`  Contract: ${VIRTUALS_FACTORY_CONTRACT}`);
      console.log(`  Block range: ${fromBlock} → ${currentBlock}`);

      expect(Array.isArray(logs)).toBe(true);

      if (logs.length > 0) {
        const sample = logs[0];
        expect(sample.topics).toBeDefined();
        expect(sample.topics.length).toBeGreaterThanOrEqual(2);
        expect(sample.topics[0]).toBe(GRADUATED_EVENT_TOPIC);
        expect(sample.data).toBeDefined();
        expect(sample.data.length).toBeGreaterThanOrEqual(66);
        expect(sample.blockNumber).toBeGreaterThan(0);
        expect(sample.transactionHash).toBeDefined();

        console.log(`  Sample event:`);
        console.log(`    Block: ${sample.blockNumber}`);
        console.log(`    Tx: ${sample.transactionHash}`);
        console.log(`    Bonding token (topics[1]): 0x${sample.topics[1].slice(26)}`);
        console.log(`    Agent token (data): 0x${sample.data.slice(26, 66)}`);
      } else {
        console.log(`  No events in this window — contract may be quiet. This is OK.`);
      }
    } catch (err) {
      skipIfRpcUnavailable(err);
    }
  }, 30_000);

  it('BaseChainListener.getLatestTokens parses real events end-to-end', async () => {
    try {
      const listener = new BaseChainListener(liveProvider, VIRTUALS_FACTORY_CONTRACT, 0);
      const events = await listener.getLatestTokens(5);

      console.log(`  Parsed ${events.length} Graduated events via BaseChainListener`);

      for (const evt of events) {
        expect(evt.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(evt.agentToken).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(evt.blockNumber).toBeGreaterThan(0);
        expect(evt.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

        console.log(`    Block ${evt.blockNumber}: bonding=${evt.contractAddress} agent=${evt.agentToken}`);
      }

      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].blockNumber).toBeGreaterThanOrEqual(events[i].blockNumber);
      }
    } catch (err) {
      skipIfRpcUnavailable(err);
    }
  }, 60_000);

  it('uses the confirmed factory contract address', () => {
    expect(VIRTUALS_FACTORY_CONTRACT).toBe('0xF66DeA7b3e897cD44A5a231c61B6B4423d613259');
  });

  it('uses the confirmed Graduated event topic', () => {
    expect(GRADUATED_EVENT_TOPIC).toBe(
      '0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e',
    );
  });
});
