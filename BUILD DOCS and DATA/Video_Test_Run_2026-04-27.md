# Video Test Run — 2026-04-27

> Operator: Kov (Claude Code CLI) on Terminal 1
> Provider: `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f` (Whitepaper Grey)
> Buyer: `0x22a37c576f7c7ed7755a2673b56130b773dc56a6` (Grey Test Buyer)
> Chain: Base (8453)
> Plan: `Video_Test_Schema_v2.md` (commands corrected pre-flight to match actual CLI)

---

## Result: 8/8 PASS

| # | Offering | Path | Job | Lifecycle | Outcome |
|---|---|---|---|---|---|
| 1 | legitimacy_scan | POSITIVE | 2226 | open → budget_set → funded → submitted → completed | verdict **CONDITIONAL** (Aave, Fix-4 MiCA path) |
| 2 | legitimacy_scan | NEGATIVE | 2227 | open → rejected | strict 40-hex EVM validator caught `0xInvalidAddressFormat` |
| 3 | verify_whitepaper | POSITIVE | 2228 | open → budget_set → funded → submitted → completed | verdict **CONDITIONAL** (Aave V3 with docs URL, L1+L2) |
| 4 | verify_whitepaper | NEGATIVE | 2229 | open → rejected | burn-address detector caught `0x000…000` |
| 5 | verify_full_tech | POSITIVE | 2230 | open → budget_set → funded → submitted → completed | verdict **CONDITIONAL** (Uniswap V3 free-text, KNOWN_PROTOCOL_PATTERN matched) |
| 6 | verify_full_tech | NEGATIVE | 2233 | open → rejected | policy filter caught fraudulent rug-pull request |
| 7 | daily_tech_brief | POSITIVE | 2234 | open → budget_set → funded → submitted → completed | totalVerified=10 (today's batch) |
| 8 | daily_tech_brief | NEGATIVE | 2235 | open → rejected | date validator caught `not-a-date` |

**USDC spent on positives:** $0.10 (0.01 + 0.02 + 0.03 + 0.04). Negatives cost nothing — all rejected pre-accept before any escrow movement.

---

## Grey's behavior

- **Acceptance latency:** budget.set fired within ~2 seconds for every accepted job. No timeouts, no SLA breaches.
- **Rejection latency:** all 4 negatives hit terminal `rejected` within ~2 seconds — Phase-1 validators firing fast at the input boundary.
- **Pipeline depth:** L1 cache for Tests 1, 7. L1+L2 enrichment for Test 3 (Aave V3 with docs URL — ~25 seconds). Free-text parsing + KNOWN_PROTOCOL_PATTERN routing for Test 5 (Uniswap V3, cached).
- **Verdict logic:** Every cached protocol returned CONDITIONAL — the existing Fix-4 (MiCA YES + compliant NO) and Path B (KNOWN protocol + MiCA NOT_MENTIONED + NO) verdict downgrades both fired correctly.
- **Adversarial coverage:** Strict EVM regex (Test 2), burn-address denylist (Test 4), policy/fraud content filter (Test 6), and date format validator (Test 8) all rejected at the validator boundary with no escrow exposure.
- **Lifecycle integrity:** Every positive job moved through the full state machine cleanly. No stranded `budget_set` jobs, no funds held, every deliverable approved and completed.

---

## What this confirms

- **Renamed offerings are on the on-chain record** — `legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `daily_tech_brief` all show in Jobs 2226-2235 with the new names matching the Graduation Report.
- **Path B (regulatory portal downgrade) is firing** — visible in Tests 1 and 5 deliverables.
- **Policy filter is firing** — Test 6's "fraudulent rug-pull" request rejected pre-accept.
- **Validator hardening is firing** — Tests 2, 4, 8 caught at input boundary.
- **No buyer-side scripting issues** — driving the lifecycle via `acp client create-job` + `acp job history` polling + `acp client fund` + `acp client complete` is reliable on Windows/Git Bash. The previous `acp job watch` race is structurally avoided by the polling pattern.

---

## Notes for Forces

- The `Video_Test_Schema_v2.md` plan needed pre-flight CLI syntax corrections (`jobs create` → `client create-job`; `--offering` → `--offering-name`; `--requirement` → `--requirements`; added `--chain-id 8453`). The plan file has been updated in place to reflect what actually ran.
- An explicit lifecycle handling rule was added (Execution Rule 3) so the next operator/run reproduces this without rediscovery.
- All 8 jobs produced clean, signed, on-chain terminal states. Recording captures every offering name in the visual record.
