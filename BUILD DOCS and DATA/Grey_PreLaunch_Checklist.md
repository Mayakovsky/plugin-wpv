# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-24 (rewritten — agent registered, plugin-acp build next)
**Owner:** Forces (with Claude support)
**Status:** Agent registered on Virtuals (Provider, 5 offerings). ACP credentials obtained. Kovsky building `plugin-acp` to connect Grey to ACP marketplace. Then sandbox graduation, then launch.

---

# Brand Reference

| Element | Value |
|---------|-------|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| Twitter | @WhitepaperGrey |
| Domain | whitepapergrey.com |
| ACP Role | **Provider** |

---

# Infrastructure (LIVE)

| Item | Value |
|------|-------|
| **VPS** | AWS Lightsail, us-west-2 — Grey running 24/7 via PM2 |
| **VPS IP** | `44.243.254.19` |
| **SSH Key** | `C:\Users\kidco\.ssh\WhitepaperGrey.pem` |
| **Base RPC** | Alchemy: `https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq` |
| **Supabase** | Pro, us-west-2 |
| **Factory Contract** | `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259` |

---

# Completed

| Task | Date |
|------|------|
| plugin-wpv built and tested (304/304) | 2026-03-23 |
| plugin-autognostic built and tested (746/746) | 2026-03-14 |
| wpv-agent built, tested (12/12), E2E verified | 2026-03-17 |
| Supabase Pro provisioned, schema deployed | 2026-03-14 |
| All Phase 1 code tasks (1.1–1.5) | 2026-03-17 |
| Pipeline hardening (1.6A–D) | 2026-03-18 |
| VPS setup — Grey running 24/7 via PM2 | 2026-03-18 |
| Seed ingestion (3 waves: Base+ETH+Solana+Virtuals+PAXG) | 2026-03-21 |
| ACP v2 deliverable schemas coded | 2026-03-21 |
| 66 Test CERTIFIED (267/267 pass, local + VPS) | 2026-03-23 |
| ACP schema hardening (NOT_IN_DATABASE, flat shape, cache-only) | 2026-03-24 |
| focusAreaScores keys lowercased | 2026-03-24 |
| Virtuals registration (Provider, 5 offerings, wallet created) | 2026-03-24 |
| Pre-graduation tweets posted/scheduled (5 tweets) | 2026-03-23 |
| Domain, website, one-pager, Twitter, email | 2026-03-17 |
| Outreach messages drafted (22 messages) | 2026-03-15 |

---

# Pre-Graduation Tweets (POSTED)

- Building the Verification Layer.
- Database growing daily. Launch incoming.
- EU MiCA regulation now requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Grey checks every whitepaper against MiCA requirements automatically. No other agent does this.
- Grey literature. White papers. Agentic analysis.
- Building agentic DeFi's missing verification layer.

---

# What's Happening Now

**Kovsky is building `plugin-acp`** — a standalone ElizaOS plugin that bridges any ElizaOS agent to the Virtuals ACP marketplace. This is the missing connection layer. Grey is registered but can't receive or fulfill jobs without it.

**Forces tasks (parallel):**
1. Share ACP credentials with Kovsky (wallet private key, session entity key ID, agent wallet address)
2. Fund the agent wallet with USDC for sandbox testing
3. Prepare pinned thread for Graduation Day

**After plugin-acp is built:** Kovsky wires plugin-wpv to use it, rebuilds everything, runs sandbox graduation (10 test transactions), submits for Virtuals review. Then we launch.

---

# Remaining Pre-Launch Tasks

## 1. Share ACP Credentials with Kovsky — FORCES ACTION

From Virtuals registration, share these three values:
- `ACP_WALLET_PRIVATE_KEY`
- `ACP_SESSION_ENTITY_KEY_ID`
- `ACP_AGENT_WALLET_ADDRESS`

Kovsky adds them to `.env` on both local and VPS.

## 2. Fund Agent Wallet — FORCES ACTION

Top up Grey's agent wallet with USDC for sandbox testing. Virtuals recommends setting test prices to $0.01 during sandbox — minimal USDC needed.

## 3. Plugin-acp Build — KOVSKY

Kovsky builds the ElizaOS ↔ ACP bridge plugin. Standalone repo, generic, releasable to ElizaOS plugin repository. Wraps `@virtuals-protocol/acp-node` SDK. Provides: AcpService (lifecycle + handler registry), offering dispatch, actions (ACP_BROWSE, ACP_JOBS, ACP_WALLET).

## 4. Sandbox Graduation — KOVSKY

10 test transactions via buyer test agent → Virtuals manual review (24–48hr).

## 5. Graduation Day — FIRE EVERYTHING

- Post pinned thread on @WhitepaperGrey
- Fire all 22 outreach messages simultaneously
- Monitor: Trust Score, jobs, payments, COC/V

---

# Launch Sequence

| Phase | Tasks | Status |
|-------|-------|--------|
| ~~All code + testing~~ | 304 tests, 66 Test certified | ✅ COMPLETE |
| ~~Infrastructure~~ | VPS, RPC, Supabase, seeding | ✅ COMPLETE |
| ~~Virtuals registration~~ | Provider, 5 offerings | ✅ COMPLETE |
| ~~Pre-grad tweets~~ | 5 tweets | ✅ COMPLETE |
| **ACP credentials → Kovsky** | Forces shares | **NEXT** |
| **Fund agent wallet** | Forces tops up USDC | **NEXT** |
| **plugin-acp build** | Kovsky building | **IN PROGRESS** |
| **Sandbox graduation** | 10 test transactions | BLOCKED on plugin-acp |
| **GRADUATION DAY** | Fire outreach + pinned thread | READY |

---

# LLM Cost Monitoring

Review WPV_COST monthly after launch. Migration trigger: 300 verifications/month sustained 2+ months.

---

# Outreach Messages (Final — Fire on Graduation Day)

## Butler Pitch

> We've launched Whitepaper Grey, the first autonomous verification layer on ACP. We address 8,800+ monthly unfulfilled queries in the Research category — "is this project a scam", "verify tokenomics", "is the whitepaper math real", "check this whitepaper", and now "is this project MiCA compliant." Offerings start at $0.25 with MiCA compliance check included in every verification. Free Daily Greenlight List and Scam Alert Feed. Keywords: whitepaper verifier, tokenomics auditor, scam detection, MiCA compliance, mathematical proof, technical audit, scientific verification.

## Tier 1 — Infrastructure Partners (8 agents)

**Ethy AI (84)** | **Otto AI (122)** | **Axelrod (552)** | **Wolfpack (1888)** | **WachAI Mesh (302)** | **DeFi Sentinel (1102)** | **LiquidAlpha (774)** | **TreasuryGuard (812)**

## Tier 2 — Growth Partners (10 agents)

**Ask Caesar (104)** | **Gigabrain (153)** | **VaultMaster (221)** | **MarketMover (404)** | **AlphaSeeker (885)** | **ArbitrageAce (442)** | **AssetArmor (813)** | **StableScout (909)** | **SecureLogic (2104)** | **TreasuryTactician (2188)**

## Tier 3 — Templates (30+ agents)

Template A (DeFi/Treasury) | Template B (Trading/Arbitrage) | Template C (Risk/Analysis)

*Full message text in previous versions of this document.*

---

# Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |

Break-even: $162–$212/month. Token decision: metric triggers only.

---

*End of Pre-Launch Checklist — Whitepaper Grey*
