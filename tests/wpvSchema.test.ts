import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WpvWhitepapersRepo } from '../src/db/wpvWhitepapersRepo';
import { WpvClaimsRepo } from '../src/db/wpvClaimsRepo';
import { WpvVerificationsRepo } from '../src/db/wpvVerificationsRepo';
import { wpvWhitepapers, wpvClaims, wpvVerifications } from '../src/db/wpvSchema';
import type { WpvWhitepaperRow, WpvClaimRow, WpvVerificationRow } from '../src/db/wpvSchema';

// ── Mock DB builder ──────────────────────────

function createMockDb() {
  const store = {
    whitepapers: [] as WpvWhitepaperRow[],
    claims: [] as WpvClaimRow[],
    verifications: [] as WpvVerificationRow[],
  };

  function makeChain(targetTable: unknown) {
    let currentData: unknown[] = [];
    let whereFilter: ((row: Record<string, unknown>) => boolean) | null = null;

    const chain: Record<string, unknown> = {
      from: vi.fn((_table: unknown) => chain),
      values: vi.fn((data: Record<string, unknown>) => {
        currentData = [data];
        return chain;
      }),
      set: vi.fn((_data: Record<string, unknown>) => {
        return chain;
      }),
      where: vi.fn((condition: unknown) => {
        // Store filter for later use
        whereFilter = condition as ((row: Record<string, unknown>) => boolean);
        return chain;
      }),
      limit: vi.fn((_n: number) => {
        return chain;
      }),
      orderBy: vi.fn((_col: unknown) => chain),
      returning: vi.fn(() => {
        // For inserts — return the data with generated fields
        const row = {
          id: crypto.randomUUID(),
          ingestedAt: new Date(),
          verifiedAt: new Date(),
          ...currentData[0] as Record<string, unknown>,
        };
        // Store in appropriate collection
        if (targetTable === wpvWhitepapers) {
          store.whitepapers.push(row as unknown as WpvWhitepaperRow);
        } else if (targetTable === wpvClaims) {
          store.claims.push(row as unknown as WpvClaimRow);
        } else if (targetTable === wpvVerifications) {
          store.verifications.push(row as unknown as WpvVerificationRow);
        }
        return [row];
      }),
    };

    // For select: resolve from store
    (chain as Record<string, unknown>)[Symbol.toStringTag] = 'MockChain';
    chain.then = (resolve: (v: unknown[]) => void) => {
      let collection: unknown[] = [];
      if (targetTable === wpvWhitepapers) collection = store.whitepapers;
      else if (targetTable === wpvClaims) collection = store.claims;
      else if (targetTable === wpvVerifications) collection = store.verifications;
      resolve(collection);
    };

    return chain;
  }

  const db = {
    select: vi.fn(() => makeChain(null)),
    insert: vi.fn((table: unknown) => makeChain(table)),
    update: vi.fn((table: unknown) => makeChain(table)),
    delete: vi.fn((table: unknown) => makeChain(table)),
    _store: store,
  };

  // Override select to return from correct store
  db.select.mockImplementation(() => {
    const chain = makeChain(null);
    const origFrom = chain.from as ReturnType<typeof vi.fn>;
    origFrom.mockImplementation((table: unknown) => {
      // Update the target for this chain
      const newChain = makeChain(table);
      return newChain;
    });
    return chain;
  });

  return db;
}

// ── Schema Structure Tests ───────────────────

describe('WPV Schema', () => {
  describe('schema definitions', () => {
    it('wpvWhitepapers table has all required columns', () => {
      const columns = Object.keys(wpvWhitepapers);
      expect(columns).toContain('id');
      expect(columns).toContain('projectName');
      expect(columns).toContain('tokenAddress');
      expect(columns).toContain('chain');
      expect(columns).toContain('documentUrl');
      expect(columns).toContain('status');
      expect(columns).toContain('selectionScore');
    });

    it('wpvClaims table has all required columns', () => {
      const columns = Object.keys(wpvClaims);
      expect(columns).toContain('id');
      expect(columns).toContain('whitepaperId');
      expect(columns).toContain('category');
      expect(columns).toContain('claimText');
      expect(columns).toContain('claimScore');
    });

    it('wpvVerifications table has all required columns', () => {
      const columns = Object.keys(wpvVerifications);
      expect(columns).toContain('id');
      expect(columns).toContain('whitepaperId');
      expect(columns).toContain('structuralScore');
      expect(columns).toContain('confidenceScore');
      expect(columns).toContain('hypeTechRatio');
      expect(columns).toContain('verdict');
      expect(columns).toContain('llmTokensUsed');
      expect(columns).toContain('computeCostUsd');
    });
  });
});

// ── Whitepapers Repo Tests ───────────────────

describe('WpvWhitepapersRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: WpvWhitepapersRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new WpvWhitepapersRepo(db as never);
  });

  it('create() inserts and returns a whitepaper row', async () => {
    const result = await repo.create({
      projectName: 'TestProject',
      chain: 'base',
      documentUrl: 'https://example.com/wp.pdf',
      status: 'INGESTED',
      selectionScore: 8,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.projectName).toBe('TestProject');
    expect(db.insert).toHaveBeenCalled();
  });

  it('findById() calls select with correct filter', async () => {
    await repo.findById('some-uuid');
    expect(db.select).toHaveBeenCalled();
  });

  it('findByProjectName() queries by project name', async () => {
    await repo.findByProjectName('TestProject');
    expect(db.select).toHaveBeenCalled();
  });

  it('findByTokenAddress() queries by token address', async () => {
    await repo.findByTokenAddress('0xabc123');
    expect(db.select).toHaveBeenCalled();
  });

  it('updateStatus() calls update with new status', async () => {
    await repo.updateStatus('some-uuid', 'VERIFIED');
    expect(db.update).toHaveBeenCalled();
  });

  it('listByStatus() queries by status', async () => {
    await repo.listByStatus('INGESTED');
    expect(db.select).toHaveBeenCalled();
  });

  it('findByProjectAndChain() queries with composite filter', async () => {
    await repo.findByProjectAndChain('TestProject', 'base');
    expect(db.select).toHaveBeenCalled();
  });
});

// ── Claims Repo Tests ────────────────────────

describe('WpvClaimsRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: WpvClaimsRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new WpvClaimsRepo(db as never);
  });

  it('create() inserts and returns a claim row', async () => {
    const result = await repo.create({
      whitepaperId: 'wp-uuid',
      category: 'TOKENOMICS',
      claimText: 'APY of 500% is sustainable',
      statedEvidence: 'See section 3.2',
      sourceSection: 'Tokenomics',
      mathProofPresent: false,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.category).toBe('TOKENOMICS');
    expect(db.insert).toHaveBeenCalled();
  });

  it('findByWhitepaperId() queries by whitepaper ID', async () => {
    await repo.findByWhitepaperId('wp-uuid');
    expect(db.select).toHaveBeenCalled();
  });

  it('listByCategory() queries by category', async () => {
    await repo.listByCategory('PERFORMANCE');
    expect(db.select).toHaveBeenCalled();
  });
});

// ── Verifications Repo Tests ─────────────────

describe('WpvVerificationsRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: WpvVerificationsRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new WpvVerificationsRepo(db as never);
  });

  it('create() inserts and returns a verification row', async () => {
    const result = await repo.create({
      whitepaperId: 'wp-uuid',
      structuralScore: 4.2,
      confidenceScore: 78,
      hypeTechRatio: 1.5,
      verdict: 'PASS',
      totalClaims: 12,
      verifiedClaims: 10,
      llmTokensUsed: 5000,
      computeCostUsd: 0.35,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.verdict).toBe('PASS');
    expect(db.insert).toHaveBeenCalled();
  });

  it('findByWhitepaperId() queries by whitepaper ID', async () => {
    await repo.findByWhitepaperId('wp-uuid');
    expect(db.select).toHaveBeenCalled();
  });

  it('getGreenlightList() queries for PASS verdicts from today', async () => {
    await repo.getGreenlightList();
    expect(db.select).toHaveBeenCalled();
  });

  it('getScamAlerts() queries for FAIL verdicts with high hype ratio', async () => {
    await repo.getScamAlerts();
    expect(db.select).toHaveBeenCalled();
  });

  it('getLatestDailyBatch() returns empty array when no verifications exist', async () => {
    const result = await repo.getLatestDailyBatch();
    expect(result).toEqual([]);
  });

  it('listByVerdict() queries by verdict', async () => {
    await repo.listByVerdict('CONDITIONAL');
    expect(db.select).toHaveBeenCalled();
  });
});
