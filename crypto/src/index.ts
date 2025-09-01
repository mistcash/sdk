import { poseidonHashBN254 } from "garaga";

export function txSecretHash(key: string, to: string): bigint {
  // should use bn245 poseidon hash as used in circom
  // hash key and recipient to generate tx secret
  if (key && to) {
    // both should be non zero
    return poseidonHashBN254(BigInt(key), BigInt(to));
  } else {
    // both should be non zero
    return BigInt(0);
  }
}