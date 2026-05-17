# x402 Middleware Adapter Skeleton (v3)

**Companion document to:** Whitepaper Grey Multi-Platform Deployment Plan v7
**Audience:** Kovsky (Claude Code CLI implementation)
**Purpose:** Buildable TypeScript scaffold for `adapters/x402-middleware/` — Grey's first revenue surface

---

## v3 changes vs v2

- `compliance_report` renamed to `compliance_research_input` throughout — positioned as research input rather than certification
- Price for compliance offering lowered to $10 (down from $25) to reflect the more cautious framing
- `BASE_X402_PAY_TO` env var now explicitly references the Tier A hot wallet from the Wallet Infrastructure companion doc (renamed from earlier `GREY_X402_PAY_TO` for consistency with chain-prefixed wallet naming across all future adapters)
- Notes on wallet integration with the sweeper service

---

## What this adapter does

Wraps Grey's verification endpoints in `grey-core` with x402 payment middleware. Buyers (other agents) discover Grey's endpoints via the x402 Bazaar, attach signed USDC payment, and grey-core processes the verification. Settlement on Base mainnet via CDP Facilitator (fee-free for USDC on Base).

Tier A hot wallet (`BASE_X402_PAY_TO`) receives the USDC. The grey-sweeper service (separate systemd unit) periodically moves balance above threshold to the Tier B pool wallet. See Wallet Infrastructure companion doc for full hierarchy.

---

## Tooling note

Suggested defaults below. Swap if you have a better choice. The `@x402/*` v2 package family is current as of May 2026; verify versions at install.

---

## Package structure

```
adapters/x402-middleware/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                      (exports apply())
│   ├── config.ts                     (env parsing)
│   ├── pricing.ts                    (centralized price table)
│   ├── routes-config.ts              (offering route definitions)
│   ├── bazaar-metadata.ts            (Bazaar discovery declarations)
│   └── apply.ts                      (wire middleware into grey-core)
├── tests/
│   ├── routes-config.test.ts
│   ├── pricing.test.ts
│   └── bazaar-metadata.test.ts
└── README.md
```

---

## `package.json`

```json
{
  "name": "@grey/x402-middleware",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@x402/express": "^2.0.0",
    "@x402/core": "^2.0.0",
    "@x402/evm": "^2.0.0",
    "@x402/extensions": "^2.0.0",
    "@coinbase/x402": "^1.0.0",
    "@grey/schemas": "workspace:*",
    "express": "^4.19.2",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "engines": { "node": ">=20.0.0" }
}
```

---

## `src/pricing.ts`

```typescript
/**
 * x402 Bazaar pricing for Grey's offerings.
 *
 * Pricing rationale:
 * - CDP Facilitator is fee-free, so we keep full margin
 * - Loss-leader offerings (claim_history) drive trust
 * - Premium offerings price closer to value delivered
 * - Atomic offerings price for high-frequency call patterns
 * - compliance_research_input priced cautiously while we calibrate positioning
 *
 * Override via env vars for live tuning without code changes.
 */

export type OfferingPriceKey =
  | "legitimacy_scan"
  | "whitepaper_verification"
  | "technical_verification"
  | "technical_briefing"
  | "daily_tech_brief"
  | "claim_evaluation"
  | "claim_extraction"
  | "tokenomics_audit"
  | "audit_posture_check"
  | "comparative_analysis"
  | "mass_screen"
  | "claim_history"
  | "prediction_market_research"
  | "resolution_evidence_compiler"
  | "allocation_risk_report"
  | "quick_protocol_facts"
  | "compliance_research_input";

export const DEFAULT_X402_PRICING: Record<OfferingPriceKey, string> = {
  legitimacy_scan: "$0.50",
  whitepaper_verification: "$2.00",
  technical_verification: "$5.00",
  technical_briefing: "$0.10",
  daily_tech_brief: "$8.00", // aggregate cross-project briefing; distinct from per-protocol technical_briefing
  claim_evaluation: "$0.05",
  claim_extraction: "$0.25",
  tokenomics_audit: "$1.50",
  audit_posture_check: "$0.50",
  comparative_analysis: "$3.00",
  mass_screen: "$0.05",
  claim_history: "$0.02",
  prediction_market_research: "$0.15",
  resolution_evidence_compiler: "$0.30",
  allocation_risk_report: "$2.50",
  quick_protocol_facts: "$0.20",
  compliance_research_input: "$10.00", // research input, not certification
};

export function loadPricing(): Record<OfferingPriceKey, string> {
  const env = process.env;
  const get = (key: string, fallback: string) => env[key] ?? fallback;
  return {
    legitimacy_scan: get("X402_PRICE_LEGITIMACY_SCAN", DEFAULT_X402_PRICING.legitimacy_scan),
    whitepaper_verification: get(
      "X402_PRICE_WHITEPAPER_VERIFICATION",
      DEFAULT_X402_PRICING.whitepaper_verification,
    ),
    technical_verification: get(
      "X402_PRICE_TECHNICAL_VERIFICATION",
      DEFAULT_X402_PRICING.technical_verification,
    ),
    technical_briefing: get(
      "X402_PRICE_TECHNICAL_BRIEFING",
      DEFAULT_X402_PRICING.technical_briefing,
    ),
    daily_tech_brief: get(
      "X402_PRICE_DAILY_TECH_BRIEF",
      DEFAULT_X402_PRICING.daily_tech_brief,
    ),
    claim_evaluation: get("X402_PRICE_CLAIM_EVALUATION", DEFAULT_X402_PRICING.claim_evaluation),
    claim_extraction: get("X402_PRICE_CLAIM_EXTRACTION", DEFAULT_X402_PRICING.claim_extraction),
    tokenomics_audit: get("X402_PRICE_TOKENOMICS_AUDIT", DEFAULT_X402_PRICING.tokenomics_audit),
    audit_posture_check: get(
      "X402_PRICE_AUDIT_POSTURE_CHECK",
      DEFAULT_X402_PRICING.audit_posture_check,
    ),
    comparative_analysis: get(
      "X402_PRICE_COMPARATIVE_ANALYSIS",
      DEFAULT_X402_PRICING.comparative_analysis,
    ),
    mass_screen: get("X402_PRICE_MASS_SCREEN", DEFAULT_X402_PRICING.mass_screen),
    claim_history: get("X402_PRICE_CLAIM_HISTORY", DEFAULT_X402_PRICING.claim_history),
    prediction_market_research: get(
      "X402_PRICE_PREDICTION_MARKET_RESEARCH",
      DEFAULT_X402_PRICING.prediction_market_research,
    ),
    resolution_evidence_compiler: get(
      "X402_PRICE_RESOLUTION_EVIDENCE_COMPILER",
      DEFAULT_X402_PRICING.resolution_evidence_compiler,
    ),
    allocation_risk_report: get(
      "X402_PRICE_ALLOCATION_RISK_REPORT",
      DEFAULT_X402_PRICING.allocation_risk_report,
    ),
    quick_protocol_facts: get(
      "X402_PRICE_QUICK_PROTOCOL_FACTS",
      DEFAULT_X402_PRICING.quick_protocol_facts,
    ),
    compliance_research_input: get(
      "X402_PRICE_COMPLIANCE_RESEARCH_INPUT",
      DEFAULT_X402_PRICING.compliance_research_input,
    ),
  };
}
```

---

## `src/config.ts`

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  // Tier A hot wallet on Base — see Wallet Infrastructure companion doc
  // This address receives USDC from x402 settlements. grey-sweeper
  // (separate systemd unit) moves accumulated balance to BASE_POOL_WALLET
  // periodically. This adapter is a receiver only — it does NOT sign
  // transactions and does NOT need the private key.
  BASE_X402_PAY_TO: z.string().regex(/^0x[a-fA-F0-9]{40}$/),

  CDP_API_KEY_ID: z.string().min(1),
  CDP_API_KEY_SECRET: z.string().min(1),

  X402_NETWORK: z.enum(["eip155:8453", "eip155:84532"]).default("eip155:84532"),
  X402_FACILITATOR_URL: z.string().url().default("https://x402.org/facilitator"),
  X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
});

export type X402Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): X402Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("x402 middleware config invalid:", parsed.error.format());
    throw new Error("Invalid x402 middleware configuration");
  }
  return parsed.data;
}
```

---

## `src/bazaar-metadata.ts`

```typescript
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const COMMON_TAGS = ["crypto", "verification", "due-diligence", "DeFi"];

// CORE
export const bazaarLegitimacyScan = declareDiscoveryExtension({
  discoverable: true,
  category: "verification",
  tags: [...COMMON_TAGS, "legitimacy", "scam-detection", "project-screening"],
  inputSchema: { body: { projectUrl: { type: "string", required: true }, projectName: { type: "string", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarWhitepaperVerification = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "whitepaper", "claim-verification", "MiCA"],
  inputSchema: { body: { whitepaperUrl: { type: "string", required: true }, claimsToVerify: { type: "array", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarTechnicalVerification = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "technical-audit", "math-verification", "consensus", "AMM", "lending"],
  inputSchema: { body: { projectUrl: { type: "string", required: true }, focusAreas: { type: "array", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarTechnicalBriefing = declareDiscoveryExtension({
  discoverable: true, category: "monitoring",
  tags: [...COMMON_TAGS, "daily-briefing", "protocol-monitoring", "delta"],
  inputSchema: { body: { projectId: { type: "string", required: true }, since: { type: "string", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarClaimEvaluation = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "single-claim", "atomic-verification", "fact-check"],
  inputSchema: { body: { claim: { type: "string", required: true }, context: { type: "object", required: false } } },
  outputSchema: { type: "object" },
});

// NEW CROSS-PLATFORM
export const bazaarClaimExtraction = declareDiscoveryExtension({
  discoverable: true, category: "extraction",
  tags: [...COMMON_TAGS, "claim-extraction", "no-evaluation", "structured-data"],
  inputSchema: { body: { documentUrl: { type: "string", required: true } } },
  outputSchema: { type: "object", description: "Pure claim extraction without evaluation" },
});

export const bazaarTokenomicsAudit = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "tokenomics", "unlock-schedule", "emission-curve", "supply-mechanics"],
  inputSchema: { body: { projectUrl: { type: "string", required: true }, tokenAddress: { type: "string", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarAuditPostureCheck = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "audit-history", "audit-freshness", "auditor-reputation"],
  inputSchema: { body: { projectUrl: { type: "string", required: true } } },
  outputSchema: { type: "object" },
});

export const bazaarComparativeAnalysis = declareDiscoveryExtension({
  discoverable: true, category: "analysis",
  tags: [...COMMON_TAGS, "comparison", "competitive-analysis", "side-by-side"],
  inputSchema: { body: { projects: { type: "array", description: "Array of 2+ project URLs", required: true } } },
  outputSchema: { type: "object" },
});

export const bazaarMassScreen = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "batch", "mass-screening", "triage", "universe-scan"],
  inputSchema: { body: { projectUrls: { type: "array", description: "10-100 URLs", required: true } } },
  outputSchema: { type: "object" },
});

export const bazaarClaimHistory = declareDiscoveryExtension({
  discoverable: true, category: "lookup",
  tags: [...COMMON_TAGS, "knowledge-graph", "history", "prior-analyses"],
  inputSchema: { body: { projectId: { type: "string", required: true } } },
  outputSchema: { type: "object", description: "Grey's accumulated knowledge on a project" },
});

// PLATFORM-SPECIALTY
export const bazaarPredictionMarketResearch = declareDiscoveryExtension({
  discoverable: true, category: "prediction",
  tags: [...COMMON_TAGS, "prediction-market", "polymarket", "kalshi", "omen", "probability-estimation"],
  inputSchema: { body: { marketQuestion: { type: "string", required: true }, marketContext: { type: "object", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarResolutionEvidenceCompiler = declareDiscoveryExtension({
  discoverable: true, category: "prediction",
  tags: [...COMMON_TAGS, "prediction-market-resolution", "evidence", "arbitration"],
  inputSchema: { body: { claimToVerify: { type: "string", required: true }, resolutionWindow: { type: "object", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarAllocationRiskReport = declareDiscoveryExtension({
  discoverable: true, category: "verification",
  tags: [...COMMON_TAGS, "allocator", "yield", "TVL-risk", "DeFi-allocation"],
  inputSchema: { body: { projectUrl: { type: "string", required: true }, allocationContext: { type: "object", required: false } } },
  outputSchema: { type: "object" },
});

export const bazaarQuickProtocolFacts = declareDiscoveryExtension({
  discoverable: true, category: "lookup",
  tags: [...COMMON_TAGS, "quick-facts", "conversational", "basic-info"],
  inputSchema: { body: { projectQuery: { type: "string", required: true } } },
  outputSchema: { type: "object", description: "Concise project facts for conversational use" },
});

export const bazaarComplianceResearchInput = declareDiscoveryExtension({
  discoverable: true, category: "research",
  tags: [...COMMON_TAGS, "MiCA", "regulatory-research", "research-input", "compliance-adjacent"],
  inputSchema: { body: { projectUrl: { type: "string", required: true }, jurisdiction: { type: "string", required: false } } },
  outputSchema: { type: "object", description: "Structured research input for compliance assessment — not a compliance certification" },
});
```

---

## `src/routes-config.ts`

```typescript
import type { RoutesConfig } from "@x402/express";
import { loadConfig } from "./config";
import { loadPricing } from "./pricing";
import * as metadata from "./bazaar-metadata";

export function buildRoutesConfig(): RoutesConfig {
  const config = loadConfig();
  const pricing = loadPricing();
  const { BASE_X402_PAY_TO, X402_NETWORK, X402_MAX_TIMEOUT_SECONDS } = config;

  const baseAccepts = {
    scheme: "exact" as const,
    network: X402_NETWORK,
    payTo: BASE_X402_PAY_TO,
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
  };

  return {
    // CORE
    "POST /v1/legitimacy-scan": {
      accepts: [{ ...baseAccepts, price: pricing.legitimacy_scan }],
      description: "Legitimacy scan: risk flags, classification, confidence-scored assessment.",
      mimeType: "application/json", extensions: metadata.bazaarLegitimacyScan,
    },
    "POST /v1/whitepaper-verification": {
      accepts: [{ ...baseAccepts, price: pricing.whitepaper_verification }],
      description: "Full whitepaper verification: extracts claims, evaluates each, returns structured analysis with citations.",
      mimeType: "application/json", extensions: metadata.bazaarWhitepaperVerification,
    },
    "POST /v1/technical-verification": {
      accepts: [{ ...baseAccepts, price: pricing.technical_verification }],
      description: "Deep technical verification: math soundness, audit posture, consensus, tokenomics risk profile.",
      mimeType: "application/json", extensions: metadata.bazaarTechnicalVerification,
    },
    "POST /v1/technical-briefing": {
      accepts: [{ ...baseAccepts, price: pricing.technical_briefing }],
      description: "Daily technical delta for a protocol Grey has previously analyzed.",
      mimeType: "application/json", extensions: metadata.bazaarTechnicalBriefing,
    },
    "POST /v1/claim-evaluation": {
      accepts: [{ ...baseAccepts, price: pricing.claim_evaluation }],
      description: "Atomic single-claim evaluation. Designed for high-frequency, narrow calls.",
      mimeType: "application/json", extensions: metadata.bazaarClaimEvaluation,
    },

    // NEW CROSS-PLATFORM
    "POST /v1/claim-extraction": {
      accepts: [{ ...baseAccepts, price: pricing.claim_extraction }],
      description: "Pure claim extraction without evaluation. Cheap input for downstream analysis.",
      mimeType: "application/json", extensions: metadata.bazaarClaimExtraction,
    },
    "POST /v1/tokenomics-audit": {
      accepts: [{ ...baseAccepts, price: pricing.tokenomics_audit }],
      description: "Focused tokenomic analysis: unlock schedules, emission curves, supply concentration.",
      mimeType: "application/json", extensions: metadata.bazaarTokenomicsAudit,
    },
    "POST /v1/audit-posture-check": {
      accepts: [{ ...baseAccepts, price: pricing.audit_posture_check }],
      description: "Audit history, auditor reputation, audit scope and recency.",
      mimeType: "application/json", extensions: metadata.bazaarAuditPostureCheck,
    },
    "POST /v1/comparative-analysis": {
      accepts: [{ ...baseAccepts, price: pricing.comparative_analysis }],
      description: "Side-by-side analysis of 2+ projects.",
      mimeType: "application/json", extensions: metadata.bazaarComparativeAnalysis,
    },
    "POST /v1/mass-screen": {
      accepts: [{ ...baseAccepts, price: pricing.mass_screen }],
      description: "Batch triage scoring for 10-100 project URLs. Priced per item.",
      mimeType: "application/json", extensions: metadata.bazaarMassScreen,
    },
    "POST /v1/claim-history": {
      accepts: [{ ...baseAccepts, price: pricing.claim_history }],
      description: "Grey's accumulated claim/verification history for a project. Loss-leader.",
      mimeType: "application/json", extensions: metadata.bazaarClaimHistory,
    },

    // PLATFORM-SPECIALTY
    "POST /v1/prediction-market-research": {
      accepts: [{ ...baseAccepts, price: pricing.prediction_market_research }],
      description: "Verify crypto-related claims relevant to a prediction market question.",
      mimeType: "application/json", extensions: metadata.bazaarPredictionMarketResearch,
    },
    "POST /v1/resolution-evidence-compiler": {
      accepts: [{ ...baseAccepts, price: pricing.resolution_evidence_compiler }],
      description: "Compile evidence for prediction market resolution.",
      mimeType: "application/json", extensions: metadata.bazaarResolutionEvidenceCompiler,
    },
    "POST /v1/allocation-risk-report": {
      accepts: [{ ...baseAccepts, price: pricing.allocation_risk_report }],
      description: "Pre-allocation risk assessment for allocator agents.",
      mimeType: "application/json", extensions: metadata.bazaarAllocationRiskReport,
    },
    "POST /v1/quick-protocol-facts": {
      accepts: [{ ...baseAccepts, price: pricing.quick_protocol_facts }],
      description: "Concise protocol facts for conversational interfaces.",
      mimeType: "application/json", extensions: metadata.bazaarQuickProtocolFacts,
    },
    "POST /v1/compliance-research-input": {
      accepts: [{ ...baseAccepts, price: pricing.compliance_research_input }],
      description:
        "Structured research input for compliance assessment. This is research material, not a compliance certification.",
      mimeType: "application/json", extensions: metadata.bazaarComplianceResearchInput,
    },
  };
}
```

---

## `src/apply.ts`

```typescript
import type { Express } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { facilitator as cdpFacilitator } from "@coinbase/x402";

import { loadConfig } from "./config";
import { buildRoutesConfig } from "./routes-config";

export function applyX402Middleware(app: Express): void {
  const config = loadConfig();
  const isMainnet = config.X402_NETWORK === "eip155:8453";

  const facilitatorClient = isMainnet
    ? cdpFacilitator
    : new HTTPFacilitatorClient({ url: config.X402_FACILITATOR_URL });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    config.X402_NETWORK,
    new ExactEvmScheme(),
  );

  const routes = buildRoutesConfig();
  app.use(paymentMiddleware(routes, resourceServer));
}
```

---

## `src/index.ts`

```typescript
export { applyX402Middleware } from "./apply";
export { loadConfig } from "./config";
export type { X402Config } from "./config";
export { buildRoutesConfig } from "./routes-config";
export { loadPricing, DEFAULT_X402_PRICING } from "./pricing";
export type { OfferingPriceKey } from "./pricing";
```

---

## Wallet integration

The `BASE_X402_PAY_TO` value is the Tier A hot wallet address from the Wallet Infrastructure companion doc. The flow on Base:

1. Buyer pays USDC → arrives at `BASE_X402_PAY_TO` (Tier A hot wallet, key on VPS)
2. grey-sweeper service (separate systemd unit) checks balance daily
3. When threshold met ($200 USDC), sweeper sends to `BASE_POOL_WALLET` (Tier B pool, key held by Forces offline)
4. Forces manually bridges Tier B to `GREY_TREASURY_RECEIVE` (Tier D inbound on Base) on a periodic basis
5. Forces manually splits Tier D inbound to 70% `GREY_TREASURY_OPERATING` + 30% `GREY_TREASURY_TAX_RESERVE`

No Tier C on Base — the wallet doc v3 skips it because there's no native-asset reason to hold separately on Base. The Tier D operating wallet IS the working capital.

The x402 adapter itself has no awareness of Tier B or Tier D — its only job is configuring the `payTo` address that buyers settle to. Sweeper handles A → B. Forces handles B → D and the split.

**The x402 adapter does NOT sign sweep transactions.** That's grey-sweeper's job, in its own process with its own systemd unit. Separation of concerns: if grey-core (and this adapter) is compromised, an attacker could re-route future settlements only by changing config — they cannot drain the existing balance because they don't have a sweep path that goes anywhere other than the allowlisted `BASE_POOL_WALLET`.

---

## Testing

### Local testnet

```bash
BASE_X402_PAY_TO=0xYourTestWallet
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://x402.org/facilitator
```

Test USDC from Circle's faucet.

### Production

```bash
BASE_X402_PAY_TO=0xActualTierAAddressOnBaseMainnet  # the Tier A hot wallet from Wallet Infrastructure doc
X402_NETWORK=eip155:8453
CDP_API_KEY_ID=<from portal.cdp.coinbase.com>
CDP_API_KEY_SECRET=<from portal.cdp.coinbase.com>
```

### Smoke test buyer

```typescript
import { createX402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

async function smokeTest() {
  const client = createX402Client({
    privateKey: process.env.TEST_BUYER_PRIVATE_KEY!,
    network: "eip155:84532",
  }).register("eip155:84532", new ExactEvmScheme());

  const response = await client.fetch("http://localhost:3001/v1/whitepaper-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whitepaperUrl: "https://uniswap.org/whitepaper.pdf" }),
  });

  console.log("Status:", response.status);
  console.log("Body:", await response.json());
}
```

---

## Bazaar indexing verification

After first settlement on each route:

```bash
curl https://api.cdp.coinbase.com/v2/x402/discovery/resources \
  -H "Authorization: Bearer $CDP_API_KEY" \
  | jq '.items[] | select(.payTo == "0xYourTierAAddress")'

open https://agentic.market
```

If not appearing: check `EXTENSION-RESPONSES` header, validate schema, wait for async indexing.

---

## Operational notes

### Hot wallet management

Per the Wallet Infrastructure companion doc, the sweeper handles balance management. Operators don't manually sweep — set the sweep threshold appropriately ($200 default) and trust the cycle.

### Pricing iteration

After meaningful traffic, look at: which routes most-called (may be priced too low), which routes get 402s but no payment (may be priced too high), cost margin per call (must stay positive). Adjust via env vars.

### Error handling

When pipeline fails (Anthropic down, target whitepaper unreachable):
- Return structured error response
- **Do not consume buyer's payment** via `@x402/express` lifecycle hooks (`onBeforeSettle` / `onSettleSkip`)

### Per-buyer rate limiting

x402 v2 supports identifying buyers by wallet address in payment headers. Use for per-buyer limits.

---

## Acceptance criteria

- [ ] `pnpm build` produces valid `dist/`
- [ ] `pnpm test` passes
- [ ] `applyX402Middleware(app)` wires into a real Express app
- [ ] Test buyer can pay and call each of the 17 offering routes on Base Sepolia
- [ ] After first mainnet payment per route, route appears in Bazaar discovery
- [ ] USDC accumulates in Tier A hot wallet from real settlements
- [ ] Sweeper moves accumulated USDC to Tier B pool wallet correctly
- [ ] Error cases (pipeline failure) don't consume buyer payment
- [ ] README documents adapter usage

---

## References

- x402 v2 docs: https://docs.cdp.coinbase.com/x402/
- Express middleware: `@x402/express` on npm
- Bazaar discovery: https://docs.cdp.coinbase.com/x402/bazaar
- CDP Facilitator: `@coinbase/x402`
- Reference impl: https://github.com/coinbase/x402/tree/main/examples/typescript/servers/express

---

*Document version: v3, May 11, 2026. Companion to deployment plan v7.*
