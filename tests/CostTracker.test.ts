import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../src/verification/CostTracker';
import { LLM_PRICING } from '../src/constants';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
  });

  it('tracks cumulative tokens across multiple calls', () => {
    tracker.recordUsage(1000, 500);
    tracker.recordUsage(2000, 300);

    const totals = tracker.getTotalTokens();
    expect(totals.input).toBe(3000);
    expect(totals.output).toBe(800);
  });

  it('computes cost correctly with known prices', () => {
    // $3/1M input, $15/1M output
    tracker.recordUsage(1_000_000, 100_000);

    const cost = tracker.getTotalCostUsd();
    // 1M * $3/1M + 100K * $15/1M = $3 + $1.5 = $4.50
    expect(cost).toBeCloseTo(4.5, 2);
  });

  it('reset clears all counters', () => {
    tracker.recordUsage(5000, 2000);
    tracker.reset();

    const totals = tracker.getTotalTokens();
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
    expect(tracker.getTotalCostUsd()).toBe(0);
  });

  it('zero usage → zero cost', () => {
    expect(tracker.getTotalCostUsd()).toBe(0);
    expect(tracker.getTotalTokens()).toEqual({ input: 0, output: 0 });
  });

  it('cost accumulates correctly across multiple small calls', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordUsage(100, 50);
    }
    const totals = tracker.getTotalTokens();
    expect(totals.input).toBe(1000);
    expect(totals.output).toBe(500);
  });

  it('works with custom pricing', () => {
    const custom = new CostTracker(0.001, 0.002);
    custom.recordUsage(100, 200);
    expect(custom.getTotalCostUsd()).toBeCloseTo(0.5, 4);
  });
});
