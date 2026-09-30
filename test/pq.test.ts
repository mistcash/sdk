import { describe, expect, it } from 'vitest';
import { decapsulate, deriveUkx, encapsulate, fingerprint, managerKeys } from '../src/pq.js';

describe('pq key exchange', () => {
  it('round-trips a shared secret and derives matching ukx', () => {
    const manager = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`;
    const reserve = '0x75537828f2ce51be7289709686A69CbFDbB714F1' as `0x${string}`;
    const keys = managerKeys(manager);
    const { cipherText, sharedSecret } = encapsulate(keys.publicKey);
    const opened = decapsulate(cipherText, keys.secretKey);
    expect(fingerprint(opened)).toBe(fingerprint(sharedSecret));
    expect(deriveUkx(sharedSecret, reserve, '123')).toBe(deriveUkx(opened, reserve, '123'));
  });
});
