// ════════════════════════════════════════════
// WpvService — Central service holding all WPV dependencies.
// Registered with Eliza runtime so actions can resolve it.
// ════════════════════════════════════════════

import { Service, type IAgentRuntime } from '@elizaos/core';
import { WpvWhitepapersRepo } from './db/wpvWhitepapersRepo';
import { WpvClaimsRepo } from './db/wpvClaimsRepo';
import { WpvVerificationsRepo } from './db/wpvVerificationsRepo';
import type { StructuralAnalyzer } from './verification/StructuralAnalyzer';
import type { ClaimExtractor } from './verification/ClaimExtractor';
import type { ClaimEvaluator } from './verification/ClaimEvaluator';
import type { ScoreAggregator } from './verification/ScoreAggregator';
import type { ReportGenerator } from './verification/ReportGenerator';
import type { CostTracker } from './verification/CostTracker';
import type { CryptoContentResolver } from './discovery/CryptoContentResolver';
import type { DiscoveryCron } from './discovery/DiscoveryCron';
import type { JobRouter } from './acp/JobRouter';
import type { ResourceHandlers } from './acp/ResourceHandlers';
import type { DrizzleDbLike, OfferingId } from './types';
import { logger } from './utils/logger';

export interface WpvServiceDeps {
  whitepaperRepo: WpvWhitepapersRepo;
  claimsRepo: WpvClaimsRepo;
  verificationsRepo: WpvVerificationsRepo;
  structuralAnalyzer: StructuralAnalyzer;
  claimExtractor: ClaimExtractor;
  claimEvaluator: ClaimEvaluator;
  scoreAggregator: ScoreAggregator;
  reportGenerator: ReportGenerator;
  costTracker: CostTracker;
  cryptoResolver: CryptoContentResolver;
  discoveryCron: DiscoveryCron;
  jobRouter: JobRouter;
  resourceHandlers: ResourceHandlers;
}

export class WpvService extends Service {
  static override serviceType = 'wpv';
  capabilityDescription = 'Whitepaper Verification Pipeline — crypto whitepaper analysis and verification';

  private deps: WpvServiceDeps | null = null;

  constructor() {
    super();
  }

  static override async start(runtime: IAgentRuntime): Promise<WpvService> {
    const instance = new WpvService();
    instance.runtime = runtime;
    await instance.initFromRuntime(runtime);
    return instance;
  }

  private async initFromRuntime(runtime: IAgentRuntime): Promise<void> {
    try {
      const db = await this.resolveDb(runtime);
      if (!db) {
        logger.warn('WpvService: Could not resolve database — repos will not be initialized');
        return;
      }
      const whitepaperRepo = new WpvWhitepapersRepo(db);
      const claimsRepo = new WpvClaimsRepo(db);
      const verificationsRepo = new WpvVerificationsRepo(db);
      this.setDeps({
        whitepaperRepo,
        claimsRepo,
        verificationsRepo,
      } as WpvServiceDeps);
      logger.info(`WpvService: Initialized with database repos (hasWhitepaperRepo=${!!this.whitepaperRepo}, depsSet=${!!this.deps})`);

      // Register offering handlers with AcpService if available
      this.registerWithAcp(runtime);
    } catch (err) {
      logger.warn(`WpvService: Init failed — ${(err as Error).message}`);
    }
  }

  private async resolveDb(runtime: IAgentRuntime): Promise<DrizzleDbLike | null> {
    const rt = runtime as unknown as Record<string, unknown>;

    // Try runtime.adapter.db (ElizaOS 1.6.x pattern)
    if (rt.adapter) {
      const adapter = rt.adapter as Record<string, unknown>;
      if (adapter.db && typeof (adapter.db as Record<string, unknown>).select === 'function') {
        return adapter.db as DrizzleDbLike;
      }
    }

    // Try runtime.databaseAdapter.db
    if (rt.databaseAdapter) {
      const adapter = rt.databaseAdapter as Record<string, unknown>;
      if (adapter.db && typeof (adapter.db as Record<string, unknown>).select === 'function') {
        return adapter.db as DrizzleDbLike;
      }
    }

    // Try runtime.getService('sql')
    if (typeof rt.getService === 'function') {
      for (const key of ['sql', 'db', 'database']) {
        try {
          const svc = (rt.getService as (k: string) => unknown)(key) as Record<string, unknown> | null;
          if (svc?.db && typeof (svc.db as Record<string, unknown>).select === 'function') {
            return svc.db as DrizzleDbLike;
          }
        } catch { /* ignore */ }
      }
    }

    return null;
  }

  /**
   * Register WPV offering handlers with AcpService (plugin-acp).
   * Called during init if AcpService is available.
   * If AcpService is not loaded (e.g., no ACP credentials), this is a no-op.
   */
  private registerWithAcp(runtime: IAgentRuntime): void {
    try {
      const acpService = runtime.getService('acp') as {
        registerOfferingHandler?: (id: string, handler: (input: { requirement: Record<string, unknown> }) => Promise<unknown>) => void;
      } | null;

      if (!acpService?.registerOfferingHandler) {
        logger.info('WpvService: AcpService not available — skipping ACP handler registration (Grey will operate in standalone mode)');
        return;
      }

      const offerings: OfferingId[] = [
        'project_legitimacy_scan',
        'tokenomics_sustainability_audit',
        'verify_project_whitepaper',
        'full_technical_verification',
        'daily_technical_briefing',
      ];

      for (const offeringId of offerings) {
        acpService.registerOfferingHandler(offeringId, async (input) => {
          if (!this.deps?.jobRouter) {
            return { error: 'wpv_not_ready', message: 'WPV JobRouter not initialized' };
          }
          return this.deps.jobRouter.handleJob(offeringId, input.requirement);
        });
      }

      logger.info(`WpvService: Registered ${offerings.length} offering handlers with AcpService`);
    } catch (err) {
      logger.warn(`WpvService: ACP registration failed — ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    // Cleanup if needed
  }

  setDeps(deps: WpvServiceDeps): void {
    this.deps = deps;
  }

  getDeps(): WpvServiceDeps | null {
    return this.deps;
  }

  get discoveryCron() { return this.deps?.discoveryCron ?? null; }
  get jobRouter() { return this.deps?.jobRouter ?? null; }
  get resourceHandlers() { return this.deps?.resourceHandlers ?? null; }
  get costTracker() { return this.deps?.costTracker ?? null; }
  get whitepaperRepo() { return this.deps?.whitepaperRepo ?? null; }
  get verificationsRepo() { return this.deps?.verificationsRepo ?? null; }
}
