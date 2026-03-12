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
        sql`${wpvVerifications.verifiedAt} < ${dayEnd}`,
      ));
  }

  /** List all verifications with associated whitepaper info */
  async listByVerdict(verdict: string): Promise<WpvVerificationRow[]> {
    return this.db
      .select()
      .from(wpvVerifications)
      .where(eq(wpvVerifications.verdict, verdict));
  }
}
