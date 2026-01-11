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
  prove: (witness: string) => Promise<string>;
  hash2: (left: string, right: string) => Promise<string>;
  hash3: (a: string, b: string, c: string) => Promise<string>;
}
