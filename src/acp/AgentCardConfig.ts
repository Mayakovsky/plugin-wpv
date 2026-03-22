// ════════════════════════════════════════════
// WS-C2: AgentCardConfig
// Static config for the WPV Agent Card — name, role, offerings, resources.
// Includes ACP v2 Deliverable Requirements schemas for evaluation.
// ════════════════════════════════════════════

import type { OfferingId, ResourceId } from '../types';

// ── Field Specification for ACP Deliverable Requirements ──

export interface FieldSpec {
  path: string;
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  enum_values?: string[];
  min?: number;
  max?: number;
  required: boolean;
  nullable?: boolean;
}

export interface DeliverableSpec {
  offering_id: string;
  required_fields: FieldSpec[];
  max_response_time_ms: number;
  inherits_from?: string;
}

// ── Agent Card ────────────────────────────────────────────

export const AGENT_CARD = {
  name: 'Whitepaper Grey',
  role: 'Provider / Evaluator',
  category: 'Research & Verification',
  shortDescription: 'Grey — Autonomous Whitepaper Verifier. Scam detection, MiCA compliance, and math proof for DeFi.',
  fullDescription:
    'Whitepaper Grey is the ecosystem\'s first autonomous Verification Layer specializing in mathematical proof validation, tokenomics auditing, MiCA compliance checking, and scientific verification for emerging protocols.\n\n' +
    'Built on deep scientific analysis infrastructure with access to Crossref, Semantic Scholar, and Unpaywall academic databases, Grey identifies structural risks, whitepaper inconsistencies, regulatory non-compliance, and unsustainable yield models before they impact your treasury.\n\n' +
    'Free Resources — No Job Required: Browse our Daily Greenlight List for today\'s verified projects. Check the Scam Alert Feed for flagged high-risk projects.\n\n' +
    'Core Capabilities: Whitepaper Verification — Claim extraction and evaluation against on-chain reality and published scientific literature. MiCA Compliance — Checks EU Markets in Crypto-Assets Regulation requirements for every whitepaper. Tokenomics Auditing — Mathematical sanity checks on yield projections, emission schedules, and economic models. Technical Assessment — Protocol review, consensus logic evaluation, and due diligence for DeFi, Cross-Chain, and Treasury agents. Scientific Credibility Scoring — Hype vs. Tech ratio, citation verification, plagiarism detection, and structural analysis for any project PDF or URL.\n\n' +
    'Designed for Autonomous Hedge Fund clusters, Treasury Management agents, Risk Assessment pipelines, and Butler users asking "Is this project a scam?", "Is the whitepaper math real?", "Is this MiCA compliant?", and "Check this project\'s tokenomics."\n\n' +
    'Returns structured JSON. Sub-2-second response on cached verifications. On-demand verification of any whitepaper URL for $2.00 USDC.',
  capabilities: [
    'whitepaper_verification',
    'tokenomics_audit',
    'mathematical_proof',
    'scam_detection',
    'technical_audit',
    'scientific_analysis',
    'due_diligence',
    'protocol_review',
    'claim_verification',
    'mica_compliance',
  ],
} as const;

// ── Deliverable Schemas (ACP v2 Evaluation Specs) ─────────
// Defined before OFFERINGS since they are referenced in the offering configs.

const LEGITIMACY_SCAN_FIELDS: FieldSpec[] = [
  { path: 'structuralScore', type: 'number', min: 1, max: 5, required: true },
  { path: 'hypeTechRatio', type: 'number', min: 0, required: true },
  { path: 'claimCount', type: 'number', min: 0, required: true },
  { path: 'claimsMicaCompliance', type: 'string', enum_values: ['YES', 'NO', 'NOT_MENTIONED'], required: true },
  { path: 'micaCompliant', type: 'string', enum_values: ['YES', 'NO', 'PARTIAL', 'NOT_APPLICABLE'], required: true },
  { path: 'micaSummary', type: 'string', required: true },
  { path: 'generatedAt', type: 'string', required: true },
  { path: 'projectName', type: 'string', required: true },
  { path: 'verdict', type: 'string', enum_values: ['PASS', 'CONDITIONAL', 'FAIL', 'INSUFFICIENT_DATA'], required: true },
];

const LEGITIMACY_SCAN_SPEC: DeliverableSpec = {
  offering_id: 'project_legitimacy_scan',
  max_response_time_ms: 2000,
  required_fields: LEGITIMACY_SCAN_FIELDS,
};

const TOKENOMICS_AUDIT_SPEC: DeliverableSpec = {
  offering_id: 'tokenomics_sustainability_audit',
  max_response_time_ms: 2000,
  inherits_from: 'project_legitimacy_scan',
  required_fields: [
    ...LEGITIMACY_SCAN_FIELDS,
    { path: 'claims', type: 'array', required: true },
    { path: 'logicSummary', type: 'string', required: true },
  ],
};

const VERIFY_WHITEPAPER_SPEC: DeliverableSpec = {
  offering_id: 'verify_project_whitepaper',
  max_response_time_ms: 2000,
  inherits_from: 'tokenomics_sustainability_audit',
  required_fields: [
    ...TOKENOMICS_AUDIT_SPEC.required_fields,
    { path: 'tokenAddress', type: 'string', required: true, nullable: true },
  ],
};

const FULL_VERIFICATION_SPEC: DeliverableSpec = {
  offering_id: 'full_technical_verification',
  max_response_time_ms: 2000,
  inherits_from: 'verify_project_whitepaper',
  required_fields: [
    ...VERIFY_WHITEPAPER_SPEC.required_fields,
    { path: 'confidenceScore', type: 'number', min: 0, max: 100, required: true },
    { path: 'focusAreaScores', type: 'object', required: true },
    { path: 'evaluations', type: 'array', required: true },
    { path: 'llmTokensUsed', type: 'number', min: 0, required: true },
    { path: 'computeCostUsd', type: 'number', min: 0, required: true },
  ],
};

const DAILY_BRIEFING_SPEC: DeliverableSpec = {
  offering_id: 'daily_technical_briefing',
  max_response_time_ms: 5000,
  required_fields: [
    { path: 'date', type: 'string', required: true },
    { path: 'totalVerified', type: 'number', min: 0, required: true },
    { path: 'whitepapers', type: 'array', required: true },
  ],
};

const GREENLIGHT_SPEC: DeliverableSpec = {
  offering_id: 'daily_greenlight_list',
  max_response_time_ms: 2000,
  required_fields: [
    { path: 'date', type: 'string', required: true },
    { path: 'totalVerified', type: 'number', min: 0, required: true },
    { path: 'projects', type: 'array', required: true },
  ],
};

const SCAM_ALERT_SPEC: DeliverableSpec = {
  offering_id: 'scam_alert_feed',
  max_response_time_ms: 2000,
  required_fields: [
    { path: 'date', type: 'string', required: true },
    { path: 'flagged', type: 'array', required: true },
  ],
};

// Export specs for Test Evaluator
export const DELIVERABLE_SPECS: Record<string, DeliverableSpec> = {
  project_legitimacy_scan: LEGITIMACY_SCAN_SPEC,
  tokenomics_sustainability_audit: TOKENOMICS_AUDIT_SPEC,
  verify_project_whitepaper: VERIFY_WHITEPAPER_SPEC,
  full_technical_verification: FULL_VERIFICATION_SPEC,
  daily_technical_briefing: DAILY_BRIEFING_SPEC,
  daily_greenlight_list: GREENLIGHT_SPEC,
  scam_alert_feed: SCAM_ALERT_SPEC,
};

// ── Offerings ─────────────────────────────────────────────

export interface OfferingConfig {
  id: OfferingId;
  displayName: string;
  price: number;
  description: string;
  inputSchema: Record<string, unknown>;
  deliverableSchema: DeliverableSpec;
}

export const OFFERINGS: OfferingConfig[] = [
  {
    id: 'project_legitimacy_scan',
    displayName: 'Project Legitimacy Scan',
    price: 0.25,
    description: 'Returns JSON with: structural_score (1-5), hype_tech_ratio (float), mica_compliance object (claims_mica_compliance, mica_compliant, mica_summary), section_count, citation_count, document_source. Cached results in under 2 seconds. Live analysis for uncached projects may take 30-60 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        token_address: { type: 'string' },
      },
    },
    deliverableSchema: LEGITIMACY_SCAN_SPEC,
  },
  {
    id: 'tokenomics_sustainability_audit',
    displayName: 'Tokenomics Sustainability Audit',
    price: 1.50,
    description: 'Returns JSON with: L1 structural analysis + L2 claim extraction. Includes categorized claims array (TOKENOMICS, PERFORMANCE, CONSENSUS, SCIENTIFIC) with claim_text, stated_evidence, and claim_score for each. MiCA compliance included. Cached results in under 2 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        token_address: { type: 'string' },
      },
    },
    deliverableSchema: TOKENOMICS_AUDIT_SPEC,
  },
  {
    id: 'verify_project_whitepaper',
    displayName: 'Verify Project Whitepaper',
    price: 2.00,
    description: 'Accepts project_name, token_address, or document_url. Returns L1+L2 verification report. If project is in database, returns cached results. If not, runs live verification (3-8 minutes). Returns INSUFFICIENT_DATA if no whitepaper or document source can be found.',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['document_url', 'project_name'],
    },
    deliverableSchema: VERIFY_WHITEPAPER_SPEC,
  },
  {
    id: 'full_technical_verification',
    displayName: 'Full Technical Verification',
    price: 3.00,
    description: 'Returns JSON with: L1 structural analysis, L2 claim extraction, L3 claim evaluation, confidence_score (1-100), verdict (PASS/CONDITIONAL/FAIL/INSUFFICIENT_DATA), focus_area_scores, hype_tech_ratio, total_claims, verified_claims, MiCA compliance, compute_cost_usd.',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string' },
        project_name: { type: 'string' },
      },
    },
    deliverableSchema: FULL_VERIFICATION_SPEC,
  },
  {
    id: 'daily_technical_briefing',
    displayName: 'Daily Technical Briefing',
    price: 8.00,
    description: 'Returns today\'s verification batch summary. Includes: projects_verified_count, greenlight_list (PASS verdicts), alert_list (FAIL verdicts), average_confidence, mica_compliance_summary. If no verifications ran today, returns empty batch with timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
      },
    },
    deliverableSchema: DAILY_BRIEFING_SPEC,
  },
];

// ── Resources ─────────────────────────────────────────────

export interface ResourceConfig {
  id: ResourceId;
  displayName: string;
  description: string;
  deliverableSchema: DeliverableSpec;
}

export const RESOURCES: ResourceConfig[] = [
  {
    id: 'daily_greenlight_list',
    displayName: 'Daily Greenlight List',
    description: 'Array of projects with verdict=PASS verified in last 24 hours. Each entry: project_name, token_address, confidence_score, structural_score, mica_compliant, verified_at. Empty array if no projects passed today.',
    deliverableSchema: GREENLIGHT_SPEC,
  },
  {
    id: 'scam_alert_feed',
    displayName: 'Scam Alert Feed',
    description: 'Array of projects with verdict=FAIL or hype_tech_ratio > 3.0 or fraudulent MiCA claims. Each entry: project_name, token_address, red_flags array, hype_tech_ratio, mica_summary. Empty array if no alerts.',
    deliverableSchema: SCAM_ALERT_SPEC,
  },
];

