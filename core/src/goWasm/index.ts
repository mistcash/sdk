import { ProofResponse, WasmExports, WasmInstance, Witness } from '../types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import './wasm_exec.js';

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
export async function prove(witness: Witness): Promise<ProofResponse> {
  let { prove } = await initWasm();
  return await prove(JSON.stringify(witness));
}

/**
 * Calls 2-way hash function from WASM module
 * @param a
 * @param b
 * @returns 
 */
export async function hash2(a: string, b: string): Promise<string> {
  let { hash2 } = await initWasm();
  return await hash2(a, b);
}

/**
 * Calls 3-way hash function from WASM module
 * @param a
 * @param b
 * @param c
 * @returns 
 */
export async function hash3(a: string, b: string, c: string): Promise<string> {
  let { hash3 } = await initWasm();
  return await hash3(a, b, c);
}
