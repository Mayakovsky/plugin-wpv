import { describe, it, expect } from 'vitest';
import { WhitepaperSelector } from '../src/discovery/WhitepaperSelector';
import type { SelectionSignal, ProjectCandidate, ProjectMetadata } from '../src/types';

function makeSignals(overrides: Partial<SelectionSignal> = {}): SelectionSignal {
  return {
    hasLinkedPdf: true,
    documentLengthOk: true,
    technicalClaimsDetected: true,
    marketTraction: true,
    notAFork: true,
    isFresh: true,
    ...overrides,
  };
}

const defaultMetadata: ProjectMetadata = {
  agentName: 'Test',
  entityId: null,
  description: null,
  linkedUrls: [],
  category: null,
  graduationStatus: null,
};

function makeCandidate(signals: Partial<SelectionSignal> = {}, tokenAddress = '0xabc'): ProjectCandidate {
  return {
    tokenAddress,
    metadata: defaultMetadata,
    documentUrl: 'https://example.com/wp.pdf',
    signals: makeSignals(signals),
  };
}

describe('WhitepaperSelector', () => {
  const selector = new WhitepaperSelector();

  describe('scoreProject', () => {
    it('all signals true → score 10', () => {
      const score = selector.scoreProject(makeSignals());
      expect(score).toBe(10);
    });

    it('missing PDF → score 0 (auto-reject regardless)', () => {
      const score = selector.scoreProject(makeSignals({ hasLinkedPdf: false }));
      expect(score).toBe(0);
    });

    it('missing PDF with all other signals true → still 0', () => {
      const score = selector.scoreProject(makeSignals({
        hasLinkedPdf: false,
        documentLengthOk: true,
        technicalClaimsDetected: true,
        marketTraction: true,
        notAFork: true,
        isFresh: true,
      }));
      expect(score).toBe(0);
    });

    it('only hasLinkedPdf true → score 3', () => {
      const score = selector.scoreProject(makeSignals({
        hasLinkedPdf: true,
        documentLengthOk: false,
        technicalClaimsDetected: false,
        marketTraction: false,
        notAFork: false,
        isFresh: false,
      }));
      expect(score).toBe(3);
    });

    it('PDF + doc length + technical → score 7', () => {
      const score = selector.scoreProject(makeSignals({
        marketTraction: false,
        notAFork: false,
        isFresh: false,
      }));
      expect(score).toBe(7);
    });
  });

  describe('filterProjects', () => {
    it('score 5 filtered out, score 6 passes (boundary)', () => {
      const candidates = [
        makeCandidate({ technicalClaimsDetected: false, marketTraction: false, notAFork: false, isFresh: false }, '0x_5'), // 3+2=5
        makeCandidate({ marketTraction: false, notAFork: false, isFresh: false }, '0x_7'), // 3+2+2=7
      ];

      const result = selector.filterProjects(candidates);
      expect(result).toHaveLength(1);
      expect(result[0].tokenAddress).toBe('0x_7');
    });

    it('threshold is configurable', () => {
      const lowThreshold = new WhitepaperSelector(3);
      const candidates = [
        makeCandidate({
          documentLengthOk: false,
          technicalClaimsDetected: false,
          marketTraction: false,
          notAFork: false,
          isFresh: false,
        }), // score 3
      ];

      const result = lowThreshold.filterProjects(candidates);
      expect(result).toHaveLength(1);
    });

    it('multiple projects sorted by score descending', () => {
      const candidates = [
        makeCandidate({ isFresh: false, notAFork: false }, '0x_8'), // score 8
        makeCandidate({}, '0x_10'), // score 10
        makeCandidate({ marketTraction: false, isFresh: false, notAFork: false }, '0x_7'), // score 7
      ];

      const result = selector.filterProjects(candidates);
      expect(result).toHaveLength(3);
      expect(result[0].tokenAddress).toBe('0x_10');
      expect(result[1].tokenAddress).toBe('0x_8');
      expect(result[2].tokenAddress).toBe('0x_7');
    });

    it('empty candidate list → empty array', () => {
      const result = selector.filterProjects([]);
      expect(result).toEqual([]);
    });

    it('all below threshold → empty array', () => {
      const candidates = [
        makeCandidate({
          documentLengthOk: false,
          technicalClaimsDetected: false,
          marketTraction: false,
          notAFork: false,
          isFresh: false,
        }), // score 3
      ];

      const result = selector.filterProjects(candidates);
      expect(result).toEqual([]);
    });

    it('no PDF candidates all filtered out', () => {
      const candidates = [
        makeCandidate({ hasLinkedPdf: false }),
        makeCandidate({ hasLinkedPdf: false }),
      ];

      const result = selector.filterProjects(candidates);
      expect(result).toEqual([]);
    });

    it('exact threshold score passes', () => {
      // score exactly 6: PDF(3) + docLength(2) + marketTraction(1)
      const candidates = [
        makeCandidate({
          technicalClaimsDetected: false,
          notAFork: false,
          isFresh: false,
        }), // 3+2+1=6
      ];

      const result = selector.filterProjects(candidates);
      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(6);
    });
  });
});
