// ════════════════════════════════════════════
// WS-A1: BaseChainListener
// Polls Base chain for new token creation events on the Virtuals bonding curve contract.
// Uses viem for RPC interaction. Poll-based (cron), NOT WebSocket.
// ════════════════════════════════════════════

import type { TokenCreationEvent } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'BaseChainListener' });

/** ABI fragment for the TokenCreated event (Virtuals factory pattern) */
const TOKEN_CREATED_EVENT_ABI = {
  type: 'event' as const,
  name: 'TokenCreated',
  inputs: [
    { name: 'tokenAddress', type: 'address', indexed: true },
    { name: 'deployer', type: 'address', indexed: true },
    { name: 'timestamp', type: 'uint256', indexed: false },
  ],
} as const;

export interface RpcProvider {
  getLogs(params: {
    address: string;
    fromBlock: number;
    toBlock: number | 'latest';
    topics?: string[];
  }): Promise<RpcLogEntry[]>;
  getBlockNumber(): Promise<number>;
}

export interface RpcLogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
}

export class BaseChainListener {
  private lastProcessedBlock: number;
  private seenTxHashes = new Set<string>();

  constructor(
    private provider: RpcProvider,
    private contractAddress: string,
    startBlock = 0,
  ) {
    this.lastProcessedBlock = startBlock;
  }

  /**
   * Get new token creation events since a given block number.
   * Returns events sorted by block number descending.
   */
  async getNewTokensSince(sinceBlockNumber: number): Promise<TokenCreationEvent[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (sinceBlockNumber >= currentBlock) return [];

      const logs = await this.provider.getLogs({
        address: this.contractAddress,
        fromBlock: sinceBlockNumber + 1,
        toBlock: currentBlock,
      });

      const events = this.parseLogs(logs);
      this.lastProcessedBlock = currentBlock;
      return events;
    } catch (err) {
      log.warn('RPC call failed in getNewTokensSince', { sinceBlockNumber }, err);
      return [];
    }
  }

  /**
   * Get the latest N token creation events.
   */
  async getLatestTokens(limit: number): Promise<TokenCreationEvent[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      // Look back ~24h of blocks (~2s block time on Base = ~43200 blocks)
      const lookbackBlocks = 43200;
      const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

      const logs = await this.provider.getLogs({
        address: this.contractAddress,
        fromBlock,
        toBlock: currentBlock,
      });

      const events = this.parseLogs(logs);
      this.lastProcessedBlock = currentBlock;
      return events.slice(0, limit);
    } catch (err) {
      log.warn('RPC call failed in getLatestTokens', { limit }, err);
      return [];
    }
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  /**
   * Parse raw log entries into TokenCreationEvents.
   * Deduplicates by transaction hash, sorts by blockNumber descending.
   */
  private parseLogs(logs: RpcLogEntry[]): TokenCreationEvent[] {
    const events: TokenCreationEvent[] = [];

    for (const log of logs) {
      try {
        if (this.seenTxHashes.has(log.transactionHash)) continue;

        // Extract indexed parameters from topics
        // topics[0] = event signature hash
        // topics[1] = tokenAddress (indexed, padded to 32 bytes)
        // topics[2] = deployer (indexed, padded to 32 bytes)
        if (!log.topics || log.topics.length < 3) continue;

        const contractAddress = '0x' + log.topics[1].slice(26);
        const deployer = '0x' + log.topics[2].slice(26);

        // Timestamp from non-indexed data field
        let timestamp = 0;
        if (log.data && log.data !== '0x') {
          timestamp = parseInt(log.data, 16);
        }

        events.push({
          contractAddress,
          deployer,
          timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        });

        this.seenTxHashes.add(log.transactionHash);
      } catch {
        // Skip malformed entries
      }
    }

    // Sort by block number descending (newest first)
    events.sort((a, b) => b.blockNumber - a.blockNumber);
    return events;
  }
}
