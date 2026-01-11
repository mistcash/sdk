# @mistcash/react

MIST React Components

## Installation

```sh
pnpm add @mistcash/react
```

## Usage

You need to have [Starknet React setup](https://github.com/apibara/starknet-react/tree/main?tab=readme-ov-file#getting-started).

You can then call `useMist` to acces utilities for interacting with MIST.cash contracts.
We will add more nicer docs here, please refer to the cource code till then.

```js
import { useMist } from '@mistcash/react';

// Your React component
function MyComponent() {
  // ...

  const {
    // inputs state
    valTo,
    setTo,
    valKey,
    setKey,
    // assets, selection and fetching
    asset,
    setAsset,
    fetchAsset,
    // contract, sending transactions and states
    contract,
    send,
    isPending,
    txError,
  } = useMist(useProvider(), useSendTransaction({}));

  // ...
  // ...
  // ...
}
```

## API

```ts
// More statuses will be added as more functionality is added
type LoadingStatus = 'FINDING_TX' | 'READY';

export interface UseMistResult {
  chamberAddress: `0x${string}`;
  loadingStatus: LoadingStatus;
  loadingMessage: string;
  valTo: string;
  setTo: (val: string) => void;
  valKey: string;
  setKey: (val: string) => void;
  asset: Asset | undefined;
  setAsset: (asset: Asset | undefined) => void;
  contract: ChamberTypedContract;
  send: (args?: Call[] | undefined) => void;
  isPending: boolean;
  error: string | null;
  txError: Error | null;
  fetchAsset: () => Promise<Asset>;
}
```

## Contributing

Head over to https://github.com/mistcash/sdk for details.

## License

MIT
