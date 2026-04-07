// ════════════════════════════════════════════
// WPV Whitepapers Repository — CRUD for wpv_whitepapers
// ════════════════════════════════════════════

import { eq, and, desc, sql } from 'drizzle-orm';
import { wpvWhitepapers, type WpvWhitepaperRow, type WpvWhitepaperInsert } from './wpvSchema';
import type { DrizzleDbLike } from '../types';

export class WpvWhitepapersRepo {
  constructor(private db: DrizzleDbLike) {}

  async deleteById(id: string): Promise<void> {
    await this.db.delete(wpvWhitepapers).where(eq(wpvWhitepapers.id, id));
  }

  async create(data: WpvWhitepaperInsert): Promise<WpvWhitepaperRow> {
    const rows = await this.db
      .insert(wpvWhitepapers)
      .values(data)
      .returning();
    return rows[0];
  }

  async findById(id: string): Promise<WpvWhitepaperRow | null> {
    const rows: WpvWhitepaperRow[] = await this.db
      .select()
      .from(wpvWhitepapers)
      .where(eq(wpvWhitepapers.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByProjectName(projectName: string): Promise<WpvWhitepaperRow[]> {
    return this.db
      .select()
      .from(wpvWhitepapers)
      .where(sql`LOWER(${wpvWhitepapers.projectName}) = LOWER(${projectName})`);
  }

  async findByTokenAddress(tokenAddress: string): Promise<WpvWhitepaperRow[]> {
    return this.db
      .select()
      .from(wpvWhitepapers)
      .where(eq(wpvWhitepapers.tokenAddress, tokenAddress));
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(wpvWhitepapers)
      .set({ status })
      .where(eq(wpvWhitepapers.id, id));
  }

  async listByStatus(status: string): Promise<WpvWhitepaperRow[]> {
    return this.db
      .select()
      .from(wpvWhitepapers)
      .where(eq(wpvWhitepapers.status, status));
  }

  async updateKnowledgeItemId(id: string, knowledgeItemId: string): Promise<void> {
    await this.db
      .update(wpvWhitepapers)
      .set({ knowledgeItemId })
      .where(eq(wpvWhitepapers.id, id));
  }

  async listRecent(limit: number): Promise<WpvWhitepaperRow[]> {
    return this.db
      .select()
      .from(wpvWhitepapers)
      .orderBy(desc(wpvWhitepapers.ingestedAt))
      .limit(limit);
  }

  async findByProjectAndChain(projectName: string, chain: string): Promise<WpvWhitepaperRow | null> {
    const rows: WpvWhitepaperRow[] = await this.db
      .select()
      .from(wpvWhitepapers)
      .where(and(
        eq(wpvWhitepapers.projectName, projectName),
        eq(wpvWhitepapers.chain, chain),
      ))
      .limit(1);
    return rows[0] ?? null;
  }
}
