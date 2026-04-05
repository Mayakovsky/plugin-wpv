# Design Plan v2: Database Hygiene Service

**Date:** 2026-04-04
**Version:** 2.0 (supersedes v1 — fixes 5 identified issues from Kovsky audit)
**Authors:** Forces (v1), Kovsky audit (v2 revisions)
**Status:** APPROVED — Deferred until post-graduation
**Priority:** Not blocking graduation. Critical for production.

---

## Changelog: v1 → v2

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 1 | LOGIC | Category 2 purges ALL zero-claim verifications — kills valid L1-only scans | Only purge where `verdict = 'INSUFFICIENT_DATA' AND structural_score <= 1`. Legitimate L1 scans with `structural_score >= 2` are kept. |
| 2 | BUG | Category 1 CASCADE delete assumes FK constraints exist in Supabase | Delete in order: claims → verifications → whitepapers. Don't rely on CASCADE. |
| 3 | LOGIC | Category 6 keeps newest verification by `verified_at` — loses good data if re-verification produces fewer claims | Order by `total_claims DESC, verified_at DESC` — prefer data quality, use recency as tiebreaker. |
| 4 | MISSING | No `writeAuditLog()` implementation — findings never written to `wpv_hygiene_log` table | Add batch-insert to `wpv_hygiene_log` at end of `run()`. |
| 5 | LOGIC | Step 14 dedup at write time updates existing record in-place — wipes document_url and invalidates existing verification | Only reuse existing record if it has 0 claims. If existing has claims, create new entry alongside it and let hygiene service clean up later. |

---

## All other content from v1 remains unchanged.

Refer to `Database_Hygiene_Service_Plan.md` (v1) for the full implementation code. Apply the 5 fixes above when implementing.

### Fix 1: Category 2 — Zero-claim verification filter

Replace:
```sql
SELECT v.id, v.whitepaper_id
FROM autognostic.wpv_verifications v
WHERE v.total_claims = 0
```

With:
```sql
SELECT v.id, v.whitepaper_id
FROM autognostic.wpv_verifications v
WHERE v.total_claims = 0
  AND v.verdict = 'INSUFFICIENT_DATA'
  AND v.structural_score <= 1
```

### Fix 2: Category 1 — Explicit delete order

Replace the single `db.delete(wpvWhitepapers)` call with:
```typescript
for (const loserId of loserIds) {
  await this.db.delete(wpvClaims).where(eq(wpvClaims.whitepaperId, loserId));
  await this.db.delete(wpvVerifications).where(eq(wpvVerifications.whitepaperId, loserId));
  await this.db.delete(wpvWhitepapers).where(eq(wpvWhitepapers.id, loserId));
}
```

### Fix 3: Category 6 — Order by claims then recency

Replace:
```sql
ORDER BY verified_at DESC
```

With:
```sql
ORDER BY total_claims DESC, verified_at DESC
```

### Fix 4: Audit log writer

Add to `DataHygieneService` after all detectors run:
```typescript
private async writeAuditLog(findings: HygieneFinding[]): Promise<void> {
  const rows = findings.flatMap((f) =>
    f.recordIds.map((recordId) => ({
      category: f.category,
      recordId,
      recordTable: this.inferTable(f.category),
      action: f.action,
      description: f.description,
      mode: this.config.mode,
    }))
  );
  if (rows.length === 0) return;
  await this.db.insert(wpvHygieneLog).values(rows);
}

private inferTable(category: string): string {
  if (category.includes('whitepaper') || category === 'stale_discovered') return 'wpv_whitepapers';
  if (category.includes('verification') || category.includes('impossible') || category === 'nan_values') return 'wpv_verifications';
  if (category.includes('claim')) return 'wpv_claims';
  return 'unknown';
}
```

Call `await this.writeAuditLog(findings)` at the end of `run()` before returning the report.

### Fix 5: Step 14 dedup — conditional reuse

Replace the proposed reuse logic with:
```typescript
const existing = await this.whitepapersRepo.findByTokenAddress(tokenAddress);
const existingWithClaims = existing.find(async (wp) => {
  const claims = await this.claimsRepo.findByWhitepaperId(wp.id);
  return claims.length > 0;
});

if (existingWithClaims) {
  // Existing record has valuable data — don't touch it.
  // Create new entry; hygiene service will deduplicate later.
  const wp = await this.whitepapersRepo.create({ ... });
  whitepaperId = wp.id;
} else if (existing.length > 0) {
  // Existing record has no claims — safe to reuse
  const wp = existing[0];
  whitepaperId = wp.id;
} else {
  // No existing record — create new
  const wp = await this.whitepapersRepo.create({ ... });
  whitepaperId = wp.id;
}
```

---

*This plan is ready for implementation post-graduation. All 5 fixes are localized and don't change the overall architecture from v1.*
