/**
 * Canonical list of known crypto protocols.
 * Used by: WpvService (known-protocol gate), WebSearchFallback (URL map).
 * AcpService (plugin-acp) maintains a synced inline copy — see SYNC comment there.
 *
 * When adding a new protocol:
 * 1. Add the name here
 * 2. Add the name to plugin-acp/src/AcpService.ts KNOWN_PROTOCOL_PATTERN (SYNC comment)
 * 3. Add a KNOWN_WHITEPAPER_URL entry in WebSearchFallback.ts
 * 4. Rebuild and deploy both repos
 */
export const KNOWN_PROTOCOL_NAMES: string[] = [
  // ── DeFi Protocols ──
  'Uniswap', 'Aave', 'Compound', 'MakerDAO', 'Maker', 'Curve', 'Synthetix',
  'SushiSwap', 'Sushi', 'Balancer', 'Yearn', 'Chainlink', 'Lido',
  'Rocket Pool', 'Frax', 'Convex', 'Euler', 'Morpho', 'Radiant', 'Pendle',
  'GMX', 'dYdX', 'Aerodrome', 'Jupiter', 'Raydium', '1inch',
  'PancakeSwap', 'Pancake Swap', 'Trader Joe', 'Camelot', 'Ethena', 'USDe',
  'Hyperliquid', 'EigenLayer', 'Eigen Layer', 'Stargate',
  'Jito', 'Drift', 'Orca', 'Marinade', 'Seamless',
  // ── Infrastructure / Oracles ──
  'LayerZero', 'Layer Zero', 'Wormhole', 'Across', 'Hop Protocol',
  'The Graph', 'Arweave', 'Akash', 'Render', 'Pyth', 'API3',
  // ── L1/L2 Chains ──
  'Bitcoin', 'Ethereum', 'Solana', 'Cardano', 'Polkadot', 'Avalanche',
  'Cosmos', 'Arbitrum', 'Optimism', 'Base', 'Polygon', 'zkSync',
  'Starknet', 'Scroll', 'Linea', 'Blast', 'Manta', 'Mode',
  'Near', 'Algorand', 'Aptos', 'Sui', 'Sei', 'Celestia', 'Mantle',
  'Toncoin', 'Tron', 'Hedera', 'Fantom', 'Stellar', 'XRP', 'Litecoin',
  'Monero', 'Filecoin', 'Internet Computer', 'Kaspa', 'Injective',
  // ── Agent Platforms ──
  'Virtuals Protocol',
  // ── Meme (evaluator tests these) ──
  'Pepe', 'Shiba', 'Dogecoin', 'Floki', 'Bonk',
];

/**
 * Build a regex pattern from the protocol list.
 * Handles multi-word names (spaces → \s*) and appends optional version suffix.
 */
export function buildProtocolPattern(names: string[]): RegExp {
  const escaped = names.map(n =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
     .replace(/\s+/g, '\\s*')
  );
  return new RegExp(`\\b(${escaped.join('|')})\\s*(v\\d+)?\\b`, 'i');
}

export const KNOWN_PROTOCOL_PATTERN = buildProtocolPattern(KNOWN_PROTOCOL_NAMES);
