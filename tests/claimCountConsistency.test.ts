import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../src/verification/ReportGenerator';
import { ClaimCategory, Verdict, type VerificationResult, type StructuralAnalysis, type WhitepaperRecord, type ExtractedClaim } from '../src/types';

/**
 * Fix 6 (2026-04-24): claim-count consistency in ReportGenerator.
 *
 * Regression: eval Job 1304 delivered `claimCount: 11` + `logicSummary: "11 claims
 * extracted..."` while the `claims[]` array had 15 entries. Evaluator flagged:
 * "Ensure that the claim count in the logicSummary field accurately matches
 * the number of objects in the claims array."
 *
 * Root cause: generateTokenomicsAudit set claimCount from verification.totalClaims
 * (stored scalar, potentially stale) while claims[] came from the live claims
 * repo query. generateLogicSummary also used verification.totalClaims for the
 * text.
 *
 * Fix: both claimCount and logicSummary derive from claims.length.
 */

const emptyAnalysis: StructuralAnalysis = {
  hasAbstract: true, hasMethodology: true, hasTokenomics: true, hasReferences: true,
  citationCount: 0, verifiedCitationRatio: 0,
  hasMath: true, mathDensityScore: 0,
  coherenceScore: 0,
  similarityTopMatch: null, similarityScore: 0,
  hasAuthors: true, hasDates: true,
  mica: {
    claimsMicaCompliance: 'NOT_MENTIONED',
    micaCompliant: 'NO',
    micaSummary: '',
    micaSectionsFound: [],
    micaSectionsMissing: [],
  },
};

const wp: WhitepaperRecord = {
  id: 'wp-1',
  projectName: 'Aave V3',
  tokenAddress: null,
  documentUrl: 'https://github.com/aave/whitepaper.pdf',
};

function claim(i: number, cat: ClaimCategory = ClaimCategory.TOKENOMICS): ExtractedClaim {
  return {
    claimId: `c-${i}`, category: cat,
    claimText: `claim ${i}`, statedEvidence: '', mathematicalProofPresent: false, sourceSection: '',
  };
}

describe('Fix 6: claim-count consistency in ReportGenerator', () => {
  const gen = new ReportGenerator();

  it('claimCount reflects claims.length, not verification.totalClaims', () => {
    // Reproduce Job 1304: cached verification.totalClaims=11, claims array has 15 entries
    const verification: VerificationResult = {
      structuralScore: 4, confidenceScore: 63, hypeTechRatio: 0,
      verdict: Verdict.CONDITIONAL,
      totalClaims: 11,    // stale scalar
      verifiedClaims: 11, // stale scalar
      llmTokensUsed: 27973, computeCostUsd: 0.117003,
      focusAreaScores: {},
    };
    const claims = Array.from({ length: 15 }, (_, i) => claim(i));

    const report = gen.generateTokenomicsAudit(verification, claims, wp, undefined, emptyAnalysis);

    // Field must match actual claims[] length
    expect(report.claimCount).toBe(15);
    expect(report.claims).toHaveLength(15);
    // logicSummary must also reflect 15
    expect(report.logicSummary).toMatch(/15 claims extracted/);
  });

  it('logicSummary caps verified count at claims.length (honest truth)', () => {
    // Cached verifiedClaims=11, array has 15
    const verification: VerificationResult = {
      structuralScore: 4, confidenceScore: 63, hypeTechRatio: 0,
      verdict: Verdict.CONDITIONAL,
      totalClaims: 11, verifiedClaims: 11,
      llmTokensUsed: 0, computeCostUsd: 0,
      focusAreaScores: {},
    };
    const claims = Array.from({ length: 15 }, (_, i) => claim(i));

    const report = gen.generateTokenomicsAudit(verification, claims, wp, undefined, emptyAnalysis);

    // "11/15 claims verified" — honest: stored verifiedClaims=11, extracted=15
    expect(report.logicSummary).toMatch(/11\/15 claims verified/);
  });

  it('when counts match (normal case) output unchanged', () => {
    const verification: VerificationResult = {
      structuralScore: 5, confidenceScore: 74, hypeTechRatio: 0,
      verdict: Verdict.PASS,
      totalClaims: 10, verifiedClaims: 10,
      llmTokensUsed: 0, computeCostUsd: 0,
      focusAreaScores: {},
    };
    const claims = Array.from({ length: 10 }, (_, i) => claim(i));

    const report = gen.generateTokenomicsAudit(verification, claims, wp, undefined, emptyAnalysis);

    expect(report.claimCount).toBe(10);
    expect(report.logicSummary).toMatch(/10 claims extracted/);
    expect(report.logicSummary).toMatch(/10\/10 claims verified/);
  });

  it('Fix 6 also applied via generateFullVerification (extends Tokenomics)', () => {
    const verification: VerificationResult = {
      structuralScore: 4, confidenceScore: 63, hypeTechRatio: 0,
      verdict: Verdict.CONDITIONAL,
      totalClaims: 11, verifiedClaims: 11,
      llmTokensUsed: 0, computeCostUsd: 0,
      focusAreaScores: { TOKENOMICS: 70, PERFORMANCE: 70 },
    };
    const claims = Array.from({ length: 15 }, (_, i) => claim(i));

    const report = gen.generateFullVerification(verification, claims, [], wp, undefined, emptyAnalysis);

    expect(report.claimCount).toBe(15);
    expect(report.claims).toHaveLength(15);
    expect(report.logicSummary).toMatch(/15 claims extracted/);
  });

  it('category count in logicSummary reflects distinct categories in claims', () => {
    const verification: VerificationResult = {
      structuralScore: 3, confidenceScore: 60, hypeTechRatio: 0,
      verdict: Verdict.CONDITIONAL,
      totalClaims: 4, verifiedClaims: 4,
      llmTokensUsed: 0, computeCostUsd: 0,
      focusAreaScores: {},
    };
    // 4 claims across 4 distinct categories
    const claims = [
      claim(0, ClaimCategory.TOKENOMICS),
      claim(1, ClaimCategory.PERFORMANCE),
      claim(2, ClaimCategory.CONSENSUS),
      claim(3, ClaimCategory.SCIENTIFIC),
    ];

    const report = gen.generateTokenomicsAudit(verification, claims, wp, undefined, emptyAnalysis);

    expect(report.logicSummary).toMatch(/4 claims extracted across 4 categories/);
  });
});
