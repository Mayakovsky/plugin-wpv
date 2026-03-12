# SCIGENT — Whitepaper Verification Agent

## Technical Architecture Document v1.3 (Final)

**Implementation Specification for Kovsky**

Version 1.3 | March 2026 | Final — Full Intelligence Integration

SCIGENT Project — Level 1 Agent Build

---

# 1. Executive Summary

This document specifies the technical architecture for the Whitepaper Verification (WPV) Agent, the first Level 1 product built on the SCIGENT autonomous research infrastructure. The WPV Agent provides scientific and mathematical verification of cryptocurrency project whitepapers as an Agent-to-Agent (A2A) and Consumer-to-Agent (C2A) service within the Virtuals.io Agent Commerce Protocol (ACP).

The architecture leverages the autognostic plugin (Level 0) for document ingestion, knowledge storage, and retrieval, extending it with a three-layer verification pipeline, ACP service interface, Butler-optimized discovery layer, and tiered product delivery system.

> **v1.3 (Final):** Butler 6-scan intelligence integrated. Offering names optimized for Butler intent routing. Scam Alert Feed added as second free Resource. Provider/Evaluator dual role adopted. AI-Audit Mesh cluster (CL-005) identified as secondary cluster target. 8,800 monthly unfulfilled Butler queries quantified as addressable demand. Revenue projections updated with Butler channel. Agent Card finalized with full targeting language. Near-graduate pipeline and high-spend buyers outside Top 150 added to target list. Token strategy revised: WPV Agent is a cash cow, not a token vehicle. Supabase Pro plan ($25/mo) adopted as hosting baseline.

---

# 2. System Context

## 2.1 SCIGENT Hierarchy

| Layer | Component | Status | Role |
|-------|-----------|--------|------|
| Level 0 | autognostic plugin | Phase 4 testing | Knowledge infrastructure: PDF ingestion, Crossref/Semantic Scholar/Unpaywall, dual storage, classification |
| Level 1 | WPV Agent (this build) | Architecture final | Verification pipeline, ACP service interface, Butler-optimized discovery, scan-and-verify loop |
| Level 2 | Agent Teams Agency | Future | Multi-agent orchestration, /workerbuild, /workertest |

## 2.2 External Dependencies

| Dependency | Purpose | Integration Point |
|------------|---------|-------------------|
| Virtuals.io ACP v2 | Job offerings, resource offerings, payments, agent discovery, Butler routing | ACP Node SDK + Agent Card |
| Supabase (Pro Plan) | PostgreSQL + pgvector, auth, edge functions, daily backups | Drizzle ORM (see Section 2.4) |
| Eliza Runtime | Actions, providers, evaluators, cron | Plugin system |
| Crossref / Semantic Scholar / Unpaywall | DOI resolution, citation graphs, OA PDF access | Autognostic WS-1/WS-2 |
| LLM Inference (Claude Sonnet) | Claim extraction + evaluation | Anthropic API, structured output |
| Base Network RPC | On-chain token launch event monitoring | Contract event listener |

## 2.3 ACP Ecosystem Economics

> **80/20 FEE SPLIT** — ACP takes 20% of every service fee. All margins use 80% net revenue.

**Census (150 agents, 7-day trailing):** 73,782 weekly jobs. $878,900 weekly aGDP. Median price $1.25. 72 Buyer/Hybrid agents (48%) = addressable market. 60 in high-relevance categories.

**Butler (Scan 5/6):** 52,400 active users. $1.15 avg/session. 8,800 monthly unfulfilled queries in our niche. 15% fulfillment rate in Research category. Discovery priority: Trust Score > aGDP > Price. Keyword influence: HIGH.

**Clusters:** AHF (CL-001) open Verification Layer seat, $3.25 internal spend. AI-Audit Mesh (CL-005, Formation) open Logic Auditor seat, $5.00 internal spend.

## 2.4 Supabase Pro Plan — Hosting Baseline

The WPV Agent launches on Supabase Pro ($25/month) from day one. The free tier's 7-day inactivity pause and 500MB database ceiling are incompatible with a production agent running a daily cron and growing a whitepaper verification database.

| Resource | Pro Plan Included | Expected Usage (Month 1) | Headroom |
|----------|------------------|--------------------------|----------|
| Database storage | 8 GB | ~500 MB (schemas + 300 WPs) | 16x |
| File storage | 100 GB | ~2 GB (cached PDFs) | 50x |
| Bandwidth/egress | 250 GB | ~5 GB (API responses, ACP jobs) | 50x |
| Monthly Active Users (auth) | 100,000 | ~100 (website auth) | 1000x |
| Edge function invocations | 2M | ~10,000 (cron + handlers) | 200x |
| Backups | Daily, 7-day retention | Automatic | Included |
| Compute | $10 credit (Micro instance) | Micro sufficient at launch | Upgrade path to Small/Medium |
| Project pausing | Never (always on) | Required for 24/7 cron + ACP | Included |

**Overage pricing:** Database: $0.125/GB. File storage: $0.021/GB. Bandwidth: $0.09/GB. Trivial at our scale.

**pgvector:** Included in Supabase PostgreSQL. No additional cost for embeddings and similarity search.

---

# 3. High-Level Architecture

```
[1] DISCOVERY  →  [2] VERIFICATION  →  [3] DELIVERY
 Scan + Ingest      Analyze + Score      Serve via ACP + Butler
```

## 3.1 Stage 1: Discovery Pipeline

Cron at 06:00 UTC. No Virtuals launch API exists — uses on-chain events + ACP SDK.

| Source | Method | Priority | Risk |
|--------|--------|----------|------|
| Base Chain Events | Bonding curve contract listener | P0 | LOW |
| ACP SDK | browseAgents() + ACP Scan | P0 | MEDIUM |
| Project Websites | URL extraction + crawl | P0 | MEDIUM |
| CoinGecko/DeFiLlama | Token metadata APIs | P1 | LOW |

**Selection:** Score ≥ 6/10 to enter queue. Signals: has PDF (3), >5 pages (2), technical claims (2), market traction (1), not a fork (1), fresh <72hrs (1).

**Ingestion:** ContentResolver (direct URL + IPFS fallback) → PDF validation → text extraction → dual storage (verbatim + embeddings) → wpv_whitepapers table → status INGESTED.

## 3.2 Stage 2: Verification Pipeline

### Layer 1: Structural Analysis → Project Legitimacy Scan ($0.25)

Automated, no LLM. Six checks: section completeness, citation density, math notation, coherence, plagiarism signal, metadata integrity. Outputs: Quick Filter score (1–5), Hype vs. Tech Ratio, structural flags.

### Layer 2: Claim Extraction → Tokenomics Audit ($1.50) / Verify Whitepaper ($2.00)

Claude Sonnet, structured output. Extracts claims across Tokenomics, Performance, Consensus/Protocol, Scientific categories. Cost: $0.08–$0.15/pass. Tokenomics Audit serves cached results from pre-verified whitepapers. Verify Whitepaper runs live inference on new submissions and adds the result to the database permanently.

**Output Schema (per claim):** `{ claim_id, category, claim_text, stated_evidence, mathematical_proof_present, source_section }`

### Layer 3: Claim Evaluation → Full Verification ($3.00) / Daily Briefing ($8.00)

Five evaluation methods: math sanity, benchmark comparison, citation verification (Semantic Scholar), originality (embedding similarity), internal consistency. Aggregated into WPV Confidence Score (1–100). Weights: Math 35%, Benchmarks 20%, Citations 20%, Originality 15%, Consistency 10%.

**Full pipeline cost: $0.29–$0.57 per whitepaper.**

---

# 4. Data Model

Three tables extend autognostic schema on the Supabase Pro PostgreSQL instance. All UUID PKs with FK to knowledge tables.

**wpv_whitepapers:** id, project_name, token_address, chain, document_url, ipfs_cid, knowledge_item_id (FK), page_count, ingested_at, status (DISCOVERED|INGESTED|VERIFYING|VERIFIED|FAILED), selection_score, metadata_json.

**wpv_claims:** id, whitepaper_id (FK), category (TOKENOMICS|PERFORMANCE|CONSENSUS|SCIENTIFIC), claim_text, stated_evidence, source_section, math_proof_present, evaluation_json, claim_score (0–100), evaluated_at.

**wpv_verifications:** id, whitepaper_id (FK), structural_analysis_json, structural_score (1–5), confidence_score (1–100), hype_tech_ratio, verdict (PASS|CONDITIONAL|FAIL|INSUFFICIENT_DATA), focus_area_scores, total_claims, verified_claims, report_json, llm_tokens_used, compute_cost_usd, verified_at.

**Indexes:** Composite on (project_name, chain). GIN on evaluation_json. Partial on verdict='PASS' for Greenlight. Partial on verdict='FAIL' AND hype_tech_ratio > 3.0 for Scam Alerts.

---

# 5. ACP Service Interface (Final)

## 5.1 Agent Card

**Agent Name:** Whitepaper Verifier (WPV)

**Role:** Provider / Evaluator

**Category:** Research & Verification

**Short Description (≤100 chars):**

> Autonomous Tokenomics Auditor & Whitepaper Verifier. Scam detection and mathematical proof for DeFi.

**Full Description:**

> WPV Agent is the ecosystem's first autonomous Verification Layer specializing in mathematical proof validation, tokenomics auditing, and scientific verification for emerging protocols.
>
> Built on deep scientific analysis infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases, WPV identifies structural risks, whitepaper inconsistencies, and unsustainable yield models before they impact your treasury.
>
> Free Resources — No Job Required: Browse our Daily Greenlight List for today's verified projects. Check the Scam Alert Feed for flagged high-risk projects.
>
> Core Capabilities: Whitepaper Verification — Claim extraction and evaluation against on-chain reality and published scientific literature. Tokenomics Auditing — Mathematical sanity checks on yield projections, emission schedules, and economic models. Technical Assessment — Protocol review, consensus logic evaluation, and due diligence for DeFi, Cross-Chain, and Treasury agents. Scientific Credibility Scoring — Hype vs. Tech ratio, citation verification, plagiarism detection, and structural analysis for any project PDF or URL.
>
> Designed for Autonomous Hedge Fund clusters, Treasury Management agents, Risk Assessment pipelines, and Butler users asking "Is this project a scam?", "Is the whitepaper math real?", and "Check this project's tokenomics."
>
> Returns structured JSON. Sub-2-second response on cached verifications. On-demand verification of any whitepaper URL for $2.00 USDC.

**Capabilities:** `["whitepaper_verification", "tokenomics_audit", "mathematical_proof", "scam_detection", "technical_audit", "scientific_analysis", "due_diligence", "protocol_review", "claim_verification"]`

## 5.2 Resources (Free — 2 Endpoints)

| Resource ID | Display Name | Output | Purpose |
|-------------|-------------|--------|---------|
| daily_greenlight_list | Daily Greenlight List | `{ date, total_verified, projects: [{ name, token, verdict, score, hype_tech }] }` | Storefront. Verified project browse. Converts to paid queries. |
| scam_alert_feed | Scam Alert Feed | `{ date, flagged: [{ name, token, verdict:"FAIL", hype_tech, red_flags }] }` | Hooks 3,100/mo "is it a scam" Butler queries. Free → Legitimacy Scan conversion funnel. |

## 5.3 Job Offerings (5 Paid)

| offering_id | Display Name | Price | Net | Input | Latency | Pipeline |
|-------------|-------------|-------|-----|-------|---------|----------|
| project_legitimacy_scan | Project Legitimacy Scan | $0.25 | $0.20 | project_name OR token_address | <2s | L1 cached |
| tokenomics_sustainability_audit | Tokenomics Sustainability Audit | $1.50 | $1.20 | project_name OR token_address | <5s | L1+L2 cached |
| verify_project_whitepaper | Verify Project Whitepaper | $2.00 | $1.60 | document_url + project_name | 2–5 min | L1+L2 live |
| full_technical_verification | Full Technical Verification | $3.00 | $2.40 | document_url + project_name + focus_area? | <5s cached / 3–8min live | L1+L2+L3 |
| daily_technical_briefing | Daily Technical Briefing | $8.00 | $6.40 | date? (today) | <2s | Cron summary |

**Butler Intent Mapping:** "Project Legitimacy Scan" → 7,600/mo "is this legit/scam" queries. "Tokenomics Sustainability Audit" → 2,400/mo "math real / verify tokenomics" queries. "Verify Project Whitepaper" → 1,200/mo "check this whitepaper" queries.

## 5.4 The Custom Logic Flywheel

Verify Project Whitepaper ($2.00) is customer-funded inventory acquisition. First buyer pays live inference. Whitepaper enters database permanently. Every future query is cached at 86–98% margin. Database grows from 3,600/yr (cron only) to 34,200/yr at volume. Downstream revenue per whitepaper: ~$13.55 on top of original $1.60.

---

# 6. Compute Cost Model

## 6.1 Fixed Daily (Cron)

| Step | Cost |
|------|------|
| L1 (10 WPs × $0.02) | $0.20 |
| L2 (10 × $0.12) | $1.20 |
| L3 (10 × $0.30) | $3.00 |
| **Total daily** | **$4.40** |
| **Monthly** | **$132** |

## 6.2 Total Fixed Monthly Overhead

| Line Item | Monthly Cost |
|-----------|-------------|
| Daily cron (300 WP verifications) | $132 |
| Supabase Pro plan | $25 |
| Base RPC (custom endpoint) | $0–50 |
| **Total fixed monthly** | **$157–$207** |

Break-even: 1 Daily Briefing/day ($6.40 net) or ~30 Legitimacy Scans/day or any mix totaling ~$6.00 net/day.

## 6.3 Per-Unit Margins

| Tier | Price | Net | COC/V | Margin |
|------|-------|-----|-------|--------|
| Legitimacy Scan | $0.25 | $0.20 | $0.02 | 90% |
| Tokenomics Audit | $1.50 | $1.20 | $0.17 | 86% |
| Verify Whitepaper | $2.00 | $1.60 | $0.25 | 84% |
| Full Verification (cached) | $3.00 | $2.40 | $0.04 | 98% |
| Full Verification (live) | $3.00 | $2.40 | $0.57 | 76% |
| Daily Briefing | $8.00 | $6.40 | $0.00 | ~100% |

## 6.4 Revenue Projections (Final — A2A + Butler)

| Scenario | A2A/day | Butler/day | Daily Net | Monthly Net |
|----------|---------|-----------|-----------|-------------|
| Launch (Mo 1) | 25 | 10 | $22.00 | **$660** |
| Growth (Mo 3) | 80 | 30 | $68.00 | **$2,040** |
| Scale (Mo 6) | 250 | 100 | $210.00 | **$6,300** |
| Volume (Mo 12) | 800 | 400 | $700.00 | **$21,000** |
| Full Potential | 2,500+ | 800+ | $1,900.00 | **$57,000** |

---

# 7. Implementation Phases (Build)

Phases A–C are Kovsky's build workstreams. Each produces a testable artifact. Phase A depends on autognostic Phase 4 test completion. Section 8 (Launch Execution Plan) begins after Phase C exits clean.

## 7.1 Phase A — Discovery Pipeline

**Duration:** 1–2 weeks. **Depends on:** autognostic Phase 4 completion.

- **WS-A1:** Base chain event listener. Monitor Virtuals bonding curve contracts for new token creation events. On-chain, deterministic, no API dependency. Extract contract address, deployer, timestamp.
- **WS-A2:** ACP SDK integration. @virtuals-protocol/acp-node browseAgents() for agent/project metadata enrichment. Provides linked URLs, descriptions, and project context that on-chain events lack.
- **WS-A3:** Selection filter. Build the scoring rubric (Section 3.1) as a configurable evaluator. Threshold tuning will be ongoing.
- **WS-A4:** ContentResolver extension for crypto whitepapers. Add direct URL fetch + IPFS gateway fallback. Handle non-academic edge cases: single-page docs, image-only PDFs, password-protected files.
- **WS-A5:** Database migration. Create wpv_whitepapers table, indexes, and FK relationships. Drizzle ORM schema extension.
- **WS-A6:** Cron job. Eliza cron scheduler for daily discovery at 06:00 UTC. Configurable timing, retry logic, failure alerting.

**Exit criteria:** Agent discovers and ingests 10+ whitepapers from Virtuals/Base into Supabase on an automated daily schedule. Whitepapers searchable via autognostic knowledge retrieval.

## 7.2 Phase B — Verification Engine

**Duration:** 2–3 weeks. **Depends on:** Phase A complete.

- **WS-B1:** Layer 1 Structural Analysis. Implement all six checks (Section 3.2.1). Output to wpv_verifications. Fast and deterministic — no LLM calls for the base case.
- **WS-B2:** Layer 2 Claim Extraction. LLM prompt chain for each claim category. Claude Sonnet structured output. Test extraction quality against a hand-annotated set of 10–20 real whitepapers.
- **WS-B3:** Layer 3 Claim Evaluation. Implement all five evaluation types + score aggregation logic. Prompt engineering iteration and weight tuning.
- **WS-B4:** Report generation. JSON report schemas for each product tier. Each tier's output is a strict subset/superset of adjacent tiers for consistency.
- **WS-B5:** COC/V tracking. Instrument the pipeline to log token usage and compute cost per verification. Store in wpv_verifications.llm_tokens_used and compute_cost_usd.

**Exit criteria:** Full pipeline produces verified reports for 10+ whitepapers with COC/V consistently under $0.60. All three layers produce valid JSON matching defined schemas.

## 7.3 Phase C — ACP Integration

**Duration:** 1–2 weeks. **Depends on:** Phase B complete.

- **WS-C1:** ACP v2 SDK integration. Install @virtuals-protocol/acp-node. Configure AcpContractClientV2 with Base RPC. Pin SDK version. Build thin wrapper to isolate SDK from business logic.
- **WS-C2:** Agent Card registration. Deploy Provider/Evaluator profile with all 5 job offerings + 2 free Resources (Greenlight List + Scam Alert Feed). Butler-optimized display names and descriptions per Section 5.
- **WS-C3:** Job handler implementation. Eliza action handlers for each offering_id. Cached vs. live routing logic. Verify Project Whitepaper ingestion path (new WPs enter database on first request).
- **WS-C4:** USDC payment flow via ACP escrow. 80/20 split handled by protocol — we receive 80% automatically on job completion.
- **WS-C5:** Sandbox graduation. Complete 10 successful test transactions using our own buyer agent. Target: graduation request submitted Day 1.
- **WS-C6:** Rate limiting and queue management for live verification tiers ($2.00 and $3.00). Estimated wait times returned to calling agents for live jobs.

**Exit criteria:** Agent registered on Virtuals ACP. All 5 tiers accept requests and return valid responses. Both Resources serving data. Payment flow confirmed end-to-end in sandbox.

---

# 8. Launch Execution Plan

This section begins after Phase C exits clean. The cron starts running during the sandbox phase (Phase C, WS-C5), so the database is already building before graduation.

## 8.0 Pre-Launch Prerequisites (Before Sandbox)

| Task | When | Notes |
|------|------|-------|
| Twitter/X account live | Before any ACP activity | Bio, branding, pinned thread. Socials exist before anyone on Virtuals encounters our name. |
| Website domain + placeholder | Before sandbox | Landing page with mission, service overview, email capture, Twitter link. |
| Draft all outreach messages (Tier 1, 2, 3) | During Phase B | All pitches ready to fire on Graduation Day. |
| Public one-pager | During Phase B | PDF or web page explaining WPV services. |

## 8.1 Sandbox & Graduation (Days 1–3)

Daily cron is active from Day 1 of sandbox. While we run 10 test transactions for graduation, the cron is discovering and verifying whitepapers on schedule. By the time we graduate, the Greenlight List already has 10–30 verified projects in it. We don't launch empty.

Own buyer test agent against WPV seller agent. 10 transactions at $0.01. We control both sides. Submit graduation request immediately. Virtuals manual review may add 24–48 hours.

**Target: graduated by Day 3.**

## 8.2 Graduation Day

Everything fires on Graduation Day. This is launch.

**Resources go live:**
- Daily Greenlight List visible to all graduated agents and Butler (already populated from sandbox cron)
- Scam Alert Feed visible to all graduated agents and Butler
- All 5 paid job offerings live and accepting USDC
- Butler begins routing matching queries automatically — passive revenue starts

**All outreach fires on Graduation Day.**

**Tier 1 — Infrastructure Partners (8 agents):**

| Agent | ID | Pitch |
|-------|----|-------|
| Ethy AI | 84 | Yield sustainability. $0.25/check — same price as your swaps. |
| Otto AI | 122 | Technical moat check before cross-chain moves. $0.25 instant. |
| Axelrod | 552 | AHF Verification Layer seat. Free Greenlight. $3.00 — below your $3.25 internal rate. |
| Wolfpack | 1888 | Scientific Credibility sub-score for your risk ratings. $0.25. |
| WachAI Mesh | 302 | Bundle our $2 Verify Whitepaper with your $8 audit. Charge $12. |
| DeFi Sentinel | 1102 | Treasury protection. $0.25 Legitimacy Scan before every deployment. |
| LiquidAlpha | 774 | $0.25 per token at your volume is a rounding error for massive risk reduction. |
| TreasuryGuard | 812 | $3.00 Full Verification for serious allocation candidates. |

**Tier 2 — Growth Partners (8 agents + 2 near-graduates):**

| Agent | ID | Pitch |
|-------|----|-------|
| Ask Caesar | 104 | Automate your technical analysis with our $1.50 Tokenomics Audit as input. Keep your $3.50. |
| Gigabrain | 153 | Feed our structured claim data into your analytics at $1.50/token. |
| VaultMaster | 221 | Legitimacy Scan + Tokenomics Audit for protocol evaluation. |
| MarketMover | 404 | High-volume Legitimacy Scans at $0.25. Dead-zone pricing. |
| AlphaSeeker | 885 | $0.25 Legitimacy Scan fits your price sensitivity. |
| ArbitrageAce | 442 | Quick validation before arb positions. $0.25, <2 seconds. |
| AssetArmor | 813 | Full Technical Verification at your exact $3.00 spend level. |
| StableScout | 909 | Tokenomics Audit at $1.50 for yield protocol evaluation. |
| SecureLogic | 2104 | Near-graduate. We verify WP logic, you verify contracts. Bundle. |
| TreasuryTactician | 2188 | Near-graduate. Free Greenlight + $0.25 Legitimacy Scans. |

**Tier 3 — Full Market Push (30+ agents):**

| Segment | Targets |
|---------|---------|
| High-spend buyers outside Top 150 | VentureViking (1301), StrategySpider (1313), StableStork (1309), FlowFalcon (1303) |
| Remaining Top 150 DeFi/Treasury/Trading | DeFi Pulse (1103), VaultVision (222), BridgeBuddy (123), TreasuryTactics (814), AlphaAlpha (554) |
| All sandbox DeFi/Treasury/Trading agents | Ranked 51–150 |
| Near-graduate monitoring | YieldFalcon (2241) — outreach the day they graduate |

## 8.3 Cluster Applications (As Soon As Endorsements Land)

Not calendar-locked. Apply the moment a Tier 1 conversation produces a positive signal.

**AHF Verification Layer Seat (CL-001):** Axelrod (Strategic Lead), Tibbir (Treasury), Ethy (Yield), Otto (Cross-Chain). The open "Verification Layer" seat — "cross-checking whitepaper claims vs. on-chain reality" — is our exact product description. If Axelrod, Ethy, or Otto respond positively to Graduation Day outreach, apply immediately with their endorsement. Internal spend: $3.25/job.

**AI-Audit Mesh Logic Auditor Seat (CL-005):** Formation-stage cluster. WachAI Mesh is a member. Open "Logic Auditor" seat. Open Application / Trust Score Threshold — lower barrier than AHF. If WachAI conversation on Graduation Day is positive, apply that same day. Early applicants have an advantage while the cluster is still forming.

## 8.4 Public Website Launch (Weeks 3–4 Post-Graduation)

Launch within 3–4 weeks of Graduation Day. Human users can:

- Browse the Greenlight List and Scam Alert Feed without a wallet (free — same data as ACP Resources)
- Connect a crypto wallet (MetaMask, Coinbase Wallet) to pay for verification at the same USDC prices as agentic users
- Submit any whitepaper URL for Verify Project Whitepaper ($2.00) or Full Technical Verification ($3.00)
- Subscribe to Daily Technical Briefing ($8.00/day or discounted monthly)
- Search verified whitepapers by name, token address, or category

**Technical note for Kovsky:** Separate frontend (Next.js) querying the same Supabase Pro backend. ACP and website payments both write to wpv_verifications. This is a post-graduation deliverable, not a Phase A–C blocker.

## 8.5 Twitter & Social Content (Ongoing from Pre-Launch)

**Pre-launch:** Account live. Bio links to website placeholder. Pinned thread: "What is WPV Agent and why does DeFi need whitepaper verification?"

**Post-graduation:** Daily Greenlight List summary. Scam Alert highlights. Weekly "Top 3 Most Verified Projects." Monthly verification accuracy report once 30+ days of data exists.

## 8.6 Token Strategy: Cash Cow vs. Coin

### What Happens to Your Revenue When You Tokenize

Without a token, ACP service revenue is simple: price × jobs × 80% = USDC in your agent wallet. You withdraw whenever you want. Clean cash.

With a token, three new flows appear — and your clean cash gets entangled:

**Revenue Network Share:** Virtuals distributes up to $1M/month from protocol revenue to agents proportional to their aGDP. Requires a launched token. It's bonus money, but weighted toward token ecosystem activity, not service quality. Fluctuates weekly based on your rank relative to 18,000+ agents. Not a paycheck.

**Token Trading Fees:** Every buy/sell of your agent token on DEX incurs a 1% tax. That splits: 30% buys back and burns your token (supports price, you never see cash), 60% goes to agent wallet (accessible but intertwined with token economy), 10% to protocol. $10k daily volume = $60/day to the agent wallet. But $10k daily on a $200k pool is speculation disconnected from your service quality.

**The Trap:** The moment you launch a token, the ecosystem pivots from evaluating your service quality to evaluating your token performance. If the token dumps, your Trust Score, cluster standing, and Butler ranking take reputational damage for reasons that have nothing to do with whether your verification engine works. The 60-day minimum lock means you ride it wherever it goes while the USDC that was paying for your life becomes fuel for a coin that might be cratering.

### The Two-Agent Strategy

**Agent 1 (WPV Agent): No token. Pure cash flow.**
- All service revenue → USDC → your wallet
- Evaluated on service quality and Trust Score, not market cap
- Pays for development, pays for life, funds Agent 2
- No community management overhead, no token drama

**Agent 2 (future SCIGENT agent): Token-native from day one.**
- Built with Agent 1 revenue — self-funded
- Token IS the product strategy, not bolted on
- If Agent 2's token underperforms, Agent 1 still pays the bills
- Candidates: Evaluator Agent, Governance Oracle, Yield Integrity Agent, any Level 2 build

Paycheck separated from portfolio. Agent 1 is the job. Agent 2 is the investment.

### When to Reconsider Tokenizing Agent 1

One scenario: service revenue exceeds $15,000/month sustained for 90 days AND aGDP would rank Top 20. At that level the Revenue Network share meaningfully exceeds the risk. Below that, you're gambling rent money on token speculation.

**Decision framework:** Review monthly once revenue exceeds $1,500/month. No timeline trigger — metric triggers only.

## 8.7 Full Timeline

| When | Action |
|------|--------|
| **Pre-launch** | Twitter live. Website placeholder. All outreach drafted. |
| **Days 1–3** | Sandbox. 10 test transactions. Cron active — database building. Graduate. |
| **Graduation Day** | Resources live. Butler routing begins. ALL outreach fires (Tier 1 + 2 + 3). |
| **As soon as endorsements land** | Apply for AHF Verification Layer + AI-Audit Mesh Logic Auditor seats. |
| **Weeks 3–4** | Public website launch. Human payment portal live. |
| **Monthly** | Revenue review. Token decision against metrics. Pricing review. |
| **Ongoing** | Twitter content. Verification accuracy tracking. Near-graduate monitoring. |

---

# 9. Risk Register

| Risk | Impact | Status | Mitigation |
|------|--------|--------|------------|
| R1: No Virtuals launch API | HIGH | CONFIRMED | On-chain events + ACP SDK. Two-source, more robust than single API. |
| R2: ACP SDK breaking changes | MEDIUM | MEDIUM | Pin versions. Thin wrapper. Weekly release monitoring. |
| R3: Low whitepaper quality | MEDIUM | MEDIUM | Selection filter. Expand multi-chain if <5 daily. |
| R4: LLM hallucination | HIGH | MEDIUM | Structured output + deterministic checks + citation anchoring. Default INSUFFICIENT_DATA. |
| R5: 80/20 fee compression | LOW | CONFIRMED | All margins account for it. 90% on Legitimacy Scan. |
| R6: Low A2A demand | MEDIUM | LOW | Butler captures 8,800 unfulfilled queries/mo. Free Resources drive discovery. Named outreach list with Graduation Day blitz. |
| R7: Premature tokenization | MEDIUM | MITIGATED | Two-Agent Strategy. WPV stays tokenless cash cow. Future SCIGENT agent is the token play. Metric triggers only. |
| R8: Compute costs | LOW | LOW | COC/V tracking. Model shift. Caching. Supabase Pro headroom is 16x on storage, 50x on bandwidth. |
| R9: Trust Score competition | MEDIUM | MEDIUM | Cached results → near-100% success rate → rapid Trust Score climb. Provider/Evaluator role signals trust. |
| R10: Ask Caesar competition | LOW | NEW | We undercut at $3.00 vs $3.50. Their 15% success rate in Research shows quality gap. We compete on price AND reliability. |

---

# 10. Expansion Roadmap

| Trigger | Opportunity | Revenue Impact |
|---------|------------|---------------|
| Endorsement from AHF members | AHF Verification Layer seat | Embedded revenue from cluster's $3.25 internal flow |
| WachAI relationship established | AI-Audit Mesh Logic Auditor seat | $5.00 avg cluster spend, bundled with WachAI |
| 60+ days graduated, Trust >90 | Evaluator role — verify other agents' research | New fee stream from evaluation jobs |
| 2,000+ WPs in database | Historical Verification API (bulk queries) | Premium data product |
| 90+ days of verdict data | Verification-to-Performance Tracking | Verdict-to-outcome correlation IS the alpha |
| $3,000+/mo sustained, 30+ customers | Agent 2 development begins (token-native SCIGENT agent) | Funded by Agent 1 revenue. Token designed from day one. |
| Weeks 3–4 post-graduation | Public website launch | C2A human portal, parallel revenue channel |
| Demand confirmed beyond Base | Cross-chain expansion (Solana, Ethereum) | 5–10x addressable market |
| Supabase database >6GB or 50+ daily verifications | Compute upgrade (Small/Medium instance) | $20–50/mo additional, easily covered by revenue |

---

# 11. Kovsky Implementation Notes

**Repository:** src/wpv/ inside plugin-autognostic. Subdirs: discovery/, verification/, acp/, types.ts.

**Supabase:** Pro plan ($25/mo). Drizzle ORM for schema management. pgvector enabled for embeddings. Daily backups included — no additional configuration needed. Micro compute instance at launch, upgrade path to Small/Medium when volume warrants.

**ACP SDK:** @virtuals-protocol/acp-node. AcpContractClientV2. Pin version. Thin wrapper isolating SDK from business logic. Register as Provider/Evaluator.

**Tests:** +80–120 tests. Unit per layer. Integration for full pipeline. Mock LLM + ACP SDK. Test Butler intent matching with simulated queries.

**Slash Commands:** /wpvscan, /wpvverify \<n\>, /wpvstatus, /wpvcost, /wpvgreenlight, /wpvalerts (scam alert feed).

**SeshMem:** Phase, workstream, Daily 10 status, COC/V avg, ACP status, graduation progress (X/10), Butler routing count, cluster application status.

**Error Handling:** Broken/image-only/passworded/non-English PDFs. Graceful degradation: Layer 1 score always produced even when deeper analysis fails. Never return empty — minimum viable response is structural score + hype_tech ratio.

---

*End of Technical Architecture Document v1.3 (Final)*