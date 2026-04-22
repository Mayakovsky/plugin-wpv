// ════════════════════════════════════════════
// WPV Agent — Configuration Constants
// Cron schedules, thresholds, weights, and contract addresses.
// ════════════════════════════════════════════

import type { ScoreWeights } from './types';

// ── Discovery ────────────────────────────────

/** Daily discovery cron schedule (06:00 UTC) */
export const WPV_DISCOVERY_CRON = '0 6 * * *';

/** Virtuals Bonding Proxy contract on Base — emits Graduated events */
export const VIRTUALS_FACTORY_CONTRACT =
  process.env.VIRTUALS_FACTORY_CONTRACT ?? '0xF66DeA7b3e897cD44A5a231c61B6B4423d613259';

/** Keccak256 of Graduated(address indexed token, address agentToken) */
export const GRADUATED_EVENT_TOPIC =
  '0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e';

/** Base mainnet RPC */
export const BASE_RPC_URL =
  process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';

/** IPFS gateway for CID resolution */
export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

// ── Selection ────────────────────────────────

/** Selection signal weights */
export const SELECTION_WEIGHTS = {
  hasLinkedPdf: 3,          // REQUIRED — score 0 if missing
  documentLengthOk: 2,     // >5 pages
  technicalClaimsDetected: 2,
  marketTraction: 1,
  notAFork: 1,
  isFresh: 1,              // <72 hours old
} as const;

/** Maximum selection score */
export const SELECTION_MAX_SCORE = 10;

/** Default selection threshold — candidates scoring below are filtered out */
export const SELECTION_DEFAULT_THRESHOLD = 6;

/** Freshness window in milliseconds (72 hours) */
export const FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Minimum page count to satisfy documentLengthOk */
export const MIN_PAGE_COUNT = 5;

/** Minimum text length (chars) to NOT be flagged as image-only */
export const IMAGE_ONLY_CHAR_THRESHOLD = 100;

// ── Technical Claims Keywords (lightweight pre-filter) ────────────

/** Keywords for the quick technicalClaimsDetected scan (NOT full structural analysis) */
export const TECHNICAL_CLAIM_KEYWORDS = [
  // Math symbols / LaTeX
  '\\frac', '\\sum', '\\int', '\\prod', '\\lim',
  '∑', '∫', '∀', '∃', '≤', '≥', '∂',
  // Algorithm / protocol terms
  'consensus', 'proof', 'theorem', 'protocol', 'algorithm',
  'validator', 'finality', 'byzantine', 'merkle',
  // Code / function references
  'function', 'contract', 'mapping', 'modifier', 'constructor',
] as const;

/** Minimum keyword hits to flag technicalClaimsDetected */
export const TECHNICAL_CLAIMS_MIN_HITS = 3;

// ── Verification ─────────────────────────────

/** Default score weights for claim evaluation aggregation */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  mathValidity: 0.35,
  benchmarks: 0.20,
  citations: 0.20,
  originality: 0.15,
  consistency: 0.10,
};

/** Verdict thresholds */
export const VERDICT_THRESHOLDS = {
  PASS: 70,          // >= 70
  CONDITIONAL: 40,   // >= 40 and < 70
  // < 40 → FAIL
} as const;

/** Minimum evaluable claims before INSUFFICIENT_DATA overrides score */
export const MIN_EVALUABLE_CLAIMS = 3;

/** Hype vs. Tech ratio threshold for scam alert flag */
export const HYPE_TECH_RATIO_THRESHOLD = 3.0;

/** Hype marketing keywords */
export const HYPE_KEYWORDS = [
  'revolutionary', 'game-changing', 'moonshot', '100x', 'disruptive',
  'moon', 'lambo', 'guaranteed', 'risk-free', 'passive income',
  'generational wealth', 'next bitcoin', 'exponential',
] as const;

/** Technical indicator tokens */
export const TECH_KEYWORDS = [
  'algorithm', 'protocol', 'consensus', 'merkle', 'hash',
  'validator', 'proof', 'theorem', 'function', 'contract',
  'mapping', 'modifier', 'finality', 'byzantine', 'latency',
  'throughput', 'shard', 'rollup', 'zk-snark', 'zk-stark',
] as const;

// ── MiCA Compliance ─────────────────────────

/** Keywords that indicate a whitepaper claims MiCA compliance */
export const MICA_CLAIM_KEYWORDS = [
  'mica',
  'markets in crypto-assets',
  'regulation (eu) 2023/1114',
  'esma whitepaper',
  'mica regulation',
  'mica complian',
  'eu crypto regulation',
  'mifid ii',
] as const;

/** The 7 required MiCA whitepaper sections (EU Regulation 2023/1114, Article 6) */
export const MICA_REQUIRED_SECTIONS = [
  'issuer_identity',
  'technology_description',
  'risk_disclosure',
  'rights_obligations',
  'redemption_mechanisms',
  'governance',
  'environmental_impact',
] as const;

/** Section detection patterns for each MiCA requirement.
 *  Broadened to catch alternative phrasings used by regulated issuers
 *  (e.g., Circle USDC, Tether, Paxos). */
export const MICA_SECTION_PATTERNS: Record<string, RegExp[]> = {
  issuer_identity: [
    /\bissuer\b/i, /\bcompany\s+(?:information|details|identity)\b/i,
    /\blegal\s+entity\b/i,
    /\bcontact\s+(?:information|details)\b/i,
    /\bregistered\s+(?:office|address)\b/i,
    /\babout\s+(?:us|the\s+(?:company|issuer|team))\b/i,
    /\bcorporate\s+(?:structure|overview|information)\b/i,
    /\borganiz(?:ation|ational)\s+(?:structure|overview)\b/i,
  ],
  technology_description: [
    /\btechnical\s+(?:architecture|design|overview|specification)\b/i,
    /\bprotocol\s+design\b/i, /\bsystem\s+architecture\b/i,
    /\btechnology\s+(?:stack|description|overview)\b/i,
    /\bhow\s+(?:it\s+works|the\s+protocol\s+works)\b/i,
    /\bsmart\s+contract\s+(?:architecture|design|overview)\b/i,
    /\bminting\s+(?:and\s+)?(?:burning|redemption)\s+(?:mechanism|process)\b/i,
    /\breserve\s+(?:management|backing|mechanism)\b/i,
  ],
  risk_disclosure: [
    /\brisk\s+(?:disclosure|factors?|warning|management|assessment|framework)\b/i,
    /\brisk\b.*\b(?:section|chapter)\b/i,
    /\binvestment\s+risks?\b/i, /\bregulatory\s+risks?\b/i,
    /\boperational\s+risks?\b/i, /\bmarket\s+risks?\b/i,
    /\bcounterparty\s+risks?\b/i, /\bliquidity\s+risks?\b/i,
    /\brisk\s+disclaimer\b/i, /\bdisclaimer\b.*\brisk/i,
  ],
  rights_obligations: [
    /\brights?\s+(?:and\s+)?obligations?\b/i,
    /\btoken\s+holder\s+rights?\b/i,
    /\blegal\s+rights?\b/i, /\bvoting\s+rights?\b/i,
    /\bholder\s+rights?\b/i, /\buser\s+rights?\b/i,
    /\bterms\s+(?:of\s+service|and\s+conditions|of\s+use)\b/i,
    /\bredemption\s+rights?\b/i,
  ],
  redemption_mechanisms: [
    /\bredemption\b/i, /\brefund\b/i, /\bbuyback\b/i,
    /\bwithdrawal\s+mechanism\b/i, /\bexit\s+mechanism\b/i,
    /\bmint(?:ing)?\s+(?:and\s+)?(?:redeem|burn)\b/i,
    /\bconversion\s+mechanism\b/i,
    /\bpeg\s+(?:stability|mechanism|maintenance)\b/i,
  ],
  governance: [
    /\bgovernance\b/i, /\bdao\b/i, /\bvoting\b/i,
    /\bdecision.?making\b/i, /\bproposal\b/i,
    /\bgovernance\s+(?:framework|structure|model)\b/i,
    /\bcompliance\s+(?:framework|program|oversight)\b/i,
    /\bregulatory\s+(?:framework|compliance|oversight)\b/i,
  ],
  environmental_impact: [
    /\benvironmental\s+(?:impact|disclosure|considerations?)\b/i,
    /\bcarbon\s+(?:footprint|offset|neutral)\b/i,
    /\benergy\s+consumption\b/i,
    /\bsustainability\s+(?:report|assessment|disclosure|commitment)\b/i,
    /\besg\b/i,
    /\bclimate\s+(?:impact|disclosure|commitment|risk)\b/i,
  ],
} as const;

/** MiCA compliance thresholds */
export const MICA_THRESHOLDS = {
  COMPLIANT: 5,        // >=5 of 7 sections → YES
  PARTIAL: 3,          // >=3 and <5 → PARTIAL
  // <3 → NO
} as const;

// ── Fork Detection ──────────────────────────

/** Description similarity threshold — above this = potential fork */
export const FORK_DESCRIPTION_SIMILARITY_THRESHOLD = 0.80;

/** Whitepaper text similarity threshold — above this = potential fork */
export const FORK_WHITEPAPER_SIMILARITY_THRESHOLD = 0.90;

/** Known clone/scam naming patterns */
export const FORK_NAME_PATTERNS: RegExp[] = [
  /^(Safe|Moon|Elon|Pepe|Doge|Shib)\w*(Inu|Token|Coin|Finance|Swap|Chain|Verse)$/i,
  /^(Baby|Mini|Mega|Super|Ultra)\w*(Inu|Doge|Pepe|Shib|Moon|Token|Coin)$/i,
  /\b(v2|2\.0|fork|clone|pro|plus|classic)\b/i,
];

// ── Market Traction ─────────────────────────

/** Fast graduation threshold: <7 days at ~2s/block on Base */
export const GRADUATION_FAST_THRESHOLD_BLOCKS = 302400; // 7 days

/** Moderate graduation: 7–30 days */
export const GRADUATION_MODERATE_THRESHOLD_BLOCKS = 1296000; // 30 days

/** Minimum transfer count in 7 days to indicate activity */
export const TRANSFER_MIN_COUNT_7D = 50;

/** Minimum unique addresses in 7 days */
export const TRANSFER_MIN_UNIQUE_7D = 30;

/** Blocks to look back for transfers (~7 days at 2s/block) */
export const TRANSFER_LOOKBACK_BLOCKS = 302400;

/** ERC-20 Transfer event topic (keccak256 of Transfer(address,address,uint256)) */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Minimum aGDP (weekly USD) to indicate economic activity */
export const AGDP_MIN_WEEKLY_USD = 100;

// ── Document Discovery ──────────────────────

/** Virtuals Protocol page URL template */
export const VIRTUALS_PAGE_URL = 'https://app.virtuals.io/virtuals/';

/** Patterns for finding whitepaper links in HTML */
export const WHITEPAPER_LINK_PATTERNS = [
  /href=["']([^"']*\.pdf)["']/gi,
  /href=["']([^"']*whitepaper[^"']*)["']/gi,
  /href=["']([^"']*litepaper[^"']*)["']/gi,
  /href=["']([^"']*tokenomics[^"']*)["']/gi,
  /href=["']([^"']*\/docs[^"']*)["']/gi,
] as const;

/** Patterns for known documentation hosting platforms */
export const DOCS_SITE_PATTERNS = [
  /gitbook\.io/i,
  /docs\.\w+\.\w+/i,
  /notion\.so/i,
  /medium\.com/i,
  /github\.com.*\.md/i,
] as const;

// ── LLM ──────────────────────────────────────

/** Default model for claim extraction / evaluation */
export const WPV_MODEL =
  process.env.WPV_MODEL ?? 'claude-sonnet-4-20250514';

/** Max output tokens for claim extraction */
export const CLAIM_EXTRACTION_MAX_TOKENS = 4096;

// ── Cost Tracking ────────────────────────────

/** Anthropic pricing per token (Claude Sonnet 4) */
export const LLM_PRICING = {
  inputPerToken: 3.0 / 1_000_000,   // $3.00 / 1M input tokens
  outputPerToken: 15.0 / 1_000_000, // $15.00 / 1M output tokens
} as const;

// ── Tiered Resolver (Phase 3) ────────────────

/** Feature flag: turn the new tiered resolver chain on/off without redeploying code. */
export const USE_TIERED_RESOLVER =
  (process.env.USE_TIERED_RESOLVER ?? 'true').toLowerCase() !== 'false';

/** Threshold below which a tier's result is considered "thin" and the chain continues. */
export const TIER_ROBUST_THRESHOLD = {
  structuralScore: 2,
  claimCount: 5,
} as const;

/** Per-tier timeout budgets (ms). Chain also honors the offering-level SLA deadline. */
export const TIER_TIMEOUTS_MS = {
  tier1: 10_000,   // explicit URL fetch
  tier2: 60_000,   // primary-site discovery (Playwright can be slow)
  tier3: 20_000,   // GitHub search + fetch
  tier4: 15_000,   // CoinGecko / CMC API lookup
} as const;

/** Minimum remaining SLA budget before skipping further tiers. */
export const TIER_MIN_SLA_REMAINING_MS = 60_000;

/**
 * Sanity check: when Tier 3 or 4 returns a document, confirm it actually
 * references the requested project. First N characters are scanned for
 * project name OR token address. Case-insensitive substring match.
 */
export const TIER_SANITY_CHECK_CHARS = 2000;

/** CoinGecko free-tier API base */
export const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

/** CoinMarketCap Pro API base (free tier) */
export const CMC_API_BASE = 'https://pro-api.coinmarketcap.com';

// ── ACP ──────────────────────────────────────

/** ACP environment variables */
export const ACP_ENV = {
  walletPrivateKey: process.env.ACP_WALLET_PRIVATE_KEY ?? '',
  sessionEntityKeyId: process.env.ACP_SESSION_ENTITY_KEY_ID ?? '',
  agentWalletAddress: process.env.ACP_AGENT_WALLET_ADDRESS ?? '',
} as const;

// ── Supabase (production) ───────────────────

/** Supabase connection for production WPV database */
export const SUPABASE_ENV = {
  url: process.env.SUPABASE_URL ?? '',
  secretKey: process.env.SUPABASE_SECRET_KEY ?? '',
  databaseUrl: process.env.WPV_DATABASE_URL ?? '',
} as const;
