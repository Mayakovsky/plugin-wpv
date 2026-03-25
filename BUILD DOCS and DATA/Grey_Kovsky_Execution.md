# Whitepaper Grey — Kovsky Technical Execution

**Date:** 2026-03-24 (rewritten — agent registered, plugin-acp needed for ACP marketplace connection)
**Owner:** Kovsky (autonomous execution)
**Status:** Agent registered on Virtuals. 66 Test CERTIFIED. VPS running. Database seeded. ACP credentials available. BLOCKED: Grey cannot receive or fulfill jobs — the ACP SDK connection does not exist yet. Build `plugin-acp` to bridge ElizaOS ↔ ACP marketplace, then sandbox graduation.

---

# What's Done

| Task | Status | Date | Details |
|------|--------|------|---------|
| plugin-wpv built and tested | ✅ 304/304 | 2026-03-23 | 23 test files |
| plugin-autognostic built and tested | ✅ 746/746 | 2026-03-14 | |
| wpv-agent built, tested, E2E verified | ✅ 12/12 | 2026-03-17 | |
| Supabase Pro deployed | ✅ COMPLETE | 2026-03-14 | 3 tables + indexes |
| VPS setup + Grey running 24/7 | ✅ COMPLETE | 2026-03-18 | PM2, reboot recovery tested |
| Seed ingestion (3 waves) | ✅ COMPLETE | 2026-03-21 | Base+ETH+Solana+Virtuals+PAXG |
| 66 Test | ✅ CERTIFIED | 2026-03-23 | 267/267 pass, 100% readiness |
| ACP v2 schemas hardened | ✅ COMPLETE | 2026-03-24 | NOT_IN_DATABASE, flat shape, cache-only tiers |
| Virtuals registration | ✅ COMPLETE | 2026-03-24 | Role: Provider, 5 offerings registered |
| Pre-graduation tweets | ✅ COMPLETE | 2026-03-23 | 5 tweets posted/scheduled |

---

# VPS Credentials (LIVE)

| Item | Value |
|------|-------|
| **Public IPv4** | `44.243.254.19` |
| **SSH Key** | `C:\Users\kidco\.ssh\WhitepaperGrey.pem` |
| **SSH Command** | `ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19` |
| **Base RPC (Alchemy)** | `https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq` |

---

# ACP v2 Evaluation Context

1. Evaluation is optional — buyers can skip for data retrieval.
2. Buyer is often the evaluator if no dedicated evaluator assigned.
3. Grey defines the contract via Deliverable Requirements schemas (coded in AgentCardConfig.ts).
4. Evaluators list present/missing elements. All declared fields must always be present.
5. Trust Score: target 100% approval on first 50 deliveries.
6. Grey's role is **Provider**.
7. Cache-only tiers ($0.25, $1.50) return `verdict: NOT_IN_DATABASE` with zeroed fields if project not cached. Same flat shape always. Live tiers ($2.00, $3.00) run pipeline if not cached.
8. `token_address` required on all offerings. `project_name` optional on all.
9. `focusAreaScores` keys are lowercase: `tokenomics`, `performance`, `consensus`, `scientific`.

---

# Remaining Tasks — Build plugin-acp, Then Graduate

## Phase 2A: Build plugin-acp (NEW — ElizaOS ↔ ACP Bridge)

**Why:** The current `AcpWrapper.ts` in plugin-wpv is entirely stubbed. Grey is registered on Virtuals but cannot receive or fulfill any ACP jobs. The `@virtuals-protocol/acp-node` SDK needs to be wired into the ElizaOS runtime.

**Strategy:** Build this as a standalone, generic ElizaOS plugin — `plugin-acp` — that any ElizaOS agent can use to connect to Virtuals ACP. Not WPV-specific. Releasable to the ElizaOS plugin repository. First-mover advantage — no ElizaOS ↔ ACP plugin exists today.

### 2A.1 Create plugin-acp repo

```
C:\Users\kidco\dev\eliza\plugin-acp\
├── src/
│   ├── index.ts                 # Plugin registration
│   ├── AcpService.ts            # Core: wraps AcpClient, lifecycle, handler registry
│   ├── types.ts                 # ACP-specific types for ElizaOS integration
│   ├── constants.ts             # Config defaults
│   ├── actions/
│   │   ├── acpBrowseAction.ts   # ACP_BROWSE — search marketplace agents
│   │   ├── acpJobsAction.ts     # ACP_JOBS — list active/completed jobs
│   │   └── acpWalletAction.ts   # ACP_WALLET — check agent wallet balance
│   └── utils/
│       └── logger.ts
├── tests/
│   ├── AcpService.test.ts
│   ├── actions.test.ts
│   └── setup.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CLAUDE.md
└── heartbeat.md
```

### 2A.2 Install SDK

```bash
bun add @virtuals-protocol/acp-node
```

### 2A.3 Build AcpService

The core of the plugin. Extends Eliza `Service`.

```typescript
import AcpClient, { AcpContractClientV2 } from "@virtuals-protocol/acp-node";

class AcpService extends Service {
  private acpClient: AcpClient;
  private offeringHandlers: Map<string, (job) => Promise<unknown>>;
  private resourceHandlers: Map<string, () => Promise<unknown>>;

  async start(runtime) {
    const contractClient = await AcpContractClientV2.build(
      runtime.getSetting('ACP_WALLET_PRIVATE_KEY'),
      runtime.getSetting('ACP_SESSION_ENTITY_KEY_ID'),
      runtime.getSetting('ACP_AGENT_WALLET_ADDRESS'),
      runtime.getSetting('BASE_RPC_URL'),  // our Alchemy RPC
    );

    this.acpClient = new AcpClient({
      acpContractClient: contractClient,
      onNewTask: async (job) => this.handleNewTask(job),
    });

    await this.acpClient.init();
  }

  // Other plugins register handlers for their offering IDs
  registerOfferingHandler(offeringId: string, handler: (job) => Promise<unknown>) {
    this.offeringHandlers.set(offeringId, handler);
  }

  registerResourceHandler(resourceId: string, handler: () => Promise<unknown>) {
    this.resourceHandlers.set(resourceId, handler);
  }

  private async handleNewTask(job) {
    const handler = this.offeringHandlers.get(job.offeringId);
    if (!handler) {
      await job.reject("Offering not supported");
      return;
    }
    try {
      await job.accept("Processing your request");
      const result = await handler(job);
      await job.deliver(JSON.stringify(result));
    } catch (err) {
      await job.deliver(JSON.stringify({ error: err.message, verdict: "INSUFFICIENT_DATA" }));
    }
  }

  // Expose for actions
  getClient(): AcpClient { return this.acpClient; }
}
```

### 2A.4 Build actions

- **ACP_BROWSE** — search for agents: `acpClient.browseAgents(keyword, options)`
- **ACP_JOBS** — list jobs: `acpClient.getActiveJobs()`, `acpClient.getCompletedJobs()`
- **ACP_WALLET** — check balance (from SDK wallet utilities)

### 2A.5 Tests

Mock `@virtuals-protocol/acp-node`. Test:
- AcpService lifecycle (init, teardown)
- Handler registration and dispatch
- Job accept/deliver flow
- Unregistered offering → reject
- Handler error → structured error response
- Actions (browse, jobs, wallet)

### 2A.6 Wire plugin-wpv to use plugin-acp

In `WpvService.start()`:
```typescript
const acpService = runtime.getService('acp');
acpService.registerOfferingHandler('project_legitimacy_scan', (job) => this.jobRouter.route(job));
acpService.registerOfferingHandler('tokenomics_sustainability_audit', (job) => this.jobRouter.route(job));
acpService.registerOfferingHandler('verify_project_whitepaper', (job) => this.jobRouter.route(job));
acpService.registerOfferingHandler('full_technical_verification', (job) => this.jobRouter.route(job));
acpService.registerOfferingHandler('daily_technical_briefing', (job) => this.jobRouter.route(job));
```

Remove the stubbed AcpWrapper from plugin-wpv. Add `plugin-acp` as a peer dependency.

### 2A.7 Update wpv-agent plugin load order

```
sql → ollama → anthropic → knowledge → autognostic → acp → wpv → bootstrap
```

`acp` must load before `wpv` so WpvService can find AcpService at registration time.

Commit: `feat: plugin-acp — ElizaOS bridge to Virtuals ACP marketplace`

---

## Phase 2B: ACP Credentials + Rebuild

### 2B.1 Update .env (local + VPS)

Forces has the credentials from registration. Add:
```bash
ACP_WALLET_PRIVATE_KEY=0x...
ACP_SESSION_ENTITY_KEY_ID=...
ACP_AGENT_WALLET_ADDRESS=0x...
```

### 2B.2 Rebuild + Retest

```bash
bun run build && bun run test  # plugin-acp
bun run build && bun run test  # plugin-wpv (now depends on plugin-acp)
bun run build && bun run test  # wpv-agent
```

Verify: all 8/8 smoke tests pass (including ACP).

### 2B.3 Re-run 66 Test

Verify response shapes still match schemas after the focusAreaScores lowercase change and Verdict enum update.

---

## Phase 2C: Sandbox Graduation

### 2C.1 Build buyer test agent

`grey-buyer-agent/` — uses `plugin-acp` in buyer mode. Sends 10 test jobs at $0.01 each across Grey's 5 offerings.

### 2C.2 Run 10 sandbox transactions

Buyer sends jobs → Grey accepts via `onNewTask` → JobRouter processes → Grey delivers → escrow releases. All 10 must complete successfully.

### 2C.3 Submit graduation request

Hit "Proceed to Graduation" when threshold reached. Virtuals manual review: 24–48 hours.

### 2C.4 Post-graduation

1. Grey appears in Agent-to-Agent tab
2. Butler starts routing queries
3. Fire all 22 outreach messages
4. Post pinned thread on @WhitepaperGrey
5. Add resources (Greenlight List, Scam Alert Feed) to agent profile once HTTP endpoints are wired
6. Monitor: Trust Score, jobs, payments, COC/V

---

## Phase 3: Post-Graduation

### 3.1 Release plugin-acp to ElizaOS plugin repository
### 3.2 Add HTTP resource endpoints + register on Virtuals profile
### 3.3 Public website (Next.js on Supabase)
### 3.4 Shadow pipeline for local LLM evaluation (at 300 verifications/month)

---

# Operational Notes

## Plugin Load Order (Updated)
```
sql → ollama → anthropic → knowledge → autognostic → acp → wpv → bootstrap
```

## Test Baselines

| Suite | Count | Last Verified |
|-------|-------|---------------|
| plugin-autognostic | 746 | 2026-03-14 |
| plugin-wpv | 304 | 2026-03-23 |
| plugin-acp | TBD | TBD |
| wpv-agent | 12 | 2026-03-17 |
| 66 Test | 267/267 | 2026-03-23 |

## Environment Variables (Complete — Production)
```bash
ANTHROPIC_API_KEY=sk-ant-...
WPV_DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SECRET_KEY=sb_secret_...
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/ymBOZFSx-xXOZp0HpU2Gq
VIRTUALS_FACTORY_CONTRACT=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259
ACP_WALLET_PRIVATE_KEY=0x...    # From Virtuals registration
ACP_SESSION_ENTITY_KEY_ID=...   # From Virtuals registration
ACP_AGENT_WALLET_ADDRESS=0x...  # From Virtuals registration
WPV_MODEL=claude-sonnet-4-20250514
```

## Reference Files

| File | Path |
|------|------|
| Architecture doc | `plugin-wpv/BUILD DOCS and DATA/WPV_Agent_Technical_Architecture_v1.3.md` |
| 66 Test Regimen | `plugin-wpv/BUILD DOCS and DATA/Grey_50_Test_Regimen.md` |
| 66 Test script | `plugin-wpv/scripts/run66Test.ts` |
| Plugin heartbeat | `plugin-wpv/heartbeat.md` |
| Agent heartbeat | `wpv-agent/heartbeat.md` |

---

*End of Kovsky Technical Execution — Whitepaper Grey*
