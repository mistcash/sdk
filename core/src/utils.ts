import { AccountInterface, Contract, ProviderInterface, Uint256 } from 'starknet';
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET, ChamberTypedContract } from '@mistcash/config';
import { txSecret, txHash } from '@mistcash/crypto';
import { Asset } from './types';

/**
 * Returns Chamber starknet contract
 * @param provider Starknet provider
 * @returns Typed chamber contract
 */
export function getChamber(provider?: ProviderInterface | AccountInterface): ChamberTypedContract {
	return new Contract(
		CHAMBER_ABI,
		CHAMBER_ADDR_MAINNET,
		provider
	).typedv2(CHAMBER_ABI)
}

/**
 * Fetch transaction assets from the chamber contract.
 * @param contract chamber contract instance.
 * @param valKey claiming key.
 * @param valTo recipient.
 * @returns The asset associated with the transaction.
 */
export async function fetchTxAssets(contract: ChamberTypedContract, valKey: string, valTo: string): Promise<Asset> {
	const asset = await contract.read_tx(await txSecret(valKey, valTo))
	let amount = asset.amount;
	if (typeof amount == 'number') {
		amount = BigInt(amount);

	} else if (typeof amount != 'bigint') {
		amount = BigInt(`${amount.low}`);
	}
	return { amount, addr: asset.addr }
}

/**
 * Checks if the transaction exists on the tree in the contract
 * gets tx array from the contract and returns true if tx is found in the leaves
 * @param contract chamber contract instance.
 * @param valKey claiming key.
 * @param valTo recipient.
 * @param tokenAddr token address.
 * @param amount token amount.
 * @returns True if the transaction exists, false otherwise.
 */
export async function checkTxExists(contract: ChamberTypedContract, valKey: string, valTo: string, tokenAddr: string, amount: string): Promise<boolean> {
	return await getTxIndexInTree(await contract.tx_array() as bigint[], valKey, valTo, tokenAddr, amount) !== -1;
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
export async function getTxIndexInTree(leaves: bigint[], valKey: string, valTo: string, tokenAddr: string, amount: string): Promise<number> {
	const tx_hash = await txHash(valKey, valTo, tokenAddr, amount)
	return leaves.indexOf(tx_hash);
}
