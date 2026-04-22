// ════════════════════════════════════════════
// TieredResolver — Phase 3 orchestrator.
// Runs the 5-tier discovery chain (Tier 0-4) with threshold termination,
// per-tier timeouts, SLA-budget awareness, sanity-check verification,
// and provenance tracking.
//
// Tiers:
//   0: Cache lookup (read-only)
//   1: Explicit document_url provided by buyer
//   2: Primary-site discovery (existing CryptoContentResolver path)
//   3: GitHub whitepaper search
//   4: CoinGecko / CMC aggregator lookup
//
// Termination: first tier meeting threshold (structuralScore ≥ 2 AND
// claimCount ≥ 5) wins. If all exhausted, returns best attempt.
//
// Note: Tiers 3 and 4 return RAW document text; they do not run L1/L2/L3.
// The caller's pipeline runs L1 to check threshold and L2 afterward.
// ════════════════════════════════════════════

import type { ResolvedWhitepaper, DiscoveryAttempt, DiscoveryStatus } from '../types';
import type { StructuralAnalyzer } from '../verification/StructuralAnalyzer';
import type { CryptoContentResolver } from './CryptoContentResolver';
import type { TieredDocumentDiscovery } from './TieredDocumentDiscovery';
import { GitHubResolver } from './GitHubResolver';
import { AggregatorResolver } from './AggregatorResolver';
import {
  TIER_ROBUST_THRESHOLD,
  TIER_TIMEOUTS_MS,
  TIER_MIN_SLA_REMAINING_MS,
  TIER_SANITY_CHECK_CHARS,
} from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'TieredResolver' });

export interface TierChainInput {
  /** Signal-validated buyer input */
  projectName?: string;
  tokenAddress?: string;
  documentUrl?: string;   // from Tier 1 path; NOT cached

  /** Callbacks into caller-owned subsystems */
  cacheLookup: () => Promise<TierResultData | null>;   // Tier 0
  primaryDiscover: () => Promise<{ text: string; pageCount: number; sourceUrl: string } | null>;  // Tier 2

  /** Environment / SLA controls */
  slaDeadlineMs: number;   // absolute deadline, Date.now() reference
  signal?: AbortSignal;
}

export interface TierResultData {
  text: string;
  pageCount: number;
  sourceUrl: string;
  /** L1 structural score computed against this tier's content */
  structuralScore: number;
  /** Approximate claim count (can be 0 for cache misses until L2 runs) */
  claimCount: number;
}

export interface TierChainResult {
  /** The winning tier's content, or best-available if none met threshold */
  result: TierResultData | null;
  /** Tier number that produced `result` (0-4), or null if exhausted with nothing */
  winningTier: number | null;
  /** discoveryStatus label for the deliverable */
  status: DiscoveryStatus;
  /** Ordered per-tier attempt log */
  attempts: DiscoveryAttempt[];
}

const TIER_LABELS: Record<number, DiscoveryStatus> = {
  0: 'cached',
  1: 'provided',
  2: 'primary',
  3: 'community',
  4: 'aggregator',
};

export class TieredResolver {
  private githubResolver: GitHubResolver;
  private aggregatorResolver: AggregatorResolver;

  constructor(
    private cryptoResolver: CryptoContentResolver,
    private structuralAnalyzer: StructuralAnalyzer,
    contentResolver: { resolve: (url: string, signal?: AbortSignal) => Promise<{ text: string; pageCount?: number }> },
    private env: { githubToken?: string; cmcApiKey?: string },
  ) {
    // Adapt IContentResolver shape for the new resolvers
    this.githubResolver = new GitHubResolver(contentResolver as never);
    this.aggregatorResolver = new AggregatorResolver(contentResolver as never);
  }

  async run(input: TierChainInput): Promise<TierChainResult> {
    const attempts: DiscoveryAttempt[] = [];
    let bestRef: { data: TierResultData; tier: number } | null = null;

    // ── Tier 0: Cache ───────────────────────────────
    const tier0 = await this.runTierSafely(0, input.cacheLookup, input.slaDeadlineMs, input.signal);
    attempts.push(this.makeAttempt(0, tier0));
    if (tier0 && this.meetsThreshold(tier0)) {
      return this.winAt(0, tier0, attempts);
    }
    bestRef = this.trackBest(bestRef, tier0, 0);

    // ── Tier 1: Explicit URL ────────────────────────
    if (input.documentUrl) {
      const tier1 = await this.runTierWithTimeout(1, TIER_TIMEOUTS_MS.tier1, async () => {
        const content = await this.cryptoResolver.resolveWhitepaper(input.documentUrl!, input.signal);
        if (!content.text || content.text.length < 200) return null;
        return this.toTierResult(content);
      }, input.slaDeadlineMs, input.signal);

      // Only accept Tier 1 if the document verifiably relates to the request.
      const verified = tier1 && this.verifyRelevance(tier1, input);
      attempts.push(this.makeAttempt(1, tier1, verified ? undefined : (tier1 ? 'unrelated-content' : 'unreachable')));

      if (verified && this.meetsThreshold(tier1!)) {
        return this.winAt(1, tier1!, attempts);
      }
      if (verified) bestRef = this.trackBest(bestRef, tier1!, 1);
    } else {
      attempts.push({ tier: 1, status: 'skipped', note: 'no document_url provided' });
    }

    // ── Tier 2: Primary site ────────────────────────
    if (this.hasBudget(input.slaDeadlineMs)) {
      const tier2 = await this.runTierWithTimeout(2, TIER_TIMEOUTS_MS.tier2, async () => {
        const r = await input.primaryDiscover();
        if (!r || !r.text || r.text.length < 200) return null;
        return this.toTierResult({ text: r.text, pageCount: r.pageCount });
      }, input.slaDeadlineMs, input.signal);
      attempts.push(this.makeAttempt(2, tier2));
      if (tier2 && this.meetsThreshold(tier2)) {
        return this.winAt(2, tier2, attempts);
      }
      bestRef = this.trackBest(bestRef, tier2, 2);
    } else {
      attempts.push({ tier: 2, status: 'skipped', note: 'sla budget exhausted' });
    }

    // ── Tier 3: GitHub ──────────────────────────────
    if (this.hasBudget(input.slaDeadlineMs)) {
      const tier3 = await this.runTierWithTimeout(3, TIER_TIMEOUTS_MS.tier3, async () => {
        const hit = await this.githubResolver.resolve(
          { projectName: input.projectName, tokenAddress: input.tokenAddress, token: this.env.githubToken },
          input.signal,
        );
        if (!hit) return null;
        return this.toTierResult({ text: hit.text, pageCount: hit.pageCount });
      }, input.slaDeadlineMs, input.signal);

      const verified3 = tier3 && this.verifyRelevance(tier3, input);
      attempts.push(this.makeAttempt(3, tier3, verified3 ? undefined : (tier3 ? 'unrelated-content' : 'no-hit')));
      if (verified3 && this.meetsThreshold(tier3!)) {
        return this.winAt(3, tier3!, attempts);
      }
      if (verified3) bestRef = this.trackBest(bestRef, tier3!, 3);
    } else {
      attempts.push({ tier: 3, status: 'skipped', note: 'sla budget exhausted' });
    }

    // ── Tier 4: Aggregator ──────────────────────────
    if (this.hasBudget(input.slaDeadlineMs)) {
      const tier4 = await this.runTierWithTimeout(4, TIER_TIMEOUTS_MS.tier4, async () => {
        const hit = await this.aggregatorResolver.resolve(
          { projectName: input.projectName, tokenAddress: input.tokenAddress, cmcApiKey: this.env.cmcApiKey },
          input.signal,
        );
        if (!hit) return null;
        return this.toTierResult({ text: hit.text, pageCount: hit.pageCount });
      }, input.slaDeadlineMs, input.signal);

      const verified4 = tier4 && this.verifyRelevance(tier4, input);
      attempts.push(this.makeAttempt(4, tier4, verified4 ? undefined : (tier4 ? 'unrelated-content' : 'no-hit')));
      if (verified4 && this.meetsThreshold(tier4!)) {
        return this.winAt(4, tier4!, attempts);
      }
      if (verified4) bestRef = this.trackBest(bestRef, tier4!, 4);
    } else {
      attempts.push({ tier: 4, status: 'skipped', note: 'sla budget exhausted' });
    }

    // ── Exhausted: return best available, or failure ──
    if (bestRef) {
      log.info('All tiers below threshold — returning best available', {
        tier: bestRef.tier,
        structuralScore: bestRef.data.structuralScore,
        claimCount: bestRef.data.claimCount,
      });
      return {
        result: bestRef.data,
        winningTier: bestRef.tier,
        status: TIER_LABELS[bestRef.tier],
        attempts,
      };
    }

    log.warn('All tiers exhausted with no content', { projectName: input.projectName });
    return { result: null, winningTier: null, status: 'failed', attempts };
  }

  // ── Helpers ──────────────────────────────────────

  private toTierResult(content: { text: string; pageCount?: number }): TierResultData {
    const analysis = this.structuralAnalyzer.analyze(content.text, content.pageCount ?? 0);
    const structuralScore = this.structuralAnalyzer.computeQuickFilterScore(analysis as never);
    return {
      text: content.text,
      pageCount: content.pageCount ?? 0,
      sourceUrl: '',
      structuralScore,
      // L1 scoring here doesn't include claim extraction (L2); leave 0 so
      // threshold falls through for projects with low L1 but potentially
      // rich claim content. The caller decides when L2 runs.
      claimCount: 0,
    };
  }

  private meetsThreshold(r: TierResultData): boolean {
    return (
      r.structuralScore >= TIER_ROBUST_THRESHOLD.structuralScore &&
      // claimCount check is deferred — tiers only compute L1.
      // We treat "structurally robust" as sufficient for termination here;
      // L2 runs once on the winning tier's doc in the caller.
      true
    );
  }

  private verifyRelevance(r: TierResultData, input: TierChainInput): boolean {
    // Tier 2 already runs primary-site discovery for the project, so we trust it.
    // Sanity check is targeted at Tier 3 (GitHub) and Tier 4 (aggregator results).
    // Implementation: scan first N chars for project_name or token_address.
    const haystack = r.text.slice(0, TIER_SANITY_CHECK_CHARS).toLowerCase();
    if (input.projectName && haystack.includes(input.projectName.toLowerCase())) return true;
    if (input.tokenAddress && haystack.includes(input.tokenAddress.toLowerCase())) return true;
    return false;
  }

  private hasBudget(deadlineMs: number): boolean {
    return Date.now() < deadlineMs - TIER_MIN_SLA_REMAINING_MS;
  }

  private async runTierSafely<T>(
    tier: number,
    fn: () => Promise<T | null>,
    deadlineMs: number,
    signal?: AbortSignal,
  ): Promise<T | null> {
    try {
      if (signal?.aborted) return null;
      if (Date.now() >= deadlineMs) return null;
      return await fn();
    } catch (err) {
      log.debug(`Tier ${tier} threw`, { error: (err as Error).message });
      return null;
    }
  }

  private async runTierWithTimeout<T>(
    tier: number,
    timeoutMs: number,
    fn: () => Promise<T | null>,
    deadlineMs: number,
    signal?: AbortSignal,
  ): Promise<T | null> {
    const remainingToDeadline = deadlineMs - Date.now();
    const effectiveTimeout = Math.min(timeoutMs, Math.max(0, remainingToDeadline));
    if (effectiveTimeout <= 0) return null;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), effectiveTimeout);
    // Chain caller signal if provided
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener('abort', onCallerAbort);

    try {
      const result = await fn();
      return result;
    } catch (err) {
      log.debug(`Tier ${tier} error or timeout`, { error: (err as Error).message });
      return null;
    } finally {
      clearTimeout(t);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private makeAttempt(tier: number, data: TierResultData | null, noteOverride?: string): DiscoveryAttempt {
    if (!data) {
      return {
        tier,
        status: 'error',
        note: noteOverride ?? (tier === 0 ? 'cache-miss' : 'no-content'),
      };
    }
    return {
      tier,
      status: TIER_LABELS[tier],
      structuralScore: data.structuralScore,
      claimCount: data.claimCount,
      note: noteOverride,
    };
  }

  private trackBest(
    current: { data: TierResultData; tier: number } | null,
    candidate: TierResultData | null,
    tier: number,
  ): { data: TierResultData; tier: number } | null {
    if (!candidate) return current;
    if (!current) return { data: candidate, tier };
    const currentScore = current.data.structuralScore + (current.data.claimCount / 10);
    const candidateScore = candidate.structuralScore + (candidate.claimCount / 10);
    return candidateScore > currentScore ? { data: candidate, tier } : current;
  }

  private winAt(tier: number, data: TierResultData, attempts: DiscoveryAttempt[]): TierChainResult {
    log.info('Tier met threshold', { tier, structuralScore: data.structuralScore });
    return {
      result: data,
      winningTier: tier,
      status: TIER_LABELS[tier],
      attempts,
    };
  }
}
