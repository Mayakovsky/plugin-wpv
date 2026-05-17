# Phase 2 Work Breakdown for Kovsky (v3)

**Companion document to:** Whitepaper Grey Multi-Platform Deployment Plan v7
**Audience:** Kovsky (Claude Code CLI implementation)
**Purpose:** Granular task breakdown for building New Grey in parallel with the existing ElizaOS Grey deployment

---

## Context

ElizaOS Grey is the current deployment, **live on Virtuals ACP** with 4 offerings registered and earning. Phase 2 builds "New Grey" — a separate codebase, separate repository, deployed as a separate process on the VPS — to serve every other platform we're targeting. New Grey is the future. ElizaOS Grey continues serving Virtuals throughout Phase 2 and likely indefinitely (per the Phase 3 coexistence-default decision in the main plan).

**Cold-start reading:** `grey-orientation.md` is the one-time orientation document. Read it before starting your first movement. It covers what Grey is, the codebase layout, pipeline architecture, current state, and the don't-touch rules — the foundation every movement assumes. This work breakdown is one of the score documents the orientation points to; read the orientation first, then come back here.

Read the main deployment plan v7 for the strategic frame. This breakdown covers Phase 2 only.

**Step 0 comes before Phase 2.** Before Phase 2 Step 1 begins and before outreach Round 1 starts, we ship 6 new offerings to the live ElizaOS Grey ACP-served pipeline. This is a bounded, deliberately-scoped pre-Phase-2 expansion pass — see Step 0 below. After Step 0 lands and is tagged `phase2-baseline`, ElizaOS Grey is locked for the rest of Phase 2.

**Movements:** The work is delivered in seven movements (Movement 0 through Movement 6), each with its own packet (`movement-N-name.md`). Each packet extracts the bounded set of work for one session from this work breakdown and the other score docs. The packets are the working set; this breakdown is the score they reference.

**Posture vs v6:** Forces learned that Virtuals' graduation evaluator was being deprecated mid-build, then graduation was completed and Grey went live anyway. The strategic frame is now: Virtuals is one revenue surface among many, expansion to other platforms is the priority, ElizaOS Grey keeps serving Virtuals stably (with Step 0's expanded offering set) while New Grey serves everything else. Phase 3 (retiring ElizaOS or building ACP routing through grey-core) is a real choice, not an inevitability — coexistence by default.

---

## Tooling note

The tooling choices below are **suggested defaults**. If you see a benefit in swapping any of them — different test framework, different logger, different monorepo tooling, different ORM — make the call. Note in commit messages or PR descriptions what you changed and why.

The only non-negotiable tooling constraints are TypeScript for the JS/TS side and Python for the Olas/Agentverse/Bittensor adapters. Everything else is recommendation, not mandate.

---

## Hard constraints (apply to every task below)

1. **The existing ElizaOS Grey repository is not modified during Phase 2.** No commits to that repo as part of Phase 2 work. No dependency updates. No deployment changes. The ElizaOS Grey codebase as it stands at the `phase2-baseline` git tag (created at the end of Step 0) must be commit-for-commit identical to the codebase during and after Phase 2, for the lifetime of Phase 2.

   **Step 0 is the one exception**, deliberately scoped: a bounded expansion pass to add 6 new offerings to the live ACP-served pipeline *before* Phase 2 begins. After Step 0 lands and is tagged, the lock applies.

2. **The existing Supabase production tables are read-only for New Grey.** New Grey may read from `wpv_whitepapers`, `wpv_verifications`, `wpv_claims` for cache lookups. New Grey never writes to those tables. New Grey writes to the `grey_two` schema only.

3. **No ACP wallets are used by New Grey.** ElizaOS Grey keeps its ACP signer wallet, session entity key 40675, and agent smart contract wallet. New Grey gets a fresh wallet hierarchy per the Wallet Infrastructure companion document — Forces-controlled, independent of Virtuals.

4. **No shared systemd unit, no shared port, no shared log directory.** New Grey runs as its own systemd unit, on its own port, writing to its own log directory.

5. **Never wipe or delete from `wpv_claims`, `wpv_verifications`, or `wpv_whitepapers` without explicit Forces approval.** This rule extends to Phase 2 — New Grey doesn't touch these tables.

6. **No time estimates.** If you finish a task and report progress, describe what was done and what's next. Don't estimate when something will be complete unless Forces explicitly asks.

---

## Phase 2 Step 0: Pre-Phase-2 ElizaOS expansion pass (one-time, bounded)

**Goal:** Ship 6 new offerings to the live Virtuals ACP-served ElizaOS Grey pipeline *before* Phase 2 begins and before outreach starts. These are all reshapings of existing pipeline outputs — no new pipeline capabilities. Once this lands and is tagged, ElizaOS Grey is locked for the duration of Phase 2.

**Why this exists:** The outreach campaign on Virtuals starts only after Step 0 is complete. Each new offering registered on the ACP becomes an additional surface for ACP discovery and a richer capability list embedded in every outreach Account. Better to do this once, well, before outreach than to ship outreach with a thin 4-offering pitch.

**Scope discipline:**
- Six offerings, listed below. Nothing else.
- No opportunistic refactoring. No unrelated bug fixes. No dependency updates beyond what the new offerings strictly need.
- If something looks broken or smells worth improving, write it down for grey-core but do NOT fix it in ElizaOS Grey during Step 0.

**The 6 offerings to add** (priced ascending):

| Offering | Price | Concentration | What's needed |
|---|---|---|---|
| `claim_evaluation` | $0.10 | Verification | Atomic — given a single claim, run only the L3 evaluation against it. Strip surrounding pipeline. |
| `claim_history` | $0.10 | Research | Read from `wpv_claims` / `wpv_verifications` filtered by project. Pure DB query, no pipeline run. |
| `quick_protocol_facts` | $0.30 | Research | Cache lookup + brief summary formatted for conversational output. Chat-sized response. |
| `claim_extraction` | $0.50 | Research | Early-exit the pipeline after L2 (claim extraction), skip L3 evaluation. Return extracted claims with structure. |
| `audit_posture_check` | $0.75 | Verification | Extract audit-related section from existing L3 analysis (audit history, auditor reputation, freshness). |
| `tokenomics_audit` | $1.75 | Verification | Extract tokenomic section from existing L3 analysis (unlock schedules, emission curves, supply concentration). |

These bring Virtuals to **10 offerings** with full V/R/I coverage (6 Verification + 3 Research + 1 Intelligence).

**Held back for grey-core (not in Step 0):**
- `comparative_analysis` — new synthesis prompt + multi-project handler
- `mass_screen` — batch queuing + rate-limit handling
- `technical_briefing` (per-protocol delta) — cache-comparison infrastructure
- `prediction_market_research`, `resolution_evidence_compiler`, `allocation_risk_report`, `compliance_research_input` — genuinely new pipeline capabilities

**Tasks:**

1. **Pre-expansion baseline tag.** Before any changes:
   ```bash
   cd C:\Users\kidco\dev\eliza\plugin-wpv
   git status   # must be clean
   git tag pre-expansion-baseline
   git push --tags
   ```
   Capture the deployment artifact hash (per the deployment checklist's baseline-capture commands) to a file labeled `pre-expansion-baseline.sha256`.

2. **Implement the 6 handlers.** Each handler follows the existing ElizaOS plugin pattern for ACP service registration. Specifically:
   - Add the handler function in `plugin-wpv` following existing patterns
   - Register the offering in the ACP service registry (same mechanism used for the existing 4)
   - Wire response shaping to return structured JSON consistent with the existing offering envelope
   - For each handler: write a unit test that exercises the new path with a known-good input

3. **Pipeline integration notes:**
   - `claim_evaluation` — accept a claim string + optional context, run only the existing L3 evaluator against it, return the verdict.
   - `claim_history` — read-only Supabase query against `wpv_claims` and `wpv_verifications`. Filter by project identifier. Order by date.
   - `quick_protocol_facts` — cache hit returns concise summary; cache miss runs `legitimacy_scan` and returns the headline output.
   - `claim_extraction` — early-exit the existing pipeline at the L2 → L3 boundary. Existing L2 produces claims; just return them without invoking L3.
   - `audit_posture_check` — invoke existing pipeline, then post-process the result to extract just the audit-related fields (auditor names, audit dates, scope, findings).
   - `tokenomics_audit` — same pattern, post-process to extract tokenomic-related fields (supply schedule, unlocks, emission curve, distribution).

4. **Smoke test each new offering against a known whitepaper** (e.g., the Uniswap V3 entry already in cache). Confirm:
   - Each handler returns the expected shape
   - The existing 4 offerings still work identically (run them through with the same inputs and diff against pre-expansion outputs)
   - No regression in response time on the existing 4

5. **Register the new offerings on the live ACP.** Forces handles the ACP-side registration (pricing, service definition, SLA) per the existing process used for the original 4.

6. **Post-expansion baseline tag.** After all 6 are live and smoke-tested:
   ```bash
   cd C:\Users\kidco\dev\eliza\plugin-wpv
   git tag phase2-baseline
   git push --tags
   ```
   Capture the new deployment artifact hash to `phase2-baseline.sha256`. **This is the hash that Phase 2 verification gates compare against.**

7. **Update the Virtuals outreach requirement-text template** to list all 10 offerings, not just 4. (Done in the main plan v7; reference it.)

**Acceptance criteria:**
- All 6 new handlers exist, are unit-tested, and route to the correct existing pipeline operations
- All 6 are registered on the live ACP with their respective prices
- Smoke tests pass for all 10 offerings (4 existing + 6 new)
- Existing 4 offerings produce byte-identical outputs to pre-expansion versions on identical inputs (or, where output formatting changed deliberately, the diff is documented)
- `pre-expansion-baseline` and `phase2-baseline` tags both exist on the ElizaOS Grey repo
- `pre-expansion-baseline.sha256` and `phase2-baseline.sha256` artifact hashes both captured and stored outside the VPS
- Forces signs off on the full 10-offering set being live before outreach Round 1 begins

**Do not:**
- Make changes beyond the 6 offerings listed
- Refactor pipeline code that's worked fine for the existing 4 offerings
- Update dependencies opportunistically
- Touch the Supabase schemas beyond the addition of any necessary indexes
- Begin Phase 2 Step 1 work until `phase2-baseline` tag is created

**Hard stop after this step.** Once `phase2-baseline` is tagged, ElizaOS Grey is locked for the rest of Phase 2. The lock-down rules (per Hard Constraint #1 above) apply from this point forward.

---

## Phase 2 Step 1: Set up the New Grey repository

**Goal:** A clean monorepo for New Grey, separate from ElizaOS Grey.

**Tasks:**

1. Create new git repository (default name: `new-grey`). Push to GitHub under the Mayakovsky account.

2. Choose monorepo tooling. Suggested defaults: pnpm workspaces + turborepo.

3. Directory structure:
```
new-grey/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── README.md
├── packages/
│   ├── grey-pipeline/        (Step 2)
│   ├── grey-schemas/         (Step 3)
│   ├── grey-core/            (Step 4)
│   └── grey-sweeper/         (Step 6 — wallet sweeping)
├── adapters/
│   └── x402-middleware/      (Step 7)
└── infra/
    ├── systemd/
    │   ├── grey-core.service.example
    │   └── grey-sweeper.service.example
    ├── supabase/
    │   └── migrations/
    │       └── 001_create_grey_two_schema.sql
    └── deploy/
        └── deploy.md
```

4. Configure CI/CD via GitHub Actions. Lint, typecheck, test on PR. Build on main. No auto-deploy to VPS.

5. `.env.example` placeholders:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SUPABASE_GREY_TWO_SCHEMA=grey_two`
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY`
   - `GREY_DID` (shared ERC-8004 DID — minted in Step 5)
   - **Tier A (hot, on VPS):**
     - `BASE_X402_PAY_TO` (Tier A hot wallet address on Base — the address x402 buyers settle to)
     - `BASE_X402_PRIVATE_KEY` (Tier A private key — **used only by grey-sweeper**, NOT by the x402 adapter. The adapter is a receiver and never signs.)
   - **Tier B (sweep destination, address only):**
     - `BASE_POOL_WALLET` (Tier B pool address — sweeper destination; no private key on VPS)
   - **Tier D (central treasury addresses, address only — keys held by Forces offline):**
     - `GREY_TREASURY_RECEIVE` (Tier D inbound on Base)
     - `GREY_TREASURY_OPERATING` (Tier D operating, 70% destination)
     - `GREY_TREASURY_TAX_RESERVE` (Tier D tax reserve, 30% destination)
   - **Network / facilitator:**
     - `BASE_RPC_URL`
     - `BASE_SWEEP_THRESHOLD_USDC=200`
     - `BASE_SWEEP_GAS_RESERVE_USDC=20`
     - `X402_NETWORK=eip155:84532` (Base Sepolia testnet; switch to `eip155:8453` for mainnet promotion in Step 8)
     - `X402_FACILITATOR_URL=https://x402.org/facilitator` (testnet; CDP Facilitator imports automatically on mainnet)
     - `X402_MAX_TIMEOUT_SECONDS=120`
     - `CDP_API_KEY_ID`
     - `CDP_API_KEY_SECRET`
   - **Service:**
     - `NEW_GREY_PORT=3001`
     - `LOG_LEVEL`
   - `ALERT_WEBHOOK_URL` — Discord webhook URL for sweep events, errors, anomalies. Required for Phase 2 (per wallet doc v3). Forces creates the channel + webhook and provides the URL.

6. Strict-mode TypeScript base config.

**Acceptance criteria:**
- Clean install succeeds
- Typecheck passes
- Repo pushes to GitHub
- `.env.example` committed, `.env` gitignored
- README explains structure and points to companion docs

---

## Phase 2 Step 2: Extract pipeline into `grey-pipeline` package

**Goal:** A standalone TypeScript library containing Grey's verification pipeline. The ElizaOS Grey repo is not modified.

**Tasks:**

1. Read the ElizaOS Grey codebase to identify pipeline components:
   - `DocsSiteCrawler`
   - `ClaimExtractor`
   - `ClaimEvaluator`
   - `generateSynthesis`
   - Crypto-native classification system
   - Supabase + ORM persistence layer
   - Anthropic + Voyage embedding clients
   - Cost telemetry middleware (R4)

2. Re-implement each module in `packages/grey-pipeline/src/` as plain TypeScript. Strip ElizaOS-specific glue. The pipeline logic itself is unchanged.

3. Suggested module layout:
```
src/
├── index.ts
├── crawler/
├── extraction/
├── evaluation/
├── synthesis/
├── classification/
├── persistence/
│   ├── supabase-client.ts
│   ├── schema.ts            (Drizzle or equivalent, targeting grey_two)
│   └── repositories.ts
├── embeddings/
├── telemetry/
└── types.ts
```

4. **Database schema setup:**
   - Migration in `infra/supabase/migrations/001_create_grey_two_schema.sql`
   - Tables: `grey_two.whitepapers`, `grey_two.verifications`, `grey_two.claims`, `grey_two.embeddings`, `grey_two.cost_events`, `grey_two.requests`, `grey_two.sweep_log`
   - Mirror structures from `wpv_*` tables where appropriate; freshen anything awkward
   - Index `created_at` and `request_id` for traceability
   - Run the migration once on Supabase. Document what was run.

5. Smoke test: instantiate `ClaimExtractor`, run a known whitepaper URL through it, confirm structured output.

**Acceptance criteria:**
- `grey-pipeline` builds cleanly
- Smoke test passes
- `grey_two` schema exists in Supabase
- No imports of `@elizaos/*` or references to ElizaOS Grey's repo
- Pipeline stages run as pure function calls

---

## Phase 2 Step 3: Lock the v1 response schema in `grey-schemas`

**Goal:** Versioned JSON Schemas for all 17 offerings. TypeScript types and OpenAPI generated.

**Tasks:**

1. Create `packages/grey-schemas/`:
```
src/
├── index.ts
├── v1/
│   ├── shared/
│   │   ├── claim.schema.json
│   │   ├── evaluation.schema.json
│   │   ├── risk-flag.schema.json
│   │   └── metadata.schema.json
│   ├── responses/
│   │   ├── legitimacy-scan.schema.json
│   │   ├── whitepaper-verification.schema.json
│   │   ├── technical-verification.schema.json
│   │   ├── technical-briefing.schema.json
│   │   ├── claim-evaluation.schema.json
│   │   ├── claim-extraction.schema.json
│   │   ├── tokenomics-audit.schema.json
│   │   ├── audit-posture-check.schema.json
│   │   ├── comparative-analysis.schema.json
│   │   ├── mass-screen.schema.json
│   │   ├── claim-history.schema.json
│   │   ├── prediction-market-research.schema.json
│   │   ├── resolution-evidence-compiler.schema.json
│   │   ├── allocation-risk-report.schema.json
│   │   ├── quick-protocol-facts.schema.json
│   │   ├── daily-tech-brief.schema.json
│   │   └── compliance-research-input.schema.json
│   └── requests/
└── generated/
    ├── types.ts
    └── openapi.yaml
```

Note: `compliance-research-input` replaces the earlier `compliance-report` framing per Forces — positioned as research input rather than certification.

2. Common response envelope:
```json
{
  "schemaVersion": "v1",
  "offering": "string (offering name)",
  "requestId": "string",
  "agent": {
    "did": "did:erc8004:...",
    "name": "Whitepaper Grey",
    "runtime": "grey-core"
  },
  "subject": { ... },
  "payload": { ... },
  "metadata": {
    "costUsd": "number",
    "model": "string",
    "latencyMs": "number",
    "timestamp": "ISO8601"
  }
}
```

3. JSON Schema draft 2020-12. TypeScript types via `json-schema-to-typescript`. OpenAPI 3.1 generated.

4. Validation tests with ajv or equivalent.

**Acceptance criteria:**
- `grey-schemas` builds cleanly
- Generation script produces `types.ts` and `openapi.yaml`
- Schema validation tests pass
- OpenAPI spec validates
- Other packages can `import { LegitimacyScanResponse } from '@grey/schemas'`

---

## Phase 2 Step 4: Build `grey-core` HTTP service

**Goal:** Standalone Express service exposing all 17 offerings as HTTP routes.

**Tasks:**

1. Create `packages/grey-core/`:
```
src/
├── index.ts
├── server.ts
├── routes/
│   ├── legitimacy-scan.ts
│   ├── whitepaper-verification.ts
│   ├── technical-verification.ts
│   ├── technical-briefing.ts
│   ├── claim-evaluation.ts
│   ├── claim-extraction.ts
│   ├── tokenomics-audit.ts
│   ├── audit-posture-check.ts
│   ├── comparative-analysis.ts
│   ├── mass-screen.ts
│   ├── claim-history.ts
│   ├── prediction-market-research.ts
│   ├── resolution-evidence-compiler.ts
│   ├── allocation-risk-report.ts
│   ├── quick-protocol-facts.ts
│   ├── daily-tech-brief.ts
│   ├── compliance-research-input.ts
│   ├── health.ts
│   ├── identity.ts
│   └── openapi.ts
├── middleware/
│   ├── request-id.ts
│   ├── logging.ts
│   ├── error-handler.ts
│   └── rate-limit.ts
├── identity/
│   └── erc8004-resolver.ts
└── config.ts
```

2. Server plumbing: Express 4.x suggested, JSON body parser (1MB limit), CORS permissive, request ID middleware, pino logging, graceful SIGTERM, rate limiting per IP, zod env parsing (fail fast).

3. Each route validates against `grey-schemas`, calls `grey-pipeline`, wraps result in envelope, captures cost metadata.

4. Public endpoints (no payment):
   - `GET /v1/health`
   - `GET /v1/identity`
   - `GET /v1/openapi.json`

**Acceptance criteria:**
- Starts on configured port
- All 17 offering routes respond to test inputs
- Health, identity, openapi endpoints respond
- Logs include request IDs traceable through pipeline
- Cost metadata in every response's `metadata` field
- Handles SIGTERM gracefully
- Per-route smoke tests pass

---

## Phase 2 Step 5: Mint Grey's ERC-8004 identity

**Goal:** One ERC-8004 DID for Grey on Celo (default), separate from earnings infrastructure.

**Tasks:**

1. Generate the `GREY_DID_OWNER` wallet offline (clean machine, not VPS). Private key stored in Forces's encrypted offline location. This wallet only signs DID updates — never holds earnings.

2. Fund the wallet with a small amount of CELO for gas (~$5 worth). **Forces acquires CELO ahead of this step** — available on most major exchanges (Coinbase, Binance, Kraken) and bridgeable via Squid or Portal. Transfer to the freshly-generated `GREY_DID_OWNER` address.

3. Mint the DID via the reference ERC-8004 deployment on Celo.

4. DID document includes service endpoints for ElizaOS Grey (existing ACP registration) and New Grey (`/v1/identity`).

5. Implement `erc8004-resolver.ts` in grey-core. Reads `GREY_DID` from env, queries Celo, caches with TTL.

6. Document the DID and recovery process for Forces.

**Acceptance criteria:**
- DID minted on Celo
- `/v1/identity` returns the DID document
- DID references both runtime instances
- Recovery process documented
- `GREY_DID_OWNER` key is in Forces's offline storage only — never on VPS, never in any repo

---

## Phase 2 Step 6: Set up wallet infrastructure (Base chain)

**Goal:** Generate Grey's earnings wallets for Base (Tier A + B + D, no Tier C per wallet doc v3), implement the same-chain sweeper, log to Supabase. Per the **Grey Wallet Infrastructure** companion doc.

**Tasks:**

1. **Generate wallets offline** on a clean machine (not VPS). Five **earnings** wallets total for Base (the `GREY_DID_OWNER` identity wallet was generated separately in Step 5 and is not part of the earnings hierarchy):
   - `BASE_X402_PAY_TO` (Tier A hot, Base) — keypair generated
   - `BASE_POOL_WALLET` (Tier B pool, Base) — keypair generated
   - `GREY_TREASURY_RECEIVE` (Tier D inbound on Base) — keypair generated
   - `GREY_TREASURY_OPERATING` (Tier D operating, 70%) — keypair generated
   - `GREY_TREASURY_TAX_RESERVE` (Tier D tax reserve, 30%) — keypair generated

   **No Tier C on Base.** Per wallet doc v3, Tier C is conditional per chain and Base has no native-asset reason for intermediate cold storage. The Tier D operating wallet IS the working capital.

2. **Key storage (per wallet doc v3 storage matrix):**
   - Tier A private key → VPS `.env` for grey-sweeper, perms 600
   - Tier B private key → Forces's encrypted offline location — never touches VPS
   - All three Tier D private keys → Forces-held offline (encrypted storage). Hardware wallet upgrade later, not a Phase 2 blocker.

3. **Fund the wallets:**
   - `BASE_X402_PAY_TO`: ~$10 worth of Base ETH for gas
   - `BASE_POOL_WALLET`: 0 (receives via sweeps; doesn't send from VPS)
   - Tier D wallets: 0 (receive via manual bridges from Tier B, manual splits from RECEIVE → OPERATING + TAX_RESERVE)

4. **Build the sweeper module** in `packages/grey-sweeper/`:
   - TypeScript, uses ethers.js or viem (Kovsky's call)
   - Reads `BASE_X402_PAY_TO` balance daily (or threshold-triggered)
   - When balance > `BASE_SWEEP_THRESHOLD_USDC` (default $200), sweeps all but gas reserve to `BASE_POOL_WALLET`
   - **Destination address `BASE_POOL_WALLET` is hard-coded in the sweeper source as an allowlist constant.** Env var `BASE_POOL_WALLET` may exist as a reference, but the code refuses to send to any address not matching the hard-coded constant. This is the critical security control: env-var tampering alone cannot redirect sweeps.
   - Signs with Tier A private key from `BASE_X402_PRIVATE_KEY` (this key is on VPS; it's the only Grey key on VPS besides ElizaOS's ACP infrastructure)
   - Logs every sweep to `grey_two.sweep_log` Supabase table with: timestamp, from address, to address, amount, tx hash, success/failure status

5. **Deploy sweeper as its own systemd unit** (`grey-sweeper.service`), separate from grey-core. Intentional separation: the sweeper has Tier A signing capability and should fail independently of the main service.

6. **Monitoring (Phase 2):**
   - Sweep events logged to `grey_two.sweep_log` (per task 4)
   - Sweep events posted to Discord via `ALERT_WEBHOOK_URL` in human-readable form (info-level for successes, warning for failures, CRITICAL for any outbound to non-allowlisted address)
   - Errors written to grey-sweeper systemd journal
   - Tier A balance checkable via BaseScan
   - Tier B/D balances checkable by Forces with offline-key access
   - Test the webhook with a deliberate test event on first deploy: Forces confirms the message arrives in the Discord channel before going live

7. **Document wallet inventory:**
   - Update Forces's secure wallet log with all 5 addresses + chain + tier + role + generation date
   - Sweep destinations recorded
   - Recovery procedures noted per wallet doc v3 "What happens if a key is compromised"

**Acceptance criteria:**
- All 5 wallets exist with documented addresses
- Tier A private key in VPS `.env`, perms 600, no other location on VPS
- Tier B private key in Forces's offline storage, NOT on VPS (verifiable: grep VPS filesystem for the Tier B address; should appear only as a hard-coded constant in sweeper source, never as a private key)
- Three Tier D private keys in Forces's offline storage, NOT on VPS
- `grey-sweeper.service` runs on VPS as own systemd unit, dedicated user
- Sweep allowlist hard-coded in source (verified by code review)
- Sweeper logs to `grey_two.sweep_log` table
- Sweeper posts to Discord webhook with a successful test event before going live
- No Tier C `GREY_COLD_BASE` wallet generated (intentional per wallet doc v3)

**Do not:**
- Generate any wallet on the VPS itself
- Store Tier B or Tier D keys on the VPS under any circumstances
- Generate a Tier C wallet on Base (intentional skip per wallet doc v3)
- Skip the sweep allowlist hard-coding (env-var-only is insufficient)
- Go live without confirming Discord webhook delivery with a test event

---

## Phase 2 Step 7: Build x402 middleware adapter

**Goal:** Wire grey-core's offerings as x402-paid endpoints. Per the **x402 Middleware Adapter Skeleton** companion doc.

**Tasks:**

1. Follow the adapter skeleton companion document for implementation.

2. The adapter requires the `BASE_X402_PAY_TO` env var (the Tier A wallet address from Step 6). The adapter does **not** require the Tier A private key — it's a receiver, not a signer. Only grey-sweeper signs.

3. Per-offering pricing per the main plan's x402 Bazaar pricing table.

4. Compliance offering routes as `compliance-research-input` (not `compliance-report`).

5. CDP API keys from `portal.cdp.coinbase.com`.

6. Wire adapter into grey-core's server.

**Acceptance criteria:**
- Adapter builds cleanly
- All 17 offerings exposed as x402-paid endpoints
- Routes return correct 402 + payment terms on requests without payment
- Test buyer can pay and call each route on Base Sepolia

---

## Phase 2 Step 8: Deploy grey-core + sweeper to VPS

**Goal:** Two new systemd units running on the VPS alongside ElizaOS Grey.

**Tasks:**

1. **Pre-deploy checks:**
   - systemd unit files for `grey-core.service` and `grey-sweeper.service` reviewed by Forces
   - Units specify dedicated user (not shared with ElizaOS Grey), dedicated working directory, dedicated log directories
   - No `Requires=` or `Wants=` relationships with ElizaOS Grey's systemd unit
   - Port 3001 (or chosen) confirmed free via `ss -tlnp`

2. **Deploy:**
   - grey-core to `/srv/grey-core/` (or chosen path), with `.env` perms 600, owner `grey-core` user
   - grey-sweeper to `/srv/grey-sweeper/`, same pattern
   - `systemctl enable grey-core grey-sweeper && systemctl start grey-core grey-sweeper`

3. **Post-deploy verification:**
   - `systemctl status grey-core` and `systemctl status grey-sweeper` healthy
   - ElizaOS Grey systemd unit unchanged (no restart, no errors)
   - VPS resource use within bounds
   - grey-core's `/v1/health` returns 200
   - grey-sweeper sent its "started" alert

4. **First smoke test payment on Base Sepolia:**
   - Manual x402 buyer client makes a paid request
   - USDC arrives at `BASE_X402_PAY_TO`
   - grey-core logs show full trace
   - grey-sweeper logs the balance change (no sweep yet — below threshold)

5. **Promote to Base mainnet:**
   - Switch `X402_NETWORK=eip155:8453`
   - CDP Facilitator activates with production keys
   - First mainnet smoke test
   - Verify USDC arrives at mainnet `BASE_X402_PAY_TO`

6. **Verify Bazaar indexing for at least the core offerings** after first mainnet settlement.

**Acceptance criteria:**
- Both services running as own systemd units on VPS
- ElizaOS Grey unchanged
- First mainnet x402 payment received
- First sweep cycle executes correctly (when threshold met)
- At least one core offering appears in x402 Bazaar discovery

---

## Phase 2 Step 9: Independent parity check

**Goal:** Spot-check that New Grey produces correct outputs.

**Tasks:**

1. Assemble ~10 representative whitepapers.

2. Run each through ElizaOS Grey (sandbox or production capture) and New Grey via grey-core. Save outputs.

3. Compare for substantive equivalence: same claims, same verdicts on equivalent claims, similar confidence scores (10–15% tolerance), same risk flags, synthesis covering same topics.

4. Document in `infra/phase2-parity-report.md`.

5. Resolve concerning differences in `grey-pipeline` (never ElizaOS Grey).

**Acceptance criteria:**
- Parity report covers all test whitepapers
- Concerning differences resolved or explicitly accepted
- ElizaOS Grey unchanged

---

## Phase 2 close: verification checklist

Before declaring Phase 2 complete and moving to Tier 2 expansion:

- [ ] ElizaOS Grey on VPS unchanged from Phase 2 start
- [ ] `grey-core` and `grey-sweeper` running as own systemd units on VPS
- [ ] grey-core served at least 50 real (paid) requests on x402 Bazaar across multiple offerings
- [ ] grey-sweeper executed at least one successful sweep cycle from `BASE_X402_PAY_TO` to `BASE_POOL_WALLET`
- [ ] Cost telemetry shows positive margin on every offering called
- [ ] At least one core offering discoverable via x402 Bazaar
- [ ] Parity report complete, concerning differences addressed
- [ ] No writes from New Grey have landed in `wpv_*` tables
- [ ] Logs landing in respective directories with healthy rotation
- [ ] Hot wallet accumulated USDC; sweep moved it to Tier B; Tier B balance verified by Forces
- [ ] Wallet inventory documented in Forces's secure location
- [ ] Forces signed off

When all are checked, Phase 2 closes. Tier 2 begins. Phase 3 planning may also start — see main plan for gating.

---

## When to stop and ask Forces

The following require explicit Forces approval:

- Any task seems to require modifying ElizaOS Grey
- Any task seems to require writing to `wpv_*` tables
- Wallet generation that wasn't planned (e.g., a chain not yet documented)
- Sweep destination changes (allowlist edits)
- Smoke test reveals New Grey produces substantially different outputs from ElizaOS Grey
- Pricing or architecture decision not covered here or in the main plan
- Phase 2 close verification fails any item
- Tooling swap would meaningfully change the project's shape
- **Step 0 specifically:** if any of the 6 new handlers can't be implemented as a pure pipeline reshaping (i.e., requires new pipeline logic, schema changes, or refactoring beyond the handler surface), stop and check with Forces before proceeding. The Step 0 scope is bounded; expanding it defeats the purpose.
- **Step 0 specifically:** if smoke tests of the existing 4 offerings show any drift in output after Step 0 changes, stop. Do not tag `phase2-baseline` until the drift is understood and either documented as intentional or fixed.

When in doubt, ask. The cost of clarification is small.

---

*Document version: v3, May 11, 2026. Companion to deployment plan v7.*
