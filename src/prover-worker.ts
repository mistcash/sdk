import { loadProver } from './prover.js';

type Request = { id: number; method: string; args: unknown[]; wasmUrl?: string };

let proverPromise: ReturnType<typeof loadProver> | undefined;

function ensureLoaded(wasmUrl?: string) {
  if (!proverPromise) {
    proverPromise = loadProver(wasmUrl).catch((e) => { proverPromise = undefined; throw e; });
  }
  return proverPromise;
}

export async function handleMessage(e: { data: Request }): Promise<void> {
  const { id, method, args, wasmUrl } = e.data;
  try {
    const prover = await ensureLoaded(wasmUrl);
    let result: unknown;
    switch (method) {
      case 'hash2': result = await prover.hash2(args[0] as string, args[1] as string); break;
      case 'hash3': result = await prover.hash3(args[0] as string, args[1] as string, args[2] as string); break;
      case 'spend': result = await prover.spend(args[0] as string); break;
      case 'decrypt': result = await prover.decrypt(args[0] as string, args[1] as string[]); break;
      default: throw new Error(`Unknown method: ${method}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message ?? String(err) });
  }
}

self.onmessage = handleMessage;