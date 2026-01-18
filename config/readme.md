# @mistcash/config

Configuration package for MIST SDK providing contract ABIs, addresses, and token definitions for the Starknet ecosystem.

## Installation

```bash
npm install @mistcash/config
# or
pnpm add @mistcash/config
# or
yarn add @mistcash/config
```

## Overview

This package exports:
- **Contract ABIs**: Chamber and ERC20 contract interfaces
- **Contract Addresses**: Mainnet addresses for MIST contracts
- **Token Definitions**: Supported tokens with metadata
- **TypeScript Types**: Fully typed contract interfaces

## Contract ABIs & Addresses

### Chamber Contract

The main MIST protocol contract for private transactions.

#### `CHAMBER_ADDR_MAINNET`

The Chamber contract address on Starknet mainnet.

```typescript
import { CHAMBER_ADDR_MAINNET } from '@mistcash/config';

console.log(CHAMBER_ADDR_MAINNET);
// '0x06f8dcc500131b6be6b33f4534ec6d33df33e61083ec2b051555d52e75654444'
```

**Type:** `0x${string}`

**Environment Variable:** Can be overridden with `CHAMBER_ADDR_MAINNET` environment variable.

---

#### `CHAMBER_ABI`

Complete ABI for the Chamber contract including all functions and events.

```typescript
import { CHAMBER_ABI } from '@mistcash/config';
import { Contract } from 'starknet';

const chamber = new Contract({
  abi: CHAMBER_ABI,
  address: CHAMBER_ADDR_MAINNET,
  provider
});
```

**Key Functions in Chamber ABI:**

- `deposit(hash: u256, asset: Asset)` - Deposit tokens into the chamber
- `withdraw_no_zk(claiming_key, owner, asset, proof)` - Withdraw without ZK proof
- `seek_and_hide_no_zk(claiming_key, owner, asset, proof, new_tx_secret, new_tx_amount)` - Transfer without ZK
- `handle_zkp(proof: Span<felt252>)` - Process ZK proof for private transactions
- `tx_array()` - Get all transaction leaves
- `merkle_root()` - Get current Merkle root
- `merkle_proof(index: u32)` - Get Merkle proof for transaction at index
- `merkle_leaves(height: u32)` - Get leaves at specific tree height
- `assets_from_secret(tx_secret: u256)` - Retrieve asset info from transaction secret
- `nullifiers_spent(nullifiers: Array<u256>)` - Check if nullifiers have been spent
- `transactions_exist(transactions: Array<u256>)` - Check if transactions exist
- `setVerifierAddress(verifier)` - Set the Groth16 verifier contract address
- `recalculate_merkle_root()` - Recalculate Merkle root from leaves

---

#### `ChamberTypedContract`

TypeScript type for the typed Chamber contract interface.

```typescript
import { ChamberTypedContract, CHAMBER_ABI, CHAMBER_ADDR_MAINNET } from '@mistcash/config';
import { Contract, ProviderInterface } from 'starknet';

function getChamber(provider: ProviderInterface): ChamberTypedContract {
  return new Contract({
    abi: CHAMBER_ABI,
    address: CHAMBER_ADDR_MAINNET,
    provider
  }).typedv2(CHAMBER_ABI);
}
```

**Type:** `TypedContractV2<typeof CHAMBER_ABI>`

---

### ERC20 Contract

Standard ERC20 token ABI for Starknet.

#### `ERC20_ABI`

Complete ERC20 ABI following OpenZeppelin standards.

```typescript
import { ERC20_ABI } from '@mistcash/config';
import { Contract } from 'starknet';

const token = new Contract({
  abi: ERC20_ABI,
  address: tokenAddress,
  provider
});

const balance = await token.balance_of(userAddress);
```

**Key Functions:**

- `total_supply()` - Get total token supply
- `balance_of(account)` - Get account balance
- `allowance(owner, spender)` - Get spending allowance
- `transfer(recipient, amount)` - Transfer tokens
- `transfer_from(sender, recipient, amount)` - Transfer from approved account
- `approve(spender, amount)` - Approve spending allowance
- `name()` - Get token name
- `symbol()` - Get token symbol
- `decimals()` - Get token decimals

---

## Token Definitions

### Token Interface

```typescript
interface Token {
  id: string;           // Contract address (hex string)
  name: string;         // Token symbol (e.g., 'ETH', 'USDC')
  icon?: string;        // SVG icon markup
  color: string;        // Primary color for UI
  textColor: string;    // Text color for contrast
  decimals?: number;    // Token decimal places
}
```

---

### `tokensData`

Array of supported tokens with metadata.

```typescript
import { tokensData } from '@mistcash/config';

tokensData.forEach(token => {
  console.log(`${token.name}: ${token.id}`);
});
```

**Included Tokens Details:**

MIST supports any ERC20 token, but here are popular ones for convenience

| Name | Address                                                            | Decimals | Color       |
| ---- | ------------------------------------------------------------------ | -------- | ----------- |
| ETH  | 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7 | 18       | #5f7edd     |
| STRK | 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d | 18       | #EC796B     |
| USDC | 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8 | 6        | #2775ca     |
| USDT | 0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8 | 6        | transparent |
| DAI  | 0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3 | 18       | #F4B731     |

---

### `tokensMap`

Map of token addresses to token objects for quick lookups.

```typescript
import { tokensMap } from '@mistcash/config';

const tokenAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const token = tokensMap[tokenAddress];

console.log(token.name);      // 'ETH'
console.log(token.decimals);  // 18
console.log(token.color);     // '#5f7edd'
```

**Type:** `{ [key: string]: Token }`

---

## Complete Usage Example

```typescript
import { 
  CHAMBER_ABI, 
  CHAMBER_ADDR_MAINNET, 
  ChamberTypedContract,
  ERC20_ABI,
  tokensData,
  tokensMap,
  Token
} from '@mistcash/config';
import { Contract, RpcProvider } from 'starknet';

// Setup provider
const provider = new RpcProvider({ 
  nodeUrl: 'https://starknet-mainnet.public.blastapi.io' 
});

// Get typed Chamber contract
const chamber: ChamberTypedContract = new Contract({
  abi: CHAMBER_ABI,
  address: CHAMBER_ADDR_MAINNET,
  provider
}).typedv2(CHAMBER_ABI);

// Use chamber contract
const txArray = await chamber.tx_array();
const merkleRoot = await chamber.merkle_root();

// Work with tokens
const ethToken = tokensMap['0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'];
console.log(`${ethToken.name} has ${ethToken.decimals} decimals`);

// Get ERC20 contract
const erc20 = new Contract({
  abi: ERC20_ABI,
  address: ethToken.id,
  provider
});

const balance = await erc20.balance_of(userAddress);
```

## UI Integration

The token data includes SVG icons and colors for easy UI integration:

```tsx
import { tokensData } from '@mistcash/config';

function TokenSelector() {
  return (
    <div>
      {tokensData.map(token => (
        <div 
          key={token.id}
          style={{ 
            backgroundColor: token.color, 
            color: token.textColor 
          }}
        >
          {token.icon && (
            <div dangerouslySetInnerHTML={{ __html: token.icon }} />
          )}
          <span>{token.name}</span>
        </div>
      ))}
    </div>
  );
}
```

## TypeScript Support

All exports are fully typed for excellent TypeScript support:

```typescript
import type { Token, ChamberTypedContract } from '@mistcash/config';

// Token operations are type-safe
const processToken = (token: Token) => {
  const amount = BigInt(1000) * BigInt(10 ** (token.decimals || 18));
  return amount;
};

// Contract calls are type-checked
const queryContract = async (contract: ChamberTypedContract) => {
  const root = await contract.merkle_root(); // Returns bigint
  const leaves = await contract.tx_array();   // Returns bigint[]
};
```

## Environment Variables

- `CHAMBER_ADDR_MAINNET`: Override the default Chamber contract address

```bash
# .env
CHAMBER_ADDR_MAINNET=0x1234567890abcdef...
```

## Dependencies

- `starknet` ^9.2.1 - Starknet.js library for contract interactions

## License

MIT

## Repository

https://github.com/mistcash/sdk

## Issues

https://github.com/mistcash/sdk/issues
