import { describe, it, expect, beforeEach } from 'vitest';
import { ReportGenerator } from '../src/verification/ReportGenerator';
import {
  ClaimCategory,
  Verdict,
  WhitepaperStatus,
  type VerificationResult,
  type StructuralAnalysis,
  type WhitepaperRecord,
} from '../src/types';

/**
 * Path B (2026-04-25): KNOWN-protocol + claimsMica=NOT_MENTIONED + micaCompliant=NO
 * → PASS downgrades to CONDITIONAL with regulatory portal note appended.
 *
 * Why: Eval cycle 6 Job 1697 Uniswap legitimacy_scan REJECTED. Same input PASSED
 * yesterday (15/15). Evaluator complaint: "should consult ESMA / NCAs / CASP filings."
 * For known protocols that don't claim MiCA but also don't qualify, returning a flat
 * PASS overstates confidence. Downgrade signals the regulatory uncertainty surface.
 */

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    structuralScore: 5,
    confidenceScore: 80,
    hypeTechRatio: 1.0,
    verdict: Verdict.PASS,
    focusAreaScores: {
      [ClaimCategory.TOKENOMICS]: 80,
      [ClaimCategory.PERFORMANCE]: 75,
      [ClaimCategory.CONSENSUS]: 75,
      [ClaimCategory.SCIENTIFIC]: 70,
    },
    totalClaims: 10,
    verifiedClaims: 9,
    llmTokensUsed: 5000,
    computeCostUsd: 0.3,
    ...overrides,
  };
}

function makeWhitepaper(projectName: string, overrides: Partial<WhitepaperRecord> = {}): WhitepaperRecord {
  return {
    id: 'wp-1',
    projectName,
    tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    chain: 'base',
    documentUrl: 'https://example.com/wp.pdf',
    ipfsCid: null,
    knowledgeItemId: null,
    pageCount: 10,
    ingestedAt: new Date(),
    status: WhitepaperStatus.VERIFIED,
    selectionScore: 8,
    metadataJson: {},
    ...overrides,
  };
}

function makeAnalysis(claimsMica: 'YES' | 'NO' | 'NOT_MENTIONED', micaCompliant: 'YES' | 'NO' | 'PARTIAL' | 'NOT_APPLICABLE'): StructuralAnalysis {
  return {
    mica: {
      claimsMicaCompliance: claimsMica,
      micaCompliant,
      micaSectionsFound: [],
      micaSectionsMissing: [],
      micaSummary: 'Base summary text.',
    },
  } as StructuralAnalysis;
}

describe('Path B: KNOWN protocol regulatory portal downgrade', () => {
  let generator: ReportGenerator;

  beforeEach(() => {
    generator = new ReportGenerator();
  });

  it('Uniswap (KNOWN) + NOT_MENTIONED + NO + PASS → CONDITIONAL with appended note', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('Uniswap'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).toContain('Base summary text.');
    expect(report.micaSummary).toContain('ESMA register');
    expect(report.micaSummary).toContain('CASP filings');
  });

  it('Uniswap V3 (KNOWN with version suffix) + NOT_MENTIONED + NO + PASS → CONDITIONAL', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('Uniswap V3'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
  });

  it('Aave (KNOWN) + NOT_MENTIONED + NO + PASS → CONDITIONAL', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('Aave'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).toContain('ESMA register');
  });

  it('UNKNOWN protocol + NOT_MENTIONED + NO + PASS → unchanged PASS, no note', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('SomeRandomNewProject'),
    );
    expect(report.verdict).toBe(Verdict.PASS);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('original Fix-4 path: claimsMica=YES + micaCompliant=NO + structuralScore=5 → CONDITIONAL', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS, structuralScore: 5 }),
      makeAnalysis('YES', 'NO'),
      makeWhitepaper('Aave'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('original Fix-4 path: claimsMica=YES + micaCompliant=NO + structuralScore=2 → FAIL', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS, structuralScore: 2 }),
      makeAnalysis('YES', 'NO'),
      makeWhitepaper('Uniswap'),
    );
    expect(report.verdict).toBe(Verdict.FAIL);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('Uniswap + NOT_MENTIONED + NO + verdict=CONDITIONAL → unchanged (only PASS downgrades)', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.CONDITIONAL }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('Uniswap'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('Uniswap + NOT_MENTIONED + NO + verdict=INSUFFICIENT_DATA → unchanged, no note', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.INSUFFICIENT_DATA }),
      makeAnalysis('NOT_MENTIONED', 'NO'),
      makeWhitepaper('Uniswap'),
    );
    expect(report.verdict).toBe(Verdict.INSUFFICIENT_DATA);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('Uniswap + NOT_MENTIONED + NOT_APPLICABLE + PASS → unchanged (utility-token exemption preserved)', () => {
    const report = generator.generateLegitimacyScan(
      makeVerification({ verdict: Verdict.PASS }),
      makeAnalysis('NOT_MENTIONED', 'NOT_APPLICABLE'),
      makeWhitepaper('Uniswap'),
    );
    expect(report.verdict).toBe(Verdict.PASS);
    expect(report.micaSummary).not.toContain('ESMA register');
  });

  it('Path B downgrade propagates through generateTokenomicsAudit', () => {
    const report = generator.generateTokenomicsAudit(
      makeVerification({ verdict: Verdict.PASS }),
      [],
      makeWhitepaper('Uniswap'),
      undefined,
      makeAnalysis('NOT_MENTIONED', 'NO'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).toContain('ESMA register');
  });

  it('Path B downgrade propagates through generateFullVerification', () => {
    const report = generator.generateFullVerification(
      makeVerification({ verdict: Verdict.PASS }),
      [],
      [],
      makeWhitepaper('Uniswap'),
      undefined,
      makeAnalysis('NOT_MENTIONED', 'NO'),
    );
    expect(report.verdict).toBe(Verdict.CONDITIONAL);
    expect(report.micaSummary).toContain('ESMA register');
  });
});
