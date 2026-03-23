# WPV Agent — Complete Launch Plan

**Date:** 2026-03-15 (updated)
**Status:** E2E testing COMPLETE. Pre-launch tasks in progress. Next blocker: ACP registration.

---

# PART 1: Status Overview

## What's Built and Verified

| Component | Status | Evidence |
|-----------|--------|----------|
| plugin-wpv (verification pipeline) | ✅ COMPLETE | 195/195 tests, 17 files |
| plugin-autognostic (knowledge infra) | ✅ COMPLETE | 746/746 tests (grew from 551 during integration) |
| wpv-agent scaffold | ✅ COMPLETE | Project export, character.ts, 7 plugins loaded |
| wpv-agent build | ✅ PASS | dist/ current |
| Supabase schema | ✅ DEPLOYED | 3 tables + indexes via SQL Editor, pgvector enabled |
| .env credentials | ✅ POPULATED | All required vars verified live |
| Smoke tests | ✅ 7/8 PASS | ACP skipped (no credentials yet), COC/V $0.026/WP |
| Tier 2 integration | ✅ PASS | Agent starts, 7 plugins load, actions route, sessions work |
| Tier 3 E2E | ✅ PASS | WPV_STATUS, WPV_ALERTS, WPV_GREENLIGHT verified against live DB |
| GitHub repos | ✅ PUSHED | Both plugin-wpv and wpv-agent |

## Architecture Fixes Applied During Testing

| Fix | Impact |
|-----|--------|
| Project/ProjectAgent export pattern | ElizaOS 1.6.5 requires `Project` with `agents: [ProjectAgent]`, not raw `Character` |
| Ollama plugin added to load order | plugin-autognostic's embedding handler needs Ollama running |
| WpvService auto-init | Resolves DB from runtime automatically, no manual `setDeps()` |
| Action routing in system prompt | Added ACTION ROUTING section — forces LLM to select WPV actions over REPLY |
| validate() regexes broadened | All 6 actions now match natural language, not just slash commands |
| SUPABASE_SECRET_KEY adopted | Replaced legacy anon key pattern across both plugins + agent |
| Schema auto-migration | Plugin schema exports enable automatic table creation |

## Runtime Requirement Discovered

**Ollama must be running before agent starts.** Plugin-autognostic's `ollamaDirectEmbed` registers the TEXT_EMBEDDING handler. Without Ollama, the embedding handler crashes and the knowledge plugin fails to initialize. Start Ollama before running `elizaos dev`.

## What Remains

| Step | Owner | Blocked By | Status |
|------|-------|-----------|--------|
| Twitter/X account | Forces | Nothing | **TODO — do now** |
| Website placeholder | Forces | Domain purchase | **TODO — do now** |
| Public one-pager | Forces | Nothing | **TODO — do now** |
| Find Virtuals factory contract address | Kovsky | Research | TODO |
| Register on Virtuals Developer Dashboard | Forces | Nothing | TODO |
| Generate ACP API Key/Secret | Forces | Registration | BLOCKED |
| Connect wallet to ACP profile | Forces | Registration | BLOCKED |
| Update .env with ACP credentials | Kovsky | Registration | BLOCKED |
| Build buyer test agent | Kovsky | ACP credentials | BLOCKED |
| ACP smoke test (Smoke 7) | Kovsky | ACP credentials | BLOCKED |
| Sandbox graduation (10 transactions) | Both | Buyer agent + credentials | BLOCKED |
| Graduation Day (go live) | Both | Sandbox graduation | BLOCKED |
| Cluster applications | Forces | Endorsements | BLOCKED on graduation |
| Public website | Kovsky | Weeks 3–4 post-graduation | BLOCKED |
| Agent-level Vitest tests | Kovsky | Optional / ongoing | TODO |

---

# PART 2: Kovsky Execution (Technical)

This section is for Kovsky. Kovsky reads and executes these steps.

## 2.1 E2E Testing — ✅ COMPLETE

All steps from KOVSKY_BUILD_BRIEFING.md are done:
- Preflight: autognostic 746/746, wpv 195/195
- Tier 1: build, types, character — PASS
- Smoke: 7/8 PASS (ACP skipped), COC/V $0.026
- Tier 2: agent loads, actions route, sessions work — PASS
- Tier 3: WPV_STATUS, WPV_ALERTS, WPV_GREENLIGHT verified against live DB — PASS

## 2.2 Deploy Supabase Schema — ✅ COMPLETE

Schema deployed via Supabase Dashboard SQL Editor. Three tables created in `autognostic` schema:
- `wpv_whitepapers` — with indexes on project_name+chain, status, token_address
- `wpv_claims` — with FK to whitepapers, indexes on whitepaper_id, category
- `wpv_verifications` — with FK to whitepapers, indexes on whitepaper_id, verdict

SQL saved to `wpv-agent/schema.sql` for reproducibility.

## 2.3 Find Virtuals Factory Contract Address — TODO

Research the Virtuals Protocol bonding curve factory contract on Base. Needed for `VIRTUALS_FACTORY_CONTRACT` in .env and `BaseChainListener`. Check:
- Virtuals Protocol documentation
- Base block explorer (basescan.org)
- @virtuals-protocol/acp-node SDK source

## 2.4 Build Buyer Test Agent — BLOCKED on ACP credentials

Once Forces completes Virtuals registration and provides ACP credentials:
- Create `wpv-buyer-agent/` — minimal scaffold
- Single action: call WPV agent's offerings at $0.01 each
- 10 successful transactions required for graduation
- Throwaway agent — minimal code

## 2.5 ACP Smoke Test (Smoke 7) — BLOCKED on ACP credentials

Re-run `/workertest smoke` after ACP credentials are in .env. Smoke 7 (ACP SDK browseAgents) should now PASS instead of SKIP.

## 2.6 Sandbox Graduation — BLOCKED on buyer agent

1. Enter ACP sandbox
2. Daily cron active from Day 1 (database building)
3. 10 test transactions: buyer → WPV at $0.01 each
4. Submit graduation request
5. Virtuals manual review: 24–48 hours

## 2.7 Agent-Level Tests — TODO (non-blocking)

Write Vitest tests for agent config validation:
- Character exports valid Project
- Plugin load order matches dependencies
- All env vars referenced in character.ts exist in .env.example
- System prompt contains all action routing directives

## 2.8 Post-Graduation: Public Website (Weeks 3–4)

Next.js frontend on same Supabase backend:
- Greenlight List and Scam Alert Feed (free, no wallet)
- Wallet connection for paid verifications ($2.00 / $3.00)
- Search verified whitepapers
- Same USDC prices as ACP

---

# PART 3: Forces Execution (Non-Code)

These tasks are unblocked NOW. None depend on Kovsky or ACP registration.

## 3.1 Twitter/X Account — DO NOW

**Must be live BEFORE any ACP activity.**

**Account setup:**
- **Handle: @WhitepaperGrey**
- **Display name: Whitepaper Grey**
- **Bio: "Autonomous tokenomics auditor & whitepaper verifier. Mathematical proof validation and scam detection for DeFi protocols. Free Greenlight List daily."**
- **Link: whitepapergrey.com**
- Pinned thread: see below

**Pinned thread (5 tweets):**

Tweet 1: "What is WPV Agent and why does DeFi need whitepaper verification? A thread. 🧵"

Tweet 2: "Every week, dozens of new tokens launch on Base with whitepapers full of yield projections, consensus claims, and tokenomics models. Most are never verified. Some are outright fiction. WPV Agent changes that."

Tweet 3: "We run a 3-layer verification pipeline: L1 — Structural analysis (no AI, pure math) checks section completeness, citation density, and hype-to-tech ratio. L2 — Claim extraction identifies every testable claim. L3 — Each claim evaluated against published literature and on-chain reality."

Tweet 4: "Free resources, no payment required: 📋 Daily Greenlight List — projects that passed verification today. 🚨 Scam Alert Feed — flagged projects with red flags and high hype ratios. Available to every agent on Virtuals and every Butler user."

Tweet 5: "WPV is live on Virtuals ACP. Built on scientific infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases. Verification starts at $0.25. [link to website]"

**Post-graduation content cadence:**
- Daily: Greenlight List summary (top 3 verified projects)
- When relevant: Scam Alert highlights
- Weekly: "Top 3 Most Verified Projects This Week"
- Monthly: Verification accuracy report (once 30+ days of data)

## 3.2 Website Placeholder — DO NOW

Single landing page.

**Content:**
- Hero: "Whitepaper Verifier — Autonomous DeFi Due Diligence"
- What we do: 3-layer verification pipeline (one sentence each)
- Offerings: table of 5 tiers with prices
- Free resources: Greenlight List + Scam Alert Feed
- For agents: "Find us on Virtuals ACP" + link
- For humans: "Direct verification portal coming soon" + email capture
- Footer: Twitter link, SCIGENT mention

**Tech:** Static page on Vercel, Netlify, or GitHub Pages.

## 3.3 Public One-Pager — DO NOW

PDF or web page for outreach.

**Content:**
- WPV Agent — one paragraph description
- The problem: unverified whitepapers in DeFi
- The solution: 3-layer verification pipeline
- Offerings table (5 tiers + 2 free resources)
- Technology: Crossref, Semantic Scholar, Unpaywall, Claude Sonnet
- For agents: offering_ids and input formats
- Built by SCIGENT

## 3.4 Virtuals Registration — DO AFTER Twitter + Website

Go to the Virtuals Protocol developer portal:
1. Register as a Provider Agent
2. Input Agent Card (from AgentCardConfig.ts — name, description, capabilities)
3. Input Service Offerings (5 paid + 2 free resources)
4. Connect wallet (this wallet receives 80% USDC from every job)
5. Generate ACP API Key/Secret
6. Share credentials with Kovsky for .env: `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `ACP_AGENT_WALLET_ADDRESS`

---

# PART 4: Outreach Messages

All outreach fires on Graduation Day simultaneously. The blitz creates the impression of an established agent, not a newcomer.

## 4.0 Butler Pitch

> We've launched Whitepaper Verifier (WPV), the first autonomous verification layer on ACP. We address 8,800+ monthly unfulfilled queries in the Research category — specifically "is this project a scam", "verify tokenomics", "is the whitepaper math real", and "check this whitepaper." Our offerings start at $0.25 for instant legitimacy scans. We also provide a free Daily Greenlight List and Scam Alert Feed as Resources. Keywords: whitepaper verifier, tokenomics auditor, scam detection, mathematical proof, technical audit, scientific verification.

## 4.1 Tier 1 — Infrastructure Partners (8 agents)

### Ethy AI (ID: 84) — Yield Sustainability

> Hey Ethy — WPV Agent here, just graduated on ACP. We built an autonomous whitepaper verification pipeline that checks tokenomics math, yield sustainability claims, and hype-to-tech ratio for any project on Base.
>
> Your yield analysis could use our $0.25 Legitimacy Scan as a pre-filter — same price point as your existing swaps. We check whether the whitepaper's yield projections are even mathematically sustainable before you run your deeper analysis.
>
> We also offer a free Daily Greenlight List — projects that passed structural verification today. No job required to access it.
>
> Want to test it? Send us any project name or token address and we'll return a structural score in under 2 seconds.

### Otto AI (ID: 122) — Cross-Chain Technical Moats

> Otto — WPV Agent, new on ACP. We verify whitepaper claims against on-chain reality, specializing in consensus logic and protocol design.
>
> Before you recommend a cross-chain move, our $0.25 Legitimacy Scan can confirm whether the destination protocol's whitepaper actually supports the technical claims it makes. Section completeness, citation density, math notation — all checked in under 2 seconds.
>
> We're built on academic infrastructure (Crossref, Semantic Scholar, Unpaywall), so we can verify whether a protocol's cited papers actually exist and support their claims. Not many agents on ACP can do that.
>
> Free to browse our Scam Alert Feed — flagged projects with high hype-to-tech ratios.

### Axelrod (ID: 552) — AHF Verification Layer Seat

> Axelrod — WPV Agent here. We noticed the Autonomous Hedge Fund cluster (CL-001) has an open Verification Layer seat described as "cross-checking whitepaper claims vs. on-chain reality." That's literally our product description.
>
> We run a 3-layer verification pipeline: structural analysis, LLM-powered claim extraction, and five-method claim evaluation (math validation, benchmark comparison, citation verification, originality detection, internal consistency). Output is a structured JSON report with confidence score 1–100 and verdict.
>
> Our Full Technical Verification is $3.00 — below your cluster's $3.25 internal spend rate. We also provide a free Daily Greenlight List of verified projects, available as an ACP Resource with no job required.
>
> We'd like to apply for the Verification Layer seat. If you're open to an integration test, send us any project and we'll return a full report.

### Wolfpack (ID: 1888) — Scientific Credibility Sub-Score

> Wolfpack — WPV Agent, just launched on ACP. We generate a Scientific Credibility Score for any crypto project whitepaper: structural completeness, citation verification against real academic papers, math density, and a Hype vs. Tech ratio that flags marketing-heavy documents.
>
> At $0.25 per Legitimacy Scan, our credibility sub-score could plug directly into your risk ratings as an additional signal. We return structured JSON — easy to integrate as one factor in your scoring model.
>
> We also publish a free Scam Alert Feed with flagged projects. Accessible as an ACP Resource.

### WachAI Mesh (ID: 302) — Bundle Partner

> WachAI — WPV Agent here. We think there's a strong bundle opportunity between our services.
>
> You offer comprehensive audits at $8.00. We offer deep whitepaper verification (Verify Project Whitepaper) at $2.00. Together that's a $10 combined offering that covers both the document layer and the operational layer — you could offer the bundle at $12 and both of us profit more than we do solo.
>
> Our verification includes claim extraction, citation verification against Semantic Scholar, and a Hype vs. Tech ratio that flags unsustainable yield models. All output is structured JSON.
>
> We're also interested in the AI-Audit Mesh cluster (CL-005) Logic Auditor seat. If the bundle interests you, that's a natural path toward a cluster application.

### DeFi Sentinel (ID: 1102) — Treasury Protection

> DeFi Sentinel — WPV Agent, newly graduated on ACP. We provide autonomous whitepaper verification and scam detection for DeFi protocols.
>
> For treasury protection, our $0.25 Legitimacy Scan can run as a pre-check before every protocol deployment. Instant response, cached results, structural score and hype-to-tech ratio. Catches whitepaper-level red flags before your treasury is exposed.
>
> We also publish a free Scam Alert Feed — projects that failed verification with high hype ratios and structural deficiencies. Available as an ACP Resource, no job required.

### LiquidAlpha (ID: 774) — Volume Play

> LiquidAlpha — WPV Agent here. At your trading volume, our $0.25 per Legitimacy Scan is a rounding error for significant risk reduction. We check structural completeness, citation density, math notation, and hype-to-tech ratio — all in under 2 seconds from cache.
>
> For any token in our database (growing daily via automated discovery), you get instant structural intelligence. For new tokens, our $2.00 Verify Project Whitepaper runs a full analysis and adds it to the database permanently — every future lookup is free.
>
> Structured JSON output. Easy to integrate into your existing pipeline.

### TreasuryGuard (ID: 812) — Serious Allocation Candidates

> TreasuryGuard — WPV Agent, just launched. For serious allocation decisions, our $3.00 Full Technical Verification gives you a comprehensive report: structural analysis, claim extraction across tokenomics/performance/consensus/scientific categories, and evaluation of every claim against published literature and mathematical sanity.
>
> Output: confidence score (1–100), verdict (PASS/CONDITIONAL/FAIL), focus area scores by category, hype-to-tech ratio, and total claims verified. Structured JSON. Sub-5-second response on cached results, 3–8 minutes for new projects.
>
> We also offer a free Daily Greenlight List — browse today's verified projects without spending anything.

## 4.2 Tier 2 — Growth Partners (10 agents)

### Ask Caesar (ID: 104) — Complementary Analysis

> Ask Caesar — WPV Agent here. We noticed you offer technical analysis at $3.50. We can strengthen your product: our $1.50 Tokenomics Sustainability Audit extracts and categorizes every testable claim from a project's whitepaper — tokenomics models, yield projections, consensus logic — and scores them.
>
> You keep your $3.50 price and add depth to your analysis by incorporating our structured claim data as input. Your customers get better analysis, you get a data advantage over competitors, and the cost is less than half your existing price.

### Gigabrain (ID: 153) — Analytics Data Feed

> Gigabrain — WPV Agent, newly graduated. We produce structured claim data from crypto whitepapers: category-tagged claims with evidence, evaluation scores, and mathematical proof flags. $1.50 per Tokenomics Audit.
>
> This structured data could feed directly into your analytics pipeline. Every claim is tagged by category (TOKENOMICS, PERFORMANCE, CONSENSUS, SCIENTIFIC) with a 0–100 score. Built for machine consumption.

### VaultMaster (ID: 221) — Protocol Evaluation Stack

> VaultMaster — WPV Agent here. For protocol evaluation, we offer a two-step stack: $0.25 Legitimacy Scan for quick pre-screening, then $1.50 Tokenomics Audit for the projects that pass. Total $1.75 for a comprehensive whitepaper assessment before you commit to a vault strategy.

### MarketMover (ID: 404) — High-Volume Dead-Zone Pricing

> MarketMover — WPV Agent, just graduated. Our $0.25 Legitimacy Scan sits in the pricing dead zone ($0.25–$0.50) where 44% of the census operates but few services exist. Instant structural check, cached results, structured JSON. High-volume compatible.

### AlphaSeeker (ID: 885) — Price-Sensitive Pre-Filter

> AlphaSeeker — WPV Agent here. Our $0.25 Legitimacy Scan fits your price sensitivity — instant structural check on any project in our database. Hype-to-tech ratio, section completeness, citation density. Under 2 seconds. Good pre-filter before deeper research.

### ArbitrageAce (ID: 442) — Speed-Critical Validation

> ArbitrageAce — WPV Agent, newly launched. Quick validation before arb positions: $0.25, under 2 seconds, cached results. Structural score tells you if the underlying project has a real whitepaper or just marketing fluff. Cheap insurance.

### AssetArmor (ID: 813) — $3.00 Match

> AssetArmor — WPV Agent here. Our Full Technical Verification is $3.00 — matches your exact spend level. Full 3-layer pipeline: structural analysis, claim extraction, five-method claim evaluation. Confidence score 1–100, verdict, structured JSON report. Cached results in under 5 seconds.

### StableScout (ID: 909) — Yield Protocol Evaluation

> StableScout — WPV Agent, just graduated. For yield protocol evaluation, our $1.50 Tokenomics Sustainability Audit extracts every yield-related claim from a whitepaper and checks mathematical plausibility. Catches unsustainable emission schedules and inflated APY projections before they burn.

### SecureLogic (ID: 2104) — Near-Graduate Bundle

> SecureLogic — WPV Agent here. We see you're near graduation — congrats. When you're live, there's a natural bundle between us: we verify whitepaper logic, you verify smart contract logic. Together we cover the full stack from document claims to deployed code. Our $0.25 Legitimacy Scan + your contract audit = comprehensive due diligence at a competitive combined price. Let's connect when you graduate.

### TreasuryTactician (ID: 2188) — Near-Graduate Free Resources

> TreasuryTactician — WPV Agent here. Welcome to the ecosystem soon. When you graduate, check out our free Daily Greenlight List — verified projects updated daily, no job required. And our $0.25 Legitimacy Scans give you instant structural intelligence on any project in our growing database. Good foundation for treasury decisions.

## 4.3 Tier 3 — Market Push (30+ agents)

### Template A: DeFi / Treasury Agents

> [Agent Name] — WPV Agent, newly graduated on ACP. We provide autonomous whitepaper verification and scam detection starting at $0.25.
>
> Free resources available now: Daily Greenlight List (verified projects) and Scam Alert Feed (flagged high-risk projects). No job required.
>
> For deeper analysis: $1.50 Tokenomics Audit (claim extraction + scoring), $2.00 Verify Whitepaper (full L1+L2 on any URL), $3.00 Full Technical Verification (comprehensive report). All output is structured JSON.
>
> Check our profile on ACP or browse our free Resources.

### Template B: Trading / Arbitrage Agents

> [Agent Name] — WPV Agent here. Quick project legitimacy checks at $0.25, under 2 seconds from cache. Structural score, hype-to-tech ratio, section completeness. Cheap pre-filter for position sizing decisions. Free Scam Alert Feed available as an ACP Resource.

### Template C: Risk / Analysis Agents

> [Agent Name] — WPV Agent, just graduated. We specialize in whitepaper verification — the document layer of due diligence that most risk agents don't cover. Structural analysis, claim extraction, citation verification against real academic papers. Starting at $0.25. Free Greenlight List and Scam Alert Feed available now.

### Tier 3 Target List

| Agent | ID | Template |
|-------|-----|---------|
| VentureViking | 1301 | A (DeFi) |
| StrategySpider | 1313 | C (Risk) |
| StableStork | 1309 | A (Treasury) |
| FlowFalcon | 1303 | B (Trading) |
| DeFi Pulse | 1103 | A (DeFi) |
| VaultVision | 222 | A (Treasury) |
| BridgeBuddy | 123 | A (DeFi — mention cross-chain) |
| TreasuryTactics | 814 | A (Treasury) |
| AlphaAlpha | 554 | B (Trading) |
| YieldFalcon | 2241 | Near-graduate pattern |
| All sandbox DeFi/Treasury/Trading 51–150 | — | By category |

---

# PART 5: Launch Sequence

## Phase 1: Pre-Launch (NOW)

| Task | Owner | Status |
|------|-------|--------|
| E2E testing (smoke, tier2, tier3) | Kovsky | ✅ COMPLETE |
| Supabase schema deployed | Kovsky | ✅ COMPLETE |
| .env populated | Kovsky | ✅ COMPLETE (except ACP) |
| GitHub repos pushed | Kovsky | ✅ COMPLETE |
| Twitter/X account live | Forces | **TODO — do now** |
| Website placeholder live | Forces | **TODO — do now** |
| Public one-pager drafted | Forces | **TODO — do now** |
| Outreach messages drafted | Forces | ✅ PROVIDED IN PART 4 |
| Find Virtuals factory contract | Kovsky | TODO |

## Phase 2: Registration & Sandbox

| Task | Owner | Status |
|------|-------|--------|
| Register on Virtuals Developer Dashboard | Forces | TODO — do after Twitter + website |
| Generate ACP API Key/Secret | Forces | BLOCKED on registration |
| Connect wallet to ACP profile | Forces | BLOCKED on registration |
| Share ACP credentials with Kovsky | Forces | BLOCKED on registration |
| Update .env with ACP credentials | Kovsky | BLOCKED |
| Re-run Smoke 7 (ACP) | Kovsky | BLOCKED |
| Build buyer test agent | Kovsky | BLOCKED |
| Enter sandbox (cron starts building DB) | Both | BLOCKED |
| 10 test transactions | Kovsky | BLOCKED |
| Submit graduation request | Both | BLOCKED |
| Virtuals manual review | Virtuals | 24–48 hours |

## Phase 3: Graduation Day (Launch)

Everything fires simultaneously:

| Task | Owner |
|------|-------|
| Resources go live (Greenlight + Scam Alerts) | Automatic |
| Butler routing begins | Automatic |
| All 5 paid offerings accepting USDC | Automatic |
| Fire ALL Tier 1 outreach (8 messages) | Forces |
| Fire ALL Tier 2 outreach (10 messages) | Forces |
| Fire ALL Tier 3 outreach (30+ messages) | Forces |
| Butler pitch | Forces |
| Tweet launch announcement | Forces |
| Update website with "LIVE" + ACP link | Forces |
| Monitor first jobs, verify delivery + payment | Kovsky |

## Phase 4: Post-Launch (Weeks 1–4)

| Task | Owner | Trigger |
|------|-------|---------|
| Apply for AHF Verification Layer seat (CL-001) | Forces | Positive signal from Axelrod, Ethy, or Otto |
| Apply for AI-Audit Mesh Logic Auditor seat (CL-005) | Forces | Positive signal from WachAI |
| Daily Twitter content (Greenlight summaries) | Forces | Ongoing |
| Scam Alert highlights | Forces | When FAIL verdicts appear |
| Weekly "Top 3 Verified" post | Forces | Weekly |
| Public website launch (Next.js + Supabase) | Kovsky | Weeks 3–4 |
| Revenue review | Forces | Monthly |
| Token decision review | Forces | When revenue > $1,500/mo |
| Near-graduate monitoring | Forces | Ongoing |

---

# PART 6: Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |
| Full Potential | — | $57,000 |

**Break-even:** $157–$207/month fixed overhead. Covered by 1 Daily Briefing/day or ~30 Legitimacy Scans/day.

**Verified COC/V:** $0.026/WP on test text. Production estimate $0.29–$0.57/WP. Well within budget.

**Token decision:** Review monthly once revenue > $1,500/mo. Tokenize only if revenue > $15,000/mo sustained 90 days AND aGDP would rank Top 20. Otherwise WPV stays as pure USDC cash cow funding Agent 2.

---

# PART 7: Operational Notes

## Startup Checklist (Every Time Agent Runs)

1. Start Ollama (`ollama serve`) — MUST be running before agent
2. Verify .env has all required credentials
3. Build plugins: `cd plugin-autognostic && bun run build && cd ../plugin-wpv && bun run build`
4. Build agent: `cd wpv-agent && bun run build`
5. Start agent: `elizaos dev`
6. Verify log shows: all 7 plugins loaded, WpvService initialized, taxonomy seeded

## Plugin Load Order (Mandatory)

```
sql → ollama → anthropic → knowledge → autognostic → wpv → bootstrap
```

Changing this order will cause failures. Ollama must register the TEXT_EMBEDDING handler before knowledge plugin initializes. Autognostic must load before wpv.

## Test Baselines

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-wpv | 195 | 2026-03-14 |
| wpv-agent | 0 (pending) | — |

---

*End of Complete Launch Plan — Updated 2026-03-15*
