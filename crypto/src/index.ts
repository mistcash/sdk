import { poseidonHashBN254, initSync, init as initGaraga } from "garaga";

// Poseidon hash used in the circuits and the contract
// Uses https://github.com/keep-starknet-strange/garaga
// Wrapped in helpers to init garaga WASM if errors
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

// This returns the transaction secret from claiming key and recipient
// preimage of the return value is never available on chain
// hence we refer to this as the transaction secret
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

// This returns the full hash of the transaction which is present on the merkle tree
// This can be used to verify that a transaction exists
export async function txHash(valKey: string, valTo: string, tokenAddr: string, amount: string): Promise<bigint> {
  const tx_secret = await txSecretHash(valKey, valTo);
  return hash(await hash(tx_secret, BigInt(tokenAddr)), BigInt(amount));
}
