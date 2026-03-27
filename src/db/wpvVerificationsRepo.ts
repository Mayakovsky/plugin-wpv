// ════════════════════════════════════════════
// WPV Verifications Repository — CRUD for wpv_verifications
// ════════════════════════════════════════════

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { wpvVerifications, type WpvVerificationRow, type WpvVerificationInsert, wpvWhitepapers } from './wpvSchema';
import type { DrizzleDbLike } from '../types';

export class WpvVerificationsRepo {
  constructor(private db: DrizzleDbLike) {}

  async create(data: WpvVerificationInsert): Promise<WpvVerificationRow> {
    const rows = await this.db
      .insert(wpvVerifications)
      .values(data)
      .returning();
    return rows[0];
  }

  async findByWhitepaperId(whitepaperId: string): Promise<WpvVerificationRow | null> {
    const rows: WpvVerificationRow[] = await this.db
      .select()
      .from(wpvVerifications)
      .where(eq(wpvVerifications.whitepaperId, whitepaperId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Get all PASS verdicts from today (Greenlight List) */
  async getGreenlightList(): Promise<WpvVerificationRow[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return this.db
      .select()
      .from(wpvVerifications)
      .where(and(
        eq(wpvVerifications.verdict, 'PASS'),
        gte(wpvVerifications.verifiedAt, todayStart),
      ));
  }

  /** Get all FAIL verdicts with hype_tech_ratio > 3.0 (Scam Alerts) */
  async getScamAlerts(): Promise<WpvVerificationRow[]> {
    return this.db
      .select()
      .from(wpvVerifications)
      .where(and(
        eq(wpvVerifications.verdict, 'FAIL'),
        gte(wpvVerifications.hypeTechRatio, 3.0),
      ));
  }

  /** Get all verifications from the most recent cron run (latest batch by verified_at) */
  async getLatestDailyBatch(): Promise<WpvVerificationRow[]> {
    // Get the most recent verified_at date
    const latest: WpvVerificationRow[] = await this.db
      .select()
      .from(wpvVerifications)
      .orderBy(desc(wpvVerifications.verifiedAt))
      .limit(1);

    if (latest.length === 0) return [];

    const latestDate = latest[0].verifiedAt;
    // Get all verifications from the same day
    const dayStart = new Date(latestDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return this.db
      .select()
      .from(wpvVerifications)
      .where(and(
        gte(wpvVerifications.verifiedAt, dayStart),
        sql`${wpvVerifications.verifiedAt} < ${dayEnd.toISOString()}::timestamptz`,
      ));
  }

  /** List all verifications with associated whitepaper info */
  async listByVerdict(verdict: string): Promise<WpvVerificationRow[]> {
    return this.db
      .select()
      .from(wpvVerifications)
      .where(eq(wpvVerifications.verdict, verdict));
  }

  /** Get monthly cost aggregation from persisted verification data */
  async getMonthlyCostSummary(): Promise<{
    totalVerifications: number;
    liveRuns: number;
    cacheHits: number;
    totalCostUsd: number;
    l2CostUsd: number;
    l3CostUsd: number;
    avgCostPerVerification: number;
    cacheHitRate: number;
  }> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows: WpvVerificationRow[] = await this.db
      .select()
      .from(wpvVerifications)
      .where(gte(wpvVerifications.verifiedAt, monthStart));

    const total = rows.length;
    const cacheHits = rows.filter((r) => r.cacheHit).length;
    const liveRuns = total - cacheHits;
    const totalCostUsd = rows.reduce((sum, r) => sum + (r.computeCostUsd ?? 0), 0);
    const l2CostUsd = rows.reduce((sum, r) => sum + ((r as Record<string, unknown>).l2CostUsd as number ?? 0), 0);
    const l3CostUsd = rows.reduce((sum, r) => sum + ((r as Record<string, unknown>).l3CostUsd as number ?? 0), 0);

    return {
      totalVerifications: total,
      liveRuns,
      cacheHits,
      totalCostUsd,
      l2CostUsd,
      l3CostUsd,
      avgCostPerVerification: total > 0 ? totalCostUsd / total : 0,
      cacheHitRate: total > 0 ? cacheHits / total : 0,
    };
  }
}
