# @mistcash/sdk

Modular TypeScript SDK for MIST private payments on EVM.

Extracted from `core-deploy/playground` (`chain.js`, `pq.js`, `app.js` flows).

## Install

```bash
npm install @mistcash/sdk viem
```

Contributors: after cloning, sync the prover artifacts from core-deploy:

```bash
npm run sync:wasm    # copies mist.wasm + wasm_exec.js, writes circuit.json
npm test             # verify
```

## Quick start (Node)

```ts
import { createPublicClient, createWalletClient, http, parseAbi, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { anvil } from 'viem/chains';
import { loadProver } from '@mistcash/sdk/prover';
import { MistClient, type ChainAdapter, type Hex } from '@mistcash/sdk';

const account = privateKeyToAccount('0x...');
const publicClient = createPublicClient({ chain: anvil, transport: http() });
const walletClient = createWalletClient({ chain: anvil, transport: http(), account });

const CORE_ABI = parseAbi([
  'function getTxArray() view returns (uint256[])',
  'function reserveConfigs(address) view returns (uint256, uint256, uint256)',
  'function registeredUsersCount(address) view returns (uint256)',
  'function deposit(address, uint256, uint256, address) returns (uint256)',
  'function handleZkp(uint256[8], uint256[14], uint256[])',
  'event UserRegistered(uint256 indexed leaf, uint256 index, uint256 root)',
]);

const chain: ChainAdapter = {
  readContract: (address, fn, args) =>
    publicClient.readContract({ address, abi: CORE_ABI, functionName: fn as never, args: args as never }),
  sendTransaction: async (tx) => {
    const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tx2 = await publicClient.getTransaction({ hash });
    return { receipt: { transactionHash: hash, gasUsed: receipt.gasUsed }, result: null };
  },
  getEvents: (address, eventName, fromBlock) =>
    publicClient.getLogs({ address, event: CORE_ABI.find((a) => a.type === 'event' && a.name === eventName) as never, fromBlock }),
};

const prover = await loadProver(); // loads wasm/mist.wasm (Node: reads from disk)
const client = new MistClient({
  book: { chamber: '0x...', registrar: '0x...', reserve: '0x...', token: '0x...', verifier: '0x...' },
  chainId: anvil.id,
  chain,
  prover,
  secretOf: (id) => (BigInt(keccak256(account.privateKey)) >> 8n).toString(),
  addressOf: () => account.address,
});
```

## Loading `mist.wasm`

`mist.wasm` is a ~16 MB proving key. `loadProver()` takes it from four
kinds of source, and **which one you should pass is the only bundler-specific
decision in this SDK**:

| Source | Signature | Use when |
| --- | --- | --- |
| nothing | `loadProver()` | Node, and browsers where the package's own file layout is served verbatim |
| a path | `loadProver('/abs/path/mist.wasm')` | Node, custom build output |
| a URL | `loadProver(url)` | browsers, when your bundler emits the asset |
| bytes | `loadProver(uint8)` | anywhere; also the way to load from OPFS/IndexedDB |

The bare `loadProver()` default resolves `new URL('../wasm/mist.wasm',
import.meta.url)` **at runtime**. That string is invisible to your bundler, so
in a built app it usually 404s — the asset was never emitted. Whenever you
bundle, pass the URL or the bytes explicitly:

```ts
// Vite
import wasmUrl from '@mistcash/sdk/wasm/mist.wasm?url';
await loadProver(wasmUrl);

// webpack 5 / Next.js — a static import of the asset gives you a hashed URL
import wasmUrl from '@mistcash/sdk/wasm/mist.wasm';
await loadProver(wasmUrl);
```

If loading fails, the error names the path it tried and tells you to pass a
source, so a 404 reads as a 404 rather than a stack trace from inside the
loader.

Deliberately **not** supported: inlining the wasm as a base64 string in the
JavaScript. It would add ~22 MB to every consumer's bundle, couple the wasm's
cache lifetime to the JS bundle's (a circuit change would invalidate all of
it), and force a full decode in memory instead of `instantiateStreaming`. If
you need a self-contained bundle anyway, base64 it yourself and hand the
decoded bytes to `loadProver`.

## Vite

Vite's dev-server pre-bundling breaks `new URL('./x.wasm', import.meta.url)`
inside dependencies. Either exclude the SDK from pre-bundling:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['@mistcash/sdk'] },
});
```

Or pass the wasm URL explicitly:

```ts
import wasmUrl from '@mistcash/sdk/mist.wasm?url';
const prover = await loadProver(wasmUrl);
```

## webpack 5 / Next.js

Load the prover in a client component effect:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { loadProver } from '@mistcash/sdk/prover';
import type { FullProverAdapter } from '@mistcash/sdk/prover';

export function ProverProvider({ children }: { children: React.ReactNode }) {
  const [prover, setProver] = useState<FullProverAdapter | null>(null);
  useEffect(() => { loadProver().then(setProver); }, []);
  if (!prover) return <div>Loading prover…</div>;
  return <ProverContext.Provider value={prover}>{children}</ProverContext.Provider>;
}
```

## React hook

```tsx
import { useContext, createContext } from 'react';
import type { FullProverAdapter } from '@mistcash/sdk/prover';

const ProverContext = createContext<FullProverAdapter | null>(null);

function useMistProver(): FullProverAdapter {
  const prover = useContext(ProverContext);
  if (!prover) throw new Error('useMistProver must be inside ProverProvider');
  return prover;
}
```

## Web Worker proving

Proving blocks the main thread for seconds. Use `createWorkerProver` to run
it in a Web Worker (browser only):

```ts
import { createWorkerProver } from '@mistcash/sdk/prover';

const prover = createWorkerProver(); // optional: { wasmUrl: '...' }
// prover.hash2, spend, decrypt are now async (proxied over postMessage)
const client = new MistClient({ /* ... */ prover });

// The worker holds the 16MB proving key, so stop it when you are done with it.
// This also rejects any call still in flight.
prover.terminate();
```

## Screened reserves

A reserve's manager can name a **screener** (core#157): deposits into that
reserve are queued, and their notes enter the tx tree only after the
screener approves them. The depositor can always reclaim a deposit that is
pending or was rejected.

```ts
// Depositor
const note = await client.deposit({ reserve, id, amount, blinding });
note.screening; // 'pending' at a screened reserve; note.depositId is set
await client.refreshScreening(); // later: approved notes become spendable
await client.reclaimDeposit(note.depositId!); // pending or rejected only

// Reserve manager
await client.setReserveScreener(reserve, screenerAddress); // zero = off

// Screener (KYT bot, API relayer)
const queue = await client.queuedDeposits(reserve);
await client.approveDeposits(ok.map((d) => d.depositId), evidenceHash);
await client.rejectDeposits(bad.map((d) => d.depositId), evidenceHash);
```

- Notes with `screening` set (`pending`, `rejected`, `reclaimed`) are never
  picked as spend inputs.
- `deposit()` reads the deposit id from the `DepositQueued` log, so your
  `sendTransaction` adapter must return `receipt.logs` (viem's receipt
  logs as-is) for screened reserves.
- `queuedDeposits()` needs `ChainAdapter.getEvents` for `DepositQueued`.
- A batch reverts whole if any id is no longer pending (e.g. the depositor
  reclaimed it), and an approval reverts with `transaction already exists`
  on a duplicate note, so reject that id instead.
- `evidence` is a `bytes32` commitment to your off-chain screening record
  (e.g. `keccak256` of the KYT report).

## Caveats

### `secretOf(privateKey)` is playground-only

Browser wallets never expose a private key. Real apps should derive the
MIST secret from a wallet signature (EIP-712 or `personal_sign`), not from
`keccak(privateKey) >> 8`. The SDK's `secretOf` is a convenience for
testing.

### One global Go runtime

The Go runtime registers itself as `globalThis.Go`, and the prover's exports
land on `globalThis` too. Two provers from different `mist.wasm` versions in
one page would collide, so load exactly one per page. `loadProver()` memoizes
a single instance per module for this reason, and clears the memo if loading
fails so a retry can succeed.

### Server-side rendering

`import { MistClient } from '@mistcash/sdk'` is SSR-safe: the root entry
pulls in no wasm and no Go runtime, and the runtime is loaded lazily only if
you call `loadProver`. Import `@mistcash/sdk/prover` from client code only —
the `node` export condition is what keeps `node:fs` out of browser bundles.

### Restore key indices at startup

Chamber rejects a spend whose private-tx key has been used before, and that key
is `H(userKeyExchange, keyIndex)`. The SDK draws `keyIndex` from a CSPRNG
restricted to indices not already used for that exchange, but it only knows
about indices it has seen this session.

If you pass a `StorageAdapter`, **call `restoreKeyIndices()` once at startup**:

```ts
const client = new MistClient({ /* ... */ store: localStorageAdapter });
await client.restoreKeyIndices();
```

Skip it and every session starts with an empty set, so a reload can redraw an
index that was already spent and the spend will revert on-chain. Indices are
merged into the store rather than overwriting it, so two clients sharing one
adapter — two tabs, for instance — do not erase each other's.

### uint64 amount limit

The prover's `SpendNote.Amount` is `uint64`. At 18 decimals, a single note
is capped at ~18.4 tokens. Larger amounts require splitting across notes.

### Circuit sync

The SDK mirrors types, ABIs, and hash rules from `core`/`core-deploy`. After a
circuit or contract change, one command vendors the new proving key and runs
the real-wasm tests against it:

```sh
MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm && npm test
```

It copies `mist.wasm` and `wasm_exec.js`, writes `circuit.json` (sha256, size,
Go version, and the `core` submodule commit the key was built from), and
`prepack` refuses to pack a wasm whose checksum or circuit commit does not
match. See [CIRCUIT_SYNC.md](./CIRCUIT_SYNC.md) for the full mirrored surface
and the manual steps for ABIs and public inputs.

## Architecture

- **`identity`**: `secretOf`, `ownerOf`, `rand` — pure, injected hash
- **`contracts`**: `CORE_ABI`, `ABIS`, `PUBLIC_INPUTS`, `AddressBook`
- **`pq`**: X-Wing key exchange (`managerKeys`, `encapsulate`, `deriveUkx`)
- **`notes`**: `unspent`, `pick`, `plan` — pure selection logic (skips
  screened deposits outside the tree)
- **`proving`**: `buildSpendRequest`, `serializeSpendRequest`, `proveSpend`,
  `ProverAdapter`, `pickUnusedKeyIndex`
- **`client`**: `MistClient` — stateful gateway (deposit, spend, join,
  openPayload, deposit screening)
- **`prover`** (subpath): `loadProver`, `createWorkerProver` (returns
  `terminate()`; without it the worker and its 16MB key live for the page's
  lifetime)

## License

MIT