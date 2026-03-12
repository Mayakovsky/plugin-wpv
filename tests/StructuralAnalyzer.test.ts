import { describe, it, expect, beforeEach } from 'vitest';
import { StructuralAnalyzer } from '../src/verification/StructuralAnalyzer';
import type { StructuralAnalysis } from '../src/types';

// ── Test fixtures ────────────────────────────

const WELL_STRUCTURED_WP = `
Abstract

This whitepaper presents a novel consensus protocol for decentralized finance.
Our methodology leverages Byzantine fault tolerance to achieve sub-second finality.

John Smith and Jane Doe
March 2026, v1.0

Methodology

We propose a proof-of-stake algorithm with validator selection based on the following theorem.
The consensus mechanism achieves O(n log n) throughput with guaranteed finality.

The mathematical foundation uses \\frac{a}{b} = \\sum_{i=1}^{n} x_i to prove convergence.
Additional proofs show ∑ ∀x ∈ S: f(x) ≥ 0.

Tokenomics

Token distribution follows a bonding curve: supply = f(price).
Total supply is 100,000,000 tokens with 40% allocated to staking rewards.

References

[1] Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. 10.1234/bitcoin.2008
[2] Buterin, V. Ethereum Whitepaper. https://ethereum.org/whitepaper
[3] Cosmos SDK. 10.5678/cosmos.2019
`;

const MEME_WP = `
🚀🚀🚀 MOONTOKEN 🚀🚀🚀

This is the most revolutionary project ever! 100x guaranteed!
We will be the next bitcoin. Generational wealth for all holders.
To the moon! Lambo incoming! Game-changing disruptive technology!
Risk-free passive income forever!

Buy now or regret forever.
`;

const HYPE_HEAVY = `
This revolutionary project is game-changing and disruptive.
Our moonshot technology guarantees 100x returns.
Generational wealth through passive income guaranteed.
Risk-free exponential growth to the moon.
Buy our token for the next bitcoin experience.
`;

const TECHNICAL_WP = `
Abstract

Our protocol implements a merkle tree-based validator consensus algorithm.
The proof demonstrates Byzantine fault tolerance with O(n) finality latency.

We use \\frac{\\partial L}{\\partial \\theta} for the function optimization.
The hash function provides throughput improvements via rollup compression.
Our zk-snark implementation achieves 10.1234/protocol.2026 verification.

Contract mapping with modifier patterns ensures shard consistency.
The zk-stark proof validates the protocol theorem.
`;

describe('StructuralAnalyzer', () => {
  let analyzer: StructuralAnalyzer;

  beforeEach(() => {
    analyzer = new StructuralAnalyzer();
  });

  // ── analyze() tests ───────────────────────

  describe('analyze', () => {
    it('well-structured WP: all sections, math, citations → complete analysis', async () => {
      const result = await analyzer.analyze(WELL_STRUCTURED_WP, 10);
      expect(result.hasAbstract).toBe(true);
      expect(result.hasMethodology).toBe(true);
      expect(result.hasTokenomics).toBe(true);
      expect(result.hasReferences).toBe(true);
      expect(result.hasMath).toBe(true);
      expect(result.citationCount).toBeGreaterThan(0);
    });

    it('meme WP: no sections, no math, no citations', async () => {
      const result = await analyzer.analyze(MEME_WP, 1);
      expect(result.hasAbstract).toBe(false);
      expect(result.hasMethodology).toBe(false);
      expect(result.hasReferences).toBe(false);
      expect(result.hasMath).toBe(false);
      expect(result.citationCount).toBe(0);
    });

    it('LaTeX detection: \\frac{a}{b} → hasMath true', async () => {
      const result = await analyzer.analyze('Some text with \\frac{a}{b} math', 1);
      expect(result.hasMath).toBe(true);
    });

    it('Unicode math detection: ∑ ∀ ≤ → hasMath true', async () => {
      const result = await analyzer.analyze('Formula: ∑ ∀x ≤ n', 1);
      expect(result.hasMath).toBe(true);
    });

    it('DOI reference extraction and count', async () => {
      const text = `
        Ref1: 10.1234/paper.2020
        Ref2: 10.5678/other.2021
        Ref3: 10.9999/third.2022
      `;
      const result = await analyzer.analyze(text, 1);
      expect(result.citationCount).toBeGreaterThanOrEqual(3);
    });

    it('empty text → minimal analysis, no crash', async () => {
      const result = await analyzer.analyze('', 0);
      expect(result.hasAbstract).toBe(false);
      expect(result.hasMath).toBe(false);
      expect(result.coherenceScore).toBe(0);
      expect(result.citationCount).toBe(0);
    });

    it('short text (< 100 chars) → coherenceScore 0', async () => {
      const result = await analyzer.analyze('Short text here.', 1);
      expect(result.coherenceScore).toBe(0);
    });

    it('detects authors and dates', async () => {
      const result = await analyzer.analyze(WELL_STRUCTURED_WP, 10);
      expect(result.hasAuthors).toBe(true);
      expect(result.hasDates).toBe(true);
    });

    it('detects tokenomics section', async () => {
      const text = 'Token distribution is described in the Tokenomics section. Total supply of 1M tokens.';
      const result = await analyzer.analyze(text, 1);
      expect(result.hasTokenomics).toBe(true);
    });

    it('detects token economics as tokenomics', async () => {
      const text = 'The token economics model defines supply and demand curves.';
      const result = await analyzer.analyze(text, 1);
      expect(result.hasTokenomics).toBe(true);
    });
  });

  // ── computeQuickFilterScore() tests ────────

  describe('computeQuickFilterScore', () => {
    it('score 5 for well-structured analysis', () => {
      const analysis: StructuralAnalysis = {
        hasAbstract: true,
        hasMethodology: true,
        hasTokenomics: true,
        hasReferences: true,
        citationCount: 5,
        verifiedCitationRatio: 0.6,
        hasMath: true,
        mathDensityScore: 0.3,
        coherenceScore: 0.8,
        similarityTopMatch: null,
        similarityScore: 0,
        hasAuthors: true,
        hasDates: true,
      };
      expect(analyzer.computeQuickFilterScore(analysis)).toBe(5);
    });

    it('score 1 for minimal analysis', () => {
      const analysis: StructuralAnalysis = {
        hasAbstract: false,
        hasMethodology: false,
        hasTokenomics: false,
        hasReferences: false,
        citationCount: 0,
        verifiedCitationRatio: 0,
        hasMath: false,
        mathDensityScore: 0,
        coherenceScore: 0.1,
        similarityTopMatch: null,
        similarityScore: 0,
        hasAuthors: false,
        hasDates: false,
      };
      expect(analyzer.computeQuickFilterScore(analysis)).toBe(1);
    });

    it('score 3 for partial analysis (math + sections)', () => {
      const analysis: StructuralAnalysis = {
        hasAbstract: true,
        hasMethodology: true,
        hasTokenomics: true,
        hasReferences: false,
        citationCount: 1,
        verifiedCitationRatio: 0,
        hasMath: true,
        mathDensityScore: 0.2,
        coherenceScore: 0.3,
        similarityTopMatch: null,
        similarityScore: 0,
        hasAuthors: false,
        hasDates: false,
      };
      expect(analyzer.computeQuickFilterScore(analysis)).toBe(3);
    });
  });

  // ── computeHypeTechRatio() tests ───────────

  describe('computeHypeTechRatio', () => {
    it('hype WP: marketing-heavy → ratio > 3.0', () => {
      const ratio = analyzer.computeHypeTechRatio(HYPE_HEAVY);
      expect(ratio).toBeGreaterThan(3.0);
    });

    it('technical WP: tech-heavy → ratio < 1.0', () => {
      const ratio = analyzer.computeHypeTechRatio(TECHNICAL_WP);
      expect(ratio).toBeLessThan(1.0);
    });

    it('no keywords → ratio 0', () => {
      const ratio = analyzer.computeHypeTechRatio('Hello world, just some regular text.');
      expect(ratio).toBe(0);
    });

    it('only tech keywords → ratio 0', () => {
      const ratio = analyzer.computeHypeTechRatio('The algorithm uses a hash function in the protocol.');
      expect(ratio).toBe(0);
    });

    it('only hype keywords → ratio Infinity', () => {
      const ratio = analyzer.computeHypeTechRatio('Revolutionary moonshot guaranteed!');
      expect(ratio).toBe(Infinity);
    });
  });
});
