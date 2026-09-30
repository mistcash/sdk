import { describe, expect, it, vi } from 'vitest';
import { MistClient } from '../src/client.js';
import type { ChainAdapter, Hex } from '../src/types.js';

const BOOK = {
  chamber: '0x1111111111111111111111111111111111111111' as Hex,
  registrar: '0x2222222222222222222222222222222222222222' as Hex,
  reserve: '0x3333333333333333333333333333333333333333' as Hex,
  token: '0x4444444444444444444444444444444444444444' as Hex,
  verifier: '0x5555555555555555555555555555555555555555' as Hex,
};

function mockChain(seen: string[]): ChainAdapter {
  return {
    readContract: async (_addr, fn) => {
      if (fn === 'getTxArray') return [];
      if (fn === 'zkStateLeaf') return 0n;
      if (fn === 'reserveConfigs') return [0n, 7n, 0n];
      if (fn === 'registeredUsersCount') return 0n;
      return 0n;
    },
    sendTransaction: async (tx) => {
      seen.push(tx.to);
      return { receipt: { transactionHash: '0xabc' }, result: 42n };
    },
  };
}

const prover = {
  hash2: (a: string, b: string) => `h2(${a},${b})`,
  spend: async () => ({ status: 'success', proof: ['1'], publicInputs: ['10', '11', '12', '13'], ciphertext: [] }) as never,
};

describe('MistClient', () => {
  it('deposits via approve + deposit callbacks', async () => {
    const seen: string[] = [];
    const onTx = vi.fn();
    const client = new MistClient({
      book: BOOK,
      chainId: 31337,
      chain: mockChain(seen),
      prover,
      callbacks: { onTx },
      secretOf: () => 's',
      addressOf: () => '0x6666666666666666666666666666666666666666' as Hex,
    });
    const note = await client.deposit({ who: 'alice', reserve: BOOK.reserve, id: 'alice (MIST)', amount: 100n, blinding: '9' });
    expect(note.amount).toBe(100n);
    expect(seen).toEqual([BOOK.token, BOOK.chamber]);
    expect(onTx).toHaveBeenCalledTimes(2);
  });

  it('vetoes submits via onBeforeSend', async () => {
    const client = new MistClient({
      book: BOOK,
      chainId: 31337,
      chain: mockChain([]),
      prover,
      callbacks: { onBeforeSend: () => false },
      secretOf: () => 's',
      addressOf: () => '0x01' as Hex,
    });
    await expect(client.registerReserve('0x01' as Hex, 1n, 2n)).rejects.toThrow(/vetoed/);
  });

  it('spends with injected state and mock prover', async () => {
    const seen: string[] = [];
    const client = new MistClient({
      book: BOOK,
      chainId: 31337,
      chain: mockChain(seen),
      prover,
      secretOf: () => 's',
      addressOf: () => '0x01' as Hex,
    });
    client.notes = [{ reserve: BOOK.reserve, id: 'alice', blinding: '1', amount: 100n }];
    const { secs } = await client.spend({
      id: 'alice',
      amount: 40n,
      to: 'bob',
      reserve: BOOK.reserve,
      blindingA: '2',
      blindingB: '3',
      state: { txLeaves: [], stateLeaves: [], userLeaves: [], reserveConfig: '7', reserveUsers: 0n, ukx: '0' },
    });
    expect(typeof secs).toBe('number');
    expect(seen).toEqual([BOOK.chamber]);
    expect(client.notes.filter((x) => !x.spent)).toHaveLength(2);
  });
});
