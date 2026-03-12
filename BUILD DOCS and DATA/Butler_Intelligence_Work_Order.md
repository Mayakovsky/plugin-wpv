# WPV Agent — Pre-Launch Intelligence Gathering

## Butler Work Order: 6 Data Scans

**Purpose:** Identify potential customers, partners, and demand signals beyond the Top 150 aGDP leaderboard before launching the Whitepaper Verifier agent on ACP.

**Instructions for Butler:** Execute each query below and return structured results. For each scan, return data as JSON arrays with the fields specified. Where exact data is unavailable, return best approximations with a confidence note.

**Format:** Return all results as structured JSON where possible. For narrative responses (like Scan 6 Part C), return as formatted text.

---

## SCAN 1: Near-Graduate Pipeline (Sandbox → A2A)

**Rationale:** Agents currently in sandbox with 7–9 successful test transactions are days or weeks from graduating to the Agent-to-Agent view. They're actively building, testing, and about to need infrastructure services. They won't appear in the Top 150 yet because their aGDP is still accumulating. If we identify DeFi/Treasury/Trading agents about to graduate, we can be their first hired service provider on day one.

**Query:**

```
List all ACP agents currently in Sandbox status that have completed 
7 or more successful test transactions.

Filter to agents in the following categories (or whose descriptions 
match these keywords): DeFi, Treasury, Trading, Cross-Chain, 
Yield, Portfolio, Hedge Fund, Investment, Strategy, Risk.

For each agent, return:
- agent_name
- entity_id
- role (Buyer / Provider / Hybrid)
- category
- number_of_successful_sandbox_transactions
- service_description (first 200 characters)
- estimated_graduation_date (if available)
- any linked token address

Sort by number_of_successful_sandbox_transactions descending.
```

**Expected output:** 10–50 agents approaching graduation that we should monitor and potentially outreach to during our own sandbox phase.

---

## SCAN 2: High-Spend Buyers Outside the Top 150

**Rationale:** The Top 150 is ranked by aGDP, which rewards high-volume Providers. Pure Buyer agents that spend significant USDC on services but don't sell anything generate low aGDP and fall off the leaderboard. These agents ARE spending money — they're just invisible to aGDP rankings. A Buyer agent ranked #300 by aGDP that spends $200/week on services is a better customer prospect than a Provider ranked #50 that never buys anything.

**Query:**

```
List all graduated ACP agents with role = Buyer or role = Hybrid
that are NOT in the Top 150 by aGDP.

Rank them by total USDC spent on ACP services in the last 30 days 
(or last 7 days if 30-day data is unavailable).

For each agent, return:
- agent_name
- entity_id
- role
- category
- total_usdc_spent_30d (or 7d with label)
- number_of_jobs_initiated_30d (or 7d)
- top_3_service_categories_purchased
- average_spend_per_job
- graduation_date

Return the top 100 by spend. If fewer than 100 exist, return all.
```

**Expected output:** A ranked list of active-spending agents that our Top 150 census missed. Particularly valuable if any of them are spending on Research, Analytics, Risk, or Intel services — those are direct indicators of demand for our product.

---

## SCAN 3: Active and Forming Clusters

**Rationale:** Clusters are coordinated agent groups that hire specialized roles. We have data on AHF and Security & Risk Mesh, but other clusters are forming. Any cluster involving DeFi strategy, portfolio management, risk assessment, or market analysis would have members who need whitepaper verification. Clusters also have "contestable seats" — if a cluster needs an Insights or Research role and nobody fills it, we can apply.

**Query:**

```
List all active ACP clusters (both live and in formation/design phase).

For each cluster, return:
- cluster_name
- cluster_id
- cluster_type (e.g., Trading, Media, Research, Hedge Fund)
- status (Live / Formation / Design)
- selection_method (Invitation / Open Application / Contestable)
- member_agents: [{ name, entity_id, role_in_cluster }]
- open_seats: [{ role_name, role_description }] (if any seats are 
  unfilled or contestable)
- average_internal_job_price_usdc
- total_cluster_aGDP_7d

Sort by total_cluster_aGDP_7d descending.
```

**Expected output:** Complete cluster map showing where open seats exist for research/analysis/verification roles. Priority targets are any cluster with an unfilled "Insights," "Research," "Analysis," "Alpha," or "Verification" seat.

---

## SCAN 4: Keyword Demand Search (Highest Priority)

**Rationale:** This is the most direct signal of demand for our product. Any agent whose job offerings, service descriptions, or search behavior involves whitepapers, technical analysis, or verification is either a potential customer (they need verification), a potential partner (they offer adjacent services), or a competitor (they offer the same thing). The ACP SDK supports keyword and embedding search across agent profiles.

**Query:**

```
Search ALL registered ACP agents (graduated AND sandbox) for profiles, 
job offerings, or service descriptions containing ANY of the following 
keywords:

Primary keywords (high relevance):
- whitepaper
- technical verification
- scientific analysis
- tokenomics audit
- protocol review
- whitepaper verification
- technical audit
- logic check
- math verification

Secondary keywords (adjacent relevance):
- due diligence
- fundamental analysis
- project evaluation
- technical assessment
- claim verification
- research report
- scientific credibility

For each matching agent, return:
- agent_name
- entity_id
- role (Buyer / Provider / Hybrid / Evaluator)
- category
- graduation_status
- matched_keywords (which keywords triggered the match)
- matching_text (the relevant portion of their description or 
  job offering that matched, first 300 characters)
- price (if Provider, their service price)
- jobs_7d
- classification: POTENTIAL_CUSTOMER / POTENTIAL_PARTNER / 
  POTENTIAL_COMPETITOR (based on whether they're seeking or 
  offering these services)

Sort by relevance score descending, then by aGDP_7d descending.
```

**Expected output:** Every agent in the ecosystem that has expressed interest in whitepaper verification — either as something they need or something they offer. This is our most actionable intelligence: agents classified as POTENTIAL_CUSTOMER have already signaled demand for exactly what we're building.

---

## SCAN 5: Butler Human User Demand Patterns

**Rationale:** 52,400 active Butler users generate 32% of ACP volume. Butler routes human requests to provider agents. Understanding what humans ask for tells us how to position our Agent Card description for Butler discovery. If humans are asking Butler questions that touch on whitepaper analysis, project legitimacy, or technical evaluation — and Butler currently has no good provider to route those requests to — that's unmet demand we capture on day one.

**Query:**

```
Part A — Service Category Demand:
List the top 30 most-requested service categories through Butler 
in the last 30 days (or available period).

For each category, return:
- category_name
- total_requests_30d
- total_usdc_spent_30d
- number_of_unique_users
- top_3_provider_agents_by_volume_in_category
- average_job_price_in_category
- fulfillment_rate (% of requests that were successfully matched 
  to a provider and completed)

Part B — Unfulfilled Demand:
List the top 20 Butler user queries or request types that had the 
LOWEST fulfillment rates (i.e., Butler could not find a suitable 
provider, or the job was not completed successfully).

For each unfulfilled request type, return:
- request_description (generalized)
- number_of_attempts_30d
- fulfillment_rate
- reason_for_failure (no matching provider / provider timeout / 
  deliverable rejected / other)

Part C — Research & Analysis Specific:
For the categories "Research," "Analysis," "Due Diligence," "Risk 
Assessment," and "Technical Review" specifically:
- How many Butler requests fell into these categories in the last 
  30 days?
- Which provider agents fulfilled them?
- What was the average price paid?
- What was the average user satisfaction / success rate?
- Were there any requests that mentioned "whitepaper," "tokenomics," 
  or "technical claims" that went unfulfilled?
```

**Expected output:** A map of human demand through Butler, with specific attention to research/analysis categories. Unfulfilled demand (Part B) is gold — those are humans who tried to buy a service that doesn't exist yet. If any of those unfulfilled queries relate to whitepaper verification, we have confirmed demand from day one.

---

## SCAN 6: Butler as a Direct Sales Channel

**Rationale:** Butler is not just a data source — it's an autonomous sales agent. When a human user asks Butler "is this token legit?" or "check this project's whitepaper," Butler searches the ACP registry for a matching provider and routes the job. If our Agent Card description contains the right keywords, Butler will hire us on behalf of human users without any outreach required. We need to understand exactly how Butler discovers and selects providers so we can optimize our Agent Card for maximum Butler routing.

**Query:**

```
Part A — Butler's Provider Selection Logic:
When a Butler user requests a service, how does Butler select which 
provider agent to route the job to? Specifically:

- What ranking criteria does Butler use? (Confirm: Trust Score > 
  aGDP > Price, or has this changed?)
- Does Butler consider keyword matching in agent descriptions?
- Does Butler consider past job success rate with specific providers?
- Does Butler present multiple provider options to the user, or 
  auto-select?
- Can a provider agent's Resource Offerings (free endpoints) 
  influence Butler's routing decisions?
- Is there a way for a provider to register specific "trigger 
  phrases" or "intent categories" that Butler maps to?

Part B — Butler Query Volume for Our Niche:
In the last 30 days, how many Butler user queries matched any of 
the following intents or contained these phrases:

- "is this token legit"
- "check this whitepaper"  
- "is this project real"
- "verify this token"
- "technical analysis of [project]"
- "should I invest in [project]"
- "is [project] a scam"
- "whitepaper review"
- "tokenomics check"
- "is the math real"
- any query where the user provided a PDF URL or document link

For matching queries, return:
- estimated_monthly_volume (total queries matching these intents)
- current_routing (which provider agents, if any, Butler routed 
  these to)
- fulfillment_rate (what % were successfully completed)
- average_price_paid
- user_satisfaction_signal (if available)

Part C — Optimal Agent Card Keywords for Butler Discovery:
Based on Butler's internal search and matching logic, what keywords, 
phrases, and description patterns should a NEW provider agent 
include in their Agent Card to maximize the probability of being 
selected by Butler for research/verification/due-diligence queries?

Return:
- recommended_keywords (list of 10-20 high-match keywords)
- recommended_description_template (a model description structure 
  that Butler's matching algorithm favors)
- recommended_job_offering_names (naming patterns that improve 
  discoverability)
- any_other_optimization_tips for new agents seeking Butler traffic
```

**Expected output:** A complete playbook for optimizing our Agent Card to capture Butler-routed human demand. Part B quantifies how many humans are already asking questions our agent can answer. Part C gives us the exact SEO-equivalent strategy for the ACP registry. If Butler routes even 10 verification queries/day to us at $0.25–$1.50 each, that's meaningful revenue from a channel that requires zero outreach — Butler does the selling for us.

---
