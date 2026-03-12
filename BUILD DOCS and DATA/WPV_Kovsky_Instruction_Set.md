# WPV Agent — Kovsky Implementation Instruction Set

**Phase A → B → C Build Specification**

Reference: `WHITEPAPER-AGENT/WPV_Agent_Technical_Architecture_v1.3.md` for business context, pricing, and launch plan. This document covers ONLY what Kovsky builds.

---

# 0. Context for Kovsky

You are extending plugin-autognostic with a Whitepaper Verification (WPV) subsystem. The existing plugin has 551 tests across 28 files, a working ingestion pipeline (ContentResolver → WebPageProcessor/PdfExtractor → knowledge store), and API integrations with Crossref, Semantic Scholar, Unpaywall, and OpenAlex.

The WPV subsystem reuses this infrastructure and adds: a discovery pipeline for crypto whitepapers on Virtuals/Base, a three-layer verification pipeline (structural analysis → claim extraction → claim evaluation), and an ACP service interface that exposes verification results as paid Job Offerings.

**You are NOT building a separate plugin.** WPV lives inside plugin-autognostic under `src/wpv/`. It shares the database connection, ContentResolver, embedding pipeline, and all existing services.

**Package manager:** `bun` (not npm). Use `bun add` for new dependencies, `bun run build` for builds.

**Architecture doc location:** `C:\Users\kidco\dev\eliza\WHITEPAPER-AGENT\WPV_Agent_Technical_Architecture_v1.3.md` — read Sections 3, 4, 5 for pipeline, data model, and service interface specs.

---

# 1. Source Tree — New Files

All new files go under `src/wpv/`. Do not modify existing autognostic source files unless extending an interface (e.g., adding a new resolution strategy to ContentResolver).

```
src/wpv/
├── types.ts                          # All WPV type definitions, enums, interfaces (BUILD FIRST)
├── constants.ts                      # WPV-specific config: cron schedule, thresholds, weights
│
├── discovery/
│   ├── BaseChainListener.ts          # WS-A1: Virtuals bonding curve event listener
│   ├── AcpMetadataEnricher.ts        # WS-A2: browseAgents() → project metadata
│   ├── WhitepaperSelector.ts         # WS-A3: scoring rubric, threshold filter
│   ├── CryptoContentResolver.ts      # WS-A4: extends ContentResolver for crypto WPs
│   └── DiscoveryCron.ts              # WS-A6: daily cron orchestrator
│
├── verification/
│   ├── StructuralAnalyzer.ts         # WS-B1: Layer 1 — 6 checks, no LLM
│   ├── ClaimExtractor.ts             # WS-B2: Layer 2 — LLM claim extraction
│   ├── ClaimEvaluator.ts             # WS-B3: Layer 3 — 5 evaluation methods
│   ├── ScoreAggregator.ts            # WS-B3: weighted score aggregation
│   ├── ReportGenerator.ts            # WS-B4: JSON reports per tier
│   └── CostTracker.ts               # WS-B5: token usage + COC/V logging
│
├── acp/
│   ├── AcpWrapper.ts                 # WS-C1: thin wrapper around ACP SDK (implements IAcpClient)
│   ├── AgentCardConfig.ts            # WS-C2: Agent Card + offering definitions
│   ├── JobRouter.ts                  # WS-C3: routes offering_id → pipeline depth
│   ├── ResourceHandlers.ts           # WS-C2: Greenlight List + Scam Alert Feed
│   └── RateLimiter.ts                # WS-C6: queue management for live tiers
│
├── db/
│   ├── wpvSchema.ts                  # WS-A5: Drizzle schema for 3 WPV tables
│   ├── wpvWhitepapersRepo.ts         # CRUD for wpv_whitepapers
│   ├── wpvClaimsRepo.ts             # CRUD for wpv_claims
│   └── wpvVerificationsRepo.ts       # CRUD for wpv_verifications
│
└── actions/
    ├── wpvScanAction.ts              # WS-C7: /wpvscan — trigger manual discovery
    ├── wpvVerifyAction.ts            # WS-C7: /wpvverify <n> — trigger verification
    ├── wpvStatusAction.ts            # WS-C7: /wpvstatus — pipeline status
    ├── wpvCostAction.ts              # WS-C7: /wpvcost — COC/V metrics
    ├── wpvGreenlightAction.ts        # WS-C7: /wpvgreenlight — today's Greenlight List
    └── wpvAlertsAction.ts            # WS-C7: /wpvalerts — scam alert feed
```

**Test files** go in `tests/wpv/` mirroring the source structure:

```
tests/wpv/
├── BaseChainListener.test.ts
├── AcpMetadataEnricher.test.ts
├── WhitepaperSelector.test.ts
├── CryptoContentResolver.test.ts
├── DiscoveryCron.test.ts
├── StructuralAnalyzer.test.ts
├── ClaimExtractor.test.ts
├── ClaimEvaluator.test.ts
├── ScoreAggregator.test.ts
├── ReportGenerator.test.ts
├── CostTracker.test.ts
├── AcpWrapper.test.ts
├── JobRouter.test.ts
├── ResourceHandlers.test.ts
├── wpvSchema.test.ts
├── wpvActions.test.ts
└── integration.test.ts              # End-to-end: discovery → verification → delivery
```

---

# 2. Type Definitions (`src/wpv/types.ts`)

**BUILD THIS FILE FIRST.** Every service file imports from here. Define all types before writing any implementation. Commit as: `feat(wpv): types.ts + constants.ts — WPV type system`

```typescript
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
}

export interface VerificationResult {
  structuralScore: number;        // 1–5
  confidenceScore: number;        // 1–100
  hypeTechRatio: number;
  verdict: Verdict;
  focusAreaScores: Record<ClaimCategory, number>;
  totalClaims: number;
  verifiedClaims: number;
  llmTokensUsed: number;
  computeCostUsd: number;
}

// ════════════════════════════════════════════
// DISCOVERY INTERFACES
// ════════════════════════════════════════════

export interface TokenCreationEvent {
  contractAddress: string;
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

export interface ResolvedWhitepaper {
  text: string;
  pageCount: number;
  isImageOnly: boolean;
  isPasswordProtected: boolean;
  source: 'direct' | 'ipfs';
  originalUrl: string;
  resolvedUrl: string;
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
  structuralScore: number;        // 1–5
  verdict: Verdict;
  hypeTechRatio: number;
  claimCount: number;
  generatedAt: string;            // ISO timestamp
}

export interface TokenomicsAuditReport extends LegitimacyScanReport {
  claims: ExtractedClaim[];
  claimScores: Record<string, number>;  // claimId → score
  logicSummary: string;
}

export interface FullVerificationReport extends TokenomicsAuditReport {
  confidenceScore: number;        // 1–100
  evaluations: ClaimEvaluation[];
  focusAreaScores: Record<ClaimCategory, number>;
  llmTokensUsed: number;
  computeCostUsd: number;
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
  | 'project_legitimacy_scan'
  | 'tokenomics_sustainability_audit'
  | 'verify_project_whitepaper'
  | 'full_technical_verification'
  | 'daily_technical_briefing';

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
```

---

# 3. Build Order

**Within each phase, workstreams have dependencies. Follow this order:**

**Phase A:**
1. `types.ts` + `constants.ts` (commit together, always first)
2. WS-A5: Database schema + repos (everything else needs the tables)
3. WS-A1: BaseChainListener (independent, no WPV deps)
4. WS-A2: AcpMetadataEnricher (depends on `IAcpClient` interface from types.ts — NOT on AcpWrapper implementation)
5. WS-A3: WhitepaperSelector (depends on types only)
6. WS-A4: CryptoContentResolver (depends on existing ContentResolver)
7. WS-A6: DiscoveryCron (orchestrates A1–A5, build last)

**Phase B:**
1. WS-B1: StructuralAnalyzer (depends on existing ScientificSectionDetector, ScientificPaperDetector)
2. WS-B2: ClaimExtractor (depends on Anthropic API, independent of B1)
3. WS-B5: CostTracker (simple, no deps — build early so B2/B3 can use it)
4. WS-B3: ClaimEvaluator + ScoreAggregator (depends on B2 output types, uses CostTracker)
5. WS-B4: ReportGenerator (depends on all report types, build last)

**Phase C:**
1. WS-C1: AcpWrapper (implements `IAcpClient` interface from types.ts)
2. WS-C2: AgentCardConfig + ResourceHandlers
3. WS-C3: JobRouter (depends on everything)
4. WS-C6: RateLimiter
5. WS-C7: Eliza action handlers (register slash commands)

---

# 4. Phase A — Discovery Pipeline

**Depends on:** autognostic Phase 4 complete (551 tests passing). Do NOT start Phase A until `npx vitest run` passes cleanly.

**Pre-check:**
```bash
cd C:\Users\kidco\dev\eliza\plugin-autognostic
npx vitest run
# Must show 551/551 pass. If not, fix regressions first.
```

## WS-A5: Database Schema (Build First in Phase A)

**File:** `src/wpv/db/wpvSchema.ts` + repo files

Implement the exact schema from architecture doc Section 4. Use existing `src/db/schema.ts` and `src/db/getDb.ts` patterns. Three tables, indexes, FK relationships.

Repository files with standard CRUD:
- `wpvWhitepapersRepo.ts` — create, findById, findByProjectName, findByTokenAddress, updateStatus, listByStatus, listByVerdict
- `wpvClaimsRepo.ts` — create, findByWhitepaperId, listByCategory
- `wpvVerificationsRepo.ts` — create, findByWhitepaperId, getGreenlightList (PASS verdicts from today), getScamAlerts (FAIL + hype_tech > 3.0), getLatestDailyBatch

**Tests (target: 12–18):**
- Schema creates tables without error
- CRUD operations work for all three tables
- FK constraints enforced (claim references valid whitepaper)
- Composite index on (project_name, chain) works
- Partial index on verdict='PASS' filters correctly
- Partial index on verdict='FAIL' AND hype_tech_ratio > 3.0 works
- getGreenlightList returns only PASS verdicts from today
- getScamAlerts returns only FAIL verdicts with hype_tech > 3.0
- getLatestDailyBatch returns all verifications from the most recent cron run

## WS-A1: BaseChainListener

**File:** `src/wpv/discovery/BaseChainListener.ts`

**Purpose:** Poll for new token creation events on the Virtuals bonding curve contract on Base.

**Interface:**
```typescript
export class BaseChainListener {
  constructor(rpcUrl: string, contractAddress: string);
  async getNewTokensSince(sinceBlockNumber: number): Promise<TokenCreationEvent[]>;
  async getLatestTokens(limit: number): Promise<TokenCreationEvent[]>;
  getLastProcessedBlock(): number;
}
```

**Implementation notes:**
- Use viem (preferred) or ethers.js to connect to Base RPC. Add via `bun add viem`.
- Poll-based: query past blocks on cron, NOT WebSocket (simpler, more reliable)
- Store last processed block number in memory (persisted to DB via the cron orchestrator)
- The Virtuals factory contract address on Base needs to be discovered — store in `constants.ts` as `VIRTUALS_FACTORY_CONTRACT` with env var override
- Parse the specific event signature for token creation (likely `TokenCreated` or similar — Kovsky will need to inspect the contract ABI)

**Tests (target: 8–12):**
- Parses a known token creation event correctly
- Handles RPC timeout gracefully (returns empty, doesn't throw)
- Handles RPC returning empty results
- Deduplicates events across multiple calls
- Returns events sorted by block number descending
- Handles malformed event data without crashing
- Respects the `sinceBlockNumber` filter
- Tracks last processed block correctly

## WS-A2: AcpMetadataEnricher

**File:** `src/wpv/discovery/AcpMetadataEnricher.ts`

**Purpose:** Given a token contract address from WS-A1, query the ACP registry to find the associated agent profile, project description, and linked document URLs.

**Interface:**
```typescript
export class AcpMetadataEnricher {
  constructor(acpClient: IAcpClient);  // codes against INTERFACE, not AcpWrapper class
  async enrichToken(tokenAddress: string): Promise<ProjectMetadata | null>;
  async searchByKeyword(keyword: string): Promise<ProjectMetadata[]>;
}
```

**CRITICAL: Dependency note.** This class depends on `IAcpClient` (the interface defined in types.ts), NOT on `AcpWrapper` (the implementation in Phase C). During Phase A testing, mock `IAcpClient`. In Phase C, `AcpWrapper implements IAcpClient` provides the real implementation.

**Implementation notes:**
- browseAgents() with keyword search on the token address or agent name
- Extract URLs from agent descriptions using regex: `https?://\S+\.pdf` and IPFS patterns
- Return null for tokens with no matching ACP agent (common — many tokens have no agent)

**Tests (target: 6–10):**
- Enriches a known token with metadata (mock IAcpClient)
- Returns null for unknown token
- Extracts PDF URLs from description text
- Extracts IPFS CIDs from description text
- Handles IAcpClient timeout gracefully
- Handles agents with no linked documents

## WS-A3: WhitepaperSelector

**File:** `src/wpv/discovery/WhitepaperSelector.ts`

**Purpose:** Score and filter discovered projects against the selection rubric.

**Interface:**
```typescript
export class WhitepaperSelector {
  constructor(threshold?: number);  // default 6
  scoreProject(signals: SelectionSignal): number;
  filterProjects(candidates: ProjectCandidate[]): ProjectCandidate[];
}
```

**Scoring weights:**
- hasLinkedPdf: 3 (**REQUIRED** — if false, return 0 regardless of other signals)
- documentLengthOk: 2
- technicalClaimsDetected: 2
- marketTraction: 1
- notAFork: 1
- isFresh: 1
- Max: 10. Default threshold: 6.

**IMPORTANT: `technicalClaimsDetected` is a LIGHTWEIGHT keyword scan** — check for math symbols (∑, ∫, LaTeX \frac, \sum), algorithm-related terms ("consensus", "proof", "theorem", "protocol"), and code/function references. This is NOT the full StructuralAnalyzer from Phase B. It's a fast pre-filter that runs on raw extracted text to decide whether the document is worth full verification.

**Tests (target: 10–15):**
- All signals true → score 10
- Missing PDF → score 0 (auto-reject regardless)
- Score 5 filtered out, score 6 passes (boundary)
- Threshold is configurable (set to 3, verify lower threshold passes more)
- Multiple projects sorted by score descending
- Empty candidate list → empty array
- Only hasLinkedPdf true → score 3 (below default threshold)

## WS-A4: CryptoContentResolver

**File:** `src/wpv/discovery/CryptoContentResolver.ts`

**Purpose:** Extend existing ContentResolver for crypto whitepaper edge cases.

**Interface:**
```typescript
export class CryptoContentResolver {
  constructor(contentResolver: ContentResolver);  // wraps existing
  async resolveWhitepaper(url: string): Promise<ResolvedWhitepaper>;
}
```

**Implementation notes:**
- First attempt: direct URL fetch via existing ContentResolver
- If URL contains IPFS CID (Qm... or bafy...), try gateway: `https://ipfs.io/ipfs/{cid}`
- Image-only detection: text extraction returns < 100 chars from a multi-page PDF → flag `isImageOnly`
- Password-protected detection: catch specific error from PdfExtractor
- Return `pageCount` from PDF metadata

**Tests (target: 8–12):**
- Resolves direct URL to text (mock ContentResolver)
- Detects and uses IPFS gateway fallback
- Flags image-only PDFs
- Flags password-protected PDFs
- Returns accurate page count
- Handles 404 gracefully
- Handles timeout gracefully
- Handles HTML whitepapers (non-PDF)

## WS-A6: DiscoveryCron

**File:** `src/wpv/discovery/DiscoveryCron.ts`

**Purpose:** Orchestrate the daily discovery run. This is the last workstream in Phase A because it depends on all others.

**Interface:**
```typescript
export class DiscoveryCron {
  constructor(deps: {
    chainListener: BaseChainListener;
    enricher: AcpMetadataEnricher;
    selector: WhitepaperSelector;
    resolver: CryptoContentResolver;
    whitepaperRepo: WpvWhitepapersRepo;
  });
  async runDaily(): Promise<DiscoveryRunResult>;
}
```

**Flow:**
1. Get new tokens via `chainListener.getNewTokensSince(lastBlock)`
2. For each token, enrich via `enricher.enrichToken(tokenAddress)` — skip if null
3. For each enriched token with a document URL, fetch the PDF via `resolver.resolveWhitepaper(url)` to get page count and text for keyword scan
4. Build `SelectionSignal` from metadata + resolved document (page count for documentLengthOk, keyword scan for technicalClaimsDetected, CoinGecko/DeFiLlama for marketTraction — or default false if unavailable)
5. Filter via `selector.filterProjects(candidates)`
6. For each passing candidate, store via `whitepaperRepo.create()` with status INGESTED
7. Return summary

**Error handling:** Individual token failures (enrichment, resolution, storage) log the error and continue to the next token. Never abort the batch.

**Tests (target: 6–10):**
- Full mock pipeline: 20 tokens → 12 with docs → 8 above threshold → 8 ingested
- Zero new tokens → empty result, no errors
- Enrichment failure on 3/20 tokens → 17 continue, 3 logged in errors
- Resolution failure on 2/12 docs → 10 continue, 2 logged
- Returns accurate timing (durationMs)
- Stores results with correct status (INGESTED)

## Phase A Exit Criteria

ALL must pass before starting Phase B:
```bash
# 1. All existing tests still pass + Phase A tests
npx vitest run
# Expected: 551 (existing) + 55–80 (WPV Phase A) = 606–631 total, 0 failures

# 2. Discovery cron integration
npx vitest run tests/wpv/DiscoveryCron.test.ts
# Expected: all pass, mock pipeline ingests 8+ whitepapers

# 3. Schema + repos
npx vitest run tests/wpv/wpvSchema.test.ts
# Expected: all CRUD tests pass

# 4. No regressions in existing functionality
npx vitest run tests/ContentResolver.test.ts tests/WebPageProcessor.test.ts
# Expected: identical pass count to 551 baseline
```

---

# 5. Phase B — Verification Engine

**Depends on:** Phase A exit criteria met.

## WS-B5: CostTracker (Build Early — Other B Workstreams Use It)

**File:** `src/wpv/verification/CostTracker.ts`

```typescript
export class CostTracker {
  constructor(pricePerInputToken: number, pricePerOutputToken: number);
  recordUsage(input: number, output: number): void;
  getTotalTokens(): { input: number; output: number };
  getTotalCostUsd(): number;
  reset(): void;
}
```

**Tests (target: 5–8):**
- Tracks cumulative tokens across multiple calls
- Computes cost correctly with known prices
- Reset clears all counters
- Zero usage → zero cost

## WS-B1: StructuralAnalyzer

**File:** `src/wpv/verification/StructuralAnalyzer.ts`

```typescript
export class StructuralAnalyzer {
  constructor(deps: {
    sectionDetector: ScientificSectionDetector;     // existing
    scientificPaperDetector: ScientificPaperDetector; // existing — for DOI/citation verification
  });
  async analyze(text: string, pageCount: number): Promise<StructuralAnalysis>;
  computeQuickFilterScore(analysis: StructuralAnalysis): number;  // 1–5
  computeHypeTechRatio(text: string): number;
}
```

**Six checks (private methods):**
1. `checkSectionCompleteness(text)` — existing ScientificSectionDetector: find abstract, methodology, tokenomics, references
2. `checkCitationDensity(text)` — extract DOI/URL references, verify via existing ScientificPaperDetector (Crossref)
3. `checkMathNotation(text)` — regex: LaTeX commands (`\frac`, `\sum`, `\int`), Unicode math (∑, ∫, ∀, ∃, ≤, ≥), equation patterns
4. `checkCoherence(text)` — section length variance, repetition ratio
5. `checkPlagiarism(text, embeddingFn)` — embedding similarity against wpv_whitepapers corpus in pgvector
6. `checkMetadata(text)` — author name patterns, date patterns (YYYY, Month YYYY), version strings

**Hype vs. Tech Ratio:** Marketing tokens ("revolutionary", "game-changing", "moonshot", "100x", "disruptive") vs. technical tokens (function names, algorithm references, math notation, DOI markers). Return ratio. > 3.0 = hype flag.

**Tests (target: 15–20):**
- Well-structured WP: all sections, math, citations → score 5
- Meme WP: no sections, no math, no citations → score 1–2
- Hype WP: marketing-heavy text → hype_tech > 3.0
- LaTeX detection: `\frac{a}{b}` → hasMath true
- Unicode math detection: `∑ ∀ ≤` → hasMath true
- DOI reference extraction and count
- Empty text → minimal analysis, no crash
- Short text (< 100 chars) → coherenceScore 0, signals image-only source
- Score boundaries: inputs producing exactly 1, exactly 3, exactly 5

## WS-B2: ClaimExtractor

**File:** `src/wpv/verification/ClaimExtractor.ts`

```typescript
export class ClaimExtractor {
  constructor(deps: {
    anthropicApiKey: string;
    costTracker: CostTracker;
    model?: string;  // default: 'claude-sonnet-4-20250514'
  });
  async extractClaims(text: string, projectName: string): Promise<ExtractedClaim[]>;
}
```

**Implementation notes:**
- Call Anthropic API with `tool_use` to enforce output schema
- System prompt: instruct to extract testable claims with one example per category
- Track tokens via `costTracker.recordUsage()` from API response `usage` field
- No extractable claims → return empty array (not error)
- Max output tokens: 4096

**Tests (target: 10–15):**
- Mock API valid claims → correct ExtractedClaim array
- Mock API empty → empty array, not error
- Mock API malformed JSON → graceful handling
- Token tracking fires recordUsage with correct counts
- Each ClaimCategory parsed correctly
- Anthropic API error (500, rate limit) → typed error, no crash

## WS-B3: ClaimEvaluator + ScoreAggregator

**Files:** `src/wpv/verification/ClaimEvaluator.ts`, `src/wpv/verification/ScoreAggregator.ts`

```typescript
export class ClaimEvaluator {
  constructor(deps: {
    anthropicApiKey: string;
    semanticScholar: SemanticScholarService;  // existing
    costTracker: CostTracker;
    model?: string;
  });
  // Evaluate a single claim (math sanity, benchmark, citations, originality)
  async evaluateClaim(claim: ExtractedClaim, fullText: string): Promise<ClaimEvaluation>;

  // Evaluate consistency across ALL claims (must run after individual evaluations)
  async evaluateConsistency(claims: ExtractedClaim[]): Promise<Map<string, Consistency>>;

  // Convenience: run full evaluation pipeline for a claim set
  async evaluateAll(claims: ExtractedClaim[], fullText: string): Promise<{
    evaluations: ClaimEvaluation[];
    scores: Map<string, number>;  // claimId → 0–100
  }>;
}
```

**IMPORTANT: Consistency is a BATCH operation.** `evaluateConsistency()` takes ALL claims and checks for contradictions across the set. It runs ONCE after all individual evaluations, not per-claim. The `evaluateAll()` convenience method handles this: evaluate each claim individually, then run consistency as a final pass, then merge consistency results into the ClaimEvaluation objects.

**Five evaluation methods (private):**
1. `evaluateMathSanity(claim, fullText)` — LLM: does proof support claim?
2. `evaluateBenchmark(claim)` — compare metrics against known norms
3. `evaluateCitations(claim)` — resolve via SemanticScholarService
4. `evaluateOriginality(claim, embeddingFn)` — embedding similarity
5. `evaluateConsistency(claims)` — cross-reference ALL claims for contradictions (BATCH)

**ScoreAggregator:**
```typescript
export class ScoreAggregator {
  constructor(weights?: ScoreWeights);
  aggregate(claimScores: { category: ClaimCategory; score: number }[]): {
    confidenceScore: number;    // 1–100
    focusAreaScores: Record<ClaimCategory, number>;
    verdict: Verdict;
  };
}
```

**Verdict thresholds (in constants.ts):**
- PASS: >= 70
- CONDITIONAL: >= 40 and < 70
- FAIL: < 40
- INSUFFICIENT_DATA: fewer than 3 evaluable claims (overrides score)

**Tests (target: 15–20):**
- Aggregation with default weights
- Custom weights change output
- Verdicts: 71→PASS, 69→CONDITIONAL, 39→FAIL
- < 3 claims → INSUFFICIENT_DATA regardless of scores
- evaluateConsistency catches contradicting claims (e.g., "TPS is 10,000" vs. "TPS is 100")
- evaluateAll runs consistency AFTER individual evaluations
- Mock S2 citation verification
- CostTracker records usage from all LLM calls

## WS-B4: ReportGenerator

**File:** `src/wpv/verification/ReportGenerator.ts`

```typescript
export class ReportGenerator {
  generateLegitimacyScan(verification: VerificationResult, analysis: StructuralAnalysis, wp: WhitepaperRecord): LegitimacyScanReport;
  generateTokenomicsAudit(verification: VerificationResult, claims: ExtractedClaim[], wp: WhitepaperRecord): TokenomicsAuditReport;
  generateFullVerification(verification: VerificationResult, claims: ExtractedClaim[], evaluations: ClaimEvaluation[], wp: WhitepaperRecord): FullVerificationReport;
  generateDailyBriefing(reports: FullVerificationReport[]): DailyBriefingReport;
}
```

**Tier superset rule:** LegitimacyScanReport ⊂ TokenomicsAuditReport ⊂ FullVerificationReport. This is enforced by the `extends` chain in types.ts.

**Tests (target: 8–12):**
- Each tier validates against expected fields
- TokenomicsAudit contains all LegitimacyScan fields
- FullVerification contains all TokenomicsAudit fields
- DailyBriefing aggregates multiple reports correctly
- Empty report array → valid DailyBriefing with totalVerified: 0
- generatedAt timestamp is ISO format

## Phase B Exit Criteria

```bash
# 1. All tests pass
npx vitest run
# Expected: ~630 (A) + ~55–75 (B) = ~685–705 total, 0 failures

# 2. Integration: mock WP → structural + claims + evaluation → report
npx vitest run tests/wpv/integration.test.ts
# Expected: produces valid FullVerificationReport

# 3. COC/V under budget
# In integration test: assert costTracker.getTotalCostUsd() < 0.60

# 4. No regressions
npx vitest run tests/ContentResolver.test.ts
```

---

# 6. Phase C — ACP Integration

**Depends on:** Phase B exit criteria met.

## WS-C1: AcpWrapper

**File:** `src/wpv/acp/AcpWrapper.ts`

```typescript
export class AcpWrapper implements IAcpClient {
  constructor(config: {
    walletPrivateKey: string;
    sessionEntityKeyId: string;
    agentWalletAddress: string;
    rpcUrl?: string;
  });
  async init(): Promise<void>;
  async browseAgents(keyword: string, options?: Record<string, unknown>): Promise<AgentProfile[]>;
  handleNewTask(callback: (job: AcpJob) => void): void;
  async deliverResult(jobId: string, result: unknown): Promise<void>;
  async registerOfferings(offerings: OfferingDefinition[]): Promise<void>;
  async registerResources(resources: ResourceDefinition[]): Promise<void>;
}
```

**CRITICAL:** This class `implements IAcpClient` from types.ts. This is how the Phase A AcpMetadataEnricher connects to the real SDK — through the interface it was already coding against.

**Implementation:**
- `bun add @virtuals-protocol/acp-node` — pin exact version
- Use `AcpContractClientV2` (NOT v1)
- Env vars: `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `ACP_AGENT_WALLET_ADDRESS`, `BASE_RPC_URL`

**Tests (target: 8–12):**
- Implements IAcpClient (type check)
- Init with valid mock config succeeds
- Init with invalid config fails gracefully
- browseAgents returns parsed AgentProfile array
- handleNewTask callback fires on mock job
- deliverResult formats payload correctly

## WS-C2: AgentCardConfig + ResourceHandlers

**Files:** `src/wpv/acp/AgentCardConfig.ts`, `src/wpv/acp/ResourceHandlers.ts`

**AgentCardConfig:** Static config exporting constants — name, role, description, capabilities, all 5 offering definitions, all 2 resource definitions. Exactly as specified in architecture doc Section 5. This is config, not a service.

**ResourceHandlers:**
```typescript
export class ResourceHandlers {
  constructor(verificationsRepo: WpvVerificationsRepo, whitepaperRepo: WpvWhitepapersRepo);
  async getGreenlightList(): Promise<GreenlightListResponse>;
  async getScamAlertFeed(): Promise<ScamAlertFeedResponse>;
}
```

**Tests (target: 6–8):**
- AgentCardConfig has all required fields, description ≤ 100 chars for short
- Greenlight returns only today's PASS verdicts
- Scam Alerts returns only FAIL + hype_tech > 3.0
- Both return empty arrays (not errors) when no data

## WS-C3: JobRouter

**File:** `src/wpv/acp/JobRouter.ts`

```typescript
export class JobRouter {
  constructor(deps: {
    whitepaperRepo: WpvWhitepapersRepo;
    verificationsRepo: WpvVerificationsRepo;
    claimsRepo: WpvClaimsRepo;
    structuralAnalyzer: StructuralAnalyzer;
    claimExtractor: ClaimExtractor;
    claimEvaluator: ClaimEvaluator;
    scoreAggregator: ScoreAggregator;
    reportGenerator: ReportGenerator;
    costTracker: CostTracker;
    cryptoResolver: CryptoContentResolver;
  });
  async handleJob(offeringId: OfferingId, input: Record<string, unknown>): Promise<unknown>;
}
```

**Routing:**
- `project_legitimacy_scan` → DB lookup → LegitimacyScanReport. If not in DB: return `{ error: "not_in_database", suggestion: "Submit via verify_project_whitepaper ($2.00) to add this project." }`
- `tokenomics_sustainability_audit` → DB lookup → TokenomicsAuditReport. Same not-in-DB handling.
- `verify_project_whitepaper` → LIVE L1+L2 on new URL → store in DB → return TokenomicsAuditReport. **This is the flywheel.**
- `full_technical_verification` → if cached: FullVerificationReport. If new URL provided: LIVE L1+L2+L3 → store → return.
- `daily_technical_briefing` → query today's batch → DailyBriefingReport

**Tests (target: 12–15):**
- Routes each offering_id correctly
- Cached lookup returns report (mock DB)
- Live verification runs pipeline (mock LLM)
- verify_project_whitepaper creates DB record
- Not-in-database returns suggestion to use verify_project_whitepaper
- Unknown offering_id → error
- Missing required input fields → error

## WS-C6: RateLimiter

**File:** `src/wpv/acp/RateLimiter.ts`

Simple sequential queue for live tiers. Multiple simultaneous `verify_project_whitepaper` or `full_technical_verification` jobs queue and process one at a time. Return estimated wait time.

**Tests (target: 5–8):**
- Sequential processing (job 2 starts after job 1 finishes)
- Wait time estimate scales with queue depth
- Handles cancellation

## WS-C7: Eliza Action Handlers

**Files:** All 6 files in `src/wpv/actions/`

These register WPV slash commands with the Eliza runtime. Follow the existing action patterns in `src/actions/` — each action exports a handler with `validate()` and `handler()` methods. Actions delegate to the appropriate WPV service:

| Action | Delegates To |
|--------|-------------|
| wpvScanAction | DiscoveryCron.runDaily() |
| wpvVerifyAction | JobRouter.handleJob('full_technical_verification', input) |
| wpvStatusAction | Reads wpvWhitepapersRepo + wpvVerificationsRepo for counts/status |
| wpvCostAction | CostTracker.getTotalCostUsd() + recent wpv_verifications.compute_cost_usd |
| wpvGreenlightAction | ResourceHandlers.getGreenlightList() |
| wpvAlertsAction | ResourceHandlers.getScamAlertFeed() |

**IMPORTANT:** Follow the existing guardrail — always call `callback()` before returning from action handlers. Destructure results to primitive fields in `ActionResult.data`.

**Tests (target: 8–12):**
- Each action's validate() accepts correct input
- Each action's validate() rejects malformed input
- handler() calls the correct underlying service
- handler() calls callback() before returning

## Phase C Exit Criteria

```bash
# 1. All tests pass
npx vitest run
# Expected: ~700 (A+B) + ~45–60 (C) = ~745–760 total, 0 failures

# 2. JobRouter routes correctly
npx vitest run tests/wpv/JobRouter.test.ts

# 3. Resources serve valid data
npx vitest run tests/wpv/ResourceHandlers.test.ts

# 4. Actions register correctly
npx vitest run tests/wpv/wpvActions.test.ts

# 5. No regressions
npx vitest run --reporter=verbose 2>&1 | tail -5
# Expected: 0 failures
```

---

# 7. Heartbeat Template for WPV

**Append** this section to existing heartbeat.md. Do not replace existing content.

```markdown
## WPV Agent Build Status
> Phase: [A|B|C] | Workstream: [WS-XX] | Started: [date]

### WPV Focus
- [ ] [Current workstream goal]

### WPV What Works
- [verified items with dates]

### WPV What's Broken
- [issues]

### WPV Test Count
- Baseline (pre-WPV): 551
- Phase A added: [n]
- Phase B added: [n]
- Phase C added: [n]
- **Total: [n]**

### WPV Metrics
- COC/V (last test run): $[n.nn]
- Database: [n] test whitepapers ingested
- Graduation: [X/10] sandbox transactions
```

---

# 8. Environment Variables (New)

Add to `.env.example`:

```bash
# WPV Agent — ACP Integration
ACP_WALLET_PRIVATE_KEY=          # Whitelisted wallet private key (no 0x prefix)
ACP_SESSION_ENTITY_KEY_ID=       # Session entity key from ACP registration
ACP_AGENT_WALLET_ADDRESS=        # Agent smart contract wallet address

# WPV Agent — Base Chain
BASE_RPC_URL=                    # Base mainnet RPC (custom recommended for volume)
VIRTUALS_FACTORY_CONTRACT=       # Virtuals bonding curve factory address on Base

# WPV Agent — LLM (uses existing ANTHROPIC_API_KEY if set)
WPV_MODEL=claude-sonnet-4-20250514    # Model for claim extraction/evaluation
```

---

# 9. Guardrails

### DO
- Run `npx vitest run` before AND after every workstream — zero regressions
- Follow the build order in Section 3 — dependencies matter
- Keep each workstream in a separate commit: `feat(wpv): WS-A1 BaseChainListener`
- Mock ALL external APIs in tests (ACP SDK, Anthropic, Base RPC, CoinGecko)
- Use existing `logger.child()` pattern for WPV logging
- Update heartbeat after every workstream
- Use `bun add` for new dependencies, not `npm install`

### DON'T
- Modify existing autognostic source files unless extending an interface
- Make any test depend on live API calls
- Skip COC/V tracking — critical business metric
- Create a separate plugin — WPV is a subsystem
- Start Phase B before Phase A exits. Start Phase C before Phase B exits.
- Code against `AcpWrapper` directly in Phase A — use `IAcpClient` interface

---

# 10. Commit Strategy

```
feat(wpv): types.ts + constants.ts — WPV type system
feat(wpv): WS-A5 wpvSchema — Drizzle schema + 3 repos
feat(wpv): WS-A1 BaseChainListener — Base chain event polling
feat(wpv): WS-A2 AcpMetadataEnricher — ACP registry metadata (via IAcpClient)
feat(wpv): WS-A3 WhitepaperSelector — selection rubric and filter
feat(wpv): WS-A4 CryptoContentResolver — crypto WP resolution + IPFS
feat(wpv): WS-A6 DiscoveryCron — daily discovery orchestrator
feat(wpv): WS-B5 CostTracker — COC/V instrumentation
feat(wpv): WS-B1 StructuralAnalyzer — Layer 1 structural analysis
feat(wpv): WS-B2 ClaimExtractor — Layer 2 LLM claim extraction
feat(wpv): WS-B3 ClaimEvaluator + ScoreAggregator — Layer 3 evaluation
feat(wpv): WS-B4 ReportGenerator — tiered JSON reports
feat(wpv): WS-C1 AcpWrapper — ACP SDK wrapper (implements IAcpClient)
feat(wpv): WS-C2 AgentCardConfig + ResourceHandlers
feat(wpv): WS-C3 JobRouter — offering → pipeline routing
feat(wpv): WS-C6 RateLimiter — live tier queue
feat(wpv): WS-C7 Eliza action handlers — slash commands
```

---

# 11. Test Target Summary

| Phase | Workstream | Target Tests | Cumulative |
|-------|-----------|-------------|------------|
| — | Baseline (existing) | 551 | 551 |
| — | types.ts + constants.ts | 0 (type-only) | 551 |
| A | WS-A5 wpvSchema + repos | 12–18 | ~569 |
| A | WS-A1 BaseChainListener | 8–12 | ~581 |
| A | WS-A2 AcpMetadataEnricher | 6–10 | ~591 |
| A | WS-A3 WhitepaperSelector | 10–15 | ~606 |
| A | WS-A4 CryptoContentResolver | 8–12 | ~618 |
| A | WS-A6 DiscoveryCron | 6–10 | ~628 |
| B | WS-B5 CostTracker | 5–8 | ~636 |
| B | WS-B1 StructuralAnalyzer | 15–20 | ~656 |
| B | WS-B2 ClaimExtractor | 10–15 | ~671 |
| B | WS-B3 ClaimEvaluator + ScoreAggregator | 15–20 | ~691 |
| B | WS-B4 ReportGenerator | 8–12 | ~703 |
| C | WS-C1 AcpWrapper | 8–12 | ~715 |
| C | WS-C2 AgentCard + Resources | 6–8 | ~723 |
| C | WS-C3 JobRouter | 12–15 | ~738 |
| C | WS-C6 RateLimiter | 5–8 | ~746 |
| C | WS-C7 Actions | 8–12 | ~758 |
| — | Integration (e2e) | 5–10 | **~765+** |

**Target: 765+ total tests at Phase C completion.**

---

*End of Kovsky Implementation Instruction Set*