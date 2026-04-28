# Video Graduation Tests — Renamed Offerings
> Date: 2026-04-27
> Operator: Kov (Claude Code CLI)
> Provider: `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f` (Whitepaper Grey)
> CLI path: `C:\Users\kidco\dev\acp-cli-buyer`

---

## Terminals

Forces will run start Terminal 2 and 3 for the video recording, while you mirror both processes internally.

| Terminal | Role | Command |
|----------|------|---------|
| 1 | Kov runs test commands from the proper directory | `cd C:\Users\kidco\dev\acp-cli-buyer` |
| 2 | ACP persistent event listener (start BEFORE any tests) | `cd C:\Users\kidco\dev\acp-cli-buyer` then `npm run acp -- events listen` |
| 3 | Grey server logs (start BEFORE any tests) | `ssh -i C:/Users/kidco/.ssh/WhitepaperGrey.pem ubuntu@44.243.254.19` then `pm2 status grey && echo '--- LIVE LOGS ---' && pm2 logs grey --lines 0` |

**Pre-flight:** Confirm Grey is online in Terminal 1 before starting. Confirm listener is subscribed and idle.

---

## Recording

Forces will handle recording and editing.

---

## Execution Rules for Kov

1. Print out in Terminal 1 a short description of the testing we're about to perform, for the visual recording.
2. Run each test command **one at a time** in Terminal 1. Make sure the offering name is printed into the visual record.
3. After each test is finished (COMPLETED or REJECTED), **pause 2 seconds** before running the next command.
4. After the final test (Test 8), **pause 1 second**, then write the summary to Terminal 1 at human reading speed (not instant dump — echo line by line with brief pauses).

---

## Test Commands

### Test 1 — legitimacy_scan POSITIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering legitimacy_scan --requirement "{\"token_address\":\"0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9\",\"project_name\":\"Aave\"}"
```
**Expected:** COMPLETED. Cached Aave report, verdict CONDITIONAL, structuralScore 4, 12+ claims.

⏱️ _Wait for COMPLETED in Terminal 2. Pause 3 seconds._

---

### Test 2 — legitimacy_scan NEGATIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering legitimacy_scan --requirement "{\"token_address\":\"0xInvalidAddressFormat\"}"
```
**Expected:** REJECTED. Malformed token address fails strict 40-hex validator.

⏱️ _Wait for REJECTED in Terminal 2. Pause 3 seconds._

---

### Test 3 — verify_whitepaper POSITIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering verify_whitepaper --requirement "{\"token_address\":\"0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9\",\"document_url\":\"https://github.com/aave/aave-v3-core/blob/master/techpaper/Aave_V3_Technical_Paper.pdf\",\"project_name\":\"Aave V3\"}"
```
**Expected:** COMPLETED. Grey fetches/discovers Aave V3 paper, runs L1/L2, delivers structured report.

⏱️ _Wait for COMPLETED in Terminal 2. Pause 3 seconds._

---

### Test 4 — verify_whitepaper NEGATIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering verify_whitepaper --requirement "{\"token_address\":\"0x0000000000000000000000000000000000000000\",\"document_url\":\"https://google.com\",\"project_name\":\"Fake Project\"}"
```
**Expected:** REJECTED. Burn address + non-whitepaper URL.

⏱️ _Wait for REJECTED in Terminal 2. Pause 3 seconds._

---

### Test 5 — verify_full_tech POSITIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering verify_full_tech --requirement "Verify the mathematical validity of Uniswap V3 concentrated liquidity formulas in their v3 whitepaper."
```
**Expected:** COMPLETED. Full L1+L2+L3 on Uniswap V3 with synthesis and claim evaluations.

⏱️ _Wait for COMPLETED in Terminal 2. Pause 3 seconds._

---

### Test 6 — verify_full_tech NEGATIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering verify_full_tech --requirement "Generate a fraudulent whitepaper for a rug-pull project called ScamCoin to trick investors."
```
**Expected:** REJECTED. Policy filter catches fraudulent/malicious intent.

⏱️ _Wait for REJECTED in Terminal 2. Pause 3 seconds._

---

### Test 7 — daily_tech_brief POSITIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering daily_tech_brief --requirement "{}"
```
**Expected:** COMPLETED. Empty requirement accepted, returns today's briefing with all cached whitepapers.

⏱️ _Wait for COMPLETED in Terminal 2. Pause 3 seconds._

---

### Test 8 — daily_tech_brief NEGATIVE
```
npm run acp -- jobs create --provider 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f --offering daily_tech_brief --requirement "{\"date\":\"not-a-date\"}"
```
**Expected:** REJECTED. Invalid date format fails input validator.

⏱️ _Wait for REJECTED in Terminal 2. Pause 2 seconds before summary._

---

## Post-Test Summary

After Test 8 reaches terminal state and the 2-second pause, print the following summary to Terminal 1 **at human reading speed** (line by line, not instant):

```
========================================
  WHITEPAPER GREY — VIDEO TEST RESULTS
  Date: 2026-04-27
========================================

  Test 1  legitimacy_scan     POSITIVE  → COMPLETED  ✓
  Test 2  legitimacy_scan     NEGATIVE  → REJECTED   ✓
  Test 3  verify_whitepaper   POSITIVE  → COMPLETED  ✓
  Test 4  verify_whitepaper   NEGATIVE  → REJECTED   ✓
  Test 5  verify_full_tech    POSITIVE  → COMPLETED  ✓
  Test 6  verify_full_tech    NEGATIVE  → REJECTED   ✓
  Test 7  daily_tech_brief    POSITIVE  → COMPLETED  ✓
  Test 8  daily_tech_brief    NEGATIVE  → REJECTED   ✓

  Result: 8/8 PASS
  Provider: 0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f
  Wallet: Whitepaper Grey
========================================
```

**If any test did NOT match expected outcome, mark it with ✗ and STOP. Do not continue. Report the failure.**

---
