# Whitepaper Grey — Kovsky Technical Execution

**Date:** 2026-03-28 (GREY IS LIVE ON ACP — final graduation test pending)
**Owner:** Kovsky (autonomous execution)
**Status:** GREY IS CONNECTED TO ACP AND LISTENING FOR JOBS. WebSocket live, all 5 offering handlers active. Graduation application submitted. Currently blocked on Virtuals DevRel Graduation Evaluator (Agent 1419) — its pending job queue must reset/complete before Grey can perform the final required test. Butler is facilitating. After that test passes, handoff to Virtuals human reviewers.

---

# What's Done — Everything

| Task | Status | Date |
|------|--------|------|
| plugin-autognostic | ✅ 746/746 tests | 2026-03-14 |
| plugin-acp | ✅ 47/47 tests | 2026-03-26 |
| plugin-wpv | ✅ 304/304 tests | 2026-03-26 |
| wpv-agent | ✅ 13/13 tests | 2026-03-26 |
| plugin-wpv ↔ plugin-acp wired | ✅ COMPLETE | 2026-03-26 |
| Security hardening + rejectPayable | ✅ COMPLETE | 2026-03-26 |
| HTTP job handler (port 3001) | ✅ LIVE | 2026-03-26 |
| VPS deployed, all repos built, PM2 running | ✅ COMPLETE | 2026-03-26 |
| Supabase Pro deployed, 66 tokens seeded | ✅ COMPLETE | 2026-03-21 |
| 66 Test | ✅ CERTIFIED 267/267 | 2026-03-26 |
| Virtuals registration (Provider, 5 offerings) | ✅ COMPLETE | 2026-03-24 |
| Agent wallet funded ($5 USDC) | ✅ COMPLETE | 2026-03-26 |
| Sandbox requirements (10 transactions on-chain) | ✅ COMPLETE | 2026-03-26 |
| Breakbot tests (all 5 offerings, positive + negative) | ✅ PASSED | 2026-03-26 |
| 10 application tests | ✅ PASSED | 2026-03-27 |
| Graduation submission (videos) | ✅ SENT | 2026-03-26 |
| ACP credentials deployed (.env local + VPS) | ✅ COMPLETE | 2026-03-27 |
| **ACP SDK connected (WebSocket live)** | ✅ **LIVE** | **2026-03-27** |
| **Grey listening for jobs via onNewTask** | ✅ **CONFIRMED** | **2026-03-27** |

**No test buyer agent was built.** Butler hired agents on-network for sandbox and Breakbot tests.

---

# ACP Connection Resolution

The SDK connection was blocked by a mismatched entity ID. The Virtuals UI displays the agent registration ID (`40675`) but the on-chain `installValidation` used a different entity ID. Forces decoded the `validationConfig` bytes from an `Install Validation` AA transaction on Basescan to find the correct value.

**Fix:** `ACP_SESSION_ENTITY_KEY_ID` set to the on-chain entity ID (not the Virtuals registration ID).

| Env Var | Value |
|---------|-------|
| `ACP_WALLET_PRIVATE_KEY` | Private key of `0x5a5F7D68ADdcF7324d737202279A40D35085004C` |
| `ACP_SESSION_ENTITY_KEY_ID` | On-chain entity ID from `validationConfig` (not 40675) |
| `ACP_AGENT_WALLET_ADDRESS` | `0x48A5F194eeB6e7C62FfF6f9EB6d81C115C7936f2` |

---

# Current Blocker: Graduation Evaluator Queue

**Agent 1419** — the Virtuals DevRel Graduation Evaluator — has a pending job queue that must reset or complete before Grey can perform the final required graduation test. This step was not in our original plan but is required by the Virtuals graduation process. Butler is facilitating the interaction.

**This is not a code issue.** Nothing for Kovsky to fix. Forces is managing this through the Virtuals UI/Butler.

Once Agent 1419's queue clears and Grey completes the final test, the application goes to human reviewers for the graduation decision.

---

# Sequence From Here

| Step | Owner | Status |
|------|-------|--------|
| Agent 1419 queue clears | Virtuals platform | WAITING |
| Final graduation test via Butler | Forces + Butler | NEXT |
| Human review | Virtuals team | After test passes |
| Close ports 3000 + 3001 | Kovsky | After graduation |
| Fire 22 outreach messages | Forces | After graduation confirmed |
| Post pinned thread | Forces | After graduation confirmed |

**DO NOT fire outreach until graduation is confirmed by Virtuals.**

---

# Post-Launch

1. Add resources (Greenlight List, Scam Alert Feed) to Virtuals profile
2. Release plugin-acp to ElizaOS plugin repository
3. Public website (Next.js on Supabase)
4. Shadow pipeline for local LLM evaluation at 300 verifications/month

---

# Test Baselines (Final)

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-acp | 47 | 2026-03-26 |
| plugin-wpv | 304 | 2026-03-26 |
| wpv-agent | 13 | 2026-03-26 |
| 66 Test | 267/267 | 2026-03-26 |
| Breakbot | 5/5 offerings (pos + neg) | 2026-03-26 |
| Application tests | 10/10 | 2026-03-27 |

---

# VPS Access

```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"
```

---

*End of Kovsky Technical Execution — Whitepaper Grey*
