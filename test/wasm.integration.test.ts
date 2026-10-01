import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { buildSpendRequest, serializeSpendRequest, type SpendResult } from '../src/proving.js';

const WASM_DIR = process.env.MIST_WASM_DIR ?? resolve(import.meta.dirname, '../.fixtures');
const WASM_EXEC = resolve(WASM_DIR, 'wasm_exec.js');
const WASM_FILE = resolve(WASM_DIR, 'mist.wasm');

const hasWasm = existsSync(WASM_EXEC) && existsSync(WASM_FILE);

type SpendFn = (json: string) => SpendResult;
type HashFn = (a: string, b: string) => string;
type Hash3Fn = (a: string, b: string, c: string) => string;
type DecryptFn = (ukx: string, commitments: string[]) => { keyIndex: number; plaintext: string[] } | null;

let spend: SpendFn | undefined;
let hash2: HashFn | undefined;
let hash3: Hash3Fn | undefined;
let decrypt: DecryptFn | undefined;

beforeAll(async () => {
  if (!hasWasm) return;
  createRequire(import.meta.url)(WASM_EXEC);
  const Go = (globalThis as Record<string, unknown>).Go as new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => void };
  const go = new Go();
  const wasmBuffer = readFileSync(WASM_FILE);
  const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);
  go.run(instance);
  const g = globalThis as Record<string, unknown>;
  spend = g.spend as SpendFn;
  hash2 = g.hash2 as HashFn;
  hash3 = g.hash3 as Hash3Fn;
  decrypt = g.decrypt as DecryptFn;
});

describe('wasm integration', () => {
  it.skipIf(!hasWasm)('hash2 returns a decimal string', () => {
    if (!hash2) throw new Error('wasm not loaded');
    const result = hash2('1', '2');
    expect(result).toMatch(/^\d+$/);
  });

  it.skipIf(!hasWasm)('spend reaches the circuit (not a parse error)', () => {
    if (!spend || !hash2) throw new Error('wasm not loaded');
    const req = buildSpendRequest({
      chainId: '31337',
      chamber: '0x1111111111111111111111111111111111111111' as const,
      reserve: '0x3333333333333333333333333333333333333333' as const,
      token: '0x4444444444444444444444444444444444444444' as const,
      reserveConfig: hash2('789', '987'),
      owner: '100',
      ownerSecret: '12345',
      userKeyExchange: '0',
      keyIndex: 0,
      inputs: [{ Blinding: '42', Amount: 1000n }],
      outputs: [
        { id: null, Owner: '0', Blinding: '1', Amount: 500n },
        { id: null, Owner: '0', Blinding: '2', Amount: 500n },
      ],
      withdraw: 0n,
      withdrawTo: '0',
      txLeaves: ['1', '0'],
      stateLeaves: ['1'],
      userLeaves: [],
    });
    const res = spend(serializeSpendRequest(req));
    expect(res.status).toBe('error');
    expect((res as { error?: string }).error).not.toMatch(/Failed to parse|cannot unmarshal/);
  });

  it.skipIf(!hasWasm)('mutation: string amount fails with cannot unmarshal', () => {
    if (!spend || !hash2) throw new Error('wasm not loaded');
    const req = buildSpendRequest({
      chainId: '31337',
      chamber: '0x1111111111111111111111111111111111111111' as const,
      reserve: '0x3333333333333333333333333333333333333333' as const,
      token: '0x4444444444444444444444444444444444444444' as const,
      reserveConfig: hash2('789', '987'),
      owner: '100',
      ownerSecret: '12345',
      userKeyExchange: '0',
      keyIndex: 0,
      inputs: [{ Blinding: '42', Amount: 1000n }],
      outputs: [
        { id: null, Owner: '0', Blinding: '1', Amount: 500n },
        { id: null, Owner: '0', Blinding: '2', Amount: 500n },
      ],
      withdraw: 0n,
      withdrawTo: '0',
      txLeaves: ['1', '0'],
      stateLeaves: ['1'],
      userLeaves: [],
    });
    const mutated = serializeSpendRequest(req).replace('"Amount":1000', '"Amount":"1000"');
    const res = spend(mutated);
    expect(res.status).toBe('error');
    expect((res as { error?: string }).error).toMatch(/cannot unmarshal/);
  });

  it.skipIf(!hasWasm)('decrypt returns null for short commitments without crashing', () => {
    if (!decrypt || !hash2) throw new Error('wasm not loaded');
    expect(decrypt('5', ['1'])).toBeNull();
    expect(decrypt('5', ['1', '2'])).toBeNull();
    expect(decrypt('5', [])).toBeNull();
    expect(hash2('1', '2')).toMatch(/^\d+$/);
  });

  it.skipIf(hasWasm)('skips when wasm files are absent', () => {
    console.log(`Skipping wasm test: ${WASM_EXEC} or ${WASM_FILE} not found`);
  });
});