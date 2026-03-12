// ════════════════════════════════════════════
// WpvService — Central service holding all WPV dependencies.
// Registered with Eliza runtime so actions can resolve it.
// ════════════════════════════════════════════

import { Service, type IAgentRuntime } from '@elizaos/core';
import type { WpvWhitepapersRepo } from './db/wpvWhitepapersRepo';
import type { WpvClaimsRepo } from './db/wpvClaimsRepo';
import type { WpvVerificationsRepo } from './db/wpvVerificationsRepo';
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
    return instance;
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
