// The browser loader (`src/prover.ts`): bytes, Response, streaming and fallback.
//
// This file had no tests at all. It is testable under `environment: 'node'`
// because Node 22 provides `fetch`, `Response` and `WebAssembly.instantiateStreaming`
// — the streaming branch is not browser-only. What a browser would add is
// transport realism (a real server negotiating the MIME type), not logic.
//
// Each test re-imports the module so it gets its own loader memo; the memo is
// per-loader and sticky, so a shared one would let an earlier test's instance
// answer for this one.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { installFakeGo, MINIMAL_WASM } from './helpers/fake-go.js';

type Loader = (source?: unknown) => Promise<{ hash2: (a: string, b: string) => string }>;

let restoreGo: (() => void) | undefined;

const wasmResponse = (contentType: string) =>
  new Response(new Uint8Array(MINIMAL_WASM), { headers: { 'Content-Type': contentType } });

async function freshLoader(): Promise<Loader> {
  vi.resetModules();
  // Install the fake *after* the reset: resetting re-evaluates wasm_exec.js,
  // which reassigns the real `globalThis.Go`.
  restoreGo = (await installFakeGo()).restore;
  const mod = await import('../src/prover.js') as { loadProver: Loader };
  return mod.loadProver;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreGo?.();
  restoreGo = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser loadProver', () => {
  it('instantiates from a Uint8Array', async () => {
    const load = await freshLoader();
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');

    await expect(load(new Uint8Array(MINIMAL_WASM))).resolves.toBeDefined();
    expect(instantiate).toHaveBeenCalled();
  });

  it('instantiates from an ArrayBuffer', async () => {
    const load = await freshLoader();
    const buffer = new Uint8Array(MINIMAL_WASM).buffer;

    await expect(load(buffer)).resolves.toBeDefined();
  });

  it('streams when the server sends application/wasm', async () => {
    const load = await freshLoader();
    const streaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
    const plain = vi.spyOn(WebAssembly, 'instantiate');
    vi.stubGlobal('fetch', vi.fn(async () => wasmResponse('application/wasm')));

    await load('/mist.wasm');

    expect(streaming).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it('falls back to a buffered instantiate on the wrong content type', async () => {
    const load = await freshLoader();
    const streaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
    const plain = vi.spyOn(WebAssembly, 'instantiate');
    vi.stubGlobal('fetch', vi.fn(async () => wasmResponse('text/plain')));

    await load('/mist.wasm');

    expect(streaming).not.toHaveBeenCalled();
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it('falls back when the runtime has no instantiateStreaming', async () => {
    const load = await freshLoader();
    const plain = vi.spyOn(WebAssembly, 'instantiate');
    // The guard is `typeof WebAssembly.instantiateStreaming === 'function'`,
    // so removing it must take the buffered path.
    vi.stubGlobal('WebAssembly', { ...WebAssembly, instantiateStreaming: undefined });

    vi.stubGlobal('fetch', vi.fn(async () => wasmResponse('application/wasm')));
    await load('/mist.wasm');

    expect(plain).toHaveBeenCalledTimes(1);
  });

  it('accepts a Response directly, without going through fetch', async () => {
    const load = await freshLoader();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await load(wasmResponse('application/wasm'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches an explicitly passed URL', async () => {
    const load = await freshLoader();
    const fetchMock = vi.fn(async () => wasmResponse('application/wasm'));
    vi.stubGlobal('fetch', fetchMock);

    await load('https://cdn.example/mist.wasm');

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/mist.wasm');
  });

  it('defaults to the wasm beside the package', async () => {
    const load = await freshLoader();
    const fetchMock = vi.fn(async (_url: string) => wasmResponse('application/wasm'));
    vi.stubGlobal('fetch', fetchMock);

    await load();

    // The default is resolved at runtime, which is exactly why a bundler never
    // emits it — see the "Loading mist.wasm" section of the README.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/wasm\/mist\.wasm$/);
  });

  it('reports a 404 with the status and a suggested fix', async () => {
    const load = await freshLoader();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' })));

    await expect(load('/missing.wasm')).rejects.toThrow(/HTTP 404/);
    await expect(load('/missing.wasm')).rejects.toThrow(/loadProver\(\)/);
  });

  it('reports a fetch failure and leaves the loader retryable', async () => {
    const load = await freshLoader();
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(load('/mist.wasm')).rejects.toThrow(/could not fetch mist\.wasm/);

    // The failed load must not have poisoned the memo.
    vi.stubGlobal('fetch', vi.fn(async () => wasmResponse('application/wasm')));
    await expect(load('/mist.wasm')).resolves.toBeDefined();
  });
});
