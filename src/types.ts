/** Shared primitive types. No runtime imports. */

export type Hex = `0x${string}`;

/** A private note held off-chain. Only hashes ever leave the host. */
export interface Note {
  reserve: Hex;
  /** Identity that owns the note, e.g. `alice` or `alice (MIST)`. */
  id: string;
  blinding: string;
  amount: bigint;
  /** On-chain note hash (deposit result or proof output). */
  hash?: string;
  spent?: boolean;
  nullifier?: string;
  kind?: string;
}

/** Minimal receipt surfaced to callbacks. Adapters map their own receipt shape. */
export interface TxReceipt {
  transactionHash: Hex;
  gasUsed?: bigint;
  status?: string;
}

/** What `sendTransaction` resolves with. */
export interface SentTx {
  hash?: Hex;
  result?: unknown;
  receipt: TxReceipt;
}

/**
 * Transport injected by the host. The SDK imports viem for encoding and
 * keccak (identity, pq, client), but the ChainAdapter keeps it independent
 * of any one client library for transport, so tests can pass a mock and
 * apps can route MIST-owner spends through a relayer while public spends
 * go direct.
 *
 * Mirrors `open-agent-26/sdk` `ChainAdapter` (`getTxArray` + `sendTransaction`),
 * extended with the reads `playground/chain.js` needs (`readContract`,
 * `getEvents`) without pinning their client types.
 */
export interface ChainAdapter {
  /** Read-only contract call, e.g. `reserveConfigs`, `getTxArray`, `balanceOf`. */
  readContract: (address: Hex, functionName: string, args?: unknown[]) => Promise<unknown>;
  /**
   * Submit a transaction. The host owns signing, simulation, gas, and waiting —
   * set this callback to route private spends via a relayer.
   */
  sendTransaction: (tx: { to: Hex; data: Hex; value?: bigint }) => Promise<SentTx>;
  /** Contract events, e.g. `UserRegistered` leaves. Optional if unused. */
  getEvents?: (address: Hex, eventName: string, fromBlock?: bigint) => Promise<Array<{ args: Record<string, unknown> }>>;
}

/** Lifecycle hooks. All optional; set them to observe or fan out tx handling. */
export interface MistCallbacks {
  /** Human-readable stage updates (`Approving`, `Proving in your browser`, ...). */
  onProgress?: (stage: string) => void;
  /** Fires before each `sendTransaction`. Return `false` to veto. */
  onBeforeSend?: (tx: { to: Hex; data: Hex; functionName: string }) => boolean | void | Promise<boolean | void>;
  /** Fires after each confirmed write (`deposit`, `handleZkp`, `registerUser`, ...). */
  onTx?: (info: { functionName: string; receipt: TxReceipt }) => void;
  /** Fires around proving (`spend`, `decrypt`) with wall-clock timing. */
  onProof?: (info: { kind: 'spend'; secs: number }) => void;
}

/**
 * Pluggable persistence. Pass localStorage (browser), a Map, or a DB wrapper.
 * Mirrors `open-agent-26/sdk` `StorageAdapter`.
 */
export interface StorageAdapter {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
}
