# Whitepaper Grey — Kovsky Technical Execution

**Date:** 2026-03-26 (rewritten — GRADUATED, deploy to VPS, awaiting 2 remaining ACP credentials)
**Owner:** Kovsky (autonomous execution)
**Status:** GREY IS GRADUATED ON VIRTUALS. Agent wallet funded ($5 USDC). ACP_AGENT_WALLET_ADDRESS in .env. MISSING: ACP_WALLET_PRIVATE_KEY + ACP_SESSION_ENTITY_KEY_ID (Forces can't access developer portal — Virtuals server issues). Grey cannot process jobs until these are provided. Deploy latest code to VPS now so launch is instant once credentials arrive.

---

# What's Done

| Task | Status | Date | Details |
|------|--------|------|---------|
| plugin-wpv | ✅ 304/304 | 2026-03-25 | 23 test files |
| plugin-autognostic | ✅ 746/746 | 2026-03-14 | |
| plugin-acp | ✅ 37/37 | 2026-03-25 | AcpService + 3 actions, security hardened |
| wpv-agent | ✅ 13/13 | 2026-03-25 | load order updated with acp |
| plugin-wpv ↔ plugin-acp wired | ✅ COMPLETE | 2026-03-25 | 5 offering handlers registered |
| VPS running 24/7 | ✅ COMPLETE | 2026-03-18 | PM2, reboot recovery |
| Seed ingestion (3 waves) | ✅ COMPLETE | 2026-03-21 | 66 tokens |
| 66 Test | ✅ CERTIFIED | 2026-03-25 | 267/267 re-certified post-hardening |
| ACP v2 schemas hardened | ✅ COMPLETE | 2026-03-24 | NOT_IN_DATABASE, flat shape |
| Virtuals registration | ✅ COMPLETE | 2026-03-24 | Provider, 5 offerings |
| **SANDBOX GRADUATION** | ✅ **PASSED** | 2026-03-26 | Butler + hired agent tests, on-chain record |
| Agent wallet funded | ✅ COMPLETE | 2026-03-26 | 5.00 USDC |
| ACP_AGENT_WALLET_ADDRESS | ✅ IN .ENV | 2026-03-26 | |
| Pre-graduation tweets | ✅ COMPLETE | 2026-03-23 | 5 tweets |

---

# BLOCKED: 2 Missing ACP Credentials

Forces completed registration and graduation, but Virtuals developer portal is down. Two credentials still needed:

| Credential | Status |
|-----------|--------|
| `ACP_AGENT_WALLET_ADDRESS` | ✅ In .env |
| `ACP_WALLET_PRIVATE_KEY` | ❌ **MISSING** — developer portal inaccessible |
| `ACP_SESSION_ENTITY_KEY_ID` | ❌ **MISSING** — developer portal inaccessible |

**Without these, the ACP SDK cannot authenticate.** Grey is graduated but not listening. No jobs can be received or processed. Do NOT fire outreach until Grey is processing jobs — sending agents to a deaf provider tanks Trust Score.

---

# What To Do NOW (No Credentials Needed)

## 1. Deploy Latest Code to VPS

The VPS is running old code (pre-plugin-acp). Deploy everything so the moment credentials arrive, it's just `.env` update + PM2 restart.

```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"

# Clone plugin-acp (new repo)
cd /opt/grey
git clone https://github.com/Mayakovsky/plugin-acp.git
cd plugin-acp && bun install && bun run build

# Update existing repos
cd /opt/grey/plugin-autognostic && git pull && bun run build
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && git pull && bun run build

# Don't restart PM2 yet — Grey will crash without ACP credentials
# unless standalone mode is confirmed to work cleanly
pm2 restart grey
pm2 logs grey --lines 30
# Verify: Grey starts in standalone mode (no ACP connection, but functional)
```

## 2. Wire Resource HTTP Endpoints

Grey's free resources (Greenlight List, Scam Alert Feed) need HTTP routes so they can be added to the Virtuals profile later. Build a lightweight HTTP server or ElizaOS route handler that serves:

- `GET /api/resources/daily_greenlight_list` → calls `ResourceHandlers.getGreenlightList()`
- `GET /api/resources/scam_alert_feed` → calls `ResourceHandlers.getScamAlertFeed()`

## 3. Create CLAUDE.md + heartbeat.md for plugin-acp

The repo has no session docs yet. Create them.

## 4. Update wpv-agent heartbeat

Still shows 2026-03-23 data. Update to reflect graduation, plugin-acp wiring, 13 tests.

## 5. Re-run 66 Test on VPS

After deploying latest code, verify the 66 Test still passes on VPS with the new code.

---

# When Credentials Arrive (Instant Launch Sequence)

1. **Forces shares** `ACP_WALLET_PRIVATE_KEY` and `ACP_SESSION_ENTITY_KEY_ID`
2. **Kovsky adds to .env** on both local and VPS
3. **Restart Grey on VPS:** `pm2 restart grey`
4. **Verify:** Grey connects to ACP WebSocket, `onNewTask` callback active
5. **Run Smoke Test 8/8** — ACP SDK test should now PASS
6. **Monitor for 1 hour** — verify Grey accepts and delivers a test job
7. **Forces fires all 22 outreach messages**
8. **Forces posts pinned thread on @WhitepaperGrey**
9. **LIVE** — Butler routing active, agents can hire Grey

---

# Post-Launch

## 3.1 Add resources to Virtuals profile
Once HTTP endpoints are live, add URLs to agent profile (confirmed: can be done anytime post-registration).

## 3.2 Release plugin-acp to ElizaOS plugin repository

## 3.3 Public website (Next.js on Supabase)

## 3.4 Shadow pipeline for local LLM evaluation (at 300 verifications/month)

---

# Operational Notes

## Plugin Load Order
```
sql → ollama → anthropic → knowledge → autognostic → acp → wpv → bootstrap
```

## Test Baselines

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-acp | 37 | 2026-03-25 |
| plugin-wpv | 304 | 2026-03-25 |
| wpv-agent | 13 | 2026-03-25 |
| 66 Test | 267/267 | 2026-03-25 |

## VPS Update Procedure
```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"
cd /opt/grey/plugin-acp && git pull && bun run build
cd /opt/grey/plugin-autognostic && git pull && bun run build
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && git pull && bun run build
pm2 restart grey
```

---

*End of Kovsky Technical Execution — Whitepaper Grey*
