import { describe, expect, it } from 'vitest';
import { account, isMist, OWNER_KEYWORD, ownerOf, secretOf } from '../src/identity.js';

const keccakOf = (label: string) => () => label as `0x${string}`;

describe('identity', () => {
  it('splits account and detects MIST', () => {
    expect(account('alice (MIST)')).toBe('alice');
    expect(account('alice')).toBe('alice');
    expect(isMist('alice (MIST)')).toBe(true);
    expect(isMist('alice')).toBe(false);
  });

  it('derives secret by shifting keccak', () => {
    expect(secretOf('alice (MIST)', '0x01', () => '0x100' as `0x${string}`)).toBe((0x100n >> 8n).toString());
    expect(OWNER_KEYWORD).toBe('0x6f776e6572');
  });

  it('derives MIST vs public owners', () => {
    const hash2 = (a: string, b: string) => `h2(${a},${b})`;
    expect(ownerOf('alice (MIST)', { secret: 's', hash2 })).toBe(`h2(s,${OWNER_KEYWORD})`);
    expect(ownerOf('alice', { address: '0x10', hash2 })).toBe(BigInt('0x10').toString());
  });

  it('rejects missing inputs', () => {
    const hash2 = (a: string) => a;
    expect(() => ownerOf('alice (MIST)', { hash2 })).toThrow(/secret required/);
    expect(() => ownerOf('alice', { hash2 })).toThrow(/address required/);
    expect(keccakOf('x')).toBeDefined();
  });
});
