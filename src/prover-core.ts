import type { SpendResult } from './proving.js';

export type FullProverAdapter = {
  hash2: (a: string, b: string) => string | Promise<string>;
  hash3: (a: string, b: string, c: string) => string | Promise<string>;
  spend: (json: string) => SpendResult | Promise<SpendResult>;
  decrypt: (ukx: string, commitments: string[]) => { keyIndex: number; plaintext: string[] } | null | Promise<{ keyIndex: number; plaintext: string[] } | null>;
};

const REQUIRED_EXPORTS = ['spend', 'decrypt', 'hash2', 'hash3'] as const;

let _instance: Promise<FullProverAdapter> | undefined;

export type InstantiateFn = (
  go: { importObject: WebAssembly.Imports },
  source: string | URL | Response | ArrayBuffer | Uint8Array | undefined,
) => Promise<WebAssembly.Instance>;

export function createLoader(instantiate: InstantiateFn): (
  source?: string | URL | Response | Promise<Response> | ArrayBuffer | Uint8Array,
) => Promise<FullProverAdapter> {
  return (source?) => {
    if (_instance) return _instance;
    _instance = _load(source, instantiate).catch((e) => { _instance = undefined; throw e; });
    return _instance;
  };
}

async function _load(
  source: string | URL | Response | Promise<Response> | ArrayBuffer | Uint8Array | undefined,
  instantiate: InstantiateFn,
): Promise<FullProverAdapter> {
  // @ts-ignore — side-effect import registers globalThis.Go
  await import('./prover/wasm_exec.js');
  const GoCtor = (globalThis as Record<string, unknown>).Go as
    | (new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => void })
    | undefined;
  if (!GoCtor) throw new Error('Go runtime not found after loading wasm_exec.js');
  const go = new GoCtor();

  if (source && typeof source === 'object' && 'then' in source) source = await source;

  const instance = await instantiate(go, source);
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