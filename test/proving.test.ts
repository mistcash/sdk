import { describe, expect, it } from 'vitest';
import { buildSpendRequest, foldCiphertext, proveSpend } from '../src/proving.js';

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
      inputs: [{ Blinding: '1', Amount: '10' }],
      outputs: [
        { id: 'bob (MIST)', Owner: '2', Blinding: '3', Amount: 4 },
        { id: 'alice (MIST)', Owner: '1', Blinding: '5', Amount: 6 },
      ],
      withdraw: 0,
      withdrawTo: '0',
      txLeaves: [],
      stateLeaves: [],
      userLeaves: [],
    });
    expect(req.In).toHaveLength(2);
    expect(req.KeyIndex).toBe(7);
  });

  it('throws on prover error and folds ciphertext', async () => {
    await expect(proveSpend({ hash2: (a) => a, spend: () => ({ status: 'error', error: 'bad' }) }, {} as never)).rejects.toThrow('bad');
    expect(foldCiphertext((a, b) => `${a}+${b}`, ['x', 'y', 'z'])).toBe('x+y+z');
  });
});
