# @mistcash/sdk

Modular TypeScript SDK for MIST private payments on EVM.

Extracted from `core-deploy/playground` (`chain.js`, `pq.js`, `app.js` flows).
Designed after `open-agent-26/sdk` (`MISTActions` + `ChainAdapter` callbacks).

## Design

- **Modular**: `identity`, `contracts`, `pq`, `notes`, `proving`, `client` — import only what you need.
- **Flexible transport**: the SDK never owns a wallet. You inject a `ChainAdapter`
  (`readContract`, `getEvents`, `sendTransaction`, `getBlock`, ...) backed by viem,
  ethers, a test mock, or anything else.
- **Pluggable prover**: the Groth16/WASM prover is a `ProverAdapter` callback
  (`spend`, `decrypt`). No 12MB wasm bundled; bring your own `mist.wasm` loader.
- **Observable**: `MistCallbacks` (`onProgress`, `onTxSent`, `onTxConfirmed`, ...) let
  hosts wire UI, logging, or relayer routing without forking.

## Install

```bash
npm install @mistcash/sdk viem
```

## Usage

```ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { MistClient, viemChainAdapter, browserProver } from '@mistcash/sdk';

const client = new MistClient({
  chamber: '0x9fE4...',
  token: '0xCf7E...',
  chain: viemChainAdapter({ publicClient, walletClient, account }),
  prover: browserProver({ spend, decrypt, hash2 }),
  callbacks: { onProgress: (stage) => console.log(stage) },
});

await client.deposit({ who: 'alice', reserve, ownerCommitment, amount });
await client.spend({ id: 'alice (MIST)', to: 'bob (MIST)', amount: '400' });
```

See `src/` for module docs.
