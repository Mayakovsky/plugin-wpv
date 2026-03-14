# HEARTBEAT — plugin-wpv
> Last updated: 2026-03-12 (migrated from plugin-autognostic heartbeat)
> Updated by: Claude Opus 4.6 — SeshMem migration to standalone repo
> Session label: Repo extraction complete — all WPV code migrated from plugin-autognostic to plugin-wpv
> Staleness gate: 2026-03-12 — if today is >3 days past this,
>   verify state before acting (see Section 3 of SeshMem schema).

## Focus (1-3 goals, testable)
- [x] Phase A: Discovery pipeline — types, schema, chain listener, ACP enricher, selector, content resolver, cron
- [x] Phase B: Verification engine — structural analyzer, claim extraction, evaluation, score aggregator, reports
- [x] Phase C: ACP integration — ACP wrapper, agent card, resource handlers, job router, rate limiter, actions
- [x] Extract WPV into standalone plugin-wpv repo (separated from plugin-autognostic)
- [ ] **IRL testing round** — live agent with real whitepapers, real LLM calls, real Supabase
- [ ] **ACP sandbox graduation** — 10 test transactions, submit graduation request

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-03-12
- ✅ Tests (`bun run test`) — 195/195 pass across 17 test files — verified 2026-03-12
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ @elizaos/core mocked in tests/setup.ts (Service base class + logger)
- ✅ plugin-autognostic as optional peer dependency

**Discovery (Phase A):**
- ✅ types.ts + constants.ts — all enums, interfaces, config constants
- ✅ WS-A5: wpvSchema — 3 tables + 3 repos + indexes (Drizzle ORM)
- ✅ WS-A1: BaseChainListener — Base chain polling, dedup, graceful errors
- ✅ WS-A2: AcpMetadataEnricher — IAcpClient interface, PDF/IPFS URL extraction
- ✅ WS-A3: WhitepaperSelector — weighted scoring (max 10), PDF required gate, configurable threshold
- ✅ WS-A4: CryptoContentResolver — IPFS fallback, image-only detection, password detection
- ✅ WS-A6: DiscoveryCron — daily orchestrator, error-tolerant batch processing

**Verification (Phase B):**
- ✅ WS-B5: CostTracker — token usage + compute cost tracking
- ✅ WS-B1: StructuralAnalyzer — 6 checks, quick filter score (1–5), hype/tech ratio
- ✅ WS-B2: ClaimExtractor — Anthropic tool_use extraction, cost tracking
- ✅ WS-B3: ClaimEvaluator — math, benchmarks, citations, originality, batch consistency
- ✅ WS-B3: ScoreAggregator — weighted scores, verdict thresholds, INSUFFICIENT_DATA
- ✅ WS-B4: ReportGenerator — 3 tiered reports + daily briefing, superset rule

**ACP Integration (Phase C):**
- ✅ WS-C1: AcpWrapper — implements IAcpClient, init validation, thin SDK wrapper
- ✅ WS-C2: AgentCardConfig + ResourceHandlers — greenlight list, scam alert feed
- ✅ WS-C3: JobRouter — 5 offering routes, cached/live pipeline, flywheel logic
- ✅ WS-C6: RateLimiter — sequential queue for live tiers, cancellation
- ✅ WS-C7: 6 Eliza action handlers (scan, verify, status, cost, greenlight, alerts)

**Integration:**
- ✅ Integration e2e test — full pipeline: discovery → verification → delivery

## What's Broken
- (none identified — all 195 tests pass)
- ⚠️ All tests use mocks — no live API calls have been made yet
- ⚠️ Supabase schema not deployed to production instance yet
- ⚠️ ACP SDK not tested against live Virtuals contract
- ⚠️ LLM claim extraction/evaluation not tested with real whitepapers

## Test Count
- **195 tests across 17 files, 0 failures**

| Area | Files | Tests |
|------|-------|-------|
| Discovery | 5 | ~50 |
| Verification | 6 | ~65 |
| ACP | 4 | ~40 |
| Schema + Actions | 2 | ~25 |
| Integration e2e | 1 | ~15 |

## Next Actions (ordered)
1. **Deploy Supabase schema** — run Drizzle migrations against Pro instance, verify tables + indexes
2. **Smoke test: StructuralAnalyzer with real WP** — fetch a known crypto whitepaper PDF, run L1 analysis, verify scores
3. **Smoke test: ClaimExtractor with real LLM** — run L2 extraction against real whitepaper with live Anthropic API
4. **Smoke test: Full pipeline** — discovery cron → L1+L2+L3 → report generation → DB storage
5. **Smoke test: CryptoContentResolver** — test IPFS fallback, image-only detection with real PDFs
6. **Smoke test: BaseChainListener** — connect to Base RPC, verify event parsing against live contract
7. **ACP sandbox** — register agent, run 10 test transactions, submit graduation request
8. **Agent integration** — build wpv-agent that loads both plugin-wpv + plugin-autognostic, test slash commands
9. **v1 release prep**

## Repo Migration Notes
This plugin was extracted from `plugin-autognostic` where WPV was built as a subsystem under `src/wpv/`. The decision to separate was made to keep autognostic focused on general knowledge infrastructure (CAKC) and give WPV its own release cycle, dependency tree, and GitHub repo.

Key changes during migration:
- Source moved from `plugin-autognostic/src/wpv/` → `plugin-wpv/src/`
- Tests moved from flat `tests/wpv/` → `tests/` (top-level, no subdirectory)
- `WpvService` added as central dependency container (extends Eliza Service)
- `plugin-autognostic` became optional peer dependency
- Test setup mocks `@elizaos/core` (Service + logger) in `tests/setup.ts`
- All build docs and reference data moved to `BUILD DOCS and DATA/`
- Own `package.json`, `tsconfig.json`, `vitest.config.ts`
- Total tests: 195 (standalone) vs 196 (when inside autognostic — 1 test dropped during migration)

## Session Log
| Date | Agent | What changed | Outcome |
|------|-------|-------------|---------|
| 2026-03-12 | Forces + Kovsky | Extract WPV to standalone plugin-wpv repo | 195 tests, clean build |
| 2026-03-12 | Claude Opus 4.6 | Create CLAUDE.md + heartbeat.md for plugin-wpv | SeshMem initialized |

## Guardrails (DO / DON'T)
DO:
- Always call `callback()` before returning from action handlers
- Destructure results to primitive fields in `ActionResult.data`
- Build with `bun run build`, test with `bun run test`
- Mock ALL external APIs in tests
- Use `logger.child()` for component-specific logging
- Update heartbeat after every session

DON'T:
- Spread opaque objects into ActionResult.data (causes cyclic serialization)
- Skip callback in handlers (ElizaOS falls back to sendMessage → infinite loop)
- Put API keys in source files
- Make tests depend on live API calls
- Skip COC/V tracking

## Quick Commands
```bash
# Build plugin
cd C:\Users\kidco\dev\eliza\plugin-wpv
bun run build

# Run all tests
bun run test

# Run single test file
npx vitest run tests/JobRouter.test.ts

# Watch mode
bun run test:watch
```

## Links
- [CLAUDE.md](./CLAUDE.md) — Agent identity + permissions
- [README.md](./README.md) — Setup and usage
- [BUILD DOCS and DATA/WPV_Agent_Technical_Architecture_v1.3.md](./BUILD%20DOCS%20and%20DATA/WPV_Agent_Technical_Architecture_v1.3.md) — Full architecture
- [BUILD DOCS and DATA/WPV_Kovsky_Instruction_Set.md](./BUILD%20DOCS%20and%20DATA/WPV_Kovsky_Instruction_Set.md) — Build specification
