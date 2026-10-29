// @mistcash/sdk/prover/webgpu — the WebGPU-accelerated prover.
//
// mist-webgpu.wasm is the same Go prover and proving key as mist.wasm, built
// with gnark's WebGPU backend: its MSMs and quotient run as WGSL kernels that
// it reaches through the `gnarkGroth16WebGPU` bridge on globalThis. This entry
// installs that bridge (gnark's own runtime, vendored in src/prover/gnark-webgpu
// from the gnark the wasm links), loads the wasm, and uploads the proving key
// to the GPU before handing the prover out, so the first proof does not pay
// for the upload.
//
// It never fails for lack of a GPU: without one (no `navigator.gpu`, no
// adapter, a failed upload) the same wasm proves on the CPU, and `backend` /
// `fallbackReason` say so. Use `hasWebGPU()` to pick mist.wasm up front instead.
//
// Like mist.wasm, it installs its exports on globalThis, so load one prover
// per realm; run it in a worker (`createWorkerProver({ webgpu: true })`) to
// keep proving off the main thread.

import { createLoader, type FullProverAdapter, type ProverInfo } from './prover-core.js';
import { browserInstantiate } from './prover-browser.js';

export type { FullProverAdapter, ProverInfo } from './prover-core.js';
export type WebGPUProver = FullProverAdapter & ProverInfo;

type Source = Parameters<ReturnType<typeof createLoader>>[0];
type PrepareProver = () => Promise<{ backend: ProverInfo['backend']; error?: string }>;

const loadWasm = createLoader(
  browserInstantiate('mist-webgpu.wasm', 'loadWebGPUProver', () => new URL('../wasm/mist-webgpu.wasm', import.meta.url).href),
);

/** Whether this environment exposes WebGPU at all. An adapter can still be
 * missing; `loadWebGPUProver` then falls back to the CPU. */
export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu;
}

let prover: Promise<WebGPUProver> | undefined;

export function loadWebGPUProver(source?: Source): Promise<WebGPUProver> {
  if (prover) return prover;
  prover = _load(source).catch((e) => { prover = undefined; throw e; });
  return prover;
}

async function _load(source: Source): Promise<WebGPUProver> {
  // Shader compilation and the wasm download overlap.
  const [bridgeError, adapter] = await Promise.all([
    hasWebGPU() ? installBridge().then(() => undefined, describe) : Promise.resolve('WebGPU is not available'),
    loadWasm(source),
  ]);
  const prepare = (globalThis as Record<string, unknown>).prepareProver as PrepareProver | undefined;
  if (typeof prepare !== 'function') {
    throw new Error('this wasm has no prepareProver export: load mist-webgpu.wasm, not mist.wasm');
  }
  // Without a bridge Prepare cannot reach the GPU, so skip straight to the CPU
  // rather than report gnark's "bridge not found" over the real reason.
  const { backend, error } = bridgeError === undefined ? await prepare() : { backend: 'cpu' as const, error: bridgeError };
  return { ...adapter, backend, ...(error !== undefined ? { fallbackReason: error } : {}) };
}

async function installBridge(): Promise<void> {
  const [{ createCurveGPUContext }, { createBN254 }, { installGroth16WebGPUBridge }] = await Promise.all([
    import('./prover/gnark-webgpu/context.js'),
    import('./prover/gnark-webgpu/curves.js'),
    import('./prover/gnark-webgpu/bridge.js'),
    // Inline the WGSL so nothing is fetched from paths a bundler never emits.
    import('./prover/gnark-webgpu/shader_bundle.generated.js'),
  ]);
  const context = await createCurveGPUContext();
  const bn254 = await createBN254(context);
  installGroth16WebGPUBridge({
    context,
    curve: 'bn254',
    fr: bn254.fr,
    g1msm: bn254.g1msm,
    g2msm: bn254.g2msm,
    // The Groth16 module re-exposes the NTT module's quotient kernels; the
    // curve's `ntt` field is typed without them.
    quotient: bn254.groth16,
  });
}

function describe(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}
