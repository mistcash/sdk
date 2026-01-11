/**
 * Asset representation
 */
export interface Asset {
  amount: bigint;
  addr: string;
}

/**
 * WASM instance with Go runtime
 */
export interface WasmInstance {
  instance: WebAssembly.Instance;
  go: any;
  exports: WasmExports;
}

/**
 * Exported functions from WASM
 */
export interface WasmExports {
  [key: string]: any;
}
