import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadProver } from '../src/prover.js';

const WASM_DIR = process.env.MIST_WASM_DIR ?? resolve(import.meta.dirname, '../.fixtures');
const WASM_FILE = resolve(WASM_DIR, 'mist.wasm');
const hasWasm = existsSync(WASM_FILE);

describe('loadProver', () => {
  it.skipIf(!hasWasm)('hash2 returns a decimal string', async () => {
    const prover = await loadProver(WASM_FILE);
    const result = prover.hash2('1', '2');
    expect(result).toMatch(/^\d+$/);
  });

  it.skipIf(!hasWasm)('two calls return the same memoized instance', async () => {
    const a = await loadProver();
    const b = await loadProver();
    expect(a).toBe(b);
  });
});