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

### uint64 amount limit

The prover's `SpendNote.Amount` is `uint64`. At 18 decimals, a single note
is capped at ~18.4 tokens. Larger amounts require splitting across notes.

### Circuit sync

The SDK mirrors types, ABIs, and hash rules from `core`/`core-deploy`. See
[CIRCUIT_SYNC.md](./CIRCUIT_SYNC.md) for the full surface and update
procedure.

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
- **`prover`** (subpath): `loadProver`, `createWorkerProver`

## License

MIT