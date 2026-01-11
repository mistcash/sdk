import { WasmExports } from '../types';

export function pluckExportFunctions(): WasmExports {
  // Collect exported functions from global scope
  const exports: WasmExports = {};

  // Common Go WASM export patterns
  const exportedFuncs = ['prove', 'hash2', 'hash3', 'createProver', 'createVerifier'];

  for (const funcName of exportedFuncs) {
    if (typeof (globalThis as any)[funcName] === 'function') {
      exports[funcName] = (globalThis as any)[funcName];
    }
  }

  return exports;
}
