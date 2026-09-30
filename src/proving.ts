// Prover adapter extracted from `playground/app.js` (`spendNotes`) and
// `playground/chain.js` (wasm bootstrapping).
// The SDK never bundles `mist.wasm` (~12-16MB): hosts inject `spend`/`decrypt`
// from their own loader (`core-deploy/js` `createMist`, a browser fetcher, or
// a test mock) via `ProverAdapter`.

import type { Hex } from './types.js';

export interface SpendInNote {
  Blinding: string;
  Amount: string;
}

export interface SpendOutNote {
  id: string | null;
  Owner: string;
  Blinding: string;
  Amount: number;
}

/** The JSON the Go prover consumes (`app.js` `req`). */
export interface SpendRequest {
  ChainID: string;
  Chamber: Hex;
  Reserve: Hex;
  Token: Hex;
  ReserveConfig: string;
  Owner: string;
  OwnerSecret: string;
  UserKeyExchange: string;
  KeyIndex: number;
  In: SpendInNote[];
  Out: SpendOutNote[];
  Withdraw: number;
  WithdrawTo: Hex | '0';
  TxLeaves: string[];
  StateLeaves: string[];
  UserLeaves: string[];
}

export interface SpendSuccess {
  status: 'success';
  proof: string[];
  publicInputs: string[];
  ciphertext?: string[];
}

export interface SpendFailure {
  status: 'error' | string;
  error?: string;
}

export type SpendResult = SpendSuccess | SpendFailure;

/** Injected prover surface. `hash2` may be sync wasm or a pure fallback. */
export interface ProverAdapter {
  hash2: (a: string, b: string) => string;
  spend: (json: string) => SpendResult | Promise<SpendResult>;
  decrypt?: (ukx: string, token: Hex, ciphertext: string[]) => unknown;
}

/** Build the prover request; mirrors `app.js spendNotes` field order. */
export function buildSpendRequest(opts: {
  chainId: string | number;
  chamber: Hex;
  reserve: Hex;
  token: Hex;
  reserveConfig: string;
  owner: string;
  ownerSecret: string;
  userKeyExchange: string;
  keyIndex?: number;
  inputs: SpendInNote[];
  outputs: SpendOutNote[];
  withdraw: number;
  withdrawTo: Hex | '0';
  txLeaves: string[];
  stateLeaves: string[];
  userLeaves: string[];
}): SpendRequest {
  return {
    ChainID: String(opts.chainId),
    Chamber: opts.chamber,
    Reserve: opts.reserve,
    Token: opts.token,
    ReserveConfig: opts.reserveConfig,
    Owner: opts.owner,
    OwnerSecret: opts.ownerSecret,
    UserKeyExchange: opts.userKeyExchange,
    KeyIndex: opts.keyIndex ?? Math.floor(Math.random() * 256),
    In: [...opts.inputs, { Blinding: '0', Amount: '0' }].slice(0, 2),
    Out: opts.outputs,
    Withdraw: opts.withdraw,
    WithdrawTo: opts.withdrawTo,
    TxLeaves: opts.txLeaves,
    StateLeaves: opts.stateLeaves,
    UserLeaves: opts.userLeaves,
  };
}

/** Run the prover and normalize failures to thrown Errors with timing. */
export async function proveSpend(
  prover: ProverAdapter,
  req: SpendRequest,
): Promise<{ res: SpendSuccess; secs: number }> {
  const t = Date.now();
  const res = await prover.spend(JSON.stringify(req));
  if (res.status !== 'success') {
    throw new Error((res as SpendFailure).error ?? 'Prover rejected the spend');
  }
  return { res: res as SpendSuccess, secs: (Date.now() - t) / 1000 };
}

/** Fold an auditor ciphertext to its commitment (for `openPayload` checks). */
export function foldCiphertext(hash2: (a: string, b: string) => string, ciphertext: string[]): string {
  return ciphertext.slice(1).reduce((acc, c) => hash2(acc, c), ciphertext[0]);
}
