import { describe, expect, it } from 'vitest';
import { buildSpendRequest, foldCiphertext, proveSpend, serializeSpendRequest } from '../src/proving.js';

describe('proving adapter', () => {
  it('pads inputs to two slots', () => {
    const req = buildSpendRequest({
      chainId: 31337,
      chamber: '0x01',
      reserve: '0x02',
      token: '0x03',
      reserveConfig: '0',
      owner: '1',
      ownerSecret: '',
      userKeyExchange: '0',
      keyIndex: 7,
      inputs: [{ Blinding: '1', Amount: 10n }],
      outputs: [
        { id: 'bob (MIST)', Owner: '2', Blinding: '3', Amount: 4n },
        { id: 'alice (MIST)', Owner: '1', Blinding: '5', Amount: 6n },
      ],
      withdraw: 0n,
      withdrawTo: '0',
      txLeaves: [],
      stateLeaves: [],
      userLeaves: [],
    });
    expect(req.In).toHaveLength(2);
    expect(req.KeyIndex).toBe(7);
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
    expect(foldCiphertext((a, b) => `${a}+${b}`, ['x', 'y', 'z'])).toBe('x+y+z');
  });
});