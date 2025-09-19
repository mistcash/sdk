import circuit from "./withdraw.json";

// Types generated from ABI
export interface Asset {
	amount: string; // field
	addr: string; // field
}

export interface WitnessData {
	claiming_key: string; // private field
	recipient: string; // public field
	asset: Asset; // public struct
	proof: string[]; // private array of 20 fields
	root: string; // public field
	new_tx_secret: string; // private field
	new_tx_amount: string; // private field
}

export const withdrawCircuit = circuit;