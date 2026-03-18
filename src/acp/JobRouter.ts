// ════════════════════════════════════════════
// WS-C3: JobRouter
// Routes offering_id to the appropriate pipeline depth.
// Depends on all verification and discovery services.
// ════════════════════════════════════════════

import type { OfferingId, StructuralAnalysis } from '../types';
import type { WpvWhitepapersRepo } from '../db/wpvWhitepapersRepo';
import type { WpvVerificationsRepo } from '../db/wpvVerificationsRepo';
import type { WpvClaimsRepo } from '../db/wpvClaimsRepo';
import type { StructuralAnalyzer } from '../verification/StructuralAnalyzer';
import type { ClaimExtractor } from '../verification/ClaimExtractor';
import type { ClaimEvaluator } from '../verification/ClaimEvaluator';
import type { ScoreAggregator } from '../verification/ScoreAggregator';
import type { ReportGenerator } from '../verification/ReportGenerator';
import type { CostTracker } from '../verification/CostTracker';
import type { CryptoContentResolver } from '../discovery/CryptoContentResolver';
import { Verdict } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'JobRouter' });

export interface JobRouterDeps {
  whitepaperRepo: WpvWhitepapersRepo;
  verificationsRepo: WpvVerificationsRepo;
  claimsRepo: WpvClaimsRepo;
  structuralAnalyzer: StructuralAnalyzer;
  claimExtractor: ClaimExtractor;
  claimEvaluator: ClaimEvaluator;
  scoreAggregator: ScoreAggregator;
  reportGenerator: ReportGenerator;
  costTracker: CostTracker;
  cryptoResolver: CryptoContentResolver;
}

export class JobRouter {
  constructor(private deps: JobRouterDeps) {}

  async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
    log.info('Routing job', { offeringId });

    switch (offeringId) {
      case 'project_legitimacy_scan':
        return this.handleLegitimacyScan(input);
      case 'tokenomics_sustainability_audit':
        return this.handleTokenomicsAudit(input);
      case 'verify_project_whitepaper':
        return this.handleVerifyWhitepaper(input);
      case 'full_technical_verification':
        return this.handleFullVerification(input);
      case 'daily_technical_briefing':
        return this.handleDailyBriefing(input);
      default:
        return { error: 'unknown_offering', message: `Unknown offering: ${offeringId}` };
    }
  }

  private async handleLegitimacyScan(input: Record<string, unknown>) {
    const wp = await this.findWhitepaper(input);
    if (!wp) return this.notInDatabase();

    const verification = await this.deps.verificationsRepo.findByWhitepaperId(wp.id);
    if (!verification) return this.notInDatabase();

    const analysis = this.extractStructuralAnalysis(verification);

    return this.deps.reportGenerator.generateLegitimacyScan(
      this.verificationRowToResult(verification),
      analysis,
      wp as never,
    );
  }

  private async handleTokenomicsAudit(input: Record<string, unknown>) {
    const wp = await this.findWhitepaper(input);
    if (!wp) return this.notInDatabase();

    const verification = await this.deps.verificationsRepo.findByWhitepaperId(wp.id);
    if (!verification) return this.notInDatabase();

    const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
    const analysis = this.extractStructuralAnalysis(verification);

    return this.deps.reportGenerator.generateTokenomicsAudit(
      this.verificationRowToResult(verification),
      claims.map((c) => ({
        claimId: c.id,
        category: c.category as never,
        claimText: c.claimText,
        statedEvidence: c.statedEvidence,
        mathematicalProofPresent: c.mathProofPresent,
        sourceSection: c.sourceSection,
        regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
      })),
      wp as never,
      undefined,
      analysis,
    );
  }

  /**
   * Resolve, analyze (L1), extract claims (L2), and store whitepaper + claims.
   * Shared by handleVerifyWhitepaper and handleFullVerification.
   * Returns intermediate results for further processing.
   */
  private async runL1L2(documentUrl: string, projectName: string) {
    // Resolve the document
    const resolved = await this.deps.cryptoResolver.resolveWhitepaper(documentUrl);

    // L1: Structural analysis
    const analysis = await this.deps.structuralAnalyzer.analyze(resolved.text, resolved.pageCount);
    const structuralScore = this.deps.structuralAnalyzer.computeQuickFilterScore(analysis);
    const hypeTechRatio = this.deps.structuralAnalyzer.computeHypeTechRatio(resolved.text);

    // L2: Claim extraction
    const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName);

    // Store whitepaper
    const wp = await this.deps.whitepaperRepo.create({
      projectName,
      documentUrl,
      chain: 'base',
      pageCount: resolved.pageCount,
      status: 'VERIFIED',
      selectionScore: 0,
    });

    // Store claims
    for (const claim of claims) {
      await this.deps.claimsRepo.create({
        whitepaperId: wp.id,
        category: claim.category,
        claimText: claim.claimText,
        statedEvidence: claim.statedEvidence,
        sourceSection: claim.sourceSection,
        mathProofPresent: claim.mathematicalProofPresent,
        evaluationJson: claim.regulatoryRelevance ? { regulatoryRelevance: true } : undefined,
      });
    }

    return { resolved, analysis, structuralScore, hypeTechRatio, claims, wp };
  }

  private async handleVerifyWhitepaper(input: Record<string, unknown>) {
    const documentUrl = input.document_url as string | undefined;
    const projectName = input.project_name as string | undefined;

    if (!documentUrl || !projectName) {
      return { error: 'missing_input', message: 'document_url and project_name are required' };
    }

    const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = await this.runL1L2(documentUrl, projectName);

    // L2 scoring: use claimEvaluator for real scores
    const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(claims, resolved.text);

    // Build score array from evaluation results
    const claimScores = claims.map((c) => ({
      category: c.category as never,
      score: scores.get(c.claimId) ?? 50,
    }));

    const aggregate = this.deps.scoreAggregator.aggregate(claimScores);

    // Store verification with structural analysis (includes MiCA data)
    const tokens = this.deps.costTracker.getTotalTokens();
    await this.deps.verificationsRepo.create({
      whitepaperId: wp.id,
      structuralScore,
      confidenceScore: aggregate.confidenceScore,
      hypeTechRatio,
      verdict: aggregate.verdict,
      totalClaims: claims.length,
      verifiedClaims: evaluations.length,
      llmTokensUsed: tokens.input + tokens.output,
      computeCostUsd: this.deps.costTracker.getTotalCostUsd(),
      structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
    });

    return this.deps.reportGenerator.generateTokenomicsAudit(
      {
        structuralScore,
        confidenceScore: aggregate.confidenceScore,
        hypeTechRatio,
        verdict: aggregate.verdict,
        focusAreaScores: aggregate.focusAreaScores,
        totalClaims: claims.length,
        verifiedClaims: evaluations.length,
        llmTokensUsed: tokens.input + tokens.output,
        computeCostUsd: this.deps.costTracker.getTotalCostUsd(),
      },
      claims,
      wp as never,
      scores,
      analysis,
    );
  }

  private async handleFullVerification(input: Record<string, unknown>) {
    // Check for cached result first
    const wp = await this.findWhitepaper(input);
    if (wp) {
      const verification = await this.deps.verificationsRepo.findByWhitepaperId(wp.id);
      if (verification) {
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        const analysis = this.extractStructuralAnalysis(verification);
        return this.deps.reportGenerator.generateFullVerification(
          this.verificationRowToResult(verification),
          claims.map((c) => ({
            claimId: c.id,
            category: c.category as never,
            claimText: c.claimText,
            statedEvidence: c.statedEvidence,
            mathematicalProofPresent: c.mathProofPresent,
            sourceSection: c.sourceSection,
            regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
          })),
          [],
          wp as never,
          undefined,
          analysis,
        );
      }
    }

    // No cached result — check if we have a URL for live L1+L2+L3
    const documentUrl = input.document_url as string | undefined;
    const projectName = input.project_name as string | undefined;
    if (!documentUrl || !projectName) {
      return this.notInDatabase();
    }

    // Run L1+L2
    const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp: newWp } = await this.runL1L2(documentUrl, projectName);

    // L3: Full claim evaluation
    const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(claims, resolved.text);

    // Build score array from evaluation results
    const claimScores = claims.map((c) => ({
      category: c.category as never,
      score: scores.get(c.claimId) ?? 50,
    }));

    const aggregate = this.deps.scoreAggregator.aggregate(claimScores);

    // Store verification with structural analysis (includes MiCA data)
    const tokens = this.deps.costTracker.getTotalTokens();
    await this.deps.verificationsRepo.create({
      whitepaperId: newWp.id,
      structuralScore,
      confidenceScore: aggregate.confidenceScore,
      hypeTechRatio,
      verdict: aggregate.verdict,
      totalClaims: claims.length,
      verifiedClaims: evaluations.length,
      llmTokensUsed: tokens.input + tokens.output,
      computeCostUsd: this.deps.costTracker.getTotalCostUsd(),
      focusAreaScores: aggregate.focusAreaScores,
      structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
    });

    return this.deps.reportGenerator.generateFullVerification(
      {
        structuralScore,
        confidenceScore: aggregate.confidenceScore,
        hypeTechRatio,
        verdict: aggregate.verdict,
        focusAreaScores: aggregate.focusAreaScores,
        totalClaims: claims.length,
        verifiedClaims: evaluations.length,
        llmTokensUsed: tokens.input + tokens.output,
        computeCostUsd: this.deps.costTracker.getTotalCostUsd(),
      },
      claims,
      evaluations,
      newWp as never,
      scores,
      analysis,
    );
  }

  private async handleDailyBriefing(_input: Record<string, unknown>) {
    const batch = await this.deps.verificationsRepo.getLatestDailyBatch();
    if (batch.length === 0) {
      return this.deps.reportGenerator.generateDailyBriefing([]);
    }

    const reports = [];
    for (const v of batch) {
      const wp = await this.deps.whitepaperRepo.findById(v.whitepaperId);
      if (!wp) continue;
      const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
      const analysis = this.extractStructuralAnalysis(v);

      reports.push(
        this.deps.reportGenerator.generateFullVerification(
          this.verificationRowToResult(v),
          claims.map((c) => ({
            claimId: c.id,
            category: c.category as never,
            claimText: c.claimText,
            statedEvidence: c.statedEvidence,
            mathematicalProofPresent: c.mathProofPresent,
            sourceSection: c.sourceSection,
            regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
          })),
          [],
          wp as never,
          undefined,
          analysis,
        ),
      );
    }

    return this.deps.reportGenerator.generateDailyBriefing(reports);
  }

  private async findWhitepaper(input: Record<string, unknown>) {
    const projectName = input.project_name as string | undefined;
    const tokenAddress = input.token_address as string | undefined;

    if (projectName) {
      const results = await this.deps.whitepaperRepo.findByProjectName(projectName);
      if (results.length > 0) return results[0];
    }
    if (tokenAddress) {
      const results = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
      if (results.length > 0) return results[0];
    }
    return null;
  }

  private notInDatabase() {
    return {
      error: 'not_in_database',
      suggestion: 'Submit via verify_project_whitepaper ($2.00) to add this project.',
    };
  }

  private verificationRowToResult(v: Record<string, unknown>) {
    return {
      structuralScore: (v.structuralScore as number) ?? 0,
      confidenceScore: (v.confidenceScore as number) ?? 0,
      hypeTechRatio: (v.hypeTechRatio as number) ?? 0,
      verdict: ((v.verdict as string) ?? 'INSUFFICIENT_DATA') as Verdict,
      focusAreaScores: (v.focusAreaScores as Record<string, number>) ?? {},
      totalClaims: (v.totalClaims as number) ?? 0,
      verifiedClaims: (v.verifiedClaims as number) ?? 0,
      llmTokensUsed: (v.llmTokensUsed as number) ?? 0,
      computeCostUsd: (v.computeCostUsd as number) ?? 0,
    };
  }

  /**
   * Extract StructuralAnalysis (including MiCA data) from a DB verification row.
   * Falls back to empty defaults if structuralAnalysisJson is null.
   */
  private extractStructuralAnalysis(v: Record<string, unknown>): StructuralAnalysis {
    const raw = v.structuralAnalysisJson as Record<string, unknown> | null;
    if (!raw) {
      return {
        hasAbstract: false, hasMethodology: false, hasTokenomics: false, hasReferences: false,
        citationCount: 0, verifiedCitationRatio: 0,
        hasMath: false, mathDensityScore: 0,
        coherenceScore: 0,
        similarityTopMatch: null, similarityScore: 0,
        hasAuthors: false, hasDates: false,
        mica: {
          claimsMicaCompliance: 'NOT_MENTIONED',
          micaCompliant: 'NO',
          micaSummary: '',
          micaSectionsFound: [],
          micaSectionsMissing: [],
        },
      };
    }
    return raw as unknown as StructuralAnalysis;
  }
}
