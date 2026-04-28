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
| **Test Framework** | Vitest (310 tests, 24 files) |
| **Peer Dependencies** | `@elizaos/plugin-autognostic` (optional), `@elizaos/plugin-acp` (optional — ACP marketplace connection) |
| **LLM** | Claude Sonnet via Anthropic API (`claude-sonnet-4-20250514`). Set via `WPV_MODEL` env var. Haiku tested but insufficient for claim extraction on technical whitepapers — returned 0 claims on Aave v1 PDF. |
| **Chain** | Base (Virtuals Protocol) |

---

## ACP Marketplace Connection

**`plugin-acp`** (github.com/Mayakovsky/plugin-acp) bridges ElizaOS ↔ Virtuals ACP v2. Dual interface:
- **HTTP job handler** (port 3001) — Virtuals sends POST `{job_id, offering_id, arguments}`, Grey returns `{status, deliverable}`. Used for testing.
- **ACP v2 SDK** — `@virtuals-protocol/acp-node-v2` event-driven `agent.on('entry')` with `SocketTransport` for production job dispatch. Uses `PrivyAlchemyEvmProviderAdapter` (Privy-managed wallet via Virtuals).

`WpvService.start()` registers all 4 offering handlers with AcpService (retries after 3s if AcpService loads later). WpvService connects directly to Supabase via `WPV_DATABASE_URL` (not ElizaOS PGlite).

**`AcpWrapper.ts` is a legacy stub** — retained for `IAcpClient` interface in tests. Not used in production.

**Plugin load order:**
```
sql → ollama → anthropic → knowledge → autognostic → acp → wpv → bootstrap
```
`acp` must load before `wpv` so WpvService can find AcpService at registration time.

---

## Autonomous Permissions

**Full read/write access granted to all files in this repository.**

Read/Modify without confirmation: `**/*`

**Execution mode:** Always run with `--dangerously-skip-permissions`.

---

## Architecture

### Source Tree

```
src/
├── types.ts                          # All WPV type definitions, enums, interfaces
├── constants.ts                      # Config: cron schedule, thresholds, score weights, verdict cutoffs
├── constants/
│   └── protocols.ts                  # Canonical KNOWN_PROTOCOL_PATTERN (shared across repos)
├── index.ts                          # Plugin registration (6 actions + WpvService)
├── WpvService.ts                     # Central service — dependency container for all WPV subsystems
│
├── discovery/                        # Stage 1: Find and ingest crypto whitepapers
│   ├── BaseChainListener.ts
│   ├── AcpMetadataEnricher.ts
│   ├── WhitepaperSelector.ts
│   ├── CryptoContentResolver.ts
│   ├── DiscoveryCron.ts
│   ├── ForkDetector.ts
│   ├── MarketTractionAnalyzer.ts
│   ├── TieredDocumentDiscovery.ts
│   ├── WebsiteScraper.ts
│   ├── WebSearchFallback.ts
│   ├── SyntheticWhitepaperComposer.ts
│   └── similarity.ts
│
├── verification/                     # Stage 2: Three-layer verification pipeline
│   ├── StructuralAnalyzer.ts         # L1: score 0–5 (0=not analyzed), hype/tech ratio
│   ├── ClaimExtractor.ts             # L2: Claude Sonnet structured output
│   ├── ClaimEvaluator.ts             # L3: 5 evaluation methods
│   ├── ScoreAggregator.ts            # → confidence score (0–100) → verdict
│   ├── ReportGenerator.ts            # Tiered JSON reports (focusAreaScores keys: lowercase)
│   └── CostTracker.ts               # Per-stage breakdown
│
├── acp/                              # Stage 3: ACP service interface
│   ├── AcpWrapper.ts                 # Legacy stub (IAcpClient interface for tests only)
│   ├── AgentCardConfig.ts            # 5 offerings, 2 resources, ACP v2 deliverable schemas
│   ├── JobRouter.ts                  # Routes offering_id → pipeline depth (cached vs. live)
│   ├── ResourceHandlers.ts           # Greenlight List + Scam Alert Feed
│   └── RateLimiter.ts               # Sequential queue for live tiers
│
├── db/                               # Drizzle ORM on Supabase PostgreSQL
├── actions/                          # 6 Eliza action handlers
└── utils/
```

### Pipeline Flow

```
[1] DISCOVERY  →  [2] VERIFICATION  →  [3] DELIVERY
                                         JobRouter
                                            ↓
                                      plugin-acp (AcpService)
                                            ↓
                                      @virtuals-protocol/acp-node
                                            ↓
                                      ACP Marketplace (on-chain)
```

### Verdict Enum

```typescript
enum Verdict {
  PASS = 'PASS',
  CONDITIONAL = 'CONDITIONAL',
  FAIL = 'FAIL',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  NOT_IN_DATABASE = 'NOT_IN_DATABASE',  // Cache-only tiers, project not cached
}
```

### ACP Service Interface

**Role:** Provider

| offering_id | Price | Pipeline | SLA |
|-------------|-------|----------|-----|
| legitimacy_scan | $0.25 | Cache or live L1 | 5min |
| verify_whitepaper | $1.50 | Cache or live L1+L2 | 10min |
| verify_full_tech | $3.00 | Cache or live L1+L2+L3 | 15min |
| daily_tech_brief | $8.00 | Cron summary | 5min |

> Renamed 2026-04-24 for platform character limit. Old names
> (`project_legitimacy_scan` etc.) removed from code + tests.
> Test-price regime (0.01–0.04) replaced by production prices at the same time.

**2 Free Resources:** Daily Greenlight List, Scam Alert Feed

**Input:** `token_address` required, `project_name` optional on all offerings.

**Cache-only tiers ($0.25, $1.50):** Never run live pipeline. Return flat shape with `verdict: NOT_IN_DATABASE` and zeroed fields if uncached. All declared deliverables always present.

**focusAreaScores keys:** lowercase (`tokenomics`, `performance`, `consensus`, `scientific`). Internal ScoreAggregator uses uppercase ClaimCategory enum; ReportGenerator transforms to lowercase at the output boundary.

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
WPV_MODEL=claude-sonnet-4-20250514
ACP_AGENT_WALLET_ADDRESS=0xa966...    # Privy-managed wallet (post-v2 migration)
ACP_PRIVY_WALLET_ID=...               # Privy wallet ID (string, from Virtuals Signers tab)
ACP_PRIVY_SIGNER_KEY=...              # Privy authorization key (from Virtuals Add Signer)
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
WPV_DATABASE_URL=postgresql://...
```

---

## Guardrails

### DO
- Always call `callback()` before returning from action handlers
- Destructure results to primitive fields in `ActionResult.data`
- Build with `bun run build`, test with `bun run test`
- Mock ALL external APIs in tests
- Update heartbeat after every session

### DON'T
- Spread opaque objects into `ActionResult.data` (cyclic serialization)
- Skip `callback` in handlers (infinite loop)
- Put API keys in source files
- Make tests depend on live API calls
- Skip COC/V tracking

---

## Scripts

```
scripts/
├── seedIngest.ts        # Seed ingestion: L1+L2, Supabase storage
├── seedL2.ts            # Targeted L2 extraction
└── run66Test.ts         # Pre-launch certification: 66 tokens × 7 endpoints
```

---

## VPS Deployment Process

**plugin-wpv** (public repo — git pull works):
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
cd /opt/grey/plugin-wpv && git pull && bun install && bun run build
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey
```

**plugin-acp** (PRIVATE repo — git pull broken, use SCP):
```bash
# From local machine — SCP all changed files:
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/types.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/types.ts
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/constants.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/constants.ts
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/package.json ubuntu@44.243.254.19:/opt/grey/plugin-acp/package.json
# On VPS:
cd /opt/grey/plugin-acp && bun install && bun run build
# dist is SYMLINKED into wpv-agent/node_modules — no copy needed
pm2 restart grey
```

**CRITICAL:** plugin-acp dist is symlinked (`/opt/grey/wpv-agent/node_modules/@elizaos/plugin-acp/dist → /opt/grey/plugin-acp/dist`). Do NOT `bun install` in wpv-agent or the symlink may be replaced with a stale copy. ElizaOS re-bundles on startup from node_modules dist files.

**ACP v2 env vars required** (set in wpv-agent/.env before restart):
```
ACP_AGENT_WALLET_ADDRESS=0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f
ACP_PRIVY_WALLET_ID=<from Virtuals Signers tab>
ACP_PRIVY_SIGNER_KEY=<from Virtuals Add Signer>
```

**After restart:** Wait for "SDK connected (v2, PrivyAlchemy, SocketTransport)" + "Registered 4 offering handlers" in logs before triggering any tests.

**Use `vitest run` (not `vitest`)** for local tests — watch mode leaves orphaned processes.

---

## Related Documentation

- `heartbeat.md` — Live session state
- `BUILD DOCS and DATA/F5_Aave_V3_Diagnostic_Report.md` — Aave V3 discovery diagnostic + recommendations
- `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan_v3.md` — Playwright headless browser for SPA whitepapers (implemented)
- `BUILD DOCS and DATA/Database_Hygiene_Service_Plan_v2.md` — Automated DB cleanup (deferred post-graduation)
- `BUILD DOCS and DATA/Forces_Context_Handoff_2026-04-04.md` — Context handoff for Forces new session
- `BUILD DOCS and DATA/Grey_Kovsky_Execution.md` — Current execution plan (includes plugin-acp build spec)
- `BUILD DOCS and DATA/Grey_PreLaunch_Checklist.md` — Forces tasks
- `BUILD DOCS and DATA/Grey_50_Test_Regimen.md` — 66 Test specification
- `BUILD DOCS and DATA/WPV_Agent_Technical_Architecture_v1.3.md` — Full architecture
- `BUILD DOCS and DATA/Eval_Run_24_Analysis.md` — Eval 24 failure analysis + DocsSiteCrawler architecture sketch
- `BUILD DOCS and DATA/Grey_Kovsky_Execution_PreEval24.md` — Pre-eval 24 hardening plan (5 tasks, all implemented)
- `BUILD DOCS and DATA/Grey_Kovsky_Execution_ChainlinkPendle.md` — Redirect detection + SPA link-following plan
- `BUILD DOCS and DATA/Grey_Kovsky_Execution_Eval34_Fixes.md` — Eval 34 fix plan (mutex, timeout, resolveTokenName)
- `BUILD DOCS and DATA/Grey_Kovsky_Execution_Eval35_Fixes_v3.md` — Eval 35 fix plan v3 (9-fix infrastructure overhaul)
- `BUILD DOCS and DATA/Grey_Graduation_Report.md` — Graduation report and post-launch context
- `BUILD DOCS and DATA/Video_Graduation_Test_Report_2026-04-22.md` — Video graduation tests: 8/8 PASS + race condition fix detail
- `BUILD DOCS and DATA/Eval_Zoom_Out_Fix_Plan_2026-04-23.md` — A+B+C zoom-out plan for eval cycle 3 regressions (pending Forces approval)
- `README.md` — Setup and usage

---

*Last updated: 2026-04-28 (🎓 ACP application submitted (2026-04-27). 16/16 eval cycle 7 + 8/8 video battery on record. Daily Aggregation Cycle wiring plan drafted — `BUILD DOCS and DATA/Daily_Aggregation_Wiring_Plan.md`. 10-step activation sequence + 6 Forces decisions awaiting signoff before Step 1 (AcpService bridge). 399 tests / 35 files. Grey ONLINE on VPS, 4 handlers registered. Next: Forces decisions, then DiscoveryCron wiring, then production prices + launch.)*
