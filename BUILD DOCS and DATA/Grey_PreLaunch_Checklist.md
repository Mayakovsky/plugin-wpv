# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-28 (GREY IS LIVE ON ACP — final graduation test pending)
**Owner:** Forces (with Claude support)
**Status:** GREY IS CONNECTED AND LISTENING FOR JOBS. All code complete. All testing complete. ACP WebSocket live. Currently blocked on Virtuals DevRel Graduation Evaluator (Agent 1419) — pending job queue must reset/complete before Grey can perform the final required graduation test. Butler is facilitating. After that, handoff to human reviewers.

---

# Brand Reference

| Element | Value |
|---------|-------|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| Twitter | @WhitepaperGrey |
| Domain | whitepapergrey.com |
| ACP Role | **Provider** |
| ACP Status | **Connected, listening for jobs. Graduation pending final test + human review.** |

---

# Everything Complete

| Task | Date |
|------|------|
| All code (plugin-wpv 304, plugin-acp 47, wpv-agent 13) | 2026-03-26 |
| plugin-acp built + wired to plugin-wpv | 2026-03-26 |
| Security hardening + rejectPayable | 2026-03-26 |
| HTTP job handler live on port 3001 | 2026-03-26 |
| 66 Test re-certified (267/267) | 2026-03-26 |
| VPS deployed, all repos built, PM2 running | 2026-03-26 |
| Database seeded (66 tokens, 3 waves) | 2026-03-21 |
| Virtuals registration (Provider, 5 offerings) | 2026-03-24 |
| Agent wallet funded ($5 USDC) | 2026-03-26 |
| Sandbox requirements (10 transactions on-chain) | 2026-03-26 |
| Breakbot tests (all 5 offerings, positive + negative) | 2026-03-26 |
| 10 application tests | 2026-03-27 |
| Graduation submission (videos) | 2026-03-26 |
| ACP credentials deployed (.env local + VPS) | 2026-03-27 |
| **ACP SDK connected — WebSocket live, onNewTask active** | **2026-03-27** |
| Pre-graduation tweets (5) | 2026-03-23 |
| Website + one-pager | 2026-03-17 |
| Outreach messages drafted (22) | 2026-03-15 |
| All repos pushed to GitHub | 2026-03-27 |

---

# Current Blocker: Graduation Evaluator Queue

**What's happening:** The Virtuals DevRel Graduation Evaluator (Agent 1419) has a pending job queue that needs to clear before Grey can complete the final required graduation test. This wasn't in our original plan — it's an additional platform step we discovered during the submission process.

**Who's handling it:** Forces, via Butler. No code changes needed. No action for Kovsky.

**What happens after:** Once Agent 1419's queue clears → Grey performs the final test → passes → application goes to Virtuals human reviewers → graduation decision.

---

# Launch Sequence (After Graduation)

| Step | Owner | Time |
|------|-------|------|
| Agent 1419 queue clears | Virtuals | Waiting |
| Final graduation test via Butler | Forces | Minutes |
| Human review approves graduation | Virtuals | 24–48hr |
| Close ports 3000 + 3001 in Lightsail | Kovsky | ~2 min |
| Verify Grey still processing via WebSocket | Kovsky | ~5 min |
| **Fire 22 outreach messages** | Forces | Simultaneous |
| **Post pinned thread** | Forces | Same day |
| **GREY IS OFFICIALLY LIVE** | — | — |

**DO NOT fire outreach until graduation is confirmed.**

---

# Post-Launch

1. Add resources (Greenlight List, Scam Alert Feed) to Virtuals profile
2. Release plugin-acp to ElizaOS plugin repository
3. Public website (Next.js on Supabase)
4. Shadow pipeline for local LLM evaluation at 300 verifications/month

---

# Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |

Break-even: $162–$212/month.

---

*End of Pre-Launch Checklist — Whitepaper Grey*
