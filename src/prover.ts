export type { FullProverAdapter } from './prover-core.js';
import { createLoader } from './prover-core.js';
import { browserInstantiate } from './prover-browser.js';

export const loadProver = createLoader(
  browserInstantiate('mist.wasm', 'loadProver', () => new URL('../wasm/mist.wasm', import.meta.url).href),
);

import type { SpendResult } from './proving.js';
import type { ProverInfo } from './prover-core.js';

export function createWorkerProver(opts?: {
  wasmUrl?: string | URL;
  /** Prove with mist-webgpu.wasm on the GPU (see `@mistcash/sdk/prover/webgpu`),
   * falling back to the CPU inside the worker when WebGPU is unusable there.
   * `wasmUrl` must then point at mist-webgpu.wasm. */
  webgpu?: boolean;
}): {
  hash2: (a: string, b: string) => Promise<string>;
  hash3: (a: string, b: string, c: string) => Promise<string>;
  spend: (json: string) => Promise<SpendResult>;
  decrypt: (ukx: string, commitments: string[]) => Promise<{ keyIndex: number; plaintext: string[] } | null>;
  /** Where the worker's proofs run, and why not on the GPU if it asked for one. */
  backend: () => Promise<ProverInfo>;
  /** Stop the worker and reject anything still in flight. Without this the
   * worker (and its 16MB wasm) stays alive for the page's lifetime. */
  terminate: () => void;
} {
  const worker = new Worker(new URL('./prover-worker.js', import.meta.url), { type: 'module' });
  const webgpu = opts?.webgpu === true;
  const resolvedWasmUrl = opts?.wasmUrl !== undefined
    ? String(opts.wasmUrl)
    : webgpu
      ? new URL('../wasm/mist-webgpu.wasm', import.meta.url).href
      : new URL('../wasm/mist.wasm', import.meta.url).href;
  let _id = 0;
  let terminated = false;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  worker.onmessage = (e: MessageEvent) => {
    const { id, result, error } = e.data as { id: number; result?: unknown; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error !== undefined) p.reject(new Error(error));
    else p.resolve(result);
  };

  function call<T>(method: string, args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // The worker is gone, so nothing would ever answer: reject, don't hang.
      if (terminated) return reject(new Error('prover worker terminated'));
      const id = _id++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, method, args, wasmUrl: resolvedWasmUrl, ...(webgpu ? { webgpu } : {}) });
    });
  }

  return {
    hash2: (a: string, b: string) => call<string>('hash2', [a, b]),
    hash3: (a: string, b: string, c: string) => call<string>('hash3', [a, b, c]),
    spend: (json: string) => call<SpendResult>('spend', [json]),
    decrypt: (ukx: string, commitments: string[]) =>
      call<{ keyIndex: number; plaintext: string[] } | null>('decrypt', [ukx, commitments]),
    backend: () => call<ProverInfo>('backend', []),
    terminate: () => {
      terminated = true;
      const err = new Error('prover worker terminated');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker.onmessage = null;
      worker.terminate();
    },
  };
}