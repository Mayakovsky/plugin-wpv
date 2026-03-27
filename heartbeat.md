# HEARTBEAT — plugin-wpv
> Last updated: 2026-03-27 (ACP credentials deployed, SDK wallet not whitelisted on-chain)
> Updated by: Claude Opus 4.6 — Kovsky session
> Session label: ACP credentials in .env, HTTP handler active, SDK blocked on on-chain wallet whitelisting
> Staleness gate: 2026-03-27 — if today is >3 days past this,
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
- [x] **plugin-acp built** — ElizaOS ↔ ACP bridge (47 tests). AcpService + HTTP job handler + 3 actions. github.com/Mayakovsky/plugin-acp
- [x] **plugin-wpv wired to plugin-acp** — WpvService registers 5 offering handlers via AcpService. Standalone mode if ACP unavailable.
- [x] **Security hardening** — guarded JSON.parse, NaN validation, empty offeringId rejection, CostTracker reset per job, URL protocol whitelist on live pipeline
- [x] **Virtuals best practice** — rejectPayable refund on post-acceptance failure, InputValidationError, token_address hex validation
- [x] **HTTP job handler** — port 3001, handles Virtuals POST requests with correct JSON shapes. notInDatabase returns flat deliverable (not bare error).
- [x] **WpvService full pipeline init** — JobRouter + ReportGenerator + repos via direct Supabase connection (WPV_DATABASE_URL), not ElizaOS PGlite
- [x] **Daily briefing** — capped at 10, backfills from recent verifications if today's batch is short
- [x] **VPS deployed** — all repos built, Grey running, HTTP handler on port 3001 (2026-03-26)
- [x] **Sandbox requirements complete** — 10 successful transactions on-chain
- [x] **Breakbot tests passed** — all 5 offerings tested (positive + negative), all passed (2026-03-26)
- [x] **Graduation submission sent** — videos submitted to Virtuals for human review
- [x] **ACP credentials deployed** — all 3 vars in .env (local + VPS) (2026-03-27)
- [ ] **ACP SDK WebSocket** — BLOCKED. `AcpError: no whitelisted wallet registered on-chain for entity id 40675`. Forces must whitelist wallet `0x48A5...` in Virtuals portal.
- [ ] **Graduation** — NOT YET. Pending Virtuals human review.
- [ ] **LAUNCH** — fire outreach, pinned thread, monitor

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-03-26
- ✅ Tests (`bun run test`) — 304/304 pass across 23 test files — verified 2026-03-26
- ✅ **66 Test certified** — 267/267 pass (local + VPS) — verified 2026-03-26
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ VPS deployed: AWS Lightsail us-west-2, Grey running 24/7 via PM2
- ✅ Virtuals agent registered: Provider role, 5 job offerings, wallet funded
- ✅ **plugin-acp** — 47/47 tests, HTTP handler + rejectPayable + InputValidationError (2026-03-26)
- ✅ **plugin-wpv ↔ plugin-acp wired** — 5 offering handlers, direct Supabase DB (2026-03-26)
- ✅ **wpv-agent** — 13/13 tests (2026-03-26)
- ✅ **HTTP endpoint live** — `http://44.243.254.19:3001` — all 5 offerings responding with correct JSON
- ✅ **Breakbot tests passed** — positive + negative cases for all offerings (2026-03-26)
- ✅ **Graduation submission sent** — videos submitted to Virtuals (2026-03-26)

## What's Broken
- ⚠️ **AcpWrapper.ts is still a stub** — retained for IAcpClient interface tests. Production ACP goes through plugin-acp.
- ⚠️ **ACP SDK WebSocket not connected** — wallet `0x48A5...` not whitelisted on-chain for entity ID `40675`. Grey serves jobs via HTTP handler (port 3001) in the meantime.
- ⚠️ **Ports 3000 + 3001 open** in Lightsail firewall — must close after SDK connects or review completes.
- ⚠️ Image-only PDF detection limited (deferred Phase 2)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred Phase 2)

## Test Count
- **304 tests across 23 test files, 0 failures** (verified 2026-03-26)

## Next Actions (ordered)
1. **Forces: whitelist wallet on-chain** — entity ID `40675` + wallet `0x48A5...` in Virtuals portal
2. **Kovsky: pm2 restart grey** → verify "Connected to ACP marketplace" in logs
3. **Wait for Virtuals human review** — graduation decision
4. **Close ports 3000 + 3001** in Lightsail after SDK connects
5. **LAUNCH** — outreach, pinned thread, monitor

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

## plugin-acp (Built — 2026-03-25, hardened 2026-03-26)
- **Package:** `@elizaos/plugin-acp` — github.com/Mayakovsky/plugin-acp
- **Dependency:** `@virtuals-protocol/acp-node` v0.3.0-beta.39
- **AcpService** extends Eliza Service — lifecycle, handler registry, WebSocket + HTTP dual interface
- **HTTP job handler** on port 3001 — accepts Virtuals POST requests (`{job_id, offering_id, arguments}`)
- **Offering handler registry** — plugins register `(offeringId, handler)` pairs, AcpService dispatches
- **Actions:** ACP_BROWSE, ACP_JOBS, ACP_WALLET
- **47 tests, all passing**
- **Security hardened:** guarded JSON.parse, NaN validation, empty offeringId rejection, bounded browseAgents
- **Virtuals best practice:** rejectPayable refund on post-acceptance failure
- **Deployed to VPS:** HTTP handler active on port 3001, SDK in standalone mode
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
| 2026-03-26 | Claude Opus 4.6 (Kovsky) | rejectPayable, HTTP handler, Supabase direct, daily briefing cap 10, flat notInDatabase, Date fix. Breakbot passed. Videos submitted. | All 5 offerings live |
| 2026-03-27 | Claude Opus 4.6 (Kovsky) | ACP credentials deployed (local + VPS), 0x prefix fix, SDK failed: wallet not whitelisted on-chain. HTTP handler active. 66 Test 267/267 on VPS. | Blocked on Forces whitelisting wallet |

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
