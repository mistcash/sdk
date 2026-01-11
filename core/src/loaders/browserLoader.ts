// Browser-specific WASM loader
import type { WasmInstance } from '../types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import { pluckExportFunctions } from './conf';

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
  if (!globalThis.Go) {
    try {
      // Import the copied wasm_exec.js from package
      await import('./wasm_exec.js');
    } catch (error) {
      // Fallback: try loading from public path (for browser environments)
      if (typeof window !== 'undefined') {
        const script = document.createElement('script');
        script.src = '/wasm_exec.js';

        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () =>
            reject(
              new Error(
                'Failed to load wasm_exec.js. Please ensure it is available or run pnpm embed-wasm.',
              ),
            );
          document.head.appendChild(script);
        });
      } else {
        throw new Error('Failed to load wasm_exec.js');
      }
    }

    if (!globalThis.Go) {
      throw new Error('Go runtime not available after loading wasm_exec.js');
    }
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

    // Use embedded WASM by default, or fetch from custom path if provided
    let wasmBuffer: ArrayBuffer;

    if (wasmPath) {
      // Fetch from custom path if provided (for backward compatibility)
      try {
        const response = await fetch(wasmPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM: ${response.statusText}`);
        }
        wasmBuffer = await response.arrayBuffer();
      } catch (error) {
        throw new Error(`Failed to load WASM file from ${wasmPath}: ${error}`);
      }
    } else {
      // Use embedded WASM (default)
      const wasmData = decodeMAIN_WASM();
      wasmBuffer = wasmData.buffer as ArrayBuffer;
    }

    const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

    // Run the Go program
    go.run(result.instance);

    await new Promise((resolve) => setTimeout(resolve, 250));

    wasmInstance = {
      instance: result.instance,
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
