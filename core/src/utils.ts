import { AccountInterface, Contract, ProviderInterface } from 'starknet';
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET, ChamberTypedContract } from '@mistcash/config';
import { txSecretHash } from '@mistcash/crypto';
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
	const asset = await contract.read_tx(await txSecretHash(valKey, valTo))
	let amount = asset.amount;
	if (typeof amount == 'number') {
		amount = BigInt(amount);

	} else if (typeof amount != 'bigint') {
		amount = BigInt(`${amount.low}`);
	}
	return { amount, addr: asset.addr }
}
