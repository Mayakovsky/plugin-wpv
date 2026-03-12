# @elizaos/plugin-wpv

**Whitepaper Verification Plugin** — SCIGENT Level 1

Autonomous crypto whitepaper verification pipeline for [ElizaOS](https://github.com/elizaos/eliza). Discovers new token launches on Base, ingests whitepapers, and runs a three-layer verification pipeline to produce structured audit reports. Operates as a service on the [Virtuals.io](https://virtuals.io) Agent Commerce Protocol (ACP).

## Architecture

```
Discovery Pipeline          Verification Pipeline           ACP Service Layer
─────────────────          ──────────────────────          ─────────────────
BaseChainListener           L1: StructuralAnalyzer          JobRouter
       ↓                       (no LLM)                        ↓
AcpMetadataEnricher              ↓                       5 Paid Offerings
       ↓                   L2: ClaimExtractor              2 Free Resources
CryptoContentResolver          (Claude Sonnet)                 ↓
       ↓                        ↓                        AcpWrapper
WhitepaperSelector          L3: ClaimEvaluator               (on-chain)
       ↓                      (5 methods)
DiscoveryCron                    ↓
  (daily @ 06:00 UTC)     ScoreAggregator → ReportGenerator
```

### Three-Layer Verification

| Layer | Component | LLM | Purpose |
|-------|-----------|-----|---------|
| L1 | StructuralAnalyzer | No | Section detection, citation counting, math density, hype/tech ratio |
| L2 | ClaimExtractor | Claude Sonnet | Extract testable claims from whitepaper text |
| L3 | ClaimEvaluator | Claude Sonnet | Evaluate claims via 5 methods: math validity, benchmarks, citations, originality, consistency |

### ACP Offerings

| Offering | Price | Pipeline |
|----------|-------|----------|
| `project_legitimacy_scan` | $0.25 | L1 structural check |
| `tokenomics_sustainability_audit` | $1.50 | L1 + L2 claim analysis |
| `verify_project_whitepaper` | $2.00 | Full L1 + L2 + L3 |
| `full_technical_verification` | $3.00 | Comprehensive report with all evaluations |
| `daily_technical_briefing` | $8.00 | Batch of full verifications |

### Free Resources

- **Daily Greenlight List** — projects that passed verification today
- **Scam Alert Feed** — flagged projects with red flags and high hype/tech ratio

## Eliza Actions

| Action | Trigger | Description |
|--------|---------|-------------|
| `WPV_SCAN` | "wpvscan", "scan whitepapers" | Run the daily discovery pipeline |
| `WPV_VERIFY` | "wpv verify", "verify whitepaper" | Submit a URL for verification |
| `WPV_STATUS` | "wpv status", "pipeline status" | Show pipeline counts by status |
| `WPV_COST` | "wpv cost", "compute cost" | Show LLM token usage and cost |
| `WPV_GREENLIGHT` | "greenlight list" | Show today's verified projects |
| `WPV_ALERTS` | "scam alerts" | Show flagged projects |

## Setup

### As a standalone plugin

```bash
cd plugin-wpv
bun install
bun run build
```

### With the WPV Agent

The WPV Agent loads both `plugin-wpv` and `plugin-autognostic`:

```bash
cd wpv-agent
bun install
bun run build
elizaos dev
```

### Environment Variables

```bash
# LLM (required)
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

# Supabase (production — $25/mo Pro plan for pgvector)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
WPV_DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

## Database Schema

Three tables in the `autognostic` schema:

- **`wpv_whitepapers`** — discovered/ingested whitepapers with project metadata, selection score, status
- **`wpv_claims`** — extracted claims with category, evidence, evaluation scores
- **`wpv_verifications`** — verification results with structural analysis, verdict, focus area scores

## Testing

```bash
bun run test
```

17 test files, 195 tests covering discovery, verification, ACP routing, actions, schema, and integration.

## Project Context

Part of the **SCIGENT** autonomous research infrastructure:

| Layer | Component | Role |
|-------|-----------|------|
| Level 0 | `plugin-autognostic` | Knowledge infrastructure: PDF ingestion, academic APIs, dual storage |
| Level 1 | `plugin-wpv` (this) | Verification pipeline, ACP service interface, Butler-optimized discovery |
| Level 2 | Agent Teams Agency | Future — multi-agent coordination |

The WPV Agent's mission on Virtuals is to build a database of whitepapers and their verifications that accrues daily, turning aggregate data into a valuable asset over time. The first buyer of any `verify_project_whitepaper` job funds live inference; all subsequent lookups are served from cache at near-zero marginal cost.
