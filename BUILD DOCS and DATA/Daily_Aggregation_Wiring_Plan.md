# Daily Aggregation Wiring Plan

> Date: 2026-04-28
> Author: Kov (Claude Code CLI)
> Companion to: `Grey's Daily Aggregation Cycle.md` (functionality + constraints report)
> Status: Draft for Forces review

---

## Goal

Activate `DiscoveryCron.runDaily()` so Grey ingests newly graduated Virtuals tokens autonomously, runs them through the same L1/L2/L3 pipeline used by on-demand ACP jobs, and feeds `daily_tech_brief` from fresh content instead of the 10 manually seeded rows.

## Why now

Graduation requirements are complete (16/16 + 8/8 video). The application is in flight. Activating the daily cycle is the next product milestone — it converts Grey from "responds to direct hires" to "publishes a daily-refreshed scam-alert + greenlight feed," which is the resource layer Forces has been targeting for outreach.

---

## Current state, in one sentence

Every component (`BaseChainListener`, `AcpMetadataEnricher`, `WhitepaperSelector`, `TieredDocumentDiscovery`, `MarketTractionAnalyzer`, `ForkDetector`, `DiscoveryCron`) is built and tested, but `WpvService.initFromRuntime` assigns `discoveryCron: null as never` (line 245), no scheduler reads `WPV_DISCOVERY_CRON`, the `AcpMetadataEnricher` depends on a stubbed `IAcpClient`, and `DiscoveryCron.runDaily()` writes via `whitepaperRepo.create()` directly — bypassing the Option B dedupe-on-address upsert that protects on-demand traffic.

---

## Activation Sequence

### Step 1 — AcpMetadataEnricher → live AcpService bridge

**Why:** The enricher needs `IAcpClient.browseAgents()` to populate `agentName` and `linkedUrls`, which feed Tier 1–2 of the tiered discovery. The current `AcpWrapper` returns `[]` — so every token gets null metadata and skipped.

**Path:** plugin-acp's `AcpService` already has a working `browseAgents()` method (used by the `acp browse` CLI for video graduation). Bridge `AcpMetadataEnricher` to it via the same `acpRegistered` runtime lookup that `WpvService.registerWithAcp` already performs. No new SDK dependency, no new credentials.

**Files touched:**
- `src/discovery/AcpMetadataEnricher.ts` — accept the live AcpService client object instead of the stub
- `src/WpvService.ts` line ~250 — pass the live AcpService into the enricher when building `DiscoveryCron`
- `src/acp/AcpWrapper.ts` — keep as test stub only; mark legacy in header comment

### Step 2 — Apply Option B dedupe + violation filter in `DiscoveryCron.runDaily()`

**Why:** Hardening parity with on-demand traffic.

**Dedupe:** Currently `DiscoveryCron.runDaily()` line 150 calls `whitepaperRepo.create()` directly. Replace with the same `byAddrCompatible` + version-extraction + canonical-name-preservation logic in `JobRouter.runL1L2` (lines ~496-546). Cleanest path: extract that block into a `WpvWhitepapersRepo.upsertByAddress()` method and have both call sites use it.

**Violation filter:** Insert `WpvService.scanForViolations(metadata)` at the top of the candidate loop iteration (after `enrichToken` returns metadata, before tiered discovery). Same patterns as on-demand validators. A token whose `agentName` or `description` violates content policy gets rejected pre-ingest.

**Files touched:**
- `src/db/wpvWhitepapersRepo.ts` — new `upsertByAddress()` method
- `src/acp/JobRouter.ts` — refactor existing block to call the new method
- `src/discovery/DiscoveryCron.ts` — call new method + `scanForViolations` gate
- `src/WpvService.ts` — make `scanForViolations` accessible to discovery (currently a private static)

### Step 3 — Persist `lastProcessedBlock` to Supabase

**Why:** `BaseChainListener` holds `lastProcessedBlock` in-memory. Every Grey restart (deploy, PM2 cron-restart, crash) resets it to 0. Without persistence, every restart either re-processes everything or misses a window.

**Cleanest path:** A small `wpv_discovery_state` key/value table with two columns (`key TEXT PRIMARY KEY`, `value JSONB`). Listener reads `last_processed_block` on startup, writes after each successful poll.

**Alternative (no schema change):** On startup, query `MAX(metadata_json->>'graduationBlock')` from `wpv_whitepapers` where `metadata_json->>'discoverySource' = 'cron'`. Avoids the new table but couples block tracking to ingestion success — a polling cycle that found candidates but failed all tier resolutions wouldn't advance the block. Recommend the explicit table.

**Files touched:**
- `drizzle/migrations/` — new migration adding `wpv_discovery_state` table
- `src/db/wpvDiscoveryStateRepo.ts` — new repo
- `src/discovery/BaseChainListener.ts` — load on construct, save on advance

### Step 4 — Instantiate `DiscoveryCron` in `WpvService.initFromRuntime`

**Why:** Replace the `null as never` placeholder with a real instance.

**Files touched:**
- `src/WpvService.ts` — instantiate the six A1–A6 components, pass them into `new DiscoveryCron({ ... })`, assign to `deps.discoveryCron`

Decision point in this step: whether to gate the entire instantiation behind `DISCOVERY_ENABLED=true`. Recommend yes — keeps the cron compiled but inert until explicit opt-in.

### Step 5 — Add a scheduler

**Why:** `WPV_DISCOVERY_CRON` constant is currently unread.

**Pattern:** Mirror plugin-autognostic's `ScheduledSyncService`. Use `node-cron` (already a transitive dependency via autognostic), construct a single task in `WpvService.start()`:

```ts
if (process.env.DISCOVERY_ENABLED === 'true') {
  const schedule = process.env.WPV_DISCOVERY_CRON ?? '0 6 * * *';
  this.cronTask = cron.schedule(schedule, async () => {
    try { await this.deps.discoveryCron.runDaily(); }
    catch (err) { log.error('Discovery run failed', err); }
  });
  log.info('Discovery cron scheduled', { schedule });
}
```

PM2 keeps the parent process alive; the cron fires inside it. No second process needed.

**Files touched:**
- `src/WpvService.ts` — `start()` method
- `package.json` — add `node-cron` as direct dependency (it's already transitive but should be explicit)
- `.env.example` — document `DISCOVERY_ENABLED`, `WPV_DISCOVERY_CRON`, `DISCOVERY_DAILY_BUDGET_USD`

### Step 6 — Tests

**Per-step coverage:**
- Mock `BaseChainListener.getNewTokensSince()` returning fixture token events; verify enricher → tiered discovery → selector chain runs
- Mock `AcpMetadataEnricher.enrichToken()` for content-policy violation case; verify `scanForViolations` rejects pre-ingest
- Mock duplicate token (same address, different version); verify Option B dedupe holds in cron path (no new row, canonical name preserved)
- Verify `lastProcessedBlock` persistence round-trip (write, read, advance)
- Verify scheduler honors `DISCOVERY_ENABLED=false` (no cron task created)

### Step 7 — Dry run via `/wpvscan` action

The `WpvScanAction` already exists but currently reports "WPV service not initialized" because `discoveryCron` is null. After Step 4 it'll work. Run once manually before flipping the schedule:

```
wpvscan
```

Expected: small handful of ingestions, no crashes, no duplicate rows. If the result looks healthy, proceed to Step 8.

### Step 8 — Flip `DISCOVERY_ENABLED=true` on VPS

Set the env var in `wpv-agent/.env`, `pm2 restart grey`. Cron fires at next 06:00 UTC.

### Step 9 — 3-day observation window

Daily check:
- Ingestion count (target: 0–10/day depending on Virtuals graduation rate)
- Cost (track Anthropic spend; sanity-check vs `DISCOVERY_DAILY_BUDGET_USD`)
- Quality spot-check: pick 1–2 newly ingested rows, read the deliverable, gut-check
- Rate-limit complaints (GitHub PAT, CoinGecko, DexScreener)
- Error patterns in `DiscoveryCron` logs

### Step 10 — Iterate thresholds

If first cohort is mostly noise: raise `SELECTION_DEFAULT_THRESHOLD` from 6 to 7 or 8.
If first cohort is empty: lower threshold to 5 or relax `MIN_PAGE_COUNT`.

---

## Hardening items folded into the steps above

| Item | Step | Status |
|---|---|---|
| Dedupe parity with Option B | Step 2 | New |
| Content filter on discovery | Step 2 | New |
| `lastProcessedBlock` persistence | Step 3 | New |
| Trigger source tagging | Step 2 (in `metadataJson`) | Add `discoverySource: 'cron'` to write payload |
| Discovery failure feedback (`discovery_runs` table) | Step 3 (same migration) | Optional but recommended for observability |
| Cost cap enforcement | Step 5 (env var read in scheduler) | Recommend simple per-run check |
| Retention / pruning policy | After observation window | Decision deferred to Forces |

---

## Decisions Forces should make before Step 1

1. **Enrichment source.** Confirm Option B (bridge to live `AcpService`) over Option A (new Virtuals registry client) or Option C (drop enrichment entirely). Option B reuses the same connection that handled all 16 graduation jobs and 8 video jobs.

2. **Budget cap behavior.** Hard `DISCOVERY_DAILY_BUDGET_USD`:
   - **Hard skip:** when hit, log and bail for the day. Safer.
   - **Continue + flag:** ingest remaining candidates without L2/L3, mark `verdict: INSUFFICIENT_DATA`. Less revenue surprise.
   - Recommend hard skip with a default of $5/day (16x the report's $30/month projection).

3. **Retention.** Keep-forever vs. prune `verdict=FAIL AND selection_score < X` after N days.
   - Recommend keep-forever for now. Supabase Pro disk is cheap and the audit trail is cheap.

4. **Violation-content stance for cron-discovered rows.**
   - **Reject at ingestion** (mirrors on-demand validator): cleanest, matches Grey's existing posture.
   - **Ingest, tag, exclude from briefings only:** richer dataset but a row with policy-violating content sits in production DB.
   - Recommend reject at ingestion.

5. **Initial threshold.**
   - **Strict (8/10) first week, then relax:** zero-noise but possibly zero-throughput.
   - **Default (6/10) and live with noise:** real signal on what cohort looks like; iterate from data.
   - Recommend default 6/10.

6. **Daily briefing source filter.**
   - Should `daily_tech_brief` filter to `discoverySource='cron' AND ingested_within_last_N_days`, or include seed rows forever?
   - Recommend a config knob: env var `BRIEFING_INCLUDE_SEED=true` (default) for now, flip to false once cron has 30+ days of data.

---

## Risk surface

| Risk | Mitigation |
|---|---|
| Cron writes duplicate rows | Step 2 — Option B dedupe upsert in cron path |
| Policy-violating content ingested unchecked | Step 2 — `scanForViolations` gate at top of candidate loop |
| Restart loses `lastProcessedBlock` → re-processes or skips | Step 3 — Supabase persistence |
| Runaway cost (10x graduation surge) | Step 5 — `DISCOVERY_DAILY_BUDGET_USD` hard cap |
| Cron throws unhandled, hangs PM2 process | Wrapped `try/catch` in scheduler callback (Step 5) |
| Tier resolvers hit external rate limits | Already throttled per-call; daily quota deferred to post-observation |
| Schema regression in `daily_tech_brief` deliverable | Existing tests cover the report shape; cron path doesn't change schema, only data sources |

---

## Rollback path

Single env flag flip:

```
DISCOVERY_ENABLED=false
pm2 restart grey
```

Cron stops scheduling. Pipeline code stays compiled and tested. Already-ingested rows stay in DB (manual SQL prune if needed). Zero impact on on-demand ACP traffic — that path is independent of `discoveryCron`.

---

## Acceptance criteria

A wiring is "done" when:

1. `pm2 restart grey` with `DISCOVERY_ENABLED=true` produces no startup errors and logs `Discovery cron scheduled` once
2. Manual `/wpvscan` action returns a `DiscoveryRunResult` with `tokensScanned >= 0` and no exceptions
3. A test with a duplicate token (same address as existing row) does NOT create a parallel row — same dedupe behavior as on-demand
4. A test with policy-violating metadata is rejected pre-ingest, not stored
5. Restart of Grey preserves `lastProcessedBlock` (verified via inspecting the new state table before/after)
6. After one scheduled run, `daily_tech_brief` returns at least one cron-sourced entry (verified via `metadataJson.discoverySource === 'cron'`)
7. All existing 399 tests still pass; new tests for the wired path pass

---

## Pre-flight before Step 1

- Forces signoff on the 6 decisions above
- Verify Anthropic API budget headroom for an extra ~$30/month worst case
- Confirm GitHub PAT in env has reasonable rate-limit ceiling (token policy)
- Confirm the new schema migration target (which Supabase project)

Awaiting Forces direction.
