import { describe, expect, it } from 'vitest';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, parseAbi } from 'viem';
import { MistClient } from '../src/client.js';
import { SCREENING_ABI } from '../src/contracts.js';
import type { ChainAdapter, Hex, SentTx } from '../src/types.js';

const BOOK = {
  chamber: '0x1111111111111111111111111111111111111111' as Hex,
  registrar: '0x2222222222222222222222222222222222222222' as Hex,
  reserve: '0x3333333333333333333333333333333333333333' as Hex,
  token: '0x4444444444444444444444444444444444444444' as Hex,
  verifier: '0x5555555555555555555555555555555555555555' as Hex,
};
const ME = '0x6666666666666666666666666666666666666666' as Hex;
const SCREENER = '0x7777777777777777777777777777777777777777' as Hex;
const NOTE = 4242n;
const SCREENING = parseAbi(SCREENING_ABI);

/** A DepositQueued log as the Chamber emits it. */
function queuedLog(depositId: bigint, address: Hex = BOOK.chamber) {
  return {
    address,
    topics: encodeEventTopics({
      abi: SCREENING,
      eventName: 'DepositQueued',
      args: { depositId, reserve: BOOK.reserve, depositor: ME },
    }) as Hex[],
    data: encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
      [NOTE, BOOK.token, 100n],
    ),
  };
}

/** Chain with one screened reserve and a mutable queue/tree. */
function screenedChain(opts: { screener?: Hex; queue?: Record<string, number>; tree?: bigint[]; reverts?: boolean } = {}) {
  const sent: Array<{ to: Hex; data: Hex }> = [];
  const queue = opts.queue ?? {};
  const tree = opts.tree ?? [];
  const chain: ChainAdapter = {
    readContract: async (_addr, fn, args) => {
      if (fn === 'reserveScreeners') {
        if (opts.reverts) throw new Error('execution reverted');
        return opts.screener ?? SCREENER;
      }
      if (fn === 'pendingDeposits') {
        const id = String(args?.[0]);
        return [ME, queue[id] ?? 0, BOOK.reserve, BOOK.token, 100n, NOTE];
      }
      if (fn === 'getTxArray') return tree;
      return 0n;
    },
    sendTransaction: async (tx): Promise<SentTx> => {
      sent.push(tx);
      const isDeposit = tx.to === BOOK.chamber && sent.length === 2;
      return { receipt: { transactionHash: '0xabc', logs: isDeposit ? [queuedLog(99n, BOOK.token), queuedLog(7n)] : [] }, result: NOTE };
    },
  };
  return { chain, sent, queue, tree };
}

const prover = { hash2: () => '123', spend: async () => ({}) as never };

function client(chain: ChainAdapter) {
  return new MistClient({ book: BOOK, chainId: 31337, chain, prover, secretOf: () => 's', addressOf: () => ME });
}

describe('deposit screening', () => {
  it('marks a screened deposit pending with its deposit id', async () => {
    const { chain } = screenedChain();
    const c = client(chain);
    const note = await c.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' });
    expect(note).toMatchObject({ screening: 'pending', depositId: '7', hash: String(NOTE) });
    expect(c.unspent(BOOK.reserve, 'alice')).toEqual([]);
  });

  it('leaves unscreened deposits spendable', async () => {
    for (const env of [{ screener: '0x0000000000000000000000000000000000000000' as Hex }, { reverts: true }]) {
      const c = client(screenedChain(env).chain);
      const note = await c.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' });
      expect(note.screening).toBeUndefined();
      expect(c.unspent(BOOK.reserve, 'alice')).toEqual([note]);
    }
  });

  it('throws when a screened deposit receipt has no DepositQueued', async () => {
    const { chain } = screenedChain();
    const c = client({ ...chain, sendTransaction: async () => ({ receipt: { transactionHash: '0xabc' } }) });
    await expect(c.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' })).rejects.toThrow(/DepositQueued/);
  });

  it('reads a queue entry', async () => {
    const c = client(screenedChain({ queue: { '7': 2 } }).chain);
    expect(await c.pendingDeposit(7n)).toEqual({
      depositId: '7', depositor: ME, status: 'rejected', reserve: BOOK.reserve, asset: BOOK.token, amount: 100n, noteHash: String(NOTE),
    });
  });

  it('refreshes approved, rejected and reclaimed notes', async () => {
    const env = screenedChain({ queue: { '7': 1 } });
    const c = client(env.chain);
    const note = await c.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' });

    await c.refreshScreening();
    expect(note.screening).toBe('pending');

    env.queue['7'] = 2;
    await c.refreshScreening();
    expect(note.screening).toBe('rejected');

    env.queue['7'] = 0;
    await c.refreshScreening();
    expect(note.screening).toBe('reclaimed');

    note.screening = 'pending';
    env.tree.push(NOTE);
    await c.refreshScreening();
    expect(note.screening).toBeUndefined();
    expect(c.unspent(BOOK.reserve, 'alice')).toEqual([note]);
  });

  it('reclaims a deposit', async () => {
    const env = screenedChain();
    const c = client(env.chain);
    const note = await c.deposit({ reserve: BOOK.reserve, id: 'alice', amount: 100n, blinding: '9' });
    await c.reclaimDeposit('7');
    const last = env.sent.at(-1)!;
    expect(last.to).toBe(BOOK.chamber);
    expect(decodeFunctionData({ abi: SCREENING, data: last.data })).toEqual({ functionName: 'reclaimDeposit', args: [7n] });
    expect(note.screening).toBe('reclaimed');
  });

  it('sets a reserve screener', async () => {
    const env = screenedChain();
    await client(env.chain).setReserveScreener(BOOK.reserve, SCREENER);
    expect(decodeFunctionData({ abi: SCREENING, data: env.sent[0].data })).toEqual({
      functionName: 'setReserveScreener', args: [BOOK.reserve, SCREENER],
    });
  });

  it('lists only live queued deposits for a reserve', async () => {
    const env = screenedChain({ queue: { '1': 1, '2': 0, '3': 2, '4': 1 } });
    const other = '0x8888888888888888888888888888888888888888';
    const events = [
      { args: { depositId: 1n, reserve: BOOK.reserve } },
      { args: { depositId: 2n, reserve: BOOK.reserve } },
      { args: { depositId: 3n, reserve: BOOK.reserve } },
      { args: { depositId: 4n, reserve: other } },
    ];
    const c = client({ ...env.chain, getEvents: async (_a, name) => (name === 'DepositQueued' ? events : []) });
    expect((await c.queuedDeposits(BOOK.reserve)).map((d) => d.depositId)).toEqual(['1']);
    expect((await c.queuedDeposits()).map((d) => d.depositId)).toEqual(['1', '4']);
    await expect(client(env.chain).queuedDeposits()).rejects.toThrow(/getEvents/);
  });

  it('approves and rejects batches with evidence', async () => {
    const env = screenedChain();
    const c = client(env.chain);
    const evidence = `0x${'ab'.repeat(32)}` as Hex;
    await c.approveDeposits(['1', 2n], evidence);
    await c.rejectDeposits([3n], evidence);
    expect(env.sent.map((tx) => decodeFunctionData({ abi: SCREENING, data: tx.data }))).toEqual([
      { functionName: 'approveDeposits', args: [[1n, 2n], evidence] },
      { functionName: 'rejectDeposits', args: [[3n], evidence] },
    ]);
  });
});
