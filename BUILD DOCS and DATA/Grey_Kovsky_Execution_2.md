# Whitepaper Grey — Kovsky Technical Execution

**Date:** 2026-03-17 (revised — factory contract confirmed, MiCA compliance added, pre-launch cron added)
**Owner:** Kovsky (autonomous execution)
**Status:** E2E testing COMPLETE. Begin Phase 1 tasks. Pre-launch cron begins after PDF audit and MiCA feature are complete.

---

# Brand Update

The agent is now **Whitepaper Grey** (product name) / **Grey** (agent persona). Internal references remain as-is in code (offering_ids, action names, plugin name). The brand update affects user-facing strings only:
- `character.ts` — agent name "Grey", system prompt identifies as "Grey"
- `AgentCardConfig.ts` — Agent Card name "Whitepaper Grey", descriptions use "Grey"

Internal identifiers (`WPV_SCAN`, `plugin-wpv`, `wpv-agent`) stay unchanged.

---

# Confirmed: Virtuals Bonding Proxy Contract

**Address:** `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`

**Verified on BaseScan** as "VIRTUALS Protocol: Bonding Proxy". This contract:
- Emits `Graduated` events when agents hit the 42,000 VIRTUAL threshold
- Transfers VIRTUAL to the liquidity factory for Uniswap V2 pair creation
- Mints agent tokens upon graduation

**Key event for BaseChainListener:**
- Event: `Graduated(address indexed token, address agentToken)`
- Topic: `0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e`

**Update .env:**
```bash
VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259
```

**Update `plugin-wpv/src/constants.ts`** default value for `VIRTUALS_FACTORY_CONTRACT`.

**Update `plugin-wpv/src/discovery/BaseChainListener.ts`** to listen for the `Graduated` event at this address. The event provides both the bonding curve token address and the graduated agent token address — both are useful for discovery (the agent token is what we look up in ACP, the bonding token links to the project's initial offering).

---

# What's Done

| Task | Status | Date |
|------|--------|------|
| plugin-wpv built and tested | ✅ 195/195 | 2026-03-12 |
| plugin-autognostic built and tested | ✅ 746/746 | 2026-03-14 |
| wpv-agent scaffold, build, plugins loaded | ✅ COMPLETE | 2026-03-14 |
| Supabase schema deployed (3 tables + indexes) | ✅ COMPLETE | 2026-03-14 |
| .env populated (all except ACP) | ✅ COMPLETE | 2026-03-14 |
| Smoke tests 7/8 PASS (COC/V $0.026) | ✅ COMPLETE | 2026-03-14 |
| Tier 2 + Tier 3 E2E | ✅ COMPLETE | 2026-03-15 |
| Virtuals factory contract identified | ✅ CONFIRMED | 2026-03-17 |

---

# Remaining Tasks (Execution Order)

## Phase 1: Unblocked — Do Now

### 1.1 Brand Update in Code

Update user-facing strings only. Do NOT rename files, packages, or internal identifiers.

**Files to update:**

`wpv-agent/src/character.ts`:
- `name: "WPV Agent"` → `name: "Grey"`
- System prompt: "You are the WPV Agent" → "You are Grey, the Whitepaper Grey verification agent"
- Verify ACTION ROUTING section still present and correct

`plugin-wpv/src/acp/AgentCardConfig.ts`:
- Agent Name → "Whitepaper Grey"
- Short Description → include "Grey" branding
- Full Description → "Whitepaper Grey is the ecosystem's..." / "Grey identifies structural risks..."

After updates: `bun run build && bun run test` in both plugin-wpv and wpv-agent. Verify 195/195 pass.

Commit: `chore: rebrand to Whitepaper Grey / Grey`

### 1.2 Factory Contract Integration

Now that the address is confirmed, wire it into the codebase:

1. Update `plugin-wpv/src/constants.ts` — set `VIRTUALS_FACTORY_CONTRACT` default to `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`
2. Update `wpv-agent/.env` — add the address
3. Update `plugin-wpv/src/discovery/BaseChainListener.ts`:
   - Point at the confirmed address
   - Listen for event topic `0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e`
   - Parse `Graduated(address indexed token, address agentToken)` — extract both addresses
   - The `agentToken` address is the graduated agent's token — use this for ACP metadata lookup
4. Run BaseChainListener against live Base RPC to verify it parses real `Graduated` events
5. Update tests to use the real event topic

Commit: `feat: wire Virtuals Bonding Proxy 0xF66D...3259 into BaseChainListener`

### 1.3 PDF Robustness Audit and OCR Gap

**CRITICAL: The majority of crypto whitepapers are PDFs.** The current pipeline handles most well but has a gap on scanned image PDFs (no text layer → zero extraction).

**Current behavior:** CryptoContentResolver flags these as `isImageOnly: true` when extraction returns < 100 characters from a multi-page document. Agent returns `INSUFFICIENT_DATA` — graceful but unverified.

**Task: Audit and harden PDF handling.**

1. Gather 20 real crypto whitepaper PDFs from diverse sources
2. Run each through CryptoContentResolver — record: chars extracted, page count, isImageOnly, time
3. Run each through StructuralAnalyzer (L1) — record: structural score, hype_tech_ratio, sections detected
4. Run 5 representative PDFs through ClaimExtractor (L2, costs money) — verify quality
5. Document findings
6. Evaluate OCR: Tesseract.js (local, free) vs cloud OCR vs defer to Phase 2
7. **Minimum deliverable:** 20-PDF corpus documented, image-only tracking added to WPV_STATUS, any extraction bugs fixed

Commit: `test: PDF robustness audit — 20 WP corpus`

### **1.4 MiCA Compliance Check (New L1 Feature)**

**IMPORTANT:** The EU Markets in Crypto-Assets Regulation (MiCA) now requires crypto-asset issuers to publish whitepapers meeting specific content and format requirements. As of December 23, 2025, MiCA whitepaper formatting requirements are in effect. EU exchanges are already delisting tokens with non-compliant whitepapers. This is a significant differentiator — Grey would be the only agent on Virtuals checking MiCA compliance.

**Add two new data points to every whitepaper verification:**

1. **`claims_mica_compliance`** — `YES` / `NO` / `NOT_MENTIONED`
   Does the whitepaper claim to comply with MiCA? Look for explicit mentions of "MiCA", "Markets in Crypto-Assets", "EU regulation", "Regulation (EU) 2023/1114", or "ESMA whitepaper requirements."

2. **`mica_compliant`** — `YES` / `NO` / `PARTIAL` / `NOT_APPLICABLE`
   Does the whitepaper actually contain the required MiCA elements? Check for:
   - Issuer identity and contact information
   - Description of the project and underlying technology
   - Risk disclosure section (specific to the crypto-asset)
   - Rights and obligations attached to the token
   - Redemption and refund mechanisms (if applicable)
   - Governance arrangements
   - Environmental impact disclosure
   - Clear, fair, not misleading language (absence of hype claims without substantiation)
   - `NOT_APPLICABLE` for utility tokens that grant access to existing/functioning products (MiCA exempt)

3. **`mica_summary`** — Brief text explaining why compliant or not (e.g., "Missing risk disclosure section. No issuer identification. Claims MiCA compliance but lacks mandatory redemption language.")

**Implementation:**

**Layer 1 (StructuralAnalyzer) addition — no LLM needed for most checks:**
- Keyword scan for MiCA/EU regulation mentions → `claims_mica_compliance`
- Section detection: check for "Risk Disclosure", "Issuer Information", "Rights and Obligations", "Redemption", "Governance", "Environmental Impact" sections
- If ≥5 of 7 required sections present → `mica_compliant: YES`
- If 3–4 → `PARTIAL`
- If <3 → `NO`
- Generate `mica_summary` from missing elements

**Layer 2 (ClaimExtractor) enhancement — LLM can assess quality:**
- During claim extraction, tag any claims related to regulatory compliance
- LLM can assess whether risk disclosures are substantive vs. boilerplate

**Schema update:**
Add three columns to `wpv_verifications`:
- `claims_mica_compliance TEXT` (YES/NO/NOT_MENTIONED)
- `mica_compliant TEXT` (YES/NO/PARTIAL/NOT_APPLICABLE)
- `mica_summary TEXT`

Or store inside `structural_analysis_json` / `report_json` as nested fields (simpler, no migration).

**Recommended approach:** Store in `structural_analysis_json` for v1. If MiCA data becomes a premium product (likely), promote to dedicated columns later.

**Tests:**
- Whitepaper with explicit MiCA claim + all sections → YES/YES
- Whitepaper with MiCA claim but missing sections → YES/PARTIAL + summary
- Whitepaper with no MiCA mention and no sections → NOT_MENTIONED/NO
- Utility token whitepaper → NOT_MENTIONED/NOT_APPLICABLE

**Report updates:**
- LegitimacyScanReport: add `claims_mica_compliance` and `mica_compliant` fields
- All higher tiers inherit these fields
- Scam Alert Feed: flag projects that CLAIM MiCA compliance but FAIL the check (fraudulent compliance claims)

Commit: `feat: MiCA compliance check — L1 structural + L2 claim tagging`

### **1.5 Agent-Level Tests**

Write Vitest tests for wpv-agent config validation.

**Test targets:**
- Character exports valid Character with name "Grey"
- Plugin load order matches dependency chain
- System prompt contains all 6 action routing directives
- `settings.secrets` keys match `.env.example`

Commit: `test: agent config validation tests`

### 1.6 VPS Setup for Production Deployment

Forces will provision a VPS (Lightsail: 2 vCPU, 4GB RAM, 40GB SSD, Ubuntu 24.04) in the same region/city as Supabase. Forces provides IP + SSH credentials.

**Setup steps:**

1. SSH into VPS
2. Install: Bun, Ollama, git, PM2
3. Pull embedding model: `ollama pull nomic-embed-text`
4. Clone repos to `/opt/grey/`
5. Create `.env` with production credentials (including `VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`)
6. Build everything in dependency order
7. Configure PM2 ecosystem:
   - `ollama` process (autorestart)
   - `grey` process (autorestart, daily restart at 05:00 UTC via `cron_restart: "0 5 * * *"`)
8. `pm2 startup` + `pm2 save` for auto-start on boot
9. Test: disconnect SSH, verify processes survive. Reboot VPS, verify auto-recovery.

Commit: `docs: VPS deployment procedure`

### 1.7 Pre-Launch Cron Operations — START BUILDING THE DATABASE

**Once PDF audit (1.3), MiCA check (1.4), and factory contract (1.2) are all complete, start the daily cron immediately.** Do not wait for ACP registration or sandbox graduation. The cron discovers and verifies whitepapers from Base chain — it's purely internal database-building that doesn't require ACP.

**Purpose:** By launch day, the Greenlight List and Scam Alert Feed already have real data. We don't launch empty. Every day the cron runs before graduation is 10 more verified whitepapers in the database.

**Steps:**
1. Verify all Phase 1 tasks (1.1–1.4) are complete
2. Confirm BaseChainListener parses live `Graduated` events from `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`
3. Run one manual discovery cycle: `WPV_SCAN` via the agent
4. Verify: tokens discovered → metadata enriched → PDFs fetched → L1/L2/L3 verification → results stored in Supabase
5. Verify MiCA compliance fields populated for each whitepaper
6. If manual run succeeds, enable the daily cron at 06:00 UTC
7. Monitor for 3 days:
   - Check Supabase daily for new wpv_whitepapers records
   - Verify COC/V stays within budget ($0.29–$0.57 per WP)
   - Verify no crashes or error accumulation in PM2 logs
8. After 3 stable days, cron runs unattended

**If running on VPS (1.6 complete):** Start the cron there. The VPS runs 24/7 and the cron fires reliably at 06:00 UTC regardless of Forces' location or connectivity.

**If VPS not yet ready:** Run the cron locally. Even a few manual runs build valuable database content.

**Target:** 30–50 verified whitepapers in the database by Graduation Day.

Commit: `feat: enable pre-launch cron — database building begins`

### 1.8 Character Update for Grey

Final review of character system prompt with all new features integrated:
- Verify ACTION ROUTING section
- Add MiCA compliance capability to system prompt ("Grey checks MiCA compliance for every whitepaper")
- Update agent identity throughout
- Mention the growing database ("Grey's verification database grows daily")

---

## Phase 2: Blocked on ACP Credentials

Forces is registering on Virtuals. When credentials arrive:

### 2.1 Update .env with ACP Credentials

Add `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `ACP_AGENT_WALLET_ADDRESS` to both local and VPS `.env`.

### 2.2 Re-Run ACP Smoke Test

All 8/8 should now pass.

### 2.3 Build Buyer Test Agent

`grey-buyer-agent/` — minimal scaffold. 10 transactions at $0.01 against Grey for sandbox graduation.

### 2.4 Sandbox Graduation

1. Enter sandbox — **cron is already running and database already has content from Phase 1.7**
2. 10 test transactions: buyer → Grey at $0.01 each
3. Submit graduation request
4. Virtuals review: 24–48 hours

### 2.5 Deploy to VPS for Production

Push final code, pull on VPS, restart PM2. Grey is live 24/7.

### 2.6 Post-Graduation Monitoring

Verify Resources visible, Butler routing active, monitor jobs/payments/COC/V.

---

## Phase 3: Post-Graduation

### 3.1 Public Website (Weeks 3–4)

Next.js on same Supabase backend at whitepapergrey.com. MiCA compliance data displayed for every verified whitepaper.

---

# Operational Notes

## Startup Checklist (Local Dev)

1. Start Ollama (`ollama serve`)
2. Verify `.env` (including `VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`)
3. Build: plugin-autognostic → plugin-wpv → wpv-agent
4. `elizaos dev`
5. Verify: 7 plugins loaded, WpvService initialized

## Plugin Load Order (Mandatory)
```
sql → ollama → anthropic → knowledge → autognostic → wpv → bootstrap
```

## Test Baselines

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-wpv | 195 | 2026-03-14 |
| wpv-agent | 0 (create in 1.5) | — |

## Commit Strategy
```
chore: rebrand to Whitepaper Grey / Grey
feat: wire Virtuals Bonding Proxy 0xF66D...3259 into BaseChainListener
test: PDF robustness audit — 20 WP corpus
feat: MiCA compliance check — L1 structural + L2 claim tagging
test: agent config validation tests
docs: VPS deployment procedure
feat: enable pre-launch cron — database building begins
feat: grey-buyer-agent for sandbox graduation
docs: update heartbeat — sandbox graduation complete
```

## Environment Variables (Complete)
```bash
# Required — populated
ANTHROPIC_API_KEY=sk-ant-...
WPV_DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SECRET_KEY=sb_secret_...
BASE_RPC_URL=https://mainnet.base.org
VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259

# Required — waiting for Forces
ACP_WALLET_PRIVATE_KEY=
ACP_SESSION_ENTITY_KEY_ID=
ACP_AGENT_WALLET_ADDRESS=

# Optional
WPV_MODEL=claude-sonnet-4-20250514
```

## Reference Files

All paths relative to `C:\Users\kidco\dev\eliza\`.

| File | Path |
|------|------|
| Architecture doc | `plugin-wpv\BUILD DOCS and DATA\WPV_Agent_Technical_Architecture_v1.3.md` |
| Brand & naming | `wpv-agent\Whitepaper_Grey_Brand_Naming.md` |
| Plugin heartbeat | `plugin-wpv\heartbeat.md` |
| Agent heartbeat | `wpv-agent\heartbeat.md` |
| Agent character | `wpv-agent\src\character.ts` |

---

*End of Kovsky Technical Execution — Whitepaper Grey*
