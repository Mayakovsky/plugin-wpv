# Grey Orientation

**For:** Kov
**Read when:** starting cold on Grey, or returning after a long gap
**Re-read:** skim before each movement; full re-read not required between sessions

This document is the cold-start reference. It tells you what Grey is, what's already running, where the code lives, and what the rules of engagement are. Every movement packet assumes you have this in context.

The orientation is stable across movements — it describes the state of Grey, not the work being done. When the state of Grey changes (Movement 0 lands, Phase 2 ships, a new platform comes online), this document gets updated. Movement packets don't.

---

## What Grey is

**Whitepaper Grey** is an autonomous DeFi due diligence agent. It reads cryptocurrency whitepapers, extracts the claims projects make about themselves, evaluates those claims against evidence (audits, on-chain data, academic literature, prior verifications), and returns structured verdicts.

Forces is the lead developer and architect. Grey is part of **SCIGENT** (Scientific Generation — the larger organizational scope). Grey is a SCIGENT Level 1 worker agent. Level 0 is `plugin-autognostic` (knowledge infrastructure). Level 2 is the Agent Teams Agency (future).

**Internal handle:** Verification Agent.
**Public brand:** "Whitepaper Grey" (company/product), "Grey" (agent persona).
**Twitter:** @WhitepaperGrey.
**Website:** whitepapergrey.com (live).
**Tagline:** Autonomous DeFi Due Diligence.

**Why Grey exists:** EU MiCA regulation requires crypto whitepaper compliance. Exchanges are delisting non-compliant tokens. Most whitepapers are never systematically verified. Grey verifies them automatically and sells the analysis to other agents and (eventually) humans.

---

## The V/R/I posture (how we think about who Grey serves)

Grey is one monolithic verification pipeline. Its outputs are exposed as multiple offerings shaped for three buyer concentrations:

- **Verification** — buyers who need ground truth ("is this claim true?"). Examples: legitimacy_scan, whitepaper_verification, claim_evaluation, audit_posture_check, tokenomics_audit.
- **Research** — buyers running their own pipelines who need Grey's outputs as components ("give me raw material"). Examples: claim_extraction, claim_history, quick_protocol_facts, comparative_analysis, mass_screen.
- **Intelligence** — buyers making consequential decisions ("help me decide"). Examples: daily_tech_brief, technical_briefing, prediction_market_research, resolution_evidence_compiler, allocation_risk_report.

The 17 total offerings (post-Phase-2) split 7 Verification / 5 Research / 5 Intelligence. The API stays granular; V/R/I is how we *describe* Grey to humans (BD pitches, marketing copy), not how we partition code.

---

## Current state of Grey (as of this orientation)

### Live and earning

**Grey is live on the Virtuals ACP** as of May 2026. Graduation completed. ACP networking official.

Live agent identifiers:
- **ACP Agent ID:** `019d7a52-488d-7a5f-b379-0bbaa7762cde`
- **ACP public wallet:** `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f`
- **ACP session entity key ID:** `40675`
- **ACP signer wallet:** whitelisted burner EOA, private key in `plugin-wpv/.env` on the Lightsail VPS

### Currently registered offerings on Virtuals ACP

These 4 are live and earning at the time of this orientation. After Movement 0 lands, this expands to 10.

| Offering | Price | What it does |
|---|---|---|
| `legitimacy_scan` | $0.25 | Structural score, claim count, MiCA status, verdict (by token or project name) |
| `verify_whitepaper` | $1.50 | Full L1/L2 analysis of a whitepaper URL with claim extraction |
| `verify_full_tech` | $3.00 | Deep L1+L2+L3 with per-claim evaluation, mathematical validity, synthesis |
| `daily_tech_brief` | $8.00 | Aggregated briefing across all verified whitepapers for a given date |

All return structured JSON. Sub-2-minute response on cached verifications.

### Infrastructure

**Production VPS:** AWS Lightsail in us-west-2. IP `44.243.254.19`. Ubuntu 24.04 LTS. ElizaOS Grey runs as a systemd-managed service.

**Database:** Supabase Cloud, region Hillsboro Oregon (co-located with the VPS region for low latency). Pro tier. Postgres with pgvector for semantic search.

**Tables (Grey's current schema):**
- `wpv_whitepapers` — whitepapers ingested
- `wpv_verifications` — verification records (one per ACP job)
- `wpv_claims` — extracted claims tied to whitepapers
- (additional support tables for cache, scoring history, etc.)

**New Grey will use a separate schema** named `grey_two` to keep its tables completely independent from `wpv_*`. The `wpv_*` tables are read-only from `grey_two`'s perspective and never written to by New Grey.

### Brand identifiers (canonical, for any copy you write)

| Element | Value |
|---|---|
| Company/Product | Whitepaper Grey |
| Agent persona | Grey |
| Internal handle | Verification Agent |
| ACP Agent ID | `019d7a52-488d-7a5f-b379-0bbaa7762cde` |
| Twitter | @WhitepaperGrey |
| Website | whitepapergrey.com |
| Tagline | Autonomous DeFi Due Diligence |

Never use "WPV Agent" externally. Internal only, and even internally it's being retired.

---

## The pipeline (how Grey actually works)

Grey's analysis pipeline has three layers. Understanding L1 vs L2 vs L3 is essential because most of the new offerings are reshapings of one or more layers' output.

### L1 — Structural analysis

**What it does:** Reads the whitepaper and computes structural metrics. Doesn't evaluate truth — just structure.

**Outputs:**
- Structural score (0–5 scale, composite of multiple factors)
- Claim count
- Citation density (references / words)
- Hype-to-tech ratio (vision-language vs. mechanism-language)
- MiCA compliance check (presence of required disclosures)
- Document quality signals (length, sections, formatting)

**`legitimacy_scan` returns L1 output** as its primary product, plus a verdict synthesized from the score and a few other signals.

### L2 — Claim extraction

**What it does:** Identifies discrete factual claims in the document. Categorizes them (technical, economic, security, governance, performance, audit). Tags each with the evidence the document itself cites for it.

**Outputs:**
- List of structured claim objects with text, category, evidence references, location in document

**`verify_whitepaper` returns L1 + L2 output.**

### L3 — Per-claim evaluation

**What it does:** For each claim from L2, evaluates whether the claim is supported by evidence. Evidence sources include:
- The document's own citations (academic literature via Crossref, Semantic Scholar, Unpaywall)
- On-chain data (TVL, user counts, fee data)
- Audit reports (auditor databases, scope, freshness)
- Prior verifications in Grey's own cache
- Mathematical / consensus / cryptographic claim verification

**Outputs:** Each claim gets a verdict (verified / partially verified / unverified / contradicted), a confidence score, reasoning, evidence cited, and (where relevant) the math worked out.

The full report also includes a synthesis pass that ties verdicts together into an overall assessment.

**`verify_full_tech` returns L1 + L2 + L3 output**, the complete analysis.

### `daily_tech_brief`

Different shape — instead of analyzing one whitepaper deeply, it aggregates across all whitepapers verified on a given date into a market-overview document. Drawn from existing verification records in Supabase.

### Pipeline implementation language

Grey's pipeline is implemented in TypeScript within ElizaOS's plugin model. The plugin is **`plugin-wpv`**. The full ElizaOS host runs alongside it.

LLM calls (claim evaluation, synthesis) go to Anthropic's Claude Sonnet via the Anthropic API. Embeddings (for cache lookup and pgvector similarity) go to Anthropic or Voyage via API — not local Ollama. The decision to use API-based embeddings rather than local models was deliberate: keeps the VPS footprint small enough that Playwright (for crawling docs sites) fits in memory.

---

## Codebase layout

### Dev environment (Windows)

Forces's dev machine: `C:\Users\kidco\dev\eliza\`

Grey's plugin lives at: **`C:\Users\kidco\dev\eliza\plugin-wpv\`**

Sibling tooling:
- `C:\Users\kidco\dev\acp-cli-buyer\` — CLI for sending ACP buyer jobs (used during outreach and testing)

GitHub username: **Mayakovsky**. The repo containing `plugin-wpv` follows the standard ElizaOS plugin convention.

PowerShell environment: **PowerShell 5.1, not PowerShell 7**, running as admin. Profile path: `C:\Users\kidco\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`.

Claude Code CLI runs with `--dangerously-skip-permissions` mode.

### `plugin-wpv` structure

The plugin uses **Bun** (`bun.lock` present) for package management, **Vitest** for testing (`vitest.config.ts`), TypeScript throughout, and Drizzle ORM for Supabase access.

Top-level files:
- `package.json` — plugin manifest
- `CLAUDE.md` — Claude Code instructions for this repo (read this in your working session)
- `heartbeat.md` — SeshMem heartbeat file for session continuity
- `tsconfig.json`, `vitest.config.ts`, `bun.lock`, `.env`, `.gitignore`

Source tree (`src/`):

| Path | Purpose |
|---|---|
| `src/index.ts` | Plugin entry point — registers actions, evaluators, providers with ElizaOS |
| `src/WpvService.ts` | Main service class — orchestrates the pipeline and ACP integration |
| `src/types.ts` | Shared type definitions |
| `src/constants.ts`, `src/constants/protocols.ts` | Constants (known protocols, thresholds, etc.) |
| `src/pdf-parse.d.ts` | Type shim for `pdf-parse` |
| `src/acp/` | ACP integration layer (see below) |
| `src/actions/` | ElizaOS conversational actions (chat-side, distinct from ACP handlers) |
| `src/verification/` | The three-layer pipeline (L1/L2/L3) |
| `src/discovery/` | Stage 1 discovery — finding whitepapers from various sources |
| `src/db/` | Drizzle schema + per-table repositories |
| `src/utils/` | Logger, safe serialization |

#### `src/acp/` — ACP integration (where Movement 0 handlers attach)

| File | Purpose |
|---|---|
| `AcpWrapper.ts` | Wraps the ACP SDK; manages session, websocket lifecycle |
| `AgentCardConfig.ts` | Grey's agent card (offerings registry, prices, descriptions exposed to ACP) |
| `JobRouter.ts` | **Routes incoming ACP jobs to handlers.** This is where new offerings get registered. Movement 0 work touches this file. |
| `ResourceHandlers.ts` | ACP resource handler implementations (the actual offering logic glue) |
| `RateLimiter.ts` | Rate limiting on ACP-job intake |

#### `src/verification/` — the three pipeline layers

| File | Layer | Purpose |
|---|---|---|
| `StructuralAnalyzer.ts` | L1 | Structural scoring, claim count, hype-to-tech ratio, MiCA presence check |
| `ClaimExtractor.ts` | L2 | Extracts structured claims from whitepaper text |
| `ClaimEvaluator.ts` | L3 | Per-claim evaluation against evidence |
| `ScoreAggregator.ts` | composite | Aggregates L1/L2/L3 into a composite score |
| `ReportGenerator.ts` | synthesis | Produces the synthesis pass / final report |
| `CostTracker.ts` | observability | Tracks per-call API cost |
| `anthropicFetchClient.ts` | LLM client | Anthropic API client used by L2 + L3 + synthesis |

**For Movement 0:** `ClaimEvaluator.ts` is the engine behind `claim_evaluation` (atomic single-claim). `ClaimExtractor.ts` output feeds `claim_extraction`. `ReportGenerator.ts` produces the L3 sections that `audit_posture_check` and `tokenomics_audit` will extract from.

#### `src/discovery/` — stage 1 (finding whitepapers, not used by Movement 0)

19 files implementing the cascade: `BaseChainListener.ts` → `WhitepaperSelector.ts` → `TieredDocumentDiscovery.ts` → `TieredResolver.ts` and resolver ladder (`GitHubResolver`, `WebsiteScraper`, `HeadlessBrowserResolver`, `FetchContentResolver`, `CryptoContentResolver`, `AggregatorResolver`, `LlmsTxtResolver`, `WebSearchFallback`). Plus support: `ForkDetector`, `MarketTractionAnalyzer`, `SyntheticWhitepaperComposer`, `DocsSiteCrawler`, `SiteSpecificRegistry`, `AcpMetadataEnricher`, `similarity`, `DiscoveryCron`.

Movement 0 does NOT touch discovery — all 6 new offerings work on already-discovered whitepapers or already-stored verification records.

#### `src/db/` — Drizzle schema + repos

| File | Purpose |
|---|---|
| `wpvSchema.ts` | Drizzle schema definitions for all `wpv_*` tables |
| `wpvWhitepapersRepo.ts` | `wpv_whitepapers` table CRUD |
| `wpvVerificationsRepo.ts` | `wpv_verifications` table CRUD |
| `wpvClaimsRepo.ts` | `wpv_claims` table CRUD |

**For Movement 0:** `claim_history` is a pure Supabase read query that uses `wpvVerificationsRepo` and `wpvClaimsRepo` directly. No schema changes needed.

#### `src/actions/` — ElizaOS conversational actions

Separate from ACP handlers. These are the chat-side actions Grey can take when conversed with in ElizaOS contexts.

Files: `wpvScanAction.ts`, `wpvVerifyAction.ts`, `wpvStatusAction.ts`, `wpvCostAction.ts`, `wpvAlertsAction.ts`, `wpvGreenlightAction.ts`.

Movement 0 does NOT touch these. The 6 new offerings are ACP-side only.

### Tests (`tests/`)

36 Vitest test files. Movement 0 will add new tests; existing tests of note:

| Test | What it covers |
|---|---|
| `JobRouter.test.ts` | ACP job routing — your new handlers need parallel tests here |
| `ResourceHandlers.test.ts` | ACP resource handlers |
| `ClaimEvaluator.test.ts` | L3 evaluator (relevant for `claim_evaluation`) |
| `ClaimExtractor.test.ts` | L2 extractor (relevant for `claim_extraction`) |
| `StructuralAnalyzer.test.ts` | L1 analyzer |
| `ReportGenerator.test.ts` | Synthesis pass (relevant for `audit_posture_check`, `tokenomics_audit`) |
| `MicaCompliance.test.ts` | MiCA check (already integrated into `legitimacy_scan`) |
| `findBestWhitepaper.test.ts` | Cache lookup (relevant for `quick_protocol_facts`, `claim_history`) |
| `evalSweep.test.ts` | Full evaluation sweep — run after Movement 0 to confirm no regression |
| `integration.test.ts` | End-to-end integration |

Run the full suite with `bun test` (or `vitest`) after Movement 0 changes to confirm nothing regressed.

### Working docs (`BUILD DOCS and DATA/`)

Forces's active project working directory. The current authoritative document set lives at the root of this directory. Historical work — graduation-era plans, eval reports, hotfix work orders, superseded architecture documents — has been moved to `BUILD DOCS and DATA/build_archive/` and should be treated as historical context only.

**Active documents at `BUILD DOCS and DATA/` root (the current authoritative set):**

- `_README.md` — directory orientation; read this first
- `grey-orientation.md` — this document
- `grey-deployment-plan-v7.md` — strategic frame, V/R/I posture, offerings, pricing, outreach
- `phase2-work-breakdown-kovsky.md` — Phase 2 step-by-step tasks (includes Step 0)
- `phase2-deployment-checklist.md` — operational verification gates
- `grey-wallet-infrastructure.md` — multi-chain wallet hierarchy
- `x402-middleware-adapter-skeleton.md` — buildable TypeScript scaffold
- `movement-0-eliza-expansion.md` — working packet for Movement 0
- (additional movement packets added as they're drafted: `movement-1-*.md` through `movement-6-*.md`)

**`build_archive/` subdirectory:** historical work orders, prior architecture versions, eval reports, hotfix plans, pre-graduation checklists. **Do not execute against these.** They describe completed work, deprecated approaches, or superseded plans. Refer to them only if you need historical context for *why* something is the way it is — never as instructions for what to do now.

If you encounter a document that looks like a work order in this directory or its subdirectories and aren't sure whether it's current, default to **archived** and ask Forces. The current authoritative set is the list above; anything else is historical unless explicitly added to that list.

### Production (Linux)

AWS Lightsail VPS, Ubuntu 24.04 LTS, us-west-2.
- Public IP: `44.243.254.19`
- Deployment directory on VPS contains the built plugin + ElizaOS host
- Service managed by systemd
- `.env` file with secrets (perms 600) — contains ACP signer key, Anthropic API key, Supabase service role key

The dev workflow: develop in `C:\Users\kidco\dev\eliza\plugin-wpv\` on Windows, push to GitHub, pull and rebuild on the Lightsail VPS, restart the systemd unit.

### Build/test commands

From `plugin-wpv\` root:

```
bun install              # install deps
bun run build            # compile TypeScript to dist/
bun test                 # run full test suite via vitest
bun test JobRouter       # run a single test file by pattern
```

(If Kov prefers `npm` or `pnpm`, `bun.lock` is the existing lockfile — sticking with bun is the path of least friction.)

---

## The ACP relationship

Virtuals ACP is the agent commerce platform Grey is currently registered on. The relationship works as follows:

- **Service registry:** Grey's 4 offerings are registered in Virtuals' ACP service registry with names, descriptions, prices, and SLAs.
- **Buyer-initiated jobs:** Another agent (or human via ACP) sends a job request to Grey targeting one of the registered offerings.
- **On-chain commitment:** The job creates an on-chain Account between Grey and the buyer, with USDC escrow on Base.
- **Grey's response:** ElizaOS Grey receives the job via the ACP websocket lifecycle, dispatches to the appropriate handler, runs the pipeline, returns structured JSON as the deliverable.
- **Settlement:** Buyer accepts the deliverable; escrow releases to Grey's smart contract wallet.
- **Notification Memos:** Grey can send a post-delivery memo to the buyer's Account (used as an outreach channel — see outreach context below).

**Adding a new offering to the ACP** means:
1. Implementing the handler in `plugin-wpv`
2. Registering the offering in Grey's ACP service registry (Forces handles the registration UI/JSON side)
3. The new offering becomes discoverable via ACP `browse` and visible on Grey's agent page

**Outreach context (relevant if you're working near the outreach campaign):** Virtuals ACP has no in-platform messaging. So Grey's outreach happens as a *buyer* — Grey purchases services from other agents using its ACP wallet, which creates persistent on-chain Accounts and gets Grey into target agents' LLM context. This is paired with Twitter @-mentions for visibility. Forces runs the outreach; the implementation work for outreach is bounded (mostly `acp browse` queries from `C:\Users\kidco\dev\acp-cli-buyer`).

---

## The big-picture work (where Movements come from)

The full plan has Grey going live on Virtuals (done), then expanding to 8 more platforms over time. The architecture has two parts:

1. **ElizaOS Grey** — the current deployment. Serves Virtuals ACP. Stays running indefinitely on the VPS. Modified ONCE during Movement 0 to add 6 new offerings, then locked at `phase2-baseline` git tag for the rest of Phase 2.

2. **New Grey (`grey-core`)** — built fresh during Phase 2 as a separate codebase. Serves every other platform (x402 Bazaar, Olas Mech, Nevermined, Skyfire, direct B2B, Kite, Bittensor). Lives at port 3001 on the same VPS, completely independent of ElizaOS Grey at the process level. Uses a new Supabase schema `grey_two` separate from `wpv_*`.

The two systems coexist. Phase 3 (whether to retire ElizaOS Grey or keep it running indefinitely) is a future decision — coexistence is the default.

### Movements

The work is organized into seven movements:

- **Movement 0:** ElizaOS expansion — adds 6 new offerings to live ElizaOS Grey before outreach starts. The one deliberate exception to the lock.
- **Movement 1:** Phase 2 Steps 1+2 — monorepo setup + pipeline extraction to `grey-pipeline`
- **Movement 2:** Phase 2 Step 3 — `grey-schemas` package with JSON Schema for all 17 offerings
- **Movement 3:** Phase 2 Step 4 — `grey-core` HTTP service exposing all 17 routes
- **Movement 4:** Phase 2 Steps 5+6 — ERC-8004 identity on Celo + wallet infrastructure
- **Movement 5:** Phase 2 Steps 7+8 — x402 middleware adapter + VPS deployment + x402 Bazaar listing
- **Movement 6:** Phase 2 Step 9 — independent parity check between ElizaOS Grey and grey-core

Each movement has its own packet (`movement-N-name.md`) that gives you the bounded set of work for that session. The packets reference the score (the main spec set: deployment plan v7, work breakdown, deployment checklist, wallet infra) for any detail not in the packet.

---

## The don't-touch rules

These are the standing constraints. They apply across every movement.

### ElizaOS Grey is touched ONCE in Movement 0, then locked

The `phase2-baseline` git tag is captured at the end of Movement 0. From that moment until Phase 3 explicitly begins:

- No commits to the ElizaOS Grey repo
- No dependency updates
- No deployment changes to the systemd service
- No environment variable changes (except secret rotation if a wallet is compromised)

If anything in a later movement seems to require touching ElizaOS Grey, stop and check with Forces. The lock is the safety guarantee that the live revenue surface doesn't drift.

### `wpv_*` Supabase tables are read-only from New Grey

New Grey (`grey-core`) can read `wpv_whitepapers`, `wpv_verifications`, `wpv_claims`, etc. — but never writes to them. New Grey's writes go to `grey_two.*` exclusively.

### Wallet keys are tiered (per wallet infrastructure doc)

You'll handle Tier A wallet keys in `grey-core`'s `.env` (VPS). You will NOT generate or possess Tier B or Tier D keys — those are Forces's, offline. The sweeper module signs Tier A transactions only; everything beyond Tier A is manual Forces work.

### No `wpv_*` table deletes, ever, without explicit Forces approval

This is the standing data-protection rule. A prior accidental wipe required manual recovery. The rule: never instruct or run any deletion against `wpv_whitepapers`, `wpv_verifications`, or `wpv_claims` without Forces explicitly saying so in the chat for that specific operation.

### Don't restart ElizaOS Grey's systemd service unless Movement 0 explicitly calls for it

It's serving live ACP buyers. Restarts mean dropped websocket connections and possible job-completion failures.

---

## Tooling notes

- **TypeScript** for the JS/TS side (ElizaOS plugin, grey-core, x402 adapter). The plugin uses Bun as the runtime + package manager and Vitest for testing — sticking with these in Movement 0 is the path of least friction.
- **Python** for the Olas Mech tool wrapper, Agentverse uagent, and Bittensor miner (later movements). Not relevant for Movement 0.
- **Drizzle ORM** is the existing ORM for Supabase access in ElizaOS Grey (schema in `src/db/wpvSchema.ts`, repos in `src/db/wpv*Repo.ts`). New Grey may or may not continue with Drizzle — your call when you get to Movement 1.
- **Anthropic SDK** for LLM calls (Claude Sonnet for analysis). Existing client lives at `src/verification/anthropicFetchClient.ts`.
- **Express** for HTTP services in grey-core unless you have a reason to swap (Movement 3).

The work breakdown notes that tooling defaults are *suggestions* — you can swap any of them in New Grey if you see a reason. **For Movement 0, do not swap anything in ElizaOS Grey.** That repo's tooling choices are part of what's locked.

---

## How to use this orientation across movements

1. **First cold start:** read this document end to end. Open the movement packet for whatever you're starting (Movement 0 if you're at the beginning).

2. **Returning after a gap:** skim this document. Spend more time on the section relevant to the current movement (e.g., if you're on Movement 4, the wallet section in the wallet-infra companion doc plus the don't-touch rules here).

3. **Within a session:** don't re-read this document inside a working session. Keep the movement packet as your active context; consult the score docs (work breakdown, deployment checklist, wallet infra) when you need detail; come back to this orientation only if something foundational becomes unclear.

4. **When this document is wrong:** tell Forces. The orientation is intended to be stable but it represents Forces's understanding of the system at the time of writing. If you discover something at odds with what's here, Forces wants to know — both to update this doc and because it might mean the spec set is drifting from reality.

---

## What success looks like across the movements

Movement 0 succeeds when the 4 live offerings have grown to 10 and the `phase2-baseline` tag is captured cleanly.

Phase 2 (Movements 1–6) succeeds when `grey-core` is live on the VPS, earning real USDC through x402 Bazaar settlements, with all 17 offerings registered and a parity check passing between ElizaOS Grey and grey-core on overlapping offerings.

Beyond Phase 2, the work expands to additional platforms (Olas Mech, Nevermined, Skyfire, etc.) — but those are out of scope for the seven movements above.

---

*Grey Orientation v1 (evergreen — updated only when Grey's state materially changes), May 12, 2026. Cold-start reference for Kov. Companion to deployment plan v7.*
