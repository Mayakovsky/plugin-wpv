# Forces Context Handoff — 2026-04-04

> Read this to resume work on Whitepaper Grey graduation. All essential context from the Kovsky session is below.

---

## Where We Are

**Eval run 20 scored 13/15.** Two failures remain. Grey needs 15/15 for manual graduation review by Virtuals DevRel.

**Grey is live** on AWS Lightsail (44.243.254.19), running Sonnet, ACP connected, 4 offering handlers registered. Ready for the next eval run.

---

## What Changed This Session (2026-04-01 → 2026-04-04)

### Code Fixes Deployed (plugin-wpv/src/WpvService.ts)
| Fix | What | Why |
|-----|------|-----|
| F1 | Added hack/exploit/phish/malware/ransomware/drainer to MALICIOUS_CONTENT_PATTERNS | "hack" was in project_name keywords but not the all-field scan |
| F2 | Expanded extractFromUnknownFields regex from 21 → 80 protocols (L1s, L2s, DeFi, infra) | "Solana" plain text wasn't matched — no L1 chains in the regex |
| F3 | Bitcoin P2PKH/P2SH/Bech32 address rejection before Solana base58 check | Bitcoin addresses passed the Solana regex |
| F4 | Cross-field consistency check (project_name vs document_url) | Contradictory inputs (Solana name + Uniswap URL) weren't caught |
| R2 | Version-strip fuzzy matching in findWhitepaper + findBestWhitepaper | "Aave V3" didn't match DB seed entry "Aave" |
| R4 | Pipeline cost logging (projectName, claims, tokens, cost) | Burn rate visibility in PM2 logs |
| tokenAddress fix | insufficientData return path preserves requested token_address | Evaluator saw tokenAddress: None on verify_project_whitepaper |

### Infrastructure Changes
| Change | Detail |
|--------|--------|
| Anthropic API Tier 2 | $50+ credits, 450k TPM / 1000 RPM (was 30k Tier 1) |
| Model: Sonnet | WPV_MODEL=claude-sonnet-4-20250514. Haiku tested but too weak for claim extraction on dense PDFs. |
| Test pricing | $0.01/$0.02/$0.03/$0.04 for scan/verify/full/briefing (distinct prices for offeringId inference) |
| plugin-acp dist symlinked | /opt/grey/wpv-agent/node_modules/@elizaos/plugin-acp/dist → /opt/grey/plugin-acp/dist |
| AcpService: readiness probe | Accepts jobs with no offeringId instead of hard-rejecting (prevents ACP indexer cooldown) |
| AcpService: price-based inference | Falls back to registered price map when SDK job.name is empty |
| AcpService: zero-memo stale flush | REQUEST-phase jobs with 0 memos classified as stale on startup |

### DB State
- 76 whitepapers, 74 verifications, 280 claims
- No duplicates per token_address
- Restored from PITR backup after accidental wipe, cleaned artifacts

---

## The 2 Remaining Failures (Eval Run 20)

### Failure 1: Aave GitHub PDF — verify_project_whitepaper
**Job:** `{"project_name": "Aave", "token_address": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2EEAe9", "document_url": "https://github.com/aave/aave-protocol/blob/master/docs/Aave_Protocol_Whitepaper_v1_0.pdf"}`

**What happened:** Grey normalized the GitHub URL correctly, fetched the PDF, spent 23k LLM tokens — but extracted 0 claims. Also returned `tokenAddress: None`.

**Root causes:**
1. **Haiku quality** — Haiku couldn't extract structured claims from the dense Aave v1 whitepaper. Now switched to Sonnet. Should fix this.
2. **tokenAddress passthrough** — Fixed. The insufficientData path now preserves the requested address.

**Expected on next run:** Sonnet should extract claims successfully. The GitHub URL normalization and PDF extraction work correctly.

### Failure 2: MakerDAO SPA — verify_project_whitepaper
**Job:** `{"project_name": "MakerDAO", "token_address": "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", "document_url": "https://makerdao.com/whitepaper/"}`

**What happened:** URL is a JavaScript SPA. FetchContentResolver fetched the HTML shell, stripped tags, got near-empty text. ClaimExtractor received nothing useful → 0 claims. Discovery fallback (DuckDuckGo) → Tier 4 composed whitepaper → also 0 claims.

**Root cause:** Grey cannot execute JavaScript. SPAs return `<div id="root"></div>` + `<script>` bundles — no text in the initial HTML.

**Fix required:** Headless browser (Playwright) to render SPAs before text extraction. Design plan at `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan.md`.

**This WILL fail again on the next eval run** unless the Evaluator happens to send a different URL for MakerDAO.

---

## Eval History (Recent)

| Run | Score | Key Issue |
|-----|-------|-----------|
| 15 | 11/16 | Aave V3 rate limit, Solana regex, hack keyword, Bitcoin addr, contradictory inputs |
| 16 (first 16/16) | 16/16 | All fixes deployed. Perfect score but report link corrupt. |
| 17-18 | NOT RUN | Wolfpack probe rejections triggered ACP cooldown |
| 19 (Butler test) | PASS | Single project_legitimacy_scan confirmed end-to-end |
| 20 | 13/15 | Aave 0 claims (Haiku), MakerDAO SPA (JS rendering) |

---

## VPS Deployment Process

**plugin-wpv** (public repo):
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
cd /opt/grey/plugin-wpv && git pull && bun install && bun run build
pm2 restart grey
# Wait for "Registered 4 offering handlers" in logs
```

**plugin-acp** (PRIVATE repo — git pull broken):
```bash
# From local machine:
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
# On VPS:
cd /opt/grey/plugin-acp && bun run build
pm2 restart grey
```

**CRITICAL:** plugin-acp dist is symlinked. Do NOT run `bun install` in wpv-agent or the symlink may break. ElizaOS re-bundles from node_modules dist on startup.

---

## Test Counts
- plugin-wpv: 303/303 (23 files)
- plugin-acp: 59/59 (2 files)
- wpv-agent: 13/13 (1 file)

---

## Test Pricing (pre-graduation)
| Offering | Test Price | Production Price |
|----------|-----------|-----------------|
| project_legitimacy_scan | $0.01 | $0.25 |
| verify_project_whitepaper | $0.02 | $1.50 |
| full_technical_verification | $0.03 | $3.00 |
| daily_technical_briefing | $0.04 | $8.00 |

Prices set in both Virtuals UI and WpvService.ts registration.

---

## Key Files
| File | Purpose |
|------|---------|
| `plugin-wpv/heartbeat.md` | Live session state, eval history, next actions |
| `plugin-wpv/CLAUDE.md` | Architecture, guardrails, deployment process |
| `plugin-wpv/BUILD DOCS and DATA/F5_Aave_V3_Diagnostic_Report.md` | Aave V3 rate limit diagnostic |
| `plugin-wpv/BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan.md` | Playwright design for SPA whitepapers — **needs Forces review** |
| `plugin-acp/src/AcpService.ts` | ACP bridge — readiness probe, price inference, stale flush |
| `plugin-wpv/src/WpvService.ts` | Validation pipeline — all F1-F4 fixes live here |
| `plugin-wpv/src/acp/JobRouter.ts` | Routing, caching, R2 version-strip, R4 cost logging |

---

## Immediate Decision Points for Forces

1. **Run another eval now?** Sonnet is active. Aave should pass. MakerDAO SPA will likely fail again. Risk: 14/15 instead of 15/15. Cost: ~$1.50 escrow + ~$0.80 API.

2. **Implement SPA headless browser first?** ~6 hours of work. Guarantees MakerDAO passes. But delays the eval run.

3. **Alternative for MakerDAO:** The Evaluator's test set isn't deterministic — it may send a different MakerDAO URL (PDF instead of SPA) on the next run. The SPA URL (`makerdao.com/whitepaper/`) is one specific test case.

4. **Review SPA design plan** at `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan.md` — 11 open questions at the bottom need Forces input before implementation.

---

## Graduation Requirements
- 15/15 pass rate on Evaluator run
- Upload Graduation Report (Google Sheets from Evaluator)
- Fill application form on Virtuals website
- Provide videos of each offering succeeding AND failing gracefully
- Human review by DevRel team

---

*Generated by Kovsky session, 2026-04-04. Verify VPS state with `pm2 logs grey --lines 30` before taking action.*
