# Kovsky Execution Plan — Unified Eval 24 Recovery + Plugin Trim (v2)

> **Source:** Forces + Claude Opus context window
> **Date:** 2026-04-05
> **v2 Author:** Kovsky (4 corrections from Forces v1)
> **Approved:** Forces confirmed all architectural decisions
> **Goal:** Fix 8 eval 24 failures, free ~500-800MB RAM, prepare for persistence layer (next phase)

---

## v2 Changelog (from Forces v1)

| # | Section | Issue | Fix |
|---|---------|-------|-----|
| 1 | Phase 1, `extractLinks` | Uses `origin` as base URL for resolving relative links. Relative paths like `./tokenomics` from `docs.example.com/v2/intro` would resolve to `/tokenomics` instead of `/v2/tokenomics`. | Changed parameter from `origin: string` to `baseUrl: string`. Pass full landing page URL, not just origin. Same-origin check uses `new URL(baseUrl).origin`. |
| 2 | Phase 1, Issue B | Plan says crawled output should NOT include landing page text (to avoid duplication). This loses the project overview/intro context — MiCA `technology_description` and `issuer_identity` are often on the landing page. | Reversed: `crawl()` now PREPENDS landing page text to sub-page content. The 1.5x threshold still works — `(landing + sub-pages).length > landing.length * 1.5` means sub-pages added at least 50% more content. |
| 3 | Phase 1, `scoreLink` skip list | Duplicate `'changelog'` entry (lines 228 + 229 in v1). | Removed duplicate. |
| 4 | Phase 1, `extractLinks` anchor check | `href.split('#')[0] === origin` skips anchors but also skips legitimate links to the site root. Should compare against the landing page URL. | Changed to `href.split('#')[0] === baseUrl.split('#')[0]`. |

---

## Execution Order (strict — do not reorder)

1. **Phase 0: Plugin trim + Ollama kill** (config change, frees RAM)
2. **Phase 1: DocsSiteCrawler** (new component, fixes 6 of 8 failures)
3. **Phase 2: Known URL map updates** (Seamless, Aerodrome, Pyth, fix Jupiter)
4. **Phase 3: Date-specific briefings** (fixes briefing identity problem)
5. **Phase 4: 0-claim briefing filter** (quality improvement)
6. **Verification: tests + deploy + RAM check**

---

## Phase 0: Plugin Trim + Ollama Kill

**Why first:** Frees ~500-800MB RAM. Without this, Playwright is permanently RAM-blocked (107MB free vs 400MB required). DocsSiteCrawler doesn't need Playwright but future eval tests might.

### 0A. Modify `wpv-agent/src/index.ts`

Remove 3 plugin imports and their entries in the plugins array:

**Current:**
```typescript
import sqlPlugin from "@elizaos/plugin-sql";
import ollamaPlugin from "@elizaos/plugin-ollama";
import anthropicPlugin from "@elizaos/plugin-anthropic";
import knowledgePlugin from "@elizaos/plugin-knowledge";
import autognosticPlugin from "@elizaos/plugin-autognostic";
import acpPlugin from "@elizaos/plugin-acp";
import wpvPlugin from "@elizaos/plugin-wpv";
import bootstrapPlugin from "@elizaos/plugin-bootstrap";

// ...
plugins: [sqlPlugin, ollamaPlugin, anthropicPlugin, knowledgePlugin, autognosticPlugin, acpPlugin, wpvPlugin, bootstrapPlugin],
```

**New:**
```typescript
import sqlPlugin from "@elizaos/plugin-sql";
import anthropicPlugin from "@elizaos/plugin-anthropic";
import acpPlugin from "@elizaos/plugin-acp";
import wpvPlugin from "@elizaos/plugin-wpv";
import bootstrapPlugin from "@elizaos/plugin-bootstrap";

// ...
// Plugin load order:
// 1. sql — database adapter (Supabase via WPV_DATABASE_URL)
// 2. anthropic — registers chat model handler (Claude Sonnet for L2/L3)
// 3. acp — ACP marketplace bridge (must be before wpv)
// 4. wpv — whitepaper verification pipeline (registers offering handlers)
// 5. bootstrap — standard Eliza conversational actions
//
// REMOVED (2026-04-05, Forces decision):
// - plugin-ollama: local embedding model consumed ~400MB RAM. Grey uses Anthropic API only.
// - plugin-knowledge: ElizaOS RAG system. WPV has its own pipeline. Will be replaced by
//   thin persistence layer with API-based embeddings in next phase.
// - plugin-autognostic: Level 0 knowledge infrastructure. WPV operates independently.
//   Preserved in SCIGENT codebase for future agents.
plugins: [sqlPlugin, anthropicPlugin, acpPlugin, wpvPlugin, bootstrapPlugin],
```

### 0B. Kill Ollama on VPS

```bash
# Check if Ollama is running
systemctl status ollama 2>/dev/null || echo "Not a systemd service"
ps aux | grep -i ollama | grep -v grep

# If running, stop and disable
sudo systemctl stop ollama 2>/dev/null
sudo systemctl disable ollama 2>/dev/null

# If running as a process (not systemd)
pkill -f ollama 2>/dev/null

# Verify it's dead
ps aux | grep -i ollama | grep -v grep
```

### 0C. Deploy + Verify Boot

```bash
# On VPS
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey

# Wait 10s for startup, then verify
pm2 logs grey --lines 30 --nostream | grep -i "error\|warn\|registered"

# Check RAM recovery
free -m
```

**Expected:** Grey boots with 4 plugins instead of 8. "Registered 4 offering handlers" in logs. Free RAM increases from ~107MB to ~600-900MB.

**If ElizaOS fails to boot:** The only risk is if ElizaOS core requires a TEXT_EMBEDDING handler to initialize. If you see an error about missing embedding handler:
1. Add a no-op stub: `runtime.registerModel(ModelType.TEXT_EMBEDDING, async () => new Array(768).fill(0))`
2. Put it in WpvService.start() or a minimal shim plugin
3. This is a fallback — test without it first

---

## Phase 1: DocsSiteCrawler (New Component)

**File:** `src/discovery/DocsSiteCrawler.ts` (new)
**Integration:** `src/discovery/CryptoContentResolver.ts` (modified)

### 1A. The Core Problem

CryptoContentResolver has a hard gate at line ~68:

```typescript
if (content.text.length >= THIN_CONTENT_THRESHOLD) {  // 500 chars
  return this.buildResult(content, url, resolvedUrl, source);  // ← EARLY RETURN
}
```

Documentation sites return 500-5000 chars of intro text. They pass this gate and get returned as-is. ClaimExtractor receives only the intro page. All the governance, risks, tokenomics content on sub-pages is never seen.

The fix: **add a docs-site detection check BEFORE this early return.** If the URL looks like a documentation site and the content is "medium" (enough to not be thin, but not enough to be a full whitepaper), trigger the DocsSiteCrawler to deepen it.

### 1B. DocsSiteCrawler Class

```
src/discovery/DocsSiteCrawler.ts
```

**Interface:**
```typescript
class DocsSiteCrawler {
  async crawl(url: string, landingPageText: string): Promise<ResolvedContent | null>
}
```

**Algorithm:**
1. Fetch the landing page HTML (raw, not stripped — need link structure)
2. Extract internal links from `<a href>`, `<nav>`, sidebar elements
3. Score each link by whitepaper/MiCA relevance (reuse HeadlessBrowserResolver's `scoreLink` pattern)
4. Add new high-value keywords to scoring: `governance`, `risk`, `legal`, `audit`, `compliance`, `disclosure`, `redemption`, `environmental`, `reserve`, `staking`, `liquidity`, `mechanism`
5. Fetch top N links via plain HTTP (FetchContentResolver, NOT Playwright)
6. Strip HTML → plain text for each sub-page
7. Concatenate: landing page text (prepended) + sub-page texts, separated by `\n\n--- [Section: {page title or path}] ---\n\n`
8. Return as single `ResolvedContent` with `source: 'docs-crawl'`

**Bounds (hard limits):**
- `MAX_SUBPAGES = 8` (more than HeadlessBrowserResolver's 5 — docs sites have more structured content)
- `SUBPAGE_TIMEOUT_MS = 8000` per page
- `MAX_TOTAL_CHARS = 80000` (docs sites are verbose — allow more than SPA's 50k)
- `MAX_CRAWL_TIME_MS = 45000` total wall time
- Same-origin links ONLY (no external domains)
- Skip asset links (`.pdf`, `.png`, `.css`, `.js`, `.xml`, `.json` extensions — Grey fetches PDFs separately)
- Track visited URLs to prevent cycles

**Detection function (used by CryptoContentResolver):**
```typescript
static isDocsSite(url: string, textLength: number): boolean {
  // Must be HTML content (not PDF — PDFs are handled elsewhere)
  // Text length between 200-10000 chars (enough to not be thin, but not a full whitepaper)
  if (textLength < 200 || textLength > 10000) return false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Hostname patterns: docs.*, *.gitbook.io, *.readthedocs.io
    if (hostname.startsWith('docs.')) return true;
    if (hostname.includes('gitbook.io')) return true;
    if (hostname.includes('readthedocs.io')) return true;
    if (hostname.includes('notion.site')) return true;

    // Path patterns: /docs/, /documentation/, /wiki/
    if (pathname.startsWith('/docs/') || pathname.startsWith('/docs')) return true;
    if (pathname.startsWith('/documentation')) return true;
    if (pathname.startsWith('/wiki')) return true;

    return false;
  } catch { return false; }
}
```

**Link extraction (from raw HTML, not stripped text):**

> **v2 fix**: Parameter changed from `origin` to `baseUrl` (full landing page URL).
> Relative links resolve correctly against the actual page path, not just the origin.
> Anchor check compares against `baseUrl`, not `origin`.

```typescript
private extractLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const linkPattern = /href=["']([^"']+)["']/gi;
  const links: string[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    try {
      const href = new URL(match[1], baseUrl).href;
      // Same-origin only
      if (!href.startsWith(origin)) continue;
      // Skip assets
      if (/\.(pdf|png|jpg|jpeg|gif|svg|css|js|json|xml|ico|woff|ttf|mp4|mp3)(\?|$)/i.test(href)) continue;
      // Skip anchors to same page
      if (href.split('#')[0] === baseUrl.split('#')[0]) continue;
      // Deduplicate
      const canonical = href.split('#')[0];
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      links.push(canonical);
    } catch { continue; }
  }

  return links;
}
```

**Link scoring (shared pattern with HeadlessBrowserResolver but expanded for MiCA):**
```typescript
private scoreLink(href: string): number {
  const lower = href.toLowerCase();
  let score = 0;

  // Skip non-content links
  const skip = [
    'changelog', 'release-notes', 'blog', 'news', 'faq', 'support',
    'contact', 'careers', 'jobs', 'login', 'signup', 'register',
    'api-reference', 'api/', 'sdk', 'npm', 'github.com', 'twitter.com',
    'discord', 'telegram', 'medium.com', 'migration',
  ];
  for (const kw of skip) {
    if (lower.includes(kw)) return 0;
  }

  // High-value: whitepaper structure + MiCA sections
  const highValue = [
    'whitepaper', 'overview', 'introduction', 'architecture',
    'tokenomics', 'mechanism', 'protocol', 'specification',
    'governance', 'risk', 'disclosure', 'legal', 'compliance',
    'redemption', 'reserve', 'environmental', 'rights',
    'audit', 'security', 'how-it-works', 'design', 'technical',
  ];
  for (const kw of highValue) {
    if (lower.includes(kw)) score += 3;
  }

  // Medium-value
  const medValue = ['docs', 'guide', 'reference', 'concept', 'staking', 'liquidity', 'smart-contract'];
  for (const kw of medValue) {
    if (lower.includes(kw)) score += 1;
  }

  // Prefer shallower paths (closer to root docs)
  try {
    const depth = (new URL(href).pathname.match(/\//g) || []).length;
    if (depth <= 3) score += 1;
  } catch {}

  return score;
}
```

### 1C. Integration into CryptoContentResolver

**Modify `resolveWhitepaper()`** — add docs-site check BEFORE the early return:

**Current flow:**
```
content = fetch(url)
if redirected_to_homepage → enhanced resolve
if content.length >= 500 → RETURN (early exit)  ← problem
if content.length < 500 → enhanced resolve (llms.txt, site-specific, Playwright)
```

**New flow:**
```
content = fetch(url)
if redirected_to_homepage → enhanced resolve
if content.length >= 500:
  if isDocsSite(url, content.length) AND content is HTML (not PDF):  ← NEW CHECK
    crawled = docsCrawler.crawl(url, content.text)
    if crawled has more content → use crawled
  RETURN content (or crawled content)
if content.length < 500 → enhanced resolve (llms.txt, site-specific, Playwright)
```

**Code change in CryptoContentResolver:**

Add import:
```typescript
import { DocsSiteCrawler } from './DocsSiteCrawler';
```

Add instance:
```typescript
private docsCrawler = new DocsSiteCrawler();
```

Modify the substantive content block:
```typescript
// If we got substantive content, check if it's a docs site landing page
// that would benefit from sub-page crawling before returning.
if (content.text.length >= THIN_CONTENT_THRESHOLD) {
  // Docs-site deepening: if the URL is a documentation site and content
  // is "medium" (landing page, not a full whitepaper), crawl sub-pages
  // to build a more complete document.
  const isHtml = !content.contentType?.includes('pdf');
  if (isHtml && DocsSiteCrawler.isDocsSite(url, content.text.length)) {
    log.info('Docs site detected — attempting sub-page crawl', {
      url, textLength: content.text.length,
    });
    const crawled = await this.docsCrawler.crawl(url, content.text);
    if (crawled && crawled.text.length > content.text.length * 1.5) {
      // Crawl found substantially more content — use it
      return this.buildResult(crawled, url, crawled.resolvedUrl ?? url, 'docs-crawl');
    }
    // Crawl didn't find much more — fall through to return original content
  }
  return this.buildResult(content, url, resolvedUrl, source);
}
```

**Update `mapSource()` to handle the new source type:**
```typescript
case 'docs-crawl':
  return 'docs-crawl';
```

**Update `ResolvedWhitepaper.source` union in `types.ts`:**
```typescript
source: 'direct' | 'ipfs' | 'composed' | 'docs_site'
      | 'llms-txt' | 'site-specific' | 'headless-browser'
      | 'docs-crawl';  // ← add
```

### 1D. Crawl Output Includes Landing Page (v2 correction)

> **v2 fix**: Reversed Issue B from Forces v1. The `crawl()` method PREPENDS the landing
> page text to sub-page content. Rationale: the landing page often contains the project
> overview, technology summary, and issuer context — these map to MiCA's
> `technology_description` and `issuer_identity` sections. Dropping it loses that context.
>
> The 1.5x replacement threshold still works correctly:
> - Landing page text = 2000 chars
> - Crawl returns landing (2000) + sub-pages (4000) = 6000 chars
> - 6000 > 2000 * 1.5 = 3000 → replacement triggers
> - The threshold ensures sub-pages added at least 50% new content beyond the landing page.

In `crawl()`, the concatenation should be:
```typescript
const parts: string[] = [landingPageText];  // Start with landing page
for (const subpage of fetchedSubpages) {
  parts.push(`\n\n--- [Section: ${subpage.title || subpage.path}] ---\n\n${subpage.text}`);
}
return { text: parts.join(''), source: 'docs-crawl', ... };
```

### 1E. Persistence Hook Point (for next phase)

The DocsSiteCrawler returns concatenated content as `ResolvedContent`. In the next phase (persistence layer), we'll add a storage hook in CryptoContentResolver right after receiving crawled content:

```typescript
// FUTURE: await this.persistenceService.store(url, crawled.text, projectName);
```

Design the DocsSiteCrawler so its output is a clean `ResolvedContent` object — text, source attribution, diagnostics. The persistence layer wraps around it; it doesn't need to know about storage.

---

## Phase 2: Known URL Map Updates

**File:** `src/discovery/WebSearchFallback.ts`

Add these entries to `KNOWN_WHITEPAPER_URLS`. Kov must verify each with `curl -sI -L` before adding:

```typescript
// ── New entries (eval 24 failures) ──
[/\bseamless\b/i, 'https://docs.seamlessprotocol.com'],
[/\baerodrome\b/i, 'https://docs.aerodrome.finance'],
[/\bpyth\b/i, 'https://docs.pyth.network'],
```

**Fix Jupiter entry** — current `docs.jup.ag` points to API reference, not protocol docs. Kov should verify which URL has the actual protocol overview and update. If `station.jup.ag` or `www.jup.ag/docs` has better content, use that.

**Important:** With the DocsSiteCrawler now active, these docs-site URLs become *starting points* for crawling, not dead ends. `docs.seamlessprotocol.com` will be fetched, detected as a docs site, and the crawler will follow internal links to governance/risks/legal sections. This is the synergy between Fix 1 and Fix 2.

---

## Phase 3: Date-Specific Briefings

**Files:** `src/db/wpvVerificationsRepo.ts` + `src/acp/JobRouter.ts`

### 3A. New repo method

Add to `WpvVerificationsRepo`:

```typescript
/** Get verifications from a specific date (UTC) */
async getVerificationsByDate(dateStr: string): Promise<WpvVerificationRow[]> {
  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return this.db
    .select()
    .from(wpvVerifications)
    .where(and(
      gte(wpvVerifications.verifiedAt, dayStart),
      sql`${wpvVerifications.verifiedAt} < ${dayEnd.toISOString()}::timestamptz`,
    ))
    .orderBy(desc(wpvVerifications.verifiedAt));
}
```

### 3B. Modify handleDailyBriefing in JobRouter

**Current logic:**
```
batch = getLatestDailyBatch()     // ignores requested date
backfill with getMostRecent()     // ignores requested date
set briefing.date = targetDate    // cosmetic only
```

**New logic:**
```
if requestedDate is provided:
  batch = getVerificationsByDate(requestedDate)    // date-specific
  // NO backfill — if no data for that date, return what exists (possibly empty)
else:
  batch = getLatestDailyBatch()                    // today's batch
  backfill with getMostRecent()                    // existing behavior for "today"
```

This means: explicit date requests get date-filtered results. No-date requests get the current behavior (latest + backfill). Two different dates will return different content.

---

## Phase 4: 0-Claim Briefing Filter

**File:** `src/acp/JobRouter.ts` — in `handleDailyBriefing`

After building the reports array and before the dedup step, filter out entries with 0 claims:

```typescript
// Quality filter: exclude 0-claim entries from briefings.
// These are verifications where discovery succeeded but ClaimExtractor
// found nothing substantive (thin content, composed whitepapers).
// Including them pollutes the briefing with unreliable data.
const qualityFiltered = dedupedReports.filter((report) => {
  const claimCount = report.claimCount ?? report.claims?.length ?? 0;
  return claimCount > 0;
});

// If ALL entries have 0 claims (edge case), include them anyway
// with a quality warning rather than returning empty.
const finalReports = qualityFiltered.length > 0 ? qualityFiltered : dedupedReports;
```

**Placement:** This goes AFTER the existing `deduped` Map → `dedupedReports` conversion, BEFORE generating the briefing output.

---

## Phase 5: Verification + Deploy

```bash
# Local
bun run build && bun run test
# Expected: 303+ tests (new DocsSiteCrawler tests), 59/59 plugin-acp, 13/13 wpv-agent

# Deploy to VPS
cd /opt/grey/plugin-wpv && git pull && bun run build
cd /opt/grey/wpv-agent && bun run build
pm2 restart grey

# Verify
pm2 logs grey --lines 30 --nostream
free -m   # Should show 600-900MB free

# Spot-check docs crawling
curl -s http://44.243.254.19:3001 | head -5
```

Update heartbeat with all changes.

---

## Self-Audit: Issues Found and Resolved

### Issue A: DocsSiteCrawler needs raw HTML, but FetchContentResolver strips HTML

**Problem:** FetchContentResolver strips HTML tags and returns plain text. DocsSiteCrawler needs the raw HTML to extract links.

**Resolution:** DocsSiteCrawler must fetch the landing page HTML ITSELF via its own HTTP call, not rely on the stripped text from FetchContentResolver. The `landingPageText` parameter passed from CryptoContentResolver is used for content (already stripped). The crawler fetches the URL again to get the raw HTML for link extraction. This is one extra HTTP request per docs-site detection — acceptable cost.

**Alternative considered:** Pass raw HTML through from FetchContentResolver. Rejected — would require changing FetchContentResolver's interface and carrying raw HTML through the entire resolution chain for a case that fires rarely.

### Issue B: Landing page content in crawl output (v2 REVERSED)

**v1 said:** DocsSiteCrawler should NOT include landing page text (avoid duplication).

**v2 says:** DocsSiteCrawler MUST INCLUDE landing page text, prepended to sub-page content.

**Rationale:** The landing page contains the project overview, technology summary, and issuer context. These map directly to MiCA's `technology_description` and `issuer_identity` sections. Dropping the landing page loses this context. For Seamless Protocol, the landing page has the project description, lending protocol overview, and Morpho migration — all substantive for claim extraction.

The 1.5x replacement threshold in CryptoContentResolver compares `crawled.text.length` (which now includes landing page) against `content.text.length` (the landing page alone). Sub-pages need to add at least 50% new content for replacement to trigger.

### Issue C: Date-specific briefings — timezone ambiguity

**Problem:** The `date` parameter is YYYY-MM-DD with no timezone. `verified_at` is stored with timezone. If the VPS is in UTC but the evaluator expects PST dates, results could differ.

**Resolution:** Use UTC consistently. The new `getVerificationsByDate` method constructs `dayStart` and `dayEnd` as UTC timestamps (`new Date(dateStr + 'T00:00:00Z')`). This matches the existing `getLatestDailyBatch` behavior.

### Issue D: Empty briefing for historical dates

**Problem:** If the evaluator requests a date where Grey has no verifications (e.g., 2026-04-01, which was before Grey ran any eval), the briefing would be empty.

**Resolution:** This is correct behavior. An empty briefing for a date with no data is better than returning fabricated "date-specific" data that's actually from a different date. The evaluator's complaint was that two different dates returned IDENTICAL content — an empty result for a date with no data is honestly different from a populated result for a date with data.

### Issue E: 0-claim filter edge case — all entries have 0 claims

**Problem:** If every verification in the briefing has 0 claims, the quality filter would produce an empty list.

**Resolution:** Handled in the code — `qualityFiltered.length > 0 ? qualityFiltered : dedupedReports` falls back to including 0-claim entries rather than returning nothing.

### Issue F: `docs-crawl` source type needs test coverage

**Problem:** Adding a new source type to the `ResolvedWhitepaper.source` union might break tests that exhaustively check source values.

**Resolution:** Kov should grep for test assertions on `source` values and update them to include `'docs-crawl'`.

### Issue G: DocsSiteCrawler on known URL map entries that are docs sites

**Problem:** Many known URL map entries now point to docs sites (docs.jup.ag, docs.frax.finance, etc.). When the map returns `docs.jup.ag`, FetchContentResolver fetches the landing page, CryptoContentResolver detects it as a docs site, and DocsSiteCrawler deepens it. This is the CORRECT behavior — but we should verify it doesn't double-crawl if SiteSpecificRegistry also matches (e.g., GitBook sites).

**Resolution:** SiteSpecificRegistry fires in `enhancedResolve()`, which only fires for THIN content (< 500 chars). If the docs site returns > 500 chars, `enhancedResolve()` never fires, so there's no conflict. DocsSiteCrawler fires in the substantive-content path. They're mutually exclusive by design.

### Issue H: FetchContentResolver may return PDF content-type for docs sites

**Problem:** Some docs sites serve PDFs at their root. The `isHtml` check in the integration code prevents DocsSiteCrawler from firing on PDFs. But what if a docs site serves the landing page as HTML and then some sub-pages as PDFs?

**Resolution:** The DocsSiteCrawler's link extraction already skips `.pdf` extension links (in the `extractLinks` filter). PDF sub-pages won't be crawled. They'd need to be fetched separately via the normal PDF path. This is correct — Grey handles PDFs through FetchContentResolver's pdf-parse path, not through the docs crawler.

---

## DB Rules (reminder)

- **NO wipes** of `wpv_claims`, `wpv_verifications`, `wpv_whitepapers` without explicit Forces approval
- Current state: 77 whitepapers, 77 verifications, 337 claims
- Clean only eval artifacts after runs

---

*Forces-approved (v1). v2 corrections by Kovsky — 4 fixes, no architectural changes. Implement in order: Phase 0 → 1 → 2 → 3 → 4 → 5.*
