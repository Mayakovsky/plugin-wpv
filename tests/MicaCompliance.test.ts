import { describe, it, expect, beforeEach } from 'vitest';
import { StructuralAnalyzer } from '../src/verification/StructuralAnalyzer';
import type { MicaAnalysis } from '../src/types';

// ── Test fixtures ────────────────────────────

const MICA_COMPLIANT_WP = `
Abstract

This whitepaper presents the XYZ Protocol, a MiCA-compliant decentralized finance platform.
Compliant with Regulation (EU) 2023/1114 (Markets in Crypto-Assets).

Issuer Information

XYZ Labs GmbH, registered in Berlin, Germany.
Contact: legal@xyzlabs.eu | +49 30 12345678
Directors: Alice Schmidt (CEO), Bob Mueller (CTO)

Technology Description

The XYZ Protocol uses a proof-of-stake consensus mechanism with smart contracts on Ethereum L2.
Transaction throughput: 10,000 TPS with 2-second finality.

Risk Disclosure

Investing in XYZ tokens involves significant risks:
- Market volatility may cause loss of principal
- Regulatory changes may affect token utility
- Smart contract vulnerabilities could lead to loss of funds
- No guarantee of future value

Rights and Obligations

Token holders have the right to participate in governance voting.
Each token represents one vote in protocol governance decisions.
Holders are obligated to comply with applicable local regulations.

Redemption Mechanisms

Tokens may be redeemed for underlying protocol services at any time.
A buyback mechanism activates quarterly using protocol revenue.

Governance

The XYZ DAO governs protocol parameters through proposal and voting mechanisms.
Proposals require 10% quorum. Voting period: 7 days.

Environmental Impact

The protocol operates on proof-of-stake, consuming approximately 0.001 kWh per transaction.
Carbon offset program funds renewable energy projects quarterly.
`;

const PARTIAL_MICA_WP = `
Abstract

This project claims to be MiCA compliant under EU regulation.

Team

Founded by John Doe and Jane Smith in 2025.

Technology Description

Our blockchain uses a novel consensus algorithm with smart contracts.

Risk Disclosure

There are risks involved with our token. Market conditions may vary.
Regulatory risks exist. Not financial advice.

Governance

Community voting on proposals through Discord and Snapshot.
`;

const NO_MICA_MENTION_NO_SECTIONS_WP = `
🚀 MOONTOKEN — The Next 100x Gem! 🚀

Buy MOON tokens now for guaranteed passive income!
Revolutionary game-changing technology.
Generational wealth incoming. Lambo guaranteed.
`;

const CLAIMS_MICA_BUT_FAILS_WP = `
Abstract

This whitepaper complies with the Markets in Crypto-Assets (MiCA) regulation.
Our project meets all ESMA whitepaper requirements under Regulation (EU) 2023/1114.

Tokenomics

Total supply: 1 billion tokens.
50% team allocation, 50% public sale.
Buy now for maximum returns.
`;

const UTILITY_TOKEN_WP = `
Abstract

FooBar is a utility token granting access to our existing cloud computing platform.
Users exchange FOO tokens for GPU hours on our operational network.

Technology Description

Built on Ethereum with ERC-20 standard. Smart contracts audited by CertiK.

The platform has been operational since January 2025 with 50,000 active users.
`;

describe('MiCA Compliance Check', () => {
  let analyzer: StructuralAnalyzer;

  beforeEach(() => {
    analyzer = new StructuralAnalyzer();
  });

  describe('checkMicaCompliance', () => {
    it('fully compliant WP with MiCA claim + all sections → YES/YES', () => {
      const mica = analyzer.checkMicaCompliance(MICA_COMPLIANT_WP);
      expect(mica.claimsMicaCompliance).toBe('YES');
      expect(mica.micaCompliant).toBe('YES');
      expect(mica.micaSectionsFound.length).toBeGreaterThanOrEqual(5);
      expect(mica.micaSectionsMissing.length).toBeLessThanOrEqual(2);
      expect(mica.micaSummary).toContain('required MiCA sections');
    });

    it('partial WP with MiCA claim but missing sections → YES/PARTIAL', () => {
      const mica = analyzer.checkMicaCompliance(PARTIAL_MICA_WP);
      expect(mica.claimsMicaCompliance).toBe('YES');
      expect(mica.micaCompliant).toBe('PARTIAL');
      expect(mica.micaSummary).toContain('partially');
      expect(mica.micaSectionsMissing.length).toBeGreaterThan(0);
    });

    it('no MiCA mention and no sections → NOT_MENTIONED/NO', () => {
      const mica = analyzer.checkMicaCompliance(NO_MICA_MENTION_NO_SECTIONS_WP);
      expect(mica.claimsMicaCompliance).toBe('NOT_MENTIONED');
      expect(mica.micaCompliant).toBe('NO');
      expect(mica.micaSectionsFound.length).toBeLessThan(3);
    });

    it('claims MiCA compliance but fails check → YES/NO + flagged in summary', () => {
      const mica = analyzer.checkMicaCompliance(CLAIMS_MICA_BUT_FAILS_WP);
      expect(mica.claimsMicaCompliance).toBe('YES');
      expect(mica.micaCompliant).toBe('NO');
      expect(mica.micaSummary).toContain('Claims MiCA compliance but fails');
      expect(mica.micaSectionsMissing.length).toBeGreaterThan(3);
    });

    it('empty text → NOT_MENTIONED/NO', () => {
      const mica = analyzer.checkMicaCompliance('');
      expect(mica.claimsMicaCompliance).toBe('NOT_MENTIONED');
      expect(mica.micaCompliant).toBe('NO');
    });

    it('detects "mica" keyword (case insensitive)', () => {
      const mica = analyzer.checkMicaCompliance('This project is MICA compliant with technology and governance.');
      expect(mica.claimsMicaCompliance).toBe('YES');
    });

    it('detects "Markets in Crypto-Assets" keyword', () => {
      const mica = analyzer.checkMicaCompliance('Compliant with the Markets in Crypto-Assets framework. Technology and governance included.');
      expect(mica.claimsMicaCompliance).toBe('YES');
    });

    it('detects "Regulation (EU) 2023/1114" keyword', () => {
      const mica = analyzer.checkMicaCompliance('Pursuant to Regulation (EU) 2023/1114. Technology overview provided.');
      expect(mica.claimsMicaCompliance).toBe('YES');
    });
  });

  describe('MiCA section detection', () => {
    it('issuer_identity: detects team/founders/legal entity keywords', () => {
      const mica = analyzer.checkMicaCompliance('The issuer is Acme GmbH. Founded by Alice. Contact information: email@co.com');
      expect(mica.micaSectionsFound).toContain('issuer_identity');
    });

    it('technology_description: detects blockchain/protocol/smart contracts', () => {
      const mica = analyzer.checkMicaCompliance('Technical architecture uses Ethereum smart contracts with consensus mechanism.');
      expect(mica.micaSectionsFound).toContain('technology_description');
    });

    it('risk_disclosure: detects risk factors/warning', () => {
      const mica = analyzer.checkMicaCompliance('Risk Disclosure: Investment risks include market volatility and regulatory changes.');
      expect(mica.micaSectionsFound).toContain('risk_disclosure');
    });

    it('rights_obligations: detects token holder rights', () => {
      const mica = analyzer.checkMicaCompliance('Token holder rights include voting and governance participation. Obligations apply.');
      expect(mica.micaSectionsFound).toContain('rights_obligations');
    });

    it('redemption_mechanisms: detects buyback/refund', () => {
      const mica = analyzer.checkMicaCompliance('Redemption of tokens is possible through the buyback mechanism.');
      expect(mica.micaSectionsFound).toContain('redemption_mechanisms');
    });

    it('governance: detects DAO/voting/proposals', () => {
      const mica = analyzer.checkMicaCompliance('Governance is handled by the DAO through voting on proposals.');
      expect(mica.micaSectionsFound).toContain('governance');
    });

    it('environmental_impact: detects carbon/energy/sustainability', () => {
      const mica = analyzer.checkMicaCompliance('Environmental impact: energy consumption is 0.001 kWh per transaction. Carbon neutral.');
      expect(mica.micaSectionsFound).toContain('environmental_impact');
    });
  });

  describe('MiCA in analyze() pipeline', () => {
    it('analyze() returns mica field', async () => {
      const result = await analyzer.analyze(MICA_COMPLIANT_WP, 10);
      expect(result.mica).toBeDefined();
      expect(result.mica.claimsMicaCompliance).toBe('YES');
      expect(result.mica.micaCompliant).toBe('YES');
    });

    it('analyze() on empty text returns mica with defaults', async () => {
      const result = await analyzer.analyze('', 0);
      expect(result.mica).toBeDefined();
      expect(result.mica.claimsMicaCompliance).toBe('NOT_MENTIONED');
      expect(result.mica.micaCompliant).toBe('NO');
    });
  });

  describe('MiCA summary generation', () => {
    it('compliant summary mentions section count', () => {
      const mica = analyzer.checkMicaCompliance(MICA_COMPLIANT_WP);
      expect(mica.micaSummary).toMatch(/\d\/7 required MiCA sections/);
    });

    it('non-compliant summary lists missing sections', () => {
      const mica = analyzer.checkMicaCompliance(CLAIMS_MICA_BUT_FAILS_WP);
      expect(mica.micaSummary).toContain('Missing:');
    });

    it('fraudulent claim summary flags the discrepancy', () => {
      const mica = analyzer.checkMicaCompliance(CLAIMS_MICA_BUT_FAILS_WP);
      expect(mica.micaSummary).toContain('Claims MiCA compliance but fails');
    });
  });

  describe('Utility token NOT_APPLICABLE', () => {
    const UTILITY_TOKEN_WP = `
      PlatformToken is a utility token that grants access to the DecentralCloud
      platform services. This is not a security and has no investment intent.
      The access token enables users to pay for compute resources. This is a
      service token for platform usage only.
    `;

    it('detects utility token and returns NOT_APPLICABLE', () => {
      const mica = analyzer.checkMicaCompliance(UTILITY_TOKEN_WP);
      expect(mica.micaCompliant).toBe('NOT_APPLICABLE');
    });

    it('utility token summary explains exemption', () => {
      const mica = analyzer.checkMicaCompliance(UTILITY_TOKEN_WP);
      expect(mica.micaSummary).toContain('Utility token');
      expect(mica.micaSummary).toContain('not applicable');
    });

    it('utility token that also claims MiCA gets normal assessment', () => {
      const UTILITY_WITH_MICA_CLAIM = `
        This utility token grants access to platform services. Not a security.
        We are fully MiCA compliant under Regulation (EU) 2023/1114.
      `;
      const mica = analyzer.checkMicaCompliance(UTILITY_WITH_MICA_CLAIM);
      // Claims MiCA compliance → should be assessed normally, not exempted
      expect(mica.claimsMicaCompliance).toBe('YES');
      expect(mica.micaCompliant).not.toBe('NOT_APPLICABLE');
    });
  });
});
