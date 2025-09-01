# @mistcash/sdk

MIST Core SDK

## Installation

```sh
pnpm add @mistcash/sdk
```

## Usage

```js
import { type Asset, fetchTxAssets, getChamber } from '@mistcash/sdk';

// Takes in Starknet provider
// Returns Typed chamber contract
const contract = getChamber(provider);

// Fetch transaction assets from the chamber contract.
// guarantees transaction was generated
// ⚠️ Will show assets even if transaction is spent
// ⚠️ Contract has no way of knowing which transaction is spent
const asset = await fetchTxAssets(contract, valKey, valTo);
```

## Contributing

Head over to https://github.com/mistcash/sdk for details.

## License

MIT
