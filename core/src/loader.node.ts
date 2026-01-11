// Node.js-specific WASM loader
import * as fs from 'fs';
import * as path from 'path';
import type { WasmInstance, WasmExports } from './types';

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
    // Load the Node.js version of wasm_exec.js
    const wasmExecPath = path.join(__dirname, '../../go-dist/wasm_exec_node.js');

    try {
      require(wasmExecPath);
    } catch (error) {
      // Fallback to regular wasm_exec.js
      try {
        const fallbackPath = path.join(__dirname, '../../go-dist/wasm_exec.js');
        require(fallbackPath);
      } catch (fallbackError) {
        throw new Error(`Failed to load wasm_exec.js. Please ensure it exists in go-dist/`);
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

    // Default path or custom path
    const defaultPath = path.join(__dirname, '../../go-dist/main.wasm');
    const finalPath = wasmPath || defaultPath;

    // Load WASM file
    let wasmBuffer: Buffer;
    try {
      wasmBuffer = fs.readFileSync(finalPath);
    } catch (error) {
      throw new Error(`Failed to read WASM file from ${finalPath}: ${error}`);
    }

    const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

    // Get the WebAssembly instance
    const wasmInst: WebAssembly.Instance = (result as any).instance || result;

    // Run the Go program in the background
    // Don't await this as it runs indefinitely
    go.run(wasmInst);

    // Wait a bit for Go to initialize and register functions
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Collect exported functions from global scope
    const exports: WasmExports = {};

    // Common Go WASM export patterns
    const exportedFuncs = ['prove', 'verify', 'generateKeys', 'createProver', 'createVerifier'];

    for (const funcName of exportedFuncs) {
      if (typeof (globalThis as any)[funcName] === 'function') {
        exports[funcName] = (globalThis as any)[funcName];
      }
    }

    wasmInstance = {
      instance: wasmInst,
      go,
      exports,
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
