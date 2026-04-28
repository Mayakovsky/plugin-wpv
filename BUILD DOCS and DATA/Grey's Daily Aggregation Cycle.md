Grey's Daily Aggregation Cycle — Functionality & Constraints   Report                                                     
                                                              
  TL;DR                                                                                                                     
  Grey's discovery/aggregation stack is fully built but never   wired up. DiscoveryCron.ts exists, the A1–A6 components       underneath it (BaseChainListener, AcpMetadataEnricher,        WhitepaperSelector, TieredDocumentDiscovery,                  MarketTractionAnalyzer, ForkDetector) all exist with tests —   but WpvService.initFromRuntime assigns discoveryCron: null 
  as never. It's dead code. Nothing schedules runDaily().
  Grey's 10 cached rows are all we have until we activate     
  this.

  ---
  1. What exists (complete)

  The pipeline, end-to-end

  Cron trigger (WPV_DISCOVERY_CRON = '0 6 * * *')
   → BaseChainListener.getNewTokensSince()            ✅      
  working, live tests pass
     Polls Virtuals Bonding Proxy (0xF66DeA…3259) for
  Graduated events
   → AcpMetadataEnricher.enrichToken(addr)            ⚠️      
  depends on IAcpClient — currently stubbed
   → TieredDocumentDiscovery.discover()               ✅      
  4-tier chain (Tier 1–4 all working)
     PDF/IPFS links → website scrape → GitHub → aggregators → 
  synthetic
   → MarketTractionAnalyzer.evaluate()                ✅      
  on-chain transfer-count signals
   → ForkDetector.detect()                            ✅      
  similarity-based
   → WhitepaperSelector.filterProjects()              ✅      
  scoring + threshold (default 6/10)
   → L1+L2+L3 pipeline (same as on-demand jobs)       ✅      
  running in production for ACP
   → whitepaperRepo.create() + claims + verification  ⚠️      
  bypasses Option B dedupe
   → onIngest hook (optional)                         📋 wire 
  to autognostic knowledge store

  Config already defined

  Constant: WPV_DISCOVERY_CRON
  Value: '0 6 * * *'
  Purpose: Schedule (06:00 UTC daily)
  ────────────────────────────────────────
  Constant: FRESHNESS_WINDOW_MS
  Value: 72 h
  Purpose: "Fresh" signal cutoff
  ────────────────────────────────────────
  Constant: SELECTION_DEFAULT_THRESHOLD
  Value: 6 / 10
  Purpose: Pass gate
  ────────────────────────────────────────
  Constant: MIN_PAGE_COUNT
  Value: 5
  Purpose: documentLengthOk gate
  ────────────────────────────────────────
  Constant: SELECTION_WEIGHTS
  Value: hasLinkedPdf (hard-gate), documentLengthOk,
    technicalClaimsDetected, marketTraction, notAFork, isFresh
  Purpose: Scoring rubric
  ────────────────────────────────────────
  Constant: TECHNICAL_CLAIM_KEYWORDS
  Value: math/protocol/code terms
  Purpose: Pre-filter keyword scan

  Reference: what autognostic already runs

  Plugin-autognostic ships its own ScheduledSyncService using 
  node-cron at 0 3 * * * (3 AM UTC) for knowledge-source      
  refresh. This is separate from WPV discovery — it syncs     
  autognostic's taxonomy sources, not whitepapers. But the    
  plumbing pattern (node-cron library, env-var
  AUTOGNOSTIC_SYNC_CRON override, scheduler-as-service) is a  
  model we can copy.

  ---
  2. What's blocking activation

  Blocker 1 — DiscoveryCron is never instantiated

  WpvService.initFromRuntime skips building it. Single-line   
  type check shows discoveryCron: null as never as a
  placeholder. The WpvScanAction handler catches the null and 
  reports "WPV service not initialized." So even the manual   
  /wpvscan action is dormant.

  Blocker 2 — AcpWrapper is a stub

  AcpMetadataEnricher depends on IAcpClient.browseAgents().   
  The only implementation is AcpWrapper.browseAgents() which  
  returns []. Discovery would enrich every token → get null   
  metadata → skip every token. Zero whitepapers would ingest. 

  Three options to unblock:
  - A. Replace AcpWrapper with a real Virtuals agent-registry 
  client (new code; rate-limited API calls).
  - B. Bridge to the live AcpService (plugin-acp) which       
  already connects to Virtuals' SDK and has a working
  browseAgents method — we used it for video graduation. This 
  is the lowest-friction path.
  - C. Drop enrichment. Discover via raw on-chain events only 
  — but lose agentName and linkedUrls which feed Tier 1–2 of  
  the tiered discovery. Worst quality.

  Recommended: option B. Wire AcpMetadataEnricher to the      
  existing AcpService so discovery and on-demand handlers     
  share the same ACP connection.

  Blocker 3 — No scheduler

  WPV_DISCOVERY_CRON is a string constant nothing reads. Need 
  to add an node-cron task inside a WPV service
  (DiscoveryCronScheduler or inside WpvService.start()).      
  elizaos dev restart-on-file-change would kill an in-process 
  cron; safer to either use PM2's --cron-restart pattern or   
  run the scheduler on a second PM2 process that imports the  
  service.

  ---
  3. Hardening items (not blockers, but need addressing before
   production)

  Dedupe parity with Option B

  DiscoveryCron.runDaily() at line 150 calls
  whitepaperRepo.create() directly, bypassing the
  dedupe-on-address upsert logic we just added to runL1L2. A  
  cron run that re-discovers an existing protocol would create
   a parallel row — exactly the class of bug we just
  eliminated elsewhere. Must extend the Option B dedupe rule  
  to this call site before activating.

  Content filter gate on discovery

  The on-demand validator runs WpvService.scanForViolations on
   buyer requests. DiscoveryCron doesn't. A newly graduated   
  token with a policy-violating name/description would        
  currently ingest unchecked. Add the same gate at the top of 
  each candidate loop iteration.

  lastProcessedBlock persistence

  BaseChainListener holds lastProcessedBlock in-memory. Grey  
  restarts (deploys, pm2 cron at 5am, crashes) reset it to 0. 
  Either:
  - Store it in Supabase (new 1-row key/value table, or a new 
  column on an existing table).
  - Or compute it on startup by reading the newest ingested_at
   from wpv_whitepapers and backing out the block.

  Without this, every restart either re-processes everything  
  or misses a window.

  Cost & rate-limit budgeting

  ┌───────────────────────┬───────────────────────────────┐   
  │        Source         │         Cost per pass         │   
  ├───────────────────────┼───────────────────────────────┤   
  │ L1 structural         │ $0 (no LLM)                   │   
  │ analysis              │                               │   
  ├───────────────────────┼───────────────────────────────┤   
  │ L2 claim extraction   │ ~$0.10–0.15 per paper         │   
  │                       │ (Sonnet)                      │   
  ├───────────────────────┼───────────────────────────────┤   
  │ L3 claim evaluation   │ ~$0.10–0.15 per paper         │   
  ├───────────────────────┼───────────────────────────────┤   
  │ Per-whitepaper total  │ ~$0.20–0.30                   │   
  └───────────────────────┴───────────────────────────────┘   

  At default SELECTION_DEFAULT_THRESHOLD = 6, probably 5–20%  
  of Virtuals-graduated tokens pass. If 10 tokens graduate/day
   and 3 pass, that's ~$1/day, ~$30/month. Manageable, but    
  configurable cap needed (DISCOVERY_DAILY_BUDGET_USD).       

  Rate limits worth watching: GitHub 5000 req/hour with PAT,  
  CoinGecko free ~30/min, DexScreener unauthenticated modest. 
  Current Tiered resolver honors per-call timeouts but doesn't
   enforce daily quota.

  Discovery failure feedback loop

  Current runDaily() logs errors but has no persistence. If   
  Tier 3 GitHub keeps failing for the same reason every day,  
  we won't notice except by tailing logs. Consider:
  - Persist a discovery_runs table with {run_at,
  tokens_scanned, candidates_found, whitepapers_ingested,     
  errors[], duration_ms}.
  - Expose via an action / resource for observability.        

  Retention / pruning

  Unbounded DB growth over months. Need a policy:
  - Keep everything indefinitely (disk is cheap on Supabase;  
  each row is ~10 KB + claims).
  - Or prune rows older than N days with verdict=FAIL AND     
  selection_score < X.

  Decide before turning on the firehose, not after.

  Trigger source tagging

  Verifications created by cron should be tagged
  trigger_source: 'cron_discovery' (distinct from
  'acp_live_l1', 'manual', etc.) so we can isolate
  cron-originated rows in audits.

  ---
  4. Orthogonal question: should briefings pull from cron     
  results?

  Right now, daily_technical_briefing aggregates from
  whatever's in wpv_verifications — currently 10 seeded rows. 
  Once cron runs, the briefing deliverable will start
  reflecting fresh Base-chain activity. This is the right     
  direction but worth Forces agreeing:

  - Should briefings filter to trigger_source='cron_discovery'
   AND ingested_within_last_N_days? Or include seed rows      
  forever?
  - Should briefings cap at 10 even when 50 new projects      
  discovered in a day? Already caps (MAX_BRIEFING_SIZE = 10)  
  but sort order is by recency.

  ---
  5. Recommended activation sequence

  1. Wire AcpMetadataEnricher → live AcpService (option B     
  above). No new SDK work — reuses plugin-acp's browse.       
  2. Apply Option B dedupe + violation-content filter to      
  DiscoveryCron.runDaily(). Two small patches.
  3. Persist lastProcessedBlock to Supabase.
  4. Instantiate DiscoveryCron in WpvService.initFromRuntime. 
  Replace null as never.
  5. Add a scheduler. Simplest: node-cron task started from   
  WpvService.start(), respects WPV_DISCOVERY_CRON and
  DISCOVERY_ENABLED env vars (off by default, explicit        
  opt-in).
  6. Dry-run test: run once manually via /wpvscan action.     
  Verify 0–few ingestions, no crashes, no duplicate rows.     
  7. Flip DISCOVERY_ENABLED=true in VPS env. Schedule fires at
   next 06:00 UTC.
  8. Observe for 3 days: count ingestions, spot-check quality,
   check cost, check for rate-limit complaints.
  9. Iterate on thresholds based on what the first cohort     
  looks like.

  Estimated scope

  - Steps 1–4: ~half day (plus reviews).
  - Step 5: ~2 hours (cron wiring + env gate).
  - Tests: ~3 hours (mock BaseChainListener events, mock      
  enricher returns, verify dedupe holds in cron path, verify  
  violation filter blocks).
  - Total: ~1 full day of focused work before flipping the    
  switch.

  Pre-activation decisions Forces should make

  1. Enrichment source: live AcpService bridge (recommended)  
  vs. a new Virtuals client.
  2. Budget cap: hard $/day limit, and behavior on limit hit  
  (skip remaining, or error-out the run).
  3. Retention policy: keep-forever vs. prune-old.
  4. Violation-content stance: same filter as on-demand       
  (reject at ingestion) or more permissive (ingest, tag,      
  exclude from briefings only)?
  5. Initial rollout: first week at threshold=8 (strict) then 
  relax, or start at threshold=6 and live with noise?