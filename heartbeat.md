# HEARTBEAT — plugin-wpv
> Last updated: 2026-03-29 (14/16 regression fix: claim focus, MiCA tightening, discovery fallbacks, DexScreener resolver)
> Updated by: Claude Opus 4.6 — Kovsky session
> Session label: 14/16 regression. Claim extraction scoped to target project, MiCA false positives fixed, SPA/landing page discovery fallbacks in both verify + full_tech.
> Staleness gate: 2026-03-29 — if today is >3 days past this,
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
- [x] **plugin-acp built** — ElizaOS ↔ ACP bridge (59 tests). AcpService + HTTP job handler + 3 actions. github.com/Mayakovsky/plugin-acp
- [x] **ACP dispatch 6-bug fix** — phase split, dedup, envelope {type,value}, no double-serialize, SDK constants, pre-accept InputValidator. WpvService registers validators alongside handlers.
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
- [x] **ACP SDK CONNECTED** — WebSocket live, ACP Room joined, onNewTask active (2026-03-27)
- [x] **respond(true) CONFIRMED** — Raydium (Solana base58) completed full cycle: accept → deliver → evaluator accepted (2026-03-28)
- [x] **Content filtering** — NSFW rejection, non-token name rejection, dead address rejection, malicious keyword rejection (2026-03-28)
- [x] **Address passthrough** — JobRouter returns requested token_address, not cached DB address (2026-03-28)
- [x] **Option A restructure** — 4 offerings (killed tokenomics_sustainability_audit), live L1 on cache miss, all-field content filtering (2026-03-28)
- [x] **WS1: L2+L3 pipeline live** — ClaimExtractor + ClaimEvaluator initialized via anthropicFetchClient. Confirmed in VPS stdout. (2026-03-29)
- [x] **WS2: Plain text parsing** — AcpService.parseRequirement() extracts 0x from natural language. isPlainText skips format validator. (2026-03-29)
- [x] **WS3: document_url validation** — rejects non-URLs, images/media at REQUEST phase. project_name optional. (2026-03-29)
- [x] **WS4: Date handling** — YYYY-MM-DD validation, future date rejection, date passthrough, substantive content filtering. (2026-03-29)
- [ ] **Graduation** — project_legitimacy_scan 4/4 PERFECT. Other 3 offerings now functional. Targeting full graduation.
- [ ] **USDC MiCA data quality** — evaluator says USDC is fully MiCA-compliant, Grey says PARTIAL. May need seed data update if this test case recurs.
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
- ⚠️ **USDC MiCA assessment** — Grey returns PARTIAL, evaluator says fully compliant. Seed data may need update.
- ⚠️ **AcpWrapper.ts is still a stub** — retained for IAcpClient interface tests. Production ACP goes through plugin-acp.
- ⚠️ **Ports 3000 + 3001 open** in Lightsail firewall — close after graduation review completes.
- ⚠️ Image-only PDF detection limited (deferred Phase 2)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred Phase 2)

## Test Count
- **303 tests across 23 test files, 0 failures** (verified 2026-03-28, post-restructure)

## Graduation Eval History
| Run | Score | Passed | Failed | Key Issue |
|-----|-------|--------|--------|-----------|
| 1 | 0/12 | — | all | Dispatch bugs (phase sequencing, no envelope, double-serialize) |
| 2 | 3/6 | 3 rejections | 3 accept+deliver expired | accept() alone doesn't call createRequirement() |
| 3 | 1/4 | 1 rejection | 3 expired | memoToSign.sign() also skips createRequirement() |
| 4 | 3/6 | Raydium COMPLETED + 2 rejections | USDC data quality, NSFW not filtered, non-token name not filtered | Content filtering gaps |
| 5 | 4/4 (scan only) | project_legitimacy_scan PERFECT | Other 3 offerings: claimExtractor null, plain text rejected, date wrong | L2/L3 not wired, no text parsing |
| 6 | 10/18 | 10 passed (all rejections + some accepts) | 8 failed: short hex addr, "scam" filter gap, poisoned cache, doc_url path, NSFW domain, min date | Edge cases in validators + code paths |
| 7 | 16/23 | scan 3/3, briefing 8/8, verify 2/4, full 3/8 | 7 failed: cached L1 0-claims, plain text no addr, 404 URL, bare domain, missing fields | L2 enrichment + text parsing + URL checks |
| 8 | 10/18 | — | 8 failed: hex length, scam filter, poison cache, doc_url path, NSFW domain, min date | Edge case validators |
| 9 | 7/12 | scan PERFECT, briefing PERFECT | 5 failed: non-standard fields, GitHub blob URLs | extractFromUnknownFields + normalizeGitHubUrl |
| 10 | 4/6 | — | 2 failed: porn filter, DNS reject | NSFW pattern + HEAD check network errors |
| 11 | 5/6 | — | 1 failed: SPA doc_url yields 0 claims | verify_project_whitepaper discovery fallback |
| 12 | 6/6 → 5/6 regression | — | 1 failed: Aerodrome SPA (full_tech) | full_tech discovery fallback added |
| 13 | 14/16 regression | — | 2 failed: Bitcoin claims in ETH report, broad MiCA patterns | Claim focus + MiCA tightening |

## Next Actions (ordered)
1. **Re-evaluate via Butler** — claim focus + MiCA tightening + discovery fallbacks deployed
2. **Close ports 3000 + 3001** in Lightsail after graduation
3. **LAUNCH** — outreach, pinned thread, monitor

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
| 2026-03-27 | Claude Opus 4.6 (Kovsky) | ACP credentials deployed, 0x prefix fix, entity key resolved to 3. SDK CONNECTED — WebSocket live, ACP Room joined, 5 handlers active. 66 Test 267/267 on VPS. | Grey is live on ACP marketplace |
| 2026-03-28 | Claude Opus 4.6 (Kovsky) | 6-bug dispatch fix + Bug 7 respond(true) + Fix 8 memoToSign (reverted) + Fix 9 Solana base58 | Eval: 1/4 → 3/6 |
| 2026-03-28 | Claude Opus 4.6 (Kovsky) | 3/6 eval: Raydium COMPLETED. Fixes 10-13: dead address rejection, NSFW filter, non-token name filter, address passthrough in JobRouter | 304/304 tests, deployed to VPS |
| 2026-03-28 | Claude Opus 4.6 (Kovsky) | Option A restructure: 4 offerings, live L1, all-field content filtering, eth_getCode | 303/303, deployed |
| 2026-03-29 | Claude Opus 4.6 (Kovsky) | WS1-4: ClaimExtractor+ClaimEvaluator live (anthropicFetchClient), plain text parsing, doc URL validation, date handling. project_legitimacy_scan 4/4 PERFECT. | 303/303, deployed |
| 2026-03-29 | Claude Opus 4.6 (Kovsky) | 10/18 hotfix: hex 20-40 chars, scam/fraud filter, cache poison guard, doc_url tokenAddress passthrough, NSFW domain check, min date 2015. Poisoned Supabase entry deleted. | 303/303, deployed |

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
