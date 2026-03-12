// ════════════════════════════════════════════
// WS-B4: ReportGenerator
// Generates tiered JSON reports: Legitimacy → Tokenomics → Full → Daily.
// Tier superset rule: each tier extends the one below.
// ════════════════════════════════════════════

import type {
  VerificationResult,
  StructuralAnalysis,
  WhitepaperRecord,
  ExtractedClaim,
  ClaimEvaluation,
  LegitimacyScanReport,
  TokenomicsAuditReport,
  FullVerificationReport,
  DailyBriefingReport,
} from '../types';

export class ReportGenerator {
  generateLegitimacyScan(
    verification: VerificationResult,
    analysis: StructuralAnalysis,
    wp: WhitepaperRecord,
  ): LegitimacyScanReport {
    return {
      projectName: wp.projectName,
      tokenAddress: wp.tokenAddress,
      structuralScore: verification.structuralScore,
      verdict: verification.verdict,
      hypeTechRatio: verification.hypeTechRatio,
      claimCount: verification.totalClaims,
      generatedAt: new Date().toISOString(),
    };
  }

  generateTokenomicsAudit(
    verification: VerificationResult,
    claims: ExtractedClaim[],
    wp: WhitepaperRecord,
    claimScores?: Map<string, number>,
  ): TokenomicsAuditReport {
    const scan = this.generateLegitimacyScan(verification, {} as StructuralAnalysis, wp);

    const scores: Record<string, number> = {};
    if (claimScores) {
      for (const [id, score] of claimScores) {
        scores[id] = score;
      }
    }

    return {
      ...scan,
      claims,
      claimScores: scores,
      logicSummary: this.generateLogicSummary(claims, verification),
    };
  }

  generateFullVerification(
    verification: VerificationResult,
    claims: ExtractedClaim[],
    evaluations: ClaimEvaluation[],
    wp: WhitepaperRecord,
    claimScores?: Map<string, number>,
  ): FullVerificationReport {
    const audit = this.generateTokenomicsAudit(verification, claims, wp, claimScores);

    return {
      ...audit,
      confidenceScore: verification.confidenceScore,
      evaluations,
      focusAreaScores: verification.focusAreaScores,
      llmTokensUsed: verification.llmTokensUsed,
      computeCostUsd: verification.computeCostUsd,
    };
  }

  generateDailyBriefing(reports: FullVerificationReport[]): DailyBriefingReport {
    return {
      date: new Date().toISOString().split('T')[0],
      totalVerified: reports.length,
      whitepapers: reports,
    };
  }

  private generateLogicSummary(claims: ExtractedClaim[], verification: VerificationResult): string {
    const categories = new Set(claims.map((c) => c.category));
    const parts: string[] = [];

    parts.push(`${verification.totalClaims} claims extracted across ${categories.size} categories.`);

    if (verification.verifiedClaims > 0) {
      parts.push(`${verification.verifiedClaims}/${verification.totalClaims} claims verified.`);
    }

    if (verification.hypeTechRatio > 3.0) {
      parts.push('WARNING: High hype-to-tech ratio detected.');
    }

    return parts.join(' ');
  }
}
