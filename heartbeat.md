# HEARTBEAT — plugin-wpv
> Last updated: 2026-04-04 (eval run 20: 13/15, switched back to Sonnet, tokenAddress passthrough fix, SPA design plan)
> Updated by: Claude Opus 4.6 — Kovsky session
> Session label: Eval run 20 scored 13/15. Two failures: Aave GitHub PDF 0 claims (Haiku quality), MakerDAO SPA 0 claims (JS rendering gap). Switched back to Sonnet. Fixed tokenAddress passthrough on insufficientData path. SPA headless browser design plan written for Forces review. Next: run eval again with Sonnet, then implement SPA solution.
> Staleness gate: 2026-04-04 — if today is >3 days past this,
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
- [x] **DB cleanup** — Supabase restored from backup after accidental full wipe. 26 duplicate/artifact eval rows deleted, 73 whitepapers retained (66 seed + 7 best-per-address eval keepers). (2026-03-31)
- [x] **MiCA caveat** — StructuralAnalyzer appends regulatory filing disclaimer for non-YES/non-NOT_APPLICABLE results. (2026-03-31)
- [x] **Soft burn address** — WpvService strips burn/null addresses when project_name or document_url present, instead of hard-rejecting. (2026-03-31)
- [x] **Broader web search** — WebSearchFallback queries technical papers + protocol docs + picks docs/GitBook sites as fallback. (2026-03-31)
- [x] **Briefing dedup** — JobRouter deduplicates daily briefing by tokenAddress, keeping entry with most claims. (2026-03-31)
- [x] **Legitimacy token resolver** — handleLegitimacyScan calls resolveTokenName() when project_name missing (matching verify/full patterns). (2026-03-31)
- [x] **character.ts reframe** — MiCA description updated, offerings trimmed from 5 to 4. (2026-03-31)
- [x] **F1-F4 eval fixes** — hack/exploit all-field scan, Bitcoin address rejection, 80-protocol regex, cross-field consistency check. (2026-04-01)
- [x] **R2 version-strip** — findWhitepaper + findBestWhitepaper strip "V3"/"v2" suffixes for fuzzy DB matching. (2026-04-02)
- [x] **R4 cost logging** — Pipeline complete log in verify + full handlers (projectName, claims, tokens, cost). (2026-04-02)
- [x] **Haiku model** — WPV_MODEL=claude-haiku-4-5-20251001 on VPS for testing (75% cost savings). (2026-04-01)
- [x] **Anthropic Tier 2** — API upgraded to 450k TPM / 1000 RPM ($50+ credits). (2026-04-02)
- [x] **DB restored + cleaned** — PITR backup restored, 8 duplicate/artifact rows removed. 76 whitepapers, 74 verifications, 280 claims. (2026-04-01)
- [x] **AcpService: price-based offeringId inference** — falls back to registered prices when SDK job.name is empty. (2026-04-02)
- [x] **AcpService: readiness probe acceptance** — accepts jobs with no offeringId instead of hard-rejecting (prevents ACP indexer cooldown). (2026-04-03)
- [x] **AcpService: zero-memo stale flush** — REQUEST-phase jobs with 0 memos classified as stale. (2026-04-03)
- [x] **VPS deployment fix** — plugin-acp dist symlinked into wpv-agent/node_modules (was a separate stale copy). (2026-04-03)
- [x] **Butler single-job test PASSED** — project_legitimacy_scan for Aave, full cycle: accept → route → deliver. Confirmed pipeline works end-to-end. (2026-04-03)
- [x] **Test pricing set** — $0.01/$0.02/$0.03/$0.04 for scan/verify/full/briefing. Distinct prices enable price-based offeringId inference as fallback. (2026-04-03)
- [x] **Eval run 20: 13/15** — 2 failures: Aave GitHub PDF 0 claims (Haiku too weak), MakerDAO SPA 0 claims (JS rendering gap). (2026-04-04)
- [x] **Switched back to Sonnet** — WPV_MODEL=claude-sonnet-4-20250514 on VPS. Haiku insufficient for claim extraction on technical whitepapers. (2026-04-04)
- [x] **tokenAddress passthrough fix** — insufficientData return path now preserves requested token_address. (2026-04-04)
- [ ] **Graduation** — Need 15/15 for manual review. Sonnet should fix Aave claim extraction. MakerDAO SPA requires headless browser (design plan ready for Forces review).
- [ ] **LAUNCH** — fire outreach, pinned thread, monitor

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-04-03
- ✅ Tests — plugin-wpv 303/303, plugin-acp 59/59, wpv-agent 13/13 — verified 2026-04-03
- ✅ **66 Test certified** — 267/267 pass (local + VPS) — verified 2026-03-26
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ VPS deployed: AWS Lightsail us-west-2, Grey running 24/7 via PM2
- ✅ Virtuals agent registered: Provider role, 4 job offerings, wallet funded
- ✅ **plugin-acp** — 59/59 tests, HTTP handler + rejectPayable + InputValidationError + readiness probe (2026-04-03)
- ✅ **plugin-wpv ↔ plugin-acp wired** — 4 offering handlers with prices, direct Supabase DB (2026-04-03)
- ✅ **wpv-agent** — 13/13 tests (2026-04-03)
- ✅ **HTTP endpoint live** — `http://44.243.254.19:3001` — all 4 offerings responding with correct JSON
- ✅ **Breakbot tests passed** — positive + negative cases for all offerings (2026-03-26)
- ✅ **Graduation submission sent** — videos submitted to Virtuals (2026-03-26)
- ✅ **Anthropic API Tier 2** — 450k TPM, 1000 RPM (2026-04-02)
- ✅ **plugin-acp dist symlinked** — single source of truth for VPS deployments (2026-04-03)

## What's Broken
- ⚠️ **SPA whitepaper extraction** — JavaScript-rendered pages (MakerDAO, GitBook, Notion) return empty text. FetchContentResolver only does HTML tag stripping, no JS execution. Design plan for Playwright headless browser at `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan.md`. Blocks 15/15 graduation if Evaluator tests SPA URLs.
- ⚠️ **plugin-acp git pull broken on VPS** — repo is private, no credentials configured. Deploy via SCP + rebuild. Symlink is in place so only need to update source + `bun run build`.
- ⚠️ **3 zombie Wolfpack jobs** — REQUEST-phase, 0 memos, can't be rejected via SDK ("No request memo found"). Harmless but won't clear from getActiveJobs().
- ⚠️ **MiCA accuracy** — Grey does structural pattern matching only. Projects with separate ESMA-registered filings now get a caveat. May still not satisfy evaluator fully.
- ⚠️ **AcpWrapper.ts is still a stub** — retained for IAcpClient interface tests. Production ACP goes through plugin-acp.
- ⚠️ **Ports 3000 + 3001 open** in Lightsail firewall — close after graduation review completes.
- ⚠️ Image-only PDF detection limited (deferred Phase 2)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred Phase 2)

## Test Count
- **plugin-wpv: 303 tests / 23 files, 0 failures** (verified 2026-04-03)
- **plugin-acp: 59 tests / 2 files, 0 failures** (verified 2026-04-03)
- **wpv-agent: 13 tests / 1 file, 0 failures** (verified 2026-04-03)

## DB State (post-cleanup 2026-04-04)
- **76 whitepapers** (66 seed + 10 eval keepers)
- **74 verifications**
- **283 claims**
- No duplicates per token_address
- Cleaned 14 eval artifacts (12 zero-claim entries + 2 duplicate Uniswap losers)

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
| 14 | 7/18 (expanded) | — | Evaluator expanded 16→18 tests. DB pollution (duplicate briefing entries), MiCA overselling, burn address hard-reject, discovery gaps (Lido, USDC) | 5 code fixes + DB cleanup |
| 15 | 11/16 | — | Best since expansion. 5 failures: Aave V3 rate limit (F1), Solana plain text (F2), hack keyword (F3), Bitcoin address (F4), contradictory inputs (F5) | F1-F4 code fixes deployed |
| 16-18 | NOT RUN | — | Wolfpack readiness checks blocked Evaluator. All Wolfpack jobs had empty offeringId + $0.01 price. Grey rejected them, triggering ACP indexer cooldown. | Readiness probe + deployment fixes |
| 19 | Butler single-job | PASS | project_legitimacy_scan for Aave: accept → route → deliver. Full cycle confirmed. | Pipeline verified end-to-end |
| 20 | 13/15 | scan 3/3, briefing 4/4, full 4/4, verify 2/4 | Aave GitHub PDF: 0 claims (Haiku quality), tokenAddress None. MakerDAO SPA: 0 claims (JS rendering). | Switch to Sonnet, tokenAddress fix, SPA design plan |

## Next Actions (ordered)
1. **Run full Evaluator** — Sonnet active, tokenAddress fix deployed. Aave should extract claims now. MakerDAO SPA still a known gap.
2. **Forces review SPA design plan** — `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan.md`. Implement Playwright headless browser for JS-rendered whitepapers.
3. **After graduation:** close ports 3000+3001, set production prices ($0.25/$1.50/$3.00/$8.00)
4. **LAUNCH** — outreach, pinned thread, monitor

## Test Pricing (pre-graduation)
| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| project_legitimacy_scan | $0.01 | $0.25 |
| verify_project_whitepaper | $0.02 | $1.50 |
| full_technical_verification | $0.03 | $3.00 |
| daily_technical_briefing | $0.04 | $8.00 |

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

## plugin-acp (Built — 2026-03-25, hardened 2026-04-03)
- **Package:** `@elizaos/plugin-acp` — github.com/Mayakovsky/plugin-acp (PRIVATE repo)
- **Dependency:** `@virtuals-protocol/acp-node` v0.3.0-beta.39
- **AcpService** extends Eliza Service — lifecycle, handler registry, WebSocket + HTTP dual interface
- **HTTP job handler** on port 3001 — accepts Virtuals POST requests (`{job_id, offering_id, arguments}`)
- **Offering handler registry** — plugins register `(offeringId, handler, validator, price)` pairs, AcpService dispatches
- **Price-based offeringId inference** — when SDK job.name is empty, infers offering from registered price map
- **Readiness probe acceptance** — accepts jobs with no offeringId (prevents ACP indexer cooldown from hard rejections)
- **Zero-memo stale flush** — REQUEST-phase jobs with 0 memos classified as stale on startup
- **Actions:** ACP_BROWSE, ACP_JOBS, ACP_WALLET
- **59 tests, all passing**
- **Security hardened:** guarded JSON.parse, NaN validation, bounded browseAgents
- **Virtuals best practice:** rejectPayable refund on post-acceptance failure
- **VPS deployment:** dist symlinked from /opt/grey/plugin-acp/dist → wpv-agent/node_modules. Deploy via SCP (git pull broken — private repo, no VPS credentials).
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
| 2026-03-31 | Claude Opus 4.6 (Kovsky) | 7/18 fix: MiCA caveat, soft burn address, broader web search, briefing dedup, legitimacy token resolver. DB restored from backup, cleaned 26 duplicate rows (73 retained). character.ts MiCA reframe + 4 offerings. | 303/303, deployed |
| 2026-04-01 | Claude Opus 4.6 (Kovsky) | F1-F4: hack/exploit all-field scan, Bitcoin addr rejection, 80-protocol regex, cross-field consistency. Haiku model for testing. DB wipe→PITR restore→cleanup (76 whitepapers). | 303/303 + 13/13, deployed |
| 2026-04-02 | Claude Opus 4.6 (Kovsky) | Anthropic Tier 2 upgrade ($50+, 450k TPM). R2 version-strip fuzzy matching. R4 pipeline cost logging. Price-based offeringId inference in AcpService. | 303/303 + 59/59 + 13/13, deployed |
| 2026-04-03 | Claude Opus 4.6 (Kovsky) | Wolfpack diagnostic: jobs arrive with name=undefined, price=$0.01, requirement="none". Fixed VPS deployment (symlinked plugin-acp dist). Added readiness probe acceptance + zero-memo stale flush. ACP indexer cooldown from Wolfpack rejections — Evaluator blocked until cooldown clears. | 303/303 + 59/59, deployed |
| 2026-04-03 | Claude Opus 4.6 (Kovsky) | Butler single-job test PASSED. Test pricing $0.01-$0.04. Price-based offeringId inference confirmed working. Eval run 16/16 (first run) + 13/15 (second run). | All offerings live |
| 2026-04-04 | Claude Opus 4.6 (Kovsky) | Eval run 20 analysis: Aave 0 claims = Haiku quality issue, MakerDAO 0 claims = SPA rendering gap. Switched back to Sonnet. Fixed tokenAddress passthrough on insufficientData path. SPA headless browser design plan written. | 303/303, Sonnet deployed |

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
