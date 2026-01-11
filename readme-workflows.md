# MIST.cash workflows

### ⚠️ This section is under review, might need updates and is provided as-is.

## 1. Submit Transaction Flow

```mermaid
flowchart TD
    A[Frontend: Collect User Input] --> A1[Token Selection]
    A --> A2[Recipient Address]
    A --> A3[Amount]
    A --> A4[Generate Claiming Key]

    A4 --> B[Generate Transaction Secret]
    B --> B1["txSecret(claimingKey, recipient)"]

    B1 --> C[Prepare Transaction Calls]
    C --> C1["ERC20.approve(chamberAddress, amount)"]
    C --> C2["Chamber.deposit(txSecret, asset)"]

    C2 --> D[Send Multi-Call Transaction]
    D --> E[Transaction Confirmed]
    E --> F[Share Claiming Key with Recipient]

    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
```

### Code Example

```typescript
import { useMist } from '@mistcash/react';
import { txSecret } from '@mistcash/crypto';
import { uint256 } from 'starknet';

// In your React component
async function submitTransaction(
  claimingKey: string,
  recipient: string,
  tokenAddr: string,
  amount: bigint,
) {
  // Generate transaction secret
  const txSecret = await txSecret(claimingKey, recipient);
  const amount = uint256.bnToUint256(amount_bi);
  erc20.address = selectedToken;
  const asset = {
    amount,
    addr: selectedToken,
  };

  // Prepare calls
  const calls = [
    erc20Contract.populate('approve', [chamberAddress, uint256.bnToUint256(amount)]),
    contract.populate('deposit', [uint256.bnToUint256(txSecret), asset]),
  ];

  // Send transaction
  send(calls);
}
```

---

## 2. Verify Transaction Flow

```mermaid
flowchart TD
    A[Backend: Receive Claiming Key + Recipient] --> B[Generate Transaction Secret]
    B --> B1["txSecret(claimingKey, recipient)"]

    B1 --> C[Query Chamber Contract]
    C --> C1["contract.read_tx(txSecret)"]

    C1 --> D{Transaction Exists?}
    D -->|Yes| E[Return Asset Details]
    D -->|No| F[Return Not Found]

    E --> E1[Asset Amount]
    E --> E2[Asset Token Address]
    E --> E3[Transaction Valid ✓]

    F --> F1[Transaction Not Found ✗]

    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#e8f5e8
    style F fill:#ffebee
```

### Code Example

```typescript
import { getChamber, fetchTxAssets } from '@mistcash/sdk';
import { txSecret } from '@mistcash/crypto';

// Backend verification function
async function verifyTransaction(claimingKey: string, recipient: string) {
  const contract = getChamber(provider);

  try {
    // Method 1: Direct read (faster)
    const secret = await txSecret(claimingKey, recipient);
    const asset = await contract.read_tx(secret);

    if (asset.amount > 0) {
      return {
        found: true,
        amount: asset.amount,
        tokenAddress: asset.addr,
      };
    }

    return { found: false };
  } catch (error) {
    // Method 2: Fetch from transaction array (more reliable)
    const assets = await fetchTxAssets(contract, claimingKey, recipient);

    return assets.length > 0
      ? {
          found: true,
          amount: assets[0].amount,
          tokenAddress: assets[0].addr,
        }
      : { found: false };
  }
}
```
