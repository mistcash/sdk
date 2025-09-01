# @mistcash/crypto

MIST Cryptographic Operations

## Installation

```sh
pnpm add @mistcash/crypto
```

## Usage

```js
import { txSecret, txHash } from '@mistcash/crypto';

// read tx from secret
const asset = await contract.read_tx(await txSecret(valKey, valTo))

// tx hash for merkle stuff
const tx_hash = await txHash(valKey, valTo, tokenAddr, amount)
```

## Contributing

Head over to https://github.com/mistcash/sdk for details.

## License

MIT
