# HEARTBEAT — plugin-wpv
> Last updated: 2026-04-27 (🎓 ACP graduation requirements complete. Submitting application now.)
> Updated by: Claude Opus 4.7 — Kovsky session
> Session label: Final graduation push. Eval cycle 7 cleared **16/16** (2026-04-25) — Path B verdict-downgrade for KNOWN-protocol regulatory portal gap (commit `9c94a36`) addressed the lone Cycle 6 Uniswap legitimacy_scan rejection. Video battery rerun under new offering names — **8/8 PASS** (Jobs 2226-2235 on Base, 2026-04-27) — recording captures `legitimacy_scan` / `verify_whitepaper` / `verify_full_tech` / `daily_tech_brief` on the on-chain record matching the Graduation Report. All 4 acceptance lifecycles funded + delivered + completed cleanly; all 4 adversarial rejections caught at the validator boundary with no escrow exposure. 399/399 unit tests (388 baseline + 11 Path B). Grey PM2 online, SDK connected, 4 handlers registered. ACP application submitting.
> Staleness gate: 2026-04-27 — if today is >3 days past this,
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
- [x] **ACP v2 SDK migration COMPLETE** — AcpService.ts fully rewritten, 45 tests passing (2026-04-11)
- [x] **ACP v2 deploy** — Privy credentials deployed, SCP'd files, Grey LIVE on VPS (2026-04-15)
- [x] **Virtuals UI confirmation** — "Upgrade now" + "Confirm Work done" completed; Grey visible on platform (zero ACP tx on new wallet yet)
- [x] **Pipeline untouched** — same JobRouter, ClaimExtractor, resolver stack, 4 offering handlers
- [x] **ACP CLI setup** — configured, buyer agent created (0x22a3…56a6), USDC funded
- [x] **ACP CLI add-signer UNBLOCKED** — Root cause: Windows `cmd /c start` truncates URL at `&`, stripping `publicKey`. Workaround: paste full URL from CLI terminal into fresh tab (attempt 8 succeeded). Permanent fix: `browser.ts` switched to `rundll32 url.dll,FileProtocolHandler`. Signer publicKey populated, walletId stored.
- [x] **Browse Grey via CLI** — returns 4 offerings correctly
- [x] **SELF-HIRE probe** — contract reverts at simulation (buyer==provider rejected). Script: /opt/grey/plugin-acp/self-hire-test.js. Kept as diagnostic reference.
- [x] **Video graduation tests** — 8/8 PASS on-chain, jobs #1049–#1055 + #1180. See `BUILD DOCS and DATA/Video_Graduation_Test_Report_2026-04-22.md`.
- [x] **Race condition fix** — `waitForRequirement()` 3-tier fallback, dual-trigger dispatch, `__decided` sentinel. `plugin-acp/src/AcpService.ts`.
- [x] **Phase 1-4 28/28 plan** — signal aggregator, never-reject-post-acceptance, Tier 3.5/3.75, schema expansion. Deployed across commits `a70267c`, `0e0f4c6`.
- [x] **MiCA discrepancy verdict downgrade** — commit `528729f`.
- [x] **DevRel eval cycle 6** — 15/15 PASS (2026-04-24). Option B address-dedupe hardening shipped post-cycle.
- [x] **DevRel eval cycle 7** — **16/16 PASS** (2026-04-25). Single Cycle-6 regression (Uniswap legit_scan, MiCA portal acknowledgement gap) cleared by Path B verdict downgrade.
- [x] **Path B — KNOWN-protocol regulatory portal verdict downgrade** — commit `9c94a36`. KNOWN_PROTOCOL + claimsMica=NOT_MENTIONED + micaCompliant=NO + verdict=PASS → CONDITIONAL with ESMA/CASP/NCA acknowledgement note appended to micaSummary. 11 new tests, 399/399 total.
- [x] **Video battery 2026-04-27** — **8/8 PASS** under new offering names. Jobs 2226-2235 on Base. See `BUILD DOCS and DATA/Video_Test_Run_2026-04-27.md`.
- [x] **`Video_Test_Schema_v2.md`** — Forces' updated plan with my CLI syntax corrections (`client create-job`, `--offering-name`, `--requirements`, `--chain-id`, lifecycle handling rule).
- [ ] **ACP application** — submitting now (2026-04-27).
- [ ] **LAUNCH** — set production prices, close ports, fire outreach, monitor.

## What Works (verified)
- ✅ Build (`bun run build`) — 0 errors — verified 2026-04-11
- ✅ Tests — plugin-wpv 310/310 (24 files), plugin-acp 45/45 (2 files) — verified 2026-04-11
- ✅ Plugin registration: 6 actions + WpvService registered via Eliza Plugin interface
- ✅ **VPS: Grey LIVE** — PM2 online, SDK v2 connected, 4 handlers registered. Survived 9 on-chain jobs without restart.
- ✅ Virtuals agent registered: Provider role, 4 job offerings, migrated to v2
- ✅ **plugin-acp** — 45/45 tests, ACP v2 SDK, PrivyAlchemy adapter, event-driven dispatch
- ✅ **plugin-wpv ↔ plugin-acp wired** — 4 offering handlers with prices, direct Supabase DB
- ✅ **HTTP endpoint live** — `http://44.243.254.19:3001` — all 4 offerings responding
- ✅ **Grey LIVE on VPS** — PM2 online, SDK connected, 4 handlers registered, 72MB RAM
- ✅ **Anthropic API Tier 2** — 450k TPM, 1000 RPM
- ✅ **plugin-acp dist symlinked** — single source of truth for VPS deployments
- ✅ **24/24 graduation eval** — all offerings perfect (2026-04-09)

## What's Broken
- ⚠️ **Self-hire blocked at contract level** (not a blocker for graduation, kept as note): ACP contract on Base (`0x238E541B…32E0`) reverts at simulation when `buyer==provider`. Verified via `/opt/grey/plugin-acp/self-hire-test.js`. Must use an external buyer (which we now have — Grey Test Buyer).
- ⚠️ **verify_full_tech offering schema** — requirements field is a string (description text), not JSON schema. AJV client-side validation skipped. Registration bug on Virtuals side.
- ⚠️ **Ports 3000 + 3001 open** in Lightsail firewall — close for production.
- ⚠️ Test prices still active ($0.01-$0.04) — switch to production prices for launch
- ⚠️ **Grey stats "not yet tracked"** on Virtuals UI — new wallet has zero ACP transactions; will populate after first successful video test job.

## What's Fixed (2026-04-23 cycle)
- 🟢 **Phase 1 — Signal aggregator (OR semantics)** — `WpvService.aggregateSignals` replaces field-AND validator. Valid token OR name OR url → accept.
- 🟢 **Phase 2 — Never-reject-post-acceptance** — `AcpService.handleJobFunded` catch path delivers INSUFFICIENT_DATA envelope.
- 🟢 **Phase 3 — Tier 3.5 GitHub + Tier 3.75 CoinGecko/CMC** — inserted ahead of legacy WebSearchFallback.
- 🟢 **Phase 4 — Deliverable schema** — `discoveryStatus`/`discoverySourceTier`/`discoveryAttempts` fields (optional, strictly additive).
- 🟢 **focusAreaScores null** — absent categories return null instead of 0.
- 🟢 **Verdict-thin-result mapping** — `structuralScore < 2` → INSUFFICIENT_DATA (not FAIL).
- 🟢 **MiCA discrepancy verdict downgrade** — `claimsMica=YES` + `micaCompliant≠YES` downgrades PASS.

## What's broken as of 2026-04-23 eval (12/15)
- 🔴 **Version-stripping cache match** (Job 1243) — plain-text `"Uniswap V3"` request served V2 content because `stripVersionSuffix()` fuzzy-matches to "Uniswap" row.
- 🔴 **No contract-existence check** (Job 1246) — typo'd 40-char token address passes signal aggregator, serves cached Aerodrome Finance content.
- 🔴 **URL fetch failure doesn't fall back** (Job 1249) — `cryptoResolver.resolveWhitepaper(url)` throws on 404, exception bubbles to Phase 2 fallback envelope instead of trying token/name discovery.
- See `BUILD DOCS and DATA/Eval_Zoom_Out_Fix_Plan_2026-04-23.md` for coordinated A+B+C fix plan.

## What's Fixed (2026-04-22)
- 🟢 **plugin-acp race condition (requirement message delivery)** — v2 buyer SDK posts requirement via REST, not socket, so Grey's `agent.on('entry')` never fires for it. Both `handleJobCreated` and `handleJobFunded` were reading empty `session.entries`. Fix: `waitForRequirement()` 3-tier fallback (fast-path → poll → `transport.getHistory()`), dual-trigger dispatch, `__decided` sentinel. `plugin-acp/src/AcpService.ts`. Deployed, verified across 9 live jobs.

## What's Fixed (2026-04-20)
- 🟢 **ACP CLI `openBrowser` URL truncation on Windows** — 1-line fix in `src/lib/browser.ts`: `cmd /c start` → `rundll32 url.dll,FileProtocolHandler`. Cmd.exe was truncating URLs at `&` (command separator), silently dropping `publicKey` from the add-signer approval URL. Applied locally, CLI runs via tsx so effective immediately. Report for upstream: `BUILD DOCS and DATA/ACP_CLI_Windows_URL_Truncation.md`.

## Test Count
- **plugin-wpv: 399 tests / 35 files, 0 failures** (verified 2026-04-25 — 388 prior + 11 Path B)
- **plugin-acp: 45 tests / 2 files, 0 failures** (verified 2026-04-11)

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
| **37** | **24/24** | **ALL** | **NONE** | **GRADUATED** (2026-04-09) |
| 38-42 | 25/28 → 14/15 → 12/15 | — | — | Aerodrome typo, Uniswap V3 stripping, Aave 404 fallback (zoom-out plan) |
| 43 | 14/15 | — | 1 | Cache hit served stale claims for L2 enrichment path |
| 44 | 15/15 | ALL | NONE | Mutex bypass + claim-count consistency fixed it |
| 45 / **Cycle 6** | 15/16 | — | 1 | Uniswap legit_scan REJECTED — evaluator wanted MiCA portal acknowledgement |
| **46 / Cycle 7** | **16/16** | **ALL** | **NONE** | Path B verdict downgrade addressed regulatory portal gap (2026-04-25) |

## Next Actions (ordered)
1. **ACP application submission** — in flight (2026-04-27). 16/16 eval + 8/8 video battery + Path B + Option B all on record.
2. **Set production prices** — switch from test rates ($0.01-$0.04) to production ($0.25 / $1.50 / $3.00 / $8.00).
3. **Close Lightsail ports 3000 + 3001** before public launch.
4. **Fix verify_full_tech offering schema** — re-register with JSON schema instead of free-text string.
5. **Upstream PR to Virtuals** — submit `browser.ts` Windows fix to `github.com/Virtual-Protocol/acp-cli`.
6. **Post-launch:** wire DiscoveryCron, full DB hygiene service, render cache.
7. **Monitor** — watch for edge cases from real buyers.

## ACP CLI Setup Notes
- **Repo:** `github.com/Virtual-Protocol/acp-cli` (NOT an npm package)
- **Local path:** `C:\Users\kidco\dev\acp-cli-buyer`
- **Invocation:** `npm run acp -- <args>` from `C:\Users\kidco\dev\acp-cli-buyer` (use for ALL commands)
- `npx acp` is broken on this machine (Node 24 issue) — do NOT use npx
- **Setup remaining (blocks video tests):** configure → agent create → add-signer → USDC fund
- **Grey wallet (for browse):** `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f`

## Test Pricing (pre-graduation — CHANGE FOR LAUNCH)
| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| legitimacy_scan | $0.01 | $0.25 |
| verify_whitepaper | $0.02 | $1.50 |
| verify_full_tech | $0.03 | $3.00 |
| daily_tech_brief | $0.04 | $8.00 |
