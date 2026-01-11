import { WasmExports, WasmInstance } from '../types';
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
