import { AccountInterface, Contract, ProviderInterface, Uint256 } from 'starknet';
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET, ChamberTypedContract } from '@mistcash/config';
import { Asset } from './gnark/types';
import { hash2, hash2Sync, hash3Sync } from './gnark';

export function txSecret(key: string, to: string): string {
  return hash2Sync(key, to);
}

// This returns the full hash of the transaction which is present on the merkle tree
// This can be used to verify that a transaction exists

export function hash_with_asset(secrets_hash: string, asset: string, amount: string): string {
  return hash3Sync(secrets_hash, asset, amount)
}

export function txHash(key: string, owner: string, tokenAddr: string, amount: string,): bigint {
  const tx_secret = txSecret(key, owner);
  return BigInt(hash_with_asset(tx_secret, tokenAddr, amount));
}

export function generateClaimingKey(): string {
  let max = 2 ** 48; // Max precision for JS Math.random is 52 bits
  const keyParts = [
    Math.floor(Math.random() * max).toString(16),
    Math.floor(Math.random() * max).toString(16),
    Math.floor(Math.random() * max).toString(16),
    Math.floor(Math.random() * max).toString(16),
    Math.floor(Math.random() * max).toString(16),
  ];
  const key = '0x' + keyParts.join('');
  return key;
}

/**
 * Returns Chamber starknet contract
 * @param provider Starknet provider
 * @returns Typed chamber contract
 */
export function getChamber(
  providerOrAccount?: ProviderInterface | AccountInterface,
): ChamberTypedContract {
  return new Contract({
    abi: CHAMBER_ABI,
    address: CHAMBER_ADDR_MAINNET,
    providerOrAccount,
  }).typedv2(CHAMBER_ABI);
}

/**
 * Fetch transaction assets from the chamber contract.
 * ⚠️ Will show assets even if transaction is spent
 * ⚠️ Contract has no way of knowing which transaction is spent
 * @param contract chamber contract instance.
 * @param valKey claiming key.
 * @param valTo recipient.
 * @returns The asset associated with the transaction.
 */
export async function fetchTxAssets(
  contract: ChamberTypedContract,
  valKey: string,
  valTo: string,
): Promise<Asset> {
  const asset = await contract.read_tx(await txSecret(valKey, valTo));
  let amount = asset.amount;
  if (typeof amount == 'number') {
    amount = BigInt(amount);
  } else if (typeof amount != 'bigint') {
    amount = BigInt(`${amount.low}`);
  }
  let addr = asset.addr as string | bigint;
  if (typeof addr === 'bigint') {
    addr = '0x' + addr.toString(16);
  }
  return { amount, addr };
}

/**
 * Checks if the transaction exists on the tree in the contract
 * gets tx array from the contract and returns true if tx is found in the leaves
 * ⚠️ Will show transaction exists even if it is spent
 * ⚠️ Contract has no way of knowing which transaction is spent
 * @param contract chamber contract instance.
 * @param valKey claiming key.
 * @param valTo recipient.
 * @param tokenAddr token address.
 * @param amount token amount.
 * @returns True if the transaction exists, false otherwise.
 */
export async function checkTxExists(
  contract: ChamberTypedContract,
  valKey: string,
  valTo: string,
  tokenAddr: string,
  amount: string,
): Promise<boolean> {
  // fetch existing transactions
  const allTransactions = await contract.tx_array();

  // generate full transaction hash
  const tx = await txHash(valKey, valTo, tokenAddr, amount);

  // check if your transaction is in the list
  allTransactions.indexOf(tx);

  return (
    (await getTxIndexInTree(
      (await contract.tx_array()) as bigint[],
      valKey,
      valTo,
      tokenAddr,
      amount,
    )) !== -1
  );
}

/**
 * Receives tx leaves array and returns true if tx is found on the tree
 * @param contract chamber contract instance.
 * @param valKey claiming key.
 * @param valTo recipient.
 * @param tokenAddr token address.
 * @param amount token amount.
 * @returns index of the transaction
 */
export async function getTxIndexInTree(
  leaves: bigint[],
  valKey: string,
  valTo: string,
  tokenAddr: string,
  amount: string,
): Promise<number> {
  const tx_hash = await txHash(valKey, valTo, tokenAddr, amount);
  return leaves.indexOf(tx_hash);
}

export function fmtAmount(amount: bigint, decimals: number): string {
  // Convert bigint amount to string with specified decimal places
  const factor = BigInt(10 ** decimals);
  const integerPart = amount / factor;
  const fractionalPart = amount % factor;

  // Pad fractional part with leading zeros to match decimal places
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  // Remove trailing zeros
  const trimmedFractional = fractionalStr.replace(/0+$/, '') || '0';

  return `${integerPart.toString()}.${trimmedFractional}`;
}

export function fmtAmtToBigInt(amountStr: string, decimals: number): bigint {
  let amt = BigInt(Math.floor(1_000_000 * +amountStr));
  if (decimals > 6) {
    // Mul by 10**12 for decimal points == 18 for all token but usdc
    amt = BigInt(10 ** (decimals - 6)) * amt;
  }
  return amt;
}
