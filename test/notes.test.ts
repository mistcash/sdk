import { describe, expect, it } from 'vitest';
import { pick, plan, total, unspent } from '../src/notes.js';
import type { Note } from '../src/types.js';

const n = (amount: bigint, id = 'alice (MIST)'): Note => ({
  reserve: '0x01',
  id,
  blinding: '1',
  amount,
});

describe('notes', () => {
  it('totals amounts', () => {
    expect(total([n(3n), n(4n)])).toBe(7n);
  });

  it('prefers one note, else tightest pair', () => {
    expect(pick([n(10n), n(100n)], 50n)?.map((x) => x.amount)).toEqual([100n]);
    expect(pick([n(10n), n(30n), n(40n)], 50n)?.map((x) => x.amount)).toEqual([10n, 40n]);
    expect(pick([n(10n)], 50n)).toBeUndefined();
  });

  it('plans submitter routing and member gating', () => {
    const notes = [n(100n)];
    const ok = plan({ id: 'alice (MIST)', amount: 40n, reserve: '0x01', reserveUsers: 1n, isMember: true, notes });
    expect(ok).toMatchObject({ change: 60n, submitter: 'relayer' });
    const gated = plan({ id: 'alice (MIST)', amount: 40n, reserve: '0x01', reserveUsers: 1n, isMember: false, notes });
    expect(gated).toMatchObject({ join: true });
    const pub = plan({ id: 'alice', amount: 40n, reserve: '0x01', reserveUsers: 0n, isMember: false, notes: [n(100n, 'alice')] });
    expect(pub).toMatchObject({ submitter: 'alice' });
  });

  it('never spends screened deposits outside the tree', () => {
    const notes = (['pending', 'rejected', 'reclaimed'] as const).map((screening) => ({ ...n(100n), screening }));
    expect(unspent(notes, '0x01', 'alice (MIST)')).toEqual([]);
    expect(plan({ id: 'alice (MIST)', amount: 40n, reserve: '0x01', reserveUsers: 0n, isMember: false, notes })).toMatchObject({
      error: 'Your notes here hold 0.',
    });
    const approved = { ...n(100n), depositId: '1' };
    expect(unspent([...notes, approved], '0x01', 'alice (MIST)')).toEqual([approved]);
  });
});
