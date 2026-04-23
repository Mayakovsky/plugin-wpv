import { describe, it, expect } from 'vitest';
import { WpvService } from '../src/WpvService';

// Access private static method via bracket notation (same pattern as scopeCheck.test.ts)
const aggregateSignals = (WpvService as never as Record<string, Function>)['aggregateSignals'] as (
  offeringId: string,
  requirement: Record<string, unknown>,
  isPlainText?: boolean,
) => Promise<void>;

describe('aggregateSignals — Fix 1: strict EVM format rejection', () => {
  describe('EVM format regex tightened to exactly 40 hex chars', () => {
    it('rejects 42-char hex (Aerodrome typo shape — eval Job 1246)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x940181a9ad482c1a306652651d769a677b8fd98631', // 42 hex chars
        project_name: 'Aerodrome Finance',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected 0x-prefixed 40-hex-character address/);
    });

    it('rejects 20-char hex (truncated)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x1234567890abcdef1234', // 20 hex chars
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected 0x-prefixed 40-hex-character address/);
    });

    it('rejects 39-char hex (one short)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x1234567890abcdef1234567890abcdef1234567', // 39 hex chars
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected 0x-prefixed 40-hex-character address/);
    });

    it('rejects 41-char hex (one long)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x1234567890abcdef1234567890abcdef123456789', // 41 hex chars
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected 0x-prefixed 40-hex-character address/);
    });

    it('accepts 40-char lowercase hex (canonical EVM)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // Aave, 40 hex lowercase
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .resolves.toBeUndefined();
      // Token signal should have been recorded
      expect((requirement as { _signals?: string[] })._signals).toContain('token');
    });

    it('accepts 40-char EIP-55 checksummed hex (mixed case)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', // real AERO, EIP-55
        project_name: 'Aerodrome Finance',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .resolves.toBeUndefined();
      expect((requirement as { _signals?: string[] })._signals).toContain('token');
    });

    it('rejects non-hex characters after 0x', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0xZZZZ567890abcdef1234567890abcdef12345678', // non-hex Z
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected 0x-prefixed 40-hex-character address/);
    });

    it('rejects burn address (all zeros) even at 40 chars', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x0000000000000000000000000000000000000000',
        project_name: 'Test',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/burn\/null address rejected/);
    });

    it('rejects burn address (all F) even at 40 chars', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0xffffffffffffffffffffffffffffffffffffffff',
        project_name: 'Test',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/burn\/null address rejected/);
    });
  });

  describe('Non-EVM address handling unchanged', () => {
    it('rejects Bitcoin P2PKH address (starts with 1)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block address
        project_name: 'Bitcoin',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/Bitcoin address detected/);
    });

    it('rejects Bitcoin Bech32 address (starts with bc1)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        project_name: 'Bitcoin',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/Bitcoin address detected/);
    });

    it('accepts valid Solana base58 address (26-50 chars)', async () => {
      const requirement: Record<string, unknown> = {
        token_address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // Jupiter
        project_name: 'Jupiter',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .resolves.toBeUndefined();
      expect((requirement as { _signals?: string[] })._signals).toContain('token');
    });

    it('rejects garbage string that is neither 0x, Bitcoin, nor base58', async () => {
      const requirement: Record<string, unknown> = {
        token_address: 'invalid_addr_with_underscores', // underscores fail base58
        project_name: 'Test',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .rejects.toThrow(/expected valid crypto address/);
    });
  });

  describe('Silent-strip removed — OR semantics preserved via name-only path', () => {
    it('still accepts request with only project_name (no token_address)', async () => {
      const requirement: Record<string, unknown> = {
        project_name: 'Aave',
      };
      await expect(aggregateSignals('project_legitimacy_scan', requirement))
        .resolves.toBeUndefined();
      expect((requirement as { _signals?: string[] })._signals).toContain('name');
    });

    it('still accepts request with only document_url (no token_address)', async () => {
      const requirement: Record<string, unknown> = {
        document_url: 'https://uniswap.org/whitepaper-v3.pdf',
      };
      await expect(aggregateSignals('verify_project_whitepaper', requirement))
        .resolves.toBeUndefined();
      expect((requirement as { _signals?: string[] })._signals).toContain('url');
    });
  });

  describe('Plain-text path remains permissive on address format', () => {
    it('accepts abbreviated address under isPlainText=true', async () => {
      const requirement: Record<string, unknown> = {
        token_address: '0x7fc66500', // abbreviated, would fail structured validation
        project_name: 'Aave',
        raw_instruction: 'Verify Aave (0x7fc66500...)',
      };
      // Plain-text extraction may produce truncated addresses — skip format check
      await expect(aggregateSignals('verify_project_whitepaper', requirement, true))
        .resolves.toBeUndefined();
      expect((requirement as { _signals?: string[] })._signals).toContain('token');
    });
  });
});
