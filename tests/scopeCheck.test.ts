import { describe, it, expect } from 'vitest';
import { WpvService } from '../src/WpvService';

// Access private static method via bracket notation
const validate = (WpvService as never as Record<string, Function>)['validateTokenAddress'] as (
  offeringId: string,
  requirement: Record<string, unknown>,
  isPlainText?: boolean,
) => Promise<void>;

describe('Out-of-scope detector', () => {
  it('rejects "What is the current market price of Bitcoin on Binance?" as out-of-scope', async () => {
    // Simulate what AcpService.parseRequirement produces for plain text
    const requirement: Record<string, unknown> = {
      project_name: 'Bitcoin',
      raw_instruction: 'What is the current market price of Bitcoin on Binance?',
      _requirementText: 'What is the current market price of Bitcoin on Binance?',
    };

    await expect(validate('verify_full_tech', requirement, true))
      .rejects.toThrow('outside scope');
  });

  it('rejects "Should I buy Chainlink tokens?" as out-of-scope', async () => {
    const requirement: Record<string, unknown> = {
      project_name: 'Chainlink',
      raw_instruction: 'Should I buy Chainlink tokens?',
      _requirementText: 'Should I buy Chainlink tokens?',
    };

    await expect(validate('verify_full_tech', requirement, true))
      .rejects.toThrow('outside scope');
  });

  it('accepts "Analyze the security and decentralization claims of Chainlink V2 whitepaper"', async () => {
    const requirement: Record<string, unknown> = {
      project_name: 'Chainlink v2',
      raw_instruction: 'Analyze the security and decentralization claims of the Chainlink oracle network based on their V2 whitepaper',
      _requirementText: 'Analyze the security and decentralization claims of the Chainlink oracle network based on their V2 whitepaper',
    };

    // Should NOT throw — this is in-scope
    await expect(validate('verify_full_tech', requirement, true))
      .resolves.toBeUndefined();
  });

  it('accepts "Evaluate the mathematical validity of Uniswap v3 concentrated liquidity"', async () => {
    const requirement: Record<string, unknown> = {
      project_name: 'Uniswap v3',
      raw_instruction: 'Evaluate the mathematical validity of Uniswap v3 concentrated liquidity',
      _requirementText: 'Evaluate the mathematical validity of Uniswap v3 concentrated liquidity',
    };

    await expect(validate('verify_full_tech', requirement, true))
      .resolves.toBeUndefined();
  });

  it('does NOT fire on non-plain-text requests', async () => {
    const requirement: Record<string, unknown> = {
      project_name: 'Bitcoin',
      token_address: '0x1234567890abcdef1234567890abcdef12345678',
    };

    // Structured JSON with token_address — scope check only fires for isPlainText
    await expect(validate('verify_full_tech', requirement, false))
      .resolves.toBeUndefined();
  });

  it('does NOT fire on non-verify_full_tech offerings', async () => {
    const requirement: Record<string, unknown> = {
      project_name: 'Bitcoin',
      raw_instruction: 'What is the current market price of Bitcoin?',
    };

    // legitimacy_scan — scope check only fires for verify_full_tech
    await expect(validate('legitimacy_scan', requirement, true))
      .resolves.toBeUndefined();
  });
});
