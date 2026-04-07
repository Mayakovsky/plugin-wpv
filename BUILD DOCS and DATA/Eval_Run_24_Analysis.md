# Eval Run 24 Analysis — 8/16

**Date:** 2026-04-05
**Eval run:** 24
**Score:** 8/16 (8 failures — worst since eval 14)
**Analyst:** Claude Opus (Kovsky context window)
**Status:** Needs Forces strategy review before implementation

---

## Score by Offering

| Offering | Score | Notes |
|----------|-------|-------|
| daily_technical_briefing | 2/4 | Both accept-and-deliver jobs REJECTED by evaluator (quality + not date-specific) |
| full_technical_verification | 2/4 | Jupiter thin (3 claims), Pyth 0 claims |
| project_legitimacy_scan | 2/4 | Seamless 0 claims, Aerodrome 0 claims |
| verify_project_whitepaper | 2/4 | Seamless thin (5 claims, 1/7 MiCA), Aerodrome 0 claims from PDF |

All 8 rejections passed. All 8 accept-and-deliver jobs failed. **Every failure involves Seamless Protocol or Aerodrome Finance** — two Base-native DeFi protocols the evaluator introduced this run.

---

## This Is NOT a Code Regression

The pre-eval 24 hardening (5-task plan) didn't break anything. The 8 tests that don't involve Seamless/Aerodrome all passed, including:
- Rejection tests: all correct (malformed addresses, invalid URLs, bad dates)
- Known protocols: Uniswap V3 (21 claims), Solana (16 claims), Aave (14 claims), Ethereum (20 claims), Ethena (9 claims)
- JUP cached result served correctly from cache (3 claims — but evaluator says this is too thin, see F5)

The evaluator rotated its positive test cases to probe Base-native DeFi projects with documentation-site-style whitepapers. Grey can't handle these.

---

## The 8 Failures

### F1: legitimacy_scan — Seamless Protocol (0 claims)

**Job:** 1003337235
**Requirement:** `{"project_name": "Seamless Protocol", "token_address": "0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85"}`
**Expected:** Accept with legitimate scan result
**Actual:** 0 claims, 0/7 MiCA, verdict CONDITIONAL

**What happened:** `findWhitepaper` returned null (0-claim cache skip working correctly). Live L1 discovery ran. DuckDuckGo search found docs.seamlessprotocol.com. Grey fetched the landing page — got the introduction text. Structural analysis scored it 2. But only the intro page was analyzed — governance, smart contracts, audit reports, legal sections all live on sub-pages that Grey never visited.

**Evaluator feedback:** *"Seamless Protocol has extensive, well-structured documentation (docs.seamlessprotocol.com) that covers governance, integrated liquidity markets (technology), and risk disclosures. The agent's failure to locate and analyze these primary sources indicates a significant deficiency."*

---

### F2: legitimacy_scan — Aerodrome Finance (0 claims)

**Job:** 1003337236
**Requirement:** `{"project_name": "Aerodrome Finance", "token_address": "0x940181a94a35a4569e4529a3cdfb74e38fd98631"}`
**Expected:** Accept with legitimate scan result
**Actual:** 0 claims, 0/7 MiCA, verdict CONDITIONAL

**What happened:** `findBestWhitepaper: all candidates have 0 claims — treating as cache miss` (log confirmed). Discovery ran. Landed on Virtuals page (429 chars). SPA link-following triggered on the Virtuals page — but that's the wrong page. Should have found docs.aerodrome.finance instead.

**Evaluator feedback:** *"Aerodrome Finance is a major, well-documented project with a MiCA-compliant whitepaper and extensive technical documentation (docs.aerodrome.finance) covering governance, mechanics, and risks."*

---

### F3: verify_whitepaper — Seamless Protocol (5 thin claims)

**Job:** 1003337241
**Requirement:** `{"project_name": "Seamless Protocol", "token_address": "...", "document_url": "https://docs.seamlessprotocol.com/"}`
**Expected:** Accept with full verification
**Actual:** 5 claims from intro page only, 1/7 MiCA, verdict CONDITIONAL

**What happened:** Grey fetched `docs.seamlessprotocol.com/` — the landing page. Got the introduction text. Extracted 5 claims from the intro. Never followed sidebar links to Governance Overview, Smart Contracts, Audit Reports, Legal.

**Evaluator feedback:** *"The agent failed to navigate or parse the 'Governance Overview', 'Smart Contracts', 'Audit Reports', and 'Legal' sections which were readily accessible."*

**This is the clearest statement of the problem:** Grey reads one page. Documentation sites spread content across sub-pages. Grey needs to crawl.

---

### F4: verify_whitepaper — Aerodrome Finance (0 claims from PDF)

**Job:** 1003337244
**Requirement:** `{"project_name": "Aerodrome Finance", "token_address": "...", "document_url": "https://aerodrome.finance/whitepaper.pdf"}`
**Expected:** Accept with verification from provided PDF
**Actual:** structuralScore 3, 0 claims, INSUFFICIENT_DATA

**What happened:** The PDF was fetched (structural score 3 means content was found). But ClaimExtractor returned 0 claims. This could mean:
1. The PDF is image-only (scanned document)
2. The PDF content is too short or structured in a way Sonnet can't parse
3. The PDF URL redirected to something unexpected

**This needs investigation** — curl the URL, check content-type and size. If it's a real PDF with text content and Sonnet returned 0 claims, that's a ClaimExtractor bug. If it's image-only, it's the known OCR gap.

---

### F5: full_tech — Jupiter (3 thin claims, confidenceScore 0)

**Job:** 1003337247
**Requirement:** `{"project_name": "Jupiter", "token_address": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"}`
**Expected:** Accept with deep L1+L2+L3 analysis
**Actual:** 3 claims, confidenceScore 0, empty claimScores/evaluations/focusAreaScores

**What happened:** Known URL map hit `docs.jup.ag`. Grey fetched the root page — got API reference documentation, not whitepaper content. Extracted 3 thin API-level claims. L3 evaluation ran but produced nothing substantive. The `confidenceScore: 0` and empty `evaluations` array suggest the L3 pipeline failed or found nothing to evaluate.

**Root cause:** The known URL map entry for Jupiter points to the docs root (`docs.jup.ag`), which is an API reference site. The actual whitepaper/overview content lives on sub-pages. Additionally, the cached result from earlier (3 claims) was served by a different handler — but when the evaluator tests full_tech, it expects L3 depth.

**Evaluator feedback:** *"Official MiCA-compliant whitepapers and extensive technical documentation for Jupiter are readily available online."*

---

### F6: full_tech — Pyth Network (0 claims, INSUFFICIENT_DATA)

**Job:** 1003337248
**Requirement:** `{"project_name": "Pyth Network", "token_address": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3"}`
**Expected:** Accept with deep analysis
**Actual:** 0 claims, INSUFFICIENT_DATA

**What happened:** Pyth is not in the known URL map. DuckDuckGo search presumably failed to find docs.pyth.network or the Pyth Whitepaper 2.0. Discovery returned nothing usable. Pipeline ran on thin/no content.

**Fix (immediate):** Add Pyth to known URL map. `docs.pyth.network` has comprehensive documentation. But the deeper problem is the same — even if we find the docs site, Grey only reads the landing page.

---

### F7 + F8: daily_technical_briefing — Two Failures

**Jobs:** 1003337254 (date: 2026-04-05), 1003337255 (date: 2026-04-01)

**Two distinct problems:**

**Problem A: Briefings contain false negatives.** The briefing includes Aerodrome (0 claims) and Seamless (5 thin claims) alongside high-quality entries (Uniswap 21 claims, Solana 16 claims). The evaluator rejects the whole briefing because it contains inaccurate entries. This is a downstream consequence of the discovery/crawling gap — the briefing is only as good as the underlying verifications.

**Problem B: Briefings are not date-specific.** `handleDailyBriefing` calls `getLatestDailyBatch()` and `getMostRecent()` for every request. The `date` parameter only sets the response's `date` field — it does NOT filter verifications by date. Both dates received identical content.

**Evaluator feedback:** *"The agent provided an identical list of project results for this date (2026-04-01) as it did for a different date request (2026-04-05), suggesting it is not generating date-specific briefings."*

---

## Three Systemic Issues

### Issue 1: No Sub-Page Crawling on Documentation Sites (CRITICAL)

**The #1 problem.** Grey reads one page per URL. Modern DeFi projects don't publish single-page whitepapers — they publish documentation sites (GitBook, Docusaurus, ReadTheDocs, custom) with content spread across dozens of sub-pages.

The Task 3 SPA link-following we implemented only fires inside HeadlessBrowserResolver, which only triggers when:
1. Initial fetch returns < 500 chars (SPA detection), AND
2. Playwright is available and has RAM

Documentation sites return server-rendered HTML with plenty of text (> 500 chars). They don't trigger SPA detection. Grey reads the intro page, finds enough text to skip enhanced resolution, and sends it to ClaimExtractor — which correctly extracts only intro-level claims.

**What's needed:** A general-purpose "documentation site crawler" that:
1. Detects when a URL is a documentation site (GitBook, Docusaurus, ReadTheDocs, etc.)
2. Extracts the navigation/sidebar structure
3. Follows internal links to key sections (governance, technology, risks, tokenomics)
4. Concatenates content from relevant sub-pages into a single document
5. Feeds the concatenated text to the verification pipeline

This is architecturally different from SPA link-following (which uses Playwright). Documentation sites serve plain HTML — a simple HTTP crawler with link scoring would work. No browser needed.

**Key constraint:** Must be bounded. Max sub-pages, max total chars, max wall time. Same approach as HeadlessBrowserResolver link-following but using plain HTTP fetches.

---

### Issue 2: Known URL Map Points to Roots, Not Content (MEDIUM)

Several known URL map entries point to documentation site roots:
- `docs.jup.ag` → API reference landing page, not whitepaper
- `docs.frax.finance` → root docs page
- `docs.dydx.exchange` → root docs page
- `docs.raydium.io` → root docs page
- `docs.sushi.com` → root docs page

These entries "work" in that they return 200 and have content, but the content is an intro/index page, not the actual whitepaper substance. When ClaimExtractor runs on an intro page, it gets thin results.

**Fix options:**
1. Point entries to specific whitepaper/overview URLs instead of roots (requires manual curation)
2. Implement sub-page crawling (Issue 1) so roots become useful starting points
3. Both — curated deep URLs as primary, root URLs as fallback for crawling

---

### Issue 3: Briefings Not Date-Specific (MEDIUM)

`handleDailyBriefing` ignores the `date` parameter when selecting verifications. It pulls `getLatestDailyBatch()` + `getMostRecent()` every time. Two different dates return identical content.

**Fix:** The verification table has a `verified_at` timestamp (or similar). Filter verifications to the requested date range. If no verifications exist for the requested date, return an empty briefing or a "no data for this date" response — don't backfill with latest.

**Complexity:** Low for basic implementation. The repos already have timestamp-based queries.

---

## Proposed Fix Priority

| # | Fix | Impact | Complexity | Blocks |
|---|-----|--------|------------|--------|
| 1 | Documentation site sub-page crawler | Fixes F1, F2, F3, F5, F7, F8 | HIGH — new architectural component | 6 of 8 failures |
| 2 | Aerodrome PDF investigation | Fixes F4 | LOW — diagnostic, possibly OCR gap | 1 failure |
| 3 | Pyth + better known URL entries | Fixes F6, partially F5 | LOW — map entries | 1-2 failures |
| 4 | Date-specific briefings | Fixes F8 | MEDIUM — query changes | 1 failure |
| 5 | Exclude 0-claim entries from briefings | Partially fixes F7 | LOW — filter in handler | 1 failure (quality) |

**Issue 1 (sub-page crawling) is the gating item.** Without it, any documentation-site-based project will fail across all offerings. The evaluator has demonstrated it will test these projects. Fixing Issues 2-5 without Issue 1 would still leave Grey unable to handle the core failure pattern.

---

## Architecture Sketch: Documentation Site Crawler

```
CryptoContentResolver.resolveWhitepaper(url)
  → FetchContentResolver.resolve(url)
  → IF content looks like a docs site landing page (nav links, short intro, sidebar structure):
      → DocsSiteCrawler.crawl(url, maxPages=10, maxChars=50000)
        → Extract navigation links from HTML (sidebar, nav, table of contents)
        → Score links by MiCA relevance (governance, technology, risk, tokenomics)
        → Fetch top N sub-pages via plain HTTP (no Playwright needed)
        → Concatenate content, return as single document
  → Feed concatenated text to L1 (StructuralAnalyzer) + L2 (ClaimExtractor)
```

**Detection heuristics for "docs site landing page":**
- URL contains `docs.` or `/docs/` in hostname/path
- HTML contains sidebar/nav elements (`<nav>`, `role="navigation"`, `class="sidebar"`)
- Multiple internal links with documentation-like paths (`/governance`, `/architecture`, `/risks`)
- Content length > 500 chars but < 5000 chars (substantial enough to not trigger SPA detection, but not a full document)

**This should be a new class** (`DocsSiteCrawler`) in `src/discovery/`, sitting alongside `HeadlessBrowserResolver` and `SiteSpecificRegistry` as Layer 3.5 in the resolution chain.

---

## Relationship to Existing Code

- **HeadlessBrowserResolver** link-following (Task 3) handles SPAs. DocsSiteCrawler handles server-rendered docs sites. Different trigger, different mechanism, complementary.
- **SiteSpecificRegistry** handles known platforms (GitBook markdown probe). DocsSiteCrawler is generic — works on any docs site regardless of platform.
- **FetchContentResolver** stays as-is. DocsSiteCrawler sits in CryptoContentResolver's resolution chain, between "direct fetch returned thin content" and "try Playwright."

---

## Eval Trajectory

| Run | Score | Total | Key Issue |
|-----|-------|-------|-----------|
| 20 | 13/15 | 15 | Haiku quality, SPA gap |
| 21 | 13/16 | 16 | Chainlink redirect, Aave cache, Bitcoin cross-ref |
| 22 | 15/19 | 19 | Ethena regex, Playwright libs, EOA |
| 23 | 13/18 | 18 | Briefing key, Lido/MakerDAO discovery, USDC MiCA, Aave 404 |
| **24** | **8/16** | **16** | **Seamless/Aerodrome docs sites — sub-page crawling gap** |

The evaluator is now testing documentation-site-based projects systematically. This is the next class of failure to solve. Previous classes (SPA rendering, redirect detection, validation logic) are all handled. This one requires new architecture.

---

*Ready for Forces strategy review. Do not implement until approach is confirmed.*
