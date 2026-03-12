// ════════════════════════════════════════════
// WPV Agent — Configuration Constants
// Cron schedules, thresholds, weights, and contract addresses.
// ════════════════════════════════════════════

import type { ScoreWeights } from './types';

// ── Discovery ────────────────────────────────

/** Daily discovery cron schedule (06:00 UTC) */
export const WPV_DISCOVERY_CRON = '0 6 * * *';

/** Virtuals bonding curve factory contract on Base — env override available */
export const VIRTUALS_FACTORY_CONTRACT =
  process.env.VIRTUALS_FACTORY_CONTRACT ?? '0x0000000000000000000000000000000000000000';

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
  anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  databaseUrl: process.env.WPV_DATABASE_URL ?? '',
} as const;
