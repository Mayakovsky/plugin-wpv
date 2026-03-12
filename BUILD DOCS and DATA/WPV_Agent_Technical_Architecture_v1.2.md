# SCIGENT — Whitepaper Verification Agent

## Technical Architecture Document v1.2

**Implementation Specification for Kovsky**

Version 1.2 | March 2026 | Census-Validated Pricing & Market Intelligence

SCIGENT Project — Level 1 Agent Build

---

# 1. Executive Summary

This document specifies the technical architecture for the Whitepaper Verification (WPV) Agent, the first Level 1 product built on the SCIGENT autonomous research infrastructure. The WPV Agent provides scientific and mathematical verification of cryptocurrency project whitepapers as an Agent-to-Agent (A2A) service within the Virtuals.io Agent Commerce Protocol (ACP).

The architecture leverages the autognostic plugin (Level 0) for document ingestion, knowledge storage, and retrieval, extending it with a three-layer verification pipeline, ACP service interface, and tiered product delivery system. The target deployment is Supabase-hosted Eliza agents operating on the Virtuals/Base network.

**Scope:** System architecture, data flow, verification pipeline, ACP integration, census-validated pricing, phased implementation, and launch intelligence.

> **v1.2 AMENDMENTS:** Census data from all 150 Top Agents integrated. Pricing validated against actual ACP marketplace rates. Custom Logic Check reinstated as inventory flywheel. 53–65 paying customers identified by name and entity ID. AHF cluster gap confirmed. Butler channel sized at 52,400 users. Cron economics fully specified.

---

# 2. System Context

## 2.1 Position in SCIGENT Hierarchy

| Layer | Component | Status | Role in WPV Agent |
|-------|-----------|--------|-------------------|
| Level 0 | autognostic plugin | Phase 4 testing | Knowledge infrastructure: PDF ingestion, Crossref/Semantic Scholar/Unpaywall APIs, embedded + verbatim dual storage, classification |
| Level 1 | WPV Agent (this build) | Architecture phase | Autonomous research worker: verification pipeline, ACP service interface, scheduled scan-and-verify loop |
| Level 2 | Agent Teams Agency | Future | Factory layer: multi-agent orchestration, /workerbuild, /workertest, squad deployment |

## 2.2 External Dependencies

| Dependency | Purpose | Integration Point |
|------------|---------|-------------------|
| Virtuals.io ACP v2 | Agent commerce: job offerings, resource offerings, payments, agent discovery | ACP Node SDK (@virtuals-protocol/acp-node) + Agent Card registration |
| Supabase | PostgreSQL + pgvector hosting, auth, edge functions | Direct DB connection via Drizzle ORM |
| Eliza Runtime | Agent framework: actions, providers, evaluators, cron | Plugin system (extends autognostic) |
| Crossref API | DOI resolution, metadata enrichment for cited papers | Existing autognostic WS-1 integration |
| Semantic Scholar | Citation graph, related paper discovery | Existing autognostic WS-2 integration |
| Unpaywall | Open access PDF resolver | Existing autognostic WS-1 integration |
| LLM Inference | Claim extraction + evaluation (Claude Sonnet via API) | Anthropic API, structured output mode |
| Base Network (RPC) | On-chain event monitoring for new token launches | Custom or public RPC endpoint for contract event listening |

## 2.3 ACP Ecosystem Economics (Census-Validated)

> **CRITICAL: 80/20 FEE SPLIT** — ACP takes 20% of every service fee at the protocol layer. All margins in this document use the 80% net revenue figure.

**Census snapshot (150 agents, trailing 7 days):**

- Total weekly jobs across all 150 agents: 73,782 (10,540/day average)
- Total weekly aGDP: $878,900
- Median service price: $1.25 | Mean: $2.16
- 72 of 150 agents (48%) are Buyers or Hybrids = our addressable market
- 60 of those 72 are in high-relevance categories (DeFi, Treasury, Trading, Cross-Chain, Hedge Fund, Investment, Strategy)
- AHF cluster average internal job spend: $3.25 USDC
- Butler: 52,400 active users, $1.15 avg/session, discovery priority: Trust Score > aGDP > Price
- A2A vs. human volume: 68% / 32%
- Revenue Network distributes up to $1M/month to agents by aGDP contribution
- x402 micropayments live: ecosystem moving toward sub-dollar transactions
- Contestable cluster seats: "If your agent's prices are more competitive, ships faster, you earn the flow."
- AHF cluster Insights/Alpha Aggregator seat is open — current workaround is "manual filtering or high-latency research providers"

---

# 3. High-Level Architecture

Three-stage pipeline: Discovery → Verification → Delivery. Orchestrated by Eliza cron scheduler.

```
[1] DISCOVERY  →  [2] VERIFICATION  →  [3] DELIVERY
 Scan + Ingest      Analyze + Score      Serve via ACP
```

## 3.1 Stage 1: Discovery Pipeline

Runs on configurable cron schedule (default: 06:00 UTC).

> **No dedicated Virtuals launch API exists.** Discovery uses on-chain events + ACP SDK enrichment.

### 3.1.1 Data Sources

| Source | Method | Priority | Risk |
|--------|--------|----------|------|
| Base Chain Events | Virtuals bonding curve contract event listener | P0 Primary | LOW — deterministic |
| ACP SDK | browseAgents() + ACP Scan | P0 Primary | MEDIUM — no REST API |
| Project Websites | URL extraction + crawl | P0 Primary | MEDIUM — dead URLs |
| CoinGecko/DeFiLlama | APIs for Base tokens | P1 Enrichment | LOW |

### 3.1.2 Selection Criteria ("Daily 10+" Filter)

Threshold: 6/10 to enter verification queue.

| Signal | Weight | Logic |
|--------|--------|-------|
| Has linked PDF | 3 | Required. No document = auto-reject. |
| Document > 5 pages | 2 | Filters lite papers and meme docs. |
| Technical claims detected | 2 | Math notation, algorithms, protocol specs. |
| Market traction | 1 | Volume > $50k, holders > 100, or TVL signal. |
| Not a known fork | 1 | Bytecode similarity check. |
| Fresh (< 72 hrs) | 1 | Prioritizes new. Older via on-demand Custom Logic. |

### 3.1.3 Ingestion Flow

1. PDF retrieval via ContentResolver (extended for crypto whitepapers: direct URL + IPFS fallback).
2. PDF validation: integrity, page count, text extractability.
3. Text extraction via WebPageProcessor PDF handler.
4. Dual storage: verbatim chunks + embeddings to pgvector.
5. Metadata to wpv_whitepapers table. Status: INGESTED.

## 3.2 Stage 2: Verification Pipeline

Three layers, each producing independently valuable artifacts mapped to product tiers.

### 3.2.1 Layer 1: Structural Analysis → $0.25 Quick Filter

Automated, no LLM required. Six checks: section completeness, citation density, math notation presence, coherence score, plagiarism signal, metadata integrity. Outputs StructuralAnalysis + Quick Filter score (1–5) + Hype vs. Tech Ratio (marketing density / technical density; scores above 3.0 flag hype projects).

### 3.2.2 Layer 2: Claim Extraction → $1.50 Logic Check / $2.00 Custom Logic Check

LLM-powered (Claude Sonnet, structured output). Extracts testable claims across 4 categories: Tokenomics, Performance, Consensus/Protocol, Scientific. Cost: $0.08–$0.15 per pass.

**Output Schema (per claim):** `{ claim_id, category, claim_text, stated_evidence, mathematical_proof_present, source_section, confidence_extractable }`

### 3.2.3 Layer 3: Claim Evaluation → $3.00 Full Report / $8.00 Alpha Feed

Each claim evaluated independently via 5 methods: mathematical sanity check, benchmark comparison, citation verification (via Semantic Scholar), originality check (embedding similarity), internal consistency. Aggregated into WPV Confidence Score (1–100).

**Score weights (configurable):** Math Validity 35%, Benchmarks 20%, Citations 20%, Originality 15%, Consistency 10%.

**Full pipeline cost: $0.29–$0.57 per whitepaper.**

---

# 4. Data Model

Three new tables extend autognostic schema: wpv_whitepapers (discovery + ingestion metadata), wpv_claims (extracted claims + evaluations), wpv_verifications (aggregate scores + reports + COC/V tracking). All UUID PKs with FK to autognostic knowledge tables.

### wpv_whitepapers

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Unique whitepaper identifier |
| project_name | VARCHAR(255) | Project name for ACP cross-referencing |
| token_address | VARCHAR(255) | On-chain contract address (nullable) |
| chain | VARCHAR(50) | Network: base, ethereum, solana |
| document_url | TEXT | Original source URL |
| ipfs_cid | VARCHAR(255) | IPFS content hash if available |
| knowledge_item_id | UUID (FK) | Reference to autognostic knowledge table |
| page_count | INTEGER | Pages in source PDF |
| ingested_at | TIMESTAMPTZ | First ingestion timestamp |
| status | ENUM | DISCOVERED \| INGESTED \| VERIFYING \| VERIFIED \| FAILED |
| selection_score | INTEGER | Daily 10 filter score (0–10) |
| metadata_json | JSONB | Authors, version, launch date |

### wpv_claims

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Unique claim identifier |
| whitepaper_id | UUID (FK) | Reference to wpv_whitepapers |
| category | ENUM | TOKENOMICS \| PERFORMANCE \| CONSENSUS \| SCIENTIFIC |
| claim_text | TEXT | Extracted claim normalized |
| stated_evidence | TEXT | Proof offered by whitepaper |
| source_section | VARCHAR(255) | Section heading |
| math_proof_present | BOOLEAN | Mathematical proof accompanies claim |
| evaluation_json | JSONB | Full evaluation results |
| claim_score | INTEGER (0–100) | Individual claim confidence |
| evaluated_at | TIMESTAMPTZ | Evaluation timestamp |

### wpv_verifications

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Unique verification record |
| whitepaper_id | UUID (FK) | Reference to wpv_whitepapers |
| structural_analysis_json | JSONB | Full Layer 1 output |
| structural_score | INTEGER (1–5) | Quick Filter score |
| confidence_score | INTEGER (1–100) | Aggregate WPV Confidence Score |
| hype_tech_ratio | DECIMAL(5,2) | Hype vs. Tech ratio |
| verdict | ENUM | PASS \| CONDITIONAL \| FAIL \| INSUFFICIENT_DATA |
| focus_area_scores | JSONB | Per-category breakdown |
| total_claims / verified_claims | INTEGER | Claims extracted vs. evaluated |
| report_json | JSONB | Full report payload |
| llm_tokens_used | INTEGER | Total inference tokens consumed |
| compute_cost_usd | DECIMAL(8,4) | Actual COC/V |
| verified_at | TIMESTAMPTZ | Verification timestamp |

**Key indexes:** Composite on (project_name, chain). GIN on evaluation_json. Partial on verdict = 'PASS' for Greenlight queries.

---

# 5. ACP Service Interface (Census-Validated)

## 5.1 Pricing Strategy

Our pricing is calibrated against the actual ACP marketplace from the Top 150 census:

- **Quick Filter ($0.25)** matches Ethy AI (#1, $0.25, 8,420 jobs/week). Micropayment volume play at the proven sweet spot.
- **Logic Check ($1.50)** fills the dead zone between utility ($0.25–$0.50) and research ($2.75–$3.50). This band contains 66 agents (44% of census) averaging 403 jobs/week — the largest, most active price segment.
- **Custom Logic Check ($2.00)** tops the dead zone. Below Gigabrain ($2.75) and ProtocolPundit ($2.25). Customer-funded inventory acquisition.
- **Full Report ($3.00)** undercuts Ask Caesar ($3.50) and matches Axelrod's internal AHF rate ($3.00–$3.25). Competitive for research depth.
- **Alpha Feed ($8.00)** matches WachAI Mesh ($8.00) price tier. Premium daily aggregate for institutional buyers.

## 5.2 Free Resource: Greenlight List

ACP v2 Resource Offering — free read-only endpoint.

**Resource:** `daily_greenlight_list`

Returns: `{ date, total_verified, projects: [{ project_name, token_address, verdict, structural_score, hype_tech_ratio }] }`

Zero-friction storefront. Every agent in the Top 150 can browse. Converts to paid queries for deeper data.

## 5.3 Paid Offerings (5 Tiers)

| Offering ID | Price | Net (80%) | Input | Output | Latency | Pipeline |
|-------------|-------|-----------|-------|--------|---------|----------|
| quick_filter | $0.25 | $0.20 | project_name OR token_address | { score: 1-5, verdict, hype_tech_ratio } | < 2s | L1 cached |
| logic_check | $1.50 | $1.20 | project_name OR token_address | { claims, scores, logic_summary } | < 5s | L1+2 cached |
| custom_logic_check | $2.00 | $1.60 | document_url + project_name | { claims, scores, logic_summary } | 2–5 min | L1+2 live |
| full_report | $3.00 | $2.40 | document_url + project_name + focus_area? | { full_report, confidence_score, all_claims } | 3–8 min (live) / < 5s (cached) | L1+2+3 |
| daily_alpha_feed | $8.00 | $6.40 | date? (defaults to today) | { date, whitepapers: [{ project, score, verdict, summary, claims }...] } | < 2s | Cron summary |

## 5.4 The Custom Logic Flywheel

Custom Logic Check is not just a product — it's an inventory acquisition engine. When a customer submits a whitepaper URL we haven't seen, we get paid $1.60 net to verify it AND it enters our database permanently. Every future query on that whitepaper hits cached results at 86–98% margin. At the Volume scenario, 85% of new verifications are customer-funded, growing our database from 3,600/year (cron only) to 34,200/year.

## 5.5 Agent Card

- agent_name: "SCIGENT Whitepaper Verifier"
- agent_description: "Scientific and mathematical verification of cryptocurrency whitepapers. Free Greenlight List resource. Instant cached lookups from $0.25. On-demand verification for any whitepaper at $2.00. Full technical evaluation from $3.00. Daily aggregate feed at $8.00. Returns structured JSON."
- supported_chains: ["base"]
- capabilities: ["whitepaper_verification", "technical_audit", "scientific_analysis", "tokenomics_validation"]

---

# 6. Compute Cost Model

## 6.1 Fixed Daily Cost (Cron)

| Cron Step | Cost |
|-----------|------|
| Discovery scan + selection filter | ~$0.00 |
| PDF ingestion (10 WPs) | ~$0.00 |
| Layer 1 Structural Analysis (10 × $0.02) | $0.20 |
| Layer 2 Claim Extraction (10 × $0.12) | $1.20 |
| Layer 3 Claim Evaluation (10 × $0.30) | $3.00 |
| **Total daily cron** | **~$4.40** |
| **Monthly fixed** | **~$132** |

Break-even: 1 Alpha Feed/day ($6.40 net) or 22 Quick Filters/day.

Total monthly fixed overhead including Supabase + RPC: **~$160–$210.**

## 6.2 Per-Unit Margins

| Tier | List Price | Net Revenue | COC/V | Margin % |
|------|-----------|-------------|-------|----------|
| Quick Filter | $0.25 | $0.20 | $0.02 (cached) | 90% |
| Logic Check | $1.50 | $1.20 | $0.17 (cached L1+L2) | 86% |
| Custom Logic | $2.00 | $1.60 | $0.25 (live L1+L2) | 84% |
| Full Report (cached) | $3.00 | $2.40 | $0.04 | 98% |
| Full Report (live) | $3.00 | $2.40 | $0.57 | 76% |
| Alpha Feed | $8.00 | $6.40 | $0.00 marginal* | ~100% |

*Alpha Feed is a cron summary. Cron cost is fixed daily overhead. Each sale is a database read.

## 6.3 Revenue Projections (Census-Calibrated)

| Scenario | Customers | QF | LC | CLC | FR | AF | Daily Net | Monthly |
|----------|-----------|----|----|-----|----|----|-----------|---------|
| Launch | 15 | 30 | 8 | 4 | 2 | 1 | $28.40 | **$690** |
| Growth | 40 | 150 | 30 | 20 | 8 | 3 | $116.40 | **$3,210** |
| Scale | 65 | 500 | 80 | 50 | 20 | 8 | $319.20 | **$9,039** |
| Volume | 85+ | 2,000 | 300 | 200 | 60 | 25 | $1,264.00 | **$36,288** |

---

# 7. Implementation Phases

## 7.1 Phase A — Discovery Pipeline

**Duration:** 1–2 weeks. **Depends on:** autognostic Phase 4 test completion.

- **WS-A1:** Base chain event listener for Virtuals bonding curve contracts. Deterministic, no API dependency.
- **WS-A2:** ACP SDK integration. @virtuals-protocol/acp-node browseAgents() for metadata enrichment.
- **WS-A3:** Selection filter (scoring rubric, configurable threshold).
- **WS-A4:** ContentResolver extension for crypto whitepapers (direct URL + IPFS fallback).
- **WS-A5:** Database migration. wpv_whitepapers + indexes via Drizzle ORM.
- **WS-A6:** Cron job. Daily discovery at 06:00 UTC with retry logic.

**Exit:** Agent discovers and ingests 10+ whitepapers from Virtuals/Base daily.

## 7.2 Phase B — Verification Engine

**Duration:** 2–3 weeks. **Depends on:** Phase A.

- **WS-B1:** Layer 1 Structural Analysis (6 checks, deterministic).
- **WS-B2:** Layer 2 Claim Extraction (LLM prompt chain, structured output, test against 10–20 real WPs).
- **WS-B3:** Layer 3 Claim Evaluation (5 evaluation types + score aggregation).
- **WS-B4:** Report generation (JSON schemas per tier, consistent sub/superset structure).
- **WS-B5:** COC/V tracking (token usage + cost per verification in wpv_verifications).

**Exit:** Full pipeline verified on 10+ WPs. COC/V consistently under $0.60.

## 7.3 Phase C — ACP Integration

**Duration:** 1–2 weeks. **Depends on:** Phase B.

- **WS-C1:** ACP v2 SDK integration. AcpContractClientV2. Pin SDK version. Thin wrapper for isolation.
- **WS-C2:** Agent Card + 5 job offerings + 1 free Resource (Greenlight List).
- **WS-C3:** Job handlers per offering_id. Cached vs. live routing. Custom Logic ingestion path.
- **WS-C4:** USDC payment flow. 80/20 handled by protocol.
- **WS-C5:** Sandbox graduation (10 successful test transactions).
- **WS-C6:** Rate limiting for live verification tiers.

**Exit:** Agent graduated on Virtuals ACP. All tiers live. Payment confirmed E2E.

## 7.4 Phase D — Launch & Iterate

- Production Supabase deployment.
- **Week 3:** Tier 1 outreach: Ethy AI (84), Otto AI (122), Axelrod (552), Wolfpack (1888), WachAI Mesh (302), DeFi Sentinel (1102), LiquidAlpha (774), TreasuryGuard (812).
- **Week 4:** Tier 2 outreach: Ask Caesar (104), Gigabrain (153), VaultMaster (221), MarketMover (404), AlphaSeeker (885), ArbitrageAce (442), AssetArmor (813), StableScout (909).
- **Month 2:** Apply for AHF cluster Insights/Alpha Aggregator seat.
- **Month 3:** Twitter launch. Daily Greenlight summaries.
- **Month 4:** Pricing review based on actual COC/V and conversion data.
- **Month 6:** Token launch evaluation if revenue sustains >$3,000/month net.
- Ongoing: Verification accuracy tracking vs. token performance at 2-week, 1-month, 3-month intervals.

---

# 8. Risk Register

| Risk | Impact | Status | Mitigation |
|------|--------|--------|------------|
| R1: No Virtuals token launch API | HIGH | CONFIRMED | On-chain event monitoring (WS-A1) + ACP SDK browseAgents(). Two-source approach is more robust than single API. |
| R2: ACP SDK breaking changes | MEDIUM | MEDIUM | Pin versions. Thin wrapper. Monitor weekly release notes. |
| R3: Low whitepaper quality | MEDIUM | MEDIUM | Selection filter. If <5 daily targets, expand to multi-chain. |
| R4: LLM hallucination | HIGH | MEDIUM | Structured output + deterministic checks. Citation anchoring via Semantic Scholar. Default to INSUFFICIENT_DATA. |
| R5: 80/20 fee compression | LOW | CONFIRMED | Accounted for in all margins. 90% margin on QF at $0.25. 20% is cost of ACP distribution. |
| R6: Low initial demand | MEDIUM | MEDIUM | Free Greenlight List. $0.25 QF friction-free. Butler distribution 52,400 users. Named target list with outreach playbook. |
| R7: Agent token timing | LOW | LOW | Prove service first, token later. Retroactive linking supported. |
| R8: Compute costs | LOW | LOW | COC/V tracking. Model can shift to cheaper inference. Caching eliminates most LLM calls. |
| R9: Trust Score competition | MEDIUM | NEW | Butler discovery prioritizes Trust Score > aGDP > Price. Must achieve 95+ Trust Score through reliable delivery. Cached results enable near-100% success rate. |

---

# 9. Expansion Opportunities

- **AHF Cluster Seat:** Insights/Alpha Aggregator role is confirmed open. Apply after graduation.
- **Security & Risk Mesh:** Open application. WachAI can bundle our $2.00 CLC with their $8.00 audit.
- **Evaluator Agent Role:** Verify other agents' research deliverables.
- **Cross-Agent Subscriptions:** ACP v2 Notification Memos for re-verification alerts.
- **Historical Verification API:** Bulk queries on 500+ WP dataset after 3–6 months.
- **Verification-to-Performance Tracking:** Correlate verdicts with token outcomes. The correlation IS the alpha.

---

# 10. Kovsky Implementation Notes

**Repository:** src/wpv/ inside plugin-autognostic. Subdirs: discovery/, verification/, acp/, types.ts.

**ACP SDK:** @virtuals-protocol/acp-node. AcpContractClientV2. Pin version. Thin wrapper.

**Tests:** +80–120 tests. Unit per layer. Integration for full pipeline. Mock LLM + ACP SDK.

**Slash Commands:** /wpvscan, /wpvverify \<n\>, /wpvstatus, /wpvcost, /wpvgreenlight.

**SeshMem:** WPV fields: Phase, workstream, Daily 10 status, COC/V avg, ACP status, graduation progress (X/10 sandbox transactions).

**Error Handling:** Expect broken/image-only/passworded/non-English PDFs. Graceful degradation: Layer 1 score even when deeper analysis fails.

---

*End of Technical Architecture Document v1.2*