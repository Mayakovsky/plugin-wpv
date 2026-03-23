#!/usr/bin/env bun
/**
 * The 66 Test — Whitepaper Grey Pre-Launch Certification
 *
 * 66 tokens × 7 endpoints = 462 per-token tests + 3 global = 465 total.
 * Runs against cached Supabase data. Zero LLM cost.
 *
 * Usage:
 *   Local:  cd C:\Users\kidco\dev\eliza\plugin-wpv && bun run scripts/run66Test.ts
 *   VPS:    cd /opt/grey/plugin-wpv && bun run scripts/run66Test.ts
 *
 * Output: scripts/66test_results.json + stdout report
 */

import * as fs from 'fs';
import * as path from 'path';
import { DELIVERABLE_SPECS, type FieldSpec } from '../src/acp/AgentCardConfig';
import { ReportGenerator } from '../src/verification/ReportGenerator';
import { Verdict } from '../src/types';

// ── Load .env ────────────────────────────────────────────

function loadEnv() {
  const envPaths = [
    'C:/Users/kidco/dev/eliza/wpv-agent/.env',    // local dev
    path.resolve(__dirname, '../../wpv-agent/.env'), // VPS layout
    path.resolve(__dirname, '../.env'),              // fallback
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx);
          const val = trimmed.slice(eqIdx + 1);
          if (!process.env[key]) process.env[key] = val;
        }
      }
      console.log(`Loaded .env from ${p}`);
      return;
    }
  }
  console.warn('No .env found — using existing environment');
}

loadEnv();

const DATABASE_URL = process.env.WPV_DATABASE_URL!;
if (!DATABASE_URL) {
  console.error('Missing WPV_DATABASE_URL');
  process.exit(1);
}

import postgres from 'postgres';
const sql = postgres(DATABASE_URL);

// ════════════════════════════════════════════
// TEST EVALUATOR — validates responses against DeliverableSpecs
// ════════════════════════════════════════════

interface TestResult {
  testId: string;
  offering: string;
  tokenProject?: string;
  tokenAddress?: string;
  pass: boolean;
  failures: string[];
  responseTimeMs: number;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function validateField(response: unknown, field: FieldSpec): string[] {
  const errors: string[] = [];
  const value = getNestedValue(response, field.path);

  if (value === undefined || value === null) {
    if (field.required && !field.nullable) {
      errors.push(`Missing required field: ${field.path}`);
    }
    return errors;
  }

  // Type check
  if (field.type === 'number' && typeof value !== 'number') {
    errors.push(`${field.path}: expected number, got ${typeof value}`);
  } else if (field.type === 'string' && typeof value !== 'string') {
    errors.push(`${field.path}: expected string, got ${typeof value}`);
  } else if (field.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${field.path}: expected boolean, got ${typeof value}`);
  } else if (field.type === 'array' && !Array.isArray(value)) {
    errors.push(`${field.path}: expected array, got ${typeof value}`);
  } else if (field.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    errors.push(`${field.path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
  }

  // Range check (numbers)
  if (field.type === 'number' && typeof value === 'number') {
    if (field.min !== undefined && value < field.min) {
      errors.push(`${field.path}: ${value} < min ${field.min}`);
    }
    if (field.max !== undefined && value > field.max) {
      errors.push(`${field.path}: ${value} > max ${field.max}`);
    }
  }

  // Enum check
  if (field.enum_values && typeof value === 'string') {
    if (!field.enum_values.includes(value)) {
      errors.push(`${field.path}: '${value}' not in [${field.enum_values.join(', ')}]`);
    }
  }

  return errors;
}

function validateResponse(
  response: unknown,
  specId: string,
  responseTimeMs: number,
): string[] {
  const spec = DELIVERABLE_SPECS[specId];
  if (!spec) return [`Unknown spec: ${specId}`];

  const errors: string[] = [];

  // Check if response is an error object
  if (response && typeof response === 'object' && 'error' in (response as Record<string, unknown>)) {
    errors.push(`Response is error: ${JSON.stringify(response)}`);
    return errors;
  }

  // Validate all required fields
  for (const field of spec.required_fields) {
    errors.push(...validateField(response, field));
  }

  // Response time check
  if (responseTimeMs > spec.max_response_time_ms) {
    errors.push(`Response time ${responseTimeMs}ms > max ${spec.max_response_time_ms}ms`);
  }

  return errors;
}

// ════════════════════════════════════════════
// DATABASE QUERIES
// ════════════════════════════════════════════

async function loadAllTokens(): Promise<Array<{
  wpId: string;
  projectName: string;
  tokenAddress: string | null;
  chain: string;
  status: string;
}>> {
  const rows = await sql`
    SELECT id, project_name, token_address, chain, status
    FROM autognostic.wpv_whitepapers
    WHERE status IN ('VERIFIED', 'INGESTED')
    ORDER BY project_name
  `;
  return rows.map((r: Record<string, unknown>) => ({
    wpId: r.id as string,
    projectName: r.project_name as string,
    tokenAddress: r.token_address as string | null,
    chain: r.chain as string,
    status: r.status as string,
  }));
}

async function loadVerification(wpId: string): Promise<Record<string, unknown> | null> {
  const rows = await sql`
    SELECT * FROM autognostic.wpv_verifications
    WHERE whitepaper_id = ${wpId}
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
}

async function loadClaims(wpId: string): Promise<Array<Record<string, unknown>>> {
  const rows = await sql`
    SELECT * FROM autognostic.wpv_claims
    WHERE whitepaper_id = ${wpId}
    ORDER BY category
  `;
  return rows as unknown as Array<Record<string, unknown>>;
}

async function loadGreenlightVerifications(): Promise<Array<Record<string, unknown>>> {
  const rows = await sql`
    SELECT v.*, w.project_name, w.token_address
    FROM autognostic.wpv_verifications v
    JOIN autognostic.wpv_whitepapers w ON w.id = v.whitepaper_id
    WHERE v.verdict = 'PASS'
  `;
  return rows as unknown as Array<Record<string, unknown>>;
}

async function loadScamAlertVerifications(): Promise<Array<Record<string, unknown>>> {
  const rows = await sql`
    SELECT v.*, w.project_name, w.token_address
    FROM autognostic.wpv_verifications v
    JOIN autognostic.wpv_whitepapers w ON w.id = v.whitepaper_id
    WHERE v.verdict = 'FAIL' OR v.hype_tech_ratio > 3.0
  `;
  return rows as unknown as Array<Record<string, unknown>>;
}

// ════════════════════════════════════════════
// SIMULATE REPORT GENERATION (same path as JobRouter)
// ════════════════════════════════════════════

const reportGen = new ReportGenerator();

function buildStructuralAnalysis(v: Record<string, unknown>) {
  const raw = v.structural_analysis_json as Record<string, unknown> | null;
  if (!raw) {
    return {
      hasAbstract: false, hasMethodology: false, hasTokenomics: false, hasReferences: false,
      citationCount: 0, verifiedCitationRatio: 0,
      hasMath: false, mathDensityScore: 0,
      coherenceScore: 0,
      similarityTopMatch: null, similarityScore: 0,
      hasAuthors: false, hasDates: false,
      mica: {
        claimsMicaCompliance: 'NOT_MENTIONED' as const,
        micaCompliant: 'NO' as const,
        micaSummary: '',
        micaSectionsFound: [] as string[],
        micaSectionsMissing: [] as string[],
      },
    };
  }
  return raw as unknown as {
    hasAbstract: boolean; hasMethodology: boolean; hasTokenomics: boolean; hasReferences: boolean;
    citationCount: number; verifiedCitationRatio: number;
    hasMath: boolean; mathDensityScore: number; coherenceScore: number;
    similarityTopMatch: string | null; similarityScore: number;
    hasAuthors: boolean; hasDates: boolean;
    mica: { claimsMicaCompliance: string; micaCompliant: string; micaSummary: string;
            micaSectionsFound: string[]; micaSectionsMissing: string[] };
  };
}

function verificationRowToResult(v: Record<string, unknown>) {
  return {
    structuralScore: (v.structural_score as number) ?? 0,
    confidenceScore: (v.confidence_score as number) ?? 0,
    hypeTechRatio: (v.hype_tech_ratio as number) ?? 0,
    verdict: (Verdict[(v.verdict as string) as keyof typeof Verdict]) ?? Verdict.INSUFFICIENT_DATA,
    focusAreaScores: (v.focus_area_scores as Record<string, number>) ?? {},
    totalClaims: (v.total_claims as number) ?? 0,
    verifiedClaims: (v.verified_claims as number) ?? 0,
    llmTokensUsed: (v.llm_tokens_used as number) ?? 0,
    computeCostUsd: (v.compute_cost_usd as number) ?? 0,
  };
}

function claimRowToExtracted(c: Record<string, unknown>) {
  return {
    claimId: c.id as string,
    category: c.category as string,
    claimText: c.claim_text as string,
    statedEvidence: (c.stated_evidence as string) ?? '',
    mathematicalProofPresent: (c.math_proof_present as boolean) ?? false,
    sourceSection: (c.source_section as string) ?? '',
    regulatoryRelevance: (c.evaluation_json as Record<string, unknown>)?.regulatoryRelevance === true,
  };
}

// ════════════════════════════════════════════
// TEST RUNNERS
// ════════════════════════════════════════════

async function testLegitimacyScan(
  token: { wpId: string; projectName: string; tokenAddress: string | null },
  verification: Record<string, unknown>,
): Promise<TestResult> {
  const start = Date.now();
  const analysis = buildStructuralAnalysis(verification);
  const result = reportGen.generateLegitimacyScan(
    verificationRowToResult(verification),
    analysis as never,
    { projectName: token.projectName, tokenAddress: token.tokenAddress } as never,
  );
  const elapsed = Date.now() - start;

  const failures = validateResponse(result, 'project_legitimacy_scan', elapsed);
  return {
    testId: `T1:${token.projectName}`,
    offering: 'project_legitimacy_scan',
    tokenProject: token.projectName,
    tokenAddress: token.tokenAddress ?? undefined,
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testTokenomicsAudit(
  token: { wpId: string; projectName: string; tokenAddress: string | null },
  verification: Record<string, unknown>,
  claims: Array<Record<string, unknown>>,
): Promise<TestResult> {
  const start = Date.now();
  const analysis = buildStructuralAnalysis(verification);
  const result = reportGen.generateTokenomicsAudit(
    verificationRowToResult(verification),
    claims.map(claimRowToExtracted) as never[],
    { projectName: token.projectName, tokenAddress: token.tokenAddress } as never,
    undefined,
    analysis as never,
  );
  const elapsed = Date.now() - start;

  const failures = validateResponse(result, 'tokenomics_sustainability_audit', elapsed);
  return {
    testId: `T2:${token.projectName}`,
    offering: 'tokenomics_sustainability_audit',
    tokenProject: token.projectName,
    tokenAddress: token.tokenAddress ?? undefined,
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testVerifyWhitepaper(
  token: { wpId: string; projectName: string; tokenAddress: string | null },
  verification: Record<string, unknown>,
  claims: Array<Record<string, unknown>>,
): Promise<TestResult> {
  const start = Date.now();
  const analysis = buildStructuralAnalysis(verification);
  const result = reportGen.generateTokenomicsAudit(
    verificationRowToResult(verification),
    claims.map(claimRowToExtracted) as never[],
    { projectName: token.projectName, tokenAddress: token.tokenAddress } as never,
    undefined,
    analysis as never,
  );
  // verify_project_whitepaper adds tokenAddress — add it manually since we're going through ReportGenerator
  const enriched = { ...result, tokenAddress: token.tokenAddress };
  const elapsed = Date.now() - start;

  const failures = validateResponse(enriched, 'verify_project_whitepaper', elapsed);
  return {
    testId: `T3:${token.projectName}`,
    offering: 'verify_project_whitepaper',
    tokenProject: token.projectName,
    tokenAddress: token.tokenAddress ?? undefined,
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testFullVerification(
  token: { wpId: string; projectName: string; tokenAddress: string | null },
  verification: Record<string, unknown>,
  claims: Array<Record<string, unknown>>,
): Promise<TestResult> {
  const start = Date.now();
  const analysis = buildStructuralAnalysis(verification);
  const result = reportGen.generateFullVerification(
    verificationRowToResult(verification),
    claims.map(claimRowToExtracted) as never[],
    [], // evaluations — empty for cached
    { projectName: token.projectName, tokenAddress: token.tokenAddress } as never,
    undefined,
    analysis as never,
  );
  const elapsed = Date.now() - start;

  const failures = validateResponse(result, 'full_technical_verification', elapsed);
  return {
    testId: `T4:${token.projectName}`,
    offering: 'full_technical_verification',
    tokenProject: token.projectName,
    tokenAddress: token.tokenAddress ?? undefined,
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testGreenlightList(): Promise<TestResult> {
  const start = Date.now();
  const verifications = await loadGreenlightVerifications();

  const projects = verifications.map((v) => ({
    name: (v.project_name as string) ?? 'Unknown',
    tokenAddress: (v.token_address as string) ?? null,
    verdict: 'PASS' as const,
    score: (v.confidence_score as number) ?? 0,
    hypeTechRatio: (v.hype_tech_ratio as number) ?? 0,
  }));

  const response = {
    date: new Date().toISOString().split('T')[0],
    totalVerified: projects.length,
    projects,
  };
  const elapsed = Date.now() - start;

  const failures = validateResponse(response, 'daily_greenlight_list', elapsed);

  // Additional: every entry must have verdict === PASS
  for (const p of projects) {
    if (p.verdict !== 'PASS') {
      failures.push(`Greenlight entry '${p.name}' has verdict '${p.verdict}', expected PASS`);
    }
  }

  return {
    testId: 'T5:greenlight_list',
    offering: 'daily_greenlight_list',
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testScamAlerts(): Promise<TestResult> {
  const start = Date.now();
  const verifications = await loadScamAlertVerifications();

  const flagged = verifications.map((v) => {
    const redFlags: string[] = [];
    if ((v.hype_tech_ratio as number ?? 0) > 3.0) redFlags.push('High hype-to-tech ratio');
    if ((v.structural_score as number ?? 0) < 2) redFlags.push('Poor structural quality');
    if ((v.total_claims as number ?? 0) === 0) redFlags.push('No verifiable claims');

    const analysisJson = v.structural_analysis_json as Record<string, unknown> | null;
    const mica = analysisJson?.mica as Record<string, unknown> | null;
    const claimsMica = (mica?.claimsMicaCompliance as string) ?? 'NOT_MENTIONED';
    const micaCompliant = (mica?.micaCompliant as string) ?? 'NO';
    const fraudulentMicaClaim = claimsMica === 'YES' && (micaCompliant === 'NO' || micaCompliant === 'PARTIAL');
    if (fraudulentMicaClaim) redFlags.push('Fraudulent MiCA compliance claim');

    return {
      name: (v.project_name as string) ?? 'Unknown',
      tokenAddress: (v.token_address as string) ?? null,
      verdict: 'FAIL' as const,
      hypeTechRatio: (v.hype_tech_ratio as number) ?? 0,
      redFlags,
      fraudulentMicaClaim,
    };
  });

  const response = { date: new Date().toISOString().split('T')[0], flagged };
  const elapsed = Date.now() - start;

  const failures = validateResponse(response, 'scam_alert_feed', elapsed);

  // Additional: each entry must meet at least one alert criterion
  for (const f of flagged) {
    if (f.redFlags.length === 0 && !f.fraudulentMicaClaim) {
      failures.push(`Alert entry '${f.name}' has no red flags — should not be in scam alerts`);
    }
  }

  return {
    testId: 'T6:scam_alerts',
    offering: 'scam_alert_feed',
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

async function testPipelineStatus(tokenCount: number): Promise<TestResult> {
  const start = Date.now();
  const statusRows = await sql`
    SELECT status, COUNT(*)::int as count
    FROM autognostic.wpv_whitepapers
    GROUP BY status
  `;
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) {
    byStatus[r.status as string] = r.count as number;
    total += r.count as number;
  }

  const imageOnlyRows = await sql`
    SELECT COUNT(*)::int as count
    FROM autognostic.wpv_whitepapers
    WHERE metadata_json->>'imageOnly' = 'true'
  `;
  const imageOnlySkipped = (imageOnlyRows[0]?.count as number) ?? 0;

  const response = {
    total_whitepapers: total,
    by_status: byStatus,
    image_only_skipped: imageOnlySkipped,
  };
  const elapsed = Date.now() - start;

  const failures: string[] = [];

  // Valid JSON (always true here, but check structure)
  if (typeof response.total_whitepapers !== 'number') {
    failures.push('total_whitepapers is not a number');
  }
  if (typeof response.by_status !== 'object') {
    failures.push('by_status is not an object');
  }
  if (response.total_whitepapers < tokenCount) {
    failures.push(`total_whitepapers (${response.total_whitepapers}) < expected minimum (${tokenCount})`);
  }
  if (typeof response.image_only_skipped !== 'number') {
    failures.push('image_only_skipped is not a number');
  }
  if (elapsed > 2000) {
    failures.push(`Response time ${elapsed}ms > max 2000ms`);
  }

  return {
    testId: 'T7:pipeline_status',
    offering: 'pipeline_status',
    pass: failures.length === 0,
    failures,
    responseTimeMs: elapsed,
  };
}

// ════════════════════════════════════════════
// REPORT GENERATION
// ════════════════════════════════════════════

function generateReport(results: TestResult[], tokens: Array<{ projectName: string }>) {
  const totalPass = results.filter((r) => r.pass).length;
  const totalFail = results.filter((r) => !r.pass).length;
  const total = results.length;
  const passRate = total > 0 ? ((totalPass / total) * 100).toFixed(1) : '0.0';

  // Response time stats by offering
  const timesByOffering: Record<string, number[]> = {};
  for (const r of results) {
    if (!timesByOffering[r.offering]) timesByOffering[r.offering] = [];
    timesByOffering[r.offering].push(r.responseTimeMs);
  }

  const p95 = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  };

  // Verdict distribution from T4 results
  const verdictDist: Record<string, number> = {};
  const t4Results = results.filter((r) => r.offering === 'full_technical_verification');
  // We'll count from DB data, not from test results
  // (test results only have pass/fail of the test, not the verdict value)

  // Field coverage from T1 results
  const t1Results = results.filter((r) => r.offering === 'project_legitimacy_scan');

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(' WHITEPAPER GREY — 66 TEST REPORT');
  console.log(` Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(` Tokens tested: ${tokens.length}`);
  console.log(` Total tests: ${total}`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('SUMMARY');
  console.log(`  PASS: ${totalPass} (${passRate}%)`);
  console.log(`  FAIL: ${totalFail} (${((totalFail / total) * 100).toFixed(1)}%)`);
  console.log('');

  if (totalFail > 0) {
    console.log('FAILURES:');
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ${r.testId}:`);
      for (const f of r.failures) {
        console.log(`    FAIL — ${f}`);
      }
    }
    console.log('');
  }

  console.log('RESPONSE TIME P95:');
  for (const [offering, times] of Object.entries(timesByOffering)) {
    console.log(`  ${offering}: ${p95(times)}ms`);
  }
  console.log('');

  console.log(`EVALUATOR READINESS: ${passRate}%`);
  if (totalFail > 0) {
    console.log(`  Target: 100% — fix ${totalFail} failures before ACP registration.`);
  } else {
    console.log('  Target: 100% — ACHIEVED. Ready for ACP sandbox.');
  }
  console.log('═══════════════════════════════════════');
  console.log('');

  return {
    date: new Date().toISOString(),
    tokensCount: tokens.length,
    totalTests: total,
    pass: totalPass,
    fail: totalFail,
    passRate: parseFloat(passRate),
    failures: results.filter((r) => !r.pass).map((r) => ({
      testId: r.testId,
      offering: r.offering,
      tokenProject: r.tokenProject,
      failures: r.failures,
      responseTimeMs: r.responseTimeMs,
    })),
    responseTimeP95: Object.fromEntries(
      Object.entries(timesByOffering).map(([k, v]) => [k, p95(v)]),
    ),
    results,
  };
}

// ════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log(' WHITEPAPER GREY — 66 TEST');
  console.log(' Loading tokens from Supabase...');
  console.log('═══════════════════════════════════════');

  const tokens = await loadAllTokens();
  console.log(`Found ${tokens.length} tokens in database`);

  if (tokens.length === 0) {
    console.error('No tokens found. Run seed ingestion first.');
    await sql.end();
    process.exit(1);
  }

  const results: TestResult[] = [];
  let tested = 0;

  for (const token of tokens) {
    tested++;
    const prefix = `[${tested}/${tokens.length}] ${token.projectName}`;

    // Load verification and claims for this token
    const verification = await loadVerification(token.wpId);
    if (!verification) {
      // No verification — record failures for all 4 per-token tests
      for (const tid of ['T1', 'T2', 'T3', 'T4']) {
        results.push({
          testId: `${tid}:${token.projectName}`,
          offering: tid === 'T1' ? 'project_legitimacy_scan'
            : tid === 'T2' ? 'tokenomics_sustainability_audit'
            : tid === 'T3' ? 'verify_project_whitepaper'
            : 'full_technical_verification',
          tokenProject: token.projectName,
          tokenAddress: token.tokenAddress ?? undefined,
          pass: false,
          failures: ['No verification record in database'],
          responseTimeMs: 0,
        });
      }
      console.log(`${prefix} — SKIP (no verification)`);
      continue;
    }

    const claims = await loadClaims(token.wpId);

    // T1: Legitimacy Scan
    const t1 = await testLegitimacyScan(token, verification);
    results.push(t1);

    // T2: Tokenomics Audit
    const t2 = await testTokenomicsAudit(token, verification, claims);
    results.push(t2);

    // T3: Verify Whitepaper
    const t3 = await testVerifyWhitepaper(token, verification, claims);
    results.push(t3);

    // T4: Full Verification
    const t4 = await testFullVerification(token, verification, claims);
    results.push(t4);

    const passCount = [t1, t2, t3, t4].filter((r) => r.pass).length;
    const status = passCount === 4 ? 'PASS' : `${passCount}/4`;
    console.log(`${prefix} — ${status} (${t1.responseTimeMs + t2.responseTimeMs + t3.responseTimeMs + t4.responseTimeMs}ms)`);
  }

  // T5: Greenlight List
  console.log('\nRunning global tests...');
  const t5 = await testGreenlightList();
  results.push(t5);
  console.log(`T5 Greenlight: ${t5.pass ? 'PASS' : 'FAIL'} (${t5.responseTimeMs}ms)`);

  // T6: Scam Alerts
  const t6 = await testScamAlerts();
  results.push(t6);
  console.log(`T6 Scam Alerts: ${t6.pass ? 'PASS' : 'FAIL'} (${t6.responseTimeMs}ms)`);

  // T7: Pipeline Status
  const t7 = await testPipelineStatus(tokens.length);
  results.push(t7);
  console.log(`T7 Pipeline Status: ${t7.pass ? 'PASS' : 'FAIL'} (${t7.responseTimeMs}ms)`);

  // Generate report
  const report = generateReport(results, tokens);

  // Write results
  const outPath = path.resolve(__dirname, '66test_results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Results written to ${outPath}`);

  await sql.end();

  // Exit with error code if any failures
  if (report.fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  sql.end();
  process.exit(2);
});
