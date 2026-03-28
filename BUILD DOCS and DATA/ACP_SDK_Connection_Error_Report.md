# ACP SDK Connection Error Report — Whitepaper Grey

**Date:** 2026-03-27
**Agent:** Whitepaper Grey (Provider on Virtuals Protocol)
**SDK:** `@virtuals-protocol/acp-node` v0.3.0-beta.39
**Chain:** Base mainnet

---

## The Error

```
AcpError: ACP Contract Client validation failed:
{
  "reason": "no whitelisted wallet registered on-chain for entity id",
  "entityId": 40675,
  "agentWalletAddress": "0x48A5F194eeB6e7C62FfF6f9EB6d81C115C7936f2"
}
```

This occurs during `AcpContractClientV2.build()` → `init()` → `validateSessionKeyOnChain()`. The SDK reads the singleSignerValidationModule on the agent wallet to verify the signer is whitelisted. It returns zero address, meaning the signer is not found.

---

## Wallet Configuration

| Role | Address |
|------|---------|
| **Agent wallet** | `0x48A5F194eeB6e7C62FfF6f9EB6d81C115C7936f2` |
| **Signer (burner) wallet** | `0x5a5F7D68ADdcF7324d737202279A40D35085004C` |
| **Agent ID** | `40675` |

---

## What We've Confirmed

1. **Agent wallet IS deployed on-chain** — `eth_getCode` returns proxy bytecode
2. **Signer IS whitelisted via Virtuals UI** — multiple "Install Validation" UserOperations confirmed on Basescan via EntryPoint v0.7.0
3. **Agent wallet has ETH** — funded on Base mainnet
4. **Private key is correct** — `privateKeyToAccount()` derives to `0x5a5F...`
5. **ACP contract address** (baseAcpConfigV2): `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`
6. **Account manager** (read from ACP contract): `0x14dAb2b846A4c07B3f52c37e3fD7265C2BcDf485`

---

## SDK Constructor Call

```typescript
const contractClient = await AcpContractClientV2.build(
  "0x<private_key>",           // derives to 0x5a5F... (signer/burner)
  40675,                        // agent ID from Virtuals registration
  "0x48A5F194eeB6e7C62FfF6f9EB6d81C115C7936f2",  // agent wallet
  // using default baseAcpConfigV2
);
```

---

## What the SDK Does (from source, index.js ~line 3680)

```javascript
const sessionSignerAddress = await account.getSigner().getAddress();

const onChainSignerAddress = await this.publicClient.readContract({
  address: this.agentWalletAddress,
  abi: singleSignerValidationModuleAbi,
  functionName: "signers",
  args: [sessionEntityKeyId, this.agentWalletAddress]
});

if (onChainSignerAddress === zeroAddress) {
  throw new AcpError("no whitelisted wallet registered on-chain for entity id", ...)
}
```

The `signers()` call returns zero address despite the signer being whitelisted in the Virtuals UI and Install Validation transactions being visible on-chain.

---

## On-Chain Transaction History (Basescan for 0x48A5...)

| Tx Hash | Action | Time |
|---------|--------|------|
| `0xcc5d4b49...` | Execute | ~1 hr ago |
| `0x55631cdb...` | Install Validation | ~1 hr ago |
| `0xae836b70...` | Install Validation | ~1 hr ago |
| `0x95b16cd2...` | Uninstall Validation | ~2 hrs ago |
| `0x73ff8d8f...` | Install Validation | ~2 hrs ago |
| `0x770df53a...` | Install Validation | ~2 hrs ago |
| `0x9fc6bf6b...` | Install Validation | ~2 days ago |
| `0x333aa4e6...` | Install Validation | ~2 days ago |

All via EntryPoint v0.7.0 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`).

---

## The Question

The signer `0x5a5F...` was whitelisted via the Virtuals UI and the on-chain transactions are confirmed. But the SDK's `signers()` read returns zero address. Why is the on-chain state not matching what was registered through the UI?

---

## Environment

- VPS: AWS Lightsail us-west-2 (44.243.254.19)
- Runtime: ElizaOS v1.6.5, bun 1.3.11
- SDK: `@virtuals-protocol/acp-node` 0.3.0-beta.39
- RPC: Alchemy Base mainnet
