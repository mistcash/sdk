// Contract surface. The ABIs are generated from `mistcash/core` by
// `npm run abis` (scripts/sync-abis.mjs, `forge inspect <contract> abi`) into
// abis.generated.ts; nothing here is hand-written. `npm run abis:check` fails
// when they drift from core. The SDK imports viem for encoding and keccak
// (identity, pq, client), but the ChainAdapter keeps it independent of any
// one client library for transport.

import type { Hex } from './types.js';
import { abisHumanReadable, coreAbiHumanReadable, screeningAbiHumanReadable } from './abis.generated.js';

/**
 * Deposit screening (core#157): a reserve's screener approves queued
 * deposits into the tx tree; depositors reclaim pending or rejected ones.
 */
export const SCREENING_ABI = screeningAbiHumanReadable;

/**
 * The reads and writes a host's ChainAdapter needs for MistClient and the
 * playground, across Chamber, Reserve, the registrar and the token.
 */
export const CORE_ABI = [...coreAbiHumanReadable, ...SCREENING_ABI] as const;

/** Full per-contract decoding surface, as human-readable signatures. */
export const ABIS = abisHumanReadable;

/** Deployment address book (`core-deploy/dist/deployments/*.json`). */
export interface AddressBook {
  chamber: Hex;
  registrar: Hex;
  reserve: Hex;
  token: Hex;
  verifier: Hex;
}

/** The 14 public inputs of `handleZkp`, in order (`explorer.js` PUBLIC_INPUTS). */
export const PUBLIC_INPUTS = [
  ['nullifier1', 'burns an input note, without naming it'],
  ['nullifier2', 'burns the second input, or a dummy'],
  ['newNote1', 'a new note hash'],
  ['newNote2', 'a new note hash, often the change'],
  ['transactionsRoot', 'a note tree root the proof was made against'],
  ['stateRoot', 'the zkState root: reserve membership'],
  ['withdrawAmount', 'public, 0 unless withdrawing'],
  ['withdrawAsset', 'the token withdrawn'],
  ['withdrawReserve', 'the reserve paying out'],
  ['withdrawTo', 'the public recipient'],
  ['txPayload', 'free metadata the prover may bind; the playground leaves it 0'],
  ['owner', "the notes' owner: the same on every spend by one identity"],
  ['authDone', '1: the proof authorizes the spend; 0: the owner submits it'],
  ['auditorCommitments', "fold of the outputs encrypted for the reserve's manager, 0 at a reserve without members"],
] as const;
