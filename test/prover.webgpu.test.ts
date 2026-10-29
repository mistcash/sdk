// The WebGPU loader (`src/prover.webgpu.ts`): bridge install, GPU upload, and
// every way of ending up on the CPU instead.
//
// The vendored gnark runtime needs a real GPU, so its three entry points are
// stubbed; what is under test is the order the loader drives them in and what
// it reports. The Go side is the fake from helpers/fake-go, with a
// `prepareProver` export standing in for mist-webgpu.wasm's. The real wasm's
// CPU fallback is covered in wasm.webgpu.integration.test.ts.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { installFakeGo, MINIMAL_WASM } from './helpers/fake-go.js';

const gpu = vi.hoisted(() => ({
  createCurveGPUContext: vi.fn(async () => ({ id: 'context' })),
  createBN254: vi.fn(async () => ({ fr: 'fr', g1msm: 'g1msm', g2msm: 'g2msm', groth16: 'groth16', ntt: 'ntt' })),
  installGroth16WebGPUBridge: vi.fn(),
}));
vi.mock('../src/prover/gnark-webgpu/context.js', () => ({ createCurveGPUContext: gpu.createCurveGPUContext }));
vi.mock('../src/prover/gnark-webgpu/curves.js', () => ({ createBN254: gpu.createBN254 }));
vi.mock('../src/prover/gnark-webgpu/bridge.js', () => ({ installGroth16WebGPUBridge: gpu.installGroth16WebGPUBridge }));
vi.mock('../src/prover/gnark-webgpu/shader_bundle.generated.js', () => ({}));

type Loaded = { backend: string; fallbackReason?: string; hash2: (a: string, b: string) => unknown };
type Loader = (source?: unknown) => Promise<Loaded>;

let restoreGo: (() => void) | undefined;

async function freshLoader(prepareProver?: () => Promise<{ backend: string; error?: string }>): Promise<Loader> {
  vi.resetModules();
  restoreGo = (await installFakeGo({ extras: prepareProver ? { prepareProver } : {} })).restore;
  const mod = await import('../src/prover.webgpu.js') as { loadWebGPUProver: Loader };
  return mod.loadWebGPUProver;
}

const withGPU = () => vi.stubGlobal('navigator', { gpu: {} });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  restoreGo?.();
  restoreGo = undefined;
  vi.unstubAllGlobals();
});

describe('loadWebGPUProver', () => {
  it('installs the bridge, uploads the key, and reports webgpu', async () => {
    withGPU();
    const prepare = vi.fn(async () => ({ backend: 'webgpu' }));
    const load = await freshLoader(prepare);

    const prover = await load(new Uint8Array(MINIMAL_WASM));

    expect(prover.backend).toBe('webgpu');
    expect(prover.fallbackReason).toBeUndefined();
    expect(prover.hash2('1', '2')).toBe('1');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(gpu.installGroth16WebGPUBridge).toHaveBeenCalledWith({
      context: { id: 'context' },
      curve: 'bn254',
      fr: 'fr',
      g1msm: 'g1msm',
      g2msm: 'g2msm',
      quotient: 'groth16',
    });
    // The bridge must be on globalThis before Go looks it up in Prepare.
    expect(gpu.installGroth16WebGPUBridge.mock.invocationCallOrder[0])
      .toBeLessThan(prepare.mock.invocationCallOrder[0]);
  });

  it('falls back to the CPU without navigator.gpu, and never touches the GPU runtime', async () => {
    const prepare = vi.fn(async () => ({ backend: 'cpu', error: 'bridge not found' }));
    const load = await freshLoader(prepare);

    const prover = await load(new Uint8Array(MINIMAL_WASM));

    expect(prover).toMatchObject({ backend: 'cpu', fallbackReason: 'WebGPU is not available' });
    expect(gpu.createCurveGPUContext).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('falls back to the CPU when no adapter can be created, reporting why', async () => {
    withGPU();
    gpu.createCurveGPUContext.mockRejectedValueOnce(new Error('no WebGPU adapter'));
    const prepare = vi.fn(async () => ({ backend: 'webgpu' }));
    const load = await freshLoader(prepare);

    const prover = await load(new Uint8Array(MINIMAL_WASM));

    expect(prover).toMatchObject({ backend: 'cpu', fallbackReason: 'no WebGPU adapter' });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('falls back to the CPU when the key upload fails', async () => {
    withGPU();
    const load = await freshLoader(async () => ({ backend: 'cpu', error: 'webgpu groth16: device lost' }));

    await expect(load(new Uint8Array(MINIMAL_WASM)))
      .resolves.toMatchObject({ backend: 'cpu', fallbackReason: 'webgpu groth16: device lost' });
  });

  it('rejects mist.wasm, which has no prepareProver, and stays retryable', async () => {
    withGPU();
    const load = await freshLoader();

    await expect(load(new Uint8Array(MINIMAL_WASM))).rejects.toThrow(/load mist-webgpu\.wasm, not mist\.wasm/);

    (globalThis as Record<string, unknown>).prepareProver = async () => ({ backend: 'webgpu' });
    try {
      await expect(load(new Uint8Array(MINIMAL_WASM))).resolves.toMatchObject({ backend: 'webgpu' });
    } finally {
      delete (globalThis as Record<string, unknown>).prepareProver;
    }
  });

  it('defaults to mist-webgpu.wasm beside the package', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(new Uint8Array(MINIMAL_WASM), { headers: { 'Content-Type': 'application/wasm' } }));
    vi.stubGlobal('fetch', fetchMock);
    const load = await freshLoader(async () => ({ backend: 'cpu' }));

    await load();

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/wasm\/mist-webgpu\.wasm$/);
  });

  it('names its own loader and wasm when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' })));
    const load = await freshLoader(async () => ({ backend: 'cpu' }));

    await expect(load('/missing.wasm')).rejects.toThrow(/mist-webgpu\.wasm not served .*loadWebGPUProver\(\)/);
  });
});

describe('hasWebGPU', () => {
  it('follows navigator.gpu', async () => {
    const { hasWebGPU } = await import('../src/prover.webgpu.js');
    expect(hasWebGPU()).toBe(false);
    withGPU();
    expect(hasWebGPU()).toBe(true);
  });
});
