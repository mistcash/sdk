// src/prover-worker.js — Web Worker that loads mist.wasm and proxies calls.
// Spawns via: new Worker(new URL('./prover-worker.js', import.meta.url), { type: 'module' })

let ready = false;

async function ensureWasm(wasmUrl) {
  if (ready) return;
  self.importScripts(new URL('./prover/wasm_exec.js', self.location.href).href);
  const Go = self.Go;
  const go = new Go();
  const res = wasmUrl ? await fetch(wasmUrl) : await fetch(new URL('../wasm/mist.wasm', self.location.href));
  const { instance } = await WebAssembly.instantiateStreaming(res, go.importObject);
  go.run(instance);
  ready = true;
}

self.onmessage = async (e) => {
  const { id, method, args, wasmUrl } = e.data;
  try {
    await ensureWasm(wasmUrl);
    let result;
    switch (method) {
      case 'hash2':
        result = self.hash2(args[0], args[1]);
        break;
      case 'hash3':
        result = self.hash3(args[0], args[1], args[2]);
        break;
      case 'spend':
        result = self.spend(args[0]);
        break;
      case 'decrypt':
        result = self.decrypt(args[0], args[1]);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message ?? String(err) });
  }
};