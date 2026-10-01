export type { FullProverAdapter } from './prover-core.js';
import { createLoader } from './prover-core.js';

export const loadProver = createLoader(async (go, source) => {
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes as BufferSource, go.importObject) as WebAssembly.WebAssemblyInstantiatedSource;
    return result.instance;
  }
  if (source instanceof Response) {
    return instantiateFromResponse(source, go);
  }
  const url = source !== undefined ? String(source) : new URL('../wasm/mist.wasm', import.meta.url).href;
  const res = await fetch(url);
  return instantiateFromResponse(res, go);
});

async function instantiateFromResponse(
  res: Response,
  go: { importObject: WebAssembly.Imports },
): Promise<WebAssembly.Instance> {
  if (typeof WebAssembly.instantiateStreaming === 'function' &&
      res.headers?.get('Content-Type') === 'application/wasm') {
    const result = await WebAssembly.instantiateStreaming(res, go.importObject);
    return result.instance;
  }
  const buf = await res.arrayBuffer();
  const result = await WebAssembly.instantiate(buf, go.importObject);
  return result.instance;
}

import type { SpendResult } from './proving.js';

export function createWorkerProver(opts?: { wasmUrl?: string | URL }): {
  hash2: (a: string, b: string) => Promise<string>;
  hash3: (a: string, b: string, c: string) => Promise<string>;
  spend: (json: string) => Promise<SpendResult>;
  decrypt: (ukx: string, commitments: string[]) => Promise<{ keyIndex: number; plaintext: string[] } | null>;
} {
  const worker = new Worker(new URL('./prover-worker.js', import.meta.url), { type: 'module' });
  const resolvedWasmUrl = opts?.wasmUrl !== undefined
    ? String(opts.wasmUrl)
    : new URL('../wasm/mist.wasm', import.meta.url).href;
  let _id = 0;
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
      const id = _id++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, method, args, wasmUrl: resolvedWasmUrl });
    });
  }

  return {
    hash2: (a: string, b: string) => call<string>('hash2', [a, b]),
    hash3: (a: string, b: string, c: string) => call<string>('hash3', [a, b, c]),
    spend: (json: string) => call<SpendResult>('spend', [json]),
    decrypt: (ukx: string, commitments: string[]) =>
      call<{ keyIndex: number; plaintext: string[] } | null>('decrypt', [ukx, commitments]),
  };
}