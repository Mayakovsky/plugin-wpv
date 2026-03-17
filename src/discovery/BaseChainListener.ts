// ════════════════════════════════════════════
// WS-A1: BaseChainListener
// Polls Base chain for Graduated events on the Virtuals Bonding Proxy contract.
// Graduated events fire when agents hit the 42,000 VIRTUAL threshold.
// Uses RPC getLogs. Poll-based (cron), NOT WebSocket.
// ════════════════════════════════════════════

import type { TokenCreationEvent } from '../types';
import { GRADUATED_EVENT_TOPIC } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'BaseChainListener' });

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
        topics: [GRADUATED_EVENT_TOPIC],
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
        topics: [GRADUATED_EVENT_TOPIC],
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
   * Graduated(address indexed token, address agentToken):
   *   topics[0] = event signature hash
   *   topics[1] = token (bonding curve token, indexed, padded to 32 bytes)
   *   data      = agentToken (graduated agent token, non-indexed, padded to 32 bytes)
   * Deduplicates by transaction hash, sorts by blockNumber descending.
   */
  private parseLogs(logs: RpcLogEntry[]): TokenCreationEvent[] {
    const events: TokenCreationEvent[] = [];

    for (const log of logs) {
      try {
        if (this.seenTxHashes.has(log.transactionHash)) continue;

        // Graduated event: topics[0] = sig, topics[1] = token (indexed)
        if (!log.topics || log.topics.length < 2) continue;

        // Bonding curve token address (indexed)
        const contractAddress = '0x' + log.topics[1].slice(26);

        // Agent token address from data field (non-indexed)
        let agentToken = '';
        if (log.data && log.data !== '0x' && log.data.length >= 66) {
          agentToken = '0x' + log.data.slice(26, 66);
        }

        events.push({
          contractAddress,
          agentToken,
          deployer: '', // Not available in Graduated event
          timestamp: 0, // Not available in Graduated event — use block timestamp if needed
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
