# @mistcash/sdk

MIST Core SDK with Go WASM support for zero-knowledge proof generation and verification. This package provides cryptographic utilities, Merkle tree operations, and Starknet contract interactions for privacy-preserving transactions.

## Installation

```bash
npm install @mistcash/sdk
# or
pnpm add @mistcash/sdk
# or
yarn add @mistcash/sdk
```

## Quick Start

```typescript
import { initCore, prove_groth16, hash2, calculateMerkleRoot } from '@mistcash/sdk';

// Initialize the SDK (required before using proof functions)
await initCore();

// Generate a zero-knowledge proof
const witness = {
  ClaimingKey: '0x123...',
  Owner: '0xabc...',
  TxAsset: { Addr: '0xdef...', Amount: '1000000' },
  Withdraw: { Addr: '0x456...', Amount: '500000' },
  MerkleRoot: '0x789...',
  MerklePath: ['0x...', '0x...'],
  TxIndex: '2'
};

const proofResponse = await prove_groth16(witness);
```

## Core Functions

### Initialization

#### `initCore()`

Initializes both WASM modules (Gnark and Garaga). Must be called before using proof generation functions.

```typescript
await initCore();
```

**Returns:** `Promise<void>`

---

## Cryptographic Functions

### Hash Functions

#### `hash2(a: string, b: string)`

Asynchronous 2-way hash function using Poseidon hash from WASM module.

```typescript
const hash = await hash2('0x123', '0x456');
```

**Parameters:**
- `a`: First value to hash
- `b`: Second value to hash

**Returns:** `Promise<string>` - The hash result

---

#### `hash2Sync(a: string, b: string)`

Synchronous version of 2-way hash function. Use after WASM is initialized.

```typescript
const hash = hash2Sync('0x123', '0x456');
```

**Parameters:**
- `a`: First value to hash
- `b`: Second value to hash

**Returns:** `string` - The hash result

---

#### `hash3(a: string, b: string, c: string)`

Asynchronous 3-way hash function using Poseidon hash from WASM module.

```typescript
const hash = await hash3('0x123', '0x456', '0x789');
```

**Parameters:**
- `a`: First value to hash
- `b`: Second value to hash
- `c`: Third value to hash

**Returns:** `Promise<string>` - The hash result

---

#### `hash3Sync(a: string, b: string, c: string)`

Synchronous version of 3-way hash function. Use after WASM is initialized.

```typescript
const hash = hash3Sync('0x123', '0x456', '0x789');
```

**Parameters:**
- `a`: First value to hash
- `b`: Second value to hash
- `c`: Third value to hash

**Returns:** `string` - The hash result

---

### Transaction Hashing

#### `txSecret(key: string, to: string)`

Generates a transaction secret by hashing the claiming key with the recipient address.

```typescript
const secret = txSecret('0xabcd...', '0x1234...');
```

**Parameters:**
- `key`: Claiming key
- `to`: Recipient address

**Returns:** `string` - Transaction secret

---

#### `hash_with_asset(secrets_hash: string, asset: string, amount: string)`

Creates a full transaction hash including the asset and amount.

```typescript
const fullHash = hash_with_asset(secret, '0xTokenAddr...', '1000000');
```

**Parameters:**
- `secrets_hash`: The transaction secret hash
- `asset`: Token contract address
- `amount`: Token amount

**Returns:** `string` - Full transaction hash

---

#### `txHash(key: string, owner: string, tokenAddr: string, amount: string)`

Generates the complete transaction hash present on the Merkle tree. Can be used to verify transaction existence.

```typescript
const hash = txHash('0xkey...', '0xowner...', '0xtoken...', '1000000');
```

**Parameters:**
- `key`: Claiming key
- `owner`: Owner address
- `tokenAddr`: Token contract address
- `amount`: Token amount

**Returns:** `bigint` - Complete transaction hash

---

### Key Generation

#### `generateClaimingKey()`

Generates a random claiming key using cryptographically secure randomness.

```typescript
const key = generateClaimingKey();
// Returns something like: '0xabcd1234...'
```

**Returns:** `string` - A random hex string claiming key

---

## Zero-Knowledge Proofs

### `prove_groth16(witness: Witness)`

Generates a Groth16 zero-knowledge proof using the provided witness data.

```typescript
const witness = {
  ClaimingKey: '0x123...',
  Owner: '0xabc...',
  TxAsset: { Addr: '0xdef...', Amount: '1000000' },
  Withdraw: { Addr: '0x456...', Amount: '500000' },
  MerkleRoot: '0x789...',
  MerklePath: ['0x...', '0x...'],
  TxIndex: '2',
  Tx1Amount: '300000'  // Optional
};

const proof = await prove_groth16(witness);
```

**Parameters:**
- `witness`: Witness object containing:
  - `ClaimingKey`: The claiming key for the transaction
  - `Owner`: Owner's address
  - `TxAsset`: Object with `Addr` (token address) and `Amount`
  - `Withdraw`: Object with `Addr` (recipient) and `Amount`
  - `MerkleRoot`: Root of the Merkle tree
  - `MerklePath`: Array of hashes forming the Merkle path
  - `TxIndex`: Index of transaction in the tree
  - `Tx1Amount`: (Optional) Amount for first output transaction
  - `Tx1Secret`: (Optional) Secret for first output transaction
  - `Tx2Secret`: (Optional) Secret for second output transaction

**Returns:** `Promise<ProofResponse>` - Either success with proof data or error with message

---

### `full_prove(witness: Witness)`

Generates a complete Groth16 proof and returns call data formatted for Starknet contracts.

```typescript
const callData = await full_prove(witness);
// Returns bigint[] ready for contract calls
```

**Parameters:**
- `witness`: Same as `prove_groth16`

**Returns:** `Promise<bigint[]>` - Formatted call data for Starknet verification

---

## Merkle Tree Operations

### `calculateMerkleRoot(leaves: bigint[], hasher?, leafFilter?)`

Calculates the Merkle root from an array of leaf values.

```typescript
const leaves = [123n, 456n, 789n, 101112n];
const root = calculateMerkleRoot(leaves);
```

**Parameters:**
- `leaves`: Array of leaf values as bigints
- `hasher`: (Optional) Custom hash function `(left: bigint, right: bigint) => bigint`
- `leafFilter`: (Optional) Filter function applied to leaves `(leaf: bigint) => bigint`

**Returns:** `bigint` - The Merkle root

---

### `calculateMerkleRootAndProof(leaves: bigint[], index: number, hasher?, leafFilter?)`

Calculates both the Merkle root and generates a proof for a specific leaf.

```typescript
const leaves = [123n, 456n, 789n, 101112n];
const index = 1;
const proof = calculateMerkleRootAndProof(leaves, index);
// proof[proof.length - 1] is the root
```

**Parameters:**
- `leaves`: Array of leaf values as bigints
- `index`: Index of the leaf to generate proof for
- `hasher`: (Optional) Custom hash function
- `leafFilter`: (Optional) Filter function applied to leaves

**Returns:** `bigint[]` - Array containing proof path and root as last element

---

### `merkleRootFromPath(element: bigint, path: bigint[], hasher?, leafFilter?)`

Calculates the Merkle root from a leaf element and its proof path.

```typescript
const element = 456n;
const path = [123n, 789n, 101112n];
const root = merkleRootFromPath(element, path);
```

**Parameters:**
- `element`: The leaf element
- `path`: Array of hashes forming the Merkle path
- `hasher`: (Optional) Custom hash function
- `leafFilter`: (Optional) Filter function

**Returns:** `bigint` - The calculated Merkle root

---

### `merkleHasher(left: bigint, right: bigint)`

Default Poseidon hasher for Merkle tree operations. Automatically orders inputs.

```typescript
const hash = merkleHasher(123n, 456n);
```

**Parameters:**
- `left`: Left value
- `right`: Right value

**Returns:** `bigint` - The hash result

---

### `evenLeafFilter(leaf: bigint)`

Filter that converts odd leaf values to even by subtracting 1.

```typescript
const filtered = evenLeafFilter(123n); // Returns 122n
const filtered2 = evenLeafFilter(122n); // Returns 122n
```

**Parameters:**
- `leaf`: Leaf value to filter

**Returns:** `bigint` - Even leaf value

---

## Starknet Contract Interactions

### `getChamber(providerOrAccount?)`

Returns a typed Chamber contract instance for interacting with the MIST protocol.

```typescript
import { RpcProvider } from 'starknet';

const provider = new RpcProvider({ nodeUrl: 'https://...' });
const chamber = getChamber(provider);
```

**Parameters:**
- `providerOrAccount`: (Optional) Starknet provider or account instance

**Returns:** `ChamberTypedContract` - Typed contract instance

---

### `fetchTxAssets(contract: ChamberTypedContract, valKey: string, valTo: string)`

Fetches transaction asset information from the chamber contract.

⚠️ **Warning:** Will show assets even if transaction is spent. Contract cannot determine if a transaction has been spent.

```typescript
const asset = await fetchTxAssets(chamber, claimingKey, recipientAddress);
console.log(asset.addr);    // Token address
console.log(asset.amount);  // Amount as bigint
```

**Parameters:**
- `contract`: Chamber contract instance
- `valKey`: Claiming key
- `valTo`: Recipient address

**Returns:** `Promise<Asset>` - Object with `addr` (token address) and `amount` (bigint)

---

### `checkTxExists(contract: ChamberTypedContract, valKey: string, valTo: string, tokenAddr: string, amount: string)`

Checks if a transaction exists in the Merkle tree on the contract.

⚠️ **Warning:** Will return true even if transaction is spent. Contract cannot determine if a transaction has been spent.

```typescript
const exists = await checkTxExists(
  chamber,
  '0xkey...',
  '0xrecipient...',
  '0xtoken...',
  '1000000'
);
```

**Parameters:**
- `contract`: Chamber contract instance
- `valKey`: Claiming key
- `valTo`: Recipient address
- `tokenAddr`: Token contract address
- `amount`: Token amount

**Returns:** `Promise<boolean>` - True if transaction exists in tree

---

### `getTxIndexInTree(leaves: bigint[], valKey: string, valTo: string, tokenAddr: string, amount: string)`

Finds the index of a transaction in the leaves array.

```typescript
const leaves = await chamber.tx_array();
const index = await getTxIndexInTree(
  leaves,
  claimingKey,
  recipient,
  tokenAddr,
  amount
);
```

**Parameters:**
- `leaves`: Array of transaction hashes from contract
- `valKey`: Claiming key
- `valTo`: Recipient address
- `tokenAddr`: Token contract address
- `amount`: Token amount

**Returns:** `Promise<number>` - Index of transaction (-1 if not found)

---

## Utility Functions

### `fmtAmount(amount: bigint, decimals: number)`

Formats a bigint amount to a decimal string representation.

```typescript
const formatted = fmtAmount(1500000000000000000n, 18);
// Returns: "1.5"
```

**Parameters:**
- `amount`: Amount as bigint (in smallest unit)
- `decimals`: Number of decimal places

**Returns:** `string` - Formatted amount string

---

### `fmtAmtToBigInt(amountStr: string, decimals: number)`

Converts a decimal string amount to bigint representation.

```typescript
const bigintAmount = fmtAmtToBigInt("1.5", 18);
// Returns: 1500000000000000000n
```

**Parameters:**
- `amountStr`: Amount as decimal string
- `decimals`: Number of decimal places

**Returns:** `bigint` - Amount in smallest unit

---

### Development Utilities

#### `devVal<T>(val: T, deflt?: T)`

Development utility to preset defaults based on localStorage `devVals` setting.

```typescript
const value = devVal('testValue', 'production');
// Returns 'testValue' if devVals is set in localStorage, otherwise 'production'
```

**Parameters:**
- `val`: Value to use in development
- `deflt`: Default value for production

**Returns:** `T` - Either val or deflt based on environment

---

#### `devStr(val: string)`

Shortcut for `devVal` with empty string as default.

```typescript
const value = devStr('test-value');
// Returns 'test-value' in dev, '' in production
```

**Parameters:**
- `val`: Value to use in development

**Returns:** `string` - Either val or empty string

---

## Types

### `Asset`

```typescript
interface Asset {
  amount: string | bigint;
  addr: string;
}
```

### `Witness`

```typescript
interface Witness {
  ClaimingKey: string;
  Owner: string;
  TxAsset: Asset;
  Withdraw: Asset;
  MerkleRoot: string;
  MerklePath: string[];
  TxIndex: string;
  
  // Optional - computed if not provided
  Tx1Amount?: string;
  Tx1Secret?: string;
  Tx2Secret?: string;
  OwnerKey?: string;
  AuthDone?: string;
  WithdrawTo?: string;
  Nullifier?: string;
  Tx1?: string;
  Tx2?: string;
  Payload?: string;
}
```

### `ProofResponse`

```typescript
type ProofResponse = 
  | { status: 'success'; proof: Proof; publicInputs: (string | number)[] }
  | { status: 'error'; error: string; message: string };
```

## Advanced Usage

### Custom Merkle Tree Hasher

```typescript
// Create a custom hasher
const customHasher = (left: bigint, right: bigint): bigint => {
  // Your custom hashing logic
  return left ^ right; // Example: XOR
};

const root = calculateMerkleRoot(leaves, customHasher);
```

### Complete Proof Generation and Verification

```typescript
import { initCore, full_prove, getChamber } from '@mistcash/sdk';
import { RpcProvider, Account } from 'starknet';

// Initialize SDK
await initCore();

// Setup contract
const provider = new RpcProvider({ nodeUrl: 'https://starknet-mainnet.public.blastapi.io' });
const account = new Account(provider, address, privateKey);
const chamber = getChamber(account);

// Generate proof
const witness = {
  ClaimingKey: claimingKey,
  Owner: ownerAddress,
  TxAsset: { Addr: tokenAddress, Amount: '1000000' },
  Withdraw: { Addr: recipientAddress, Amount: '500000' },
  MerkleRoot: await chamber.merkle_root(),
  MerklePath: merkleProof,
  TxIndex: '2'
};

const callData = await full_prove(witness);

// Submit to contract
await chamber.verify_and_withdraw(callData);
```

## License

MIT

## Repository

https://github.com/mistcash/sdk

## Issues

https://github.com/mistcash/sdk/issues
