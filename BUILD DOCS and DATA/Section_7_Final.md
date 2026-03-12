# Section 7: Launch Execution Plan (Final)

**For integration into WPV_Agent_Technical_Architecture_v1.3**

---

## 7.0 Pre-Launch Prerequisites (Before Sandbox)

| Task | When | Notes |
|------|------|-------|
| Twitter/X account live | Before any ACP activity | Bio, branding, pinned thread explaining WPV mission. Socials exist before anyone on Virtuals encounters our name. |
| Website domain + placeholder | Before sandbox | Landing page with mission statement, service overview, email capture, Twitter link. |
| Draft all outreach messages (Tier 1, 2, 3) | During Phase B | All pitches ready to fire on Graduation Day. |
| Public one-pager | During Phase B | PDF or web page explaining WPV for anyone clicking through from Twitter or ACP. |

## 7.1 Sandbox & Graduation (Days 1–2)

Daily cron is active from Day 1 of sandbox. While we run test transactions for graduation, the cron discovers and verifies whitepapers on schedule. By the time we graduate, the Greenlight List already has 10–20 verified projects in it. We don't launch empty.

Run our own buyer test agent against the WPV seller agent. 10 transactions at $0.01 each. We control both sides. If Phase C is clean, 10 transactions complete in a single session. Submit graduation request immediately.

**Target: graduated in 1–2 days** depending on Virtuals team approval speed.

## 7.2 Graduation Day

Everything fires on Graduation Day. This is launch.

**Resources go live:**
- Daily Greenlight List visible to all graduated agents and Butler (already populated from sandbox cron)
- Scam Alert Feed visible to all graduated agents and Butler
- All 5 paid job offerings live and accepting USDC
- Butler begins routing matching queries automatically — passive revenue starts

**All outreach fires on Graduation Day.** There is no benefit to staggering the rollout. Every target gets contacted the same day we go live.

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

## 7.3 Cluster Applications (As Soon As Endorsements Land)

Not calendar-locked. Apply the moment a Tier 1 conversation produces a positive signal.

**AHF Verification Layer Seat (CL-001):** Axelrod (Strategic Lead), Tibbir (Treasury), Ethy (Yield), Otto (Cross-Chain). The open "Verification Layer" seat — "cross-checking whitepaper claims vs. on-chain reality" — is our exact product description. If Axelrod, Ethy, or Otto respond positively to Graduation Day outreach, apply immediately with their endorsement. Internal spend: $3.25/job. Our Full Verification at $3.00 fits.

**AI-Audit Mesh Logic Auditor Seat (CL-005):** Formation-stage cluster. WachAI Mesh is a member. Open "Logic Auditor" seat. Open Application / Trust Score Threshold — lower barrier than AHF. If WachAI conversation on Graduation Day is positive, apply that same day. The cluster is still forming — early applicants have an advantage.

## 7.4 Public Website Launch (Weeks 3–4 Post-Graduation)

Launch within 3–4 weeks of Graduation Day. Human users can:

- Browse the Greenlight List and Scam Alert Feed without a wallet (free — same data as ACP Resources)
- Connect a crypto wallet (MetaMask, Coinbase Wallet) to pay for verification at the same USDC prices as agentic users
- Submit any whitepaper URL for Verify Project Whitepaper ($2.00) or Full Technical Verification ($3.00)
- Subscribe to Daily Technical Briefing ($8.00/day or discounted monthly)
- Search verified whitepapers by name, token address, or category

This is the C2A human portal parallel to ACP. Captures Butler users who want a direct interface plus the broader crypto community from Twitter. Also serves as the credibility landing page when anyone looks us up.

**Technical note for Kovsky:** Separate frontend (Next.js) querying the same Supabase backend. ACP and website payments both write to wpv_verifications. Phase D deliverable, not a Phase A–C blocker.

## 7.5 Twitter & Social Content (Ongoing from Pre-Launch)

**Pre-launch:** Account live. Bio links to website placeholder. Pinned thread: "What is WPV Agent and why does DeFi need whitepaper verification?"

**Post-graduation:** Daily Greenlight List summary. Scam Alert highlights. Weekly "Top 3 Most Verified Projects." Monthly verification accuracy report once 30+ days of data exists.

## 7.6 Token Strategy: Cash Cow vs. Coin

### What Happens to Your Revenue When You Tokenize

Without a token, ACP service revenue is simple: price × jobs × 80% = USDC in your agent wallet. You withdraw whenever you want. Clean cash.

With a token, three new flows appear — and your clean cash gets entangled:

**Revenue Network Share:** Virtuals distributes up to $1M/month from protocol revenue to agents proportional to their aGDP. Requires a launched token. It's bonus money, but it's weighted toward token ecosystem activity, not service quality. The amount fluctuates weekly based on your aGDP rank relative to 18,000+ agents. It's not a paycheck.

**Token Trading Fees:** Every buy/sell of your agent token on DEX incurs a 1% tax. That splits: 30% buys back and burns your token (supports price, you never see the cash), 60% goes to the agent wallet (accessible but intertwined with token economy), 10% to protocol. If your token does $10k/day volume, $60/day hits the agent wallet. But $10k daily volume on a $200k pool is volatile speculation disconnected from your service quality.

**The Trap:** The moment you launch a token, the ecosystem pivots from evaluating your service quality to evaluating your token performance. If the token dumps, your Trust Score, cluster standing, and Butler ranking take reputational damage for reasons that have nothing to do with whether your verification engine works. The 60-day minimum lock means you can't undo it fast. Your daily USDC that was paying for your life becomes fuel for a coin that might be cratering.

### The Two-Agent Strategy

**Agent 1 (WPV Agent): No token. Pure cash flow.**

- All service revenue → USDC → your wallet
- Evaluated on service quality and Trust Score, not market cap
- Revenue grows with adoption, not speculation
- Pays for development, pays for life, funds Agent 2
- No community management overhead, no token drama

**Agent 2 (future SCIGENT agent): Token-native from day one.**

- Built with Agent 1 revenue — self-funded, no external capital
- Designed for tokenomics from the start: community ownership, aGDP optimization, Revenue Network eligibility
- The token IS the product strategy, not bolted on
- If Agent 2's token underperforms, Agent 1 still pays the bills
- Candidates: Evaluator Agent, Governance Oracle, Yield Integrity Agent, or any Level 2 SCIGENT build

This separates your paycheck from your portfolio. Agent 1 is the job. Agent 2 is the investment.

### When to Reconsider Tokenizing Agent 1

One scenario: if service revenue exceeds $15,000/month sustained for 90 days AND aGDP would rank Top 20, the Revenue Network share might meaningfully exceed what you'd risk. At that income level you can afford the downside. Below that, you're gambling rent money on token speculation.

**Decision framework:** Review monthly once revenue exceeds $1,500/month. No timeline trigger — only metric triggers. If the numbers ever make it compelling, model it with actual data before committing.

## 7.7 Full Timeline

| When | Action |
|------|--------|
| **Pre-launch** | Twitter live. Website placeholder live. All outreach drafted. |
| **Days 1–2** | Sandbox. 10 test transactions. Cron active — database building. Graduate. |
| **Graduation Day** | Resources live. Butler routing begins. ALL outreach fires (Tier 1 + 2 + 3). |
| **As soon as endorsements land** | Apply for AHF Verification Layer + AI-Audit Mesh Logic Auditor seats. |
| **Weeks 3–4** | Public website launch. Human payment portal live. |
| **Monthly** | Revenue review. Token decision against metrics. Pricing review. |
| **Ongoing** | Twitter content. Verification accuracy tracking. Near-graduate monitoring. |

---

*End of Section 7 (Final)*