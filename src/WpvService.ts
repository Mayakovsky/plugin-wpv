// ════════════════════════════════════════════
// WpvService — Central service holding all WPV dependencies.
// Registered with Eliza runtime so actions can resolve it.
// ════════════════════════════════════════════

import { Service, type IAgentRuntime } from '@elizaos/core';
import { WpvWhitepapersRepo } from './db/wpvWhitepapersRepo';
import { WpvClaimsRepo } from './db/wpvClaimsRepo';
import { WpvVerificationsRepo } from './db/wpvVerificationsRepo';
import { StructuralAnalyzer } from './verification/StructuralAnalyzer';
import type { ClaimExtractor } from './verification/ClaimExtractor';
import type { ClaimEvaluator } from './verification/ClaimEvaluator';
import { ScoreAggregator } from './verification/ScoreAggregator';
import { ReportGenerator } from './verification/ReportGenerator';
import { CostTracker } from './verification/CostTracker';
import type { CryptoContentResolver } from './discovery/CryptoContentResolver';
import type { DiscoveryCron } from './discovery/DiscoveryCron';
import { JobRouter } from './acp/JobRouter';
import { ResourceHandlers } from './acp/ResourceHandlers';
import { LLM_PRICING } from './constants';
import type { DrizzleDbLike, OfferingId } from './types';
import { logger } from './utils/logger';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

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
  private acpRegistered = false;

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
      logger.info('WpvService: Database resolved');
      const whitepaperRepo = new WpvWhitepapersRepo(db);
      const claimsRepo = new WpvClaimsRepo(db);
      const verificationsRepo = new WpvVerificationsRepo(db);

      // Initialize pipeline components for cached lookups via ACP/HTTP
      const reportGenerator = new ReportGenerator();
      const costTracker = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
      const structuralAnalyzer = new StructuralAnalyzer({});
      const scoreAggregator = new ScoreAggregator();
      const resourceHandlers = new ResourceHandlers(verificationsRepo, whitepaperRepo);

      const jobRouter = new JobRouter({
        whitepaperRepo,
        verificationsRepo,
        claimsRepo,
        structuralAnalyzer,
        claimExtractor: null as never,  // L2/L3 only — not needed for cached lookups
        claimEvaluator: null as never,  // L2/L3 only
        scoreAggregator,
        reportGenerator,
        costTracker,
        cryptoResolver: null as never,  // Live pipeline only
      });

      this.setDeps({
        whitepaperRepo,
        claimsRepo,
        verificationsRepo,
        structuralAnalyzer,
        claimExtractor: null as never,
        claimEvaluator: null as never,
        scoreAggregator,
        reportGenerator,
        costTracker,
        cryptoResolver: null as never,
        discoveryCron: null as never,
        jobRouter,
        resourceHandlers,
      });
      logger.info(`WpvService: Initialized with database repos (hasWhitepaperRepo=${!!this.whitepaperRepo}, depsSet=${!!this.deps})`);

      // Register offering handlers with AcpService if available.
      // AcpService may not be ready yet (depends on plugin load order),
      // so retry after a short delay if initial attempt fails.
      this.registerWithAcp(runtime);
      if (!this.acpRegistered) {
        setTimeout(() => this.registerWithAcp(runtime), 3000);
      }
    } catch (err) {
      logger.warn(`WpvService: Init failed — ${(err as Error).message}`);
    }
  }

  private async resolveDb(runtime: IAgentRuntime): Promise<DrizzleDbLike | null> {
    // Prefer direct Supabase connection via WPV_DATABASE_URL — this is where WPV data lives.
    // The ElizaOS adapter resolves to PGlite (local), which doesn't have the autognostic schema.
    const dbUrl = runtime.getSetting('WPV_DATABASE_URL');
    if (dbUrl) {
      try {
        const sql = postgres(dbUrl);
        const db = drizzle(sql);
        // Quick connectivity test
        await sql`SELECT 1`;
        logger.info('WpvService: Connected to Supabase via WPV_DATABASE_URL');
        return db as unknown as DrizzleDbLike;
      } catch (err) {
        logger.warn(`WpvService: WPV_DATABASE_URL connection failed — ${(err as Error).message}`);
      }
    }

    // Fallback: try ElizaOS runtime adapter
    const rt = runtime as unknown as Record<string, unknown>;

    if (rt.adapter) {
      const adapter = rt.adapter as Record<string, unknown>;
      if (adapter.db && typeof (adapter.db as Record<string, unknown>).select === 'function') {
        return adapter.db as DrizzleDbLike;
      }
    }

    if (rt.databaseAdapter) {
      const adapter = rt.databaseAdapter as Record<string, unknown>;
      if (adapter.db && typeof (adapter.db as Record<string, unknown>).select === 'function') {
        return adapter.db as DrizzleDbLike;
      }
    }

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
    if (this.acpRegistered) return;
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

          // Validate token_address before processing (all offerings except daily_technical_briefing)
          if (offeringId !== 'daily_technical_briefing') {
            const tokenAddress = input.requirement?.token_address;
            if (tokenAddress !== undefined && tokenAddress !== null) {
              if (typeof tokenAddress !== 'string' ||
                  !tokenAddress.startsWith('0x') ||
                  tokenAddress.length !== 42 ||
                  !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
                const err = new Error(`Invalid token_address: expected 0x-prefixed 42-char hex address, got '${String(tokenAddress).slice(0, 50)}'`);
                err.name = 'InputValidationError';
                throw err;
              }
            }
          }

          return this.deps.jobRouter.handleJob(offeringId, input.requirement);
        });
      }

      this.acpRegistered = true;
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
