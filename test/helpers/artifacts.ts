// Locate the vendored prover artifacts for the real-wasm tests.
//
// `npm run sync:wasm` writes the pair to two places, because that is what the
// published package needs: `wasm/mist.wasm` (a real asset, so it streams and
// caches on its own) and `src/prover/wasm_exec.js` (the Go runtime, loaded
// lazily by the prover loader). The tests read those same two paths, so
// `npm run sync:wasm && npm test` runs the real thing.
//
// MIST_WASM_DIR overrides both with a single directory, for when the pair
// comes from somewhere else (an older checkout, a CI cache).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const OVERRIDE = process.env.MIST_WASM_DIR;

export const WASM_FILE = OVERRIDE
  ? resolve(OVERRIDE, 'mist.wasm')
  : resolve(ROOT, 'wasm/mist.wasm');

export const WASM_EXEC = OVERRIDE
  ? resolve(OVERRIDE, 'wasm_exec.js')
  : resolve(ROOT, 'src/prover/wasm_exec.js');

export const hasWasm = existsSync(WASM_FILE) && existsSync(WASM_EXEC);

// Name only the artifacts that are actually absent: wasm_exec.js is committed,
// so it is usually present even before a sync.
export const missingWasm = [
  ...(!existsSync(WASM_FILE) ? [`mist.wasm not found at ${WASM_FILE}`] : []),
  ...(!existsSync(WASM_EXEC) ? [`wasm_exec.js not found at ${WASM_EXEC}`] : []),
].join('; ');

export const SYNC_HINT =
  'vendor the prover artifacts with: MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm';
