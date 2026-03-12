# Section 7: Launch Execution Plan (Final Revision)

**For integration into WPV_Agent_Technical_Architecture_v1.3**

---

## 7.0 Pre-Launch Prerequisites (Before Sandbox)

These happen BEFORE Phase C sandbox testing begins:


| Task                                    | When                    | Notes                                                                                                                           |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Create Twitter/X account for WPV Agent  | Before any ACP activity | Bio, branding, pinned thread explaining WPV mission. Account is live and visible before anyone on Virtuals encounters our name. |
| Draft all 18 Tier 1+2 outreach messages | During Phase B          | Tailored pitches ready to send the moment we graduate.                                                                          |
| Prepare public one-pager                | During Phase B          | Explains WPV services for anyone who clicks through from Twitter or ACP.                                                        |
| Website domain + placeholder            | During Phase B          | Even a landing page with "Coming Soon" + email capture + Twitter link. Establishes web presence before graduation.              |


## 7.1 Sandbox & Graduation (Days 1–3)

Run our own buyer test agent against the WPV seller agent. 10 transactions at $0.01 each. We control both sides — this is a pipeline validation exercise, not a customer acquisition phase. If Phase C ACP integration is clean, 10 test transactions complete in a single session.

**Target: graduation request submitted Day 1.** Virtuals team manual review may add 24–48 hours. Worst case: graduated by Day 3–5.

## 7.2 Resources + Butler Go Live (Day of Graduation)

The moment we graduate to Agent-to-Agent view:

- Daily Greenlight List visible to all graduated agents and Butler
- Scam Alert Feed visible to all graduated agents and Butler
- All 5 paid job offerings live and accepting USDC
- Butler begins routing matching queries automatically — passive revenue starts NOW

**Butler captures from Day 1.** 8,800 monthly unfulfilled queries in our niche start finding us through keyword matching. No outreach required for this channel.

## 7.3 Tier 1 + Tier 2 Outreach (Days 1–2 Post-Graduation)

All 18 targets contacted within the first 2 days of graduation. Simultaneous. The pitches are tailored — there's no reason to hold Tier 2 while waiting for Tier 1 responses.

**Tier 1 — Infrastructure Partners (8 agents):**


| Agent         | ID   | Pitch Angle                                                                           |
| ------------- | ---- | ------------------------------------------------------------------------------------- |
| Ethy AI       | 84   | Yield sustainability. $0.25/check — same price as your swaps.                         |
| Otto AI       | 122  | Technical moat check before cross-chain moves. $0.25 instant.                         |
| Axelrod       | 552  | AHF Verification Layer seat. Free Greenlight. $3.00 — below your $3.25 internal rate. |
| Wolfpack      | 1888 | Scientific Credibility sub-score for your risk ratings. $0.25.                        |
| WachAI Mesh   | 302  | Bundle our $2 Verify Whitepaper with your $8 audit. Charge $12.                       |
| DeFi Sentinel | 1102 | Treasury protection. $0.25 Legitimacy Scan before every deployment.                   |
| LiquidAlpha   | 774  | $0.25 per token at your volume is a rounding error for massive risk reduction.        |
| TreasuryGuard | 812  | $3.00 Full Verification for serious allocation candidates.                            |


**Tier 2 — Growth Partners (8 agents + 2 near-graduates):**


| Agent             | ID   | Pitch Angle                                                                                 |
| ----------------- | ---- | ------------------------------------------------------------------------------------------- |
| Ask Caesar        | 104  | Automate your technical analysis with our $1.50 Tokenomics Audit as input. Keep your $3.50. |
| Gigabrain         | 153  | Feed our structured claim data into your analytics at $1.50/token.                          |
| VaultMaster       | 221  | Legitimacy Scan + Tokenomics Audit for protocol evaluation.                                 |
| MarketMover       | 404  | High-volume Legitimacy Scans at $0.25. Dead-zone pricing.                                   |
| AlphaSeeker       | 885  | $0.25 Legitimacy Scan fits your price sensitivity.                                          |
| ArbitrageAce      | 442  | Quick validation before arb positions. $0.25, <2 seconds.                                   |
| AssetArmor        | 813  | Full Technical Verification at your exact $3.00 spend level.                                |
| StableScout       | 909  | Tokenomics Audit at $1.50 for yield protocol evaluation.                                    |
| SecureLogic       | 2104 | Near-graduate. We verify WP logic, you verify contracts. Bundle.                            |
| TreasuryTactician | 2188 | Near-graduate. Free Greenlight + $0.25 Legitimacy Scans.                                    |


## 7.4 Cluster Applications (Week 2 Post-Graduation)

**AHF Verification Layer Seat (CL-001):** The Autonomous Hedge Fund cluster has Axelrod (Strategic Lead), Tibbir (Treasury), Ethy (Yield), and Otto (Cross-Chain). They have an explicitly open seat called "Verification Layer" whose job description is "cross-checking whitepaper claims vs. on-chain reality." That is literally our product. By Week 2, we'll have active relationships with Axelrod, Ethy, and Otto from Tier 1 outreach. Apply with their endorsement. Internal spend rate: $3.25/job. Our Full Verification at $3.00 is competitive.

**AI-Audit Mesh Logic Auditor Seat (CL-005):** Formation-stage cluster. Open "Logic Auditor" seat for technical project evaluation. WachAI Mesh is a member — our Tier 1 relationship is the bridge. Lower barrier: Open Application / Trust Score Threshold. Apply simultaneously with AHF.

## 7.5 Tier 3 Outreach (Weeks 2–4 Post-Graduation)

Within the first month, reach every remaining high-relevance agent:

- **High-spend buyers outside Top 150:** VentureViking (1301, $840/mo on Research/Risk/Intel), StrategySpider (1313, $580/mo), StableStork (1309, $620/mo), FlowFalcon (1303, $410/mo)
- **Remaining Top 150 DeFi/Treasury/Trading:** DeFi Pulse (1103), VaultVision (222), BridgeBuddy (123), TreasuryTactics (814), AlphaAlpha (554), plus all sandbox DeFi/Treasury/Trading agents
- **Near-graduate monitoring:** YieldFalcon (2241, 7/10 tests). Outreach the day they graduate.

## 7.6 Public Website Launch (Month 2)

Launch a public-facing website where human users can:

- Browse the Greenlight List and Scam Alert Feed without a wallet (free content — same data as ACP Resources)
- Connect a crypto wallet (MetaMask, Coinbase Wallet) to pay for verification at the same USDC prices as agentic users
- Submit any whitepaper URL for Verify Project Whitepaper ($2.00) or Full Technical Verification ($3.00)
- Subscribe to Daily Technical Briefing ($8.00/day or discounted monthly)
- Search verified whitepapers by name, token address, or category

This is the C2A human portal parallel to the ACP agent channel. It captures the 52,400 Butler users who want a direct interface, plus the broader crypto community discovering us through Twitter. It's also the landing page that gives our social presence credibility.

**Technical note for Kovsky:** Separate frontend (likely Next.js) querying the same Supabase backend. ACP job offerings and website payments both write to wpv_verifications. Phase D deliverable, not a Phase A–C blocker.

## 7.7 Twitter & Social Content (Ongoing from Pre-Launch)

**Pre-launch:** Account live. Bio links to website placeholder. Pinned thread: "What is WPV Agent and why does DeFi need whitepaper verification?"

**Post-graduation:** Daily Greenlight List summary. Scam Alert highlights. Weekly "Top 3 Most Verified Projects." Monthly verification accuracy report once we have 30+ days of data.

**Purpose:** Human traffic → Butler (paid queries) + website (paid queries) + reputation building for Trust Score.

## 7.8 Token Strategy: Cash Cow vs. Coin

### The Revenue Mechanics You Need to Understand

**Without a token** (current plan), ACP service revenue works simply: you set a price, an agent or Butler user pays in USDC, ACP takes 20%, you receive 80% in the agent wallet. You withdraw to your personal wallet whenever you want. Clean, predictable cash flow. This is rent money.

**With a token**, three additional revenue streams appear — but your clean cash flow gets entangled:

**1. Revenue Network Share:** Virtuals distributes up to $1M/month from protocol revenue to agents proportional to their aGDP. You must have a launched token to be eligible. This is bonus money on top of service revenue. The catch: it's distributed to incentivize the token ecosystem, not to pay the developer's bills. The share you receive depends on your aGDP ranking relative to 18,000+ agents, and it fluctuates weekly.

**2. Token Trading Fees:** Every buy/sell of your agent token on DEX incurs a 1% trading tax. That fee splits: 30% buys back and burns your token (supports price but you never see the cash), 60% goes to the agent wallet (accessible), 10% goes to protocol. If your token does $10k/day trading volume, $60/day hits the agent wallet. But trading volume is speculative and volatile — it has nothing to do with how good your verification service is.

**3. The Trap:** The moment you launch a token, the ecosystem — your community, your Revenue Network ranking, Butler's perception of your agent — pivots from evaluating your *service quality* to evaluating your *token performance*. If the token dumps (and most agent tokens do), your reputation takes a hit completely disconnected from whether your verification engine works. A 200k market cap token with $10k daily volume can crash 50% on a single whale exit, and suddenly your Trust Score, your cluster standing, and your Butler ranking are all under pressure for reasons that have nothing to do with your product.

The 60-day minimum lock on token launches means you can't undo this quickly. At a 60-day commit, if the token craters in week 3, you're riding it down for 5 more weeks while your daily cash flow — the money that was paying for your life — is now an engine for a coin nobody's trading.

### The Smart Play: Two-Agent Strategy

**Agent 1 (WPV Agent): No token. Pure cash flow machine.**

- All service revenue flows directly to you in USDC
- No token drama, no market cap anxiety, no community management overhead
- You're evaluated purely on service quality and Trust Score
- Revenue grows with adoption, not with speculation
- This agent pays for development, pays for life, funds Agent 2

**Agent 2 (future): Token-native from day one.**

- Built with revenue from Agent 1 — no external funding needed
- Designed from the start for tokenomics: community ownership, aGDP optimization, Revenue Network eligibility
- The token IS the product strategy, not an afterthought bolted onto a cash flow business
- If the token underperforms, Agent 1 still pays the bills
- Could be the Evaluator Agent, the Governance Oracle, or any of the SCIGENT Level 2 agents

This separates your paycheck from your portfolio. Agent 1 is the job. Agent 2 is the investment. You never risk rent money on token speculation.

### When to Reconsider Tokenizing Agent 1

There is exactly one scenario where tokenizing the WPV Agent makes sense: if the Revenue Network share at your aGDP level would exceed 50% of your current service revenue AND the token has a clear path to sustained trading volume above $50k/day. At that point, the token economics add more than they risk. But that's a Top 15 aGDP scenario — which means you're already earning $15,000+/month from service revenue alone. At that point, you can afford the risk.

**Decision framework:** Review monthly. If service revenue exceeds $15,000/month sustained for 90 days AND aGDP would rank Top 20, model the token economics with actual numbers. Otherwise, keep stacking USDC.

## 7.9 Full Timeline Summary


| When                   | Action                                                                  |
| ---------------------- | ----------------------------------------------------------------------- |
| **Pre-launch**         | Twitter account live. Website placeholder. 18 outreach pitches drafted. |
| **Days 1–3**           | Sandbox: 10 test transactions. Submit graduation request.               |
| **Day of graduation**  | Resources live. Butler routing begins. Passive revenue starts.          |
| **Days 1–5 post-grad** | Tier 1 + Tier 2 outreach (18 agents simultaneously).                    |
| **Week 2**             | Apply for AHF Verification Layer + AI-Audit Mesh Logic Auditor seats.   |
| **Weeks 2–4**          | Tier 3 outreach (30+ agents). Monitor near-graduates.                   |
| **Month 2**            | Public website launch. Human payment portal live.                       |
| **Monthly**            | Revenue review. Token decision against metrics (no timeline trigger).   |
| **Ongoing**            | Twitter content. Verification accuracy tracking. Pricing review.        |


---

*End of Section 7 (Final Revision)*