# Whitepaper Grey — 50-Token Test Regimen

**Date:** 2026-03-19
**Owner:** Kovsky (execution) + Forces (review)
**Status:** Execute after cron completes initial 50-token verification batch.
**Prerequisite:** 50 verified tokens in Supabase with full L1/L2/L3 results cached.

---

## Purpose

Before Grey touches the ACP marketplace, prove that every service offering returns exactly what it promises — on every token, every time. This test runs 350 service calls (50 tokens × 7 endpoints) against cached data, costing zero additional LLM compute.

The test catches: missing JSON fields, values outside stated ranges, response time violations, MiCA data gaps, incorrect verdict values, action routing failures, and report tier inconsistencies. Every failure found here is a failure that would have cost us Trust Score on the live marketplace.

---

## How ACP Evaluation Works (Grey Must Understand This)

### The Evaluation Flow

```
Buyer requests job → ACP escrow holds payment → Grey delivers result
    → Evaluator inspects delivery against offering spec
    → APPROVE: escrow releases 80% to Grey, Trust Score +1
    → REJECT: payment returned to buyer, Trust Score -1, accuracy drops
```

### What Evaluators Check

Evaluators compare Grey's delivery against the **offering description text**. Not against an abstract standard. The offering description IS the contract. If Grey's offering says:

- "Structural score, hype/tech ratio, MiCA check. Under 2 seconds." → Evaluator checks: is there a structural score? A hype/tech ratio? A MiCA result? Did it respond in under 2 seconds?
- "Confidence score 1–100, verdict (PASS/CONDITIONAL/FAIL)" → Evaluator checks: is the score a number between 1 and 100? Is the verdict one of those three values?
- "Structured JSON" → Evaluator checks: is the response valid JSON?

### Trust Score Economics

Butler routes queries by: Trust Score > aGDP > Price. A single Evaluator REJECT costs more than a single APPROVE gains. Early rejections when query volume is low are disproportionately damaging — if your first 10 deliveries include 2 rejections, your Trust Score starts at 80% and Butler deprioritizes you behind established agents.

**Target: 100% approval rate for the first 50 real deliveries.** This test regimen is how we guarantee that.

### Offering Language Audit

Before running the 50 Test, verify every offering description contains ONLY promises Grey can keep on every single delivery:

| Offering | Current Promise | Audit Check |
|----------|----------------|-------------|
| Project Legitimacy Scan ($0.25) | "Structural score, hype/tech ratio, MiCA check. Under 2 seconds." | Can Grey deliver ALL THREE fields in <2s from cache? |
| Tokenomics Sustainability Audit ($1.50) | "Claim extraction + scoring across all categories." | Does the response contain categorized claims with scores? Always? |
| Verify Project Whitepaper ($2.00) | "Full L1+L2 on any URL. Results cached permanently." | Does "any URL" include URLs that fail to resolve? What does Grey return then? |
| Full Technical Verification ($3.00) | "Comprehensive report with all evaluations." | Is "all evaluations" precisely defined? What fields does "comprehensive" guarantee? |
| Daily Technical Briefing ($8.00) | "Today's batch of verified projects." | What if zero projects were verified today? What does the briefing contain? |

**CRITICAL:** Any promise that can fail on edge cases must be reworded. "Under 2 seconds" must be true for cache hits AND the edge case where the DB query is slow. "Any URL" must have a defined failure response. "All evaluations" must enumerate what's included.

### Recommended Offering Language (Evaluator-Safe)

These descriptions are precise enough that an Evaluator can verify them and Grey can always deliver:

**Project Legitimacy Scan ($0.25):**
> Returns JSON with: structural_score (1-5), hype_tech_ratio (float), mica_compliance object (claims_mica_compliance, mica_compliant, mica_summary), section_count, citation_count. Cached results in under 2 seconds. Live analysis for uncached projects may take 30-60 seconds.

**Tokenomics Sustainability Audit ($1.50):**
> Returns JSON with: L1 structural analysis + L2 claim extraction. Includes categorized claims array (TOKENOMICS, PERFORMANCE, CONSENSUS, SCIENTIFIC) with claim_text, stated_evidence, and claim_score for each. MiCA compliance included. Cached results in under 2 seconds.

**Verify Project Whitepaper ($2.00):**
> Accepts project_name, token_address, or document_url. Returns L1+L2 verification report. If project is in database, returns cached results. If not, runs live verification (3-8 minutes). Returns INSUFFICIENT_DATA if no whitepaper or document source can be found.

**Full Technical Verification ($3.00):**
> Returns JSON with: L1 structural analysis, L2 claim extraction, L3 claim evaluation, confidence_score (1-100), verdict (PASS/CONDITIONAL/FAIL/INSUFFICIENT_DATA), focus_area_scores, hype_tech_ratio, total_claims, verified_claims, MiCA compliance, compute_cost_usd.

**Daily Technical Briefing ($8.00):**
> Returns today's verification batch summary. Includes: projects_verified_count, greenlight_list (PASS verdicts), alert_list (FAIL verdicts), average_confidence, mica_compliance_summary. If no verifications ran today, returns empty batch with timestamp.

### Free Resources (Also Evaluated by Butler for Quality)

**Daily Greenlight List:**
> Array of projects with verdict=PASS verified in last 24 hours. Each entry: project_name, token_address, confidence_score, structural_score, mica_compliant, verified_at. Empty array if no projects passed today.

**Scam Alert Feed:**
> Array of projects with verdict=FAIL or hype_tech_ratio > 3.0 or fraudulent MiCA claims. Each entry: project_name, token_address, red_flags array, hype_tech_ratio, mica_summary. Empty array if no alerts.

---

## The 50 Test

### What We're Testing

50 verified tokens × 7 service endpoints = 350 test calls.

All 50 tokens are already in Supabase with full L1/L2/L3 results from the cron/seed processing. Every call should hit cache. Zero additional LLM cost.

### Test Matrix

For EACH of the 50 tokens, run these 7 tests:

| Test ID | Endpoint | Input | Expected Response |
|---------|----------|-------|-------------------|
| T1 | `project_legitimacy_scan` | token_address | LegitimacyScanReport JSON |
| T2 | `tokenomics_sustainability_audit` | token_address | TokenomicsAuditReport JSON |
| T3 | `verify_project_whitepaper` | token_address | VerificationReport JSON |
| T4 | `full_technical_verification` | token_address | FullVerificationReport JSON |
| T5 | WPV_GREENLIGHT action | (no input) | Greenlight list array |
| T6 | WPV_ALERTS action | (no input) | Scam alert array |
| T7 | WPV_STATUS action | (no input) | Pipeline status counts |

T5, T6, T7 are global (not per-token) but should be tested after each batch of token tests to verify counts update correctly.

### Validation Checks Per Test

#### T1: Project Legitimacy Scan
```
CHECK: response is valid JSON
CHECK: response.structural_score exists AND is number AND 1 <= score <= 5
CHECK: response.hype_tech_ratio exists AND is number AND >= 0
CHECK: response.mica_compliance exists AND is object
CHECK: response.mica_compliance.claims_mica_compliance IN ['YES', 'NO', 'NOT_MENTIONED']
CHECK: response.mica_compliance.mica_compliant IN ['YES', 'NO', 'PARTIAL', 'NOT_APPLICABLE']
CHECK: response.mica_compliance.mica_summary exists AND is string
CHECK: response.section_count exists AND is number
CHECK: response.citation_count exists AND is number
CHECK: response_time < 2000ms
CHECK: response.document_source exists AND IN ['pdf', 'docs_site', 'composed', 'ipfs']
```

#### T2: Tokenomics Sustainability Audit
```
ALL T1 checks PLUS:
CHECK: response.claims exists AND is array
CHECK: response.claims.length > 0 (unless document_source === 'composed' with minimal content)
CHECK: each claim has: category, claim_text, stated_evidence, claim_score
CHECK: each claim.category IN ['TOKENOMICS', 'PERFORMANCE', 'CONSENSUS', 'SCIENTIFIC', 'REGULATORY']
CHECK: each claim.claim_score is number AND 0 <= score <= 100 (OR null if not yet evaluated)
CHECK: response_time < 2000ms (cached)
```

#### T3: Verify Project Whitepaper
```
ALL T2 checks PLUS:
CHECK: response.project_name exists AND is non-empty string
CHECK: response.token_address exists AND is valid hex address
CHECK: response.verified_at exists AND is valid ISO timestamp
CHECK: response.document_url exists AND is string (may be Virtuals page URL for composed)
```

#### T4: Full Technical Verification
```
ALL T3 checks PLUS:
CHECK: response.confidence_score exists AND is number AND 1 <= score <= 100
CHECK: response.verdict exists AND IN ['PASS', 'CONDITIONAL', 'FAIL', 'INSUFFICIENT_DATA']
CHECK: response.focus_area_scores exists AND is object
CHECK: response.total_claims exists AND is number >= 0
CHECK: response.verified_claims exists AND is number >= 0
CHECK: response.verified_claims <= response.total_claims
CHECK: response.compute_cost_usd exists AND is number >= 0
CHECK: response.l2_cost_usd exists AND is number >= 0
CHECK: response.l3_cost_usd exists AND is number >= 0
CHECK: response.trigger_source exists AND IN ['cron', 'acp_request', 'manual', 'seed']
```

#### T5: Greenlight List
```
CHECK: response is valid JSON array
CHECK: each entry has: project_name, token_address, confidence_score, structural_score, mica_compliant, verified_at
CHECK: every entry has verdict === 'PASS' (or only PASS projects appear)
CHECK: all entries verified_at within last 24 hours
CHECK: response_time < 2000ms
```

#### T6: Scam Alerts
```
CHECK: response is valid JSON array
CHECK: each entry has: project_name, token_address, red_flags (array), hype_tech_ratio
CHECK: each entry meets at least one alert criteria: verdict==='FAIL' OR hype_tech_ratio > 3.0 OR fraudulent MiCA claim
CHECK: response_time < 2000ms
```

#### T7: Pipeline Status
```
CHECK: response is valid JSON
CHECK: response.total_whitepapers exists AND is number
CHECK: response.by_status exists AND is object (DISCOVERED, INGESTED, VERIFIED, FAILED counts)
CHECK: response.total_whitepapers >= 50 (we seeded at least 50)
CHECK: response.image_only_skipped exists AND is number (from PDF audit tracking)
CHECK: response_time < 2000ms
```

---

## Test Evaluator Agent (Pre-Launch Internal)

Build a lightweight test evaluator that runs the 50 Test automatically and produces a pass/fail report. This is NOT an ACP agent — it's an internal testing tool.

### Implementation

Create `wpv-agent/tests/evaluator/` directory:

```
tests/evaluator/
├── TestEvaluator.ts        # Core evaluator logic
├── offeringSpecs.ts        # JSON schemas for each offering's expected response
├── run50Test.ts            # Orchestrator — runs all 350 tests
└── report.ts               # Generates pass/fail summary
```

### TestEvaluator.ts

For each offering, define the JSON schema (field names, types, value ranges, required fields). The evaluator:
1. Sends a request to the agent (via REST API or direct action invocation)
2. Measures response time
3. Validates response against the offering's JSON schema
4. Records: PASS/FAIL, failure reason, response time, token tested

### offeringSpecs.ts

Codified version of the validation checks above. Each offering has a spec object:

```typescript
interface OfferingSpec {
  offering_id: string;
  required_fields: FieldSpec[];
  max_response_time_ms: number;
  tier_inherits_from?: string; // e.g., 'full_technical' inherits all 'legitimacy_scan' checks
}

interface FieldSpec {
  path: string;           // e.g., 'mica_compliance.claims_mica_compliance'
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  enum_values?: string[]; // e.g., ['YES', 'NO', 'NOT_MENTIONED']
  min?: number;
  max?: number;
  required: boolean;
}
```

### run50Test.ts

```typescript
// Pseudocode
const tokens = await loadVerifiedTokens(50); // from Supabase
const specs = loadOfferingSpecs();
const results: TestResult[] = [];

for (const token of tokens) {
  for (const spec of specs) {
    const start = Date.now();
    const response = await callOffering(spec.offering_id, token);
    const elapsed = Date.now() - start;
    const validation = evaluator.validate(response, spec, elapsed);
    results.push({ token, offering: spec.offering_id, ...validation });
  }
}

// Also run global endpoints
results.push(await testGreenlight(specs.greenlight));
results.push(await testAlerts(specs.alerts));
results.push(await testStatus(specs.status));

generateReport(results);
```

### Report Output

```
═══════════════════════════════════════
 WHITEPAPER GREY — 50 TEST REPORT
 Date: 2026-03-XX
 Tokens tested: 50
 Total tests: 353 (350 per-token + 3 global)
═══════════════════════════════════════

SUMMARY
  PASS: 348 (98.6%)
  FAIL: 5 (1.4%)

FAILURES:
  Token 0xABC...123 / legitimacy_scan:
    FAIL — response.mica_compliance.mica_summary is empty string (expected non-empty)
  Token 0xDEF...456 / full_technical_verification:
    FAIL — response.verified_claims (15) > response.total_claims (12) — invariant violation
  Token 0x789...012 / legitimacy_scan:
    FAIL — response_time 2,340ms > max 2,000ms
  ...

RESPONSE TIME P95:
  legitimacy_scan: 142ms
  tokenomics_audit: 187ms
  verify_whitepaper: 203ms
  full_verification: 198ms
  greenlight: 89ms
  alerts: 76ms
  status: 34ms

FIELD COVERAGE:
  mica_compliance present: 50/50 (100%)
  document_source present: 50/50 (100%)
  document_source breakdown: pdf=32, composed=14, docs_site=4
  claims array non-empty: 47/50 (94%)
  confidence_score range valid: 50/50 (100%)

VERDICT DISTRIBUTION:
  PASS: 28
  CONDITIONAL: 15
  FAIL: 5
  INSUFFICIENT_DATA: 2

EVALUATOR READINESS: 98.6%
  Target: 100% — fix 5 failures before ACP registration.
═══════════════════════════════════════
```

---

## Execution Sequence

1. **Kovsky completes 1.6A–D** (pipeline hardening)
2. **Kovsky sets up VPS** (1.7)
3. **Cron runs + seed list processes** (1.8) — 50 tokens verified
4. **Kovsky builds Test Evaluator** (tests/evaluator/)
5. **Run the 50 Test** — 353 test calls against cached data
6. **Fix all failures** — schema mismatches, missing fields, timing issues
7. **Re-run until 100% PASS**
8. **Audit offering language** — update descriptions if any promise can't be kept
9. **Proceed to ACP sandbox** confident that every delivery will pass evaluation

---

## After ACP Launch: Ongoing Evaluation Monitoring

Once Grey is live, run a lightweight version of the Test Evaluator weekly:
- Pick 10 random verified tokens from the database
- Run all 7 tests
- Flag any regressions
- Log results to a `wpv_test_runs` table in Supabase

If any Evaluator REJECT comes in from the marketplace:
1. Identify which offering and which token
2. Re-run the Test Evaluator on that specific token
3. Compare Grey's actual delivery against the offering spec
4. Fix the root cause
5. Re-run the full 50 Test to confirm no regression

---

*End of 50-Token Test Regimen — Whitepaper Grey*
