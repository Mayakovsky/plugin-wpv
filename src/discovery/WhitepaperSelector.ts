// ════════════════════════════════════════════
// WS-A3: WhitepaperSelector
// Scores and filters discovered projects against the selection rubric.
// ════════════════════════════════════════════

import type { SelectionSignal, ProjectCandidate } from '../types';
import { SELECTION_WEIGHTS, SELECTION_DEFAULT_THRESHOLD } from '../constants';

export class WhitepaperSelector {
  private threshold: number;

  constructor(threshold?: number) {
    this.threshold = threshold ?? SELECTION_DEFAULT_THRESHOLD;
  }

  /**
   * Score a project based on selection signals.
   * hasLinkedPdf is REQUIRED — if false, returns 0 regardless of other signals.
   */
  scoreProject(signals: SelectionSignal): number {
    // Hard gate: no PDF = auto-reject
    if (!signals.hasLinkedPdf) return 0;

    let score = SELECTION_WEIGHTS.hasLinkedPdf; // 3

    if (signals.documentLengthOk) score += SELECTION_WEIGHTS.documentLengthOk;
    if (signals.technicalClaimsDetected) score += SELECTION_WEIGHTS.technicalClaimsDetected;
    if (signals.marketTraction) score += SELECTION_WEIGHTS.marketTraction;
    if (signals.notAFork) score += SELECTION_WEIGHTS.notAFork;
    if (signals.isFresh) score += SELECTION_WEIGHTS.isFresh;

    return score;
  }

  /**
   * Filter and sort candidates by score.
   * Only candidates at or above threshold pass. Results sorted descending by score.
   */
  filterProjects(candidates: ProjectCandidate[]): ProjectCandidate[] {
    const scored = candidates.map((c) => ({
      ...c,
      score: this.scoreProject(c.signals),
    }));

    return scored
      .filter((c) => c.score >= this.threshold)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}
