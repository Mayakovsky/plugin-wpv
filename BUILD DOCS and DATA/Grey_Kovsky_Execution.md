# Whitepaper Grey — Kovsky Technical Execution

**Date:** 2026-03-23 (rewritten — reflects actual state from heartbeats)
**Owner:** Kovsky (autonomous execution)
**Status:** All pre-ACP work DONE. 66 Test CERTIFIED (267/267). VPS running 24/7. Database seeded (3 waves). Waiting for Forces to complete Virtuals registration and deliver ACP credentials.

---

# What's Done

| Task | Status | Date | Details |
|------|--------|------|---------|
| plugin-wpv built and tested | ✅ 304/304 | 2026-03-23 | 23 test files |
| plugin-autognostic built and tested | ✅ 746/746 | 2026-03-14 | |
| wpv-agent scaffold, build, plugins loaded | ✅ COMPLETE | 2026-03-14 | |
| wpv-agent tests | ✅ 12/12 | 2026-03-17 | config validation |
| Supabase schema deployed | ✅ COMPLETE | 2026-03-14 | 3 tables + indexes |
| .env populated (all except ACP) | ✅ COMPLETE | 2026-03-14 | |
| Smoke tests 7/8 PASS | ✅ COMPLETE | 2026-03-14 | COC/V $0.026 |
| Tier 2 + Tier 3 E2E | ✅ COMPLETE | 2026-03-15 | |
| 1.1 Brand update | ✅ COMPLETE | 2026-03-17 | Grey / Whitepaper Grey |
| 1.2 Factory contract | ✅ COMPLETE | 2026-03-17 | 0xF66D...3259 wired, chunked getLogs |
| 1.3 PDF robustness audit | ✅ COMPLETE | 2026-03-17 | 20-WP corpus, 32 tests |
| 1.4 MiCA compliance | ✅ COMPLETE | 2026-03-17 | L1 structural + L2 regulatory tagging |
| 1.5 Agent-level tests | ✅ COMPLETE | 2026-03-17 | 12 tests |
| 1.6A Discovery overhaul | ✅ COMPLETE | 2026-03-18 | Multi-tier: ACP → website → search → composed |
| 1.6B Market traction | ✅ COMPLETE | 2026-03-18 | On-chain time-to-grad + transfers + aGDP |
| 1.6C Fork detection | ✅ COMPLETE | 2026-03-18 | Description similarity, name patterns, WP dedup |
| 1.6D LLM cost tracking | ✅ COMPLETE | 2026-03-18 | Per-stage breakdown, monthly aggregation |
| 1.7 VPS setup | ✅ COMPLETE | 2026-03-18 | Grey running 24/7 via PM2, reboot recovery tested |
| 1.8 Seed ingestion | ✅ COMPLETE | 2026-03-21 | 3 waves: Base+ETH+Solana+Virtuals+PAXG |
| 1.9 ACP v2 deliverable schemas | ✅ COMPLETE | 2026-03-21 | All 5 offerings + 2 resources |
| 1.10 66 Test | ✅ CERTIFIED | 2026-03-23 | 267/267 pass, local + VPS, 100% readiness |
| VPS provisioned | ✅ COMPLETE | 2026-03-18 | AWS Lightsail us-west-2 |
| Paid RPC provisioned | ✅ COMPLETE | 2026-03-18 | Alchemy Base free tier |

---

# VPS Credentials (LIVE)

| Item | Value |
|------|-------|
| **Provider** | AWS Lightsail |
| **Region** | us-west-2 (Hillsboro, OR) — matches Supabase |
| **Public IPv4** | `44.243.254.19` |
| **SSH Key** | `C:\Users\kidco\.ssh\WhitepaperGrey.pem` |
| **SSH Command** | `ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19` |
| **Base RPC (Alchemy)** | `https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq` |

---

# ACP v2 Evaluation Context

**There is no platform-level standardized evaluator.** Key facts:

1. **Evaluation is optional.** Buyers can set `evaluator_address` to zero. Most of Grey's $0.25 scans will skip evaluation.
2. **Buyer is often the evaluator.** If no dedicated evaluator assigned, buyer assumes the role.
3. **Grey defines the contract.** ACP v2 Deliverable Requirements schemas (already coded into AgentCardConfig.ts) are what evaluators check against.
4. **Evaluators list present/missing elements.** Every required field must appear in every response.
5. **Trust Score economics.** Early rejections are disproportionately damaging. Target: 100% approval on first 50 real deliveries.
6. **Grey's role is Provider** (not Evaluator).

The 66 Test validates Grey's responses against these schemas. 267/267 PASS. Grey is certified ready.

---

# Remaining Tasks — ACP Sandbox and Graduation

**Everything below is blocked on Forces completing Virtuals registration and sharing ACP credentials.**

## 2.1 Update .env with ACP Credentials (local + VPS)

When Forces provides:
- `ACP_WALLET_PRIVATE_KEY`
- `ACP_SESSION_ENTITY_KEY_ID`
- `ACP_AGENT_WALLET_ADDRESS`

Add to both:
- Local: `C:\Users\kidco\dev\eliza\wpv-agent\.env`
- VPS: `/opt/grey/wpv-agent/.env`

Then rebuild on VPS:
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
cd /opt/grey/wpv-agent && git pull && bun run build
pm2 restart grey
```

## 2.2 Re-Run ACP Smoke Test

All 8/8 should now pass (Smoke 7 was the only skip — ACP SDK).

## 2.3 Build Buyer Test Agent

Create `grey-buyer-agent/` — lightweight agent that:
- Requests each of Grey's 5 offerings at $0.01
- Validates responses against the published Deliverable Requirements schemas
- 10 total transactions for sandbox graduation threshold

## 2.4 Sandbox Graduation

1. Grey appears in Sandbox tab after registration
2. Run 10 test transactions via buyer agent
3. All should pass (66 Test already certified the response format)
4. Hit "Proceed to Graduation" button when threshold reached
5. Virtuals manual review: 24–48 hours

## 2.5 Post-Graduation

1. Grey appears in Agent-to-Agent tab
2. Butler starts routing queries
3. Fire all 22 outreach messages simultaneously
4. Post pinned thread on @WhitepaperGrey
5. Monitor: jobs, payments, Trust Score, COC/V via WPV_COST

---

# Phase 3: Post-Graduation

## 3.1 Public Website (Weeks 3–4)
Next.js on Supabase backend at whitepapergrey.com.

## 3.2 Shadow Pipeline for Local LLM Evaluation (at 300 verifications/month)
When WPV_COST shows 300+ monthly verifications sustained for 2+ months, begin shadow pipeline comparison (Qwen 2.5 72B or Llama 3.1 70B vs Sonnet).

---

# Operational Notes

## Plugin Load Order (Mandatory)
```
sql → ollama → anthropic → knowledge → autognostic → wpv → bootstrap
```

## Test Baselines

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-wpv | 304 | 2026-03-23 |
| wpv-agent | 12 | 2026-03-17 |
| 66 Test (evaluator) | 267/267 | 2026-03-23 |

## VPS Update Procedure
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"
cd /opt/grey/plugin-autognostic && git pull && bun run build
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && git pull && bun run build
pm2 restart grey
```

## Environment Variables (Production)
```bash
ANTHROPIC_API_KEY=sk-ant-...
WPV_DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SECRET_KEY=sb_secret_...
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq
VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259

# Waiting for Forces
ACP_WALLET_PRIVATE_KEY=
ACP_SESSION_ENTITY_KEY_ID=
ACP_AGENT_WALLET_ADDRESS=

# Optional
WPV_MODEL=claude-sonnet-4-20250514
```

## Reference Files

| File | Path |
|------|------|
| Architecture doc | `plugin-wpv/BUILD DOCS and DATA/WPV_Agent_Technical_Architecture_v1.3.md` |
| Brand & naming | `wpv-agent/Whitepaper_Grey_Brand_Naming.md` |
| 66 Test Regimen | `plugin-wpv/BUILD DOCS and DATA/Grey_50_Test_Regimen.md` |
| Local LLM Evaluation | `wpv-agent/LOCAL_LLM_EVALUATION.md` |
| Plugin heartbeat | `plugin-wpv/heartbeat.md` |
| Agent heartbeat | `wpv-agent/heartbeat.md` |
| 66 Test script | `plugin-wpv/scripts/run66Test.ts` |

---

*End of Kovsky Technical Execution — Whitepaper Grey*
