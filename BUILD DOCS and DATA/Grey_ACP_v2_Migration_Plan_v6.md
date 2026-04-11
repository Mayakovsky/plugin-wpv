# ACP v2 SDK Migration Plan — Whitepaper Grey (v6)

> **Source:** Forces v1 → Kovsky v1 review → Forces v2 → Kovsky v2 review → Kovsky v3 → Forces v4 → Kovsky v4 SDK verification → Kovsky v5 → Forces v6 budget fix
> **Date:** 2026-04-11
> **Scope:** AcpService.ts rewrite + test rewrite + type update + HTTP handler fix. Pipeline code (plugin-wpv) untouched.
> **Package:** `@virtuals-protocol/acp-node` → `@virtuals-protocol/acp-node-v2`
> **New peer deps:** `viem`, `@account-kit/infra`, `@account-kit/smart-contracts`, `@aa-sdk/core`

> **v4 fixes (from Forces review of v3):**
> 1. **TypeScript compile error:** `session.entries.find()` accessed `contentType` on `SystemEntry` (which doesn't have it). Changed to `.filter().find()` pattern in both handlers.
> 2. **Runtime bug:** `getActiveJobs()` returns `{ chainId, onChainJobId }[]` only — not full job objects. Fixed to call `api.getJob()` per job.
> 3. **Job left hanging:** `setBudget` failure in `handleJobCreated` logged the error but left the job in `created` state forever. Now attempts `session.reject()` on failure.
> 4. **Redundant API call:** `handleJobFunded` called `fetchJob()` again even though `session._job` was already populated by `handleJobCreated`. Changed to `session.job ?? await session.fetchJob()`.
> 5. **Undocumented behavioral change:** Error fallback submits error deliverable (evaluator must reject) instead of v1's atomic `rejectPayable` refund. Added to risk table.
>
> **v5 fixes (from Kovsky SDK verification against actual v2 type definitions):**
> 6. **Budget type mismatch:** `AcpJob.budget` is `AssetToken` (object with `.amount: number`), not a raw number. `Number(full.budget ?? 0)` would produce `NaN`. Fixed to `full.budget?.amount ?? 0` in `getActiveJobs()` and defensive parsing in `getCompletedJobs()`.
> 7. **Missing event cases in switch:** Added `budget.set` and `job.submitted` as explicit no-op cases. Without these, the provider's own `setBudget` event and delivery confirmation log as "Ignoring event" which obscures debugging.
>
> **v6 fix (from Forces tracing SDK source for budget conversion):**
> 8. **Budget raw value not converted:** `OffChainJob.budget` is a raw on-chain string in smallest units (e.g., `"10000"` = 0.01 USDC with 6 decimals). `Number(budgetStr)` produces `10000`, not `0.01`. Traced full chain: `OffChainJob.budget` → `BigInt()` → `AssetToken.usdcFromRaw(raw, chainId)` → `Number(raw) / 10 ** USDC_DECIMALS[chainId]`. Fixed both `getActiveJobs()` and `getCompletedJobs()` to use `AssetToken.usdcFromRaw()` for proper decimal conversion.

---

## Decisions

**Envelope:** KEEP `{ type: 'object', value: result }` for first deployment. Zero-cost safety measure — remove after confirming v2 evaluator doesn't need it. Controlled by a constant for easy toggle.

**Transport:** `SocketTransport` — persistent WebSocket with heartbeat, better than SSE for always-on VPS.

**Provider:** `AlchemyEvmProviderAdapter` with `entityId: 3`. Stay with current Alchemy setup.

**jobId type:** `string` (v2 session.jobId). Plugin-wpv doesn't use jobId — no downstream impact.

---

## Data Access Mapping (verified from v2 SDK source)

| What we read | v1 (current) | v2 (target) |
|---|---|---|
| Offering name | `acpJob.name` | `job.description` via `session.fetchJob()` |
| Requirement data | `acpJob.requirement` (object or string) | First `AgentMessage` with `contentType === "requirement"` in `session.entries`, JSON-parsed |
| Job ID | `acpJob.id` (number) | `session.jobId` (string) |
| Job phase | `acpJob.phase` (number) | `entry.event.type` (string: `"job.created"`, `"job.funded"`, etc.) |
| Buyer address | `acpJob.clientAddress` | `job.clientAddress` via `session.fetchJob()` |
| Price | `acpJob.price` | `this.offeringPrices.get(offeringId)` (from registration, not job) |
| Memos/expiry | `acpJob.memos` | REMOVED — protocol handles lifecycle on-chain |

## Action Mapping

| What we do | v1 (current) | v2 (target) |
|---|---|---|
| Accept + set price | `acpJob.respond(true, 'Accepted')` | `session.setBudget(AssetToken.usdc(price, session.chainId))` |
| Reject pre-payment | `acpJob.reject('reason')` | `session.reject('reason')` |
| Deliver result | `acpJob.deliver({ type: 'object', value: result })` | `session.submit(JSON.stringify({ type: 'object', value: result }))` |
| Reject post-payment | `acpJob.rejectPayable('reason', 0)` | `session.reject('reason')` (refund is atomic on-chain) |
| Browse agents | `acpClient.browseAgents(keyword, opts)` | `agent.browseAgents(keyword, params)` |
| Get active jobs | `acpClient.getActiveJobs(page, size)` | `agent.getApi().getActiveJobs()` + per-job `getJob()` |
| Init | `acpClient.init()` | `agent.start()` |
| Shutdown | (none) | `agent.stop()` |

---

## The 10 Steps

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

Remove `@virtuals-protocol/acp-node`. The `@account-kit/*` and `@aa-sdk/core` are transitive deps — check if Bun resolves them or if they need explicit installation.

```bash
cd /opt/grey/plugin-acp && bun add @virtuals-protocol/acp-node-v2 viem && bun remove @virtuals-protocol/acp-node
```

Verify build succeeds before proceeding.

---

### Step 2: Rewrite initialization (`connectSdk()`)

**V2:**
```typescript
import { AcpAgent, AlchemyEvmProviderAdapter, AssetToken, SocketTransport } from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
import type { JobSession, JobRoomEntry, AgentMessage } from '@virtuals-protocol/acp-node-v2';

const provider = await AlchemyEvmProviderAdapter.create({
  walletAddress: this.acpConfig.agentWalletAddress as `0x${string}`,
  privateKey: prefixedKey as `0x${string}`,
  entityId: this.acpConfig.sessionEntityKeyId,  // currently 3
  chains: [base],  // Base mainnet (8453)
});

this.agent = await AcpAgent.create({
  provider,
  transport: new SocketTransport(),
});
this.agent.on('entry', (session: JobSession, entry: JobRoomEntry) => this.handleEntry(session, entry));
await this.agent.start();
this.initialized = true;
```

**Preserve graceful degradation:** The credential check in `initFromRuntime()` stays unchanged — if `ACP_WALLET_PRIVATE_KEY`, `ACP_SESSION_ENTITY_KEY_ID`, or `AGENT_WALLET_ADDRESS` are missing, the HTTP handler runs standalone. The `connectSdk()` method is the only thing that changes.

**Class property change:**
```typescript
// Remove:
private acpClient: AcpClientType | null = null;
// Add:
private agent: AcpAgent | null = null;
```

---

### Step 3: Rewrite event handler (`handleNewTask` → `handleEntry`)

```typescript
private async handleEntry(session: JobSession, entry: JobRoomEntry): Promise<void> {
  // Only process system events (job lifecycle), not agent messages
  if (entry.kind !== 'system') return;

  const eventType = entry.event.type;
  const jobId = session.jobId;

  // Deduplication — same pattern as v1, event type replaces phase number
  const dedupKey = `${jobId}:${eventType}`;
  if (this.recentJobs.has(dedupKey)) return;
  this.recentJobs.set(dedupKey, Date.now());

  // Cleanup sweep — same threshold as v1 (100 entries, 5 min TTL)
  if (this.recentJobs.size > DEDUP_CLEANUP_THRESHOLD) {
    const now = Date.now();
    for (const [key, ts] of this.recentJobs) {
      if (now - ts > DEDUP_TTL_MS) this.recentJobs.delete(key);
    }
  }

  const log = logger.child({ operation: 'handleEntry', jobId, eventType });
  log.info('Entry received');

  switch (eventType) {
    case 'job.created':
      await this.handleJobCreated(session, entry, log);
      break;

    case 'job.funded':
      await this.handleJobFunded(session, entry, log);
      break;

    case 'budget.set':
      // Provider's own setBudget confirmation — no action needed
      log.debug('Budget set — waiting for client funding');
      break;

    case 'job.submitted':
      // Provider's own submit confirmation — no action needed
      log.debug('Deliverable submitted — waiting for evaluator');
      break;

    case 'job.completed':
    case 'job.rejected':
    case 'job.expired':
      log.info('Job terminal state', { eventType });
      break;

    default:
      log.debug('Unhandled event type', { eventType });
  }
}
```

---

### Step 4: Rewrite accept/reject phase (`handleJobCreated`)

```typescript
private async handleJobCreated(
  session: JobSession,
  entry: JobRoomEntry,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const job = await session.fetchJob();
  let offeringId = job.description ?? '';

  // Offering name diagnostic — log mismatch for debugging
  if (offeringId && !this.offeringHandlers.has(offeringId)) {
    log.warn('job.description does not match any registered offering', {
      description: offeringId,
      registeredOfferings: [...this.offeringHandlers.keys()],
    });
  }

  // Extract requirement from room messages
  // NOTE: filter→find pattern required because SystemEntry has no contentType field.
  // A single .find() with e.contentType would fail TypeScript compilation.
  const requirementMsg = session.entries
    .filter((e): e is AgentMessage => e.kind === 'message')
    .find(e => e.contentType === 'requirement');
  const rawRequirement = requirementMsg?.content ?? '';

  log.info('Job created', { offeringId, hasRequirement: !!requirementMsg });

  if (!offeringId) {
    log.info('No offering name — accepting as readiness probe');
    try {
      const price = this.offeringPrices.values().next().value ?? 0.01;
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
    log.error('Failed to setBudget — attempting reject to avoid hanging job', {}, err);
    try {
      await session.reject('Internal error: failed to set budget');
    } catch (rejectErr) {
      log.error('Failed to reject after setBudget failure — job will expire on-chain', {}, rejectErr);
    }
  }
}
```

---

### Step 5: Rewrite delivery phase (`handleJobFunded`)

**Validator is NOT re-run** — it already passed in `handleJobCreated`. Re-running wastes RPC calls (`isContractAddress`) and adds delivery latency.

**Envelope is KEPT** — controlled by `WRAP_DELIVERABLE_ENVELOPE` constant.

```typescript
// Module-level constant — set false after confirming v2 evaluator doesn't need envelope
const WRAP_DELIVERABLE_ENVELOPE = true;

private async handleJobFunded(
  session: JobSession,
  entry: JobRoomEntry,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  // Use cached job if available (already fetched in handleJobCreated).
  // Only re-fetch if session._job is null (e.g., agent restarted between events).
  // description and clientAddress don't change between created→funded.
  const job = session.job ?? await session.fetchJob();
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

  // Extract requirement from room messages (same filter→find pattern as handleJobCreated)
  const requirementMsg = session.entries
    .filter((e): e is AgentMessage => e.kind === 'message')
    .find(e => e.contentType === 'requirement');
  const rawRequirement = requirementMsg?.content ?? '';
  const { requirement, isPlainText } = this.parseRequirement(rawRequirement);

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

    const deliverable = WRAP_DELIVERABLE_ENVELOPE
      ? { type: 'object', value: result }
      : result;
    await session.submit(JSON.stringify(deliverable));

    log.info('Job delivered via submit()', {
      jobId: session.jobId,
      offeringId,
      envelope: WRAP_DELIVERABLE_ENVELOPE,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('Handler failed — rejecting', { error: errorMsg });
    try {
      await session.reject(`Handler error: ${errorMsg}`);
    } catch (rejectErr) {
      // Fallback: submit error as deliverable
      try {
        const errorResult = { error: errorMsg, verdict: 'INSUFFICIENT_DATA' };
        const errorDeliverable = WRAP_DELIVERABLE_ENVELOPE
          ? { type: 'object', value: errorResult }
          : errorResult;
        await session.submit(JSON.stringify(errorDeliverable));
      } catch (submitErr) {
        log.error('CRITICAL: Both reject and submit failed', { jobId: session.jobId });
      }
    }
  }
}
```

---

### Step 6: Remove stale job flushing

Remove entirely:
- `flushStaleJobs()` method
- `rehydrateAndFlush()` call from `connectSdk()` (if present)
- `AcpMemoShape` type
- All memo-related logic

V2 handles job expiry on-chain. The `hydrateSessions()` method loads active jobs on startup; expired jobs are not replayed.

---

### Step 7: Update utility methods and class properties

**Replace `acpClient` with `agent` everywhere:**

```typescript
// Class properties
private agent: AcpAgent | null = null;
private offeringPrices = new Map<string, number>();  // NEW — offeringId → price

// Remove:
private acpClient: AcpClientType | null = null;
private offeringPriceMap = new Map<number, string>();  // REMOVED — price→offeringId reverse map

// isConnected — update reference
isConnected(): boolean {
  return this.initialized && this.agent !== null;
}

// stop — NEW
async stop(): Promise<void> {
  if (this.agent) {
    await this.agent.stop();
    this.agent = null;
  }
  this.initialized = false;
}

// registerOfferingHandler — add offeringPrices
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

**Public API methods — audit and migrate:**

```typescript
// browseAgents — v2 equivalent exists
async browseAgents(keyword: string, topK = 10): Promise<AcpAgentInfo[]> {
  if (!this.agent) throw new Error('AcpService not connected');
  const safeTopK = Math.max(1, Math.min(topK, 100));
  const agents = await this.agent.browseAgents(keyword.slice(0, 200), { topK: safeTopK });
  return agents.map((a: any) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    walletAddress: a.walletAddress,
    offerings: a.offerings ?? [],
  }));
}

// getActiveJobs — v2 returns { chainId, onChainJobId }[] only (not full job objects).
// Must call api.getJob() per job for full data.
async getActiveJobs(): Promise<AcpJobInfo[]> {
  if (!this.agent) throw new Error('AcpService not connected');
  try {
    const api = this.agent.getApi();
    const jobRefs = await api.getActiveJobs();
    const jobs: AcpJobInfo[] = [];
    for (const ref of jobRefs) {
      try {
        const full = await api.getJob(ref.chainId, ref.onChainJobId);
        if (full) {
          // api.getJob() returns OffChainJob where budget is a raw on-chain string
          // in smallest units (e.g., "10000" = 0.01 USDC with 6 decimals).
          // Must use AssetToken.usdcFromRaw() to convert to human-readable amount.
          const price = full.budget
            ? AssetToken.usdcFromRaw(BigInt(full.budget), ref.chainId).amount
            : 0;
          jobs.push({
            jobId: ref.onChainJobId,
            phase: String(full.jobStatus ?? 'unknown'),
            buyerAddress: full.clientAddress ?? '',
            providerAddress: full.providerAddress ?? '',
            price,
            offeringName: full.description ?? '',
          });
        }
      } catch {
        // Individual job fetch failed — skip, continue with others
      }
    }
    return jobs;
  } catch (err) {
    logger.warn('getActiveJobs failed', { error: (err as Error).message });
    return [];
  }
}

// getCompletedJobs — check if v2 API exposes this
// If not available, return empty array with warning
async getCompletedJobs(): Promise<AcpJobInfo[]> {
  if (!this.agent) throw new Error('AcpService not connected');
  try {
    const api = this.agent.getApi();
    // v2 API may not have getCompletedJobs — check at runtime
    if (typeof (api as any).getCompletedJobs === 'function') {
      const jobs = await (api as any).getCompletedJobs();
      return jobs.map((j: any) => {
        // budget may be string (OffChainJob raw units), AssetToken (AcpJob), or number — parse defensively.
        // String values are raw on-chain amounts and MUST be converted via AssetToken.usdcFromRaw().
        const rawBudget = j.budget;
        const chainId = j.chainId ?? 8453;  // default to Base mainnet
        let price = 0;
        try {
          price = typeof rawBudget === 'number' ? rawBudget
            : typeof rawBudget === 'string' ? AssetToken.usdcFromRaw(BigInt(rawBudget), chainId).amount
            : typeof rawBudget === 'object' && rawBudget?.amount != null ? Number(rawBudget.amount)
            : 0;
        } catch {
          // BigInt conversion or AssetToken may throw — fallback to 0
          price = 0;
        }
        return {
          jobId: String(j.id ?? j.onChainJobId ?? ''),
          phase: j.status ?? j.jobStatus ?? 'completed',
          buyerAddress: j.clientAddress ?? '',
          providerAddress: j.providerAddress ?? '',
          price,
          offeringName: j.description ?? '',
        };
      });
    }
    logger.warn('getCompletedJobs not available in v2 SDK');
    return [];
  } catch (err) {
    logger.warn('getCompletedJobs failed', { error: (err as Error).message });
    return [];
  }
}

// getWalletBalance — check if v2 exposes token balances
async getWalletBalance(): Promise<Record<string, unknown> | null> {
  if (!this.agent) throw new Error('AcpService not connected');
  try {
    if (typeof (this.agent as any).getTokenBalances === 'function') {
      return await (this.agent as any).getTokenBalances();
    }
    logger.warn('getTokenBalances not available in v2 SDK');
    return null;
  } catch (err) {
    logger.warn('getWalletBalance failed', { error: (err as Error).message });
    return null;
  }
}

// getWalletAddress — v2 uses agent.getAddress()
async getWalletAddress(): Promise<string | null> {
  if (!this.agent) return null;
  try {
    return await this.agent.getAddress();
  } catch {
    return this.acpConfig?.agentWalletAddress ?? null;
  }
}

// getClient — type changes from AcpClientType to AcpAgent
getClient(): AcpAgent | null {
  return this.agent;
}
```

---

### Step 8: Update types

**File:** `src/types.ts`

```typescript
export interface OfferingJobInput {
  jobId: string;              // was: number. v2 session.jobId is string.
  offeringId: string;
  buyerAddress: string;
  requirement: Record<string, unknown>;
  isPlainText?: boolean;      // KEEP OPTIONAL — HTTP handler doesn't set it
  rawContent?: string;
}
```

`isPlainText` stays optional (`?`). The HTTP handler path constructs `OfferingJobInput` without setting `isPlainText`. WpvService's inline type uses `isPlainText?: boolean`. Changing to required would break both.

**Also update `AcpJobInfo`** if the `jobId` field type changes from `number` to `string`:
```typescript
export interface AcpJobInfo {
  jobId: string;              // was: number
  phase: string;
  buyerAddress: string;
  providerAddress: string;
  price: number;
  offeringName?: string;
}
```

---

### Step 9: Update HTTP handler

The HTTP handler is "our code, not SDK-dependent" but the `OfferingJobInput` type change affects it.

**File:** `src/AcpService.ts` — `handleHttpJob()` method

```typescript
// Current (line 428-433):
const input: OfferingJobInput = {
  jobId: jobId ? parseInt(jobId, 10) || 0 : 0,  // was number
  ...
};

// V2:
const input: OfferingJobInput = {
  jobId: jobId ?? 'http-0',  // now string
  offeringId,
  buyerAddress: (args.user_address as string) ?? 'http-request',
  requirement,
};
```

The HTTP handler does NOT set `isPlainText` or `rawContent` — this is unchanged and correct (HTTP is for structured JSON testing only).

---

### Step 10: Rewrite tests

**File:** `tests/AcpService.test.ts`

The current 59 tests mock the v1 SDK. ALL will fail after the rewrite. Test structure stays the same; mocks change.

**Mock setup:**

```typescript
// v1 mock (current):
const mockJob = {
  id: 1001, phase: 0, name: 'project_legitimacy_scan',
  requirement: { token_address: '0x...' },
  clientAddress: '0xbuyer',
  respond: vi.fn(), reject: vi.fn(), deliver: vi.fn(),
  rejectPayable: vi.fn(),
};

// v2 mock (new):
function createMockSession(overrides?: Partial<{
  jobId: string;
  entries: any[];
  chainId: number;
}>) {
  const mockJob = {
    description: 'project_legitimacy_scan',
    clientAddress: '0xbuyer',
  };
  return {
    jobId: overrides?.jobId ?? '1001',
    chainId: overrides?.chainId ?? 8453,
    entries: overrides?.entries ?? [{
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify({ token_address: '0xabc123' }),
    }],
    job: mockJob,  // cached getter — handleJobFunded uses this first
    fetchJob: vi.fn().mockResolvedValue(mockJob),
    setBudget: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
  };
}

function createSystemEntry(eventType: string): JobRoomEntry {
  return {
    kind: 'system',
    event: { type: eventType },
  } as any;
}
```

**Tests to rewrite (same scenarios, new mocks):**

| Test Group | v1 Mock | v2 Mock |
|-----------|---------|---------|
| Phase sequencing | `acpJob.phase === 0/2` | `entry.event.type === 'job.created'/'job.funded'` |
| Deduplication | `isDuplicate(jobId, phase)` | `isDuplicate(jobId, eventType)` |
| Pre-accept validation | `validator(input) → acpJob.reject()` | `validator(input) → session.reject()` |
| Delivery | `handler(input) → acpJob.deliver()` | `handler(input) → session.submit()` |
| Error handling | `acpJob.rejectPayable()` | `session.reject()` |
| Handler registry | unchanged | unchanged |
| Lifecycle | `acpClient.init()` | `agent.start()` |

**Estimated scope:** ~200 lines of test mock changes. Test count stays at 59 (same scenarios). No new test cases needed for v2-specific behavior — the migration is a transport change, not a logic change.

---

### Step 11: Update imports and remove dead code

**Remove:**
```typescript
import type AcpClientType from '@virtuals-protocol/acp-node';
```
And all references to: `AcpJobPhases`, `AcpMemoShape`, `PHASE_REQUEST`, `PHASE_NEGOTIATION`, `PHASE_TRANSACTION`, `JOB_PHASE_NAMES`, `AcpJobShape`.

**Add:**
```typescript
import {
  AcpAgent,
  AlchemyEvmProviderAdapter,
  AssetToken,
  SocketTransport,
  type JobSession,
  type JobRoomEntry,
  type AgentMessage,
} from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
```

**Constants file (`src/constants.ts`) cleanup:**
- Keep: `ACP_SERVICE_TYPE`, `ACP_HTTP_PORT`
- Remove: `JOB_PHASE_NAMES` (phases don't exist in v2)

---

## What Does NOT Change

- **plugin-wpv** — entire codebase untouched. JobRouter, pipeline, ClaimExtractor, CryptoContentResolver, all discovery code.
- **HTTP handler logic** — only the `jobId` type in `OfferingJobInput` construction changes.
- **Supabase**, DB schema, all verification logic.
- **`parseRequirement()`** — same 3-stage parser, just receives the requirement string from `session.entries` instead of `acpJob.requirement`.
- **Input validators** — same interface, same logic.
- **Offering handler registration API** — same `registerOfferingHandler()` signature.
- **KNOWN_PROTOCOL_PATTERN** — stays inline in AcpService with SYNC comment.

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

1. **Platform-side:** Hit "Upgrade now" in Virtuals UI
2. **Step 1:** Install v2 deps, remove v1
3. **Step 11:** Update imports, remove dead code
4. **Step 2:** Rewrite initialization
5. **Step 3:** Rewrite event handler
6. **Step 4:** Rewrite handleJobCreated
7. **Step 5:** Rewrite handleJobFunded
8. **Step 6:** Remove stale job flushing
9. **Step 7:** Update utility methods and class properties
10. **Step 8:** Update OfferingJobInput type
11. **Step 9:** Fix HTTP handler jobId
12. **Build + type-check** — must compile clean
13. **Step 10:** Rewrite tests — must pass 59/59
14. **Deploy to VPS** via SCP
15. **PM2 restart**
16. **Verify:** agent connects, 4 handlers registered, test job flows
17. **Regression tests:** scan, verify, full_tech, briefing, empty {}, NSFW

---

## Files Changed

| File | Repo | Change |
|------|------|--------|
| `package.json` | plugin-acp | Swap `acp-node` → `acp-node-v2` + `viem` |
| `src/AcpService.ts` | plugin-acp | Full rewrite of SDK integration layer |
| `src/types.ts` | plugin-acp | `OfferingJobInput.jobId`: number → string |
| `src/constants.ts` | plugin-acp | Remove `JOB_PHASE_NAMES` |
| `tests/AcpService.test.ts` | plugin-acp | Full mock rewrite (v1 SDK mocks → v2 session mocks) |

**Pipeline untouched. Same interfaces to plugin-wpv.**

---

## Resolved Questions

1. **`entityId`:** `3`. `Number("3")` works. Alchemy adapter only.
2. **`session.reject()` refund:** Atomic on-chain. Drop-in for `rejectPayable`.
3. **`session.submit()` format:** Plain string. Envelope kept for safety.
4. **`session.entries` timing:** Hydrated before handler fires. No race condition.
5. **Offering price:** Stored per offering name in `offeringPrices` map.
6. **Job ID type:** String in sessions. Plugin-wpv doesn't use it.
7. **Bun compatibility:** Import verified. Runtime needs live testing.
8. **Transport:** SocketTransport with heartbeat.
9. **Contract addresses:** Auto-resolved by chain ID. No config needed.
10. **`session.chainId`:** Confirmed `readonly chainId: number` on `JobSession`.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Envelope format rejected by v2 evaluator | `WRAP_DELIVERABLE_ENVELOPE` constant — one-line toggle |
| v2 SDK runtime errors (Bun + Alchemy) | Import verified; runtime tested post-deploy before eval |
| `getCompletedJobs` / `getTokenBalances` missing in v2 | Graceful fallback (return empty + log warning) |
| Offering name mismatch (job.description vs registered) | Diagnostic log + existing handler-not-found rejection |
| SocketTransport reconnection issues | SDK has built-in heartbeat; PM2 restarts on crash |
| Error fallback refund path differs from v1 | In v1, `rejectPayable` atomically refunded the buyer. In v2, if `session.reject()` fails after a handler error, the fallback submits an error deliverable — the evaluator must then reject it for the buyer to be refunded. Buyer's money is held longer (until evaluator acts). This is inherent to v2's event-driven settlement model — no code mitigation possible. |

---

## Verification Checklist (all verified against actual SDK type definitions)

- [x] `JobSession.jobId`: `string` — confirmed
- [x] `JobSession.chainId`: `number` — confirmed
- [x] `JobSession.job`: `AcpJob | null` — confirmed (getter, null until `fetchJob()`)
- [x] `JobSession.fetchJob()`: `Promise<AcpJob>` — confirmed (sets `_job`, throws on failure)
- [x] `JobSession.entries`: `JobRoomEntry[]` — confirmed
- [x] `JobRoomEntry`: `SystemEntry | AgentMessage` — confirmed (discriminated union on `kind`)
- [x] `SystemEntry.event.type`: `AcpJobEventType` — confirmed (includes `budget.set`, `job.submitted`)
- [x] `AgentMessage.contentType`: includes `"requirement"` — confirmed
- [x] `AcpJob.description`: `string` — confirmed (from `OnChainJob`)
- [x] `AcpJob.budget`: `AssetToken` — confirmed (NOT a number — use `.amount`)
- [x] `AssetToken.amount`: `number` — confirmed (human-readable value)
- [x] `OffChainJob.budget`: `string | null` — confirmed (raw API returns string in smallest units)
- [x] `AcpJobApi.getActiveJobs()`: `Promise<{ chainId: number; onChainJobId: string }[]>` — confirmed
- [x] `AcpJobApi.getJob()`: `Promise<OffChainJob | null>` — confirmed
- [x] `AcpAgent.browseAgents()`: `Promise<AcpAgentDetail[]>` — confirmed
- [x] `AcpAgent.getAddress()`: `Promise<string>` — confirmed
- [x] `AcpAgent.getApi()`: `AcpJobApi` — confirmed
- [x] `AssetToken.usdc(amount, chainId)`: static factory — confirmed
- [x] `AssetToken.usdcFromRaw(rawAmount, chainId)`: converts raw on-chain bigint to human-readable amount via `Number(rawAmount) / 10 ** USDC_DECIMALS[chainId]` — confirmed
- [x] `USDC_DECIMALS[base.id]`: `6` — confirmed (Base mainnet)
- [x] `OffChainJob.budget` → `BigInt()` → `AssetToken.usdcFromRaw()` chain: confirmed from `AcpJob.fromOffChain()` source
- [x] `SocketTransport`: exported, implements `AcpChatTransport` — confirmed

---

*Implement in order: deps → imports → init → handlers → cleanup → utility → types → HTTP → build → tests → deploy → verify.*
