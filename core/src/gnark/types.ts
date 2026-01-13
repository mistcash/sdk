/**
 * Asset representation
 */
export interface Asset {
  amount: string | bigint;
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

export interface Point {
  X: string;
  Y: string;
}

export interface G2Point {
  X: {
    A0: string;
    A1: string;
  };
  Y: {
    A0: string;
    A1: string;
  };
}

export interface Proof {
  Ar: Point;
  Krs: Point;
  Bs: G2Point;
  Commitments: string[];
  CommitmentPok: Point;
}

export interface ErrorResponse {
  status: 'error';
  error: string;
  message: string;
}

export interface SuccessResponse {
  status: 'success';
  proof: Proof;
  publicInputs: (string | number)[];
}

export type ProofResponse = ErrorResponse | SuccessResponse;

/**
 * Exported functions from WASM
 */
export interface WasmExports {
  prove: (witness: string) => Promise<ProofResponse>;
  hash2: (left: string, right: string) => Promise<string>;
  hash3: (a: string, b: string, c: string) => Promise<string>;
}
