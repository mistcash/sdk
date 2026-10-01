import type { SpendResult } from './proving.js';

export type FullProverAdapter = {
  hash2: (a: string, b: string) => string | Promise<string>;
  hash3: (a: string, b: string, c: string) => string | Promise<string>;
  spend: (json: string) => SpendResult | Promise<SpendResult>;
  decrypt: (ukx: string, commitments: string[]) => { keyIndex: number; plaintext: string[] } | null | Promise<{ keyIndex: number; plaintext: string[] } | null>;
};

const REQUIRED_EXPORTS = ['spend', 'decrypt', 'hash2', 'hash3'] as const;

let _instance: Promise<FullProverAdapter> | undefined;

export async function loadProver(
  source?: string | URL | Response | Promise<Response> | ArrayBuffer | Uint8Array,
): Promise<FullProverAdapter> {
  if (_instance) return _instance;
  _instance = _load(source).catch((e) => { _instance = undefined; throw e; });
  return _instance;
}

async function _load(
  source: string | URL | Response | Promise<Response> | ArrayBuffer | Uint8Array | undefined,
): Promise<FullProverAdapter> {
  // @ts-ignore — side-effect import registers globalThis.Go
  await import('./prover/wasm_exec.js');
  const GoCtor = (globalThis as Record<string, unknown>).Go as
    | (new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => void })
    | undefined;
  if (!GoCtor) throw new Error('Go runtime not found after loading wasm_exec.js');
  const go = new GoCtor();

  if (source && typeof source === 'object' && 'then' in source) source = await source;

  let instance: WebAssembly.Instance;
  if (isNode()) {
    instance = await instantiateNode(go, source);
  } else {
    instance = await instantiateBrowser(go, source);
  }
  go.run(instance);

  const g = globalThis as Record<string, unknown>;
  for (const key of REQUIRED_EXPORTS) {
    if (typeof g[key] !== 'function') {
      throw new Error(`mist.wasm predates ${key}: rebuild with core-deploy scripts/build.sh`);
    }
  }
  return {
    hash2: g.hash2 as (a: string, b: string) => string,
    hash3: g.hash3 as (a: string, b: string, c: string) => string,
    spend: g.spend as (json: string) => SpendResult,
    decrypt: g.decrypt as (ukx: string, commitments: string[]) => { keyIndex: number; plaintext: string[] } | null,
  };
}

async function instantiateBrowser(
  go: { importObject: WebAssembly.Imports },
  source: string | URL | Response | ArrayBuffer | Uint8Array | undefined,
): Promise<WebAssembly.Instance> {
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
}

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

async function instantiateNode(
  go: { importObject: WebAssembly.Imports },
  source: string | URL | Response | ArrayBuffer | Uint8Array | undefined,
): Promise<WebAssembly.Instance> {
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes as BufferSource, go.importObject) as WebAssembly.WebAssemblyInstantiatedSource;
    return result.instance;
  }
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  let filePath: string;
  if (source === undefined) {
    filePath = fileURLToPath(new URL('../wasm/mist.wasm', import.meta.url));
  } else if (source instanceof URL || (typeof source === 'string' && source.startsWith('file:'))) {
    filePath = fileURLToPath(source instanceof URL ? source : new URL(source));
  } else if (typeof source === 'string') {
    filePath = source;
  } else {
    const buf = await source.arrayBuffer();
    const result = await WebAssembly.instantiate(buf, go.importObject) as WebAssembly.WebAssemblyInstantiatedSource;
    return result.instance;
  }
  const wasmBuffer = readFileSync(filePath);
  const result = await WebAssembly.instantiate(wasmBuffer, go.importObject) as WebAssembly.WebAssemblyInstantiatedSource;
  return result.instance;
}

function isNode(): boolean {
  return typeof process !== 'undefined' && typeof process.versions?.node === 'string';
}

/**
 * Create a prover that runs proving in a Web Worker, keeping the main
 * thread responsive. Spawns a worker using the Vite/webpack 5 pattern.
 *
 * Browser only. Returns the same FullProverAdapter shape but all calls
 * are async (proxied over postMessage).
 */
export function createWorkerProver(opts?: { wasmUrl?: string }): FullProverAdapter {
  const worker = new Worker(new URL('./prover-worker.js', import.meta.url), { type: 'module' });
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
      worker.postMessage({ id, method, args, wasmUrl: opts?.wasmUrl });
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