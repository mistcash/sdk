import { describe, expect, it } from 'vitest';
import { buildSpendRequest, foldCiphertext, pickUnusedKeyIndex, proveSpend, serializeSpendRequest, type SpendInNote, type SpendOutNote } from '../src/proving.js';

describe('proving adapter', () => {
  it('pads inputs to two slots with random dummy blinding', () => {
    const opts = {
      chainId: 31337,
      chamber: '0x01' as const,
      reserve: '0x02' as const,
      token: '0x03' as const,
      reserveConfig: '0',
      owner: '1',
      ownerSecret: '',
      userKeyExchange: '0',
      keyIndex: 7,
      inputs: [{ Blinding: '1', Amount: 10n }] as SpendInNote[],
      outputs: [
        { id: 'bob (MIST)', Owner: '2', Blinding: '3', Amount: 4n },
        { id: 'alice (MIST)', Owner: '1', Blinding: '5', Amount: 6n },
      ] as SpendOutNote[],
      withdraw: 0n,
      withdrawTo: '0' as const,
      txLeaves: [] as string[],
      stateLeaves: [] as string[],
      userLeaves: [] as string[],
    };
    const a = buildSpendRequest(opts);
    const b = buildSpendRequest(opts);
    expect(a.In).toHaveLength(2);
    expect(a.KeyIndex).toBe(7);
    expect(a.In[1].Blinding).not.toBe(b.In[1].Blinding);
    expect(a.In[1].Amount).toBe(0n);
  });

  it('serializes bigint amounts as bare JSON numbers', () => {
    const req = buildSpendRequest({
      chainId: 31337,
      chamber: '0x01',
      reserve: '0x02',
      token: '0x03',
      reserveConfig: '0',
      owner: '1',
      ownerSecret: '',
      userKeyExchange: '0',
      keyIndex: 0,
      inputs: [{ Blinding: '1', Amount: 9007199254740993n }],
      outputs: [
        { id: null, Owner: '0', Blinding: '0', Amount: 0n },
        { id: null, Owner: '0', Blinding: '0', Amount: 0n },
      ],
      withdraw: 0n,
      withdrawTo: '0',
      txLeaves: [],
      stateLeaves: [],
      userLeaves: [],
    });
    const json = serializeSpendRequest(req);
    expect(json).toContain('"Amount":9007199254740993');
    expect(json).toContain('"Withdraw":0');
  });

  it('rejects amounts >= 2^64', () => {
    const req = buildSpendRequest({
      chainId: 31337,
      chamber: '0x01',
      reserve: '0x02',
      token: '0x03',
      reserveConfig: '0',
      owner: '1',
      ownerSecret: '',
      userKeyExchange: '0',
      keyIndex: 0,
      inputs: [{ Blinding: '1', Amount: 2n ** 64n }],
      outputs: [
        { id: null, Owner: '0', Blinding: '0', Amount: 0n },
        { id: null, Owner: '0', Blinding: '0', Amount: 0n },
      ],
      withdraw: 0n,
      withdrawTo: '0',
      txLeaves: [],
      stateLeaves: [],
      userLeaves: [],
    });
    expect(() => serializeSpendRequest(req)).toThrow(/uint64/);
  });

  it('throws on prover error and folds ciphertext', async () => {
    const req = buildSpendRequest({
      chainId: 31337, chamber: '0x01', reserve: '0x02', token: '0x03', reserveConfig: '0',
      owner: '1', ownerSecret: '', userKeyExchange: '0', keyIndex: 0,
      inputs: [], outputs: [{ id: null, Owner: '0', Blinding: '0', Amount: 0n }, { id: null, Owner: '0', Blinding: '0', Amount: 0n }],
      withdraw: 0n, withdrawTo: '0', txLeaves: [], stateLeaves: [], userLeaves: [],
    });
    await expect(proveSpend({ hash2: (a) => a, spend: () => ({ status: 'error', error: 'bad' }) }, req)).rejects.toThrow('bad');
    expect(await foldCiphertext((a, b) => `${a}+${b}`, ['x', 'y', 'z'])).toBe('x+y+z');
  });

  it('rejects prover output with wrong proof length', async () => {
    const req = buildSpendRequest({
      chainId: 31337, chamber: '0x01', reserve: '0x02', token: '0x03', reserveConfig: '0',
      owner: '1', ownerSecret: '', userKeyExchange: '0', keyIndex: 0,
      inputs: [], outputs: [{ id: null, Owner: '0', Blinding: '0', Amount: 0n }, { id: null, Owner: '0', Blinding: '0', Amount: 0n }],
      withdraw: 0n, withdrawTo: '0', txLeaves: [], stateLeaves: [], userLeaves: [],
    });
    await expect(proveSpend(
      { hash2: (a) => a, spend: () => ({ status: 'success', proof: ['1'], publicInputs: Array(14).fill('0') }) },
      req,
    )).rejects.toThrow(/proof elements/);
    await expect(proveSpend(
      { hash2: (a) => a, spend: () => ({ status: 'success', proof: Array(8).fill('0'), publicInputs: ['1'] }) },
      req,
    )).rejects.toThrow(/public inputs/);
  });

  it('pickUnusedKeyIndex selects from unused range and throws when exhausted', () => {
    const used = new Set<number>();
    const a = pickUnusedKeyIndex(used);
    const b = pickUnusedKeyIndex(used);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(256);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(256);
    const almostFull = new Set(Array.from({ length: 255 }, (_, i) => i));
    const last = pickUnusedKeyIndex(almostFull);
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThan(256);
    expect(almostFull.has(last)).toBe(false);
    const full = new Set(Array.from({ length: 256 }, (_, i) => i));
    expect(() => pickUnusedKeyIndex(full)).toThrow(/256 key indices/);
  });
});