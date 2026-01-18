# @mistcash/react

React hooks and utilities for integrating MIST protocol into React applications with Starknet.

## Installation

```bash
npm install @mistcash/react
# or
pnpm add @mistcash/react
# or
yarn add @mistcash/react
```

## Prerequisites

This package requires [@starknet-react](https://github.com/apibara/starknet-react) to be installed and configured in your application.

```bash
pnpm add @starknet-react/core @starknet-react/chains starknet
```

## Quick Start

```tsx
import { StarknetConfig } from '@starknet-react/core';
import { useMist } from '@mistcash/react';
import { useProvider, useSendTransaction } from '@starknet-react/core';

function MistComponent() {
  const provider = useProvider();
  const sendTransaction = useSendTransaction({});
  
  const {
    valTo,
    setTo,
    valKey,
    setKey,
    asset,
    fetchAsset,
    handleWithdraw,
    isPending,
    error
  } = useMist(provider, sendTransaction);

  const handleClaim = async () => {
    await fetchAsset();
    if (asset) {
      await handleWithdraw(asset, '0'); // Withdraw full amount
    }
  };

  return (
    <div>
      <input 
        value={valTo} 
        onChange={(e) => setTo(e.target.value)}
        placeholder="Recipient Address"
      />
      <input 
        value={valKey} 
        onChange={(e) => setKey(e.target.value)}
        placeholder="Claiming Key"
      />
      <button onClick={handleClaim} disabled={isPending}>
        {isPending ? 'Processing...' : 'Claim Funds'}
      </button>
      {error && <div>Error: {error}</div>}
    </div>
  );
}
```

## API Reference

### `useMist(provider, sendTransaction)`

Main hook for interacting with MIST protocol contracts.

```typescript
const mistResult = useMist(
  provider: ProviderInterface | UseProviderResult,
  sendTx: UseSendTransactionResult
);
```

**Parameters:**

- `provider`: Starknet provider from `useProvider()` or a `ProviderInterface` instance
- `sendTx`: Send transaction hook result from `useSendTransaction({})`

**Returns:** `UseMistResult` object with the following properties:

---

### Return Values

#### Contract Information

##### `chamberAddress`

The Chamber contract address on mainnet.

```typescript
const { chamberAddress } = useMist(provider, sendTx);
// '0x06f8dcc500131b6be6b33f4534ec6d33df33e61083ec2b051555d52e75654444'
```

**Type:** `0x${string}`

---

##### `contract`

Typed Chamber contract instance for direct interactions.

```typescript
const { contract } = useMist(provider, sendTx);
const merkleRoot = await contract.merkle_root();
```

**Type:** `ChamberTypedContract`

---

#### Loading State

##### `loadingStatus`

Current loading status of the hook operations.

```typescript
const { loadingStatus } = useMist(provider, sendTx);
```

**Type:** `'FINDING_TX' | 'READY'`

---

##### `loadingMessage`

Human-readable loading message.

```typescript
const { loadingMessage } = useMist(provider, sendTx);
// 'Finding transaction...' or ''
```

**Type:** `string`

---

#### Transaction State

##### `valTo` / `setTo`

Recipient address state management.

```typescript
const { valTo, setTo } = useMist(provider, sendTx);

// Set recipient address
setTo('0x1234...');
```

**Types:**
- `valTo`: `string` - Current recipient address
- `setTo`: `(val: string) => void` - Update recipient address

---

##### `valKey` / `setKey`

Claiming key state management.

```typescript
const { valKey, setKey } = useMist(provider, sendTx);

// Set claiming key
setKey('0xabcd...');
```

**Types:**
- `valKey`: `string` - Current claiming key
- `setKey`: `(val: string) => void` - Update claiming key

---

#### Asset Management

##### `asset` / `setAsset`

Current asset information (token address and amount).

```typescript
const { asset, setAsset } = useMist(provider, sendTx);

if (asset) {
  console.log('Token:', asset.addr);
  console.log('Amount:', asset.amount);
}

// Set asset manually
setAsset({
  addr: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  amount: BigInt('1000000000000000000')
});
```

**Types:**
- `asset`: `Asset | undefined` - Current asset or undefined if not set
- `setAsset`: `(asset: Asset | undefined) => void` - Update asset

```typescript
interface Asset {
  addr: string;           // Token contract address
  amount: string | bigint; // Token amount
}
```

---

##### `setAssetAddr`

Set only the token address while preserving amount.

```typescript
const { setAssetAddr } = useMist(provider, sendTx);
setAssetAddr('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
```

**Type:** `(addr: string) => void`

---

##### `setAssetAmt`

Set only the amount while preserving token address.

```typescript
const { setAssetAmt } = useMist(provider, sendTx);
setAssetAmt(BigInt('1000000000000000000'));
```

**Type:** `(amount: bigint) => void`

---

##### `fetchAsset()`

Fetch asset information from the contract using current claiming key and recipient.

```typescript
const { fetchAsset, valKey, valTo } = useMist(provider, sendTx);

// Fetch asset for current key and recipient
const asset = await fetchAsset();

if (asset.amount !== BigInt(0)) {
  console.log('Found asset:', asset);
}
```

**Returns:** `Promise<Asset>` - Asset information from the contract

**Side Effects:** Updates `asset` state and `loadingStatus`

---

#### Transaction Operations

##### `txLeaves`

Array of all transaction hashes in the Merkle tree.

```typescript
const { txLeaves } = useMist(provider, sendTx);
console.log(`Total transactions: ${txLeaves.length}`);
```

**Type:** `bigint[]`

---

##### `updateTxLeaves()`

Refresh transaction leaves from the contract.

```typescript
const { updateTxLeaves } = useMist(provider, sendTx);

const leaves = await updateTxLeaves();
console.log('Updated leaves:', leaves);
```

**Returns:** `Promise<bigint[]>` - Updated array of transaction leaves

**Side Effects:** Updates `txLeaves` state

---

##### `handleWithdraw(asset, new_tx_amount?)`

Process a withdrawal with zero-knowledge proof generation.

```typescript
const { handleWithdraw, asset } = useMist(provider, sendTx);

// Withdraw full amount
await handleWithdraw(asset, '0');

// Withdraw partial amount and create new transaction
await handleWithdraw(asset, '500000000000000000');
```

**Parameters:**
- `asset`: `Asset` - The asset to withdraw
- `new_tx_amount`: `string` (optional) - Amount to keep in a new transaction (default: '0')

**Returns:** `Promise<void>`

**What it does:**
1. Generates Merkle proof for the transaction
2. Creates zero-knowledge proof using witness data
3. Submits transaction to contract via `handle_zkp`

---

#### Seek and Hide Parameters

For advanced "seek and hide" operations (transfer to another key).

##### `valSnHTo` / `setSnHTo`

New recipient address for seek-and-hide operations.

```typescript
const { valSnHTo, setSnHTo } = useMist(provider, sendTx);
setSnHTo('0x5678...');
```

**Types:**
- `valSnHTo`: `string`
- `setSnHTo`: `(val: string) => void`

---

##### `valSnHKey` / `setSnHKey`

New claiming key for seek-and-hide operations.

```typescript
const { valSnHKey, setSnHKey } = useMist(provider, sendTx);
setSnHKey('0xnewkey...');
```

**Types:**
- `valSnHKey`: `string`
- `setSnHKey`: `(val: string) => void`

---

##### `valSnHAmt` / `setSnHAmt`

Amount for the new transaction in seek-and-hide operations.

```typescript
const { valSnHAmt, setSnHAmt } = useMist(provider, sendTx);
setSnHAmt('1000000');
```

**Types:**
- `valSnHAmt`: `string`
- `setSnHAmt`: `(val: string) => void`

---

#### Transaction Status

##### `send()`

Send prepared contract calls to the network.

```typescript
const { send, contract } = useMist(provider, sendTx);

// Manually send a contract call
send([contract.populate('recalculate_merkle_root', [])]);
```

**Type:** `(args?: Call[] | undefined) => void`

---

##### `isPending`

Whether a transaction is currently pending.

```typescript
const { isPending } = useMist(provider, sendTx);

return (
  <button disabled={isPending}>
    {isPending ? 'Processing...' : 'Submit'}
  </button>
);
```

**Type:** `boolean`

---

##### `error`

Combined error message from all operations.

```typescript
const { error } = useMist(provider, sendTx);

{error && <div className="error">Error: {error}</div>}
```

**Type:** `string | null`

---

##### `txError`

Transaction-specific error object.

```typescript
const { txError } = useMist(provider, sendTx);

if (txError) {
  console.error('Transaction failed:', txError.message);
}
```

**Type:** `Error | null`

---

## Complete Usage Example

```tsx
import { StarknetConfig, useProvider, useSendTransaction } from '@starknet-react/core';
import { useMist } from '@mistcash/react';
import { tokensMap } from '@mistcash/config';

function WithdrawComponent() {
  const provider = useProvider();
  const sendTransaction = useSendTransaction({});
  
  const {
    // Inputs
    valTo,
    setTo,
    valKey,
    setKey,
    
    // Asset info
    asset,
    fetchAsset,
    
    // Transaction operations
    handleWithdraw,
    updateTxLeaves,
    txLeaves,
    
    // Status
    isPending,
    error,
    loadingMessage,
  } = useMist(provider, sendTransaction);

  const handleFetch = async () => {
    const fetchedAsset = await fetchAsset();
    if (fetchedAsset.amount === BigInt(0)) {
      alert('No asset found for this key and recipient');
    }
  };

  const handleFullWithdraw = async () => {
    if (!asset) return;
    await handleWithdraw(asset, '0');
  };

  const tokenInfo = asset ? tokensMap[asset.addr] : null;

  return (
    <div>
      <h2>MIST Withdrawal</h2>
      
      <div>
        <label>Recipient Address:</label>
        <input 
          value={valTo} 
          onChange={(e) => setTo(e.target.value)}
          placeholder="0x..."
        />
      </div>

      <div>
        <label>Claiming Key:</label>
        <input 
          value={valKey} 
          onChange={(e) => setKey(e.target.value)}
          placeholder="0x..."
        />
      </div>

      <button onClick={handleFetch} disabled={isPending}>
        Fetch Asset
      </button>

      {asset && (
        <div>
          <h3>Asset Found</h3>
          <p>Token: {tokenInfo?.name || 'Unknown'}</p>
          <p>Amount: {asset.amount.toString()}</p>
          
          <button onClick={handleFullWithdraw} disabled={isPending}>
            {isPending ? 'Processing...' : 'Withdraw'}
          </button>
        </div>
      )}

      {loadingMessage && <p>{loadingMessage}</p>}
      {error && <div className="error">Error: {error}</div>}
      
      <p>Total transactions in tree: {txLeaves.length}</p>
    </div>
  );
}

// App setup with StarknetConfig
function App() {
  return (
    <StarknetConfig>
      <WithdrawComponent />
    </StarknetConfig>
  );
}
```

## Advanced: Seek and Hide Operation

Transfer funds to a new key without revealing the transaction:

```tsx
function SeekAndHideComponent() {
  const provider = useProvider();
  const sendTransaction = useSendTransaction({});
  
  const {
    valTo,
    setTo,
    valKey,
    setKey,
    valSnHTo,
    setSnHTo,
    valSnHKey,
    setSnHKey,
    valSnHAmt,
    setSnHAmt,
    asset,
    fetchAsset,
    handleWithdraw,
    isPending,
  } = useMist(provider, sendTransaction);

  const handleSeekAndHide = async () => {
    await fetchAsset();
    if (asset) {
      // Transfer partial amount to new key
      await handleWithdraw(asset, valSnHAmt);
    }
  };

  return (
    <div>
      <h3>Original Transaction</h3>
      <input value={valTo} onChange={(e) => setTo(e.target.value)} />
      <input value={valKey} onChange={(e) => setKey(e.target.value)} />
      
      <h3>New Transaction (Seek & Hide)</h3>
      <input 
        value={valSnHTo} 
        onChange={(e) => setSnHTo(e.target.value)}
        placeholder="New recipient"
      />
      <input 
        value={valSnHKey} 
        onChange={(e) => setSnHKey(e.target.value)}
        placeholder="New claiming key"
      />
      <input 
        value={valSnHAmt} 
        onChange={(e) => setSnHAmt(e.target.value)}
        placeholder="Amount for new tx"
      />
      
      <button onClick={handleSeekAndHide} disabled={isPending}>
        Execute Seek & Hide
      </button>
    </div>
  );
}
```

## Development Mode Features

The hook includes development utilities that can be activated via localStorage:

```javascript
// Enable development mode in browser console
localStorage.setItem('devVals', '1');

// Now the hook will populate with default values for testing
```

## TypeScript Types

```typescript
interface UseMistResult {
  chamberAddress: `0x${string}`;
  loadingStatus: 'FINDING_TX' | 'READY';
  loadingMessage: string;

  valTo: string;
  setTo: (val: string) => void;
  valKey: string;
  setKey: (val: string) => void;

  txLeaves: bigint[];
  asset: Asset | undefined;
  setAsset: (asset: Asset | undefined) => void;
  setAssetAddr: (addr: string) => void;
  setAssetAmt: (amount: bigint) => void;
  
  contract: ChamberTypedContract;
  send: (args?: Call[] | undefined) => void;
  isPending: boolean;
  error: string | null;
  txError: Error | null;
  
  fetchAsset: () => Promise<Asset>;
  updateTxLeaves: () => Promise<bigint[]>;
  handleWithdraw: (asset: Asset, new_tx_amount?: string) => Promise<void>;

  valSnHTo: string;
  setSnHTo: (val: string) => void;
  valSnHKey: string;
  setSnHKey: (val: string) => void;
  valSnHAmt: string;
  setSnHAmt: (val: string) => void;
}
```

## Dependencies

- `@mistcash/config` - Configuration and ABIs
- `@mistcash/sdk` - Core SDK functions
- `@starknet-react/core` ^5.0.3 - React hooks for Starknet
- `@starknet-react/chains` ^5.0.3 - Chain configurations
- `starknet` ^9.2.1 - Starknet.js library
- `garaga` ^1.0.1 - ZK proof utilities

## Peer Dependencies

- `react` ^19.1.0

## License

MIT

## Repository

https://github.com/mistcash/sdk

## Issues

https://github.com/mistcash/sdk/issues
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
