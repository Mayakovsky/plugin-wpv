// ════════════════════════════════════════════
// ForkDetector
// Detects cloned/forked projects using text similarity and name patterns.
// Replaces stubbed notAFork: true.
// ════════════════════════════════════════════

import type { WpvWhitepapersRepo } from '../db/wpvWhitepapersRepo';
import type { WpvWhitepaperRow } from '../db/wpvSchema';
import { textSimilarity } from './similarity';
import {
  FORK_DESCRIPTION_SIMILARITY_THRESHOLD,
  FORK_WHITEPAPER_SIMILARITY_THRESHOLD,
  FORK_NAME_PATTERNS,
} from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'ForkDetector' });

export interface ForkDetectionResult {
  isFork: boolean;
  matchedProject?: string;
  method?: 'description_similarity' | 'name_pattern' | 'whitepaper_similarity';
  similarity?: number;
}

export class ForkDetector {
  private cachedRecords: WpvWhitepaperRow[] | null = null;

  constructor(private whitepaperRepo: WpvWhitepapersRepo) {}

  /**
   * Detect if a project is a fork/clone.
   * Checks: name patterns, description similarity, whitepaper text similarity.
   */
  async detect(
    name: string,
    description: string,
    whitepaperText: string,
  ): Promise<ForkDetectionResult> {
    // Check 1: Name pattern matching (instant, no DB)
    const nameResult = this.checkNamePattern(name);
    if (nameResult.isFork) return nameResult;

    // Load existing records for comparison (cached per run)
    const records = await this.getRecords();
    if (records.length === 0) return { isFork: false };

    // Check 2: Description similarity against existing records
    if (description) {
      for (const record of records) {
        const existingDesc = (record.metadataJson as Record<string, unknown>)?.description as string;
        if (!existingDesc) continue;

        const sim = textSimilarity(description, existingDesc);
        if (sim >= FORK_DESCRIPTION_SIMILARITY_THRESHOLD) {
          log.info('Fork detected: description similarity', {
            name,
            matchedProject: record.projectName,
            similarity: sim.toFixed(3),
          });
          return {
            isFork: true,
            matchedProject: record.projectName,
            method: 'description_similarity',
            similarity: sim,
          };
        }
      }
    }

    // Check 3: Whitepaper text similarity
    if (whitepaperText && whitepaperText.length > 200) {
      for (const record of records) {
        const existingFingerprint = (record.metadataJson as Record<string, unknown>)?.textFingerprint as string;
        if (!existingFingerprint) continue;

        const sim = textSimilarity(whitepaperText, existingFingerprint);
        if (sim >= FORK_WHITEPAPER_SIMILARITY_THRESHOLD) {
          log.info('Fork detected: whitepaper text similarity', {
            name,
            matchedProject: record.projectName,
            similarity: sim.toFixed(3),
          });
          return {
            isFork: true,
            matchedProject: record.projectName,
            method: 'whitepaper_similarity',
            similarity: sim,
          };
        }
      }
    }

    return { isFork: false };
  }

  /**
   * Check if a project name matches known clone/scam patterns.
   */
  checkNamePattern(name: string): ForkDetectionResult {
    if (!name) return { isFork: false };

    for (const pattern of FORK_NAME_PATTERNS) {
      if (pattern.test(name)) {
        log.info('Fork detected: name pattern match', { name, pattern: pattern.source });
        return { isFork: true, method: 'name_pattern' };
      }
    }
    return { isFork: false };
  }

  /**
   * Lazily load and cache recent whitepaper records for comparison.
   */
  private async getRecords(): Promise<WpvWhitepaperRow[]> {
    if (this.cachedRecords) return this.cachedRecords;
    try {
      this.cachedRecords = await this.whitepaperRepo.listRecent(200);
    } catch {
      this.cachedRecords = [];
    }
    return this.cachedRecords;
  }

  /**
   * Clear cached records (call between discovery runs).
   */
  clearCache(): void {
    this.cachedRecords = null;
  }
}
