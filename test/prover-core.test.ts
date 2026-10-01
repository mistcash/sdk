// The loader seam: memoization, concurrency, retry and the error paths.
//
// None of this needs a `mist.wasm`, so unlike the integration tests it always
// runs — the branches below are exactly the ones a consumer hits when
// something is wrong, which is when tests matter most.

import { describe, expect, it, afterEach } from 'vitest';
import { createLoader } from '../src/prover-core.js';
import { fakeInstantiate, installFakeGo, PROVER_EXPORTS, type ProverExport } from './helpers/fake-go.js';

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('createLoader', () => {
  it('returns the identical adapter on repeated calls, instantiating once', async () => {
    restore = (await installFakeGo()).restore;
    const { instantiate, calls } = fakeInstantiate();
    const load = createLoader(instantiate);

    const first = await load();
    const second = await load();

    expect(second).toBe(first);
    expect(calls()).toHaveLength(1);
  });

  it('shares one in-flight promise between concurrent calls', async () => {
    restore = (await installFakeGo()).restore;
    const { instantiate, calls } = fakeInstantiate();
    const load = createLoader(instantiate);

    const [a, b, c] = await Promise.all([load(), load(), load()]);

    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(calls()).toHaveLength(1);
  });

  it("keeps the first caller's source when a concurrent call passes its own", async () => {
    // Documented quirk: the memo is claimed synchronously, so a later source is
    // discarded rather than starting a second load.
    restore = (await installFakeGo()).restore;
    const { instantiate, calls } = fakeInstantiate();
    const load = createLoader(instantiate);

    await Promise.all([load('first'), load('second')]);

    expect(calls()).toEqual(['first']);
  });

  it('gives each loader its own memo, so two loaders do not shadow each other', async () => {
    // Regression: the memo used to live at module scope, which meant importing
    // both `prover` and `prover.node` from source made whichever loaded first
    // answer for both. tsup inlines a private copy per entry, so the bug only
    // appeared unbundled.
    restore = (await installFakeGo()).restore;
    const first = createLoader(fakeInstantiate().instantiate);
    const second = createLoader(fakeInstantiate().instantiate);

    const a = await first();
    const b = await second();

    expect(b).not.toBe(a);
  });

  it('clears the memo after a failure so a retry can succeed', async () => {
    restore = (await installFakeGo()).restore;
    let attempt = 0;
    const { instantiate, calls } = fakeInstantiate(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network down');
      return {} as WebAssembly.Instance;
    });
    const load = createLoader(instantiate);

    await expect(load()).rejects.toThrow('network down');
    await expect(load()).resolves.toBeDefined();
    expect(calls()).toHaveLength(2);
  });

  it('rejects when wasm_exec.js does not register a Go runtime', async () => {
    await import('../src/prover/wasm_exec.js');
    const globals = globalThis as Record<string, unknown>;
    const saved = globals.Go;
    globals.Go = undefined;
    restore = () => { globals.Go = saved; };

    const load = createLoader(fakeInstantiate().instantiate);
    await expect(load()).rejects.toThrow(/Go runtime not found/);
  });

  for (const missing of PROVER_EXPORTS) {
    it(`rejects when the wasm predates \`${missing}\``, async () => {
      const partial = Object.fromEntries(
        PROVER_EXPORTS.filter((k) => k !== missing).map((k) => [k, () => null]),
      );
      restore = (await installFakeGo({ exports: partial as Record<ProverExport, () => null> })).restore;

      const load = createLoader(fakeInstantiate().instantiate);
      await expect(load()).rejects.toThrow(
        new RegExp(`mist\\.wasm predates ${missing}: rebuild with core-deploy scripts/build\\.sh`),
      );
    });
  }

  it('names the first missing export when several are absent', async () => {
    // REQUIRED_EXPORTS is ordered, and the guard reports the first gap, so the
    // message points at the earliest thing to fix.
    restore = (await installFakeGo({ exports: { spend: () => null } })).restore;
    const load = createLoader(fakeInstantiate().instantiate);
    await expect(load()).rejects.toThrow(/predates decrypt/);
  });

  it('awaits a promise-of-Response source before instantiating', async () => {
    restore = (await installFakeGo()).restore;
    const { instantiate, calls } = fakeInstantiate();
    const load = createLoader(instantiate);
    const response = new Response(new Uint8Array([1, 2, 3]));

    await load(Promise.resolve(response));

    expect(calls()[0]).toBe(response);
  });

  it('does not treat a plain string as a thenable', async () => {
    restore = (await installFakeGo()).restore;
    const { instantiate, calls } = fakeInstantiate();
    const load = createLoader(instantiate);

    await load('/tmp/mist.wasm');

    expect(calls()).toEqual(['/tmp/mist.wasm']);
  });
});
