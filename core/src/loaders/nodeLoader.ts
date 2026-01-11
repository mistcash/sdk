// Node.js-specific WASM loader
import * as path from 'path';
import type { WasmInstance, WasmExports } from '../types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import { pluckExportFunctions } from './conf';

// Declare global Go interface
declare global {
  var Go: any;
}

let wasmInstance: WasmInstance | null = null;
let initPromise: Promise<WasmInstance> | null = null;

/**
 * Loads the Go WASM exec JavaScript glue code for Node.js
 */
function loadWasmExec(): void {
  if (!globalThis.Go) {
    try {
      // Load the copied wasm_exec.js from package
      require('./wasm_exec.js');
    } catch (error) {
      // Fallback to go-dist if wasm_exec.js not found
      try {
        const fallbackPath = path.join(__dirname, '../../go-dist/wasm_exec.js');
        require(fallbackPath);
      } catch (fallbackError) {
        throw new Error(
          `Failed to load wasm_exec.js. Please run 'pnpm embed-wasm' to generate required files.`,
        );
      }
    }

    if (!globalThis.Go) {
      throw new Error('Go runtime not available after loading wasm_exec.js');
    }
  }
}

/**
 * Initializes the WASM module in Node.js environment
 */
export async function initWasm(wasmPath?: string): Promise<WasmInstance> {
  if (wasmInstance) {
    return wasmInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async (): Promise<WasmInstance> => {
    loadWasmExec();

    const go = new globalThis.Go();

    // Use embedded WASM by default, or load from custom path if provided
    let wasmBuffer: Uint8Array | Buffer;

    if (wasmPath) {
      // Load from custom path if provided (for backward compatibility)
      const fs = require('fs');
      try {
        wasmBuffer = fs.readFileSync(wasmPath);
      } catch (error) {
        throw new Error(`Failed to read WASM file from ${wasmPath}: ${error}`);
      }
    } else {
      // Use embedded WASM (default)
      wasmBuffer = decodeMAIN_WASM();
    }

    const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

    // Get the WebAssembly instance
    const wasmInst: WebAssembly.Instance = (result as any).instance || result;

    // Run the Go program in the background
    // Don't await this as it runs indefinitely
    go.run(wasmInst);

    await new Promise((resolve) => setTimeout(resolve, 250));

    wasmInstance = {
      instance: wasmInst,
      go,
      exports: pluckExportFunctions(),
    };

    return wasmInstance;
  })();

  return initPromise;
}

/**
 * Gets the current WASM instance
 */
export function getWasmInstance(): WasmInstance | null {
  return wasmInstance;
}

/**
 * Resets the WASM instance (useful for testing)
 */
export function resetWasm(): void {
  wasmInstance = null;
  initPromise = null;
}
