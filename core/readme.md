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


// Manually checking if tx exists

// fetch existing transactions
const allTransactions = await contract.tx_array();

// generate full transaction hash
const tx = await txHash(claimingKey, recipient, tokenAddr, amount)

// check if your transaction is in the list
allTransactions.indexOf(tx);



```

## Contributing

Head over to https://github.com/mistcash/sdk for details.

## License

MIT
