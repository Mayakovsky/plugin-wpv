// ════════════════════════════════════════════
// WS-A6: DiscoveryCron
// Daily discovery orchestrator. Depends on all other A workstreams.
// Flow: chain events → enrich → tiered discovery → score → filter → store
// ════════════════════════════════════════════

import type { DiscoveryRunResult, ProjectCandidate, SelectionSignal, WhitepaperStatus, DocumentSource } from '../types';
import type { BaseChainListener } from './BaseChainListener';
import type { AcpMetadataEnricher } from './AcpMetadataEnricher';
import type { WhitepaperSelector } from './WhitepaperSelector';
import type { TieredDocumentDiscovery } from './TieredDocumentDiscovery';
import type { WpvWhitepapersRepo } from '../db/wpvWhitepapersRepo';
import { TECHNICAL_CLAIM_KEYWORDS, TECHNICAL_CLAIMS_MIN_HITS, MIN_PAGE_COUNT, FRESHNESS_WINDOW_MS } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'DiscoveryCron' });

/** Called after a whitepaper is stored; return a knowledge item ID to link back. */
export type OnIngestHook = (whitepaperId: string, documentUrl: string, text: string, projectName: string) => Promise<string | null>;

/** Extended candidate with resolution data */
interface ResolvedCandidate extends ProjectCandidate {
  resolvedText?: string;
  resolvedPageCount?: number;
  resolvedIsImageOnly?: boolean;
  documentSource?: DocumentSource;
  discoveryTier?: number;
}

export interface DiscoveryCronDeps {
  chainListener: BaseChainListener;
  enricher: AcpMetadataEnricher;
  selector: WhitepaperSelector;
  tieredDiscovery: TieredDocumentDiscovery;
  whitepaperRepo: WpvWhitepapersRepo;
  /** Optional hook to mirror ingested whitepapers to the knowledge store. */
  onIngest?: OnIngestHook;
}

export class DiscoveryCron {
  constructor(private deps: DiscoveryCronDeps) {}

  /**
   * Run the daily discovery pipeline.
   * Individual token failures log and continue — never abort the batch.
   */
  async runDaily(): Promise<DiscoveryRunResult> {
    const startTime = Date.now();
    const errors: { url: string; error: string }[] = [];
    let candidatesFound = 0;
    let candidatesAboveThreshold = 0;
    let whitepapersIngested = 0;

    // 1. Get new tokens
    const lastBlock = this.deps.chainListener.getLastProcessedBlock();
    const tokens = await this.deps.chainListener.getNewTokensSince(lastBlock);
    log.info('Discovery: tokens scanned', { count: tokens.length });

    const candidates: ResolvedCandidate[] = [];

    // 2-4. Enrich, discover document (multi-tier), build signals
    for (const token of tokens) {
      try {
        // Enrich via ACP — use agentToken (graduated agent) if available
        const lookupAddress = token.agentToken || token.contractAddress;
        const metadata = await this.deps.enricher.enrichToken(lookupAddress);
        if (!metadata) continue;

        // Multi-tier document discovery
        const discovery = await this.deps.tieredDiscovery.discover(metadata, lookupAddress);
        if (!discovery) {
          errors.push({ url: lookupAddress, error: 'all_discovery_tiers_failed' });
          continue;
        }

        const { resolved, documentUrl, documentSource, tier } = discovery;

        // Skip password-protected or image-only documents
        if (resolved.isPasswordProtected) {
          log.info('Skipping password-protected document', { url: documentUrl });
          errors.push({ url: documentUrl, error: 'password_protected' });
          continue;
        }
        if (resolved.isImageOnly) {
          log.info('Skipping image-only document (no text layer)', { url: documentUrl });
          errors.push({ url: documentUrl, error: 'image_only' });
          continue;
        }

        // Build selection signals
        const signals: SelectionSignal = {
          hasLinkedPdf: documentSource === 'pdf' || documentSource === 'ipfs',
          documentLengthOk: resolved.pageCount > MIN_PAGE_COUNT,
          technicalClaimsDetected: this.detectTechnicalClaims(resolved.text),
          marketTraction: false, // Replaced in 1.6B
          notAFork: true, // Replaced in 1.6C
          isFresh: (Date.now() - token.timestamp * 1000) < FRESHNESS_WINDOW_MS,
        };

        candidates.push({
          tokenAddress: token.contractAddress,
          metadata,
          documentUrl,
          signals,
          resolvedText: resolved.text,
          resolvedPageCount: resolved.pageCount,
          resolvedIsImageOnly: resolved.isImageOnly,
          documentSource,
          discoveryTier: tier,
        });

        candidatesFound++;
      } catch (err) {
        errors.push({
          url: token.contractAddress,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 5. Filter via selector
    const filtered = this.deps.selector.filterProjects(candidates) as ResolvedCandidate[];
    candidatesAboveThreshold = filtered.length;

    // 6. Store passing candidates + optionally mirror to knowledge store
    for (const candidate of filtered) {
      try {
        const projectName = candidate.metadata.agentName ?? candidate.tokenAddress;
        const row = await this.deps.whitepaperRepo.create({
          projectName,
          tokenAddress: candidate.tokenAddress,
          chain: 'base',
          documentUrl: candidate.documentUrl!,
          ipfsCid: null,
          pageCount: candidate.resolvedPageCount ?? 0,
          status: 'INGESTED' as WhitepaperStatus,
          selectionScore: candidate.score ?? 0,
          metadataJson: {
            ...(candidate.metadata as unknown as Record<string, unknown>),
            isImageOnly: candidate.resolvedIsImageOnly ?? false,
            documentSource: candidate.documentSource ?? 'pdf',
            discoveryTier: candidate.discoveryTier ?? 1,
          },
        });
        whitepapersIngested++;

        // Mirror to autognostic knowledge store if hook provided
        if (this.deps.onIngest && candidate.resolvedText) {
          try {
            const knowledgeItemId = await this.deps.onIngest(
              row.id, candidate.documentUrl!, candidate.resolvedText, projectName,
            );
            if (knowledgeItemId) {
              await this.deps.whitepaperRepo.updateKnowledgeItemId(row.id, knowledgeItemId);
            }
          } catch (err) {
            log.warn('Knowledge mirror failed (non-fatal)', {
              whitepaperId: row.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        errors.push({
          url: candidate.documentUrl ?? candidate.tokenAddress,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const durationMs = Date.now() - startTime;

    log.info('Discovery run complete', {
      tokensScanned: tokens.length,
      candidatesFound,
      candidatesAboveThreshold,
      whitepapersIngested,
      errors: errors.length,
      durationMs,
    });

    return {
      tokensScanned: tokens.length,
      candidatesFound,
      candidatesAboveThreshold,
      whitepapersIngested,
      errors,
      durationMs,
    };
  }

  /**
   * Lightweight keyword scan for technical claims.
   * NOT the full structural analysis — just a fast pre-filter.
   */
  private detectTechnicalClaims(text: string): boolean {
    const lowerText = text.toLowerCase();
    let hits = 0;

    for (const keyword of TECHNICAL_CLAIM_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        hits++;
        if (hits >= TECHNICAL_CLAIMS_MIN_HITS) return true;
      }
    }

    return false;
  }
}
