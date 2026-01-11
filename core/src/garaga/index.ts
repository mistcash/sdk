
import { prove_groth16, vkJson } from '../gnark';
import { Witness } from '../types';
import * as garaga from 'garaga';
import { Groth16Proof, Groth16VerifyingKey, parseGroth16ProofFromObject, parseGroth16VerifyingKeyFromObject } from './parsingUtils';

export async function full_prove(witness: Witness): Promise<bigint[]> {
	await garaga.init();
	const g16proof = await prove_groth16(witness);
	if (g16proof.status === 'error') {
		throw new Error(`Proof generation failed: ${g16proof.error} - ${g16proof.message}`);
	} else {
		const vk: Groth16VerifyingKey = parseGroth16VerifyingKeyFromObject(vkJson);
		const proof: Groth16Proof = parseGroth16ProofFromObject(g16proof.proof, g16proof.publicInputs);

		return garaga.getGroth16CallData(proof, vk, garaga.CurveId.BN254);
	}
}

export async function initGaraga(): Promise<void> {
	await garaga.init();
}