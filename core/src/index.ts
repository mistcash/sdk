import { initWasm, getWasmInstance } from './goWasm/wasmLoader';

// Re-export types
export * from './dev';
export * from './utils';
export * from './types';

export { getWasmInstance, initWasm };

export async function prove(witness: string): Promise<string> {
  let { prove } = await initWasm();
  return await prove(witness);
}

export async function hash2(left: string, right: string): Promise<string> {
  let { hash2 } = await initWasm();
  return await hash2(left, right);
}

export async function hash3(a: string, b: string, c: string): Promise<string> {
  let { hash3 } = await initWasm();
  return await hash3(a, b, c);
}
