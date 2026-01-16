import { initWasm } from './gnark';
import { initGaraga } from './garaga';

// Gnark WASM utils
export * from './gnark';
// Garaga utils
export * from './garaga';

// Utils
export * from './dev';
export * from './utils';

// Merkle tree
export * from './merkle';

export async function initCore(): Promise<void> {
  await initWasm();
  await initGaraga();
}