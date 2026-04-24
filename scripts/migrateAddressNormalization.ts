#!/usr/bin/env bun
/**
 * One-time migration: normalize token_address storage + merge legacy duplicates.
 *
 * Why: until Option B Fix A (2026-04-24), `wpv_whitepapers.token_address` was
 * stored byte-exactly. Different EIP-55 checksum casings and verbose on-chain
 * ERC-20 `name()` results produced parallel rows for the same on-chain contract:
 *   - Aave vs Aave Token
 *   - Aerodrome vs Aerodrome Finance
 *   - Virtual Protocol vs Virtuals Protocol
 *
 * This migration has two phases:
 *
 *   PHASE 1 — lowercase all 0x token_address values. Safe (lossless — EIP-55
 *   checksumming is a display convention). base58 Solana addresses stay untouched
 *   because case-sensitivity matters there.
 *
 *   PHASE 2 — collapse same-address duplicates within the same version-family.
 *   Rows with differing versions (e.g., `Aave` v1 and `Aave V3`) stay distinct.
 *   Within a version-family, the row with the most claims wins; redundant rows
 *   and their associated verifications + claims are deleted.
 *
 * Usage:
 *   DRY-RUN (default):   bun run scripts/migrateAddressNormalization.ts
 *   APPLY:               bun run scripts/migrateAddressNormalization.ts --apply
 *
 * Both phases run in a single transaction in APPLY mode — abort on any error
 * leaves the DB untouched. Idempotent: running after the migration is a no-op.
 */

import 'dotenv/config';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

const ANSI = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  bold: '\x1b[1m', reset: '\x1b[0m',
};

function extractVersion(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\b(v\d+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

interface WpRow {
  id: string;
  project_name: string;
  token_address: string | null;
  ingested_at: Date | null;
  claim_count: number;
}

async function main() {
  const dbUrl = process.env.WPV_DATABASE_URL;
  if (!dbUrl) {
    console.error(`${ANSI.red}FATAL: WPV_DATABASE_URL not set${ANSI.reset}`);
    process.exit(1);
  }

  console.log(`${ANSI.bold}${ANSI.cyan}=== Address normalization migration — ${MODE} ===${ANSI.reset}\n`);
  if (!APPLY) {
    console.log(`${ANSI.yellow}Running in DRY-RUN. No writes. Re-run with --apply to commit.${ANSI.reset}\n`);
  }

  const sql = postgres(dbUrl);

  try {
    await sql.begin(async (tx) => {
      // ── PHASE 1: lowercase 0x token_address values ──
      console.log(`${ANSI.bold}PHASE 1 — lowercase 0x addresses${ANSI.reset}`);
      const p1Candidates = await tx`
        SELECT id, project_name, token_address
        FROM autognostic.wpv_whitepapers
        WHERE token_address IS NOT NULL
          AND token_address LIKE '0x%'
          AND token_address != LOWER(token_address)
      `;
      console.log(`  rows needing lowercase: ${p1Candidates.length}`);
      for (const row of p1Candidates) {
        console.log(`    ${String(row.project_name).padEnd(22)} | ${row.token_address} → ${String(row.token_address).toLowerCase()}`);
      }

      if (APPLY && p1Candidates.length > 0) {
        const updated = await tx`
          UPDATE autognostic.wpv_whitepapers
          SET token_address = LOWER(token_address)
          WHERE token_address IS NOT NULL
            AND token_address LIKE '0x%'
            AND token_address != LOWER(token_address)
          RETURNING id
        `;
        console.log(`  ${ANSI.green}✓ lowercased ${updated.length} row(s)${ANSI.reset}`);
      } else if (p1Candidates.length === 0) {
        console.log(`  ${ANSI.green}✓ already normalized, nothing to do${ANSI.reset}`);
      } else {
        console.log(`  ${ANSI.yellow}(would update ${p1Candidates.length} rows)${ANSI.reset}`);
      }

      // ── PHASE 2: collapse same-address duplicates within version-family ──
      console.log(`\n${ANSI.bold}PHASE 2 — collapse same-address duplicates${ANSI.reset}`);

      const allRows: WpRow[] = (await tx`
        SELECT wp.id, wp.project_name, wp.token_address, wp.ingested_at,
               (SELECT COUNT(*) FROM autognostic.wpv_claims WHERE whitepaper_id = wp.id)::int AS claim_count
        FROM autognostic.wpv_whitepapers wp
        WHERE wp.token_address IS NOT NULL
        ORDER BY wp.token_address, wp.ingested_at ASC
      `) as WpRow[];

      // Group by (lowercased-address, version-family).
      // In APPLY mode after phase 1, token_address is already lowercase;
      // in DRY-RUN we group by LOWER() of current value to preview.
      const groups = new Map<string, WpRow[]>();
      for (const row of allRows) {
        const addr = String(row.token_address).toLowerCase();
        const version = extractVersion(row.project_name) ?? 'none';
        const key = `${addr}::${version}`;
        const arr = groups.get(key) ?? [];
        arr.push(row);
        groups.set(key, arr);
      }

      const dupeGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
      console.log(`  duplicate groups found: ${dupeGroups.length}`);

      if (dupeGroups.length === 0) {
        console.log(`  ${ANSI.green}✓ no same-address duplicates to collapse${ANSI.reset}`);
      }

      let totalWpDeleted = 0;
      let totalClaimsDeleted = 0;
      let totalVerifsDeleted = 0;

      for (const [key, rows] of dupeGroups) {
        const [addr, version] = key.split('::');
        // Canonical = row with most claims. Tiebreak: earliest ingested (oldest wins as "first seed").
        const sorted = [...rows].sort((a, b) => {
          if (b.claim_count !== a.claim_count) return b.claim_count - a.claim_count;
          const aTime = a.ingested_at?.getTime() ?? 0;
          const bTime = b.ingested_at?.getTime() ?? 0;
          return aTime - bTime;
        });
        const canonical = sorted[0];
        const redundant = sorted.slice(1);

        console.log(`\n  ${ANSI.cyan}GROUP${ANSI.reset} addr=${addr.slice(0, 14)}… version=${version}`);
        console.log(`    ${ANSI.green}KEEP${ANSI.reset}   ${String(canonical.project_name).padEnd(22)} | claims=${canonical.claim_count} | id=${canonical.id.slice(0, 8)}`);
        for (const r of redundant) {
          console.log(`    ${ANSI.red}DROP${ANSI.reset}   ${String(r.project_name).padEnd(22)} | claims=${r.claim_count} | id=${r.id.slice(0, 8)}`);
        }

        if (APPLY) {
          for (const r of redundant) {
            const delClaims = await tx`DELETE FROM autognostic.wpv_claims WHERE whitepaper_id = ${r.id} RETURNING id`;
            const delVerifs = await tx`DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id = ${r.id} RETURNING id`;
            const delWp = await tx`DELETE FROM autognostic.wpv_whitepapers WHERE id = ${r.id} RETURNING id`;
            totalClaimsDeleted += delClaims.length;
            totalVerifsDeleted += delVerifs.length;
            totalWpDeleted += delWp.length;
          }
        }
      }

      if (APPLY && dupeGroups.length > 0) {
        console.log(`\n  ${ANSI.green}✓ deleted ${totalWpDeleted} wp, ${totalVerifsDeleted} verif, ${totalClaimsDeleted} claim row(s)${ANSI.reset}`);
      }

      // ── FINAL STATE ──
      console.log(`\n${ANSI.bold}FINAL STATE${ANSI.reset}`);
      const counts = await tx`
        SELECT
          (SELECT COUNT(*) FROM autognostic.wpv_whitepapers)::int AS whitepapers,
          (SELECT COUNT(*) FROM autognostic.wpv_verifications)::int AS verifications,
          (SELECT COUNT(*) FROM autognostic.wpv_claims)::int AS claims,
          (SELECT COUNT(*) FROM autognostic.wpv_whitepapers WHERE token_address LIKE '0x%' AND token_address != LOWER(token_address))::int AS mixed_case
      `;
      console.log(`  whitepapers:     ${counts[0].whitepapers}`);
      console.log(`  verifications:   ${counts[0].verifications}`);
      console.log(`  claims:          ${counts[0].claims}`);
      console.log(`  mixed-case 0x:   ${counts[0].mixed_case}`);

      // Post-migration sanity: no same-address duplicates remain in the same version-family
      const sanity = await tx`
        WITH grouped AS (
          SELECT LOWER(token_address) AS la,
                 CASE WHEN project_name ~ '\\yv\\d+\\y' THEN LOWER(REGEXP_REPLACE(project_name, '.*\\y(v\\d+)\\y.*', '\\1')) ELSE 'none' END AS ver,
                 COUNT(*)::int AS cnt
          FROM autognostic.wpv_whitepapers
          WHERE token_address IS NOT NULL
          GROUP BY 1, 2
        )
        SELECT COUNT(*)::int AS groups_with_dupes FROM grouped WHERE cnt > 1
      `;
      console.log(`  residual dupe-groups: ${sanity[0].groups_with_dupes}`);

      if (!APPLY) {
        console.log(`\n${ANSI.yellow}DRY-RUN complete. Transaction will roll back.${ANSI.reset}`);
        // Throw to roll back the implicit no-op (we only read in dry-run, but transaction still ends)
        // Actually nothing to roll back in dry-run since we didn't write — but the throw is a
        // defensive guard against accidental writes slipping into the dry-run branch.
        throw new Error('__DRY_RUN_ROLLBACK__');
      }
    });
    console.log(`\n${ANSI.green}${ANSI.bold}✓ migration committed${ANSI.reset}`);
  } catch (err) {
    if ((err as Error).message === '__DRY_RUN_ROLLBACK__') {
      console.log(`\n${ANSI.green}✓ dry-run rolled back cleanly${ANSI.reset}`);
    } else {
      console.error(`\n${ANSI.red}MIGRATION FAILED — transaction rolled back${ANSI.reset}`);
      console.error(err);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error(`${ANSI.red}Migration runner crashed:${ANSI.reset}`, err);
  process.exit(2);
});
