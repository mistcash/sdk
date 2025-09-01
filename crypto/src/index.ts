import { poseidonHashBN254, initSync, init as initGaraga } from "garaga";

export async function txSecretHash(key: string, to: string): Promise<bigint> {
  // should use bn245 poseidon hash as used in circom
  // hash key and recipient to generate tx secret
  if (key && to) {
    // both should be non zero
    return hash(BigInt(key), BigInt(to));
  } else {
    // both should be non zero
    return BigInt(0);
  }
}

export async function hash(a: bigint, b: bigint): Promise<bigint> {
  try {
    return poseidonHashBN254(a, b);
  } catch (error) {
    await initGaraga();
    try {
      return poseidonHashBN254(a, b);
    } catch (error) {
      console.error("Failed hashing with garaga.");
      throw error;
    }
  }
}