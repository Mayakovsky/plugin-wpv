# Eval Run 23 Analysis — 13/18

**Date:** 2026-04-05
**Eval run:** 23
**Score:** 13/18 (5 failures)
**Analyst:** Claude Opus (Forces context window)
**Status:** Pending Forces review before implementation

---

## Score by Offering

| Offering | Score | Notes |
|----------|-------|-------|
| daily_technical_briefing | 6/7 | 1 failure: malformed key accepted |
| full_technical_verification | 2/4 | 2 failures: Lido + MakerDAO discovery gaps |
| project_legitimacy_scan | 2/3 | 1 failure: USDC MiCA false negative |
| verify_project_whitepaper | 3/4 | 1 failure: Aave 404 hard-rejected instead of fallback |

---

## Failure Breakdown

### F1: Briefing accepted malformed schema key (`day` instead of `date`)

**Job:** 1003333598
**Requirement:** `{"day": "2026-04-05"}`
**Expected:** Reject at REQUEST phase
**Actual:** Accepted, delivered full briefing using today's date

**What happened:** The evaluator sent `day` instead of `date`. Grey's briefing validator checks for bad date *values* (`"last-tuesday"`, `"not-a-date"` — both correctly rejected in other tests) but doesn't check for the *absence of the `date` key itself*. When `date` is missing, Grey falls through to a default (today's date) and delivers normally.

**Root cause:** Missing strict key validation in the briefing handler. The validator checks `if (requirement.date && !isValidDate(requirement.date))` but never checks `if (!requirement.date && Object.keys(requirement).length > 0)` — meaning a requirement with any non-`date` keys gets treated as "no date specified, use today."

**Fix:** In the briefing input validator, reject when the requirement contains keys but `date` is absent. Specifically: if the requirement object has properties but none of them is `date`, reject with a message like "Unknown field 'day' — expected 'date' in YYYY-MM-DD format."

**Complexity:** One conditional check. Surgical.

---

### F2: Lido — 0 claims, INSUFFICIENT_DATA

**Job:** 1003333584
**Requirement:** "Perform a full L1+L2+L3 technical verification of the Lido Finance protocol whitepaper."
**Expected:** Accept and deliver verification with claims
**Actual:** 0 claims, structuralScore 1, verdict INSUFFICIENT_DATA

**What happened:** Grey couldn't find Lido's whitepaper through any discovery tier. The evaluator notes that Lido has multiple whitepapers (v1, v2, v3) and technical RFCs hosted on HackMD, GitBook, and governance forums — none of which Grey's WebSearchFallback can reliably locate via DuckDuckGo.

**Root cause:** Same class of problem as Chainlink — the whitepaper isn't at an obvious `lido.fi/whitepaper.pdf` URL. Lido's technical documentation is distributed across `research.lido.fi`, HackMD, and governance forums. DuckDuckGo's `filetype:pdf` queries don't surface these.

**Fix:** Two-part:
1. Add `lido` to `KNOWN_WHITEPAPER_URLS` map with the actual research paper URL
2. Broaden WebSearchFallback queries to include `"{project} protocol specification"`, `"{project} technical RFC"`, `"{project} research paper"` patterns

**Complexity:** Known URL map entry + query pattern additions in WebSearchFallback.

---

### F3: MakerDAO — 0 claims (SPA + discovery gap, recurring)

**Job:** 1003333586
**Requirement:** "Mathematical evaluation and claim extraction for the MakerDAO whitepaper." (plain text, no document_url)
**Expected:** Accept and deliver verification with claims
**Actual:** 0 claims, structuralScore 1, verdict INSUFFICIENT_DATA

**What happened:** No `document_url` provided. Grey parsed "MakerDAO" as the project name and ran discovery. WebSearchFallback couldn't locate the MakerDAO whitepaper PDF. The SPA at `makerdao.com/whitepaper/` was presumably not tested because no URL was provided — this went straight to name-based discovery.

**Root cause:** WebSearchFallback's DuckDuckGo queries don't find the MakerDAO whitepaper. The actual PDF exists but isn't easily discoverable through Grey's current search patterns.

**Fix:** Add `makerdao` to `KNOWN_WHITEPAPER_URLS` map. Same fix as F2 — the known URL map is the right pattern for well-documented protocols whose whitepapers live at non-obvious URLs.

**Complexity:** One map entry.

---

### F4: USDC MiCA — false negative on compliance

**Job:** 1003333571
**Requirement:** `{"project_name": "USDC", "token_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}`
**Expected:** Accept with accurate MiCA assessment
**Actual:** Grey reported 3/7 MiCA sections found, `PARTIAL` compliance. Evaluator says Circle's USDC whitepaper is independently validated as fully MiCA-compliant.

**What happened:** Grey found the document (10 claims extracted, so content resolution worked). StructuralAnalyzer's MiCA section detection found 3/7 required sections but missed governance, risk disclosure, rights obligations, and environmental impact — sections the evaluator confirms exist in Circle's documentation.

**Root cause:** StructuralAnalyzer's MiCA section-matching patterns are too rigid. They look for specific heading text (e.g., "Governance", "Environmental Impact") but Circle's whitepaper likely uses different terminology. For example:
- "Governance" → might be "USDC Governance Framework" or "Circle Governance Structure"
- "Environmental Impact" → might be "Sustainability" or "ESG Commitments"
- "Risk Disclosure" → might be "Risk Factors" or "Risk Management Framework"
- "Rights and Obligations" → might be "Holder Rights" or "Terms of Service"

**Fix:** Widen the MiCA section detection regex patterns in StructuralAnalyzer to match common alternative phrasings for each of the 7 required sections. This is a regex tuning exercise — add synonym patterns for each MiCA section category.

**Complexity:** Moderate. Need to audit Circle's actual whitepaper to identify the exact phrasings, then generalize the patterns. Should also audit other projects that claimed MiCA sections are missing to check for similar false negatives.

**Note:** This is the first eval failure caused by *analysis accuracy* rather than *content discovery*. The pipeline found the content — it just misclassified it. Different class of bug.

---

### F5: Aave 404 — hard reject instead of discovery fallback

**Job:** 1003333579
**Requirement:** `{"project_name": "Aave", "token_address": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAeE", "document_url": "https://aave.com/aave-v3-whitepaper.pdf"}`
**Expected:** Accept, fall back to discovery, deliver verification
**Actual:** Hard-rejected at REQUEST phase: "Invalid document_url: URL returned HTTP 404"

**What happened:** The evaluator sent a stale Aave URL that returns 404. Grey's `document_url` validator does a HEAD/GET check during REQUEST phase and rejects if the URL isn't reachable. But 404 doesn't mean the job is invalid — it means the evaluator's URL is stale. Grey has Aave in its DB with 24 claims. It should accept the job, note the broken URL, and serve from cache or rediscover.

**Root cause:** The `document_url` validator treats 404 as grounds for hard rejection. This is overly aggressive. 404 means "this specific document isn't at this URL anymore" — it doesn't mean the project doesn't have a whitepaper. The validator should only hard-reject on truly invalid inputs (malformed URLs, NSFW domains, non-document content types like images/video).

**Fix:** Change the 404 handling in the `document_url` validator:
- **Current:** 404 → reject job at REQUEST phase
- **New:** 404 → accept job, log warning about broken URL, proceed with discovery fallback (check cache by project_name/token_address, then run TieredDocumentDiscovery)

This is the same pattern as the redirect-to-homepage detection from the Chainlink plan — treat broken URLs as discovery triggers, not rejection triggers.

**Complexity:** Moderate. The validation logic needs restructuring — currently 404 is caught in the same block as malformed URLs. Need to separate "URL is garbage" (reject) from "URL is stale" (accept + fallback).

---

## Proposed Fix Priority

| # | Fix | Files | Impact |
|---|-----|-------|--------|
| F1 | Strict briefing key validation | WpvService or JobRouter (briefing handler) | Blocks 1 test |
| F5 | 404 → soft-warn + discovery fallback | WpvService (document_url validator) | Blocks 1 test |
| F2/F3 | Known URL map + broader search queries | WebSearchFallback.ts | Blocks 2 tests |
| F4 | Widen MiCA section detection patterns | StructuralAnalyzer.ts | Blocks 1 test |

F1 and F5 are validation logic — quick fixes.
F2/F3 are the known URL map already planned in `Grey_Kovsky_Execution_ChainlinkPendle.md` — add Lido and MakerDAO entries alongside Chainlink.
F4 is a new class of issue (analysis accuracy) that needs a targeted audit of the MiCA detection regex.

---

## Eval Trajectory

| Run | Score | Total Tests | Key Change |
|-----|-------|------------|------------|
| 20 | 13/15 | 15 | Switched to Sonnet, tokenAddress fix |
| 21 | 13/16 | 16 | Chainlink redirect, Aave cache, Bitcoin cross-ref |
| 22 | 15/19 | 19 | Ethena regex, Playwright libs, EOA hardening |
| 23 | 13/18 | 18 | Briefing key, Lido/MakerDAO discovery, USDC MiCA, Aave 404 |

The evaluator continues to expand and rotate its test suite. The test count fluctuates (15 → 16 → 19 → 18) and the specific projects tested change between runs. Grey's absolute pass count has held at 13-15 while the evaluator probes new edge cases each run.

The failures are shifting from pipeline infrastructure (SPA rendering, regex matching) to validation logic (key checking, 404 handling) and analysis accuracy (MiCA section detection). This is progress — the hard architectural problems are solved, and what remains is tightening the edges.

---

## Relationship to Existing Plans

The Chainlink/Pendle execution plan (`Grey_Kovsky_Execution_ChainlinkPendle.md`) already covers the `KNOWN_WHITEPAPER_URLS` pattern and WebSearchFallback improvements. F2 and F3 are additions to that same map — not new architecture.

F1 (briefing key validation) and F5 (404 soft-warn) are new issues not covered by any existing plan.

F4 (MiCA accuracy) is a new class of issue that needs its own targeted investigation.

---

*Pending Forces review. Kov may have independent analysis from VPS logs — compare notes before implementing.*
