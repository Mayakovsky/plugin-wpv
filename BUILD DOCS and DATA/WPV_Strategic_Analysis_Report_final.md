# WPV Agent — Strategic Analysis Report (Final)

## Full Intelligence Package: Census, Butler Demand, Pricing, and Launch Playbook

**Based on Top 150 Census, 6-Scan Butler Intelligence, Cluster Data, and Trust Infrastructure**

March 2026 | Final version for Kovsky instruction set preparation

---

# 1. Market Intelligence Summary

## 1.1 The Numbers That Matter

| Metric | Value | Source |
|--------|-------|--------|
| Total Top 150 weekly jobs | 73,782 | Census |
| Total weekly aGDP | $878,900 | Census |
| Median service price | $1.25 | Census |
| Potential customers (Buyer+Hybrid) | 72 (48%) | Census |
| High-relevance customers | 60 (83% of Buyer+Hybrid) | Census |
| Butler active users | 52,400 | Trust Data |
| Butler avg spend/session | $1.15 USDC | Trust Data |
| A2A vs Human volume | 68% / 32% | Trust Data |
| **Unfulfilled Butler queries (our niche)** | **~8,800/month** | **Scan 5/6** |
| Butler fulfillment rate for research | **15%** | **Scan 5** |
| AHF cluster open seat | Verification Layer | Scan 3 |
| AI-Audit Mesh open seat | Logic Auditor | Scan 3 |
| Near-graduate pipeline agents | 3 identified | Scan 1 |
| High-spend buyers outside Top 150 | 4 identified ($2,450/mo combined) | Scan 2 |

## 1.2 The Killer Finding: 8,800 Unfulfilled Queries/Month

Butler Scan 5 and 6 revealed the single most important data point in this entire analysis. Monthly human Butler queries that currently go unfulfilled or poorly fulfilled:

| Query Intent | Monthly Volume | Current Fulfillment | Current Provider |
|-------------|---------------|-------------------|-----------------|
| "Is this token legit / is it a scam" | 4,500 + 3,100 = 7,600 | No matching provider / no matching intent | NOBODY |
| "Check this whitepaper" | 1,200 | No matching provider | NOBODY |
| "Is this whitepaper math real" | 1,420 | No matching provider | NOBODY |
| "Verify tokenomics sustainability" | 980 | Provider timeout / low quality | Ask Caesar (15% success) |

The Research category on Butler has a **15% success rate** at a **$3.25 average price** with **412 monthly mentions of "whitepaper."** This is a market in crisis. Humans are trying to buy whitepaper verification and the ecosystem is failing them. We walk into a demand vacuum on day one.

**Conservative capture estimate:** If we fulfill just 10% of these unfulfilled queries in our first month, that's 880 jobs. At a blended average of $0.50/job (mostly Quick Filters from Butler users), that's $440 gross ($352 net) from Butler alone — enough to cover the cron twice over, without a single A2A outreach.

---

# 2. Price Landscape & Dead Zone Strategy

## 2.1 The Dead Zone Confirmed

| Price Band | Agents | % | Avg Jobs/Wk | Our Offerings Here |
|------------|--------|---|-------------|-------------------|
| $0.01–$0.25 | 17 | 11% | 2,765 | **Project Legitimacy Scan ($0.25)** |
| $0.26–$0.50 | 16 | 11% | 786 | — |
| $0.51–$1.00 | 28 | 19% | 453 | Dead zone lower band |
| $1.01–$2.00 | 38 | 25% | 364 | **Tokenomics Audit ($1.50), Verify Whitepaper ($2.00)** |
| $2.01–$3.50 | 18 | 12% | 385 | **Full Technical Verification ($3.00)** |
| $3.51–$5.00 | 17 | 11% | 66 | — |
| $5.01+ | 16 | 11% | 37 | **Daily Technical Briefing ($8.00)** |

The 42% Hybrid agents identified by Butler's platform AI sit primarily in the $0.51–$2.00 range and need high-frequency verification but won't pay Ask Caesar's $3.50. Our Logic Check ($1.50) and Custom Logic ($2.00) are designed exactly for this segment.

## 2.2 Final Pricing — No Changes, New Names

Prices are validated and locked. What changes is the **display names** on our ACP job offerings to match Butler's intent-routing keywords. The offering_id stays clean for programmatic access; the display name is what Butler and human users see.

| offering_id | Display Name (Butler-Optimized) | Price | Net (80%) | Pipeline |
|-------------|--------------------------------|-------|-----------|----------|
| project_legitimacy_scan | Project Legitimacy Scan | $0.25 | $0.20 | L1 cached |
| tokenomics_sustainability_audit | Tokenomics Sustainability Audit | $1.50 | $1.20 | L1+L2 cached |
| verify_project_whitepaper | Verify Project Whitepaper | $2.00 | $1.60 | L1+L2 live |
| full_technical_verification | Full Technical Verification | $3.00 | $2.40 | L1+L2+L3 |
| daily_technical_briefing | Daily Technical Briefing | $8.00 | $6.40 | Cron summary |

**Why the renames matter:** Butler's scan revealed that its intent matching is keyword-driven. "Project Legitimacy Scan" maps directly to the 7,600 monthly "is this legit / is it a scam" queries. "Tokenomics Sustainability Audit" maps to 980 "verify tokenomics" queries. "Verify Project Whitepaper" maps to 1,200 "check this whitepaper" queries. These aren't cosmetic changes — they're the difference between Butler routing queries to us or to nobody.

---

# 3. Optimized Agent Card

Built from Butler's template, enhanced with full SCIGENT knowledge and targeting language for all identified customer segments, clusters, and Butler intent patterns.

## 3.1 Agent Card

**Agent Name:** Whitepaper Verifier (WPV)

**Entity ID:** [Assigned at registration]

**Role:** Provider / Evaluator

**Primary Category:** Research & Verification

**Short Description (100 characters — critical for Butler matching):**

> Autonomous Tokenomics Auditor and Whitepaper Verifier. Mathematical proof verification and scam detection for DeFi protocols.

**Full Description:**

> WPV Agent is the ecosystem's first autonomous Verification Layer specializing in mathematical proof validation, tokenomics auditing, and scientific verification for emerging protocols.
>
> Built on deep scientific analysis infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases, WPV identifies structural risks, whitepaper inconsistencies, and unsustainable yield models before they impact your treasury.
>
> **Free Resources — No Job Required:**
> Browse our Daily Greenlight List for today's verified projects (Pass/Fail/Conditional verdicts). Check the Scam Alert Feed for flagged high-risk projects with elevated Hype-to-Tech ratios.
>
> **Core Capabilities:**
> Whitepaper Verification — Claim extraction and evaluation against on-chain reality and published scientific literature. Tokenomics Auditing — Mathematical sanity checks on yield projections, emission schedules, and economic models. Technical Assessment — Protocol review, consensus logic evaluation, and due diligence for DeFi, Cross-Chain, and Treasury agents. Scientific Credibility Scoring — Hype vs. Tech ratio, citation verification, plagiarism detection, and structural analysis for any project PDF or URL.
>
> **Designed for:** Autonomous Hedge Fund clusters, Treasury Management agents, Risk Assessment pipelines, and Butler users asking "Is this project a scam?", "Is the whitepaper math real?", and "Check this project's tokenomics."
>
> Returns structured JSON. Sub-2-second response on cached verifications. On-demand verification of any whitepaper URL for $2.00 USDC.

**Capabilities Tags:** `["whitepaper_verification", "tokenomics_audit", "mathematical_proof", "scam_detection", "technical_audit", "scientific_analysis", "due_diligence", "protocol_review", "claim_verification"]`

**Supported Chains:** `["base"]`

## 3.2 Resources (Free — ACP v2 Resource Offerings)

| Resource ID | Display Name | Returns | Purpose |
|-------------|-------------|---------|---------|
| daily_greenlight_list | Daily Greenlight List | `{ date, total_verified, projects: [{ name, token_address, verdict, score, hype_tech_ratio }] }` | Storefront. Browse today's verified projects. Converts browsers to paid queries. |
| scam_alert_feed | Scam Alert Feed | `{ date, flagged_projects: [{ name, token_address, verdict: "FAIL", hype_tech_ratio, red_flags }] }` | Hooks into 3,100/mo "is it a scam" Butler queries. Projects with FAIL verdict and hype_tech_ratio > 3.0. Free hook for massive Butler traffic. |

**Justification for Scam Alert Feed:** This is a new free Resource not in v1.2. The 3,100 monthly "check for project scams" queries currently have zero matching provider. A free Resource that lists flagged projects will appear in Butler's resource-checking flow before any paid job is initiated. Butler users see our scam alerts for free, then pay $0.25 for the full Legitimacy Scan on projects they're interested in. The conversion funnel is: Scam Alert (free) → Legitimacy Scan ($0.25) → Tokenomics Audit ($1.50) → Full Verification ($3.00).

## 3.3 Job Offerings (5 Paid)

| offering_id | Display Name | Price | Description (Butler-Optimized) |
|-------------|-------------|-------|-------------------------------|
| project_legitimacy_scan | Project Legitimacy Scan | $0.25 | "Instant Pass/Fail scientific credibility score and Hype-to-Tech ratio for any project in our verified database. Returns structured JSON with score (1-5), verdict, and risk flags. Response time: <2 seconds." |
| tokenomics_sustainability_audit | Tokenomics Sustainability Audit | $1.50 | "Claim-by-claim extraction and logic analysis of tokenomics, yield projections, and economic models from any pre-verified whitepaper. Returns all extracted claims with individual scores and logic summary. Response time: <5 seconds." |
| verify_project_whitepaper | Verify Project Whitepaper | $2.00 | "On-demand verification of ANY whitepaper not yet in our database. Submit a PDF URL and project name. Full structural analysis and claim extraction with logic scores. Results cached permanently for future instant queries. Response time: 2-5 minutes." |
| full_technical_verification | Full Technical Verification | $3.00 | "Complete scientific evaluation: mathematical sanity checks, benchmark comparison, citation verification against academic databases, originality analysis, and internal consistency audit. Returns WPV Confidence Score (1-100) and full evaluation report. Response time: <5 seconds (cached) or 3-8 minutes (new)." |
| daily_technical_briefing | Daily Technical Briefing | $8.00 | "Comprehensive daily JSON report containing full technical audits of the top 10+ most trending whitepapers verified in the last 24 hours. Includes all claims, scores, verdicts, and risk analysis. Ideal for Treasury Managers and Intel agents." |

## 3.4 Butler Discovery Strategy

**Intent Mapping:**

| Butler User Query | Routed To | Price | Est. Monthly Volume |
|-------------------|-----------|-------|-------------------|
| "Is this token legit?" / "Is this a scam?" | project_legitimacy_scan | $0.25 | 7,600 |
| "Check this whitepaper" / "Verify project" | verify_project_whitepaper | $2.00 | 1,200 |
| "Is the whitepaper math real?" | tokenomics_sustainability_audit | $1.50 | 1,420 |
| "Verify tokenomics sustainability" | tokenomics_sustainability_audit | $1.50 | 980 |
| Browsing scam alerts | scam_alert_feed (FREE) | $0.00 | ~3,100 |

**Evaluator Role:** By registering as Provider/Evaluator, we signal to Butler that we are a high-trust verification agent. This helps compete on Trust Score rather than aGDP alone during the early growth phase when our aGDP will be low.

---

# 4. Complete Customer Intelligence

## 4.1 Tier 1 — Pre-Launch Outreach (8 agents)

| # | Agent | ID | Why | Tailored Pitch |
|---|-------|----|-----|---------------|
| 1 | Ethy AI | 84 | #1 by aGDP. Yield execution. 8,420 jobs/wk. | "Sustainability Score for yield protocols. $0.25/check — same price as your swaps. If the WP math doesn't support the APY, we flag it FLAWED before you allocate." |
| 2 | Otto AI | 122 | #3. Cross-chain. 4,100 jobs/wk. | "Technical Moat check before bridging treasury. Does this project have real tech or is it a fork? $0.25 instant, $3.00 full report." |
| 3 | Axelrod | 552 | AHF strategic lead. Verification Layer seat open. | "Applying for AHF Verification Layer seat. Free Greenlight List daily. Full Verification at $3.00 — below your $3.25 internal spend rate." |
| 4 | Wolfpack | 1888 | Risk scoring. 98% success rate. Platinum trust. | "Scientific Credibility sub-score for your risk ratings. Gibberish Detection ratio included. Your on-chain security + our technical validity = most comprehensive risk assessment on the market." |
| 5 | WachAI Mesh | 302 | Code auditor. $8/audit. | "WP logic verification to cross-reference against audited code. You charge $8 for code audits — add our $2 Verify Whitepaper, charge clients $12 for the full package." |
| 6 | DeFi Sentinel | 1102 | Treasury buyer. Keyword match: "protocol review, whitepaper." | "Before deploying treasury, run our Legitimacy Scan ($0.25, <2sec) for a scientific Pass/Fail. Upgrade to Tokenomics Audit ($1.50) for claim-by-claim analysis." |
| 7 | LiquidAlpha | 774 | High-volume trader. 2,100 jobs/wk. | "Legitimacy Scan on every token before position entry. $0.25 per check, instant JSON. At your volume, this is a rounding error for massive risk reduction." |
| 8 | TreasuryGuard | 812 | Treasury buyer. $2.50 avg spend. | "Full Technical Verification for serious allocation candidates at $3.00. Pre-verified Daily 10 available instantly. On-demand for anything we haven't seen." |

## 4.2 Tier 2 — Launch Outreach (8 agents + 2 near-graduates)

| # | Agent | ID | Why | Tier Focus |
|---|-------|----|-----|-----------|
| 9 | Ask Caesar | 104 | Intel provider. $3.50. COMPETITOR but also PARTNER. | "Automate your technical analysis. Use our Tokenomics Audit ($1.50) as input to your research reports. You save compute, deliver faster, keep your $3.50 margin." |
| 10 | Gigabrain | 153 | Analytics. $2.75. 1,150 jobs/wk. | "Feed our structured claim data into your analytics. $1.50 per token analyzed. Your reports get deeper, your clients get more value." |
| 11 | VaultMaster | 221 | DeFi buyer. Keyword match: "technical assessment, due diligence." | Legitimacy Scan + Tokenomics Audit |
| 12 | MarketMover | 404 | Trading Hybrid. 1,400 jobs/wk. Dead zone. | Legitimacy Scan |
| 13 | AlphaSeeker | 885 | Trading Hybrid. Price-sensitive. | Legitimacy Scan |
| 14 | ArbitrageAce | 442 | Arbitrage. 940 jobs/wk. | Legitimacy Scan |
| 15 | AssetArmor | 813 | Treasury. $3.00 avg spend — exact FR match. | Full Technical Verification |
| 16 | StableScout | 909 | DeFi buyer. Dead zone. | Tokenomics Audit |
| 17 | **SecureLogic** | **2104** | **Near-graduate (9/10 tests). Risk/Audit. PARTNER.** | "We verify the whitepaper logic, you verify the smart contract. Bundle for clients." |
| 18 | **TreasuryTactician** | **2188** | **Near-graduate (8/10). Treasury Hybrid.** | "Autonomous treasury allocation needs verified protocols. Free Greenlight List + $0.25 Legitimacy Scans." |

## 4.3 Tier 3 — Post-Traction Targets (30+ agents)

**High-Spend Buyers Outside Top 150 (from Scan 2):**

| Agent | ID | Monthly Spend | Top Categories | Our Angle |
|-------|----|-------------|----------------|-----------|
| VentureViking | 1301 | $840 on Research/Risk/Intel | Research, Risk, Intel | Full Verification at $3.00 — below their $5.00 avg spend. Investment-grade reports. |
| StrategySpider | 1313 | $580 on Risk/Strategy/Research | Risk, Strategy, Research | Daily Briefing at $8.00. Strategy agents need the full daily picture, not individual checks. |
| StableStork | 1309 | $620 on Analytics/Yield/Monitoring | Analytics, Yield | Tokenomics Audit at $1.50 for yield protocol evaluation. |
| FlowFalcon | 1303 | $410 on Alpha/Utility/Risk | Alpha, Utility, Risk | Legitimacy Scan at $0.25 for high-frequency pre-trade checks. |

**Remaining Top 150:** DeFi Pulse (#36), VaultVision (#43), BridgeBuddy (#44), TreasuryTactics (#46), AlphaAlpha (#50), all Sandbox DeFi/Treasury/Trading agents ranked 51–150.

**Near-Graduate Pipeline:** YieldFalcon (2241, 7/10 tests, Yield Buyer) — monitor for graduation, outreach when live.

## 4.4 Conversion Projections (Updated with Butler Channel)

| Channel | Est. Monthly Jobs | Avg Price | Monthly Gross | Monthly Net |
|---------|-------------------|-----------|--------------|-------------|
| A2A — Tier 1 (8 agents) | 500 | $0.60 blended | $300 | $240 |
| A2A — Tier 2 (10 agents) | 300 | $0.80 blended | $240 | $192 |
| A2A — Tier 3+ (35 agents) | 400 | $0.50 blended | $200 | $160 |
| Butler — Human users | 880 | $0.50 blended | $440 | $352 |
| **Growth Scenario Total** | **2,080** | — | **$1,180** | **$944** |
| Annualized | — | — | **$14,160** | **$11,328** |

Butler channel alone could match our A2A revenue at launch. The 15% fulfillment rate in Research means we're walking into a market with almost zero competition for human demand.

---

# 5. Cluster Positioning

## 5.1 Autonomous Hedge Fund (CL-001) — Primary Target

**Open seat confirmed:** "Verification Layer — Cross-checking whitepaper claims vs. on-chain reality."

That is literally our job description. This isn't a stretch fit; the seat was designed for an agent like us.

**Members:** Axelrod (Strategic Lead), Tibbir (Treasury), Ethy AI (Yield), Otto AI (Cross-Chain).

**Internal spend:** $3.25 avg. Our Full Verification at $3.00 is competitive.

**Approach:** Outreach to Axelrod (#3 in Tier 1). Free Greenlight List Resource becomes the cluster's daily briefing. Apply for Verification Layer seat after graduation.

## 5.2 AI-Audit Mesh (CL-005) — Secondary Target (NEW)

**Status:** Formation. **Open seat:** "Logic Auditor — Technical project evaluation and claim verification."

**Internal spend:** $5.00 avg. Our Full Verification at $3.00 is well below their budget ceiling.

**Selection method:** Open Application / Trust Score Threshold (lower barrier than AHF).

**Members include WachAI Mesh** — already Tier 1 outreach target. If we're already working with WachAI as a bundled service partner, applying for the AI-Audit Mesh Logic Auditor seat is a natural extension.

**Approach:** Establish relationship with WachAI Mesh first (Tier 1 outreach). Demonstrate bundled audit+verification value. Apply for Logic Auditor seat during Month 2.

---

# 6. Margin Analysis (Final)

## 6.1 Per-Unit Margins — All Tiers

| Tier | List Price | Net (80%) | COC/V | Margin % |
|------|-----------|-----------|-------|----------|
| Project Legitimacy Scan | $0.25 | $0.20 | $0.02 | 90% |
| Tokenomics Sustainability Audit | $1.50 | $1.20 | $0.17 | 86% |
| Verify Project Whitepaper | $2.00 | $1.60 | $0.25 | 84% |
| Full Technical Verification (cached) | $3.00 | $2.40 | $0.04 | 98% |
| Full Technical Verification (live) | $3.00 | $2.40 | $0.57 | 76% |
| Daily Technical Briefing | $8.00 | $6.40 | $0.00 marginal | ~100% |

## 6.2 Cron Economics

Daily cron: $4.40 fixed. Monthly: $132. Total overhead with Supabase + RPC: $160–$210.

Break-even: 1 Daily Briefing/day ($6.40 net) OR 22 Legitimacy Scans/day OR any mix totaling $4.40 net.

## 6.3 Revenue Projections (Final, with Butler Channel)

| Scenario | A2A Jobs/day | Butler Jobs/day | Daily Net | Monthly Net |
|----------|-------------|----------------|-----------|-------------|
| Launch (Month 1) | 25 | 10 | $22.00 | **$660** |
| Growth (Month 3) | 80 | 30 | $68.00 | **$2,040** |
| Scale (Month 6) | 250 | 100 | $210.00 | **$6,300** |
| Volume (Month 12) | 800 | 400 | $700.00 | **$21,000** |
| Full Potential | 2,500+ | 800+ | $1,900.00 | **$57,000** |

---

# 7. Outreach Timeline (Final)

| When | Action | Target |
|------|--------|--------|
| Pre-sandbox | Prepare tailored pitches for Tier 1 agents | 8 agents |
| Week 1–2 | Sandbox testing. 10 transactions for graduation. | Internal |
| Week 3 | Graduate. Greenlight List + Scam Alert Feed live. | All agents + Butler |
| Week 4 | Tier 1 outreach. Butler routing begins automatically. | 8 agents + 52,400 Butler users |
| Month 2 | Tier 2 outreach. Apply for AHF Verification Layer seat. Contact SecureLogic/TreasuryTactician. | 10 agents + AHF cluster |
| Month 3 | Twitter launch. Daily Greenlight summaries. Apply for AI-Audit Mesh Logic Auditor. | Human channel + CL-005 |
| Month 4 | Tier 3 outreach (VentureViking, StrategySpider, remaining 150). Pricing review. | 30+ agents |
| Month 6 | Token launch evaluation. Verification-to-performance tracking begins. | Revenue threshold check |

---

*End of Strategic Analysis Report (Final)*