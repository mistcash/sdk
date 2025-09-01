import { AccountInterface, Contract, ProviderInterface } from 'starknet';
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET } from '@mistcash/config';

export function getContract(provider?: ProviderInterface | AccountInterface): Contract {
	return new Contract(
		CHAMBER_ABI,
		CHAMBER_ADDR_MAINNET,
		provider
	)
}

export const devStr = (val: string) => devVal(val, '') as string;

export const devVal = <T,>(val: T, deflt: T | undefined = undefined) => {
	return typeof window !== 'undefined' && window.localStorage.getItem('devVals') ? val : deflt
};
