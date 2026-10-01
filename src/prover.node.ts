export type { FullProverAdapter } from './prover-core.js';
import { createLoader } from './prover-core.js';

export const loadProver = createLoader(async (go, source) => {
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
});