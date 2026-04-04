# Kovsky Execution Plan — 2026-04-04
# Enhanced Resolution Pipeline + Database Hygiene Service

**Date:** 2026-04-04
**Owner:** Kovsky (autonomous execution)
**Reviewer:** Forces
**Status:** READY FOR EXECUTION

**Read before starting:**
- `heartbeat.md` — current session state
- `BUILD DOCS and DATA/SPA_Headless_Browser_Design_Plan_v3.md` — full design spec for Phase 1
- `BUILD DOCS and DATA/Database_Hygiene_Service_Plan.md` — full design spec for Phase 2

**Context:** Eval run 20 scored 13/15. Two failures: Aave GitHub PDF (0 claims from Haiku — now on Sonnet, expected to self-heal) and MakerDAO SPA (JS rendering gap — requires this work). Grey is live on AWS Lightsail, Sonnet active, 4 offering handlers registered.

---

## Two Independent Workstreams

| Phase | What | Why | Priority |
|-------|------|-----|----------|
| Phase 1 | Enhanced Resolution Pipeline (llms.txt + SiteSpecific + Playwright) | Blocking graduation — MakerDAO SPA failure | HIGH |
| Phase 2 | Database Hygiene Service | Critical for production — recurring manual cleanup pattern | MEDIUM |

Build Phase 1 first. Phase 2 can follow in the same session or a separate one.

---

## Phase 1: Enhanced Resolution Pipeline

**Design doc:** `SPA_Headless_Browser_Design_Plan_v3.md` (all architectural decisions approved by Forces)

### Build Order

The order matters — each step builds on the previous. Run tests after each step before moving to the next.

---

### Step 1: Type Changes

**File:** `src/types.ts`

Extend the `ResolvedWhitepaper.source` union to include new resolution methods:

```typescript
export interface ResolvedWhitepaper {
  // ... existing fields ...
  source: 'direct' | 'ipfs' | 'composed' | 'docs_site'
        | 'llms-txt' | 'site-specific' | 'headless-browser';
  // ...
}
```

**Verify:** `bun run build` — no type errors.

---

### Step 2: FetchContentResolver — SPA Detection

**File:** `src/discovery/FetchContentResolver.ts`

Add SPA detection heuristic to the HTML branch. After the existing tag-strip logic, before the return statement:

- Define `SPA_FRAMEWORK_MARKERS` array (Next.js, Nuxt, React, Vue, Angular, Svelte, Gatsby markers)
- If `text.length < 500` AND raw HTML (`body` variable — NOT `rawHtml`, that doesn't exist) contains `<script` AND matches any framework marker → push `'SPA_DETECTED'` to diagnostics array
- The diagnostic string is a signal that `CryptoContentResolver` will inspect downstream

**Critical:** The raw HTML variable in this file is `body` (from `await response.text()`). See design doc Section 4 for exact code.

**Verify:** Existing tests still pass (`bun run test`). Add test: mock an HTML response with `<div id="root"></div><script>` and verify `SPA_DETECTED` appears in diagnostics.

---

### Step 3: LlmsTxtResolver

**File:** `src/discovery/LlmsTxtResolver.ts` (NEW)

Create the llms.txt probe resolver. Key implementation details:

- Try `/llms-full.txt` first (inline content, min 200 chars), then `/llms.txt` (index-only, min 1000 chars — higher bar because index files are mostly links, not content)
- Manual redirect following with 3-hop limit (consistent with security policy — do NOT use `redirect: 'follow'`)
- Content-type guard: reject responses with `text/html` content-type
- Body HTML guard: reject responses starting with `<!DOCTYPE` or `<html`
- 5s timeout per probe
- Returns `ResolvedContent` with `source: 'llms-txt'` or null

See design doc Section 5.3 for complete implementation code.

**Verify:** Unit test with mocked fetch — 200/404/timeout responses, HTML rejection, redirect limit enforcement.

---

### Step 4: SiteSpecificRegistry

**File:** `src/discovery/SiteSpecificRegistry.ts` (NEW)

Create the domain-specific handler registry. Key implementation details:

- Domain matching uses `hostname === pattern || hostname.endsWith('.' + pattern)` — NOT `hostname.includes(pattern)` (substring matching is a security bug — `notgitbook.io` would match `gitbook.io`)
- Default handler: GitBook (`gitbook.io`) — sends `Accept: text/markdown` header, validates response isn't HTML
- 10s timeout for all handlers
- Returns `ResolvedContent` with `source: 'site-specific'` or null
- Notion handler is a placeholder comment for post-graduation

See design doc Section 6.2 for complete implementation code.

**Verify:** Unit test — mock GitBook markdown response, verify handler matching uses exact/subdomain match.

---

### Step 5: HeadlessBrowserResolver

**File:** `src/discovery/HeadlessBrowserResolver.ts` (NEW)

Create the Playwright SPA renderer. This is the most complex new file. Key implementation details:

**Soft dependency:** `require('playwright-core')` in try/catch inside the constructor. If missing, `this.available = false` and `resolve()` always returns null. Log warning once at startup. Do NOT put the require at module level.

**Resource blocking:** Block `image`, `font`, `media`, `stylesheet`, `other` via `page.route('**/*')`. Grey is text-only — no visual awareness. Use a `Set` for O(1) lookup, not array `includes()`.

**Redirect tracking:** Count NAVIGATION redirects only. Use `page.on('request')` and check `request.isNavigationRequest() && request.redirectedFrom()`. Do NOT use `page.on('response')` to count 3xx status codes — that counts subresource redirects (script CDN 302s, API redirects) and causes false positives.

**Domain validation:** After `page.goto()`, check `page.url()` against original URL. Allow same domain, subdomains, and known trusted hosts. See design doc Section 7.3 `isDomainTrusted()`.

**Text extraction:** Targeted selectors first (`main`, `article`, `.content`, `.whitepaper`, `#content`, `[role="main"]`, `.documentation`, `.docs-content`, `.markdown-body`), fallback to `document.body.innerText`. If < 200 chars, wait 3s and retry once (React hydration after networkidle).

**Safety controls:**
- Rate limit: 10/hour (rolling window)
- Memory guard: `os.freemem() < 400MB` → return null
- Browser restart threshold: 20 pages
- Page load timeout: 15s
- User-Agent: realistic Chrome string (some crypto sites block headless identifiers)

See design doc Section 7.3 for complete implementation code.

**Verify:** Unit test with mocked Playwright. Test rate limiting (11th request returns null), memory guard, redirect limit, domain validation. Integration test against a known SPA URL can wait for VPS deployment.

---

### Step 6: CryptoContentResolver Integration

**File:** `src/discovery/CryptoContentResolver.ts` (MODIFY)

This is the integration point. Key changes:

1. Import and instantiate all three new resolvers as private members
2. After Layer 1 (`this.contentResolver.resolve()`) returns, check `content.text.length < 500`
3. If thin content, extract `isSpaDetected` from `content.diagnostics` (check for `'SPA_DETECTED'` string)
4. Call `enhancedResolve(url, isSpaDetected)` which tries Layers 2-4 in order
5. **Playwright only fires when `isSpaDetected` is true.** Layers 2-3 fire for any thin content.
6. Map the enhanced content's `source` field through `mapSource()` to the `ResolvedWhitepaper.source` union — do NOT pass `'enhanced'` as the source (type error, loses attribution)
7. Widen `buildResult` signature to accept `source: ResolvedWhitepaper['source']` instead of `source: 'direct' | 'ipfs'`
8. Add `close()` method that calls `this.headlessBrowser.close()`

See design doc Section 8.1 for complete implementation code. The existing IPFS fallback logic is preserved unchanged.

**Verify:** `bun run build` — clean compile. All existing tests pass. Add integration test: mock FetchContentResolver returning thin HTML with SPA_DETECTED diagnostic, verify LlmsTxtResolver is called, verify Playwright is called only when SPA detected.

---

### Step 7: WpvService Shutdown Hook

**File:** `src/WpvService.ts` (MODIFY)

Add graceful browser shutdown. In `WpvService.stop()` (or equivalent cleanup method), call `this.cryptoContentResolver.close()`. This ensures the Chromium process is killed when Grey restarts.

**Verify:** `bun run build` — clean.

---

### Step 8: VPS Deployment (Playwright)

**On VPS:**

```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19

# Install playwright-core (NOT full playwright — no test runner)
cd /opt/grey/plugin-wpv
bun add playwright-core

# Install Chromium binary
npx playwright install chromium

# Verify installation
node -e "const pw = require('playwright-core'); console.log('Playwright available:', !!pw.chromium);"

# Pull latest code, rebuild, restart
git pull && bun run build
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey

# Wait for "Registered 4 offering handlers" in logs
pm2 logs grey --lines 30

# Smoke test: check RAM baseline after restart
free -m
```

**CRITICAL:** Do NOT run `bun install` in `wpv-agent` — the plugin-acp symlink will break. Only `bun run build`.

**Verify:** PM2 logs show no Playwright warnings at startup. Grey starts normally. RAM usage is baseline (no browser launched until first SPA URL).

---

### Step 9: Run Eval

After VPS deployment with all enhanced resolution layers active:

1. Trigger an eval run via Butler
2. Expected: Aave passes (Sonnet), MakerDAO either resolves via llms.txt/Playwright or fails (but with better diagnostics)
3. Check PM2 logs for layer attribution: which resolver handled each URL

---

## Phase 2: Database Hygiene Service

**Design doc:** `Database_Hygiene_Service_Plan.md` (all decisions approved by Forces)

### Build Order

---

### Step 10: Audit Log Schema

**File:** `src/db/wpvSchema.ts` (MODIFY)

Add the `wpvHygieneLog` table definition:

```typescript
export const wpvHygieneLog = autognostic.table('wpv_hygiene_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
  category: text('category').notNull(),
  recordId: uuid('record_id').notNull(),
  recordTable: text('record_table').notNull(),
  action: text('action').notNull(),
  description: text('description'),
  mode: text('mode').notNull(),
}, (table) => ({
  runAtIdx: index('wpv_hygiene_log_run_idx').on(table.runAt),
}));
```

**On Supabase:** Run the CREATE TABLE + CREATE INDEX SQL from design doc Section 9 via the Supabase SQL editor. The Drizzle schema definition above is for type safety in code — the actual table must be created in Supabase manually (we don't use Drizzle migrations).

---

### Step 11: Repo Delete Methods

**Files:** `src/db/wpvWhitepapersRepo.ts`, `src/db/wpvVerificationsRepo.ts`, `src/db/wpvClaimsRepo.ts` (MODIFY all three)

Add `deleteById(id)` and `deleteByIds(ids[])` to each repo. Import `inArray` from drizzle-orm. Guard `deleteByIds` with early return on empty array.

See design doc Section 4.2 for exact code.

**Verify:** `bun run build` — clean.

---

### Step 12: DataHygieneService

**File:** `src/db/DataHygieneService.ts` (NEW)

This is the core hygiene service. Key implementation details:

**Six detection categories:**
1. Duplicate whitepapers per token_address — keep best (most claims), CASCADE delete rest
2. Zero-claim verifications — ALL verdicts, not just INSUFFICIENT_DATA
3. Orphaned records — LEFT JOIN to find dangling FK references
4. Impossible values — REPORT ONLY, never auto-purge (hardcoded `false` in config, override-proof)
5. Stale DISCOVERED — whitepapers stuck in DISCOVERED for 3+ days
6. Superseded verifications — multiple verifications per whitepaper, keep newest

**Safety controls:**
- `mode: 'dry-run'` by default — detects and logs but deletes nothing
- Max purge cap: 50 per run — stops and sets `capped: true` if exceeded
- Per-category toggles
- `impossibleValues` category is ALWAYS `false` regardless of config input (forced in constructor)

**Audit log integration:** After all detectors run, call `writeAuditLog(findings)` to batch-insert into `wpv_hygiene_log`.

**Raw SQL:** Several queries use `this.db.execute(sql`...`)` because Drizzle can't express GROUP BY HAVING, LEFT JOIN IS NULL, or UNION ALL. This is expected — the SQL is straightforward.

See design doc Section 4.1 for complete implementation code including all six detectors, the audit log writer, and the `inferTable()` helper.

**Verify:** Unit tests with mock DB seeded with bad data for each category. Test dry-run vs purge mode. Test cap behavior. Test impossibleValues never purges.

---

### Step 13: WpvService Hygiene Cron

**File:** `src/WpvService.ts` (MODIFY)

Add the hygiene cron job:

- Import `DataHygieneService`
- Instantiate with `mode` from `process.env.WPV_HYGIENE_MODE` (default `'dry-run'`)
- Schedule at `'30 6 * * *'` (06:30 UTC daily, 30 minutes after discovery cron)
- Wrap in try/catch — hygiene failures must never crash Grey

**New env var:**
```bash
# Add to .env on both local and VPS
WPV_HYGIENE_MODE=dry-run
```

**Verify:** `bun run build` — clean. Cron initializes without errors.

---

### Step 14: Dedup Check at Write Time

**File:** `src/acp/JobRouter.ts` (MODIFY)

In the live pipeline path (where new whitepaper records are created for incoming ACP jobs), add a dedup check before creating a new whitepaper:

```typescript
// Before creating a new whitepaper record:
const existing = await this.whitepapersRepo.findByTokenAddress(tokenAddress);
if (existing.length > 0) {
  // Reuse existing whitepaper record.
  // Update document_url and status if the new URL differs.
  const wp = existing[0];
  if (wp.documentUrl !== documentUrl) {
    await this.whitepapersRepo.updateDocumentUrl(wp.id, documentUrl);
    await this.whitepapersRepo.updateStatus(wp.id, 'DISCOVERED');
  }
  whitepaperId = wp.id;
} else {
  // No existing record — create new
  const wp = await this.whitepapersRepo.create({ ... });
  whitepaperId = wp.id;
}
```

This may require adding an `updateDocumentUrl` method to `wpvWhitepapersRepo.ts`.

**Verify:** Existing tests pass. Add test: two jobs for the same token_address result in one whitepaper record, not two.

---

### Step 15: VPS Deployment (Hygiene)

```bash
ssh -i C:\Users\kidco\.ssh\WhitepaperGrey.pem ubuntu@44.243.254.19

# Create the hygiene log table in Supabase SQL editor FIRST
# (use the CREATE TABLE SQL from design doc Section 9)

# Add env var
echo 'WPV_HYGIENE_MODE=dry-run' >> /opt/grey/wpv-agent/.env

# Pull, build, restart
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey
```

**After 2-3 days of dry-run logs:** Forces reviews findings, confirms detection accuracy, then switches to `WPV_HYGIENE_MODE=purge`.

---

## Test Expectations After Both Phases

| Suite | Before | After |
|-------|--------|-------|
| plugin-wpv | 303 | 303 + new tests for Layers 2-4, SPA detection, DataHygieneService |
| plugin-acp | 59 | 59 (no changes) |
| wpv-agent | 13 | 13 (no changes) |

All existing tests must pass. No regressions.

---

## Files Changed Summary

### Phase 1 — Enhanced Resolution Pipeline

| File | Action |
|------|--------|
| `src/types.ts` | MODIFY — extend `ResolvedWhitepaper.source` union |
| `src/discovery/FetchContentResolver.ts` | MODIFY — add SPA detection heuristic |
| `src/discovery/LlmsTxtResolver.ts` | NEW |
| `src/discovery/SiteSpecificRegistry.ts` | NEW |
| `src/discovery/HeadlessBrowserResolver.ts` | NEW |
| `src/discovery/CryptoContentResolver.ts` | MODIFY — integrate enhanced resolution chain |
| `src/WpvService.ts` | MODIFY — browser shutdown hook |
| `package.json` | MODIFY — add `playwright-core` dependency |

### Phase 2 — Database Hygiene Service

| File | Action |
|------|--------|
| `src/db/wpvSchema.ts` | MODIFY — add `wpvHygieneLog` table |
| `src/db/DataHygieneService.ts` | NEW |
| `src/db/wpvWhitepapersRepo.ts` | MODIFY — add delete methods, `updateDocumentUrl` |
| `src/db/wpvVerificationsRepo.ts` | MODIFY — add delete methods |
| `src/db/wpvClaimsRepo.ts` | MODIFY — add delete methods |
| `src/acp/JobRouter.ts` | MODIFY — add dedup check at write time |
| `src/WpvService.ts` | MODIFY — add hygiene cron |

---

## Guardrails

- **Do NOT run `bun install` in wpv-agent on VPS** — the plugin-acp symlink will break
- **Do NOT auto-purge in production** until Forces reviews dry-run logs
- **Do NOT hardcode `impossibleValues: true`** — that category is always report-only
- **Use `body` not `rawHtml`** in FetchContentResolver SPA detection
- **Use `hostname.endsWith('.' + pattern)` not `hostname.includes(pattern)`** in SiteSpecificRegistry
- **Use `request.isNavigationRequest()`** not `page.on('response')` for redirect counting in Playwright
- **Map source correctly through `mapSource()`** — never pass `'enhanced'` to `buildResult`
- **Run `bun run test` after every step** — no regressions allowed
- **Update `heartbeat.md`** at session end

---

*End of Kovsky Execution Plan — 2026-04-04*
