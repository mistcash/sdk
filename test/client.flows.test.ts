// Flow-level coverage for the MistClient paths `client.test.ts` never reaches:
// join, openPayload, key-index persistence, fetched chain state, a withdrawal
// that actually proves, and the admin wrappers. Assertions pin the observable
// seam — what the client hands `ChainAdapter.sendTransaction` and
// `ProverAdapter.spend` — so a swapped ABI argument or a dropped safety check
// fails here instead of on-chain.

import { describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters } from 'viem';
import { MistClient, type SpendOpts } from '../src/client.js';
import { decapsulate, deriveUkx, managerKeys } from '../src/pq.js';
import type { ProverAdapter } from '../src/proving.js';
import type { ChainAdapter, Hex, MistCallbacks, StorageAdapter } from '../src/types.js';

const BOOK = {
  chamber: '0x1111111111111111111111111111111111111111' as Hex,
  registrar: '0x2222222222222222222222222222222222222222' as Hex,
  reserve: '0x3333333333333333333333333333333333333333' as Hex,
  token: '0x4444444444444444444444444444444444444444' as Hex,
  verifier: '0x5555555555555555555555555555555555555555' as Hex,
};

const ALICE_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const BOB_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
// A second reserve so `defaultReserve` tests can tell which note won.
const OTHER_RESERVE = '0x7777777777777777777777777777777777777777' as Hex;

// The `hash2` mock resolves every owner to '123', so a MIST identity's
// mistAddr is '123' and a public identity's is its address as a decimal.
const MIST_ADDR = '123';
const ALICE_OWNER = BigInt(ALICE_ADDR).toString();

// Decode ABIs matching what the client encodes. Every assertion below uses
// distinct values per position, so any argument-order slip in client.ts shows
// up as a mismatch here.
const CHAMBER_MIN = [
  { type: 'function', name: 'handleZkp', stateMutability: 'nonpayable', inputs: [{ name: 'proof', type: 'uint256[8]' }, { name: 'input', type: 'uint256[14]' }, { name: 'auditorCommitments', type: 'uint256[]' }], outputs: [] },
  { type: 'function', name: 'setVerifier', stateMutability: 'nonpayable', inputs: [{ name: 'verifier', type: 'address' }], outputs: [] },
] as const;

const RESERVE_MIN = [
  { type: 'function', name: 'registerUser', stateMutability: 'nonpayable', inputs: [{ name: 'data', type: 'bytes' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'setRegisterUserCallback', stateMutability: 'nonpayable', inputs: [{ name: 'target', type: 'address' }, { name: 'entrypoint', type: 'bytes4' }], outputs: [] },
  { type: 'function', name: 'updateAuditorKey', stateMutability: 'nonpayable', inputs: [{ name: 'keyHash', type: 'uint256' }, { name: 'keyInputPoint', type: 'uint256' }], outputs: [] },
] as const;

// What the client hands the prover. `serializeSpendRequest` emits bigints as
// bare numbers, so amounts arrive as `number` after JSON.parse.
interface CapturedRequest {
  Owner: string;
  OwnerSecret: string;
  UserKeyExchange: string;
  KeyIndex: number;
  Reserve: string;
  ReserveConfig: string;
  TxLeaves: string[];
  StateLeaves: string[];
  UserLeaves: string[];
  In: Array<{ Blinding: string; Amount: number }>;
  Out: Array<{ id: string | null; Owner: string; Blinding: string; Amount: number }>;
  Withdraw: number;
  WithdrawTo: string;
}

// Like `client.test.ts`'s mockChain, but records both writes (for ABI
// decoding) and reads (for the spendState path) and lets each test shape the
// chain state. `withGetEvents` distinguishes an adapter that omits the
// optional `getEvents` from one that returns no events — `spendState` treats
// those differently.
function mockChain(
  cfg: {
    txLeaves?: bigint[];
    stateLeaves?: bigint[];
    reserveCfg?: unknown;
    users?: bigint;
    withGetEvents?: boolean;
    events?: Array<{ args: Record<string, unknown> }>;
  } = {},
) {
  const sent: Array<{ to: Hex; data: Hex }> = [];
  const reads: Array<{ address: Hex; fn: string; args: unknown[] }> = [];
  const chain: ChainAdapter = {
    readContract: async (address, fn, args) => {
      reads.push({ address, fn, args: args ?? [] });
      if (fn === 'getTxArray') return cfg.txLeaves ?? [];
      if (fn === 'zkStateLeaf') return cfg.stateLeaves?.[Number(args?.[0] ?? 0)] ?? 0n;
      if (fn === 'reserveConfigs') return cfg.reserveCfg ?? [0n, 7n, 0n];
      if (fn === 'registeredUsersCount') return cfg.users ?? 0n;
      return 0n;
    },
    sendTransaction: async (tx) => {
      sent.push({ to: tx.to, data: tx.data });
      return { receipt: { transactionHash: '0xabc' }, result: 42n };
    },
  };
  if (cfg.withGetEvents) {
    chain.getEvents = async () => cfg.events ?? [];
  }
  return { chain, sent, reads };
}

// Like `client.test.ts`'s prover, but captures the request JSON (so tests can
// assert what reached the prover) and exposes `decrypt` for openPayload.
function mockProver(
  cfg: {
    commitments?: () => string[];
    decrypt?: ProverAdapter['decrypt'];
  } = {},
) {
  const requests: CapturedRequest[] = [];
  const prover: ProverAdapter = {
    hash2: () => '123',
    spend: async (json) => {
      requests.push(JSON.parse(json) as CapturedRequest);
      return {
        status: 'success',
        proof: ['1', '2', '3', '4', '5', '6', '7', '8'],
        publicInputs: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'],
        commitments: cfg.commitments ? cfg.commitments() : [],
      };
    },
  };
  if (cfg.decrypt) prover.decrypt = cfg.decrypt;
  return { prover, requests };
}

function mockStore(initial: Record<string, string> = {}): StorageAdapter & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

function makeClient(
  opts: {
    chain?: ChainAdapter;
    prover?: ProverAdapter;
    store?: StorageAdapter;
    callbacks?: MistCallbacks;
    secretOf?: (id: string) => string;
    addressOf?: (name: string) => Hex;
  } = {},
): MistClient {
  return new MistClient({
    book: BOOK,
    chainId: 31337,
    chain: opts.chain ?? mockChain().chain,
    prover: opts.prover ?? mockProver().prover,
    callbacks: opts.callbacks,
    store: opts.store,
    secretOf: opts.secretOf ?? (() => 's'),
    addressOf: opts.addressOf ?? ((name: string) => (name === 'bob' ? BOB_ADDR : ALICE_ADDR)),
  });
}

/** Injected spend state, so tests that are not about spendState skip it. */
function fixedState(overrides: Partial<NonNullable<SpendOpts['state']>> = {}): NonNullable<SpendOpts['state']> {
  return { txLeaves: [], stateLeaves: [], userLeaves: [], reserveConfig: '7', reserveUsers: 0n, ukx: '0', ...overrides };
}

describe('MistClient flows', () => {
  // ── join ─────────────────────────────────────────────────────────────────

  it('join derives a shared ukx, registers it, and records the exchange', async () => {
    // A round trip through real X-Wing: only a manager holding the matching
    // secret key can agree on the ukx the client registers.
    const manager = managerKeys('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const { chain, sent } = mockChain();
    const onProgress = vi.fn();
    const client = makeClient({ chain, callbacks: { onProgress } });
    const managerSide = vi.fn(
      (args: { cipherText: Uint8Array; reserve: Hex; mistAddr: string }) => ({
        ukx: deriveUkx(decapsulate(args.cipherText, manager.secretKey), args.reserve, args.mistAddr),
        signature: '0xbeef' as Hex,
      }),
    );

    const { ukx } = await client.join({
      id: 'alice (MIST)',
      reserve: BOOK.reserve,
      managerPublicKey: manager.publicKey,
      managerSide,
    });

    expect(managerSide).toHaveBeenCalledWith({ cipherText: expect.any(Uint8Array), reserve: BOOK.reserve, mistAddr: MIST_ADDR });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(BOOK.reserve);
    const call = decodeFunctionData({ abi: RESERVE_MIN, data: sent[0].data });
    expect(call.functionName).toBe('registerUser');
    // The blob is (mistAddr, ukx, signature): swapping the two uint256s would
    // register the member under the wrong key with no client-side error.
    const [mistAddr, registeredUkx, signature] = decodeAbiParameters(
      parseAbiParameters('uint256, uint256, bytes'),
      (call.args as readonly [Hex])[0],
    );
    expect(mistAddr).toBe(BigInt(MIST_ADDR));
    expect(registeredUkx).toBe(BigInt(ukx));
    expect(signature).toBe('0xbeef');
    expect(client.ukx[`${BOOK.reserve}:${MIST_ADDR}`]).toBe(ukx);
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['Exchanging keys', 'Registering']);
  });

  it('join refuses to register when the manager derives a different ukx', async () => {
    // The ukx equality check is the client's only defence against a
    // misbehaving manager: registering a mismatched pair would silently give
    // the member a key exchange no one can open.
    const manager = managerKeys('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const { chain, sent } = mockChain();
    const client = makeClient({ chain });

    await expect(
      client.join({
        id: 'alice (MIST)',
        reserve: BOOK.reserve,
        managerPublicKey: manager.publicKey,
        managerSide: () => ({ ukx: '1', signature: '0xbeef' as Hex }),
      }),
    ).rejects.toThrow('Client and manager derived different ukx values');
    expect(sent).toHaveLength(0);
  });

  // ── openPayload ──────────────────────────────────────────────────────────

  it('openPayload demands a prover with decrypt', async () => {
    // Without the guard a stale wasm would surface as `decrypt is not a
    // function` deep inside the loop.
    const client = makeClient({ prover: mockProver().prover });
    await expect(client.openPayload({ reserve: BOOK.reserve, commitments: ['c1'] })).rejects.toThrow(
      'Prover predates decrypt',
    );
  });

  it('openPayload only tries the target reserve and stops at the first hit', async () => {
    // Keys are `${reserve}:${owner}`: other reserves' exchanges must never be
    // tried (they cannot open the payload, and they leak less that way), and
    // the owner the caller gets back comes from the key string.
    const decrypt = vi.fn(async (ukx: string) =>
      ukx === 'ukx-a' ? null : { keyIndex: 5, plaintext: ['p1', 'p2'] },
    );
    const client = makeClient({ prover: mockProver({ decrypt }).prover });
    client.ukx = {
      [`${OTHER_RESERVE}:${MIST_ADDR}`]: 'ukx-other',
      [`${BOOK.reserve}:111`]: 'ukx-a',
      [`${BOOK.reserve}:222`]: 'ukx-b',
    };

    const opened = await client.openPayload({ reserve: BOOK.reserve, commitments: ['c1', 'c2'] });

    expect(decrypt.mock.calls.map((c) => c[0])).toEqual(['ukx-a', 'ukx-b']);
    expect(decrypt).toHaveBeenCalledWith('ukx-a', ['c1', 'c2']);
    expect(opened).toEqual({ owner: '222', keyIndex: 5, plaintext: ['p1', 'p2'] });
  });

  it('openPayload returns null when no key opens the payload', async () => {
    const decrypt = vi.fn(async () => null);
    const client = makeClient({ prover: mockProver({ decrypt }).prover });
    client.ukx = { [`${BOOK.reserve}:${MIST_ADDR}`]: 'ukx-a' };

    expect(await client.openPayload({ reserve: BOOK.reserve, commitments: ['c1'] })).toBeNull();
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  // ── key-index persistence ────────────────────────────────────────────────

  it('records and persists the key index after a private-tx spend', async () => {
    // `Chamber` reverts on a reused private-tx key, so after a spend with a
    // live ukx the index must reach both memory and the store — this is the
    // only thing standing between a reload and a duplicate key.
    const store = mockStore();
    const { prover, requests } = mockProver({ commitments: () => ['999', '888'] });
    const client = makeClient({ prover, store });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await client.spend({
      id: 'alice',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      keyIndex: 7,
      state: fixedState({ ukx: '555' }),
    });

    expect(requests[0].KeyIndex).toBe(7);
    expect(client.usedKeyIndices.get('555')).toEqual(new Set([7]));
    expect(JSON.parse(store.data.get('mist:keyIndices') ?? '')).toEqual({ '555': [7] });
  });

  it('merges into a shared store instead of overwriting another client', async () => {
    // Two tabs (or two MistClients) can share one StorageAdapter, and the whole
    // map lives under a single key. A blind write would drop the other client's
    // indices, and both tabs could then draw the same private-tx key for the
    // same ukx — which Chamber rejects.
    const store = mockStore();
    const spend = async (ukx: string, keyIndex: number) => {
      const { prover } = mockProver({ commitments: () => ['999'] });
      const client = makeClient({ prover, store });
      client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];
      await client.spend({
        id: 'alice', amount: 40n, to: 'bob', reserve: BOOK.reserve,
        keyIndex, state: fixedState({ ukx }),
      });
    };

    await spend('555', 3);
    await spend('666', 4);
    // A second client that already knew about index 3 for 555 must not erase it.
    await spend('555', 9);

    expect(JSON.parse(store.data.get('mist:keyIndices') ?? '')).toEqual({ '555': [3, 9], '666': [4] });
  });

  it('restores indices another client persisted', async () => {
    const store = mockStore({ 'mist:keyIndices': JSON.stringify({ '555': [3, 9] }) });
    const { prover } = mockProver({ commitments: () => ['999'] });
    const client = makeClient({ prover, store });

    await client.restoreKeyIndices();

    expect(client.usedKeyIndices.get('555')).toEqual(new Set([3, 9]));
  });

  it('leaves empty key-index sets out of the store', async () => {
    // A spend whose prover returned no commitments uses no private-tx key, so
    // its index must stay reusable — and its (empty) bookkeeping must not
    // shadow what actually gets persisted.
    const store = mockStore();
    const commitments: string[][] = [[], ['555']];
    const { prover } = mockProver({ commitments: () => commitments.shift() ?? [] });
    const client = makeClient({ prover, store });

    await client.spend({
      id: 'alice',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      notes: [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }],
      state: fixedState({ ukx: '666' }),
    });
    expect(client.usedKeyIndices.get('666')?.size).toBe(0);

    await client.spend({
      id: 'alice',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      keyIndex: 9,
      notes: [{ reserve: BOOK.reserve, id: 'alice', blinding: '2', amount: 200n }],
      state: fixedState({ ukx: '777' }),
    });
    expect(JSON.parse(store.data.get('mist:keyIndices') ?? '')).toEqual({ '777': [9] });
  });

  it('records key indices in memory when no store is configured', async () => {
    // Without a store the persistence step must degrade to in-memory
    // tracking, not throw and lose the index mid-spend.
    const { prover } = mockProver({ commitments: () => ['999'] });
    const client = makeClient({ prover });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await client.spend({
      id: 'alice',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      keyIndex: 3,
      state: fixedState({ ukx: '888' }),
    });
    expect(client.usedKeyIndices.get('888')).toEqual(new Set([3]));
  });

  it('restoreKeyIndices feeds restored indices into key-index picking', async () => {
    // The point of restoring is that picking *avoids* the restored indices.
    // With all 256 restored the picker has nothing left to draw — if restored
    // data were ignored this spend would sail through with a duplicate key.
    const raw = JSON.stringify({ ukx9: Array.from({ length: 256 }, (_, i) => i) });
    const store = mockStore({ 'mist:keyIndices': raw });
    const client = makeClient({ prover: mockProver().prover, store });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await client.restoreKeyIndices();
    expect(client.usedKeyIndices.get('ukx9')?.size).toBe(256);

    await expect(
      client.spend({ id: 'alice', amount: 40n, to: 'bob', reserve: BOOK.reserve, state: fixedState({ ukx: 'ukx9' }) }),
    ).rejects.toThrow('All 256 key indices used for this ukx');
  });

  it('restoreKeyIndices is a no-op without a store or stored data', async () => {
    // Fresh installs and wiped stores are the common case; restoring must not
    // demand either.
    const bare = makeClient();
    await expect(bare.restoreKeyIndices()).resolves.toBeUndefined();

    const store = mockStore();
    const client = makeClient({ prover: mockProver().prover, store });
    await expect(client.restoreKeyIndices()).resolves.toBeUndefined();
    expect(client.usedKeyIndices.size).toBe(0);
  });

  // ── spendState / zkStateLeaves ───────────────────────────────────────────

  it('reads tx leaves, state leaves, users and events when state is not injected', async () => {
    // Every spend test in client.test.ts injects `opts.state`, so this 4-way
    // fetch, the reserveConfig tuple unwrap and the event leaves are only
    // exercised here.
    const { chain, reads } = mockChain({
      txLeaves: [11n, 22n],
      stateLeaves: [100n, 200n],
      reserveCfg: [0n, 7n, 0n],
      users: 0n,
      withGetEvents: true,
      events: [{ args: { leaf: 55n } }, { args: { leaf: 66n } }],
    });
    const { prover, requests } = mockProver();
    const client = makeClient({ chain, prover });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await client.spend({ id: 'alice', amount: 40n, to: 'bob', reserve: BOOK.reserve });

    const req = requests[0];
    expect(req.TxLeaves).toEqual(['11', '22']);
    expect(req.StateLeaves).toEqual(['100', '200']);
    expect(req.UserLeaves).toEqual(['55', '66']);
    expect(req.ReserveConfig).toBe('7');
    expect(req.Reserve).toBe(BOOK.reserve);
    expect(reads.filter((r) => r.fn === 'zkStateLeaf').map((r) => r.args[0])).toEqual([0n, 1n, 2n]);
    expect(reads.some((r) => r.fn === 'getTxArray' && r.address === BOOK.chamber)).toBe(true);
    expect(reads.some((r) => r.fn === 'reserveConfigs' && r.address === BOOK.chamber && r.args[0] === BOOK.reserve)).toBe(true);
    expect(reads.some((r) => r.fn === 'registeredUsersCount' && r.address === BOOK.reserve)).toBe(true);
  });

  it('tolerates a chain adapter without getEvents and a bare reserveConfigs value', async () => {
    // `getEvents` is optional on ChainAdapter and `reserveConfigs` shapes vary
    // across adapters; neither may crash a plain spend.
    const { chain, reads } = mockChain({ reserveCfg: 55n });
    const { prover, requests } = mockProver();
    const client = makeClient({ chain, prover });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await client.spend({ id: 'alice', amount: 40n, to: 'bob', reserve: BOOK.reserve });

    expect(requests[0].UserLeaves).toEqual([]);
    expect(requests[0].ReserveConfig).toBe('55');
    expect(reads.filter((r) => r.fn === 'zkStateLeaf').map((r) => r.args[0])).toEqual([0n]);
  });

  it('spendState falls back to owner 0 when identity resolution throws', async () => {
    // `spend()` re-resolves the owner right after `spendState` and would
    // reject there anyway, so this tolerance is only observable through the
    // helper itself: a locked keyring must degrade the state fetch to the
    // '0' owner, not fail the whole read.
    const { chain, reads } = mockChain();
    const client = makeClient({
      chain,
      secretOf: () => {
        throw new Error('keyring locked');
      },
    });
    client.ukx[`${BOOK.reserve}:0`] = 'fallback-ukx';

    const st = await client['spendState'](BOOK.reserve, 'alice (MIST)');

    expect(st.ukx).toBe('fallback-ukx');
    expect(reads.some((r) => r.fn === 'registeredUsersCount')).toBe(true);
  });

  it('zkStateLeaves pages until the first zero leaf', async () => {
    const { chain, reads } = mockChain({ stateLeaves: [100n, 200n] });
    const client = makeClient({ chain });

    expect(await client.zkStateLeaves()).toEqual(['100', '200']);
    expect(reads.map((r) => r.args[0])).toEqual([0n, 1n, 2n]);
  });

  // ── withdrawal ───────────────────────────────────────────────────────────

  it('withdraws all the way to handleZkp with the withdraw fields in the request', async () => {
    // The only existing withdraw test dies at the `withdrawTo` guard; this
    // proves a real withdrawal reaches the prover (where withdrawAmount and
    // withdrawTo land in publicInputs[6]/[9]) and still submits handleZkp.
    const { chain, sent } = mockChain();
    const { prover, requests } = mockProver({ commitments: () => ['999', '888'] });
    const onProgress = vi.fn();
    const addressOf = vi.fn((name: string) => (name === 'bob' ? BOB_ADDR : ALICE_ADDR));
    const client = makeClient({ chain, prover, callbacks: { onProgress }, addressOf });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    const res = await client.spend({
      id: 'alice',
      amount: 0n,
      withdraw: 40n,
      withdrawTo: 'bob',
      reserve: BOOK.reserve,
      state: fixedState(),
    });

    const req = requests[0];
    expect(req.Withdraw).toBe(40);
    expect(req.WithdrawTo).toBe(BOB_ADDR);
    // Public spends must never leak a MIST secret to the prover.
    expect(req.OwnerSecret).toBe('');
    expect(req.In[0]).toMatchObject({ Blinding: '1', Amount: 100 });
    expect(req.Out[1]).toMatchObject({ Amount: 60 });
    expect(addressOf).toHaveBeenCalledWith('bob');
    expect(res.commitments).toEqual(['999', '888']);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(BOOK.chamber);
    const call = decodeFunctionData({ abi: CHAMBER_MIN, data: sent[0].data });
    expect(call.functionName).toBe('handleZkp');
    expect(call.args).toEqual([
      [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
      [10n, 11n, 12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n],
      [999n, 888n],
    ]);
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['Proving in your browser', 'Submitting']);
  });

  // ── defaultReserve ───────────────────────────────────────────────────────

  it('fails with No reserve when spending without a reserve and no notes', async () => {
    const client = makeClient();
    await expect(client.spend({ id: 'alice', amount: 1n })).rejects.toThrow(
      'No reserve: pass `reserve` explicitly or deposit first.',
    );
  });

  it('defaults the reserve to the first unspent note', async () => {
    // Must skip spent notes: picking a spent note's reserve would plan a
    // spend at a reserve the identity holds nothing at.
    const { prover, requests } = mockProver();
    const client = makeClient({ prover });
    client.notes = [
      { reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 50n, spent: true },
      { reserve: OTHER_RESERVE, id: 'alice', blinding: '2', amount: 100n },
    ];

    await client.spend({ id: 'alice', amount: 10n, state: fixedState() });

    expect(requests[0].Reserve).toBe(OTHER_RESERVE);
  });

  // ── plan errors ──────────────────────────────────────────────────────────

  it('rethrows the plan error when notes cannot cover the amount', async () => {
    // The plan error message is what the user reads; wrapping or replacing it
    // would hide the actual shortfall.
    const client = makeClient();
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await expect(
      client.spend({ id: 'alice', amount: 500n, reserve: BOOK.reserve, state: fixedState() }),
    ).rejects.toThrow('Your notes here hold 100.');
  });

  it('rethrows the members-only plan error from fetched state', async () => {
    // reserveUsers only reaches plan through the spendState fetch; a
    // members-only reserve must say so rather than fail in the prover.
    const { chain } = mockChain({ users: 3n });
    const client = makeClient({ chain });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];

    await expect(client.spend({ id: 'alice', amount: 10n, reserve: BOOK.reserve })).rejects.toThrow(
      'Reserve is members only: join it first.',
    );
  });

  // ── MIST-owner spend ─────────────────────────────────────────────────────

  it('MIST-owner spends carry the owner secret and announce relayer submission', async () => {
    // A private identity's spend is authorized by its secret inside the proof
    // and submitted by a relayer; the progress stream is how the host routes
    // (and shows) that.
    const { prover, requests } = mockProver();
    const secretOf = vi.fn(() => 's');
    const onProgress = vi.fn();
    const client = makeClient({ prover, secretOf, callbacks: { onProgress } });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice (MIST)', blinding: '1', amount: 100n }];

    await client.spend({
      id: 'alice (MIST)',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      state: fixedState(),
    });

    expect(requests[0].OwnerSecret).toBe('s');
    expect(requests[0].Owner).toBe(MIST_ADDR);
    expect(secretOf).toHaveBeenCalledWith('alice (MIST)');
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['Proving in your browser', 'Relayer submitting']);
  });

  // ── admin wrappers ───────────────────────────────────────────────────────

  it('setVerifier pins its verifier argument', async () => {
    const { chain, sent } = mockChain();
    const client = makeClient({ chain });

    const receipt = await client.setVerifier(BOOK.verifier);

    expect(receipt.transactionHash).toBe('0xabc');
    expect(sent[0].to).toBe(BOOK.chamber);
    const call = decodeFunctionData({ abi: CHAMBER_MIN, data: sent[0].data });
    expect(call.functionName).toBe('setVerifier');
    expect(call.args).toEqual([BOOK.verifier]);
  });

  it('setCallback pins target before entrypoint', async () => {
    // The pair is (registrar target, bytes4 entrypoint): swapped arguments
    // would point the callback at garbage, and both are plain words on-chain.
    const { chain, sent } = mockChain();
    const client = makeClient({ chain });

    await client.setCallback(BOOK.reserve, '0x12345678');

    expect(sent[0].to).toBe(BOOK.reserve);
    const call = decodeFunctionData({ abi: RESERVE_MIN, data: sent[0].data });
    expect(call.functionName).toBe('setRegisterUserCallback');
    expect(call.args).toEqual([BOOK.registrar, '0x12345678']);
  });

  it('updateAuditorKey pins keyHash before keyInputPoint', async () => {
    const { chain, sent } = mockChain();
    const client = makeClient({ chain });

    await client.updateAuditorKey(BOOK.reserve, 111n, 222n);

    expect(sent[0].to).toBe(BOOK.reserve);
    const call = decodeFunctionData({ abi: RESERVE_MIN, data: sent[0].data });
    expect(call.functionName).toBe('updateAuditorKey');
    expect(call.args).toEqual([111n, 222n]);
  });

  // ── constructor / isMember ───────────────────────────────────────────────

  it('default secretOf and addressOf throwers fire when unconfigured', async () => {
    // The throwers turn a missing host keyring into one clear error at the
    // call site instead of a downstream `undefined` owner.
    const client = new MistClient({
      book: BOOK,
      chainId: 31337,
      chain: mockChain().chain,
      prover: mockProver().prover,
    });
    await expect(
      client.deposit({ reserve: BOOK.reserve, id: 'alice (MIST)', amount: 100n, blinding: '9' }),
    ).rejects.toThrow('MistClient: secretOf not configured');
    await expect(
      client.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' }),
    ).rejects.toThrow('MistClient: addressOf not configured');
  });

  it('isMember reports membership and swallows identity failures', async () => {
    // `spend`'s plan() call leans on isMember; a locked keyring must read as
    // "not a member" rather than crash the membership check.
    const client = makeClient({
      secretOf: () => {
        throw new Error('keyring locked');
      },
    });
    client.ukx[`${BOOK.reserve}:${ALICE_OWNER}`] = 'ukx-alice';

    expect(await client.isMember(BOOK.reserve, 'alice')).toBe(true);
    expect(await client.isMember(OTHER_RESERVE, 'alice')).toBe(false);
    expect(await client.isMember(BOOK.reserve, 'alice (MIST)')).toBe(false);
  });
});
