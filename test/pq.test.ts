import { describe, expect, it } from 'vitest';
import { decapsulate, deriveUkx, encapsulate, fingerprint, managerKeys, SIZES } from '../src/pq.js';

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

  it('derives the manager keypair reproducibly from the account key', () => {
    // The SDK claims this is reproducible so a host can rebuild the manager's
    // identity without storing a second secret.
    const manager = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`;
    expect(fingerprint(managerKeys(manager).publicKey)).toBe(fingerprint(managerKeys(manager).publicKey));
    expect(fingerprint(managerKeys(manager).publicKey)).toBe('9adbfc8d8e85');

    const other = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690e' as `0x${string}`;
    expect(fingerprint(managerKeys(other).publicKey)).not.toBe('9adbfc8d8e85');
  });

  it('pins the ukx derivation as a known answer', () => {
    // A round-trip test cannot catch a derivation that is wrong on *both*
    // sides: both would agree and the ukx would simply be the wrong field
    // element, which the circuit would reject. This vector pins the wire
    // format. If it changes, that is a deliberate protocol change, not a bump.
    const secret = new Uint8Array(32).fill(7);
    expect(deriveUkx(secret, '0x75537828f2ce51be7289709686A69CbFDbB714F1', '123')).toBe(
      '397928742296520657586198190989427925029484892815819751969940131819560182303',
    );
  });

  it('binds the ukx to the reserve and the member address', () => {
    const secret = new Uint8Array(32).fill(7);
    const reserve = '0x75537828f2ce51be7289709686A69CbFDbB714F1' as `0x${string}`;
    const other = '0x1111111111111111111111111111111111111111' as `0x${string}`;
    expect(deriveUkx(secret, reserve, '123')).not.toBe(deriveUkx(secret, other, '123'));
    expect(deriveUkx(secret, reserve, '123')).not.toBe(deriveUkx(secret, reserve, '124'));
  });

  it('exposes the documented wire sizes', () => {
    expect(SIZES.publicKey).toBe(1216);
    expect(SIZES.cipherText).toBe(1120);
  });
});
