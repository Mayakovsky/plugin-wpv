#!/usr/bin/env bun
/**
 * Seed Ingestion Script — Process OG token seed list
 *
 * Runs on the VPS. Searches for whitepapers, runs L1 structural analysis,
 * stores results in Supabase, then runs L2 claim extraction on tokens
 * with substantial documentation.
 *
 * Usage: cd /opt/grey/plugin-wpv && bun run scripts/seedIngest.ts
 * Reads .env from /opt/grey/wpv-agent/.env
 */

import { StructuralAnalyzer } from '../src/verification/StructuralAnalyzer';
import { WebSearchFallback } from '../src/discovery/WebSearchFallback';
import * as fs from 'fs';
import * as path from 'path';

// ── Load .env from wpv-agent ──────────────────────────────

function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, '../../wpv-agent/.env'),
    path.resolve(__dirname, '../.env'),
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
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

if (!DATABASE_URL) {
  console.error('Missing WPV_DATABASE_URL');
  process.exit(1);
}

// ── PostgreSQL direct connection ──────────────────────────

import postgres from 'postgres';
const sql = postgres(DATABASE_URL);

async function dbInsertWhitepaper(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rows = await sql`
    INSERT INTO autognostic.wpv_whitepapers (
      project_name, token_address, chain, document_url,
      page_count, status, selection_score, metadata_json
    ) VALUES (
      ${data.project_name as string}, ${data.token_address as string},
      ${data.chain as string}, ${data.document_url as string},
      ${data.page_count as number}, ${data.status as string},
      ${data.selection_score as number}, ${JSON.stringify(data.metadata_json)}::jsonb
    ) RETURNING *
  `;
  return rows[0] as Record<string, unknown>;
}

async function dbInsertVerification(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rows = await sql`
    INSERT INTO autognostic.wpv_verifications (
      whitepaper_id, structural_score, hype_tech_ratio, verdict,
      total_claims, verified_claims, llm_tokens_used, compute_cost_usd,
      trigger_source, cache_hit, l1_duration_ms, structural_analysis_json
    ) VALUES (
      ${data.whitepaper_id as string}, ${data.structural_score as number},
      ${data.hype_tech_ratio as number}, ${data.verdict as string},
      ${data.total_claims as number}, ${data.verified_claims as number},
      ${data.llm_tokens_used as number}, ${data.compute_cost_usd as number},
      ${data.trigger_source as string}, ${data.cache_hit as boolean},
      ${data.l1_duration_ms as number},
      ${JSON.stringify(data.structural_analysis_json)}::jsonb
    ) RETURNING *
  `;
  return rows[0] as Record<string, unknown>;
}

async function dbInsertClaim(data: Record<string, unknown>): Promise<void> {
  await sql`
    INSERT INTO autognostic.wpv_claims (
      whitepaper_id, category, claim_text, stated_evidence,
      source_section, math_proof_present, evaluation_json
    ) VALUES (
      ${data.whitepaper_id as string}, ${data.category as string},
      ${data.claim_text as string}, ${data.stated_evidence as string},
      ${data.source_section as string}, ${data.math_proof_present as boolean},
      ${data.evaluation_json ? JSON.stringify(data.evaluation_json) : null}::jsonb
    )
  `;
}

async function dbSelectByAddress(address: string): Promise<Record<string, unknown>[]> {
  return sql`SELECT id FROM autognostic.wpv_whitepapers WHERE token_address = ${address} LIMIT 1` as unknown as Record<string, unknown>[];
}

async function dbUpdateVerification(wpId: string, data: Record<string, unknown>): Promise<void> {
  await sql`
    UPDATE autognostic.wpv_verifications SET
      total_claims = ${data.total_claims as number},
      llm_tokens_used = ${data.llm_tokens_used as number},
      compute_cost_usd = ${data.compute_cost_usd as number},
      l2_input_tokens = ${data.l2_input_tokens as number},
      l2_output_tokens = ${data.l2_output_tokens as number},
      l2_cost_usd = ${data.l2_cost_usd as number},
      verdict = ${data.verdict as string}
    WHERE whitepaper_id = ${wpId}
  `;
}

async function dbUpdateWhitepaperStatus(wpId: string, status: string): Promise<void> {
  await sql`UPDATE autognostic.wpv_whitepapers SET status = ${status} WHERE id = ${wpId}`;
}

// ── Anthropic API helper (L2 claim extraction) ────────────

async function extractClaimsViaApi(text: string, projectName: string, maxRetries = 2): Promise<{
  claims: Array<{ category: string; claimText: string; statedEvidence: string; regulatoryRelevance: boolean }>;
  inputTokens: number;
  outputTokens: number;
}> {
  if (!ANTHROPIC_KEY) throw new Error('No ANTHROPIC_API_KEY');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await _callAnthropicApi(text, projectName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && (msg.includes('429') || msg.includes('rate_limit'))) {
        const waitSec = 65;
        console.log(`    ⏳ Rate limited — waiting ${waitSec}s before retry (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
  return { claims: [], inputTokens: 0, outputTokens: 0 };
}

async function _callAnthropicApi(text: string, projectName: string): Promise<{
  claims: Array<{ category: string; claimText: string; statedEvidence: string; regulatoryRelevance: boolean }>;
  inputTokens: number;
  outputTokens: number;
}> {

  const systemPrompt = `You are a scientific claim extractor for cryptocurrency and DeFi whitepapers.
Extract all testable claims. Categorize as: TOKENOMICS, PERFORMANCE, CONSENSUS, SCIENTIFIC.
For each claim extract: category, claimText, statedEvidence, mathematicalProofPresent, sourceSection, regulatoryRelevance (true if related to MiCA/EU regulation/KYC/compliance).`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Extract testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}` }],
      tools: [{
        name: 'extract_claims',
        description: 'Extract testable claims from the whitepaper',
        input_schema: {
          type: 'object',
          properties: {
            claims: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string', enum: ['TOKENOMICS', 'PERFORMANCE', 'CONSENSUS', 'SCIENTIFIC'] },
                  claimText: { type: 'string' },
                  statedEvidence: { type: 'string' },
                  mathematicalProofPresent: { type: 'boolean' },
                  sourceSection: { type: 'string' },
                  regulatoryRelevance: { type: 'boolean' },
                },
                required: ['category', 'claimText', 'statedEvidence', 'regulatoryRelevance'],
              },
            },
          },
          required: ['claims'],
        },
      }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${body.slice(0, 200)}`);
  }

  const response = await res.json() as {
    content: Array<{ type: string; input?: { claims?: unknown[] } }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  const claims = (toolBlock?.input?.claims ?? []) as Array<{
    category: string; claimText: string; statedEvidence: string; regulatoryRelevance: boolean;
  }>;

  return {
    claims: claims.filter((c) => c.claimText?.length > 0),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ── Seed Token List ───────────────────────────────────────

interface SeedToken {
  name: string;
  chain: string;
  address: string;
  description: string;
}

const SEED_TOKENS: SeedToken[] = [
  { name: 'KAT', chain: 'BNB', address: '0x366bdb034443ea8c09d7e331eaf0ca2e6a9e1926', description: 'High volume/activity; potential rumors.' },
  { name: 'quq', chain: 'BNB', address: '0x4fa7c69a7b69f8bc48233024d546bc299d6b03bf', description: 'Large transaction spike; coordinated trading.' },
  { name: 'SKILL', chain: 'BNB', address: '0xb36ac76567fa409fb511802e12adc30aa9e3ed2c', description: 'Gaming/NFT collaborations.' },
  { name: 'KAT (Alt)', chain: 'BNB', address: '0xe85711e63816dc2c46eb46b2e18129b822533c75', description: 'Resurgence in interest; multiple listings.' },
  { name: 'USDS', chain: 'Ethereum', address: '0xdc035d45d973e3ec169d2276ddab16f1e407384f', description: 'Stablecoin usage up due to volatility.' },
  { name: 'DAI', chain: 'Polygon', address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', description: 'High transaction count in DeFi sectors.' },
  { name: 'SFA', chain: 'BNB', address: '0x82d4d6d2c13c52ff38c5b416b40011377aa44444', description: 'High volume/low transactions; significant whale movement.' },
  { name: 'SH', chain: 'BNB', address: '0xda8d7b5f298ecaf396d6b8602ecbf8169002ee84', description: 'Concentrated trades by few participants.' },
  { name: 'USDS (Base)', chain: 'Base', address: '0x820c137fa70c8691f0e44dc420a5e53c168921dc', description: 'Growing interest in alternative stablecoins on Base.' },
  { name: 'PYUSD', chain: 'Ethereum', address: '0x6c3ea9036406852006290770bedfcaba0e23a0e8', description: 'New stablecoin driving interest via partnerships.' },
  { name: 'BTCB', chain: 'BNB', address: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', description: 'Market interest in Bitcoin-backed tokens.' },
  { name: 'LGNS', chain: 'Polygon', address: '0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01', description: 'Adoption in gaming/metaverse projects.' },
  { name: 'MGO', chain: 'BNB', address: '0x5e0d6791edbeeba6a14d1d38e2b8233257118eb1', description: 'Speculation on new features/updates.' },
  { name: 'Sigma', chain: 'BNB', address: '0x3f8ceda577b8b0b52f45a265545c001373f59bb5', description: 'Moderately high transactions; ongoing trading.' },
  { name: 'WMTX', chain: 'BNB', address: '0xdbb5cf12408a3ac17d668037ce289f9ea75439d7', description: 'Niche usage or coordinated trading interest.' },
  { name: 'KOGE', chain: 'BNB', address: '0xe6df05ce8c8301223373cf5b969afcb1498c5528', description: 'Social media hype or user influx.' },
  { name: 'FF', chain: 'BNB', address: '0xac23b90a79504865d52b49b327328411a23d4db2', description: 'High transaction count; community-focused.' },
  { name: 'sUSDS', chain: 'Ethereum', address: '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd', description: 'Synthetic stablecoin interest growth.' },
  { name: 'USD1', chain: 'BNB', address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', description: 'High transaction count; utility in transactions.' },
  { name: 'crvUSD', chain: 'Ethereum', address: '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e', description: 'Linked to yield farming or incentives.' },
  { name: '7AΩ∞', chain: 'Ethereum', address: '0x622b6330f226bf08427dcad49c9ea9694604bf2d', description: 'Targeted marketing campaign (limited transactions).' },
  { name: 'XAUt', chain: 'Ethereum', address: '0x68749665ff8d2d112fa859aa293f07a622782f38', description: 'Gold-backed token interest as a market hedge.' },
  { name: 'BSB', chain: 'BNB', address: '0x595deaad1eb5476ff1e649fdb7efc36f1e4679cc', description: 'Increased usage in niche trading strategies.' },
  { name: 'USDT0', chain: 'Polygon', address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', description: 'Popularity of Tether on cost-effective chains.' },
  // Wave 2: Base + ETH tokens from Butler intelligence (2026-03-21)
  { name: 'AXOBOTL', chain: 'Base', address: '0x810affc8aadad2824c65e0a2c5ef96ef1de42ba3', description: 'Top Momentum: +322% price change; strong buy signal.' },
  { name: 'BLUEAGENT', chain: 'Base', address: '0xf895783b2931c919955e18b5e3343e7c7c456ba3', description: 'Top Momentum: +156% price change; strong buy signal.' },
  { name: 'LUKSO', chain: 'Base', address: '0x81040cfd2bb62062525d958ad01931988a590b07', description: 'High volatility; heightened selling pressure.' },
  { name: 'KTA', chain: 'Base', address: '0xc0634090f2fe6c6d75e61be2b949464abb498973', description: 'Consistent buy momentum; price breakout.' },
  { name: 'VVV', chain: 'Base', address: '0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf', description: 'Organic price breakout; steady trend.' },
  { name: 'MOLT', chain: 'Base', address: '0xb695559b26bb2c9703ef1935c37aeae9526bab07', description: 'Heightened selling; potential entry or avoid.' },
  { name: 'ODAI', chain: 'Base', address: '0x0086cff0c1e5d17b19f5bcd4c8840a5b4251d959', description: 'Price pullback; retail cooling off.' },
  { name: 'ROBOTMONEY', chain: 'Base', address: '0x65021a79aeef22b17cdc1b768f5e79a8618beba3', description: 'Pullback after recent activity.' },
  { name: 'RARI', chain: 'Ethereum', address: '0xfca59cd816ab1ead66534d82bc21e7515ce441cf', description: 'Narrative breakout (Impossible Finance acquisition).' },
  { name: 'CULT', chain: 'Ethereum', address: '0xf0f9d895aca5c8678f706fb8216fa22957685a13', description: 'Social "Cult" narrative; high concentration.' },
];

const KNOWN_WHITEPAPERS: Record<string, string> = {
  'DAI': 'https://makerdao.com/en/whitepaper/',
  'PYUSD': 'https://www.paypal.com/us/digital-wallet/manage-money/crypto/pyusd',
  'BTCB': 'https://bitcoin.org/bitcoin.pdf',
  'crvUSD': 'https://docs.curve.fi/crvUSD/overview/',
  'sUSDS': 'https://docs.sky.money/',
  'USDS': 'https://docs.sky.money/',
  'XAUt': 'https://gold.tether.to/',
  'USDT0': 'https://tether.to/en/transparency/',
  'USD1': 'https://docs.worldlibertyfinancial.com/',
  'SKILL': 'https://docs.cryptoblades.io/',
  'LGNS': 'https://docs.orionprotocol.io/',
  'LUKSO': 'https://docs.lukso.tech/',
  'RARI': 'https://docs.rarible.org/',
  'CULT': 'https://cultdao.io/',
  'VVV': 'https://docs.vvv.money/',
};

// ── L2 threshold: only run LLM extraction on tokens with enough text ──
const L2_MIN_TEXT_LENGTH = 2000;

// ── Main pipeline ─────────────────────────────────────────

const analyzer = new StructuralAnalyzer();
const webSearch = new WebSearchFallback();

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WhitepaperGrey/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log(`\n=== Grey Seed Ingestion — ${SEED_TOKENS.length} tokens ===`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^@]+@/, ':***@')}`);
  console.log(`Anthropic: ${ANTHROPIC_KEY ? 'configured' : 'MISSING'}\n`);

  // ── Step 0: Test database connection ──
  console.log('Testing database connection...');
  try {
    const rows = await sql`SELECT count(*) as cnt FROM autognostic.wpv_whitepapers`;
    console.log(`  ✓ Connected. Existing whitepaper records: ${rows[0].cnt}\n`);
  } catch (err) {
    console.error(`  ✗ Database connection failed: ${err}`);
    process.exit(1);
  }

  // ── Phase 1: L1 Structural Analysis + Supabase storage ──
  console.log('=== Phase 1: L1 Structural Analysis + Supabase Storage ===\n');

  const l2Candidates: Array<{
    wpId: string; name: string; text: string; structuralScore: number;
    analysis: Record<string, unknown>;
  }> = [];

  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < SEED_TOKENS.length; i++) {
    const token = SEED_TOKENS[i];
    console.log(`[${i + 1}/${SEED_TOKENS.length}] ${token.name} (${token.chain})`);

    try {
      // Check if already in DB with verification
      const existing = await dbSelectByAddress(token.address);
      if (existing.length > 0) {
        const hasVerification = await sql`SELECT id FROM autognostic.wpv_verifications WHERE whitepaper_id = ${existing[0].id as string} LIMIT 1`;
        if (hasVerification.length > 0) {
          console.log(`  → Already verified (${existing[0].id}), skipping`);
          skipped++;
          continue;
        }
        console.log(`  → In DB but missing verification — re-processing`);
      }

      // Find whitepaper text
      let text = '';
      let documentUrl: string | null = null;
      let documentSource = 'composed';

      // Try known URL first
      const knownUrl = KNOWN_WHITEPAPERS[token.name];
      if (knownUrl) {
        try {
          text = await fetchText(knownUrl);
          if (text.length > 200) {
            documentUrl = knownUrl;
            documentSource = knownUrl.endsWith('.pdf') ? 'pdf' : 'docs_site';
          }
        } catch { /* fall through */ }
      }

      // Web search fallback
      if (text.length < 200) {
        try {
          const url = await webSearch.searchWhitepaper(token.name);
          if (url) {
            const searchText = await fetchText(url);
            if (searchText.length > text.length) {
              text = searchText;
              documentUrl = url;
              documentSource = url.endsWith('.pdf') ? 'pdf' : 'docs_site';
            }
          }
        } catch { /* fall through */ }
      }

      // Compose if nothing found
      if (text.length < 200) {
        text = [
          `# ${token.name} — Composed Verification Document`,
          `> No standalone whitepaper found. Composed from available data.`,
          `## Token Information`,
          `**Name:** ${token.name}  **Chain:** ${token.chain}  **Address:** ${token.address}`,
          `## Market Context`,
          token.description,
          `## Analysis Note`,
          `Included in Genesis Database seed list based on trending volume and investigative traffic.`,
        ].join('\n');
        documentSource = 'composed';
        documentUrl = null;
      }

      // L1 Structural Analysis
      const pageCount = Math.max(1, Math.ceil(text.length / 3000));
      const analysis = await analyzer.analyze(text, pageCount);
      const structuralScore = analyzer.computeQuickFilterScore(analysis);
      const hypeTechRatio = analyzer.computeHypeTechRatio(text);

      // Store whitepaper in Supabase (or use existing)
      let wpRow: Record<string, unknown>;
      if (existing.length > 0) {
        wpRow = existing[0];
      } else {
        wpRow = await dbInsertWhitepaper({
          project_name: token.name,
          token_address: token.address,
          chain: token.chain.toLowerCase(),
          document_url: documentUrl ?? `composed://${token.address}`,
          page_count: pageCount,
          status: 'INGESTED',
          selection_score: structuralScore,
          metadata_json: {
            description: token.description,
            documentSource,
            triggerSource: 'seed',
            textFingerprint: text.slice(0, 2000),
            textLength: text.length,
          },
        });
      }

      // Store L1 verification
      await dbInsertVerification({
        whitepaper_id: wpRow.id,
        structural_score: structuralScore,
        hype_tech_ratio: hypeTechRatio,
        verdict: structuralScore >= 3 ? 'CONDITIONAL' : 'INSUFFICIENT_DATA',
        total_claims: 0,
        verified_claims: 0,
        llm_tokens_used: 0,
        compute_cost_usd: 0,
        trigger_source: 'seed',
        cache_hit: false,
        l1_duration_ms: 0,
        structural_analysis_json: analysis as unknown as Record<string, unknown>,
      });

      stored++;
      console.log(`  ✓ Stored | ${documentSource} | score: ${structuralScore}/5 | hype: ${hypeTechRatio === Infinity ? '∞' : hypeTechRatio.toFixed(2)} | MiCA: ${analysis.mica.micaCompliant} | ${text.length} chars`);

      // Queue for L2 if enough text
      if (text.length >= L2_MIN_TEXT_LENGTH) {
        l2Candidates.push({
          wpId: wpRow.id as string,
          name: token.name,
          text,
          structuralScore,
          analysis: analysis as unknown as Record<string, unknown>,
        });
      }
    } catch (err) {
      errors++;
      console.log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nPhase 1 complete: ${stored} stored, ${skipped} skipped, ${errors} errors`);

  // ── Phase 2: L2 Claim Extraction on candidates with real docs ──
  if (l2Candidates.length === 0) {
    console.log('\nNo tokens qualify for L2 (need ≥2000 chars). Done.');
    return;
  }

  if (!ANTHROPIC_KEY) {
    console.log(`\n${l2Candidates.length} tokens qualify for L2 but ANTHROPIC_API_KEY is missing. Skipping L2.`);
    return;
  }

  console.log(`\n=== Phase 2: L2 Claim Extraction (${l2Candidates.length} tokens) ===`);
  console.log(`Estimated cost: ~$${(l2Candidates.length * 0.30).toFixed(2)}–$${(l2Candidates.length * 0.50).toFixed(2)}\n`);

  let l2Success = 0;
  let l2TotalCost = 0;

  for (let i = 0; i < l2Candidates.length; i++) {
    const candidate = l2Candidates[i];
    console.log(`[${i + 1}/${l2Candidates.length}] ${candidate.name} (${candidate.text.length} chars)`);

    try {
      const result = await extractClaimsViaApi(candidate.text, candidate.name);
      const inputCost = result.inputTokens * 3.0 / 1_000_000;
      const outputCost = result.outputTokens * 15.0 / 1_000_000;
      const totalCost = inputCost + outputCost;
      l2TotalCost += totalCost;

      // Store claims
      for (let j = 0; j < result.claims.length; j++) {
        const claim = result.claims[j];
        await dbInsertClaim({
          whitepaper_id: candidate.wpId,
          category: claim.category,
          claim_text: claim.claimText,
          stated_evidence: claim.statedEvidence || '',
          source_section: '',
          math_proof_present: false,
          evaluation_json: claim.regulatoryRelevance ? { regulatoryRelevance: true } : null,
        });
      }

      // Update verification with L2 data
      await dbUpdateVerification(candidate.wpId, {
        total_claims: result.claims.length,
        llm_tokens_used: result.inputTokens + result.outputTokens,
        compute_cost_usd: totalCost,
        l2_input_tokens: result.inputTokens,
        l2_output_tokens: result.outputTokens,
        l2_cost_usd: totalCost,
        verdict: result.claims.length >= 3 ? 'CONDITIONAL' : 'INSUFFICIENT_DATA',
      });

      // Update whitepaper status
      await dbUpdateWhitepaperStatus(candidate.wpId, 'VERIFIED');

      l2Success++;
      console.log(`  ✓ ${result.claims.length} claims | $${totalCost.toFixed(4)} | ${result.inputTokens}/${result.outputTokens} tokens`);
    } catch (err) {
      console.log(`  ✗ L2 error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nPhase 2 complete: ${l2Success}/${l2Candidates.length} | Total L2 cost: $${l2TotalCost.toFixed(4)}`);

  // ── Final summary ──
  console.log(`\n=== Seed Ingestion Complete ===`);
  console.log(`Phase 1: ${stored} tokens stored in Supabase (L1 structural)`);
  console.log(`Phase 2: ${l2Success} tokens with L2 claim extraction`);
  console.log(`Total API cost: $${l2TotalCost.toFixed(4)}`);
  console.log(`Skipped: ${skipped} (already in DB)`);
  console.log(`Errors: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
}).finally(() => sql.end());
