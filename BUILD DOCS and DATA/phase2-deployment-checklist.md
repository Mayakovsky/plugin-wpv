# Phase 2 Deployment Checklist (v3)

**Companion document to:** Whitepaper Grey Multi-Platform Deployment Plan v7
**Audience:** Forces (oversight) and Kovsky (execution)
**Purpose:** Operational checklist enforcing the "ElizaOS Grey is byte-identical throughout Phase 2" guarantee, plus wallet-infrastructure verification

---

## v3 changes vs v2

- **Step 0 verification gate added** (Section 2) — covers the pre-Phase-2 ElizaOS expansion pass that adds 6 new offerings to the live ACP-served pipeline before outreach begins
- **Two-tag baseline flow:** `pre-expansion-baseline` (captured in Section 1, before Step 0) and `phase2-baseline` (captured after Step 0). Phase 2 verification gates compare against `phase2-baseline`.
- Wallet infrastructure verification gates added (Section 2, Step 6)
- Discord webhook monitoring active from Phase 2 (per wallet doc v3); test event delivery confirmed before going live
- `compliance_research_input` replaces `compliance_report` in offering counts
- Phase 3 gating language updated to match v7 main plan (Virtuals graduation is not a precondition for anything)
- Offering count corrected to 17 grey-core / 10 Virtuals post-Step-0 — `daily_tech_brief` (aggregate cross-project) and `technical_briefing` (per-protocol delta) are distinct offerings
- "Bridge" language replaced with "same-chain transfer" where Phase 2 Base flow applies (B → D on Base is not a bridge)
- Phase 3 functionality criterion reworded to match V/R/I structure
- Phase 3 earnings criterion fixed to reference Tier B + Tier D (Phase 2 Base has no Tier C)
- Wallet integrity check fixed to distinguish Forces-authorized Tier B movements from unexpected ones

---

## Purpose

ElizaOS Grey is left running on the VPS to serve Virtuals ACP if and when that resolves. Phase 2 builds New Grey in parallel without modifying ElizaOS Grey. Expansion is the priority, not waiting for Virtuals. This checklist verifies the untouched-ElizaOS guarantee and the integrity of the new wallet infrastructure.

Every checkbox is a verification, not an assumption. Sign-off requires Forces or Kovsky to confirm each item.

If any check fails, **stop**. Do not proceed. Investigate. Forces decides whether and how to continue.

---

## Section 1: Pre-Step-0 baseline capture

**Note on baseline tags:** This checklist uses two baseline tags on the ElizaOS Grey repo:
- `pre-expansion-baseline` — captured *here, before Step 0*. Represents ElizaOS Grey as it stands with the original 4 ACP offerings.
- `phase2-baseline` — captured *after Step 0 completes*. Represents ElizaOS Grey with all 10 offerings live. **This is the tag that Phase 2 verification gates compare against.**

Section 1 captures `pre-expansion-baseline`. The `phase2-baseline` tag is captured later as part of the "After Step 0" gate in Section 2.

### Repository baseline (pre-Step-0)

- [ ] Git commit hash of ElizaOS Grey's `main` captured
  ```bash
  cd C:\Users\kidco\dev\eliza\plugin-wpv
  git rev-parse HEAD > pre-expansion-commit.txt
  git log -1 --format="%H %ai %s" >> pre-expansion-commit.txt
  ```
- [ ] `pre-expansion-commit.txt` saved outside the repo
- [ ] Git tag created: `git tag pre-expansion-baseline && git push --tags`
- [ ] No uncommitted changes

### Deployment artifact baseline (pre-Step-0)

- [ ] VPS deployment directory recorded
- [ ] Content hash captured:
  ```bash
  find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) \
    -not -path "*/node_modules/*" \
    | sort | xargs sha256sum > /tmp/eliza-grey-pre-expansion.sha256
  ```
- [ ] `eliza-grey-pre-expansion.sha256` copied off VPS
- [ ] Process identified (PID, systemd unit name, or pm2 process ID)
- [ ] Node/npm/pnpm versions and key dependency versions recorded

### Database baseline

- [ ] Row counts from each existing `wpv_*` table:
  ```sql
  SELECT 'wpv_whitepapers' AS table_name, COUNT(*) FROM wpv_whitepapers
  UNION ALL SELECT 'wpv_verifications', COUNT(*) FROM wpv_verifications
  UNION ALL SELECT 'wpv_claims', COUNT(*) FROM wpv_claims;
  ```
- [ ] Snapshot saved with timestamp
- [ ] No `grey_two` schema exists yet (clean slate)

### Operational baseline

- [ ] VPS resource usage recorded (memory, disk, ports)
- [ ] ElizaOS Grey running and serving live ACP traffic on the original 4 offerings
- [ ] Note current ACP discoverability status (Grey's ranking on relevant search terms)

### Wallet & credential baseline (ElizaOS-side)

- [ ] ACP signer wallet address recorded (whitelisted burner EOA)
- [ ] ACP session entity key ID recorded (40675)
- [ ] Agent wallet (smart contract wallet) address recorded
- [ ] Documented: "ElizaOS Grey only — Virtuals-connected. New Grey uses entirely separate wallet hierarchy."

**Section 1 sign-off:**
- Forces: __________________ Date: __________
- Kovsky: __________________ Date: __________

---

## Section 2: Per-step verification gates

### After Step 0 (Pre-Phase-2 ElizaOS expansion)

**Step 0 is the one deliberately-scoped exception to the "ElizaOS untouched" rule.** 6 new offerings added to the live ACP-served pipeline. After this step, ElizaOS Grey is locked at the `phase2-baseline` tag for the rest of Phase 2.

**Pre-expansion baseline:**

- [ ] `pre-expansion-baseline` git tag created before any Step 0 changes
- [ ] `pre-expansion-baseline.sha256` deployment artifact hash captured
- [ ] Forces approves the scope of Step 0 work (6 offerings, no other changes)

**Implementation:**

- [ ] All 6 new handlers implemented in `plugin-wpv`: `claim_extraction`, `claim_history`, `audit_posture_check`, `tokenomics_audit`, `quick_protocol_facts`, `claim_evaluation`
- [ ] Each handler has at least one unit test passing
- [ ] All 6 offerings registered on the live ACP with prices: $0.50 / $0.10 / $0.75 / $1.75 / $0.30 / $0.10 respectively
- [ ] Smoke test passes for each new offering using a known whitepaper (e.g., Uniswap V3 in cache)
- [ ] Smoke test confirms existing 4 offerings (`legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `daily_tech_brief`) produce byte-identical outputs to pre-expansion versions on identical inputs (or, where output formatting changed deliberately, diff is documented)
- [ ] No regression in response time on existing 4 offerings
- [ ] No opportunistic refactoring landed alongside the 6 additions
- [ ] No dependency updates landed alongside the 6 additions

**Post-expansion baseline (this is what Phase 2 gates against):**

- [ ] `phase2-baseline` git tag created after all 6 offerings are live and smoke-tested
- [ ] `phase2-baseline.sha256` deployment artifact hash captured
- [ ] Forces signs off on the full 10-offering set being live before Outreach Round 1 begins

**Outreach gating:**

- [ ] Outreach Round 1 has NOT begun before Step 0 sign-off
- [ ] Requirement-text template updated to list all 10 ACP offerings (per main plan v7)

If any item above fails, **stop**. Do not proceed to Phase 2 Step 1. Do not start outreach.

### After Step 1 (Repository setup)

- [ ] New Grey repo exists at planned location
- [ ] Separate from ElizaOS Grey repo
- [ ] No code from ElizaOS Grey imported, vendored, or copied
- [ ] ElizaOS Grey commit hash matches phase2-baseline
- [ ] VPS resource usage unchanged

### After Step 2 (Pipeline extraction)

**Highest-care step.**

- [ ] ElizaOS Grey commit hash STILL matches phase2-baseline
- [ ] ElizaOS Grey deployment artifact hash STILL matches baseline (diff produces zero output)
- [ ] `grey_two` schema exists in Supabase with expected tables (including `sweep_log`)
- [ ] `wpv_*` table row counts unchanged or changed only via ElizaOS Grey's own production activity
- [ ] `grey-pipeline` smoke test passes
- [ ] Zero ElizaOS dependencies: `grep -r "@elizaos" packages/grey-pipeline` produces nothing
- [ ] If Virtuals ACP visualizer is reachable, Grey still shows the expected status there

### After Step 3 (Schema lock)

- [ ] ElizaOS Grey commit hash and deployment artifact STILL match phase2-baseline
- [ ] Generated TypeScript types compile
- [ ] OpenAPI spec validates
- [ ] Schema validation tests pass
- [ ] All 17 offering response schemas defined, including `daily_tech_brief` and `compliance_research_input`

### After Step 4 (grey-core build)

- [ ] ElizaOS Grey commit hash and deployment artifact STILL match phase2-baseline
- [ ] `grey-core` builds and runs locally
- [ ] All 17 offering routes return correctly-shaped responses to test inputs
- [ ] `/v1/health`, `/v1/identity`, `/v1/openapi.json` respond
- [ ] No port collision
- [ ] grey-core's Supabase writes land in `grey_two` schema only

### After Step 5 (ERC-8004 identity)

- [ ] DID minted on Celo (or chosen chain)
- [ ] DID document references both runtime instances
- [ ] `GREY_DID_OWNER` wallet separate from ACP signer AND all New Grey earnings wallets
- [ ] Owner key in Forces's offline storage only — not in any repo, not on VPS
- [ ] `/v1/identity` returns the DID document
- [ ] ElizaOS Grey unaffected

### After Step 6 (Wallet infrastructure — Base)

**Wallet integrity gates — verify thoroughly. See Wallet Infrastructure (v3) companion doc.**

**Tier A (hot, on VPS):**
- [ ] `BASE_X402_PAY_TO` (Tier A) keypair generated offline (not on VPS)
- [ ] `BASE_X402_PAY_TO` address recorded in Forces's wallet inventory log
- [ ] `BASE_X402_PRIVATE_KEY` in VPS `.env` with perms 600, no other location on VPS
- [ ] `BASE_X402_PAY_TO` funded with ~$10 worth of Base ETH for gas

**Tier B (warm, offline):**
- [ ] `BASE_POOL_WALLET` (Tier B) keypair generated offline
- [ ] `BASE_POOL_WALLET` address recorded in Forces's wallet inventory log AND hard-coded in sweeper allowlist
- [ ] `BASE_POOL_WALLET` private key in Forces's encrypted offline storage — NOT on VPS (verify by searching VPS filesystem for the private key; the Tier B address should appear in sweeper source as the destination constant, but no private key for it should be present)

**Tier D (central, Forces-held offline; hardware-wallet upgrade later):**
- [ ] `GREY_TREASURY_RECEIVE` keypair generated offline
- [ ] `GREY_TREASURY_RECEIVE` address recorded in Forces's wallet inventory log
- [ ] `GREY_TREASURY_RECEIVE` private key in Forces's encrypted offline storage — NOT on VPS
- [ ] `GREY_TREASURY_OPERATING` keypair generated offline
- [ ] `GREY_TREASURY_OPERATING` address recorded in Forces's wallet inventory log
- [ ] `GREY_TREASURY_OPERATING` private key in Forces's encrypted offline storage — NOT on VPS
- [ ] `GREY_TREASURY_TAX_RESERVE` keypair generated offline
- [ ] `GREY_TREASURY_TAX_RESERVE` address recorded in Forces's wallet inventory log
- [ ] `GREY_TREASURY_TAX_RESERVE` private key in Forces's encrypted offline storage — NOT on VPS

**Tier C on Base (intentionally absent):**
- [ ] No `GREY_COLD_BASE` wallet generated — Tier C is skipped on Base per wallet doc v3 (A → B → D direct flow)

**Sweeper service:**
- [ ] `grey-sweeper.service` systemd unit deployed
- [ ] `grey-sweeper.service` runs as dedicated user, separate from grey-core
- [ ] Sweeper allowlist hard-coded in source (verified by code review — env-var-only is insufficient)
- [ ] `grey_two.sweep_log` table exists and is writable by sweeper
- [ ] Sweeper successfully logs at least one test event to `grey_two.sweep_log`

**Monitoring (Phase 2):**
- [ ] Basic logging to `grey_two.sweep_log` confirmed
- [ ] `ALERT_WEBHOOK_URL` configured with Forces's Discord webhook
- [ ] Test event posted to Discord channel and confirmed received by Forces before going live

### After Step 7 (x402 adapter build)

- [ ] ElizaOS Grey commit hash and deployment artifact STILL match phase2-baseline
- [ ] Adapter builds cleanly
- [ ] All 17 offerings exposed as x402-paid endpoints
- [ ] Test buyer on Base Sepolia can pay and call each route successfully

### After Step 8 (VPS deploy + x402 Bazaar)

**Second highest-care step.**

**Before deploy:**

- [ ] systemd unit files for `grey-core.service` and `grey-sweeper.service` reviewed by Forces
- [ ] Both units specify dedicated users (not shared with ElizaOS Grey)
- [ ] Both units specify dedicated working directories and log directories
- [ ] No `Requires=` / `Wants=` with ElizaOS Grey's unit
- [ ] Port for grey-core doesn't conflict (`ss -tlnp` on VPS)
- [ ] `.env` files exist on VPS, gitignored, perms 600, owned by service users
- [ ] CDP API key obtained

**During deploy:**

- [ ] grey-core deployed to dedicated VPS directory (NOT in ElizaOS Grey directory)
- [ ] grey-sweeper deployed to its own dedicated directory
- [ ] `systemctl enable grey-core grey-sweeper && systemctl start grey-core grey-sweeper` succeed
- [ ] `systemctl status` both show active and running

**Immediately after deploy:**

- [ ] ElizaOS Grey systemd unit shows unchanged uptime
- [ ] VPS memory/disk within acceptable bounds
- [ ] No port conflicts
- [ ] grey-core's `/v1/health` returns 200
- [ ] grey-sweeper sent its startup alert

**First smoke-test payment (testnet first, then mainnet):**

- [ ] Manual x402 buyer client completes paid request on Base Sepolia
- [ ] USDC arrived at testnet `BASE_X402_PAY_TO`
- [ ] grey-core logs show full request trace
- [ ] ElizaOS Grey unaffected

- [ ] Switch to Base mainnet, repeat smoke test
- [ ] USDC arrived at mainnet `BASE_X402_PAY_TO`
- [ ] grey-sweeper observes balance change (no sweep yet if below threshold)

### After Step 9 (Parity check)

- [ ] ElizaOS Grey commit hash and deployment artifact STILL match phase2-baseline
- [ ] Parity report exists at `infra/phase2-parity-report.md`
- [ ] Covers at least 10 representative whitepapers
- [ ] Concerning differences resolved or explicitly accepted
- [ ] No edits to ElizaOS Grey to "fix" differences

---

## Section 3: Phase 2 close sign-off

### ElizaOS Grey unchanged proof (post-Step-0 lock)

- [ ] `git rev-parse HEAD` on ElizaOS Grey repo equals the commit tagged `phase2-baseline` (post-Step-0)
- [ ] `git log` shows no commits since `phase2-baseline` tag
- [ ] VPS deployment artifact hash matches `phase2-baseline.sha256`
- [ ] ElizaOS Grey running same code throughout Phase 2 (since Step 0 sign-off)
- [ ] All 10 ACP offerings still live and responding

### Database integrity

- [ ] `wpv_*` row counts consistent with normal ElizaOS Grey activity (or static if Virtuals ACP hasn't been connecting)
- [ ] `grey_two.*` row counts reflect New Grey's smoke testing and real x402 traffic
- [ ] No writes from New Grey's process touched `wpv_*` tables

### Operational health

- [ ] ElizaOS Grey continues running (Virtuals connection status doesn't matter — we're not gating on it)
- [ ] grey-core serving x402 Bazaar: healthy, real paid traffic
- [ ] grey-sweeper: healthy, at least one sweep cycle executed
- [ ] Three services running on VPS without resource contention
- [ ] Logs in respective directories with healthy rotation

### Wallet integrity

- [ ] `BASE_X402_PAY_TO` balance is low (post-sweep) and matches sweeper logs
- [ ] `BASE_POOL_WALLET` balance reflects accumulated sweeps less any Forces-initiated Tier B → Tier D transfers (verified by Forces checking offline-key access and reconciling against the monthly check log)
- [ ] No transactions from `BASE_X402_PAY_TO` to anywhere other than `BASE_POOL_WALLET`
- [ ] All outbound transactions from `BASE_POOL_WALLET` match Forces's authorized transfer log (Tier B → Tier D RECEIVE); any unrecorded outbound is a compromise indicator — investigate immediately
- [ ] Tier D wallets (`GREY_TREASURY_RECEIVE`, `GREY_TREASURY_OPERATING`, `GREY_TREASURY_TAX_RESERVE`) reachable by Forces using offline keys

### Business / proof-of-life criteria

- [ ] grey-core served at least 50 real (paid) requests on x402 Bazaar across multiple offerings
- [ ] At least one core offering discoverable via x402 Bazaar
- [ ] Per-call margin positive across served offerings

**Section 3 sign-off:**
- Forces: __________________ Date: __________
- Kovsky: __________________ Date: __________

When all checked: Phase 2 closes. Tier 2 expansion begins. Phase 3 planning may begin (Section 5).

---

## Section 4: Ongoing monitoring after Phase 2

### Weekly checks

- [ ] ElizaOS Grey commit hash still matches phase2-baseline
- [ ] Virtuals ACP visualizer healthy if relevant — non-blocking; Grey's status there is informational
- [ ] grey-core health endpoint responding
- [ ] grey-sweeper executing expected sweep cadence
- [ ] No service anomalies (memory leaks, crash loops)
- [ ] Tier A balance trending normally (not stuck high, not zero)
- [ ] Tier B balance growing as expected

### Monthly checks

- [ ] Manual transfer from Tier B (`BASE_POOL_WALLET`) to Tier D (`GREY_TREASURY_RECEIVE`) on Base — same-chain ERC-20 transfer, no bridge required while only Base earnings are active. Then Forces manually splits 70/30 to OPERATING + TAX_RESERVE. (Once Tier 2+ chains come online, cross-chain bridges enter the picture for those chains.)
- [ ] Cost margin review across all offerings
- [ ] Bazaar discovery still indexing Grey's endpoints
- [ ] Per-route call volume + conversion (402s vs payments received)
- [ ] Aggregate earnings tally — feeds Phase 3 gating

### Triggered checks

- [ ] ElizaOS major version release: do NOT auto-update. Evaluate; stay on working version unless we want to engage with Virtuals updates.
- [ ] grey-core bug fix in `grey-pipeline`: does NOT auto-propagate to ElizaOS Grey. Forces decides on backporting (likely not, given Phase 3 is approaching).
- [ ] Phase 3 work begins: new baseline capture.

---

## Section 5: Phase 3 gating

**Updated from v2: time is not the metric, and Virtuals graduation is not a precondition. Robust functionality and meaningful earnings on any non-Virtuals platform are sufficient.**

Phase 3 (retiring ElizaOS Grey) can begin serious planning when **all** of the following are true:

### Functionality criteria

- [ ] grey-core has served real paid traffic on at least one non-Virtuals platform (x402 Bazaar, Olas Mech, Nevermined, or other)
- [ ] No critical unresolved bugs in `grey-pipeline` or `grey-core`
- [ ] Error rate acceptable (Forces sets bar; suggested <2% non-recoverable errors)
- [ ] At least 250 cumulative real paid requests served correctly across offerings
- [ ] All 7 Verification offerings have served real paid traffic (Verification is Grey's anchor concentration — Phase 3 should not trigger before the core is exercised)
- [ ] Parity check (or equivalent sampling) shows quality consistent with ElizaOS Grey's output

### Earnings criteria

- [ ] Cumulative earnings reach Forces's threshold (Forces sets; suggested floor $500 USDC pooled in Tier B + Tier D across all chains)
- [ ] Per-call margin positive
- [ ] Earnings trajectory positive over recent weeks

### Operational confidence

- [ ] No unresolved security concerns
- [ ] Wallet infrastructure clean — no compromise indicators
- [ ] grey-core has weathered at least one VPS reboot or service restart cleanly
- [ ] Forces is confident in the architecture and ready to commit

When **all** above are met, Phase 3 begins. Phase 3 work has its own breakdown and checklist documents written when triggered.

**Phase 3 is not on a timeline.** It triggers on the criteria, which are likely to be met within weeks of Phase 2 close given the relaxed standards.

---

## What to do if a check fails

1. **Stop.** Do not proceed.
2. **Document** the failure: which check, expected, actual.
3. **Notify Forces** if Kovsky discovered it during execution.
4. **Investigate.** Common causes:
   - Accidental modification of ElizaOS Grey code (revert from baseline tag)
   - Accidental writes to `wpv_*` tables (audit, rollback if possible)
   - Configuration mistake (port conflict, wrong env var, wrong user)
   - Wallet integrity issue — treat as security incident; see Wallet Infrastructure doc
5. **Decide.** Forces decides whether recoverable in place, requires rollback, or requires process change.
6. **Document the decision** in `infra/phase2-incidents.md`.

---

## Rollback scenarios

### grey-core misbehaves
```bash
sudo systemctl stop grey-core
sudo systemctl disable grey-core
```
ElizaOS Grey unaffected. grey-sweeper continues (Tier A still receives any in-flight settlements; sweeper still operates).

### grey-sweeper misbehaves
```bash
sudo systemctl stop grey-sweeper
```
Tier A may accumulate above threshold until sweeper resumes. grey-core unaffected. Forces can manually sweep using the Tier A key from VPS `.env` if needed.

### Wrong outputs on x402 Bazaar
```bash
sudo systemctl stop grey-core
# Or selectively disable specific routes via config + restart
```

### Wallet compromise indicators (any tier)
- See Wallet Infrastructure companion doc "What happens if a Tier A/B key is compromised" sections
- Stop affected service, rotate keys, redeploy

### ElizaOS Grey somehow affected
On the VPS deployment of `plugin-wpv`:
```bash
cd <VPS deployment path for plugin-wpv>
git fetch origin
git checkout phase2-baseline
sudo systemctl restart eliza-grey
```
(Dev-side equivalent on Windows: `cd C:\Users\kidco\dev\eliza\plugin-wpv` for inspection — no systemd there.)

### Step 0 expansion fails or regresses existing offerings
If smoke tests after Step 0 show the original 4 offerings are not byte-identical to pre-expansion, or any new handler is broken, the recovery path is — on the VPS deployment of `plugin-wpv`:
```bash
cd <VPS deployment path for plugin-wpv>
git fetch origin
git checkout pre-expansion-baseline
sudo systemctl restart eliza-grey
# Remove the 6 new ACP service registrations (Forces handles via ACP UI/registration JSON)
```
(Dev-side equivalent: `cd C:\Users\kidco\dev\eliza\plugin-wpv` to investigate the regression in a separate branch.)

Do NOT proceed to Phase 2 Step 1 or start outreach until Step 0 is clean and `phase2-baseline` is properly captured.

---

## Reference values to capture

Fill in for your environment:

| Item | Value | Captured by | Date |
|---|---|---|---|
| ElizaOS Grey repo path (dev) | `C:\Users\kidco\dev\eliza\plugin-wpv` | | |
| ElizaOS Grey baseline commit | | | |
| ElizaOS Grey VPS deploy path | | | |
| ElizaOS Grey systemd unit name | | | |
| ElizaOS Grey port | | | |
| ACP signer wallet address | | | |
| ACP session entity key ID | 40675 | | |
| Agent wallet address | | | |
| New Grey repo path | | | |
| New Grey VPS deploy path | | | |
| grey-core systemd unit | grey-core.service | | |
| grey-core port | 3001 | | |
| grey-sweeper systemd unit | grey-sweeper.service | | |
| `BASE_X402_PAY_TO` (Tier A) | | | |
| `BASE_POOL_WALLET` (Tier B) | | | |
| `GREY_TREASURY_RECEIVE` (Tier D) | | | |
| `GREY_TREASURY_OPERATING` (Tier D, 70%) | | | |
| `GREY_TREASURY_TAX_RESERVE` (Tier D, 30%) | | | |
| Grey ERC-8004 DID | | | |
| `GREY_DID_OWNER` wallet | | | |
| Supabase schema (New Grey) | grey_two | | |
| Alert webhook URL (Discord) | | | |

---

*Document version: v3, May 11, 2026. Companion to deployment plan v7.*
