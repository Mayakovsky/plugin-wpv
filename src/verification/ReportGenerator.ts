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
  Verdict,
  MicaClaimStatus,
  MicaComplianceStatus,
} from '../types';

export interface DiscoveryProvenance {
  discoveryStatus: DiscoveryStatus;
  discoverySourceTier: number | null;
  discoveryAttempts: DiscoveryAttempt[];
}

/**
 * A paper that CLAIMS MiCA compliance but FAILS the structural check
 * (2/7 sections etc.) is more suspicious than one that makes no claim at all.
 * The top-line verdict should reflect that discrepancy rather than show PASS
 * off the back of structural formatting alone.
 *
 * Rules (strictly downgrading — never upgrades):
 *   - claimsMica=YES + micaCompliant=NO:
 *       PASS → FAIL when structuralScore ≤ 3, else PASS → CONDITIONAL
 *   - claimsMica=YES + micaCompliant=PARTIAL:
 *       PASS → CONDITIONAL (soft downgrade)
 *   - otherwise unchanged
 */
function adjustVerdictForMicaDiscrepancy(
  verdict: Verdict,
  claimsMica: MicaClaimStatus,
  micaCompliant: MicaComplianceStatus,
  structuralScore: number,
): Verdict {
  if (claimsMica !== 'YES') return verdict;
  if (micaCompliant === 'YES') return verdict;
  if (verdict !== ('PASS' as Verdict)) return verdict;  // only ever downgrade PASS

  if (micaCompliant === 'NO') {
    return structuralScore <= 3 ? ('FAIL' as Verdict) : ('CONDITIONAL' as Verdict);
  }
  if (micaCompliant === 'PARTIAL') {
    return 'CONDITIONAL' as Verdict;
  }
  return verdict;
}

export class ReportGenerator {
  generateLegitimacyScan(
    verification: VerificationResult,
    analysis: StructuralAnalysis,
    wp: WhitepaperRecord,
    provenance?: DiscoveryProvenance,
  ): LegitimacyScanReport {
    const claimsMica = analysis.mica?.claimsMicaCompliance ?? 'NOT_MENTIONED';
    const micaCompliant = analysis.mica?.micaCompliant ?? 'NO';
    const adjustedVerdict = adjustVerdictForMicaDiscrepancy(
      verification.verdict,
      claimsMica,
      micaCompliant,
      verification.structuralScore,
    );

    const base: LegitimacyScanReport = {
      projectName: wp.projectName,
      tokenAddress: wp.tokenAddress,
      structuralScore: verification.structuralScore,
      verdict: adjustedVerdict,
      hypeTechRatio: verification.hypeTechRatio,
      claimCount: verification.totalClaims,
      claimsMicaCompliance: claimsMica,
      micaCompliant: micaCompliant,
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
