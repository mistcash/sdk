import { ProofResponse, WasmExports, WasmInstance } from './types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import './wasm_exec.js';
import WITNESS_JSON from './assignment.json';
import VK_JSON from './vk.json';
import PROOF_JSON from './proof.json';
import { generateClaimingKey, hash_with_asset, txHash } from '../utils';
export * from './types';

const FIXTURES: {
  WITNESS: Witness, VK: typeof VK_JSON, PROOF: typeof PROOF_JSON
} = {
  WITNESS: WITNESS_JSON,
  VK: VK_JSON,
  PROOF: PROOF_JSON
};
export { FIXTURES };

export type WitnessStrict = typeof WITNESS_JSON;
export type Witness = Omit<WitnessStrict, 'Nullifier' | 'OwnerKey' | 'AuthDone' | 'WithdrawTo' | 'Tx1Secret' | 'Tx1' | 'Tx1Amount' | 'Tx2Secret' | 'Tx2' | 'Payload'> & {
  // these can be computed from other inputs

  OwnerKey?: string;
  AuthDone?: string;
  WithdrawTo?: string;

  Nullifier?: string;

  Tx1Amount?: string;
  Tx1Secret?: string;
  Tx1?: string;

  Tx2Secret?: string;
  Tx2?: string;

  Payload?: string;
};

// Shared state management
let wasmInstance: WasmInstance | null = null;

/**
 * Collects exported functions from global scope
 */
function pluckExportFunctions(): WasmExports {
  const exports: any = {};

  // Common Go WASM export patterns
  const exportedFuncs = ['prove', 'hash2', 'hash3'];

  for (const funcName of exportedFuncs) {
    if (typeof (globalThis as any)[funcName] === 'function') {
      exports[funcName] = (globalThis as any)[funcName];
    } else {
      throw new Error(`WASM export function '${funcName}' not found in global scope`);
    }
  }

  return exports as WasmExports;
}

/**
 * Initializes the WASM module in Node.js environment
 */
export async function getWasmInstance(): Promise<WasmInstance> {
  if (wasmInstance) {
    return wasmInstance;
  }
  if (!globalThis.Go) {
    throw new Error('Go runtime not available after loading wasm_exec.js');
  }

  const go = new globalThis.Go();

  const wasmData = decodeMAIN_WASM();
  const wasmBuffer = wasmData.buffer as ArrayBuffer;
  const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

  // Run the Go program
  go.run(result.instance);

  wasmInstance = await new Promise<WasmInstance>((resolve) =>
    setTimeout(
      () =>
        resolve({
          instance: result.instance,
          go,
          exports: pluckExportFunctions(),
        }),
      200,
    ),
  );

  return wasmInstance;
}

/**
 * Initializes the WASM module in Node.js environment
 */
export async function initWasm(): Promise<WasmExports> {
  return (await getWasmInstance()).exports;
}

/**
 * Calls prove function from WASM module
 * @param witness Proof generation witness
 * @returns Proof response
 */
export async function prove_groth16(witness: Witness): Promise<ProofResponse> {
  let { prove } = await initWasm();

  witness.Tx1Amount = witness.Tx1Amount || '0';

  witness.Nullifier = txHash(
    (BigInt(witness.ClaimingKey) + 1n).toString(),
    witness.Owner,
    witness.TxAsset.Addr,
    witness.TxAsset.Amount,
  ).toString();

  if (!witness.Tx1Secret) {
    if (BigInt(witness.Tx1Amount) > 0n) {
      throw new Error('Tx1Secret must be provided when Tx1 amount is greater than zero');
    }
    // random secret if not set
    witness.Tx1Secret = hash2Sync(generateClaimingKey(), Date.now().toString());
  }

  witness.Tx1 = hash_with_asset(
    BigInt(witness.Tx1Secret).toString(),
    witness.TxAsset.Addr,
    witness.Tx1Amount,
  )

  const tx2Amt = BigInt(witness.TxAsset.Amount) - BigInt(witness.Tx1Amount) - BigInt(witness.Withdraw.Amount);

  if (!witness.Tx2Secret) {
    if (tx2Amt > 0n) {
      throw new Error('Tx2Secret must be provided when Tx2 amount is greater than zero');
    }
    // random secret if not set
    witness.Tx2Secret = hash2Sync(generateClaimingKey(), Date.now().toString());
  }

  witness.Tx2 = hash_with_asset(
    BigInt(witness.Tx2Secret).toString(),
    witness.TxAsset.Addr,
    tx2Amt.toString(),
  )


  witness = {
    OwnerKey: '0',
    AuthDone: '0',
    WithdrawTo: witness.Owner,
    Payload: '0',
    ...witness,
  };

  return await prove(JSON.stringify(witness));
}

/**
 * Calls 2-way hash function from WASM module
 * @param a
 * @param b
 * @returns {Promise<string>}
 */
export async function hash2(a: string, b: string): Promise<string> {
  let { hash2 } = await initWasm();
  return hash2(a, b);
}

/**
 * Calls 3-way hash function from WASM module
 * @param a
 * @param b
 * @param c
 * @returns {Promise<string>}
 */
export async function hash3(a: string, b: string, c: string): Promise<string> {
  let { hash3 } = await initWasm();
  return hash3(a, b, c);
}

/**
 * Calls 2-way hash function from WASM module
 * @param a
 * @param b
 * @returns {Promise<string>}
 */
export function hash2Sync(a: string, b: string): string {
  let { hash2 } = pluckExportFunctions();
  return hash2(a, b);
}

/**
 * Calls 3-way hash function from WASM module
 * @param a
 * @param b
 * @param c
 * @returns {Promise<string>}
 */
export function hash3Sync(a: string, b: string, c: string): string {
  let { hash3 } = pluckExportFunctions();
  return hash3(a, b, c);
}
