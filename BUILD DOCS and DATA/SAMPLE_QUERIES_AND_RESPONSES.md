# **Job Offerings**

## **Names/Descriptions/SLA**

### **project_legitimacy_scan**

Description: Cache-only lookup. Returns structured JSON with verdict and verification data. Same response shape always returned — check verdict field for status. verdict=NOT_IN_DATABASE means the project has not been verified yet. Use verify_project_whitepaper ($2.00) for on-demand verification of uncached projects.  SLA: 5min


### **tokenomics_sustainability_audit**

Cache-only lookup. Returns structural analysis plus claim-level extraction with categorized claims scored individually. MiCA compliance included. Same response shape always returned — check verdict field for status. verdict=NOT_IN_DATABASE means the project has not been verified yet. Use verify_project_whitepaper ($2.00) for on-demand verification of uncached projects.  SLA: 5min

### **verify_project_whitepaper**

On-demand verification. Returns cached results instantly if project is in database. If not, runs live L1+L2 verification pipeline. Returns verdict=INSUFFICIENT_DATA if no whitepaper or document source can be found. Verified projects are cached permanently for future lookups.  SLA: 10min

### **full_technical_verification**

Deepest analysis. Runs full L1+L2+L3 pipeline including claim-by-claim evaluation against mathematical validity, benchmark plausibility, citation verification, originality, and internal consistency. Runs live pipeline if not cached. SLA: 15min



### **daily_technical_briefing**

Returns today's verification batch summary including all projects verified, greenlight entries, alert entries, and per-project verification summaries. If no verifications ran today, returns empty batch with timestamp.  SLA: 5min


##  **Sample Queries and Responses**

**`project_legitimacy_scan`**

Sample Request:
```
Check if the token at 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b is legitimate. Run a quick scan.
```

Sample Deliverable:
```json
{
  "projectName": "Virtuals Protocol",
  "structuralScore": 4,
  "hypeTechRatio": 1.2,
  "claimCount": 14,
  "claimsMicaCompliance": "NOT_MENTIONED",
  "micaCompliant": "NOT_APPLICABLE",
  "micaSummary": "Project does not reference MiCA regulation. No required disclosure sections found.",
  "verdict": "CONDITIONAL",
  "generatedAt": "2026-03-23T14:00:00Z"
}
```

---

**`tokenomics_sustainability_audit`**

Sample Request:
```
Audit the tokenomics for 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b. I want to see the claims and their scores.
```

Sample Deliverable:
```json
{
  "projectName": "Virtuals Protocol",
  "structuralScore": 4,
  "hypeTechRatio": 1.2,
  "claimCount": 14,
  "claimsMicaCompliance": "NOT_MENTIONED",
  "micaCompliant": "NOT_APPLICABLE",
  "micaSummary": "Project does not reference MiCA regulation. No required disclosure sections found.",
  "verdict": "CONDITIONAL",
  "generatedAt": "2026-03-23T14:00:00Z",
  "claims": [
    {
      "category": "TOKENOMICS",
      "claim_text": "Token supply is capped at 1 billion with 2% annual inflation",
      "stated_evidence": "Section 4.2 Tokenomics Model",
      "claim_score": 72
    },
    {
      "category": "PERFORMANCE",
      "claim_text": "Protocol processes 10,000 TPS on Base L2",
      "stated_evidence": "Section 3.1 Architecture Overview",
      "claim_score": 45
    }
  ],
  "logicSummary": "Tokenomics model is coherent with defined supply cap and emission schedule. Performance claims lack independent benchmarks. Governance structure is outlined but voting thresholds are not specified."
}
```

---

**`verify_project_whitepaper`**

Sample Request:
```
Verify the whitepaper for Virtuals Protocol at 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b. The whitepaper is at https://whitepaper.virtuals.io
```

Sample Deliverable:
```json
{
  "projectName": "Virtuals Protocol",
  "structuralScore": 4,
  "hypeTechRatio": 1.2,
  "claimCount": 14,
  "claimsMicaCompliance": "NOT_MENTIONED",
  "micaCompliant": "NOT_APPLICABLE",
  "micaSummary": "Project does not reference MiCA regulation. No required disclosure sections found.",
  "verdict": "CONDITIONAL",
  "generatedAt": "2026-03-23T14:00:00Z",
  "claims": [
    {
      "category": "TOKENOMICS",
      "claim_text": "Token supply is capped at 1 billion with 2% annual inflation",
      "stated_evidence": "Section 4.2 Tokenomics Model",
      "claim_score": 72
    },
    {
      "category": "PERFORMANCE",
      "claim_text": "Protocol processes 10,000 TPS on Base L2",
      "stated_evidence": "Section 3.1 Architecture Overview",
      "claim_score": 45
    }
  ],
  "logicSummary": "Tokenomics model is coherent with defined supply cap and emission schedule. Performance claims lack independent benchmarks. Governance structure is outlined but voting thresholds are not specified.",
  "tokenAddress": "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"
}
```

---

**`full_technical_verification`**

Sample Request:
```
Run a full technical verification on 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b. I need the deepest analysis with confidence scores and per-claim evaluations.
```

Sample Deliverable:
```json
{
  "projectName": "Virtuals Protocol",
  "structuralScore": 4,
  "hypeTechRatio": 1.2,
  "claimCount": 14,
  "claimsMicaCompliance": "NOT_MENTIONED",
  "micaCompliant": "NOT_APPLICABLE",
  "micaSummary": "Project does not reference MiCA regulation. No required disclosure sections found.",
  "verdict": "CONDITIONAL",
  "generatedAt": "2026-03-23T14:00:00Z",
  "claims": [
    {
      "category": "TOKENOMICS",
      "claim_text": "Token supply is capped at 1 billion with 2% annual inflation",
      "stated_evidence": "Section 4.2 Tokenomics Model",
      "claim_score": 72
    },
    {
      "category": "PERFORMANCE",
      "claim_text": "Protocol processes 10,000 TPS on Base L2",
      "stated_evidence": "Section 3.1 Architecture Overview",
      "claim_score": 45
    }
  ],
  "logicSummary": "Tokenomics model is coherent with defined supply cap and emission schedule. Performance claims lack independent benchmarks. Governance structure is outlined but voting thresholds are not specified.",
  "tokenAddress": "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  "confidenceScore": 62,
  "focusAreaScores": {
    "tokenomics": 72,
    "performance": 45,
    "consensus": 68,
    "scientific": 55
  },
  "evaluations": [
    {
      "claimId": "claim_001",
      "mathValidity": "VALID",
      "plausibility": "HIGH",
      "originality": "NOVEL",
      "consistency": "CONSISTENT"
    },
    {
      "claimId": "claim_002",
      "mathValidity": "UNVERIFIABLE",
      "plausibility": "LOW",
      "originality": "DERIVATIVE",
      "consistency": "CONSISTENT"
    }
  ],
  "llmTokensUsed": 12480,
  "computeCostUsd": 0.41
}
```

---

**`daily_technical_briefing`**

Sample Request:
```
Give me today's technical briefing. What projects did Grey verify today and what were the results?
```

Sample Deliverable:
```json
{
  "date": "2026-03-23",
  "totalVerified": 3,
  "whitepapers": [
    {
      "projectName": "Virtuals Protocol",
      "verdict": "CONDITIONAL",
      "confidenceScore": 62,
      "micaCompliant": "NOT_APPLICABLE"
    },
    {
      "projectName": "Aixbt",
      "verdict": "PASS",
      "confidenceScore": 78,
      "micaCompliant": "NOT_APPLICABLE"
    },
    {
      "projectName": "SafeMoonX",
      "verdict": "FAIL",
      "confidenceScore": 18,
      "micaCompliant": "NO"
    }
  ]
}
```
