# @mistcash/sdk

Modular TypeScript SDK for MIST private payments on EVM.

Extracted from `core-deploy/playground` (`chain.js`, `pq.js`, `app.js` flows).

## Install

```bash
npm install @mistcash/sdk@beta viem
```

`0.6` is a rewrite and ships on the `beta` tag; `latest` (`0.5.x`) is the
legacy SDK with a different API.

Contributors: the prover wasm is committed under `wasm/`, so a fresh clone
runs as-is (`npm ci && npm test`). After a circuit change, resync it from
core-deploy with `npm run sync:wasm` (see [Circuit sync](#circuit-sync)).

## Quick start (Node)

```ts
import { createPublicClient, createWalletClient, http, keccak256, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { anvil } from 'viem/chains';
import { loadProver } from '@mistcash/sdk/prover';
import { CORE_ABI, MistClient, decapsulate, deriveUkx, managerKeys, rand, type AddressBook, type ChainAdapter } from '@mistcash/sdk';

const PRIVATE_KEY = '0x...';
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: anvil, transport: http() });
const walletClient = createWalletClient({ chain: anvil, transport: http(), account });

// Every read, write and event MistClient uses: Chamber, Reserve, the
// registrar, the token and deposit screening.
const abi = parseAbi(CORE_ABI);

const chain: ChainAdapter = {
  readContract: (address, functionName, args) =>
    publicClient.readContract({ address, abi, functionName: functionName as never, args: args as never }),
  sendTransaction: async (tx) => {
    const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // Pass the logs through: deposit() and spend() read the Chamber's
    // NoteAppended and DepositQueued events from them.
    return { hash, receipt: { transactionHash: hash, gasUsed: receipt.gasUsed, status: receipt.status, logs: receipt.logs } };
  },
  // UserRegistered/UserRemoved (the users tree a spend proves against), DepositQueued.
  getEvents: (address, eventName, fromBlock) =>
    publicClient.getLogs({ address, event: abi.find((i) => i.type === 'event' && i.name === eventName) as never, fromBlock }),
};

// Addresses from the deployment (core-deploy/dist/deployments/<chainId>.json).
// On a local core-deploy (`scripts/deploy.sh deploy`) the deployer is the
// fixture reserve's admin, the registrar holds USERS and the token is listed.
const book: AddressBook = { chamber: '0x...', registrar: '0x...', reserve: '0x...', token: '0x...', verifier: '0x...' };

const prover = await loadProver(); // reads wasm/mist.wasm from disk in Node
const client = new MistClient({
  book,
  chainId: anvil.id,
  chain,
  prover,
  // `me` is the public account; `me (MIST)` its private MIST identity.
  addressOf: () => account.address,
  // Testing only: real apps derive the secret from a wallet signature (see Caveats).
  secretOf: () => (BigInt(keccak256(PRIVATE_KEY)) >> 8n).toString(),
});

// Join the reserve: a reserve with members only lets members spend. The
// reserve's half (decapsulate, sign the membership leaf) normally runs in the
// reserve's service, signed by a holder of its USERS permission; here the
// deployer is the reserve admin, which holds every permission.
const manager = managerKeys(PRIVATE_KEY);
await client.join({
  id: 'me (MIST)',
  reserve: book.reserve,
  managerPublicKey: manager.publicKey,
  managerSide: async ({ cipherText, reserve, mistAddr }) => {
    const ukx = deriveUkx(decapsulate(cipherText, manager.secretKey), reserve, mistAddr);
    const leaf = BigInt(await prover.hash2(mistAddr, ukx)); // H2(mistAddr, ukx); the ukx stays off-chain
    // The last valid second, in chain time. The digest names the signer and
    // binds nonces that move (see Reserve admin), so read it just before signing.
    const deadline = (await publicClient.getBlock()).timestamp + 3600n;
    const digest = await publicClient.readContract({ address: book.registrar, abi, functionName: 'registerUserDigest', args: [reserve, leaf, account.address, deadline] });
    return { ukx, signer: account.address, deadline, signature: await account.sign({ hash: digest }) }; // EIP-712 v3
  },
});

// Deposit into a private note, then withdraw it back to the public account.
const amount = 10n ** 18n; // amounts are uint64: see Caveats
await client.deposit({ reserve: book.reserve, id: 'me (MIST)', amount, blinding: rand() });
await client.spend({ id: 'me (MIST)', amount: 0n, withdraw: amount, withdrawTo: 'me', reserve: book.reserve });
```

At core `fa7b92d` Chamber's runtime code is over EIP-170's 24,576 bytes, so
only a devnet takes it: run anvil with `--disable-code-size-limit` (core-deploy's
`deploy.sh` does). `Deploy.s.sol` deploys dev fixtures only on chain 31337 or
Sepolia.

## Loading `mist.wasm`

`mist.wasm` (~20 MB) is the prover with its proving key embedded. `loadProver()` takes it from four
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
JavaScript. It would add ~26 MB to every consumer's bundle, couple the wasm's
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

// The worker holds the ~20 MB prover, so stop it when you are done with it.
// This also rejects any call still in flight.
prover.terminate();
```

## WebGPU prover

`@mistcash/sdk/prover/webgpu` proves with `mist-webgpu.wasm`: the same Go
prover and proving key as `mist.wasm`, built with gnark's WebGPU backend, so
the multi-scalar multiplications and the quotient run as WGSL compute
shaders. On an Apple M-series laptop in Chromium a spend proof drops from
~2.5 s to ~0.2 s; loading can take up to ~1.5 s longer (shader compilation
and the one-time upload of the proving key to the GPU, both done before
`loadWebGPUProver` resolves).

```ts
import { createWorkerProver } from '@mistcash/sdk/prover';

const prover = createWorkerProver({ webgpu: true }); // optional: wasmUrl of mist-webgpu.wasm
const { backend, fallbackReason } = await prover.backend(); // 'webgpu' | 'cpu'
```

or on the main thread:

```ts
import { loadWebGPUProver, hasWebGPU } from '@mistcash/sdk/prover/webgpu';

const prover = await loadWebGPUProver(); // or a URL / bytes, as for loadProver
prover.backend; // 'webgpu', or 'cpu' with prover.fallbackReason
```

When bundling, pass the URL your bundler emits, exactly as for `mist.wasm`
(see [Loading `mist.wasm`](#loading-mistwasm)):

```ts
// Vite
import webgpuWasmUrl from '@mistcash/sdk/wasm/mist-webgpu.wasm?url';
const prover = createWorkerProver({ webgpu: true, wasmUrl: webgpuWasmUrl });
```

It never fails for want of a GPU: with no `navigator.gpu`, no adapter, or a
failed upload, the same wasm proves on the CPU and `backend` says `'cpu'`.
Check `hasWebGPU()` first if you would rather load the smaller `mist.wasm`
in that case. Its `spend` (and `hash2`/`hash3`/`decrypt`, via the adapter)
return Promises, which `MistClient` already awaits.

The GPU half is gnark's TypeScript runtime, vendored into
`src/prover/gnark-webgpu/` by `npm run sync:wasm` from the exact gnark the
wasm links (`circuit.json` `gnark`); the two halves share an unversioned
byte protocol, so never update one without the other. gnark marks the
backend experimental and unaudited. It changes how a proof is computed, not
what is proven: the proofs verify against the same `ChamberVerifier`.

## Screened reserves

A holder of a reserve's SCREENING permission can name a **screener**
(core#157): deposits into that reserve are queued, and their notes enter a
tx tree only after the screener approves them. A pending or rejected deposit
can always be reclaimed: a pending one by its depositor, a rejected one by the
depositor or its `refundTo`.

```ts
// Depositor (refundTo is optional: who a rejected deposit refunds)
const note = await client.deposit({ reserve, id, amount, blinding, refundTo });
note.screening; // 'pending' at a screened reserve; note.depositId is set
await client.setDepositRefundTo(note.depositId!, refundTo); // while pending, depositor only
await client.refreshScreening(); // later: approved notes become spendable
await client.reclaimDeposit(note.depositId!); // pending or rejected only

// SCREENING holder (Reserve.setScreener, which tells the Chamber)
await client.setReserveScreener(reserve, screenerAddress); // zero = off

// Screener (KYT bot, API relayer)
const queue = await client.queuedDeposits(reserve);
await client.approveDeposits(ok.map((d) => d.depositId), evidenceHash);
await client.rejectDeposits(bad.map((d) => d.depositId), evidenceHash);
```

- Notes with `screening` set (`pending`, `rejected`, `reclaimed`) are never
  picked as spend inputs.
- `deposit()` reads the note hash, and the deposit id or tx index, from the
  receipt's `DepositQueued` or `NoteAppended` log, so your `sendTransaction`
  adapter must return `receipt.logs` (viem's receipt logs as-is), or a
  `result` holding the call's `(noteHash, depositId)`. With neither, it
  stops after the approve, before any funds move.
- `queuedDeposits()` needs `ChainAdapter.getEvents` for `DepositQueued`.
- A batch skips ids that are no longer pending (e.g. reclaimed), and approval
  rejects a deposit whose note is already in a tx tree
  (`DepositDuplicateRejected`) instead of reverting.
- Reclaiming a pending deposit is the depositor's alone and refunds the
  depositor. A rejected deposit refunds its `refundTo` (the depositor when
  none was named), and the depositor or the `refundTo` may reclaim it.
- The screener is read when a deposit is decided: a new screener decides
  every deposit still queued.
- `evidence` is a `bytes32` commitment to your off-chain screening record
  (e.g. `keccak256` of the KYT report).

## Reserve admin and permissions

Each reserve has an **admin**, named at `registerReserve`, and four
permissions (`RESERVE_ROLES`), each held by any number of accounts. The admin
holds all four and grants or revokes them; every action is taken on the
Reserve, which pushes the result to the Chamber.

| Role | Lets an account | Client method |
| --- | --- | --- |
| `ASSETS` | list an asset with a minimum deposit, or delist it with 0 | `setAssetMinDeposit(reserve, asset, min)` |
| `USERS` | add users (sign registrations) and remove them | `removeUser(reserve, index)`, `revokeRegistration(reserve, leaf)` |
| `METADATA` | rotate the auditor key | `updateAuditorKey(reserve, keyHash, keyInputPoint)` |
| `SCREENING` | set the deposit screener | `setReserveScreener(reserve, screener)` |

```ts
// Admin
await client.grantPermission(reserve, 'USERS', book.registrar); // before anyone can join
await client.grantPermission(reserve, 'USERS', signerService);   // whose join signatures count
await client.setAssetMinDeposit(reserve, book.token, 10n ** 15n); // nothing is depositable until listed
await client.revokePermission(reserve, 'USERS', signerService);
await client.hasPermission(reserve, 'USERS', signerService); // false

// Hand the reserve over in two steps. Explicit grants survive, so review them
// after; the old admin's implicit permissions do not.
await client.transferAdmin(reserve, nextAdmin);
await nextAdminClient.acceptAdmin(reserve);
```

- `join()` registers through `book.registrar`, which needs USERS itself and
  accepts a signature only from a USERS holder (named as `signer`, ECDSA or
  ERC-1271). The EIP-712 v3 digest,
  `registerUserDigest(reserve, leaf, signer, deadline)`, binds three nonces,
  so a signature is good until its `deadline` and only while none moves:
  - the leaf's nonce, which moves on every registration and removal (so a
    signature works once, and a removed user needs a new one)
  - the leaf's revocation count, moved by `revokeRegistration`
  - the signer's USERS epoch, which moves when the signer loses USERS: a
    `revokePermission`, or an admin handover for the old admin's implicit
    permissions
- `revokeRegistration(reserve, leaf)` voids every outstanding signature, by
  any signer, for that leaf.
- `grantPermission` reverts for the zero address; a repeat grant, or a revoke
  without a grant, is a no-op.
- `removeUser(reserve, index)` zeroes a user's leaf (the index is in its
  `UserRegistered` event; `registeredUserLeaves(reserve)` lists them). A
  spend at a reserve with members proves against every slot, so
  `ChainAdapter.getEvents` must serve all of the reserve's `UserRegistered`
  and `UserRemoved` events; `spend()` refuses before proving when it reads
  fewer leaves than `registeredUsersCount`. It
  takes full effect within the 10-minute zkState root grace; removing the
  last user reverts. A removed member's `spend()` fails with "This reserve no
  longer lists you as a member: join it again."; re-joining needs a new
  signature.

## Caveats

### `secretOf(privateKey)` is playground-only

Browser wallets never expose a private key. Real apps should derive the
MIST secret from a wallet signature (EIP-712 or `personal_sign`), not from
`keccak(privateKey) >> 8`. The SDK's `secretOf` is a convenience for
testing.

### One global Go runtime

The Go runtime registers itself as `globalThis.Go`, and the prover's exports
land on `globalThis` too. Two provers from different `mist.wasm` versions in
one page would collide, so load exactly one per page — and that includes
`mist.wasm` next to `mist-webgpu.wasm`. `loadProver()` memoizes
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

### Paused Chamber

The Chamber's guardian can pause inflows (`deposit`, `approveDeposits`) until
unpaused, and spends for up to 3 days. `deposit()` then refuses with
"Deposits are paused." before sending the approve, and `spend()` with "Spends
are paused." before proving. `reclaimDeposit` and `rejectDeposits` never
pause.

`deposit()` also refuses, before the approve, a token the reserve has not
listed and an amount below its minimum deposit.

### Tx trees roll over

The Chamber starts a new tx tree every `txTreeCapacity` (4^10) leaves, and a
spend proves both inputs against one tree's root. Each note keeps its global
`txIndex` (from `NoteAppended`, or looked up from its `hash`), `spend()` only
pairs notes from one tree, and it hands the prover that tree's leaves alone
(`txTreeLeaves(treeId)`). If you pass `state` yourself, `state.txLeaves` must
be that one tree's leaves.

A superseded zkState root stays valid for 10 minutes, so a proof made just
before another reserve changes the root still lands. `spend()` checks the
proof's root before submitting and fails with "The reserve state changed
while proving: spend again." when the Chamber would reject it.

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
match. The contract ABIs are generated from `core` and checked against it, along
with the order of `PUBLIC_INPUTS`:

```sh
MIST_CORE=/path/to/core npm run abis:check   # exit 1 with a diff on drift
MIST_CORE=/path/to/core npm run abis         # regenerate src/abis.generated.ts
```

See [CIRCUIT_SYNC.md](./CIRCUIT_SYNC.md) for the full mirrored surface.

## Releasing

CI runs `npm run verify`, real-wasm tests included, on every PR. Pushing a
`vX.Y.Z` tag publishes to npm from CI. See [RELEASING.md](./RELEASING.md).

## Architecture

- **`identity`**: `secretOf`, `ownerOf`, `rand` — pure, injected hash
- **`contracts`**: `CORE_ABI`, `ABIS`, `PUBLIC_INPUTS`, `RESERVE_ROLES`, `AddressBook`
- **`pq`**: X-Wing key exchange (`managerKeys`, `encapsulate`, `deriveUkx`)
- **`notes`**: `unspent`, `pick`, `plan` — pure selection logic (skips
  screened deposits outside the tree, pairs notes from one tx tree)
- **`proving`**: `buildSpendRequest`, `serializeSpendRequest`, `proveSpend`,
  `ProverAdapter`, `pickUnusedKeyIndex`
- **`client`**: `MistClient` — stateful gateway (deposit, spend, join,
  openPayload, deposit screening, reserve admin and permissions)
- **`prover`** (subpath): `loadProver`, `createWorkerProver` (returns
  `terminate()`; without it the worker and its ~20 MB prover live for the page's
  lifetime; `{ webgpu: true }` proves on the GPU)
- **`prover/webgpu`** (subpath): `loadWebGPUProver`, `hasWebGPU`

## License

MIT