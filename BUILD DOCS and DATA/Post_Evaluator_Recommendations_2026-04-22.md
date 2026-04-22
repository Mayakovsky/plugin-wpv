# Post-Evaluator Recommendations

> Date: 2026-04-22
> Audience: Forces
> Eval result: 25/28 (89.3%) — full report attached to session
> Scope: The 3 failures reveal architectural gaps, not implementation bugs. This report proposes redesign, not patches.

---

## Executive Summary

All three evaluator failures cluster around **two architectural gaps**:

1. **Discovery pipeline lacks a fallback hierarchy.** When the primary documentation source yields thin content, Grey returns a FAIL verdict rather than broadening the search. The deliverable currently cannot distinguish "we couldn't access the document" from "the project is illegitimate."

2. **Input validator treats fields as independently authoritative.** When a buyer provides multiple identifiers (`token_address` + `project_name` + `document_url`), a single corrupted field poisons the whole request. Redundancy — which should make the system more robust — currently makes it more brittle.

Both gaps have tempting quick fixes. I'm recommending against them. The eval failures are symptoms of design debt that will keep surfacing under production load from real buyers, who will send messier input than the evaluator did.

Grey's 25 passes were clean, content-rich, and mathematically sharp (the Aave V3 deliverable even caught a real math error in the whitepaper's "22% capital efficiency" claim — should actually be 29.3%). The design problem isn't code quality. It's that Grey is **strict and narrow** when it needs to be **defensive and inclusive**.

---

## What the Failures Actually Tell Us

### Failure A — Aerodrome legitimacy scan (Job 1207)

Valid token address, valid project name. Grey's discovery hit `aerodrome.finance` (an SPA), Playwright failed to render it (log evidence: `[wpv] [WARN] Headless browser render failed | url="https://aerodrome.finance/whitepaper"`), and Grey returned `structuralScore: 1, claimCount: 0, verdict: FAIL`.

The evaluator's actionable plan was explicit: *"Relying solely on the project's primary documentation site is insufficient for regulatory analysis where third-party service providers (CASPs) may host the compliant versions of the whitepapers."*

**The failure is categorical, not operational.** Grey conflated two distinct outcomes into one deliverable:
- "We couldn't access the document" (operational failure)
- "The project has a bad whitepaper" (legitimate FAIL verdict)

Aerodrome has a reasonable whitepaper on GitHub. CEXes listing AERO may host MiCA-compliant versions. Grey didn't look at any of these because the discovery pipeline has exactly one path: the project's primary site.

### Failure B — Uniswap verify with broken URL (Job 1213, attempted twice)

Buyer sent `{token_address: "0x1f984...", project_name: "Uniswap", document_url: "https://uniswap.org/whitepaper.pdf"}`. That URL doesn't exist — the real ones are `/whitepaper-v1.pdf` and `/whitepaper-v3.pdf`, both of which succeeded in other eval jobs today (#1199, #1211).

Grey rejected pre-acceptance because `document_url` was unreachable. Grey had a verified Uniswap token address and the string "Uniswap" in the same request — either alone would have produced a correct deliverable. The validator threw them away.

**Same pattern as Failure A at a different layer.** Grey treats a single signal as authoritative rather than using the full signal set.

### The common thread

Grey's current model is strict and narrow. It does one thing well per offering but doesn't exercise judgment when inputs are imperfect or primary sources are thin. The evaluator is explicitly testing for **graceful degradation** — can Grey recover from partial information and still deliver a useful answer?

Both failures are the same design gap, viewed from two layers.

---

## Design Principles

Before proposing architecture, establish the principles that should govern it.

### 1. Redundant inputs should increase robustness, not decrease it

If a buyer sends three ways to identify a project, any one being valid should be enough. Broken fields are noise to filter through, not fatal errors. Validators should aggregate signals, not AND them.

### 2. Discovery is a tiered system, not a single path

Primary project docs → community-hosted docs → regulatory repositories → archival sources. Each tier has different authority, different failure modes, different latency. Grey should traverse tiers explicitly, with clear termination conditions at each step.

### 3. Operational failures and verdict failures must be distinguishable in the deliverable

A deliverable that says "we couldn't find the document" is a different product than one that says "the document is bad." Conflating them breaks the evaluator's ability to trust the verdict. It will break real buyers' trust too.

### 4. MiCA compliance requires regulatory sources, not just project docs

The evaluator made this explicit. MiCA whitepapers are frequently hosted by Crypto Asset Service Providers (CASPs) because the regulation places the hosting obligation on the intermediary, not on the project itself. Grey's current model only consults the project's own site, which is architecturally wrong for MiCA work regardless of whether it yields the right answer by accident.

---

## Proposed Architecture

### A. Discovery as a Tiered Resolver Chain

Replace the current single-path discovery with an explicit chain:

```
Tier 0 — Cache lookup
         (existing, fastest, highest trust for known projects)

Tier 1 — Explicit document_url
         (if provided, well-formed, and reachable)

Tier 2 — Project primary site
         (current discovery logic: aave.com, uniswap.org, etc.)

Tier 3 — Community/mirror sources
         ├─ GitHub repo docs/whitepaper files
         ├─ IPFS pins linked from project socials
         └─ Docs subdomain variants

Tier 4 — CASP-hosted whitepapers
         ├─ CoinGecko / CMC whitepaper links (public APIs)
         ├─ Major CEX listing pages (Binance EU, Coinbase, Kraken)
         └─ Indexed MiCA-compliant whitepaper registries

Tier 5 — Regulatory sources
         ├─ ESMA registry (MiCA notifications database)
         └─ National competent authority filings
```

**Key design decisions:**

- **Termination is explicit.** Each tier has a success criterion (claim count ≥ threshold, structural score ≥ threshold). The chain terminates at the first tier that meets the criteria, or exhausts all tiers.
- **Tiers are independent modules.** Each resolver owns its retry/timeout policy. No shared state. Failure of tier N does not affect tier N+1.
- **Provenance is tracked.** The deliverable records *which tier the content came from*. Evaluators and downstream consumers need to know whether this is the project's canonical version or a CEX mirror.
- **MiCA checks prefer regulatory sources.** For `claimsMicaCompliance` specifically, Tier 4–5 sources outrank Tier 2–3 when available, since they are definitionally the compliant version.

### B. Input Validator as Signal Aggregator

Replace the current field-by-field validator with a signal aggregator:

```
signals = []
if token_address is syntactically valid EVM/base58: signals.append(('token', ...))
if project_name matches KNOWN_PROTOCOL_PATTERN:    signals.append(('name',  ...))
if document_url is well-formed URL:                signals.append(('url',   ...))

if len(signals) == 0: reject with "no usable identifier"
else:                 accept and pass signals downstream
```

**Key design decisions:**

- **`document_url` reachability moves from validator to resolver.** Validator only checks syntactic well-formedness. Tier 1 resolver checks reachability and falls through to later tiers on 404 / timeout / redirect-to-landing-page.
- **Fields are not mutually required.** Any single one is sufficient.
- **The aggregator records signal quality.** A request with 3 consistent signals is treated with higher confidence than one with 1 signal. This may later inform cache TTL, freshness, and whether to cross-verify.

### C. Deliverable Schema — Separating Operational Status from Verdict

Current schema conflates these. Proposed additive schema:

```json
{
  "verdict": "PASS" | "CONDITIONAL" | "FAIL" | "INSUFFICIENT_DATA",
  "discoveryStatus": "cached" | "primary" | "community" | "casp" | "regulatory" | "failed",
  "discoverySourceTier": 0-5,
  "discoveryAttempts": [
    { "tier": 1, "outcome": "unreachable", "url": "..." },
    { "tier": 2, "outcome": "thin", "structuralScore": 1 },
    { "tier": 3, "outcome": "success", "source": "github", "claimCount": 14 }
  ],
  // ...existing fields...
}
```

**Why this matters:**

- `verdict: INSUFFICIENT_DATA` + `discoveryStatus: failed` tells a buyer: "We couldn't analyze this. Don't interpret this as a signal about the project."
- `verdict: FAIL` + `discoveryStatus: regulatory` tells a buyer: "We found the MiCA-registered document, and it is genuinely non-compliant." That is a much stronger and more valuable output.
- Evaluators can score Grey on the discovery step separately from the verdict — which is exactly what the DevRel evaluator was reaching for today with its "actionable improvement plan" on Job 1207.

---

## Implementation Plan

Design-first means we do not write code until we have answered the following.

### Phase 0 — Design decisions (before any code)

Forces decides:

1. **Scope of Tier 4 (CASP) sources.** Which CEXes do we consult? Only MiCA-registered ones (Binance EU, Coinbase, Kraken)? All majors? What's the rate-limit budget?
2. **Scope of Tier 5 (regulatory).** ESMA has a public database but not all tokens are there. Do we treat "not in ESMA" as a NO signal, or as no-signal?
3. **Tier selection per offering.**
   - Should `project_legitimacy_scan` (5-min SLA, $0.01 test / $0.25 prod) stop at Tier 2?
   - Should `full_technical_verification` (15-min SLA, $0.03 test / $3.00 prod) always traverse to Tier 5?
   - Should `verify_project_whitepaper` go to Tier 4 but stop before Tier 5 unless explicitly asked?
4. **Cache semantics across tiers.** When Tier 4 succeeds, do we cache under the same key as Tier 2 would have? Or separate cache namespaces so regulatory-grade content is not overwritten by community-grade content?
5. **Provenance disclosure in deliverables.** Is `discoverySourceTier` a number (privacy-safe), or do we include the actual URL (reveals our scraping targets — could be a competitive or legal concern)?

### Phase 1 — Signal aggregator (~1 day)

Replace per-offering validators with a shared signal aggregator. Small, contained, independently valuable. Would have prevented Failure B on its own.

### Phase 2 — Resolver chain refactor (~3–5 days)

Restructure discovery as an explicit tier chain with termination criteria and provenance tracking. Tiers 0–2 already exist. Tier 3 (GitHub) is small. Tiers 4–5 require new integrations.

### Phase 3 — Deliverable schema expansion (~1 day + migration)

Add `discoveryStatus`, `discoverySourceTier`, `discoveryAttempts` fields. Strictly additive. Existing buyers continue working unchanged.

### Phase 4 — Tier 4 & 5 integrations (~1+ week)

CASP scraper library + ESMA lookup. These are real projects of their own. Require rate-limit budgeting, caching, and legal review for CEX scraping.

**Total estimated: ~2–3 weeks of focused work.** Not a weekend project.

---

## Risks and Trade-offs

**Over-broad discovery may deliver the wrong document.** If Aerodrome has three whitepapers across sources and they disagree, which is "correct"? Design decision needed: do we score the most authoritative one, or aggregate claims across versions?

**Latency cost.** A Tier 5 traversal can take minutes. Acceptable for `full_technical_verification` (15-min SLA). Not acceptable for `project_legitimacy_scan` (5-min SLA). Tier selection per offering is a real design dimension, not just a switch.

**Legal exposure on CEX scraping.** Some exchanges' Terms of Service prohibit automated access. Need to prefer official APIs where available (CoinGecko and CMC both have them) and be conservative on direct scraping. A legal review before Phase 4 is cheap insurance.

**Deliverable schema churn.** Adding fields is safe for evaluators. Changing field semantics breaks them. Any schema change must be strictly additive from now through graduation and into launch.

**False equivalence between tiers.** A MiCA claim from the project's own site ≠ a MiCA claim from ESMA. The current `claimsMicaCompliance: "YES"` field makes no distinction. Phase 3's `discoverySourceTier` fixes this, but only if downstream consumers actually read the provenance field.

---

## Observations From the Eval (Not Failures, But Worth Noting)

**Strengths to preserve:**

- **Grey flagged a real math error in Aave V3's whitepaper.** Job 1201's `logicSummary` explicitly identified the "22% capital efficiency" claim as mathematically wrong (should be 29.3%). The `evaluations[]` array on Job 1199 marked claim-5 as `consistency: "CONTRADICTED"`. This is exactly the product we're selling.
- **All 13 expected-reject tests passed cleanly.** NSFW content, malformed addresses, future dates, out-of-scope queries ("summarize weather in Tokyo" on `full_technical_verification`) — every one rejected with a structured reason. This is the hardest thing to get right and we nailed it.
- **Zero handler crashes, zero race-condition recurrences.** The `waitForRequirement()` fix held across ~25 eval jobs under real concurrency.

**Minor bugs surfaced (unrelated to the two main gaps):**

- **`focusAreaScores` returns 0 for missing categories.** Several deliverables show `consensus: 0` or `tokenomics: 0` when the category wasn't present in the paper. The aggregator is treating absent = 0 rather than absent = null. This makes aggregate confidence scores look worse than they should. Small fix in `ScoreAggregator`.
- **Duplicate evaluator-report entries.** Job 1213 and Job 1202 both appear twice in the evaluator's output. Not our bug (it's in the evaluator's report generator), but worth flagging to Virtuals DevRel.

---

## Success Criteria

Target state after full implementation:

1. Both of today's failures pass on re-run (Aerodrome legitimacy scan, Uniswap with broken URL).
2. No regressions on today's 25 passes.
3. Deliverables distinguish "we couldn't find it" from "it's bad."
4. MiCA compliance checks hit regulatory sources when available; `claimsMicaCompliance: "YES"` means something stronger than "the project claims it on their own site."
5. **Pass rate ≥ 27/28 (96%) on next evaluator run.** With the current fail modes, we could plausibly hit 28/28 — but I'd rather build the architecture right and accept a 27/28 floor than overfit to the specific test cases the evaluator chose today.

---

## Recommendation

**Start with Phase 0: design review with Forces before any code is written.**

This is a meaningful architectural shift. It touches the resolver stack, the validator layer, the deliverable schema, and introduces external integrations. The eval failure is real but not urgent — we scored 89% on first real v2 eval, the waitForRequirement fix held, and the DevRel evaluator's own improvement plan points squarely at the work we'd be doing anyway.

Taking 2–3 weeks to do this properly beats shipping a week of quick fixes that we then have to redesign for production load. The buyers we care about most — the ones sending malformed URLs, providing only a project name, or asking MiCA questions — are exactly the ones the current design fails on. Production has no evaluator to give us actionable improvement plans; it just leaves.

Awaiting your review of Phase 0 design decisions.
