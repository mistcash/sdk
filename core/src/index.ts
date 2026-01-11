import { initWasm } from './gnark';
import { initGaraga } from './garaga';

// Gnark WASM utils
export * from './gnark';
// Garaga utils
export * from './garaga';

// Dev utils
export * from './dev';
export * from './utils';
export * from './types';

export async function initCore(): Promise<void> {
  await initWasm();
  await initGaraga();
}