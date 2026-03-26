# Whitepaper Grey — Pre-Launch Checklist

**Date:** 2026-03-26 (GRADUATED — awaiting 2 remaining ACP credentials from developer portal)
**Owner:** Forces (with Claude support)
**Status:** GREY IS GRADUATED. On-chain record. Agent wallet funded ($5 USDC). ACP_AGENT_WALLET_ADDRESS in .env. Virtuals developer portal inaccessible — can't retrieve ACP_WALLET_PRIVATE_KEY or ACP_SESSION_ENTITY_KEY_ID. Grey is graduated but not listening for jobs. DO NOT fire outreach until Grey is processing.

---

# Brand Reference

| Element | Value |
|---------|-------|
| Company / Product | **Whitepaper Grey** |
| Agent (human-facing) | **Grey** |
| Twitter | @WhitepaperGrey |
| Domain | whitepapergrey.com |
| ACP Role | **Provider** |
| ACP Status | **GRADUATED** |

---

# Completed

| Task | Date |
|------|------|
| All code (plugin-wpv 304, plugin-acp 37, wpv-agent 13) | 2026-03-25 |
| plugin-acp built + wired to plugin-wpv | 2026-03-25 |
| Security hardening | 2026-03-25 |
| 66 Test re-certified (267/267) | 2026-03-25 |
| VPS running 24/7 | 2026-03-18 |
| Database seeded (66 tokens, 3 waves) | 2026-03-21 |
| Virtuals registration (Provider, 5 offerings) | 2026-03-24 |
| **SANDBOX GRADUATION PASSED** | **2026-03-26** |
| **Agent wallet funded ($5 USDC)** | **2026-03-26** |
| **ACP_AGENT_WALLET_ADDRESS in .env** | **2026-03-26** |
| Pre-graduation tweets (5) | 2026-03-23 |
| Website + one-pager | 2026-03-17 |
| Outreach messages drafted (22) | 2026-03-15 |
| All repos pushed to GitHub | 2026-03-25 |

---

# BLOCKED: Developer Portal Down

Two ACP credentials are trapped behind the Virtuals developer portal which is experiencing server issues:

| Credential | Status | Where to Find |
|-----------|--------|---------------|
| `ACP_AGENT_WALLET_ADDRESS` | ✅ Done | Already in .env |
| `ACP_WALLET_PRIVATE_KEY` | ❌ **BLOCKED** | Developer portal → wallet whitelisting page |
| `ACP_SESSION_ENTITY_KEY_ID` | ❌ **BLOCKED** | Developer portal → agent profile page |

**Keep trying the portal.** The moment it's accessible, grab both values and share with Kovsky. That's the only thing standing between Grey and live commerce.

---

# What Forces Can Do NOW

## 1. Keep Checking the Developer Portal
Try `https://app.virtuals.io/acp/join` periodically. When it loads, navigate to your agent profile → wallet section. The private key and session entity key ID should be visible there.

## 2. Prepare Pinned Thread (Draft — DO NOT POST YET)
Have it ready to fire the moment Grey is processing jobs. Post only after confirming Grey is accepting and delivering via ACP.

## 3. Review Outreach Messages
All 22 are final. Review one last time. They fire simultaneously the moment Grey is live.

---

# What Kovsky Can Do NOW (No Credentials Needed)

1. **Deploy latest code to VPS** — plugin-acp (new repo), updated plugin-wpv, updated wpv-agent. Everything staged for instant launch.
2. **Wire resource HTTP endpoints** — Greenlight List + Scam Alert Feed served via HTTP on VPS.
3. **Create CLAUDE.md + heartbeat.md for plugin-acp repo**
4. **Update wpv-agent heartbeat** (stale since 2026-03-23)
5. **Re-run 66 Test on VPS** after deploying latest code

---

# Launch Sequence (When Credentials Arrive)

| Step | Owner | Time |
|------|-------|------|
| Portal comes back, grab 2 keys | Forces | ~minutes |
| Share keys with Kovsky | Forces | immediate |
| Add to .env (local + VPS), restart PM2 | Kovsky | ~5 min |
| Verify ACP WebSocket connected | Kovsky | ~5 min |
| Smoke Test 8/8 (ACP now passes) | Kovsky | ~5 min |
| Monitor 1 hour — verify job flow | Both | 1 hour |
| **Fire 22 outreach messages** | Forces | simultaneous |
| **Post pinned thread** | Forces | same day |
| **GREY IS LIVE** | — | — |

---

# Revenue Targets

| Scenario | Timeline | Monthly Net |
|----------|----------|-------------|
| Launch | Month 1 | $660 |
| Growth | Month 3 | $2,040 |
| Scale | Month 6 | $6,300 |
| Volume | Month 12 | $21,000 |

---

*End of Pre-Launch Checklist — Whitepaper Grey*
