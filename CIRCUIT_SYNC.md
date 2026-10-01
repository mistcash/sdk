# Syncing the SDK with circuit updates

The SDK does not define the protocol. `mistcash/core` is the source of truth
(circuits + contracts), and `core-deploy` turns that into the prover
(`mist.wasm`) and the verifier. Every row below is an SDK constant or type
that silently breaks when its source changes: proofs still generate, and
then `handleZkp` reverts on-chain.

## What the SDK mirrors

| SDK | Mirrors | Source |
| --- | --- | --- |
| `SpendRequest` (`src/proving.ts`) | Go `SpendRequest` / `SpendNote` (field names **and JSON types**: `Amount`, `Withdraw`, `KeyIndex` are JSON numbers, `uint64`) | `core-deploy/builders/wasm/main.go` |
| `SpendSuccess` | Go `ProofResult` JSON tags (`proof`, `publicInputs`, `commitments`) | same |
| `ProverAdapter.decrypt` | `decrypt(ukx, commitments) → {keyIndex, plaintext} \| null` | same |
| `ProverAdapter.hash2/hash3` | `hash2`, `hash3` wasm exports | same |
| `PUBLIC_INPUTS` (order + length 14) | public fields of `PrimaryTransactionCircuit`, in declaration order; `Chamber.handleZkp` reads `input[i]` by position | `core/circuits/src/primary.go`, `core/contracts/src/Chamber.sol` |
| `CORE_ABI`, `ABIS`, client `*_MIN` ABIs | `forge inspect <Contract> abi` | `core/contracts/src/*.sol` |
| `OWNER_KEYWORD`, owner = `H2(secret, "owner")` | `hash.NativeMISTOwner` | `core/circuits/lib/hash` |
| zkState leaf `H3(reserve, reserveConfig, usersRoot)`, user leaf `H2(owner, ukx)` | `NativeReserveStateLeaf`, `NativeRegisteredUserLeaf` | same |
| `pick()` at most two inputs, two outputs | circuit arity `In1/In2`, `Out1/Out2` | `primary.go` |
| key index range `0..255` | `KeyIndexBits = 8` | `primary.go` |
| `'mist/xwing/v1'`, `'mist/ukx/v1'` labels (`src/pq.ts`) | the manager and auditor tooling (`core-deploy/scripts/audit`, playground `pq.js`) | core-deploy |
| `mist.wasm` + `wasm_exec.js` | the proving key behind the **deployed** `ChamberVerifier`; `wasm_exec.js` from the same Go toolchain that built the wasm | `core-deploy/scripts/build.sh` |

## When the circuit or contracts change

1. **Rebuild in core-deploy** (with the `core` submodule at the new commit):
   `scripts/build.sh`. A circuit change produces new keys, a new
   `ChamberVerifier.sol`, and a new `dist/mist.wasm`.
2. **Diff the interface surface**, not just the circuit:

   ```sh
   git -C core diff OLD..NEW -- circuits/src/primary.go circuits/lib/hash contracts/src/Chamber.sol contracts/src/Reserve.sol
   git diff OLD..NEW -- core-deploy/builders/wasm/main.go
   ```

   Walk the table above, one row at a time.
3. **Update the SDK types and constants** that the diff touches. Public
   input order is positional, so any reorder has to land in `PUBLIC_INPUTS`
   and in every `publicInputs[i]` index in `src/client.ts` (nullifiers
   `[0..1]`, new notes `[2..3]`).
4. **Regenerate the ABIs** from `forge inspect` rather than editing by hand.
5. **Refresh the prover artifacts** using the sync script:

   ```sh
   MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm
   ```

   This copies `mist.wasm` and `wasm_exec.js`, and writes `circuit.json`
   with the sha256, byte size, Go version, core-deploy commit, and
   timestamp. Verify the values, then commit `src/prover/wasm_exec.js`
   and `circuit.json`.
6. **Run the real-wasm test** (Node, no mocks):

   ```sh
   npm test    # wasm integration test runs in the default suite
   ```

   It builds a request with `buildSpendRequest`, proves it with the real
   `mist.wasm`, and asserts the error is not a parse/unmarshal failure
   (reaches the circuit). Then run `core-deploy/scripts/deploy.sh flow`
   and an SDK spend against anvil, once at a reserve with members and
   once at a reserve without.
7. **Version it**: a new vk means old proofs fail against the new verifier,
   and new proofs fail against the old one. Treat that as a breaking release
   (a minor bump while on 0.x), and note in the changelog which deployments,
   by address book, the release targets.

## Never

- Hand-edit a field in `SpendRequest` without checking the Go JSON type.
  `"10"` versus `10` is a parse error in the prover.
- Ship a `mist.wasm` whose vk doesn't match the verifier on the target chain.
  The `prepack` script checks the sha256 against `circuit.json`.
- Mix `wasm_exec.js` from one Go version with a wasm built by another.