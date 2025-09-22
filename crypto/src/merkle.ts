import { poseidonHashBN254 } from "garaga";

// write merkle root calculator
export function calculateMerkleRoot(leaves: bigint[]): bigint {
	let tree = [...leaves];
	while (tree.length > 1) {
		if (tree.length % 2 != 0) {
			tree.push(0n);
		}
		tree = get_next_level(tree);
	}

	return tree[0];
}

// // write merkle root calculator
// export function calculateMerkleRoot(leaves: bigint[]): bigint {
// 	let tree = [...leaves];
// 	const proof = calculateMerkleRootAndProof(tree, 0);

// 	return tree[proof.length - 1];
// }

// write merkle root calculator
export function calculateMerkleRootAndProof(leaves: bigint[], index: number): bigint[] {
	let tree = [...leaves];
	const proof: bigint[] = [];

	while (tree.length > 1) {
		if (tree.length % 2 != 0) {
			tree.push(0n);
		}

		if (index % 2 == 0) {
			proof.push(tree[index + 1]);
		} else {
			proof.push(tree[index - 1]);
		}

		index = Math.floor(index / 2);

		tree = get_next_level(tree);
	}

	proof.push(tree[0]);

	return proof;
}

export function get_next_level(tree: bigint[]): bigint[] {
	const newLevel: bigint[] = [];
	for (let i = 0; i < tree.length; i += 2) {
		let left = tree[i];
		let right = tree[i + 1];
		if (right < left) {
			left = tree[i + 1];
			right = tree[i];
		}
		const combined = left == 0n ? right : poseidonHashBN254(left, right);
		newLevel.push(combined);
	}
	return newLevel;
}