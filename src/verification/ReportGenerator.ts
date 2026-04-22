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
  DiscoveryStatus,
  DiscoveryAttempt,
} from '../types';

export interface DiscoveryProvenance {
  discoveryStatus: DiscoveryStatus;
  discoverySourceTier: number | null;
  discoveryAttempts: DiscoveryAttempt[];
}

export class ReportGenerator {
  generateLegitimacyScan(
    verification: VerificationResult,
    analysis: StructuralAnalysis,
    wp: WhitepaperRecord,
    provenance?: DiscoveryProvenance,
  ): LegitimacyScanReport {
    const base: LegitimacyScanReport = {
      projectName: wp.projectName,
      tokenAddress: wp.tokenAddress,
      structuralScore: verification.structuralScore,
      verdict: verification.verdict,
      hypeTechRatio: verification.hypeTechRatio,
      claimCount: verification.totalClaims,
      claimsMicaCompliance: analysis.mica?.claimsMicaCompliance ?? 'NOT_MENTIONED',
      micaCompliant: analysis.mica?.micaCompliant ?? 'NO',
      micaSummary: analysis.mica?.micaSummary ?? '',
      generatedAt: new Date().toISOString(),
    };
    if (provenance) {
      base.discoveryStatus = provenance.discoveryStatus;
      base.discoverySourceTier = provenance.discoverySourceTier;
      base.discoveryAttempts = provenance.discoveryAttempts;
    }
    return base;
  }

  generateTokenomicsAudit(
    verification: VerificationResult,
    claims: ExtractedClaim[],
    wp: WhitepaperRecord,
    claimScores?: Map<string, number>,
    analysis?: StructuralAnalysis,
  ): TokenomicsAuditReport {
    const scan = this.generateLegitimacyScan(verification, analysis ?? {} as StructuralAnalysis, wp);

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
    analysis?: StructuralAnalysis,
  ): FullVerificationReport {
    const audit = this.generateTokenomicsAudit(verification, claims, wp, claimScores, analysis);

    // Transform focusAreaScores keys to lowercase for ACP deliverable compliance.
    // Internal ScoreAggregator uses ClaimCategory enum values (TOKENOMICS, PERFORMANCE, etc.)
    // but ACP schema requires camelCase/snake_case field names.
    // Preserve null for absent categories (vs. 0 which misleadingly implies "scored but failed").
    const lowercaseScores: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(verification.focusAreaScores)) {
      lowercaseScores[key.toLowerCase()] = value;
    }

    return {
      ...audit,
      confidenceScore: verification.confidenceScore,
      evaluations,
      focusAreaScores: lowercaseScores,
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
