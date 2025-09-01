# MIST.cash SDK

A TypeScript SDK for interacting with MIST.cash - a privacy-focused protocol on Starknet.

We are facilitating two [workflows](readme-workflows.md),
1. [Frontend Integration](readme-workflows.md#1-submit-transaction-flow),
   * to build ui to create private payments
   * probaby to your own account
   * with strutured data generating your tx secret
2. [Backend integration](readme-workflows.md#2-verify-transaction-flow),
   * receive request when payment is made
   * receive transaction secret preimage (strutured data)
   * verify transaction addressed to you was created
   * keep records of processed transactions to avoid double spending on your backend

## Overview

The MIST SDK is a monorepo containing multiple packages that provide different layers of functionality for building applications with MIST.cash:

- **[@mistcash/react](./react)** - React hooks for easy integration  
    [npmjs.com/@mistcash/react](https://www.npmjs.com/package/@mistcash/react)

- **[@mistcash/sdk](./core)** - Core SDK with contract utilities  
    [npmjs.com/@mistcash/sdk](https://www.npmjs.com/package/@mistcash/sdk)

- **[@mistcash/config](./config)** - Configuration, ABIs, and contract addresses, tokens  
    [npmjs.com/@mistcash/config](https://www.npmjs.com/package/@mistcash/config)

- **[@mistcash/crypto](./crypto)** - Cryptographic operations for transaction privacy  
    [npmjs.com/@mistcash/crypto](https://www.npmjs.com/package/@mistcash/crypto)


## Quick Start

### For React Applications

```bash
pnpm add @mistcash/react
```

```tsx
import { useMist } from '@mistcash/react';
import { useProvider, useSendTransaction } from '@starknet-react/core';

function MyComponent() {
  const {
    valTo, setTo, valKey, setKey, // input state vars
    asset, setAsset, // asset selection and data
    contract, send, isPending, txError // contract and transactions
  } = useMist(useProvider(), useSendTransaction({}));

  // Your component logic here
}
```

### For Non-React Applications/Backends

```bash
pnpm add @mistcash/sdk @mistcash/crypto
```

```typescript
import { getChamber, fetchTxAssets, checkTxExists } from '@mistcash/sdk';
import { txSecret, txHash } from '@mistcash/crypto';

// obtain provider

// Initialize contract
const contract = getChamber(provider);

// Generate transaction secret
const secret = await txSecret(valKey, valTo);

// Fetch transaction assets
// ⚠️ transaction assets might not be public
// ⚠️ use checkTxExists to find fully private transactions
const asset = await fetchTxAssets(contract, valKey, valTo);

// Check if a transaction with specified assets exists
// 🟢 Some transactions have their assets private
// 🟡 fully private transactions need all the details
const txExists = await checkTxExists(contract, valKey, valTo, tokenAddr, amount);
```

## Packages

### @mistcash/react
#### https://www.npmjs.com/package/@mistcash/react

React hooks and utilities for MIST.cash integration. Provides the `useMist` hook that manages state, asset fetching, and transaction sending.

**Key Features:**
- Input state management (`val*`, `set*` items)
- Asset selection and fetching
- Contract interaction with loading states
- Transaction error handling

[View Package Documentation](./react)

### @mistcash/sdk
#### https://www.npmjs.com/package/@mistcash/sdk

Core SDK containing the fundamental utilities for interacting with MIST.cash contracts.

**Key Features:**
- Typed contract creation (`getChamber`)
- Asset fetching from transactions (`fetchTxAssets`)
- Transaction validation and verification

[View Package Documentation](./core)

### @mistcash/config
#### https://www.npmjs.com/package/@mistcash/config

Configuration package containing ABIs, contract addresses, and type definitions.

**Key Features:**
- Chamber contract ABI (`CHAMBER_ABI`)
- Mainnet contract addresses (`CHAMBER_ADDR_MAINNET`)
- TypeScript contract types (`ChamberTypedContract`)

[View Package Documentation](./config)

### @mistcash/crypto
#### https://www.npmjs.com/package/@mistcash/crypto

Cryptographic operations for transaction privacy and security.

**Key Features:**
- Transaction secret generation (`txSecret`)
- Transaction hash computation (`txHash`)
- Merkle tree operations for privacy

[View Package Documentation](./crypto)

## Prerequisites

Before using the MIST SDK, ensure you have:

1. **Starknet React Setup** (for React applications): Follow the [Starknet React getting started guide](https://github.com/apibara/starknet-react/tree/main?tab=readme-ov-file#getting-started)
2. **A Starknet Provider**: Either through Starknet React or directly via starknet.js

## Key Integration Points

### For Frontend Developers
- Use `@mistcash/react` for easy React integration
- Handle multi-call transactions (approve + deposit)
- Generate and share claiming keys securely
- Provide clear UX for transaction status

### For Backend Developers  
- Use `@mistcash/sdk` for contract interactions
- Implement transaction verification endpoints
- Handle both direct reads and fallback methods
- Cache results to avoid repeated contract calls

### Important Notes
⚠️ **Spent Transactions**: The contract cannot detect if a transaction has been claimed. Always check transaction age and implement your own tracking if needed.

⚠️ **Network Delays**: Transaction verification may take time after submission due to block confirmation delays.

⚠️ **Key Security**: Claiming keys should be transmitted securely and only to intended recipients.
## Examples

### Fetching Transaction Assets

```typescript
import { getChamber, fetchTxAssets } from '@mistcash/sdk';

const contract = getChamber(provider);
const assets = await fetchTxAssets(contract, transactionKey, recipientAddress);

console.log('Available assets:', assets);
```

### Reading Transaction with Secret

```typescript
import { txSecret } from '@mistcash/crypto';
import { getChamber } from '@mistcash/sdk';

const contract = getChamber(provider);
const secret = await txSecret(valKey, valTo);
const asset = await contract.read_tx(secret);
```

### Computing Transaction Hash

```typescript
import { txHash } from '@mistcash/crypto';

const hash = await txHash(
  transactionKey,
  recipientAddress,
  tokenAddress,
  amount
);
```

## Important Notes

⚠️ **Transaction State Limitations**: The contract cannot determine which transactions have been spent. The `fetchTxAssets` function will show assets even if the transaction has already been used.

⚠️ **Transaction Guarantee**: `fetchTxAssets` guarantees that a transaction was generated but does not verify if it's still spendable.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/mistcash/sdk.git
cd sdk

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [docs.mistcash.com](https://docs.mistcash.com) (coming soon)
- **Issues**: [GitHub Issues](https://github.com/mistcash/sdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mistcash/sdk/discussions)

---

Built with ❤️ for the Starknet ecosystem.