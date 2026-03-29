// ════════════════════════════════════════════
// WpvService — Central service holding all WPV dependencies.
// Registered with Eliza runtime so actions can resolve it.
// ════════════════════════════════════════════

import { Service, type IAgentRuntime } from '@elizaos/core';
import { WpvWhitepapersRepo } from './db/wpvWhitepapersRepo';
import { WpvClaimsRepo } from './db/wpvClaimsRepo';
import { WpvVerificationsRepo } from './db/wpvVerificationsRepo';
import { StructuralAnalyzer } from './verification/StructuralAnalyzer';
import { ClaimExtractor } from './verification/ClaimExtractor';
import { ClaimEvaluator } from './verification/ClaimEvaluator';
import { createAnthropicClient } from './verification/anthropicFetchClient';
import { ScoreAggregator } from './verification/ScoreAggregator';
import { ReportGenerator } from './verification/ReportGenerator';
import { CostTracker } from './verification/CostTracker';
import { CryptoContentResolver } from './discovery/CryptoContentResolver';
import { FetchContentResolver } from './discovery/FetchContentResolver';
import { TieredDocumentDiscovery } from './discovery/TieredDocumentDiscovery';
import { WebsiteScraper } from './discovery/WebsiteScraper';
import { WebSearchFallback } from './discovery/WebSearchFallback';
import { SyntheticWhitepaperComposer } from './discovery/SyntheticWhitepaperComposer';
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

      // Initialize discovery stack for live L1 scans on cache miss
      const fetchResolver = new FetchContentResolver();
      const cryptoResolver = new CryptoContentResolver(fetchResolver);
      const websiteScraper = new WebsiteScraper();
      const webSearch = new WebSearchFallback();
      const composer = new SyntheticWhitepaperComposer();
      const tieredDiscovery = new TieredDocumentDiscovery({
        resolver: cryptoResolver,
        websiteScraper,
        webSearch,
        composer,
      });

      // Initialize L2+L3 pipeline (ClaimExtractor + ClaimEvaluator)
      const anthropicApiKey = runtime.getSetting('ANTHROPIC_API_KEY') ?? process.env.ANTHROPIC_API_KEY;
      let claimExtractor: ClaimExtractor | null = null;
      let claimEvaluator: ClaimEvaluator | null = null;
      if (anthropicApiKey) {
        const anthropicClient = createAnthropicClient(anthropicApiKey);
        claimExtractor = new ClaimExtractor({ client: anthropicClient, costTracker });
        claimEvaluator = new ClaimEvaluator({ client: anthropicClient, costTracker });
        logger.info('WpvService: ClaimExtractor + ClaimEvaluator initialized (L2+L3 ready)');
      } else {
        logger.warn('WpvService: ANTHROPIC_API_KEY not set — L2+L3 pipeline unavailable');
      }

      const jobRouter = new JobRouter({
        whitepaperRepo,
        verificationsRepo,
        claimsRepo,
        structuralAnalyzer,
        claimExtractor: claimExtractor as never,
        claimEvaluator: claimEvaluator as never,
        scoreAggregator,
        reportGenerator,
        costTracker,
        cryptoResolver,
        tieredDiscovery,
      });

      this.setDeps({
        whitepaperRepo,
        claimsRepo,
        verificationsRepo,
        structuralAnalyzer,
        claimExtractor: claimExtractor as never,
        claimEvaluator: claimEvaluator as never,
        scoreAggregator,
        reportGenerator,
        costTracker,
        cryptoResolver,
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
  /**
   * Validate token_address format. Shared between pre-accept validator and handler.
   * Throws InputValidationError for invalid addresses.
   */
  /**
   * Check if an EVM address has contract bytecode on Base or Ethereum mainnet.
   * EOA wallets return "0x" (empty). Returns true if contract found on either chain.
   * On RPC failure, returns true (don't block jobs due to RPC issues).
   */
  private static async isContractAddress(address: string): Promise<boolean> {
    if (!address.startsWith('0x')) return true; // Solana — can't check, allow through

    const baseRpcUrl = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
    // Use both Base and a public Ethereum RPC to cover cross-chain addresses
    const rpcUrls = [baseRpcUrl, 'https://ethereum-rpc.publicnode.com'];

    for (const rpcUrl of rpcUrls) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getCode',
            params: [address, 'latest'],
          }),
          signal: AbortSignal.timeout(3000),
        });
        const data = await response.json() as { result?: string; error?: unknown };
        if (data.error) continue; // RPC error response — try next
        const code = data?.result;
        if (!code || code === '0x' || code === '0x0') continue; // No bytecode on this chain

        // Has bytecode — but is it a token contract or a personal smart wallet?
        // ERC-4337 account abstraction proxies start with 0xef0100 and are short (~48 chars).
        // Real token contracts (ERC-20) are much longer (thousands of chars).
        if (code.startsWith('0xef0100') && code.length < 100) {
          continue; // Smart wallet proxy (e.g., Vitalik's ERC-4337) — not a token
        }

        return true; // Real contract bytecode found
      } catch {
        continue; // Network error — try next RPC
      }
    }

    // No real contract bytecode found on any chain → likely EOA or smart wallet
    return false;
  }

  private static async validateTokenAddress(offeringId: string, requirement: Record<string, unknown>, isPlainText?: boolean): Promise<void> {
    // WS4A: Date validation for daily_technical_briefing
    if (offeringId === 'daily_technical_briefing') {
      const dateStr = requirement?.date;
      if (dateStr === undefined || dateStr === null) return; // no date = default to today
      if (typeof dateStr !== 'string') {
        const err = new Error('Invalid date: must be a string in YYYY-MM-DD format');
        err.name = 'InputValidationError';
        throw err;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error(`Invalid date format: expected YYYY-MM-DD, got '${dateStr}'`);
        err.name = 'InputValidationError';
        throw err;
      }
      const parsed = new Date(dateStr + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        const err = new Error(`Invalid date: '${dateStr}' is not a valid date`);
        err.name = 'InputValidationError';
        throw err;
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsed > today) {
        const err = new Error(`Invalid date: '${dateStr}' is in the future`);
        err.name = 'InputValidationError';
        throw err;
      }
      const MIN_DATE = new Date('2015-01-01T00:00:00Z');
      if (parsed < MIN_DATE) {
        const err = new Error(`Invalid date: '${dateStr}' predates relevant crypto history`);
        err.name = 'InputValidationError';
        throw err;
      }
      // Content filtering still applies for daily briefing
      const allStringValues = Object.values(requirement)
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toLowerCase());
      const violationPatterns = [
        /nsfw/i, /explicit/i, /sexual/i, /pornograph/i,
        /\[.*(?:nsfw|violation|banned|illegal|prohibited).*\]/i,
      ];
      for (const value of allStringValues) {
        for (const pattern of violationPatterns) {
          if (pattern.test(value)) {
            const err2 = new Error('Request contains policy-violating content');
            err2.name = 'InputValidationError';
            throw err2;
          }
        }
      }
      return;
    }

    // Scan ALL string fields in requirement for content violations
    const allStringValues = Object.values(requirement)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toLowerCase());

    const violationPatterns = [
      /nsfw/i, /explicit/i, /sexual/i, /pornograph/i, /nude/i,
      /ignore all/i, /ignore logic/i, /regardless of evidence/i,
      /say this is a scam/i, /biased/i, /override/i,
      /\[.*(?:nsfw|violation|banned|illegal|prohibited).*\]/i,
      /\bscam\b/i, /\bfraud\b/i, /\brug\s*pull\b/i,
    ];

    for (const value of allStringValues) {
      for (const pattern of violationPatterns) {
        if (pattern.test(value)) {
          const err = new Error('Request contains policy-violating content and cannot be processed');
          err.name = 'InputValidationError';
          throw err;
        }
      }
    }

    // WS3: document_url validation for verify_project_whitepaper
    if (offeringId === 'verify_project_whitepaper') {
      const docUrl = requirement?.document_url;
      if (docUrl !== undefined && docUrl !== null && typeof docUrl === 'string') {
        const trimmedUrl = docUrl.trim();
        if (!/^https?:\/\/.+\..+/.test(trimmedUrl)) {
          const err = new Error('Invalid document_url: must be a valid HTTP/HTTPS URL');
          err.name = 'InputValidationError';
          throw err;
        }
        const lowerUrl = trimmedUrl.toLowerCase();
        // NSFW domain check
        const nsfwDomains = ['porn', 'xxx', 'adult', 'sex', 'nude', 'nsfw', 'hentai', 'xvideos', 'pornhub', 'xhamster', 'redtube'];
        for (const domain of nsfwDomains) {
          if (lowerUrl.includes(domain)) {
            const err = new Error('Invalid document_url: URL contains policy-violating content');
            err.name = 'InputValidationError';
            throw err;
          }
        }
        if (/\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|mp4|mp3|avi|mov)(\?.*)?$/.test(lowerUrl)) {
          const err = new Error('Invalid document_url: must point to a document, not an image or media file');
          err.name = 'InputValidationError';
          throw err;
        }
      }
    }

    const tokenAddress = requirement?.token_address;

    // Plain-text-extracted addresses skip format validation (may be truncated)
    // but still run content filters above and eth_getCode below
    if (isPlainText && tokenAddress) return;

    if (tokenAddress !== undefined && tokenAddress !== null) {
      if (typeof tokenAddress !== 'string' || !tokenAddress.trim()) {
        const err = new Error(`Invalid token_address: expected non-empty string, got '${String(tokenAddress).slice(0, 50)}'`);
        err.name = 'InputValidationError';
        throw err;
      }

      const trimmed = tokenAddress.trim();

      // EVM: must be 0x + 20-40 hex chars (some chains use shorter addresses)
      if (trimmed.startsWith('0x')) {
        if (!/^0x[0-9a-fA-F]{20,40}$/.test(trimmed)) {
          const err = new Error(`Invalid token_address: expected 0x-prefixed hex address (22-42 chars), got '${trimmed.slice(0, 50)}'`);
          err.name = 'InputValidationError';
          throw err;
        }
        // Reject known dead/null/burn addresses — not real token contracts
        const lower = trimmed.toLowerCase();
        if (/^0x(0{40}|dead(beef)?[0-9a-f]*(dead|beef)[0-9a-f]*|f{40})$/.test(lower) ||
            /^0x(.)\1{39}$/.test(lower) ||
            /^0x([0-9a-f]{2})\1{19}$/.test(lower)) {
          const err = new Error(`Invalid token_address: burn/null address rejected — '${trimmed.slice(0, 50)}'`);
          err.name = 'InputValidationError';
          throw err;
        }
        // eth_getCode check — reject EOA wallets (no bytecode)
        const isContract = await WpvService.isContractAddress(trimmed);
        if (!isContract) {
          const err = new Error(`Invalid token_address: address is not a contract (EOA wallet) — '${trimmed.slice(0, 50)}'`);
          err.name = 'InputValidationError';
          throw err;
        }
        // Format valid + contract check passed — allow through
        return;
      }

      // Solana/other chains: alphanumeric only (base58), 26-50 chars
      // Rejects underscores, hyphens, spaces — catches garbage strings
      // Accepts valid Solana base58 addresses like JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
      if (!/^[a-zA-Z0-9]{26,50}$/.test(trimmed)) {
        const err = new Error(`Invalid token_address: expected valid crypto address (EVM hex or base58), got '${trimmed.slice(0, 50)}'`);
        err.name = 'InputValidationError';
        throw err;
      }
    }

    // Content-based rejection on project_name
    const projectName = requirement?.project_name;
    if (typeof projectName === 'string') {
      const lower = projectName.toLowerCase();

      // Reject NSFW / policy violation markers (e.g., "[NSFW_VIOLATION_CONTENT]")
      if (/\[.*(?:nsfw|violation|banned|illegal|prohibited).*\]/i.test(projectName) ||
          /nsfw|pornograph|xxx/i.test(projectName)) {
        const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' contains policy-violating content`);
        err.name = 'InputValidationError';
        throw err;
      }

      // Reject names that explicitly indicate non-token / non-project inputs
      const invalidNamePatterns = ['not a token', 'not a contract', 'not a project', 'personal wallet', 'test wallet'];
      for (const pattern of invalidNamePatterns) {
        if (lower.includes(pattern)) {
          const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' indicates invalid input — '${pattern}'`);
          err.name = 'InputValidationError';
          throw err;
        }
      }

      // Reject obviously malicious project names
      const maliciousKeywords = ['hack', 'exploit', 'phish', 'scam', 'malware', 'ransomware', 'rugpull', 'rug pull', 'ponzi'];
      for (const keyword of maliciousKeywords) {
        if (lower.includes(keyword)) {
          const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' contains suspicious keyword '${keyword}'`);
          err.name = 'InputValidationError';
          throw err;
        }
      }
    }
  }

  private registerWithAcp(runtime: IAgentRuntime): void {
    if (this.acpRegistered) return;
    try {
      const acpService = runtime.getService('acp') as {
        registerOfferingHandler?: (
          id: string,
          handler: (input: { requirement: Record<string, unknown> }) => Promise<unknown>,
          validator?: (input: { requirement: Record<string, unknown> }) => void | Promise<void>,
        ) => void;
      } | null;

      if (!acpService?.registerOfferingHandler) {
        logger.info('WpvService: AcpService not available — skipping ACP handler registration (Grey will operate in standalone mode)');
        return;
      }

      const offerings: OfferingId[] = [
        'project_legitimacy_scan',
        'verify_project_whitepaper',
        'full_technical_verification',
        'daily_technical_briefing',
      ];

      for (const offeringId of offerings) {
        // Bug 3: Pre-accept input validator — runs before accept() in phase 0
        const validator = async (input: { requirement: Record<string, unknown>; isPlainText?: boolean }) => {
          await WpvService.validateTokenAddress(offeringId, input.requirement, input.isPlainText);
        };

        const handler = async (input: { requirement: Record<string, unknown> }) => {
          if (!this.deps?.jobRouter) {
            return { error: 'wpv_not_ready', message: 'WPV JobRouter not initialized' };
          }

          // Validate again in handler (defense in depth — also covers HTTP path)
          await WpvService.validateTokenAddress(offeringId, input.requirement);

          return this.deps.jobRouter.handleJob(offeringId, input.requirement);
        };

        acpService.registerOfferingHandler(offeringId, handler, validator);
      }

      this.acpRegistered = true;
      logger.info(`WpvService: Registered ${offerings.length} offering handlers with AcpService (with input validators)`);
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
