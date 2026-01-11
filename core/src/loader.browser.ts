// Browser-specific WASM loader
import type { WasmInstance, WasmExports } from './types';

// Declare global Go interface
declare global {
  interface Window {
    Go?: any;
  }
  var Go: any;
}

let wasmInstance: WasmInstance | null = null;
let initPromise: Promise<WasmInstance> | null = null;

/**
 * Loads the Go WASM exec JavaScript glue code
 */
async function loadWasmExec(): Promise<void> {
  if (typeof window !== 'undefined' && !window.Go) {
    // For browser environments, wasm_exec.js should be loaded separately
    // Either via script tag or bundled
    const script = document.createElement('script');
    script.src = '/wasm_exec.js';

    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load wasm_exec.js'));
      document.head.appendChild(script);
    });
  }
}

/**
 * Initializes the WASM module in browser environment
 */
export async function initWasm(wasmPath?: string): Promise<WasmInstance> {
  if (wasmInstance) {
    return wasmInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await loadWasmExec();

    if (!globalThis.Go) {
      throw new Error('Go WASM runtime not available');
    }

    const go = new globalThis.Go();

    // Default path or custom path
    const path = wasmPath || '/main.wasm';

    let wasmBuffer: ArrayBuffer;

    // Try to load using fetch
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.statusText}`);
      }
      wasmBuffer = await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to load WASM file from ${path}: ${error}`);
    }

    const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

    // Run the Go program
    go.run(result.instance);

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
      instance: result.instance,
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
