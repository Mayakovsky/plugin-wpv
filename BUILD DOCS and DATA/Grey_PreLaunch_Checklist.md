# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-23 (rewritten — reflects actual state from heartbeats)
**Owner:** Forces (with Claude support)
**Status:** All code, testing, VPS, seeding, and tweets DONE. Forces completing Virtuals registration NOW. After registration: share ACP credentials with Kovsky → sandbox graduation → launch.

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
| **VPS** | AWS Lightsail, us-west-2 (Hillsboro, OR) — Grey running 24/7 via PM2 |
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
| Smoke tests 7/8 PASS (COC/V $0.026) | 2026-03-14 |
| .env populated (all except ACP) | 2026-03-14 |
| GitHub repos pushed | 2026-03-17 |
| Domain registered, hosting purchased | 2026-03-16 |
| Website deployed (whitepapergrey.com) | 2026-03-17 |
| One-pager parked at /about | 2026-03-17 |
| Email created, Twitter @WhitepaperGrey live | 2026-03-16 |
| Outreach messages drafted (22 messages) | 2026-03-15 |
| Brand & Naming finalized | 2026-03-16 |
| All Phase 1 code tasks (1.1–1.5) | 2026-03-17 |
| VPS provisioned (Lightsail us-west-2) | 2026-03-18 |
| Paid RPC provisioned (Alchemy Base) | 2026-03-18 |
| VPS setup — Grey running 24/7 via PM2 | 2026-03-18 |
| 1.6A Discovery overhaul (multi-tier) | 2026-03-18 |
| 1.6B Market traction (on-chain + ACP) | 2026-03-18 |
| 1.6C Fork detection | 2026-03-18 |
| 1.6D LLM cost tracking + migration metrics | 2026-03-18 |
| MiCA pipeline audit (4 critical bugs fixed) | 2026-03-18 |
| Seed ingestion Wave 1 (initial OG tokens) | 2026-03-19 |
| Seed ingestion Wave 2 (10 Base + ETH from Butler) | 2026-03-21 |
| Seed ingestion Wave 3 (Virtuals agents + 20 Solana + PAXG) | 2026-03-21 |
| ACP v2 deliverable schemas coded | 2026-03-21 |
| confidenceScore min 0 fix | 2026-03-21 |
| 66 Test CERTIFIED (267/267 pass, local + VPS) | 2026-03-23 |
| Pre-graduation tweets posted/scheduled (5 tweets) | 2026-03-23 |

---

# Pre-Graduation Tweets (POSTED)

- Building the Verification Layer.
- Database growing daily. Launch incoming.
- EU MiCA regulation now requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Grey checks every whitepaper against MiCA requirements automatically. No other agent does this.
- Grey literature. White papers. Agentic analysis.
- Building agentic DeFi's missing verification layer.

---

# Remaining Pre-Launch Tasks

## 1. Virtuals Registration — FORCES DOING NOW

1. Go to Virtuals ACP developer dashboard (app.virtuals.io)
2. Create Grey's agent profile:
   - **Name:** Whitepaper Grey
   - **Role:** Provider
   - **Category:** Research & Verification
   - **Description:** Use the Agent Card text below
3. Define 5 paid Job Offerings with prices and Deliverable Requirements schemas (already coded in AgentCardConfig.ts — match exactly)
4. Set up 2 Free Resources (Greenlight List, Scam Alert Feed)
5. Connect wallet
6. Generate ACP credentials
7. **Share with Kovsky:** `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `ACP_AGENT_WALLET_ADDRESS`

### Agent Card Description

> Whitepaper Grey is the ecosystem's first autonomous Verification Layer specializing in mathematical proof validation, tokenomics auditing, MiCA compliance verification, and scientific verification for emerging protocols.
>
> Built on deep scientific analysis infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases, Grey identifies structural risks, whitepaper inconsistencies, unsustainable yield models, and regulatory non-compliance before they impact your treasury.
>
> MiCA Compliance: Every verification includes an EU MiCA compliance check — does the project claim compliance, and does the whitepaper actually contain required disclosures? Grey catches fraudulent compliance claims automatically.
>
> Free Resources — No Job Required: Browse the Daily Greenlight List for today's verified projects. Check the Scam Alert Feed for flagged high-risk projects and fraudulent MiCA claims.
>
> Core Capabilities: Whitepaper Verification, Tokenomics Auditing, MiCA Compliance Check, Technical Assessment, Scientific Credibility Scoring.
>
> Returns structured JSON. Sub-2-second response on cached verifications. On-demand verification of any whitepaper URL for $2.00 USDC.

## 2. ACP Credentials → Kovsky

After registration, share the three credential values with Kovsky. He updates `.env` on both local and VPS, rebuilds, and runs Smoke Test 8/8.

## 3. Sandbox Graduation

Kovsky builds a buyer test agent, runs 10 test transactions at $0.01. 66 Test already certified all response formats — sandbox should be clean. Virtuals manual review takes 24–48 hours.

## 4. Graduation Day — Fire Everything

- Post pinned thread on @WhitepaperGrey
- Fire all 22 outreach messages simultaneously (see Section 6)
- Monitor Trust Score, jobs, payments, COC/V

---

# Launch Sequence

| Phase | Tasks | Status |
|-------|-------|--------|
| ~~Phase 1 code~~ | All tasks 1.1–1.5 | ✅ COMPLETE |
| ~~Pipeline hardening~~ | 1.6A–D | ✅ COMPLETE |
| ~~Website~~ | whitepapergrey.com | ✅ LIVE |
| ~~One-pager~~ | /about | ✅ PARKED |
| ~~Twitter~~ | @WhitepaperGrey | ✅ LIVE |
| ~~VPS~~ | Lightsail us-west-2, Grey 24/7 | ✅ RUNNING |
| ~~Paid RPC~~ | Alchemy Base | ✅ LIVE |
| ~~Seed ingestion~~ | 3 waves (Base+ETH+Solana+Virtuals+PAXG) | ✅ COMPLETE |
| ~~66 Test~~ | 267/267 pass, 100% readiness | ✅ CERTIFIED |
| ~~Pre-grad tweets~~ | 5 tweets posted/scheduled | ✅ COMPLETE |
| **Virtuals registration** | Forces registering now | **IN PROGRESS** |
| **ACP credentials → Kovsky** | After registration | NEXT |
| **Sandbox graduation** | 10 test transactions | BLOCKED |
| **GRADUATION DAY** | Fire outreach + pinned thread | READY |

---

# LLM Cost Monitoring and Migration Decision Framework

Grey tracks detailed compute metrics from day one via WPV_COST action.

| Monthly Verifications | Action |
|----------------------|--------|
| < 300 | Stay on Anthropic. Monitor monthly. |
| 300–500 | Begin shadow pipeline evaluation. |
| 500–1,000 | Migrate L2 to local LLM if >90% agreement. |
| 1,000+ | Full local migration. Sonnet as fallback. |

No action needed now. Review WPV_COST monthly after launch.

---

# Outreach Messages (Final — Fire on Graduation Day)

## Butler Pitch

> We've launched Whitepaper Grey, the first autonomous verification layer on ACP. We address 8,800+ monthly unfulfilled queries in the Research category — "is this project a scam", "verify tokenomics", "is the whitepaper math real", "check this whitepaper", and now "is this project MiCA compliant." Offerings start at $0.25 with MiCA compliance check included in every verification. Free Daily Greenlight List and Scam Alert Feed. Keywords: whitepaper verifier, tokenomics auditor, scam detection, MiCA compliance, mathematical proof, technical audit, scientific verification.

## Tier 1 — Infrastructure Partners (8 agents)

**Ethy AI (ID: 84)**
> Hey Ethy — Grey here, just graduated on ACP. Autonomous whitepaper verification: tokenomics math, yield sustainability, hype-to-tech ratio, and MiCA compliance check for any project on Base. $0.25 Legitimacy Scan as a pre-filter — same price as your swaps. Free Daily Greenlight List. Want to test? Send us any project.

**Otto AI (ID: 122)**
> Otto — Grey here. Whitepaper claims verified against on-chain reality + MiCA compliance check. $0.25 Legitimacy Scan, under 2 seconds. Built on Crossref, Semantic Scholar, Unpaywall — we verify cited papers actually exist. Free Scam Alert Feed.

**Axelrod (ID: 552)**
> Axelrod — Grey here, from Whitepaper Grey. AHF cluster (CL-001) Verification Layer seat — "cross-checking whitepaper claims vs. on-chain reality" is our exact product. 3-layer pipeline + MiCA compliance. $3.00 Full Verification — below your $3.25 internal rate. Free Greenlight List. Send us any project for a test.

**Wolfpack (ID: 1888)**
> Wolfpack — Grey here. Scientific Credibility Score + MiCA compliance data for any whitepaper. $0.25 per Legitimacy Scan. Structured JSON. Plugs into your risk ratings. Free Scam Alert Feed.

**WachAI Mesh (ID: 302)**
> WachAI — Grey here. Bundle: your $8.00 audit + our $2.00 whitepaper verification (includes MiCA check) = $12 combined offering. Also interested in AI-Audit Mesh Logic Auditor seat.

**DeFi Sentinel (ID: 1102)**
> DeFi Sentinel — Grey here. $0.25 Legitimacy Scan + MiCA compliance check before every protocol deployment. Catches whitepaper-level red flags AND regulatory non-compliance. Free Scam Alert Feed.

**LiquidAlpha (ID: 774)**
> LiquidAlpha — Grey here. $0.25 per scan at your volume. Structural score, hype-to-tech, MiCA compliance — under 2 seconds from cache. New tokens: $2.00 full verify, cached permanently. Structured JSON.

**TreasuryGuard (ID: 812)**
> TreasuryGuard — Grey here. $3.00 Full Technical Verification: structural analysis, claim extraction, evaluation against published literature, MiCA compliance assessment. Confidence score 1–100, verdict, structured JSON.

## Tier 2 — Growth Partners (10 agents)

**Ask Caesar (ID: 104)**
> Ask Caesar — Grey here. $1.50 Tokenomics Audit + MiCA compliance data as structured input for your $3.50 analysis. Category-tagged claims with scores. Data advantage at less than half your price.

**Gigabrain (ID: 153)**
> Gigabrain — Grey here. Structured claim data + MiCA compliance flags. Category-tagged, scored 0–100. $1.50. Built for machine consumption.

**VaultMaster (ID: 221)**
> VaultMaster — Grey here. $0.25 Legitimacy Scan (includes MiCA) for pre-screening, $1.50 Tokenomics Audit for projects that pass. $1.75 total.

**MarketMover (ID: 404)**
> MarketMover — Grey here. $0.25 Legitimacy Scan + MiCA check. Pricing dead zone, instant, cached, structured JSON.

**AlphaSeeker (ID: 885)**
> AlphaSeeker — Grey here. $0.25 Legitimacy Scan. Hype-to-tech, sections, citations, MiCA compliance. Under 2 seconds.

**ArbitrageAce (ID: 442)**
> ArbitrageAce — Grey here. $0.25, under 2 seconds. Structural score + MiCA compliance. Cheap insurance before arb.

**AssetArmor (ID: 813)**
> AssetArmor — Grey here. $3.00 Full Verification at your spend level. 3-layer pipeline + MiCA compliance. Structured JSON.

**StableScout (ID: 909)**
> StableScout — Grey here. $1.50 Tokenomics Audit + MiCA compliance. Catches unsustainable emissions and regulatory gaps.

**SecureLogic (ID: 2104)**
> SecureLogic — Grey here. Near graduation? We verify whitepaper logic + MiCA compliance, you verify contracts. Full stack. Let's connect.

**TreasuryTactician (ID: 2188)**
> TreasuryTactician — Grey here. Free Greenlight List + $0.25 scans with MiCA compliance. Good foundation for treasury decisions.

## Tier 3 — Templates (30+ agents)

**Template A (DeFi / Treasury):**
> [Agent Name] — Grey here, from Whitepaper Grey. Autonomous whitepaper verification + MiCA compliance starting at $0.25. Free Greenlight List and Scam Alert Feed. Deeper analysis: $1.50–$3.00. Structured JSON.

**Template B (Trading / Arbitrage):**
> [Agent Name] — Grey here. $0.25 legitimacy + MiCA check, under 2 seconds. Hype-to-tech ratio, structural score. Free Scam Alert Feed.

**Template C (Risk / Analysis):**
> [Agent Name] — Grey here. Whitepaper verification + MiCA compliance — the document and regulatory layer most risk agents don't cover. Starting at $0.25.

---

# Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |
| Full Potential | — | $57,000 |

Break-even: $162–$212/month (includes VPS). Token decision: metric triggers only.

---

*End of Pre-Launch Checklist — Whitepaper Grey*
