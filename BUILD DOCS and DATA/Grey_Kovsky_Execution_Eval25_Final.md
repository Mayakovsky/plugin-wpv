# Kovsky Execution Plan — Eval 25 Final Push (v1)

> **Source:** Forces + Claude Opus context window
> **Date:** 2026-04-05
> **Goal:** Fix remaining 4 eval 25 failures. 12/16 → 16/16.
> **Depends on:** Eval 24 recovery plan fully deployed (confirmed)

---

## The 4 Failures

| # | Failure | Root Cause | Fix |
|---|---------|-----------|-----|
| F1+F4 | "Empty Address" + zero address accepted → leaks into briefing | Burn-address soft-strip too lenient for placeholder project names | Placeholder name detection |
| F2 | Uniswap v4 requested → v2 data served | No version-aware document selection in known URL map or lookup | Version-specific map entries + version-aware matching |
| F3 | Ethena math eval → surface scan (no quantitative analysis) | Pipeline ignores buyer's requirement; ClaimExtractor runs generic extraction | Requirement-aware pipeline: pass requirement text to L2/L3 |

---

## Execution Order

1. **Fix 1: Placeholder name detection** (LOW — validation logic)
2. **Fix 2: Version-aware document selection** (MEDIUM — map + lookup changes)
3. **Fix 3: Requirement-aware pipeline** (MEDIUM-HIGH — prompt engineering + plumbing)
4. **Verification + deploy**

---

## Fix 1: Placeholder Name Detection

**File:** `src/WpvService.ts` — in the burn-address check block within `validateTokenAddress`

**Problem:** When the evaluator sends `{"project_name": "Empty Address", "token_address": "0x0000...0000", "document_url": "https://whitepaper.virtuals.io/"}`, Grey's burn-address logic checks `hasDocUrl` (true) and `hasMeaningfulName` (true — "Empty Address" is not in `NON_MEANINGFUL_NAMES`). So it soft-strips the address and proceeds. Grey then analyzes the Virtuals whitepaper under the name "Empty Address" and gives it a PASS.

**Fix:** Expand `NON_MEANINGFUL_NAMES` to include placeholder/test project names. Also add a secondary check: if the project name contains a word that indicates it's describing the ADDRESS rather than the PROJECT, hard-reject.

Find the `NON_MEANINGFUL_NAMES` constant in the burn-address block:

```typescript
const NON_MEANINGFUL_NAMES = ['empty', 'unknown', 'none', 'test', 'n/a', 'null', 'undefined', ''];
```

Replace with:

```typescript
const NON_MEANINGFUL_NAMES = [
  'empty', 'unknown', 'none', 'test', 'n/a', 'null', 'undefined', '',
  'placeholder', 'dummy', 'sample', 'example', 'fake', 'zero',
  'test token', 'test project', 'empty address', 'null address',
  'zero address', 'burn address', 'dead address',
];
```

**Important:** The comparison is `NON_MEANINGFUL_NAMES.includes(projectName.toLowerCase())`. This is an exact match, so multi-word entries like `'empty address'` will match the full project name `"Empty Address"` after `.toLowerCase()`.

**Also add a regex guard** for names that describe address properties rather than project properties. After the `NON_MEANINGFUL_NAMES` check, add:

```typescript
// Reject names that describe the token_address rather than the project
// (e.g., "Empty Address", "Zero Contract", "Null Token")
const ADDRESS_DESCRIPTOR_PATTERN = /\b(empty|zero|null|dead|burn|void)\s+(address|contract|token|wallet)\b/i;
if (ADDRESS_DESCRIPTOR_PATTERN.test(projectName)) {
  const err = new Error(`Invalid: project name '${projectName.slice(0, 50)}' describes an address, not a project`);
  err.name = 'InputValidationError';
  throw err;
}
```

**Placement:** This regex guard goes INSIDE the burn-address detection block, BEFORE the soft-strip decision. When burn address + address-descriptor name → hard reject, even if document_url is present.

**Why both?** The `NON_MEANINGFUL_NAMES` list catches exact matches like "Empty Address". The regex catches variations the evaluator might try in future ("Zero Token Contract", "Null Address Project", etc.).

---

## Fix 2: Version-Aware Document Selection

**Two changes:**

### 2A. Version-specific entries in known URL map

**File:** `src/discovery/WebSearchFallback.ts`

The current map has one entry: `[/\buniswap\b/i, 'https://uniswap.org/whitepaper-v3.pdf']`. This matches "Uniswap", "Uniswap V3", "Uniswap v4" — all resolve to the v3 (actually v2) whitepaper.

**Fix:** Add version-specific entries BEFORE the generic entry. The regex engine tests entries in order and returns the first match. Version-specific patterns match first; the generic entry is the fallback.

```typescript
// ── Uniswap (version-specific entries first, generic last) ──
[/\buniswap\s+v4\b/i, 'https://docs.uniswap.org/contracts/v4/overview'],
[/\buniswap\s+v3\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],
[/\buniswap\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],  // fallback: latest stable
```

Kov must verify `https://docs.uniswap.org/contracts/v4/overview` with curl. If it returns substantive content about hooks/singleton architecture, use it. If it's a landing page, the DocsSiteCrawler will deepen it. If it 404s, search for the actual v4 docs URL.

**Pattern for future version-specific entries:** Any project where different versions have fundamentally different architectures should get version-specific entries. For now, Uniswap is the only one the evaluator has tested.

### 2B. Version-aware plain text parsing

**File:** `src/WpvService.ts` — in `extractFromUnknownFields`

The current protocol regex extracts "Uniswap" and stops. It optionally captures a version suffix (`\s*(v\d+)?`) but this is part of the same capture group and gets trimmed. The requirement "Deep technical audit of Uniswap v4 hooks architecture" produces `project_name = "Uniswap"` with the "v4" lost.

**Fix:** The regex already has `\s*(v\d+)?` at the end. Check whether the capture group properly includes it. The match result should include the full string with version:

```typescript
if (projectMatch) {
  requirement.project_name = projectMatch[0].trim();  // This should be "Uniswap v4"
}
```

`projectMatch[0]` is the full match (the entire regex). If the regex `\b(Uniswap)\s*(v\d+)?\b` matches "Uniswap v4", then `projectMatch[0]` = "Uniswap v4". **Verify this is working correctly.** If it only captures "Uniswap", the version-specific known URL map entry won't match.

Test case:
```typescript
const text = "Deep technical audit of Uniswap v4 hooks architecture";
const match = text.match(/\b(Uniswap)\s*(v\d+)?\b/i);
// match[0] should be "Uniswap v4"
// If it's only "Uniswap", fix the regex to include the version in the full match
```

### 2C. Version-aware known URL map lookup

**File:** `src/discovery/WebSearchFallback.ts` — in `searchWhitepaper`

Currently, the known URL map is tested with `pattern.test(projectName)`. If `projectName` = "Uniswap v4", the first entry `\buniswap\s+v4\b` matches, returning the v4 docs URL. This works correctly IF the version-specific entry comes before the generic entry (which it does per 2A).

The existing version-strip fallback at the bottom of `searchWhitepaper` strips versions and retries. This is fine — if "Uniswap v4" doesn't match any specific entry (unlikely after 2A), it strips to "Uniswap" and matches the generic entry. The fallback is a safety net, not the primary path.

**No code change needed here** — ordering the map entries correctly (2A) handles it.

---

## Fix 3: Requirement-Aware Pipeline

This is the most important change. It makes Grey's analysis responsive to what the buyer actually asked for.

### 3A. Preserve requirement text through the pipeline

**The problem:** AcpService.parseRequirement() converts plain text like "Mathematical evaluation of the Ethena USDe delta-neutral stability mechanism" into `{project_name: "Ethena", token_address: "0x57e..."}`. The analytical question — the WHAT and HOW — is lost.

**Fix:** When the input is plain text, preserve the original text as a new field `_requirementText` on the parsed requirement object. When the input is structured JSON, concatenate all non-standard string fields as the requirement text.

**File:** `src/WpvService.ts` or wherever `AcpService.parseRequirement` feeds into the validator.

In `registerWithAcp`, modify the handler to extract and attach requirement text:

```typescript
const handler = async (input: { requirement: Record<string, unknown>; rawRequirement?: string }) => {
  if (!this.deps?.jobRouter) {
    return { error: 'wpv_not_ready', message: 'WPV JobRouter not initialized' };
  }

  // Validate again in handler (defense in depth)
  await WpvService.validateTokenAddress(offeringId, input.requirement);

  // Preserve the original requirement text for requirement-aware analysis
  // For plain text: the raw text is the requirement
  // For structured JSON: concatenate non-standard fields as context
  if (input.rawRequirement && typeof input.rawRequirement === 'string') {
    input.requirement._requirementText = input.rawRequirement;
  }

  return this.deps.jobRouter.handleJob(offeringId, input.requirement);
};
```

**Check AcpService.parseRequirement** — Kov needs to verify whether the raw plain text is available in the handler. If AcpService doesn't pass the original text, modify it to include the raw requirement alongside the parsed fields. The simplest approach: if `parseRequirement` detects plain text (not JSON), attach the original string as `_rawText` on the parsed output.

**If AcpService doesn't expose raw text and can't be easily modified:** Use the input fields themselves to reconstruct intent. When `input` has string fields beyond `project_name`/`token_address`/`document_url`/`date`, concatenate them as requirement context. This is less clean but works for the eval scenario.

**Fallback reconstruction (if AcpService can't pass raw text):**

```typescript
// In JobRouter.handleJob or handleFullVerification:
private extractRequirementText(input: Record<string, unknown>): string | null {
  // If explicitly set by handler
  if (typeof input._requirementText === 'string') return input._requirementText;

  // Reconstruct from non-standard string fields
  const standardKeys = new Set(['project_name', 'token_address', 'document_url', 'date', '_requirementText', '_triggerSource']);
  const extraText = Object.entries(input)
    .filter(([key, value]) => typeof value === 'string' && !standardKeys.has(key))
    .map(([, value]) => value)
    .join(' ');

  return extraText.length > 10 ? extraText : null;
}
```

### 3B. Pass requirement text to runL1L2

**File:** `src/acp/JobRouter.ts`

Add `requirementText` parameter to `runL1L2`:

**Current:**
```typescript
private async runL1L2(documentUrl: string, projectName: string, tokenAddress?: string | null)
```

**New:**
```typescript
private async runL1L2(documentUrl: string, projectName: string, tokenAddress?: string | null, requirementText?: string | null)
```

Pass it to ClaimExtractor:

**Current:**
```typescript
const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName);
```

**New:**
```typescript
const claims = await this.deps.claimExtractor.extractClaims(resolved.text, projectName, undefined, requirementText);
```

Update all call sites in `handleVerifyWhitepaper` and `handleFullVerification` to pass the requirement text:

```typescript
const requirementText = this.extractRequirementText(input);
// ... later ...
const { resolved, analysis, structuralScore, hypeTechRatio, claims, wp } = await this.runL1L2(documentUrl, projectName, requestedTokenAddress, requirementText);
```

### 3C. Make ClaimExtractor requirement-aware

**File:** `src/verification/ClaimExtractor.ts`

Add `requirementText` parameter to `extractClaims`:

**Current:**
```typescript
async extractClaims(text: string, projectName: string, maxRetries = 2): Promise<ExtractedClaim[]> {
```

**New:**
```typescript
async extractClaims(text: string, projectName: string, maxRetries = 2, requirementText?: string | null): Promise<ExtractedClaim[]> {
```

Modify the user message to include requirement context when available:

**Current:**
```typescript
content: `Extract all testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}`,
```

**New:**
```typescript
content: requirementText
  ? `The buyer has requested: "${requirementText}"\n\nExtract all testable claims from this ${projectName} whitepaper, with SPECIAL FOCUS on claims and content relevant to the buyer's request. If the request mentions mathematical evaluation, formulas, or quantitative analysis, prioritize extracting mathematical definitions, equations, model parameters, and quantitative assertions — not just prose descriptions. Tag these with mathematicalProofPresent: true if they contain any formal/quantitative content.\n\n${text.slice(0, 50000)}`
  : `Extract all testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}`,
```

**Why this works:** The system prompt stays generic (it defines what a claim is, the categories, the schema). The user message adds the buyer's specific analytical focus. Sonnet will still extract all claims, but will pay special attention to claims matching the buyer's question. For the Ethena case, Sonnet will now prioritize "delta hedging," "funding rates," "collateral ratios" — the quantitative content that was previously extracted as generic prose claims.

### 3D. Make ClaimEvaluator requirement-aware

**File:** `src/verification/ClaimEvaluator.ts`

Add `requirementText` parameter to `evaluateAll`:

**Current:**
```typescript
async evaluateAll(claims: ExtractedClaim[], fullText: string): Promise<{
```

**New:**
```typescript
async evaluateAll(claims: ExtractedClaim[], fullText: string, requirementText?: string | null): Promise<{
```

Pass it to `evaluateClaim`:

```typescript
for (const claim of claims) {
  const evaluation = await this.evaluateClaim(claim, fullText, requirementText);
  evaluations.push(evaluation);
}
```

In `evaluateClaim`, when a requirement mentions "mathematical" or "quantitative" and a claim involves quantitative content, force the math sanity check even if `mathematicalProofPresent` is false:

```typescript
async evaluateClaim(claim: ExtractedClaim, fullText: string, requirementText?: string | null): Promise<ClaimEvaluation> {
  const evaluation: ClaimEvaluation = { claimId: claim.claimId };

  // Math sanity — now triggers on requirement-requested math analysis too
  const requiresMathAnalysis = requirementText
    ? /\b(math|formula|quantitative|calcul|equation|model|simulat|stress.?test|volatil)/i.test(requirementText)
    : false;

  if (claim.mathematicalProofPresent || (requiresMathAnalysis && this.hasQuantitativeContent(claim))) {
    evaluation.mathValidity = await this.evaluateMathSanity(claim, fullText, requirementText);
  }

  // ... rest unchanged ...
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

Modify `evaluateMathSanity` to include requirement context:

**Current system prompt:**
```
'Evaluate whether the mathematical proof in the document supports the claim. Reply with VALID, FLAWED, or UNVERIFIABLE.'
```

**New system prompt (when requirementText present):**
```typescript
const system = requirementText
  ? `You are a mathematical auditor for DeFi protocols. The buyer requested: "${requirementText}". Evaluate the mathematical validity of this claim in context of that request. Analyze whether the quantitative assertions hold, whether the mathematical model is sound, and whether there are gaps in the formal analysis. Reply with VALID, FLAWED, or UNVERIFIABLE, and explain your reasoning.`
  : 'Evaluate whether the mathematical proof in the document supports the claim. Reply with VALID, FLAWED, or UNVERIFIABLE.';
```

### 3E. Add analysis synthesis to the report (Optional but recommended)

**File:** `src/acp/JobRouter.ts` — in `handleFullVerification`, after L3 evaluation

When a requirement text exists and contains analytical keywords, add a focused analysis summary. This is the "L4 synthesis" — one additional Sonnet call that produces the requirement-specific analysis the evaluator expects.

```typescript
// After L3 evaluation, before report generation:
let analysisSynthesis: string | null = null;
if (requirementText && /\b(math|evaluat|audit|analys|mechan|architect|impact|stress|volatil)/i.test(requirementText)) {
  try {
    const synthesisResponse = await this.deps.claimExtractor.client.messages.create({
      model: WPV_MODEL,
      max_tokens: 2048,
      system: `You are a DeFi protocol analyst. Based on the extracted claims and the source document, provide a focused technical analysis that directly addresses the buyer's question. If the document lacks sufficient data to fully address the question, state what is missing. Be specific and quantitative where possible.`,
      messages: [{
        role: 'user',
        content: `Buyer's requirement: "${requirementText}"\n\nProject: ${projectName}\n\nExtracted claims:\n${claims.map(c => `- [${c.category}] ${c.claimText} (evidence: ${c.statedEvidence})`).join('\n')}\n\nSource document excerpt:\n${resolved.text.slice(0, 20000)}\n\nProvide a focused analysis addressing the buyer's specific question.`,
      }],
      tools: [],
    });

    // Extract text response
    for (const block of synthesisResponse.content) {
      if (block.type === 'text' && block.text) {
        analysisSynthesis = block.text;
        break;
      }
    }

    this.deps.costTracker.recordUsage(
      synthesisResponse.usage.input_tokens,
      synthesisResponse.usage.output_tokens,
    );
  } catch (err) {
    log.warn('Analysis synthesis failed', { projectName, error: (err as Error).message });
  }
}
```

**Note on `this.deps.claimExtractor.client`:** The `AnthropicClient` is currently private to ClaimExtractor. Either:
1. Expose it via a getter: `get client() { return this.client; }` in ClaimExtractor
2. Pass the AnthropicClient directly to JobRouter's deps
3. Create a lightweight `AnalysisSynthesizer` class that takes the client

Option 1 is quickest. Option 3 is cleanest. Forces' call, but for graduation speed, option 1.

**Add synthesis to the report:**

The `logicSummary` field in the report is currently generated by ReportGenerator. When `analysisSynthesis` exists, append it or replace logicSummary:

```typescript
const report = this.deps.reportGenerator.generateFullVerification(
  { /* ... existing params ... */ },
  claims, evaluations, wp, scores, analysis,
);

// Attach requirement-specific analysis if available
if (analysisSynthesis) {
  report.logicSummary = analysisSynthesis;
}
```

This is the field the evaluator reads to determine whether Grey actually answered the question.

---

## Self-Audit

### Issue A: ClaimExtractor signature change — backward compatibility

**Problem:** Adding `requirementText` parameter to `extractClaims` changes the signature. All existing call sites pass `(text, projectName)` or `(text, projectName, maxRetries)`.

**Resolution:** The new parameter is optional with default `null`. Existing call sites don't need to change — only the `runL1L2` call site adds the new parameter. The `maxRetries` parameter position stays the same (3rd). `requirementText` is 4th.

Wait — there's a positional conflict. Current: `extractClaims(text, projectName, maxRetries = 2)`. If we add `requirementText` as 4th, it works. But if someone calls `extractClaims(text, name, requirementText)` they'd set maxRetries to the string. 

**Fix:** Restructure the signature to use an options object for optional params:

```typescript
async extractClaims(
  text: string,
  projectName: string,
  options?: { maxRetries?: number; requirementText?: string | null },
): Promise<ExtractedClaim[]> {
  const maxRetries = options?.maxRetries ?? 2;
  const requirementText = options?.requirementText ?? null;
```

Update all call sites:
- `this.deps.claimExtractor.extractClaims(resolved.text, projectName)` → no change needed (options is optional)
- `this.deps.claimExtractor.extractClaims(resolved.text, wpName)` → no change needed
- The new requirement-aware call: `this.deps.claimExtractor.extractClaims(resolved.text, projectName, { requirementText })`

Same pattern for ClaimEvaluator.evaluateAll:
```typescript
async evaluateAll(
  claims: ExtractedClaim[],
  fullText: string,
  options?: { requirementText?: string | null },
): Promise<{ evaluations: ClaimEvaluation[]; scores: Map<string, number> }>
```

### Issue B: Analysis synthesis accesses ClaimExtractor.client (private)

**Problem:** JobRouter needs the Anthropic client to make the synthesis call, but it's private inside ClaimExtractor.

**Resolution:** Add the Anthropic client to JobRouterDeps directly. It's already instantiated in WpvService.initFromRuntime. Pass it to JobRouter alongside the existing deps.

```typescript
// In WpvService.initFromRuntime:
const jobRouter = new JobRouter({
  ...existing deps...,
  anthropicClient: anthropicClient,  // add this
});
```

```typescript
// In JobRouter:
export interface JobRouterDeps {
  ...existing deps...
  anthropicClient?: AnthropicClient;  // optional — synthesis is optional
}
```

This is cleaner than exposing ClaimExtractor's private client.

### Issue C: Requirement text for structured JSON requests

**Problem:** The Ethena request came as plain text ("Mathematical evaluation of..."). But the Uniswap v4 request also came as plain text. For structured JSON requests like `{"project_name": "Ethena", "token_address": "0x..."}`, there IS no requirement text — the buyer just wants a standard verification. The pipeline should only activate requirement-aware mode when there's actual analytical context.

**Resolution:** `extractRequirementText` returns null for structured JSON with only standard keys. The requirement-aware prompt additions only fire when `requirementText` is non-null. Standard structured requests are completely unaffected.

### Issue D: Version-specific entries — ordering matters

**Problem:** The known URL map is tested with a for-loop that returns on first match. Version-specific entries MUST come before generic entries.

**Resolution:** Confirmed in the plan — `\buniswap\s+v4\b` is listed before `\buniswap\b`. The more specific regex matches first. If the project name is "Uniswap v4", the v4 entry matches. If it's just "Uniswap", the v4 entry fails (no "v4" present) and the generic entry matches. Correct.

### Issue E: The "Empty Address" fix doesn't prevent the briefing contamination

**Problem:** F1 and F4 are linked. F1 is the acceptance of "Empty Address". F4 is the briefing including it. But F4 only fails because the DB now contains an "Empty Address" entry from F1's acceptance during this eval run. Fixing F1 prevents future contamination, but stale entries might remain.

**Resolution:** After deploying Fix 1, Kov should check the DB for any "Empty Address" entries and delete them. This is a targeted cleanup, not a wipe: `DELETE FROM autognostic.wpv_whitepapers WHERE project_name = 'Empty Address'` (with CASCADE to claims/verifications). Explicit, scoped, no blanket wipe.

### Issue F: Synthesis cost — one additional Sonnet call per requirement-aware job

**Problem:** The analysis synthesis (3E) adds one more Sonnet API call per full_technical_verification job when requirement text exists. This increases cost and latency.

**Resolution:** Acceptable. At $0.03/job test pricing, the margin is tight but the synthesis call uses ~20k input tokens + ~2k output tokens = ~$0.07. At production pricing ($3.00/job), this is trivially absorbed. The synthesis only fires when `requirementText` exists AND contains analytical keywords — standard structured requests skip it entirely.

### Issue G: Analysis synthesis for verify_project_whitepaper too?

**Problem:** The plan only adds synthesis to `handleFullVerification`. But the Ethena math failure could also happen on `verify_project_whitepaper` if the evaluator sends a plain-text math request to that offering.

**Resolution:** Add the same synthesis logic to `handleVerifyWhitepaper`. The code is identical — extract requirementText, pass to runL1L2 and evaluateAll, add synthesis call after L3. Share the synthesis code via a private method `generateSynthesis(requirementText, projectName, claims, resolved)` to avoid duplication.

---

## DB Cleanup (after Fix 1 deploy)

```sql
-- Remove "Empty Address" entries created during eval 25
-- Forces approval: explicitly scoped, not a blanket wipe
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

| File | Change |
|------|--------|
| `src/WpvService.ts` | Expanded NON_MEANINGFUL_NAMES + ADDRESS_DESCRIPTOR_PATTERN regex |
| `src/discovery/WebSearchFallback.ts` | Uniswap v4 entry added before generic entry |
| `src/verification/ClaimExtractor.ts` | New `options` parameter with `requirementText`; requirement-aware user prompt |
| `src/verification/ClaimEvaluator.ts` | New `options` parameter with `requirementText`; math check triggers on requirement context; requirement-aware math sanity prompt |
| `src/acp/JobRouter.ts` | `extractRequirementText` method; `runL1L2` gets `requirementText` param; synthesis call after L3; `generateSynthesis` shared method; `anthropicClient` in deps |
| `src/WpvService.ts` (init) | Pass `anthropicClient` to JobRouter deps |
| `src/types.ts` | No changes needed (ExtractedClaim schema unchanged) |

---

## Test Strategy

- Existing 303 tests should pass unchanged (options params are optional)
- Add test: "Empty Address" + zero address → hard reject
- Add test: "Zero Token" + zero address → hard reject
- Add test: Known URL map returns v4 URL for "Uniswap v4", generic for "Uniswap"
- Add test: ClaimExtractor with requirementText includes requirement in prompt
- Add test: ClaimExtractor without requirementText uses original prompt

---

## DB Rules (reminder)

- **NO wipes** of `wpv_claims`, `wpv_verifications`, `wpv_whitepapers` without explicit Forces approval
- The "Empty Address" cleanup above is explicitly scoped and approved
- Current state: 77+ whitepapers, 77+ verifications, 337+ claims (plus eval 25 additions)

---

*Pending Forces review. Implement in order: Fix 1 → Fix 2 → Fix 3 → verify + deploy.*
