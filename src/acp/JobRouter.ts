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
import { CostTracker } from '../verification/CostTracker';
import type { CryptoContentResolver } from '../discovery/CryptoContentResolver';
import type { TieredDocumentDiscovery } from '../discovery/TieredDocumentDiscovery';
import type { GitHubResolver } from '../discovery/GitHubResolver';
import type { AggregatorResolver } from '../discovery/AggregatorResolver';
import { Verdict, ClaimCategory } from '../types';
import type { ProjectMetadata, DiscoveryAttempt, DiscoveryStatus } from '../types';
import { TIER_ROBUST_THRESHOLD, USE_TIERED_RESOLVER } from '../constants';
import { KNOWN_PROTOCOL_NAMES } from '../constants/protocols';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'JobRouter' });

/** Convert GitHub blob URLs to raw.githubusercontent.com */
function normalizeGitHubUrl(url: string): string {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}

/**
 * Option B Fix C (2026-04-24): name canonicalization.
 *
 * When `resolveTokenName` falls back to on-chain ERC-20 `name()` for tokens
 * without project_name in the request, the returned string is the literal
 * contract label — e.g., AAVE returns `"Aave Token"`, LINK returns
 * `"ChainLink Token"`, VIRTUAL returns `"Virtual Protocol"`. These verbose
 * forms create parallel DB rows alongside canonical short names.
 *
 * Canonicalization collapses these variants by:
 *   1. Stripping trailing ` Token`/` Protocol`/` Coin`/` Stablecoin`/` Chain`/` Network`.
 *   2. Looking the stripped base up (case-insensitive) against KNOWN_PROTOCOL_NAMES.
 *   3. If found, returning the KNOWN canonical form (preserving its casing).
 *   4. Checking a small synonym map for plural/singular pairs that don't
 *      collapse via suffix stripping (e.g., `Virtual` → `Virtuals Protocol`).
 *   5. If nothing matches, returning the input (trimmed) unchanged — never
 *      over-merge unknown names.
 *
 * Returns the canonical name or the input trimmed.
 */
const NAME_SUFFIX_PATTERN = /\s+(token|protocol|coin|stablecoin|chain|network)s?$/i;

/** Explicit synonyms for plural/singular forms that suffix-stripping doesn't catch. */
const NAME_SYNONYMS = new Map<string, string>([
  // Virtuals: on-chain name is "Virtual Protocol" but canonical is "Virtuals Protocol"
  ['virtual', 'Virtuals Protocol'],
]);

function canonicalizeProjectName(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  const base = lower.replace(NAME_SUFFIX_PATTERN, '').trim();

  // Synonym map check
  const syn = NAME_SYNONYMS.get(base);
  if (syn) return syn;

  // KNOWN_PROTOCOL_NAMES check — compare base forms on both sides
  for (const known of KNOWN_PROTOCOL_NAMES) {
    const knownBase = known.toLowerCase().replace(NAME_SUFFIX_PATTERN, '').trim();
    if (knownBase === base) return known;
  }

  return trimmed;
}

/**
 * Resolve a token address to a project name using DexScreener API.
 * Works across ALL chains (Ethereum, Base, Solana, Arbitrum, BSC, 60+).
 * Falls back to on-chain ERC-20 name() for EVM addresses if DexScreener fails.
 * Returns null if resolution fails entirely.
 */
async function resolveTokenName(tokenAddress: string): Promise<string | null> {
  // Tier 1: DexScreener (chain-agnostic, covers all major tokens)
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenAddress)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (resp.ok) {
      const data = await resp.json() as { pairs?: Array<{ baseToken?: { address?: string; name?: string; symbol?: string } }> };
      const match = data.pairs?.find(
        (p) => p.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (match?.baseToken?.name) {
        const raw = match.baseToken.name;
        const canonical = canonicalizeProjectName(raw) ?? raw;
        if (canonical !== raw) {
          log.info('DexScreener resolved token name (canonicalized)', {
            tokenAddress: tokenAddress.slice(0, 10), raw, canonical,
          });
        } else {
          log.info('DexScreener resolved token name', { tokenAddress: tokenAddress.slice(0, 10), name: raw });
        }
        return canonical;
      }
    }
  } catch { /* DexScreener unavailable — try fallback */ }

  // Tier 2: On-chain ERC-20 name() for 0x addresses
  if (tokenAddress.startsWith('0x')) {
    const rpcUrls = [
      'https://ethereum-rpc.publicnode.com',
      process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
    ];
    for (const rpcUrl of rpcUrls) {
      try {
        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'eth_call',
            params: [{ to: tokenAddress, data: '0x06fdde03' }, 'latest'], // name()
          }),
          signal: AbortSignal.timeout(3000),
        });
        const data = await resp.json() as { result?: string };
        if (data.result && data.result !== '0x' && data.result.length > 2) {
          // ABI-decode the string: skip 0x + 64 chars offset + 64 chars length, then read hex pairs
          const hex = data.result.slice(2); // remove 0x
          if (hex.length >= 192) { // offset(64) + length(64) + data(64+)
            const strLen = parseInt(hex.slice(64, 128), 16);
            if (strLen > 0 && strLen < 100) {
              const strHex = hex.slice(128, 128 + strLen * 2);
              const name = Buffer.from(strHex, 'hex').toString('utf8').trim();
              if (name.length > 0 && /^[\x20-\x7E]+$/.test(name)) {
                const canonical = canonicalizeProjectName(name) ?? name;
                if (canonical !== name) {
                  log.info('ERC-20 name() resolved (canonicalized)', {
                    tokenAddress: tokenAddress.slice(0, 10), raw: name, canonical,
                    rpcUrl: rpcUrl.slice(0, 30),
                  });
                } else {
                  log.info('ERC-20 name() resolved', { tokenAddress: tokenAddress.slice(0, 10), name, rpcUrl: rpcUrl.slice(0, 30) });
                }
                return canonical;
              }
            }
          }
        }
      } catch { continue; }
    }
  }

  return null;
}

/**
 * Strip version suffixes from project names for fuzzy DB matching.
 * "Aave V3" → "Aave", "Uniswap v2" → "Uniswap", "Compound V3" → "Compound"
 * Returns null if no version suffix found (no point re-querying with same string).
 */
function stripVersionSuffix(name: string): string | null {
  const stripped = name.replace(/\s+[vV]\d+(\.\d+)*\s*$/, '').trim();
  return stripped !== name.trim() ? stripped : null;
}

/**
 * Extract the version token from a project name. "Aave V3" → "v3", "Uniswap" → null.
 * Used by dedupe-on-address logic to keep v1 and v3 rows distinct even when
 * they share a token contract.
 */
function extractVersion(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\b(v\d+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export interface JobRouterDeps {
  whitepaperRepo: WpvWhitepapersRepo;
  verificationsRepo: WpvVerificationsRepo;
  claimsRepo: WpvClaimsRepo;
  structuralAnalyzer: StructuralAnalyzer;
  claimExtractor: ClaimExtractor;
  claimEvaluator: ClaimEvaluator;
  scoreAggregator: ScoreAggregator;
  reportGenerator: ReportGenerator;
  pricingConfig: { inputPerToken: number; outputPerToken: number };
  cryptoResolver: CryptoContentResolver;
  tieredDiscovery: TieredDocumentDiscovery | null;
  githubResolver?: GitHubResolver;      // Phase 3 Tier 3
  aggregatorResolver?: AggregatorResolver; // Phase 3 Tier 4
  env?: { githubToken?: string; cmcApiKey?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropicClient?: any;
}

/** 4 minutes — leaves 1 min for ACP delivery overhead within the 5-min SLA */
const PIPELINE_TIMEOUT_MS = 4 * 60 * 1000;

export class JobRouter {
  private _jobLock: Promise<void> = Promise.resolve();

  constructor(private deps: JobRouterDeps) {}

  async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
    // Briefings are read-only (no DB writes, no Playwright, no Sonnet).
    // Exempt from mutex to prevent SLA violations when slow pipeline jobs block the queue.
    if (offeringId === 'daily_tech_brief') {
      return this._handleJobImpl(offeringId, input);
    }

    // Fix 5A (2026-04-24): legit_scan cache-hit bypass.
    // Cache-hit reads touch none of the shared state the mutex protects
    // (no Playwright, no DB upserts, no write-back). A cached legit_scan should
    // never wait behind full_tech jobs invoking Sonnet synthesis. Job 1308
    // expired this way: deliverable generated correctly at 01:32:58 but on-chain
    // submit landed past deadline after waiting behind Jobs 1304+1305 full_tech.
    // If cache miss, we fall through to the mutex path for live L1.
    if (offeringId === 'legitimacy_scan') {
      const cached = await this._tryLegitimacyScanFromCache(input);
      if (cached) {
        const requestedProjectName = input.project_name as string | undefined;
        return this.maybeDowngradeForVersionMismatch(cached as Record<string, unknown>, requestedProjectName);
      }
    }

    // Serialize job processing — prevents Playwright race conditions
    // and DB upsert TOCTOU.
    let release: () => void;
    const acquired = new Promise<void>(r => { release = r; });
    const previous = this._jobLock;
    this._jobLock = acquired;
    await previous;
    try {
      return await this._handleJobImpl(offeringId, input);
    } finally {
      release!();
    }
  }

  /**
   * Fix 5A (2026-04-24): cache-only path for legit_scan. Returns a report when
   * findWhitepaper + verificationsRepo both hit, null on any miss. Safe to run
   * without holding _jobLock — reads only, no writes, no Playwright.
   */
  private async _tryLegitimacyScanFromCache(input: Record<string, unknown>): Promise<unknown | null> {
    const wp = await this.findWhitepaper(input);
    if (!wp) return null;
    const verification = await this.deps.verificationsRepo.findByWhitepaperId(wp.id);
    if (!verification) return null;
    const analysis = this.extractStructuralAnalysis(verification);
    const report = this.deps.reportGenerator.generateLegitimacyScan(
      this.verificationRowToResult(verification),
      analysis,
      wp as never,
      { discoveryStatus: 'cached', discoverySourceTier: 0, discoveryAttempts: [{ tier: 0, status: 'cached', structuralScore: verification.structuralScore ?? 0, claimCount: verification.totalClaims ?? 0 }] },
    );
    const requestedAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;
    if (requestedAddress) {
      report.tokenAddress = requestedAddress;
    }
    return report;
  }

  private async _handleJobImpl(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
    log.info('Routing job', { offeringId });

    // Per-job cost tracker — scoped to this invocation, no shared state
    const costTracker = new CostTracker(
      this.deps.pricingConfig.inputPerToken,
      this.deps.pricingConfig.outputPerToken,
    );

    // Fix 4 (2026-04-23): apply version-mismatch verdict downgrade at the dispatch
    // boundary so it covers every return path within each handler (cached, live,
    // discovery-only, enriched). Legitimacy scan doesn't typically carry version
    // intent but the helper no-ops gracefully when no version in request.
    const requestedProjectName = input.project_name as string | undefined;
    switch (offeringId) {
      case 'legitimacy_scan': {
        const result = await this.handleLegitimacyScan(input, costTracker);
        return this.maybeDowngradeForVersionMismatch(result as Record<string, unknown>, requestedProjectName);
      }
      case 'verify_whitepaper': {
        const result = await this.handleVerifyWhitepaper(input, costTracker);
        return this.maybeDowngradeForVersionMismatch(result as Record<string, unknown>, requestedProjectName);
      }
      case 'verify_full_tech': {
        const result = await this.handleFullVerification(input, costTracker);
        return this.maybeDowngradeForVersionMismatch(result as Record<string, unknown>, requestedProjectName);
      }
      case 'daily_tech_brief':
        return this.handleDailyBriefing(input);
      default:
        return { error: 'unknown_offering', message: `Unknown offering: ${offeringId}` };
    }
  }

  private async handleLegitimacyScan(input: Record<string, unknown>, costTracker: CostTracker) {
    // Try cache first
    const wp = await this.findWhitepaper(input);
    if (wp) {
      const verification = await this.deps.verificationsRepo.findByWhitepaperId(wp.id);
      if (verification) {
        const analysis = this.extractStructuralAnalysis(verification);
        const report = this.deps.reportGenerator.generateLegitimacyScan(
          this.verificationRowToResult(verification),
          analysis,
          wp as never,
          { discoveryStatus: 'cached', discoverySourceTier: 0, discoveryAttempts: [{ tier: 0, status: 'cached', structuralScore: verification.structuralScore ?? 0, claimCount: verification.totalClaims ?? 0 }] },
        );
        const requestedAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;
        if (requestedAddress) {
          report.tokenAddress = requestedAddress;
        }
        return report;
      }
    }

    // Cache miss — run live L1 if discovery stack is available
    let projectName = (input.project_name as string | undefined)?.trim() ?? '';
    const tokenAddress = (input.token_address as string | undefined)?.trim() ?? '';
    const originalTokenAddress = ((input._originalTokenAddress ?? input.token_address) as string | undefined)?.trim() ?? '';

    // Resolve project name from token address if missing
    // Use originalTokenAddress as fallback — tokenAddress is empty after soft-strip
    if ((!projectName || projectName === 'Unknown') && (tokenAddress || originalTokenAddress)) {
      const resolved = await resolveTokenName((tokenAddress || originalTokenAddress)!);
      if (resolved) {
        projectName = resolved;
        input.project_name = resolved;
      }
    }
    if (!projectName) projectName = 'Unknown';

    // Use the best available address for discovery and DB writes
    const effectiveTokenAddress = tokenAddress || originalTokenAddress;

    if (this.deps.tieredDiscovery) {
      try {
        const scanReport = await this.withTimeout(async (signal) => {
          const metadata: ProjectMetadata = {
            agentName: projectName,
            entityId: null,
            description: null,
            linkedUrls: [],
            category: null,
            graduationStatus: null,
          };
          const discovered = await this.deps.tieredDiscovery!.discover(metadata, effectiveTokenAddress);
          if (!discovered) return null;

          // L1: Structural analysis
          costTracker.reset();
          costTracker.startStage('l1');
          const analysis = await this.deps.structuralAnalyzer.analyze(
            discovered.resolved.text,
            discovered.resolved.pageCount,
          );
          const structuralScore = this.deps.structuralAnalyzer.computeQuickFilterScore(analysis);
          const hypeTechRatio = this.deps.structuralAnalyzer.computeHypeTechRatio(discovered.resolved.text);
          costTracker.endStage('l1', 0, 0);

          // Cache the result — guard against violation keywords
          let newWpId: string;
          if (JobRouter.hasViolationKeywords(projectName)) {
            newWpId = `tmp-${Date.now()}`;
            log.warn('Skipping L1 cache write — violation keywords', { projectName });
          } else {
            // Upsert: if existing whitepaper with claims exists, reuse it (L1 scan shouldn't overwrite L2 data)
            const existing = await this.deps.whitepaperRepo.findByProjectName(projectName);
            let existingWithClaims: typeof existing[0] | undefined;
            for (const e of existing) {
              const eClaims = await this.deps.claimsRepo.findByWhitepaperId(e.id);
              if (eClaims.length > 0) { existingWithClaims = e; break; }
            }
            if (existingWithClaims) {
              // Existing record with L2 claims — reuse, refresh verification
              newWpId = existingWithClaims.id;
              await this.deps.verificationsRepo.deleteByWhitepaperId(newWpId);
              log.info('L1 upsert: reusing existing whitepaper with claims', { projectName });
            } else {
              // No claims — clean up 0-claim entries, create fresh
              for (const e of existing) {
                await this.deps.verificationsRepo.deleteByWhitepaperId(e.id);
                await this.deps.whitepaperRepo.deleteById(e.id);
              }
              const newWp = await this.deps.whitepaperRepo.create({
                projectName,
                tokenAddress: effectiveTokenAddress || undefined,
                documentUrl: discovered.documentUrl,
                chain: effectiveTokenAddress?.startsWith('0x') ? 'base' : 'unknown',
                pageCount: discovered.resolved.pageCount,
                status: 'VERIFIED',
                selectionScore: 0,
              });
              newWpId = newWp.id;
            }
          }

          // When content is genuinely thin after exhausting discovery tiers,
          // INSUFFICIENT_DATA honestly represents "couldn't find enough to score"
          // rather than FAIL which implies a judgment the project is bad.
          const isThin = structuralScore < TIER_ROBUST_THRESHOLD.structuralScore;
          const verdict: Verdict = isThin
            ? ('INSUFFICIENT_DATA' as Verdict)
            : structuralScore >= 3 ? Verdict.PASS
            : Verdict.CONDITIONAL;

          if (!newWpId.startsWith('tmp-')) {
            await this.deps.verificationsRepo.deleteByWhitepaperId(newWpId);
            await this.deps.verificationsRepo.create({
              whitepaperId: newWpId,
              structuralScore,
              confidenceScore: 0,
              hypeTechRatio,
              verdict,
              totalClaims: 0,
              verifiedClaims: 0,
              llmTokensUsed: 0,
              computeCostUsd: 0,
              structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
              triggerSource: 'acp_live_l1',
              cacheHit: false,
            });
          }

          // Map internal TieredDocumentDiscovery tier → discoveryStatus
          const discoveryStatus: DiscoveryStatus =
            discovered.tier === 3 ? 'community' :
            discovered.tier === 4 ? 'failed' :
            'primary';

          const report = this.deps.reportGenerator.generateLegitimacyScan(
            { structuralScore, confidenceScore: 0, hypeTechRatio, verdict, focusAreaScores: { [ClaimCategory.TOKENOMICS]: null, [ClaimCategory.PERFORMANCE]: null, [ClaimCategory.CONSENSUS]: null, [ClaimCategory.SCIENTIFIC]: null }, totalClaims: 0, verifiedClaims: 0, llmTokensUsed: 0, computeCostUsd: 0 },
            analysis,
            { id: newWpId, projectName, effectiveTokenAddress } as never,
            { discoveryStatus, discoverySourceTier: discovered.tier, discoveryAttempts: [{ tier: discovered.tier, status: discoveryStatus, structuralScore, claimCount: 0 }] },
          );
          if (originalTokenAddress) report.tokenAddress = originalTokenAddress;
          log.info('Live L1 scan completed', { projectName, structuralScore, verdict });
          return report;
        });
        if (scanReport) return scanReport;
      } catch (err) {
        if ((err as Error).message === 'Pipeline timeout') {
          log.warn('Pipeline timeout in scan — returning INSUFFICIENT_DATA', { projectName });
        } else {
          log.warn('Live L1 discovery failed — returning INSUFFICIENT_DATA', { projectName, error: (err as Error).message });
        }
      }
    }

    // Discovery unavailable or failed — return INSUFFICIENT_DATA
    return this.insufficientData(input);
  }

  /**
   * Resolve, analyze (L1), extract claims (L2), and store whitepaper + claims.
   * Shared by handleVerifyWhitepaper and handleFullVerification.
   * Returns intermediate results for further processing.
   */
  private async runL1L2(documentUrl: string, projectName: string, tokenAddress: string | null | undefined, requirementText: string | null | undefined, costTracker: CostTracker, signal?: AbortSignal) {
    // Resolve the document
    const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(documentUrl), signal);

    // L1: Structural analysis (timed)
    costTracker.startStage('l1');
    const analysis = await this.deps.structuralAnalyzer.analyze(resolved.text, resolved.pageCount);
    const structuralScore = this.deps.structuralAnalyzer.computeQuickFilterScore(analysis);
    const hypeTechRatio = this.deps.structuralAnalyzer.computeHypeTechRatio(resolved.text);
    costTracker.endStage('l1', 0, 0); // L1 uses no LLM tokens

    // L2: Claim extraction (timed + token tracked)
    costTracker.startStage('l2');
    const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName, { requirementText, costTracker });
    // Note: ClaimExtractor calls costTracker.recordUsage() internally
    // We capture the delta via getStageMetrics() after the verification

    // Store whitepaper — guard against caching violation keywords
    let wp: { id: string; projectName: string; tokenAddress?: string | null };
    if (JobRouter.hasViolationKeywords(projectName)) {
      // Don't persist poisoned entries — use a temporary in-memory record
      wp = { id: `tmp-${Date.now()}`, projectName, tokenAddress: tokenAddress ?? null };
      log.warn('Skipping cache write — project name contains violation keywords', { projectName });
    } else {
      // Option B Fix B (2026-04-24): dedupe upsert by token_address with version
      // awareness. Before, this method upserted by project_name only — which
      // created parallel rows for the same on-chain contract when the name
      // varied ("Aave Token" vs "Aave", "Virtual Protocol" vs "Virtuals
      // Protocol"). Now we also consider rows matching the same tokenAddress
      // in the same version-family as candidate records, and we preserve the
      // existing row's name when replacing so the canonical first-seen name
      // wins over verbose on-chain labels.
      const requestedVersion = extractVersion(projectName);

      // Name-path candidates (existing behavior)
      const byName = await this.deps.whitepaperRepo.findByProjectName(projectName);
      // Address-path candidates, filtered to same version-family
      let byAddrCompatible: typeof byName = [];
      if (tokenAddress) {
        const byAddr = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
        byAddrCompatible = byAddr.filter((row) => {
          const rowVersion = extractVersion((row as Record<string, unknown>).projectName as string | null);
          return (rowVersion ?? '') === (requestedVersion ?? '');
        });
      }

      // Merge candidates, dedupe by id, preserve name-path priority (for logging clarity)
      const existing: typeof byName = [...byName];
      const seenIds = new Set(existing.map((e) => e.id));
      for (const wpRow of byAddrCompatible) {
        if (!seenIds.has(wpRow.id)) {
          existing.push(wpRow);
          seenIds.add(wpRow.id);
          log.info('Upsert: dedupe-on-address candidate', {
            requestedName: projectName, requestedVersion: requestedVersion ?? 'none',
            existingName: (wpRow as Record<string, unknown>).projectName,
            tokenAddress: tokenAddress?.slice(0, 10),
          });
        }
      }

      const existingWithClaims = existing.length > 0
        ? await (async () => {
            for (const e of existing) {
              const eClaims = await this.deps.claimsRepo.findByWhitepaperId(e.id);
              if (eClaims.length > 0) return { wp: e, claimCount: eClaims.length };
            }
            return null;
          })()
        : null;

      if (existingWithClaims && existingWithClaims.claimCount >= claims.length) {
        // Existing record has equal or more claims — reuse whitepaper and verification
        wp = existingWithClaims.wp;
        log.info('Upsert: reusing existing record', {
          projectName, existingClaims: existingWithClaims.claimCount, newClaims: claims.length,
          existingName: existingWithClaims.wp.projectName,
        });
      } else {
        // New result is better, or no existing record — create new.
        // Preserve the existing canonical name when replacing, so on-chain
        // verbose labels ("Aave Token") don't overwrite canonical forms ("Aave").
        const canonicalName = existingWithClaims
          ? (existingWithClaims.wp as Record<string, unknown>).projectName as string
          : projectName;

        if (existingWithClaims) {
          log.info('Upsert: replacing — new result has more claims', {
            requestedName: projectName, preservedName: canonicalName,
            existingClaims: existingWithClaims.claimCount, newClaims: claims.length,
          });
          await this.deps.claimsRepo.deleteByWhitepaperId(existingWithClaims.wp.id);
          await this.deps.verificationsRepo.deleteByWhitepaperId(existingWithClaims.wp.id);
          await this.deps.whitepaperRepo.deleteById(existingWithClaims.wp.id);
        } else if (existing.length > 0) {
          // Existing records with 0 claims — clean them up
          for (const e of existing) {
            await this.deps.verificationsRepo.deleteByWhitepaperId(e.id);
            await this.deps.whitepaperRepo.deleteById(e.id);
          }
        }

        wp = await this.deps.whitepaperRepo.create({
          projectName: canonicalName,
          tokenAddress: tokenAddress ?? undefined,
          documentUrl,
          chain: tokenAddress?.startsWith('0x') ? 'base' : 'unknown',
          pageCount: resolved.pageCount,
          status: 'VERIFIED',
          selectionScore: 0,
        });

        // Store claims — only when creating/replacing
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
      }
    }

    return { resolved, analysis, structuralScore, hypeTechRatio, claims, wp };
  }

  private async handleVerifyWhitepaper(input: Record<string, unknown>, costTracker: CostTracker) {
    const documentUrl = (input.document_url as string | undefined)?.trim();
    const requestedTokenAddress = (input.token_address as string | undefined)?.trim() ?? null;
    const originalTokenAddress = ((input._originalTokenAddress ?? input.token_address) as string | undefined)?.trim() ?? null;
    let projectName = (input.project_name as string | undefined)?.trim() || '';
    const requirementText = this.extractRequirementText(input);

    // Resolve project name from token address if missing
    // Use originalTokenAddress as fallback — requestedTokenAddress is null after soft-strip
    if ((!projectName || projectName === 'Unknown') && (requestedTokenAddress || originalTokenAddress)) {
      const resolved = await resolveTokenName((requestedTokenAddress || originalTokenAddress)!);
      if (resolved) {
        projectName = resolved;
        input.project_name = resolved; // propagate to discovery metadata
      }
    }
    if (!projectName) projectName = 'Unknown';

    // document_url is optional per schema — if missing, try discovery
    if (!documentUrl) {
      // Check cache first — prefer entries with the most claims
      const cachedWp = await this.findBestWhitepaper(input);
      if (cachedWp) {
        const cachedWpId = cachedWp.id as string;
        const cachedClaims = await this.deps.claimsRepo.findByWhitepaperId(cachedWpId);
        if (cachedClaims.length > 0) {
          const verification = await this.deps.verificationsRepo.findByWhitepaperId(cachedWpId);
          if (verification) {
            const analysis = this.extractStructuralAnalysis(verification);
            const mappedClaims = cachedClaims.map((c) => ({
              claimId: c.id,
              category: c.category as never,
              claimText: c.claimText,
              statedEvidence: c.statedEvidence,
              mathematicalProofPresent: c.mathProofPresent,
              sourceSection: c.sourceSection,
              regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
            }));
            const report = this.deps.reportGenerator.generateTokenomicsAudit(
              this.verificationRowToResult(verification),
              mappedClaims,
              cachedWp as never,
              undefined,
              analysis,
            );
            if (originalTokenAddress) report.tokenAddress = originalTokenAddress;

            // Requirement-aware synthesis on cached data
            if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil|risk|attack|exploit|vulnerab)/i.test(requirementText)) {
              const docUrl = (cachedWp as Record<string, unknown>).documentUrl as string | undefined;
              let docText = '';
              if (docUrl) {
                try {
                  const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(docUrl));
                  docText = resolved.text;
                } catch {
                  log.warn('Could not re-fetch document for synthesis — using claims only', { docUrl });
                }
              }
              const synthesis = await this.generateSynthesis(requirementText, projectName, mappedClaims as never, docText, costTracker);
              if (synthesis) {
                report.logicSummary = synthesis;
                log.info('Synthesis attached to cached verify result', { projectName, synthesisLength: synthesis.length });
              }
            }

            log.info('verify_whitepaper: returning cached result', { projectName, claims: cachedClaims.length });
            return report;
          }
        }
      }

      if (this.deps.tieredDiscovery) {
        try {
          const discReport = await this.withTimeout(async (signal) => {
            const metadata: ProjectMetadata = {
              agentName: projectName,
              entityId: null,
              description: null,
              linkedUrls: [],
              category: null,
              graduationStatus: null,
            };
            const discovered = await this.deps.tieredDiscovery!.discover(metadata, requestedTokenAddress ?? '');
            if (!discovered) return null;
            // Use discovered document URL for L1+L2+L3
            const { resolved: discResolved, analysis: discAnalysis, structuralScore: discScore, hypeTechRatio: discHype, claims: discClaims, wp: discWp } = await this.runL1L2(discovered.documentUrl, projectName, requestedTokenAddress, requirementText, costTracker, signal);
            costTracker.startStage('l3');
            const { evaluations: discEvals, scores: discScores } = await this.deps.claimEvaluator.evaluateAll(discClaims, discResolved.text, { requirementText, costTracker });
            costTracker.endStage('l3', 0, 0);
            const discClaimScores = discClaims.map((c) => ({ category: c.category as never, score: discScores.get(c.claimId) ?? 50 }));
            const discAggregate = this.deps.scoreAggregator.aggregate(discClaimScores);
            const discTokens = costTracker.getTotalTokens();

            // Persist verification so cached path works on subsequent requests
            if (!discWp.id.startsWith('tmp-')) {
              await this.deps.verificationsRepo.deleteByWhitepaperId(discWp.id);
              await this.deps.verificationsRepo.create({
                whitepaperId: discWp.id,
                structuralScore: discScore,
                confidenceScore: discAggregate.confidenceScore,
                hypeTechRatio: discHype,
                verdict: discAggregate.verdict,
                totalClaims: discClaims.length,
                verifiedClaims: discEvals.length,
                llmTokensUsed: discTokens.input + discTokens.output,
                computeCostUsd: costTracker.getTotalCostUsd(),
                focusAreaScores: discAggregate.focusAreaScores,
                structuralAnalysisJson: discAnalysis as unknown as Record<string, unknown>,
              });
            }

            const report = this.deps.reportGenerator.generateTokenomicsAudit(
              { structuralScore: discScore, confidenceScore: discAggregate.confidenceScore, hypeTechRatio: discHype, verdict: discAggregate.verdict, focusAreaScores: discAggregate.focusAreaScores, totalClaims: discClaims.length, verifiedClaims: discEvals.length, llmTokensUsed: discTokens.input + discTokens.output, computeCostUsd: costTracker.getTotalCostUsd() },
              discClaims, discWp as never, discScores, discAnalysis,
            );
            if (originalTokenAddress) report.tokenAddress = originalTokenAddress;
            return report;
          });
          if (discReport) return discReport;
        } catch (err) {
          if ((err as Error).message === 'Pipeline timeout') {
            log.warn('Pipeline timeout in verify discovery — returning INSUFFICIENT_DATA', { projectName });
          } else {
            log.warn('Discovery failed for verify_whitepaper (no document_url)', { projectName, error: (err as Error).message });
          }
        }
      }
      const insuffResult = this.insufficientData(input);
      if (originalTokenAddress) insuffResult.tokenAddress = originalTokenAddress;
      return insuffResult;
    }

    // Validate URL format — reject file://, javascript:, or malformed URLs
    try {
      const parsed = new URL(documentUrl);
      if (!['http:', 'https:', 'ipfs:'].includes(parsed.protocol)) {
        return { error: 'invalid_url', message: `Unsupported URL protocol: ${parsed.protocol}` };
      }
    } catch {
      return { error: 'invalid_url', message: 'document_url is not a valid URL' };
    }

    if (documentUrl.length > 2048) {
      return { error: 'invalid_url', message: 'document_url exceeds maximum length (2048)' };
    }

    try {
      return await this.withTimeout(async (signal) => {
        // Fix 3 (2026-04-23): handler-level fetch-failure fallback. If the provided
        // document_url fails to fetch (HTTP 4xx/5xx, network error), record the
        // attempt and fall through to tieredDiscovery rather than bubbling the
        // exception to the post-acceptance envelope (eval Job 1249).
        // Also populates `discoveryAttempts` in the deliverable so the evaluator
        // can see the agent tried.
        const discoveryAttempts: DiscoveryAttempt[] = [];
        let runResult: Awaited<ReturnType<typeof this.runL1L2>> | null = null;
        let selectedTier: number = 1;
        let selectedStatus: DiscoveryStatus = 'provided';

        // Phase 1: attempt provided document_url
        try {
          runResult = await this.runL1L2(documentUrl, projectName, requestedTokenAddress, requirementText, costTracker, signal);
          discoveryAttempts.push({
            tier: 1,
            status: 'provided',
            structuralScore: runResult.structuralScore,
            claimCount: runResult.claims.length,
          });
        } catch (err) {
          if ((err as Error).message === 'Pipeline timeout') throw err;
          const errMsg = (err as Error).message;
          log.warn('document_url fetch failed — attempting discovery fallback', {
            projectName, documentUrl: documentUrl.slice(0, 80), error: errMsg,
          });
          discoveryAttempts.push({
            tier: 1, status: 'error', note: errMsg.slice(0, 100),
          });
        }

        // Phase 2: fall through to discovery if Tier 1 failed OR returned 0 claims
        const needsDiscovery = !runResult || runResult.claims.length === 0;
        if (needsDiscovery && this.deps.tieredDiscovery) {
          try {
            log.info('trying discovery fallback', {
              projectName,
              reason: !runResult ? 'tier-1 fetch failed' : 'tier-1 yielded 0 claims',
            });
            const metadata: ProjectMetadata = {
              agentName: projectName,
              entityId: null,
              description: null,
              linkedUrls: [],
              category: null,
              graduationStatus: null,
            };
            const discovered = await this.deps.tieredDiscovery.discover(metadata, requestedTokenAddress ?? '');
            if (discovered && (!runResult || discovered.documentUrl !== documentUrl)) {
              const fallback = await this.runL1L2(discovered.documentUrl, projectName, requestedTokenAddress, requirementText, costTracker, signal);
              const discoveredStatus: DiscoveryStatus =
                discovered.tier === 3 ? 'community' :
                discovered.tier === 4 ? 'aggregator' :
                'primary';
              discoveryAttempts.push({
                tier: discovered.tier,
                status: discoveredStatus,
                structuralScore: fallback.structuralScore,
                claimCount: fallback.claims.length,
              });
              // Accept fallback if Tier 1 failed OR fallback has more claims
              if (!runResult || fallback.claims.length > 0) {
                log.info('Discovery fallback succeeded', {
                  projectName,
                  discoveredUrl: discovered.documentUrl.slice(0, 80),
                  claims: fallback.claims.length,
                  tier: discovered.tier,
                });
                runResult = fallback;
                selectedTier = discovered.tier;
                selectedStatus = discoveredStatus;
              }
            } else if (!discovered) {
              discoveryAttempts.push({ tier: 4, status: 'failed', note: 'all discovery tiers exhausted' });
            }
          } catch (err) {
            log.warn('Discovery fallback failed', { projectName, error: (err as Error).message });
            discoveryAttempts.push({ tier: 4, status: 'error', note: (err as Error).message.slice(0, 100) });
          }
        }

        // If both Tier 1 and discovery failed entirely, return INSUFFICIENT_DATA
        // with populated discoveryAttempts so the evaluator can see the agent tried.
        if (!runResult) {
          log.warn('Tier 1 + discovery both failed — returning INSUFFICIENT_DATA', {
            projectName, attempts: discoveryAttempts.length,
          });
          const insuffResult = this.insufficientData(input, discoveryAttempts);
          if (originalTokenAddress) insuffResult.tokenAddress = originalTokenAddress;
          return insuffResult;
        }

        const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = runResult;

        // L3: Claim evaluation (timed)
        costTracker.startStage('l3');
        const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(claims, resolved.text, { requirementText, costTracker });
        costTracker.endStage('l3', 0, 0); // L3 tokens tracked via recordUsage internally

        // Build score array from evaluation results
        const claimScores = claims.map((c) => ({
          category: c.category as never,
          score: scores.get(c.claimId) ?? 50,
        }));

        const aggregate = this.deps.scoreAggregator.aggregate(claimScores);

        // Store verification with structural analysis + cost metrics
        const tokens = costTracker.getTotalTokens();
        const stageMetrics = costTracker.getStageMetrics();
        if (!wp.id.startsWith('tmp-')) {
          await this.deps.verificationsRepo.deleteByWhitepaperId(wp.id);
          await this.deps.verificationsRepo.create({
            whitepaperId: wp.id,
            structuralScore,
            confidenceScore: aggregate.confidenceScore,
            hypeTechRatio,
            verdict: aggregate.verdict,
            totalClaims: claims.length,
            verifiedClaims: evaluations.length,
            llmTokensUsed: tokens.input + tokens.output,
            computeCostUsd: costTracker.getTotalCostUsd(),
            structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
            triggerSource: (input._triggerSource as string) ?? 'manual',
            cacheHit: false,
            l1DurationMs: stageMetrics.l1.durationMs,
            l2InputTokens: stageMetrics.l2.inputTokens,
            l2OutputTokens: stageMetrics.l2.outputTokens,
            l2CostUsd: stageMetrics.l2.costUsd,
            l2DurationMs: stageMetrics.l2.durationMs,
            l3InputTokens: stageMetrics.l3.inputTokens,
            l3OutputTokens: stageMetrics.l3.outputTokens,
            l3CostUsd: stageMetrics.l3.costUsd,
            l3DurationMs: stageMetrics.l3.durationMs,
          });
        }

        const report = this.deps.reportGenerator.generateTokenomicsAudit(
          {
            structuralScore,
            confidenceScore: aggregate.confidenceScore,
            hypeTechRatio,
            verdict: aggregate.verdict,
            focusAreaScores: aggregate.focusAreaScores,
            totalClaims: claims.length,
            verifiedClaims: evaluations.length,
            llmTokensUsed: tokens.input + tokens.output,
            computeCostUsd: costTracker.getTotalCostUsd(),
          },
          claims,
          wp as never,
          scores,
          analysis,
        );

        // Requirement-aware synthesis: focused analysis addressing buyer's specific question
        if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil)/i.test(requirementText)) {
          const synthesis = await this.generateSynthesis(requirementText, projectName, claims, resolved.text, costTracker);
          if (synthesis) report.logicSummary = synthesis;
        }

        // Ensure requested token_address is in the report
        if (originalTokenAddress) {
          report.tokenAddress = originalTokenAddress;
        }

        // Fix 3: attach tier provenance to the successful deliverable
        report.discoveryStatus = selectedStatus;
        report.discoverySourceTier = selectedTier;
        report.discoveryAttempts = discoveryAttempts;

        return report;
      });
    } catch (err) {
      if ((err as Error).message === 'Pipeline timeout') {
        log.warn('Pipeline timeout in verify — returning INSUFFICIENT_DATA', { projectName });
        const insuffResult = this.insufficientData(input);
        if (originalTokenAddress) insuffResult.tokenAddress = originalTokenAddress;
        return insuffResult;
      }
      throw err;
    }
  }

  private async handleFullVerification(input: Record<string, unknown>, costTracker: CostTracker) {
    const reqAddr = input.token_address as string | undefined;
    const originalAddr = (input._originalTokenAddress ?? input.token_address) as string | undefined;
    let reqName = (input.project_name as string | undefined)?.trim();
    const requirementText = this.extractRequirementText(input);

    // Resolve project name from token address if missing
    // Use originalAddr as fallback — reqAddr is undefined after soft-strip
    if ((!reqName || reqName === 'Unknown') && (reqAddr || originalAddr)) {
      const resolved = await resolveTokenName((reqAddr || originalAddr)!);
      if (resolved) {
        reqName = resolved;
        input.project_name = resolved;
      }
    }

    const hasDocumentUrl = !!(input.document_url as string | undefined)?.trim();

    // When document_url is provided, skip cache — analyze the SPECIFIC document
    // (evaluator may send Aave v1 URL but cache has Aave v3 — must use provided doc)
    // ── BUG-B FIX: Use findBestWhitepaper which prefers entries WITH claims ──
    const wp = hasDocumentUrl ? null : await this.findBestWhitepaper(input);
    if (wp) {
      const wpId = wp.id as string;
      const wpName = (wp.projectName as string) ?? 'Unknown';
      const verification = await this.deps.verificationsRepo.findByWhitepaperId(wpId);
      if (verification) {
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wpId);
        const totalClaims = (verification.totalClaims as number) ?? claims.length;

        // ── Cached result HAS claims → return it (with optional synthesis) ──
        if (totalClaims > 0 && claims.length > 0) {
          log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
          const analysis = this.extractStructuralAnalysis(verification);
          const mappedClaims = claims.map((c) => ({
            claimId: c.id,
            category: c.category as never,
            claimText: c.claimText,
            statedEvidence: c.statedEvidence,
            mathematicalProofPresent: c.mathProofPresent,
            sourceSection: c.sourceSection,
            regulatoryRelevance: (c.evaluationJson as Record<string, unknown>)?.regulatoryRelevance === true,
          }));
          const fullReport = this.deps.reportGenerator.generateFullVerification(
            this.verificationRowToResult(verification),
            mappedClaims,
            [],
            wp as never,
            undefined,
            analysis,
          );
          if (originalAddr) fullReport.tokenAddress = originalAddr;

          // Requirement-aware synthesis on cached data
          if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil|risk|attack|exploit|vulnerab)/i.test(requirementText)) {
            const docUrl = (wp as Record<string, unknown>).documentUrl as string | undefined;
            let docText = '';
            if (docUrl) {
              try {
                const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(docUrl));
                docText = resolved.text;
              } catch {
                log.warn('Could not re-fetch document for synthesis — using claims only', { docUrl });
              }
            }
            const synthesis = await this.generateSynthesis(requirementText, wpName, mappedClaims as never, docText, costTracker);
            if (synthesis) {
              fullReport.logicSummary = synthesis;
              log.info('Synthesis attached to cached result', { projectName: wpName, synthesisLength: synthesis.length });
            }
          }

          return fullReport;
        }

        // ── Cached result has 0 claims (L1-only) → try to enrich with L2+L3 ──
        if (totalClaims === 0 && this.deps.claimExtractor && this.deps.cryptoResolver) {
          const docUrl = (wp as Record<string, unknown>).documentUrl as string | undefined;
          if (docUrl) {
            try {
              log.info('Enriching cached L1 result with L2+L3', { projectName: wpName, docUrl: docUrl.slice(0, 80) });
              const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(docUrl));
              if (resolved.text.length > 100) {
                costTracker.reset();
                costTracker.startStage('l2');
                const newClaims = await this.deps.claimExtractor.extractClaims(resolved.text, wpName, { costTracker });
                costTracker.endStage('l2', 0, 0);

                // L3 if available
                let evaluations: unknown[] = [];
                let scores = new Map<string, number>();
                if (this.deps.claimEvaluator) {
                  costTracker.startStage('l3');
                  const evalResult = await this.deps.claimEvaluator.evaluateAll(newClaims, resolved.text, { requirementText, costTracker });
                  evaluations = evalResult.evaluations;
                  scores = evalResult.scores;
                  costTracker.endStage('l3', 0, 0);
                }

                // Store enriched claims
                if (!JobRouter.hasViolationKeywords(wpName)) {
                  for (const claim of newClaims) {
                    await this.deps.claimsRepo.create({
                      whitepaperId: wpId,
                      category: claim.category,
                      claimText: claim.claimText,
                      statedEvidence: claim.statedEvidence,
                      sourceSection: claim.sourceSection,
                      mathProofPresent: claim.mathematicalProofPresent,
                      evaluationJson: claim.regulatoryRelevance ? { regulatoryRelevance: true } : undefined,
                    });
                  }
                }

                if (newClaims.length > 0) {
                  const claimScores = newClaims.map((c) => ({
                    category: c.category as never,
                    score: scores.get(c.claimId) ?? 50,
                  }));
                  const aggregate = this.deps.scoreAggregator.aggregate(claimScores);
                  const analysis = this.extractStructuralAnalysis(verification);

                  const enrichedReport = this.deps.reportGenerator.generateFullVerification(
                    { ...this.verificationRowToResult(verification), totalClaims: newClaims.length, verdict: aggregate.verdict, confidenceScore: aggregate.confidenceScore, focusAreaScores: aggregate.focusAreaScores },
                    newClaims,
                    evaluations as never,
                    wp as never,
                    scores,
                    analysis,
                  );
                  if (originalAddr) enrichedReport.tokenAddress = originalAddr;
                  log.info('L2+L3 enrichment complete', { projectName: wpName, claims: newClaims.length });
                  return enrichedReport;
                }
                // L2 returned 0 claims even with text — fall through to discovery
                log.warn('L2 enrichment returned 0 claims despite text — falling through to discovery', { projectName: wpName });
              }
            } catch (err) {
              // ── BUG-C FIX: Log the docUrl that failed ──
              log.warn('L2+L3 enrichment failed — falling through to discovery', {
                projectName: wpName,
                docUrl: wp.documentUrl,
                error: (err as Error).message,
              });
            }
          } else {
            log.warn('Cached L1 entry has no documentUrl — falling through to discovery', { projectName: wpName });
          }
        }

        // ── BUG-A FIX: If we're here with 0 claims, DO NOT return the empty
        // cached result. Fall through to the discovery pipeline below instead
        // of returning an empty report that matches the $0.25 scan. ──
        if (totalClaims > 0) {
          // Has claims but enrichment wasn't needed — return cached
          const analysis = this.extractStructuralAnalysis(verification);
          const fullReport = this.deps.reportGenerator.generateFullVerification(
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
          if (originalAddr) fullReport.tokenAddress = originalAddr;
          return fullReport;
        }

        log.info('Cached result has 0 claims and enrichment failed/skipped — trying live discovery', {
          projectName: wpName,
          tokenAddress: originalAddr,
        });
        // Fall through to discovery pipeline below ↓
      }
    }

    // ── No usable cached result — try live pipeline ──
    const documentUrl = (input.document_url as string | undefined)?.trim();
    const projectName = reqName || 'Unknown';

    // If no document_url, try discovery
    if (!documentUrl && this.deps.tieredDiscovery) {
      try {
        const discReport = await this.withTimeout(async (signal) => {
          const metadata: ProjectMetadata = {
            agentName: projectName,
            entityId: null,
            description: null,
            linkedUrls: [],
            category: null,
            graduationStatus: null,
          };
          const discovered = await this.deps.tieredDiscovery!.discover(metadata, reqAddr ?? '');
          if (!discovered) return null;
          const { resolved, analysis, structuralScore, hypeTechRatio, claims: discClaims, wp: discWp } = await this.runL1L2(discovered.documentUrl, projectName, reqAddr, requirementText, costTracker, signal);
          const { evaluations, scores } = this.deps.claimEvaluator
            ? await this.deps.claimEvaluator.evaluateAll(discClaims, resolved.text, { requirementText, costTracker })
            : { evaluations: [], scores: new Map<string, number>() };
          const claimScores = discClaims.map((c) => ({ category: c.category as never, score: scores.get(c.claimId) ?? 50 }));
          const aggregate = this.deps.scoreAggregator.aggregate(claimScores);
          const tokens = costTracker.getTotalTokens();

          // Persist verification so cached path works on subsequent requests
          if (!discWp.id.startsWith('tmp-')) {
            await this.deps.verificationsRepo.deleteByWhitepaperId(discWp.id);
            await this.deps.verificationsRepo.create({
              whitepaperId: discWp.id,
              structuralScore,
              confidenceScore: aggregate.confidenceScore,
              hypeTechRatio,
              verdict: aggregate.verdict,
              totalClaims: discClaims.length,
              verifiedClaims: evaluations.length,
              llmTokensUsed: tokens.input + tokens.output,
              computeCostUsd: costTracker.getTotalCostUsd(),
              focusAreaScores: aggregate.focusAreaScores,
              structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
            });
          }

          const report = this.deps.reportGenerator.generateFullVerification(
            { structuralScore, confidenceScore: aggregate.confidenceScore, hypeTechRatio, verdict: aggregate.verdict, focusAreaScores: aggregate.focusAreaScores, totalClaims: discClaims.length, verifiedClaims: evaluations.length, llmTokensUsed: tokens.input + tokens.output, computeCostUsd: costTracker.getTotalCostUsd() },
            discClaims, evaluations as never, discWp as never, scores, analysis,
          );
          if (originalAddr) report.tokenAddress = originalAddr;
          return report;
        });
        if (discReport) return discReport;
      } catch (err) {
        if ((err as Error).message === 'Pipeline timeout') {
          log.warn('Pipeline timeout in full_tech discovery — returning INSUFFICIENT_DATA', { projectName });
        } else {
          log.warn('Discovery failed for verify_full_tech', { error: (err as Error).message });
        }
      }
      return this.insufficientData(input);
    }

    if (!documentUrl) {
      return this.insufficientData(input);
    }

    // Validate URL
    try {
      const parsed = new URL(documentUrl);
      if (!['http:', 'https:', 'ipfs:'].includes(parsed.protocol)) {
        return { error: 'invalid_url', message: `Unsupported URL protocol: ${parsed.protocol}` };
      }
    } catch {
      return { error: 'invalid_url', message: 'document_url is not a valid URL' };
    }

    // Run full pipeline with timeout
    try {
      return await this.withTimeout(async (signal) => {
        // Fix 3 (2026-04-23): handler-level fetch-failure fallback. Same pattern
        // as handleVerifyWhitepaper. If provided document_url throws (404, etc.),
        // fall through to tieredDiscovery and record attempts for the deliverable.
        const discoveryAttempts: DiscoveryAttempt[] = [];
        let runResult: Awaited<ReturnType<typeof this.runL1L2>> | null = null;
        let selectedTier: number = 1;
        let selectedStatus: DiscoveryStatus = 'provided';

        // Phase 1: attempt provided document_url
        try {
          runResult = await this.runL1L2(documentUrl, projectName, reqAddr, requirementText, costTracker, signal);
          discoveryAttempts.push({
            tier: 1,
            status: 'provided',
            structuralScore: runResult.structuralScore,
            claimCount: runResult.claims.length,
          });
        } catch (err) {
          if ((err as Error).message === 'Pipeline timeout') throw err;
          const errMsg = (err as Error).message;
          log.warn('full_tech document_url fetch failed — attempting discovery fallback', {
            projectName, documentUrl: documentUrl.slice(0, 80), error: errMsg,
          });
          discoveryAttempts.push({
            tier: 1, status: 'error', note: errMsg.slice(0, 100),
          });
        }

        // Phase 2: discovery fallback if Tier 1 failed OR yielded 0 claims
        const needsDiscovery = !runResult || runResult.claims.length === 0;
        if (needsDiscovery && this.deps.tieredDiscovery) {
          try {
            log.info('full_tech trying discovery fallback', {
              projectName,
              reason: !runResult ? 'tier-1 fetch failed' : 'tier-1 yielded 0 claims',
            });
            const metadata: ProjectMetadata = {
              agentName: projectName,
              entityId: null,
              description: null,
              linkedUrls: [],
              category: null,
              graduationStatus: null,
            };
            const discovered = await this.deps.tieredDiscovery.discover(metadata, reqAddr ?? '');
            if (discovered && (!runResult || discovered.documentUrl !== documentUrl)) {
              const fallback = await this.runL1L2(discovered.documentUrl, projectName, reqAddr, requirementText, costTracker, signal);
              const discoveredStatus: DiscoveryStatus =
                discovered.tier === 3 ? 'community' :
                discovered.tier === 4 ? 'aggregator' :
                'primary';
              discoveryAttempts.push({
                tier: discovered.tier,
                status: discoveredStatus,
                structuralScore: fallback.structuralScore,
                claimCount: fallback.claims.length,
              });
              if (!runResult || fallback.claims.length > 0) {
                log.info('Discovery fallback succeeded for full_tech', {
                  projectName,
                  discoveredUrl: discovered.documentUrl.slice(0, 80),
                  claims: fallback.claims.length,
                  tier: discovered.tier,
                });
                runResult = fallback;
                selectedTier = discovered.tier;
                selectedStatus = discoveredStatus;
              }
            } else if (!discovered) {
              discoveryAttempts.push({ tier: 4, status: 'failed', note: 'all discovery tiers exhausted' });
            }
          } catch (err) {
            log.warn('Discovery fallback failed for full_tech', { projectName, error: (err as Error).message });
            discoveryAttempts.push({ tier: 4, status: 'error', note: (err as Error).message.slice(0, 100) });
          }
        }

        // Both Tier 1 and discovery failed — return INSUFFICIENT_DATA with attempts
        if (!runResult) {
          log.warn('full_tech Tier 1 + discovery both failed — returning INSUFFICIENT_DATA', {
            projectName, attempts: discoveryAttempts.length,
          });
          const insuffResult = this.insufficientData(input, discoveryAttempts);
          if (originalAddr) insuffResult.tokenAddress = originalAddr;
          return insuffResult;
        }

        const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp: newWp } = runResult;

        // L3: Full claim evaluation
        const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(claims, resolved.text, { requirementText, costTracker });

        // Build score array from evaluation results
        const claimScores = claims.map((c) => ({
          category: c.category as never,
          score: scores.get(c.claimId) ?? 50,
        }));

        const aggregate = this.deps.scoreAggregator.aggregate(claimScores);

        // Store verification with structural analysis (includes MiCA data)
        const tokens = costTracker.getTotalTokens();
        if (!newWp.id.startsWith('tmp-')) {
          await this.deps.verificationsRepo.deleteByWhitepaperId(newWp.id);
          await this.deps.verificationsRepo.create({
            whitepaperId: newWp.id,
            structuralScore,
            confidenceScore: aggregate.confidenceScore,
            hypeTechRatio,
            verdict: aggregate.verdict,
            totalClaims: claims.length,
            verifiedClaims: evaluations.length,
            llmTokensUsed: tokens.input + tokens.output,
            computeCostUsd: costTracker.getTotalCostUsd(),
            focusAreaScores: aggregate.focusAreaScores,
            structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
          });
        }

        const fullReport = this.deps.reportGenerator.generateFullVerification(
          {
            structuralScore,
            confidenceScore: aggregate.confidenceScore,
            hypeTechRatio,
            verdict: aggregate.verdict,
            focusAreaScores: aggregate.focusAreaScores,
            totalClaims: claims.length,
            verifiedClaims: evaluations.length,
            llmTokensUsed: tokens.input + tokens.output,
            computeCostUsd: costTracker.getTotalCostUsd(),
          },
          claims,
          evaluations,
          newWp as never,
          scores,
          analysis,
        );

        // Requirement-aware synthesis: focused analysis addressing buyer's specific question
        if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil)/i.test(requirementText)) {
          const synthesis = await this.generateSynthesis(requirementText, projectName, claims, resolved.text, costTracker);
          if (synthesis) fullReport.logicSummary = synthesis;
        }

        if (originalAddr) fullReport.tokenAddress = originalAddr;

        // Fix 3: attach tier provenance to the successful deliverable
        fullReport.discoveryStatus = selectedStatus;
        fullReport.discoverySourceTier = selectedTier;
        fullReport.discoveryAttempts = discoveryAttempts;

        return fullReport;
      });
    } catch (err) {
      if ((err as Error).message === 'Pipeline timeout') {
        log.warn('Pipeline timeout in full_tech — returning INSUFFICIENT_DATA', { projectName });
        return this.insufficientData(input);
      }
      throw err;
    }
  }

  private async handleDailyBriefing(input: Record<string, unknown>) {
    const MAX_BRIEFING_SIZE = 10;
    const MIN_SUBSTANTIVE = 3;

    // WS4B: Respect the requested date
    const requestedDate = (input.date as string | undefined)?.trim();
    const targetDate = requestedDate ?? new Date().toISOString().split('T')[0];

    let batch;
    if (requestedDate) {
      // Date-specific: filter verifications to the requested date
      batch = await this.deps.verificationsRepo.getVerificationsByDate(requestedDate);
      // If no verifications for the exact date, backfill from recent activity
      // An empty briefing for a valid date indicates a discovery pipeline gap
      if (batch.length === 0) {
        log.info('Briefing: no verifications for requested date — backfilling from recent', { requestedDate });
        const recent = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE * 3);
        batch = recent.filter(v => (v.totalClaims ?? 0) > 0).slice(0, MAX_BRIEFING_SIZE);
      }
    } else {
      // No date specified: use latest batch + backfill with recent
      batch = await this.deps.verificationsRepo.getLatestDailyBatch();
      // Filter out 0-claim entries (L1-only noise)
      batch = batch.filter(v => (v.totalClaims ?? 0) > 0);
      if (batch.length < MAX_BRIEFING_SIZE) {
        const recent = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE * 3);
        const seen = new Set(batch.map((v) => v.id));
        for (const v of recent) {
          if (!seen.has(v.id) && (v.totalClaims ?? 0) > 0) {
            batch.push(v);
            if (batch.length >= MAX_BRIEFING_SIZE) break;
          }
        }
      }
    }

    batch = batch.slice(0, MAX_BRIEFING_SIZE);

    if (batch.length === 0) {
      const briefing = this.deps.reportGenerator.generateDailyBriefing([]);
      briefing.date = targetDate;
      return briefing;
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

    // WS4C: Prioritize projects with substantive data (claims > 0)
    const withClaims = reports.filter((r) => (r.claimCount ?? r.claims?.length ?? 0) > 0);
    const withoutClaims = reports.filter((r) => (r.claimCount ?? r.claims?.length ?? 0) === 0);
    const ordered = [...withClaims, ...withoutClaims].slice(0, MAX_BRIEFING_SIZE);

    // If fewer than MIN_SUBSTANTIVE have claims, only include those that do
    // (3 well-analyzed > 10 empty)
    const finalReports = withClaims.length >= MIN_SUBSTANTIVE
      ? ordered
      : withClaims.length > 0
        ? withClaims
        : ordered; // fallback: include all if none have claims

    // Deduplicate by tokenAddress — keep only the entry with the most claims per address
    const deduped = new Map<string, typeof finalReports[0]>();
    for (const report of finalReports) {
      const key = (report.tokenAddress as string)?.toLowerCase() ?? report.projectName;
      const existing = deduped.get(key);
      const existingClaims = existing ? (existing.claimCount ?? existing.claims?.length ?? 0) : -1;
      const newClaims = report.claimCount ?? report.claims?.length ?? 0;
      if (!existing || newClaims > existingClaims) {
        deduped.set(key, report);
      }
    }
    const dedupedReports = Array.from(deduped.values());

    // Phase 4: Quality filter — exclude 0-claim entries from briefings.
    // These are verifications where discovery succeeded but ClaimExtractor
    // found nothing substantive. Including them pollutes the briefing.
    const qualityFiltered = dedupedReports.filter((report) => {
      const claimCount = report.claimCount ?? report.claims?.length ?? 0;
      return claimCount > 0;
    });
    // If ALL entries have 0 claims, include them rather than returning nothing
    const briefingReports = qualityFiltered.length > 0 ? qualityFiltered : dedupedReports;

    const briefing = this.deps.reportGenerator.generateDailyBriefing(briefingReports);
    briefing.date = targetDate;
    return briefing;
  }

  /** Race a pipeline function against PIPELINE_TIMEOUT_MS. Clears the timer on both paths to prevent unhandled rejections. */
  private async withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const { signal } = controller;
    const timeoutId = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
    try {
      const result = await fn(signal);
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (signal.aborted) {
        throw new Error('Pipeline timeout');
      }
      throw err;
    }
  }

  /** Extract buyer's analytical requirement from the input, if present. */
  private extractRequirementText(input: Record<string, unknown>): string | null {
    if (typeof input._requirementText === 'string' && input._requirementText.length > 10) {
      return input._requirementText;
    }
    return null;
  }

  /**
   * Generate a focused analysis synthesis that directly addresses the buyer's question.
   * Only fires when requirementText contains analytical keywords.
   * Shared by handleVerifyWhitepaper and handleFullVerification.
   */
  private async generateSynthesis(
    requirementText: string,
    projectName: string,
    claims: Array<{ category: string; claimText: string; statedEvidence: string }>,
    documentText: string,
    costTracker: CostTracker,
  ): Promise<string | null> {
    if (!this.deps.anthropicClient) return null;

    const model = process.env.WPV_MODEL || 'claude-sonnet-4-20250514';
    try {
      const response = await this.deps.anthropicClient.messages.create({
        model,
        max_tokens: 2048,
        system: 'You are a DeFi protocol analyst. Based on the extracted claims and source document, provide a focused technical analysis that directly addresses the buyer\'s question. Be specific and quantitative where possible. If the document lacks sufficient data, state what is missing.',
        messages: [{
          role: 'user',
          content: `Buyer's requirement: "${requirementText}"\n\nProject: ${projectName}\n\nExtracted claims:\n${claims.map(c => `- [${c.category}] ${c.claimText} (evidence: ${c.statedEvidence})`).join('\n')}\n\nSource document excerpt:\n${documentText.slice(0, 20000)}\n\nProvide a focused analysis addressing the buyer's specific question.`,
        }],
      });

      // Track cost regardless of response content shape
      costTracker.recordUsage(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          return block.text;
        }
      }
    } catch (err) {
      log.warn('Analysis synthesis failed', { projectName, error: (err as Error).message });
    }
    return null;
  }

  /** Returns true if the name contains violation keywords — do not cache */
  private static hasViolationKeywords(name: string): boolean {
    const lower = name.toLowerCase();
    return /\bscam\b|\bfraud\b|\brug\s*pull\b|\bnsfw\b|\bexplicit\b|\bporn\b|\bhack\b|\bexploit\b|\bphish\b/.test(lower);
  }

  /**
   * Find a usable whitepaper by project_name or token_address.
   * Skips 0-claim entries — a cached failure is not a cached result.
   * If the only matching entries have 0 claims, returns null so handlers
   * fall through to live discovery (which may find new data and self-heal the DB).
   */
  private async findWhitepaper(input: Record<string, unknown>) {
    const projectName = input.project_name as string | undefined;
    const tokenAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;

    // Fix 2 (2026-04-23): name-path preference. Name lookup (exact + version-strip
    // fallback) runs first. If it yields any usable candidate, return it and skip
    // address-path. Address-path only consulted when name-path returns nothing.
    // See findBestWhitepaper for the same rationale.
    const nameResults: Array<{ id: string }> = [];

    if (projectName) {
      const results = await this.deps.whitepaperRepo.findByProjectName(projectName);
      nameResults.push(...results);

      if (results.length === 0) {
        const stripped = stripVersionSuffix(projectName);
        if (stripped) {
          const requestedVersion = projectName.match(/\b(v\d+)\b/i)?.[1]?.toLowerCase();
          const strippedResults = await this.deps.whitepaperRepo.findByProjectName(stripped);

          if (strippedResults.length > 0 && requestedVersion) {
            const versionMatched = strippedResults.filter((wp) => {
              const wpName = ((wp as Record<string, unknown>).projectName as string ?? '').toLowerCase();
              const wpUrl = ((wp as Record<string, unknown>).documentUrl as string ?? '').toLowerCase();
              return wpName.includes(requestedVersion) || wpUrl.includes(requestedVersion);
            });
            if (versionMatched.length > 0) {
              nameResults.push(...versionMatched);
              log.info('findWhitepaper: version-strip fallback (version-filtered)', {
                original: projectName, stripped, requestedVersion,
                total: strippedResults.length, matched: versionMatched.length,
              });
            } else {
              log.info('findWhitepaper: version mismatch — skipping cache', {
                original: projectName, stripped, requestedVersion,
              });
            }
          } else if (strippedResults.length > 0) {
            nameResults.push(...strippedResults);
            log.info('findWhitepaper: version-strip fallback matched', { original: projectName, stripped, matches: strippedResults.length });
          }
        }
      }
    }

    // Phase 1: name-path — return first usable (claims > 0) match
    for (const wp of nameResults) {
      const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
      if (claims.length > 0) {
        log.info('findWhitepaper: name-path match', { projectName, wpId: wp.id });
        return wp;
      }
    }

    // Phase 2: address-path only if name-path yielded nothing usable
    if (tokenAddress) {
      const addrResults = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
      for (const wp of addrResults) {
        // Skip if already considered via name-path (0-claim row)
        if (nameResults.some((r) => r.id === wp.id)) continue;
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        if (claims.length > 0) {
          log.info('findWhitepaper: address-path match (no name-path hit)', {
            projectName, tokenAddress: tokenAddress.slice(0, 10), wpId: wp.id,
          });
          return wp;
        }
      }
      if (addrResults.length > 0 && nameResults.length > 0) {
        log.info('findWhitepaper: all candidates have 0 claims — treating as cache miss', {
          projectName, tokenAddress: tokenAddress.slice(0, 10),
          candidates: nameResults.length + addrResults.length,
        });
      }
    } else if (nameResults.length > 0) {
      log.info('findWhitepaper: all name candidates have 0 claims — treating as cache miss', {
        projectName, candidates: nameResults.length,
      });
    }

    return null;
  }

  /**
   * Find the BEST whitepaper for a token.
   *
   * Fix 2 (2026-04-23): name-path preference. If name lookup (exact + version-aware
   * strip fallback) yields any usable (claims > 0) candidate, return the best
   * name-path match immediately. Only consult `findByTokenAddress` when name
   * lookup returns nothing usable. Previously both paths merged and sorted by
   * claim count, which allowed a richer unrelated-version address hit to beat
   * a correct name hit (eval Job 1243: V3 request returned V2 cached row).
   *
   * Skips 0-claim entries entirely — a cached failure is not a cached result.
   * Returns null if all candidates have 0 claims, so handlers fall through to
   * discovery.
   */
  private async findBestWhitepaper(input: Record<string, unknown>) {
    const projectName = input.project_name as string | undefined;
    const tokenAddress = (input._originalTokenAddress ?? input.token_address) as string | undefined;

    // ── Phase 1: name-path lookup (exact + version-aware strip fallback) ──
    const nameCandidates: Array<{ wp: Record<string, unknown>; claimCount: number }> = [];

    if (projectName) {
      let byName = await this.deps.whitepaperRepo.findByProjectName(projectName);

      // Version-strip fallback: "Aave V3" → try "Aave"
      if (byName.length === 0) {
        const stripped = stripVersionSuffix(projectName);
        if (stripped) {
          const requestedVersion = projectName.match(/\b(v\d+)\b/i)?.[1]?.toLowerCase();
          const strippedResults = await this.deps.whitepaperRepo.findByProjectName(stripped);

          if (strippedResults.length > 0 && requestedVersion) {
            const versionMatched = strippedResults.filter((wp) => {
              const wpName = ((wp as Record<string, unknown>).projectName as string ?? '').toLowerCase();
              const wpUrl = ((wp as Record<string, unknown>).documentUrl as string ?? '').toLowerCase();
              return wpName.includes(requestedVersion) || wpUrl.includes(requestedVersion);
            });
            if (versionMatched.length > 0) {
              byName = versionMatched;
              log.info('findBestWhitepaper: version-strip fallback (version-filtered)', {
                original: projectName, stripped, requestedVersion,
                total: strippedResults.length, matched: versionMatched.length,
              });
            } else {
              log.info('findBestWhitepaper: version mismatch — skipping cache', {
                original: projectName, stripped, requestedVersion,
                cachedNames: strippedResults.slice(0, 3).map((wp) => (wp as Record<string, unknown>).projectName),
              });
            }
          } else if (strippedResults.length > 0) {
            byName = strippedResults;
            log.info('findBestWhitepaper: version-strip fallback matched', { original: projectName, stripped, matches: byName.length });
          }
        }
      }

      for (const wp of byName) {
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        nameCandidates.push({ wp: wp as Record<string, unknown>, claimCount: claims.length });
      }
    }

    // Name-path wins if it has any usable candidate — return best of name-path
    const usableByName = nameCandidates.filter((c) => c.claimCount > 0);
    if (usableByName.length > 0) {
      usableByName.sort((a, b) => b.claimCount - a.claimCount);
      log.info('findBestWhitepaper: name-path match (preferred over address-path)', {
        projectName,
        best: (usableByName[0].wp as { projectName: string }).projectName,
        bestClaims: usableByName[0].claimCount,
      });
      return usableByName[0].wp;
    }

    // ── Phase 2: address-path only if name-path yielded nothing usable ──
    const addrCandidates: Array<{ wp: Record<string, unknown>; claimCount: number }> = [];

    if (tokenAddress) {
      const byAddr = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
      for (const wp of byAddr) {
        // Avoid rows already considered via name-path
        if (nameCandidates.some((c) => (c.wp as { id: string }).id === wp.id)) continue;
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        addrCandidates.push({ wp: wp as Record<string, unknown>, claimCount: claims.length });
      }
    }

    const usableByAddr = addrCandidates.filter((c) => c.claimCount > 0);
    if (usableByAddr.length === 0) {
      const totalCandidates = nameCandidates.length + addrCandidates.length;
      if (totalCandidates > 0) {
        log.info('findBestWhitepaper: all candidates have 0 claims — treating as cache miss', {
          projectName, tokenAddress: tokenAddress?.slice(0, 10), candidates: totalCandidates,
        });
      }
      return null;
    }

    usableByAddr.sort((a, b) => b.claimCount - a.claimCount);

    log.info('findBestWhitepaper: address-path match (no name-path hit)', {
      projectName,
      tokenAddress: tokenAddress?.slice(0, 10),
      best: (usableByAddr[0].wp as { projectName: string }).projectName,
      bestClaims: usableByAddr[0].claimCount,
    });

    return usableByAddr[0].wp;
  }

  /**
   * Return a flat response with all expected fields zeroed/empty.
   * Virtuals evaluators check that the response matches the offering's deliverable schema.
   * A bare `{ error: "not_in_database" }` gets flagged as "unrelated to the requested audit."
   *
   * Fix 3 (2026-04-23): accepts optional discoveryAttempts array. When a handler
   * has attempted Tier 1 (provided URL) and/or subsequent tiers before giving up,
   * the attempts are surfaced in the deliverable so the evaluator can see the
   * agent tried to recover. Previously `discoveryAttempts: []` triggered eval
   * Job 1249 rejection ("the agent should also be robust enough to search").
   */
  private insufficientData(
    input?: Record<string, unknown>,
    discoveryAttempts?: DiscoveryAttempt[],
  ) {
    return {
      projectName: (input?.project_name as string) ?? 'Unknown',
      tokenAddress: (input?.token_address as string) ?? null,
      structuralScore: 0,
      verdict: 'INSUFFICIENT_DATA' as const,
      hypeTechRatio: 0,
      claimCount: 0,
      claimsMicaCompliance: 'NOT_MENTIONED' as const,
      micaCompliant: 'NOT_APPLICABLE' as const,
      micaSummary: 'No documentation found for this project.',
      generatedAt: new Date().toISOString(),
      claims: [],
      claimScores: {},
      logicSummary: 'No whitepaper or documentation could be discovered for this project.',
      confidenceScore: 0,
      evaluations: [],
      focusAreaScores: {},
      llmTokensUsed: 0,
      computeCostUsd: 0,
      discoveryStatus: 'failed' as DiscoveryStatus,
      discoverySourceTier: null,
      discoveryAttempts: discoveryAttempts ?? [],
    };
  }

  private notInDatabase(input?: Record<string, unknown>) {
    const base = {
      projectName: (input?.project_name as string) ?? 'Unknown',
      tokenAddress: (input?.token_address as string) ?? null,
      structuralScore: 0,
      verdict: 'NOT_IN_DATABASE' as const,
      hypeTechRatio: 0,
      claimCount: 0,
      claimsMicaCompliance: 'NOT_MENTIONED' as const,
      micaCompliant: 'NOT_APPLICABLE' as const,
      micaSummary: 'Project not in database.',
      generatedAt: new Date().toISOString(),
      // TokenomicsAuditReport fields
      claims: [],
      claimScores: {},
      logicSummary: 'Project not found in verification database.',
      // FullVerificationReport fields
      confidenceScore: 0,
      evaluations: [],
      focusAreaScores: {},
      llmTokensUsed: 0,
      computeCostUsd: 0,
    };
    return base;
  }

  /**
   * Fix 4 (2026-04-23): verdict downgrade on version mismatch.
   *
   * When the buyer's request specified a version (e.g., "Uniswap V3") and the
   * delivered report's projectName doesn't carry that version token, downgrade
   * verdict to INSUFFICIENT_DATA rather than silently serving different-version
   * content. Safety net for Fix 2 edge cases (e.g., live discovery returns a
   * V2 GitHub PDF for a V3 request). See eval Job 1243.
   *
   * Mutates and returns the report. No-op when no version in request, or when
   * versions align.
   */
  private maybeDowngradeForVersionMismatch<T extends Record<string, unknown>>(
    report: T,
    requestedProjectName: string | undefined,
  ): T {
    if (!requestedProjectName) return report;
    // Only applies to report-shaped objects — skip error envelopes and other non-report returns.
    if (typeof report.projectName !== 'string' || typeof report.verdict !== 'string') return report;

    const versionMatch = requestedProjectName.match(/\b(v\d+)\b/i);
    if (!versionMatch) return report;

    const requestedVersion = versionMatch[1].toLowerCase();
    const deliveredName = report.projectName.toLowerCase();
    const deliveredSummary = typeof report.logicSummary === 'string' ? report.logicSummary : '';

    // If the delivered projectName contains the requested version, versions align — no-op.
    if (deliveredName.includes(requestedVersion)) return report;

    // Also skip if verdict is already INSUFFICIENT_DATA — nothing to downgrade.
    if (report.verdict === 'INSUFFICIENT_DATA') return report;

    // Version mismatch. Downgrade verdict and replace logicSummary with explanation.
    log.warn('Version mismatch detected — downgrading verdict to INSUFFICIENT_DATA', {
      requested: requestedProjectName,
      delivered: report.projectName,
      requestedVersion,
    });
    (report as Record<string, unknown>).verdict = 'INSUFFICIENT_DATA';
    const note = `Version mismatch: buyer requested '${requestedProjectName}' but only '${report.projectName}' was found. ` +
                 `The ${requestedVersion.toUpperCase()} documentation could not be located — returning INSUFFICIENT_DATA rather than serve different-version content.`;
    // Preserve existing logicSummary as a suffix for debuggability if present
    (report as Record<string, unknown>).logicSummary = deliveredSummary
      ? `${note}\n\n---\nOriginal analysis (different version) below:\n${deliveredSummary}`
      : note;
    return report;
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
