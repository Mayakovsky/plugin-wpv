# Whitepaper Grey — Graduation Report

> **Date:** 2026-04-09
> **Result:** 24/24 perfect score on Virtuals.io graduation evaluator (eval 37)
> **Agent:** Whitepaper Grey — autonomous crypto whitepaper verification
> **Wallet:** 0x48A5F194eeB6e7C62FfF6f9EB6d81C115C7936f2
> **Protocol:** Virtuals Agent Commerce Protocol (ACP) on Base

---

## What This Agent Does

Whitepaper Grey is a provider agent on the Virtuals ACP marketplace. It accepts jobs from buyer agents (via on-chain transactions) to verify crypto project whitepapers. Four offerings:

| Offering | What It Does | Pipeline |
|----------|-------------|----------|
| `project_legitimacy_scan` | Quick L1 structural analysis | Cache or live discovery + structural score |
| `verify_project_whitepaper` | L1+L2+L3 claim extraction + evaluation | Cache or live with Sonnet claim extraction |
| `full_technical_verification` | Deep L1+L2+L3 with requirement-aware synthesis | Full pipeline + Sonnet synthesis for buyer's question |
| `daily_technical_briefing` | Summary of recent verifications | Read-only aggregation from DB |

---

## Architecture Summary

```
Input (ACP WebSocket / HTTP)
  → AcpService (plugin-acp): parse requirement, validate, accept/reject
  → WpvService (plugin-wpv): validate token_address, content filtering
  → JobRouter: route to handler, mutex (except briefings), 4-min timeout
    → Cache lookup (findWhitepaper / findBestWhitepaper)
    → OR live pipeline:
      → CryptoContentResolver: fetch → SPA detection → Playwright → DocsSiteCrawler
      → StructuralAnalyzer (L1): structural score, hype/tech ratio
      → ClaimExtractor (L2): Sonnet structured output → claims
      → ClaimEvaluator (L3): 5 evaluation methods → scores
      → ScoreAggregator: confidence score → verdict
      → ReportGenerator: tiered JSON report
  → AcpService: deliver on-chain via ERC-4337 UserOperation
```

**Key infrastructure:**
- **AbortController threading** — pipeline timeout cancels fetch/Playwright cleanly, prevents orphaned renders from blocking next job via `_renderLock` mutex
- **Briefing mutex exemption** — read-only briefings bypass the job lock, preventing SLA violations
- **Min text threshold** — ClaimExtractor skips Sonnet for text < 200 chars (SPA shells return instantly)
- **3-stage plain-text parser** — KNOWN_PROTOCOL_PATTERN → structural extraction → generic regex. Handles "Uniswap v3 (0x...)", "Aerodrome Finance (0x...) for ve(3,3)", address-only inputs
- **resolveTokenName fallback** — DexScreener + on-chain ERC-20 name() when parser fails, including after soft-strip
- **Shared protocol list** — `src/constants/protocols.ts` canonical source, AcpService inline copy with SYNC comment
- **Discovery stack** — TieredDocumentDiscovery → WebSearchFallback (known URL map) → web search → SyntheticWhitepaperComposer

---

## Repos and Deployment

| Repo | Location | Deploy Method |
|------|----------|--------------|
| plugin-wpv | github.com/Mayakovsky/plugin-wpv (public) | `git pull` on VPS |
| plugin-acp | github.com/Mayakovsky/plugin-acp (private) | SCP `AcpService.ts` to VPS |
| wpv-agent | /opt/grey/wpv-agent on VPS | `bun run build` after plugin builds |

**VPS:** AWS Lightsail `44.243.254.19`, 2GB RAM, Ubuntu, PM2 process `grey`

**Deploy sequence:**
```bash
# plugin-acp (if changed):
scp -i ~/.ssh/WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
ssh ubuntu@44.243.254.19 "cd /opt/grey/plugin-acp && bun run build"

# plugin-wpv + wpv-agent:
ssh ubuntu@44.243.254.19 "cd /opt/grey/plugin-wpv && git pull && bun install && bun run build && cd /opt/grey/wpv-agent && bun run build && pm2 restart grey"
```

**CRITICAL:** plugin-acp dist is symlinked into wpv-agent/node_modules. Do NOT `bun install` in wpv-agent or the symlink gets replaced.

---

## DB State (post-graduation)

8 whitepapers, all with claims and verifications:

| Project | Claims | Verdict |
|---------|--------|---------|
| Aave | 18 | CONDITIONAL |
| Aave V3 | 15 | CONDITIONAL |
| Aerodrome Finance | 14 | PASS |
| Chainlink | 12 | CONDITIONAL |
| Chainlink v2 | 12 | CONDITIONAL |
| Lido | 14 | CONDITIONAL |
| Uniswap | 20 | PASS |
| Virtuals Protocol | 6 | PASS |

Database: Supabase Pro (PostgreSQL + pgvector), schema `autognostic`, tables: `wpv_whitepapers`, `wpv_claims`, `wpv_verifications`.

---

## Graduation Journey — Key Milestones

**Evals 1-13 (March 2026):** Foundation. Dispatch bugs, content filtering, schema alignment, SPA detection, docs site crawling, version-aware caching.

**Evals 14-22 (March-April 2026):** Evaluator expanded from 16 to 18+ tests. DB pollution, SDK version mismatch (eval 28 — all EXPIRED), Haiku→Sonnet switch, Playwright system libs, EOA wallet rejection.

**Evals 27-32 (April 2026):** Closing the gap. 14/16 → 18/24. Chainlink BFT prompt hardening, _originalTokenAddress on all paths, search engine blocklist, verification dedup.

**Eval 34 (April 8):** 3 root causes identified: job mutex blocking briefings, pipeline timeout needed, resolveTokenName fallback after soft-strip. Forces designed the plan, Kovsky implemented + found 4 additional issues (findWhitepaper, scan handler, Promise.race timer leak, Array.find(async) bug, discovery path not persisting verifications).

**Eval 35 (April 8):** 15/18. Plain-text parser failures (2) + Aerodrome SPA (1). Forces designed 9-fix infrastructure overhaul. Kovsky reviewed, found AbortController justification (render lock cascading), recommended deferral then accepted Forces' counter-argument. v3 plan approved.

**Eval 36 (April 9):** Server conflict on Virtuals side, eval terminated before scoring. But all 22 jobs handled correctly — 0 EXPIRED, 0 timeouts.

**Eval 37 (April 9):** 24/24. Perfect score. Graduated.

---

## Post-Graduation TODO

### Immediate (Launch)
1. Set production prices ($0.25 / $1.50 / $3.00 / $8.00)
2. Close ports 3000 + 3001 in Lightsail firewall
3. Outreach — pinned thread, announcement

### Near-term
4. Wire DiscoveryCron for automated whitepaper discovery
5. Database hygiene service (automated cleanup of 0-claim entries)
6. Render cache for Playwright (avoid re-rendering same SPAs)
7. Upgrade VPS RAM (2GB → 4GB) for more reliable Playwright

### Deferred
8. Image-only PDF detection + OCR
9. Multi-chain token resolution beyond Base + Ethereum
10. Production monitoring dashboard

---

## Key Files for Future Sessions

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context for Claude Code sessions |
| `heartbeat.md` | Live session state and status |
| `src/constants/protocols.ts` | Canonical protocol list (sync to AcpService) |
| `src/acp/JobRouter.ts` | Core routing + pipeline + timeout + mutex |
| `src/WpvService.ts` | Validation, content filtering, ACP registration |
| `src/discovery/CryptoContentResolver.ts` | SPA detection, Playwright routing, docs crawling |
| `src/discovery/HeadlessBrowserResolver.ts` | Playwright render with lock + RAM guard |
| `src/discovery/WebSearchFallback.ts` | Known URL map for protocol documents |
| `src/verification/ClaimExtractor.ts` | Sonnet claim extraction with min text threshold |
| `plugin-acp/src/AcpService.ts` | Plain-text parser, job dispatch, delivery |

---

## Environment

| Property | Value |
|----------|-------|
| Package Manager | bun |
| Framework | ElizaOS v1.x (1.6.5) |
| LLM | Claude Sonnet (claude-sonnet-4-20250514) via Anthropic API |
| Chain | Base (Virtuals Protocol) |
| Database | Supabase Pro (PostgreSQL + pgvector) |
| VPS | AWS Lightsail 2GB, us-west-2 |
| Test Framework | Vitest (310 tests, 24 files) |

---

*Written by Kovsky (Claude Opus 4.6) on graduation day, 2026-04-09.*
