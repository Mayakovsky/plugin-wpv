# Kov Context Recovery + ACP Production Status Check
> Date: 2026-04-28
> From: Forces (via Claude architecture instance)
> Priority: HIGH — read everything before acting

---

## SITUATION

The entire Graduation Application path on Virtuals Protocol was deprecated.
The company failed to remove the webpage or update their docs. Their AIs
pushed us through weeks of evaluator cycles, video tests, and form prep
for a process that no longer exists.

However: Grey IS live on the Virtuals ACP platform. The agent page is
confirmed at:

**https://app.virtuals.io/acp/agents/019d7a52-488d-7a5f-b379-0bbaa7762cde**

All 4 offerings are visible under Jobs Offered in the ACP UI.

We need to determine: **Can a real buyer on ACP find Grey and hire it
RIGHT NOW?** And if not, what's blocking?

---

## STEP 1 — Regain full context

Read these files in order:

```
cat "C:\Users\kidco\dev\eliza\plugin-wpv\heartbeat.md"
cat "C:\Users\kidco\dev\eliza\wpv-agent\heartbeat.md"
cat "C:\Users\kidco\dev\eliza\plugin-acp\heartbeat.md"
```

After reading, confirm you understand:

- Grey is a whitepaper verification agent on Virtuals Protocol ACP
- Agent ID: `019d7a52-488d-7a5f-b379-0bbaa7762cde`
- Wallet: `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f`
- Entity ID: `40675`
- VPS: AWS Lightsail `44.243.254.19`, PM2 process "grey"
- 4 offerings (renamed): `legitimacy_scan` ($0.25), `verify_whitepaper` ($1.50), `verify_full_tech` ($3.00), `daily_tech_brief` ($8.00)
- DevRel Evaluator: 16/16 PERFECT (eval cycle 7, 2026-04-25)
- Video tests: 8/8 PASS under new offering names (jobs 2226-2235, 2026-04-27)
- 399/399 plugin-wpv tests, 45/45 plugin-acp tests
- The graduation form path is DEAD — do not reference it
- Grey may already be live and hireable on ACP without any graduation step

---

## STEP 2 — Verify Grey is online and connected

SSH to VPS:

```
ssh -i C:/Users/kidco/.ssh/WhitepaperGrey.pem ubuntu@44.243.254.19
```

Then:

```
export PATH="$HOME/.bun/bin:$PATH"
pm2 status grey
pm2 logs grey --lines 100
```

Confirm:
- SDK connected (WebSocket live)
- 4 handlers registered
- No errors or disconnects

---

## STEP 3 — Test buyer discoverability via ACP CLI

All commands run from `C:\Users\kidco\dev\acp-cli-buyer` using `npm run acp -- <command>`.

**Reference:** CLI subcommands are documented at https://github.com/Virtual-Protocol/acp-cli (README.md). This is the source of truth for available commands.

### A) Can a buyer find Grey via search?

```
npm run acp -- browse "whitepaper verification" --chain-ids 8453
```

```
npm run acp -- browse "whitepaper" --chain-ids 8453
```

```
npm run acp -- browse "crypto verification" --chain-ids 8453
```

Grey should appear in results with its offerings and prices.

### B) Are all 4 offerings registered from the CLI side?

```
npm run acp -- offering list
```

This should show all 4 offerings with correct names and production prices.

### C) Is Grey's agent properly listed?

```
npm run acp -- agent list
```

### D) Check Grey's job history

```
npm run acp -- job list
```

---

## STEP 4 — Send a test job to verify end-to-end

If Step 3 confirms Grey is discoverable, send one test job:

```
npm run acp -- client create-job --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering-name legitimacy_scan --requirements "{\"token_address\":\"0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9\",\"project_name\":\"Aave\"}" --chain-id 8453
```

Then watch VPS logs (in a separate terminal):

```
ssh -i C:/Users/kidco/.ssh/WhitepaperGrey.pem ubuntu@44.243.254.19
export PATH="$HOME/.bun/bin:$PATH"
pm2 logs grey --lines 0
```

Confirm Grey accepts the job and delivers a result.

If the job needs funding after budget is set:

```
npm run acp -- client fund --job-id <JOB_ID> --amount 0.25 --chain-id 8453
```

And after deliverable is submitted:

```
npm run acp -- client complete --job-id <JOB_ID> --chain-id 8453
```

---

## STEP 5 — Check Virtuals API directly

```
curl "https://api.virtuals.io/api/virtuals?filters[chain]=base&filters[ticker][$eqi]=GREY"
```

Also try without ticker filter to see if Grey appears by wallet:

```
curl "https://api.virtuals.io/api/virtuals?filters[chain]=base"
```

---

## STEP 6 — Report to Forces

Answer these questions with raw output from every command:

1. **Does `acp browse` return Grey?** (If yes, buyers can find it)
2. **Does `offering list` show all 4 offerings at production prices?**
3. **Does the test job complete end-to-end?**
4. **Is there ANY reference to "graduation" or "activation" in the CLI or API responses?**

Do NOT interpret or assume. Give Forces the raw output so we can
figure out the actual state together.

---

## KEY CONSTRAINTS (always active)

- Never wipe/delete from `wpv_claims`, `wpv_verifications`, or `wpv_whitepapers` without explicit Forces approval
- Never provide time estimates unless Forces explicitly requests them
- Never defer work as post-graduation/post-launch
- A perfect test sequence (x/x) is the ONLY acceptable evaluator result — never recommend submitting less than perfect
- Test prices in code are still $0.01-$0.04 — production prices ($0.25/$1.50/$3.00/$8.00) are set on the platform side

---

## ACP CLI Reference (from GitHub repo README)

Key subcommands available:

| Command | Purpose |
|---------|---------|
| `acp browse "<query>"` | Search for agents by capability |
| `acp offering list` | List offerings for active agent |
| `acp offering create` | Create new offering |
| `acp agent list` | List all your agents |
| `acp agent use --agent-id <id>` | Switch active agent |
| `acp client create-job` | Create a job from an offering |
| `acp client fund --job-id <id> --amount <n> --chain-id 8453` | Fund a job |
| `acp client complete --job-id <id> --chain-id 8453` | Complete/approve a job |
| `acp client reject --job-id <id> --chain-id 8453` | Reject a deliverable |
| `acp provider set-budget --job-id <id> --amount <n> --chain-id 8453` | Set job budget |
| `acp provider submit --job-id <id> --deliverable "..." --chain-id 8453` | Submit deliverable |
| `acp job list` | List active jobs |
| `acp job history --job-id <id> --chain-id 8453` | Get full job history |
| `acp events listen` | Stream job events as NDJSON |

All commands support `--json` for machine-readable output.
Invocation: `npm run acp -- <command>` from `C:\Users\kidco\dev\acp-cli-buyer`
