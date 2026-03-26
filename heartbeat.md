# HEARTBEAT — plugin-wpv
> Last updated: 2026-03-26 (rejectPayable + token validation, VPS deployed, 66 Test 267/267)
> Updated by: Claude Opus 4.6 — Kovsky session
> Session label: Virtuals best practice compliance, sandbox reqs complete (NOT graduated — pending review)
> Staleness gate: 2026-03-26 — if today is >3 days past this,
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
- [x] **plugin-acp built** — ElizaOS ↔ ACP bridge (37 tests). AcpService + 3 actions (BROWSE, JOBS, WALLET). Pushed to github.com/Mayakovsky/plugin-acp
- [x] **plugin-wpv wired to plugin-acp** — WpvService registers 5 offering handlers via AcpService. Standalone mode if ACP unavailable.
- [x] **Security hardening** — guarded JSON.parse, NaN validation, empty offeringId rejection, CostTracker reset per job, URL protocol whitelist on live pipeline
- [x] **Virtuals best practice** — rejectPayable refund on post-acceptance failure, InputValidationError for pre-acceptance rejection, token_address hex validation
- [x] **VPS deployed** — all 4 repos built, Grey running in standalone mode, 66 Test 267/267 on VPS (2026-03-26)
- [x] **Sandbox requirements complete** — 10 successful transactions via Butler + hired agent, results on-chain
- [ ] **Graduation** — NOT YET GRADUATED. Pending human review by Virtuals team.
- [ ] **ACP credentials** — blocked on Forces (Virtuals portal issues). 2 of 3 vars missing.
- [ ] **LAUNCH** — fire outreach, pinned thread, monitor

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-03-25
- ✅ Tests (`bun run test`) — 304/304 pass across 23 test files — verified 2026-03-25
- ✅ **66 Test certified** — 267/267 pass (local + VPS), 100% evaluator readiness — verified 2026-03-25
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ VPS deployed: AWS Lightsail us-west-2, Grey running 24/7 via PM2, reboot recovery tested
- ✅ Virtuals agent registered: Provider role, 5 job offerings, wallet whitelisted
- ✅ **plugin-acp** — 41/41 tests, rejectPayable + InputValidationError (2026-03-26)
- ✅ **plugin-wpv ↔ plugin-acp wired** — 5 offering handlers registered via AcpService (2026-03-25)
- ✅ **wpv-agent** — 13/13 tests, load order: sql → ollama → anthropic → knowledge → autognostic → acp → wpv → bootstrap (2026-03-25)

## What's Broken
- ⚠️ **AcpWrapper.ts is still a stub** — retained for IAcpClient interface (used by AcpMetadataEnricher tests). Production ACP goes through plugin-acp.
- ⚠️ **ACP credentials not yet in .env** — blocked on Forces. Grey connects to ACP marketplace only when credentials are present; standalone mode otherwise.
- ⚠️ Image-only PDF detection limited (deferred Phase 2)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred Phase 2)

## Test Count
- **304 tests across 23 test files, 0 failures** (post-hardening, verified 2026-03-25)

## Next Actions (ordered)
1. **Forces: share ACP credentials** (ACP_WALLET_PRIVATE_KEY, ACP_SESSION_ENTITY_KEY_ID, ACP_AGENT_WALLET_ADDRESS)
2. **Forces: fund agent wallet** with USDC
3. **Kovsky: update .env** (local + VPS) with ACP credentials, run Smoke Test 8/8
4. **Kovsky: build buyer test agent** — 10 sandbox transactions
5. **Sandbox graduation** → Virtuals review 24–48hr
6. **GRADUATION DAY** — outreach + pinned thread

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

## plugin-acp (Built — 2026-03-25)
- **Package:** `@elizaos/plugin-acp` — github.com/Mayakovsky/plugin-acp
- **Dependency:** `@virtuals-protocol/acp-node` v0.3.0-beta.39
- **AcpService** extends Eliza Service — lifecycle, handler registry, WebSocket connection
- **Offering handler registry** — plugins register `(offeringId, handler)` pairs, AcpService dispatches incoming jobs
- **Actions:** ACP_BROWSE, ACP_JOBS, ACP_WALLET
- **Plugin load order:** `acp` loads before `wpv` so WpvService can find AcpService
- **41 tests, all passing**
- **Security hardened:** guarded JSON.parse (reject before accept), NaN config validation, empty offeringId rejection, bounded browseAgents params
- **Virtuals best practice:** rejectPayable refund on post-acceptance failure, InputValidationError for pre-acceptance rejection
- **Deployed to VPS:** Grey running in standalone mode (no ACP credentials yet)
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
| 2026-03-25 | Claude Opus 4.6 (Kovsky) | plugin-acp built (37 tests), wired to plugin-wpv, security audit + hardening, 66 Test re-certified | All 3 repos pushed, blocked on ACP credentials |
| 2026-03-26 | Claude Opus 4.6 (Kovsky) | rejectPayable refund flow, InputValidationError, token_address validation, VPS deploy, Grey standalone mode, 66 Test 267/267 on VPS | Virtuals best practice compliant, submission-ready |

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
