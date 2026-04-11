# ACP v2 SDK Migration Plan — Whitepaper Grey

> **Source:** Forces + Claude Opus analysis of `@virtuals-protocol/acp-node-v2` type definitions
> **Date:** 2026-04-10
> **Scope:** One file rewrite (AcpService.ts) + dependency swap. Pipeline code (plugin-wpv) untouched.
> **Package:** `@virtuals-protocol/acp-node` → `@virtuals-protocol/acp-node-v2`
> **New peer deps:** `viem`, `@account-kit/infra`, `@account-kit/smart-contracts`, `@aa-sdk/core`

> **Review:** Kov review applied. Fixed: redundant validator in handleJobFunded (I1), missing offeringPrices map (I2), error fallback envelope inconsistency (I4), agent.stop() added (R2), offering name fallback documented (R3). session.chainId confirmed valid (I3 — not an issue).
> **Envelope decision:** v2 standard is plain string (confirmed from SDK source + migration guide). Kov recommends keeping `{ type: 'object', value: ... }` for safety. Forces to decide — see rationale below.

---

## Deliverable Envelope Decision

**Background:** In v1, we wrapped deliverables in `{ type: 'object', value: result }`. This was our convention — not SDK-mandated.

**v2 standard:** `session.submit()` takes a plain string. The v2 migration guide example shows `session.submit("https://example.com")`. The SDK posts the raw string to the API and stores a keccak256 hash on-chain.

**Kov's position:** Keep the envelope. Downside of keeping = zero (just extra JSON nesting). Downside of dropping = possible 100% delivery failure if evaluator's LLM prompt references `value.projectName`.

**My position:** Drop the envelope. It's our v1 convention, not protocol standard. The v2 evaluator is LLM-based and parses whatever JSON it receives. The fields (`projectName`, `verdict`, `claimCount`) are the same regardless of nesting depth.

**Current plan:** Envelope dropped. If Forces prefers safety-first, change one line: `session.submit(JSON.stringify({ type: 'object', value: result }))` instead of `session.submit(JSON.stringify(result))`.

---

## Data Access Mapping (verified from v2 SDK source)

The `createJobFromOffering` source confirms the mapping:

```javascript
// v2 SDK internals — createJobFromOffering():
const jobParams = { description: offering.name, ... };      // offering name → job.description
await this.sendMessage(chainId, jobId, JSON.stringify(requirementData), "requirement");  // requirement → AgentMessage
```

| What we read | v1 (current) | v2 (target) |
|---|---|---|
| Offering name | `acpJob.name` | `job.description` via `session.fetchJob()` |
| Requirement data | `acpJob.requirement` (object or string) | First `AgentMessage` with `contentType === "requirement"` in `session.entries`, JSON-parsed |
| Job ID | `acpJob.id` (number) | `session.jobId` (string) |
| Job phase | `acpJob.phase` (number) | `entry.event.type` (string: `"job.created"`, `"job.funded"`, etc.) |
| Buyer address | `acpJob.clientAddress` | `job.clientAddress` via `session.fetchJob()` |
| Price | `acpJob.price` | `offering.priceValue` (from offering config, not job) |
| Memos/expiry | `acpJob.memos` | REMOVED — hooks handle lifecycle |

## Action Mapping

| What we do | v1 (current) | v2 (target) |
|---|---|---|
| Accept + set price | `acpJob.respond(true, 'Accepted')` | `session.setBudget(AssetToken.usdc(price, 8453))` |
| Reject pre-payment | `acpJob.reject('reason')` | `session.reject('reason')` |
| Deliver result | `acpJob.deliver({ type: 'object', value: result })` | `session.submit(JSON.stringify(result))` — envelope dropped, v2 uses plain string |
| Reject post-payment | `acpJob.rejectPayable('reason', 0)` | `session.reject('reason')` (refund is atomic on-chain) |
| Browse agents | `acpClient.browseAgents(keyword, opts)` | `agent.browseAgents(keyword, params)` |
| Get active jobs | `acpClient.getActiveJobs(page, size)` | `agent.getApi().getActiveJobs()` (no pagination in v2 type) |
| Init | `acpClient.init()` | `agent.start()` |
| Shutdown | (none) | `agent.stop()` |

---

## Migration Steps

### Step 1: Update dependencies (package.json)

```json
{
  "dependencies": {
    "@elizaos/core": "1.6.5",
    "@virtuals-protocol/acp-node-v2": "latest",
    "viem": "^2.0.0"
  }
}
```

Remove `@virtuals-protocol/acp-node`. The `@account-kit/*` and `@aa-sdk/core` are transitive deps of the v2 package — check if they need explicit installation or come bundled.

**Kov: Run on VPS after install:**
```bash
cd /opt/grey/plugin-acp && bun add @virtuals-protocol/acp-node-v2 viem && bun remove @virtuals-protocol/acp-node
```

Verify Bun resolves the Alchemy deps. If peer dep warnings appear, add them explicitly.

### Step 2: Rewrite initialization (`connectSdk()`)

**Current:**
```typescript
import type AcpClientType from '@virtuals-protocol/acp-node';

const sdkModule = await import('@virtuals-protocol/acp-node');
const { AcpContractClientV2, default: AcpClient } = sdkModule;
const contractClient = await AcpContractClientV2.build(
  process.env.ACP_WALLET_PRIVATE_KEY,
  process.env.ACP_SESSION_ENTITY_KEY_ID,
  process.env.AGENT_WALLET_ADDRESS,
);
this.acpClient = new AcpClient({
  acpContractClient: contractClient,
  onNewTask: (job, memoToSign) => this.handleNewTask(job, memoToSign),
  onEvaluate: (job) => { /* unused */ },
});
await this.acpClient.init();
```

**V2:**
```typescript
import { AcpAgent, AlchemyEvmProviderAdapter, AssetToken, SocketTransport } from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
import type { JobRoomEntry, AgentMessage } from '@virtuals-protocol/acp-node-v2';

const provider = await AlchemyEvmProviderAdapter.create({
  walletAddress: process.env.AGENT_WALLET_ADDRESS as `0x${string}`,
  privateKey: process.env.ACP_WALLET_PRIVATE_KEY as `0x${string}`,
  entityId: Number(process.env.ACP_SESSION_ENTITY_KEY_ID),  // currently 3
  chains: [base],  // Base mainnet (8453)
});

this.agent = await AcpAgent.create({
  provider,
  transport: new SocketTransport(),  // persistent connection for always-on VPS
});
this.agent.on('entry', (session, entry) => this.handleEntry(session, entry));
await this.agent.start();
```

**Env vars remain the same:** `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, `AGENT_WALLET_ADDRESS`. The `entityId` is `3` (Alchemy smart account index) — `Number(process.env.ACP_SESSION_ENTITY_KEY_ID)` produces the correct value.

**`base` chain import:** From `viem/chains`. Chain ID 8453 (Base Mainnet). Not `baseSepolia` — Grey is on mainnet.

### Step 3: Rewrite event handler (`handleNewTask` → `handleEntry`)

The two-callback model (`onNewTask` + `onEvaluate`) becomes a single `on("entry")` handler. The phase-based dispatch becomes event-type dispatch.

**New handler structure:**

```typescript
private async handleEntry(session: JobSession, entry: JobRoomEntry): Promise<void> {
  // Only process system events (job lifecycle), not agent messages
  if (entry.kind !== 'system') return;

  const eventType = entry.event.type;
  const jobId = session.jobId;

  // Deduplication — same key format, event type replaces phase number
  const dedupKey = `${jobId}:${eventType}`;
  if (this.recentJobs.has(dedupKey)) return;
  this.recentJobs.set(dedupKey, Date.now());

  const log = logger.child({ operation: 'handleEntry', jobId, eventType });
  log.info('Entry received');

  switch (eventType) {
    case 'job.created':
      // Provider receives new job — validate and accept or reject
      await this.handleJobCreated(session, entry, log);
      break;

    case 'job.funded':
      // Client has paid — run pipeline and deliver
      await this.handleJobFunded(session, entry, log);
      break;

    case 'job.completed':
    case 'job.rejected':
    case 'job.expired':
      log.info('Job terminal state', { eventType });
      break;

    default:
      log.info('Ignoring event', { eventType });
  }
}
```

### Step 4: Rewrite accept/reject phase (`processJobAccept` → `handleJobCreated`)

**Key changes:**
- Get offering name from `job.description` (not `acpJob.name`)
- Get requirement from `session.entries` messages (not `acpJob.requirement`)
- Accept via `session.setBudget()` (not `acpJob.respond(true)`)
- Reject via `session.reject()` (not `acpJob.reject()`)

```typescript
private async handleJobCreated(
  session: JobSession,
  entry: JobRoomEntry,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  // Fetch on-chain job data to get offering name (stored in description)
  const job = await session.fetchJob();
  let offeringId = job.description ?? '';

  // Offering name fallback:
  // v2's createJobFromOffering() sets description = offering.name (confirmed from SDK source).
  // If the evaluator creates jobs via createJob() directly, description may differ.
  // v1's price-based fallback is NOT possible in v2 — AcpJob has budget (set by provider's
  // setBudget), not price (set by buyer). If description doesn't match a registered offering,
  // log a warning with available context for debugging.
  if (offeringId && !this.offeringHandlers.has(offeringId)) {
    log.warn('job.description does not match any registered offering', {
      description: offeringId,
      registeredOfferings: [...this.offeringHandlers.keys()],
    });
  }

  // Extract requirement from room messages
  const requirementMsg = session.entries.find(
    (e): e is AgentMessage => e.kind === 'message' && e.contentType === 'requirement'
  );
  const rawRequirement = requirementMsg?.content ?? '';

  log.info('Job created', { offeringId, hasRequirement: !!requirementMsg });

  // Offering name fallback — v1 had price-based inference, keep as safety net
  // (v2 should always have description = offering.name from createJobFromOffering)

  if (!offeringId) {
    log.info('No offering name — accepting as readiness probe');
    try {
      const price = this.offeringPriceMap.values().next().value ?? 0.01;
      await session.setBudget(AssetToken.usdc(price, session.chainId));
    } catch (err) {
      log.warn('Failed to accept readiness probe');
    }
    return;
  }

  const handler = this.offeringHandlers.get(offeringId);
  if (!handler) {
    log.warn('No handler registered for offering — rejecting');
    await session.reject(`Offering '${offeringId}' not supported by this agent`);
    return;
  }

  // Parse requirement — same parseRequirement() logic, different source
  const { requirement, isPlainText } = this.parseRequirement(rawRequirement);
  if (!requirement || (isPlainText && Object.keys(requirement).length === 0)) {
    log.warn('No parseable requirement — rejecting');
    await session.reject('Could not parse service requirement — no token address found');
    return;
  }

  // Run pre-acceptance input validator (same logic as v1)
  const validator = this.inputValidators.get(offeringId);
  if (validator) {
    const input: OfferingJobInput = {
      jobId: session.jobId,
      offeringId,
      buyerAddress: job.clientAddress,
      requirement,
      isPlainText,
      rawContent: isPlainText ? rawRequirement : undefined,
    };
    try {
      await validator(input);
    } catch (err) {
      if (err instanceof InputValidationError || (err instanceof Error && err.name === 'InputValidationError')) {
        log.warn('Input validation failed — rejecting', { error: err.message });
        await session.reject(err.message);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      await session.reject(`Validation error: ${msg}`);
      return;
    }
  }

  // Accept: set budget with offering price
  const offeringPrice = this.offeringPrices.get(offeringId) ?? 0.01;
  try {
    await session.setBudget(AssetToken.usdc(offeringPrice, session.chainId));
    log.info('Job accepted via setBudget', { price: offeringPrice });
  } catch (err) {
    log.error('Failed to setBudget', {}, err);
  }
}
```

### Step 5: Rewrite delivery phase (`processJobDeliver` → `handleJobFunded`)

**Key changes:**
- Same offering/requirement extraction as `handleJobCreated`
- Deliver via `session.submit()` instead of `acpJob.deliver()`
- **Skip validator** — it already ran in `handleJobCreated`. Running it again wastes RPC calls (e.g., `isContractAddress`) and adds latency to delivery.

```typescript
private async handleJobFunded(
  session: JobSession,
  entry: JobRoomEntry,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const job = await session.fetchJob();
  const offeringId = job.description ?? '';

  if (!offeringId) {
    log.info('No offering in funded phase — skipping delivery');
    return;
  }

  const handler = this.offeringHandlers.get(offeringId);
  if (!handler) {
    log.error('No handler registered for offering in funded phase');
    return;
  }

  // Extract requirement from room messages
  const requirementMsg = session.entries.find(
    (e): e is AgentMessage => e.kind === 'message' && e.contentType === 'requirement'
  );
  const rawRequirement = requirementMsg?.content ?? '';
  const { requirement, isPlainText } = this.parseRequirement(rawRequirement);

  // NOTE: Validator is NOT re-run here. It already passed in handleJobCreated.
  // Re-running would waste RPC calls (isContractAddress) and add delivery latency.

  const input: OfferingJobInput = {
    jobId: session.jobId,
    offeringId,
    buyerAddress: job.clientAddress,
    requirement,
    isPlainText,
    rawContent: isPlainText ? rawRequirement : undefined,
  };

  try {
    const result = await handler(input);

    // v2: submit raw JSON — no { type: 'object', value: ... } envelope
    // The v1 envelope was our convention, not a protocol requirement.
    // v2 evaluator is LLM-based and parses whatever JSON we send.
    await session.submit(JSON.stringify(result));
    log.info('Job delivered via submit()');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('Handler failed — rejecting', { error: errorMsg });
    try {
      await session.reject(`Handler error: ${errorMsg}`);
    } catch (rejectErr) {
      // Fallback: submit error as deliverable (no envelope)
      try {
        await session.submit(JSON.stringify({ error: errorMsg, verdict: 'INSUFFICIENT_DATA' }));
      } catch (submitErr) {
        log.error('CRITICAL: Both reject and submit failed', { jobId: session.jobId });
      }
    }
  }
}
```

### Step 6: Remove stale job flushing

The `flushStaleJobs()` method checks memo expiry dates. V2 removes memos entirely — hooks handle lifecycle. Remove:
- `flushStaleJobs()` method
- `rehydrateAndFlush()` call from `connectSdk()`
- `AcpMemoShape` type
- All memo-related imports and constants

Jobs in v2 have `expiredAt` on-chain and the protocol handles expiry natively.

### Step 7: Update utility methods

**Add `offeringPrices` map** — populated by `registerOfferingHandler()`:

```typescript
private offeringPrices = new Map<string, number>();

registerOfferingHandler(
  offeringId: string,
  handler: OfferingHandler,
  validator?: InputValidator,
  price?: number,
): void {
  this.offeringHandlers.set(offeringId, handler);
  if (validator) this.inputValidators.set(offeringId, validator);
  if (price !== undefined) this.offeringPrices.set(offeringId, price);
}
```

The existing `offeringPriceMap` (price→offeringId reverse map) is removed — v2 uses name-based offering resolution, not price-based.

**Add `stop()` method:**

```typescript
async stop(): Promise<void> {
  if (this.agent) {
    await this.agent.stop();
    this.agent = null;
  }
  this.initialized = false;
}
```

**Update `browseAgents`:**
async browseAgents(keyword: string, topK = 10): Promise<AcpAgentInfo[]> {
  if (!this.agent) throw new Error('AcpService not connected');
  const agents = await this.agent.browseAgents(keyword, { topK });
  // Map AcpAgentDetail to our AcpAgentInfo shape
  return agents.map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    walletAddress: a.walletAddress,
    offerings: a.offerings,
  }));
}

// getActiveJobs — pagination removed in v2
async getActiveJobs(): Promise<unknown[]> {
  const api = this.agent!.getApi();
  return api.getActiveJobs();
}

// getWalletAddress
async getWalletAddress(): Promise<string | null> {
  return this.agent ? await this.agent.getAddress() : null;
}
```

### Step 8: Update `OfferingJobInput` interface

`jobId` changes from `number` to `string` (v2 session.jobId is string). Plugin-wpv handlers use jobId for logging and rejection messages only — string interpolation works identically. No plugin-wpv code changes needed.

```typescript
export interface OfferingJobInput {
  jobId: string;           // was: number (v1 used numeric job IDs)
  offeringId: string;
  buyerAddress: string;
  requirement: Record<string, unknown>;
  isPlainText: boolean;
  rawContent?: string;
}
```

### Step 9: Update type imports

```typescript
// Remove:
import type AcpClientType from '@virtuals-protocol/acp-node';

// Add:
import {
  AcpAgent,
  AlchemyEvmProviderAdapter,
  AssetToken,
  type JobRoomEntry,
  type AgentMessage,
  type AcpAgentDetail,
  type AcpAgentOffering,
} from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
```

Remove `AcpJobPhases`, `AcpMemoShape`, `PHASE_REQUEST`, `PHASE_NEGOTIATION`, `PHASE_TRANSACTION`, `JOB_PHASE_NAMES`.

---

## Resolved Questions (from Kov intel report)

1. **`entityId`:** Current value is `3` (not 40675 — that was the entity ID from the agent URL, not this env var). `Number("3")` works. Only used by `AlchemyEvmProviderAdapter`. If we switch to `PrivyAlchemyEvmProviderAdapter`, it's irrelevant. **Decision: Stay with Alchemy adapter, `entityId: 3`.**

2. **`session.reject()` refund:** Refund is handled atomically by the ACP smart contract on-chain. No SDK-level refund logic needed. Drop-in replacement for `rejectPayable`. **Simpler — just `session.reject(reason)`.**

3. **`session.submit()` format:** Takes a plain string. The `{ type: 'object', value: ... }` envelope was our v1 convention, not a protocol requirement — we created it in our code, the SDK didn't add it. The v2 SDK posts the raw string to the API; on-chain stores only a keccak256 hash. The graduation evaluator is LLM-based and parses whatever JSON we send. **Decision: Drop the envelope. Submit `JSON.stringify(result)` directly.**

4. **`session.entries` timing:** Entries are hydrated BEFORE the handler fires. `hydrateSessions()` loads all historical entries on startup. On `job.created`, the requirement message is already in `session.entries`. **No race condition. Better than v1.**

5. **Offering price:** `AcpAgentOffering` has `priceValue: number` directly. The `offeringPriceMap` (price→offeringId) becomes unnecessary — v2 uses name-based lookup. The offering name IS the routing key. **Store prices per offering name, use in `setBudget`.**

6. **Job ID type:** String in events/sessions, bigint on-chain. SDK converts internally. Grey uses jobId for logging and dedup only. `session.chainId` confirmed as `readonly chainId: number` on `JobSession` type. **String jobId, numeric chainId — both available directly on session.**

7. **Bun compatibility:** Import works cleanly. `typeof AcpAgent` returns `"function"`. Runtime behavior (SSE, Alchemy SDK) needs live testing post-deploy. **Import-level verified.**

8. **Transport:** SSE is default. `SocketTransport` is opt-in with built-in heartbeat/keepalive. **Decision: Use `SocketTransport` for Grey's always-on VPS — better for persistent connections.**

9. **Contract addresses:** Fully auto-resolved by chain ID. Base mainnet (8453) → `0x238E...1832E0`. **No manual config needed.**

---

## What Does NOT Change

- **plugin-wpv** — entire codebase untouched. JobRouter, pipeline, ClaimExtractor, CryptoContentResolver, all discovery code.
- **HTTP handler** on port 3001 — our own code, not SDK-dependent.
- **Supabase**, DB schema, all verification logic.
- **`_handleJobImpl` switch** dispatching to handlers — same structure, called from different entry point.
- **`parseRequirement()`** — same logic, just receives the requirement string from `session.entries` instead of `acpJob.requirement`.
- **Input validators** — same interface, same logic.
- **Offering handler registration** — same `registerOfferingHandler()` API.

---

## Platform-Side Migration

Before deploying the code changes:

1. Go to https://app.virtuals.io/acp/agents
2. Select Whitepaper Grey
3. Hit "Upgrade now" on the v2 banner
4. Re-register offerings in the v2 format (custom schemas, updated pricing)
5. Verify agent wallet is still whitelisted

---

## Execution Order

1. Platform-side: Hit "Upgrade now" in Virtuals UI
2. Install v2 deps: `bun add @virtuals-protocol/acp-node-v2 viem && bun remove @virtuals-protocol/acp-node`
3. Verify Bun builds with new deps
4. Rewrite AcpService.ts (Steps 2-8 above)
5. Build + type-check
6. Deploy to VPS via SCP
7. PM2 restart
8. Verify: agent connects, offerings registered, test job flows
9. Run regression tests (scan, verify, full_tech, briefing)

---

## Files Changed

| File | Repo | Change |
|------|------|--------|
| `package.json` | plugin-acp | Swap `acp-node` → `acp-node-v2` + `viem` |
| `src/AcpService.ts` | plugin-acp | Full rewrite of SDK integration layer |

**One file. Same interfaces to plugin-wpv. Pipeline untouched.**
