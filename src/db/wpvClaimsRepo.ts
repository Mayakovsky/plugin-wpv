// ════════════════════════════════════════════
// WPV Claims Repository — CRUD for wpv_claims
// ════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { wpvClaims, type WpvClaimRow, type WpvClaimInsert } from './wpvSchema';
import type { DrizzleDbLike } from '../types';

export class WpvClaimsRepo {
  constructor(private db: DrizzleDbLike) {}

  async create(data: WpvClaimInsert): Promise<WpvClaimRow> {
    const rows = await this.db
      .insert(wpvClaims)
      .values(data)
      .returning();
    return rows[0];
  }

  async findByWhitepaperId(whitepaperId: string): Promise<WpvClaimRow[]> {
    return this.db
      .select()
      .from(wpvClaims)
      .where(eq(wpvClaims.whitepaperId, whitepaperId));
  }

  async deleteByWhitepaperId(whitepaperId: string): Promise<void> {
    await this.db.delete(wpvClaims).where(eq(wpvClaims.whitepaperId, whitepaperId));
  }

  async listByCategory(category: string): Promise<WpvClaimRow[]> {
    return this.db
      .select()
      .from(wpvClaims)
      .where(eq(wpvClaims.category, category));
  }
}
