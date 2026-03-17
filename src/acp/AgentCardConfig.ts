// ════════════════════════════════════════════
// WS-C2: AgentCardConfig
// Static config for the WPV Agent Card — name, role, offerings, resources.
// This is config, not a service.
// ════════════════════════════════════════════

import type { OfferingId, ResourceId } from '../types';

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
  ],
} as const;

export interface OfferingConfig {
  id: OfferingId;
  displayName: string;
  price: number;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const OFFERINGS: OfferingConfig[] = [
  {
    id: 'project_legitimacy_scan',
    displayName: 'Project Legitimacy Scan',
    price: 0.25,
    description: 'Quick structural analysis and hype detection. Returns verdict and structural score.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        token_address: { type: 'string' },
      },
    },
  },
  {
    id: 'tokenomics_sustainability_audit',
    displayName: 'Tokenomics Sustainability Audit',
    price: 1.50,
    description: 'Claim extraction and scoring for tokenomics models. Returns claims and logic summary.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        token_address: { type: 'string' },
      },
    },
  },
  {
    id: 'verify_project_whitepaper',
    displayName: 'Verify Project Whitepaper',
    price: 2.00,
    description: 'Live L1+L2 verification of a new whitepaper URL. Adds to database permanently.',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['document_url', 'project_name'],
    },
  },
  {
    id: 'full_technical_verification',
    displayName: 'Full Technical Verification',
    price: 3.00,
    description: 'Complete L1+L2+L3 verification with confidence score and detailed evaluations.',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string' },
        project_name: { type: 'string' },
        focus_area: { type: 'string' },
      },
    },
  },
  {
    id: 'daily_technical_briefing',
    displayName: 'Daily Technical Briefing',
    price: 8.00,
    description: 'Today\'s batch of verified whitepapers with full reports.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
      },
    },
  },
];

export interface ResourceConfig {
  id: ResourceId;
  displayName: string;
  description: string;
}

export const RESOURCES: ResourceConfig[] = [
  {
    id: 'daily_greenlight_list',
    displayName: 'Daily Greenlight List',
    description: 'Today\'s verified projects with PASS verdicts. Free to browse.',
  },
  {
    id: 'scam_alert_feed',
    displayName: 'Scam Alert Feed',
    description: 'Flagged high-risk projects with FAIL verdicts and hype ratios > 3.0.',
  },
];
