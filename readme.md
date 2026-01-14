# MIST.cash SDK

A TypeScript SDK for interacting with MIST.cash - a privacy-focused protocol on Starknet.

## Overview

The MIST SDK is a monorepo containing multiple packages that provide different layers of functionality for building applications with MIST.cash:

- **[@mistcash/react](./react)** - React hooks for easy integration  
   [npmjs.com/@mistcash/react](https://www.npmjs.com/package/@mistcash/react)

- **[@mistcash/sdk](./core)** - Core SDK with contract utilities  
   [npmjs.com/@mistcash/sdk](https://www.npmjs.com/package/@mistcash/sdk)

- **[@mistcash/config](./config)** - Configuration, ABIs, and contract addresses, tokens  
   [npmjs.com/@mistcash/config](https://www.npmjs.com/package/@mistcash/config)

## Quick Start

### For React Applications

```bash
pnpm add @mistcash/react
```

#### 📝 TODO

### For Non-React Applications/Backends

```bash
pnpm add @mistcash/sdk
```

#### 📝 TODO

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

### Important Notes

#### 📝 TODO

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

const hash = await txHash(transactionKey, recipientAddress, tokenAddress, amount);
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
