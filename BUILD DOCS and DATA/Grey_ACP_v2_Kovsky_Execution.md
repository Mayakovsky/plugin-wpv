# Grey ACP v2 — Kovsky Execution Plan

> **Context:** Design is complete (v6 migration plan, 6 revisions, 8 fixes, 22 type verifications). This document is the implementation handoff.
> **What's done:** Step 1 only — `package.json` deps swapped to `acp-node-v2` + `viem`. v2 imports added to top of AcpService.ts but all implementation is still v1.
> **What changed since v6:** "Upgrade now" was clicked. Grey has a NEW Privy-managed wallet. Use `PrivyAlchemyEvmProviderAdapter`, NOT `AlchemyEvmProviderAdapter`.

---

## New Credentials (post-migration)

```
AGENT_WALLET_ADDRESS=0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f   # NEW — replaces 0x48A5...
ACP_PRIVY_WALLET_ID=<Forces will place in .env>                     # NEW
ACP_PRIVY_SIGNER_KEY=<Forces will place in .env>                    # NEW
```

Old vars `ACP_WALLET_PRIVATE_KEY` and `ACP_SESSION_ENTITY_KEY_ID` are no longer used. Leave in `.env` as comments for rollback reference. Do NOT delete them.

---

## Execution Steps (in order)

### 1. Fix imports (top of AcpService.ts)

**Remove these lines (old v1 imports and module-level v1 constants):**
- `let AcpJobPhases: { ... } | null = null;` and the entire type
- Any remaining `import type AcpClientType from '@virtuals-protocol/acp-node'`

**Change this import:**
```typescript
// WRONG (v6 plan, pre-migration):
import { AcpAgent, AlchemyEvmProviderAdapter, AssetToken, SocketTransport, ... } from '@virtuals-protocol/acp-node-v2';

// CORRECT (post-migration, Privy wallet):
import {
  AcpAgent,
  PrivyAlchemyEvmProviderAdapter,
  AssetToken,
  SocketTransport,
  type JobSession,
  type JobRoomEntry,
  type AgentMessage,
} from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
```

**Add module-level constant:**
```typescript
// Set false after confirming v2 evaluator doesn't need envelope
const WRAP_DELIVERABLE_ENVELOPE = true;
```

### 2. Rewrite `connectSdk()`

**Delete the entire current `connectSdk()` method** (lines ~140-190 — dynamic import, AcpContractClientV2.build, AcpClient constructor, flushStaleJobs call).

**Replace with:**
```typescript
private async connectSdk(): Promise<void> {
  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: this.acpConfig.agentWalletAddress as `0x${string}`,
    walletId: process.env.ACP_PRIVY_WALLET_ID!,
    signerPrivateKey: process.env.ACP_PRIVY_SIGNER_KEY!,
    chains: [base],
  });

  this.agent = await AcpAgent.create({
    provider,
    transport: new SocketTransport(),
  });
  this.agent.on('entry', (session: JobSession, entry: JobRoomEntry) => this.handleEntry(session, entry));
  await this.agent.start();
  this.initialized = true;
  logger.info('AcpService: SDK connected (v2, PrivyAlchemy, SocketTransport)');
}
```

**Update `initFromRuntime()` credential check** — replace references to `ACP_WALLET_PRIVATE_KEY` / `ACP_SESSION_ENTITY_KEY_ID` with `ACP_PRIVY_WALLET_ID` / `ACP_PRIVY_SIGNER_KEY`. Keep `AGENT_WALLET_ADDRESS` (same var name, new value). Graceful degradation: if any are missing, HTTP handler runs standalone.

### 3. Replace class properties

```typescript
// REMOVE:
private acpClient: AcpClientType | null = null;
private offeringPriceMap = new Map<number, string>();

// ADD:
private agent: AcpAgent | null = null;
private offeringPrices = new Map<string, number>();
```

### 4. Add `handleEntry` (new — replaces `handleNewTask`)

Paste verbatim from v6 plan Step 3. This is the event-driven dispatch with `job.created`, `job.funded`, `budget.set`, `job.submitted`, terminal states.

### 5. Add `handleJobCreated` (new — replaces `processJobAccept`)

Paste verbatim from v6 plan Step 4. Key patterns:
- `session.fetchJob()` → `job.description` for offering name
- `.filter().find()` for requirement extraction (NOT `.find()` alone — TypeScript compile error)
- `session.setBudget(AssetToken.usdc(price, session.chainId))` to accept
- `session.reject()` fallback if `setBudget` fails

### 6. Add `handleJobFunded` (new — replaces `processJobDeliver`)

Paste verbatim from v6 plan Step 5. Key patterns:
- `session.job ?? await session.fetchJob()` (use cached, don't re-fetch)
- NO validator re-run
- `WRAP_DELIVERABLE_ENVELOPE` toggle on deliverable
- `session.reject()` on handler failure, `session.submit(errorDeliverable)` as last resort

### 7. Delete dead v1 code

Remove entirely:
- `handleNewTask()` method
- `processJobAccept()` method
- `processJobDeliver()` method
- `flushStaleJobs()` method
- `rehydrateAndFlush()` if present
- All `AcpMemoShape` type references
- All `AcpJobPhases` references
- All `PHASE_REQUEST` / `PHASE_NEGOTIATION` / `PHASE_TRANSACTION` constants
- `JOB_PHASE_NAMES` from constants.ts
- `AcpJobShape` interface (if defined locally)
- The `offeringPriceMap` population logic in `registerOfferingHandler`

### 8. Update `registerOfferingHandler`

```typescript
registerOfferingHandler(
  offeringId: string,
  handler: OfferingHandler,
  validator?: InputValidator,
  price?: number,
): void {
  if (!offeringId) {
    logger.warn('Attempted to register handler with empty offeringId — ignored');
    return;
  }
  this.offeringHandlers.set(offeringId, handler);
  if (validator) this.inputValidators.set(offeringId, validator);
  if (price !== undefined) this.offeringPrices.set(offeringId, price);
  logger.info('Offering handler registered', { offeringId, hasValidator: !!validator });
}
```

Remove any `offeringPriceMap.set()` calls.

### 9. Update utility methods

From v6 plan Step 7. Key methods:
- `isConnected()` → reference `this.agent` not `this.acpClient`
- `stop()` → NEW, calls `agent.stop()`
- `browseAgents()` → `agent.browseAgents()`
- `getActiveJobs()` → `api.getActiveJobs()` + per-job `api.getJob()` + `AssetToken.usdcFromRaw()` for budget
- `getCompletedJobs()` → runtime `typeof` check + defensive budget parsing
- `getWalletBalance()` → runtime `typeof` check
- `getWalletAddress()` → `agent.getAddress()`
- `getClient()` → returns `AcpAgent | null`

### 10. Update HTTP handler

```typescript
// jobId type change only:
const input: OfferingJobInput = {
  jobId: jobId ?? 'http-0',  // was: parseInt(jobId, 10)
  offeringId,
  buyerAddress: (args.user_address as string) ?? 'http-request',
  requirement,
};
```

### 11. Update types (`src/types.ts`)

```typescript
export interface OfferingJobInput {
  jobId: string;           // was: number
  offeringId: string;
  buyerAddress: string;
  requirement: Record<string, unknown>;
  isPlainText?: boolean;   // stays optional
  rawContent?: string;
}

export interface AcpJobInfo {
  jobId: string;           // was: number
  phase: string;
  buyerAddress: string;
  providerAddress: string;
  price: number;
  offeringName?: string;
}
```

### 12. Update constants (`src/constants.ts`)

Remove `JOB_PHASE_NAMES`. Keep `ACP_SERVICE_TYPE`, `ACP_HTTP_PORT`.

### 13. Build + type-check

```bash
cd /opt/grey/plugin-acp && bun run build
```

Must compile with zero errors. Do NOT proceed to tests until this passes.

### 14. Rewrite tests (`tests/AcpService.test.ts`)

From v6 plan Step 10. Use `createMockSession()` factory with `job` getter. Use `createSystemEntry()` factory. Same 59 test scenarios, new mocks.

```bash
cd /opt/grey/plugin-acp && bun test
```

Must pass 59/59.

### 15. Deploy

Forces will place new env vars in `.env` before deploy:
```
AGENT_WALLET_ADDRESS=0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f
ACP_PRIVY_WALLET_ID=<value>
ACP_PRIVY_SIGNER_KEY=<value>
```

```bash
# Build locally
cd C:\Users\kidco\dev\eliza\plugin-acp && bun run build

# SCP dist to VPS
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem -r dist/ ubuntu@44.243.254.19:/opt/grey/plugin-acp/dist/

# On VPS
pm2 restart grey
pm2 logs grey --lines 50
```

Verify in logs:
- `AcpService: SDK connected (v2, PrivyAlchemy, SocketTransport)`
- 4 offering handlers registered
- No TypeScript/runtime errors

### 16. Regression tests

Run graduation-style tests via the Virtuals evaluator:
- scan, verify, full_tech, briefing
- empty `{}`, NSFW rejection
- Confirm all pass before requesting re-graduation

---

## Reference

Full design rationale, type verifications, and resolved questions are in:
`BUILD DOCS and DATA/Grey_ACP_v2_Migration_Plan_v6.md`

---

## Key Differences from v6 Plan

| v6 Plan | This Execution Plan |
|---------|-------------------|
| `AlchemyEvmProviderAdapter` | `PrivyAlchemyEvmProviderAdapter` |
| `entityId: 3` + `privateKey` | `walletId` + `signerPrivateKey` |
| `0x48A5F194...` wallet | `0xa9667116...` wallet |
| `ACP_WALLET_PRIVATE_KEY` env var | `ACP_PRIVY_WALLET_ID` + `ACP_PRIVY_SIGNER_KEY` |
| "Hit Upgrade now" as step 1 | Already done |

Everything else — event handling, parsing, delivery, envelope, types, tests — is identical to v6.
