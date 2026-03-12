import { describe, it, expect, beforeEach } from 'vitest';
import { ReportGenerator } from '../src/verification/ReportGenerator';
import {
  ClaimCategory,
  Verdict,
  WhitepaperStatus,
  type VerificationResult,
  type StructuralAnalysis,
  type WhitepaperRecord,
  type ExtractedClaim,
  type ClaimEvaluation,
  MathValidity,
  Plausibility,
  Originality,
  Consistency,
} from '../src/types';

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    structuralScore: 4,
    confidenceScore: 75,
    hypeTechRatio: 1.2,
    verdict: Verdict.PASS,
    focusAreaScores: {
      [ClaimCategory.TOKENOMICS]: 80,
      [ClaimCategory.PERFORMANCE]: 70,
      [ClaimCategory.CONSENSUS]: 75,
      [ClaimCategory.SCIENTIFIC]: 60,
    },
    totalClaims: 8,
    verifiedClaims: 6,
    llmTokensUsed: 5000,
    computeCostUsd: 0.35,
    ...overrides,
  };
}

function makeWhitepaper(overrides: Partial<WhitepaperRecord> = {}): WhitepaperRecord {
  return {
    id: 'wp-1',
    projectName: 'TestProject',
    tokenAddress: '0xabc',
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

function makeClaims(): ExtractedClaim[] {
  return [
    {
      claimId: 'c1',
      category: ClaimCategory.TOKENOMICS,
      claimText: 'APY of 12%',
      statedEvidence: 'Section 4',
      mathematicalProofPresent: true,
      sourceSection: 'Tokenomics',
    },
    {
      claimId: 'c2',
      category: ClaimCategory.PERFORMANCE,
      claimText: 'TPS of 5000',
      statedEvidence: 'Benchmarks',
      mathematicalProofPresent: false,
      sourceSection: 'Performance',
    },
  ];
}

function makeEvaluations(): ClaimEvaluation[] {
  return [
    {
      claimId: 'c1',
      mathValidity: MathValidity.VALID,
      plausibility: Plausibility.HIGH,
      originality: Originality.NOVEL,
      consistency: Consistency.CONSISTENT,
    },
    {
      claimId: 'c2',
      benchmarkDelta: 0,
      plausibility: Plausibility.HIGH,
      originality: Originality.DERIVATIVE,
      consistency: Consistency.CONSISTENT,
    },
  ];
}

describe('ReportGenerator', () => {
  let generator: ReportGenerator;

  beforeEach(() => {
    generator = new ReportGenerator();
  });

  describe('generateLegitimacyScan', () => {
    it('returns all required fields', () => {
      const report = generator.generateLegitimacyScan(
        makeVerification(),
        {} as StructuralAnalysis,
        makeWhitepaper(),
      );
      expect(report.projectName).toBe('TestProject');
      expect(report.tokenAddress).toBe('0xabc');
      expect(report.structuralScore).toBe(4);
      expect(report.verdict).toBe(Verdict.PASS);
      expect(report.hypeTechRatio).toBe(1.2);
      expect(report.claimCount).toBe(8);
      expect(report.generatedAt).toBeDefined();
    });

    it('generatedAt is ISO format', () => {
      const report = generator.generateLegitimacyScan(
        makeVerification(),
        {} as StructuralAnalysis,
        makeWhitepaper(),
      );
      expect(() => new Date(report.generatedAt)).not.toThrow();
      expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('generateTokenomicsAudit', () => {
    it('contains all LegitimacyScan fields', () => {
      const report = generator.generateTokenomicsAudit(
        makeVerification(),
        makeClaims(),
        makeWhitepaper(),
      );
      // LegitimacyScan fields
      expect(report.projectName).toBeDefined();
      expect(report.structuralScore).toBeDefined();
      expect(report.verdict).toBeDefined();
      expect(report.hypeTechRatio).toBeDefined();
      expect(report.claimCount).toBeDefined();
      expect(report.generatedAt).toBeDefined();
      // TokenomicsAudit-specific fields
      expect(report.claims).toHaveLength(2);
      expect(report.logicSummary).toBeDefined();
    });
  });

  describe('generateFullVerification', () => {
    it('contains all TokenomicsAudit fields', () => {
      const report = generator.generateFullVerification(
        makeVerification(),
        makeClaims(),
        makeEvaluations(),
        makeWhitepaper(),
      );
      // TokenomicsAudit fields
      expect(report.claims).toHaveLength(2);
      expect(report.logicSummary).toBeDefined();
      // FullVerification-specific fields
      expect(report.confidenceScore).toBe(75);
      expect(report.evaluations).toHaveLength(2);
      expect(report.focusAreaScores).toBeDefined();
      expect(report.llmTokensUsed).toBe(5000);
      expect(report.computeCostUsd).toBe(0.35);
    });

    it('includes claim scores when provided', () => {
      const scores = new Map([['c1', 85], ['c2', 65]]);
      const report = generator.generateFullVerification(
        makeVerification(),
        makeClaims(),
        makeEvaluations(),
        makeWhitepaper(),
        scores,
      );
      expect(report.claimScores['c1']).toBe(85);
      expect(report.claimScores['c2']).toBe(65);
    });
  });

  describe('generateDailyBriefing', () => {
    it('aggregates multiple reports correctly', () => {
      const reports = [
        generator.generateFullVerification(makeVerification(), makeClaims(), makeEvaluations(), makeWhitepaper()),
        generator.generateFullVerification(
          makeVerification({ verdict: Verdict.FAIL }),
          makeClaims(),
          makeEvaluations(),
          makeWhitepaper({ projectName: 'FailedProject' }),
        ),
      ];
      const briefing = generator.generateDailyBriefing(reports);
      expect(briefing.totalVerified).toBe(2);
      expect(briefing.whitepapers).toHaveLength(2);
      expect(briefing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('empty report array → valid DailyBriefing with totalVerified: 0', () => {
      const briefing = generator.generateDailyBriefing([]);
      expect(briefing.totalVerified).toBe(0);
      expect(briefing.whitepapers).toEqual([]);
      expect(briefing.date).toBeDefined();
    });

    it('includes hype warning in logic summary for high ratio', () => {
      const report = generator.generateTokenomicsAudit(
        makeVerification({ hypeTechRatio: 4.5 }),
        makeClaims(),
        makeWhitepaper(),
      );
      expect(report.logicSummary).toContain('hype');
    });
  });
});
