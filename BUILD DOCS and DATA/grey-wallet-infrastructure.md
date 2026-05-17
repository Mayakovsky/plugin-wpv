# Grey Wallet Infrastructure & Earnings Pooling (v3)

**Companion document to:** Whitepaper Grey Multi-Platform Deployment Plan v7
**Audience:** Forces (decisions and key custody), Kovsky (implementation)
**Purpose:** Multi-chain wallet architecture for New Grey, with secure earnings pooling, central treasury, and automated tax-burden split

---

## v3 changes vs v2

- **Tier C reclassified as conditional, per chain.** No longer a default layer. Used only when a chain has a native-asset reason for holding (staking, governance, native ops). Phase 2 Base flow skips Tier C entirely.
- **Phase 2 architecture locked.** Strict three-tier flow on Base: A → B → D. Five wallets, not seven.
- **Tier D wallets confirmed Forces-held for Phase 2.** Hardware wallet upgrade when Forces is ready, not as Phase 2 blocker.
- **Tax split rate 30% to reserve confirmed.** Manual splits confirmed.
- **Sweep parameters confirmed:** $200 threshold, daily cadence (revisit per chain/platform as earnings grow).
- **Discord monitoring included** — sweep events, errors, and anomalies post to a Discord webhook from Phase 2 onward. Basic logging to `grey_two.sweep_log` runs in parallel for audit trail.

---

## Confirmed parameters (from Forces decisions)

| Parameter | Value |
|---|---|
| Key management | Self-managed (Path 1). Turnkey deferred. |
| Tier D cold storage | Hardware wallet "when we get there." Forces-held keys with secure offline storage for now. |
| Tax split rate | 30% to tax reserve, 70% to operating |
| Split mechanism | Manual via Forces. Not locked in — can revisit if cadence justifies on-chain split contract. |
| Sweep threshold | $200 USDC equivalent |
| Sweep cadence | Daily (revisit as earnings grow per chain/platform) |
| Monitoring channel | Discord webhook (Phase 2) for sweep events, errors, anomalies. Basic logging to `grey_two.sweep_log` runs in parallel. |
| Tier C on Base | **Skip.** A → B → D direct flow. |
| Tier C on other chains | **Conditional** — decide per chain when shipping that surface |

---

## Strategic context

Grey is live on Virtuals ACP, earning through the ACP wallet hierarchy (signer wallet, session entity key 40675, agent smart contract wallet, all on Base). That's an active revenue surface and stays as-is.

New Grey serves every other platform with its own wallet infrastructure across multiple chains. Earnings from x402 Bazaar, Olas Mech, Nevermined, Skyfire, direct B2B, Kite, and eventually Bittensor all need to flow somewhere — and we want a clean separation between public exposure, working capital, ultimate consolidation, and tax reserves.

Design principles:

1. **Public exposure separation.** Wallets that buyers see are different from wallets that hold accumulated funds.
2. **Multi-chain coverage with one ownership root.** Forces controls all of it.
3. **Central consolidation with auto-split.** Earnings from every chain land in a central treasury with an automatic tax-burden carve-out.
4. **Virtuals ACP earnings flow independently.** Grey's ACP wallet hierarchy is separate from New Grey's. Both can converge at Tier D if Forces wants, but they don't need to.

---

## Wallet tier model

Four tiers, with **Tier C conditional** depending on whether a chain has a native-asset reason for intermediate cold storage.

### Tier A — Public hot wallet (per platform)

**Purpose:** Receive payments from public surfaces. Signs settlement transactions.

**Characteristics:**
- One per (chain × platform) pair
- Lowest security tier — assume compromise possible
- Holds minimal balance (~1 day of incoming flow plus gas reserve)
- Private key on VPS in `.env`, perms 600
- Different keypair from any other Grey wallet

**Examples:**
- `BASE_X402_PAY_TO` — receives x402 Bazaar USDC on Base
- `GNOSIS_MECH_PAY_TO` — receives Olas Mech xDAI/USDC on Gnosis (Tier 2)
- `OPTIMISM_B2B_PAY_TO` — receives invoiced partner USDC (Tier 3)
- More added as platforms come online

### Tier B — Warm pool wallet (per chain)

**Purpose:** Per-chain pool receiving swept funds from Tier A on that chain. Not publicly associated with Grey's services.

**Characteristics:**
- One per chain (not per platform)
- Receives only via internal sweeps from Tier A on same chain
- Sends only to (manual, Forces-triggered):
  - Tier C (if that chain uses one — only when there's a native reason)
  - Tier D central treasury (via bridge)
- Private key NOT on VPS. Stored encrypted offline by Forces.
- Inbound sweeps automated; outbound moves manual.

**Examples:**
- `BASE_POOL_WALLET`
- `GNOSIS_POOL_WALLET` (Tier 2)
- `OPTIMISM_POOL_WALLET` (Tier 3)

### Tier C — Per-chain intermediate cold storage (CONDITIONAL)

**Purpose:** Hardware-wallet-secured holding on a specific chain, used **only when there's a positive reason to keep funds on that chain** rather than consolidating everything to Tier D.

**The "reason to be on that chain" test:** Does the chain have a native asset or position we want to hold? Staking, governance, native ops, native-token treasury exposure?

**When to USE Tier C on a given chain:**
- **Bittensor** — TAO has to stay native for subnet ops, staking, validator scoring. `GREY_COLD_BITTENSOR` holds TAO. (Bittensor uses its own coldkey/hotkey system, different mechanism than EVM hardware wallets, but same role.)
- **Gnosis (conditional)** — If we decide to stake OLAS on Mech contracts to attract emissions, `GREY_COLD_GNOSIS` holds OLAS. If we stay pure pay-per-call without staking, skip Tier C on Gnosis. Decide when we ship Olas Mech.
- **Avalanche / Kite (conditional)** — If KITE governance/staking becomes meaningful, `GREY_COLD_KITE` holds KITE. Decide when we ship Kite.

**When to SKIP Tier C on a given chain:**
- **Base** — Phase 2 flow. We want USDC consolidated to Tier D anyway; no native-asset reason to hold separately on Base. `GREY_TREASURY_OPERATING` IS the working capital. **Skip Tier C on Base.**
- **Optimism / Mode / OP Superchain** — USDC pass-through only. Skip.
- **Solana** — when we add it, likely skip unless we hold a Solana-native position.
- **Polygon, other EVM chains** — same default: skip unless reason to hold appears.

**Properties:**
- Hardware wallet per chain when used (Ledger/Trezor for EVM, native coldkey for Bittensor)
- Receives from Tier B on same chain via manual transfers
- Sends out rarely — only when reducing per-chain holdings or rebalancing to Tier D
- One Tier C wallet per chain where it makes sense; absent where it doesn't

**Examples (only on chains that use Tier C):**
- `GREY_COLD_GNOSIS` — only if staking OLAS
- `GREY_COLD_BITTENSOR` — always, since TAO can't easily leave Bittensor
- `GREY_COLD_KITE` — only if KITE positions matter

### Tier D — Central treasury with automated split (cross-chain)

**Purpose:** Cross-chain consolidation point. Receives bridged earnings from per-chain Tier B (or Tier C, where used). Splits each inbound deposit between operating treasury and tax reserve.

**Anchor chain:** **Base.** Cheap, liquid USDC, well-bridged.

**Three wallets:**

1. **`GREY_TREASURY_RECEIVE`** — inbound address on Base where bridged funds from every Tier B (or Tier C) arrive. The consolidation entry point.

2. **`GREY_TREASURY_OPERATING`** — receives 70% of each split. Long-term operating treasury. Forces's working capital. What gets drawn from for ops, investments, runway.

3. **`GREY_TREASURY_TAX_RESERVE`** — receives 30% of each split. Segregated reserve for tax burden. Funds sit untouched until tax payment time.

**Custody for Phase 2:**
- All three are Forces-held private keys, generated offline, stored encrypted offline
- Hardware-wallet upgrade when Forces is ready
- The hardware-wallet upgrade is reversible (export/import) so this is not a one-way door

**Split mechanism:**
- **Manual via Forces (current).** Bridged funds arrive at `RECEIVE`. Forces opens an offline-key session, sends 30% to `TAX_RESERVE`, 70% to `OPERATING`. Logs the operation.
- **On-chain split contract (future option, not locked in).** Deploy a simple split contract (or use 0xSplits.xyz) on Base with two payees at the configured ratio. Bridged funds sent to the contract address auto-route. Switch to this if manual cadence becomes burdensome.

**Cadence:**
- Bridges from Tier B → Tier D are manual, Forces-triggered, on Forces's schedule
- Splits happen on each bridge arrival
- Cadence likely monthly or quarterly at low volumes; can tighten as earnings scale

---

## Phase 2 Base flow (concrete)

For Phase 2 Step 6 — the initial wallet setup before x402 Bazaar ships:

```
┌──────────────────────────────────────────────────────────────────┐
│  x402 Bazaar buyer pays USDC                                      │
│                          ↓                                        │
│  BASE_X402_PAY_TO (Tier A, hot)                                   │
│  - Private key on VPS .env, perms 600                             │
│  - Funded ~$10 Base ETH for gas                                   │
│                          ↓ automated sweep                        │
│                          ↓ (daily or when > $200 USDC)            │
│  BASE_POOL_WALLET (Tier B, warm)                                  │
│  - Private key offline, Forces-held                               │
│  - Allowlist hard-coded in sweeper source                         │
│                          ↓ manual bridge (Forces, periodic)       │
│                          ↓ (skip Tier C on Base — no reason)      │
│  GREY_TREASURY_RECEIVE (Tier D, Base anchor)                      │
│  - Private key offline, Forces-held                               │
│  - Inbound from any Tier B (or Tier C, on chains that use C)      │
│                          ↓ manual split (Forces)                  │
│            ┌─────────────┴────────────┐                           │
│            ↓ 70%                      ↓ 30%                       │
│  GREY_TREASURY_OPERATING    GREY_TREASURY_TAX_RESERVE             │
│  - Working capital          - Segregated tax reserve              │
│  - Forces-held offline      - Forces-held offline                 │
└──────────────────────────────────────────────────────────────────┘
```

**Five wallets for Phase 2:**
1. `BASE_X402_PAY_TO` (Tier A)
2. `BASE_POOL_WALLET` (Tier B)
3. `GREY_TREASURY_RECEIVE` (Tier D inbound)
4. `GREY_TREASURY_OPERATING` (Tier D destination 1)
5. `GREY_TREASURY_TAX_RESERVE` (Tier D destination 2)

Plus the **identity wallet** `GREY_DID_OWNER` on Celo, which is separate from earnings entirely.

No Tier C in Phase 2. We add Tier C on a per-chain basis later if and when a chain gives us a native-asset reason to hold separately.

---

## Tier C decision tree (per chain, for future tiers)

When a new chain comes online, walk this tree:

```
Does this chain have a native asset or position we want to HOLD?
│
├── No → Skip Tier C. Flow is A → B → bridge to Tier D directly.
│
└── Yes → Use Tier C.
    │
    ├── What's the holding for?
    │   ├── Staking (e.g., OLAS for Mech emissions, TAO for subnet)
    │   ├── Governance positions (e.g., KITE governance)
    │   ├── Native-token treasury exposure (e.g., we want OLAS upside)
    │   └── Working buffer to avoid bridging round-trips
    │
    ├── How big is the holding likely to be?
    │   ├── Small + low frequency → standard hardware wallet OK
    │   └── Large + frequent ops → consider Safe multi-sig or staking-specific custody
    │
    └── Generate Tier C wallet for the chain, document in inventory.
```

**Pre-committed decisions:**
- **Bittensor: USE Tier C.** TAO can't easily leave Bittensor; we'll have native staking/subnet positions if we ship Path A or B. `GREY_COLD_BITTENSOR` is a known future wallet.

**Pending decisions (made when shipping that platform):**
- **Gnosis (Olas Mech):** Decide whether to stake OLAS for Mech emissions. If yes → `GREY_COLD_GNOSIS`. If no → skip.
- **Avalanche/Kite:** Decide whether KITE positions matter once Kite economy matures. Default: skip until reason appears.

---

## Virtuals ACP wallet posture (existing, untouched)

Grey is live on Virtuals ACP with the following wallet infrastructure, which is not touched during Phase 2:

| Wallet | Purpose | Custody |
|---|---|---|
| ACP signer wallet (whitelisted burner EOA) | Signs ACP session transactions | Stored in plugin-wpv `.env` on Lightsail |
| ACP session entity key | Session key for ACP authentication | ID: 40675 |
| Agent smart contract wallet | Holds USDC earnings from ACP buyers | On Base, controlled via signer |
| Public-facing ACP wallet | Listed publicly on Grey's ACP profile | `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f` |

**Optional consolidation at Tier D:** Forces may eventually choose to sweep accumulated ACP earnings into `GREY_TREASURY_RECEIVE` for unified tax/operating split. This is a manual decision per sweep, not automated. ACP wallet hierarchy and New Grey's hierarchy converge only at Tier D if and when Forces routes them in.

---

## Bridge strategy (cross-chain consolidation)

Earnings arrive in USDC on various L2s. Tier D anchor is Base, so bridging consolidates to Base.

**Bridge tools (in order of preference):**
1. **Circle CCTP** for USDC native cross-chain (no liquidity risk)
2. **Across Protocol** for fast intent-based bridging
3. **Hop Protocol** as fallback for Base/Optimism/Arbitrum
4. **Gnosis OmniBridge** for Gnosis routes

Bridge operations are **manual**, Forces-triggered. Not automated. Bridges carry exploit/liquidity risk we want human review on.

---

## Sweep automation (Tier A → Tier B, same chain only)

Same as v1/v2. Per-chain sweep script monitors Tier A balance, sweeps above threshold to Tier B, logs to Supabase `grey_two.sweep_log`.

**Parameters (confirmed by Forces):**
- Threshold: $200 USDC equivalent
- Cadence: daily (revisit per chain/platform as earnings grow)
- Gas reserve preserved on Tier A

**What sweepers do NOT do:**
- Cross-chain bridging (manual)
- Tier B → Tier C transfers (manual)
- Tier B/C → Tier D transfers (manual)
- Tier D splits (manual via Forces)
- Send to anything other than the hard-coded allowlisted address

---

## Tooling decision

**Confirmed:** Self-managed keys (Path 1) for Phase 2. Turnkey deferred.

Migration path to Turnkey remains available later if monthly earnings justify the operational sophistication. Not a one-way door.

---

## Initial wallet generation plan (Phase 2)

All generation on a clean offline machine, never on the VPS.

### Phase 2 immediate (Step 6)

1. `BASE_X402_PAY_TO` (Tier A hot) — keypair generated offline
2. `BASE_POOL_WALLET` (Tier B pool) — keypair generated offline
3. `GREY_TREASURY_RECEIVE` (Tier D receive on Base) — keypair generated offline
4. `GREY_TREASURY_OPERATING` (Tier D operating) — keypair generated offline
5. `GREY_TREASURY_TAX_RESERVE` (Tier D tax reserve) — keypair generated offline
6. `GREY_DID_OWNER` (ERC-8004 identity owner on Celo) — separate from earnings

**No Tier C wallets in Phase 2.**

### Phase 2 subsequent chains (as expansion ships)

- **Tier 2 — Olas Mech ships:** `GNOSIS_MECH_PAY_TO` (A), `GNOSIS_POOL_WALLET` (B). Tier C on Gnosis decided at that time.
- **Tier 3 — direct B2B with on-chain settlement:** `OPTIMISM_B2B_PAY_TO` (A), `OPTIMISM_POOL_WALLET` (B). Skip Tier C on Optimism (pass-through only).
- **Tier 4 — Kite:** `KITE_PAY_TO` (A), `KITE_POOL_WALLET` (B). Tier C on Kite decided at that time.
- **Tier 5 — Bittensor:** Bittensor coldkey/hotkey system. `GREY_COLD_BITTENSOR` (Tier C) used because TAO must stay native.

Each new chain follows the same pattern. Tier D is shared across all chains — only Tier A and Tier B are per-chain, plus optional Tier C where relevant.

---

## Key storage matrix

| Wallet | Where the key lives |
|---|---|
| ACP signer (Virtuals, existing) | VPS plugin-wpv `.env` |
| `BASE_X402_PAY_TO` (Tier A) | New Grey VPS `.env`, perms 600 |
| `GNOSIS_MECH_PAY_TO` (Tier A, future) | New Grey VPS `.env`, perms 600 |
| Other Tier A wallets (future) | New Grey VPS `.env`, perms 600 |
| `BASE_POOL_WALLET` (Tier B) | Forces encrypted offline (password manager, encrypted USB, or paper backup) |
| Other Tier B wallets (future) | Forces encrypted offline |
| Tier C wallets (chains that use C) | Hardware wallet (Ledger/Trezor) when used |
| `GREY_TREASURY_RECEIVE` (Tier D) | Forces-held offline; hardware wallet upgrade later |
| `GREY_TREASURY_OPERATING` (Tier D) | Forces-held offline; hardware wallet upgrade later |
| `GREY_TREASURY_TAX_RESERVE` (Tier D) | Forces-held offline; hardware wallet upgrade later |
| `GREY_DID_OWNER` (Celo identity) | Forces-held offline |

---

## Funding for gas

| Chain | Native token | Recommended reserve |
|---|---|---|
| Base | ETH | ~$10 worth (Tier A) |
| Gnosis | xDAI | ~5 xDAI (Tier 2) |
| Optimism | ETH | ~$10 worth (Tier 3) |
| Celo | CELO | ~$5 worth (identity wallet, infrequent use) |

Forces tops these up manually. Sweepers leave gas reserve untouched.

---

## Sweep address allowlist (security control)

**Critical:** Tier B destination addresses are **hard-coded in the sweeper source code**, not env-var-only. If an attacker gains write access to `.env` on the VPS but not the codebase, they cannot redirect sweeps. Changing a sweep destination requires a code commit, review, and deploy.

---

## Monitoring & alerting

**Phase 2 (Discord + logging):**
- Sweep events logged to `grey_two.sweep_log` Supabase table (success/failure/amount/destination, full audit trail)
- Sweep events posted to Discord webhook in human-readable form (one line per event):
  - Successful sweep → info-level: "Swept $X USDC from BASE_X402_PAY_TO to BASE_POOL_WALLET. New Tier A balance: $Y."
  - Failed sweep → warning: include tx hash if available and error reason
  - Tier A balance unusually high for unusually long (sweeper may be stuck) → warning
  - **Outbound from Tier A to non-allowlisted address** → CRITICAL alert (should be impossible by code; defensive)
- Errors written to grey-sweeper systemd journal as well
- Tier A balance checkable via on-chain explorers (BaseScan etc.)
- Tier B/D balances checkable by Forces with offline-key access

**Future enhancements** (add when justified):
- Weekly/monthly Tier B/D balance summary digests
- Tier D inbound transaction logs with auto-flag for Forces review
- Per-chain dashboard once multi-chain earnings come online

The Discord webhook is the operational pulse during Phase 2. Forces sees sweep activity in real time without needing to check on-chain or the database manually.

---

## What happens if a key is compromised

### Tier A compromise

1. Detect via Tier A balance dropping unexpectedly or via post-hoc transaction review
2. Stop grey-sweeper for affected chain
3. If value remains on compromised Tier A, attempt manual sweep using a backup signing path
4. Generate new Tier A keypair offline
5. Update grey-core config with new address
6. Update platform registrations (x402 Bazaar settlement address, Mech `payTo`, etc.) to point at new address
7. Resume operations
8. Post-incident review

Maximum loss = ~1 sweep cycle on that chain. Tier B/C/D unaffected.

### Tier B compromise

1. Tier B keys are offline; compromise requires physical access to Forces's encrypted storage
2. If discovered, immediately move Tier B funds to Tier D
3. Generate new Tier B keypair offline
4. Update sweeper allowlist (code commit), redeploy
5. Post-incident review

### Tier C compromise

1. Same pattern as Tier B — offline keys, physical-access vector
2. Recovery depends on chain: EVM hardware wallets → standard rotation; Bittensor → coldkey rotation per Bittensor's procedures
3. Move funds to Tier D where possible; rotate

### Tier D compromise

**Highest-impact scenario.** Hardware wallet (or Forces-held offline keys for Phase 2) means physical compromise is the realistic vector.

1. If detected, immediately move funds to freshly-generated Tier D wallets
2. Update bridge destinations from Tier B → new Tier D address
3. Post-incident: review custody hygiene
4. Consider migration to Safe multi-sig if not already there

This is why hardware wallets matter for Tier D when we get there. Hot-key compromise is bounded loss; Tier D compromise is potentially the whole treasury.

---

## Integration with grey-core

Grey-core interacts with wallets in two narrow ways:

1. **Receiving** — public Tier A addresses in adapter configs (x402, Mech, etc.)
2. **Sweeping** — sweeper module signs with Tier A private keys to send to Tier B

Everything else — bridges, Tier B → Tier D moves, splits, cold storage operations — happens off grey-core, manually by Forces using standard wallet UIs and (eventually) hardware devices.

Grey-core's attack surface is bounded: at worst, an attacker who fully compromises grey-core can sign Tier A transactions. The sweeper's hard-coded allowlist prevents more than one sweep-cycle's loss.

---

## Summary table

| Wallet | Tier | Chain | Keys where? | Receives from | Sends to |
|---|---|---|---|---|---|
| ACP signer EOA | Virtuals | Base | plugin-wpv `.env` (existing) | Buyer payments via ACP | Agent contract wallet |
| `0xa966...e98f` (ACP public) | Virtuals | Base | Existing ACP infrastructure | ACP buyers | Forces-controlled (manual) |
| `BASE_X402_PAY_TO` | A (hot) | Base | New Grey VPS `.env` | x402 buyers | `BASE_POOL_WALLET` only |
| `GNOSIS_MECH_PAY_TO` (future) | A (hot) | Gnosis | New Grey VPS `.env` | Olas Mech buyers | `GNOSIS_POOL_WALLET` only |
| `OPTIMISM_B2B_PAY_TO` (future) | A (hot) | Optimism | New Grey VPS `.env` | B2B partners | `OPTIMISM_POOL_WALLET` only |
| `BASE_POOL_WALLET` | B (warm) | Base | Forces encrypted offline | Tier A on Base | Bridge to `GREY_TREASURY_RECEIVE` (manual) |
| `GNOSIS_POOL_WALLET` (future) | B (warm) | Gnosis | Forces encrypted offline | Tier A on Gnosis | Tier C on Gnosis (if staking OLAS) OR bridge to Tier D |
| `OPTIMISM_POOL_WALLET` (future) | B (warm) | Optimism | Forces encrypted offline | Tier A on Optimism | Bridge to Tier D directly (no Tier C) |
| `GREY_COLD_GNOSIS` (conditional) | C (cold) | Gnosis | Hardware wallet (Forces) | Tier B Gnosis | Rare manual outflows; primarily for OLAS staking |
| `GREY_COLD_BITTENSOR` (future) | C (cold) | Bittensor | Bittensor coldkey (Forces) | TAO earnings/emissions | Subnet ops, staking; rare outflows |
| `GREY_TREASURY_RECEIVE` | D (central) | Base | Forces-held offline; hardware later | Bridged from any Tier B (or Tier C) | Manual split to OPERATING + TAX_RESERVE |
| **`GREY_TREASURY_OPERATING`** | D (central) | Base | Forces-held offline; hardware later | Tier D split (70%) | Long-term operating treasury |
| **`GREY_TREASURY_TAX_RESERVE`** | D (central) | Base | Forces-held offline; hardware later | Tier D split (30%) | Segregated tax burden reserve |
| `GREY_DID_OWNER` | Identity | Celo | Forces encrypted offline | n/a | DID updates only |

---

## Tax split — open questions for Forces

The 30% reserve is the working assumption. Worth revisiting after first quarter of meaningful earnings with proper tax planning:

- **Jurisdiction:** Forces is Mexico-based. Mexican crypto tax treatment + possible US tax exposure (US-source income from US platforms like Coinbase x402) needs accountant input.
- **Income vs. capital:** Per-call earnings via x402/Mech are likely service income. Direct B2B subscriptions similarly. Bittensor TAO emissions might be treated differently (mining-style).
- **Reserve rate:** 30% is conservative for service income in most jurisdictions. Could be too high or too low depending on actual tax liability.
- **Timing:** Reserve as earnings arrive (current plan) vs. reserve quarterly based on actual liability calculation. Current plan is more conservative.

The mechanism doesn't lock the rate — Forces adjusts as needed.

---

## Implementation work (Phase 2 Step 6)

1. Generate 5 wallets offline: `BASE_X402_PAY_TO`, `BASE_POOL_WALLET`, `GREY_TREASURY_RECEIVE`, `GREY_TREASURY_OPERATING`, `GREY_TREASURY_TAX_RESERVE`
2. Generate `GREY_DID_OWNER` separately (identity, not earnings)
3. Store keys per the key storage matrix
4. Fund `BASE_X402_PAY_TO` with ~$10 Base ETH for gas
5. Implement Base sweeper module (Tier A → Tier B, automated, threshold + cadence)
6. Hard-code `BASE_POOL_WALLET` address in sweeper allowlist
7. Deploy grey-sweeper as its own systemd unit on VPS
8. Verify first smoke-test sweep on testnet
9. Document wallet inventory in Forces's secure storage

For Tier 2+ platforms, repeat the pattern per chain. Tier C added per chain only when there's a positive reason.

---

## Decisions resolved (no longer open)

- ✅ Self-managed keys
- ✅ Hardware wallet for Tier D when Forces is ready (Forces-held offline keys for now)
- ✅ 30% tax reserve split rate (placeholder, revisit with accountant)
- ✅ Manual splits (not locked in — can revisit if cadence justifies on-chain split contract)
- ✅ Sweep threshold $200, cadence daily (revisit per chain/platform as earnings grow)
- ✅ Discord monitoring included from Phase 2 — webhook for sweep events, errors, anomalies. Basic logging to `grey_two.sweep_log` runs in parallel.
- ✅ Tier C: skip on Base; conditional on other chains decided when shipping each
- ✅ Tier C: confirmed YES for Bittensor (TAO must stay native)
- ✅ Tier C: TBD for Gnosis (depends on OLAS staking decision when Olas Mech ships)
- ✅ Tier C: TBD for Kite (depends on KITE economy when Kite ships)

---

*Document version: v3, May 11, 2026. Companion to deployment plan v7.*
