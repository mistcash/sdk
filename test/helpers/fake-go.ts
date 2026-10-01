// Test doubles for the Go/WASM side of the prover loader.
//
// `prover-core._load` imports `wasm_exec.js` and then reads `globalThis.Go`,
// and expects `go.run()` to have installed `spend`/`decrypt`/`hash2`/`hash3`
// on `globalThis` by the time it returns. That is exactly what the real Go
// program does, so a fake that does the same exercises the loader's real
// control flow without a 16MB artifact — which means these tests are never
// skipped, unlike the ones gated on a staged `mist.wasm`.

import { vi } from 'vitest';

/** A valid, empty wasm module. Enough for `WebAssembly.instantiate`. */
export const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

export const PROVER_EXPORTS = ['spend', 'decrypt', 'hash2', 'hash3'] as const;
export type ProverExport = (typeof PROVER_EXPORTS)[number];

type AnyFn = (...args: never[]) => unknown;

/**
 * Replace `globalThis.Go` with a fake whose `run()` installs the given exports.
 *
 * `wasm_exec.js` assigns `globalThis.Go` when it is first evaluated, and
 * `_load` imports it before reading the global. Warming that module cache here
 * means the loader's own import is a no-op and it picks up this fake instead.
 * That ordering is the whole trick, so it is asserted in a test rather than
 * assumed.
 */
export async function installFakeGo(options: {
  /** Which of the four exports `run()` should install. Missing ones trigger the
   *  `mist.wasm predates <key>` guard. */
  exports?: Partial<Record<ProverExport, AnyFn>>;
} = {}): Promise<{ restore: () => void; runCalls: () => number }> {
  await import('../../src/prover/wasm_exec.js');

  const globals = globalThis as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  for (const key of PROVER_EXPORTS) saved.set(key, globals[key]);
  const savedGo = globals.Go;

  let runCalls = 0;
  const wanted = options.exports ?? {
    spend: vi.fn(() => ({ status: 'success' })),
    decrypt: vi.fn(() => null),
    hash2: vi.fn(() => '1'),
    hash3: vi.fn(() => '2'),
  };

  globals.Go = class {
    importObject = {};
    run(_instance: WebAssembly.Instance): void {
      runCalls += 1;
      for (const [key, value] of Object.entries(wanted)) {
        if (value !== undefined) globals[key] = value;
      }
    }
  };

  return {
    runCalls: () => runCalls,
    restore: () => {
      globals.Go = savedGo;
      for (const [key, value] of saved) {
        if (value === undefined) delete globals[key];
        else globals[key] = value;
      }
    },
  };
}

/** An `InstantiateFn` that never touches real WebAssembly. */
export function fakeInstantiate(
  impl?: (source: unknown) => Promise<WebAssembly.Instance>,
): { instantiate: (go: unknown, source: unknown) => Promise<WebAssembly.Instance>; calls: () => unknown[] } {
  const seen: unknown[] = [];
  return {
    calls: () => seen,
    instantiate: async (_go, source) => {
      seen.push(source);
      if (impl) return impl(source);
      return {} as WebAssembly.Instance;
    },
  };
}
