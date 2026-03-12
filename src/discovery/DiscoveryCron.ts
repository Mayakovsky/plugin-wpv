// ════════════════════════════════════════════
// WS-A6: DiscoveryCron
// Daily discovery orchestrator. Depends on all other A workstreams.
// Flow: chain events → enrich → resolve → score → filter → store
// ════════════════════════════════════════════

import type { DiscoveryRunResult, ProjectCandidate, SelectionSignal, WhitepaperStatus } from '../types';
import type { BaseChainListener } from './BaseChainListener';
import type { AcpMetadataEnricher } from './AcpMetadataEnricher';
import type { WhitepaperSelector } from './WhitepaperSelector';
import type { CryptoContentResolver } from './CryptoContentResolver';
import type { WpvWhitepapersRepo } from '../db/wpvWhitepapersRepo';
import { TECHNICAL_CLAIM_KEYWORDS, TECHNICAL_CLAIMS_MIN_HITS, MIN_PAGE_COUNT, FRESHNESS_WINDOW_MS } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'DiscoveryCron' });

/** Called after a whitepaper is stored; return a knowledge item ID to link back. */
export type OnIngestHook = (whitepaperId: string, documentUrl: string, text: string, projectName: string) => Promise<string | null>;

export interface DiscoveryCronDeps {
  chainListener: BaseChainListener;
  enricher: AcpMetadataEnricher;
  selector: WhitepaperSelector;
  resolver: CryptoContentResolver;
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

    const candidates: (ProjectCandidate & { resolvedText?: string })[] = [];

    // 2-4. Enrich, resolve, build signals for each token
    for (const token of tokens) {
      try {
        // Enrich via ACP
        const metadata = await this.deps.enricher.enrichToken(token.contractAddress);
        if (!metadata) continue;

        // Find a document URL
        const documentUrl = metadata.linkedUrls.find(
          (u) => u.endsWith('.pdf') || u.includes('ipfs')
        ) ?? metadata.linkedUrls[0] ?? null;

        if (!documentUrl) continue;

        // Resolve the document to get text and page count
        let text = '';
        let pageCount = 0;
        try {
          const resolved = await this.deps.resolver.resolveWhitepaper(documentUrl);
          text = resolved.text;
          pageCount = resolved.pageCount;
        } catch (err) {
          errors.push({
            url: documentUrl,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        // Build selection signals
        const signals: SelectionSignal = {
          hasLinkedPdf: documentUrl.endsWith('.pdf') || documentUrl.includes('ipfs'),
          documentLengthOk: pageCount > MIN_PAGE_COUNT,
          technicalClaimsDetected: this.detectTechnicalClaims(text),
          marketTraction: false, // Default — could integrate CoinGecko/DeFiLlama later
          notAFork: true, // Default — no fork detection yet
          isFresh: (Date.now() - token.timestamp * 1000) < FRESHNESS_WINDOW_MS,
        };

        candidates.push({
          tokenAddress: token.contractAddress,
          metadata,
          documentUrl,
          signals,
          resolvedText: text,
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
    const filtered = this.deps.selector.filterProjects(candidates) as (ProjectCandidate & { resolvedText?: string })[];
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
          status: 'INGESTED' as WhitepaperStatus,
          selectionScore: candidate.score ?? 0,
          metadataJson: candidate.metadata as unknown as Record<string, unknown>,
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
