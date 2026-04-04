# Design Plan: Database Hygiene Service

**Date:** 2026-04-04
**Version:** 1.0
**Status:** APPROVED — Open questions resolved by Forces
**Priority:** Not critical for testing, critical for production

---

## 1. Problem Statement

Grey's database has required manual cleanup four times across the project's history. The same patterns recur: duplicate whitepapers per token_address, zero-claim eval artifacts, stale entries. There is no automated cleanup code anywhere in the codebase — no delete methods in any repo, no scheduled hygiene.

In production, bad data directly affects buyer experience. A buyer querying Aave and hitting a cached zero-claim verification from a failed eval run gets a useless response. Duplicate entries cause non-deterministic cache behavior (which duplicate gets returned depends on query ordering).

### Constraint

**No wipes of wpv_claims, wpv_verifications, wpv_whitepapers without explicit Forces approval.** The hygiene system must be surgical — identify and remove specific bad records, never bulk-truncate.

---

## 2. Bad Data Categories

| # | Category | How It's Created | Impact | Auto-Purge Safe? |
|---|----------|-----------------|--------|-----------------|
| 1 | Duplicate whitepapers per token_address | Eval runs create new records for the same project | Non-deterministic cache hits | YES — keep best, remove rest |
| 2 | Zero-claim verifications (ALL verdicts) | ClaimExtractor failures, pipeline bugs | Buyers get empty cached results, corrupt verdicts | YES — zero claims = zero value |
| 3 | Orphaned claims/verifications | PITR restores, manual SQL, failed CASCADE | Dangling FK references, wasted storage | YES — referential integrity |
| 4 | Impossible values | Pipeline edge cases | Corrupted scores in reports | NO — flag for review |
| 5 | Stale DISCOVERED entries | Failed ingestions, abandoned pipeline runs | Wasted storage, false counts | YES — after age threshold |
| 6 | Superseded verifications | Re-verification of same project | Stale cached data served to buyers | YES — keep newest per whitepaper |

---

## 3. Architecture

### 3.1 New Files

| File | Purpose |
|------|---------|
| `src/db/DataHygieneService.ts` | Detection + purge logic for all categories |
| `src/db/hygieneQueries.ts` | Raw SQL queries for complex cleanup (Drizzle can't express all of these) |
| `tests/DataHygieneService.test.ts` | Unit tests with mock DB |

### 3.2 Execution Modes

**Scheduled (production):** Runs daily via cron, 30 minutes after the discovery cron (06:30 UTC). Auto-purges safe categories (1, 2, 3, 5, 6). Logs everything. Flags category 4 (impossible values) for review without deleting.

**On-demand:** Callable from WpvService or a new Eliza action (`WPV_DB_HYGIENE`). Returns a report of what it found and what it purged.

**Dry-run mode:** Default for first deployment. Detects and logs all bad data but deletes nothing. Gives confidence before enabling auto-purge.

### 3.3 Safety Controls

- **Dry-run by default** — must be explicitly set to `mode: 'purge'` to delete
- **Per-category toggle** — each category can be independently enabled/disabled for auto-purge
- **Maximum purge cap** — refuses to delete more than 50 records in a single run. If more are detected, logs a warning and stops. Prevents runaway deletes from a bug.
- **Purge log table** — every deletion is logged to a `wpv_hygiene_log` table (what was deleted, why, when, dry-run or real). Audit trail.
- **Forces-gated categories** — category 4 (impossible values) is NEVER auto-purged. Report only.

---

## 4. Implementation

### 4.1 `DataHygieneService.ts`

```typescript
import { eq, and, lt, sql, ne, inArray, notInArray, isNull } from 'drizzle-orm';
import { wpvWhitepapers, wpvClaims, wpvVerifications } from './wpvSchema';
import type { DrizzleDbLike } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'DataHygieneService' });

interface HygieneConfig {
  /** 'dry-run' = detect only, 'purge' = detect + delete */
  mode: 'dry-run' | 'purge';
  /** Max records to delete per run. Safety cap. */
  maxPurgePerRun: number;
  /** Age in days after which DISCOVERED entries are stale (approved: 3 days) */
  staleDiscoveredDays: number;
  /** Per-category auto-purge toggles */
  categories: {
    duplicateWhitepapers: boolean;
    zeroClaimVerifications: boolean;
    orphanedRecords: boolean;
    impossibleValues: boolean;   // always false — report only
    staleDiscovered: boolean;
    supersededVerifications: boolean;
  };
}

const DEFAULT_CONFIG: HygieneConfig = {
  mode: 'dry-run',
  maxPurgePerRun: 50,
  staleDiscoveredDays: 3,
  categories: {
    duplicateWhitepapers: true,
    zeroClaimVerifications: true,
    orphanedRecords: true,
    impossibleValues: false,      // NEVER auto-purge
    staleDiscovered: true,
    supersededVerifications: true,
  },
};

export interface HygieneReport {
  runAt: string;
  mode: 'dry-run' | 'purge';
  findings: HygieneFinding[];
  purged: number;
  capped: boolean;  // true if maxPurgePerRun was hit
}

interface HygieneFinding {
  category: string;
  description: string;
  recordIds: string[];
  action: 'purged' | 'flagged' | 'skipped';
}

export class DataHygieneService {
  private config: HygieneConfig;
  private totalPurged = 0;

  constructor(
    private db: DrizzleDbLike,
    config?: Partial<HygieneConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // impossibleValues is ALWAYS report-only regardless of config
    this.config.categories.impossibleValues = false;
  }

  async run(): Promise<HygieneReport> {
    this.totalPurged = 0;
    const findings: HygieneFinding[] = [];

    log.info('DataHygieneService starting', { mode: this.config.mode });

    // Run each detector in order
    if (this.config.categories.duplicateWhitepapers) {
      findings.push(...await this.detectDuplicateWhitepapers());
    }
    if (this.config.categories.zeroClaimVerifications) {
      findings.push(...await this.detectZeroClaimVerifications());
    }
    if (this.config.categories.orphanedRecords) {
      findings.push(...await this.detectOrphanedRecords());
    }
    // impossibleValues: always detect, never purge
    findings.push(...await this.detectImpossibleValues());
    if (this.config.categories.staleDiscovered) {
      findings.push(...await this.detectStaleDiscovered());
    }
    if (this.config.categories.supersededVerifications) {
      findings.push(...await this.detectSupersededVerifications());
    }

    const report: HygieneReport = {
      runAt: new Date().toISOString(),
      mode: this.config.mode,
      findings,
      purged: this.totalPurged,
      capped: this.totalPurged >= this.config.maxPurgePerRun,
    };

    log.info('DataHygieneService complete', {
      mode: this.config.mode,
      findings: findings.length,
      purged: this.totalPurged,
      capped: report.capped,
    });

    return report;
  }

  // ── Category 1: Duplicate whitepapers per token_address ──

  private async detectDuplicateWhitepapers(): Promise<HygieneFinding[]> {
    // Find token_addresses with more than one whitepaper.
    // Keep the one whose verification has the most claims.
    // If no verifications, keep the most recent by ingested_at.
    const dupeGroups: Array<{ token_address: string; count: number }> = await this.db
      .execute(sql`
        SELECT token_address, COUNT(*)::int as count
        FROM autognostic.wpv_whitepapers
        WHERE token_address IS NOT NULL
        GROUP BY token_address
        HAVING COUNT(*) > 1
      `);

    const findings: HygieneFinding[] = [];

    for (const group of dupeGroups) {
      // Get all whitepapers for this token, joined with verification claim count
      const rows: Array<{
        id: string;
        project_name: string;
        ingested_at: Date;
        total_claims: number | null;
      }> = await this.db.execute(sql`
        SELECT w.id, w.project_name, w.ingested_at,
               COALESCE(v.total_claims, 0) as total_claims
        FROM autognostic.wpv_whitepapers w
        LEFT JOIN autognostic.wpv_verifications v ON v.whitepaper_id = w.id
        WHERE w.token_address = ${group.token_address}
        ORDER BY COALESCE(v.total_claims, 0) DESC, w.ingested_at DESC
      `);

      // Keep the first (best), mark rest for removal
      const keeper = rows[0];
      const losers = rows.slice(1);
      const loserIds = losers.map((r) => r.id);

      if (loserIds.length > 0) {
        const finding: HygieneFinding = {
          category: 'duplicate_whitepapers',
          description: `${group.token_address}: keeping ${keeper.id} (${keeper.total_claims ?? 0} claims), removing ${loserIds.length} duplicates`,
          recordIds: loserIds,
          action: 'skipped',
        };

        if (this.config.mode === 'purge' && this.canPurge(loserIds.length)) {
          // CASCADE delete removes associated claims + verifications
          await this.db.delete(wpvWhitepapers).where(
            inArray(wpvWhitepapers.id, loserIds),
          );
          this.totalPurged += loserIds.length;
          finding.action = 'purged';
          log.info('Purged duplicate whitepapers', {
            tokenAddress: group.token_address,
            kept: keeper.id,
            removed: loserIds.length,
          });
        }

        findings.push(finding);
      }
    }

    return findings;
  }

  // ── Category 2: Zero-claim verifications ──

  private async detectZeroClaimVerifications(): Promise<HygieneFinding[]> {
    // ALL verifications where totalClaims = 0, regardless of verdict.
    // Zero claims = no extracted evidence = no value for any buyer query.
    // A zero-claim PASS/FAIL is a pipeline bug; zero-claim INSUFFICIENT_DATA
    // is an eval artifact. Both are data integrity problems.
    const zeroClaim: Array<{ id: string; whitepaper_id: string }> = await this.db
      .execute(sql`
        SELECT v.id, v.whitepaper_id
        FROM autognostic.wpv_verifications v
        WHERE v.total_claims = 0
      `);

    if (zeroClaim.length === 0) return [];

    const ids = zeroClaim.map((r) => r.id);
    const finding: HygieneFinding = {
      category: 'zero_claim_verifications',
      description: `${zeroClaim.length} verifications with 0 claims and INSUFFICIENT_DATA verdict`,
      recordIds: ids,
      action: 'skipped',
    };

    if (this.config.mode === 'purge' && this.canPurge(ids.length)) {
      await this.db.delete(wpvVerifications).where(
        inArray(wpvVerifications.id, ids),
      );
      this.totalPurged += ids.length;
      finding.action = 'purged';
      log.info('Purged zero-claim verifications', { count: ids.length });
    }

    return [finding];
  }

  // ── Category 3: Orphaned records ──

  private async detectOrphanedRecords(): Promise<HygieneFinding[]> {
    const findings: HygieneFinding[] = [];

    // Orphaned verifications (whitepaper_id doesn't exist)
    const orphanedVerifications: Array<{ id: string }> = await this.db
      .execute(sql`
        SELECT v.id
        FROM autognostic.wpv_verifications v
        LEFT JOIN autognostic.wpv_whitepapers w ON w.id = v.whitepaper_id
        WHERE w.id IS NULL
      `);

    if (orphanedVerifications.length > 0) {
      const ids = orphanedVerifications.map((r) => r.id);
      const finding: HygieneFinding = {
        category: 'orphaned_verifications',
        description: `${ids.length} verifications referencing deleted whitepapers`,
        recordIds: ids,
        action: 'skipped',
      };

      if (this.config.mode === 'purge' && this.canPurge(ids.length)) {
        await this.db.delete(wpvVerifications).where(
          inArray(wpvVerifications.id, ids),
        );
        this.totalPurged += ids.length;
        finding.action = 'purged';
        log.info('Purged orphaned verifications', { count: ids.length });
      }

      findings.push(finding);
    }

    // Orphaned claims (whitepaper_id doesn't exist)
    const orphanedClaims: Array<{ id: string }> = await this.db
      .execute(sql`
        SELECT c.id
        FROM autognostic.wpv_claims c
        LEFT JOIN autognostic.wpv_whitepapers w ON w.id = c.whitepaper_id
        WHERE w.id IS NULL
      `);

    if (orphanedClaims.length > 0) {
      const ids = orphanedClaims.map((r) => r.id);
      const finding: HygieneFinding = {
        category: 'orphaned_claims',
        description: `${ids.length} claims referencing deleted whitepapers`,
        recordIds: ids,
        action: 'skipped',
      };

      if (this.config.mode === 'purge' && this.canPurge(ids.length)) {
        await this.db.delete(wpvClaims).where(
          inArray(wpvClaims.id, ids),
        );
        this.totalPurged += ids.length;
        finding.action = 'purged';
        log.info('Purged orphaned claims', { count: ids.length });
      }

      findings.push(finding);
    }

    return findings;
  }

  // ── Category 4: Impossible values (REPORT ONLY — never auto-purge) ──

  private async detectImpossibleValues(): Promise<HygieneFinding[]> {
    const findings: HygieneFinding[] = [];

    // structuralScore outside 0–5
    const badStructural: Array<{ id: string; structural_score: number }> = await this.db
      .execute(sql`
        SELECT id, structural_score
        FROM autognostic.wpv_verifications
        WHERE structural_score IS NOT NULL
          AND (structural_score < 0 OR structural_score > 5)
      `);

    if (badStructural.length > 0) {
      findings.push({
        category: 'impossible_structural_score',
        description: `${badStructural.length} verifications with structural_score outside 0-5`,
        recordIds: badStructural.map((r) => r.id),
        action: 'flagged',
      });
    }

    // confidenceScore outside 0–100
    const badConfidence: Array<{ id: string; confidence_score: number }> = await this.db
      .execute(sql`
        SELECT id, confidence_score
        FROM autognostic.wpv_verifications
        WHERE confidence_score IS NOT NULL
          AND (confidence_score < 0 OR confidence_score > 100)
      `);

    if (badConfidence.length > 0) {
      findings.push({
        category: 'impossible_confidence_score',
        description: `${badConfidence.length} verifications with confidence_score outside 0-100`,
        recordIds: badConfidence.map((r) => r.id),
        action: 'flagged',
      });
    }

    // Negative hype_tech_ratio
    const badHype: Array<{ id: string }> = await this.db
      .execute(sql`
        SELECT id
        FROM autognostic.wpv_verifications
        WHERE hype_tech_ratio IS NOT NULL
          AND hype_tech_ratio < 0
      `);

    if (badHype.length > 0) {
      findings.push({
        category: 'impossible_hype_tech_ratio',
        description: `${badHype.length} verifications with negative hype_tech_ratio`,
        recordIds: badHype.map((r) => r.id),
        action: 'flagged',
      });
    }

    // NaN detection (PostgreSQL stores NaN as 'NaN' — check with special comparison)
    const nanRows: Array<{ id: string; field: string }> = await this.db
      .execute(sql`
        SELECT id, 'structural_score' as field FROM autognostic.wpv_verifications WHERE structural_score = 'NaN'::real
        UNION ALL
        SELECT id, 'confidence_score' as field FROM autognostic.wpv_verifications WHERE confidence_score = 'NaN'::real
        UNION ALL
        SELECT id, 'hype_tech_ratio' as field FROM autognostic.wpv_verifications WHERE hype_tech_ratio = 'NaN'::real
        UNION ALL
        SELECT id, 'compute_cost_usd' as field FROM autognostic.wpv_verifications WHERE compute_cost_usd = 'NaN'::real
      `);

    if (nanRows.length > 0) {
      findings.push({
        category: 'nan_values',
        description: `${nanRows.length} NaN values detected across verification score fields`,
        recordIds: [...new Set(nanRows.map((r) => r.id))],
        action: 'flagged',
      });
    }

    return findings;
  }

  // ── Category 5: Stale DISCOVERED entries ──

  private async detectStaleDiscovered(): Promise<HygieneFinding[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.staleDiscoveredDays);

    const stale: Array<{ id: string; project_name: string }> = await this.db
      .execute(sql`
        SELECT id, project_name
        FROM autognostic.wpv_whitepapers
        WHERE status = 'DISCOVERED'
          AND ingested_at < ${cutoff.toISOString()}::timestamptz
      `);

    if (stale.length === 0) return [];

    const ids = stale.map((r) => r.id);
    const finding: HygieneFinding = {
      category: 'stale_discovered',
      description: `${stale.length} whitepapers stuck in DISCOVERED for ${this.config.staleDiscoveredDays}+ days`,
      recordIds: ids,
      action: 'skipped',
    };

    if (this.config.mode === 'purge' && this.canPurge(ids.length)) {
      // CASCADE delete removes claims + verifications too
      await this.db.delete(wpvWhitepapers).where(
        inArray(wpvWhitepapers.id, ids),
      );
      this.totalPurged += ids.length;
      finding.action = 'purged';
      log.info('Purged stale DISCOVERED entries', { count: ids.length });
    }

    return [finding];
  }

  // ── Category 6: Superseded verifications ──

  private async detectSupersededVerifications(): Promise<HygieneFinding[]> {
    // For each whitepaper with multiple verifications, keep only the newest.
    const dupeGroups: Array<{ whitepaper_id: string; count: number }> = await this.db
      .execute(sql`
        SELECT whitepaper_id, COUNT(*)::int as count
        FROM autognostic.wpv_verifications
        GROUP BY whitepaper_id
        HAVING COUNT(*) > 1
      `);

    const findings: HygieneFinding[] = [];

    for (const group of dupeGroups) {
      const rows: Array<{ id: string; verified_at: Date; total_claims: number }> = await this.db
        .execute(sql`
          SELECT id, verified_at, total_claims
          FROM autognostic.wpv_verifications
          WHERE whitepaper_id = ${group.whitepaper_id}
          ORDER BY verified_at DESC
        `);

      // Keep newest, remove rest
      const keeper = rows[0];
      const losers = rows.slice(1);
      const loserIds = losers.map((r) => r.id);

      if (loserIds.length > 0) {
        const finding: HygieneFinding = {
          category: 'superseded_verifications',
          description: `whitepaper ${group.whitepaper_id}: keeping newest verification ${keeper.id}, removing ${loserIds.length} older`,
          recordIds: loserIds,
          action: 'skipped',
        };

        if (this.config.mode === 'purge' && this.canPurge(loserIds.length)) {
          await this.db.delete(wpvVerifications).where(
            inArray(wpvVerifications.id, loserIds),
          );
          this.totalPurged += loserIds.length;
          finding.action = 'purged';
          log.info('Purged superseded verifications', {
            whitepaperId: group.whitepaper_id,
            removed: loserIds.length,
          });
        }

        findings.push(finding);
      }
    }

    return findings;
  }

  // ── Safety ──

  private canPurge(count: number): boolean {
    if (this.totalPurged + count > this.config.maxPurgePerRun) {
      log.warn('Purge cap reached — stopping further deletes', {
        totalPurged: this.totalPurged,
        requested: count,
        cap: this.config.maxPurgePerRun,
      });
      return false;
    }
    return true;
  }
}
```

### 4.2 Delete Methods — Repo Additions

The repos currently have no delete methods. Add these:

**wpvWhitepapersRepo.ts:**
```typescript
async deleteById(id: string): Promise<void> {
  await this.db.delete(wpvWhitepapers).where(eq(wpvWhitepapers.id, id));
}

async deleteByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await this.db.delete(wpvWhitepapers).where(inArray(wpvWhitepapers.id, ids));
}
```

**wpvVerificationsRepo.ts:**
```typescript
async deleteById(id: string): Promise<void> {
  await this.db.delete(wpvVerifications).where(eq(wpvVerifications.id, id));
}

async deleteByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await this.db.delete(wpvVerifications).where(inArray(wpvVerifications.id, ids));
}
```

**wpvClaimsRepo.ts:**
```typescript
async deleteById(id: string): Promise<void> {
  await this.db.delete(wpvClaims).where(eq(wpvClaims.id, id));
}

async deleteByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await this.db.delete(wpvClaims).where(inArray(wpvClaims.id, ids));
}
```

### 4.3 Scheduling — WpvService Integration

```typescript
// In WpvService.start(), after discovery cron setup:

import { DataHygieneService } from './db/DataHygieneService';

// Daily hygiene cron — 30 min after discovery (06:30 UTC)
const hygieneService = new DataHygieneService(this.db, {
  mode: process.env.WPV_HYGIENE_MODE === 'purge' ? 'purge' : 'dry-run',
  maxPurgePerRun: 50,
  staleDiscoveredDays: 7,
});

// Cron expression: 06:30 UTC daily
this.hygieneCron = new CronJob('30 6 * * *', async () => {
  try {
    const report = await hygieneService.run();
    log.info('Hygiene report', report);
  } catch (err) {
    log.error('Hygiene cron failed', {}, err);
  }
});
```

### 4.4 Environment Variable

```bash
# 'dry-run' (default) = detect only, log findings
# 'purge' = detect + delete (with safety cap)
WPV_HYGIENE_MODE=dry-run
```

Switch to `purge` after reviewing dry-run logs and confirming detection accuracy.

---

## 5. Duplicate Prevention at Write Time

The hygiene service cleans up after the fact. But the better fix is preventing duplicates from being created. Add a **dedup check** at the write boundary in JobRouter before creating new whitepaper records:

```typescript
// In JobRouter, before creating a new whitepaper for a live pipeline run:

const existing = await this.whitepapersRepo.findByTokenAddress(tokenAddress);
if (existing.length > 0) {
  // Reuse the existing whitepaper record instead of creating a new one.
  // Update its document_url and status if the new URL is different.
  const wp = existing[0];
  // ... update if needed, don't create duplicate
}
```

This is a defense-in-depth measure — the hygiene service handles historical data, the dedup check prevents new pollution.

---

## 6. Testing Strategy

### Unit Tests
- Mock DB with seeded bad data for each category
- Verify dry-run mode detects but doesn't delete
- Verify purge mode detects and deletes
- Verify purge cap stops at 50 and sets `capped: true`
- Verify impossibleValues category NEVER purges regardless of config
- Verify CASCADE behavior: deleting a whitepaper removes its claims + verifications
- Verify duplicate detection keeps the entry with the most claims
- Verify superseded detection keeps the newest verification

### Integration Test (against Supabase)
- Run dry-run against production DB, inspect report
- Verify no false positives before enabling purge mode

---

## 7. Deployment Steps

1. Kovsky implements `DataHygieneService.ts` + repo delete methods + tests
2. Deploy with `WPV_HYGIENE_MODE=dry-run`
3. Let it run for 2-3 days, review logs
4. Forces reviews dry-run reports, confirms detection accuracy
5. Switch to `WPV_HYGIENE_MODE=purge`
6. Add dedup check to JobRouter to prevent future pollution

---

## 8. Decisions (resolved by Forces 2026-04-04)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Stale threshold | **3 days** | Pipeline verifies within minutes or not at all. 3 days covers VPS downtime with margin. |
| Zero-claim scope | **All zero-claim verifications, any verdict** | Zero claims = zero value. A zero-claim PASS is a pipeline bug; zero-claim INSUFFICIENT_DATA is an eval artifact. Both are data integrity problems. |
| Purge cap | **50 per daily run** | Steady-state daily finds are 0-5 items. Cap bounds worst-case damage from detection bugs. Drop to 10 if switching to hourly runs. |
| Audit log table | **YES — add `wpv_hygiene_log` table** | PM2 logs rotate. Supabase table persists for investigation. ~200 bytes/row, negligible resource cost. |

## 9. Audit Log Schema

```sql
CREATE TABLE autognostic.wpv_hygiene_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  record_id uuid NOT NULL,
  record_table text NOT NULL,        -- 'wpv_whitepapers', 'wpv_verifications', 'wpv_claims'
  action text NOT NULL,              -- 'purged', 'flagged'
  description text,
  mode text NOT NULL                 -- 'dry-run' or 'purge'
);

CREATE INDEX wpv_hygiene_log_run_idx ON autognostic.wpv_hygiene_log(run_at);
```

Inserted as a batch at the end of each hygiene run. One multi-row insert, not per-record. ~200 bytes/row. Even at 50 deletes/day for a year, under 4MB total.

### 9.1 DataHygieneService — Audit Log Integration

```typescript
private async writeAuditLog(findings: HygieneFinding[]): Promise<void> {
  const rows = findings
    .filter((f) => f.action === 'purged' || f.action === 'flagged')
    .flatMap((f) =>
      f.recordIds.map((recordId) => ({
        category: f.category,
        record_id: recordId,
        record_table: this.inferTable(f.category),
        action: f.action,
        description: f.description,
        mode: this.config.mode,
      })),
    );

  if (rows.length === 0) return;

  await this.db.execute(sql`
    INSERT INTO autognostic.wpv_hygiene_log
      (category, record_id, record_table, action, description, mode)
    VALUES ${sql.join(
      rows.map((r) =>
        sql`(${r.category}, ${r.record_id}::uuid, ${r.record_table}, ${r.action}, ${r.description}, ${r.mode})`,
      ),
      sql`,`,
    )}
  `);

  log.info('Audit log written', { rows: rows.length });
}

private inferTable(category: string): string {
  if (category.includes('whitepaper') || category === 'stale_discovered') {
    return 'wpv_whitepapers';
  }
  if (category.includes('verification') || category.includes('impossible') || category.includes('nan')) {
    return 'wpv_verifications';
  }
  if (category.includes('claim')) {
    return 'wpv_claims';
  }
  return 'unknown';
}
```

Called at the end of `run()` after all detectors complete.

---

## 10. File Manifest

| File | Purpose | New/Modified |
|------|---------|-------------|
| `src/db/DataHygieneService.ts` | Detection + purge + audit logging | NEW |
| `src/db/wpvSchema.ts` | Add `wpvHygieneLog` table definition | MODIFIED |
| `src/db/wpvWhitepapersRepo.ts` | Add `deleteById`, `deleteByIds` | MODIFIED |
| `src/db/wpvVerificationsRepo.ts` | Add `deleteById`, `deleteByIds` | MODIFIED |
| `src/db/wpvClaimsRepo.ts` | Add `deleteById`, `deleteByIds` | MODIFIED |
| `src/WpvService.ts` | Add hygiene cron (06:30 UTC daily) | MODIFIED |
| `tests/DataHygieneService.test.ts` | Unit tests with mock DB | NEW |

---

*All open questions resolved. Plan ready for Kovsky implementation. Deploy in dry-run first, review logs for 2-3 days, then switch to purge mode.*
