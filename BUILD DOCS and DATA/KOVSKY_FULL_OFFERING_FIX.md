# KOVSKY INSTRUCTION SET — Full Offering Graduation Fix

**Date:** 2026-03-28
**Priority:** CRITICAL — evaluator now tests ALL offerings. Grey needs perfect scores across all 4.
**Context:** `project_legitimacy_scan` is 4/4 PERFECT. The other 3 offerings failed. This instruction set covers all fixes.

---

## Read These First

```
C:\Users\kidco\dev\eliza\plugin-wpv\CLAUDE.md
C:\Users\kidco\dev\eliza\plugin-wpv\heartbeat.md
C:\Users\kidco\dev\eliza\plugin-acp\heartbeat.md
```

---

## Current Scores

| Offering | Score | Status |
|----------|-------|--------|
| project_legitimacy_scan | **4/4** | ✅ PERFECT — do not touch |
| verify_project_whitepaper | 0/4 | ❌ claimExtractor null + no URL validation |
| full_technical_verification | 2/6 | ❌ plain text reqs crash + L2/L3 not running |
| daily_technical_briefing | 0/7 | ❌ wrong date + no date validation + empty content |

---

## WORKSTREAM 1: ClaimExtractor Null Reference (KEYSTONE — do this first)

**Symptom:** `verify_project_whitepaper` and `full_technical_verification` deliverables return:
```json
{"error": "null is not an object (evaluating 'this.deps.claimExtractor.extractClaims')", "verdict": "INSUFFICIENT_DATA"}
```

**Root cause:** When JobRouter is instantiated through the ACP/WebSocket path (via WpvService), the `claimExtractor` dependency is not being injected. L1 deps work (project_legitimacy_scan proves this), but L2/L3 deps are null.

**Fix:** Trace WpvService initialization. Find where JobRouter deps are assembled. Confirm that ALL of these are wired in:
- `structuralAnalyzer` ✅ (works)
- `tieredDiscovery` ✅ (works)
- `claimExtractor` ❌ (null — L2 crashes)
- `claimEvaluator` ❌ (likely also null — L3 untested)
- `cryptoResolver` — check
- `reportGenerator` ✅ (works)
- `costTracker` ✅ (works)
- `whitepaperRepo` ✅ (works)
- `verificationsRepo` ✅ (works)

The fix is likely: `claimExtractor` not being created in WpvService, or created but not passed to JobRouter constructor, or requires an LLM client that isn't available in the ACP path.

**Verification — must confirm ALL of these before moving on:**
1. `verify_project_whitepaper` with a known token returns claims > 0
2. `full_technical_verification` with a known token returns claims > 0 AND evaluations > 0
3. Both `claimExtractor` and `claimEvaluator` are non-null in logs at startup

**This unblocks WS4 and WS5. Do not proceed until confirmed.**

---

## WORKSTREAM 2: Plain Text Requirement Parsing (affects ALL offerings)

**Failed tests (full_technical_verification):**
- `"Please perform a full technical verification for Compound Finance (0xc00e94cb662c3520282e6f5717214004a7f26888). Focus on mathematical validity and internal consistency."` → Grey rejected ("Invalid JSON"). Evaluator expected accept.
- `"Evaluate Morpho Blue's whitepaper... Token: 0x58D97B57978945534969c2B2"` → Grey rejected ("Invalid JSON"). Evaluator expected accept.

**Root cause:** Grey's `JSON.parse()` throws on plain text and rejects the job. The evaluator sends natural language requirements to some offerings.

**Fix location:** Create a shared `parseRequirement()` method in AcpService.ts, called by both `processJobAccept` and `processJobDeliver`:

```typescript
private parseRequirement(raw: unknown): { requirement: Record<string, unknown>; isPlainText: boolean } {
  // Try JSON first
  if (typeof raw === 'object' && raw !== null) {
    return { requirement: raw as Record<string, unknown>, isPlainText: false };
  }
  if (typeof raw === 'string') {
    try {
      return { requirement: JSON.parse(raw) as Record<string, unknown>, isPlainText: false };
    } catch {
      // JSON parse failed — extract address from plain text
      const evmMatch = raw.match(/\b(0x[0-9a-fA-F]{10,42})\b/);
      if (evmMatch) {
        const nameMatch = raw.match(/(?:for|verify|evaluate)\s+([A-Z][a-zA-Z\s]+?)(?:\s*\(|\s*\.|\s*Token|\s*,)/i);
        return {
          requirement: {
            token_address: evmMatch[1],
            project_name: nameMatch?.[1]?.trim() ?? 'Unknown',
            raw_instruction: raw,
          },
          isPlainText: true,
        };
      }
      // No 0x address found — reject
      return { requirement: {}, isPlainText: true };
    }
  }
  return { requirement: {}, isPlainText: false };
}
```

**CRITICAL — Only extract EVM addresses (0x-prefixed) from plain text.** Do NOT use a Solana base58 regex here — it would match ordinary English words like "implementation" or "mathematical."

**CRITICAL — Plain-text-extracted requirements must skip the strict address format validator.** The evaluator sent a truncated address (`0x58D97B57978945534969c2B2` — 26 hex chars, not 40) and expected Grey to ACCEPT. If the extracted address goes through the strict 42-char hex validator, it gets rejected. So: when `isPlainText === true`, skip the InputValidator's address format check. The NSFW/injection content filter should still run on all fields. The handler will process whatever address it gets and return INSUFFICIENT_DATA if it can't find a match.

**If no `0x` address is found in the text:** Reject with "no token address found in requirement."

---

## WORKSTREAM 3: Input Validation for verify_project_whitepaper

**Failed tests:**
- `document_url: "not-a-url"` — Grey accepted, should have rejected at REQUEST
- `document_url: "https://...googlelogo...png"` — Grey accepted, should have rejected at REQUEST

**Grey also returned:** `{"error": "missing_input", "message": "document_url and project_name are required"}` — but the schema doesn't mark `project_name` as required. Evaluator flagged this.

**Fixes:**

1. Add `document_url` validation to the InputValidator for `verify_project_whitepaper`:
```typescript
const docUrl = requirement?.document_url;
if (docUrl !== undefined && docUrl !== null && typeof docUrl === 'string') {
  const trimmedUrl = docUrl.trim();
  if (!/^https?:\/\/.+\..+/.test(trimmedUrl)) {
    throw new InputValidationError('Invalid document_url: must be a valid HTTP/HTTPS URL');
  }
  const lowerUrl = trimmedUrl.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|mp4|mp3|avi|mov)(\?.*)?$/.test(lowerUrl)) {
    throw new InputValidationError('Invalid document_url: must point to a document, not an image or media file');
  }
}
```

2. Make `project_name` optional on `verify_project_whitepaper`. If not provided, derive from token address or use "Unknown". Remove any error message that says it's required.

---

## WORKSTREAM 4: Daily Briefing Date Handling + Content Quality

**Failed tests — date problems:**
- Requested 2026-03-28, Grey returned 2026-03-29 (ignored the date parameter)
- `"invalid-date-format"` — accepted, should have rejected
- `"not-a-date"` — accepted, should have rejected
- `"2030-01-01"` — accepted, should have rejected (future date)

**Failed tests — content quality:**
- 9/10 projects had 0 claims, 0 evaluations. Evaluator: "unacceptable for a technical briefing."

**Three fixes:**

### 4A: Date validation in InputValidator

Register a validator for `daily_technical_briefing`:
```typescript
function validateBriefingInput(input: OfferingJobInput): void {
  const dateStr = input.requirement?.date;
  if (dateStr === undefined || dateStr === null) return; // no date = default to today

  if (typeof dateStr !== 'string') {
    throw new InputValidationError('Invalid date: must be a string in YYYY-MM-DD format');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new InputValidationError(`Invalid date format: expected YYYY-MM-DD, got '${dateStr}'`);
  }
  const parsed = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) {
    throw new InputValidationError(`Invalid date: '${dateStr}' is not a valid date`);
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsed > today) {
    throw new InputValidationError(`Invalid date: '${dateStr}' is in the future`);
  }
}
```

### 4B: Respect the requested date

The daily briefing handler currently ignores the `date` parameter. Fix it to:
1. Read `requirement.date` — if valid, query verifications for THAT date
2. If not provided, default to today
3. Return the requested date in the response `date` field, not today's date

### 4C: Only include projects with substantive data

The briefing returns L1-only results (0 claims) for most projects. Fix:
- Query verifications that have `claimCount > 0` for the requested date
- If fewer than 3 projects have claims, expand the window to the last 7 days
- If still fewer than 3, run live L2 on the top 2-3 projects by structuralScore (requires WS1 to be fixed first — claimExtractor must be non-null)
- Cap at 10 projects, but only include projects with actual content

A briefing with 3 well-analyzed projects beats 10 empty ones.

---

## Implementation Order

```
WS1 (claimExtractor null) → VERIFY L2+L3 WORK → WS2 through WS4 → full test → deploy
```

1. **WS1:** Fix dependency injection. Verify claimExtractor AND claimEvaluator are non-null. Test verify_project_whitepaper returns claims > 0 AND full_technical_verification returns evaluations > 0.
2. **WS2:** Add plain-text requirement fallback in AcpService.ts shared `parseRequirement()`. Plain-text-extracted addresses skip the format validator but still run content filters.
3. **WS3:** Add document_url validation + make project_name optional for verify_project_whitepaper.
4. **WS4:** Date validation + date passthrough + substantive content filtering for daily_technical_briefing.

---

## Pre-Flight Checks

Before starting, verify these prior fixes are in place:
- [ ] `await validator(input)` on line ~480 of AcpService.ts (not just `validator(input)`)
- [ ] Deliverable envelope `{ type: "object", value: result }` wrapping
- [ ] `respond(true)` instead of `accept()` alone
- [ ] No upsell text ("Submit via verify_project_whitepaper ($2.00)") anywhere in deliverables
- [ ] 4 offerings registered (tokenomics_sustainability_audit deleted)

If any of these are missing, fix them first.

---

## Build + Test + Deploy

```bash
# Local
cd C:\Users\kidco\dev\eliza\plugin-acp && bun run build && bun run test
cd C:\Users\kidco\dev\eliza\plugin-wpv && bun run build && bun run test
cd C:\Users\kidco\dev\eliza\wpv-agent && bun run build && bun run test

# Deploy to VPS
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"
cd /opt/grey/plugin-acp && git pull && bun run build
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && git pull && bun run build
pm2 restart grey
pm2 logs grey --lines 50
```

Verify in PM2 logs:
- "SDK phase constants loaded"
- "AcpService: Connected to ACP marketplace"
- 4 offering handlers registered
- claimExtractor and claimEvaluator initialized (no null warnings)

Update heartbeats. Push all repos. Request re-evaluation via Butler.

---

## Evaluator Test Patterns

### project_legitimacy_scan (4/4 — DO NOT TOUCH)
| Pattern | Expected | Our response |
|---------|----------|-------------|
| Valid EVM token (Aave, Uniswap) | accept + deliver | Live L1 ✅ |
| Invalid address / null address | reject at REQUEST | InputValidationError ✅ |

### verify_project_whitepaper (target: 4/4)
| Pattern | Expected | Our response |
|---------|----------|-------------|
| Valid token + valid document_url | accept + deliver with claims > 0 | L1+L2 (WS1) |
| Invalid document_url ("not-a-url") | reject at REQUEST | URL validation (WS3) |
| Non-document URL (image file) | reject at REQUEST | Extension check (WS3) |
| Missing project_name | accept — derive from token | Optional field (WS3) |

### full_technical_verification (target: 6/6)
| Pattern | Expected | Our response |
|---------|----------|-------------|
| Valid JSON with token | accept + deliver with claims + evaluations | L1+L2+L3 (WS1) |
| Plain text with embedded 0x address | accept + deliver | Extract address, skip format validator (WS2) |
| Plain text with truncated address | accept + deliver INSUFFICIENT_DATA | Extract, skip validator, handler returns best effort (WS2) |
| Nonsense / no address | reject at REQUEST | No 0x found → reject (WS2) |

### daily_technical_briefing (target: 7/7)
| Pattern | Expected | Our response |
|---------|----------|-------------|
| Valid date (YYYY-MM-DD) | accept + deliver for THAT date | Date passthrough (WS4) |
| No date (empty requirement) | accept + deliver for today | Default to today |
| Invalid date string | reject at REQUEST | Date validation (WS4) |
| Future date | reject at REQUEST | Date validation (WS4) |
| Quality check | claims > 0 for included projects | Substantive content only (WS4) |

---

*End of instruction set. WS1 first, verify L2+L3 work, then WS2-WS4 without stopping.*
