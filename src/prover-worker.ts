import { loadProver } from './prover.js';
import { loadWebGPUProver } from './prover.webgpu.js';
import type { FullProverAdapter, ProverInfo } from './prover-core.js';

type Request = { id: number; method: string; args: unknown[]; wasmUrl?: string; webgpu?: boolean };

let proverPromise: Promise<FullProverAdapter & ProverInfo> | undefined;

function ensureLoaded(wasmUrl?: string, webgpu?: boolean) {
  if (!proverPromise) {
    proverPromise = (webgpu
      ? loadWebGPUProver(wasmUrl)
      : loadProver(wasmUrl).then((p) => ({ ...p, backend: 'cpu' as const }))
    ).catch((e) => { proverPromise = undefined; throw e; });
  }
  return proverPromise;
}

/**
 * Coerce a thrown value into something worth sending over postMessage.
 * `err?.message ?? String(err)` is not enough: `??` only falls back on
 * null/undefined, so an Error with an empty message would arrive as `""` and
 * the caller would see a blank rejection.
 */
function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message) return message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}

export async function handleMessage(e: { data: Request }): Promise<void> {
  const { id, method, args, wasmUrl, webgpu } = e.data;
  try {
    const prover = await ensureLoaded(wasmUrl, webgpu);
    let result: unknown;
    switch (method) {
      case 'hash2': result = await prover.hash2(args[0] as string, args[1] as string); break;
      case 'hash3': result = await prover.hash3(args[0] as string, args[1] as string, args[2] as string); break;
      case 'spend': result = await prover.spend(args[0] as string); break;
      case 'decrypt': result = await prover.decrypt(args[0] as string, args[1] as string[]); break;
      case 'backend': result = { backend: prover.backend, ...(prover.fallbackReason !== undefined ? { fallbackReason: prover.fallbackReason } : {}) }; break;
      default: throw new Error(`Unknown method: ${method}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: describeError(err) });
  }
}

self.onmessage = handleMessage;