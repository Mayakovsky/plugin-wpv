# Eval Run 27 Analysis — 14/16

**Date:** 2026-04-06
**Eval run:** 27
**Score:** 14/16 (2 failures) — best score yet
**Analyst:** Claude Opus (Kovsky context window)
**Status:** Pending Forces review

---

## Score by Offering

| Offering | Score | Notes |
|----------|-------|-------|
| daily_technical_briefing | **4/4** | PERFECT — 3rd consecutive perfect briefing score |
| project_legitimacy_scan | **4/4** | PERFECT — Chainlink + Uniswap passed, invalid addr + burn addr rejected |
| verify_project_whitepaper | **4/4** | PERFECT — Chainlink v1 + Uniswap v3 PDFs analyzed correctly, 404 + malformed URL rejected |
| full_technical_verification | **2/4** | 2 failures: Chainlink V2 wrong version, Bitcoin price query not rejected |

---

## Major Wins

- **Uniswap v3 PASSED on full_tech** (job 1003342734) — 15 claims about concentrated liquidity, ticks, virtual reserves. Version-aware cache + known URL map worked perfectly. Was failing since eval 25.
- **verify_project_whitepaper 4/4 PERFECT** — first time ever. Includes 404 hard-reject working.
- **Briefing 4/4 with empty result accepted** — `{"date": "2026-04-05"}` returned `totalVerified: 0, whitepapers: []` (DB was purged). Evaluator accepted this as honest. Date-specific briefings confirmed working.
- **Chainlink discovered + analyzed live** — known URL map → `research.chain.link/whitepaper-v2.pdf` → 10 claims. First time Chainlink passed.

---

## The 2 Failures

### F1: full_tech — Chainlink V2 requested, V1 served

**Job:** 1003342736
**Requirement:** `"Analyze the security and decentralization claims of the Chainlink oracle network based on their V2 whitepaper."`
**Expected:** Analysis of Chainlink V2 (2021) — DONs, super-linear staking
**Actual:** Served V1 (2017) claims — Algorithm 1, ERC223, threshold signatures

**What happened:** Plain text parsed `project_name: "Chainlink"` (no version extracted — "V2" is in "V2 whitepaper" not "Chainlink V2"). The known URL map has only `\bchainlink\b` → `research.chain.link/whitepaper-v2.pdf`. Confusingly, this URL IS the V2 whitepaper — but the cached data from the earlier legitimacy scan (job 1003342717) analyzed the same PDF and stored 10 claims. The full_tech handler found these cached claims and returned them.

**Root cause (two issues):**

1. **Protocol regex doesn't capture "V2" from "V2 whitepaper"** — the regex captures `\b(Chainlink)\s*(v\d+)?\b` but in the text "Chainlink oracle network based on their V2 whitepaper", "V2" is not adjacent to "Chainlink". The regex gets `match[0] = "Chainlink"` with no version. So `project_name = "Chainlink"` (no version).

2. **Cache served the same V1/V2 confusion** — The known URL map entry `research.chain.link/whitepaper-v2.pdf` IS the V2 whitepaper. The legitimacy scan analyzed it and got 10 claims. But the evaluator says these are V1 claims (Algorithm 1, ERC223, threshold signatures). This means either:
   - The URL actually serves the V1 paper (mislabeled as v2), OR
   - The PDF contains V1 content reprinted/updated in V2

   **This needs verification** — curl the URL and check what document it actually contains.

**Fix:** Two parts:
1. Add a Chainlink V2-specific known URL entry. Find the ACTUAL Chainlink 2.0 whitepaper URL (likely `chain.link/whitepaper-v2.pdf` or on arXiv). The `research.chain.link/whitepaper-v2.pdf` appears to be the V1 paper despite the filename.
2. Improve version extraction from plain text — the regex should handle "based on their V2 whitepaper" by scanning for version strings near project names, not just immediately after them.

---

### F2: full_tech — "What is the current market price of Bitcoin on Binance?"

**Job:** 1003342738
**Requirement:** `"What is the current market price of Bitcoin on Binance?"`
**Expected:** Reject at REQUEST phase (out of scope)
**Actual:** Accepted, analyzed Bitcoin whitepaper, delivered unrelated analysis

**What happened:** Plain text parsing extracted `project_name: "Bitcoin"` (in the known protocol list). The validator saw a valid project name and accepted. The pipeline ran the full Bitcoin whitepaper analysis — high quality (14 claims, confidenceScore 79) but completely irrelevant to the question.

**Root cause:** Grey has no **scope validation** — it checks whether inputs are technically valid (valid address, valid URL, valid date) but never checks whether the QUESTION is within scope. "What is the current market price" is a real-time data query, not a whitepaper verification request. Grey's offerings are:
- project_legitimacy_scan
- verify_project_whitepaper
- full_technical_verification
- daily_technical_briefing

None of these are "answer any question about crypto." The evaluator explicitly says: *"a real-time price query completely outside the agent's stated scope of 'whitepaper verification'."*

**Fix:** Add an **out-of-scope detector** for plain text requirements on full_technical_verification. When the requirement text doesn't contain any whitepaper/verification/analysis keywords AND contains out-of-scope keywords (price, market, buy, sell, trade, exchange, portfolio, wallet balance), reject with a message like "Requirement is outside scope — this service provides whitepaper technical verification, not market data."

This is a narrow check — only for plain text requirements, only on full_tech (which accepts free-form questions). Structured JSON requirements with project_name/token_address are always in scope.

---

## Fix Summary

| # | Fix | Impact | Complexity |
|---|-----|--------|------------|
| 1 | **Chainlink V2 whitepaper URL** — verify actual V2 paper, add version-specific known URL entry | Fixes F1 | LOW |
| 2 | **Out-of-scope detector** — reject plain text requirements that are clearly not whitepaper verification | Fixes F2 | LOW-MEDIUM |

Both fixes are validation-level changes. No architectural work needed.

---

## Eval Trajectory

| Run | Score | Total | Key Change |
|-----|-------|-------|-----------|
| 24 | 8/16 | 16 | DocsSiteCrawler gap |
| 25 | 12/16 | 16 | Empty Address, version mismatch, requirement-aware pipeline |
| 26 | 13/16 | 16 | 404 hard-reject, version-aware cache, synthesis on cache |
| **27** | **14/16** | **16** | **Chainlink V2 URL wrong, out-of-scope query not rejected** |

Two failures away from graduation. Both are edge cases with targeted fixes.

---

*Pending Forces review.*
