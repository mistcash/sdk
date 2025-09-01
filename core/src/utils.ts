import { AccountInterface, Contract, ProviderInterface } from 'starknet';
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET, ChamberTypedContract } from '@mistcash/config';
import { txSecret, txHash } from '@mistcash/crypto';
import { Asset } from './types';

export function getChamber(provider?: ProviderInterface | AccountInterface): ChamberTypedContract {
	return new Contract(
		CHAMBER_ABI,
		CHAMBER_ADDR_MAINNET,
		provider
	).typedv2(CHAMBER_ABI)
}

export const devStr = (val: string) => devVal(val, '') as string;

export const devVal = <T,>(val: T, deflt: T | undefined = undefined) => {
	return typeof window !== 'undefined' && window.localStorage.getItem('devVals') ? val : deflt
};

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

export async function checkTxExists(contract: ChamberTypedContract, valKey: string, valTo: string, tokenAddr: string, amount: string): Promise<boolean> {
	return await getTxIndexInTree(contract, valKey, valTo, tokenAddr, amount) !== -1;
}

export async function getTxIndexInTree(contract: ChamberTypedContract, valKey: string, valTo: string, tokenAddr: string, amount: string): Promise<number> {
	const leaves = await contract.tx_array() as bigint[];
	const tx_hash = await txHash(valKey, valTo, tokenAddr, amount)
	return leaves.indexOf(tx_hash);
}
