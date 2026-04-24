// ════════════════════════════════════════════
// WPV Agent — Type Definitions
// All WPV types, enums, and interfaces.
// BUILD FIRST — every service file imports from here.
// ════════════════════════════════════════════

// ════════════════════════════════════════════
// ENUMS
// ════════════════════════════════════════════

export enum WhitepaperStatus {
  DISCOVERED = 'DISCOVERED',
  INGESTED = 'INGESTED',
  VERIFYING = 'VERIFYING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export enum ClaimCategory {
  TOKENOMICS = 'TOKENOMICS',
  PERFORMANCE = 'PERFORMANCE',
  CONSENSUS = 'CONSENSUS',
  SCIENTIFIC = 'SCIENTIFIC',
}

export enum Verdict {
  PASS = 'PASS',
  CONDITIONAL = 'CONDITIONAL',
  FAIL = 'FAIL',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  NOT_IN_DATABASE = 'NOT_IN_DATABASE',
}

export enum MathValidity { VALID = 'VALID', FLAWED = 'FLAWED', UNVERIFIABLE = 'UNVERIFIABLE' }
export enum Plausibility { HIGH = 'HIGH', LOW = 'LOW', OUTLIER = 'OUTLIER' }
export enum Originality { NOVEL = 'NOVEL', DERIVATIVE = 'DERIVATIVE', PLAGIARIZED = 'PLAGIARIZED' }
export enum Consistency { CONSISTENT = 'CONSISTENT', CONTRADICTED = 'CONTRADICTED' }

// ════════════════════════════════════════════
// CORE DATA INTERFACES
// ════════════════════════════════════════════

export interface WhitepaperRecord {
  id: string;
  projectName: string;
  tokenAddress: string | null;
  chain: string;
  documentUrl: string;
  ipfsCid: string | null;
  knowledgeItemId: string | null;
  pageCount: number;
  ingestedAt: Date;
  status: WhitepaperStatus;
  selectionScore: number;
  metadataJson: Record<string, unknown>;
}

export interface ExtractedClaim {
  claimId: string;
  category: ClaimCategory;
  claimText: string;
  statedEvidence: string;
  mathematicalProofPresent: boolean;
  sourceSection: string;
  /** True if the claim relates to regulatory compliance (MiCA, KYC/AML, ESMA, etc.) */
  regulatoryRelevance: boolean;
}

export interface ClaimEvaluation {
  claimId: string;
  mathValidity?: MathValidity;
  benchmarkDelta?: number;
  plausibility?: Plausibility;
  citationSupportsClaim?: boolean | null;
  originality?: Originality;
  consistency?: Consistency;
}

export type MicaClaimStatus = 'YES' | 'NO' | 'NOT_MENTIONED';
export type MicaComplianceStatus = 'YES' | 'NO' | 'PARTIAL' | 'NOT_APPLICABLE';

export interface MicaAnalysis {
  claimsMicaCompliance: MicaClaimStatus;
  micaCompliant: MicaComplianceStatus;
  micaSummary: string;
  /** Which of the 7 required MiCA sections were found */
  micaSectionsFound: string[];
  /** Which of the 7 required MiCA sections are missing */
  micaSectionsMissing: string[];
}

export interface StructuralAnalysis {
  hasAbstract: boolean;
  hasMethodology: boolean;
  hasTokenomics: boolean;
  hasReferences: boolean;
  citationCount: number;
  verifiedCitationRatio: number;
  hasMath: boolean;
  mathDensityScore: number;
  coherenceScore: number;
  similarityTopMatch: string | null;
  similarityScore: number;
  hasAuthors: boolean;
  hasDates: boolean;
  mica: MicaAnalysis;
}

export interface VerificationResult {
  structuralScore: number;        // 0–5 (0 = not analyzed, 1–5 = real score)
  confidenceScore: number;        // 0–100
  hypeTechRatio: number;
  verdict: Verdict;
  focusAreaScores: Record<ClaimCategory, number | null>;  // null = no claims in that category
  totalClaims: number;
  verifiedClaims: number;
  llmTokensUsed: number;
  computeCostUsd: number;
}

// ════════════════════════════════════════════
// DISCOVERY INTERFACES
// ════════════════════════════════════════════

export interface TokenCreationEvent {
  /** Bonding curve token address (from Graduated event indexed topic) */
  contractAddress: string;
  /** Graduated agent token address (from Graduated event data field) — used for ACP lookup */
  agentToken: string;
  deployer: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export interface ProjectMetadata {
  agentName: string | null;
  entityId: string | null;
  description: string | null;
  linkedUrls: string[];
  category: string | null;
  graduationStatus: string | null;
}

export interface SelectionSignal {
  hasLinkedPdf: boolean;          // weight 3 (REQUIRED)
  documentLengthOk: boolean;     // weight 2 (>5 pages)
  technicalClaimsDetected: boolean; // weight 2 (keyword scan, NOT full structural analysis)
  marketTraction: boolean;       // weight 1
  notAFork: boolean;             // weight 1
  isFresh: boolean;              // weight 1 (<72hrs)
}

export interface ProjectCandidate {
  tokenAddress: string;
  metadata: ProjectMetadata;
  documentUrl: string | null;
  signals: SelectionSignal;
  score?: number;
}

export type DocumentSource = 'pdf' | 'docs_site' | 'composed' | 'ipfs';

export interface ResolvedWhitepaper {
  text: string;
  pageCount: number;
  isImageOnly: boolean;
  isPasswordProtected: boolean;
  source: 'direct' | 'ipfs' | 'composed' | 'docs_site'
        | 'llms-txt' | 'site-specific' | 'headless-browser'
        | 'docs-crawl';
  originalUrl: string;
  resolvedUrl: string;
}

export interface TieredDiscoveryResult {
  resolved: ResolvedWhitepaper;
  documentUrl: string;
  documentSource: DocumentSource;
  tier: 1 | 2 | 3 | 4;
}

export interface DiscoveryRunResult {
  tokensScanned: number;
  candidatesFound: number;
  candidatesAboveThreshold: number;
  whitepapersIngested: number;
  errors: { url: string; error: string }[];
  durationMs: number;
}

// ════════════════════════════════════════════
// REPORT INTERFACES (tiered — each is superset of the one below)
// ════════════════════════════════════════════

export interface LegitimacyScanReport {
  projectName: string;
  tokenAddress: string | null;
  structuralScore: number;        // 0–5 (0 = not analyzed / NOT_IN_DATABASE)
  verdict: Verdict;
  hypeTechRatio: number;
  claimCount: number;
  claimsMicaCompliance: MicaClaimStatus;
  micaCompliant: MicaComplianceStatus;
  micaSummary: string;
  generatedAt: string;            // ISO timestamp
  // Phase 4: tiered-resolver provenance (optional on legacy callers)
  discoveryStatus?: DiscoveryStatus;
  discoverySourceTier?: number | null;
  discoveryAttempts?: DiscoveryAttempt[];
}

export interface TokenomicsAuditReport extends LegitimacyScanReport {
  claims: ExtractedClaim[];
  claimScores: Record<string, number>;  // claimId → score
  logicSummary: string;
}

export interface FullVerificationReport extends TokenomicsAuditReport {
  confidenceScore: number;        // 0–100
  evaluations: ClaimEvaluation[];
  focusAreaScores: Record<string, number | null>;  // lowercase keys; null = category absent
  llmTokensUsed: number;
  computeCostUsd: number;
  // Tiered-resolver provenance (Phase 4). Always present on new deliverables.
  discoveryStatus?: DiscoveryStatus;
  discoverySourceTier?: number | null;
  discoveryAttempts?: DiscoveryAttempt[];
}

/**
 * Tier selection outcome, user-facing label in the deliverable.
 * Maps to tiers 0-4, or "failed" when all tiers exhausted.
 */
export type DiscoveryStatus = 'cached' | 'provided' | 'primary' | 'community' | 'aggregator' | 'failed';

/** Per-tier record for the `discoveryAttempts` array in deliverables */
export interface DiscoveryAttempt {
  tier: number;                   // 0..4
  status: DiscoveryStatus | 'skipped' | 'error';
  structuralScore?: number;
  claimCount?: number;
  note?: string;                  // short diagnostic ("unreachable", "thin", "success", etc.)
}

/**
 * Validated signals extracted from a buyer request by the signal aggregator.
 * Any non-zero count means the job is accepted; zero signals = pre-accept reject.
 */
export interface RequestSignal {
  type: 'token' | 'name' | 'url';
  value: string;
}

export interface DailyBriefingReport {
  date: string;
  totalVerified: number;
  whitepapers: FullVerificationReport[];
}

// ════════════════════════════════════════════
// RESOURCE RESPONSE INTERFACES
// ════════════════════════════════════════════

export interface GreenlightListResponse {
  date: string;
  totalVerified: number;
  projects: {
    name: string;
    tokenAddress: string | null;
    verdict: Verdict;
    score: number;
    hypeTechRatio: number;
  }[];
}

export interface ScamAlertFeedResponse {
  date: string;
  flagged: {
    name: string;
    tokenAddress: string | null;
    verdict: 'FAIL';
    hypeTechRatio: number;
    redFlags: string[];
    /** True if project claims MiCA compliance but fails the check */
    fraudulentMicaClaim: boolean;
  }[];
}

// ════════════════════════════════════════════
// ACP INTERFACES
// ════════════════════════════════════════════

// IAcpClient: interface defined here, implemented by AcpWrapper in Phase C.
// AcpMetadataEnricher (Phase A) codes against this interface, not the concrete class.
export interface IAcpClient {
  browseAgents(keyword: string, options?: Record<string, unknown>): Promise<AgentProfile[]>;
  handleNewTask(callback: (job: AcpJob) => void): void;
  deliverResult(jobId: string, result: unknown): Promise<void>;
}

export interface AgentProfile {
  name: string;
  entityId: string;
  description: string;
  role: string;
  offerings: { id: string; name: string; price: number }[];
  graduationStatus: string;
}

export interface AcpJob {
  jobId: string;
  offeringId: string;
  buyerEntityId: string;
  input: Record<string, unknown>;
  createdAt: number;
}

export type OfferingId =
  | 'legitimacy_scan'
  | 'verify_whitepaper'
  | 'verify_full_tech'
  | 'daily_tech_brief';

export type ResourceId =
  | 'daily_greenlight_list'
  | 'scam_alert_feed';

// ════════════════════════════════════════════
// SCORE WEIGHTS (configurable)
// ════════════════════════════════════════════

export interface ScoreWeights {
  mathValidity: number;    // default 0.35
  benchmarks: number;      // default 0.20
  citations: number;       // default 0.20
  originality: number;     // default 0.15
  consistency: number;     // default 0.10
}

// ════════════════════════════════════════════
// DATABASE TYPE (self-contained — matches autognostic's DrizzleDbLike)
// ════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DrizzleDbLike = {
  select: (...args: unknown[]) => any;
  insert: (...args: unknown[]) => any;
  update: (...args: unknown[]) => any;
  delete: (...args: unknown[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════════
// CONTENT RESOLVER INTERFACE (for CryptoContentResolver injection)
// ════════════════════════════════════════════

export interface ResolvedContent {
  text: string;
  contentType: string;
  source: string;
  resolvedUrl: string;
  pageCount?: number;
  diagnostics: string[];
}

/** Interface for content resolution — implemented by autognostic's ContentResolver */
export interface IContentResolver {
  resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent>;
}
