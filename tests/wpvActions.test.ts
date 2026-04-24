import { describe, it, expect, vi } from 'vitest';
import type { IAgentRuntime, Memory, Content } from '@elizaos/core';
import { WpvScanAction } from '../src/actions/wpvScanAction';
import { WpvVerifyAction } from '../src/actions/wpvVerifyAction';
import { WpvStatusAction } from '../src/actions/wpvStatusAction';
import { WpvCostAction } from '../src/actions/wpvCostAction';
import { WpvGreenlightAction } from '../src/actions/wpvGreenlightAction';
import { WpvAlertsAction } from '../src/actions/wpvAlertsAction';
import { WpvService } from '../src/WpvService';

function makeMessage(text: string, extra?: Record<string, unknown>): Memory {
  return {
    id: 'msg-1' as `${string}-${string}-${string}-${string}-${string}`,
    entityId: 'e-1' as `${string}-${string}-${string}-${string}-${string}`,
    agentId: 'a-1' as `${string}-${string}-${string}-${string}-${string}`,
    roomId: 'r-1' as `${string}-${string}-${string}-${string}-${string}`,
    content: { text, ...extra } as Content,
    createdAt: Date.now(),
  };
}

// Mock runtime that returns a WpvService with mock deps
function makeMockRuntime(wpvDeps?: Record<string, unknown>): IAgentRuntime {
  const wpvService = new WpvService();
  if (wpvDeps) {
    wpvService.setDeps(wpvDeps as never);
  }
  return {
    getService: vi.fn((type: string) => {
      if (type === 'wpv') return wpvService;
      return null;
    }),
  } as unknown as IAgentRuntime;
}

// Runtime without WPV service
const bareRuntime = {
  getService: vi.fn(() => null),
} as unknown as IAgentRuntime;

// ── WPV_SCAN ──────────────────────────────────────────────
describe('WpvScanAction', () => {
  it('validates matching text', async () => {
    expect(await WpvScanAction.validate(bareRuntime, makeMessage('wpvscan now'))).toBe(true);
    expect(await WpvScanAction.validate(bareRuntime, makeMessage('scan whitepapers'))).toBe(true);
  });

  it('rejects non-matching text', async () => {
    expect(await WpvScanAction.validate(bareRuntime, makeMessage('hello world'))).toBe(false);
  });

  it('handler returns error when service unavailable', async () => {
    const cb = vi.fn();
    const result = await WpvScanAction.handler(bareRuntime, makeMessage('wpvscan'), undefined, undefined, cb);
    expect(result.success).toBe(false);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('handler delegates to discoveryCron.runDaily()', async () => {
    const mockCron = { runDaily: vi.fn().mockResolvedValue({ whitepapersIngested: 5, tokensScanned: 20, errors: [] }) };
    const runtime = makeMockRuntime({ discoveryCron: mockCron });
    const cb = vi.fn();
    const result = await WpvScanAction.handler(runtime, makeMessage('wpvscan'), undefined, undefined, cb);
    expect(result.success).toBe(true);
    expect(mockCron.runDaily).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledOnce();
  });
});

// ── WPV_VERIFY ────────────────────────────────────────────
describe('WpvVerifyAction', () => {
  it('validates matching text', async () => {
    expect(await WpvVerifyAction.validate(bareRuntime, makeMessage('wpv verify this'))).toBe(true);
    expect(await WpvVerifyAction.validate(bareRuntime, makeMessage('verify whitepaper please'))).toBe(true);
  });

  it('rejects non-matching text', async () => {
    expect(await WpvVerifyAction.validate(bareRuntime, makeMessage('what is the weather'))).toBe(false);
  });

  it('handler returns error when no URL provided', async () => {
    const mockRouter = { handleJob: vi.fn() };
    const runtime = makeMockRuntime({ jobRouter: mockRouter });
    const cb = vi.fn();
    const result = await WpvVerifyAction.handler(runtime, makeMessage('verify'), undefined, undefined, cb);
    expect(result.success).toBe(false);
  });

  it('handler delegates to jobRouter with URL', async () => {
    const mockRouter = { handleJob: vi.fn().mockResolvedValue({ verdict: 'PASS' }) };
    const runtime = makeMockRuntime({ jobRouter: mockRouter });
    const cb = vi.fn();
    const msg = makeMessage('verify', { document_url: 'https://example.com/wp.pdf', project_name: 'Test' });
    const result = await WpvVerifyAction.handler(runtime, msg, undefined, undefined, cb);
    expect(result.success).toBe(true);
    expect(mockRouter.handleJob).toHaveBeenCalledWith('verify_full_tech', expect.objectContaining({ document_url: 'https://example.com/wp.pdf' }));
  });
});

// ── WPV_STATUS ────────────────────────────────────────────
describe('WpvStatusAction', () => {
  it('validates matching text', async () => {
    expect(await WpvStatusAction.validate(bareRuntime, makeMessage('wpv status'))).toBe(true);
    expect(await WpvStatusAction.validate(bareRuntime, makeMessage('pipeline status'))).toBe(true);
  });

  it('rejects non-matching text', async () => {
    expect(await WpvStatusAction.validate(bareRuntime, makeMessage('buy tokens'))).toBe(false);
  });

  it('handler returns counts from repos', async () => {
    const runtime = makeMockRuntime({
      whitepaperRepo: { listByStatus: vi.fn().mockResolvedValue([{}, {}]) },
      verificationsRepo: {},
    });
    const cb = vi.fn();
    const result = await WpvStatusAction.handler(runtime, makeMessage('wpvstatus'), undefined, undefined, cb);
    expect(result.success).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });
});

// ── WPV_COST ──────────────────────────────────────────────
describe('WpvCostAction', () => {
  it('validates matching text', async () => {
    expect(await WpvCostAction.validate(bareRuntime, makeMessage('wpv cost'))).toBe(true);
    expect(await WpvCostAction.validate(bareRuntime, makeMessage('compute cost'))).toBe(true);
  });

  it('rejects non-matching text', async () => {
    expect(await WpvCostAction.validate(bareRuntime, makeMessage('scan whitepapers'))).toBe(false);
  });

  it('handler returns cost from tracker', async () => {
    const runtime = makeMockRuntime({
      costTracker: {
        getTotalTokens: () => ({ input: 1000, output: 200 }),
        getTotalCostUsd: () => 0.006,
        getStageMetrics: () => ({
          l1: { inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 50 },
          l2: { inputTokens: 800, outputTokens: 150, costUsd: 0.005, durationMs: 2000 },
          l3: { inputTokens: 200, outputTokens: 50, costUsd: 0.001, durationMs: 1000 },
          totalCostUsd: 0.006, totalInputTokens: 1000, totalOutputTokens: 200,
        }),
      },
      verificationsRepo: {
        getMonthlyCostSummary: vi.fn().mockResolvedValue({
          totalVerifications: 5, liveRuns: 4, cacheHits: 1,
          totalCostUsd: 1.5, l2CostUsd: 1.0, l3CostUsd: 0.5,
          avgCostPerVerification: 0.3, cacheHitRate: 0.2,
        }),
      },
    });
    const cb = vi.fn();
    const result = await WpvCostAction.handler(runtime, makeMessage('wpvcost'), undefined, undefined, cb);
    expect(result.success).toBe(true);
  });
});

// ── WPV_GREENLIGHT ────────────────────────────────────────
describe('WpvGreenlightAction', () => {
  it('validates matching text', async () => {
    expect(await WpvGreenlightAction.validate(bareRuntime, makeMessage('greenlight list'))).toBe(true);
  });

  it('handler delegates to resourceHandlers', async () => {
    const runtime = makeMockRuntime({
      resourceHandlers: { getGreenlightList: vi.fn().mockResolvedValue({ date: '2026-03-12', totalVerified: 3, projects: [] }) },
    });
    const cb = vi.fn();
    const result = await WpvGreenlightAction.handler(runtime, makeMessage('greenlight'), undefined, undefined, cb);
    expect(result.success).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });
});

// ── WPV_ALERTS ────────────────────────────────────────────
describe('WpvAlertsAction', () => {
  it('validates matching text', async () => {
    expect(await WpvAlertsAction.validate(bareRuntime, makeMessage('scam alerts'))).toBe(true);
  });

  it('handler delegates to resourceHandlers', async () => {
    const runtime = makeMockRuntime({
      resourceHandlers: { getScamAlertFeed: vi.fn().mockResolvedValue({ date: '2026-03-12', flagged: [] }) },
    });
    const cb = vi.fn();
    const result = await WpvAlertsAction.handler(runtime, makeMessage('alerts'), undefined, undefined, cb);
    expect(result.success).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });
});

// ── Cross-cutting ─────────────────────────────────────────
describe('WPV Actions cross-cutting', () => {
  it('all actions have required Eliza fields', () => {
    const actions = [WpvScanAction, WpvVerifyAction, WpvStatusAction, WpvCostAction, WpvGreenlightAction, WpvAlertsAction];
    for (const action of actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.similes).toBeDefined();
      expect(action.examples).toBeDefined();
      expect(typeof action.validate).toBe('function');
      expect(typeof action.handler).toBe('function');
    }
  });

  it('all actions return error when service unavailable', async () => {
    const actions = [WpvScanAction, WpvStatusAction, WpvCostAction, WpvGreenlightAction, WpvAlertsAction];
    for (const action of actions) {
      const result = await action.handler(bareRuntime, makeMessage('test'), undefined, undefined, undefined);
      expect(result.success).toBe(false);
    }
  });
});
