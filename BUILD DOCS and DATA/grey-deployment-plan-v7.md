# Whitepaper Grey: Multi-Platform Deployment Plan v7

## Overview

**Grey is live on the Virtuals ACP.** Graduation crossed, ACP connection official, website live, all four offerings registered at production prices, Grey discoverable as the top result for "whitepaper verification" on the ACP. Surface one is in production.

Surfaces two through nine are the rest of this plan.

ElizaOS Grey continues to run on the VPS, actively serving Virtuals ACP. That's a real revenue surface that needs to stay stable. **The "untouched ElizaOS" guarantee remains in force throughout Phase 2.** We don't modify a working production system to chase architectural neatness. New Grey gets built fresh alongside it.

v7 changes vs v6:

1. **Grey is live on Virtuals ACP.** Reflected throughout. Active outreach campaign now integrated into this plan rather than tracked separately.
2. **Step 0 pre-Phase-2 expansion.** Before Phase 2 begins and before outreach starts, 6 new offerings ship to the live ElizaOS Grey ACP-served pipeline (claim_extraction, claim_history, quick_protocol_facts, audit_posture_check, tokenomics_audit, claim_evaluation). This brings Virtuals from 4 to 10 offerings with full V/R/I coverage. After Step 0 lands, ElizaOS Grey is locked at the `phase2-baseline` tag for the rest of Phase 2.
3. **Unified branding/messaging across all platforms.** Consistent positioning of Grey's identity, offerings, and value across Virtuals, x402, Olas, and every subsequent surface.
4. **Expansion-first posture remains.** Virtuals is now an active earning surface, not a gate.
5. **Two distinct tier systems, clearly labeled.** **Expansion Tiers 1–5** group platforms by market shape (HTTP-native → agent economies → identity/B2B → newer → moonshot). **Outreach Tiers 1–4** group Round 1 outreach targets on the Virtuals ACP by reciprocal value. The two are independent.
6. **New wallet infrastructure with central treasury.** Multi-chain hot/warm/central hierarchy (Tier A hot, Tier B warm, Tier D central) with automated tax-burden split. Tier C intermediate cold storage is conditional per chain — used only where a native-asset reason exists. Phase 2 Base flow is strict A → B → D, all same-chain. Discord webhook monitoring active from Phase 2. Detailed in the **Grey Wallet Infrastructure** companion document.
7. **Compliance offering re-framed.** `compliance_report` → `compliance_research_input`. Research material rather than certification.
8. **V/R/I posture introduced.** Verification, Research, Intelligence — three buyer-shape concentrations.
9. **Offerings catalog clarified to 17 distinct offerings.** `daily_tech_brief` (aggregate cross-project) and `technical_briefing` (per-protocol delta) are separate offerings. V/R/I split is 7 / 5 / 5.

Internal handle for Grey is **"Verification Agent."** Public brand shape-shifts per platform within a consistent core.

See the Document set summary at the end of this plan for the full companion document set.

---

## Brand reference (canonical)

These are the canonical names, identifiers, and assets used across all platforms. Consistency matters more than cleverness — keep these stable.

| Element | Value |
|---|---|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| ACP Agent ID | `019d7a52-488d-7a5f-b379-0bbaa7762cde` |
| ACP Agent Page | `https://app.virtuals.io/acp/agents/019d7a52-488d-7a5f-b379-0bbaa7762cde` |
| ACP public wallet | `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f` |
| Twitter | `@WhitepaperGrey` |
| Website | `whitepapergrey.com` (LIVE) |
| Tagline | **Autonomous DeFi Due Diligence** |
| Internal handle | "Verification Agent" |

In all outreach: "Grey" as agent persona, "Whitepaper Grey" as product/company. Never "WPV Agent" externally.

---

## Grey's posture: one monolith, three buyer shapes

Grey is a single verification pipeline. The 17 offerings aren't 17 products — they're 17 access points into the same underlying capability, each priced and shaped for a different kind of buyer.

When framing Grey across surfaces, use these three areas of concentration as a posture, not as rigid product lines:

### Verification
**Who we serve:** agents and humans who need ground truth.
**Offerings:** `legitimacy_scan`, `whitepaper_verification`, `technical_verification`, `claim_evaluation`, `audit_posture_check`, `tokenomics_audit`, `compliance_research_input`
**Buyer mindset:** I need to know if what this project says is true.

### Research
**Who we serve:** agents running their own pipelines that need Grey's outputs as components.
**Offerings:** `claim_extraction`, `claim_history`, `comparative_analysis`, `mass_screen`, `quick_protocol_facts`
**Buyer mindset:** I'm doing my own work. Give me raw material I can use.

### Intelligence
**Who we serve:** agents making consequential decisions.
**Offerings:** `daily_tech_brief`, `technical_briefing`, `prediction_market_research`, `resolution_evidence_compiler`, `allocation_risk_report`
**Buyer mindset:** I'm about to do something. Help me decide.

### How to use this posture

The API stays granular — 17 endpoints, independently priced and discoverable. The three concentrations are how we *talk about* Grey, not how we partition the codebase. Per-platform marketing leans on the concentration that fits each platform's dominant buyer profile.

---

## Why expansion-first remains the strategy, even with Virtuals live

Going live on Virtuals is a milestone, not a destination:

- **Virtuals' buyer traffic is unproven** at any meaningful scale for Grey yet. Building a business on one platform's discoverability is fragile, especially given Virtuals' own graduation process was deprecated shortly after Grey graduated through it.
- **Multi-portal presence is the agent-economy default.** A proper leading agent ships across every surface where its capabilities have buyers.
- **Reputation compounds across surfaces.** ERC-8004 DID is one identity. Activity on x402, Olas, B2B partners all attach to the same Grey.
- **Multi-surface earnings make Grey resilient.** Insulation against the next platform deprecation event.

---

## Grey's offerings catalog

Grey serves **17 offerings** across the three concentrations. The original 4 ACP-registered offerings are live; **Step 0 of the work breakdown adds 6 more reshapings to Virtuals before outreach begins**, bringing Virtuals to **10 live offerings with full V/R/I coverage**. The remaining 7 are grey-core-only (genuinely new pipeline work, shipped via Phase 2 and grey-core's HTTP service to non-Virtuals platforms).

### Live on Virtuals ACP after Step 0 (10)

The original 4 offerings plus the 6 Step-0 reshapings. Names match the ACP service registry.

**Already live (original 4):**

| Offering | Price | What it does |
|---|---|---|
| `legitimacy_scan` | $0.25 | Structural score, claim count, MiCA status, verdict by token address or project name |
| `verify_whitepaper` | $1.50 | Full L1/L2 analysis of a provided whitepaper URL with claim extraction |
| `verify_full_tech` | $3.00 | Deep L1+L2+L3 with per-claim evaluation, mathematical validity, synthesis report |
| `daily_tech_brief` | $8.00 | Aggregated briefing of all verified whitepapers for a given date |

**Step 0 additions (6, ship before outreach):**

| Offering | Price | Concentration | What it does |
|---|---|---|---|
| `claim_evaluation` | $0.10 | Verification | Atomic single-claim verification — L3 only |
| `claim_history` | $0.10 | Research | Grey's accumulated knowledge on a project from cache |
| `quick_protocol_facts` | $0.30 | Research | Concise facts for conversational interfaces |
| `claim_extraction` | $0.50 | Research | Pipeline early-exit after L2 — claims without evaluation |
| `audit_posture_check` | $0.75 | Verification | Audit history, scope, freshness extracted from L3 |
| `tokenomics_audit` | $1.75 | Verification | Tokenomic analysis extracted from L3 |

All return structured JSON. SLA per offering as registered on ACP.

### Held back for grey-core only (7)

These require genuinely new pipeline capabilities, multi-step orchestration, or careful new positioning. Shipped via Phase 2 grey-core HTTP service to x402, Olas, Nevermined, etc. — **not** added to Virtuals during Step 0.

| Offering | Concentration | Why held back |
|---|---|---|
| `whitepaper_verification` | Verification | grey-core name for `verify_whitepaper` (already live on Virtuals under its ACP name) |
| `technical_verification` | Verification | grey-core name for `verify_full_tech` (already live on Virtuals under its ACP name) |
| `compliance_research_input` | Verification | New positioning to develop carefully — research input, not certification |
| `comparative_analysis` | Research | New multi-project synthesis pass |
| `mass_screen` | Research | Batch queuing + rate-limit handling |
| `technical_briefing` | Intelligence | Per-protocol delta — new cache-comparison infrastructure |
| `prediction_market_research` | Intelligence | New input/output shape for prediction-market buyers |
| `resolution_evidence_compiler` | Intelligence | New post-hoc evidence assembly |
| `allocation_risk_report` | Intelligence | New output shape for allocator agents |

(The first two — `whitepaper_verification` and `technical_verification` — are name-only differences from offerings already live on Virtuals. They count as grey-core offerings for the x402 Bazaar registration but route to the same pipeline capability.)

### V/R/I breakdown across all 17

- **Verification (7):** `legitimacy_scan`, `verify_whitepaper`/`whitepaper_verification`, `verify_full_tech`/`technical_verification`, `claim_evaluation`, `audit_posture_check`, `tokenomics_audit`, `compliance_research_input`
- **Research (5):** `claim_extraction`, `claim_history`, `quick_protocol_facts`, `comparative_analysis`, `mass_screen`
- **Intelligence (5):** `daily_tech_brief`, `technical_briefing`, `prediction_market_research`, `resolution_evidence_compiler`, `allocation_risk_report`

After Step 0, Virtuals covers 6V + 3R + 1I = 10 of the 17. grey-core covers all 17 once Phase 2 ships.

### Naming alignment

Two of the Virtuals offerings have direct grey-core equivalents under different names:

- Virtuals `verify_whitepaper` ↔ grey-core `whitepaper_verification` (same capability, different verb form)
- Virtuals `verify_full_tech` ↔ grey-core `technical_verification` (same capability, different verb form)

Same underlying pipeline. The adapter mapping is mechanical — Kovsky handles in `grey-core`.

**`daily_tech_brief` and `technical_briefing` are NOT the same offering.** They are distinct, both worth keeping, and grey-core exposes both:

- `daily_tech_brief` ($8.00 on Virtuals): aggregated briefing across all verified projects for a given date. Single document covering many. Buyer: subscriber wanting market overview.
- `technical_briefing` ($0.10 on x402): per-protocol delta since last analysis. Per-project document. Buyer: position-monitoring agent or pipeline tracking specific protocols.

When we eventually consider Phase 3 (ACP routing through grey-core), we'll decide whether to keep the ACP-side names or align everything. Until then, both name sets coexist and refer to specific capabilities.

---

## Differentiators (consistent across all platforms)

These are Grey's unique-position points. Lean on them in every platform's marketing copy.

1. **MiCA compliance check.** No other agent on Virtuals does this. Likely no other agent anywhere does it systematically. EU regulation is delisting non-compliant tokens; Grey flags MiCA gaps automatically.
2. **Academic infrastructure.** Crossref, Semantic Scholar, Unpaywall — Grey's evidence base reaches into peer-reviewed literature, not just web scraping.
3. **Tiered document discovery.** Cache → URL → docs site → GitHub → CoinGecko/CMC. Grey finds what other agents miss.
4. **Structured JSON output.** Pipeline-ready. Built for agent consumption.
5. **Verified track record.** Uniswap V2/V3, Aave V1/V3, Chainlink V1/V2, Aerodrome, Lido, Virtuals Protocol. All verdicts honest.

---

## Per-platform pricing tables

### Virtuals ACP (10 offerings post-Step-0, ElizaOS-served)

Original 4 prices unchanged. Step 0 adds 6 reshapings at the prices below. All prices are registered on the ACP.

| Offering | Price | Status |
|---|---|---|
| `legitimacy_scan` | $0.25 | Live (original) |
| `claim_evaluation` | $0.10 | Step 0 |
| `claim_history` | $0.10 | Step 0 |
| `quick_protocol_facts` | $0.30 | Step 0 |
| `claim_extraction` | $0.50 | Step 0 |
| `audit_posture_check` | $0.75 | Step 0 |
| `verify_whitepaper` | $1.50 | Live (original) |
| `tokenomics_audit` | $1.75 | Step 0 |
| `verify_full_tech` | $3.00 | Live (original) |
| `daily_tech_brief` | $8.00 | Live (original) |

Step 0 prices are starting points — adjust based on early ACP traffic patterns.

### x402 Bazaar (Base, USDC, CDP Facilitator fee-free)

All 17 offerings. Higher than Virtuals on overlapping offerings because x402 Bazaar's volume model + fee-free settlement supports better margins.

**Verification**

| Offering | Price |
|---|---|
| `legitimacy_scan` | $0.50 |
| `whitepaper_verification` | $2.00 |
| `technical_verification` | $5.00 |
| `claim_evaluation` | $0.05 |
| `audit_posture_check` | $0.50 |
| `tokenomics_audit` | $1.50 |
| `compliance_research_input` | $10.00 |

**Research**

| Offering | Price |
|---|---|
| `claim_extraction` | $0.25 |
| `claim_history` | $0.02 |
| `comparative_analysis` | $3.00 |
| `mass_screen` | $0.05/item |
| `quick_protocol_facts` | $0.20 |

**Intelligence**

| Offering | Price |
|---|---|
| `daily_tech_brief` | $8.00 |
| `technical_briefing` | $0.10 |
| `prediction_market_research` | $0.15 |
| `resolution_evidence_compiler` | $0.30 |
| `allocation_risk_report` | $2.50 |

`daily_tech_brief` is priced at parity with Virtuals because the offering is identical (aggregate cross-project briefing for a date). `technical_briefing` is the cheaper per-protocol delta.

### Olas Mech Marketplace (Gnosis, xDAI/USDC/OLAS, x402 also supported)

Lower than x402 — trader volume model. Intelligence is the volume play.

**Verification** — $0.40 / $1.50 / $4.00 / $0.04 / $0.40 / $1.20 (no compliance offering here)

**Research** — $0.20 / $0.02 / $2.50 / $0.04/item (no quick facts)

**Intelligence** — $7.00 (daily_tech_brief) / $0.08 (technical_briefing) / **$0.10 (prediction_market_research — volume play)** / **$0.25 (resolution_evidence_compiler)** / $2.00 (allocation_risk_report)

### Nevermined (credit subscriptions)

| Plan | Price | Credits |
|---|---|---|
| Starter | $50/mo | 100 |
| Pro | $200/mo | 500 |
| Business | $750/mo | 2,500 |
| Enterprise | Custom | Custom |

Credit costs per offering: 1 credit (cheapest atomic), up to 100 credits (compliance_research_input). Overage $0.50/credit.

### Skyfire (enterprise framing, 2–3% platform fee)

Higher than x402 to absorb platform fee. Verification leads.

Premium: `compliance_research_input` $15.00 / `technical_verification` $6.00 / `allocation_risk_report` $3.50.

### Agentverse / ASI:One

Research leads. `quick_protocol_facts` $0.20 (primary). Other offerings via x402 fallback.

### Direct B2B (negotiated)

Intelligence leads. `allocation_risk_report` headline.
- Model A — Per-protocol monitoring: $500–$2,000/month
- Model B — Allocator flat-rate: $5,000–$25,000/month (anchor: $7,500)
- Model C — Per-allocation: 0.05–0.1% (aspirational)

### Kite AI

Mirror x402 initially.

### Bittensor

Emissions-based; no buyer pricing.

---

## Virtuals ACP outreach (active campaign)

Grey is live on Virtuals. The outreach campaign is the active engagement channel — Virtuals ACP has no in-platform messaging, so Grey's outreach happens as a buyer of other agents' services. Every job creates three persistence layers (on-chain Account, LLM context injection into the target agent, post-completion Notification Memo).

This campaign runs in parallel with Phase 2 (which builds grey-core for other platforms). Two efforts, two tracks.

### Outreach mechanism

For each target agent on the ACP:

1. **ACP job:** Grey sends a legitimate buyer job to the target — a real service request that produces useful data for Grey's pipeline. The requirement text embeds Grey's identity and capability mention naturally.
2. **Twitter post:** Forces composes a paired tweet that @mentions the target's Twitter, frames the interaction publicly, and surfaces Grey's offerings.
3. **Notification Memo:** After delivery, Grey sends a follow-up memo summarizing the interaction and surfacing offerings again.

Two touchpoints per target: on-chain Account (agent-facing) + public tweet (operator + community-facing).

### Requirement text template

Every job uses this structure:

**Identity block (constant):**
> I'm Whitepaper Grey (Agent ID: 019d7a52-488d-7a5f-b379-0bbaa7762cde), an autonomous whitepaper verification agent on ACP.

**Service request:** specific, genuine, tailored to the target's offering.

**Capability mention (constant pattern):**
> My offerings on ACP — legitimacy_scan ($0.25), claim_evaluation ($0.10), claim_history ($0.10), quick_protocol_facts ($0.30), claim_extraction ($0.50), audit_posture_check ($0.75), verify_whitepaper ($1.50), tokenomics_audit ($1.75), verify_full_tech ($3.00), daily_tech_brief ($8.00) — are available if you ever need whitepaper verification, claim extraction, audit posture, tokenomics analysis, or due diligence inputs in your pipeline.

### Round 1 targets

**Note on naming:** the deployment plan uses two parallel tier systems. **Expansion Tiers 1–5** group platforms by market shape (HTTP-native → agent economies → identity/B2B → newer platforms → moonshot). **Outreach Tiers 1–4** group Round 1 outreach targets on the Virtuals ACP by reciprocal value. The two systems are independent — running Outreach Tier 4 work does not relate to Expansion Tier 4 platforms.

**Outreach Tier 1 — Strategic partners** (4 agents, services Grey genuinely needs):
- **Nansen Agent** — on-chain analytics (cross-reference TVL/user claims)
- **LiviAlpha** — market intelligence (sentiment context for hype-to-tech ratio)
- **OctodamusAI** — prediction / risk intelligence (risk signal to pair with verdicts)
- **Ethy AI** — swap/trade execution (benchmark fee claims)

**Outreach Tier 2 — High-visibility agents** (top revenue/job agents for visibility):
- **BridgeKitty** (highest revenue, 573 jobs — maximum visibility)
- **BitsAndBytesBack** (57 jobs, 9 buyers — broad buyer base)

**Outreach Tier 3 — Complementary capability agents** (adjacent niches, natural cross-sell):
- Smart contract auditors (whitepaper + code = full-stack due diligence)
- Content/writing agents (turn Grey's reports into threads)
- News/monitoring agents (enrich daily briefings)
- Research/analysis agents (cross-reference findings with market analysis)

**Outreach Tier 4 — Emerging agents** (10–15 low-job-count agents, first-mover in their Accounts). Pacing flexible — execute as bandwidth allows.

### Round 1 budget

| Outreach Tier | Targets | Cost each | Total |
|---|---|---|---|
| Tier 1 — Strategic | 4 | $0.25–5 | $5–15 |
| Tier 2 — High-visibility | 2 | $0.25–2 | $1–4 |
| Tier 3 — Complementary | 4 | $0.25–5 | $2–15 |
| Tier 4 — Emerging | 10–15 | $0.25–1 | $3–15 |
| **Round 1 Total** | **20–25** | — | **$11–49** |

### Pre-execution

Before running jobs, Kov maps live agents via `acp browse` from `C:\Users\kidco\dev\acp-cli-buyer`:

```
npm run acp -- browse "on-chain analytics" --chain-ids 8453
npm run acp -- browse "market data" --chain-ids 8453
npm run acp -- browse "social sentiment" --chain-ids 8453
npm run acp -- browse "smart contract audit" --chain-ids 8453
npm run acp -- browse "research analysis" --chain-ids 8453
npm run acp -- browse "news monitoring" --chain-ids 8453
npm run acp -- browse "content creation" --chain-ids 8453
npm run acp -- browse "trading" --chain-ids 8453
npm run acp -- browse "DeFi" --chain-ids 8453
npm run acp -- browse "risk" --chain-ids 8453
```

Forces approves the target list before Kov executes.

### Execution sequence

| Step | Owner | When |
|---|---|---|
| Step 0 — ElizaOS expansion ships 6 new offerings to ACP | Kov + Forces | Pre-outreach (per work breakdown Step 0) |
| Kov runs `acp browse`, maps targets | Kov | Day 0 (after Step 0 complete) |
| Forces reviews + approves | Forces | Day 0 |
| Kov executes Outreach Tier 1 (4 jobs) | Kov | Day 1 |
| Forces fires launch thread + Outreach Tier 1 tweets | Forces | Day 1 |
| Kov sends Notification Memos | Kov | Day 1–2 |
| Wait 24h — check reciprocals | Both | Day 2 |
| Kov executes Outreach Tier 2–3 (6 jobs) | Kov | Day 3 |
| Forces fires Outreach Tier 2–3 tweets | Forces | Day 3 |
| Kov executes Outreach Tier 4 (10–15 jobs, pacing flexible) | Kov | Day 4+ |
| Forces fires Outreach Tier 4 tweets + ongoing content | Forces | Day 4+ |
| Monitor incoming jobs + Accounts | Both | Day 1–14 |
| Assess Round 1, plan Round 2 | Both | Day 14–21 |

### Twitter content

**Launch thread (fires with Round 1):**
1. "Whitepaper Grey is live on @VirtualProtocol ACP. We verify the math behind the marketing. A thread."
2. "Every week, dozens of new tokens launch on Base with whitepapers full of yield projections, consensus claims, and tokenomics models. Most are never verified. Some are outright fiction. Grey changes that."
3. "3-layer verification pipeline: L1 structural (math, citation density, hype-to-tech ratio, MiCA check). L2 claim extraction. L3 per-claim evaluation against literature and stated evidence."
4. "Four offerings, structured JSON: $0.25 legitimacy scan. $1.50 whitepaper verification. $3.00 full technical verification. $8.00 daily briefing. MiCA included in every verification."
5. "Grey is live on Virtuals ACP. Built on scientific infrastructure — Crossref, Semantic Scholar, Unpaywall. Find us: acp browse 'whitepaper verification'. whitepapergrey.com"

**Per-target tweets:** For every on-chain target, Forces composes a tweet that @mentions the target's Twitter, describes what Grey bought and why, frames it as a public pipeline integration story, naturally surfaces offerings.

**Ongoing content:**
- "Grey literature: documents produced outside traditional academic publishing. Whitepapers are grey literature by definition. We specialize in exactly the document category our name describes."
- "Hype-to-tech ratio is the single most predictive field in our analysis. When a whitepaper spends more words on vision than mechanism, Grey catches it."
- "EU MiCA regulation requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Grey checks every whitepaper automatically. No other agent on Virtuals does this."
- "Verified today: [project]. Structural score: [X]/5. [N] claims extracted, [M] verified. Verdict: [VERDICT]. MiCA: [status]. Available via ACP."

### What success looks like — Virtuals only

This section is scoped to Virtuals ACP. Each new platform (x402, Olas, Nevermined, Skyfire, Kite, B2B, Bittensor) adds its own earnings on top of these numbers.

- **Week 1:** 20+ on-chain Accounts established. Launch thread + per-target tweets create visibility.
- **Week 2–4:** First organic inbound jobs from Accounts, browse results, or operator curiosity.
- **Month 2:** Repeat buyers. Pipeline integration as recurring pre-filter.
- **Month 3:** Job count + buyer count on ACP dashboard create flywheel visibility.

### Revenue targets — Virtuals only

These are Virtuals ACP earnings projections. Each subsequent platform stacks additional revenue on top — the Tier 1 x402 Bazaar rollout, Tier 2 Olas + Agentverse, Tier 3 Skyfire + direct B2B all have their own (currently uncalibrated) revenue trajectories.

| Scenario | Timeline | Monthly net (Virtuals only) |
|---|---|---|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |
| Full potential | — | $57,000 |

Break-even: ~$200/month on Virtuals. Covered by 1 daily briefing/day or ~30 legitimacy scans/day.

### Follow-up protocol

After each completed job, Grey sends a Notification Memo:

> Thanks for the [deliverable]. I've incorporated your data into my verification pipeline. If you ever need whitepaper verification, find me via acp browse "whitepaper verification" — legitimacy_scan $0.25, verify_full_tech $3.00. Grey out.

### Round 2 — expansion after Round 1

After Round 1 completes (2–4 weeks), expand based on what converted.

**Include:** Round 1 agents that delivered useful data (repeat buyers), agents that sent Grey inbound jobs (reciprocal), categories not covered in Round 1 (governance, social, education), operators who engaged with Twitter content, agents that appeared after Round 1.

**Exclude:** Agents that rejected Round 1 jobs, agents inactive for 30+ days, agents whose offerings don't produce data Grey can use.

Budget: determined by Round 1 ROI. Scale what converted.

### Deprecated — DO NOT USE

- ~~Butler~~ — deprecated by Virtuals
- ~~Graduation framing~~ — process deprecated; Grey live without it
- ~~Free Resources (Greenlight List, Scam Alert Feed)~~ — bypass endpoints closed
- ~~tokenomics_sustainability_audit~~ — 5th ACP offering cut
- ~~"WPV Agent"~~ — internal only
- ~~Website "coming soon" framing~~ — site live

---

## Strategic context

### Why ElizaOS Grey stays untouched

ElizaOS Grey is no longer hypothetical infrastructure — it's the live ACP-serving production system. The R2/R4 fixes are in that codebase. The 88-entry Supabase cache is what got Grey across the line. The ACP websocket lifecycle is running in production against real buyers.

The guarantee remains: **we change nothing.** ElizaOS Grey on the VPS is byte-identical throughout Phase 2.

### Phase 3 trigger conditions (updated for live ACP)

Phase 3 is now a real choice between **migration** (retire ElizaOS, route ACP through grey-core) and **coexistence** (keep both running).

Gating to *consider* Phase 3:
- New Grey operational on at least one non-Virtuals platform with real paid traffic
- 250+ cumulative real paid requests through New Grey
- Meaningful earnings on New Grey (Forces threshold; suggested $500 USDC pooled)
- Per-call margin positive
- Operational confidence in grey-core

Bar to *execute* migration (vs. coexistence): a positive reason that justifies touching the live ACP-serving system — new Virtuals feature awkward via ElizaOS layer, ElizaOS breaking change demanding maintenance, VPS resource pressure, unified telemetry value.

Without a positive reason, coexistence is the default.

### Wallet sovereignty and central treasury

Grey's ACP wallet hierarchy on Virtuals stays as-is — actively earning, untouched. New Grey gets its own wallet hierarchy across every chain we earn on, separate from Virtuals.

Both can converge at the **Tier D central treasury** if Forces chooses, with an automated split into operating + tax reserve.

See **Grey Wallet Infrastructure (v3)** for the full schema.

---

## Phase 2: Build `grey-core` in parallel (ElizaOS untouched, ACP-live)

**For execution: Phase 2 Work Breakdown for Kovsky (v3).**
**For verification: Phase 2 Deployment Checklist (v3).**
**For wallets: Grey Wallet Infrastructure (v3).**

### High-level shape

Three services on the VPS:
- **ElizaOS Grey** (existing, live on ACP, untouched)
- **grey-core** (new, port 3001 or similar)
- **grey-sweeper** (new, dedicated systemd unit, signs Tier A → Tier B sweeps)

New Grey monorepo structure:
- `packages/grey-pipeline` — fresh pipeline copy
- `packages/grey-schemas` — JSON Schema for 17 offerings
- `packages/grey-core` — Express HTTP service
- `packages/grey-sweeper` — wallet sweeper
- `adapters/x402-middleware` — first revenue surface

Database namespace: `grey_two` schema.

### Phase 2 work items (overview)

0. **Pre-Phase-2 expansion pass:** Add 6 new offerings to live ElizaOS Grey (claim_extraction, claim_history, audit_posture_check, tokenomics_audit, quick_protocol_facts, claim_evaluation). Tag `phase2-baseline` only after this completes and is smoke-tested. Outreach Round 1 starts only after Step 0 lands.
1. Set up New Grey monorepo
2. Extract pipeline to `grey-pipeline`
3. Lock `grey-schemas` for 17 offerings
4. Build `grey-core` HTTP service
5. Mint Grey's ERC-8004 identity (Celo)
6. Set up wallet infrastructure (Base + central treasury)
7. Build x402 middleware adapter
8. Deploy grey-core + grey-sweeper to VPS, ship to x402 Bazaar
9. Independent parity check

---

## Phase 3: Migration OR coexistence (now a real choice)

When gating met, decision tree:

1. **Coexistence (default):** ElizaOS Grey serves Virtuals indefinitely. grey-core serves everything else.
2. **Migration (positive reason required):** Build ACP listener in grey-core, sandbox test, parallel run, cutover, retire ElizaOS.

Phase 3 will have its own work breakdown and checklist when triggered.

---

## Brand matrix

Per-platform framing leans on the concentration that fits each platform's dominant buyer profile.

| Platform | Public framing | Concentration emphasis |
|---|---|---|
| Virtuals ACP (live, 10 offerings post-Step-0) | "Whitepaper Grey — autonomous DeFi due diligence on Virtuals ACP" | All three (V/R/I) |
| x402 Bazaar | "Grey Verification Endpoints" | All three |
| Nevermined | "Grey — Pay-per-Request Analyst" | All three |
| Olas Mech | "whitepaper_verifier — Mech tool" | Intelligence |
| Agentverse / ASI:One | "Grey — Crypto Whitepaper Analyst" | Research |
| Skyfire | "Grey — Verified Whitepaper Verification Service" | Verification |
| Direct B2B | "Grey — Risk Intelligence Feed for Allocator Agents" | Intelligence |
| Kite AI | "Grey — Passported Verification Agent" | All three |
| Bittensor | "Grey miner output / Protocol Due Diligence Subnet" | All three |

ERC-8004 DID shared across all surfaces. Reputation accrued on one surface attaches to the same Grey identity everywhere.

---

## Tier 1 — HTTP-native (also proving ground)

### 1. x402 Bazaar / Agentic.Market

**Market data:** 161.32M txns by early 2026, $600M annualized volume, 417K buyers, 83K sellers.

**Fee structure:** CDP Facilitator fee-free for USDC on Base.

**Integration:** All 17 offerings exposed across Verification, Research, Intelligence.

**Wallets:** `BASE_X402_PAY_TO` (Tier A) → automated sweep → `BASE_POOL_WALLET` (Tier B) → manual same-chain transfer → `GREY_TREASURY_RECEIVE` (Tier D) → manual split. No bridge needed on Base (Tier B and Tier D both live on Base). Bridges only apply when Tier 2+ chains come online.

**Code:** `adapters/x402-middleware/`.

### 2. Nevermined

**Market data:** Powers Olas Mech billing.

**Integration:** `@nevermined-io/payments` SDK. Register Grey as agent with shared DID. Single integration → multi-rail payable.

**Code:** `adapters/nevermined-wrapper/`.

---

## Tier 2 — Dedicated agent economies

### 3. Olas Mech Marketplace

**Integration:** Python Mech Tool wrapping `grey-core` HTTP. Intelligence concentration leads — `prediction_market_research` priced at $0.10 (volume play).

**Wallets:** `GNOSIS_MECH_PAY_TO` (Tier A) → `GNOSIS_POOL_WALLET` (Tier B) → bridge to Tier D.

**Code:** `adapters/olas-mech-tool/`.

### 4. Fetch.ai Agentverse / ASI:One

**Integration:** Python `uagents`. External Agent on VPS with mailbox. Research concentration leads.

**Code:** `adapters/agentverse-uagent/`.

---

## Tier 3 — Identity layer + strategic B2B

### 5. Skyfire

**Integration:** KYA identity registration. MCP server. Verification concentration leads — `compliance_research_input` for enterprise framing.

**Code:** `adapters/skyfire-bridge/`.

### 6. Direct B2B

**Targets:** Giza ARMA ($3.96B agentic volume), Theoriq AlphaVault, Olas Optimus/Modius.

**Concentration:** Intelligence leads — `allocation_risk_report` headline offering.

**Pricing:** Models A/B/C as detailed in pricing tables. Anchor: $7,500/month flat.

---

## Tier 4 — Newer platforms

### 7. Kite AI

**Integration:** Agent Passport via Kite DevRel. Kite Chain settlement (EVM, reuses x402 plumbing).

**Code:** `adapters/kite-passport/`.

### 8. SingularityNET

**Code:** `adapters/snet-daemon/`. Low priority.

---

## Tier 5 — Strategic moonshot

### 9. Bittensor

**Paths:** A — miner in existing subnet. B — propose Protocol Due Diligence subnet.

**Wallets:** Bittensor's own coldkey/hotkey system. Separate from EVM tiers; held by Forces with same custody discipline.

**Code:** `adapters/bittensor-miner/`.

---

## Execution sequence

### Architecture track

- **Now:** ElizaOS Grey runs on VPS, **live and serving Virtuals ACP**. Phase 2 starts immediately for everything else.
- **Phase 2:** New Grey built in parallel. ElizaOS untouched.
- **Phase 2 close:** New Grey deployed on x402 Bazaar with real paid traffic. Earnings accumulate in Tier A/B/D wallets.
- **Phase 3 trigger:** Functionality + earnings met. Coexistence by default; migration with positive reason.

### Expansion track

- **Block 1 (Tier 1):** x402 Bazaar (Phase 2 validation) → Nevermined
- **Block 2 (Tier 2):** Olas Mech (Intelligence-led) → Agentverse (Research-led)
- **Block 3 (Tier 3):** Skyfire (Verification-led) + direct B2B BD (Intelligence-led)
- **Block 4 (Tier 4):** Kite when Passport granted; SingularityNET as follow-on
- **Block 5 (Tier 5):** Bittensor Path A; Path B reserved

### Virtuals outreach track (parallel to all above)

- **Round 1:** Starts after Step 0 lands all 6 new offerings on the live ACP. 20–25 agents across 4 Outreach Tiers. Tiers 1–3 execute on Days 1–3; Tier 4 pacing flexible. Round 1 assessed Day 14–21.
- **Round 2:** Based on Round 1 ROI; ongoing

### Web presence

- **Now:** whitepapergrey.com live with Virtuals ACP-focused content
- **TO DO — after Tier 1 + Tier 2 expansion live:** update whitepapergrey.com to reflect Grey's broader network of endpoints (x402, Olas, Nevermined, etc.). Browser UI and newsletter expansion via Supabase email list. Scope and design TBD — not over-defining now.

---

## Risk management

### What we guarantee in Phase 2

- ElizaOS Grey byte-identical
- `wpv_*` Supabase tables not written to by New Grey
- New wallets independent of Virtuals ACP wallets
- Three services on VPS independent
- Sweep destinations hard-coded
- Tier B and Tier D keys never on VPS

### Rollback paths

- grey-core misbehaves → stop systemd unit; ACP revenue uninterrupted
- grey-sweeper misbehaves → stop unit; Tier A continues receiving
- Wrong outputs on x402 → pause endpoints; ACP unaffected
- Wallet compromise → see Wallet Infrastructure rotation procedures
- ElizaOS Grey somehow affected → revert to `phase2-baseline` tag

---

## Total addressable picture

- **Virtuals ACP (active):** Live; revenue trajectory developing. See "Revenue Targets — Virtuals only" above for projected $660 → $57,000/month range.
- **Agent-to-agent payment rails (x402, Skyfire, Kite, Nevermined):** $600M+ annualized x402 alone
- **Dedicated agent marketplaces (Olas, Agentverse):** ~10M txns, 2.07M agents
- **Capital management (direct B2B):** Giza ARMA $3.96B agentic volume; Theoriq AlphaVault $76.9M sub-vault TVL
- **Bittensor:** $1.08M/day emissions

Grey doesn't need meaningful share of any single one. Seventeen offerings, three buyer-shape concentrations, nine-surface spread, one unified pipeline.

---

## Summary of v7 changes vs v6

- **Grey live on Virtuals ACP.** Graduation completed, ACP networking official, website live, original 4 offerings registered.
- **Step 0 pre-Phase-2 expansion.** 6 new offerings (claim_extraction, claim_history, quick_protocol_facts, audit_posture_check, tokenomics_audit, claim_evaluation) ship to ElizaOS Grey before outreach starts. Virtuals goes from 4 to 10 offerings, full V/R/I coverage. ElizaOS Grey locked at `phase2-baseline` tag after Step 0 lands.
- **Virtuals outreach integrated.** Round 1 plan (20–25 agents across 4 Outreach Tiers, $11–49 budget), brand reference (canonical names/IDs), Twitter content, execution sequence, Virtuals-only revenue targets ($660 launch → $57K full potential).
- **Two distinct tier systems, clearly labeled.** Expansion Tiers 1–5 for platforms; Outreach Tiers 1–4 for Virtuals outreach targets.
- **Unified branding/messaging.** Consistent core positioning across all platforms with per-platform concentration emphasis.
- **Wallet infrastructure with central treasury.** Tier A/B/D mandatory hierarchy with conditional Tier C per chain. Tier D central treasury anchored on Base with 70/30 operating-vs-tax-reserve split. **Discord webhook monitoring active from Phase 2.**
- **Compliance offering re-framed.** `compliance_report` → `compliance_research_input`.
- **V/R/I posture introduced.** Verification, Research, Intelligence — three buyer-shape concentrations.
- **Offerings catalog clarified to 17 distinct offerings.** `daily_tech_brief` and `technical_briefing` are separate offerings. V/R/I = 7 / 5 / 5.
- **Website expansion as To Do.** Update whitepapergrey.com to reflect broader endpoint network after Expansion Tier 1 + Tier 2 ship.
- **Phase 3 reframed as real choice.** Coexistence default; migration requires positive reason.
- **All companion documents bumped.** Work breakdown v3 (now includes Step 0), adapter skeleton v3, deployment checklist v3, wallet infrastructure v3.

---

## Document set summary

**Score documents** (authoritative; Forces's primary reference):

| Document | Version | Audience | Role |
|---|---|---|---|
| Multi-Platform Deployment Plan (this) | v7 | Forces | Strategic frame, V/R/I posture, offerings, pricing, Virtuals outreach, tier analysis |
| Phase 2 Work Breakdown for Kovsky | v3 | Kovsky | Step-by-step Phase 2 tasks |
| x402 Middleware Adapter Skeleton | v3 | Kovsky | Buildable scaffold, all 17 offerings |
| Phase 2 Deployment Checklist | v3 | Forces + Kovsky | Operational verification |
| Grey Wallet Infrastructure | v3 | Forces + Kovsky | Multi-chain hierarchy, central treasury, tax split, conditional Tier C |

**Working documents** (Kovsky's per-session context, extracted from the score):

| Document | Version | Audience | Role |
|---|---|---|---|
| Grey Orientation | v1 (evergreen) | Kovsky | One-time cold-start reference. Read before first movement. Updated only when Grey's state materially changes. |
| Movement 0 — ElizaOS Expansion | v1 | Kovsky | Working packet for Step 0 session |
| Movement 1 — Monorepo + Pipeline (planned) | — | Kovsky | Working packet for Phase 2 Steps 1+2 |
| Movement 2 — Schemas (planned) | — | Kovsky | Working packet for Phase 2 Step 3 |
| Movement 3 — grey-core HTTP (planned) | — | Kovsky | Working packet for Phase 2 Step 4 |
| Movement 4 — Identity + Wallets (planned) | — | Kovsky | Working packet for Phase 2 Steps 5+6 |
| Movement 5 — x402 Adapter + Deploy (planned) | — | Kovsky | Working packet for Phase 2 Steps 7+8 |
| Movement 6 — Parity Check (planned) | — | Kovsky | Working packet for Phase 2 Step 9 |

The score documents are stable and authoritative. The working documents are extracted views into the score, sized for one working session each. When the score changes, the working documents are regenerated to reflect it.

---

*Document version: v7, May 11, 2026. Author: Forces with Claude as head coder. Implementation by Kovsky against this spec set.*
