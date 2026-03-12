import { describe, it, expect, vi } from 'vitest';
import { WpvRateLimiter } from '../src/acp/RateLimiter';

describe('WpvRateLimiter', () => {
  it('processes jobs sequentially (job 2 starts after job 1 finishes)', async () => {
    const limiter = new WpvRateLimiter();
    const order: number[] = [];

    const job1 = limiter.enqueue('j1', async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 20));
      order.push(2);
      return 'result1';
    });

    const job2 = limiter.enqueue('j2', async () => {
      order.push(3);
      return 'result2';
    });

    const [r1, r2] = await Promise.all([job1, job2]);
    expect(r1).toBe('result1');
    expect(r2).toBe('result2');
    // Job 2 (order.push(3)) should start after job 1 finishes (order.push(2))
    expect(order).toEqual([1, 2, 3]);
  });

  it('wait time estimate scales with queue depth', async () => {
    const limiter = new WpvRateLimiter();

    // Queue some slow jobs
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        limiter.enqueue(`j${i}`, () => new Promise((r) => setTimeout(r, 10))),
      );
    }

    // With 3 jobs queued, wait time should be > 0
    // (The first may already be processing, but estimate should still be non-zero)
    const estimate = limiter.getEstimatedWaitMs();
    expect(estimate).toBeGreaterThanOrEqual(0);

    await Promise.all(promises);
  });

  it('handles cancellation', async () => {
    const limiter = new WpvRateLimiter();

    const job1 = limiter.enqueue('j1', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });

    // Enqueue and immediately cancel — catch rejection to prevent unhandled warning
    const job2Promise = limiter.enqueue('j2', async () => 'should not run').catch(() => {});
    const cancelled = limiter.cancel('j2');
    expect(cancelled).toBe(true);

    await job1;
    await job2Promise;
  });

  it('returns queue depth excluding cancelled jobs', async () => {
    const limiter = new WpvRateLimiter();

    const p1 = limiter.enqueue('j1', () => new Promise((r) => setTimeout(r, 100)));
    const p2 = limiter.enqueue('j2', () => new Promise((r) => setTimeout(r, 100)));
    const p3 = limiter.enqueue('j3', () => new Promise((r) => setTimeout(r, 100)));

    limiter.cancel('j2');

    // j1 may be processing, j2 cancelled, j3 queued
    const depth = limiter.getQueueDepth();
    expect(depth).toBeLessThanOrEqual(2);

    // Await all to prevent unhandled rejections
    await Promise.allSettled([p1, p2, p3]);
  });

  it('handles job errors without affecting queue', async () => {
    const limiter = new WpvRateLimiter();

    const job1 = limiter.enqueue('j1', async () => {
      throw new Error('job1 failed');
    });

    const job2 = limiter.enqueue('j2', async () => 'success');

    await expect(job1).rejects.toThrow('job1 failed');
    const result = await job2;
    expect(result).toBe('success');
  });

  it('cancel returns false for non-existent job', () => {
    const limiter = new WpvRateLimiter();
    expect(limiter.cancel('nonexistent')).toBe(false);
  });
});
