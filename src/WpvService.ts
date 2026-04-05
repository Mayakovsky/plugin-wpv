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

// ── Shared Content Filtering ─────────────────
// Single source of truth for all content violation checks.
// Used by both the daily briefing validator and the general all-field scanner.

/** NSFW and sexual content patterns */
const NSFW_PATTERNS: RegExp[] = [
  /\bnsfw\b/i,
  /\bsexual\b/i,
  /\bporn\b/i,
  /\bpornograph/i,
  /\bnude/i,
  /\bnudity\b/i,
  /\bhentai\b/i,
  /\berotic/i,
  /\bxxx\b/i,
];

/** Prompt injection and manipulation patterns — intent-based, not phrase-specific */
const INJECTION_PATTERNS: RegExp[] = [
  /\b(?:ignore|disregard|bypass|skip|forget|override)\b.*\b(?:all|logic|rules|instructions|evidence|safety|filters|guidelines|checks)\b/i,
  /\b(?:say|claim|report|conclude|state)\b.*\b(?:is a scam|is fraudulent|is fake|regardless)\b/i,
  /\b(?:pretend|act as if|assume)\b.*\b(?:scam|fraud|fake|malicious|legitimate)\b/i,
  /\binclude\b.*\b(?:explicit|inappropriate|offensive|vulgar)\b.*\b(?:content|material|language)\b/i,
  /\b(?:jailbreak|prompt inject)/i,
];

/** Bracket-tagged violation markers (e.g., [NSFW_VIOLATION_CONTENT]) */
const BRACKET_PATTERNS: RegExp[] = [
  /\[.*(?:nsfw|violation|banned|illegal|prohibited|explicit|adult|offensive).*\]/i,
];

/** Scam, fraud, and malicious intent keywords — used in all-field scan */
const MALICIOUS_CONTENT_PATTERNS: RegExp[] = [
  /\bscam\b/i,
  /\bfraud(?:ulent)?\b/i,
  /\brug\s*pull\b/i,
  /\bponzi\b/i,
  /\bhoneypot\b/i,
  /\bpyramid\s*scheme\b/i,
  /\bmoney\s*launder/i,
  /\bpump\s*(?:and|&)\s*dump\b/i,
  /\bhack(?:ing|ed|s)?\b/i,
  /\bexploit(?:ing|ed|s)?\b/i,
  /\bphish(?:ing)?\b/i,
  /\bmalware\b/i,
  /\bransomware\b/i,
  /\bdrainer\b/i,
];

/** Combined violation patterns — all-field content scanner */
const ALL_FIELD_VIOLATION_PATTERNS: RegExp[] = [
  ...NSFW_PATTERNS,
  ...INJECTION_PATTERNS,
  ...BRACKET_PATTERNS,
  ...MALICIOUS_CONTENT_PATTERNS,
];

/** Malicious keywords for project_name specific checks — broader than the all-field scan */
const MALICIOUS_PROJECT_NAME_KEYWORDS: string[] = [
  'hack', 'exploit', 'phish', 'scam', 'malware', 'ransomware',
  'rugpull', 'rug pull', 'ponzi', 'honeypot', 'drainer',
  'stealer', 'pyramid', 'laundering', 'money launder',
  'pump and dump', 'pump & dump',
  'explicit',
];

/** Invalid project name patterns — indicate non-token/non-project inputs */
const INVALID_NAME_PATTERNS: string[] = [
  'not a token', 'not a contract', 'not a project',
  'personal wallet', 'test wallet', 'my wallet', 'my address',
];

/** NSFW domains — checked against URL hostname */
const NSFW_DOMAIN_KEYWORDS: string[] = [
  'porn', 'xxx', 'xvideos', 'pornhub', 'xhamster', 'redtube',
  'youporn', 'tube8', 'spankbang', 'hentai', 'onlyfans',
  'chaturbate', 'livejasmin', 'stripchat', 'brazzers', 'fapello',
];

/** Generic NSFW terms that need word-boundary matching on hostname */
const NSFW_HOSTNAME_PATTERNS: RegExp[] = [
  /\b(?:adult|nude|nsfw|sexcam)\b/,
];

// ── End Shared Content Filtering ─────────────


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
   * Shared content violation scanner. Scans all string values in a requirement
   * object against the shared violation pattern set. Throws InputValidationError
   * if any field matches. Used by both daily briefing and general validators.
   */
  private static scanForViolations(requirement: Record<string, unknown>): void {
    const allStringValues = Object.values(requirement)
      .filter((v): v is string => typeof v === 'string');

    for (const value of allStringValues) {
      for (const pattern of ALL_FIELD_VIOLATION_PATTERNS) {
        if (pattern.test(value)) {
          const err = new Error('Request contains policy-violating content and cannot be processed');
          err.name = 'InputValidationError';
          throw err;
        }
      }
    }
  }

  /**
   * Validate document_url for NSFW domains. Extracts hostname and checks
   * against known NSFW domains and patterns. Uses hostname parsing to
   * avoid false positives (e.g., "sussex.ac.uk" won't match "sex").
   */
  private static validateUrlDomain(trimmedUrl: string): void {
    let hostname: string;
    try {
      hostname = new URL(trimmedUrl).hostname.toLowerCase();
    } catch {
      // URL parsing failed — already caught by format check above
      return;
    }

    // Check known NSFW domain keywords against hostname
    for (const domain of NSFW_DOMAIN_KEYWORDS) {
      if (hostname.includes(domain)) {
        const err = new Error('Invalid document_url: URL contains policy-violating content');
        err.name = 'InputValidationError';
        throw err;
      }
    }

    // Check generic NSFW terms with word boundaries on hostname
    for (const pattern of NSFW_HOSTNAME_PATTERNS) {
      if (pattern.test(hostname)) {
        const err = new Error('Invalid document_url: URL contains policy-violating content');
        err.name = 'InputValidationError';
        throw err;
      }
    }
  }

  /**
   * Convert GitHub blob URLs to raw.githubusercontent.com URLs.
   * GitHub blob pages return HTML with a PDF viewer — not the actual PDF.
   * e.g., https://github.com/aave/aave-protocol/blob/master/docs/Whitepaper.pdf
   *     → https://raw.githubusercontent.com/aave/aave-protocol/master/docs/Whitepaper.pdf
   */
  static normalizeGitHubUrl(url: string): string {
    const blobMatch = url.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
    );
    if (blobMatch) {
      return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
    }
    return url;
  }

  /**
   * Scan ALL string values in a requirement for embedded URLs, token addresses,
   * and project names. Mutates the requirement object to populate standard fields
   * (document_url, token_address, project_name) from non-standard fields like
   * "verification_request". Called before Fix 5 to avoid rejecting valid requests
   * that use non-standard field names.
   */
  private static extractFromUnknownFields(requirement: Record<string, unknown>): void {
    // Skip if standard fields already exist
    const hasStandard = requirement.token_address || requirement.project_name || requirement.document_url;
    if (hasStandard) return;

    // Scan all string values for extractable data
    const allStrings = Object.entries(requirement)
      .filter(([key, v]) => typeof v === 'string' && key !== 'token_address' && key !== 'project_name' && key !== 'document_url')
      .map(([, v]) => v as string);

    for (const text of allStrings) {
      // Extract URL (https://...)
      if (!requirement.document_url) {
        const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (urlMatch) {
          requirement.document_url = urlMatch[0].replace(/[.,;:!?)]+$/, ''); // trim trailing punctuation
        }
      }

      // Extract 0x token address
      if (!requirement.token_address) {
        const addrMatch = text.match(/\b(0x[0-9a-fA-F]{20,42})\b/);
        if (addrMatch) {
          requirement.token_address = addrMatch[1];
        }
      }

      // Extract known protocol/chain names — L1s, L2s, DeFi, infrastructure (80 protocols)
      if (!requirement.project_name) {
        const projectMatch = text.match(
          /\b(Bitcoin|Ethereum|Solana|Cardano|Polkadot|Avalanche|Cosmos|Toncoin|Tron|Near|Algorand|Aptos|Sui|Sei|Hedera|Fantom|Stellar|XRP|Litecoin|Monero|Filecoin|Internet\s*Computer|Kaspa|Injective|Celestia|Mantle|Arbitrum|Optimism|Base|Polygon|zkSync|Starknet|Scroll|Linea|Blast|Manta|Mode|Uniswap|Aave|Compound|MakerDAO|Maker|Curve|Synthetix|SushiSwap|Balancer|Yearn|Chainlink|Lido|Rocket\s*Pool|Frax|Convex|Euler|Morpho|Radiant|Pendle|GMX|dYdX|Virtuals\s*Protocol|Aerodrome|Jupiter|Raydium|Orca|Marinade|Jito|Drift|1inch|PancakeSwap|Pancake\s*Swap|Trader\s*Joe|Camelot|Stargate|LayerZero|Layer\s*Zero|Wormhole|Across|Hop\s*Protocol|The\s*Graph|Arweave|Akash|Render|Pyth|API3|Ethena|USDe|Hyperliquid|EigenLayer|Eigen\s*Layer)\s*(v\d+)?\b/i
        );
        if (projectMatch) {
          requirement.project_name = projectMatch[0].trim();
        }
      }
    }
  }

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
      // Normalize keys to lowercase (Option B — lenient): "Date", "DATE" → "date"
      for (const key of Object.keys(requirement)) {
        const lower = key.toLowerCase();
        if (lower !== key) {
          requirement[lower] = requirement[key];
          delete requirement[key];
        }
      }

      // Strict key validation: reject unknown fields in structured (non-plain-text) briefing requests.
      // Plain-text parsing may inject cross-offering keys like project_name/token_address — allow those.
      if (!isPlainText) {
        const BRIEFING_ALLOWED_KEYS = new Set(['date']);
        const unknownKeys = Object.keys(requirement).filter((k) => !BRIEFING_ALLOWED_KEYS.has(k));
        if (unknownKeys.length > 0) {
          const err = new Error(`Unknown field(s): ${unknownKeys.map((k) => `'${k}'`).join(', ')} — daily_technical_briefing accepts only 'date' (YYYY-MM-DD format)`);
          err.name = 'InputValidationError';
          throw err;
        }
      }
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
      // Content filtering still applies for daily briefing — uses shared patterns
      WpvService.scanForViolations(requirement);
      return;
    }

    // Scan ALL string fields in requirement for content violations — shared patterns
    WpvService.scanForViolations(requirement);

    // Extract data from non-standard fields (e.g., "verification_request" → document_url + project_name)
    // Must run BEFORE Fix 5 check so that extracted fields prevent false rejections
    if (!isPlainText) {
      WpvService.extractFromUnknownFields(requirement);
    }

    // Fix 5: Reject JSON requirements missing all identifying fields
    if (!isPlainText) {
      const hasTokenAddress = requirement?.token_address !== undefined && requirement?.token_address !== null;
      const hasProjectName = requirement?.project_name !== undefined && requirement?.project_name !== null;
      const hasDocumentUrl = requirement?.document_url !== undefined && requirement?.document_url !== null;
      if (!hasTokenAddress && !hasProjectName && !hasDocumentUrl) {
        const err = new Error('Invalid requirement: must include at least one of token_address, project_name, or document_url');
        err.name = 'InputValidationError';
        throw err;
      }
    }

    // Normalize GitHub blob URLs → raw.githubusercontent.com (all offerings)
    if (typeof requirement?.document_url === 'string') {
      requirement.document_url = WpvService.normalizeGitHubUrl(requirement.document_url as string);
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
        // NSFW domain check — uses hostname parsing to avoid false positives
        WpvService.validateUrlDomain(trimmedUrl);
        // Fix 4: Reject bare domain URLs (no meaningful path)
        try {
          const urlObj = new URL(trimmedUrl);
          if (urlObj.pathname === '/' || urlObj.pathname === '') {
            const host = urlObj.hostname.toLowerCase();
            const isDocSite = /\b(docs|whitepaper|technical|paper|wiki|gitbook)\b/.test(host);
            if (!isDocSite) {
              const err = new Error('Invalid document_url: URL must point to a specific document, not a bare domain');
              err.name = 'InputValidationError';
              throw err;
            }
          }
        } catch (e) { if (e instanceof Error && e.name === 'InputValidationError') throw e; }
        // Reject non-document file types
        const lowerUrl = trimmedUrl.toLowerCase();
        if (/\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|mp4|mp3|avi|mov)(\?.*)?$/.test(lowerUrl)) {
          const err = new Error('Invalid document_url: must point to a document, not an image or media file');
          err.name = 'InputValidationError';
          throw err;
        }
        // Fix 3: HEAD check — reject truly unreachable URLs, soft-clear stale URLs
        try {
          const headResp = await fetch(trimmedUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000), redirect: 'follow' });
          if (headResp.status >= 500) {
            const err = new Error(`Invalid document_url: URL returned HTTP ${headResp.status} — server error`);
            err.name = 'InputValidationError';
            throw err;
          }
          if (headResp.status === 404 || headResp.status === 410) {
            // Stale URL — clear document_url so JobRouter falls through to cache/discovery
            logger.warn('document_url returned ' + headResp.status + ' — clearing for discovery fallback', { url: trimmedUrl.slice(0, 80) });
            delete requirement.document_url;
          }
        } catch (e) {
          if (e instanceof Error && e.name === 'InputValidationError') throw e;
          // Network error (DNS failure, connection refused, timeout) — also reject
          const netErr = new Error('Invalid document_url: URL is not reachable');
          (netErr as { name: string }).name = 'InputValidationError';
          throw netErr;
        }
      }
    }

    // Cross-field consistency check: reject when project_name and document_url
    // clearly belong to different projects. Only checks when BOTH are present.
    if (typeof requirement?.project_name === 'string' && typeof requirement?.document_url === 'string') {
      const projName = requirement.project_name.trim().toLowerCase();
      const docUrl = requirement.document_url.trim().toLowerCase();

      // Check if document_url contains a known protocol name that contradicts project_name
      const urlProtocols = [
        'uniswap', 'aave', 'compound', 'makerdao', 'curve', 'synthetix',
        'sushiswap', 'balancer', 'yearn', 'chainlink', 'lido', 'solana',
        'ethereum', 'bitcoin', 'cardano', 'polkadot', 'avalanche', 'polygon',
        'arbitrum', 'optimism', 'celestia', 'cosmos', 'near', 'aptos', 'sui',
        'aerodrome', 'jupiter', 'raydium', 'pancakeswap', 'stargate',
        'layerzero', 'wormhole', 'filecoin', 'arweave', 'render',
      ];

      const urlMatchedProtocol = urlProtocols.find((p) => docUrl.includes(p));
      if (urlMatchedProtocol && !projName.includes(urlMatchedProtocol) && !urlMatchedProtocol.includes(projName)) {
        const err = new Error(
          `Contradictory inputs: document_url references '${urlMatchedProtocol}' but project_name is '${requirement.project_name}'. These appear to be different projects.`
        );
        err.name = 'InputValidationError';
        throw err;
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
        // BUT only hard-reject when token_address is the SOLE identifying field.
        const lower = trimmed.toLowerCase();
        if (/^0x(0{40}|dead(beef)?[0-9a-f]*(dead|beef)[0-9a-f]*|f{40})$/.test(lower) ||
            /^0x(.)\1{39}$/.test(lower) ||
            /^0x([0-9a-f]{2})\1{19}$/.test(lower)) {
          const hasDocUrl = !!requirement.document_url;
          const projectName = typeof requirement.project_name === 'string' ? requirement.project_name.trim() : '';
          const NON_MEANINGFUL_NAMES = ['empty', 'unknown', 'none', 'test', 'n/a', 'null', 'undefined', ''];
          const hasMeaningfulName = projectName.length > 0 && !NON_MEANINGFUL_NAMES.includes(projectName.toLowerCase());
          if (hasDocUrl || hasMeaningfulName) {
            // Soft fail: strip bad address, proceed with other fields
            delete requirement.token_address;
            return;
          }
          const err = new Error(`Invalid token_address: burn/null address rejected — '${trimmed.slice(0, 50)}'`);
          err.name = 'InputValidationError';
          throw err;
        }
        // eth_getCode check — reject EOA wallets (no bytecode)
        // BUT only hard-reject when token_address is the SOLE identifying field.
        // If project_name or document_url are also present, log warning and strip the bad address.
        const isContract = await WpvService.isContractAddress(trimmed);
        if (!isContract) {
          const projName = (requirement.project_name as string | undefined)?.toLowerCase() ?? '';
          const hasDocUrl = !!requirement.document_url;

          // Hard-reject if project_name looks like a wallet/personal address, not a real project
          const isWalletName = /wallet|personal|my\s*addr|test\s*addr|vitalik|satoshi/i.test(projName);
          const isInvalidName = INVALID_NAME_PATTERNS.some((p: string) => projName.includes(p));

          if (isWalletName || isInvalidName || (!projName && !hasDocUrl)) {
            const err = new Error(`Invalid token_address: address is not a contract (EOA wallet) — '${trimmed.slice(0, 50)}'`);
            err.name = 'InputValidationError';
            throw err;
          }

          // Soft fail: strip bad address, proceed with other legitimate fields
          delete requirement.token_address;
          return;
        }
        // Format valid + contract check passed — allow through
        return;
      }

      // Reject Bitcoin addresses — Bitcoin is not a supported chain per requirement_schema.
      // P2PKH starts with '1' (25-34 chars), P2SH starts with '3' (34 chars),
      // Bech32 starts with 'bc1'. All use base58 which overlaps with Solana.
      // ALWAYS hard reject — this is a schema violation, not a data quality issue.
      if (/^[13][a-km-zA-HJ-NP-Z1-9]{24,33}$/.test(trimmed) || /^bc1[a-zA-HJ-NP-Z0-9]{25,89}$/.test(trimmed)) {
        const err = new Error(`Invalid token_address: Bitcoin address detected — not a supported chain. Supported chains: Base, Ethereum, Solana — '${trimmed.slice(0, 50)}'`);
        err.name = 'InputValidationError';
        throw err;
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
      if (/\[.*(?:nsfw|violation|banned|illegal|prohibited|explicit|adult|offensive).*\]/i.test(projectName)) {
        const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' contains policy-violating content`);
        err.name = 'InputValidationError';
        throw err;
      }

      // NSFW keywords in project name
      for (const pattern of NSFW_PATTERNS) {
        if (pattern.test(projectName)) {
          const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' contains policy-violating content`);
          err.name = 'InputValidationError';
          throw err;
        }
      }

      // Reject names that explicitly indicate non-token / non-project inputs
      for (const pattern of INVALID_NAME_PATTERNS) {
        if (lower.includes(pattern)) {
          const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' indicates invalid input — '${pattern}'`);
          err.name = 'InputValidationError';
          throw err;
        }
      }

      // Reject obviously malicious project names
      for (const keyword of MALICIOUS_PROJECT_NAME_KEYWORDS) {
        if (lower.includes(keyword)) {
          const err = new Error(`Rejected: project name '${projectName.slice(0, 50)}' contains suspicious keyword '${keyword}'`);
          err.name = 'InputValidationError';
          throw err;
        }
      }

      // Cross-reference: reject non-EVM L1 chain names paired with 0x EVM addresses.
      // Bitcoin, Cardano, etc. don't use EVM — a 0x address is contradictory.
      const NON_EVM_CHAINS = ['bitcoin', 'btc', 'cardano', 'ada', 'ripple', 'xrp', 'litecoin', 'ltc', 'monero', 'xmr', 'dogecoin', 'doge', 'toncoin', 'ton', 'tron', 'trx', 'stellar', 'xlm', 'hedera', 'hbar', 'algorand', 'algo', 'kaspa', 'kas'];
      const tokenAddr = requirement?.token_address as string | undefined;
      if (tokenAddr && tokenAddr.startsWith('0x') && NON_EVM_CHAINS.includes(lower)) {
        const err = new Error(`Contradictory inputs: project '${projectName}' is a non-EVM chain but token_address '${tokenAddr.slice(0, 20)}...' is an EVM address`);
        err.name = 'InputValidationError';
        throw err;
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
          price?: number,
        ) => void;
      } | null;

      if (!acpService?.registerOfferingHandler) {
        logger.info('WpvService: AcpService not available — skipping ACP handler registration (Grey will operate in standalone mode)');
        return;
      }

      const offerings: { id: OfferingId; price: number }[] = [
        { id: 'project_legitimacy_scan', price: 0.01 },
        { id: 'verify_project_whitepaper', price: 0.02 },
        { id: 'full_technical_verification', price: 0.03 },
        { id: 'daily_technical_briefing', price: 0.04 },
      ];

      for (const offering of offerings) {
        const offeringId = offering.id;
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

        acpService.registerOfferingHandler(offeringId, handler, validator, offering.price);
      }

      this.acpRegistered = true;
      logger.info(`WpvService: Registered ${offerings.length} offering handlers with AcpService (with input validators)`);
    } catch (err) {
      logger.warn(`WpvService: ACP registration failed — ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    // Graceful shutdown — close headless browser if running
    if (this.deps?.cryptoResolver) {
      await this.deps.cryptoResolver.close();
    }
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
