// Note selection extracted from `playground/app.js` (`unspent`, `pick`, `plan`).
// Pure functions: no DOM, no chain. The circuit takes at most two inputs,
// both proven against one tx tree root, so selection prefers one note, else
// the tightest covering pair from a single tx tree.

import type { Hex, Note } from './types.js';
import { isMist } from './identity.js';

/**
 * Notes for one identity at one reserve that are in the tx tree and not yet
 * spent. Screened deposits still awaiting approval are excluded.
 */
export function unspent(notes: Note[], reserve: Hex, id: string): Note[] {
  return notes.filter((n) => !n.spent && !n.screening && n.reserve === reserve && n.id === id);
}

/** Sum of note amounts. */
export function total(notes: Pick<Note, 'amount'>[]): bigint {
  return notes.reduce((s, n) => s + BigInt(n.amount), 0n);
}

/** The tx tree holding a note: Chamber's tree `t` holds `txArray[t * capacity, (t + 1) * capacity)`. */
const txTreeOf = (note: Note, capacity: number) => Math.floor(note.txIndex! / capacity);

/**
 * Pick at most two notes covering `target`: the smallest sufficient single
 * note, else the tightest pair. With `txTreeCapacity`, a pair must sit in
 * one tx tree (every note needs its `txIndex`). Returns `undefined` when
 * uncovered.
 */
export function pick(notes: Note[], target: bigint, txTreeCapacity?: number): Note[] | undefined {
  const sorted = [...notes].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1));
  const one = sorted.find((n) => BigInt(n.amount) >= target);
  if (one) return [one];
  const sameTree = (a: Note, b: Note) => !txTreeCapacity || txTreeOf(a, txTreeCapacity) === txTreeOf(b, txTreeCapacity);
  let best: Note[] | undefined;
  sorted.forEach((a, i) =>
    sorted.slice(i + 1).forEach((b) => {
      if (BigInt(a.amount) + BigInt(b.amount) >= target && sameTree(a, b) && (!best || total([a, b]) < total(best))) {
        best = [a, b];
      }
    }),
  );
  return best;
}

export interface PlanOk {
  reserve: Hex;
  notes: Note[];
  amount: bigint;
  change: bigint;
  /** Who submits: relayer for MIST notes, the owner for public notes. */
  submitter: 'relayer' | string;
  /** The tx tree every selected note sits in, when planned with `txTreeCapacity`. */
  txTree?: number;
}

export interface PlanErr {
  error: string;
  join?: boolean;
}

/**
 * Validate a spend before proving — the prover rejects the same cases with
 * worse errors. Mirrors `app.js plan()`.
 */
export function plan(opts: {
  id: string;
  amount: bigint;
  reserve: Hex;
  /** Members-only when > 0. */
  reserveUsers: bigint;
  isMember: boolean;
  notes: Note[];
  /** Account name behind `id` for self-submits; `relayer` is used for MIST. */
  submitterFor?: string;
  /**
   * Chamber's `txTreeCapacity`. When set, only notes with a known `txIndex`
   * are spendable, and a pair must share a tx tree.
   */
  txTreeCapacity?: number;
}): PlanOk | PlanErr {
  const { id, amount, reserve, reserveUsers, isMember, notes, txTreeCapacity } = opts;
  if (amount <= 0n) return { error: 'Enter a whole amount above zero.' };
  if (reserveUsers > 0n && !isMember) {
    return { error: 'Reserve is members only: join it first.', join: true };
  }
  const mine = unspent(notes, reserve, id).filter((n) => !txTreeCapacity || n.txIndex !== undefined);
  const selected = pick(mine, amount, txTreeCapacity);
  if (!selected) {
    return {
      error:
        total(mine) < amount
          ? `Your notes here hold ${total(mine)}.`
          : `A spend takes at most two notes${txTreeCapacity ? ' from one tx tree' : ''} and no two of yours cover this. Send some to yourself to merge them.`,
    };
  }
  return {
    reserve,
    notes: selected,
    amount,
    change: total(selected) - amount,
    submitter: isMist(id) ? 'relayer' : (opts.submitterFor ?? id),
    ...(txTreeCapacity ? { txTree: txTreeOf(selected[0], txTreeCapacity) } : {}),
  };
}
