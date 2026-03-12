// ════════════════════════════════════════════
// WS-B3: ScoreAggregator
// Aggregates per-claim scores into confidence score, focus area scores, and verdict.
// ════════════════════════════════════════════

import type { ClaimCategory, Verdict, ScoreWeights } from '../types';
import { DEFAULT_SCORE_WEIGHTS, VERDICT_THRESHOLDS, MIN_EVALUABLE_CLAIMS } from '../constants';

export class ScoreAggregator {
  private weights: ScoreWeights;

  constructor(weights?: ScoreWeights) {
    this.weights = weights ?? DEFAULT_SCORE_WEIGHTS;
  }

  /**
   * Aggregate claim scores into a final verdict.
   */
  aggregate(claimScores: { category: ClaimCategory; score: number }[]): {
    confidenceScore: number;
    focusAreaScores: Record<ClaimCategory, number>;
    verdict: Verdict;
  } {
    // Insufficient data check
    if (claimScores.length < MIN_EVALUABLE_CLAIMS) {
      return {
        confidenceScore: 0,
        focusAreaScores: this.emptyFocusScores(),
        verdict: 'INSUFFICIENT_DATA' as Verdict,
      };
    }

    // Compute focus area scores (average per category)
    const focusAreaScores = this.computeFocusAreaScores(claimScores);

    // Compute weighted confidence score
    const confidenceScore = this.computeConfidenceScore(claimScores);

    // Derive verdict from confidence score
    const verdict = this.deriveVerdict(confidenceScore);

    return { confidenceScore, focusAreaScores, verdict };
  }

  private computeFocusAreaScores(
    claimScores: { category: ClaimCategory; score: number }[],
  ): Record<ClaimCategory, number> {
    const scores: Record<string, number[]> = {
      TOKENOMICS: [],
      PERFORMANCE: [],
      CONSENSUS: [],
      SCIENTIFIC: [],
    };

    for (const cs of claimScores) {
      if (scores[cs.category]) {
        scores[cs.category].push(cs.score);
      }
    }

    return {
      TOKENOMICS: this.avg(scores.TOKENOMICS),
      PERFORMANCE: this.avg(scores.PERFORMANCE),
      CONSENSUS: this.avg(scores.CONSENSUS),
      SCIENTIFIC: this.avg(scores.SCIENTIFIC),
    } as Record<ClaimCategory, number>;
  }

  private computeConfidenceScore(
    claimScores: { category: ClaimCategory; score: number }[],
  ): number {
    // Simple average of all claim scores
    if (claimScores.length === 0) return 0;

    const total = claimScores.reduce((sum, cs) => sum + cs.score, 0);
    return Math.round(total / claimScores.length);
  }

  private deriveVerdict(confidenceScore: number): Verdict {
    if (confidenceScore >= VERDICT_THRESHOLDS.PASS) return 'PASS' as Verdict;
    if (confidenceScore >= VERDICT_THRESHOLDS.CONDITIONAL) return 'CONDITIONAL' as Verdict;
    return 'FAIL' as Verdict;
  }

  private avg(nums: number[]): number {
    if (nums.length === 0) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  }

  private emptyFocusScores(): Record<ClaimCategory, number> {
    return {
      TOKENOMICS: 0,
      PERFORMANCE: 0,
      CONSENSUS: 0,
      SCIENTIFIC: 0,
    } as Record<ClaimCategory, number>;
  }
}
