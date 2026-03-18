# PDF Robustness Audit — 20 Whitepaper Corpus

> Task 1.3 — Gathered 2026-03-17
> Purpose: Test CryptoContentResolver + StructuralAnalyzer against diverse real-world whitepapers

## Corpus (20 whitepapers, categorized by quality)

### Tier A: High Quality (well-structured, math, citations)

| # | Project | URL | Type | Expected Score |
|---|---------|-----|------|---------------|
| 1 | Ethereum | https://ethereum.org/en/whitepaper/ | HTML | 4-5 |
| 2 | Uniswap v3 | https://uniswap.org/whitepaper-v3.pdf | PDF | 4-5 |
| 3 | Aave v3 | https://github.com/aave/aave-v3-core/blob/master/techpaper.pdf | PDF | 4-5 |
| 4 | Chainlink 2.0 | https://research.chain.link/whitepaper-v2.pdf | PDF | 4-5 |
| 5 | MakerDAO | https://makerdao.com/en/whitepaper/ | HTML | 4-5 |

### Tier B: Medium Quality (some structure, limited citations)

| # | Project | URL | Type | Expected Score |
|---|---------|-----|------|---------------|
| 6 | Lido | https://lido.fi/static/Lido:Ethereum-Liquid-Staking.pdf | PDF | 3-4 |
| 7 | Eigenlayer | https://docs.eigenlayer.xyz/assets/files/EigenLayer_WhitePaper.pdf | PDF | 3-4 |
| 8 | Pendle | https://github.com/pendle-finance/pendle-core-v2-public/blob/main/docs/PendleV2.pdf | PDF | 3-4 |
| 9 | GMX | https://gmx-io.notion.site/gmx-io/GMX-Technical-Overview-47fc5ed832e243afb9e97e8a4a036353 | HTML | 2-3 |
| 10 | Jupiter | https://station.jup.ag/docs | HTML | 2-3 |

### Tier C: Low Quality (minimal structure, hype-heavy)

| # | Project | URL | Type | Expected Score |
|---|---------|-----|------|---------------|
| 11 | Generic meme token | (synthetic — see test corpus) | N/A | 1-2 |
| 12 | Generic pump token | (synthetic — see test corpus) | N/A | 1 |
| 13 | SafeMoon (archived) | https://web.archive.org/web/2021/safemoon.net/whitepaper | HTML | 1-2 |
| 14 | BitConnect (archived) | https://web.archive.org/web/2017/bitconnect.co/whitepaper | HTML | 1 |

### Tier D: Edge Cases

| # | Project | URL | Type | Expected Issue |
|---|---------|-----|------|---------------|
| 15 | Scanned PDF (image-only) | (manual test — no text layer) | PDF | isImageOnly=true |
| 16 | Password-protected | (manual test) | PDF | isPasswordProtected=true |
| 17 | IPFS-hosted | ipfs://QmExample... | IPFS | Source fallback |
| 18 | CJK language | (manual — Chinese DeFi WP) | PDF | Partial section detection |
| 19 | Very long (100+ pages) | (manual — academic-length) | PDF | Truncation at 50KB |
| 20 | Corrupted/empty | (synthetic) | PDF | Empty analysis |

## Audit Protocol

For each whitepaper, record:

### CryptoContentResolver Output
- `text.length` (chars extracted)
- `pageCount` (estimated)
- `isImageOnly` (boolean)
- `isPasswordProtected` (boolean)
- `source` ('direct' | 'ipfs')
- Resolution time (ms)

### StructuralAnalyzer Output
- `structuralScore` (1-5 quick filter)
- `hypeTechRatio`
- Sections detected: abstract, methodology, tokenomics, references
- `citationCount` + `verifiedCitationRatio`
- `hasMath` + `mathDensityScore`
- `coherenceScore`
- MiCA: `claimsMicaCompliance`, `micaCompliant`, `micaSectionsFound`

### ClaimExtractor Output (5 representative PDFs only — costs ~$0.15 each)
- Number of claims extracted
- Category distribution (TOKENOMICS/PERFORMANCE/CONSENSUS/SCIENTIFIC)
- `regulatoryRelevance` flagged claims
- Token usage + cost

## Findings Summary

### What Works Well
- Section detection: abstract/methodology/tokenomics/references regex patterns are robust
- Math detection: LaTeX and Unicode math symbols correctly identified
- DOI citation counting: accurate for academic-style papers
- Hype/tech ratio: effectively distinguishes meme tokens from real projects
- MiCA compliance: structural check correctly identifies presence/absence of required sections
- Coherence score: reasonable variance-based metric

### Known Gaps

#### 1. Image-Only PDF Detection (CRITICAL)
**Issue:** Page count is estimated from text length. A scanned 10-page PDF with 50 chars
of garbled OCR output estimates as 1 page, bypassing the `pageCount > 1` guard.

**Impact:** ~5-10% of crypto whitepapers are scanned image PDFs.

**Mitigation (v1):** Pipeline returns INSUFFICIENT_DATA verdict. Image-only count tracked in WPV_STATUS.

**Fix (Phase 2):** Pass real PDF page count from pdf-parse metadata, not text-based estimate.

#### 2. OCR Gap
**Issue:** No OCR capability. Scanned PDFs return near-zero text.

**Options evaluated:**
| Option | Cost | Accuracy | Speed | Verdict |
|--------|------|----------|-------|---------|
| Tesseract.js (local) | Free | 70-80% | 5-15s/page | Defer to Phase 2 |
| Google Vision API | $1.50/1K pages | 95%+ | 1-3s/page | Defer to Phase 2 |
| AWS Textract | $1.50/1K pages | 95%+ | 2-5s/page | Defer to Phase 2 |
| Accept gap | $0 | N/A | N/A | **Current (v1)** |

**Recommendation:** Accept the gap for v1. The pipeline gracefully handles it (INSUFFICIENT_DATA).
OCR adds complexity and cost that isn't justified until the daily verification volume exceeds ~50 WPs
and image-only PDFs become a significant fraction of missed verifications.

#### 3. Text Truncation at 50KB
**Issue:** ClaimExtractor truncates input to first 50KB (~16 pages).
Long whitepapers may lose critical sections (e.g., tokenomics in chapter 9).

**Impact:** Low — most crypto whitepapers are <30 pages.

**Mitigation:** StructuralAnalyzer runs on full text. Only claim extraction is truncated.

#### 4. Non-English Content
**Issue:** Section detection regex patterns are English-only.
Mixed-language documents may miss section headings.

**Impact:** Low for Base chain (predominantly English projects).

**Mitigation:** Tokenomics keywords are detected even in mixed-language docs.

#### 5. HTML Whitepapers
**Issue:** Some projects host whitepapers as web pages (Notion, GitBook, docs sites).
These extract well but page estimation uses 4000 chars/page (less accurate than PDF).

**Impact:** Low — estimation is only used for image-only detection threshold.

## Image-Only Tracking

Added to `WPV_STATUS` action output:
- `imageOnly` count in status response
- Displayed as: "X image-only (no text extraction)" when > 0
- Stored in `metadataJson.isImageOnly` on whitepaper records
