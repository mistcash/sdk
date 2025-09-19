import { useCallback, useEffect, useState } from 'react';
import { ProofData, UltraHonkBackend, reconstructHonkProof } from '@aztec/bb.js';
import { CompiledCircuit, InputMap, Noir } from '@noir-lang/noir_js';
import { withdrawCircuit as circuitData } from '@mistcash/config';
import { getZKHonkCallData } from "garaga";
const HonkFlavor = {
	Starknet: 1,
};
import { WitnessData } from '@mistcash/config';

const honkBackendOpts = { starknetZK: true };

export function useNoirProof() {
	const [isGeneratingProof, setIsGeneratingProof] = useState(false);
	const [noir_, setNoir] = useState<Noir | null>(null);
	const [vk_, setVK] = useState<Uint8Array | null>(null);
	const [backend_, setBackend] = useState<UltraHonkBackend | null>(null);

	useEffect(() => {
		// setup circuits
		const instanceNoir = new Noir(circuitData as CompiledCircuit);
		setNoir(instanceNoir);
		const instanceBackend = new UltraHonkBackend(circuitData.bytecode);
		setBackend(instanceBackend);
		(async () => {
			setVK(await instanceBackend.getVerificationKey(honkBackendOpts));
		})()
	}, []);

	const generateCalldata = useCallback(async (proof: ProofData): Promise<bigint[]> => {
		setIsGeneratingProof(true);
		const backend = backend_ ? backend_ : new UltraHonkBackend(circuitData.bytecode);
		const vk = vk_ ? vk_ : await backend.getVerificationKey(honkBackendOpts);
		const calldata = getZKHonkCallData(proof.proof, flattenFieldsAsArray(proof.publicInputs), vk, HonkFlavor.Starknet);
		setIsGeneratingProof(false);
		return calldata;
	}, [vk_, backend_]);

	const generateProof = useCallback(async (params: WitnessData): Promise<ProofData> => {
		const noir = noir_ ? noir_ : new Noir(circuitData as CompiledCircuit);
		setIsGeneratingProof(true);

		try {
			console.log(`Generating Witness...`);
			const { witness } = await noir.execute(params as unknown as InputMap);

			const backend = backend_ ? backend_ : new UltraHonkBackend(circuitData.bytecode);

			console.log(`Generating Proof...`);
			const proof = await backend.generateProof(witness, honkBackendOpts);
			return proof;
		} catch (error) {
			console.error('Failed to generate proof:', error);
			throw error;
		} finally {
			setIsGeneratingProof(false);
		}
	}, [noir_, backend_]);

	return {
		generateProof,
		generateCalldata,
		isGeneratingProof,
	};
}

// helper functions
export function flattenFieldsAsArray(fields: string[]): Uint8Array {
	const flattenedPublicInputs = fields.map(hexToUint8Array);
	return flattenUint8Arrays(flattenedPublicInputs);
}

function flattenUint8Arrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((acc, val) => acc + val.length, 0);
	const result = new Uint8Array(totalLength);

	let offset = 0;
	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}

	return result;
}

function hexToUint8Array(hex: string): Uint8Array {
	const sanitisedHex = BigInt(hex).toString(16).padStart(64, '0');

	const len = sanitisedHex.length / 2;
	const u8 = new Uint8Array(len);

	let i = 0;
	let j = 0;
	while (i < len) {
		u8[i] = parseInt(sanitisedHex.slice(j, j + 2), 16);
		i += 1;
		j += 2;
	}

	return u8;
}

export const getRawProof = async (proof: ProofData): Promise<Uint8Array> => {
	return reconstructHonkProof(flattenFieldsAsArray(proof.publicInputs), proof.proof);
};
