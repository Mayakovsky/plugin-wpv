# HEARTBEAT — plugin-wpv
> Last updated: 2026-04-09 (GRADUATED — 24/24 perfect score on eval 37)
> Updated by: Claude Opus 4.6 — Kovsky session
> Session label: Graduation. Eval 37: 24/24. 9-fix infrastructure overhaul (eval 35 fixes) deployed across 2 repos. Plain-text parser rewrite, AbortController threading, min text threshold, SPA signal, protocol sync, RAM threshold, URL audit. 310/310 tests.
> Staleness gate: 2026-04-09 — if today is >3 days past this,
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
- [x] **ACP dispatch 6-bug fix** — phase split, dedup, envelope {type,value}, no double-serialize, SDK constants, pre-accept InputValidator
- [x] **plugin-wpv wired to plugin-acp** — WpvService registers 4 offering handlers via AcpService
- [x] **Security hardening** — guarded JSON.parse, NaN validation, empty offeringId rejection, CostTracker reset per job, URL protocol whitelist
- [x] **Virtuals best practice** — rejectPayable refund on post-acceptance failure, InputValidationError, token_address hex validation
- [x] **HTTP job handler** — port 3001, handles Virtuals POST requests with correct JSON shapes
- [x] **WpvService full pipeline init** — JobRouter + ReportGenerator + repos via direct Supabase connection (WPV_DATABASE_URL)
- [x] **Daily briefing** — capped at 10, backfills from recent verifications, quality-filtered (0-claim excluded)
- [x] **VPS deployed** — AWS Lightsail us-west-2, Grey running 24/7 via PM2
- [x] **Sandbox requirements complete** — 10 successful transactions on-chain
- [x] **ACP SDK CONNECTED** — WebSocket live, ACP Room joined, onNewTask active
- [x] **Content filtering** — NSFW, injection, malicious keywords, bracket tags, scam patterns
- [x] **Playwright SPA rendering** — HeadlessBrowserResolver with render lock, RAM guard (200MB), rate limiting
- [x] **DocsSiteCrawler** — sub-page crawling for docs sites, Playwright DOM link extraction
- [x] **Plain-text parser** — 3-stage extraction: KNOWN_PROTOCOL_PATTERN → structural (last noun phrase before address) → generic regex
- [x] **AbortController pipeline** — signal threading through withTimeout → runL1L2 → CryptoContentResolver → FetchContentResolver → HeadlessBrowserResolver → DocsSiteCrawler
- [x] **Pipeline timeout** — 4-min cap via AbortController, prevents EXPIRED on slow jobs
- [x] **Briefing mutex exemption** — read-only briefings bypass job lock, no SLA violations
- [x] **Min text threshold** — ClaimExtractor skips Sonnet for text < 200 chars (SPA shells, empty pages)
- [x] **Protocol sync** — shared KNOWN_PROTOCOL_PATTERN in src/constants/protocols.ts, synced to AcpService inline
- [x] **GRADUATED** — 24/24 perfect score, eval 37 (2026-04-09)
- [ ] **LAUNCH** — set production prices, close ports, fire outreach, monitor

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-04-09
- ✅ Tests — plugin-wpv 310/310 (24 files), plugin-acp 59/59 — verified 2026-04-09
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ VPS deployed: AWS Lightsail us-west-2, Grey running 24/7 via PM2
- ✅ Virtuals agent registered: Provider role, 4 job offerings, wallet funded
- ✅ **plugin-acp** — 59/59 tests, HTTP handler + rejectPayable + InputValidationError
- ✅ **plugin-wpv ↔ plugin-acp wired** — 4 offering handlers with prices, direct Supabase DB
- ✅ **HTTP endpoint live** — `http://44.243.254.19:3001` — all 4 offerings responding
- ✅ **Anthropic API Tier 2** — 450k TPM, 1000 RPM
- ✅ **plugin-acp dist symlinked** — single source of truth for VPS deployments
- ✅ **24/24 graduation eval** — all offerings perfect (2026-04-09)

## What's Broken
- ⚠️ **plugin-acp git pull broken on VPS** — private repo, deploy via SCP + rebuild.
- ⚠️ **Ports 3000 + 3001 open** in Lightsail firewall — close for production.
- ⚠️ Image-only PDF detection limited (deferred)
- ⚠️ OCR gap — scanned PDFs return INSUFFICIENT_DATA (deferred)
- ⚠️ Test prices still active ($0.01-$0.04) — switch to production prices for launch

## Test Count
- **plugin-wpv: 310 tests / 24 files, 0 failures** (verified 2026-04-09)
- **plugin-acp: 59 tests / 2 files, 0 failures** (verified 2026-04-09)

## DB State (post-graduation, 2026-04-09)
- **8 whitepapers:** Aave (18), Aave V3 (15), Aerodrome Finance (14), Chainlink (12), Chainlink v2 (12), Lido (14), Uniswap (20), Virtuals Protocol (6)
- **8 verifications:** all present, all with claims
- **0 garbage entries** — clean

## Graduation Eval History
| Run | Score | Passed | Failed | Key Issue |
|-----|-------|--------|--------|-----------|
| 1-13 | 0/12 → 14/16 | — | — | Dispatch bugs → content filtering → schema → discovery → cache → SPA |
| 14-19 | 7/18 → Butler pass | — | — | Expanded eval, DB pollution, SDK version, readiness probes |
| 20-27 | 13/15 → 14/16 | — | — | Haiku→Sonnet, tokenAddress, version-strip, scope validation |
| 28 | 8/16 | 0 accepts | ALL EXPIRED | SDK version mismatch (0.3.0-beta-subscription.2 → 0.3.0-beta.39) |
| 29-32 | 13/16 → 18/24 | — | — | Plain-text URL, burn rejection, briefing backfill, _originalTokenAddress |
| 33 | NOT RUN | — | — | (no eval 33 in logs — possibly internal) |
| 34 | 11/15 | scan 5/5, briefing 0/2 | 4 | Job mutex EXPIRED briefings, Aerodrome SPA timeout, Aave V3 Unknown |
| 35 | 15/18 | scan 5/5, briefing 4/4 | 3 | Plain-text parser (ve(3,3) capture, Uniswap v3 digits), Aerodrome SPA |
| 36 | — (server conflict) | 11 delivered, 0 EXPIRED | eval terminated | All fixes working, evaluator cut session before scoring |
| **37** | **24/24** | **ALL** | **NONE** | **GRADUATED** |

## Next Actions (ordered)
1. **LAUNCH** — set production prices, close ports 3000+3001, fire outreach
2. **Post-graduation:** wire DiscoveryCron, full DB hygiene service, render cache
3. **Monitor** — watch for edge cases from real buyers

## Test Pricing (pre-graduation — CHANGE FOR LAUNCH)
| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| project_legitimacy_scan | $0.01 | $0.25 |
| verify_project_whitepaper | $0.02 | $1.50 |
| full_technical_verification | $0.03 | $3.00 |
| daily_technical_briefing | $0.04 | $8.00 |
