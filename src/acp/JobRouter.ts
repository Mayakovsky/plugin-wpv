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
import type { TieredDocumentDiscovery } from '../discovery/TieredDocumentDiscovery';
import { Verdict, ClaimCategory } from '../types';
import type { ProjectMetadata } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'JobRouter' });

/** Convert GitHub blob URLs to raw.githubusercontent.com */
function normalizeGitHubUrl(url: string): string {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
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
        log.info('DexScreener resolved token name', { tokenAddress: tokenAddress.slice(0, 10), name: match.baseToken.name });
        return match.baseToken.name;
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
                log.info('ERC-20 name() resolved', { tokenAddress: tokenAddress.slice(0, 10), name, rpcUrl: rpcUrl.slice(0, 30) });
                return name;
              }
            }
          }
        }
      } catch { continue; }
    }
  }

  return null;
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
  costTracker: CostTracker;
  cryptoResolver: CryptoContentResolver;
  tieredDiscovery: TieredDocumentDiscovery | null;
}

export class JobRouter {
  constructor(private deps: JobRouterDeps) {}

  async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown> {
    log.info('Routing job', { offeringId });

    // Reset cost tracker for this job — prevents cross-contamination between concurrent jobs
    this.deps.costTracker.reset();

    switch (offeringId) {
      case 'project_legitimacy_scan':
        return this.handleLegitimacyScan(input);
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
        );
        const requestedAddress = input.token_address as string | undefined;
        if (requestedAddress) {
          report.tokenAddress = requestedAddress;
        }
        return report;
      }
    }

    // Cache miss — run live L1 if discovery stack is available
    const projectName = (input.project_name as string | undefined)?.trim() ?? 'Unknown';
    const tokenAddress = (input.token_address as string | undefined)?.trim() ?? '';

    if (this.deps.tieredDiscovery) {
      try {
        const metadata: ProjectMetadata = {
          agentName: projectName,
          entityId: null,
          description: null,
          linkedUrls: [],
          category: null,
          graduationStatus: null,
        };
        const discovered = await this.deps.tieredDiscovery.discover(metadata, tokenAddress);
        if (discovered) {
          // L1: Structural analysis
          this.deps.costTracker.reset();
          this.deps.costTracker.startStage('l1');
          const analysis = await this.deps.structuralAnalyzer.analyze(
            discovered.resolved.text,
            discovered.resolved.pageCount,
          );
          const structuralScore = this.deps.structuralAnalyzer.computeQuickFilterScore(analysis);
          const hypeTechRatio = this.deps.structuralAnalyzer.computeHypeTechRatio(discovered.resolved.text);
          this.deps.costTracker.endStage('l1', 0, 0);

          // Cache the result — guard against violation keywords
          let newWpId: string;
          if (JobRouter.hasViolationKeywords(projectName)) {
            newWpId = `tmp-${Date.now()}`;
            log.warn('Skipping L1 cache write — violation keywords', { projectName });
          } else {
            const newWp = await this.deps.whitepaperRepo.create({
              projectName,
              tokenAddress,
              documentUrl: discovered.documentUrl,
              chain: tokenAddress.startsWith('0x') ? 'base' : 'solana',
              pageCount: discovered.resolved.pageCount,
              status: 'VERIFIED',
              selectionScore: 0,
            });
            newWpId = newWp.id;
          }

          const verdict = structuralScore >= 3 ? Verdict.PASS
            : structuralScore >= 2 ? Verdict.CONDITIONAL
            : Verdict.FAIL;

          if (!newWpId.startsWith('tmp-')) {
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

          const report = this.deps.reportGenerator.generateLegitimacyScan(
            { structuralScore, confidenceScore: 0, hypeTechRatio, verdict, focusAreaScores: { [ClaimCategory.TOKENOMICS]: 0, [ClaimCategory.PERFORMANCE]: 0, [ClaimCategory.CONSENSUS]: 0, [ClaimCategory.SCIENTIFIC]: 0 }, totalClaims: 0, verifiedClaims: 0, llmTokensUsed: 0, computeCostUsd: 0 },
            analysis,
            { id: newWpId, projectName, tokenAddress } as never,
          );
          if (tokenAddress) report.tokenAddress = tokenAddress;
          log.info('Live L1 scan completed', { projectName, structuralScore, verdict });
          return report;
        }
      } catch (err) {
        log.warn('Live L1 discovery failed — returning INSUFFICIENT_DATA', { projectName, error: (err as Error).message });
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
  private async runL1L2(documentUrl: string, projectName: string, tokenAddress?: string | null) {
    // Resolve the document
    const resolved = await this.deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(documentUrl));

    // L1: Structural analysis (timed)
    this.deps.costTracker.startStage('l1');
    const analysis = await this.deps.structuralAnalyzer.analyze(resolved.text, resolved.pageCount);
    const structuralScore = this.deps.structuralAnalyzer.computeQuickFilterScore(analysis);
    const hypeTechRatio = this.deps.structuralAnalyzer.computeHypeTechRatio(resolved.text);
    this.deps.costTracker.endStage('l1', 0, 0); // L1 uses no LLM tokens

    // L2: Claim extraction (timed + token tracked)
    this.deps.costTracker.startStage('l2');
    const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName);
    // Note: ClaimExtractor calls costTracker.recordUsage() internally
    // We capture the delta via getStageMetrics() after the verification

    // Store whitepaper — guard against caching violation keywords
    let wp: { id: string; projectName: string; tokenAddress?: string | null };
    if (JobRouter.hasViolationKeywords(projectName)) {
      // Don't persist poisoned entries — use a temporary in-memory record
      wp = { id: `tmp-${Date.now()}`, projectName, tokenAddress: tokenAddress ?? null };
      log.warn('Skipping cache write — project name contains violation keywords', { projectName });
    } else {
      wp = await this.deps.whitepaperRepo.create({
        projectName,
        tokenAddress: tokenAddress ?? undefined,
        documentUrl,
        chain: tokenAddress?.startsWith('0x') ? 'base' : 'unknown',
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
    }

    return { resolved, analysis, structuralScore, hypeTechRatio, claims, wp };
  }

  private async handleVerifyWhitepaper(input: Record<string, unknown>) {
    const documentUrl = (input.document_url as string | undefined)?.trim();
    const requestedTokenAddress = (input.token_address as string | undefined)?.trim() ?? null;
    let projectName = (input.project_name as string | undefined)?.trim() || '';

    // Resolve project name from token address if missing
    if (!projectName && requestedTokenAddress) {
      const resolved = await resolveTokenName(requestedTokenAddress);
      if (resolved) {
        projectName = resolved;
        input.project_name = resolved; // propagate to discovery metadata
      }
    }
    if (!projectName) projectName = 'Unknown';

    // document_url is optional per schema — if missing, try discovery
    if (!documentUrl) {
      if (this.deps.tieredDiscovery) {
        try {
          const metadata: ProjectMetadata = {
            agentName: projectName,
            entityId: null,
            description: null,
            linkedUrls: [],
            category: null,
            graduationStatus: null,
          };
          const discovered = await this.deps.tieredDiscovery.discover(metadata, requestedTokenAddress ?? '');
          if (discovered) {
            // Use discovered document URL for L1+L2+L3
            const { resolved: discResolved, analysis: discAnalysis, structuralScore: discScore, hypeTechRatio: discHype, claims: discClaims, wp: discWp } = await this.runL1L2(discovered.documentUrl, projectName, requestedTokenAddress);
            this.deps.costTracker.startStage('l3');
            const { evaluations: discEvals, scores: discScores } = await this.deps.claimEvaluator.evaluateAll(discClaims, discResolved.text);
            this.deps.costTracker.endStage('l3', 0, 0);
            const discClaimScores = discClaims.map((c) => ({ category: c.category as never, score: discScores.get(c.claimId) ?? 50 }));
            const discAggregate = this.deps.scoreAggregator.aggregate(discClaimScores);
            const report = this.deps.reportGenerator.generateTokenomicsAudit(
              { structuralScore: discScore, confidenceScore: discAggregate.confidenceScore, hypeTechRatio: discHype, verdict: discAggregate.verdict, focusAreaScores: discAggregate.focusAreaScores, totalClaims: discClaims.length, verifiedClaims: discEvals.length, llmTokensUsed: 0, computeCostUsd: 0 },
              discClaims, discWp as never, discScores, discAnalysis,
            );
            if (requestedTokenAddress) report.tokenAddress = requestedTokenAddress;
            return report;
          }
        } catch (err) {
          log.warn('Discovery failed for verify_project_whitepaper (no document_url)', { projectName, error: (err as Error).message });
        }
      }
      return this.insufficientData(input);
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

    let { resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = await this.runL1L2(documentUrl, projectName, requestedTokenAddress);

    // If provided document_url yielded 0 claims (e.g. JavaScript SPA, empty page),
    // try discovery as fallback before giving up
    if (claims.length === 0 && this.deps.tieredDiscovery && projectName !== 'Unknown') {
      try {
        log.info('document_url yielded 0 claims — trying discovery fallback', { projectName, documentUrl: documentUrl.slice(0, 80) });
        const metadata: ProjectMetadata = {
          agentName: projectName,
          entityId: null,
          description: null,
          linkedUrls: [],
          category: null,
          graduationStatus: null,
        };
        const discovered = await this.deps.tieredDiscovery.discover(metadata, requestedTokenAddress ?? '');
        if (discovered && discovered.documentUrl !== documentUrl) {
          const fallback = await this.runL1L2(discovered.documentUrl, projectName, requestedTokenAddress);
          if (fallback.claims.length > 0) {
            log.info('Discovery fallback succeeded', { projectName, discoveredUrl: discovered.documentUrl.slice(0, 80), claims: fallback.claims.length });
            ({ resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = fallback);
          }
        }
      } catch (err) {
        log.warn('Discovery fallback failed', { projectName, error: (err as Error).message });
      }
    }

    // L3: Claim evaluation (timed)
    this.deps.costTracker.startStage('l3');
    const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(claims, resolved.text);
    this.deps.costTracker.endStage('l3', 0, 0); // L3 tokens tracked via recordUsage internally

    // Build score array from evaluation results
    const claimScores = claims.map((c) => ({
      category: c.category as never,
      score: scores.get(c.claimId) ?? 50,
    }));

    const aggregate = this.deps.scoreAggregator.aggregate(claimScores);

    // Store verification with structural analysis + cost metrics
    const tokens = this.deps.costTracker.getTotalTokens();
    const stageMetrics = this.deps.costTracker.getStageMetrics();
    if (!wp.id.startsWith('tmp-')) {
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
        computeCostUsd: this.deps.costTracker.getTotalCostUsd(),
      },
      claims,
      wp as never,
      scores,
      analysis,
    );

    // Ensure requested token_address is in the report
    if (requestedTokenAddress) {
      report.tokenAddress = requestedTokenAddress;
    }

    return report;
  }

  private async handleFullVerification(input: Record<string, unknown>) {
    const reqAddr = input.token_address as string | undefined;
    let reqName = (input.project_name as string | undefined)?.trim();

    // Resolve project name from token address if missing
    if (!reqName && reqAddr) {
      const resolved = await resolveTokenName(reqAddr);
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

        // ── Cached result HAS claims → return it directly ──
        if (totalClaims > 0 && claims.length > 0) {
          log.info('Returning cached result with claims', { projectName: wpName, totalClaims });
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
          if (reqAddr) fullReport.tokenAddress = reqAddr;
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
                this.deps.costTracker.reset();
                this.deps.costTracker.startStage('l2');
                const newClaims = await this.deps.claimExtractor.extractClaims(resolved.text, wpName);
                this.deps.costTracker.endStage('l2', 0, 0);

                // L3 if available
                let evaluations: unknown[] = [];
                let scores = new Map<string, number>();
                if (this.deps.claimEvaluator) {
                  this.deps.costTracker.startStage('l3');
                  const evalResult = await this.deps.claimEvaluator.evaluateAll(newClaims, resolved.text);
                  evaluations = evalResult.evaluations;
                  scores = evalResult.scores;
                  this.deps.costTracker.endStage('l3', 0, 0);
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
                  if (reqAddr) enrichedReport.tokenAddress = reqAddr;
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
          if (reqAddr) fullReport.tokenAddress = reqAddr;
          return fullReport;
        }

        log.info('Cached result has 0 claims and enrichment failed/skipped — trying live discovery', {
          projectName: wpName,
          tokenAddress: reqAddr,
        });
        // Fall through to discovery pipeline below ↓
      }
    }

    // ── No usable cached result — try live pipeline ──
    const documentUrl = (input.document_url as string | undefined)?.trim();
    const projectName = reqName || 'Unknown';

    // If no document_url, try discovery
    if (!documentUrl && this.deps.tieredDiscovery) {
      const metadata: ProjectMetadata = {
        agentName: projectName,
        entityId: null,
        description: null,
        linkedUrls: [],
        category: null,
        graduationStatus: null,
      };
      try {
        const discovered = await this.deps.tieredDiscovery.discover(metadata, reqAddr ?? '');
        if (discovered) {
          const { resolved, analysis, structuralScore, hypeTechRatio, claims: discClaims, wp: discWp } = await this.runL1L2(discovered.documentUrl, projectName, reqAddr);
          const { evaluations, scores } = this.deps.claimEvaluator
            ? await this.deps.claimEvaluator.evaluateAll(discClaims, resolved.text)
            : { evaluations: [], scores: new Map<string, number>() };
          const claimScores = discClaims.map((c) => ({ category: c.category as never, score: scores.get(c.claimId) ?? 50 }));
          const aggregate = this.deps.scoreAggregator.aggregate(claimScores);
          const tokens = this.deps.costTracker.getTotalTokens();
          const report = this.deps.reportGenerator.generateFullVerification(
            { structuralScore, confidenceScore: aggregate.confidenceScore, hypeTechRatio, verdict: aggregate.verdict, focusAreaScores: aggregate.focusAreaScores, totalClaims: discClaims.length, verifiedClaims: evaluations.length, llmTokensUsed: tokens.input + tokens.output, computeCostUsd: this.deps.costTracker.getTotalCostUsd() },
            discClaims, evaluations as never, discWp as never, scores, analysis,
          );
          if (reqAddr) report.tokenAddress = reqAddr;
          return report;
        }
      } catch (err) {
        log.warn('Discovery failed for full_technical_verification', { error: (err as Error).message });
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
    if (!newWp.id.startsWith('tmp-')) {
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
    }

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

  private async handleDailyBriefing(input: Record<string, unknown>) {
    const MAX_BRIEFING_SIZE = 10;
    const MIN_SUBSTANTIVE = 3;

    // WS4B: Respect the requested date
    const requestedDate = (input.date as string | undefined)?.trim();
    const targetDate = requestedDate ?? new Date().toISOString().split('T')[0];

    let batch = await this.deps.verificationsRepo.getLatestDailyBatch();

    // If today's batch is short, backfill with most recent verifications
    if (batch.length < MAX_BRIEFING_SIZE) {
      const recent = await this.deps.verificationsRepo.getMostRecent(MAX_BRIEFING_SIZE);
      const seen = new Set(batch.map((v) => v.id));
      for (const v of recent) {
        if (!seen.has(v.id)) {
          batch.push(v);
          if (batch.length >= MAX_BRIEFING_SIZE) break;
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

    const briefing = this.deps.reportGenerator.generateDailyBriefing(finalReports);
    briefing.date = targetDate;
    return briefing;
  }

  /** Returns true if the name contains violation keywords — do not cache */
  private static hasViolationKeywords(name: string): boolean {
    const lower = name.toLowerCase();
    return /\bscam\b|\bfraud\b|\brug\s*pull\b|\bnsfw\b|\bexplicit\b|\bporn\b|\bhack\b|\bexploit\b|\bphish\b/.test(lower);
  }

  /**
   * Find a whitepaper by project_name or token_address.
   * Used by handleLegitimacyScan and handleDailyBriefing where any cached entry is fine.
   */
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

  /**
   * BUG-B FIX: Find the BEST whitepaper for a token — preferring entries WITH claims.
   * When multiple DB entries exist for the same project (e.g., "Uniswap" from L1 scan
   * and "Uniswap v3" from L2 verify_project_whitepaper), this returns the one with
   * the most claims rather than whichever was inserted first.
   *
   * Used by handleFullVerification where we need the richest cached data.
   */
  private async findBestWhitepaper(input: Record<string, unknown>) {
    const projectName = input.project_name as string | undefined;
    const tokenAddress = input.token_address as string | undefined;

    // Collect ALL candidate entries from both name and address lookups
    const candidates: Array<{ wp: Record<string, unknown>; claimCount: number }> = [];

    if (projectName) {
      const byName = await this.deps.whitepaperRepo.findByProjectName(projectName);
      for (const wp of byName) {
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        candidates.push({ wp: wp as Record<string, unknown>, claimCount: claims.length });
      }
    }

    if (tokenAddress) {
      const byAddr = await this.deps.whitepaperRepo.findByTokenAddress(tokenAddress);
      for (const wp of byAddr) {
        // Avoid duplicates from the name lookup
        if (candidates.some((c) => (c.wp as { id: string }).id === wp.id)) continue;
        const claims = await this.deps.claimsRepo.findByWhitepaperId(wp.id);
        candidates.push({ wp: wp as Record<string, unknown>, claimCount: claims.length });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by claimCount descending — prefer entries with the most claims
    candidates.sort((a, b) => b.claimCount - a.claimCount);

    log.info('findBestWhitepaper candidates', {
      total: candidates.length,
      best: (candidates[0].wp as { projectName: string }).projectName,
      bestClaims: candidates[0].claimCount,
    });

    return candidates[0].wp;
  }

  /**
   * Return a flat response with all expected fields zeroed/empty.
   * Virtuals evaluators check that the response matches the offering's deliverable schema.
   * A bare `{ error: "not_in_database" }` gets flagged as "unrelated to the requested audit."
   */
  private insufficientData(input?: Record<string, unknown>) {
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
