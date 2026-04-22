// ════════════════════════════════════════════
// WPV Database Schema — Drizzle ORM
// Three tables: wpv_whitepapers, wpv_claims, wpv_verifications
// Lives in the autognostic schema alongside existing tables.
// ════════════════════════════════════════════

import {
  pgSchema,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  real,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

// Reuse the autognostic schema namespace
const autognostic = pgSchema('autognostic');

// ── wpv_whitepapers ──────────────────────────

export const wpvWhitepapers = autognostic.table('wpv_whitepapers', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectName: text('project_name').notNull(),
  tokenAddress: text('token_address'),
  chain: text('chain').notNull().default('base'),
  documentUrl: text('document_url').notNull(),
  ipfsCid: text('ipfs_cid'),
  knowledgeItemId: text('knowledge_item_id'),
  pageCount: integer('page_count').notNull().default(0),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull().default('DISCOVERED'),
  selectionScore: real('selection_score').notNull().default(0),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
}, (table) => ({
  projectChainIdx: index('wpv_wp_project_chain_idx').on(table.projectName, table.chain),
  statusIdx: index('wpv_wp_status_idx').on(table.status),
  tokenAddressIdx: index('wpv_wp_token_address_idx').on(table.tokenAddress),
}));

export type WpvWhitepaperRow = typeof wpvWhitepapers.$inferSelect;
export type WpvWhitepaperInsert = typeof wpvWhitepapers.$inferInsert;

// ── wpv_claims ───────────────────────────────

export const wpvClaims = autognostic.table('wpv_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  whitepaperId: uuid('whitepaper_id').notNull()
    .references(() => wpvWhitepapers.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),          // ClaimCategory enum value
  claimText: text('claim_text').notNull(),
  statedEvidence: text('stated_evidence').notNull().default(''),
  sourceSection: text('source_section').notNull().default(''),
  mathProofPresent: boolean('math_proof_present').notNull().default(false),
  evaluationJson: jsonb('evaluation_json').$type<Record<string, unknown>>(),
  claimScore: real('claim_score'),               // 0–100
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
}, (table) => ({
  whitepaperIdIdx: index('wpv_claims_wp_id_idx').on(table.whitepaperId),
  categoryIdx: index('wpv_claims_category_idx').on(table.category),
}));

export type WpvClaimRow = typeof wpvClaims.$inferSelect;
export type WpvClaimInsert = typeof wpvClaims.$inferInsert;

// ── wpv_verifications ────────────────────────

export const wpvVerifications = autognostic.table('wpv_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  whitepaperId: uuid('whitepaper_id').notNull()
    .references(() => wpvWhitepapers.id, { onDelete: 'cascade' }),
  structuralAnalysisJson: jsonb('structural_analysis_json').$type<Record<string, unknown>>(),
  structuralScore: real('structural_score'),     // 1–5
  confidenceScore: real('confidence_score'),     // 1–100
  hypeTechRatio: real('hype_tech_ratio'),
  verdict: text('verdict'),                      // Verdict enum value
  focusAreaScores: jsonb('focus_area_scores').$type<Record<string, number | null>>(),
  totalClaims: integer('total_claims').notNull().default(0),
  verifiedClaims: integer('verified_claims').notNull().default(0),
  reportJson: jsonb('report_json').$type<Record<string, unknown>>(),
  llmTokensUsed: integer('llm_tokens_used').notNull().default(0),
  computeCostUsd: real('compute_cost_usd').notNull().default(0),
  triggerSource: text('trigger_source'),
  cacheHit: boolean('cache_hit').default(false),
  l2InputTokens: integer('l2_input_tokens').default(0),
  l2OutputTokens: integer('l2_output_tokens').default(0),
  l2CostUsd: real('l2_cost_usd').default(0),
  l2DurationMs: integer('l2_duration_ms').default(0),
  l3InputTokens: integer('l3_input_tokens').default(0),
  l3OutputTokens: integer('l3_output_tokens').default(0),
  l3CostUsd: real('l3_cost_usd').default(0),
  l3DurationMs: integer('l3_duration_ms').default(0),
  l1DurationMs: integer('l1_duration_ms').default(0),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  whitepaperIdIdx: index('wpv_verif_wp_id_idx').on(table.whitepaperId),
  verdictIdx: index('wpv_verif_verdict_idx').on(table.verdict),
}));

export type WpvVerificationRow = typeof wpvVerifications.$inferSelect;
export type WpvVerificationInsert = typeof wpvVerifications.$inferInsert;
