# HEARTBEAT — plugin-wpv
> Last updated: 2026-03-24 (Virtuals registration complete, plugin-acp plan created)
> Updated by: Claude Opus 4.6 — Forces session, registration + ACP bridge planning
> Session label: Agent registered, plugin-acp needed for ACP marketplace connection
> Staleness gate: 2026-03-24 — if today is >3 days past this,
>   verify state before acting (see Section 3 of SeshMem schema).

## Focus (1-3 goals, testable)
- [x] Phase A: Discovery pipeline
- [x] Phase B: Verification engine
- [x] Phase C: ACP integration (schemas, reports, actions — code complete)
- [x] All Phase 1 code tasks (1.1–1.5) + pipeline hardening (1.6A–D)
- [x] **Seed ingestion** — 3 waves, 66 tokens verified
- [x] **66 Test certified** — 267/267 pass, local + VPS
- [x] **ACP v2 schema hardening** — NOT_IN_DATABASE verdict, structuralScore min 0, flat response shape, cache-only tiers, token_address required, focusAreaScores lowercase
- [x] **Virtuals registration** — Provider, 5 offerings, wallet created
- [x] **Pre-graduation tweets** — 5 tweets posted/scheduled
- [ ] **plugin-acp** — ElizaOS ↔ ACP bridge plugin (Kovsky building). Wraps @virtuals-protocol/acp-node SDK. Standalone, generic, releasable to ElizaOS plugin repo.
- [ ] **Wire plugin-wpv to plugin-acp** — replace stubbed AcpWrapper with real SDK connection via AcpService
- [ ] **Sandbox graduation** — 10 test transactions, submit graduation request
- [ ] **LAUNCH** — fire outreach, pinned thread, monitor

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-03-23
- ✅ Tests (`bun run test`) — 304/304 pass across 23 test files — verified 2026-03-23
- ✅ **66 Test certified** — 267/267 pass (local + VPS), 100% evaluator readiness — verified 2026-03-23
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ VPS deployed: AWS Lightsail us-west-2, Grey running 24/7 via PM2, reboot recovery tested
- ✅ Virtuals agent registered: Provider role, 5 job offerings, wallet whitelisted

## What's Broken
- ⚠️ **AcpWrapper.ts is entirely stubbed** — Grey cannot receive or fulfill ACP jobs. This is the critical blocker. plugin-acp replaces it.
- ⚠️ types.ts + AgentCardConfig.ts + ReportGenerator.ts updated (Verdict enum, structuralScore min, focusAreaScores lowercase) but **not yet built/tested** — Kovsky must rebuild + retest + re-run 66 Test
- ⚠️ Image-only PDF detection limited (deferred Phase 2)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred Phase 2)

## Test Count
- **304 tests across 23 test files, 0 failures** (pre-schema-hardening)

## Next Actions (ordered)
1. **Kovsky: rebuild + retest** after types.ts/AgentCardConfig.ts/ReportGenerator.ts changes
2. **Kovsky: build plugin-acp** — new repo, wraps @virtuals-protocol/acp-node, AcpService + actions
3. **Kovsky: wire plugin-wpv** — register offering handlers via AcpService, remove stubbed AcpWrapper
4. **Forces: share ACP credentials** with Kovsky for .env
5. **Forces: fund agent wallet** with USDC
6. **Kovsky: build buyer test agent** — 10 sandbox transactions
7. **Sandbox graduation** → Virtuals review 24–48hr
8. **GRADUATION DAY** — outreach + pinned thread

## ACP Registration Context
- **Role:** Provider
- **Evaluation optional** — buyers can skip for data retrieval
- **Grey defines schemas** — Deliverable Requirements in AgentCardConfig.ts
- **66 Test: 267/267** — response shapes validated
- **Cache-only $0.25/$1.50** — verdict=NOT_IN_DATABASE if uncached, flat shape always
- **token_address required** on all offerings, project_name optional
- **focusAreaScores keys lowercase** — tokenomics, performance, consensus, scientific

## ACP Schema Design Decisions (2026-03-24)
- Verdict enum: PASS / CONDITIONAL / FAIL / INSUFFICIENT_DATA / NOT_IN_DATABASE
- structuralScore: 0–5 (0 = not analyzed)
- Cache-only tiers never run live pipeline
- Single flat response shape, no conditional branching
- token_address required, project_name optional
- focusAreaScores: lowercase keys in reports (internal ScoreAggregator stays uppercase)

## plugin-acp Architecture (Planned)
- **Package:** `@elizaos/plugin-acp` or `@scigent/plugin-acp`
- **Dependency:** `@virtuals-protocol/acp-node`
- **AcpService** extends Eliza Service — lifecycle, handler registry, WebSocket management
- **Offering handler registry** — plugins register handlers for offering IDs, AcpService dispatches
- **Actions:** ACP_BROWSE, ACP_JOBS, ACP_WALLET
- **Plugin load order:** `acp` loads before `wpv` so WpvService can find AcpService
- **Generic, releasable** — any ElizaOS agent can use it, not WPV-specific

## Session Log
| Date | Agent | What changed | Outcome |
|------|-------|-------------|---------|
| 2026-03-12 | Forces + Kovsky | Extract WPV to standalone plugin-wpv repo | 195 tests, clean build |
| 2026-03-14 | Claude Opus 4.6 | Action selection fix, Supabase, smoke tests, E2E | 195/195 tests |
| 2026-03-17 | Claude Opus 4.6 | Brand, factory contract, MiCA, PDF audit, agent tests | 249/249 tests |
| 2026-03-18 | Claude Opus 4.6 | MiCA pipeline audit, VPS deployed, multi-tier discovery, fork detection, market traction, LLM cost tracking | 258/258 tests, VPS live |
| 2026-03-19–21 | Claude Opus 4.6 | Seed ingestion (3 waves), ACP v2 schemas, confidenceScore fix | 304/304 tests |
| 2026-03-23 | Claude Opus 4.6 | 66 Test evaluator built + certified | 267/267 pass |
| 2026-03-23 | Claude Opus 4.6 (Forces) | Instruction sets rewritten, role confirmed Provider, tweets posted | Docs current |
| 2026-03-24 | Claude Opus 4.6 (Forces) | ACP schema hardening, Virtuals registration completed, plugin-acp plan created | Agent live on Virtuals, awaiting ACP bridge |

## Quick Commands
```bash
bun run build && bun run test
npx vitest run tests/JobRouter.test.ts
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
cd /opt/grey/plugin-wpv && bun run scripts/run66Test.ts
```

## Links
- [CLAUDE.md](./CLAUDE.md) — Agent identity + permissions
- [BUILD DOCS and DATA/Grey_Kovsky_Execution.md](./BUILD%20DOCS%20and%20DATA/Grey_Kovsky_Execution.md) — Current Kovsky execution plan
- [BUILD DOCS and DATA/Grey_PreLaunch_Checklist.md](./BUILD%20DOCS%20and%20DATA/Grey_PreLaunch_Checklist.md) — Forces pre-launch tasks
