> Read [heartbeat.md](./heartbeat.md) first for current session state.

# Plugin-WPV Development Context

> **WPV:** Whitepaper Verification Pipeline
> Autonomous crypto whitepaper verification for the Virtuals.io Agent Commerce Protocol (ACP)

---

## Project Overview

| Property | Value |
|----------|-------|
| **Package** | `@elizaos/plugin-wpv` |
| **Version** | `0.1.0` |
| **Framework** | ElizaOS v1.x (`@elizaos/core` 1.6.5) |
| **Database** | Supabase Pro (PostgreSQL + pgvector, $25/mo) |
| **Package Manager** | `bun` (required) |
| **Test Framework** | Vitest (195 tests, 17 files) |
| **Peer Dependency** | `@elizaos/plugin-autognostic` (optional — for ContentResolver, ScientificSectionDetector, Crossref, S2) |
| **LLM** | Claude Sonnet via Anthropic API (claim extraction + evaluation) |
| **Chain** | Base (Virtuals Protocol) |

---

## Autonomous Permissions

**Full read/write access granted to all files in this repository.**

Read without confirmation:
- `**/*` — All files in this repository and subfolders

Modify without confirmation:
- `**/*` — All files in this repository and subfolders
- This includes: source code, tests, docs, BUILD DOCS and DATA, package.json, configs, and any other files

**Execution mode:** Always run with `--dangerously-skip-permissions` (auto-accept all tool calls). No confirmation needed for any operation within this repository.

---

## Architecture

### Source Tree

```
src/
├── types.ts                          # All WPV type definitions, enums, interfaces
├── constants.ts                      # Config: cron schedule, thresholds, score weights, verdict cutoffs
├── index.ts                          # Plugin registration (6 actions + WpvService)
├── WpvService.ts                     # Central service — dependency container for all WPV subsystems
│
├── discovery/                        # Stage 1: Find and ingest crypto whitepapers
│   ├── BaseChainListener.ts          # Poll Base chain for Virtuals bonding curve token creation events
│   ├── AcpMetadataEnricher.ts        # Query ACP registry for agent profiles + linked document URLs
│   ├── WhitepaperSelector.ts         # Score candidates against selection rubric (max 10, threshold 6)
│   ├── CryptoContentResolver.ts      # Resolve WP URLs with IPFS fallback, image-only + password detection
│   └── DiscoveryCron.ts              # Daily orchestrator (06:00 UTC), error-tolerant batch processing
│
├── verification/                     # Stage 2: Three-layer verification pipeline
│   ├── StructuralAnalyzer.ts         # L1: 6 deterministic checks, no LLM. Quick filter score (1–5), hype/tech ratio
│   ├── ClaimExtractor.ts             # L2: Claude Sonnet structured output. Extracts testable claims by category
│   ├── ClaimEvaluator.ts             # L3: 5 evaluation methods (math, benchmarks, citations, originality, consistency)
│   ├── ScoreAggregator.ts            # Weighted score aggregation → confidence score (1–100) → verdict
│   ├── ReportGenerator.ts            # Tiered JSON reports: Legitimacy → Tokenomics → Full → Daily Briefing
│   └── CostTracker.ts               # LLM token usage + compute cost per verification (COC/V)
│
├── acp/                              # Stage 3: Virtuals ACP service interface
│   ├── AcpWrapper.ts                 # Thin wrapper around @virtuals-protocol/acp-node SDK (implements IAcpClient)
│   ├── AgentCardConfig.ts            # Static config: Agent Card, 5 offerings, 2 resources, capabilities
│   ├── JobRouter.ts                  # Routes offering_id → correct pipeline depth (cached vs. live)
│   ├── ResourceHandlers.ts           # Free endpoints: Daily Greenlight List + Scam Alert Feed
│   └── RateLimiter.ts               # Sequential queue for live verification tiers
│
├── db/                               # Database layer (Drizzle ORM on Supabase PostgreSQL)
│   ├── wpvSchema.ts                  # 3 tables: wpv_whitepapers, wpv_claims, wpv_verifications
│   ├── wpvWhitepapersRepo.ts         # CRUD + listByStatus, listByVerdict, findByProjectName
│   ├── wpvClaimsRepo.ts             # CRUD + findByWhitepaperId, listByCategory
│   └── wpvVerificationsRepo.ts       # CRUD + getGreenlightList, getScamAlerts, getLatestDailyBatch
│
├── actions/                          # Eliza action handlers (slash commands)
│   ├── wpvScanAction.ts              # WPV_SCAN — trigger manual discovery run
│   ├── wpvVerifyAction.ts            # WPV_VERIFY — submit URL for verification
│   ├── wpvStatusAction.ts            # WPV_STATUS — pipeline counts by status
│   ├── wpvCostAction.ts              # WPV_COST — LLM token usage and cost
│   ├── wpvGreenlightAction.ts        # WPV_GREENLIGHT — today's verified projects
│   └── wpvAlertsAction.ts            # WPV_ALERTS — flagged projects
│
└── utils/
    ├── logger.ts                     # Structured logger with logger.child()
    └── safeSerialize.ts              # Cyclic-safe JSON serialization
```

### Pipeline Flow

```
[1] DISCOVERY  →  [2] VERIFICATION  →  [3] DELIVERY
 Scan + Ingest      Analyze + Score      Serve via ACP + Butler

BaseChainListener        StructuralAnalyzer (L1)       JobRouter
       ↓                         ↓                         ↓
AcpMetadataEnricher       ClaimExtractor (L2)         5 Paid Offerings
       ↓                         ↓                    2 Free Resources
CryptoContentResolver     ClaimEvaluator (L3)              ↓
       ↓                         ↓                    AcpWrapper (on-chain)
WhitepaperSelector        ScoreAggregator
       ↓                         ↓
DiscoveryCron             ReportGenerator
  (daily cron)              (tiered JSON)
```

### Three-Layer Verification

| Layer | Component | LLM | Cost/WP | Output |
|-------|-----------|-----|---------|--------|
| L1 | StructuralAnalyzer | No | $0.02 | Quick filter score (1–5), hype/tech ratio |
| L2 | ClaimExtractor | Claude Sonnet | $0.08–$0.15 | Categorized claims with evidence |
| L3 | ClaimEvaluator | Claude Sonnet | $0.20–$0.40 | Per-claim evaluations → confidence score (1–100) → verdict |

Full pipeline: $0.29–$0.57 per whitepaper.

### ACP Service Interface

**Role:** Provider / Evaluator

**5 Paid Offerings:**

| offering_id | Display Name | Price | Pipeline |
|-------------|-------------|-------|----------|
| project_legitimacy_scan | Project Legitimacy Scan | $0.25 | L1 cached |
| tokenomics_sustainability_audit | Tokenomics Sustainability Audit | $1.50 | L1+L2 cached |
| verify_project_whitepaper | Verify Project Whitepaper | $2.00 | L1+L2 live (flywheel) |
| full_technical_verification | Full Technical Verification | $3.00 | L1+L2+L3 |
| daily_technical_briefing | Daily Technical Briefing | $8.00 | Cron summary |

**2 Free Resources:** Daily Greenlight List, Scam Alert Feed

### WpvService — Dependency Container

`WpvService` extends Eliza's `Service` class and holds all WPV dependencies. Actions resolve it from the runtime via `runtime.getService('wpv')` and access subsystems through typed getters. This avoids passing 13 constructor dependencies to each action.

### Relationship with plugin-autognostic

`plugin-autognostic` is an **optional** peer dependency. When available, WPV uses:
- `ContentResolver` — URL→text pipeline (content-type routing, PDF magic bytes, HTML quality gate)
- `ScientificSectionDetector` — Section detection for structural analysis
- `ScientificPaperDetector` — DOI/Crossref verification for citation checks
- `SemanticScholarService` — Citation graph for L3 claim evaluation

When not available, WPV falls back to its own `CryptoContentResolver` for PDF fetching and text extraction.

### Database Schema (Supabase Pro — PostgreSQL + pgvector)

```sql
wpv_whitepapers           -- Discovered/ingested WPs: project_name, token_address, chain, status, selection_score
wpv_claims                -- Extracted claims: category, claim_text, evidence, evaluation_json, claim_score
wpv_verifications         -- Results: structural_score, confidence_score, hype_tech_ratio, verdict, report_json
```

**Key indexes:** Composite on (project_name, chain). GIN on evaluation_json. Partial on verdict='PASS' (Greenlight). Partial on verdict='FAIL' AND hype_tech_ratio > 3.0 (Scam Alerts).

---

## Development Commands

```bash
# Build plugin
cd C:\Users\kidco\dev\eliza\plugin-wpv
bun run build

# Run all tests
bun run test

# Run single test file
npx vitest run tests/JobRouter.test.ts

# Run tests in watch mode
bun run test:watch
```

---

## Testing

Tests live in `tests/` (17 files, 195 tests). All external APIs are mocked (ACP SDK, Anthropic, Base RPC). Eliza `@elizaos/core` is mocked in `tests/setup.ts`.

| File | What it covers |
|------|---------------|
| `BaseChainListener.test.ts` | Base chain event polling, dedup, graceful errors |
| `AcpMetadataEnricher.test.ts` | ACP registry queries via IAcpClient, PDF/IPFS URL extraction |
| `WhitepaperSelector.test.ts` | Weighted scoring, PDF required gate, configurable threshold |
| `CryptoContentResolver.test.ts` | IPFS fallback, image-only detection, password detection |
| `DiscoveryCron.test.ts` | Daily orchestrator, batch error tolerance |
| `StructuralAnalyzer.test.ts` | 6 structural checks, quick filter score, hype/tech ratio |
| `ClaimExtractor.test.ts` | Anthropic tool_use extraction, cost tracking |
| `ClaimEvaluator.test.ts` | 5 evaluation methods, batch consistency |
| `ScoreAggregator.test.ts` | Weighted scores, verdict thresholds, INSUFFICIENT_DATA |
| `CostTracker.test.ts` | Token usage + compute cost tracking |
| `ReportGenerator.test.ts` | 3 tiered reports + daily briefing, superset rule |
| `AcpWrapper.test.ts` | IAcpClient implementation, init validation |
| `ResourceHandlers.test.ts` | Greenlight list, scam alert feed |
| `JobRouter.test.ts` | 5 offering routes, cached/live pipeline, flywheel |
| `RateLimiter.test.ts` | Sequential queue, wait time, cancellation |
| `wpvActions.test.ts` | 6 action handlers validate + handler + callback |
| `wpvSchema.test.ts` | Schema creation, CRUD, indexes, FK constraints |
| `integration.test.ts` | Full pipeline e2e: discovery → verification → delivery |

---

## Environment Variables

```bash
# LLM (required for L2/L3 verification)
ANTHROPIC_API_KEY=sk-ant-...

# WPV Model (default: claude-sonnet-4-20250514)
WPV_MODEL=claude-sonnet-4-20250514

# ACP Integration (Virtuals Protocol)
ACP_WALLET_PRIVATE_KEY=0x...
ACP_SESSION_ENTITY_KEY_ID=your-key-id
ACP_AGENT_WALLET_ADDRESS=0x...

# Base Chain
BASE_RPC_URL=https://mainnet.base.org
VIRTUALS_FACTORY_CONTRACT=0x...

# Supabase (production — $25/mo Pro plan)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
WPV_DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

---

## Guardrails

### DO
- Always call `callback()` before returning from action handlers
- Destructure results to primitive fields in `ActionResult.data`
- Build plugin with `bun run build`
- Mock ALL external APIs in tests (ACP SDK, Anthropic, Base RPC)
- Use `logger.child()` for component-specific logging
- Update heartbeat after every session

### DON'T
- Spread opaque objects into `ActionResult.data` (causes cyclic serialization)
- Skip `callback` in handlers (ElizaOS falls back to sendMessage → infinite loop)
- Put API keys in source files or committed configs
- Make tests depend on live API calls — everything must be mockable
- Skip COC/V tracking — critical business metric

---

## Related Documentation

- `heartbeat.md` — Live session state, build/test status, next actions
- `BUILD DOCS and DATA/WPV_Agent_Technical_Architecture_v1.3.md` — Full architecture spec
- `BUILD DOCS and DATA/WPV_Kovsky_Instruction_Set.md` — Phase A→B→C build specification
- `BUILD DOCS and DATA/WPV_Strategic_Analysis_Report_final.md` — Market intelligence and pricing
- `BUILD DOCS and DATA/Butler_Intelligence.md` — Butler scan results
- `README.md` — Setup and usage guide

---

*Last updated: 2026-03-12*
