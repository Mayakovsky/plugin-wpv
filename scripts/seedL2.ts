#!/usr/bin/env bun
/**
 * Seed L2 — Run claim extraction on tokens with known documentation.
 * Re-fetches text from known URLs and calls Anthropic API.
 *
 * Usage: cd /opt/grey/plugin-wpv && bun run scripts/seedL2.ts
 */

import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const p = path.resolve(__dirname, '../../wpv-agent/.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0 && !process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  }
}
loadEnv();

import postgres from 'postgres';
const sql = postgres(process.env.WPV_DATABASE_URL!);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

// Tokens with known documentation URLs worth running L2 on
const L2_TARGETS: Array<{ name: string; url: string }> = [
  { name: 'LUKSO', url: 'https://docs.lukso.tech/' },
  { name: 'RARI', url: 'https://docs.rarible.org/' },
  { name: 'CULT', url: 'https://cultdao.io/' },
  { name: 'SKILL', url: 'https://docs.cryptoblades.io/' },
  { name: 'USDS', url: 'https://docs.sky.money/' },
  { name: 'sUSDS', url: 'https://docs.sky.money/' },
  { name: 'crvUSD', url: 'https://docs.curve.fi/crvUSD/overview/' },
  { name: 'XAUt', url: 'https://gold.tether.to/' },
  { name: 'USDT0', url: 'https://tether.to/en/transparency/' },
  { name: 'LGNS', url: 'https://docs.orionprotocol.io/' },
];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WhitepaperGrey/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function callAnthropic(text: string, name: string, retries = 2): Promise<{ claims: any[]; input: number; output: number }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: 'Extract testable claims from crypto whitepapers. Categories: TOKENOMICS, PERFORMANCE, CONSENSUS, SCIENTIFIC. For each: category, claimText, statedEvidence, regulatoryRelevance (boolean).',
        messages: [{ role: 'user', content: `Extract claims from ${name}:\n\n${text.slice(0, 50000)}` }],
        tools: [{
          name: 'extract_claims',
          description: 'Extract claims',
          input_schema: {
            type: 'object',
            properties: { claims: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, claimText: { type: 'string' }, statedEvidence: { type: 'string' }, regulatoryRelevance: { type: 'boolean' } }, required: ['category', 'claimText'] } } },
            required: ['claims'],
          },
        }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const body = await res.text();
      if (attempt < retries && (body.includes('rate_limit') || body.includes('429'))) {
        console.log(`    ⏳ Rate limited — waiting 65s (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 65000));
        continue;
      }
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const toolBlock = data.content.find((b: any) => b.type === 'tool_use');
    return {
      claims: (toolBlock?.input?.claims ?? []).filter((c: any) => c.claimText?.length > 0),
      input: data.usage.input_tokens,
      output: data.usage.output_tokens,
    };
  }
  return { claims: [], input: 0, output: 0 };
}

async function main() {
  console.log(`\n=== Seed L2 — Claim Extraction for ${L2_TARGETS.length} tokens ===\n`);

  let success = 0;
  let totalCost = 0;

  for (const target of L2_TARGETS) {
    // Find in DB
    const rows = await sql`SELECT id FROM autognostic.wpv_whitepapers WHERE project_name = ${target.name} LIMIT 1`;
    if (rows.length === 0) { console.log(`${target.name}: not in DB, skipping`); continue; }
    const wpId = rows[0].id as string;

    // Check if already has claims
    const existing = await sql`SELECT count(*)::int as cnt FROM autognostic.wpv_claims WHERE whitepaper_id = ${wpId}`;
    if (Number(existing[0].cnt) > 0) { console.log(`${target.name}: already has ${existing[0].cnt} claims, skipping`); continue; }

    console.log(`${target.name}: fetching ${target.url}`);

    try {
      const text = await fetchText(target.url);
      if (text.length < 500) { console.log(`  → Only ${text.length} chars, skipping L2`); continue; }

      console.log(`  → ${text.length} chars, running L2...`);
      const result = await callAnthropic(text, target.name);
      const cost = result.input * 3 / 1e6 + result.output * 15 / 1e6;
      totalCost += cost;

      // Store claims
      for (const c of result.claims) {
        await sql`INSERT INTO autognostic.wpv_claims (whitepaper_id, category, claim_text, stated_evidence, source_section, math_proof_present, evaluation_json)
          VALUES (${wpId}, ${c.category ?? 'SCIENTIFIC'}, ${c.claimText}, ${c.statedEvidence ?? ''}, ${''}, false, ${c.regulatoryRelevance ? '{"regulatoryRelevance":true}' : null}::jsonb)`;
      }

      // Update verification
      await sql`UPDATE autognostic.wpv_verifications SET
        total_claims = ${result.claims.length},
        llm_tokens_used = ${result.input + result.output},
        compute_cost_usd = ${cost},
        l2_input_tokens = ${result.input},
        l2_output_tokens = ${result.output},
        l2_cost_usd = ${cost},
        verdict = ${result.claims.length >= 3 ? 'CONDITIONAL' : 'INSUFFICIENT_DATA'}
        WHERE whitepaper_id = ${wpId}`;

      await sql`UPDATE autognostic.wpv_whitepapers SET status = 'VERIFIED' WHERE id = ${wpId}`;

      success++;
      console.log(`  ✓ ${result.claims.length} claims | $${cost.toFixed(4)} | ${result.input}/${result.output} tokens`);
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n=== Done: ${success}/${L2_TARGETS.length} | Cost: $${totalCost.toFixed(4)} ===`);
  await sql.end();
}

main().catch(e => { console.error(e); sql.end(); });
