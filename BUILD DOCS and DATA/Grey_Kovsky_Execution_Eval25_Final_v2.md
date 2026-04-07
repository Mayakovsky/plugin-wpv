# Kovsky Execution Plan — Eval 25 Final Push (v2)

> **Source:** Forces v1 + Kovsky v2 corrections
> **Date:** 2026-04-05
> **Goal:** Fix remaining 4 eval 25 failures. 12/16 → 16/16.
> **Depends on:** Eval 24 recovery plan fully deployed (confirmed)

---

## v2 Changelog (from Forces v1)

| # | Section | Issue | Fix |
|---|---------|-------|-----|
| 1 | Fix 3A | Raw requirement text lost at AcpService boundary. Plan was vague ("check AcpService"). | Explicitly specced: AcpService already has `rawContent` field on `OfferingJobInput`. Populate it with `acpJob.requirement` when `isPlainText` is true. One-line change in plugin-acp. |
| 2 | Fix 3A | WpvService handler types don't include `rawContent`. | Widen handler signature to accept full `OfferingJobInput` (or at minimum `rawContent`). Pass through to JobRouter. |
| 3 | Fix 3, Issue A | ClaimExtractor `extractClaims(text, name, maxRetries)` — adding 4th positional param creates misuse risk. | Confirmed Forces' fix: use options object. But note the `undefined` placeholder in Forces' plan (`extractClaims(resolved.text, projectName, undefined, requirementText)`) is the v1 approach — v2 uses options object exclusively. |
| 4 | Fix 3E | Plan accesses `this.deps.claimExtractor.client` (private). Says "add anthropicClient to JobRouterDeps." | Specced exactly: `anthropicClient` is created in `WpvService.initFromRuntime` at line 190. Pass same instance to JobRouter deps. Added to `JobRouterDeps` interface. |
| 5 | Fix 3E | Synthesis calls `client.messages.create()` — unclear if our custom client supports this. | Verified: `anthropicFetchClient.ts` exposes `messages.create()` matching the pattern. No issue. |
| 6 | General | Fix 3 touches 6 files across 2 repos. High risk of introducing bugs. | Added phased deployment: Fix 1+2 first (low risk), verify, then Fix 3 (high risk). Rollback plan if Fix 3 breaks. |

---

## The 4 Failures

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| F1+F4 | "Empty Address" + zero address accepted → leaks into briefing | Burn-address soft-strip too lenient for placeholder project names | Placeholder name detection |
| F2 | Uniswap v4 requested → v2 data served | No version-aware document selection in known URL map or lookup | Version-specific map entries + version-aware matching |
| F3 | Ethena math eval → surface scan (no quantitative analysis) | Pipeline ignores buyer's requirement; ClaimExtractor runs generic extraction | Requirement-aware pipeline: pass requirement text to L2/L3 |

---

## Execution Order (strict)

1. **Fix 1: Placeholder name detection** (LOW risk — validation logic)
2. **Fix 2: Version-aware document selection** (LOW risk — map + regex)
3. **Deploy + verify Fix 1+2** (checkpoint — confirm no regressions)
4. **Fix 3: Requirement-aware pipeline** (HIGH risk — cross-repo, 6 files)
5. **Verification + full deploy**

---

## Fix 1: Placeholder Name Detection

**File:** `src/WpvService.ts` — in the burn-address check block within `validateTokenAddress`

**Problem:** When the evaluator sends `{"project_name": "Empty Address", "token_address": "0x0000...0000", "document_url": "https://whitepaper.virtuals.io/"}`, Grey's burn-address logic checks `hasDocUrl` (true) and `hasMeaningfulName` (true — "Empty Address" is not in `NON_MEANINGFUL_NAMES`). So it soft-strips the address and proceeds.

**Fix:** Expand `NON_MEANINGFUL_NAMES` + add `ADDRESS_DESCRIPTOR_PATTERN` regex guard.

Find the `NON_MEANINGFUL_NAMES` constant in the burn-address block and replace:

```typescript
const NON_MEANINGFUL_NAMES = [
  'empty', 'unknown', 'none', 'test', 'n/a', 'null', 'undefined', '',
  'placeholder', 'dummy', 'sample', 'example', 'fake', 'zero',
  'test token', 'test project', 'empty address', 'null address',
  'zero address', 'burn address', 'dead address',
];
```

**Add regex guard** after the `NON_MEANINGFUL_NAMES` check, INSIDE the burn-address detection block, BEFORE the soft-strip decision:

```typescript
// Reject names that describe the token_address rather than the project
const ADDRESS_DESCRIPTOR_PATTERN = /\b(empty|zero|null|dead|burn|void)\s+(address|contract|token|wallet)\b/i;
if (ADDRESS_DESCRIPTOR_PATTERN.test(projectName)) {
  const err = new Error(`Invalid: project name '${projectName.slice(0, 50)}' describes an address, not a project`);
  err.name = 'InputValidationError';
  throw err;
}
```

**Placement:** When burn address + address-descriptor name → hard reject, even if document_url is present.

---

## Fix 2: Version-Aware Document Selection

### 2A. Version-specific entries in known URL map

**File:** `src/discovery/WebSearchFallback.ts`

Replace the single Uniswap entry with version-specific entries BEFORE the generic fallback:

```typescript
// ── Uniswap (version-specific first, generic last) ──
[/\buniswap\s+v4\b/i, 'https://docs.uniswap.org/contracts/v4/overview'],
[/\buniswap\s+v3\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],
[/\buniswap\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],  // fallback: latest stable
```

**Kov must curl-verify** `https://docs.uniswap.org/contracts/v4/overview` before adding. If 404, search for the actual v4 docs URL.

### 2B. Verify version capture in protocol regex

**File:** `src/WpvService.ts` — `extractFromUnknownFields`

The protocol regex should capture the version suffix in `match[0]`. Test that `"Uniswap v4"` → `match[0]` = `"Uniswap v4"`, not just `"Uniswap"`. If the version is lost, fix the regex capture group.

**Kov should verify** by reading the exact regex and testing mentally. No code change if `match[0]` already includes the version.

---

## Fix 3: Requirement-Aware Pipeline

### Overview of data flow (v2 — fully specced)

```
AcpService.handleNewTask()
  → acpJob.requirement = "Mathematical evaluation of Ethena USDe..."  (raw string)
  → parseRequirement() → { requirement: { project_name: "Ethena", ... }, isPlainText: true }
  → Build OfferingJobInput with rawContent = acpJob.requirement   ← NEW (3A)
  → handler(input)

WpvService handler
  → Receives OfferingJobInput (has .requirement + .rawContent)      ← WIDEN TYPE (3A)
  → Attaches input.requirement._requirementText = input.rawContent  ← NEW (3A)
  → JobRouter.handleJob(offeringId, input.requirement)

JobRouter.handleFullVerification()
  → extractRequirementText(input) → "Mathematical evaluation of Ethena USDe..."  ← NEW (3B)
  → runL1L2(url, name, addr, requirementText)                      ← MODIFIED (3B)
  → ClaimExtractor.extractClaims(text, name, { requirementText })   ← MODIFIED (3C)
  → ClaimEvaluator.evaluateAll(claims, text, { requirementText })   ← MODIFIED (3D)
  → generateSynthesis(requirementText, name, claims, text)          ← NEW (3E)
  → report.logicSummary = synthesis                                 ← NEW (3E)
```

### 3A. Populate rawContent in AcpService + pass through WpvService

**File 1: `plugin-acp/src/AcpService.ts`** — in `processJobDeliver` (line ~736)

The `OfferingJobInput` interface already has `rawContent?: string`. It's just never populated. One-line fix:

**Current (line 736-742):**
```typescript
const input: OfferingJobInput = {
  jobId: acpJob.id,
  offeringId,
  buyerAddress: acpJob.clientAddress,
  requirement: deliverParsed.requirement,
  isPlainText: deliverParsed.isPlainText,
};
```

**New:**
```typescript
const input: OfferingJobInput = {
  jobId: acpJob.id,
  offeringId,
  buyerAddress: acpJob.clientAddress,
  requirement: deliverParsed.requirement,
  isPlainText: deliverParsed.isPlainText,
  rawContent: deliverParsed.isPlainText && typeof acpJob.requirement === 'string'
    ? acpJob.requirement
    : undefined,
};
```

**Also add it to the REQUEST phase input** (line 673-679) — the validator doesn't use it, but consistency:

```typescript
const input: OfferingJobInput = {
  jobId: acpJob.id,
  offeringId,
  buyerAddress: acpJob.clientAddress,
  requirement,
  isPlainText,
  rawContent: isPlainText && typeof acpJob.requirement === 'string'
    ? acpJob.requirement
    : undefined,
};
```

**File 2: `plugin-wpv/src/WpvService.ts`** — in `registerWithAcp`, widen handler type

**Current (line ~786):**
```typescript
const handler = async (input: { requirement: Record<string, unknown> }) => {
```

**New:**
```typescript
const handler = async (input: { requirement: Record<string, unknown>; rawContent?: string }) => {
```

After validation, before calling JobRouter, attach the raw text:

```typescript
const handler = async (input: { requirement: Record<string, unknown>; rawContent?: string }) => {
  if (!this.deps?.jobRouter) {
    return { error: 'wpv_not_ready', message: 'WPV JobRouter not initialized' };
  }

  // Validate again in handler (defense in depth — also covers HTTP path)
  await WpvService.validateTokenAddress(offeringId, input.requirement);

  // Preserve raw requirement text for requirement-aware analysis
  if (input.rawContent) {
    input.requirement._requirementText = input.rawContent;
  }

  return this.deps.jobRouter.handleJob(offeringId, input.requirement);
};
```

### 3B. Pass requirement text through JobRouter

**File:** `src/acp/JobRouter.ts`

Add helper method:

```typescript
private extractRequirementText(input: Record<string, unknown>): string | null {
  if (typeof input._requirementText === 'string' && input._requirementText.length > 10) {
    return input._requirementText;
  }
  return null;
}
```

Modify `runL1L2` signature:

```typescript
private async runL1L2(
  documentUrl: string,
  projectName: string,
  tokenAddress?: string | null,
  requirementText?: string | null,
)
```

In `runL1L2`, pass to ClaimExtractor:

```typescript
const claims = await this.deps.claimExtractor.extractClaims(
  resolved.text, projectName, { requirementText },
);
```

In `handleVerifyWhitepaper` and `handleFullVerification`, extract and pass:

```typescript
const requirementText = this.extractRequirementText(input);
// ... later in all runL1L2 calls ...
await this.runL1L2(documentUrl, projectName, requestedTokenAddress, requirementText);
```

Also pass to `evaluateAll`:

```typescript
const { evaluations, scores } = await this.deps.claimEvaluator.evaluateAll(
  claims, resolved.text, { requirementText },
);
```

### 3C. Make ClaimExtractor requirement-aware

**File:** `src/verification/ClaimExtractor.ts`

Change signature to options object:

```typescript
async extractClaims(
  text: string,
  projectName: string,
  options?: { maxRetries?: number; requirementText?: string | null },
): Promise<ExtractedClaim[]> {
  const maxRetries = options?.maxRetries ?? 2;
  const requirementText = options?.requirementText ?? null;
```

Modify the user message:

```typescript
content: requirementText
  ? `The buyer has requested: "${requirementText}"\n\nExtract all testable claims from this ${projectName} whitepaper, with SPECIAL FOCUS on claims relevant to the buyer's request. If the request mentions mathematical evaluation, formulas, or quantitative analysis, prioritize extracting mathematical definitions, equations, model parameters, and quantitative assertions. Tag these with mathematicalProofPresent: true if they contain formal/quantitative content.\n\n${text.slice(0, 50000)}`
  : `Extract all testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}`,
```

### 3D. Make ClaimEvaluator requirement-aware

**File:** `src/verification/ClaimEvaluator.ts`

Change `evaluateAll` signature:

```typescript
async evaluateAll(
  claims: ExtractedClaim[],
  fullText: string,
  options?: { requirementText?: string | null },
): Promise<{ evaluations: ClaimEvaluation[]; scores: Map<string, number> }> {
  const requirementText = options?.requirementText ?? null;
```

Pass to `evaluateClaim`:

```typescript
const evaluation = await this.evaluateClaim(claim, fullText, requirementText);
```

In `evaluateClaim`, add requirement-triggered math analysis:

```typescript
async evaluateClaim(
  claim: ExtractedClaim,
  fullText: string,
  requirementText?: string | null,
): Promise<ClaimEvaluation> {
  const evaluation: ClaimEvaluation = { claimId: claim.claimId };

  const requiresMathAnalysis = requirementText
    ? /\b(math|formula|quantitative|calcul|equation|model|simulat|stress.?test|volatil)/i.test(requirementText)
    : false;

  if (claim.mathematicalProofPresent || (requiresMathAnalysis && this.hasQuantitativeContent(claim))) {
    evaluation.mathValidity = await this.evaluateMathSanity(claim, fullText, requirementText);
  }

  // ... rest of existing evaluation logic unchanged ...
}
```

Add helper:

```typescript
private hasQuantitativeContent(claim: ExtractedClaim): boolean {
  return /\d+%|\d+\.\d+|formula|equation|ratio|delta|hedge|rate|collateral|threshold|margin/i.test(
    claim.claimText + ' ' + claim.statedEvidence
  );
}
```

Modify `evaluateMathSanity` to accept optional requirement context:

```typescript
private async evaluateMathSanity(
  claim: ExtractedClaim,
  fullText: string,
  requirementText?: string | null,
): Promise<MathValidity> {
  const system = requirementText
    ? `You are a mathematical auditor for DeFi protocols. The buyer requested: "${requirementText}". Evaluate the mathematical validity of this claim in that context. Analyze whether the quantitative assertions hold and whether the mathematical model is sound. Reply with VALID, FLAWED, or UNVERIFIABLE, and explain your reasoning.`
    : 'Evaluate whether the mathematical proof in the document supports the claim. Reply with VALID, FLAWED, or UNVERIFIABLE.';
  // ... rest uses `system` variable ...
```

### 3E. Analysis synthesis in JobRouter

**File:** `src/acp/JobRouter.ts`

Add `anthropicClient` to deps:

```typescript
export interface JobRouterDeps {
  // ... existing deps ...
  anthropicClient?: { messages: { create: (params: unknown) => Promise<unknown> } };
}
```

**File:** `src/WpvService.ts` — in `initFromRuntime`, pass the client:

```typescript
const anthropicClient = createAnthropicClient(anthropicApiKey);
claimExtractor = new ClaimExtractor({ client: anthropicClient, costTracker });
claimEvaluator = new ClaimEvaluator({ client: anthropicClient, costTracker });

const jobRouter = new JobRouter({
  ...existing deps...,
  anthropicClient,  // ← ADD
});
```

**In JobRouter**, add shared synthesis method:

```typescript
private async generateSynthesis(
  requirementText: string,
  projectName: string,
  claims: ExtractedClaim[],
  documentText: string,
): Promise<string | null> {
  if (!this.deps.anthropicClient) return null;

  const model = process.env.WPV_MODEL || 'claude-sonnet-4-20250514';
  try {
    const response = await (this.deps.anthropicClient as { messages: { create: (p: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number } }> } }).messages.create({
      model,
      max_tokens: 2048,
      system: 'You are a DeFi protocol analyst. Based on the extracted claims and source document, provide a focused technical analysis that directly addresses the buyer\'s question. Be specific and quantitative where possible. If the document lacks sufficient data, state what is missing.',
      messages: [{
        role: 'user',
        content: `Buyer's requirement: "${requirementText}"\n\nProject: ${projectName}\n\nExtracted claims:\n${claims.map(c => `- [${c.category}] ${c.claimText} (evidence: ${c.statedEvidence})`).join('\n')}\n\nSource document excerpt:\n${documentText.slice(0, 20000)}\n\nProvide a focused analysis addressing the buyer's specific question.`,
      }],
    });

    // Track cost regardless of response content shape
    this.deps.costTracker.recordUsage(
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        return block.text;
      }
    }
  } catch (err) {
    log.warn('Analysis synthesis failed', { projectName, error: (err as Error).message });
  }
  return null;
}
```

**Call it in both `handleVerifyWhitepaper` and `handleFullVerification`**, after L3 evaluation, before report generation:

```typescript
// After L3, before report:
let analysisSynthesis: string | null = null;
if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil)/i.test(requirementText)) {
  analysisSynthesis = await this.generateSynthesis(requirementText, projectName, claims, resolved.text);
}

// After report generation:
if (analysisSynthesis) {
  report.logicSummary = analysisSynthesis;
}
```

---

## Plugin-ACP Deployment (cross-repo change)

Fix 3A modifies `plugin-acp/src/AcpService.ts`. Since plugin-acp is a private repo:

```bash
# Local: edit AcpService.ts
# SCP to VPS:
scp -i C:\Users\kidco\.ssh\WhitepaperGrey.pem plugin-acp/src/AcpService.ts ubuntu@44.243.254.19:/opt/grey/plugin-acp/src/AcpService.ts
# On VPS:
cd /opt/grey/plugin-acp && bun run build
# dist is SYMLINKED — no copy needed
pm2 restart grey
```

---

## Self-Audit

### Issue A: ClaimExtractor signature — options object

**Resolved.** All call sites use positional `(text, name)` today — they don't need to change. New calls use `(text, name, { requirementText })`. The `maxRetries` parameter moves into the options object. No existing call site passes `maxRetries` explicitly (all use the default), so this is backward-compatible.

### Issue B: anthropicClient type in JobRouterDeps

**Resolved.** Typed as `{ messages: { create: (params: unknown) => Promise<unknown> } }` — minimal interface, matches our `anthropicFetchClient`. Optional field — synthesis gracefully returns null when client is absent.

### Issue C: rawContent already exists on OfferingJobInput

**Key v2 discovery.** The `OfferingJobInput` interface at `plugin-acp/src/types.ts:38` already has `rawContent?: string`. It's just never populated. The AcpService change is a one-line addition to both the REQUEST and TRANSACTION phase input construction. No type changes needed in plugin-acp.

### Issue D: WpvService handler type mismatch

**Problem:** WpvService's handler is typed as `(input: { requirement: Record<string, unknown> })`. AcpService passes `OfferingJobInput` which has more fields. TypeScript allows this (structural typing — OfferingJobInput satisfies the narrower type), but `rawContent` isn't accessible because the handler type doesn't declare it.

**Fix:** Widen the handler type to `{ requirement: Record<string, unknown>; rawContent?: string }`. This is the minimal widening — doesn't need the full OfferingJobInput type (which would create a dependency from plugin-wpv on plugin-acp's types).

### Issue E: Empty Address DB cleanup

**Scoped cleanup after Fix 1 deploy.** Delete whitepaper + verification + claims where `project_name = 'Empty Address'`. Explicit, not a blanket wipe.

### Issue F: Synthesis cost

One additional Sonnet call per requirement-aware job. ~$0.07 per call. Only fires when `requirementText` exists AND matches analytical keywords. Standard structured requests are unaffected.

### Issue G: Both handlers need synthesis

**Confirmed.** `generateSynthesis` is a shared private method. Called from both `handleVerifyWhitepaper` and `handleFullVerification`. Same code, no duplication.

### Issue H: Phased deployment (v2 addition)

Fix 1+2 are low-risk validation/map changes. Deploy and verify before touching Fix 3. If Fix 3 introduces regressions, revert its commits while keeping Fix 1+2. This limits blast radius.

---

## DB Cleanup (after Fix 1 deploy)

```sql
-- Remove "Empty Address" entries created during eval 25
DELETE FROM autognostic.wpv_claims WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name = 'Empty Address'
);
DELETE FROM autognostic.wpv_verifications WHERE whitepaper_id IN (
  SELECT id FROM autognostic.wpv_whitepapers WHERE project_name = 'Empty Address'
);
DELETE FROM autognostic.wpv_whitepapers WHERE project_name = 'Empty Address';
```

---

## Files Changed

| File | Repo | Change |
|------|------|--------|
| `src/WpvService.ts` | plugin-wpv | NON_MEANINGFUL_NAMES + ADDRESS_DESCRIPTOR_PATTERN; handler type widened to include rawContent; attach _requirementText; pass anthropicClient to JobRouter deps |
| `src/discovery/WebSearchFallback.ts` | plugin-wpv | Uniswap v4/v3 version-specific entries before generic |
| `src/verification/ClaimExtractor.ts` | plugin-wpv | Options object signature; requirement-aware user prompt |
| `src/verification/ClaimEvaluator.ts` | plugin-wpv | Options object signature; requirement-triggered math analysis; requirement-aware math sanity prompt; hasQuantitativeContent helper |
| `src/acp/JobRouter.ts` | plugin-wpv | extractRequirementText; runL1L2 gets requirementText; evaluateAll gets requirementText; generateSynthesis shared method; anthropicClient in deps |
| `src/AcpService.ts` | plugin-acp | Populate rawContent on OfferingJobInput in both REQUEST and TRANSACTION phases |

---

## DB Rules (reminder)

- **NO wipes** of `wpv_claims`, `wpv_verifications`, `wpv_whitepapers` without explicit Forces approval
- The "Empty Address" cleanup above is explicitly scoped and approved
- Current state: 77+ whitepapers (plus eval 25 additions)

---

*Forces v1 approved. v2 corrections by Kovsky — 6 fixes, no architectural changes. Implement in order: Fix 1 → Fix 2 → checkpoint deploy → Fix 3 → full deploy.*
