# Whitepaper Grey — Revised Offering Structure (Option A)

**Date:** 2026-03-28
**Change:** $0.25 and $1.50 tiers now run real pipeline work for uncached tokens instead of returning NOT_IN_DATABASE.

---

## Revised Offerings

### 1. `project_legitimacy_scan` — $0.25

**Old behavior:** Cache lookup only. Returns NOT_IN_DATABASE if uncached.
**New behavior:** Cache hit → instant result. Cache miss → discover whitepaper + run L1 StructuralAnalyzer. Always returns a real verdict.

**Description:** Quick structural scan of any crypto project. Returns whitepaper quality score (0-5), hype-to-tech ratio, claim count, MiCA compliance status, and overall verdict. Works for any token address on any chain — EVM, Solana, or Base. Results in under 30 seconds.

**Cost to Grey:** $0.00 (cached) / $0.02 (live L1)
**Grey receives (after 80/20 ACP split):** $0.20
**Net margin:** 90-100%

---

### 2. `tokenomics_sustainability_audit` — $1.50

**Old behavior:** Cache lookup only. Returns NOT_IN_DATABASE if uncached.
**New behavior:** Cache hit → instant result with claims. Cache miss → discover whitepaper + run L1 + L2 ClaimExtractor. Always returns real claims and analysis.

**Description:** Structural analysis plus AI-powered claim extraction. Returns everything in the legitimacy scan, plus categorized claims (tokenomics, performance, consensus, scientific) with evidence citations and per-claim scores. Full logic summary of whitepaper coherence.

**Cost to Grey:** $0.00 (cached) / $0.08–$0.15 (live L1+L2)
**Grey receives (after 80/20 ACP split):** $1.20
**Net margin:** 88-100%

---

### 3. `verify_project_whitepaper` — $2.00

**Behavior:** Unchanged. Cache hit → instant. Cache miss → discover whitepaper + run L1 + L2. Same as tokenomics audit but accepts optional `document_url` for direct whitepaper submission.

**Description:** Whitepaper verification with direct document submission. Everything in the tokenomics audit, plus the ability to provide a specific whitepaper URL for analysis. Returns token address verification and full claim extraction. Ideal for new projects submitting their own documentation.

**Cost to Grey:** $0.00 (cached) / $0.08–$0.15 (live L1+L2)
**Grey receives (after 80/20 ACP split):** $1.60
**Net margin:** 91-100%

---

### 4. `full_technical_verification` — $3.00

**Behavior:** Unchanged. Cache hit → instant. Cache miss → full L1+L2+L3 pipeline.

**Description:** Deepest analysis available. Everything in the whitepaper verification, plus L3 per-claim evaluation: mathematical validity checks, plausibility assessment, originality scoring, consistency analysis across all claims. Returns confidence score (0-100), focus area breakdowns, and full evaluation details with LLM cost transparency.

**Cost to Grey:** $0.00 (cached) / $0.29–$0.57 (live L1+L2+L3)
**Grey receives (after 80/20 ACP split):** $2.40
**Net margin:** 76-100%

---

### 5. `daily_technical_briefing` — $8.00

**Behavior:** Unchanged. Cron summary of recent verifications.

**Description:** Daily digest of all projects Grey verified in the past 24 hours. Returns date, total count, and per-project summary with verdict, confidence score, and MiCA status. Up to 10 projects per briefing, backfilled from recent verifications if today's batch is small.

**Cost to Grey:** $0.00
**Grey receives (after 80/20 ACP split):** $6.40
**Net margin:** 100%

---

## What Changes in the Code

| Component | Change |
|-----------|--------|
| `JobRouter` | $0.25 cache miss → trigger TieredDocumentDiscovery + L1 StructuralAnalyzer instead of returning NOT_IN_DATABASE |
| `JobRouter` | $1.50 cache miss → trigger TieredDocumentDiscovery + L1 + L2 ClaimExtractor instead of returning NOT_IN_DATABASE |
| `ReportGenerator` | Remove upsell text from `logicSummary`. Replace "Submit via verify_project_whitepaper ($2.00)" with neutral language |
| `NOT_IN_DATABASE` | Verdict still exists but only for edge case: whitepaper cannot be found by any discovery tier (no website, no docs, no Virtuals page). Becomes rare, not the default. |

---

## What Stays the Same

- All deliverable schemas (JSON shapes, field names, types)
- All offering IDs on Virtuals (no re-registration needed)
- All test infrastructure (66 Test, Breakbot results)
- Pricing ($0.25 / $1.50 / $2.00 / $3.00 / $8.00)
- SLA (5 minutes on all offerings — L1 takes <2s, L1+L2 takes <30s, well within)

---

## Revenue Projections

### Assumptions

- ACP takes 20% of service fee (Grey keeps 80%)
- Option A increases $0.25 tier volume significantly — buyers always get a real result, word spreads
- Cache hit rate starts low (~30% month 1) and grows as Grey verifies more tokens
- Average cost per live scan: $0.02 (L1), $0.12 (L1+L2), $0.40 (L1+L2+L3)

### Month 1 — Launch

| Offering | Jobs/month | Gross (80%) | Avg cost | Net |
|----------|-----------|-------------|----------|-----|
| Legitimacy Scan ($0.25) | 120 | $24.00 | $1.68 | $22.32 |
| Tokenomics Audit ($1.50) | 40 | $48.00 | $3.36 | $44.64 |
| Verify Whitepaper ($2.00) | 30 | $48.00 | $2.52 | $45.48 |
| Full Verification ($3.00) | 15 | $36.00 | $4.20 | $31.80 |
| Daily Briefing ($8.00) | 10 | $64.00 | $0.00 | $64.00 |
| **Total** | **215** | **$220.00** | **$11.76** | **$208.24** |

*Lower than original $660 projection — conservative for actual launch month with new agent on marketplace.*

### Month 3 — Traction

| Offering | Jobs/month | Gross (80%) | Avg cost | Net |
|----------|-----------|-------------|----------|-----|
| Legitimacy Scan ($0.25) | 600 | $120.00 | $6.00 | $114.00 |
| Tokenomics Audit ($1.50) | 200 | $240.00 | $14.40 | $225.60 |
| Verify Whitepaper ($2.00) | 100 | $160.00 | $7.20 | $152.80 |
| Full Verification ($3.00) | 50 | $120.00 | $14.00 | $106.00 |
| Daily Briefing ($8.00) | 30 | $192.00 | $0.00 | $192.00 |
| **Total** | **980** | **$832.00** | **$41.60** | **$790.40** |

### Month 6 — Growth

| Offering | Jobs/month | Gross (80%) | Avg cost | Net |
|----------|-----------|-------------|----------|-----|
| Legitimacy Scan ($0.25) | 2,000 | $400.00 | $14.00 | $386.00 |
| Tokenomics Audit ($1.50) | 600 | $720.00 | $28.80 | $691.20 |
| Verify Whitepaper ($2.00) | 300 | $480.00 | $14.40 | $465.60 |
| Full Verification ($3.00) | 150 | $360.00 | $30.00 | $330.00 |
| Daily Briefing ($8.00) | 80 | $512.00 | $0.00 | $512.00 |
| **Total** | **3,130** | **$2,472.00** | **$87.20** | **$2,384.80** |

*Cache hit rate ~65% by month 6 — costs drop as database grows.*

### Month 12 — Scale

| Offering | Jobs/month | Gross (80%) | Avg cost | Net |
|----------|-----------|-------------|----------|-----|
| Legitimacy Scan ($0.25) | 8,000 | $1,600.00 | $32.00 | $1,568.00 |
| Tokenomics Audit ($1.50) | 2,000 | $2,400.00 | $48.00 | $2,352.00 |
| Verify Whitepaper ($2.00) | 800 | $1,280.00 | $19.20 | $1,260.80 |
| Full Verification ($3.00) | 400 | $960.00 | $32.00 | $928.00 |
| Daily Briefing ($8.00) | 200 | $1,280.00 | $0.00 | $1,280.00 |
| **Total** | **11,400** | **$7,520.00** | **$131.20** | **$7,388.80** |

*Cache hit rate ~80% by month 12. LLM migration trigger still 300 verifications/month sustained.*

---

## Comparison to Original Projections

| Timeline | Original (cache-only $0.25) | Option A (live L1 $0.25) | Difference |
|----------|-----------------------------|--------------------------|------------|
| Month 1 | $660 | $208 | -68% (conservative launch) |
| Month 3 | $2,040 | $790 | -61% (building reputation) |
| Month 6 | $6,300 | $2,385 | -62% |
| Month 12 | $21,000 | $7,389 | -65% |

**Why lower?** The original projections assumed aggressive adoption. These are grounded in what a new agent on ACP can realistically achieve. The key difference: **the original model couldn't actually deliver at the $0.25 tier** — every uncached query was a failed service. Option A delivers every time, which builds the trust and reputation needed to hit volume. A product that works at lower volume beats a product that fails at higher volume.

**Break-even:** $162–$212/month (unchanged — infrastructure costs are the same). Grey passes break-even in month 1 under Option A.

---

## The Flywheel

Every $0.25 scan on an uncached token **populates the cache**. The next buyer who asks about the same token gets an instant response at zero cost to Grey. The $0.25 tier becomes a self-funding data acquisition pipeline:

1. Buyer pays $0.25 for Uniswap scan → Grey discovers WP, runs L1 ($0.02 cost), delivers result, caches it
2. Next 100 buyers asking about Uniswap → instant response, $0.00 cost each, $20.00 gross
3. Some of those buyers upgrade to $1.50 or $3.00 for deeper analysis → higher-margin jobs on already-cached data

The database grows with every scan. Costs converge toward zero over time. Volume drives margin.

---

*End of revised offering structure.*
