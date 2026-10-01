// The Web Worker, both halves: the host-side RPC façade in `src/prover.ts` and
// the worker-side dispatcher in `src/prover-worker.ts`.
//
// This had no tests. Neither file can be imported under `environment: 'node'`
// as written — `prover-worker.ts` assigns `self.onmessage` at module scope and
// `createWorkerProver` constructs a `Worker` — so the test installs both
// globals first, then bridges them: a fake `Worker` whose `postMessage` calls
// the *real* `handleMessage`, whose reply lands back on the worker's
// `onmessage`. That exercises the actual protocol — id correlation, error
// propagation, memoization — rather than a mock of it.
//
// Not covered here, and honestly not coverable without a browser runner: that
// the built `dist/prover-worker.js` really loads as a module worker from
// `dist/prover.js`'s `import.meta.url`, and structured-clone semantics.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { FullProverAdapter } from '../src/prover-core.js';

// The worker's loader is stubbed: this file is about the message protocol, and
// the loader has its own tests. `importOriginal` keeps `createWorkerProver`,
// which lives in the same module.
const fakeLoadProver = vi.fn<() => Promise<FullProverAdapter>>();
vi.mock('../src/prover.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadProver: (...args: unknown[]) => fakeLoadProver(...(args as [])),
}));

type AnyMsg = { id: number; method: string; args: unknown[]; wasmUrl?: string };

let workerInstance: FakeWorker | undefined;

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  terminated = false;
  readonly sent: AnyMsg[] = [];
  static lastUrl: string | undefined;
  static lastOptions: WorkerOptions | undefined;

  constructor(url: URL, options?: WorkerOptions) {
    FakeWorker.lastUrl = url.href;
    FakeWorker.lastOptions = options;
    workerInstance = this;
  }

  postMessage(data: AnyMsg): void {
    this.sent.push(data);
    const handler = (globalThis as unknown as {
      self?: { onmessage?: (e: { data: unknown }) => void };
    }).self?.onmessage;
    if (!handler) throw new Error('worker has no onmessage handler registered');
    void handler({ data });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function fakeProver(overrides: Partial<FullProverAdapter> = {}): FullProverAdapter {
  return {
    hash2: (a: string, b: string) => `h2(${a},${b})`,
    hash3: (a: string, b: string, c: string) => `h3(${a},${b},${c})`,
    spend: (json: string) => ({ status: 'success', proof: [], publicInputs: [], json } as never),
    decrypt: () => null,
    ...overrides,
  } as FullProverAdapter;
}

/** Install both globals and import both modules fresh. */
async function setup(loadImpl?: () => Promise<FullProverAdapter>) {
  vi.resetModules();
  workerInstance = undefined;
  FakeWorker.lastUrl = undefined;
  FakeWorker.lastOptions = undefined;

  const replies: unknown[] = [];
  const scope = globalThis as Record<string, unknown>;
  const savedSelf = scope.self;
  const savedWorker = scope.Worker;

  scope.Worker = FakeWorker;
  scope.self = {
    onmessage: undefined,
    // The worker's reply path: hand it straight to the host worker object.
    postMessage: (message: unknown) => {
      replies.push(message);
      workerInstance?.onmessage?.({ data: message });
    },
  };

  fakeLoadProver.mockReset();
  fakeLoadProver.mockImplementation(loadImpl ?? (async () => fakeProver()));

  // Importing registers `self.onmessage = handleMessage`.
  const workerMod = await import('../src/prover-worker.js') as {
    handleMessage: (e: { data: AnyMsg }) => Promise<void>;
  };
  const hostMod = await import('../src/prover.js') as {
    createWorkerProver: (opts?: { wasmUrl?: string | URL }) => {
      hash2: (a: string, b: string) => Promise<string>;
      hash3: (a: string, b: string, c: string) => Promise<string>;
      spend: (json: string) => Promise<unknown>;
      decrypt: (ukx: string, c: string[]) => Promise<unknown>;
      terminate: () => void;
    };
  };

  return {
    host: hostMod,
    worker: workerMod,
    replies,
    restore: () => {
      scope.self = savedSelf;
      scope.Worker = savedWorker;
    },
  };
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

describe('worker round trip', () => {
  beforeEach(() => {
    FakeWorker.lastUrl = undefined;
  });

  it('constructs a module worker pointed at the packaged worker script', async () => {
    const { host, restore: r } = await setup();
    restore = r;

    host.createWorkerProver();

    expect(FakeWorker.lastOptions).toEqual({ type: 'module' });
    expect(FakeWorker.lastUrl).toMatch(/prover-worker\.js$/);
  });

  it('proxies each method over postMessage and correlates the replies', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver();

    await expect(prover.hash2('1', '2')).resolves.toBe('h2(1,2)');
    await expect(prover.hash3('1', '2', '3')).resolves.toBe('h3(1,2,3)');
    await expect(prover.spend('{}')).resolves.toMatchObject({ status: 'success' });
    await expect(prover.decrypt('5', ['1'])).resolves.toBeNull();

    // Ids are sequential, so replies cannot be confused between calls.
    expect(workerInstance?.sent.map((m) => m.id)).toEqual([0, 1, 2, 3]);
  });

  it('passes the default wasm URL on every call', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver();

    await prover.hash2('1', '2');

    expect(workerInstance?.sent[0].wasmUrl).toMatch(/\/wasm\/mist\.wasm$/);
  });

  it('passes an explicit wasm URL through', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver({ wasmUrl: 'https://cdn.example/mist.wasm' });

    await prover.hash2('1', '2');

    expect(workerInstance?.sent[0].wasmUrl).toBe('https://cdn.example/mist.wasm');
  });

  it('rejects the caller when the worker reports an error', async () => {
    const { host, restore: r } = await setup(async () => fakeProver({
      hash2: () => { throw new Error('circuit exploded'); },
    }));
    restore = r;
    const prover = host.createWorkerProver();

    await expect(prover.hash2('1', '2')).rejects.toThrow('circuit exploded');
  });

  it('rejects the caller for an unknown method', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    host.createWorkerProver();

    // Reach past the typed façade, which only exposes the four real methods.
    const worker = workerInstance!;
    const reply = new Promise<{ id: number; error?: string }>((resolve) => {
      worker.onmessage = (e) => resolve(e.data as { id: number; error?: string });
    });
    worker.postMessage({ id: 99, method: 'nope', args: [] });

    await expect(reply).resolves.toMatchObject({ id: 99, error: 'Unknown method: nope' });
  });

  it('reports a thrown non-Error as something readable', async () => {
    const { host, restore: r } = await setup(async () => fakeProver({
      hash2: () => { throw 'plain string failure'; },
    }));
    restore = r;
    const prover = host.createWorkerProver();

    await expect(prover.hash2('1', '2')).rejects.toThrow('plain string failure');
  });

  it('never sends a blank error for an Error with an empty message', async () => {
    const { host, restore: r } = await setup(async () => fakeProver({
      hash2: () => { throw new Error(''); },
    }));
    restore = r;
    const prover = host.createWorkerProver();

    // `err.message ?? String(err)` would reject with '' here, which is a blank
    // rejection the caller cannot act on.
    await expect(prover.hash2('1', '2')).rejects.not.toThrow('');
    await prover.hash2('1', '2').then(
      () => expect.unreachable('should have rejected'),
      (err: Error) => expect(err.message).not.toBe(''),
    );
  });

  it('ignores a reply whose id it does not recognise', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver();

    const settled = prover.hash2('1', '2');
    // A stray reply, as a duplicated or late message would produce.
    workerInstance?.onmessage?.({ data: { id: 4242, result: 'stray' } });
    await expect(settled).resolves.toBe('h2(1,2)');
  });

  it('loads the prover once across many calls', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver();

    await prover.hash2('1', '2');
    await prover.hash2('3', '4');
    await prover.hash2('5', '6');

    expect(fakeLoadProver).toHaveBeenCalledTimes(1);
  });

  it('keeps the first wasm URL when a later call carries a different one', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver({ wasmUrl: '/first.wasm' });

    await prover.hash2('1', '2');
    // Reach the dispatcher directly with a conflicting URL.
    const reply = new Promise<{ id: number; result?: unknown }>((resolve) => {
      const w = workerInstance!;
      const previous = w.onmessage;
      w.onmessage = (e) => { w.onmessage = previous; resolve(e.data as { id: number }); };
    });
    workerInstance?.postMessage({ id: 50, method: 'hash2', args: ['1', '2'], wasmUrl: '/second.wasm' });
    await reply;

    // The memoized loader ignores the second URL: re-instantiating would throw
    // away a 16MB proving key mid-session.
    expect(fakeLoadProver).toHaveBeenCalledTimes(1);
    expect(fakeLoadProver).toHaveBeenCalledWith('/first.wasm');
  });

  it('retries the load after a failure instead of caching the rejection', async () => {
    let attempt = 0;
    const { host, restore: r } = await setup(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('wasm 404');
      return fakeProver();
    });
    restore = r;
    const prover = host.createWorkerProver();

    await expect(prover.hash2('1', '2')).rejects.toThrow('wasm 404');
    await expect(prover.hash2('1', '2')).resolves.toBe('h2(1,2)');
    expect(fakeLoadProver).toHaveBeenCalledTimes(2);
  });

  it('terminates the worker and rejects anything still in flight', async () => {
    const { host, restore: r } = await setup();
    restore = r;
    const prover = host.createWorkerProver();

    const inFlight = prover.hash2('1', '2');
    prover.terminate();

    await expect(inFlight).rejects.toThrow(/terminated/);
    expect(workerInstance?.terminated).toBe(true);
  });
});
