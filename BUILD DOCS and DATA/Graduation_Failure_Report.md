# Graduation Failure Report — AcpService Job Dispatch

**Date:** 2026-03-28
**Author:** Kovsky
**Status:** 12/12 Graduation Evaluator hire attempts failed. Grey is live on ACP but cannot complete jobs.
**Affected File:** `plugin-acp/src/AcpService.ts` — `processJob()` (lines 374–450)

---

## Executive Summary

The Virtuals DevRel Graduation Evaluator (Agent 1419) has attempted to hire Grey 12 times. All 12 failed. Every failure produces a 3-stage cascade: handler error → `rejectPayable` fails → `deliver(error)` fails → **job stuck in limbo**. The root cause is a phase-sequencing bug in `AcpService.processJob()` that attempts to deliver results before the ACP protocol allows it.

---

## ACP Job Lifecycle (How It Should Work)

```
Phase 0  REQUEST       Buyer submits job → Provider accept() or reject()
Phase 1  NEGOTIATION   Buyer pays escrowed USDC → on-chain settlement
Phase 2  TRANSACTION   Provider runs work → deliver(result) or rejectPayable(refund)
Phase 3  EVALUATION    Buyer evaluates deliverable (optional in ACP v2)
Phase 4  COMPLETED     Job done
Phase 5  REJECTED      Job rejected
Phase 6  EXPIRED       Job timed out
```

The SDK fires `onNewTask` on phase transitions. Grey must respond appropriately to each phase:
- **Phase 0:** Decide whether to accept or reject. Do NOT deliver.
- **Phase 2:** Run the handler and deliver results.
- **All other phases:** Ignore (already handled correctly in the current code).

---

## What Grey Does Now (The Bug)

`processJob()` at lines 374–450 of `AcpService.ts`:

```typescript
// Phase 0 (REQUEST): accept, then process.
// Phase 2 (TRANSACTION): already accepted, just process.
if (acpJob.phase === 0) {
  try {
    await acpJob.accept('Processing your request');
  } catch (acceptErr) {
    log.error('Failed to accept job', {}, acceptErr);
    return;
  }
}

// ← NO RETURN HERE — falls through to processing in BOTH phases

try {
  const result = await handler(input);
  await acpJob.deliver(/* result */);       // ← FAILS: job is in phase 1, not phase 2
} catch (err) {
  await acpJob.rejectPayable(/* ... */);    // ← FAILS: same reason
  // fallback:
  await acpJob.deliver(/* error JSON */);   // ← FAILS: same reason
  // CRITICAL: job in limbo
}
```

**The bug:** After `accept()` in phase 0, the job transitions to phase 1 (NEGOTIATION) and waits for buyer payment. But the code falls through immediately to handler execution and `deliver()`. The SDK rejects `deliver()` because the job is in phase 1, not phase 2. Then `rejectPayable()` fails for the same reason. Then the `deliver(error)` fallback fails for the same reason. The job is abandoned.

When the SDK later fires `onNewTask` for phase 2 (after buyer payment), Grey processes the job again — but by this point the first invocation already corrupted the job state or the second attempt hits the same cascade on a stale job object.

---

## All 12 Failed Jobs

| # | Job ID | Error (from handler) | Root Cause |
|---|--------|---------------------|------------|
| 1 | 1003249448 | `Job is not in transaction phase` | Phase sequencing — delivered in phase 1 |
| 2 | 1003249452 | `Invalid token_address: ...got 'not_a_valid_address'` | Bad input + phase sequencing |
| 3 | 1003249454 | `Job is not in transaction phase` | Phase sequencing |
| 4 | 1003250886 | `Job is not in transaction phase` | Phase sequencing |
| 5 | 1003250888 | `Job is not in transaction phase` | Phase sequencing |
| 6 | 1003250891 | `Job is not in transaction phase` | Phase sequencing |
| 7 | 1003250894 | `Job is not in transaction phase` | Phase sequencing |
| 8 | 1003250896 | `Invalid token_address: ...got '0x12345'` | Bad input + phase sequencing |
| 9 | 1003250898 | `Invalid token_address: ...got 'not-an-address'` | Bad input + phase sequencing |
| 10 | 1003250899 | `Job is not in transaction phase` | Phase sequencing |
| 11 | 1003250900 | `Job is not in transaction phase` | Phase sequencing |
| 12 | 1003250902 | `Job is not in transaction phase` | Phase sequencing |

Every job ID appears **twice** in logs (24 error entries total). No deduplication exists — `handleNewTask` processes every SDK callback blindly.

---

## Three Bugs, One Cascade

### Bug 1: Phase Sequencing (Critical — blocks all 12 jobs)

**Location:** `AcpService.ts` `processJob()` lines 411–424

After accepting a phase-0 job, the code falls through to handler execution and delivery instead of returning and waiting for phase 2.

**Fix:** After `accept()` in phase 0, `return`. Only run the handler and call `deliver()` when `acpJob.phase === 2`.

```
Phase 0 → parse requirement → validate input → accept() or reject() → RETURN
Phase 2 → parse requirement → run handler → deliver() or rejectPayable()
```

### Bug 2: No Deduplication (Causes double-processing)

**Location:** `AcpService.ts` `handleNewTask()` lines 348–361

The ACP SDK fires `onNewTask` for the same job ID multiple times (phase transitions, retries, or WebSocket replays). There is no guard against processing the same job+phase combination twice. After the phase fix, this would cause:
- Phase 0: `accept()` called twice (second call throws — job already accepted)
- Phase 2: `deliver()` called twice (second call throws — job already delivered)

**Fix:** Add a `Set<string>` keyed on `${jobId}:${phase}`. Skip processing if the key has been seen. Expire entries after a TTL (e.g., 5 minutes) to prevent unbounded growth.

```typescript
private recentJobs = new Map<string, number>();  // key → timestamp

private isDuplicate(jobId: number, phase: number): boolean {
  const key = `${jobId}:${phase}`;
  const now = Date.now();
  // Expire entries older than 5 minutes
  if (this.recentJobs.has(key)) return true;
  this.recentJobs.set(key, now);
  // Periodic cleanup
  if (this.recentJobs.size > 100) {
    for (const [k, ts] of this.recentJobs) {
      if (now - ts > 300_000) this.recentJobs.delete(k);
    }
  }
  return false;
}
```

### Bug 3: Pre-Acceptance Input Validation Missing (Bad UX for 3 jobs)

**Location:** `AcpService.ts` `processJob()` lines 411–419

The `InputValidationError` class exists (line 40) and plugin-wpv throws it for bad `token_address` values. But `processJob()` calls `accept()` **before** running the handler, so validation errors are always post-acceptance. This means:

1. Grey accepts a job with garbage input
2. Buyer's USDC gets escrowed
3. Handler throws `InputValidationError`
4. Grey must `rejectPayable()` to refund (which currently fails due to Bug 1, but even after Bug 1 is fixed, this is wasteful)

The clean ACP path: validate input **before** `accept()`. If validation fails, call `job.reject()` — buyer keeps USDC, no escrow, no Trust Score impact.

**Fix:** Add an optional `ValidateInput` callback to the handler registration, or run basic input validation in `processJob()` before `accept()`. The validation logic already exists in `WpvService.ts` (lines 200–212) — it just needs to run at the right time.

**Two implementation options:**

**Option A — Validator callback (cleaner, generic):**
```typescript
// types.ts
export type InputValidator = (input: OfferingJobInput) => void;  // throws InputValidationError

// AcpService.ts
private inputValidators = new Map<string, InputValidator>();

registerOfferingHandler(offeringId: string, handler: OfferingHandler, validator?: InputValidator): void {
  this.offeringHandlers.set(offeringId, handler);
  if (validator) this.inputValidators.set(offeringId, validator);
}

// In processJob, phase 0, BEFORE accept():
const validator = this.inputValidators.get(offeringId);
if (validator) {
  try { validator(input); }
  catch (e) {
    if (e instanceof InputValidationError) {
      await acpJob.reject(e.message);
      return;
    }
    throw e;
  }
}
await acpJob.accept('Processing your request');
return;  // Wait for phase 2
```

**Option B — Catch InputValidationError from handler pre-accept (simpler, less clean):**
Run the handler inside a try/catch before `accept()`. If it throws `InputValidationError`, reject. If it succeeds, accept + deliver immediately (skip phase 2 wait). Downside: runs the full handler before payment is escrowed.

**Recommendation:** Option A. It separates validation from execution, keeps the phase model clean, and doesn't require running pipeline work before payment.

---

## Corrected processJob Flow

```
handleNewTask(job):
  ├─ Dedup check → skip if already seen (Bug 2 fix)
  ├─ Phase 0 or 2? → processJob()
  └─ Other phases → ignore (existing behavior, correct)

processJob(job, phase 0):
  ├─ Parse requirement (existing)
  ├─ Find handler (existing)
  ├─ Run input validator if registered (Bug 3 fix)
  │   └─ Throws InputValidationError → job.reject() → return
  ├─ job.accept()
  └─ RETURN ← (Bug 1 fix — do NOT run handler or deliver)

processJob(job, phase 2):
  ├─ Parse requirement (existing)
  ├─ Find handler (existing)
  ├─ Run handler → job.deliver(result)
  └─ On error → job.rejectPayable() → fallback deliver(error) → log critical
```

---

## Impact Assessment

| Bug | Severity | Jobs Affected | Without Fix |
|-----|----------|---------------|-------------|
| 1. Phase sequencing | **CRITICAL** | 12/12 | No job can ever complete via WebSocket SDK |
| 2. No deduplication | **HIGH** | 12/12 (double-fires) | After Bug 1 fix: intermittent double-accept or double-deliver errors |
| 3. No pre-accept validation | **MEDIUM** | 3/12 (bad input tests) | After Bug 1 fix: jobs with bad input get accepted, buyer pays, then refunded — works but wasteful and may fail evaluator's expectations |

---

## Files To Change

| File | Change |
|------|--------|
| `plugin-acp/src/AcpService.ts` | Phase sequencing, dedup guard, pre-accept validation hook |
| `plugin-acp/src/types.ts` | Add `InputValidator` type (if Option A) |
| `plugin-wpv/src/WpvService.ts` | Extract token_address validation into validator callback (if Option A) |
| `plugin-acp/tests/AcpService.test.ts` | New tests for phase sequencing, dedup, pre-accept validation |

---

## Verification Plan

After fix, re-deploy to VPS and confirm:

1. **Phase 0 job:** Grey accepts and returns (no handler execution, no deliver attempt)
2. **Phase 2 job:** Grey runs handler and delivers successfully
3. **Duplicate SDK fire:** Second callback for same job+phase is skipped silently
4. **Bad input (phase 0):** Grey rejects with `job.reject()` before accepting — buyer keeps USDC
5. **Handler error (phase 2):** `rejectPayable()` succeeds (because we're now in the correct phase)
6. **All existing tests still pass:** plugin-acp 47/47, plugin-wpv 304/304

---

## What This Report Does NOT Cover

- **Why the SDK fires twice per job** — could be WebSocket replay, retry, or dual-phase notification. The dedup guard handles it regardless of cause. Investigation is optional.
- **HTTP handler** — The HTTP job handler (`handleHttpJob`) is a separate code path and is NOT affected by these bugs. Breakbot tests passed via HTTP. Only the WebSocket SDK path (`onNewTask`) is broken.
- **Evaluator expectations** — We don't know exactly what Agent 1419 considers a "pass." It may require a successful delivery, a clean rejection, or both. The fix covers all cases.

---

*End of report. Kovsky standing by to implement after Forces reviews.*
