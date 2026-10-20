// The real mist-webgpu.wasm, loaded through the real `loadWebGPUProver`.
//
// Node has no WebGPU, so this is the fallback path end to end: no bridge is
// installed, the loader reports the CPU, and the wasm's promise-returning
// exports still prove. The GPU path itself needs a browser with a GPU (see
// README, "WebGPU prover").
//
// Its own file because both wasms install the same globals; vitest isolates
// test files, so this one cannot clobber wasm.integration.test.ts's mist.wasm.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSpendRequest, serializeSpendRequest, type SpendResult } from '../src/proving.js';
import type { WebGPUProver } from '../src/prover.webgpu.js';
import { WEBGPU_WASM_FILE, hasWebGPUWasm, SYNC_HINT } from './helpers/artifacts.js';

let prover: WebGPUProver | undefined;

beforeAll(async () => {
  if (!hasWebGPUWasm) return;
  const { loadWebGPUProver } = await import('../src/prover.webgpu.js');
  prover = await loadWebGPUProver(new Uint8Array(readFileSync(WEBGPU_WASM_FILE)));
});

describe('mist-webgpu.wasm integration', () => {
  it.skipIf(!hasWebGPUWasm)('falls back to the CPU without WebGPU and says why', () => {
    expect(prover?.backend).toBe('cpu');
    expect(prover?.fallbackReason).toBe('WebGPU is not available');
  });

  it.skipIf(!hasWebGPUWasm)('hashes like mist.wasm', async () => {
    if (!prover) throw new Error('wasm not loaded');
    // Poseidon2 H2(1, 2) and H3(1, 2, 3), as mist.wasm computes them.
    expect(await prover.hash2('1', '2'))
      .toBe('1313337560616139085277676701856612540166622156368305732529371734734451176752');
    expect(await prover.hash3('1', '2', '3'))
      .toBe('21494926133697984799302429478475428578106379390114807142496044705635584111635');
  });

  it.skipIf(!hasWebGPUWasm)('spend returns a promise that reaches the circuit', async () => {
    if (!prover) throw new Error('wasm not loaded');
    const reserveConfig = await prover.hash2('789', '987');
    const req = buildSpendRequest({
      chainId: '31337',
      chamber: '0x1111111111111111111111111111111111111111' as const,
      reserve: '0x3333333333333333333333333333333333333333' as const,
      token: '0x4444444444444444444444444444444444444444' as const,
      reserveConfig,
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
    // The WebGPU build proves on a goroutine, so spend hands back a Promise
    // even on the CPU path.
    const pending = prover.spend(serializeSpendRequest(req));
    expect(pending).toBeInstanceOf(Promise);
    const res = await pending as SpendResult;
    expect(res.status).toBe('error');
    expect((res as { error?: string }).error).not.toMatch(/Failed to parse|cannot unmarshal/);
  });

  it.skipIf(hasWebGPUWasm)('skips when mist-webgpu.wasm is absent', () => {
    console.log(`Skipping mist-webgpu.wasm test: ${WEBGPU_WASM_FILE} not found. ${SYNC_HINT}`);
  });
});
