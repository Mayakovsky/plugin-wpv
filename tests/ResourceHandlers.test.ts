import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceHandlers } from '../src/acp/ResourceHandlers';
import { AGENT_CARD, OFFERINGS, RESOURCES } from '../src/acp/AgentCardConfig';

// ── AgentCardConfig Tests ────────────────────

describe('AgentCardConfig', () => {
  it('has all required fields', () => {
    expect(AGENT_CARD.name).toBeDefined();
    expect(AGENT_CARD.role).toBeDefined();
    expect(AGENT_CARD.category).toBeDefined();
    expect(AGENT_CARD.shortDescription).toBeDefined();
    expect(AGENT_CARD.capabilities.length).toBeGreaterThan(0);
  });

  it('short description is ≤ 100 chars', () => {
    expect(AGENT_CARD.shortDescription.length).toBeLessThanOrEqual(100);
  });

  it('has 5 offerings', () => {
    expect(OFFERINGS).toHaveLength(5);
  });

  it('has 2 resources', () => {
    expect(RESOURCES).toHaveLength(2);
  });
});

// ── ResourceHandlers Tests ───────────────────

function createMockRepos() {
  return {
    verificationsRepo: {
      getGreenlightList: vi.fn().mockResolvedValue([]),
      getScamAlerts: vi.fn().mockResolvedValue([]),
    },
    whitepaperRepo: {
      findById: vi.fn().mockResolvedValue({
        projectName: 'TestProject',
        tokenAddress: '0xabc',
      }),
    },
  };
}

describe('ResourceHandlers', () => {
  let repos: ReturnType<typeof createMockRepos>;
  let handlers: ResourceHandlers;

  beforeEach(() => {
    repos = createMockRepos();
    handlers = new ResourceHandlers(repos.verificationsRepo as never, repos.whitepaperRepo as never);
  });

  it('getGreenlightList returns only PASS verdicts', async () => {
    repos.verificationsRepo.getGreenlightList.mockResolvedValue([
      { whitepaperId: 'wp-1', confidenceScore: 85, hypeTechRatio: 0.5, verdict: 'PASS' },
    ]);

    const result = await handlers.getGreenlightList();
    expect(result.totalVerified).toBe(1);
    expect(result.projects[0].verdict).toBe('PASS');
    expect(result.projects[0].score).toBe(85);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getScamAlertFeed returns FAIL verdicts with red flags', async () => {
    repos.verificationsRepo.getScamAlerts.mockResolvedValue([
      { whitepaperId: 'wp-2', hypeTechRatio: 4.5, structuralScore: 1, totalClaims: 0, verdict: 'FAIL' },
    ]);

    const result = await handlers.getScamAlertFeed();
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].verdict).toBe('FAIL');
    expect(result.flagged[0].hypeTechRatio).toBe(4.5);
    expect(result.flagged[0].redFlags).toContain('High hype-to-tech ratio');
    expect(result.flagged[0].redFlags).toContain('Poor structural quality');
    expect(result.flagged[0].redFlags).toContain('No verifiable claims');
  });

  it('getGreenlightList returns empty array when no data', async () => {
    const result = await handlers.getGreenlightList();
    expect(result.totalVerified).toBe(0);
    expect(result.projects).toEqual([]);
  });

  it('getScamAlertFeed returns empty array when no data', async () => {
    const result = await handlers.getScamAlertFeed();
    expect(result.flagged).toEqual([]);
  });

  it('detects fraudulent MiCA claim from structuralAnalysisJson', async () => {
    repos.verificationsRepo.getScamAlerts.mockResolvedValue([
      {
        whitepaperId: 'wp-3',
        hypeTechRatio: 4.0,
        structuralScore: 1,
        totalClaims: 2,
        verdict: 'FAIL',
        structuralAnalysisJson: {
          mica: {
            claimsMicaCompliance: 'YES',
            micaCompliant: 'NO',
            micaSummary: 'Claims MiCA compliance but fails structural check.',
          },
        },
      },
    ]);

    const result = await handlers.getScamAlertFeed();
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].fraudulentMicaClaim).toBe(true);
    expect(result.flagged[0].redFlags).toContain('Fraudulent MiCA compliance claim');
  });

  it('does not flag legitimate MiCA compliance', async () => {
    repos.verificationsRepo.getScamAlerts.mockResolvedValue([
      {
        whitepaperId: 'wp-4',
        hypeTechRatio: 4.0,
        structuralScore: 1,
        totalClaims: 0,
        verdict: 'FAIL',
        structuralAnalysisJson: {
          mica: {
            claimsMicaCompliance: 'YES',
            micaCompliant: 'YES',
            micaSummary: 'All 7/7 required MiCA sections present.',
          },
        },
      },
    ]);

    const result = await handlers.getScamAlertFeed();
    expect(result.flagged[0].fraudulentMicaClaim).toBe(false);
    expect(result.flagged[0].redFlags).not.toContain('Fraudulent MiCA compliance claim');
  });

  it('handles missing structuralAnalysisJson gracefully', async () => {
    repos.verificationsRepo.getScamAlerts.mockResolvedValue([
      {
        whitepaperId: 'wp-5',
        hypeTechRatio: 4.0,
        structuralScore: 1,
        totalClaims: 0,
        verdict: 'FAIL',
        structuralAnalysisJson: null,
      },
    ]);

    const result = await handlers.getScamAlertFeed();
    expect(result.flagged[0].fraudulentMicaClaim).toBe(false);
  });
});
