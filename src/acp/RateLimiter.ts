// ════════════════════════════════════════════
// WS-C6: RateLimiter
// Sequential queue for live verification tiers.
// Multiple simultaneous jobs process one at a time.
// ════════════════════════════════════════════

import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'WpvRateLimiter' });

interface QueuedJob<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
  cancelled: boolean;
}

export class WpvRateLimiter {
  private queue: QueuedJob<unknown>[] = [];
  private processing = false;
  private avgProcessingMs = 30_000; // initial estimate: 30s per job

  /**
   * Enqueue a job for sequential processing.
   * Returns the result when the job completes.
   */
  async enqueue<T>(jobId: string, execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id: jobId,
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
        cancelled: false,
      });

      log.debug('Job enqueued', { jobId, queueDepth: this.queue.length });
      this.processNext();
    });
  }

  /**
   * Cancel a queued job. Does not affect jobs currently processing.
   */
  cancel(jobId: string): boolean {
    const job = this.queue.find((j) => j.id === jobId && !j.cancelled);
    if (job) {
      job.cancelled = true;
      job.reject(new Error(`Job ${jobId} cancelled`));
      return true;
    }
    return false;
  }

  /**
   * Estimated wait time based on queue depth and average processing time.
   */
  getEstimatedWaitMs(): number {
    return this.queue.filter((j) => !j.cancelled).length * this.avgProcessingMs;
  }

  /**
   * Current queue depth (excluding cancelled jobs).
   */
  getQueueDepth(): number {
    return this.queue.filter((j) => !j.cancelled).length;
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;

    // Find next non-cancelled job
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || job.cancelled) continue;

      this.processing = true;
      const startTime = Date.now();

      try {
        const result = await job.execute();
        job.resolve(result);

        // Update average processing time
        const elapsed = Date.now() - startTime;
        this.avgProcessingMs = (this.avgProcessingMs + elapsed) / 2;
      } catch (err) {
        job.reject(err);
      } finally {
        this.processing = false;
      }

      // Process next job if available
      if (this.queue.length > 0) {
        await this.processNext();
      }
      return;
    }
  }
}
