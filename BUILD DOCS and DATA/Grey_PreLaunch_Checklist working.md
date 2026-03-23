# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-20 (corrected — 1.6A–D done, cron NOT yet started, awaiting seed list delivery)
**Owner:** Forces (with Claude support)
**Status:** Website live. Twitter live.

---

# Brand Reference

| Element | Value |
|---------|-------|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| Twitter | @WhitepaperGrey |
| Domain | whitepapergrey.com |

---

# Infrastructure (LIVE)

| Item | Value |
|------|-------|
| **VPS** | AWS Lightsail, us-west-2 (Hillsboro, OR) |
| **VPS IP** | `44.243.254.19` |
| **SSH Key** | `C:\Users\kidco\.ssh\WhitepaperGrey.pem` |
| **Base RPC** | Alchemy free tier: `https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq` |
| **Supabase** | Pro, us-west-2 |
| **Factory Contract** | `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259` |

---




4. **After 66 tokens verified** — Kovsky builds the Test Evaluator and runs the 50 Test (1.10)
5. **After 100% PASS on 50 Test** — proceed to ACP sandbox (Phase 2)

---

# Completed

| Task | Date |
|------|------|
| plugin-wpv built and tested (249/249) | 2026-03-17 |
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
| VPS + RPC credentials shared with Kovsky | 2026-03-18 |
| 1.6A Discovery overhaul (multi-tier) | 2026-03-19 |
| 1.6B Market traction (on-chain + ACP) | 2026-03-19 |
| 1.6C Fork detection | 2026-03-19 |
| 1.6D LLM cost tracking + migration metrics | 2026-03-19 |

Forces delivers the seed list
Kovsky sets up the VPS
Kovsky runs the cron + seed list

---

# **Remaining Pre-Launch Tasks**

## 2. **Twitter Content — BEFORE GRADUATION**

### **Pre-Graduation Tweets (posted)**

- Building the Verification Layer.

- Database growing daily. Launch incoming.

- EU MiCA regulation now requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Grey checks every whitepaper against MiCA requirements automatically. No other agent does this.

- Grey literature. White papers. Agentic analysis.

- Building agentic DeFi's missing verification layer.

### **Pinned Thread + Launch Announcement — GRADUATION DAY**

## **3. Virtuals Registration — DO NOW**

Steps unchanged. Register, connect wallet, generate ACP credentials, share with Kovsky.

## 4. **Outreach Messages — GRADUATION DAY**

All 22 messages fire simultaneously. Messages are final. See Section 7 below.

---

## 5. LLM Cost Monitoring and Migration Decision Framework

Grey tracks detailed compute metrics from day one. This is how Forces monitors costs and decides when to migrate from cloud LLM (Anthropic Sonnet) to local hardware.

### What to Monitor Monthly

| Metric | What It Tells You |
|--------|------------------|
| **Total verifications** | Volume — approaching migration threshold? |
| **Monthly API spend** | Total Anthropic cost this month |
| **L2 vs L3 cost split** | L2 is ~70% of spend — migrate L2 first for biggest savings |
| **Cache hit rate** | Higher = less live API spend per query. Should climb over time. |
| **Avg COC/V** | Cost per verification trending. Stable? Improving? |
| **Trigger source breakdown** | Cron vs ACP request vs manual — where is volume coming from? |

### Decision Triggers

| Monthly Verifications | Action |
|----------------------|--------|
| < 300 | Stay on Anthropic. API cost < GPU cost. Monitor monthly. |
| 300–500 | Evaluate GPU instance pricing. Begin shadow pipeline test. |
| 500–1,000 | Migrate L2 to local LLM if shadow results show >90% agreement with Sonnet. |
| 1,000+ | Full local migration. Sonnet as premium fallback. |

### Hardware Options (When Ready)

| Option | Monthly Cost | Quality vs Sonnet |
|--------|-------------|-------------------|
| Hetzner GEX44 (RTX 4000 Ada) | ~$120 | 70–80% |
| Dedicated RTX 4090 (amortized 24mo) | ~$75 | 70–80% |
| Lambda Cloud A10G | ~$180 | 80–85% |

**Forces does NOT need to act on this now.** Review WPV_COST output monthly after launch.

---

## 6. Launch Sequence

| Phase | Tasks | Status |
|-------|-------|--------|
| ~~Phase 1 code~~ | All tasks 1.1–1.5 | ✅ COMPLETE |
| ~~Website~~ | whitepapergrey.com | ✅ LIVE |
| ~~One-pager~~ | /about | ✅ PARKED |
| ~~Twitter~~ | @WhitepaperGrey | ✅ LIVE |
| ~~VPS~~ | Lightsail us-west-2 | ✅ PROVISIONED |
| ~~Paid RPC~~ | Alchemy Base free tier | ✅ PROVISIONED |
| ~~Credentials to Kovsky~~ | IP + SSH + RPC | ✅ SHARED |
| ~~Pipeline hardening~~ | Kovsky: 1.6A–D | ✅ COMPLETE |
| ~~Seed list~~ | Forces: deliver to Kovsky | ✅ COMPLETE|
| ~~VPS setup~~ | Kovsky: 1.7 | ✅ COMPLETE |
| ~~Pre-launch cron~~ | Kovsky: 1.8 (needs seed list + VPS) | ✅ COMPLETE |
| 50 Test | Kovsky: 1.10 (66 verified tokens) | ✅ COMPLETE |
| Pre-grad tweets | Post 5 tweets | ✅ COMPLETE - SCHEDULED |

| **Virtuals registration** | DO NOW | WORKING |

| **ACP credentials → Kovsky** | After registration | BLOCKED |
| **Sandbox graduation** | 10 test transactions | BLOCKED |
| **GRADUATION DAY** | Fire outreach + pinned thread | READY |

---

## 7. Outreach Messages (Final)

### 7.0 Butler Pitch

> We've launched Whitepaper Grey, the first autonomous verification layer on ACP. We address 8,800+ monthly unfulfilled queries in the Research category — "is this project a scam", "verify tokenomics", "is the whitepaper math real", "check this whitepaper", and now "is this project MiCA compliant." Offerings start at $0.25 with MiCA compliance check included in every verification. Free Daily Greenlight List and Scam Alert Feed. Keywords: whitepaper verifier, tokenomics auditor, scam detection, MiCA compliance, mathematical proof, technical audit, scientific verification.

### 7.1 Tier 1 — Infrastructure Partners (8 agents)

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

### 7.2 Tier 2 — Growth Partners (10 agents)

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

### 7.3 Tier 3 — Templates (30+ agents)

**Template A (DeFi / Treasury):**
> [Agent Name] — Grey here, from Whitepaper Grey. Autonomous whitepaper verification + MiCA compliance starting at $0.25. Free Greenlight List and Scam Alert Feed. Deeper analysis: $1.50–$3.00. Structured JSON.

**Template B (Trading / Arbitrage):**
> [Agent Name] — Grey here. $0.25 legitimacy + MiCA check, under 2 seconds. Hype-to-tech ratio, structural score. Free Scam Alert Feed.

**Template C (Risk / Analysis):**
> [Agent Name] — Grey here. Whitepaper verification + MiCA compliance — the document and regulatory layer most risk agents don't cover. Starting at $0.25.

---

## 8. Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |
| Full Potential | — | $57,000 |

Break-even: $162–$212/month (includes VPS). Token decision: metric triggers only. LLM migration trigger: 300 verifications/month sustained for 2+ months.

---

*End of Pre-Launch Checklist — Whitepaper Grey*
