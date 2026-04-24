// ════════════════════════════════════════════
// WPV Whitepapers Repository — CRUD for wpv_whitepapers
// ════════════════════════════════════════════

import { eq, and, desc, sql } from 'drizzle-orm';
import { wpvWhitepapers, type WpvWhitepaperRow, type WpvWhitepaperInsert } from './wpvSchema';
import type { DrizzleDbLike } from '../types';

/**
 * Option B Fix A (2026-04-24): normalize token_address to lowercase at the
 * repo boundary. Same 20-byte contract on-chain can be written lowercased,
 * EIP-55 checksummed, or uppercase by different buyers/SDKs. Without
 * normalization, `findByTokenAddress` (byte-exact eq()) misses legitimate
 * matches and `create()` produces parallel rows for the same contract.
 *
 * Normalization only applies to the `tokenAddress` field. Solana/base58
 * addresses are case-significant — but our callers only use this repo for
 * EVM-style 0x addresses; base58 tokens flow through the same field but
 * lowercasing base58 is lossy.
 *
 * To keep base58 safe: only lowercase strings that start with "0x".
 */
function normalizeTokenAddress(addr: string | null | undefined): string | null | undefined {
  if (addr == null) return addr;
  if (typeof addr !== 'string') return addr;
  return addr.startsWith('0x') ? addr.toLowerCase() : addr;
}

export class WpvWhitepapersRepo {
  constructor(private db: DrizzleDbLike) {}

  async deleteById(id: string): Promise<void> {
    await this.db.delete(wpvWhitepapers).where(eq(wpvWhitepapers.id, id));
  }

  async create(data: WpvWhitepaperInsert): Promise<WpvWhitepaperRow> {
    // Normalize tokenAddress on write so every 0x address is stored lowercase.
    const normalized: WpvWhitepaperInsert = {
      ...data,
      tokenAddress: normalizeTokenAddress(data.tokenAddress) as typeof data.tokenAddress,
    };
    const rows = await this.db
      .insert(wpvWhitepapers)
      .values(normalized)
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
    // Case-insensitive match for 0x addresses. Base58 (Solana) stays case-exact
    // because base58 characters encode different bytes at different cases.
    const looksEvm = typeof tokenAddress === 'string' && tokenAddress.startsWith('0x');
    if (looksEvm) {
      return this.db
        .select()
        .from(wpvWhitepapers)
        .where(sql`LOWER(${wpvWhitepapers.tokenAddress}) = LOWER(${tokenAddress})`);
    }
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
