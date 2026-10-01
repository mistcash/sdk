import { describe, expect, it } from 'vitest';
import { pick, plan, total } from '../src/notes.js';
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

  it('routes a public self-submit through the supplied account name', () => {
    // Without this, a host cannot show "submitted by alice" for an id that is
    // an address rather than an account name.
    const pub = plan({
      id: '0xabc', amount: 10n, reserve: '0x01', reserveUsers: 0n, isMember: false,
      notes: [n(100n, '0xabc')], submitterFor: 'alice',
    });
    expect(pub).toMatchObject({ submitter: 'alice' });
  });

  it('rejects a non-positive amount before touching the notes', () => {
    for (const amount of [0n, -1n]) {
      expect(plan({ id: 'alice', amount, reserve: '0x01', reserveUsers: 0n, isMember: false, notes: [] }))
        .toEqual({ error: 'Enter a whole amount above zero.' });
    }
  });

  it('distinguishes "not enough value" from "no two notes cover this"', () => {
    // The two branches of the same error site: the circuit takes at most two
    // inputs, so a sufficient total that no pair satisfies needs its own advice.
    const thin = plan({
      id: 'alice', amount: 50n, reserve: '0x01', reserveUsers: 0n, isMember: false,
      notes: [n(30n, 'alice')],
    });
    expect(thin).toEqual({ error: 'Your notes here hold 30.' });

    // 30+30+30 = 90 is enough in total, but no single pair reaches 80.
    const unpairable = plan({
      id: 'alice', amount: 80n, reserve: '0x01', reserveUsers: 0n, isMember: false,
      notes: [n(30n, 'alice'), n(30n, 'alice'), n(30n, 'alice')],
    });
    expect(unpairable).toEqual({
      error: 'A spend takes at most two notes and no two of yours cover this. Send some to yourself to merge them.',
    });
  });

  it('replaces a covering pair when a later one is tighter', () => {
    // The circuit charges change, so the tightest covering pair is worth more
    // than the first one found. Sorted: 10, 44, 46, 81. [10,81] covers 90 at 91,
    // then [44,46] covers it at 90 and must win.
    expect(pick([n(10n), n(44n), n(46n), n(81n)], 90n)?.map((x) => x.amount)).toEqual([44n, 46n]);
  });

  it('ignores notes held at another reserve or by another identity', () => {
    const notes: Note[] = [
      { ...n(100n, 'alice'), reserve: '0x02' },
      { ...n(100n, 'bob') },
    ];
    expect(plan({ id: 'alice', amount: 10n, reserve: '0x01', reserveUsers: 0n, isMember: false, notes }))
      .toEqual({ error: 'Your notes here hold 0.' });
  });
});
