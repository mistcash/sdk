// Identity helpers extracted from `playground/chain.js`.
// A note owner is an account address (public) or a MIST owner (private).
// Pure functions with injected hash primitives so the SDK stays
// transport-agnostic and unit-testable without wasm.

import { keccak256 as viemKeccak256 } from 'viem';

/** "owner" as hex, the keyword MIST owner = H2(secret, keyword) binds to. */
export const OWNER_KEYWORD = '0x6f776e6572';

/** `alice (MIST)` -> `alice`. */
export const account = (id: string): string => id.split(' ')[0];

/** True for private identities (`alice (MIST)`), false for public addresses. */
export const isMist = (id: string): boolean => id.endsWith('(MIST)');

type KeccakBytes = (bytes: Uint8Array) => `0x${string}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Hash2 = (a: string, b: string) => string;

/** MIST secret for an identity: `keccak(privateKey) >> 8` as a field string. */
export function secretOf(id: string, privateKey: `0x${string}`, keccak256: (data: any) => `0x${string}`): string {
  return (BigInt(keccak256(privateKey as never)) >> 8n).toString();
}

/**
 * Field-element owner for an identity.
 * - MIST: `hash2(secret, OWNER_KEYWORD)` — the proof authorizes spends.
 * - Public: the account address as a decimal field string.
 */
export function ownerOf(
  id: string,
  opts: { secret?: string; address?: string; hash2: Hash2 },
): string {
  if (isMist(id)) {
    if (opts.secret === undefined) throw new Error(`ownerOf: secret required for MIST identity ${id}`);
    return opts.hash2(opts.secret, OWNER_KEYWORD);
  }
  if (opts.address === undefined) throw new Error(`ownerOf: address required for public identity ${id}`);
  return BigInt(opts.address).toString();
}

/** Fresh field-element blinding: `keccak(random32) >> 8`. */
export function rand(
  keccak256: KeccakBytes | ((data: any) => `0x${string}`) = viemKeccak256 as KeccakBytes,
  randomBytes: (len: number) => Uint8Array = defaultRandom,
): string {
  const bytes = randomBytes(32);
  return (BigInt((keccak256 as KeccakBytes)(bytes)) >> 8n).toString();
}

function defaultRandom(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

/** Address -> account name, for display and manager checks. */
export function nameOf(address: string, accounts: Record<string, { address: string }>): string {
  return (
    Object.keys(accounts).find((n) => accounts[n].address.toLowerCase() === address.toLowerCase()) ?? address
  );
}
