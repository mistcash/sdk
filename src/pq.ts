// Post-quantum key exchange extracted from `playground/pq.js`.
// X-Wing (ML-KEM-768 + X25519) via @noble/post-quantum; hashing via viem.
// The manager's half can run anywhere — this tab plays both sides in the
// playground, hosts may split them across client/server.

import { ml_kem768_x25519 as xwing } from '@noble/post-quantum/hybrid.js';
import { concat, keccak256, toBytes, toHex } from 'viem';

/** Wire sizes: publicKey 1216, cipherText 1120. */
export const SIZES = xwing.lengths;

/** Manager long-term X-Wing pair, reproducible from its account key. */
export function managerKeys(privateKey: `0x${string}`) {
  return xwing.keygen(toBytes(keccak256(concat([privateKey, toHex('mist/xwing/v1')]))));
}

/** Short fingerprint for display and equality checks. */
export function fingerprint(bytes: Uint8Array): string {
  return keccak256(bytes).slice(2, 14);
}

/** User side: lock a fresh shared secret to the manager's public key. */
export function encapsulate(publicKey: Uint8Array) {
  return xwing.encapsulate(publicKey);
}

/** Manager side: unlock it with the secret key. */
export function decapsulate(cipherText: Uint8Array, secretKey: Uint8Array) {
  return xwing.decapsulate(cipherText, secretKey);
}

/**
 * Both sides turn the shared secret into the reserve's userKeyExchange,
 * a field element bound to the reserve and the member's identity:
 * `keccak(mist/ukx/v1, secret, reserve, mistAddr) >> 8`.
 */
export function deriveUkx(secret: Uint8Array, reserve: `0x${string}`, mistAddr: string): string {
  return (
    BigInt(
      keccak256(concat([toHex('mist/ukx/v1'), toHex(secret), reserve, toHex(BigInt(mistAddr), { size: 32 })])),
    ) >> 8n
  ).toString();
}
