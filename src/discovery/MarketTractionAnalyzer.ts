// ════════════════════════════════════════════
// MarketTractionAnalyzer
// Replaces stubbed marketTraction: false with real on-chain signals.
// Signal 1: Time-to-graduation (block delta)
// Signal 2: Token transfer activity (7-day getLogs)
// Signal 3: aGDP from ACP registry (if available)
// ════════════════════════════════════════════

import type { RpcProvider } from './BaseChainListener';
import {
  GRADUATION_FAST_THRESHOLD_BLOCKS,
  GRADUATION_MODERATE_THRESHOLD_BLOCKS,
  TRANSFER_MIN_COUNT_7D,
  TRANSFER_MIN_UNIQUE_7D,
  TRANSFER_LOOKBACK_BLOCKS,
  ERC20_TRANSFER_TOPIC,
  AGDP_MIN_WEEKLY_USD,
} from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'MarketTractionAnalyzer' });

export type GraduationSpeed = 'fast' | 'moderate' | 'slow';

export interface TractionSignals {
  graduationSpeed: GraduationSpeed;
  transferCount7d: number;
  uniqueAddresses7d: number;
  agdp7d: number | null;
  marketTraction: boolean;
}

export class MarketTractionAnalyzer {
  constructor(private provider: RpcProvider) {}

  /**
   * Evaluate market traction for a token.
   * Returns composite signal — true if ANY threshold met.
   */
  async evaluate(
    tokenAddress: string,
    graduationBlock: number,
    creationBlock?: number,
  ): Promise<TractionSignals> {
    const graduationSpeed = this.checkGraduationSpeed(graduationBlock, creationBlock);
    const { transferCount7d, uniqueAddresses7d } = await this.checkTransferActivity(tokenAddress);
    const agdp7d: number | null = null; // ACP aGDP not available until Phase 2

    const marketTraction =
      graduationSpeed === 'fast' ||
      (transferCount7d >= TRANSFER_MIN_COUNT_7D && uniqueAddresses7d >= TRANSFER_MIN_UNIQUE_7D);

    return { graduationSpeed, transferCount7d, uniqueAddresses7d, agdp7d, marketTraction };
  }

  /**
   * Signal 1: Time-to-graduation from block delta.
   */
  checkGraduationSpeed(graduationBlock: number, creationBlock?: number): GraduationSpeed {
    if (!creationBlock || creationBlock >= graduationBlock) return 'moderate'; // Unknown — default to moderate

    const blockDelta = graduationBlock - creationBlock;

    if (blockDelta <= GRADUATION_FAST_THRESHOLD_BLOCKS) return 'fast';
    if (blockDelta <= GRADUATION_MODERATE_THRESHOLD_BLOCKS) return 'moderate';
    return 'slow';
  }

  /**
   * Signal 2: Token transfer activity over the last 7 days.
   * Uses chunked getLogs (10k block limit on public RPCs).
   */
  async checkTransferActivity(tokenAddress: string): Promise<{ transferCount7d: number; uniqueAddresses7d: number }> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const minBlock = Math.max(0, currentBlock - TRANSFER_LOOKBACK_BLOCKS);
      const chunkSize = 9999;

      let transferCount = 0;
      const addresses = new Set<string>();

      let toBlock = currentBlock;
      while (toBlock > minBlock) {
        const fromBlock = Math.max(minBlock, toBlock - chunkSize);
        try {
          const logs = await this.provider.getLogs({
            address: tokenAddress,
            fromBlock,
            toBlock,
            topics: [ERC20_TRANSFER_TOPIC],
          });

          transferCount += logs.length;
          for (const l of logs) {
            // topics[1] = from (indexed), topics[2] = to (indexed)
            if (l.topics.length >= 3) {
              addresses.add('0x' + l.topics[1].slice(26));
              addresses.add('0x' + l.topics[2].slice(26));
            }
          }
        } catch {
          // Skip failed chunks
        }
        toBlock = fromBlock - 1;
      }

      return { transferCount7d: transferCount, uniqueAddresses7d: addresses.size };
    } catch (err) {
      log.warn('Transfer activity check failed', { tokenAddress }, err);
      return { transferCount7d: 0, uniqueAddresses7d: 0 };
    }
  }
}
