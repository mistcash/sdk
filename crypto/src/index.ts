export interface Point {
  x: bigint;
  y: bigint;
}

export function generateKeyPair() {
  const privateKey = BigInt(Math.floor(Math.random() * 1000000));
  const publicKey: Point = { x: privateKey * 2n, y: privateKey * 3n };
  return { privateKey, publicKey };
}

export function encrypt(message: bigint): string {
  return message.toString();
}
