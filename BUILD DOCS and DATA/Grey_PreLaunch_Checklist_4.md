# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-17 (revised — factory contract confirmed, MiCA compliance added, pre-launch cron added)
**Owner:** Forces (with Claude support)
**Status:** Twitter live. Domain registered. Hosting purchased. Factory contract confirmed. Kovsky building in parallel.

---

# Brand Reference

| Element | Value |
|---------|-------|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| ACP Agent Name | Whitepaper Grey |
| ACP Slug | `whitepaper-verification-agent` |
| Twitter | @WhitepaperGrey |
| Domain | whitepapergrey.com |
| Tagline | Autonomous DeFi Due Diligence |

---

# Key Technical Facts (Updated)

**Virtuals Bonding Proxy (CONFIRMED):**
`0xF66DeA7b3e897cD44A5a231c61B6B4423d613259` — verified on BaseScan as "VIRTUALS Protocol: Bonding Proxy". Emits `Graduated` events when agents hit 42,000 VIRTUAL threshold. Kovsky is wiring this into BaseChainListener now. This was previously a research item — it's resolved.

**MiCA Compliance Check (NEW FEATURE):**
Grey now checks every whitepaper for EU MiCA (Markets in Crypto-Assets Regulation) compliance — a mandatory requirement since December 2025. Two data points per whitepaper:
- **Claims MiCA compliance?** YES / NO / NOT_MENTIONED
- **Actually compliant?** YES / NO / PARTIAL / NOT_APPLICABLE + summary of gaps

This is a major differentiator. No other agent on Virtuals checks this. EU exchanges are actively delisting tokens with non-compliant whitepapers. Grey catches fraudulent compliance claims (projects that SAY they're MiCA compliant but aren't).

**Pre-Launch Cron (NEW):**
The daily discovery cron starts running BEFORE sandbox graduation. Kovsky enables it once the PDF audit, MiCA feature, and factory contract wiring are complete. By Graduation Day, the database already has 30–50 verified whitepapers. We don't launch empty.

---

# Completed

| Task | Date |
|------|------|
| plugin-wpv built and tested (195/195) | 2026-03-12 |
| plugin-autognostic built and tested (746/746) | 2026-03-14 |
| wpv-agent scaffold, build, E2E testing | 2026-03-14–15 |
| Supabase Pro provisioned, schema deployed | 2026-03-14 |
| Smoke tests 7/8 PASS (COC/V $0.026) | 2026-03-14 |
| Tier 2 + Tier 3 integration tests PASS | 2026-03-15 |
| .env populated (all except ACP) | 2026-03-14 |
| GitHub repos pushed | 2026-03-14 |
| Domain registered (whitepapergrey.com) | 2026-03-16 |
| Hosting purchased | 2026-03-16 |
| Email created | 2026-03-16 |
| Twitter @WhitepaperGrey live | 2026-03-16 |
| Outreach messages drafted (22 messages) | 2026-03-15 |
| Brand & Naming finalized | 2026-03-16 |
| Virtuals factory contract confirmed | 2026-03-17 |

---

# Remaining Pre-Launch Tasks

## **1. Website — COMPLETED**

**Deployed to whitepapergrey.com.** Static HTML/CSS page.

---

## **2. Twitter Content — LAUNCH DAY**

### Pinned Thread (5 tweets — updated with MiCA)

**Tweet 1:**
"What is Whitepaper Grey and why does DeFi need whitepaper verification? A thread. 🧵"

**Tweet 2:**
"Every week, dozens of new tokens launch on Base with whitepapers full of yield projections, consensus claims, and tokenomics models. Most are never verified. Some are outright fiction. Grey changes that."

**Tweet 3:**
"We run a 3-layer verification pipeline:

L1 — Structural analysis (no AI, pure math): section completeness, citation density, hype-to-tech ratio, and MiCA compliance check.
L2 — Claim extraction: every testable claim identified and categorized.
L3 — Each claim evaluated against published literature and on-chain reality."

**Tweet 4:**
"Free resources, no payment required:

📋 Daily Greenlight List — projects that passed verification today
🚨 Scam Alert Feed — flagged projects with red flags and high hype ratios

Includes MiCA compliance status on every verified project. Available to every agent on Virtuals and every Butler user."

**Tweet 5:**
"Grey is live on Virtuals ACP. Built on scientific infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases.

Verification starts at $0.25. MiCA compliance check included.

whitepapergrey.com"

### Pre-Graduation Tweets

- "Grey literature: documents produced outside traditional academic publishing. Whitepapers are grey literature by definition. We specialize in exactly the document category our name describes."
- "Building the verification layer DeFi doesn't have yet. Database growing daily. Launch incoming."
- "The grey zone between legitimate and fraudulent — that's the territory every DeFi whitepaper occupies until verified."
- "EU MiCA regulation now requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Grey checks every whitepaper against MiCA requirements automatically. No other agent on Virtuals does this."

---

## **3. Public One-Pager — COMPLETED**

Page at whitepapergrey.com/about

---

## **4. Provision VPS for 24/7 Operation — DO NOW**

### **Supabase Region**

us-west-2 Hillsboro, OR

### **VPS**

AWS Lightsail - same city

### Step 3: Provision
**Create account → Ubuntu 24.04 → CX22 → matching region** → SSH key → note IP.

### Step 4: Share with Kovsky
IP address + SSH credentials. Kovsky handles full setup (Section 1.6 in Kovsky Execution doc).

---

## 5. Virtuals Registration — DO AFTER website is live

### Registration Steps
1. Access Virtuals Developer Dashboard
2. Input Agent Card:
   - Name: Whitepaper Grey
   - Role: Provider / Evaluator
   - Category: Research & Verification
   - Short Description (≤100 chars): "Autonomous Tokenomics Auditor & Whitepaper Verifier. MiCA compliance, scam detection, mathematical proof for DeFi."
   - Full Description: see below
   - Capabilities: `["whitepaper_verification", "tokenomics_audit", "mathematical_proof", "scam_detection", "mica_compliance", "technical_audit", "scientific_analysis", "due_diligence", "protocol_review", "claim_verification"]`
3. Input Service Offerings (5 paid + 2 free)
4. Connect wallet
5. Generate ACP API Key/Secret
6. Share with Kovsky: `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `ACP_AGENT_WALLET_ADDRESS`

### Agent Card Full Description (Updated with MiCA)

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
> Designed for Autonomous Hedge Fund clusters, Treasury Management agents, Risk Assessment pipelines, and Butler users asking "Is this project a scam?", "Is the whitepaper math real?", "Is this project MiCA compliant?", and "Check this project's tokenomics."
>
> Returns structured JSON. Sub-2-second response on cached verifications. On-demand verification of any whitepaper URL for $2.00 USDC.

---

## 6. Outreach Messages (Updated with MiCA)

All outreach fires on Graduation Day simultaneously.

### 6.0 Butler Pitch

> We've launched Whitepaper Grey, the first autonomous verification layer on ACP. We address 8,800+ monthly unfulfilled queries in the Research category — "is this project a scam", "verify tokenomics", "is the whitepaper math real", "check this whitepaper", and now "is this project MiCA compliant." Offerings start at $0.25 with MiCA compliance check included in every verification. Free Daily Greenlight List and Scam Alert Feed. Keywords: whitepaper verifier, tokenomics auditor, scam detection, MiCA compliance, mathematical proof, technical audit, scientific verification.

### 6.1 Tier 1 — Infrastructure Partners (8 agents)

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

### 6.2 Tier 2 — Growth Partners (10 agents)

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

### 6.3 Tier 3 — Templates (30+ agents)

**Template A (DeFi / Treasury):**
> [Agent Name] — Grey here, from Whitepaper Grey. Autonomous whitepaper verification + MiCA compliance starting at $0.25. Free Greenlight List and Scam Alert Feed. Deeper analysis: $1.50–$3.00. Structured JSON.

**Template B (Trading / Arbitrage):**
> [Agent Name] — Grey here. $0.25 legitimacy + MiCA check, under 2 seconds. Hype-to-tech ratio, structural score. Free Scam Alert Feed.

**Template C (Risk / Analysis):**
> [Agent Name] — Grey here. Whitepaper verification + MiCA compliance — the document and regulatory layer most risk agents don't cover. Starting at $0.25.

**Target assignments:** Same as before — VentureViking (A), StrategySpider (C), StableStork (A), FlowFalcon (B), DeFi Pulse (A), VaultVision (A), BridgeBuddy (A), TreasuryTactics (A), AlphaAlpha (B), YieldFalcon (near-grad).

---

## 7. Launch Sequence (Forces Side)

| Phase | Tasks | Status |
|-------|-------|--------|
| **NOW** | Deploy website to whitepapergrey.com | **DONE** |
| **NOW** | Post pinned thread on @WhitepaperGrey | TODO |
| **NOW** | Post pre-graduation tweets | TODO |
| **NOW** | Finalize one-pager (PDF or web page) | **DONE and PARKED** |
| **NOW** | Provision VPS (match Supabase region) | **WORKING** |
| **NOW** | Share VPS credentials with Kovsky | TODO |
| **After website** | Register on Virtuals Developer Dashboard | TODO |
| **After registration** | Share ACP credentials with Kovsky | BLOCKED |
| **~5 days out** | Pre-launch cron active (Kovsky handles, database building) | IN PROGRESS |
| **Graduation Day** | Fire ALL outreach simultaneously (22 messages) | READY |
| **Graduation Day** | Tweet launch announcement | READY |
| **Graduation Day** | Update website with LIVE status | READY |
| **Post-launch** | Cluster applications when endorsements land | BLOCKED |
| **Post-launch** | Daily Twitter content cadence | BLOCKED |

---

## 8. Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |
| Full Potential | — | $57,000 |

Break-even: $162–$212/month (includes VPS). Token decision: metric triggers only.

**MiCA compliance data becomes a premium differentiator as EU enforcement tightens through 2026.** Projects will pay to know whether their whitepaper passes before listing on EU exchanges. This is a future premium tier opportunity beyond the current 5 offerings.

---

*End of Pre-Launch Checklist — Whitepaper Grey*
