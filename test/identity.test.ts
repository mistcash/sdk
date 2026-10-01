import { describe, expect, it } from 'vitest';
import { account, isMist, nameOf, OWNER_KEYWORD, ownerOf, rand, secretOf } from '../src/identity.js';

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

  it('derives MIST vs public owners', async () => {
    const hash2 = (a: string, b: string) => `h2(${a},${b})`;
    expect(await ownerOf('alice (MIST)', { secret: 's', hash2 })).toBe(`h2(s,${OWNER_KEYWORD})`);
    expect(await ownerOf('alice', { address: '0x10', hash2 })).toBe(BigInt('0x10').toString());
  });

  it('rejects missing inputs', async () => {
    const hash2 = (a: string) => a;
    await expect(ownerOf('alice (MIST)', { hash2 })).rejects.toThrow(/secret required/);
    await expect(ownerOf('alice', { hash2 })).rejects.toThrow(/address required/);
  });

  it('rand() returns a field element below 2^248 and differs between calls', () => {
    const a = rand();
    const b = rand();
    const limit = 1n << 248n;
    expect(BigInt(a)).toBeLessThan(limit);
    expect(BigInt(b)).toBeLessThan(limit);
    expect(a).not.toBe(b);
  });

  it('rand() honours injected keccak and randomness', () => {
    // Both are injectable so a host can supply its own CSPRNG; pinning the
    // derivation keeps the blinding scheme from drifting silently.
    const out = rand(
      () => '0x100' as `0x${string}`,
      () => new Uint8Array(32),
    );
    expect(out).toBe((0x100n >> 8n).toString());
  });

  it('resolves an address to its account name, case-insensitively', () => {
    const accounts = { alice: { address: '0xAbC0000000000000000000000000000000000001' } };
    expect(nameOf('0xAbC0000000000000000000000000000000000001', accounts)).toBe('alice');
    // Checksums differ only in case; an exact match would miss these.
    expect(nameOf('0xabc0000000000000000000000000000000000001', accounts)).toBe('alice');
  });

  it('falls back to the raw address when no account matches', () => {
    const accounts = { alice: { address: '0x01' } };
    expect(nameOf('0xdead', accounts)).toBe('0xdead');
  });
});
