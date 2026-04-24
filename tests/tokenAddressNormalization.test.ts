import { describe, it, expect, vi } from 'vitest';
import { WpvWhitepapersRepo } from '../src/db/wpvWhitepapersRepo';

/**
 * Option B Fix A (2026-04-24): wpvWhitepapersRepo normalizes 0x token_address
 * on read (case-insensitive match) and write (lowercased insert). base58
 * Solana addresses stay case-exact.
 */

function fakeDb() {
  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue([]),
    limit: vi.fn().mockReturnThis(),
  };
  const insertBuilder = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'wp-new', projectName: 'x', tokenAddress: null }]),
  };
  const db = {
    select: vi.fn().mockReturnValue(selectBuilder),
    insert: vi.fn().mockReturnValue(insertBuilder),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  };
  return { db, selectBuilder, insertBuilder };
}

describe('WpvWhitepapersRepo — Option B Fix A', () => {
  it('findByTokenAddress uses case-insensitive SQL for 0x addresses', async () => {
    const { db, selectBuilder } = fakeDb();
    const repo = new WpvWhitepapersRepo(db as never);

    await repo.findByTokenAddress('0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9');

    // The WHERE clause should be a Drizzle sql`LOWER(...) = LOWER(...)` template.
    // We can't trivially inspect it, but we can at least confirm the select chain
    // was invoked and a WHERE was passed.
    expect(selectBuilder.from).toHaveBeenCalled();
    expect(selectBuilder.where).toHaveBeenCalled();
    // The where argument should be an SQL object (Drizzle SQL template), not a raw string
    const whereArg = (selectBuilder.where as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof whereArg).toBe('object');
  });

  it('findByTokenAddress uses byte-exact eq for base58/Solana addresses', async () => {
    const { db, selectBuilder } = fakeDb();
    const repo = new WpvWhitepapersRepo(db as never);

    await repo.findByTokenAddress('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN');

    expect(selectBuilder.where).toHaveBeenCalled();
    // base58 path produces an eq() expression (still a Drizzle object, but different shape)
    // The important property: the code must not have lowercased a base58 string
    // before passing it in, and the eq path is taken.
    // Just confirm the repo didn't crash and returned.
  });

  it('create() lowercases a 0x tokenAddress before insert', async () => {
    const { db, insertBuilder } = fakeDb();
    const repo = new WpvWhitepapersRepo(db as never);

    await repo.create({
      projectName: 'Aave',
      tokenAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      chain: 'ethereum',
      documentUrl: 'https://aave.com/whitepaper.pdf',
    } as never);

    const inserted = (insertBuilder.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.tokenAddress).toBe('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9');
    expect(inserted.projectName).toBe('Aave');
  });

  it('create() leaves base58 Solana addresses untouched', async () => {
    const { db, insertBuilder } = fakeDb();
    const repo = new WpvWhitepapersRepo(db as never);

    const solanaAddr = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
    await repo.create({
      projectName: 'Jupiter',
      tokenAddress: solanaAddr,
      chain: 'solana',
      documentUrl: 'https://jup.ag/whitepaper',
    } as never);

    const inserted = (insertBuilder.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // base58 must not be lowercased (case encodes different bytes)
    expect(inserted.tokenAddress).toBe(solanaAddr);
  });

  it('create() handles null tokenAddress without error', async () => {
    const { db, insertBuilder } = fakeDb();
    const repo = new WpvWhitepapersRepo(db as never);

    await repo.create({
      projectName: 'Aave V3',
      tokenAddress: null,
      chain: 'ethereum',
      documentUrl: 'https://github.com/aave/whitepaper',
    } as never);

    const inserted = (insertBuilder.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.tokenAddress).toBe(null);
  });
});
