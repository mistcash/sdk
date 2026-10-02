import { describe, expect, it } from 'vitest';
import { loadProver } from '../src/prover.node.js';
import { WASM_FILE, hasWasm, missingWasm, SYNC_HINT } from './helpers/artifacts.js';

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